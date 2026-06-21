import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Types (inlined to avoid cross-bundle import issues in Vercel) ────────────

type StepTypeKey = 'warmup' | 'cooldown' | 'interval' | 'recovery' | 'rest' | 'other';
type EndConditionKey = 'lap.button' | 'time' | 'distance';
type TargetTypeKey = 'no.target' | 'heart.rate.zone' | 'speed.zone';

const STEP_TYPE_IDS: Record<StepTypeKey, number> = {
  warmup: 1, cooldown: 2, interval: 3, recovery: 4, rest: 5, other: 7,
};
const END_CONDITION_IDS: Record<EndConditionKey, number> = {
  'lap.button': 1, time: 2, distance: 3,
};
const TARGET_TYPE_IDS: Record<TargetTypeKey, number> = {
  'no.target': 1, 'heart.rate.zone': 4, 'speed.zone': 6,
};

interface ParsedStep {
  type: 'step';
  stepType: StepTypeKey;
  description: string;
  endCondition: EndConditionKey;
  endConditionValue: number | null;
  targetType: TargetTypeKey;
  targetValueOne: number | null;
  targetValueTwo: number | null;
}
interface ParsedRepeatGroup {
  type: 'repeat';
  numberOfIterations: number;
  steps: ParsedStep[];
}
interface ParsedWorkout {
  name: string;
  steps: (ParsedStep | ParsedRepeatGroup)[];
}
interface GarminExecutableStep {
  type: 'ExecutableStepDTO';
  stepId: null;
  stepOrder: number;
  childStepId: null;
  description: string;
  stepType: { stepTypeId: number; stepTypeKey: StepTypeKey };
  endCondition: { conditionTypeId: number; conditionTypeKey: EndConditionKey };
  preferredEndConditionUnit: { unitId: number; unitKey: string; factor: number } | null;
  endConditionValue: number | null;
  endConditionCompare: null;
  endConditionZone: null;
  targetType: { workoutTargetTypeId: number; workoutTargetTypeKey: TargetTypeKey };
  targetValueOne: number | null;
  targetValueTwo: number | null;
  zoneNumber: null;
}
interface GarminRepeatGroup {
  type: 'RepeatGroupDTO';
  stepId: null;
  stepOrder: number;
  childStepId: number;
  numberOfIterations: number;
  smartRepeat: false;
  workoutSteps: GarminExecutableStep[];
}
type GarminWorkoutStep = GarminExecutableStep | GarminRepeatGroup;
interface GarminWorkout {
  workoutId: null;
  workoutName: string;
  description: string;
  sportType: { sportTypeId: 1; sportTypeKey: 'running' };
  estimatedDurationInSecs: number | null;
  estimatedDistanceInMeters: number | null;
  workoutSegments: [{
    segmentOrder: 1;
    sportType: { sportTypeId: 1; sportTypeKey: 'running' };
    workoutSteps: GarminWorkoutStep[];
    estimatedDurationInSecs: number | null;
    estimatedDistanceInMeters: number | null;
  }];
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

const GC_API = 'https://connectapi.garmin.com';
let stepOrderCounter = 0;

function buildExecutableStep(step: ParsedStep): GarminExecutableStep {
  stepOrderCounter++;
  const preferredEndConditionUnit = step.endCondition === 'distance'
    ? { unitId: 1, unitKey: 'meter', factor: 100 }
    : null;
  return {
    type: 'ExecutableStepDTO',
    stepId: null,
    stepOrder: stepOrderCounter,
    childStepId: null,
    description: step.description,
    stepType: { stepTypeId: STEP_TYPE_IDS[step.stepType], stepTypeKey: step.stepType },
    endCondition: { conditionTypeId: END_CONDITION_IDS[step.endCondition], conditionTypeKey: step.endCondition },
    preferredEndConditionUnit,
    endConditionValue: step.endCondition === 'distance' && step.endConditionValue
      ? step.endConditionValue * 100
      : step.endConditionValue,
    endConditionCompare: null,
    endConditionZone: null,
    targetType: { workoutTargetTypeId: TARGET_TYPE_IDS[step.targetType], workoutTargetTypeKey: step.targetType },
    targetValueOne: step.targetValueOne,
    targetValueTwo: step.targetValueTwo,
    zoneNumber: null,
  };
}

function buildRepeatGroup(group: ParsedRepeatGroup, childStepId: number): GarminRepeatGroup {
  stepOrderCounter++;
  return {
    type: 'RepeatGroupDTO',
    stepId: null,
    stepOrder: stepOrderCounter,
    childStepId,
    numberOfIterations: group.numberOfIterations,
    smartRepeat: false,
    workoutSteps: group.steps.map(s => buildExecutableStep(s)),
  };
}

const SEC_PER_METER: Record<string, number> = {
  warmup:   7 * 60 / 1000,   // 7:00/km
  cooldown: 7 * 60 / 1000,   // 7:00/km
  interval: 5 * 60 / 1000,   // 5:00/km
  recovery: 7 * 60 / 1000,   // 7:00/km
  rest:     8 * 60 / 1000,   // 8:00/km
  other:    6 * 60 / 1000,   // 6:00/km
};

function estimateStep(step: ParsedStep): { seconds: number; meters: number } {
  if (step.endCondition === 'time' && step.endConditionValue) {
    const pace = SEC_PER_METER[step.stepType] ?? (6 * 60 / 1000);
    const meters = step.endConditionValue / pace;
    return { seconds: step.endConditionValue, meters };
  }
  if (step.endCondition === 'distance' && step.endConditionValue) {
    const pace = SEC_PER_METER[step.stepType] ?? (6 * 60 / 1000);
    return { seconds: Math.round(step.endConditionValue * pace), meters: step.endConditionValue };
  }
  return { seconds: 0, meters: 0 };
}

function calcWorkoutStats(steps: (ParsedStep | ParsedRepeatGroup)[]): { seconds: number; meters: number } {
  let seconds = 0;
  let meters = 0;
  for (const s of steps) {
    if (s.type === 'repeat') {
      for (const inner of s.steps) {
        const e = estimateStep(inner);
        seconds += e.seconds * s.numberOfIterations;
        meters  += e.meters  * s.numberOfIterations;
      }
    } else {
      const e = estimateStep(s as ParsedStep);
      seconds += e.seconds;
      meters  += e.meters;
    }
  }
  return { seconds, meters };
}

function parsedToGarmin(parsed: ParsedWorkout): GarminWorkout {
  stepOrderCounter = 0;
  let childCounter = 1;
  const steps: GarminWorkoutStep[] = [];
  for (const s of parsed.steps) {
    if (s.type === 'step') steps.push(buildExecutableStep(s as ParsedStep));
    else steps.push(buildRepeatGroup(s as ParsedRepeatGroup, childCounter++));
  }
  const stats = calcWorkoutStats(parsed.steps);
  return {
    workoutId: null,
    workoutName: parsed.name,
    description: 'Creado con Garmin Workout Loader \u2013 \u00a9 Mart\u00edn Angeleri',
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    estimatedDurationInSecs: stats.seconds > 0 ? stats.seconds : null,
    estimatedDistanceInMeters: stats.meters > 0 ? Math.round(stats.meters) : null,
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: steps,
      estimatedDurationInSecs: stats.seconds > 0 ? stats.seconds : null,
      estimatedDistanceInMeters: stats.meters > 0 ? Math.round(stats.meters) : null,
    }],
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workout, accessToken } = req.body ?? {};

  if (!workout || typeof workout !== 'object') {
    return res.status(400).json({ error: 'El campo "workout" es requerido.' });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Token de Garmin requerido. Reconectá tu cuenta.' });
  }

  try {
    const garminWorkout = parsedToGarmin(workout as ParsedWorkout);
    console.log('[upload-workout] Subiendo workout:', garminWorkout.workoutName);

    const uploadRes = await fetch(`${GC_API}/workout-service/workout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'NK': 'NT',
        'di-backend': 'connectapi.garmin.com',
      },
      body: JSON.stringify(garminWorkout),
    });

    const uploadText = await uploadRes.text();
    console.log('[upload-workout] Garmin response', uploadRes.status, uploadText.slice(0, 300));

    if (uploadRes.status === 401) {
      return res.status(401).json({
        error: 'Token de Garmin expirado o inválido. Reconectá tu cuenta desde la configuración.',
      });
    }
    if (!uploadRes.ok) {
      return res.status(502).json({
        error: `Error de Garmin (${uploadRes.status}): ${uploadText.slice(0, 200)}`,
      });
    }

    let uploadData: Record<string, unknown>;
    try {
      uploadData = JSON.parse(uploadText);
    } catch {
      return res.status(502).json({ error: 'Respuesta inválida de Garmin.' });
    }

    const workoutId = (uploadData.workoutId ?? 0) as number;
    return res.status(200).json({ workoutId, workoutName: garminWorkout.workoutName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-workout] Error:', msg);
    return res.status(500).json({ error: 'Error al subir el workout: ' + msg });
  }
}
