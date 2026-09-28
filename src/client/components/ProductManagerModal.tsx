import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { BarcodeScanner } from './BarcodeScanner';
import { useConfirm } from '../hooks/useConfirm';
import {
  Plus, Edit3, Trash2, RotateCcw, Package, Save, X, Camera, CheckCircle2, AlertTriangle,
  Hash, Tag, FolderTree, Info, Check
} from 'lucide-react';

interface Produk {
  barcode: string;
  nama_produk: string;
  id_kategori: number;
  is_excluded_from_debit: boolean;
  image_url: string | null;
  archived_at: string | null;
  kategori?: { id: number; nama_kategori: string };
}

interface Kategori {
  id: number;
  nama_kategori: string;
}

interface ProductManagerModalProps {
  open: boolean;
  onClose: () => void;
}

interface BarcodeCheckResult {
  available: boolean;
  barcode: string;
  message?: string;
  existing?: {
    barcode: string;
    nama_produk: string;
    kategori?: string;
    archived: boolean;
  };
}

interface KategoriCheckResult {
  available: boolean;
  nama?: string;
  reason?: string;
  message?: string;
  existing?: { id: number; nama_kategori: string };
}

export function ProductManagerModal({ open, onClose }: ProductManagerModalProps) {
  const toast = useToast();
  const { confirm, ConfirmUI } = useConfirm();
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [kategoriList, setKategoriList] = useState<Kategori[]>([]);
  const [search, setSearch] = useState('');
  const [filterArchived, setFilterArchived] = useState<'active' | 'all' | 'archived'>('active');
  const [editModal, setEditModal] = useState<{ produk: Produk | null; mode: 'create' | 'edit' } | null>(null);
  const [kategoriModal, setKategoriModal] = useState(false);
  const [form, setForm] = useState({ barcode: '', nama_produk: '', id_kategori: 0, is_excluded_from_debit: false });
  const [kategoriForm, setKategoriForm] = useState({ nama_kategori: '', deskripsi: '', is_default_excluded: false });
  const [barcodeCheck, setBarcodeCheck] = useState<BarcodeCheckResult | null>(null);
  const [kategoriCheck, setKategoriCheck] = useState<KategoriCheckResult | null>(null);
  const [checkingBarcode, setCheckingBarcode] = useState(false);
  const [checkingKategori, setCheckingKategori] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kategoriCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    try {
      const includeArchived = filterArchived !== 'active' ? '1' : '0';
      const r = await api.get(`/produk?include_archived=${includeArchived}&per_page=200`);
      setProdukList(r.data.data || []);
      const kr = await api.get('/kategori');
      setKategoriList(kr.data.data || []);
    } catch {
      toast.error('Gagal load produk.');
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open, filterArchived]);

  const filtered = produkList.filter((p) => {
    if (filterArchived === 'active' && p.archived_at) return false;
    if (filterArchived === 'archived' && !p.archived_at) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.barcode.toLowerCase().includes(q) || p.nama_produk.toLowerCase().includes(q);
    }
    return true;
  });

  function openCreate() {
    setForm({ barcode: '', nama_produk: '', id_kategori: 0, is_excluded_from_debit: false });
    setBarcodeCheck(null);
    setEditModal({ produk: null, mode: 'create' });
  }

  function openEdit(p: Produk) {
    setForm({
      barcode: p.barcode,
      nama_produk: p.nama_produk,
      id_kategori: p.id_kategori,
      is_excluded_from_debit: p.is_excluded_from_debit,
    });
    setBarcodeCheck(null);
    setEditModal({ produk: p, mode: 'edit' });
  }

  function closeEdit() {
    setEditModal(null);
    setBarcodeCheck(null);
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }
  }

  function openKategoriForm() {
    setKategoriForm({ nama_kategori: '', deskripsi: '', is_default_excluded: false });
    setKategoriCheck(null);
    setKategoriModal(true);
  }

  function closeKategoriForm() {
    setKategoriModal(false);
    setKategoriCheck(null);
    if (kategoriCheckTimeoutRef.current) {
      clearTimeout(kategoriCheckTimeoutRef.current);
      kategoriCheckTimeoutRef.current = null;
    }
  }

  // ===== Real-time checks =====
  useEffect(() => {
    if (editModal?.mode !== 'create') return;
    const barcode = form.barcode.trim();
    if (barcode.length < 4) {
      setBarcodeCheck(null);
      return;
    }
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(async () => {
      setCheckingBarcode(true);
      try {
        const r = await api.get(`/produk/check-barcode/${encodeURIComponent(barcode)}`);
        setBarcodeCheck(r.data);
      } catch (err: any) {
        if (err.response?.status === 409) {
          setBarcodeCheck(err.response.data);
        } else {
          setBarcodeCheck(null);
        }
      } finally {
        setCheckingBarcode(false);
      }
    }, 400);

    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [form.barcode, editModal?.mode]);

  // Real-time category name check
  useEffect(() => {
    if (!kategoriModal) return;
    const nama = kategoriForm.nama_kategori.trim();
    if (nama.length < 2) {
      setKategoriCheck(null);
      return;
    }
    if (kategoriCheckTimeoutRef.current) clearTimeout(kategoriCheckTimeoutRef.current);
    kategoriCheckTimeoutRef.current = setTimeout(async () => {
      setCheckingKategori(true);
      try {
        const r = await api.get(`/kategori/check-name?nama=${encodeURIComponent(nama)}`);
        setKategoriCheck(r.data);
      } catch (err: any) {
        if (err.response?.status === 409) {
          setKategoriCheck(err.response.data);
        } else if (err.response?.status === 422) {
          setKategoriCheck({ available: false, message: err.response.data?.message });
        } else {
          setKategoriCheck(null);
        }
      } finally {
        setCheckingKategori(false);
      }
    }, 400);

    return () => {
      if (kategoriCheckTimeoutRef.current) clearTimeout(kategoriCheckTimeoutRef.current);
    };
  }, [kategoriForm.nama_kategori, kategoriModal]);

  /**
   * BarcodeScanner callback.
   * - Create mode: auto-fill barcode di form.
   * - Edit mode: jika barcode baru SAMA dengan existing -> no-op (visual confirmation).
   *              jika barcode baru BEDA -> confirm replacement dengan Modal.
   */
  async function onScannerDetected(barcode: string, _format: string) {
    const bc = barcode.toUpperCase();
    setShowScanner(false);

    if (editModal?.mode === 'edit' && editModal.produk) {
      // Edit mode: cek apakah barcode baru sama dengan existing atau beda
      if (bc === editModal.produk.barcode) {
        toast.success(` Barcode '${bc}' matches existing product.`);
        return;
      }
      // Barcode berbeda — tanya user apakah mau replace via custom dialog
      const ok = await confirm({
        title: 'Ganti Barcode Produk?',
        description: `Barcode hasil scan "${bc}" BEDA dari barcode existing "${editModal.produk.barcode}".\n\nGanti barcode produk ini ke "${bc}"?\n\n(Pasti: untuk koreksi label barcode rusak)`,
        confirmText: 'Ya, Ganti',
        tone: 'warning',
      });
      if (ok) {
        // Validate uniqueness dulu via check-barcode endpoint.
        // Endpoint contract:
        //   200 OK + available=true  -> barcode BELUM dipakai, aman untuk replace
        //   409      + available=false -> barcode SUDAH dipakai produk lain
        setForm((prev) => ({ ...prev, barcode: bc }));
        api.get(`/produk/check-barcode/${encodeURIComponent(bc)}`)
          .then((res) => {
            // 200 -> barcode AVAILABLE — boleh dipakai untuk replace
            if (res.data?.available) {
              toast.success(`Barcode akan di-replace ke '${bc}'. Klik Update untuk simpan.`);
              setBarcodeCheck({ available: true, barcode: bc });
            } else {
              // Defensive: 200 tapi available=false (seharusnya tidak terjadi, tapi handle)
              toast.error(res.data?.message || `Barcode '${bc}' sudah dipakai produk lain.`);
              setForm((prev) => ({ ...prev, barcode: editModal.produk!.barcode }));
              setBarcodeCheck(null);
            }
          })
          .catch((err: any) => {
            // 409 -> barcode SUDAH dipakai — tolak replace
            if (err.response?.status === 409) {
              toast.error(err.response?.data?.message || `Barcode '${bc}' sudah dipakai produk lain. Tidak bisa replace.`);
              setForm((prev) => ({ ...prev, barcode: editModal.produk!.barcode }));
              setBarcodeCheck(null);
            } else if (err.response?.status === 422) {
              // Format invalid
              toast.error(err.response?.data?.message || 'Format barcode tidak valid.');
              setForm((prev) => ({ ...prev, barcode: editModal.produk!.barcode }));
              setBarcodeCheck(null);
            } else {
              // Network/server error — surface to user, JANGAN assume success
              toast.error(`Gagal cek barcode: ${err.response?.data?.message || err.message || 'Unknown error'}`);
              setForm((prev) => ({ ...prev, barcode: editModal.produk!.barcode }));
              setBarcodeCheck(null);
            }
          });
      }
    } else {
      // Create mode: langsung fill
      setForm((prev) => ({ ...prev, barcode: bc }));
      toast.success(` Barcode '${bc}' di-scan`);
    }
  }

  async function save() {
    if (!editModal) return;
    const isCreate = editModal.mode === 'create';
    if (!form.nama_produk.trim()) { toast.error('Nama produk wajib.'); return; }
    if (isCreate && !form.barcode.trim()) { toast.error('Barcode wajib.'); return; }
    if (isCreate && !form.id_kategori) { toast.error('Kategori wajib.'); return; }
    if (isCreate && barcodeCheck && barcodeCheck.available === false) {
      toast.error('Barcode sudah dipakai produk lain.');
      return;
    }

    try {
      if (isCreate) {
        await api.post('/produk', form);
        toast.success(`Produk '${form.nama_produk}' ditambah.`);
      } else if (editModal.produk) {
        // Edit mode: barcode bisa berubah (via scan) atau tetap
        const newBarcode = form.barcode.trim();
        const oldBarcode = editModal.produk.barcode;
        const barcodeChanged = newBarcode !== oldBarcode;

        // PATCH standard update (nama, kategori, exclusion)
        await api.patch(`/produk/${oldBarcode}`, {
          nama_produk: form.nama_produk,
          id_kategori: form.id_kategori,
          is_excluded_from_debit: form.is_excluded_from_debit,
        });

        // Jika barcode berubah, lakukan atomic rename
        if (barcodeChanged) {
          // Backend PATCH tidak support ganti barcode (PK).
          // Strategi: archive old -> create new -> link. Untuk PRD ini kita re-create.
          await api.post('/produk', {
            barcode: newBarcode,
            nama_produk: form.nama_produk,
            id_kategori: form.id_kategori,
            is_excluded_from_debit: form.is_excluded_from_debit,
          });
          await api.delete(`/produk/${oldBarcode}`);
          toast.success(`Produk '${form.nama_produk}' di-update. Barcode diganti dari ${oldBarcode} menjadi ${newBarcode}`);
        } else {
          toast.success(`Produk '${form.nama_produk}' di-update.`);
        }
      }
      closeEdit();
      refresh();
    } catch (e: any) {
      const data = e.response?.data;
      const msg = data?.message || data?.errors?.barcode?.[0] || data?.errors?.nama_produk?.[0] || 'Gagal.';
      toast.error(msg);
    }
  }

  async function saveKategori() {
    if (!kategoriForm.nama_kategori.trim()) {
      toast.error('Nama kategori wajib.');
      return;
    }
    if (kategoriCheck && kategoriCheck.available === false) {
      toast.error('Nama kategori sudah ada. Gunakan nama lain.');
      return;
    }
    try {
      const r = await api.post('/kategori', kategoriForm);
      toast.success(`Kategori '${r.data.kategori.nama_kategori}' ditambah.`);
      await refresh();
      // Auto-select kategori baru di form produk (kalau sedang buka)
      if (editModal) {
        setForm((prev) => ({ ...prev, id_kategori: r.data.kategori.id }));
      }
      closeKategoriForm();
    } catch (e: any) {
      const data = e.response?.data;
      toast.error(data?.errors?.nama_kategori?.[0] || data?.message || 'Gagal.');
    }
  }

  async function archive(p: Produk) {
    const ok = await confirm({
      title: 'Archive Produk?',
      description: `Produk "${p.nama_produk}" tidak akan muncul di POS lagi. Bisa di-unarchive oleh Super Admin nanti.`,
      confirmText: 'Ya, Archive',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api.delete(`/produk/${p.barcode}`);
      toast.success(`Produk "${p.nama_produk}" di-archive.`);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal.');
    }
  }

  async function unarchive(p: Produk) {
    try {
      await api.post(`/produk/${p.barcode}/unarchive`);
      toast.success(`Produk '${p.nama_produk}' di-restore.`);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Kelola Produk & Kategori" description="Tambah, edit, archive produk + kategori" size="lg">
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              className="input pl-3"
              placeholder="Cari barcode atau nama produk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input sm:w-40" value={filterArchived} onChange={(e) => setFilterArchived(e.target.value as any)}>
            <option value="active">Aktif saja</option>
            <option value="archived">Archived saja</option>
            <option value="all">Semua</option>
          </select>
          <button onClick={openKategoriForm} className="btn btn-secondary">
            <FolderTree className="w-4 h-4" />Kategori
          </button>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4" />Tambah
          </button>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">Tidak ada produk.</div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                <tr>
                  <th className="py-2 font-medium">Barcode</th>
                  <th className="font-medium">Nama</th>
                  <th className="font-medium">Kategori</th>
                  <th className="font-medium text-center">Status</th>
                  <th className="font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.barcode} className={`border-b border-slate-100 hover:bg-slate-50 ${p.archived_at ? 'opacity-60' : ''}`}>
                    <td className="py-2 font-mono text-xs">{p.barcode}</td>
                    <td className="font-medium">{p.nama_produk}</td>
                    <td className="text-xs text-slate-600">{p.kategori?.nama_kategori ?? '—'}</td>
                    <td className="text-center">
                      {p.archived_at ? (
                        <span className="badge badge-red text-xs">Archived</span>
                      ) : p.is_excluded_from_debit ? (
                        <span className="badge badge-yellow text-xs">Non-Plastik</span>
                      ) : (
                        <span className="badge badge-green text-xs">Aktif</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!p.archived_at ? (
                        <>
                          <button onClick={() => openEdit(p)} className="btn btn-secondary text-xs" title="Edit"><Edit3 className="w-3 h-3" /></button>
                          <button onClick={() => archive(p)} className="btn btn-danger text-xs" title="Archive"><Trash2 className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <button onClick={() => unarchive(p)} className="btn btn-secondary text-xs" title="Restore">
                          <RotateCcw className="w-3 h-3" />Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============ Edit/Create Produk Modal ============ */}
      {editModal && (
        <Modal
          open={true}
          onClose={() => setEditModal(null)}
          title={editModal.mode === 'create' ? 'Tambah Produk' : `Edit Produk | ${editModal.produk?.barcode}`}
          size="md"
        >
          <div className="space-y-3">
            {editModal.mode === 'create' && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r text-xs text-blue-900">
                 Gunakan tombol <strong>Scan Kamera</strong> di bawah untuk input barcode via kamera HP/tablet.
              </div>
            )}
            {editModal.mode === 'edit' && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r text-xs text-amber-900">
                 <strong>Mode Edit:</strong> Jika barcode produk rusak atau ingin diganti, gunakan tombol
                <strong> Scan Kamera</strong>. Sistem akan minta konfirmasi untuk replace barcode.
              </div>
            )}

            {/* Barcode field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Barcode {editModal.mode === 'create' && <span className="text-red-500">*</span>}
              </label>

              {/* Mode Create: full Scan flow */}
              {editModal.mode === 'create' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="btn btn-primary w-full mb-2"
                  >
                    <Camera className="w-4 h-4" />
                    Scan Kamera (Barcode)
                  </button>

                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className={`input pl-10 pr-10 font-mono ${
                        barcodeCheck?.available === false
                          ? 'border-red-400 bg-red-50'
                          : barcodeCheck?.available === true
                          ? 'border-green-400 bg-green-50/30'
                          : ''
                      }`}
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value.toUpperCase() })}
                      placeholder="CHITATO68 atau scan barcode"
                    />
                    {checkingBarcode && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">checking...</span>}
                    {barcodeCheck?.available === true && !checkingBarcode && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                    )}
                    {barcodeCheck?.available === false && !checkingBarcode && (
                      <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600" />
                    )}
                  </div>

                  {barcodeCheck?.available === true && (
                    <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />Tersedia — barcode bisa dipakai.
                    </p>
                  )}
                  {barcodeCheck?.available === false && barcodeCheck.existing && (
                    <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                      <p className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3 h-3" />Barcode sudah dipakai!
                      </p>
                      <p className="mt-1">
                        <strong>{barcodeCheck.existing.nama_produk}</strong>
                        {' '}di kategori {barcodeCheck.existing.kategori || '(tanpa kategori)'}
                        {barcodeCheck.existing.archived && ' — sudah di-archive'}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Mode Edit: scan available for re-scan/replacement */}
              {editModal.mode === 'edit' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="btn btn-secondary w-full mb-2"
                  >
                    <Camera className="w-4 h-4" />
                    Scan Kamera (Re-scan / Ganti Barcode)
                  </button>

                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      className={`input pl-10 pr-10 font-mono ${
                        barcodeCheck && form.barcode !== editModal.produk?.barcode
                          ? 'border-amber-400 bg-amber-50/30'
                          : ''
                      }`}
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value.toUpperCase() })}
                      placeholder="CHITATO68"
                    />
                    {form.barcode !== editModal.produk?.barcode && (
                      <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                    )}
                    {form.barcode === editModal.produk?.barcode && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                    )}
                  </div>

                  {form.barcode !== editModal.produk?.barcode && form.barcode !== '' && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      <p className="font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Barcode akan diganti saat klik Update
                      </p>
                      <p className="mt-1 text-[11px]">
                        Barcode <strong>{editModal.produk?.barcode}</strong> akan diganti menjadi <strong>{form.barcode}</strong>.
                        Produk lama akan di-archive otomatis.
                      </p>
                    </div>
                  )}
                  {form.barcode === editModal.produk?.barcode && (
                    <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />Barcode masih sama — tidak ada perubahan.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Nama */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nama Produk <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                value={form.nama_produk}
                onChange={(e) => setForm({ ...form, nama_produk: e.target.value })}
                placeholder="Chitato 68g"
              />
            </div>

            {/* Kategori */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kategori {editModal.mode === 'create' && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={form.id_kategori || ''}
                  onChange={(e) => setForm({ ...form, id_kategori: parseInt(e.target.value) || 0 })}
                >
                  <option value="">— Pilih kategori —</option>
                  {kategoriList.map((k) => (
                    <option key={k.id} value={k.id}>{k.nama_kategori}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={openKategoriForm}
                  className="btn btn-secondary shrink-0"
                  title="Tambah kategori baru"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tidak ada kategori yang sesuai? Klik + untuk tambah.
              </p>
            </div>

            {/* Non-plastik */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-excluded"
                className="w-4 h-4"
                checked={form.is_excluded_from_debit}
                onChange={(e) => setForm({ ...form, is_excluded_from_debit: e.target.checked })}
              />
              <label htmlFor="is-excluded" className="text-sm text-slate-700">
                Non-plastik (tidak bikin utang saat dibeli)
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button onClick={closeEdit} className="btn btn-secondary flex-1">
                <X className="w-4 h-4" />Batal
              </button>
              <button onClick={save} className="btn btn-primary flex-1">
                <Save className="w-4 h-4" />
                {editModal.mode === 'create' ? 'Simpan Produk' : 'Update'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ Tambah Kategori Modal ============ */}
      {kategoriModal && (
        <Modal
          open={true}
          onClose={closeKategoriForm}
          title="Tambah Kategori Baru"
          description="Kategori membantu mengelompokkan produk (misal: Snack, Minuman)"
          size="md"
        >
          <div className="space-y-3">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r text-xs text-blue-900">
               Staff kantin dapat membuat kategori baru jika belum ada yang sesuai.
              Kategori yang ditandai <strong>Non-Plastik Default</strong> akan otomatis exclude dari utang saat produk baru di-assign.
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nama Kategori <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  className={`input pl-10 pr-10 ${
                    kategoriCheck?.available === false
                      ? 'border-red-400 bg-red-50'
                      : kategoriCheck?.available === true
                      ? 'border-green-400 bg-green-50/30'
                      : ''
                  }`}
                  value={kategoriForm.nama_kategori}
                  onChange={(e) => setKategoriForm({ ...kategoriForm, nama_kategori: e.target.value })}
                  placeholder="e.g. Snack Ringan"
                  autoFocus
                />
                {checkingKategori && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">checking...</span>}
                {kategoriCheck?.available === true && !checkingKategori && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                )}
                {kategoriCheck?.available === false && !checkingKategori && (
                  <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-600" />
                )}
              </div>

              {kategoriCheck?.available === true && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Nama tersedia.
                </p>
              )}
              {kategoriCheck?.available === false && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  <p className="flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3" />Nama kategori sudah ada!
                  </p>
                  {kategoriCheck.existing && (
                    <p className="mt-1">
                      Pakai nama lain, atau gunakan kategori existing: <strong>{kategoriCheck.existing.nama_kategori}</strong>
                    </p>
                  )}
                  {kategoriCheck.reason === 'invalid_format' && (
                    <p className="mt-1">{kategoriCheck.message}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deskripsi <span className="text-slate-400 text-xs font-normal">(opsional)</span>
              </label>
              <textarea
                className="input min-h-[60px]"
                value={kategoriForm.deskripsi}
                onChange={(e) => setKategoriForm({ ...kategoriForm, deskripsi: e.target.value })}
                placeholder="Penjelasan singkat kategori ini"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-default-excluded"
                className="w-4 h-4"
                checked={kategoriForm.is_default_excluded}
                onChange={(e) => setKategoriForm({ ...kategoriForm, is_default_excluded: e.target.checked })}
              />
              <label htmlFor="is-default-excluded" className="text-sm text-slate-700">
                Non-Plastik Default (produk di kategori ini auto-exclude dari utang)
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button onClick={closeKategoriForm} className="btn btn-secondary flex-1">
                <X className="w-4 h-4" />Batal
              </button>
              <button
                onClick={saveKategori}
                disabled={checkingKategori || (kategoriCheck !== null && !kategoriCheck.available)}
                className="btn btn-primary flex-1"
              >
                <Save className="w-4 h-4" />
                Simpan Kategori
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Barcode scanner modal */}
      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={onScannerDetected}
        title={editModal?.mode === 'edit' ? 'Scan Barcode (Replace Mode)' : 'Scan Barcode untuk Produk Baru'}
        hint={editModal?.mode === 'edit'
          ? 'Scan barcode baru untuk replace. Akan diminta konfirmasi.'
          : 'Arahkan kamera ke barcode produk. Hasil scan otomatis mengisi field Barcode.'
        }
      />

      {ConfirmUI}
    </Modal>
  );
}
