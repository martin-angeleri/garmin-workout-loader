import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import type { ParsedWorkout, ParsedStep, ParsedRepeatGroup, StepTypeKey, EndConditionKey, TargetTypeKey } from '../src/types/workout';

// ─── OpenAI client (API key from env, never exposed to client) ─────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Flat schema compatible with OpenAI strict mode (no oneOf at item level) ──
// Each step has ALL fields; type='repeat' uses numberOfIterations + repeatSteps,
// type='step' uses the individual step fields. anyOf IS supported in strict mode.
const NULLABLE_NUMBER = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const NULLABLE_INTEGER = { anyOf: [{ type: 'integer' }, { type: 'null' }] };

const INNER_STEP_PROPS = {
  stepType: { type: 'string', enum: ['warmup', 'cooldown', 'interval', 'recovery', 'rest', 'other'] },
  description: { type: 'string' },
  endCondition: { type: 'string', enum: ['time', 'distance', 'lap.button'] },
  endConditionValue: NULLABLE_NUMBER,
  targetType: { type: 'string', enum: ['no.target', 'heart.rate.zone', 'speed.zone'] },
  targetValueOne: NULLABLE_NUMBER,
  targetValueTwo: NULLABLE_NUMBER,
};

const INNER_STEP_REQUIRED = [
  'stepType', 'description', 'endCondition', 'endConditionValue',
  'targetType', 'targetValueOne', 'targetValueTwo',
];

const WORKOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'steps'],
  properties: {
    name: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // ALL fields required so strict mode is satisfied; unused ones set to null / []
        required: [
          'type', 'stepType', 'description',
          'endCondition', 'endConditionValue',
          'targetType', 'targetValueOne', 'targetValueTwo',
          'numberOfIterations', 'repeatSteps',
        ],
        properties: {
          type: { type: 'string', enum: ['step', 'repeat'] },
          ...INNER_STEP_PROPS,
          numberOfIterations: NULLABLE_INTEGER,
          repeatSteps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: INNER_STEP_REQUIRED,
              properties: INNER_STEP_PROPS,
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Sos un experto en planificación de entrenamientos de carrera. Tu tarea es convertir la descripción de un entrenamiento escrito en español informal a un JSON estructurado compatible con el formato de workout de Garmin Connect.

IMPORTANTE: El JSON tiene una estructura plana. Cada elemento de "steps" puede ser:
- type="step": un paso individual (numberOfIterations=null, repeatSteps=[])
- type="repeat": un grupo de repeticiones (numberOfIterations=N, repeatSteps=[array de pasos])

Reglas de conversión:
- "E/calor", "entrada en calor", "calentamiento": stepType = "warmup"
- "Reg", "vuelta a la calma", "enfriamiento": stepType = "cooldown"
- Intervalos de esfuerzo, runs progresivos, tiradas: stepType = "interval"
- Pausa, recuperación entre series: stepType = "recovery" (dentro de repeatSteps)
- "suaves", "fácil", "footing": targetType = "no.target"
- Si hay "al 80%", "al 85%": targetType = "heart.rate.zone", max FC ~185: 80%=148-152bpm, 85%=157-162bpm
- Si hay series repetidas (ej: "10 x 400m"): type="repeat" con numberOfIterations=10 y repeatSteps=[intervalo, recovery]
- Distancias: siempre en METROS (1km=1000, 2.5km=2500, "2,5km"=2500)
- Tiempos: siempre en SEGUNDOS (15min=900, 1:30=90, 1,30=90, 50s=50)
- Nombre descriptivo y conciso (ej: "10x400m Progresivos", "Fartlek 3x8min")
- description de cada paso: español, corto y claro
- Para pasos simples (type="step"): numberOfIterations=null, repeatSteps=[]`;

// ─── Convert flat OpenAI output → internal ParsedWorkout format ───────────────
interface FlatStep {
  type: 'step' | 'repeat';
  stepType: StepTypeKey;
  description: string;
  endCondition: EndConditionKey;
  endConditionValue: number | null;
  targetType: TargetTypeKey;
  targetValueOne: number | null;
  targetValueTwo: number | null;
  numberOfIterations: number | null;
  repeatSteps: Omit<FlatStep, 'numberOfIterations' | 'repeatSteps' | 'type'>[];
}

function flatToInternal(flat: { name: string; steps: FlatStep[] }): ParsedWorkout {
  return {
    name: flat.name,
    steps: flat.steps.map((s): ParsedStep | ParsedRepeatGroup => {
      if (s.type === 'repeat') {
        return {
          type: 'repeat',
          numberOfIterations: s.numberOfIterations ?? 1,
          steps: s.repeatSteps.map(rs => ({
            type: 'step' as const,
            stepType: rs.stepType,
            description: rs.description,
            endCondition: rs.endCondition,
            endConditionValue: rs.endConditionValue,
            targetType: rs.targetType,
            targetValueOne: rs.targetValueOne,
            targetValueTwo: rs.targetValueTwo,
          })),
        } satisfies ParsedRepeatGroup;
      }
      return {
        type: 'step',
        stepType: s.stepType,
        description: s.description,
        endCondition: s.endCondition,
        endConditionValue: s.endConditionValue,
        targetType: s.targetType,
        targetValueOne: s.targetValueOne,
        targetValueTwo: s.targetValueTwo,
      } satisfies ParsedStep;
    }),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'El campo "text" es requerido.' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 4000 caracteres).' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor. Revisá la configuración de Vercel.' });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.trim() },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'parsed_workout',
          strict: true,
          schema: WORKOUT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      max_tokens: 2000,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'La IA no devolvió respuesta.' });
    }

    const raw = JSON.parse(content) as { name: string; steps: FlatStep[] };
    const parsed = flatToInternal(raw);
    return res.status(200).json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[parse-workout] Error:', message);
    // Surface a more specific message when possible
    if (message.includes('API key') || message.includes('Incorrect API key') || message.includes('401')) {
      return res.status(500).json({ error: 'API key de OpenAI inválida. Verificá la variable OPENAI_API_KEY en Vercel.' });
    }
    return res.status(500).json({ error: 'No se pudo interpretar el entrenamiento. Revisá el texto e intentá de nuevo.' });
  }
}
