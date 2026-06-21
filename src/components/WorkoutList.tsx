import { useState, useEffect } from 'react';
import type { GarminCredentials, UserWorkout, ParsedWorkout, ParsedWorkoutStep, ParsedStep, StepTypeKey, EndConditionKey, TargetTypeKey } from '../types/workout';

// ─── Garmin DTO mapper ───────────────────────────────────────────────────────

export function mapGarminToParsed(g: any): ParsedWorkout {
  const segment = g.workoutSegments?.[0];
  const steps = segment?.workoutSteps || [];
  
  const parsedSteps: ParsedWorkoutStep[] = steps.map((s: any): ParsedWorkoutStep => {
    if (s.type === 'RepeatGroupDTO') {
      const repeatSteps: ParsedStep[] = (s.workoutSteps || []).map((ws: any): ParsedStep => ({
        type: 'step',
        stepType: (ws.stepType?.stepTypeKey || 'other') as StepTypeKey,
        description: ws.description || '',
        endCondition: (ws.endCondition?.conditionTypeKey || 'lap.button') as EndConditionKey,
        endConditionValue: ws.endConditionValue,
        targetType: (ws.targetType?.workoutTargetTypeKey || 'no.target') as TargetTypeKey,
        targetValueOne: ws.targetValueOne,
        targetValueTwo: ws.targetValueTwo,
      }));
      return {
        type: 'repeat',
        numberOfIterations: s.numberOfIterations || 1,
        steps: repeatSteps,
      };
    } else {
      return {
        type: 'step',
        stepType: (s.stepType?.stepTypeKey || 'other') as StepTypeKey,
        description: s.description || '',
        endCondition: (s.endCondition?.conditionTypeKey || 'lap.button') as EndConditionKey,
        endConditionValue: s.endConditionValue,
        targetType: (s.targetType?.workoutTargetTypeKey || 'no.target') as TargetTypeKey,
        targetValueOne: s.targetValueOne,
        targetValueTwo: s.targetValueTwo,
      };
    }
  });

  return {
    name: g.workoutName || 'Entrenamiento Garmin',
    steps: parsedSteps,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${min > 0 ? `${min}m` : ''}`;
  return `${min}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  credentials: GarminCredentials;
  onSelectWorkout: (workout: ParsedWorkout) => void;
  onLoadNew: () => void;
  onTokenExpired: () => void;
}

export default function WorkoutList({ credentials, onSelectWorkout, onLoadNew, onTokenExpired }: Props) {
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<number | null>(null);

  const fetchWorkouts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/list-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: credentials.accessToken }),
      });

      if (res.status === 401) {
        onTokenExpired();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al obtener entrenamientos.');
      
      setWorkouts(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado al cargar la lista.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, [credentials.accessToken]);

  const handleDelete = async (workoutId: number) => {
    setDeletingId(workoutId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch('/api/delete-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutId, accessToken: credentials.accessToken }),
      });

      if (res.status === 401) {
        onTokenExpired();
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'No se pudo eliminar el entrenamiento.');
      }

      setWorkouts(prev => prev.filter(w => w.workoutId !== workoutId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el entrenamiento.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewDetails = async (workoutId: number) => {
    setLoadingDetailsId(workoutId);
    try {
      const res = await fetch('/api/get-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutId, accessToken: credentials.accessToken }),
      });

      if (res.status === 401) {
        onTokenExpired();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo obtener el detalle.');

      const parsed = mapGarminToParsed(data);
      onSelectWorkout(parsed);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al cargar los detalles del entrenamiento.');
    } finally {
      setLoadingDetailsId(null);
    }
  };

  const filteredWorkouts = workouts.filter(w =>
    w.workoutName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full max-w-2xl mx-auto px-1 sm:px-0">
      
      {/* Top action header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: '#E8E8EA' }}>
            Mis Entrenamientos
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#666' }}>
            {workouts.length} {workouts.length === 1 ? 'entrenamiento guardado' : 'entrenamientos guardados'}
          </p>
        </div>
        
        <button
          onClick={onLoadNew}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Cargar nuevo
        </button>
      </div>

      {/* Search Bar */}
      {workouts.length > 0 && (
        <div className="relative mb-5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-colors"
            style={{
              background: '#141416',
              border: '1.5px solid #2E2E30',
              color: '#E8E8EA',
            }}
            onFocus={e => (e.target.style.borderColor = '#E91E8C')}
            onBlur={e => (e.target.style.borderColor = '#2E2E30')}
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#555"
            strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: '#555' }}
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(233,30,140,0.08)', border: '1px solid rgba(233,30,140,0.2)' }}>
            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#E91E8C" strokeWidth="2.5" strokeDasharray="50" strokeDashoffset="20"/>
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: '#888' }}>Cargando entrenamientos...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          className="flex flex-col items-center justify-center p-6 rounded-2xl text-center border"
          style={{ background: 'rgba(255,59,48,0.05)', borderColor: 'rgba(255,59,48,0.15)' }}
        >
          <p className="text-sm font-semibold mb-2" style={{ color: '#FF3B30' }}>Error al conectar</p>
          <p className="text-xs mb-4 max-w-md" style={{ color: '#FF8075' }}>{error}</p>
          <button
            onClick={fetchWorkouts}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ background: 'rgba(255,59,48,0.12)', color: '#FF3B30' }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && workouts.length === 0 && (
        <div
          className="text-center py-16 px-4 rounded-2xl border"
          style={{ background: '#141416', borderColor: '#2A2A2C' }}
        >
          <div className="text-4xl mb-4">🏋️‍♂️</div>
          <h3 className="text-base font-bold mb-1" style={{ color: '#E8E8EA' }}>No hay entrenamientos guardados</h3>
          <p className="text-xs mb-6 max-w-sm mx-auto" style={{ color: '#666' }}>
            Tu biblioteca de Garmin Connect está vacía. ¡Creá e interpretá tu primer entrenamiento ahora mismo!
          </p>
          <button
            onClick={onLoadNew}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)', color: '#fff' }}
          >
            Cargar nuevo entrenamiento
          </button>
        </div>
      )}

      {/* No results from search */}
      {!loading && !error && workouts.length > 0 && filteredWorkouts.length === 0 && (
        <div className="text-center py-12 text-sm" style={{ color: '#555' }}>
          No se encontraron entrenamientos con "{search}"
        </div>
      )}

      {/* Workout list */}
      {!loading && !error && filteredWorkouts.length > 0 && (
        <div className="space-y-3">
          {filteredWorkouts.map(w => {
            const isDeleting = deletingId === w.workoutId;
            const isConfirming = confirmDeleteId === w.workoutId;
            const isLoadingDetails = loadingDetailsId === w.workoutId;

            return (
              <div
                key={w.workoutId}
                className="step-card flex flex-col p-4 rounded-2xl transition-all border"
                style={{
                  background: '#1A1A1C',
                  borderColor: '#2A2A2C',
                  opacity: isDeleting ? 0.4 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  
                  {/* Left part: Stats & details */}
                  <div className="flex-1 min-w-0">
                    
                    {/* Badge & Date */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                        style={{
                          background: 'rgba(233,30,140,0.1)',
                          color: '#E91E8C',
                        }}
                      >
                        {w.sportType?.sportTypeKey === 'running' ? 'Running 🏃‍♂️' : w.sportType?.sportTypeKey || 'Running'}
                      </span>
                      <span className="text-[10px]" style={{ color: '#555' }}>
                        Modificado: {formatDate(w.updatedDate)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold truncate mb-1" style={{ color: '#E8E8EA' }}>
                      {w.workoutName}
                    </h3>

                    {/* Description preview */}
                    {w.description && (
                      <p className="text-xs truncate mb-2" style={{ color: '#666' }}>
                        {w.description}
                      </p>
                    )}

                    {/* Stats estimation */}
                    {(w.estimatedDurationInSecs || w.estimatedDistanceInMeters) && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#888' }}>
                        {w.estimatedDurationInSecs && (
                          <span className="inline-flex items-center gap-1">
                            ⏱️ {formatDuration(w.estimatedDurationInSecs)}
                          </span>
                        )}
                        {w.estimatedDurationInSecs && w.estimatedDistanceInMeters && (
                          <span style={{ color: '#333' }}>·</span>
                        )}
                        {w.estimatedDistanceInMeters && (
                          <span className="inline-flex items-center gap-1">
                            📏 {formatDistance(w.estimatedDistanceInMeters)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right part: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-center">
                    
                    {/* Inline Delete Confirmation */}
                    {isConfirming ? (
                      <div className="flex items-center gap-1.5" style={{ animation: 'slideIn 0.2s ease forwards' }}>
                        <button
                          onClick={() => handleDelete(w.workoutId)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          style={{ background: '#FF3B30', color: '#fff' }}
                        >
                          Sí
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: '#2E2E30', color: '#AAA' }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* View Button */}
                        <button
                          onClick={() => handleViewDetails(w.workoutId)}
                          disabled={isLoadingDetails || isDeleting}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors border"
                          style={{
                            background: isLoadingDetails ? '#222' : 'rgba(233,30,140,0.06)',
                            borderColor: 'rgba(233,30,140,0.15)',
                            color: '#E91E8C',
                            cursor: 'pointer',
                          }}
                          title="Ver entrenamiento"
                        >
                          {isLoadingDetails ? (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30" strokeDashoffset="10"/>
                            </svg>
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setConfirmDeleteId(w.workoutId)}
                          disabled={isLoadingDetails || isDeleting}
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors border"
                          style={{
                            background: 'rgba(255,59,48,0.06)',
                            borderColor: 'rgba(255,59,48,0.15)',
                            color: '#FF3B30',
                            cursor: 'pointer',
                          }}
                          title="Eliminar entrenamiento"
                        >
                          {isDeleting ? (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30" strokeDashoffset="10"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
