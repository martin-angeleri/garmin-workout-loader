import type { UploadResult } from '../types/workout';

interface Props {
  result: UploadResult;
  onReset: () => void;
}

export default function SuccessScreen({ result, onReset }: Props) {
  const garminUrl = `https://connect.garmin.com/modern/workout/${result.workoutId}`;

  return (
    <div className="w-full max-w-2xl mx-auto text-center py-8 px-4">

      {/* Success icon */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full flex items-center justify-center"
               style={{ background: 'rgba(48,209,88,0.12)', border: '2px solid rgba(48,209,88,0.3)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#30D158">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-lg"
               style={{ background: '#0F0F10', fontSize: '20px' }}>⌚</div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-2" style={{ color: '#E8E8EA' }}>
        ¡Workout subido con éxito!
      </h2>
      <p className="text-sm mb-1" style={{ color: '#888' }}>
        <span className="font-semibold" style={{ color: '#E8E8EA' }}>{result.workoutName}</span> ya está disponible en tu biblioteca de Garmin Connect.
      </p>
      <p className="text-xs mb-8" style={{ color: '#555' }}>
        ID: {result.workoutId}
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={garminUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{ background: '#1A1A1C', border: '1px solid #2E2E30', color: '#E8E8EA' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#FF6900')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#2E2E30')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Ver en Garmin Connect
        </a>

        <button
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)', color: '#fff' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          </svg>
          Cargar otro entrenamiento
        </button>
      </div>
    </div>
  );
}
