import { useEffect, useId, useState } from 'react';
import { Gift, Save, AlertCircle, Archive, RotateCcw, Power, Package } from 'lucide-react';
import { Modal } from './Modal';
import { LoadingButton } from './LoadingButton';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import api, { type Reward } from '../api/client';

interface RewardManagerModalProps {
  open: boolean;
  /** 'create' untuk new reward, atau reward object untuk edit. */
  reward?: Reward | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  nama_reward: string;
  biaya_poin: string;
  stok: string;
  status_aktif: boolean;
}

const EMPTY_FORM: FormState = {
  nama_reward: '',
  biaya_poin: '',
  stok: '0',
  status_aktif: true,
};

type Action =
  | { kind: 'archive'; reward: Reward }
  | { kind: 'restore'; reward: Reward }
  | { kind: 'toggle'; reward: Reward }
  | null;

export function RewardManagerModal({ open, reward, onClose, onSaved }: RewardManagerModalProps) {
  const isEditing = !!reward;
  const toast = useToast();
  const formId = useId();
  const errorId = useId();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);

  useEffect(() => {
    if (!open) return;
    if (reward) {
      setForm({
        nama_reward: reward.nama_reward,
        biaya_poin: String(reward.biaya_poin),
        stok: String(reward.stok),
        status_aktif: reward.status_aktif,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [open, reward]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const biaya = parseInt(form.biaya_poin, 10);
    const stok = parseInt(form.stok, 10);
    if (!form.nama_reward.trim()) {
      setError('Nama reward wajib diisi.');
      return;
    }
    if (isNaN(biaya) || biaya < 1) {
      setError('Biaya poin harus angka ≥ 1.');
      return;
    }
    if (isNaN(stok) || stok < 0) {
      setError('Stok harus angka ≥ 0.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nama_reward: form.nama_reward.trim(),
        biaya_poin: biaya,
        stok,
        status_aktif: form.status_aktif,
      };
      if (isEditing && reward) {
        await api.patch(`/reward/${reward.id_reward}`, payload);
        toast.success(`Reward "${payload.nama_reward}" berhasil diperbarui.`);
      } else {
        await api.post('/reward', payload);
        toast.success(`Reward "${payload.nama_reward}" berhasil ditambahkan.`);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      const data = e.response?.data;
      const msg =
        data?.errors?.nama_reward?.[0] ||
        data?.errors?.biaya_poin?.[0] ||
        data?.errors?.stok?.[0] ||
        data?.message ||
        'Gagal menyimpan reward.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function performDestructive() {
    if (!action) return;
    setLoading(true);
    try {
      const { kind, reward: r } = action;
      const url = `/reward/${r.id_reward}/${kind === 'toggle' ? 'toggle-active' : kind}`;
      await api.post(url);
      const label = kind === 'archive'
        ? `Reward "${r.nama_reward}" di-archive.`
        : kind === 'restore'
          ? `Reward "${r.nama_reward}" dipulihkan.`
          : `Status aktif reward "${r.nama_reward}" diubah.`;
      toast.success(label);
      setAction(null);
      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Aksi gagal.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const footerActions = (
    <LoadingButton type="submit" form={formId} loading={loading} loadingText="Menyimpan..." variant="primary">
      <Save className="w-4 h-4" aria-hidden="true" />
      {isEditing ? 'Simpan Perubahan' : 'Tambah Reward'}
    </LoadingButton>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEditing ? 'Edit Reward' : 'Tambah Reward Baru'}
        description={isEditing
          ? 'Perbarui nama, biaya poin, atau stok reward.'
          : 'Tambahkan reward baru yang bisa ditukar oleh Santri.'}
        size="md"
        footer={footerActions}
      >
        <form id={formId} onSubmit={submit} noValidate className="space-y-4">
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 ring-1 ring-red-200/80 text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {isEditing && reward?.is_archived && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 ring-1 ring-amber-200/80 text-sm text-amber-800" role="status">
              <Archive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Reward ini di-archive. Restore terlebih dahulu untuk mengedit.</span>
            </div>
          )}

          <div>
            <label htmlFor={`${formId}-nama`} className="block text-xs font-medium text-slate-700 mb-1.5">
              Nama Reward
            </label>
            <div className="relative">
              <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
              <input
                id={`${formId}-nama`}
                type="text"
                maxLength={100}
                disabled={isEditing && !!reward?.is_archived}
                required
                value={form.nama_reward}
                onChange={(e) => setForm((f) => ({ ...f, nama_reward: e.target.value }))}
                placeholder="Contoh: Biskuit Pack"
                className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-biaya`} className="block text-xs font-medium text-slate-700 mb-1.5">
                Biaya Poin
              </label>
              <input
                id={`${formId}-biaya`}
                type="number"
                min={1}
                max={1000000}
                disabled={isEditing && !!reward?.is_archived}
                required
                value={form.biaya_poin}
                onChange={(e) => setForm((f) => ({ ...f, biaya_poin: e.target.value }))}
                placeholder="50"
                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-[10px] text-slate-400">Minimum 1 poin</p>
            </div>
            <div>
              <label htmlFor={`${formId}-stok`} className="block text-xs font-medium text-slate-700 mb-1.5">
                Stok
              </label>
              <input
                id={`${formId}-stok`}
                type="number"
                min={0}
                max={10000}
                disabled={isEditing && !!reward?.is_archived}
                required
                value={form.stok}
                onChange={(e) => setForm((f) => ({ ...f, stok: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-[10px] text-slate-400">Jumlah unit tersedia</p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={form.status_aktif}
              disabled={isEditing && !!reward?.is_archived}
              onChange={(e) => setForm((f) => ({ ...f, status_aktif: e.target.checked }))}
              className="mt-0.5 w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 disabled:cursor-not-allowed"
            />
            <div>
              <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                Aktif untuk ditukar
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Nonaktifkan untuk pause tanpa archive.</p>
            </div>
          </label>

          {/* Actions row — hanya untuk edit mode */}
          {isEditing && reward && !reward.is_archived && (
            <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAction({ kind: 'toggle', reward })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Power className="w-3.5 h-3.5" aria-hidden="true" />
                {reward.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button
                type="button"
                onClick={() => setAction({ kind: 'archive', reward })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                Archive
              </button>
            </div>
          )}

          {isEditing && reward?.is_archived && (
            <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAction({ kind: 'restore', reward })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 ring-1 ring-brand-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Restore
              </button>
              {reward.redeemed_count !== undefined && reward.redeemed_count > 0 && (
                <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" aria-hidden="true" />
                  Pernah di-redeem: {reward.redeemed_count}x
                </p>
              )}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={action !== null}
        title={
          action?.kind === 'archive' ? 'Archive Reward?' :
          action?.kind === 'restore' ? 'Restore Reward?' :
          action?.kind === 'toggle' ? 'Ubah Status Aktif?' : ''
        }
        description={
          action?.kind === 'archive'
            ? `Reward "${action.reward.nama_reward}" akan disembunyikan dari catalog Santri. Bisa di-restore nanti.`
            : action?.kind === 'restore'
            ? `Reward "${action.reward.nama_reward}" akan dikembalikan ke catalog Santri dengan status aktif.`
            : action?.kind === 'toggle'
            ? `Ubah status aktif reward "${action.reward.nama_reward}"? Santri tidak akan bisa menukar reward yang non-aktif.`
            : ''
        }
        confirmText={
          action?.kind === 'archive' ? 'Ya, Archive' :
          action?.kind === 'restore' ? 'Ya, Restore' :
          action?.kind === 'toggle' ? 'Ubah Status' : 'OK'
        }
        tone={action?.kind === 'archive' ? 'warning' : action?.kind === 'restore' ? 'info' : 'info'}
        loading={loading}
        onConfirm={performDestructive}
        onCancel={() => setAction(null)}
      />
    </>
  );
}
