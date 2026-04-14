import { useState } from 'react';

const EXAMPLES = [
  {
    label: 'Intervalos 400m',
    text: `-E/calor: 2,5km suaves
-10 x 400m progresivos terminando al 80%. Pausa de 50s
-Reg: 15min suaves`,
  },
  {
    label: 'Circuito por tiempo',
    text: `-E/calor: 15min suaves
-Circuito: 3 x 7min con 2min de pausa
-Reg: 15min suaves`,
  },
  {
    label: 'Fartlek',
    text: `-E/calor: 15min suaves
-3x 8min (1min de cambio de ritmo x 1min suave) pausa de 1:30
-Reg: 15min suaves`,
  },
];

interface Props {
  onParse: (text: string) => void;
  loading: boolean;
}

export default function WorkoutInput({ onParse, loading }: Props) {
  const [text, setText] = useState('');
  const [showExamples, setShowExamples] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length > 0) onParse(text.trim());
  };

  return (
    <div className="w-full max-w-2xl mx-auto">

      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-5 rounded-full" style={{ background: '#FF6900' }} />
        <h2 className="text-base font-semibold" style={{ color: '#E8E8EA' }}>
          Describí tu entrenamiento
        </h2>
      </div>

      <p className="text-sm mb-4" style={{ color: '#666' }}>
        Escribí el entrenamiento como de costumbre, en español. La IA lo va a interpretar y convertir al formato de Garmin.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Ej:\n-E/calor: 15min suaves\n-10 x 400m progresivos terminando al 80%. Pausa de 50s\n-Reg: 15min suaves`}
            className="w-full px-5 py-4 rounded-2xl text-sm leading-relaxed font-mono transition-colors"
            style={{
              background: '#141416',
              border: '1.5px solid #2E2E30',
              color: '#E8E8EA',
              minHeight: '220px',
            }}
            disabled={loading}
            spellCheck={false}
            onFocus={e => (e.target.style.borderColor = '#FF6900')}
            onBlur={e => (e.target.style.borderColor = '#2E2E30')}
          />
          <div className="absolute bottom-3 right-4 text-xs" style={{ color: '#444' }}>
            {text.length} caracteres
          </div>
        </div>

        {/* Examples accordion */}
        <button
          type="button"
          onClick={() => setShowExamples(v => !v)}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: '#666' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#FF6900')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
               style={{ transform: showExamples ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
            <path d="M7 10l5 5 5-5z"/>
          </svg>
          Ver ejemplos de entrenamiento
        </button>

        {showExamples && (
          <div className="grid gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                type="button"
                onClick={() => { setText(ex.text); setShowExamples(false); }}
                className="text-left p-4 rounded-xl transition-all group"
                style={{ background: '#141416', border: '1px solid #2A2A2C' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#FF6900')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2A2C')}
              >
                <p className="text-xs font-semibold mb-1.5 transition-colors"
                   style={{ color: '#FF6900' }}>
                  {ex.label}
                </p>
                <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: '#888', fontFamily: 'inherit' }}>
                  {ex.text}
                </pre>
              </button>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || text.trim().length === 0}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all flex items-center justify-center gap-2.5"
          style={{
            background: loading || text.trim().length === 0
              ? '#2A2A2C'
              : 'linear-gradient(135deg, #FF6900 0%, #FF9500 100%)',
            color: loading || text.trim().length === 0 ? '#555' : '#fff',
            cursor: loading || text.trim().length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="30"/>
              </svg>
              Interpretando con IA...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="white"/>
              </svg>
              Interpretar entrenamiento
            </>
          )}
        </button>
      </form>
    </div>
  );
}
