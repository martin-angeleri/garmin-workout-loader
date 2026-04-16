import { useState } from 'react';
import type {
  ParsedWorkout,
  ParsedStep,
  ParsedRepeatGroup,
  ParsedWorkoutStep,
} from '../types/workout';

const STEP_LABELS: Record<string, string> = {
  warmup: 'Entrada en calor',
  cooldown: 'Vuelta a la calma',
  interval: 'Intervalo',
  recovery: 'Recuperación',
  rest: 'Descanso',
  other: 'Otro',
};

const STEP_COLORS: Record<string, string> = {
  warmup: '#FF9500',
  cooldown: '#30D158',
  interval: '#E91E8C',
  recovery: '#0A84FF',
  rest: '#5E5CE6',
  other: '#888',
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  warmup: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.75 2.75a.75.75 0 00-1.5 0V9H4.72l3.97-3.97a.75.75 0 10-1.06-1.06L2.44 9.16a.75.75 0 000 1.06l5.19 5.19a.75.75 0 001.06-1.06L4.72 10.5H12v8.75a.75.75 0 001.5 0V10.5h7.28l-3.97 3.97a.75.75 0 001.06 1.06l5.19-5.19a.75.75 0 000-1.06l-5.19-5.19a.75.75 0 10-1.06 1.06L20.28 9H13.25V2.75h-.5z"/></svg>,
  cooldown: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z"/></svg>,
  interval: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/></svg>,
  recovery: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5.08V2c-5 .5-9 4.81-9 10s4 9.5 9 10v-3.08c-3-.48-6-3.4-6-6.92s3-6.44 6-6.92zM18.97 11H22c-.47-5-4-8.53-9-9.03V5.1c2.99.47 5.5 2.98 5.97 5.9zM13 18.92V22c5-.5 8.53-4 9-9h-3.03c-.47 2.92-2.98 5.43-5.97 5.92z"/></svg>,
  rest: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 2A7.5 7.5 0 002 9.5v5A7.5 7.5 0 009.5 22h5a7.5 7.5 0 007.5-7.5v-5A7.5 7.5 0 0014.5 2h-5zm-1 8h7v4h-7v-4z"/></svg>,
  other: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>,
};

function formatCondition(step: ParsedStep): string {
  if (step.endCondition === 'time' && step.endConditionValue) {
    const secs = step.endConditionValue;
    if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}min`;
    if (secs >= 60) return `${Math.floor(secs / 60)}min${secs % 60 > 0 ? ` ${secs % 60}s` : ''}`;
    return `${secs}s`;
  }
  if (step.endCondition === 'distance' && step.endConditionValue) {
    const m = step.endConditionValue;
    return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`;
  }
  return 'Hasta botón';
}

function formatTarget(step: ParsedStep): string | null {
  if (step.targetType === 'no.target') return null;
  if (step.targetType === 'heart.rate.zone' && step.targetValueOne && step.targetValueTwo) {
    return `FC ${step.targetValueOne}–${step.targetValueTwo} bpm`;
  }
  if (step.targetType === 'speed.zone' && step.targetValueOne && step.targetValueTwo) {
    const toPace = (ms: number) => {
      const secPerKm = 1000 / ms;
      return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
    };
    return `${toPace(step.targetValueTwo)} – ${toPace(step.targetValueOne)}`;
  }
  return null;
}

