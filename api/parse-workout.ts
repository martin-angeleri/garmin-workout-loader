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
Convertí la descripción informal en español a un objeto JSON para Garmin Connect.

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
      "targetType": "no.target" | "heart.rate.zone" | "speed.zone",
      "targetValueOne": number | null,
      "targetValueTwo": number | null,
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
- "10 x 400m" → type:"repeat", numberOfIterations:10, repeatSteps:[{interval 400m}, {recovery}]
- Pasos simples: type:"step", numberOfIterations:null, repeatSteps:[]

UNIDADES:
- Distancias en METROS: 1km=1000, 2.5km=2500, 400m=400
- Tiempos en SEGUNDOS: 15min=900, 1:30=90, 50s=50

TARGETS:
- "suave", "fácil", sin intensidad → targetType:"no.target", targetValueOne:null, targetValueTwo:null
- "al 80%" → targetType:"heart.rate.zone", targetValueOne:148, targetValueTwo:152
- "al 85%" → targetType:"heart.rate.zone", targetValueOne:157, targetValueTwo:162

NOMBRE: descriptivo y conciso en español (ej: "10x400m Progresivos", "Fartlek 3x8min")
DESCRIPTION de cada paso: una frase corta en español`;

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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[parse-workout] GROQ_API_KEY no está definida');
    return res.status(500).json({
      error: 'GROQ_API_KEY no configurada en el servidor. Añadila en Vercel → Settings → Environment Variables.',
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
    console.log('[parse-workout] Llamando a Groq, texto:', text.length, 'chars');

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.trim() },
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
    console.log('[parse-workout] OK -', parsed.steps.length, 'steps, nombre:', parsed.name);
    return res.status(200).json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[parse-workout] Error:', message);

    if (message.includes('401') || message.includes('invalid_api_key') || message.includes('403')) {
      return res.status(500).json({ error: 'API key de Groq inválida. Verificá GROQ_API_KEY en Vercel.' });
    }
    if (message.includes('429') || message.toLowerCase().includes('rate') || message.toLowerCase().includes('quota')) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá unos segundos e intentá de nuevo.' });
    }
    return res.status(500).json({ error: 'Error del servidor: ' + message });
  }
}
