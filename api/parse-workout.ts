import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import type {
  ParsedWorkout,
  ParsedStep,
  ParsedRepeatGroup,
  StepTypeKey,
  EndConditionKey,
  TargetTypeKey,
} from '../src/types/workout';

// ─── Gemini response schema ───────────────────────────────────────────────────

const INNER_STEP_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    stepType:          { type: SchemaType.STRING, enum: ['warmup','cooldown','interval','recovery','rest','other'] },
    description:       { type: SchemaType.STRING },
    endCondition:      { type: SchemaType.STRING, enum: ['time','distance','lap.button'] },
    endConditionValue: { type: SchemaType.NUMBER, nullable: true },
    targetType:        { type: SchemaType.STRING, enum: ['no.target','heart.rate.zone','speed.zone'] },
    targetValueOne:    { type: SchemaType.NUMBER, nullable: true },
    targetValueTwo:    { type: SchemaType.NUMBER, nullable: true },
  },
  required: ['stepType','description','endCondition','endConditionValue','targetType','targetValueOne','targetValueTwo'],
};

const WORKOUT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    steps: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type:               { type: SchemaType.STRING, enum: ['step','repeat'] },
          stepType:           { type: SchemaType.STRING, enum: ['warmup','cooldown','interval','recovery','rest','other'] },
          description:        { type: SchemaType.STRING },
          endCondition:       { type: SchemaType.STRING, enum: ['time','distance','lap.button'] },
          endConditionValue:  { type: SchemaType.NUMBER, nullable: true },
          targetType:         { type: SchemaType.STRING, enum: ['no.target','heart.rate.zone','speed.zone'] },
          targetValueOne:     { type: SchemaType.NUMBER, nullable: true },
          targetValueTwo:     { type: SchemaType.NUMBER, nullable: true },
          numberOfIterations: { type: SchemaType.INTEGER, nullable: true },
          repeatSteps:        { type: SchemaType.ARRAY, items: INNER_STEP_SCHEMA },
        },
        required: [
          'type','stepType','description','endCondition','endConditionValue',
          'targetType','targetValueOne','targetValueTwo','numberOfIterations','repeatSteps',
        ],
      },
    },
  },
  required: ['name','steps'],
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un experto en planificación de entrenamientos de carrera a pie.
Convertí la descripción informal en español a un JSON para Garmin Connect, siguiendo estas reglas:

TIPOS DE PASO (stepType):
- E/calor, calentamiento → warmup
- Reg, enfriamiento, vuelta a la calma → cooldown
- Intervalos, tiradas de esfuerzo → interval
- Pausa, recuperación entre series → recovery (dentro de repeatSteps)

GRUPOS DE SERIES (type=repeat):
- "10 x 400m" → type=repeat, numberOfIterations=10, repeatSteps=[paso interval + paso recovery]
- Para pasos simples: type=step, numberOfIterations=null, repeatSteps=[]

UNIDADES:
- Distancias en METROS: 1km=1000, 2,5km=2500, 400m=400
- Tiempos en SEGUNDOS: 15min=900, 1:30=90, 1,30=90, 50s=50

TARGETS:
- "suaves", "fácil", sin intensidad → targetType=no.target, targetValueOne=null, targetValueTwo=null
- "al 80%" → targetType=heart.rate.zone, targetValueOne=148, targetValueTwo=152
- "al 85%" → targetType=heart.rate.zone, targetValueOne=157, targetValueTwo=162

NOMBRE: descriptivo, conciso, en español (ej: "10x400m Progresivos", "Fartlek 3x8min")
DESCRIPTION de cada paso: una frase corta en español`;

// ─── Convert flat Gemini output → internal ParsedWorkout ─────────────────────

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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[parse-workout] GEMINI_API_KEY no está definida');
    return res.status(500).json({
      error: 'GEMINI_API_KEY no configurada en el servidor. Añadila en Vercel → Settings → Environment Variables.',
    });
  }

  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'El campo "text" es requerido.' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 4000 caracteres).' });
  }

  try {
    console.log('[parse-workout] Llamando a Gemini, texto:', text.length, 'chars');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: WORKOUT_SCHEMA as Schema,
      },
    });

    const result = await model.generateContent(
      SYSTEM_PROMPT + '\n\nEntrenamiento a convertir:\n' + text.trim()
    );
    const content = result.response.text();

    if (!content) {
      return res.status(500).json({ error: 'La IA no devolvió respuesta.' });
    }

    const raw = JSON.parse(content) as { name: string; steps: FlatStep[] };
    const parsed = flatToInternal(raw);
    console.log('[parse-workout] OK -', parsed.steps.length, 'steps, nombre:', parsed.name);
    return res.status(200).json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Log completo para diagnóstico en Vercel → Functions → Logs
    console.error('[parse-workout] Error completo:', JSON.stringify(err, null, 2));
    console.error('[parse-workout] Mensaje:', message);

    if (message.includes('API_KEY_INVALID') || message.includes('401') || message.includes('403')) {
      return res.status(500).json({ error: 'API key de Gemini inválida. Verificá GEMINI_API_KEY en Vercel.' });
    }
    if (message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate')) {
      // Distinguir límite por minuto vs diario
      const isPerMinute = message.toLowerCase().includes('per_minute') || message.toLowerCase().includes('rate_limit_exceeded');
      if (isPerMinute) {
        return res.status(429).json({ error: 'Demasiadas solicitudes por minuto (límite: 15/min). Esperá 30 segundos e intentá de nuevo.' });
      }
      return res.status(429).json({ error: 'Cuota de Gemini agotada. Podés crear una nueva API key gratis en aistudio.google.com.' });
    }
    return res.status(500).json({ error: 'Error del servidor: ' + message });
  }
}
