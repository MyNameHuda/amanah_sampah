import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  /** Tick when the auto-dismiss timer should resume (ms). */
  expiresAt: number;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Use ref so timers can be cancelled on unmount (prevent "setState on unmounted" warning)
  const timersRef = useRef<Map<number, number>>(new Map());
  const pausedRef = useRef(false);

  const clearTimer = useCallback((id: number) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const remove = useCallback((id: number) => {
    clearTimer(id);
    setItems((arr) => arr.filter((t) => t.id !== id));
  }, [clearTimer]);

  const scheduleRemoval = useCallback((id: number, expiresAt: number) => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      remove(id);
      return;
    }
    const handle = window.setTimeout(() => remove(id), remaining);
    timersRef.current.set(id, handle);
  }, [remove]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((h) => window.clearTimeout(h));
      timers.clear();
    };
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = DEFAULT_DURATION) => {
    const id = Date.now() + Math.random();
    const expiresAt = Date.now() + durationMs;
    setItems((arr) => [...arr, { id, type, message, expiresAt }]);
    scheduleRemoval(id, expiresAt);
  }, [scheduleRemoval]);

  // Pause-on-hover: when user hovers a toast, push expiry forward.
  const handleMouseEnter = useCallback((id: number) => {
    clearTimer(id);
  }, [clearTimer]);

  const handleMouseLeave = useCallback((id: number) => {
    if (pausedRef.current) return;
    setItems((arr) => {
      const t = arr.find((x) => x.id === id);
      if (t) scheduleRemoval(id, t.expiresAt);
      return arr;
    });
  }, [scheduleRemoval]);

  const value: ToastContextValue = {
    show,
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d),
    info: (m, d) => show(m, 'info', d),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => handleMouseEnter(t.id)}
            onMouseLeave={() => handleMouseLeave(t.id)}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-md animate-[slide-in_0.2s_ease-out] ${
              t.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : t.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="shrink-0 mt-0.5" aria-hidden="true">
              {t.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
               t.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
               <Info className="w-5 h-5" />}
            </div>
            <p className="text-sm flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
