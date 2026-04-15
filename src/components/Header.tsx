import { useState } from 'react';

interface Props {
  email: string;
  onChangeAccount: () => void;
}

export default function Header({ email, onChangeAccount }: Props) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid #1E1E20' }}>

      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #B8006C 0%, #E91E8C 100%)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-base font-bold leading-none" style={{ color: '#E8E8EA' }}>
            Garmin <span className="gradient-text">Workout</span> Loader
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#555' }}>
            by Martín Angeleri
          </p>
        </div>
      </div>

      {/* Account indicator */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-sm"
          style={{ background: '#1A1A1C', border: '1px solid #2E2E30', color: '#AAAAAA' }}
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
               style={{ background: 'rgba(233,30,140,0.2)', color: '#E91E8C' }}>
            {email.charAt(0).toUpperCase()}
          </div>
          <span className="hidden sm:block max-w-[160px] truncate">{email}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
               style={{ transform: showMenu ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 z-20 rounded-xl py-1 w-52"
                 style={{ background: '#1E1E20', border: '1px solid #2E2E30', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div className="px-4 py-2 border-b" style={{ borderColor: '#2E2E30' }}>
                <p className="text-xs" style={{ color: '#666' }}>Cuenta conectada</p>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: '#E8E8EA' }}>{email}</p>
              </div>
              <button
                onClick={() => { setShowMenu(false); onChangeAccount(); }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
                style={{ color: '#AAAAAA' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FF6900')}
                onMouseLeave={e => (e.currentTarget.style.color = '#AAAAAA')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Cambiar cuenta
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
