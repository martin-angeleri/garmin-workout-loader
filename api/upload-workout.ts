import type { VercelRequest, VercelResponse } from '@vercel/node';
// eslint-disable-next-line @typescript-eslint/no-require-imports
let garminConnectModule: { GarminConnect: new (opts: { username: string; password: string }) => {
  login(email: string, password: string): Promise<void>;
  addWorkout(workout: unknown): Promise<unknown>;
} };
try {
  garminConnectModule = require('garmin-connect');
  console.log('[upload-workout] garmin-connect cargado OK');
} catch (e) {
  console.error('[upload-workout] FALLO al cargar garmin-connect:', e);
  garminConnectModule = { GarminConnect: null as unknown as never };
}
const { GarminConnect } = garminConnectModule as { GarminConnect: new (opts: { username: string; password: string }) => {
  login(email: string, password: string): Promise<void>;
  addWorkout(workout: unknown): Promise<unknown>;
} };

import type {
  ParsedWorkout,
  ParsedStep,
  ParsedRepeatGroup,
  GarminWorkout,
  GarminExecutableStep,
  GarminRepeatGroup,
  GarminWorkoutStep,
} from '../src/types/workout';

import {
  STEP_TYPE_IDS,
  END_CONDITION_IDS,
  TARGET_TYPE_IDS,
} from '../src/types/workout';

// ─── Conversión ParsedWorkout → GarminWorkout ──────────────────────────────────

let stepOrderCounter = 0;

function buildExecutableStep(step: ParsedStep): GarminExecutableStep {
  stepOrderCounter++;
  const unitKey = step.endCondition === 'distance' ? 'meter' : 'second';

  return {
    type: 'ExecutableStepDTO',
    stepId: null,
    stepOrder: stepOrderCounter,
    childStepId: null,
    description: step.description,
    stepType: {
      stepTypeId: STEP_TYPE_IDS[step.stepType],
      stepTypeKey: step.stepType,
    },
    endCondition: {
      conditionTypeId: END_CONDITION_IDS[step.endCondition],
      conditionTypeKey: step.endCondition,
    },
    preferredEndConditionUnit: { unitKey },
    endConditionValue: step.endConditionValue,
    endConditionCompare: null,
    endConditionZone: null,
    targetType: {
      workoutTargetTypeId: TARGET_TYPE_IDS[step.targetType],
      workoutTargetTypeKey: step.targetType,
    },
    targetValueOne: step.targetValueOne,
    targetValueTwo: step.targetValueTwo,
    zoneNumber: null,
  };
}

function buildRepeatGroup(group: ParsedRepeatGroup, childStepId: number): GarminRepeatGroup {
  stepOrderCounter++;
  const groupStepOrder = stepOrderCounter;
  const innerSteps = group.steps.map(s => buildExecutableStep(s));

  return {
    type: 'RepeatGroupDTO',
    stepId: null,
    stepOrder: groupStepOrder,
    childStepId,
    numberOfIterations: group.numberOfIterations,
    smartRepeat: false,
    workoutSteps: innerSteps,
  };
}

function parsedToGarmin(parsed: ParsedWorkout): GarminWorkout {
  stepOrderCounter = 0;
  let childCounter = 1;

  const steps: GarminWorkoutStep[] = [];

  for (const s of parsed.steps) {
    if (s.type === 'step') {
      steps.push(buildExecutableStep(s));
    } else if (s.type === 'repeat') {
      steps.push(buildRepeatGroup(s as ParsedRepeatGroup, childCounter));
      childCounter++;
    }
  }

  return {
    workoutId: null,
    workoutName: parsed.name,
    description: `Creado con Garmin Workout Loader – © Martín Angeleri`,
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 1, sportTypeKey: 'running' },
        workoutSteps: steps,
      },
    ],
  };
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workout, email, password } = req.body ?? {};

  // Validate inputs
  if (!workout || typeof workout !== 'object') {
    return res.status(400).json({ error: 'El campo "workout" es requerido.' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido.' });
  }
  if (!password || typeof password !== 'string' || password.length < 1) {
    return res.status(400).json({ error: 'Contraseña requerida.' });
  }

  if (!GarminConnect) {
    return res.status(500).json({ error: 'El módulo garmin-connect no pudo cargarse en el servidor. Revisá los logs de Vercel.' });
  }
  type GarminClient = { login(email: string, password: string): Promise<void>; addWorkout(workout: unknown): Promise<unknown> };
  let gc: GarminClient;
  try {
    gc = new GarminConnect({ username: email, password });
  } catch {
    return res.status(500).json({ error: 'No se pudo inicializar el cliente de Garmin Connect.' });
  }

  try {
    await gc.login(email, password);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    console.error('[upload-workout] Login error:', msg);
    // Distinguish auth errors from network errors
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('401')) {
      return res.status(401).json({ error: 'Credenciales de Garmin incorrectas. Verificá email y contraseña.' });
    }
    return res.status(502).json({ error: 'No se pudo conectar a Garmin Connect. Intentá de nuevo.' });
  }

  try {
    const garminWorkout = parsedToGarmin(workout as ParsedWorkout);
    const result = await gc.addWorkout(garminWorkout);

    const workoutId: number =
      (result as Record<string, unknown>)?.workoutId as number
      ?? (result as Record<string, unknown>)?.id as number
      ?? 0;

    return res.status(200).json({
      workoutId,
      workoutName: garminWorkout.workoutName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[upload-workout] Upload error:', msg);
    return res.status(500).json({ error: 'Error al subir el workout a Garmin Connect. ' + msg });
  }
}
