import { lazy, Suspense, useEffect, useState } from 'react';
import api, { type Santri, type Produk, type TransaksiPembelian } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge, PoinBadge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/Skeleton';

// Heavy modals — lazy-load on first open (ProductManagerModal 30KB, BarcodeScanner 12KB).
// Staff tidak download chunk-nya sampai pertama kali klik tombol.
const ProductManagerModal = lazy(() => import('../components/ProductManagerModal').then(m => ({ default: m.ProductManagerModal })));
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then(m => ({ default: m.BarcodeScanner })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
import {
  User, Package, Hash, CheckCircle2, AlertTriangle, ScanLine, ShoppingCart,
  Loader2, Receipt, RotateCcw, Plus, Clock, Boxes, Trash2, X, ShoppingCart as CartIcon,
  Camera, Lightbulb, Check, XCircle, Lock as LockIcon
} from 'lucide-react';

interface CartItem {
  barcode: string;
  nama_produk: string;
  qty: number;
  is_plastik: boolean;
}

export default function StaffDashboard() {
  const toast = useToast();
  const [nis, setNis] = useState('');
  const [santri, setSantri] = useState<Santri | null>(null);
  const [barcode, setBarcode] = useState('');
  const [produk, setProduk] = useState<Produk | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<TransaksiPembelian[]>([]);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [showProductManager, setShowProductManager] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    api.get('/produk').then((r) => setProdukList(r.data.data)).catch(() => {});
    // `history` TIDAK bisa ditunggu hasil transaksi pertama — kalau tidak di-load
    // di sini, stat card "Hari Ini" & "Items" selalu 0 sampai staff checkout
    // pertama kali di sesi itu. Memuat ulang juga penting setelah reload halaman:
    // transaksi yang sudah tercatat sebelumnya akan ter-count 0.
    api.get('/pembelian/history')
      .then((r) => setHistory(r.data.data || []))
      .catch(() => { /* stat tidak kritis — biarkan 0 */ });
  }, []);

  async function lookupNis() {
    if (!nis) return;
    setSantri(null);
    try {
      const r = await api.get(`/santri/${nis}`);
      const data = r.data.santri;
      // Backend menolak transaksi untuk siswa suspended dengan 422. Now
      // staff langsung tahu di step lookup, tidak perlu memindai barang
      // dulu untuk ditolak di akhir.
      setSantri({ ...data, is_suspended: !!r.data.is_suspended });
      setActiveStep(2);
    } catch {
      toast.error(`NIS ${nis} tidak ditemukan.`);
    }
  }

  function lookupBarcode(bc: string) {
    setProduk(null);
    const p = produkList.find((x) => x.barcode === bc);
    if (p) {
      setProduk(p);
      setActiveStep(3);
    }
  }

  /**
   * Scanner callback: dipanggil setiap kali BarcodeScanner detect barcode.
   * Panggil backend /produk/scan/{barcode} untuk real-time lookup (1 query).
   */
  async function onScannerDetected(barcode: string, _format: string) {
    setBarcode(barcode);
    try {
      const r = await api.get(`/produk/scan/${encodeURIComponent(barcode)}`);
      const p = r.data.produk;
      if (!p.is_active) {
        toast.error(`Produk '${p.nama_produk}' sudah di-archive. Tidak bisa dijual.`);
        setShowScanner(false);
        return;
      }
      // Map backend shape -> Produk type for state
      setProduk({
        ...p,
        id_kategori: 0,  // not needed for display
        is_excluded_from_debit: p.is_excluded_from_debit,
        image_url: null,
        created_by: null,
        updated_by: null,
        archived_at: p.archived_at,
        archived_by: null,
      } as Produk);
      setActiveStep(3);
      toast.success(` ${p.nama_produk}`);
      // Close scanner after successful match — staff confirmed
      setShowScanner(false);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        toast.error(`Barcode '${barcode}' tidak ada di katalog.`);
        // Keep scanner open — staff mungkin mau coba lagi atau input manual
      } else {
        toast.error('Gagal lookup barcode: ' + (err.message || 'network error'));
      }
    }
  }

  function resetForm() {
    setNis(''); setSantri(null); setBarcode(''); setProduk(null); setQty(1);
    setCart([]);
    setActiveStep(1);
  }

  function clearCart() {
    setCart([]);
    toast.info('Keranjang dikosongkan.');
  }

  function addToCart() {
    if (!produk || !santri || qty < 1) return;
    if (qty > 999) { toast.error('Qty max 999 per item.'); return; }
    setCart((prev) => {
      // Cek kalau barang dengan barcode yang sama sudah ada -> merge qty
      const existing = prev.find((c) => c.barcode === produk.barcode);
      if (existing) {
        return prev.map((c) =>
          c.barcode === produk.barcode ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [
        ...prev,
        {
          barcode: produk.barcode,
          nama_produk: produk.nama_produk,
          qty: qty,
          is_plastik: !produk.is_excluded_from_debit,
        },
      ];
    });
    toast.success(`${produk.nama_produk} (×${qty}) ditambahkan ke keranjang.`);
    // Reset untuk item berikutnya
    setBarcode(''); setProduk(null); setQty(1); setActiveStep(2);
  }

  function removeFromCart(barcode: string) {
    setCart((prev) => prev.filter((c) => c.barcode !== barcode));
  }

  function updateCartQty(barcode: string, newQty: number) {
    if (newQty < 1) return;
    setCart((prev) =>
      prev.map((c) => (c.barcode === barcode ? { ...c, qty: newQty } : c))
    );
  }

  async function finalizeCart() {
    if (!santri || cart.length === 0) return;
    setSubmitting(true);
    try {
      const r = await api.post('/pembelian', {
        nis: nis,
        items: cart.map((c) => ({ barcode: c.barcode, qty: c.qty })),
      });
      const newPoin = r.data.santri.current_poin;
      const itemsCount = cart.length;
      const totalUnits = cart.reduce((s, c) => s + c.qty, 0);
      // Tidak ada catatan "siswa terblokir" di sini. Blokir hanya terjadi
      // saat poin menyentuh `default_negative_limit` (default -50), jadi
      // poin negatif saja belum berarti terblokir — note seperti itu
      // menyesatkan. Status blokir yang sebenarnya sudah ditampilkan
      // lewat badge BLOCKED di panel siswa, yang memang di-update di
      // bawah dari `r.data.santri.is_blocked`.
      toast.success(
        `${itemsCount} produk (${totalUnits} unit) dibeli. Poin: dari ${santri.current_poin} menjadi ${newPoin}.`
      );
      setSantri({ ...santri, current_poin: newPoin, is_blocked: r.data.santri.is_blocked });
      setCart([]);
      const h = await api.get('/pembelian/history');
      setHistory(h.data.data);
      setBarcode(''); setProduk(null); setQty(1); setActiveStep(2);
    } catch (err: any) {
      const e = err.response?.data;
      toast.error(e?.message || e?.blocked || 'Gagal selesaikan transaksi.');
    } finally {
      setSubmitting(false);
    }
  }

  const cartTotalUnits = cart.reduce((s, c) => s + c.qty, 0);
  const cartPlastikCount = cart.filter((c) => c.is_plastik).length;
  const cartPlastikUnits = cart.filter((c) => c.is_plastik).reduce((s, c) => s + c.qty, 0);

  /**
   * DECISION-LOG D8 + D14:
   *  - D8:Santri dengan `current_poin <= -50` di-block dari pembelian PLASTIK.
   *  - D14: Yang ter-block TETAP boleh beli produk non-plastik
   *         (`is_excluded_from_debit = TRUE`).
   *
   * Jadi guard-nya bukan "user blocked -> tolak semua", tapi
   * "user blocked DAN keranjang mengandung plastik -> tolak". Kesalahan ke arah
   * lain ikut berbahaya: memblokir transaksi non-plastik yang sah akan
   * menghentikan kantin. Dulu tidak ada guard sama sekali di POS — staff baru
   * tahu setelah mengisi seluruh keranjang lalu menekan Selesaikan.
   */
  const blockedByCart = !!santri?.is_blocked && cartPlastikCount > 0;
  const suspendedStudent = !!santri?.is_suspended;

  return (
    <Layout
      title="Staff Kantin | POS"
      titleShort="POS Kantin"
      subtitle="Input transaksi pembelian siswa"
      actions={
        <>
          <button onClick={() => setShowProductManager(true)} className="btn btn-secondary text-sm">
            <Boxes className="w-4 h-4" />Kelola Produk
          </button>
          <button onClick={resetForm} className="btn btn-ghost text-sm" title="Reset form">
            <RotateCcw className="w-4 h-4" />
          </button>
        </>
      }
    >
      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { id: 1, label: 'NIS', icon: User },
          { id: 2, label: 'Produk', icon: Package },
          { id: 3, label: 'Qty + Cart', icon: CartIcon },
        ].map((s, i) => {
          const Icon = s.icon;
          const active = activeStep >= s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
              }`}>
                <Icon className="w-4 h-4" />
                <span>{s.label}</span>
              </div>
              {i < 2 && <div className={`h-px flex-1 ${activeStep > s.id ? 'bg-brand-300' : 'bg-slate-200'}`}></div>}
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Form + Cart */}
        <div className="lg:col-span-3 space-y-4">
          {/* Step 1: NIS */}
          <div className={`card card-hover transition-all ${activeStep === 1 ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${activeStep >= 1 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {santri ? <CheckCircle2 className="w-4 h-4" /> : '1'}
              </div>
              <h3 className="font-semibold text-slate-800">Input NIS Siswa</h3>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className="input pl-10"
                  value={nis}
                  onChange={(e) => setNis(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupNis()}
                  placeholder="e.g. 23001"
                />
              </div>
              <button onClick={lookupNis} disabled={!nis} className="btn btn-secondary">
                <ScanLine className="w-4 h-4" />
                Lookup
              </button>
            </div>

            {santri && (
              <div className={`mt-3 p-3 rounded-lg border ${suspendedStudent ? 'border-slate-400 bg-slate-100' : santri.is_blocked ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50/50'} animate-slide-up`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{santri.nama}</p>
                    <p className="text-xs text-slate-500">{santri.kelas} | NIS {santri.nis}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <PoinBadge value={santri.current_poin} />
                    {suspendedStudent ? (
                      <Badge tone="red" icon={<LockIcon className="w-3 h-3" />}>Akun disuspend</Badge>
                    ) : santri.is_blocked ? (
                      <Badge tone="yellow" icon={<AlertTriangle className="w-3 h-3" />}>BLOCKED</Badge>
                    ) : (
                      <Badge tone="green">Aman</Badge>
                    )}
                  </div>
                </div>

                {/* Alert sebelum staff mulai scan. Backend menolak dengan 422
                    apa pun yang terjadi di sisi klien — ini supaya staff tahu
                    sebelum buang waktu scan barang, bukan setelah semuanya
                    discan. */}
                {suspendedStudent && (
                  <div role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-slate-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Akun siswa ini di-suspend, jadi transaksi tidak bisa dicatat.
                      Hubungi admin untuk membuka akses.
                    </span>
                  </div>
                )}

                {!suspendedStudent && santri.prior_open_count !== undefined && (
                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-xs text-slate-600 flex items-center gap-3">
                    <span>Open debt: <strong>{santri.prior_open_count}</strong></span>
                    <span className="text-slate-300" aria-hidden="true">|</span>
                    <span>Penalty tier: <strong>{santri.penalty_tier}/unit</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Produk */}
          <div className={`card card-hover transition-all ${activeStep === 2 ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${activeStep >= 2 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {produk ? <CheckCircle2 className="w-4 h-4" /> : '2'}
              </div>
              <h3 className="font-semibold text-slate-800">Scan / Pilih Produk</h3>
            </div>

            {/* Quick camera scan button — primary UX for kudnyaan POS */}
            <button
              onClick={() => setShowScanner(true)}
              disabled={!santri}
              className="btn btn-primary w-full mb-3"
              title={santri ? 'Buka kamera untuk scan barcode' : 'Cari siswa dulu (Step 1)'}
            >
              <Camera className="w-4 h-4" />
              Scan Kamera (Barcode)
            </button>

            {/* Manual input fallback */}
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="input pl-10"
                value={barcode}
                onChange={(e) => { setBarcode(e.target.value); lookupBarcode(e.target.value); }}
                onKeyDown={(e) => e.key === 'Enter' && lookupBarcode((e.target as HTMLInputElement).value)}
                placeholder="CHITATO68 atau ketik manual..."
                list="produk-options"
              />
              <datalist id="produk-options">
                {produkList.map((p) => <option key={p.barcode} value={p.barcode}>{p.nama_produk}</option>)}
              </datalist>
            </div>
            {produk && (
              <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-slate-50 animate-slide-up">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{produk.nama_produk}</p>
                  {produk.is_excluded_from_debit ? (
                    <Badge tone="yellow">Non-plastik | no debt</Badge>
                  ) : (
                    <Badge tone="green">Plastik | bikin utang</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Qty + Add to Cart */}
          <div className={`card card-hover transition-all ${activeStep === 3 ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${activeStep >= 3 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</div>
              <h3 className="font-semibold text-slate-800">Quantity & Tambah ke Keranjang</h3>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  onKeyDown={(e) => e.key === 'Enter' && addToCart()}
                />
              </div>
              <div className="flex-1 flex items-end">
                <button
                  className="btn btn-secondary w-full"
                  disabled={!santri || !produk || qty < 1}
                  onClick={addToCart}
                >
                  <Plus className="w-4 h-4" />
                  Tambah ke Keranjang
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1">
              <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Item ditambahkan ke keranjang, lalu lanjut scan produk lain atau selesaikan transaksi.</span>
            </p>
          </div>
        </div>

        {/* Cart + Stats + History */}
        <div className="lg:col-span-2 space-y-4">
          {/* Cart */}
          <div className="card border-2 border-amber-300 bg-amber-50/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-amber-600" />
                Keranjang
                {cart.length > 0 && <Badge tone="red">{cart.length}</Badge>}
              </h3>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1">
                  <X className="w-3 h-3" />Kosongkan
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                <ShoppingCart className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                Keranjang kosong.<br />Tambah produk dari form di samping.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto scrollbar-thin">
                {cart.map((c) => (
                  <div key={c.barcode} className="p-2 rounded-lg border border-slate-200 bg-white text-sm flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate text-xs">{c.nama_produk}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{c.barcode}</p>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={c.qty}
                      onChange={(e) => updateCartQty(c.barcode, Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                      className="w-12 px-1 py-0.5 text-xs border border-slate-300 rounded text-center"
                    />
                    {c.is_plastik && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">P</span>}
                    <button onClick={() => removeFromCart(c.barcode)} className="text-slate-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                  <span>Total items: <strong>{cartTotalUnits}</strong> unit ({cart.length} produk)</span>
                  {cartPlastikCount > 0 && (
                    <span className="text-amber-700 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {cartPlastikUnits} unit plastik (bikin utang)
                    </span>
                  )}
                </div>

                {/* Peringatan D8/D14 — tampil sebelum user menekan finalize,
                    bukan lewat error dari server setelahnya. */}
                {blockedByCart && (
                  <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      <strong>{santri?.nama} sedang ter-block</strong> dan keranjang masih ada
                      {' '}<strong>{cartPlastikUnits} unit plastik</strong>. Sesuai aturan, siswa
                      ter-block tidak boleh membeli produk kemasan plastik. Hapus item plastik
                      dari keranjang, atau minta admin reset poin dulu.
                    </span>
                  </div>
                )}

                {/* Tombol di panel keranjang disembunyikan <lg karena posisinya
                    sudah digantikan sticky bar di bawah layar. Peringatan
                    blocked tetap tampil di sini (kontekstual dengan isi keranjang). */}
                <button
                  className="btn btn-primary w-full hidden lg:inline-flex"
                  disabled={!santri || cart.length === 0 || submitting || blockedByCart || suspendedStudent}
                  onClick={finalizeCart}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
                  ) : suspendedStudent ? (
                    <><LockIcon className="w-4 h-4" />Akun siswa disuspend</>
                  ) : blockedByCart ? (
                    <><AlertTriangle className="w-4 h-4" />Siswa ter-block, plastik tidak bisa dibeli</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" />Selesaikan Transaksi ({cartTotalUnits} unit)</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Receipt className="w-4 h-4" />}
              label="Hari Ini"
              value={history.length}
              hint="transaksi"
              tone="default"
            />
            <StatCard
              icon={<ShoppingCart className="w-4 h-4" />}
              label="Items"
              value={history.reduce((s, t) => s + t.qty, 0)}
              hint="unit terjual"
              tone="default"
            />
          </div>

          <div className="card">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              History
            </h3>
            {history.length === 0 ? (
              <EmptyState
                icon={<Receipt className="w-6 h-6" />}
                title="Belum ada transaksi"
                description="Lakukan checkout untuk lihat history"
              />
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
                {history.slice(0, 20).map((t) => (
                  <div key={t.id} className="p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-500">{new Date(t.waktu).toLocaleTimeString('id-ID')}</span>
                      <Badge tone={t.penalty_per_unit < 0 ? 'red' : 'gray'}>{t.penalty_per_unit * t.qty}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-mono text-xs">{t.nis}</span>
                      <span className="text-xs text-slate-500">×{t.qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Sticky POS action bar (mobile only). Tanpa ini, "Selesaikan Transaksi"
          berada di bawah 3 kartu step — staff harus scroll panjang setiap kali
          selesai scan, padahal itu aksi yang paling sering dilakukan. */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(15,23,42,0.08)] animate-slide-up motion-reduce:animate-none">
          <div className="flex items-center gap-3 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="min-w-0 shrink-0">
              <p className="text-[10px] text-slate-500 leading-tight">{cart.length} produk</p>
              <p className="text-sm font-bold text-slate-800 leading-tight tabular-nums">{cartTotalUnits} unit</p>
            </div>
            <button
              className={`btn flex-1 min-w-0 ${suspendedStudent ? 'btn-secondary' : blockedByCart ? 'btn-secondary' : 'btn-primary'}`}
              disabled={!santri || submitting || blockedByCart || suspendedStudent}
              onClick={finalizeCart}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
              ) : suspendedStudent ? (
                <><LockIcon className="w-4 h-4 shrink-0" /><span className="truncate">Akun disuspend</span></>
              ) : blockedByCart ? (
                <><AlertTriangle className="w-4 h-4 shrink-0" /><span className="truncate">Ter-block: plastik</span></>
              ) : (
                <><CheckCircle2 className="w-4 h-4 shrink-0" />Selesaikan</>
              )}
            </button>
          </div>
        </div>
      )}
      {/* Spacer supaya bar sticky tidak menutup konten terakhir / stat card. */}
      {cart.length > 0 && <div className="lg:hidden h-20" aria-hidden="true" />}

      <Suspense fallback={<ModalFallback />}>
        <ProductManagerModal open={showProductManager} onClose={() => setShowProductManager(false)} />
        <BarcodeScanner
          open={showScanner}
          onClose={() => setShowScanner(false)}
          onDetected={onScannerDetected}
          title="Scan Barcode Produk"
          hint="Arahkan kamera ke barcode produk. Auto-detect multi-format."
        />
      </Suspense>
    </Layout>
  );
}
