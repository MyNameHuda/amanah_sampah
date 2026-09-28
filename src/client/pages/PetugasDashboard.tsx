import { lazy, Suspense, useEffect, useState } from 'react';
import axios from 'axios';
import api, { type Produk } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge, PoinBadge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { ScanConfirmDialog } from '../components/ScanConfirmDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Heavy modal — lazy-load on first open.
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then(m => ({ default: m.BarcodeScanner })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
import { User, Package, Plus, Trash2, CheckCircle2, ScanLine, Loader2, Lock, AlertTriangle, PlayCircle, Camera, Image as ImageIcon, Eye, X, Check, RefreshCw } from 'lucide-react';

interface OpenDebt { barcode: string; nama_produk: string; qty: number; oldest: string; }
interface SesiItem {
  id: number;
  barcode: string;
  qty_in: number;
  qty_matched: number;
  qty_shortfall: number;
  poin_delta: number;
  qty_open_at_time: number;
  qty_excess: number;
  /** Path relatif di disk, mis. barcode-evidence/2026-09/abc.jpg */
  foto_bukti_path?: string | null;
  /** URL absolut siap pakai — dikirim backend, TIDAK disusun di frontend. */
  foto_bukti_url?: string | null;
  nama_produk?: string | null;
  catatan?: string | null;
}
/** Sesi verifikasi yang belum di-commit (dari GET /verifikasi/sesi-terbuka). */
interface SesiTerbuka {
  id: number;
  nis: string;
  nama_siswa: string | null;
  kelas_siswa: string | null;
  petugas_id: number;
  nama_petugas: string | null;
  /** true = milik petugas yang sedang login. */
  is_mine: boolean;
  waktu_mulai: string;
  items_count: number;
  /** Poin yang sudah diinput tapi belum masuk saldo. */
  poin_belum_tercatat: number;
  last_activity_at: string;
  idle_menit: number;
  is_idle: boolean;
}

interface SesiVerifikasi {
  id: number;
  nis: string;
  waktu_mulai: string;
  waktu_selesai: string | null;
  total_poin_change: number;
  items: SesiItem[];
}

export default function PetugasDashboard() {
  const toast = useToast();
  const [nisInput, setNisInput] = useState('');
  const [sesi, setSesi] = useState<SesiVerifikasi | null>(null);
  const [openDebts, setOpenDebts] = useState<OpenDebt[]>([]);
  const [santriInfo, setSantriInfo] = useState<{ nama: string; current_poin: number; is_blocked: boolean } | null>(null);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [itemBarcode, setItemBarcode] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [opening, setOpening] = useState(false);
  const [committing, setCommitting] = useState(false);

  /**
   * [F-feat] Setelah scan barcode valid, tampilkan dialog konfirmasi quantity.
   * User bisa adjust qty sebelum submit. Default = open debt qty (kalau ada) atau 1.
   */
  const [pendingScan, setPendingScan] = useState<{
    barcode: string;
    nama_produk: string | null;
    image_url: string | null;
    defaultQty: number;
    maxQty: number;
  } | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  // Pesan penolakan karena akun siswa suspended — ditampilkan sebagai alert
  // yang menetap di form buka sesi, bukan toast yang hilang sendiri.
  const [suspendBlocked, setSuspendBlocked] = useState<string | null>(null);

  // --- Mode barcode rusak -------------------------------------------------
  // xmm77 punya barcode yang rusak/ntoo-ilang. Petugas tetap bisa mencatat
  // pembuangannya dengan mengetik barcode secara manual + melampirkan foto
  // barcode yang rusak sebagai bukti. Backend sudah mendukung ini
  // (`foto_bukti` + `catatan` di SesiVerifikasiItem) tapi belum ada UI-nya.
  const [modeBarcodeRusak, setModeBarcodeRusak] = useState(false);
  const [fotoBukti, setFotoBukti] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [catatan, setCatatan] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Item yang fotonya sedang dibuka di modal preview.
  const [previewFoto, setPreviewFoto] = useState<SesiItem | null>(null);

  // --- Notifikasi sesi menggantung --------------------------------------
  // Sesi yang belum di-commit MENGGANTUNG kalau petugas pergi / HP-nya
  // jatuh / browser ke-close. Dan ini bukan sekadar "data belum rapi":
  // sesi terbuka memblokir opening sesi baru untuk siswa yang sama, jadi
  // siswa itu terkunci sampai sesi ini diselesaikan atau dibatalkan.
  const [sesiTerbuka, setSesiTerbuka] = useState<SesiTerbuka[]>([]);
  const [resuming, setResuming] = useState<number | null>(null);
  // Dialog konfirmasi untuk pembatalan sesi. Pakai ConfirmDialog yang sudah
  // ada, bukan confirm() native, supaya konsisten dengan aksi destruktif lain.
  const [cancelTarget, setCancelTarget] = useState<SesiTerbuka | null>(null);

  const sesiMilikSaya = sesiTerbuka.filter((s) => s.is_mine);
  const sesiMilikLain = sesiTerbuka.filter((s) => !s.is_mine);

  async function loadSesiTerbuka() {
    try {
      const r = await api.get('/verifikasi/sesi-terbuka');
      setSesiTerbuka(r.data.data || []);
    } catch {
      // Notifikasi saja — jangan sampai gagal load membuat seluruh
      // halaman error. Ini informasi tambahan, bukan fungsi inti.
    }
  }

  /** Lanjutkan sesi yang terputus: pulihkan items, open debts, dan data siswa. */
  async function lanjutkanSesi(id: number) {
    setResuming(id);
    try {
      const r = await api.get(`/verifikasi/sesi/${id}`);
      setSesi({ ...r.data.sesi, items: r.data.sesi.items || [] });
      setOpenDebts(r.data.open_debts || []);
      setSantriInfo(r.data.santri);
      setNisInput(r.data.sesi.nis);
      toast.success('Sesi dilanjutkan. Lanjutkan verifikasi dari titik kamu berhenti.');
      loadSesiTerbuka();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal melanjutkan sesi.');
    } finally {
      setResuming(null);
    }
  }

  async function batalkanSesi(s: SesiTerbuka) {
    setCancelTarget(s);
  }

  async function konfirmasiBatalkan() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    try {
      await api.post(`/verifikasi/sesi/${id}/cancel`);
      toast.success('Sesi dibatalkan.');
      if (sesi?.id === id) resetSession();
      loadSesiTerbuka();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal membatalkan sesi.');
    }
  }

  const MAX_FOTO_BYTES = 5 * 1024 * 1024;
  const FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  /** Validasi sisi klien untuk umpan balik instan. Backend memvalidasi ulang. */
  function pilihFoto(f: File | null) {
    setUploadError(null);
    if (!f) {
      setFotoBukti(null);
      setFotoPreview(null);
      return;
    }
    if (!FOTO_TYPES.includes(f.type)) {
      setUploadError('Format harus JPG, PNG, atau WebP.');
      return;
    }
    if (f.size > MAX_FOTO_BYTES) {
      setUploadError(`Ukuran maksimal 5 MB (file kamu ${(f.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    setFotoBukti(f);
    setFotoPreview(URL.createObjectURL(f));
  }

  function resetModeRusak() {
    setModeBarcodeRusak(false);
    setFotoBukti(null);
    setFotoPreview(null);
    setCatatan('');
    setUploadError(null);
  }

  useEffect(() => {
    api.get('/produk').then((r) => setProdukList(r.data.data)).catch(() => {});
    loadSesiTerbuka();
  }, []);

  async function openSesi() {
    if (!nisInput) return;
    setOpening(true);
    setSuspendBlocked(null);
    try {
      const r = await api.post('/verifikasi/sesi', { nis: nisInput });
      setSesi({ ...r.data.sesi, items: [] });
      setOpenDebts(r.data.open_debts);
      setSantriInfo(r.data.santri);
      toast.success(`Sesi dibuka untuk ${r.data.santri.nama}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Gagal buka sesi.';
      // Deteksi penolakan karena akun siswa suspended (422 dari
      // VerifikasiController). Simpan state-nya supaya form menampilkan
      // alert yang menetap + tombol tetap mati, bukan cuma toast yang
      // hilang dalam 4 detik.
      const nisMsg: string = err.response?.data?.errors?.nis?.[0] ?? '';
      if (/di-suspend/i.test(nisMsg)) {
        setSuspendBlocked(nisMsg);
      } else {
        toast.error(msg);
      }
    } finally {
      setOpening(false);
    }
  }

  /**
   * Tambah satu item ke sesi verifikasi.
   *
   * Dipakai oleh tiga jalur: form manual (`itemBarcode` + `itemQty`), jalur
   * "barcode rusak" (tambah foto bukti), dan ScanConfirmDialog (barcode dari
   * kamera + qty hasil konfirmasi). Ketiganya sengaja memakai satu function
   * supaya update state & penghitungan open debt tidak bisa berbeda antar jalur.
   *
   * `fotoBukti` TIDAK lagi dikirim sebagai multipart. Batas payload Vercel
   * hanya 4,5 MB, sedangkan foto di lapangan bisa 5 MB — kalau dipaksakan
   * lewat request ke Vercel, yang gagal adalah request-nya dan petugas
   * kehilangan catatannya. Jadi fotonya di-upload langsung ke Supabase
   * memakai presigned URL, lalu yang dikirim ke backend hanya path-nya.
   * `foto_bukti_url` tetap disusun di server supaya tidak ikut rusak saat
   * pindah hosting.
   */
  async function uploadFotoBukti(file: File): Promise<string> {
    const presign = await api.post('/verifikasi/foto-bukti/presign', {
      content_type: file.type,
      size: file.size,
    });

    // PENTING: pakai axios biasa, BUKAN instance `api`. Instance itu
    // menyuntik header Authorization, dan S3 menolak presigned URL kalau
    // ada dua mekanisme autentikasi ("Only one auth mechanism allowed").
    await axios.put(presign.data.upload_url, file, {
      headers: { 'Content-Type': file.type },
      transformRequest: [(d) => d],
    });

    return presign.data.path as string;
  }

  async function addItem(
    barcode: string,
    qty: number,
    opts?: { fromScanner?: boolean; fotoBukti?: File | null; catatan?: string }
  ) {
    if (!sesi || !barcode) {
      toast.error('Barcode wajib diisi.');
      return;
    }
    try {
      let fotoPath: string | undefined;
      if (opts?.fotoBukti) {
        fotoPath = await uploadFotoBukti(opts.fotoBukti);
      }

      const payload: Record<string, unknown> = { barcode, qty_in: qty };
      if (opts?.catatan) payload.catatan = opts.catatan;
      if (fotoPath) payload.foto_bukti_path = fotoPath;

      const r = await api.post(`/verifikasi/sesi/${sesi.id}/items`, payload);
      return applyAddedItem(r.data.item, opts);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.qty_in?.[0] ||
        err.response?.data?.barcode?.[0] ||
        err.response?.data?.catatan?.[0] ||
        err.response?.data?.size?.[0] ||
        'Gagal add item.';
      toast.error(msg);
    }
  }

  /** Efek samping yang sama untuk kedua jalur (JSON & multipart). */
  function applyAddedItem(newItem: SesiItem, opts?: { fromScanner?: boolean }) {
    setSesi((prev) => (prev ? { ...prev, items: [...prev.items, newItem] } : prev));
    const updatedOpen = openDebts
      .map((d) =>
        d.barcode === newItem.barcode
          ? { ...d, qty: Math.max(0, d.qty - newItem.qty_matched) }
          : d
      )
      .filter((d) => d.qty > 0);
    setOpenDebts(updatedOpen);
    setItemBarcode('');
    setItemQty(1);
    setFotoBukti(null);
    setFotoPreview(null);
    setCatatan('');
    toast.success(
      opts?.fromScanner
        ? `Scanned: ${newItem.barcode} (matched ${newItem.qty_matched}, +${newItem.poin_delta} poin)`
        : `${newItem.barcode}: matched=${newItem.qty_matched} shortfall=${newItem.qty_shortfall} poin +${newItem.poin_delta}`
    );
  }

  /** Handler form manual. Validasi input terpisah supaya pesan errornya
   *  spesifik ("wajib diisi") dan tidak muncul untuk jalur scanner. */
  function submitManualItem() {
    if (!itemBarcode) {
      toast.error('Barcode wajib diisi.');
      return;
    }
    return addItem(itemBarcode, itemQty);
  }

  /**
   * Handler jalur barcode rusak: barcode diketik manual + foto bukti.
   *
   * Foto WAJIB ada di mode ini. Kalau opsional, petugas akan tergoda
   * menambah item tanpa bukti lalu foto diunggah belakangan (atau tidak
   * pernah), dan justru kondisi yang paling butuh bukti-lah yang jadi paling
   * sering tanpa bukti.
   */
  function submitItemRusak() {
    if (!itemBarcode) {
      toast.error('Barcode produk wajib diisi manual.');
      return;
    }
    if (!fotoBukti) {
      setUploadError('Foto barcode rusak wajib dilampirkan.');
      return;
    }
    setAddingItem(true);
    addItem(itemBarcode, itemQty, { fotoBukti, catatan: catatan.trim() || undefined })
      .finally(() => setAddingItem(false));
  }

  /**
   * Scanner callback: tampilkan dialog konfirmasi quantity, bukan auto-add.
   * - Validasi barcode exist di katalog dulu (GET /produk/scan)
   * - Kalau valid, lookup product metadata (nama_produk, image_url)
   * - Buka ScanConfirmDialog dengan defaultQty = open debt qty (kalau ada)
   */
  async function onScannerDetected(barcode: string, _format: string) {
    setItemBarcode(barcode);
    try {
      // Validasi exist + ambil product metadata
      const lookupRes = await api.get(`/produk/scan/${encodeURIComponent(barcode)}`);
      const produk = lookupRes.data?.produk;
      // Cari open debt untuk barcode ini -> default qty = sisa hutang
      const debt = openDebts.find((d) => d.barcode === barcode);
      const remainingDebt = debt?.qty ?? 0;
      setPendingScan({
        barcode,
        nama_produk: produk?.nama_produk ?? null,
        image_url: produk?.image_url ?? null,
        defaultQty: remainingDebt > 0 ? remainingDebt : 1,
        maxQty: remainingDebt > 0 ? remainingDebt : 9999, // cap ke debt kalau ada
      });
      // Tutup scanner modal (sudah tidak perlu) — user fokus di dialog quantity
      setShowScanner(false);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        toast.error(`Barcode '${barcode}' tidak ada di katalog. Coba lagi atau input manual.`);
        // Keep scanner open
      } else {
        toast.error('Gagal lookup barcode: ' + (err.message || 'network error'));
      }
    }
  }

  /**
   * Confirm dari ScanConfirmDialog -> add item dengan qty hasil konfirmasi.
   */
  async function confirmScannedItem(qty: number) {
    if (!pendingScan) return;
    setAddingItem(true);
    try {
      await addItem(pendingScan.barcode, qty, { fromScanner: true });
      setPendingScan(null);
    } catch {
      // toast sudah di-show oleh addItem
    } finally {
      setAddingItem(false);
    }
  }

  async function commit() {
    if (!sesi) return;
    setCommitting(true);
    try {
      const r = await api.post(`/verifikasi/sesi/${sesi.id}/commit`);
      setSesi({ ...sesi, waktu_selesai: r.data.sesi.waktu_selesai, total_poin_change: r.data.saldo_change });
      setSantriInfo((prev) => prev ? { ...prev, current_poin: r.data.santri.current_poin, is_blocked: r.data.santri.is_blocked } : prev);
      toast.success(
        ` Commit OK! Saldo change: ${r.data.saldo_change > 0 ? '+' : ''}${r.data.saldo_change}. Poin: ${r.data.santri.current_poin}`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal commit.');
    } finally {
      setCommitting(false);
    }
  }

  function resetSession() {
    setSesi(null); setOpenDebts([]); setSantriInfo(null); setNisInput(''); setItemBarcode(''); setItemQty(1);
  }

  const totalItemsPoin = sesi?.items.reduce((sum, i) => sum + i.poin_delta, 0) ?? 0;
  const totalQtyMatched = sesi?.items.reduce((sum, i) => sum + i.qty_matched, 0) ?? 0;
  const totalQtyShortfall = sesi?.items.reduce((sum, i) => sum + i.qty_shortfall, 0) ?? 0;
  const isOpen = !!sesi && !sesi.waktu_selesai;

  return (
    <Layout
      title="Petugas | Verifikasi Pembuangan"
      titleShort="Verifikasi"
      subtitle={sesi ? `Sesi #${sesi.id}` : 'Open new sesi'}
      actions={sesi && <button onClick={resetSession} className="btn btn-ghost text-sm">Sesi Baru</button>}
    >
      {!sesi ? (
        <div className="max-w-md mx-auto">
          <div className="card card-hover">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-violet-100 text-violet-700 rounded-lg flex items-center justify-center">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Buka Sesi Verifikasi</h3>
                <p className="text-xs text-slate-500">Mulai proses pembuangan sampah siswa</p>
              </div>
            </div>
            <div className="relative mb-3">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="input pl-10"
                value={nisInput}
                onChange={(e) => { setNisInput(e.target.value); setSuspendBlocked(null); }}
                onKeyDown={(e) => e.key === 'Enter' && openSesi()}
                placeholder="NIS siswa (e.g. 23001)"
                aria-invalid={!!suspendBlocked || undefined}
                autoFocus
              />
            </div>

            {suspendBlocked && (
              <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{suspendBlocked}</span>
              </div>
            )}

            <button onClick={openSesi} disabled={!nisInput || opening} className="btn btn-primary w-full">
              {opening ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Membuka sesi...</>
              ) : (
                <><PlayCircle className="w-4 h-4" />Buka Sesi</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* --- Notifikasi sesi menggantung ---------------------------
              Muncul hanya kalau ada sesi yang belum di-commit. Sesi
              milik sendiri ditampilkan duluan karena itu satu-satunya yang
              bisa langsung diperbaiki oleh petugas yang sedang login. */}
          {sesiTerbuka.length > 0 && (
            <div className="mb-4 space-y-2">
              {[...sesiMilikSaya, ...sesiMilikLain].map((s) => (
                <div
                  key={s.id}
                  role="alert"
                  className={`rounded-lg border p-3 animate-slide-up ${
                    s.is_idle && s.is_mine
                      ? 'border-red-200 bg-red-50'
                      : s.is_mine
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        s.is_idle && s.is_mine ? 'text-red-600' : s.is_mine ? 'text-amber-600' : 'text-blue-600'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${
                        s.is_idle && s.is_mine ? 'text-red-900' : s.is_mine ? 'text-amber-900' : 'text-blue-900'
                      }`}>
                        Sesi #{s.id} belum diselesaikan
                        {!s.is_mine && s.nama_petugas && ` — dipegang ${s.nama_petugas}`}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        s.is_idle && s.is_mine ? 'text-red-800' : s.is_mine ? 'text-amber-800' : 'text-blue-800'
                      }`}>
                        {s.nama_siswa ?? s.nis} ({s.nis}) | {s.items_count} item
                        {s.poin_belum_tercatat > 0 && ` | +${s.poin_belum_tercatat} poin belum tercatat`}
                        {' | '}terakhir aktif {s.idle_menit} menit lalu
                      </p>

                      {s.is_mine ? (
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => lanjutkanSesi(s.id)}
                            disabled={resuming === s.id}
                            className="btn btn-primary text-xs"
                          >
                            {resuming === s.id ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Memuat...</>
                            ) : (
                              <><RefreshCw className="w-3.5 h-3.5" />Lanjutkan</>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => batalkanSesi(s)}
                            className="btn btn-secondary text-xs"
                          >
                            <X className="w-3.5 h-3.5" />Batalkan
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] mt-1.5 text-blue-700">
                          Sesi ini memblokir verifikasi siswa {s.nis}. Minta {s.nama_petugas ?? 'petugas yang memegang sesi'} menyelesaikan atau membatalkannya.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ID sesi disembunyikan dari header <sm, jadi tampilkan lagi sebagai
              chip — petugas butuh tahu sesi mana yang sedang dikerjakan kalau
              buka banyak sesi bergantian. */}
          {sesi && (
            <p className="sm:hidden text-xs text-slate-500 mb-3">
              Sesi aktif <span className="font-semibold text-slate-700">#{sesi.id}</span> | {sesi.nis}
            </p>
          )}
          {/* Siswa info bar */}
          {santriInfo && (
            <div className={`mb-4 p-4 rounded-lg border-l-4 ${santriInfo.is_blocked ? 'border-red-500 bg-red-50' : 'border-brand-500 bg-brand-50'} animate-slide-up`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Siswa</p>
                  <p className="font-semibold text-slate-800 truncate">{santriInfo.nama} | {sesi.nis}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {santriInfo.is_blocked && <Badge tone="red" icon={<AlertTriangle className="w-3 h-3" />}>Blocked</Badge>}
                  <PoinBadge value={santriInfo.current_poin} />
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard
              icon={<Package className="w-4 h-4" />}
              label="Items"
              value={sesi.items.length}
              hint="di sesi"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Matched"
              value={totalQtyMatched}
              hint="unit cocok"
              tone="success"
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Shortfall"
              value={totalQtyShortfall}
              hint="unit kurang"
              tone={totalQtyShortfall > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* Open debts */}
            <div className="card card-hover">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-slate-800">Hutang yang Tersisa</h3>
              </div>
              {openDebts.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="w-6 h-6 text-green-600" />}
                  title="Semua match!"
                  description="Tidak ada utang tersisa untuk siswa ini."
                />
              ) : (
                <ul className="divide-y divide-slate-100 -mx-2">
                  {openDebts.map((d, i) => (
                    <li key={i} className="px-2 py-2.5 flex items-center justify-between hover:bg-slate-50 rounded transition-colors">
                      <div>
                        <p className="font-mono text-sm">{d.barcode}</p>
                        <p className="text-xs text-slate-500">{d.nama_produk}</p>
                      </div>
                      <Badge tone="red">{d.qty} unit</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add item */}
            <div className="card card-hover">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-brand-600" />
                <h3 className="font-semibold text-slate-800">Tambah Item Sampah</h3>
              </div>
              {isOpen ? (
                <>
                  {/* Camera scan button */}
                  <button
                    onClick={() => setShowScanner(true)}
                    className="btn btn-primary w-full mb-2"
                  >
                    <Camera className="w-4 h-4" />
                    Scan Kamera (Barcode)
                  </button>

                  <div className="relative mb-2">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className="input pl-10"
                      value={itemBarcode}
                      onChange={(e) => setItemBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitManualItem()}
                      placeholder="Barcode produk (atau pakai tombol Scan Kamera di atas)"
                      list="produk-options-p"
                    />
                    <datalist id="produk-options-p">
                      {produkList.map((p) => <option key={p.barcode} value={p.barcode}>{p.nama_produk}</option>)}
                    </datalist>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={itemQty}
                      onChange={(e) => setItemQty(Math.max(0, parseInt(e.target.value) || 0))}
                      onKeyDown={(e) => e.key === 'Enter' && submitManualItem()}
                      placeholder="qty_in"
                    />
                    <button onClick={submitManualItem} className="btn btn-primary">
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    <strong>qty_in=0</strong> valid untuk pure-shortfall (siswa lapor tanpa bawa sampah).
                  </p>

                  {/* --- Jalur barcode rusak ---------------------------------
                      Tidak punya toggle di atas tapi link kecil di bawah:
                      scan gagal adalah kondisi yang jarang, jadi tidak layak
                      memakan ruang utama form yang dipakai 95% waktu. */}
                  {!modeBarcodeRusak ? (
                    <button
                      type="button"
                      onClick={() => setModeBarcodeRusak(true)}
                      className="mt-3 w-full flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-700 py-2 border-t border-slate-100 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="underline underline-offset-2">
                        Barcode siswa rusak? Input manual dengan foto bukti
                      </span>
                    </button>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-3 animate-slide-up">
                      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          <strong>Mode barcode rusak.</strong> Ketik barcode produk di
                          atas secara manual, lalu lampirkan foto barcode yang rusak
                          sebagai bukti. Foto wajib diupload — ini yang jadi dasar
                          kalau nanti ada sengketa.
                        </span>
                      </div>

                      <div>
                        <label
                          htmlFor="foto-bukti-input"
                          className="block text-xs font-medium text-slate-700 mb-1.5"
                        >
                          Foto barcode rusak <span className="text-red-600">*</span>
                        </label>

                        {fotoPreview ? (
                          <div className="space-y-2">
                            <img
                              src={fotoPreview}
                              alt="Pratinjau foto barcode rusak"
                              className="w-full max-h-56 object-contain rounded-lg border border-slate-200 bg-slate-50"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => pilihFoto(null)}
                                className="btn btn-secondary text-xs flex-1"
                              >
                                <X className="w-3.5 h-3.5" />Ganti foto
                              </button>
                              <button
                                type="button"
                                onClick={resetModeRusak}
                                className="btn btn-secondary text-xs flex-1"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            {/* Label + input file: `capture` membuat di HP
                                langsung membuka kamera (bukan hanya galeri),
                                yang memang kebutuhan petugas di lapangan. */}
                            <label
                              htmlFor="foto-bukti-input"
                              className="btn btn-secondary text-xs flex-1 cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />Ambil foto
                            </label>
                            <label
                              htmlFor="foto-bukti-input"
                              className="btn btn-secondary text-xs flex-1 cursor-pointer"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />Dari galeri
                            </label>
                          </div>
                        )}

                        <input
                          id="foto-bukti-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => pilihFoto(e.target.files?.[0] ?? null)}
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          JPG/PNG/WebP, maksimal 5 MB.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="catatan-input"
                          className="block text-xs font-medium text-slate-700 mb-1.5"
                        >
                          Catatan <span className="text-slate-400">(opsional)</span>
                        </label>
                        <textarea
                          id="catatan-input"
                          value={catatan}
                          onChange={(e) => setCatatan(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="mis. Barcode sobek, tinggal separuh barcode yang kebaca."
                          className="input text-xs resize-y"
                        />
                      </div>

                      {uploadError && (
                        <p role="alert" className="text-xs text-red-700 flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{uploadError}</span>
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={submitItemRusak}
                        disabled={!fotoBukti || addingItem}
                        className="btn btn-primary w-full"
                      >
                        {addingItem ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Mengunggah...</>
                        ) : (
                          <><Check className="w-4 h-4" />Simpan dengan bukti foto</>
                        )}
                      </button>
                      {!fotoBukti && (
                        <p className="text-[11px] text-slate-500 -mt-1">
                          Pilih foto dulu sebelum menyimpan.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<Lock className="w-6 h-6" />}
                  title="Sesi sudah ditutup"
                  description="Commit sudah dilakukan, sesi tidak bisa ditambah item."
                />
              )}
            </div>
          </div>

          {/* Items table */}
          {sesi.items.length > 0 && (
            <div className="card animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">Items di Sesi ({sesi.items.length})</h3>
                <PoinBadge value={totalItemsPoin} />
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 font-medium">Barcode</th>
                      <th className="font-medium text-center">Qty In</th>
                      <th className="font-medium text-center">Open</th>
                      <th className="font-medium text-center">Matched</th>
                      <th className="font-medium text-center">Excess</th>
                      <th className="font-medium text-center">Short</th>
                      <th className="font-medium text-right">Δ Poin</th>
                      <th className="font-medium text-right">Bukti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sesi.items.map((i, idx) => (
                      <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                        <td className="py-2 font-mono text-xs">{i.barcode}</td>
                        <td className="text-center">{i.qty_in}</td>
                        <td className="text-center text-slate-500">{i.qty_open_at_time}</td>
                        <td className="text-center text-green-700 font-medium">{i.qty_matched}</td>
                        <td className="text-center">{i.qty_excess}</td>
                        <td className={`text-center ${i.qty_shortfall > 0 ? 'text-red-600 font-medium' : ''}`}>{i.qty_shortfall}</td>
                        <td className="text-right font-medium text-green-700">+{i.poin_delta}</td>
                        <td className="text-right">
                          {i.foto_bukti_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewFoto(i)}
                              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:text-brand-800 underline underline-offset-2"
                            >
                              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                              Bukti
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300" aria-hidden="true">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Catatan + foto bukti di bawah tabel. Ini yang dibaca admin
                  kalau ada sengketa jauh setelah sesi ditutup, jadi tidak
                  boleh hanya tersembunyi di dalam tabel yang perlu di-scroll. */}
              {sesi.items.some((i) => i.catatan || i.foto_bukti_url) && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  {sesi.items.filter((i) => i.catatan || i.foto_bukti_url).map((i) => (
                    <div
                      key={i.id}
                      className="flex items-start gap-2.5 text-xs rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2"
                    >
                      <ImageIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-amber-900">{i.barcode}</p>
                        {i.catatan && <p className="text-amber-800 mt-0.5">{i.catatan}</p>}
                        {i.foto_bukti_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewFoto(i)}
                            className="mt-1.5 flex items-center gap-1 text-amber-900 hover:underline underline-offset-2"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            Lihat foto barcode
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                {isOpen ? (
                  <button onClick={commit} disabled={committing} className="btn btn-primary">
                    {committing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Committing...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" />Commit Sesi</>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 px-4 py-2 rounded-lg">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Sesi selesai. Poin change: {sesi.total_poin_change}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Konfirmasi pembatalan sesi. Aksi destruktif (item yang sudah
          diinput hilang), jadi tidak boleh satu-klik. */}
      <ConfirmDialog
        open={!!cancelTarget}
        onCancel={() => setCancelTarget(null)}
        onConfirm={konfirmasiBatalkan}
        title="Batalkan sesi ini?"
        description={
          cancelTarget
            ? `Sesi #${cancelTarget.id} untuk ${cancelTarget.nama_siswa ?? cancelTarget.nis} akan dibatalkan. Semua ${cancelTarget.items_count} item yang sudah diinput HILANG dan tidak memengaruhi poin. Gunakan ini hanya kalau sesi tertinggal terbuka karena petugas pergi.`
            : ''
        }
        confirmText="Ya, Batalkan"
        tone="danger"
      />

      {/* Preview foto bukti barcode. Dibuka dari tabel items maupun dari daftar
          catatan di bawahnya. */}
      <Modal
        open={!!previewFoto}
        onClose={() => setPreviewFoto(null)}
        title="Foto Bukti Barcode"
        size="lg"
      >
        {previewFoto?.foto_bukti_url && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-mono">{previewFoto.barcode}</p>
            <a
              href={previewFoto.foto_bukti_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={previewFoto.foto_bukti_url}
                alt={`Foto barcode rusak untuk produk ${previewFoto.barcode}`}
                className="w-full max-h-[60vh] object-contain rounded-lg border border-slate-200 bg-slate-50"
                loading="lazy"
              />
            </a>
            {previewFoto.catatan && (
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2.5">
                <span className="text-xs text-slate-500 block mb-0.5">Catatan petugas</span>
                {previewFoto.catatan}
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Ketuk gambar untuk membuka ukuran penuh.
            </p>
          </div>
        )}
      </Modal>

      <Suspense fallback={<ModalFallback />}>
        <BarcodeScanner
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onDetected={onScannerDetected}
          title="Scan Barcode Sampah"
          hint="Arahkan kamera ke barcode. Konfirmasi jumlah setelah scan."
        />
      </Suspense>

      {/* [F-feat] Dialog konfirmasi quantity setelah scan.
          Menampilkan preview produk + input qty (default = open debt). */}
      <ScanConfirmDialog
        open={!!pendingScan}
        barcode={pendingScan?.barcode ?? ''}
        nama_produk={pendingScan?.nama_produk}
        image_url={pendingScan?.image_url}
        defaultQty={pendingScan?.defaultQty ?? 1}
        maxQty={pendingScan?.maxQty ?? 9999}
        loading={addingItem}
        onConfirm={confirmScannedItem}
        onCancel={() => setPendingScan(null)}
      />
    </Layout>
  );
}

