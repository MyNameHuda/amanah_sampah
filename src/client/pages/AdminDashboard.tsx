import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import api, { type Santri } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge, PoinBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/Skeleton';

const ProductLogModal = lazy(() => import('../components/ProductLogModal').then(m => ({ default: m.ProductLogModal })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
import {
  Users, AlertTriangle, TrendingUp, Search, RotateCcw, ChevronRight, ChevronDown, Shield,
  UserCheck, BarChart3, Check, X, AlertCircle, Loader2,
  Activity, Eye, StopCircle, Clock, RefreshCw, FileText,
  Hash, UserX, AlertOctagon, Copy, Hourglass, Package, Edit3, Info,
  Image as ImageIcon
} from 'lucide-react';

interface ActiveSesi {
  id: number;
  nis: string;
  nama_siswa: string;
  kelas_siswa: string;
  current_poin_siswa: number;
  is_blocked: boolean;
  petugas_id: number;
  nama_petugas: string;
  waktu_mulai: string;
  items_count: number;
  total_poin_change_uncommitted: number;
  last_item_at: string | null;
}

interface SesiItem {
  id: number;
  barcode: string;
  nama_produk: string | null;
  qty_in: number;
  qty_matched: number;
  qty_excess: number;
  qty_shortfall: number;
  poin_delta: number;
  foto_bukti_path: string | null;
  /** URL absolut siap pakai — disusun backend (symlink lokal atau R2). */
  foto_bukti_url: string | null;
  catatan: string | null;
  created_at: string;
}

// Template alasan untuk Force-End — admin bisa pilih atau input manual
const FORCE_END_TEMPLATES: { id: string; label: string; description: string; icon: typeof Hash }[] = [
  { id: 'wrong-nis', label: 'Salah input NIS', description: 'Sesi dibuka untuk siswa yang salah', icon: Hash },
  { id: 'absent', label: 'Siswa tidak datang', description: 'Petugas sudah standby tapi siswa tidak muncul', icon: UserX },
  { id: 'stuck', label: 'Petugas stuck / error', description: 'Aplikasi error atau petugas butuh bantuan', icon: AlertOctagon },
  { id: 'duplicate', label: 'Double session', description: 'Petugas tidak sengaja buka sesi kedua', icon: Copy },
  { id: 'timeout', label: 'Sesi kadaluarsa', description: 'Idle > 30 menit, auto-close gagal', icon: Hourglass },
  { id: 'wrong-product', label: 'Salah verifikasi produk', description: 'Salah scan barang ke siswa', icon: Package },
];

export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState<'santri' | 'active' | 'coverage' | 'produk'>('santri');
  const [santri, setSantri] = useState<Santri[]>([]);
  const [coverage, setCoverage] = useState<any[]>([]);
  const [produkList, setProdukList] = useState<any[]>([]);
  const [produkLogModal, setProdukLogModal] = useState<{ barcode: string; name: string } | null>(null);
  const [activeSesi, setActiveSesi] = useState<ActiveSesi[]>([]);
  const [search, setSearch] = useState('');

  // Reset state
  const [resetModal, setResetModal] = useState<{ nis: string; nama: string; poin: number } | null>(null);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // Active sesi state
  const [logModal, setLogModal] = useState<{ sesi: any; items: SesiItem[] } | null>(null);
  const [forceEndModal, setForceEndModal] = useState<ActiveSesi | null>(null);
  const [forceEndAlasan, setForceEndAlasan] = useState('');
  const [forceEndLoading, setForceEndLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  // Auto-refresh active sesi tab every 10s
  useEffect(() => {
    if (tab !== 'active') return;
    refreshActiveSesi();
    const interval = setInterval(refreshActiveSesi, 10000);
    return () => clearInterval(interval);
  }, [tab]);

  async function refresh() {
    try {
      const [s, c, p] = await Promise.all([
        api.get('/santri?active=1'),
        api.get('/super-admin/coverage'),
        api.get('/produk?include_archived=1&per_page=200'),
      ]);
      setSantri(s.data.data || []);
      setCoverage(c.data.data || []);
      setProdukList(p.data.data || []);
    } catch (err: any) {
      toast.error('Gagal load data.');
    }
  }

  async function refreshActiveSesi() {
    try {
      const r = await api.get('/admin/verifikasi/active');
      setActiveSesi(r.data.data || []);
    } catch (err: any) {
      // Silent fail for auto-refresh
    }
  }

  async function viewLog(sesiId: number) {
    setLogLoading(true);
    try {
      const r = await api.get(`/admin/verifikasi/${sesiId}/log`);
      setLogModal(r.data);
    } catch (err: any) {
      toast.error('Gagal load log.');
    } finally {
      setLogLoading(false);
    }
  }

  async function submitForceEnd() {
    if (!forceEndModal) return;
    if (forceEndAlasan.length < 10) {
      toast.error('Alasan minimal 10 karakter.');
      return;
    }
    setForceEndLoading(true);
    try {
      const r = await api.post(`/admin/verifikasi/${forceEndModal.id}/force-end`, {
        alasan: forceEndAlasan,
      });
      toast.success(r.data.message);
      setForceEndModal(null);
      setForceEndAlasan('');
      await refreshActiveSesi();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Force-end gagal.');
    } finally {
      setForceEndLoading(false);
    }
  }

  const filteredSantri = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return santri;
    return santri.filter((s) =>
      s.nis.toLowerCase().includes(q) || s.nama.toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q)
    );
  }, [santri, search]);

  const stats = useMemo(() => {
    const blockedCount = coverage.filter((c) => c.is_blocked).length;
    const totalOpen = coverage.reduce((s, c) => s + (c.qty_open || 0), 0);
    const avgCoverage = coverage.length
      ? Math.round(
          (coverage.reduce((s, c) => s + (c.coverage_pct || 0), 0) / coverage.length) * 10
        ) / 10
      : 0;
    const activeSesiCount = activeSesi.length;
    return { blockedCount, totalOpen, avgCoverage, activeSesiCount };
  }, [coverage, activeSesi]);

  async function startReset(s: Santri) {
    setResetModal({ nis: s.nis, nama: s.nama, poin: s.current_poin });
    setResetStep(1);
    try {
      const r = await api.post(`/reset/${s.nis}/start`);
      setResetId(r.data.reset.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal start reset.');
      setResetModal(null);
    }
  }

  async function confirmStep1() {
    if (!resetId) return;
    setResetLoading(true);
    try {
      await api.post(`/reset/${resetId}/step1`);
      setResetStep(2);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Step 1 gagal.');
    } finally {
      setResetLoading(false);
    }
  }

  async function applyReset() {
    if (!resetId || !resetModal) return;
    setResetLoading(true);
    try {
      const r = await api.post(`/reset/${resetId}/apply`);
      toast.success(r.data.message);
      setResetModal(null);
      setResetId(null);
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Apply gagal.');
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Layout
      title="Admin Kesantrian"
      titleShort="Admin"
      subtitle="Manajemen siswa, sesi aktif, & reset poin"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Users className="w-4 h-4" />} label="Total Siswa" value={santri.length} tone="default" />
        <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Blocked" value={stats.blockedCount} tone={stats.blockedCount > 0 ? 'danger' : 'success'} />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Sesi Aktif"
          value={stats.activeSesiCount}
          hint={stats.activeSesiCount > 0 ? 'sedang verifikasi' : 'tidak ada'}
          tone={stats.activeSesiCount > 0 ? 'warning' : 'default'}
        />
        <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Avg Coverage" value={`${stats.avgCoverage}%`} tone={stats.avgCoverage >= 80 ? 'success' : stats.avgCoverage >= 50 ? 'warning' : 'danger'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto scrollbar-thin">
        <button onClick={() => setTab('santri')} className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${tab === 'santri' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
          <UserCheck className="w-4 h-4" />Siswa
        </button>
        <button onClick={() => setTab('active')} className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${tab === 'active' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
          <Activity className="w-4 h-4" />Sesi Aktif
          {stats.activeSesiCount > 0 && <Badge tone="yellow">{stats.activeSesiCount}</Badge>}
        </button>
        <button onClick={() => setTab('coverage')} className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${tab === 'coverage' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
          <BarChart3 className="w-4 h-4" />Coverage
        </button>
        <button onClick={() => setTab('produk')} className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${tab === 'produk' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
          <Package className="w-4 h-4" />Produk
          {produkList.length > 0 && <Badge tone="gray">{produkList.length}</Badge>}
        </button>
      </div>

      {/* Tab: SISWA */}
      {tab === 'santri' && (
        <div className="card">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="input pl-10"
                placeholder="Cari NIS, nama, atau kelas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button onClick={refresh} className="btn btn-secondary text-sm">
              <RotateCcw className="w-4 h-4" />Refresh
            </button>
          </div>

          {filteredSantri.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="Tidak ada siswa" />
          ) : (
            <>
              {/* Mobile: card list. 6 kolom (termasuk 2 min-width) tidak muat di
                  360px, dan kolom "Aksi" jadi terpotong paling kanan — padahal
                  itu satu-satunya kolom interaktif. */}
              <ul className="md:hidden space-y-2">
                {filteredSantri.map((s) => (
                  <li key={s.nis} className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 text-sm truncate">{s.nama}</p>
                      <p className="text-xs text-slate-500 font-mono">{s.nis} | {s.kelas}</p>
                    </div>
                    <PoinBadge value={s.current_poin} />
                    {s.is_blocked ? (
                      <button onClick={() => startReset(s)} className="btn btn-primary text-xs shrink-0">
                        Reset
                      </button>
                    ) : (
                      <Badge tone="green" icon={<Check className="w-3 h-3" />}>Aktif</Badge>
                    )}
                  </li>
                ))}
              </ul>

              <div className="hidden md:block overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 px-3 font-medium">NIS</th>
                      <th className="py-2 px-3 font-medium">Nama</th>
                      <th className="py-2 px-3 font-medium">Kelas</th>
                      <th className="py-2 px-3 font-medium text-right min-w-[80px]">Poin</th>
                      <th className="py-2 px-3 font-medium text-left min-w-[100px]">Status</th>
                      <th className="font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSantri.map((s) => (
                      <tr key={s.nis} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-mono text-xs">{s.nis}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{s.nama}</td>
                        <td className="py-2 px-3">{s.kelas}</td>
                        <td className="py-2 px-3 text-right min-w-[80px]"><PoinBadge value={s.current_poin} /></td>
                        <td className="py-2 px-3 min-w-[110px]">
                          {s.is_blocked ? (
                            <Badge tone="red" icon={<AlertTriangle className="w-3 h-3" />}>BLOCKED</Badge>
                          ) : (
                            <Badge tone="green" icon={<Check className="w-3 h-3" />}>Aktif</Badge>
                          )}
                        </td>
                        <td className="text-right">
                          {s.is_blocked ? (
                            <button onClick={() => startReset(s)} className="btn btn-primary text-xs">
                              Reset
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: SESI AKTIF */}
      {tab === 'active' && (
        <div>
          <div className="card mb-4 bg-amber-50 border-amber-200 border">
            <div className="flex items-start gap-2">
              <Activity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-900">Real-time Monitoring</p>
                <p className="text-sm text-amber-700 mt-1">
                  Pantau sesi verifikasi yang sedang berjalan. Auto-refresh setiap 10 detik.
                  Admin bisa <strong>force-end</strong> sesi jika petugas stuck atau siswa salah datang.
                </p>
              </div>
              <button onClick={refreshActiveSesi} className="btn btn-secondary text-sm">
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
            </div>
          </div>

          {activeSesi.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-6 h-6" />}
              title="Tidak ada sesi aktif"
              description="Tidak ada petugas yang sedang verifikasi sekarang"
            />
          ) : (
            <div className="space-y-3">
              {activeSesi.map((sesi) => (
                <div
                  key={sesi.id}
                  className="card card-hover border-l-4 border-amber-400 animate-fade-in"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone="yellow">SESI #{sesi.id}</Badge>
                        <Badge tone="gray">
                          <Clock className="w-3 h-3" />
                          {new Date(sesi.waktu_mulai).toLocaleTimeString('id-ID')}
                        </Badge>
                        {sesi.is_blocked && <Badge tone="red">Siswa BLOCKED</Badge>}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Siswa</p>
                          <p className="font-semibold text-slate-800 truncate">{sesi.nama_siswa}</p>
                          <p className="text-xs text-slate-500">{sesi.kelas_siswa} | NIS {sesi.nis}</p>
                          <p className="text-xs mt-1">Poin: <PoinBadge value={sesi.current_poin_siswa} /></p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Petugas</p>
                          <p className="font-semibold text-slate-800 truncate">{sesi.nama_petugas}</p>
                          <p className="text-xs text-slate-500">ID #{sesi.petugas_id}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <span><strong>{sesi.items_count}</strong> items added</span>
                        <span className="text-slate-400">|</span>
                        <span>Δ poin uncommitted: <strong>{sesi.total_poin_change_uncommitted}</strong></span>
                        {sesi.last_item_at && (
                          <>
                            <span className="text-slate-400">|</span>
                            <span className="text-xs text-slate-500">
                              last item: {new Date(sesi.last_item_at).toLocaleTimeString('id-ID')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => viewLog(sesi.id)} className="btn btn-secondary text-sm" disabled={logLoading}>
                        {logLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        View Log
                      </button>
                      <button onClick={() => { setForceEndModal(sesi); setForceEndAlasan(''); }} className="btn btn-danger text-sm">
                        <StopCircle className="w-4 h-4" />
                        Force End
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: COVERAGE */}
      {tab === 'coverage' && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Coverage Rate per Santri</h3>
            <Badge tone="gray">Σ(match) / Σ(utang) × 100%</Badge>
          </div>
          {coverage.length === 0 ? (
            <EmptyState icon={<BarChart3 className="w-6 h-6" />} title="Tidak ada data" />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">NIS</th>
                    <th className="font-medium">Nama</th>
                    <th className="font-medium text-center">Open</th>
                    <th className="font-medium text-center">Settled</th>
                    <th className="font-medium text-center">Coverage</th>
                    <th className="font-medium text-right">Poin</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((c) => (
                    <tr key={c.nis} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 font-mono text-xs">{c.nis}</td>
                      <td>{c.nama}</td>
                      <td className="text-center">{c.qty_open}</td>
                      <td className="text-center">{c.qty_settled}</td>
                      <td className="text-center">
                        {c.coverage_pct !== null ? (
                          <Badge tone={c.coverage_pct >= 80 ? 'green' : c.coverage_pct >= 50 ? 'yellow' : 'red'}>
                            {c.coverage_pct}%
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="text-right"><PoinBadge value={c.current_poin} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: PRODUK */}
      {tab === 'produk' && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Daftar Produk Kantin</h3>
            <Badge tone="gray">{produkList.length} produk</Badge>
          </div>
          {produkList.length === 0 ? (
            <EmptyState icon={<Package className="w-6 h-6" />} title="Tidak ada produk" />
          ) : (
            <>
              {/* Mobile: card list — 6 kolom tidak muat di 360px. */}
              <ul className="md:hidden space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {produkList.map((p) => (
                  <li key={p.barcode} className={`border border-slate-200 rounded-lg p-3 ${p.archived_at ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 text-sm truncate">{p.nama_produk}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">{p.barcode}</p>
                        {p.kategori?.nama_kategori && (
                          <p className="text-xs text-slate-400 truncate">{p.kategori.nama_kategori}</p>
                        )}
                      </div>
                      {p.archived_at ? <Badge tone="red">Archived</Badge> : <Badge tone="green">Aktif</Badge>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {p.is_excluded_from_debit
                        ? <Badge tone="yellow">Non-Plastik</Badge>
                        : <Badge tone="blue">Plastik</Badge>}
                      <button
                        onClick={() => setProdukLogModal({ barcode: p.barcode, name: p.nama_produk })}
                        aria-label={`Lihat log masuk keluar ${p.nama_produk}`}
                        className="btn btn-secondary text-xs"
                      >
                        <Eye className="w-3 h-3" />Lihat Log
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block overflow-x-auto max-h-[600px] scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                  <tr>
                    <th className="py-2 font-medium">Barcode</th>
                    <th className="font-medium">Nama</th>
                    <th className="font-medium">Kategori</th>
                    <th className="font-medium text-center">Tipe</th>
                    <th className="font-medium text-center">Status</th>
                    <th className="font-medium text-right">Log</th>
                  </tr>
                </thead>
                <tbody>
                  {produkList.map((p) => (
                    <tr key={p.barcode} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${p.archived_at ? 'opacity-60' : ''}`}>
                      <td className="py-2 font-mono text-xs">{p.barcode}</td>
                      <td className="font-medium">{p.nama_produk}</td>
                      <td className="text-xs text-slate-600">{p.kategori?.nama_kategori ?? '—'}</td>
                      <td className="text-center">
                        {p.is_excluded_from_debit
                          ? <Badge tone="yellow">Non-Plastik</Badge>
                          : <Badge tone="blue">Plastik</Badge>}
                      </td>
                      <td className="text-center">
                        {p.archived_at
                          ? <Badge tone="red">Archived</Badge>
                          : <Badge tone="green">Aktif</Badge>}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => setProdukLogModal({ barcode: p.barcode, name: p.nama_produk })}
                          className="btn btn-secondary text-xs"
                          title="Lihat log masuk/keluar"
                        >
                          <Eye className="w-3 h-3" />Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Reset Modal */}
      <Modal
        open={!!resetModal}
        onClose={() => { setResetModal(null); setResetStep(1); }}
        title="Reset Poin Siswa"
        size="md"
        footer={
          resetStep === 1 ? (
            <>
              <button onClick={() => { setResetModal(null); setResetStep(1); }} className="btn btn-secondary flex-1">
                <X className="w-4 h-4" />Batal
              </button>
              <button onClick={confirmStep1} disabled={resetLoading} className="btn btn-primary flex-1">
                {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Sudah Bayar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setResetModal(null); setResetStep(1); }} className="btn btn-secondary flex-1">
                <X className="w-4 h-4" />Batal
              </button>
              <button onClick={applyReset} disabled={resetLoading} className="btn btn-danger flex-1">
                {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Apply Reset
              </button>
            </>
          )
        }
      >
        {resetModal && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-sm text-slate-500">Siswa</p>
              <p className="font-semibold text-slate-800">{resetModal.nama}</p>
              <p className="text-xs text-slate-500">{resetModal.nis}</p>
              <p className="text-sm mt-2">Poin saat ini: <PoinBadge value={resetModal.poin} /></p>
            </div>

            {resetStep === 1 ? (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900">Step 1: Konfirmasi Pembayaran Denda</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Pastikan siswa sudah membayar denda kepada Admin Kesantrian. Klik "Sudah Bayar" untuk lanjut.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900">Step 2: Apply Reset</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Poin akan dikembalikan ke <strong>0</strong> dan siswa di-unblock.
                    </p>
                    <p className="text-xs text-amber-600 mt-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      <span><strong>Hutang terbuka tetap OPEN</strong>. Siswa harus return sampah secara bertahap.</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* View Log Modal */}
      <Modal
        open={!!logModal}
        onClose={() => setLogModal(null)}
        title="Log Sesi Verifikasi"
        description={logModal ? `Sesi #${logModal.sesi.id} | ${logModal.sesi.nama_petugas} memverifikasi pembuangan ${logModal.sesi.nama_siswa}` : ''}
        size="lg"
        footer={
          <button onClick={() => setLogModal(null)} className="btn btn-secondary flex-1">
            <X className="w-4 h-4" />Tutup
          </button>
        }
      >
        {logModal && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Siswa</p>
                <p className="font-semibold text-slate-800">{logModal.sesi.nama_siswa}</p>
                <p className="text-xs text-slate-500">{logModal.sesi.kelas_siswa} | NIS {logModal.sesi.nis}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Petugas</p>
                <p className="font-semibold text-slate-800">{logModal.sesi.nama_petugas}</p>
                <p className="text-xs text-slate-500">ID #{logModal.sesi.petugas_id}</p>
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Waktu mulai: <strong>{new Date(logModal.sesi.waktu_mulai).toLocaleString('id-ID')}</strong></span>
                <span>Waktu selesai: <strong>{logModal.sesi.waktu_selesai ? new Date(logModal.sesi.waktu_selesai).toLocaleString('id-ID') : '— (open)'}</strong></span>
              </div>
            </div>

            {logModal.items.length === 0 ? (
              <EmptyState icon={<FileText className="w-6 h-6" />} title="Belum ada item" />
            ) : (
              <div className="overflow-x-auto scrollbar-thin max-h-96">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                    <tr>
                      <th className="py-2 font-medium">Waktu</th>
                      <th className="font-medium">Produk</th>
                      <th className="font-medium text-center">In</th>
                      <th className="font-medium text-center">Match</th>
                      <th className="font-medium text-center">Excess</th>
                      <th className="font-medium text-center">Short</th>
                      <th className="font-medium text-right">Δ Poin</th>
                      <th className="font-medium text-right">Bukti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logModal.items.map((it) => (
                      <tr key={it.id} className="border-b border-slate-100">
                        <td className="py-1.5 text-xs">{new Date(it.created_at).toLocaleTimeString('id-ID')}</td>
                        <td>
                          <p className="font-mono text-xs">{it.barcode}</p>
                          <p className="text-xs text-slate-500">{it.nama_produk}</p>
                        </td>
                        <td className="text-center">{it.qty_in}</td>
                        <td className="text-center text-green-700 font-medium">{it.qty_matched}</td>
                        <td className="text-center">{it.qty_excess}</td>
                        <td className={`text-center ${it.qty_shortfall > 0 ? 'text-red-600' : ''}`}>{it.qty_shortfall}</td>
                        <td className="text-right font-medium text-green-700">+{it.poin_delta}</td>
                        <td className="text-right">
                          {it.foto_bukti_url ? (
                            <a
                              href={it.foto_bukti_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline underline-offset-2"
                              title={it.catatan || 'Lihat foto bukti barcode'}
                            >
                              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                              Bukti
                            </a>
                          ) : (
                            <span className="text-xs text-slate-300" aria-hidden="true">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ringkasan item yang punya bukti — supaya admin tidak perlu
                scour tabel mencari tahu ada sengketa atau tidak. */}
            {logModal.items.some((it) => it.foto_bukti_url || it.catatan) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Item dengan bukti / catatan
                </p>
                {logModal.items.filter((it) => it.foto_bukti_url || it.catatan).map((it) => (
                  <div
                    key={`bukti-${it.id}`}
                    className="flex items-start gap-2.5 text-xs rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2"
                  >
                    <ImageIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-amber-900">
                        {it.barcode} — {it.nama_produk}
                      </p>
                      {it.catatan && <p className="text-amber-800 mt-0.5">{it.catatan}</p>}
                      {it.foto_bukti_url && (
                        <a
                          href={it.foto_bukti_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-amber-900 hover:underline underline-offset-2"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          Lihat foto barcode
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Force-End Modal */}
      <Modal
        open={!!forceEndModal}
        onClose={() => { setForceEndModal(null); setForceEndAlasan(''); }}
        title="Force-End Sesi Verifikasi"
        description={forceEndModal ? `Sesi #${forceEndModal.id} | ${forceEndModal.nama_petugas} memverifikasi pembuangan ${forceEndModal.nama_siswa}` : ''}
        size="md"
        footer={
          <>
            <button onClick={() => { setForceEndModal(null); setForceEndAlasan(''); }} className="btn btn-secondary flex-1">
              <X className="w-4 h-4" />Batal
            </button>
            <button onClick={submitForceEnd} disabled={forceEndLoading || forceEndAlasan.length < 10} className="btn btn-danger flex-1">
              {forceEndLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              Force-End Sesi
            </button>
          </>
        }
      >
        {forceEndModal && (
          <div className="space-y-3">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Tindakan Force-End</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Sesi akan di-close paksa. Items yang sudah di-add oleh petugas <strong>TIDAK akan diproses</strong> ke poin saldo — siswa tidak dapat poin apapun dari sesi ini.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                     Items akan tercatat di log sebagai uncommitted (untuk audit).
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500">Siswa</p>
                  <p className="font-medium">{forceEndModal.nama_siswa}</p>
                  <p className="text-xs text-slate-500">{forceEndModal.kelas_siswa} | {forceEndModal.nis}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Petugas</p>
                  <p className="font-medium">{forceEndModal.nama_petugas}</p>
                  <p className="text-xs text-slate-500">{forceEndModal.items_count} items | Δ poin uncommitted: {forceEndModal.total_poin_change_uncommitted}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <span className="inline-flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  Alasan <span className="text-red-500">*</span>
                </span>
                <span className="text-xs text-slate-500 font-normal ml-2">(min 10 char | template atau manual)</span>
              </label>
              <div className="relative mb-2">
                <select
                  className="input appearance-none pr-9 cursor-pointer"
                  value={FORCE_END_TEMPLATES.find((t) => t.label === forceEndAlasan)?.id ?? ''}
                  onChange={(e) => {
                    const tpl = FORCE_END_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) setForceEndAlasan(tpl.label);
                  }}
                >
                  <option value="">— Pilih template (atau tulis manual di bawah) —</option>
                  {FORCE_END_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              <textarea
                className="input"
                rows={3}
                value={forceEndAlasan}
                onChange={(e) => setForceEndAlasan(e.target.value)}
                placeholder="Pilih template di atas, atau ketik alasan manual..."
              />
              <div className="flex items-center justify-between mt-1">
                <p className={`text-xs ${forceEndAlasan.length < 10 ? 'text-slate-500' : 'text-green-600'}`}>
                  {forceEndAlasan.length} / 10 char minimum
                </p>
                {forceEndAlasan.length >= 10 && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" />Siap submit
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Product Log Modal */}
      {produkLogModal && (
        <Suspense fallback={<ModalFallback />}>
          <ProductLogModal
            barcode={produkLogModal.barcode}
            productName={produkLogModal.name}
            open={!!produkLogModal}
            onClose={() => setProdukLogModal(null)}
          />
        </Suspense>
      )}
    </Layout>
  );
}
