import { useState, useRef, useEffect } from 'react';
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

// ─── AI Edit Icon ─────────────────────────────────────────────────────────────

function AIEditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      {/* Pencil body */}
      <path
        d="M14.5 3.5L20.5 9.5L9 21H3V15L14.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14.5 3.5L20.5 9.5" stroke="currentColor" strokeWidth="1.8"/>
      {/* AI sparkle — top right */}
      <path
        d="M21 2L21.7 3.3L23 4L21.7 4.7L21 6L20.3 4.7L19 4L20.3 3.3L21 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Duration / Distance estimation ──────────────────────────────────────────
// Pace per meter in seconds, by step type (used when endCondition is 'distance')
const SEC_PER_METER: Record<string, number> = {
  warmup:   7 * 60 / 1000,   // 7:00/km
  cooldown: 7 * 60 / 1000,   // 7:00/km
  interval: 5 * 60 / 1000,   // 5:00/km
  recovery: 7 * 60 / 1000,   // 7:00/km
  rest:     8 * 60 / 1000,   // 8:00/km (walk)
  other:    6 * 60 / 1000,   // 6:00/km
};

function estimateStep(step: ParsedStep): { seconds: number; meters: number; isEstimate: boolean } {
  if (step.endCondition === 'time' && step.endConditionValue) {
    // Time known — estimate distance from pace
    const pace = SEC_PER_METER[step.stepType] ?? (6 * 60 / 1000);
    const meters = step.endConditionValue / pace;
    return { seconds: step.endConditionValue, meters, isEstimate: true };
  }
  if (step.endCondition === 'distance' && step.endConditionValue) {
    // Distance known — estimate time from pace
    const pace = SEC_PER_METER[step.stepType] ?? (6 * 60 / 1000);
    return { seconds: Math.round(step.endConditionValue * pace), meters: step.endConditionValue, isEstimate: true };
  }
  // lap.button — can't estimate
  return { seconds: 0, meters: 0, isEstimate: true };
}

function calcWorkoutStats(steps: ParsedWorkoutStep[]): { seconds: number; meters: number; hasEstimate: boolean } {
  let seconds = 0;
  let meters = 0;
  let hasEstimate = false;
  for (const s of steps) {
    if (s.type === 'repeat') {
      for (const inner of s.steps) {
        const e = estimateStep(inner);
        seconds += e.seconds * s.numberOfIterations;
        meters  += e.meters  * s.numberOfIterations;
        if (e.isEstimate) hasEstimate = true;
      }
    } else {
      const e = estimateStep(s);
      seconds += e.seconds;
      meters  += e.meters;
      if (e.isEstimate) hasEstimate = true;
    }
  }
  return { seconds, meters, hasEstimate };
}

