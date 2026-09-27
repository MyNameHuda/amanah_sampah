import { type ReactNode, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When true, modal cannot be dismissed via backdrop click or Escape. */
  persistent?: boolean;
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Returns all focusable elements inside `container`.
 */
function getFocusable(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', persistent = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Focus management + body scroll lock
  useEffect(() => {
    if (!open) return;

    // Save previously focused element so we can restore on close
    previousActiveRef.current = (document.activeElement as HTMLElement) ?? null;

    // Lock body scroll (prevent background from scrolling while modal open)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog on next tick (after content rendered)
    const t = window.setTimeout(() => {
      if (dialogRef.current) {
        const focusables = getFocusable(dialogRef.current);
        (focusables[0] ?? dialogRef.current).focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever was focused before
      previousActiveRef.current?.focus?.();
    };
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open || persistent) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, persistent]);

  // Focus trap: keep Tab navigation inside the dialog
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = getFocusable(dialogRef.current);
    if (focusables.length === 0) {
      e.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !dialogRef.current.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={() => { if (!persistent) onClose(); }}
    >
      <div className="min-h-full grid place-items-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={`bg-white rounded-xl shadow-2xl w-full ${SIZE_CLASSES[size]} my-8 flex flex-col max-h-[calc(100vh-4rem)] animate-slide-up focus:outline-none`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-6 py-4 border-b shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              <h3 id={titleId} className="text-lg font-semibold text-slate-800">{title}</h3>
              {description && <p id={descId} className="text-sm text-slate-500 mt-1">{description}</p>}
            </div>
            {!persistent && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup dialog"
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded p-1 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>

          {footer && (
            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-xl flex flex-wrap gap-2 justify-end shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
