import { Modal } from './Modal';
import { DIALOG_TONE, type DialogTone } from './dialogTone';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation dialog. Replaces native `confirm()` untuk UX yang
 * konsisten, accessible, dan brand-aligned.
 *
 * Warna ikon & tombol diambil dari `DIALOG_TONE` (shared dengan PromptDialog)
 * supaya nada yang sama tidak bisa berbeda visual di dua dialog.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  tone = 'info',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { Icon, chipBg, iconColor, button } = DIALOG_TONE[tone];

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`btn ${button}`}
          >
            {loading ? 'Memproses...' : confirmText}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-full ${chipBg} flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${iconColor}`} aria-hidden="true" />
        </div>
        {description && (
          <p className="text-sm text-slate-700 leading-relaxed pt-1">{description}</p>
        )}
      </div>
    </Modal>
  );
}
