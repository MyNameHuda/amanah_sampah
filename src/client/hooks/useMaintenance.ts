import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

interface AppStatus {
  is_maintenance: boolean;
  is_readonly: boolean;
  app_version: string;
  checked_at: string;
}

const POLL_INTERVAL_MS = 30_000; // 30 detik

/**
 * Poll /api/status setiap 30 detik untuk detect maintenance mode.
 * Bisa dipanggil berkali-kali di multiple components, semua share state via cache.
 */
let cached: { status: AppStatus; fetchedAt: number } | null = null;
let inflight: Promise<AppStatus> | null = null;
const subscribers = new Set<(s: AppStatus) => void>();

async function fetchStatus(force = false): Promise<AppStatus> {
  if (!force && cached && Date.now() - cached.fetchedAt < POLL_INTERVAL_MS) {
    return cached.status;
  }
  if (inflight) return inflight;

  inflight = api.get<AppStatus>('/status')
    .then((r) => {
      cached = { status: r.data, fetchedAt: Date.now() };
      inflight = null;
      return r.data;
    })
    .catch((e) => {
      inflight = null;
      // Default ke safe state jika endpoint error
      const fallback: AppStatus = {
        is_maintenance: false,
        is_readonly: false,
        app_version: 'unknown',
        checked_at: new Date().toISOString(),
      };
      cached = { status: fallback, fetchedAt: Date.now() };
      return fallback;
    });

  const status = await inflight;
  subscribers.forEach((cb) => cb(status));
  return status;
}

/** Hook untuk access maintenance status (re-renders on change). */
export function useMaintenance() {
  const [status, setStatus] = useState<AppStatus>(() => cached?.status ?? {
    is_maintenance: false,
    is_readonly: false,
    app_version: 'loading',
    checked_at: '',
  });

  const refresh = useCallback(() => { fetchStatus(true).then(setStatus); }, []);

  useEffect(() => {
    // Fetch on mount (if no cache)
    if (!cached || Date.now() - cached.fetchedAt > POLL_INTERVAL_MS) {
      fetchStatus().then(setStatus);
    } else {
      setStatus(cached.status);
    }

    // Subscribe to updates
    const cb = (s: AppStatus) => setStatus(s);
    subscribers.add(cb);

    // Poll every interval
    const interval = setInterval(() => fetchStatus(true).then(setStatus), POLL_INTERVAL_MS);

    return () => {
      subscribers.delete(cb);
      clearInterval(interval);
    };
  }, []);

  return { ...status, refresh };
}
