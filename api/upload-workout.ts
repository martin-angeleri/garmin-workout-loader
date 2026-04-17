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
  preferredEndConditionUnit: { unitKey: 'second' | 'meter' };
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
  workoutSegments: [{
    segmentOrder: 1;
    sportType: { sportTypeId: 1; sportTypeKey: 'running' };
    workoutSteps: GarminWorkoutStep[];
  }];
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

const GC_API = 'https://connectapi.garmin.com';
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
    stepType: { stepTypeId: STEP_TYPE_IDS[step.stepType], stepTypeKey: step.stepType },
    endCondition: { conditionTypeId: END_CONDITION_IDS[step.endCondition], conditionTypeKey: step.endCondition },
    preferredEndConditionUnit: { unitKey },
    endConditionValue: step.endConditionValue,
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

function parsedToGarmin(parsed: ParsedWorkout): GarminWorkout {
  stepOrderCounter = 0;
  let childCounter = 1;
  const steps: GarminWorkoutStep[] = [];
  for (const s of parsed.steps) {
    if (s.type === 'step') steps.push(buildExecutableStep(s as ParsedStep));
    else steps.push(buildRepeatGroup(s as ParsedRepeatGroup, childCounter++));
  }
  return {
    workoutId: null,
    workoutName: parsed.name,
    description: 'Creado con Garmin Workout Loader \u2013 \u00a9 Mart\u00edn Angeleri',
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: steps,
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
    return res.status(400).json({ error: 'Token de Garmin requerido. Reconect\u00e1 tu cuenta.' });
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
        error: 'Token de Garmin expirado o inv\u00e1lido. Reconect\u00e1 tu cuenta desde la configuraci\u00f3n.',
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
      return res.status(502).json({ error: 'Respuesta inv\u00e1lida de Garmin.' });
    }

    const workoutId = (uploadData.workoutId ?? 0) as number;
    return res.status(200).json({ workoutId, workoutName: garminWorkout.workoutName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-workout] Error:', msg);
    return res.status(500).json({ error: 'Error al subir el workout: ' + msg });
  }
}
