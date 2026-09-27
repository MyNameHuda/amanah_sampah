import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'info';
}

interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'password' | 'number';
  validate?: (value: string) => string | undefined;
  confirmText?: string;
}

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

/**
 * Hook untuk declarative confirm + prompt dialogs yang menggantikan
 * native `confirm()` dan `prompt()`.
 *
 * Usage:
 *   const { confirm, prompt, ConfirmUI } = useConfirm();
 *   if (await confirm({ title: 'Yakin?' })) { ... }
 *   const value = await prompt({ title: 'Nama?', label: 'Nama' });
 *   return <>{ConfirmUI} {/* di akhir JSX *\/}</>;
 */
export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ kind: 'confirm', opts, resolve });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({ kind: 'prompt', opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!state) return;
    // Hanya kind 'confirm' yang bisa sampai sini: PromptDialog resolve-nya lewat
    // `handlePromptConfirm` (kirim nilai), bukan boolean kosong.
    if (state.kind === 'confirm') {
      state.resolve(true);
    }
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    if (!state) return;
    if (state.kind === 'confirm') state.resolve(false);
    else state.resolve(null);
    setState(null);
  }, [state]);

  const handlePromptConfirm = useCallback((value: string) => {
    if (state?.kind === 'prompt') {
      state.resolve(value);
      setState(null);
    }
  }, [state]);

  let ConfirmUI = null;
  if (state?.kind === 'confirm') {
    ConfirmUI = (
      <ConfirmDialog
        open
        title={state.opts.title}
        description={state.opts.description}
        confirmText={state.opts.confirmText ?? 'Konfirmasi'}
        cancelText={state.opts.cancelText ?? 'Batal'}
        tone={state.opts.tone ?? 'info'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  } else if (state?.kind === 'prompt') {
    ConfirmUI = (
      <PromptDialog
        open
        title={state.opts.title}
        description={state.opts.description}
        label={state.opts.label}
        placeholder={state.opts.placeholder}
        defaultValue={state.opts.defaultValue}
        type={state.opts.type ?? 'text'}
        validate={state.opts.validate}
        confirmText={state.opts.confirmText ?? 'Konfirmasi'}
        cancelText={state.opts.cancelText ?? 'Batal'}
        tone={state.opts.tone ?? 'info'}
        onConfirm={handlePromptConfirm}
        onCancel={handleCancel}
      />
    );
  }

  return { confirm, prompt, ConfirmUI };
}
