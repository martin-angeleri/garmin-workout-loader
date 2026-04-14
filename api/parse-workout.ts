import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// ─── OpenAI client (API key from env, never exposed to client) ─────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── JSON Schema for structured output ────────────────────────────────────────
const WORKOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'steps'],
  properties: {
    name: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        oneOf: [
          {
            // Single executable step
            type: 'object',
            additionalProperties: false,
            required: [
              'type', 'stepType', 'description',
              'endCondition', 'endConditionValue',
              'targetType', 'targetValueOne', 'targetValueTwo'
            ],
            properties: {
              type: { type: 'string', const: 'step' },
              stepType: {
                type: 'string',
                enum: ['warmup', 'cooldown', 'interval', 'recovery', 'rest', 'other']
              },
              description: { type: 'string' },
              endCondition: { type: 'string', enum: ['time', 'distance', 'lap.button'] },
              endConditionValue: {
                oneOf: [{ type: 'number' }, { type: 'null' }]
              },
              targetType: {
                type: 'string',
                enum: ['no.target', 'heart.rate.zone', 'speed.zone']
              },
              targetValueOne: {
                oneOf: [{ type: 'number' }, { type: 'null' }]
              },
              targetValueTwo: {
                oneOf: [{ type: 'number' }, { type: 'null' }]
              },
            },
          },
          {
            // Repeat group
            type: 'object',
            additionalProperties: false,
            required: ['type', 'numberOfIterations', 'steps'],
            properties: {
              type: { type: 'string', const: 'repeat' },
              numberOfIterations: { type: 'number' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'type', 'stepType', 'description',
                    'endCondition', 'endConditionValue',
                    'targetType', 'targetValueOne', 'targetValueTwo'
                  ],
                  properties: {
                    type: { type: 'string', const: 'step' },
                    stepType: {
                      type: 'string',
                      enum: ['warmup', 'cooldown', 'interval', 'recovery', 'rest', 'other']
                    },
                    description: { type: 'string' },
                    endCondition: { type: 'string', enum: ['time', 'distance', 'lap.button'] },
                    endConditionValue: {
                      oneOf: [{ type: 'number' }, { type: 'null' }]
                    },
                    targetType: {
                      type: 'string',
                      enum: ['no.target', 'heart.rate.zone', 'speed.zone']
                    },
                    targetValueOne: {
                      oneOf: [{ type: 'number' }, { type: 'null' }]
                    },
                    targetValueTwo: {
                      oneOf: [{ type: 'number' }, { type: 'null' }]
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Sos un experto en planificación de entrenamientos de carrera. Tu tarea es convertir la descripción de un entrenamiento escrito en español informal a un JSON estructurado compatible con el formato de workout de Garmin Connect.

Reglas de conversión:
- "E/calor", "entrada en calor", "calentamiento": stepType = "warmup"
- "Reg", "vuelta a la calma", "enfriamiento": stepType = "cooldown"
- Intervalos de esfuerzo, runs progresivos, tiradas: stepType = "interval"
- Pausa, recuperación entre series: stepType = "recovery" (dentro del repeat group)
- "suaves", "fácil", "footing": targetType = "no.target" (a menos que haya % FC o ritmo específico)
- Si hay "al 80%", "al 85%": targetType = "heart.rate.zone", estimar bpm con max FC ~185: 80% = 148-152 bpm, 85% = 157-162 bpm
- Si hay series repetidas (ej: "10 x 400m"): usar type = "repeat" con numberOfIterations y steps de intervalo + recovery
- Distancias: siempre en METROS (1km=1000m, 2.5km=2500m)
- Tiempos: siempre en SEGUNDOS (15min=900, 1:30=90, 50s=50)
- Si dice "2,5km" (con coma), interpretarlo como 2.5 km = 2500m
- Generar un nombre descriptivo y conciso para el workout (ej: "10x400m Progresivos", "Fartlek 3x8min")
- EL description de cada paso debe ser en español, corto y claro`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security: only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate body
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'El campo "text" es requerido.' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 4000 caracteres).' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor.' });
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

    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[parse-workout] Error:', message);
    return res.status(500).json({ error: 'No se pudo interpretar el entrenamiento. Revisá el texto e intentá de nuevo.' });
  }
}
