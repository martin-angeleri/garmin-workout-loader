import { useState, useCallback } from 'react';
import type { GarminCredentials } from '../types/workout';

const STORAGE_KEY = 'gwl_credentials';

export function useCredentials() {
  const [credentials, setCredentials] = useState<GarminCredentials | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.email && parsed?.password) return parsed as GarminCredentials;
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

  return { credentials, save, clear, isConfigured: credentials !== null };
}
