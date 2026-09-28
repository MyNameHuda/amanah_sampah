import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from './Modal';
import { LoadingButton } from './LoadingButton';
import { KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { DIALOG_TONE, type DialogTone } from './dialogTone';

export type PromptType = 'text' | 'password' | 'number';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Input label shown above the input field. */
  label?: string;
  placeholder?: string;
  type?: PromptType;
  defaultValue?: string;
  /** Required validation. Returns error string or undefined. */
  validate?: (value: string) => string | undefined;
  /** Submit button label. Default: "Konfirmasi". */
  confirmText?: string;
  cancelText?: string;
  /** Visual tone — affects icon + submit button color. */
  tone?: DialogTone;
  loading?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * Replaces native `prompt()` dengan accessible, branded modal.
 * - Auto-focus ke input field
 * - Enter untuk submit
 * - Validation built-in via `validate` prop
 * - Show/hide password toggle jika type=password
 */
export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  type = 'text',
  defaultValue = '',
  validate,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  tone = 'info',
  loading = false,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  // Reset state when opened/closed
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
      setShowPassword(false);
    }
  }, [open, defaultValue]);

  // Auto-focus input saat modal open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleConfirm() {
    if (!value.trim() && type !== 'number') {
      setError('Input wajib diisi.');
      inputRef.current?.focus();
      return;
    }
    if (validate) {
      const err = validate(value);
      if (err) {
        setError(err);
        inputRef.current?.focus();
        return;
      }
    }
    onConfirm(value);
  }

  const { Icon, chipBg, iconColor, button } = DIALOG_TONE[tone];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={loading} className="btn btn-secondary">
            {cancelText}
          </button>
          <LoadingButton type="button" onClick={handleConfirm} loading={loading} variant="primary" className={button}>
            {confirmText}
          </LoadingButton>
        </>
      }
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={`shrink-0 w-10 h-10 rounded-full ${chipBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} aria-hidden="true" />
        </div>
        {description && <p className="text-sm text-slate-700 leading-relaxed pt-1 flex-1">{description}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirm();
        }}
      >
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}

        <div className="relative">
          {type === 'password' && (
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            id={inputId}
            type={type === 'password' && showPassword ? 'text' : type}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder={placeholder}
            autoComplete={type === 'password' ? 'new-password' : 'off'}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error || undefined}
            className={`w-full ${type === 'password' ? 'pl-10 pr-10' : 'px-3'} py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none`}
          />
          {type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Modal>
  );
}
