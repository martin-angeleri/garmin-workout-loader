import { useState, useCallback } from 'react';
import type { GarminCredentials } from '../types/workout';

const STORAGE_KEY = 'gwl_credentials';

export function useCredentials() {
  const [credentials, setCredentials] = useState<GarminCredentials | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Soporta el formato nuevo (accessToken) — descarta el viejo (password)
      if (parsed?.email && parsed?.accessToken) return parsed as GarminCredentials;
      return null;
    } catch {
      return null;
    }
  });

  const save = useCallback((creds: GarminCredentials) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    setCredentials(creds);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCredentials(null);
  }, []);

  const isTokenExpired = useCallback(() => {
    if (!credentials) return true;
    // Considerar expirado si quedan menos de 7 días
    return credentials.tokenExpiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000;
  }, [credentials]);

  return { credentials, save, clear, isConfigured: credentials !== null, isTokenExpired };
}
