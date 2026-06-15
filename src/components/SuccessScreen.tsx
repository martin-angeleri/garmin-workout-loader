import type { UploadResult } from '../types/workout';

interface Props {
  result: UploadResult;
  onReset: () => void;
}

export default function SuccessScreen({ result, onReset }: Props) {
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
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
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

      {/* Sync reminder */}
      <div
        className="flex items-start gap-3 p-4 rounded-2xl mb-8 text-left"
        style={{ background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.25)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(10,132,255,0.15)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A84FF">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold mb-0.5" style={{ color: '#0A84FF' }}>
            ¡No olvides sincronizar tu reloj!
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#6AA8D8' }}>
            Abrí <strong style={{ color: '#A0C8F0' }}>Garmin Connect</strong> en tu teléfono y sincronizá tu reloj para que el entrenamiento aparezca disponible en tu dispositivo.
          </p>
        </div>
      </div>

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
  );
}
