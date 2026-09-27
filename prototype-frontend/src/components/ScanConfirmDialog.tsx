import { useEffect, useId, useState } from 'react';
import { Modal } from './Modal';
import { LoadingButton } from './LoadingButton';
import { Package, AlertCircle, Hash, Sparkles } from 'lucide-react';

export interface ScanConfirmDialogProps {
  open: boolean;
  /** Barcode hasil scan atau input manual yang sudah divalidasi exist di catalog. */
  barcode: string;
  /** Product metadata (nama_produk, image_url) untuk preview. Optional — bisa null jika lookup gagal. */
  nama_produk?: string | null;
  image_url?: string | null;
  /** Default quantity — biasanya dari open debt atau 1. */
  defaultQty: number;
  /** Maximum quantity yang boleh diinput (biasanya = open debt qty, atau Infinity). */
  maxQty: number;
  /** Optional helper text. */
  hint?: string;
  loading?: boolean;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
}

/**
 * Modal konfirmasi yang muncul setelah Petugas scan barcode.
 *
 * Flow:
 *  1. Petugas scan -> barcode tervalidasi exist di katalog
 *  2. Modal ini muncul dengan preview produk + input quantity (default = open debt qty)
 *  3. Petugas adjust quantity, klik "Tambah" -> addItemWithBarcode(qty) dipanggil
 *  4. Modal close, scanner auto-reopen untuk item berikutnya (jika masih ada open debt)
 *
 * Use case alternatif: Petugas bisa add quantity besar (mis. setor 5 botol sekaligus)
 * tanpa harus scan 5x. Default qty = open debt = qty yang masih kurang.
 */
export function ScanConfirmDialog({
  open,
  barcode,
  nama_produk,
  image_url,
  defaultQty,
  maxQty,
  hint,
  loading,
  onConfirm,
  onCancel,
}: ScanConfirmDialogProps) {
  const [qty, setQty] = useState(String(defaultQty));
  const [error, setError] = useState<string | null>(null);
  const qtyId = useId();
  const errorId = useId();

  // Reset qty setiap kali modal dibuka dengan defaultQty baru
  useEffect(() => {
    if (open) {
      setQty(String(defaultQty));
      setError(null);
    }
  }, [open, defaultQty]);

  function handleConfirm() {
    setError(null);
    const trimmed = qty.trim();
    const n = Number(trimmed);

    if (trimmed === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
      setError('Quantity harus angka bulat.');
      return;
    }
    if (n < 1) {
      setError('Quantity minimal 1.');
      return;
    }
    if (maxQty !== Infinity && n > maxQty) {
      setError(`Quantity maksimal ${maxQty} (sesuai hutang terbuka).`);
      return;
    }
    onConfirm(n);
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Konfirmasi Penyetoran"
      description="Barcode tervalidasi. Tentukan jumlah unit yang di-setor."
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn btn-secondary"
          >
            Batal
          </button>
          <LoadingButton
            type="button"
            onClick={handleConfirm}
            loading={loading}
            loadingText="Menambahkan..."
            variant="primary"
          >
            Tambah ke Sesi
          </LoadingButton>
        </>
      }
    >
      <div className="flex items-start gap-3 mb-4">
        {/* Product image / placeholder */}
        <div className="shrink-0 w-14 h-14 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden">
          {image_url ? (
            <img src={image_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <Package className="w-7 h-7 text-slate-400" aria-hidden="true" />
          )}
        </div>

        {/* Product info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">
            {nama_produk ?? barcode}
          </p>
          {nama_produk && (
            <p className="text-xs text-slate-500 font-mono truncate">{barcode}</p>
          )}
          {hint && (
            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />
              {hint}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={qtyId} className="block text-xs font-medium text-slate-700 mb-1.5">
          Quantity yang di-setor
        </label>
        <div className="relative">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            id={qtyId}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQty === Infinity ? undefined : maxQty}
            step={1}
            autoFocus
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={!!error || undefined}
            className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        {maxQty !== Infinity && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Maksimal {maxQty} unit (sesuai hutang terbuka). Default: {defaultQty}.
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
