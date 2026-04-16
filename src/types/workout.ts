// ─── Garmin Connect Workout Types ───────────────────────────────────────────

export type StepTypeKey =
  | 'warmup'
  | 'cooldown'
  | 'interval'
  | 'recovery'
  | 'rest'
  | 'other';

export const STEP_TYPE_IDS: Record<StepTypeKey, number> = {
  warmup: 1,
  cooldown: 2,
  interval: 3,
  recovery: 4,
  rest: 5,
  other: 7,
};

export type EndConditionKey = 'lap.button' | 'time' | 'distance';

export const END_CONDITION_IDS: Record<EndConditionKey, number> = {
  'lap.button': 1,
  time: 2,
  distance: 3,
};

export type TargetTypeKey =
  | 'no.target'
  | 'heart.rate.zone'
  | 'speed.zone';

export const TARGET_TYPE_IDS: Record<TargetTypeKey, number> = {
  'no.target': 1,
  'heart.rate.zone': 4,
  'speed.zone': 6,
};

// ─── Parsed Step (from AI parser) ────────────────────────────────────────────

export interface ParsedStep {
  type: 'step';
  stepType: StepTypeKey;
  description: string;
  endCondition: EndConditionKey;
  /** seconds (for time) or meters (for distance) */
  endConditionValue: number | null;
  targetType: TargetTypeKey;
  /** bpm min (HRZ) or pace m/s min (speed), null for no.target */
  targetValueOne: number | null;
  /** bpm max (HRZ) or pace m/s max (speed), null for no.target */
  targetValueTwo: number | null;
}

export interface ParsedRepeatGroup {
  type: 'repeat';
  numberOfIterations: number;
  steps: ParsedStep[];
}

export type ParsedWorkoutStep = ParsedStep | ParsedRepeatGroup;

export interface ParsedWorkout {
  name: string;
  steps: ParsedWorkoutStep[];
}

// ─── Garmin Connect API DTOs ──────────────────────────────────────────────────

export interface GarminExecutableStep {
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

export interface GarminRepeatGroup {
  type: 'RepeatGroupDTO';
  stepId: null;
  stepOrder: number;
  childStepId: number;
  numberOfIterations: number;
  smartRepeat: false;
  workoutSteps: GarminExecutableStep[];
}

export type GarminWorkoutStep = GarminExecutableStep | GarminRepeatGroup;

export interface GarminWorkout {
  workoutId: null;
  workoutName: string;
  description: string;
  sportType: { sportTypeId: 1; sportTypeKey: 'running' };
  workoutSegments: [
    {
      segmentOrder: 1;
      sportType: { sportTypeId: 1; sportTypeKey: 'running' };
      workoutSteps: GarminWorkoutStep[];
    }
  ];
}

// ─── App State Types ──────────────────────────────────────────────────────────

export interface GarminCredentials {
  email: string;
  accessToken: string;
  /** Unix timestamp (ms) cuando expira el token */
  tokenExpiresAt: number;
}

export type AppStatus =
  | 'idle'
  | 'parsing'
  | 'parsed'
  | 'uploading'
  | 'success'
  | 'error';

export interface UploadResult {
  workoutId: number;
  workoutName: string;
}