function formatDuration(seconds: number): string {
  const h   = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${min > 0 ? `${min}min` : ''}`;
  return `${min}min`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// ─── Inline correction panel ──────────────────────────────────────────────────

interface CorrectionPanelProps {
  blockLabel: string;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

function CorrectionPanel({ blockLabel, onSubmit, onCancel }: CorrectionPanelProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit(`${blockLabel}: ${text.trim()}`);
    setText('');
  };

  return (
    <div
      className="mt-2 rounded-xl p-3"
      style={{ background: '#0F0F10', border: '1.5px solid rgba(233,30,140,0.4)' }}
    >
      <p className="text-xs mb-2" style={{ color: '#AAA' }}>
        ¿Qué querés cambiar en <strong style={{ color: '#E91E8C' }}>{blockLabel}</strong>?
      </p>
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Ej: "son 5 repeticiones, no 4" · "el intervalo debería ser 500m" · "agregar una recuperación de 90s"`}
        rows={2}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        className="w-full px-3 py-2 rounded-lg text-sm resize-none"
        style={{
          background: '#1A1A1C',
          border: '1px solid #3A3A3C',
          color: '#E8E8EA',
          outline: 'none',
          fontFamily: 'inherit',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#E91E8C'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#3A3A3C'; }}
      />
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-xs" style={{ color: '#555' }}>⌘ + Enter para aplicar</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: '#2A2A2C', color: '#AAAAAA' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: text.trim() ? 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)' : '#2A2A2C',
              color: text.trim() ? '#fff' : '#555',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Aplicar con IA
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  isNested,
  blockLabel,
  onCorrect,
  editingThis,
  onStartEdit,
  onCancelEdit,
}: {
  step: ParsedStep;
  isNested?: boolean;
  blockLabel?: string;
  onCorrect?: (instruction: string) => void;
  editingThis?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
}) {
  const color = STEP_COLORS[step.stepType] ?? '#888';
  const condition = formatCondition(step);

  return (
    <div>
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: '#E8E8EA' }}>
                {condition}
              </span>
              {!isNested && blockLabel && onCorrect && (
                <button
                  onClick={onStartEdit}
                  title="Corregir con IA"
                  className="flex items-center justify-center w-6 h-6 rounded-md transition-all"
                  style={{
                    background: editingThis ? 'rgba(233,30,140,0.2)' : 'rgba(233,30,140,0.08)',
                    color: '#E91E8C',
                    border: '1px solid rgba(233,30,140,0.25)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.2)'; }}
                  onMouseLeave={e => { if (!editingThis) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.08)'; }}
                >
                  <AIEditIcon />
                </button>
              )}
            </div>
          </div>
          {step.description && (
            <p className="text-xs mt-1 leading-snug" style={{ color: '#888' }}>
              {step.description}
            </p>
          )}
        </div>
      </div>
      {editingThis && blockLabel && onCorrect && onCancelEdit && (
        <CorrectionPanel
          blockLabel={blockLabel}
          onSubmit={onCorrect}
          onCancel={onCancelEdit}
        />
      )}
    </div>
  );
}

// ─── Repeat Group Card ────────────────────────────────────────────────────────