function StepCard({ step, isNested }: { step: ParsedStep; index?: number; isNested?: boolean }) {
  const color = STEP_COLORS[step.stepType] ?? '#888';
  const condition = formatCondition(step);
  const target = formatTarget(step);

  return (
    <div
      className="step-card flex items-start gap-3 p-3.5 rounded-xl"
      style={{ background: isNested ? '#141416' : '#1A1A1C', border: `1px solid #2A2A2C` }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
           style={{ background: `${color}20`, color }}>
        {STEP_ICONS[step.stepType]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            {STEP_LABELS[step.stepType] ?? step.stepType}
          </span>
          <span className="text-sm font-bold" style={{ color: '#E8E8EA' }}>
            {condition}
          </span>
        </div>
        {step.description && (
          <p className="text-xs mt-1 leading-snug" style={{ color: '#888' }}>
            {step.description}
          </p>
        )}
        {target && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-0.5 rounded-md font-medium"
                style={{ background: `${color}15`, color }}>
            🎯 {target}
          </span>
        )}
      </div>
    </div>
  );
}

function RepeatGroupCard({ group }: { group: ParsedRepeatGroup; groupIndex?: number }) {
  return (
    <div className="step-card rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(233,30,140,0.35)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5"
           style={{ background: 'rgba(233,30,140,0.1)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#E91E8C">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
        </svg>
        <span className="text-sm font-bold" style={{ color: '#E91E8C' }}>
          {group.numberOfIterations} repeticiones
        </span>
      </div>
      <div className="p-3 space-y-2" style={{ background: '#131315' }}>
        {group.steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} isNested />
        ))}
      </div>
    </div>
  );
}

interface Props {
  workout: ParsedWorkout;
  onNameChange: (name: string) => void;
  onUpload: () => void;
  onBack: () => void;
  onReparse: () => void;
  uploading: boolean;
  email: string;
}

export default function WorkoutPreview({ workout, onNameChange, onUpload, onBack, onReparse, uploading, email }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(workout.name);

  const saveNameEdit = () => {
    if (nameInput.trim()) onNameChange(nameInput.trim());
    setEditingName(false);
  };

  const totalSteps = workout.steps.reduce((acc: number, s: ParsedWorkoutStep) => {
    if (s.type === 'repeat') return acc + s.steps.length * s.numberOfIterations + 1;
    return acc + 1;
  }, 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">

      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: '#666' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E8E8EA')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Editar texto
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={onReparse}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all"
            style={{ background: 'rgba(233,30,140,0.08)', color: '#E91E8C', border: '1px solid rgba(233,30,140,0.25)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.18)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.08)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
            Re-interpretar
          </button>
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
               style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158', border: '1px solid rgba(48,209,88,0.2)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            Interpretado
          </div>
        </div>
      </div>

      {/* Workout name */}
      <div className="rounded-2xl p-5" style={{ background: '#1A1A1C', border: '1px solid #2E2E30' }}>
        <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: '#666' }}>Nombre del workout</p>
        {editingName ? (
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl text-base font-bold"
              style={{ background: '#0F0F10', border: '1.5px solid #E91E8C', color: '#E8E8EA' }}
              onKeyDown={e => e.key === 'Enter' && saveNameEdit()}
              autoFocus
            />
            <button onClick={saveNameEdit}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: '#E91E8C', color: '#fff' }}>
              OK
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-bold truncate" style={{ color: '#E8E8EA' }}>
              {workout.name}
            </h3>
            <button onClick={() => setEditingName(true)}
                    className="shrink-0 p-1.5 rounded-lg transition-colors"
                    style={{ color: '#555' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF6900')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}
        <p className="text-xs mt-1.5" style={{ color: '#555' }}>{totalSteps} pasos · Running</p>
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-5 rounded-full" style={{ background: '#E91E8C' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#E8E8EA' }}>Pasos del entrenamiento</h2>
        </div>
        {workout.steps.map((step: ParsedWorkoutStep, i: number) =>
          step.type === 'repeat'
            ? <RepeatGroupCard key={i} group={step} groupIndex={i} />
            : <StepCard key={i} step={step} index={i} />
        )}
      </div>

      {/* Upload button */}
      <div className="rounded-2xl p-4 sm:p-5" style={{ background: '#141416', border: '1px solid #2A2A2C' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
               style={{ background: 'rgba(233,30,140,0.15)', fontSize: '20px' }}>
            ⌚
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#E8E8EA' }}>Subir a Garmin Connect</p>
            <p className="text-xs" style={{ color: '#555' }}>Cuenta: {email}</p>
          </div>
        </div>

        <button
          onClick={onUpload}
          disabled={uploading}
          className="w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2.5"
          style={{
          background: uploading ? '#2A2A2C' : 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)',
            color: uploading ? '#555' : '#fff',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="30"/>
              </svg>
              Subiendo a Garmin Connect...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Subir workout a Garmin Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}
