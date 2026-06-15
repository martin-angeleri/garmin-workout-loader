import type { VercelRequest, VercelResponse } from '@vercel/node';
import Groq from 'groq-sdk';
import type {
  ParsedWorkout,
  ParsedStep,
  ParsedRepeatGroup,
  StepTypeKey,
  EndConditionKey,
  TargetTypeKey,
} from '../src/types/workout';

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un experto en planificación de entrenamientos de carrera a pie.
Recibirás un entrenamiento ya interpretado en formato JSON y una instrucción de corrección del usuario.
Aplicá la corrección y devolvé el entrenamiento modificado en el mismo formato JSON.

REGLAS ESTRICTAS:
- Respondé SOLO con JSON válido, sin texto extra ni markdown.
- El JSON debe tener exactamente esta forma:
{
  "name": "string",
  "steps": [
    {
      "type": "step" | "repeat",
      "stepType": "warmup" | "cooldown" | "interval" | "recovery" | "rest" | "other",
      "description": "string",
      "endCondition": "time" | "distance" | "lap.button",
      "endConditionValue": number | null,
      "targetType": "no.target",
      "targetValueOne": null,
      "targetValueTwo": null,
      "numberOfIterations": number | null,
      "repeatSteps": [ ...mismos campos sin numberOfIterations ni repeatSteps... ]
    }
  ]
}

TIPOS DE PASO (stepType):
- calentamiento, entrada en calor → warmup
- vuelta a la calma, enfriamiento → cooldown
- intervalos, series, esfuerzo → interval
- pausa, recuperación entre series → recovery
- descanso → rest

GRUPOS DE SERIES (type="repeat"):
- Representan un bloque de pasos que se repiten N veces
- "numberOfIterations" es la cantidad de repeticiones del bloque completo
- "repeatSteps" son los pasos dentro del bloque

UNIDADES:
- Distancias en METROS: 1km=1000, 2.5km=2500, 400m=400
- Tiempos en SEGUNDOS: 15min=900, 1:30=90, 50s=50

TARGETS: Siempre usar targetType:"no.target", targetValueOne:null, targetValueTwo:null

INSTRUCCIONES DE CORRECCIÓN — ejemplos de cómo interpretarlas:
- "el paso X va dentro del bloque Y" → mover el paso X dentro del repeatSteps del bloque Y
- "son N repeticiones, no M" → cambiar numberOfIterations del bloque correspondiente
- "agregar una repetición al bloque X" → sumar 1 al numberOfIterations
- "el paso X debería ser de N metros / N minutos" → cambiar endConditionValue del paso

NOMBRE: si la corrección lo cambia significativamente, actualizá el nombre. Si no, mantenelo.`;

// ─── Types ────────────────────────────────────────────────────────────────────

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
            targetType: 'no.target' as const,
            targetValueOne: null,
            targetValueTwo: null,
          })),
        } satisfies ParsedRepeatGroup;
      }
      return {
        type: 'step',
        stepType: s.stepType,
        description: s.description,
        endCondition: s.endCondition,
        endConditionValue: s.endConditionValue,
        targetType: 'no.target' as const,
        targetValueOne: null,
        targetValueTwo: null,
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY no configurada en el servidor.',
    });
  }

  const { originalText, currentWorkout, correction } = req.body ?? {};

  if (!correction || typeof correction !== 'string' || correction.trim().length === 0) {
    return res.status(400).json({ error: 'El campo "correction" es requerido.' });
  }
  if (!currentWorkout) {
    return res.status(400).json({ error: 'El campo "currentWorkout" es requerido.' });
  }

  try {
    console.log('[correct-workout] Aplicando corrección:', correction.slice(0, 100));

    const userMessage = `Entrenamiento actual (JSON):
${JSON.stringify(currentWorkout, null, 2)}

${originalText ? `Texto original del entrenamiento:\n${originalText}\n\n` : ''}Instrucción de corrección:
${correction.trim()}`;

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'La IA no devolvió respuesta.' });
    }

    const raw = JSON.parse(content) as { name: string; steps: FlatStep[] };
    const parsed = flatToInternal(raw);
    console.log('[correct-workout] OK -', parsed.steps.length, 'steps, nombre:', parsed.name);
    return res.status(200).json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[correct-workout] Error:', message);

    if (message.includes('429') || message.toLowerCase().includes('rate')) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá unos segundos e intentá de nuevo.' });
    }
    return res.status(500).json({ error: 'Error del servidor: ' + message });
  }
}
