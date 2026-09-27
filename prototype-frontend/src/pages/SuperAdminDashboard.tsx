import { useEffect, useMemo, useState, type ReactNode } from 'react';
import api, { type Reward, type RewardFilter } from '../api/client';
import { DashboardLayout, type DashboardNavGroup } from '../components/DashboardLayout';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/Skeleton';
import { RewardManagerModal } from '../components/RewardManagerModal';
import { RewardManagerList } from '../components/RewardManagerList';
import { useConfirm } from '../hooks/useConfirm';
import {
  Activity, Users, Settings, BarChart3, FileText, Shield, AlertTriangle,
  Power, Lock, RefreshCw, Trash2, RotateCcw, ChevronRight, Loader2,
  Database, HardDrive, Bug, X, CheckCircle2, Eye, UserCog, Coins, TrendingDown, Clock, Search
} from 'lucide-react';

interface ConfigEntry {
  key: string;
  label: string;
  description: string;
  value: number;
  type: 'number';
  min: number;
  max: number;
}

interface HealthData {
  db_size_kb: number;
  photo_storage_kb: number;
  total_active_santri: number;
  total_staff: number;
  recent_error_logs_count: number;
  modes: { is_maintenance: boolean; is_readonly: boolean };
  config: ConfigEntry[];
  checked_at: string;
}

type TabId = 'health' | 'users' | 'rewards' | 'config' | 'audit' | 'coverage' | 'tier3';

/** Jam saja (HH:MM) — dipakai sebagai value StatCard "Last Check" supaya
 *  muat di kartu 2-kolom mobile tanpa terpotong. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** "2 menit lalu" — memberi tahu apakah data health masih segar. Di bawah
 *  1 menit tetap "baru saja" supaya tidak flickering tiap re-render. */
function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/**
 * Baris kontrol mode dengan switch sungguhan.
 *
 * Sebelumnya pakai `flex items-center justify-between` dengan tombol
 * "Turn ON"/"Turn OFF". Di 360px yang sempit, deskripsi panjang memakan lebar
 * dan tombolnya tergencet. Sekarang baris tetap (label kiri, switch kanan
 * selalu terlihat) tapi switch punya target tap 48×44px — cukup untuk ibu jari,
 * plus `aria-checked` supaya terbaca screen reader sebagai on/off, bukan
 * sekadar tombol yang mengganti teks.
 */
const MODE_TONE = {
  red: {
    chip: 'bg-red-100 text-red-600',
    track: 'bg-red-600',
    row: 'border-red-200 bg-red-50/40',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-600',
    track: 'bg-amber-500',
    row: 'border-amber-200 bg-amber-50/40',
  },
} as const;

