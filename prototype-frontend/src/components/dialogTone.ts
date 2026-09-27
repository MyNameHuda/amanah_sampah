import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Nada visual dialog. Dipakai bersama oleh ConfirmDialog & PromptDialog. */
export type DialogTone = 'danger' | 'warning' | 'info';

export interface DialogToneSpec {
  Icon: LucideIcon;
  /** Background bulatan ikon. */
  chipBg: string;
  /** Warna ikon. */
  iconColor: string;
  /** Class tombol submit. */
  button: string;
}

/**
 * Satu-satunya sumber kebenaran untuk mapping nada dialog.
 *
 * Sebelumnya `TONE_STYLES` (ConfirmDialog) dan `TONE_ICONS` + `TONE_BUTTON`
 * (PromptDialog) mendeklarasikan mapping 3-tone yang sama dengan nilai
 * identik di dua file. Risikonya nyata: kalau nada warning diubah di satu
 * file, file lain diam-diam jadi tidak konsisten — persis jenis bug visual
 * yang sulit noticed dan mahal dicari.
 *
 * Ketiga tone memakai komponen ikon (bukan elemen JSX) supaya bisa dipakai
 * oleh ConfirmDialog maupun PromptDialog tanpa duplicasi.
 */
export const DIALOG_TONE: Record<DialogTone, DialogToneSpec> = {
  danger: {
    Icon: AlertCircle,
    chipBg: 'bg-red-100',
    iconColor: 'text-red-600',
    button: 'btn-danger',
  },
  warning: {
    Icon: AlertTriangle,
    chipBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    button: 'btn-warning',
  },
  info: {
    Icon: Info,
    chipBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    button: 'btn-primary',
  },
};