function RepeatGroupCard({
  group,
  blockLabel,
  onCorrect,
  editingThis,
  onStartEdit,
  onCancelEdit,
}: {
  group: ParsedRepeatGroup;
  blockLabel: string;
  onCorrect?: (instruction: string) => void;
  editingThis: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div>
      <div className="step-card rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(233,30,140,0.35)' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{ background: 'rgba(233,30,140,0.1)' }}
        >
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#E91E8C">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
            <span className="text-sm font-bold" style={{ color: '#E91E8C' }}>
              {group.numberOfIterations} repeticiones
            </span>
          </div>
          {/* AI Edit button */}
          {onCorrect && (
            <button
              onClick={onStartEdit}
              title="Corregir este bloque con IA"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: editingThis ? 'rgba(233,30,140,0.25)' : 'rgba(233,30,140,0.12)',
                color: '#E91E8C',
                border: '1px solid rgba(233,30,140,0.3)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.25)'; }}
              onMouseLeave={e => { if (!editingThis) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(233,30,140,0.12)'; }}
            >
              <AIEditIcon />
              <span>Editar</span>
            </button>
          )}
        </div>
        {/* Steps inside */}
        <div className="p-3 space-y-2" style={{ background: '#131315' }}>
          {group.steps.map((step, i) => (
            <StepCard key={i} step={step} isNested />
          ))}
        </div>
      </div>
      {editingThis && onCorrect && (
        <CorrectionPanel
          blockLabel={blockLabel}
          onSubmit={onCorrect}
          onCancel={onCancelEdit}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  workout: ParsedWorkout;
  onNameChange?: (name: string) => void;
  onUpload?: () => void;
  onBack: () => void;
  onCorrect?: (instruction: string) => void;
  correcting?: boolean;
  uploading?: boolean;
  email: string;
  readOnly?: boolean;
}

export default function WorkoutPreview({
  workout,
  onNameChange,
  onUpload,
  onBack,
  onCorrect,
  correcting = false,
  uploading = false,
  email,
  readOnly = false,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(workout.name);
  // Tracks which block index (0-based) is currently being edited; null = none
  const [editingBlock, setEditingBlock] = useState<number | null>(null);

  useEffect(() => {
    setNameInput(workout.name);
  }, [workout.name]);

  const saveNameEdit = () => {
    if (nameInput.trim() && onNameChange) onNameChange(nameInput.trim());
    setEditingName(false);
  };

  const totalSteps = workout.steps.reduce((acc: number, s: ParsedWorkoutStep) => {
    if (s.type === 'repeat') return acc + s.steps.length * s.numberOfIterations + 1;
    return acc + 1;
  }, 0);

  const { seconds: estSeconds, meters: estMeters, hasEstimate } = calcWorkoutStats(workout.steps);

  const getBlockLabel = (index: number) => `Bloque ${index + 1}`;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5" style={{ position: 'relative' }}>

      {/* Correction loading overlay */}
      {correcting && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl"
          style={{ background: 'rgba(15,15,16,0.85)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(233,30,140,0.12)', border: '1px solid rgba(233,30,140,0.3)' }}
          >
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#E91E8C" strokeWidth="2.5" strokeDasharray="50" strokeDashoffset="20"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold" style={{ color: '#E8E8EA' }}>Aplicando correcciones...</p>
            <p className="text-sm mt-1" style={{ color: '#666' }}>La IA está ajustando tu entrenamiento</p>
          </div>
        </div>
      )}

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
          {readOnly ? 'Volver a la lista' : 'Editar texto'}
        </button>
        <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
             style={{
               background: readOnly ? 'rgba(10,132,255,0.1)' : 'rgba(48,209,88,0.1)',
               color: readOnly ? '#0A84FF' : '#30D158',
               border: readOnly ? '1px solid rgba(10,132,255,0.2)' : '1px solid rgba(48,209,88,0.2)'
             }}
        >
          {readOnly ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 10h3l-4 4-4-4h3V8h2v4z"/></svg>
              En Garmin Connect
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              Interpretado
            </>
          )}
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
            {!readOnly && (
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
            )}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-xs" style={{ color: '#555' }}>{totalSteps} pasos · Running</span>
          {estSeconds > 0 && (
            <>
              <span style={{ color: '#333' }}>·</span>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#888' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                </svg>
                {hasEstimate ? '~' : ''}{formatDuration(estSeconds)}
              </span>
              <span style={{ color: '#333' }}>·</span>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#888' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                  <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
                </svg>
                {hasEstimate ? '~' : ''}{formatDistance(estMeters)}
              </span>
            </>
          )}
          {hasEstimate && (
            <span className="text-xs" style={{ color: '#444', fontStyle: 'italic' }}>estimado</span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-5 rounded-full" style={{ background: '#E91E8C' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#E8E8EA' }}>Pasos del entrenamiento</h2>
        </div>

        {workout.steps.map((step: ParsedWorkoutStep, i: number) => {
          const blockLabel = getBlockLabel(i);
          const isEditing = editingBlock === i;
          const startEdit = () => setEditingBlock(isEditing ? null : i);
          const cancelEdit = () => setEditingBlock(null);

          return (
            <div key={i}>
              {/* Block label */}
              <div className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-md"
                  style={{
                    background: 'rgba(233,30,140,0.08)',
                    color: '#E91E8C',
                    border: '1px solid rgba(233,30,140,0.18)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {blockLabel}
                </span>
              </div>

              {step.type === 'repeat' ? (
                <RepeatGroupCard
                  group={step}
                  blockLabel={blockLabel}
                  onCorrect={readOnly ? undefined : (instruction) => {
                    setEditingBlock(null);
                    if (onCorrect) onCorrect(instruction);
                  }}
                  editingThis={isEditing}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                />
              ) : (
                <StepCard
                  step={step}
                  blockLabel={blockLabel}
                  onCorrect={readOnly ? undefined : (instruction) => {
                    setEditingBlock(null);
                    if (onCorrect) onCorrect(instruction);
                  }}
                  editingThis={isEditing}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Upload button or back button if readOnly */}
      {readOnly ? (
        <div className="pt-2">
          <button
            onClick={onBack}
            className="w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #2A2A2C 0%, #1E1E20 100%)',
              border: '1px solid #3E3E40',
              color: '#E8E8EA',
              cursor: 'pointer',
            }}
          >
            Volver a la lista
          </button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