function ModeRow({
  icon,
  label,
  description,
  active,
  onToggle,
  tone,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  tone: keyof typeof MODE_TONE;
}) {
  const t = MODE_TONE[tone];
  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
      active ? t.row : 'border-slate-200'
    }`}>
      <div className={`p-2 rounded-lg shrink-0 ${active ? t.chip : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800 text-sm">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {/* Tombol (target sentuh) lebih besar dari track visual, supaya area
          44px+t gotten by ibu jari sementara track tetap ramping. */}
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${label} — ${active ? 'aktif, ketuk untuk matikan' : 'nonaktif, ketuk untuk nyalakan'}`}
        onClick={onToggle}
        className="shrink-0 inline-flex items-center justify-center w-12 h-11 -mr-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-95 transition-transform"
      >
        <span
          aria-hidden="true"
          className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            active ? t.track : 'bg-slate-300'
          }`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            active ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`} />
        </span>
      </button>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const toast = useToast();
  const { confirm, prompt, ConfirmUI } = useConfirm();
  const [tab, setTab] = useState<TabId>('health');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [coverage, setCoverage] = useState<any[]>([]);
  const [reverseModal, setReverseModal] = useState(false);
  const [reverseAlasan, setReverseAlasan] = useState('');
  const [reversePassword, setReversePassword] = useState('');
  const [reverseTxId, setReverseTxId] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);

  // Reward management state
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [rewardSearch, setRewardSearch] = useState('');
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  // Filter user happening lokal (bukan server-side) supaya ketikan terasa
  // instan dan tidak menembak request per ketukan.
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'suspended'>('all');

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshRewards() {
    setRewardsLoading(true);
    try {
      const params = new URLSearchParams();
      if (rewardFilter !== 'all') params.set('status', rewardFilter);
      if (rewardSearch.trim()) params.set('q', rewardSearch.trim());
      const r = await api.get(`/reward/admin?${params.toString()}`);
      setRewards(r.data.data || []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal load reward.');
    } finally {
      setRewardsLoading(false);
    }
  }

  async function refreshAll() {
    try {
      const [h, u, a, c] = await Promise.all([
        api.get('/super-admin/health'),
        api.get('/super-admin/users'),
        api.get('/super-admin/audit/search'),
        api.get('/super-admin/coverage'),
      ]);
      setHealth(h.data);
      setUsers(u.data.data || []);
      setAuditLogs(a.data.data || []);
      setCoverage(c.data.data || []);
    } catch {
      toast.error('Gagal load data.');
    }
  }

  // Auto-refresh rewards when filter/search changes
  useEffect(() => {
    if (tab === 'rewards') {
      const t = setTimeout(refreshRewards, 200); // debounce search
      return () => clearTimeout(t);
    }
  }, [tab, rewardFilter, rewardSearch]);

  async function toggleMode(key: 'is_maintenance' | 'is_readonly', value: boolean) {
    try {
      await api.post('/super-admin/mode', { key, value });
      toast.success(`${key} = ${value ? 'ON' : 'OFF'}`);
      const h = await api.get('/super-admin/health');
      setHealth(h.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal toggle.');
    }
  }

  async function toggleSuspend(userId: number, currentSuspended: boolean) {
    if (currentSuspended) {
      const ok = await confirm({
        title: 'Buka akses user ini?',
        description: 'User akan bisa login dan melakukan aktivitas seperti semula kembali.',
        confirmText: 'Ya, Unsuspend',
        tone: 'info',
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: 'Suspend user ini?',
        description:
          'Semua akses user ini akan langsung dicabut: sesi di perangkatnya logout paksa, dan login berikutnya ditolak. User tidak akan bisa melakukan transaksi, pengembalian, redeem reward, maupun mengubah profil sampai di-unsuspend.',
        confirmText: 'Ya, Suspend',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const r = await api.post(`/super-admin/users/${userId}/toggle-suspend`);
      const revoked = r.data?.tokens_revoked ?? 0;
      toast.success(
        currentSuspended
          ? `User ${userId} di-unsuspend.`
          : `User ${userId} di-suspend.${revoked > 0 ? ` ${revoked} device langsung di-logout.` : ''}`
      );
      const u = await api.get('/super-admin/users');
      setUsers(u.data.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal.');
    }
  }

  async function forceLogout(userId: number) {
    const ok = await confirm({
      title: 'Force Logout User?',
      description: 'Semua device user ini akan di-logout paksa. Token Sanctum akan di-revoke.',
      confirmText: 'Ya, Logout',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      const r = await api.post(`/super-admin/users/${userId}/force-logout`);
      toast.success(r.data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal.');
    }
  }

  async function resetPassword(userId: number) {
    const newPw = await prompt({
      title: 'Reset Password User',
      description: 'Password baru minimal 8 karakter. User harus ganti password ini di login berikutnya.',
      label: 'Password Baru',
      placeholder: 'Minimal 8 karakter',
      type: 'password',
      tone: 'warning',
      confirmText: 'Reset',
      validate: (val) => {
        if (!val || val.length < 8) return 'Password minimal 8 karakter.';
        return undefined;
      },
    });
    if (!newPw) return;
    try {
      await api.post(`/super-admin/users/${userId}/reset-password`, { new_password: newPw });
      toast.success(`Password user ${userId} sudah di-reset.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal.');
    }
  }

  async function runCron() {
    const ok = await confirm({
      title: 'Trigger Archive-Audit Cron?',
      description: 'Cron akan archive audit_logs yang lebih dari retention period.',
      confirmText: 'Jalankan Sekarang',
      tone: 'info',
    });
    if (!ok) return;
    try {
      const r = await api.post('/super-admin/cron/run');
      toast.success('Cron: ' + (r.data.message || 'OK'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Cron gagal.');
    }
  }

  async function submitReverse() {
    if (reverseAlasan.length < 30) {
      toast.error('Alasan minimal 30 karakter.');
      return;
    }
    if (!reversePassword || !reverseTxId) {
      toast.error('Password re-verifikasi wajib diisi.');
      return;
    }
    setReverseLoading(true);
    try {
      const r = await api.post(`/super-admin/reverse-transaction/${parseInt(reverseTxId)}`, {
        alasan: reverseAlasan,
        password_reverify: reversePassword,
      });
      toast.success(r.data.message);
      setReverseModal(false);
      setReverseAlasan(''); setReversePassword(''); setReverseTxId('');
      refreshAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Reverse gagal.');
    } finally {
      setReverseLoading(false);
    }
  }

  /**
   * Pencarian user: substring match (bukan prefix) supaya "santri" tetap
   * menemukan role `santri` di tengah string, dan `admin` menemukan
   * `super_admin_tier3`. Pencocokan dilakukan case-insensitive terhadap
   * name, email, role, dan id — keempatnya yang mungkin diketik admin saat
   * ia tahu identifier yang dicari, tapi tidak ingat persis ejaannya.
   */
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter === 'suspended' && !u.suspended_at) return false;
      if (!q) return true;
      return [u.name, u.email, u.role, String(u.id)]
        .some((f) => String(f ?? '').toLowerCase().includes(q));
    });
  }, [users, userSearch, userRoleFilter]);

  const hasUserFilter = userSearch.trim() !== '' || userRoleFilter !== 'all';

  // Sidebar nav config — flat list (simplified, no section groups).
  // `shortLabel` dipakai oleh mobile tab strip; sidebar desktop pakai `label`
  // penuh karena di 240px lebarnya masih muat comfortably.
  const nav: DashboardNavGroup[] = [
    {
      items: [
        { id: 'health',   label: 'System Health',  shortLabel: 'Health',     icon: Activity },
        { id: 'users',    label: 'Users',          shortLabel: 'Users',      icon: Users,     badge: users.length },
        { id: 'rewards',  label: 'Catalog Reward', shortLabel: 'Reward',     icon: Coins,     badge: rewards.length },
        { id: 'config',   label: 'Configuration',  shortLabel: 'Config',     icon: Settings },
        { id: 'coverage', label: 'Coverage',       shortLabel: 'Coverage',   icon: BarChart3, badge: coverage.length },
        { id: 'audit',    label: 'Audit Log',      shortLabel: 'Audit',      icon: FileText,  badge: auditLogs.length },
        { id: 'tier3',    label: 'Tier 3',         shortLabel: 'Tier 3',     icon: Shield },
      ],
    },
  ];

  return (
    <DashboardLayout
      title="Super Admin Dashboard"
      titleShort="Super Admin"
      subtitle="Operational tools & investigation"
      nav={nav}
      activeId={tab}
      onNavigate={(id) => setTab(id as TabId)}
      headerActions={
        <>
          <a
            href="/super/users"
            className="btn btn-primary text-sm w-10 sm:w-auto px-0 sm:px-4"
            aria-label="Kelola user"
            title="User Management"
          >
            <UserCog className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">User Management</span>
          </a>
          <button
            onClick={refreshAll}
            className="btn btn-ghost text-sm w-10 px-0"
            title="Refresh"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        </>
      }
    >
      {/* Mode banners */}
      {health?.modes.is_maintenance && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r mb-4 flex items-center gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">Maintenance mode aktif — semua writes non-super-admin blocked.</span>
        </div>
      )}
      {health?.modes.is_readonly && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 p-3 rounded-r mb-4 flex items-center gap-3 animate-fade-in">
          <Lock className="w-5 h-5" />
          <span className="font-medium">Read-only mode aktif — admin/staff tidak bisa write. Reverse transactions (Tier 3) enabled.</span>
        </div>
      )}


      {tab === 'health' && health && (
        <div className="space-y-4">
          {/* System Modes — dulu berstatus StatCard read-only "Maintenance: OFF /
              Read-only: OFF", padahal dua kontrol ini adalah kill switch
              system-wide. Sekarang jadi switch sungguhan: state terlihat dari
              warna, dan target tap-nya 44px (bukan badge kecil di dalam kartu). */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Power className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
              <h2 className="font-semibold text-slate-800 text-sm">System Modes</h2>
            </div>
            <div className="space-y-2">
              <ModeRow
                icon={<Power className="w-4 h-4" />}
                label="Maintenance Mode"
                description="Block semua writes dari non-super-admin"
                active={health.modes.is_maintenance}
                onToggle={() => toggleMode('is_maintenance', !health.modes.is_maintenance)}
                tone="red"
              />
              <ModeRow
                icon={<Lock className="w-4 h-4" />}
                label="Read-Only Mode"
                description="Wajib ON sebelum reverse transactions"
                active={health.modes.is_readonly}
                onToggle={() => toggleMode('is_readonly', !health.modes.is_readonly)}
                tone="amber"
              />
            </div>
          </div>

          {/* 6 stat card = 3 baris rapi di grid 2-kolom mobile.
              Sebelumnya grid 1-kolom di <md sehingga jadi 6 baris penuh
              (±540px scroll untuk 6 angka). */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <StatCard compact icon={<Database className="w-5 h-5" />} label="Database Size" value={`${health.db_size_kb.toFixed(1)} KB`} />
            <StatCard compact icon={<HardDrive className="w-5 h-5" />} label="Photo Storage" value={`${health.photo_storage_kb} KB`} />
            <StatCard compact icon={<Users className="w-5 h-5" />} label="Active Santri" value={health.total_active_santri} tone="success" />
            <StatCard compact icon={<Users className="w-5 h-5" />} label="Staff + Petugas" value={health.total_staff} />
            <StatCard
              compact
              icon={<Bug className="w-5 h-5" />}
              label="Errors (1 jam)"
              value={health.recent_error_logs_count}
              tone={health.recent_error_logs_count > 0 ? 'danger' : 'success'}
            />
            <StatCard
              compact
              icon={<Clock className="w-5 h-5" />}
              label="Last Check"
              value={formatClock(health.checked_at)}
              hint={timeAgo(health.checked_at)}
            />
          </div>
        </div>
      )}

      {tab === 'rewards' && (
        <div className="space-y-4">
          <RewardManagerList
            rewards={rewards}
            loading={rewardsLoading}
            filter={rewardFilter}
            onFilterChange={setRewardFilter}
            search={rewardSearch}
            onSearchChange={setRewardSearch}
            onAdd={() => { setEditingReward(null); setRewardModalOpen(true); }}
            onEdit={(r) => { setEditingReward(r); setRewardModalOpen(true); }}
            onRefresh={refreshRewards}
            onArchive={async (r) => {
              const ok = await confirm({
                title: 'Archive Reward?',
                description: `Reward "${r.nama_reward}" akan disembunyikan dari catalog Santri. Bisa di-restore nanti.`,
                confirmText: 'Ya, Archive',
                tone: 'warning',
              });
              if (!ok) return;
              try {
                await api.post(`/reward/${r.id_reward}/archive`);
                toast.success(`Reward "${r.nama_reward}" di-archive.`);
                refreshRewards();
              } catch (e: any) {
                toast.error(e.response?.data?.message || 'Archive gagal.');
              }
            }}
            onRestore={async (r) => {
              const ok = await confirm({
                title: 'Restore Reward?',
                description: `Reward "${r.nama_reward}" akan dikembalikan ke catalog Santri dengan status aktif.`,
                confirmText: 'Ya, Restore',
                tone: 'info',
              });
              if (!ok) return;
              try {
                await api.post(`/reward/${r.id_reward}/restore`);
                toast.success(`Reward "${r.nama_reward}" dipulihkan.`);
                refreshRewards();
              } catch (e: any) {
                toast.error(e.response?.data?.message || 'Restore gagal.');
              }
            }}
            onToggleActive={async (r) => {
              const next = !r.status_aktif;
              const ok = await confirm({
                title: next ? 'Aktifkan Reward?' : 'Nonaktifkan Reward?',
                description: `Reward "${r.nama_reward}" akan di-${next ? 'aktifkan (Santri bisa redeem)' : 'nonaktifkan (Santri tidak bisa redeem)'} — tanpa meng-archive.`,
                confirmText: next ? 'Aktifkan' : 'Nonaktifkan',
                tone: 'info',
              });
              if (!ok) return;
              try {
                await api.post(`/reward/${r.id_reward}/toggle-active`);
                toast.success(`Reward "${r.nama_reward}" sekarang ${next ? 'aktif' : 'non-aktif'}.`);
                refreshRewards();
              } catch (e: any) {
                toast.error(e.response?.data?.message || 'Gagal toggle.');
              }
            }}
          />

          <RewardManagerModal
            open={rewardModalOpen}
            reward={editingReward}
            onClose={() => setRewardModalOpen(false)}
            onSaved={refreshRewards}
          />
        </div>
      )}

      {tab === 'config' && (
        <div className="card space-y-4">
          {/* Mode Toggle dipindah ke System Health (satu-satunya tempat) supaya
              tidak ada dua kontrol untuk hal yang sama di tab berbeda. */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Threshold Poin
            </h3>
            <p className="text-sm text-slate-500 mb-3">
              Atur batas minimum poin. Santri otomatis ter-block saat saldo turun ke nilai ini.
            </p>

            {health?.config && health.config.length > 0 ? (
              <div className="space-y-3">
                {health.config.map((cfg) => (
                  <ConfigRow
                    key={cfg.key}
                    entry={cfg}
                    onSaved={refreshAll}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">Memuat konfigurasi...</div>
            )}
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><RotateCcw className="w-4 h-4" />Manual Cron Trigger</h3>
            <p className="text-sm text-slate-500 mb-3">Archive current month audit logs + purge archive bulan sebelumnya.</p>
            <button onClick={runCron} className="btn btn-secondary">Run amanah:archive-audit</button>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          {/* flex-col (bukan reverse) supaya urutan visual = urutan DOM:
              heading meng-label control, lalu control, lalu konten. Heading
              cuma satu baris ~24px, jadi search bar tetap di layar pertama. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4" />
              All Users
              {/* Saat filter aktif, angka total disembunyikan agar tidak
                  disalahbaca sebagai jumlah hasil pencarian. */}
              {hasUserFilter
                ? <Badge tone="blue">{filteredUsers.length} / {users.length}</Badge>
                : <Badge tone="gray">{users.length}</Badge>}
            </h3>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Cari nama, email, role..."
                  aria-label="Cari user berdasarkan nama, email, role, atau ID"
                  className="w-full sm:w-56 pl-8 pr-8 py-2 text-sm border border-slate-300 rounded-lg bg-white transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                />
                {userSearch && (
                  <button
                    type="button"
                    onClick={() => setUserSearch('')}
                    aria-label="Bersihkan pencarian"
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setUserRoleFilter((f) => (f === 'all' ? 'suspended' : 'all'))}
                aria-pressed={userRoleFilter === 'suspended'}
                className={`shrink-0 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  userRoleFilter === 'suspended'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Suspended
              </button>
            </div>
          </div>

          {users.length === 0 ? (
            <EmptyState icon={<Users className="w-6 h-6" />} title="Tidak ada user" />
          ) : filteredUsers.length === 0 ? (
            /* Filter aktif tapi tidak ada yang cocok — bedakan dari "tidak ada
               user sama sekali", karena aksi yang tepat berbeda (longgar filter
               vs menunggu data). */
            <EmptyState
              icon={<Search className="w-6 h-6" />}
              title="Tidak ada user yang cocok"
              description={`Tidak ada user yang cocok dengan filter aktif dari total ${users.length} user.`}
              action={
                <button onClick={() => { setUserSearch(''); setUserRoleFilter('all'); }} className="btn btn-secondary text-xs">
                  Reset filter
                </button>
              }
            />
          ) : (
            <>
              {/* Mobile: card list. Tabel 6 kolom di 360px memaksa scroll
                  horizontal tanpa ada affordance-nya, dan 3 tombol aksi per baris
                  jadi terlalu sempit untuk diketuk dengan benar. */}
              <ul className="md:hidden space-y-2.5 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {filteredUsers.map((u) => (
                  <li key={u.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 text-sm truncate">{u.name}</p>
                          <p className="text-xs text-slate-500 truncate">{u.email ?? '—'} | #{u.id}</p>
                        </div>
                        {u.suspended_at
                          ? <Badge tone="red">SUSPENDED</Badge>
                          : <Badge tone="green">Aktif</Badge>}
                      </div>
                      <div className="mt-1.5">
                        <Badge tone="gray">{u.role}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1.5 border-t border-slate-100 bg-slate-50 p-2">
                      <button
                        onClick={() => toggleSuspend(u.id, !!u.suspended_at)}
                        aria-label={`${u.suspended_at ? 'Unsuspend' : 'Suspend'} ${u.name}`}
                        className="btn btn-secondary text-xs flex-1 px-2 min-w-0"
                      >
                        {u.suspended_at ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        onClick={() => resetPassword(u.id)}
                        aria-label={`Reset password ${u.name}`}
                        className="btn btn-secondary text-xs flex-1 px-2 min-w-0"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => forceLogout(u.id)}
                        aria-label={`Force logout ${u.name}`}
                        className="btn btn-danger text-xs flex-1 px-2 min-w-0"
                      >
                        Logout
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* md+ : tabel penuh — 6 kolom muat nyaman di ≥768px. */}
              <div className="hidden md:block overflow-x-auto scrollbar-thin max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                    <tr>
                      <th className="py-2 font-medium">ID</th>
                      <th className="font-medium">Name</th>
                      <th className="font-medium">Email</th>
                      <th className="font-medium">Role</th>
                      <th className="font-medium">Status</th>
                      <th className="font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2">{u.id}</td>
                        <td className="font-medium">{u.name}</td>
                        <td className="text-xs">{u.email ?? '—'}</td>
                        <td><Badge tone="gray">{u.role}</Badge></td>
                        <td>
                          {u.suspended_at ? <Badge tone="red">SUSPENDED</Badge> : <Badge tone="green">Aktif</Badge>}
                        </td>
                        <td className="text-right space-x-1">
                          <button onClick={() => toggleSuspend(u.id, !!u.suspended_at)} className="btn btn-secondary text-xs">
                            {u.suspended_at ? 'Unsuspend' : 'Suspend'}
                          </button>
                          <button onClick={() => resetPassword(u.id)} className="btn btn-secondary text-xs">Reset PW</button>
                          <button onClick={() => forceLogout(u.id)} className="btn btn-danger text-xs">Logout</button>
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

      {tab === 'coverage' && (
        <div className="card">
          <h3 className="font-semibold text-slate-800 mb-3">Coverage per Santri</h3>
          {coverage.length === 0 ? (
            <EmptyState icon={<BarChart3 className="w-6 h-6" />} title="Tidak ada data" />
          ) : (
            <>
              {/* Mobile: card list — 6 kolom numerik tidak muat di 360px. */}
              <ul className="md:hidden space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {coverage.map((c: any) => (
                  <li key={c.nis} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 text-sm truncate">{c.nama}</p>
                        <p className="text-xs text-slate-500 font-mono">{c.nis}</p>
                      </div>
                      {c.coverage_pct !== null ? (
                        <Badge tone={c.coverage_pct >= 80 ? 'green' : c.coverage_pct >= 50 ? 'yellow' : 'red'}>
                          {c.coverage_pct}%
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </div>
                    <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 rounded-md py-1.5">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-500">Open</dt>
                        <dd className="text-sm font-semibold text-slate-800 tabular-nums">{c.qty_open}</dd>
                      </div>
                      <div className="bg-slate-50 rounded-md py-1.5">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-500">Settled</dt>
                        <dd className="text-sm font-semibold text-slate-800 tabular-nums">{c.qty_settled}</dd>
                      </div>
                      <div className="bg-slate-50 rounded-md py-1.5">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-500">Poin</dt>
                        <dd className={`text-sm font-semibold tabular-nums ${
                          c.current_poin < 0 ? 'text-red-600' : c.current_poin > 0 ? 'text-green-600' : 'text-slate-800'
                        }`}>
                          {c.current_poin > 0 ? `+${c.current_poin}` : c.current_poin}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block overflow-x-auto scrollbar-thin max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                    <tr><th className="py-2 font-medium">NIS</th><th className="font-medium">Nama</th><th className="font-medium text-center">Open</th><th className="font-medium text-center">Settled</th><th className="font-medium text-center">Coverage</th><th className="font-medium text-right">Poin</th></tr>
                  </thead>
                  <tbody>
                    {coverage.map((c: any) => (
                      <tr key={c.nis} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 font-mono text-xs">{c.nis}</td>
                        <td>{c.nama}</td>
                        <td className="text-center">{c.qty_open}</td>
                        <td className="text-center">{c.qty_settled}</td>
                        <td className="text-center">
                          {c.coverage_pct !== null ? (
                            <Badge tone={c.coverage_pct >= 80 ? 'green' : c.coverage_pct >= 50 ? 'yellow' : 'red'}>{c.coverage_pct}%</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="text-right">{c.current_poin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />Audit Log <Badge tone="gray">50 terakhir</Badge>
          </h3>
          {auditLogs.length === 0 ? (
            <EmptyState icon={<FileText className="w-6 h-6" />} title="Belum ada log" />
          ) : (
            <>
              {/* Mobile: card list. Payload JSON adalah kolom terpanjang dan
                  selalu ter-truncate di tabel — di card list ia dibungkus
                  2 baris + expandable, jadi tetap terbaca. */}
              <ul className="md:hidden space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {auditLogs.map((l: any) => (
                  <li key={l.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {new Date(l.waktu).toLocaleString('id-ID')}
                      </span>
                      <Badge tone="gray">{l.role}</Badge>
                    </div>
                    <p className="font-mono text-xs text-slate-800 mt-1.5 break-all">{l.action}</p>
                    <p className="font-mono text-[11px] text-slate-500 mt-1 break-all line-clamp-3">
                      {JSON.stringify(l.payload)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block overflow-x-auto scrollbar-thin max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                    <tr>
                      <th className="py-2 font-medium">Waktu</th>
                      <th className="font-medium">Role</th>
                      <th className="font-medium">Action</th>
                      <th className="font-medium">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 text-xs text-slate-600 whitespace-nowrap">{new Date(l.waktu).toLocaleString('id-ID')}</td>
                        <td><Badge tone="gray">{l.role}</Badge></td>
                        <td className="font-mono text-xs">{l.action}</td>
                        <td className="font-mono text-xs text-slate-500 max-w-md truncate">{JSON.stringify(l.payload)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'tier3' && (
        <div className="card">
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r mb-4">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Tier 3: Restricted Data Correction</p>
                <p className="text-sm text-amber-800 mt-1">Aksi ini punya guardrails ketat:</p>
                <ul className="text-xs text-amber-700 list-disc list-inside mt-2 space-y-0.5">
                  <li>Mandatory reason <strong>min 30 karakter</strong></li>
                  <li>Read-only mode required untuk reverse transactions (G-SU-03)</li>
                  <li>Password re-verification di modal</li>
                  <li>Semua aksi tercatat di audit log dengan admin_alasan</li>
                </ul>
              </div>
            </div>
          </div>

          <button onClick={() => setReverseModal(true)} disabled={!health?.modes.is_readonly} className="btn btn-primary">
            <Trash2 className="w-4 h-4" />Reverse Transaction
            {!health?.modes.is_readonly && <span className="ml-1 text-xs opacity-80">(aktifkan read-only dulu)</span>}
          </button>
        </div>
      )}

      {/* Reverse Modal */}
      <Modal
        open={reverseModal}
        onClose={() => setReverseModal(false)}
        title="Reverse Transaction (Tier 3)"
        description="Aksi ini akan menghapus transaksi dan mengkompensasi poin siswa."
        size="md"
        footer={
          <>
            <button onClick={() => setReverseModal(false)} className="btn btn-secondary flex-1">
              <X className="w-4 h-4" />Cancel
            </button>
            <button
              onClick={submitReverse}
              disabled={reverseLoading || reverseAlasan.length < 30 || !reversePassword || !reverseTxId}
              className="btn btn-danger flex-1"
            >
              {reverseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Submit Reverse
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Transaction ID *</label>
            <input
              type="number"
              className="input"
              value={reverseTxId}
              onChange={(e) => setReverseTxId(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Alasan <span className="text-red-500">*</span> (min 30 char)
            </label>
            <textarea
              className="input"
              rows={3}
              value={reverseAlasan}
              onChange={(e) => setReverseAlasan(e.target.value)}
              placeholder="Contoh: salah input qty oleh staff, transaksi di-reverse dengan kompensasi poin..."
            />
            <p className={`text-xs mt-1 ${reverseAlasan.length < 30 ? 'text-slate-500' : 'text-green-600'}`}>
              {reverseAlasan.length} / 30 char minimum
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password (re-verifikasi) *</label>
            <input
              type="password"
              className="input"
              value={reversePassword}
              onChange={(e) => setReversePassword(e.target.value)}
              placeholder="Masukkan password Super Admin"
            />
          </div>
        </div>
      </Modal>

      {ConfirmUI}
    </DashboardLayout>
  );
}

/**
 * Sub-component untuk satu row konfigurasi editable.
 * Edit-in-place dengan validasi inline + audit log otomatis via backend.
 */
function ConfigRow({ entry, onSaved }: { entry: ConfigEntry; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(entry.value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset value jika entry.value berubah dari parent (misal setelah refresh)
  useEffect(() => {
    if (!editing) setValue(String(entry.value));
  }, [entry.value, editing]);

  function startEdit() {
    setValue(String(entry.value));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setValue(String(entry.value));
    setError(null);
    setEditing(false);
  }

  async function save() {
    setError(null);

    // Validasi numeric
    const trimmed = value.trim();
    if (trimmed === '') {
      setError('Nilai wajib diisi.');
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setError('Nilai harus berupa angka.');
      return;
    }
    if (n < entry.min || n > entry.max) {
      setError(`Nilai harus antara ${entry.min} dan ${entry.max}.`);
      return;
    }
    if (n === entry.value) {
      // Tidak ada perubahan
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await api.patch('/super-admin/config', { key: entry.key, value: String(n) });
      toast.success(`${entry.label} diperbarui ke ${n}.`);
      setEditing(false);
      onSaved();
    } catch (e: any) {
      const data = e.response?.data;
      const msg = data?.errors?.value?.[0] || data?.message || 'Gagal menyimpan.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
      <div className="sm:flex-1 min-w-0">
        <p className="font-medium text-slate-800 text-sm">{entry.label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{entry.description}</p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
      {/* Kontrol full-width di mobile supaya target tap-nya comfort & tidak
          competes dengan label panjang di baris yang sama. */}
      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
        {editing ? (
          <>
            <input
              type="number"
              min={entry.min}
              max={entry.max}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') cancel();
              }}
              disabled={saving}
              aria-label={`Edit ${entry.label}`}
              inputMode="numeric"
              autoFocus
              className="flex-1 sm:flex-none sm:w-24 px-2 py-1.5 text-sm text-right border border-slate-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-primary text-xs flex-1 sm:flex-none"
            >
              {saving ? '...' : 'Simpan'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="btn btn-secondary text-xs flex-1 sm:flex-none"
            >
              Batal
            </button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm px-2.5 py-1 bg-slate-100 rounded-md text-slate-800 font-semibold min-w-[3rem] text-center flex-1 sm:flex-none">
              {entry.value}
            </span>
            <button
              type="button"
              onClick={startEdit}
              aria-label={`Edit ${entry.label}`}
              className="btn btn-secondary text-xs flex-1 sm:flex-none"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
