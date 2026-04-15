import { useState } from 'react';
import { useCredentials } from './hooks/useCredentials';
import CredentialsSetup from './components/CredentialsSetup';
import Header from './components/Header';
import WorkoutInput from './components/WorkoutInput';
import WorkoutPreview from './components/WorkoutPreview';
import SuccessScreen from './components/SuccessScreen';
import type { ParsedWorkout, AppStatus, UploadResult } from './types/workout';

export default function App() {
  const { credentials, save: saveCredentials, isConfigured } = useCredentials();
  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [editingCredentials, setEditingCredentials] = useState(false);

  const [status, setStatus] = useState<AppStatus>('idle');
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleParse = async (text: string) => {
    setStatus('parsing');
    setErrorMessage('');
    try {
      const res = await fetch('/api/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al interpretar el entrenamiento.');
      setParsedWorkout(data as ParsedWorkout);
      setStatus('parsed');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado.');
      setStatus('error');
    }
  };

  const handleUpload = async () => {
    if (!parsedWorkout || !credentials) return;
    setStatus('uploading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/upload-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout: parsedWorkout,
          email: credentials.email,
          password: credentials.password,
        }),
      });
      // Leer el texto primero para no consumir el stream antes del parse
      const rawText = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error('[upload] respuesta no-JSON del servidor:', res.status, rawText);
        setErrorMessage(`Error del servidor (${res.status}): ${rawText.slice(0, 200) || 'sin detalle'}`);
        setStatus('error');
        return;
      }
      if (!res.ok) {
        setErrorMessage(String(data.error ?? 'Error al subir el workout.'));
        setStatus('error');
        return;
      }
      setUploadResult(data as unknown as UploadResult);
      setStatus('success');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setParsedWorkout(null);
    setUploadResult(null);
    setErrorMessage('');
  };

  if (showSetup) {
    return (
      <CredentialsSetup
        isFirstTime
        onSave={(creds) => {
          saveCredentials(creds);
          setShowSetup(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0F0F10' }}>
      {isConfigured && credentials && (
        <Header
          email={credentials.email}
          onChangeAccount={() => setEditingCredentials(true)}
        />
      )}

      {editingCredentials && credentials && (
        <CredentialsSetup
          isFirstTime={false}
          currentEmail={credentials.email}
          onSave={(creds) => {
            saveCredentials(creds);
            setEditingCredentials(false);
          }}
          onClose={() => setEditingCredentials(false)}
        />
      )}

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        {status === 'idle' && (
          <div className="text-center mb-10 max-w-2xl">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
              style={{ background: 'rgba(255,105,0,0.12)', color: '#FF6900', border: '1px solid rgba(255,105,0,0.25)' }}
            >
              <span style={{ color: '#C8FF00' }}>✦</span> Powered by GPT-4o + Garmin Connect
            </div>
            <h1 className="text-4xl font-bold leading-tight mb-3" style={{ color: '#E8E8EA' }}>
              Cargá tu entrenamiento<br />
              <span className="gradient-text">en Garmin en segundos</span>
            </h1>
            <p className="text-base leading-relaxed" style={{ color: '#666' }}>
              Escribí el entrenamiento como lo harías en un mensaje, y lo convertimos
              automáticamente al formato de Garmin Connect para que lo tengas en tu reloj.
            </p>
          </div>
        )}

        {status === 'error' && errorMessage && (
          <div
            className="w-full max-w-2xl mb-6 flex items-start gap-3 p-4 rounded-xl"
            style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF3B30" className="shrink-0 mt-0.5">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#FF3B30' }}>Error</p>
              <p className="text-sm" style={{ color: '#FF8075' }}>{errorMessage}</p>
            </div>
            <button
              onClick={handleReset}
              className="text-xs px-3 py-1 rounded-lg shrink-0"
              style={{ background: 'rgba(255,59,48,0.15)', color: '#FF3B30' }}
            >
              Reintentar
            </button>
          </div>
        )}

        {(status === 'idle' || status === 'parsing' || status === 'error') && (
          <WorkoutInput onParse={handleParse} loading={status === 'parsing'} />
        )}

        {(status === 'parsed' || status === 'uploading') && parsedWorkout && credentials && (
          <WorkoutPreview
            workout={parsedWorkout}
            onNameChange={(name) => setParsedWorkout((prev) => (prev ? { ...prev, name } : prev))}
            onUpload={handleUpload}
            onBack={() => setStatus('idle')}
            uploading={status === 'uploading'}
            email={credentials.email}
          />
        )}

        {status === 'success' && uploadResult && (
          <SuccessScreen result={uploadResult} onReset={handleReset} />
        )}
      </main>

      <footer
        className="py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
        style={{ borderTop: '1px solid #1E1E20', color: '#444' }}
      >
        <span>© {new Date().getFullYear()} Martín Angeleri. Todos los derechos reservados.</span>
        <span style={{ color: '#333' }}>
          Garmin® es marca registrada de Garmin Ltd. Esta app no es oficial.
        </span>
      </footer>
    </div>
  );
}
