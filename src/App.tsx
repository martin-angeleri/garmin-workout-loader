import { useState, useEffect } from 'react';
import { useCredentials } from './hooks/useCredentials';
import CredentialsSetup from './components/CredentialsSetup';
import Header from './components/Header';
import WorkoutInput from './components/WorkoutInput';
import WorkoutPreview from './components/WorkoutPreview';
import SuccessScreen from './components/SuccessScreen';
import WorkoutList from './components/WorkoutList';
import type { ParsedWorkout, AppStatus, UploadResult } from './types/workout';

export default function App() {
  const { credentials, save: saveCredentials, isConfigured, isTokenExpired } = useCredentials();

  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [tokenExpiredOnLoad, setTokenExpiredOnLoad] = useState(() => isConfigured && isTokenExpired());
  const [editingCredentials, setEditingCredentials] = useState(false);

  // Active view: list of workouts ('list') or the AI input text parser ('parser')
  const [view, setView] = useState<'list' | 'parser'>('list');
  // Selected workout for readonly detail view
  const [selectedWorkout, setSelectedWorkout] = useState<ParsedWorkout | null>(null);

  // Silent reconnection states
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Original AI upload states
  const [status, setStatus] = useState<AppStatus>('idle');
  const [parsedWorkout, setParsedWorkout] = useState<ParsedWorkout | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [inputText, setInputText] = useState('');
  const [correcting, setCorrecting] = useState(false);

  // Silent login on mount if credentials have password
  useEffect(() => {
    const attemptSilentLogin = async () => {
      if (isConfigured && credentials && isTokenExpired()) {
        if (credentials.password) {
          setIsReconnecting(true);
          try {
            const res = await fetch('/api/connect-garmin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: credentials.email, password: credentials.password }),
            });
            const data = await res.json();

            if (res.ok && data.accessToken) {
              saveCredentials({
                email: credentials.email,
                password: credentials.password,
                accessToken: data.accessToken,
                tokenExpiresAt: data.expiresAt,
              });
              setTokenExpiredOnLoad(false);
            } else {
              setTokenExpiredOnLoad(true);
            }
          } catch (err) {
            console.error('Silent login failed:', err);
            setTokenExpiredOnLoad(true);
          } finally {
            setIsReconnecting(false);
          }
        } else {
          setTokenExpiredOnLoad(true);
        }
      }
    };
    attemptSilentLogin();
  }, [isConfigured, credentials, isTokenExpired, saveCredentials]);

  const handleParse = async (text: string) => {
    setInputText(text);
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

  const handleCorrect = async (correction: string) => {
    if (!parsedWorkout) return;
    setCorrecting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/correct-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: inputText,
          currentWorkout: parsedWorkout,
          correction
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al corregir el entrenamiento.');
      setParsedWorkout(data as ParsedWorkout);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setCorrecting(false);
    }
  };

  const handleUpload = async () => {
    if (!parsedWorkout || !credentials) return;

    if (isTokenExpired()) {
      setEditingCredentials(true);
      setErrorMessage('Tu conexión con Garmin expiró. Reconectá tu cuenta para continuar.');
      return;
    }

    setStatus('uploading');
    setErrorMessage('');
    try {
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localDate = new Date(today.getTime() - (offset * 60 * 1000));
      const dateStr = localDate.toISOString().split('T')[0];

      const res = await fetch('/api/upload-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout: parsedWorkout,
          accessToken: credentials.accessToken,
          date: dateStr,
        }),
      });
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
      if (res.status === 401) {
        setStatus('error');
        setErrorMessage('Tu token de Garmin expiró. Reconectá tu cuenta desde la configuración.');
        setEditingCredentials(true);
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

  // Reconnection loader view
  if (isReconnecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: '#0F0F10' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(233,30,140,0.12)', border: '1px solid rgba(233,30,140,0.3)' }}>
          <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#E91E8C" strokeWidth="2.5" strokeDasharray="50" strokeDashoffset="20" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-center mb-1" style={{ color: '#E8E8EA' }}>
          Reconectando con Garmin Connect...
        </h2>
        <p className="text-xs text-center" style={{ color: '#666' }}>
          Iniciando sesión en tu cuenta de forma segura
        </p>
      </div>
    );
  }

  // Primera vez: sin credenciales
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

  // Token expirado al abrir la app (y falló auto-login silencioso): pedir reconexión antes de entrar
  if (tokenExpiredOnLoad && !editingCredentials) {
    return (
      <CredentialsSetup
        isFirstTime={false}
        currentEmail={credentials?.email}
        currentTokenExpiresAt={credentials?.tokenExpiresAt}
        onSave={(creds) => {
          saveCredentials(creds);
          setTokenExpiredOnLoad(false);
          // Forzar refresh de la app con el nuevo token
          window.location.reload();
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
          currentView={view}
          onViewChange={(v) => {
            setView(v);
            setSelectedWorkout(null);
            handleReset();
          }}
        />
      )}

      {editingCredentials && (
        <CredentialsSetup
          isFirstTime={false}
          currentEmail={credentials?.email}
          currentTokenExpiresAt={credentials?.tokenExpiresAt}
          onSave={(creds) => {
            saveCredentials(creds);
            setEditingCredentials(false);
            setErrorMessage('');
            setTokenExpiredOnLoad(false);
          }}
          onClose={() => setEditingCredentials(false)}
        />
      )}

      <main className="flex-1 flex flex-col items-center px-4 py-6 sm:py-10">
        {selectedWorkout ? (
          <WorkoutPreview
            workout={selectedWorkout}
            onBack={() => setSelectedWorkout(null)}
            readOnly={true}
            email={credentials?.email ?? ''}
          />
        ) : view === 'list' ? (
          <WorkoutList
            credentials={credentials!}
            onSelectWorkout={setSelectedWorkout}
            onLoadNew={() => setView('parser')}
            onTokenExpired={() => {
              setEditingCredentials(true);
              setErrorMessage('Tu conexión con Garmin expiró. Reconectá tu cuenta para continuar.');
            }}
          />
        ) : (
          /* AI Parser views */
          <div className="w-full max-w-2xl mx-auto space-y-4">

            {/* Back to list button */}
            {(status === 'idle' || status === 'error') && (
              <button
                onClick={() => setView('list')}
                className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                style={{ color: '#666' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#E8E8EA')}
                onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Volver a mis entrenamientos
              </button>
            )}

            {status === 'idle' && (
              <div className="text-center mb-6 sm:mb-10">
                <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3" style={{ color: '#E8E8EA' }}>
                  Cargá tu entrenamiento<br />
                  <span className="gradient-text">en Garmin en segundos</span>
                </h1>
              </div>
            )}

            {status === 'error' && errorMessage && (
              <div
                className="w-full mb-6 flex items-start gap-3 p-4 rounded-xl"
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
              <WorkoutInput
                onParse={handleParse}
                loading={status === 'parsing'}
                value={inputText}
                onChange={setInputText}
              />
            )}

            {(status === 'parsed' || status === 'uploading') && parsedWorkout && (
              <WorkoutPreview
                workout={parsedWorkout}
                onNameChange={(name) => setParsedWorkout((prev) => (prev ? { ...prev, name } : prev))}
                onUpload={handleUpload}
                onBack={() => setStatus('idle')}
                onCorrect={handleCorrect}
                correcting={correcting}
                uploading={status === 'uploading'}
                email={credentials?.email ?? ''}
              />
            )}

            {status === 'success' && uploadResult && (
              <SuccessScreen
                result={uploadResult}
                onReset={() => {
                  handleReset();
                  setView('list');
                }}
              />
            )}
          </div>
        )}
      </main>

      <footer
        className="py-4 px-4 sm:px-6 flex flex-col items-center sm:flex-row sm:justify-between gap-1 sm:gap-2 text-xs text-center"
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

