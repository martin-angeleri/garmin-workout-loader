import { useState } from 'react';
import type { GarminCredentials } from '../types/workout';

interface Props {
  onSave: (creds: GarminCredentials) => void;
  onClose?: () => void;
  isFirstTime?: boolean;
  currentEmail?: string;
}

export default function CredentialsSetup({
  onSave,
  onClose,
  isFirstTime = true,
  currentEmail,
}: Props) {
  const [email, setEmail] = useState(currentEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Ingresá tu email y contraseña de Garmin Connect.');
      return;
    }
    if (!email.includes('@')) {
      setError('El email no parece válido.');
      return;
    }
    onSave({ email: email.trim(), password });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 sm:p-8"
           style={{ background: '#1A1A1C', border: '1px solid #2E2E30' }}>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
               style={{ background: 'rgba(255,105,0,0.12)', border: '1px solid rgba(255,105,0,0.3)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                    fill="#FF6900"/>
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-1" style={{ color: '#E8E8EA' }}>
          {isFirstTime ? 'Conectá tu cuenta Garmin' : 'Actualizar cuenta Garmin'}
        </h2>
        <p className="text-sm text-center mb-6" style={{ color: '#888' }}>
          {isFirstTime
            ? 'Tus credenciales se guardan solo en este dispositivo y se envían de forma segura.'
            : `Cuenta actual: ${currentEmail}`}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#AAAAAA' }}>
              Email de Garmin Connect
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="tu@email.com"
              className="w-full px-4 py-3 rounded-xl text-sm transition-colors"
              style={{
                background: '#0F0F10',
                border: '1px solid #2E2E30',
                color: '#E8E8EA',
              }}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#AAAAAA' }}>
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm transition-colors pr-12"
                style={{
                  background: '#0F0F10',
                  border: '1px solid #2E2E30',
                  color: '#E8E8EA',
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: '#666' }}
              >
                {showPass
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(255,59,48,0.1)', color: '#FF3B30' }}>
              {error}
            </p>
          )}

          {/* Security notice */}
          <div className="flex items-start gap-2 rounded-lg p-3"
               style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.15)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0" style={{ color: '#C8FF00' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: '#89A800' }}>
              Tus credenciales se guardan solo en tu navegador (localStorage) y se envían cifradas por HTTPS. No se almacenan en ningún servidor.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            {!isFirstTime && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: '#2A2A2C', color: '#AAAAAA' }}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ background: '#FF6900', color: '#fff' }}
            >
              {isFirstTime ? 'Guardar y continuar' : 'Actualizar cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
