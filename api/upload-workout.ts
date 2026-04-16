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
  stepId: null; stepOrder: number; childStepId: null;
  description: string;
  stepType: { stepTypeId: number; stepTypeKey: StepTypeKey };
  endCondition: { conditionTypeId: number; conditionTypeKey: EndConditionKey };
                                                                      di ionValue: number | null;
  endConditionCompare: null; endConditionZone: null;
  targetType: { workoutTargetTypeId: number; workoutTargetTypeKey: TargetTypeKey };
  targetValueOne: number | null; targetValueTwo: number | null; zoneNumber: null;
}
interface GarminRepeatGroup {
  type: 'RepeatGroupDTO';
  stepId: null; stepOrder: number; childStepId: number;
  numberOfIterations: number; smartRepeat: false;
  workoutSteps: GarminExecutableStep[];
}
type GarminWorkoutStep = Gartype GartableStep | GarminRepetype GarminWorkoce GarminWorkout {
  workoutId: null; workoutName: string  workoutId: null; worko sportType: { sportTypeId: 1; sportTypeKey: 'running' };
  workoutSegments: [{ segmentOrder: 1; sportType: { sportTypeId: 1; sportTypeKey: 'running' }; workoutSteps: GarminWorkoutStep[] }];
}

// ─── Conversión ParsedWorkout → GarminWorkout ─────�// ─── Conversión ParsedWorkout → GarminWorkout ─────�// └�─

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
    stepType: { stepTypeId: STEP_    stepType: { stepTypeId: STEP_    stepType: {yp    stepType: { stepTypeId: STEP_   peId: END_CONDITION_IDS[step.endCondition], conditionTypeKey: step.endCondition },
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
  const group  const group  const group  const group  const group  const group  cost  const group  constOr  const group  const group  const group  const group  const group  consfI  constns,
    smartRepeat: false,
    workoutSteps: group.steps.map(s => buildExecutableStep(s)),
  };
}

function function functioarsed: ParsedWorkout): GarminWorkout {
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
    description: 'Creado con Garmin Workout Loader – © Martín Angeleri',
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: steps,
    }],
  };
}

// ─── Handler ──────�// ─── Handler ──────�// ─── Handler ──────�// ─── Handler ──────�// ─── Handler ──────�// ─── Handler ──�default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { workout, accessToken } = req.body ?? {};
  if (!workout || typeof workout !== 'object') return res.status(400).json({ error: 'El campo "workout" es requerido.' });
  if (!accessToken || typeof accessToken !== 'string') return res.status(400).json({ error: 'Token de Garmin requerido. Reconectá tu cuenta.' });

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
      return res.status(401).json({ error: 'Token de Garmin expirado o inválido. Reconectá tu cuenta desde la configuración.' });
    }
    if (!uploadRes.ok) {
      return res.status(502).json({ er      return res.status(502).json({ er      return res.status(502).json({ er      return res.status(502).json({ er      return res.status(502).jsrd<     g,       return res.status(502).json({ er      return res.status(502 0) as number;
    return res.status(200).json({ workoutId, workoutName: garminWorkout.workoutName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-workout] Error:', msg);
                                         'Err                  kout: ' + msg });
  }
}
