import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/Skeleton';
import { useConfirm } from '../hooks/useConfirm';
import { ROLE_COLOR, ROLE_OPTIONS as ROLE_OPTIONS_SHARED, roleLabel } from '../utils/role';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  checkPasswordPolicy,
  describeProblems,
} from '../../shared/password-policy';

const UserAuditModal = lazy(() => import('../components/UserAuditModal').then(m => ({ default: m.UserAuditModal })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
import {
  Users, Plus, Search, Edit3, Trash2, KeyRound, Power, Lock, RefreshCw,
  Shield, ChevronLeft, UserCircle2, Activity, Info, Phone, MapPin, Coins
} from 'lucide-react';

interface UserRow {
  id: number;
  name: string;
  email: string | null;
  role: string;
  /** Hanya terisi untuk role Siswa; dipakai endpoint koreksi poin & timeline. */
  nis: string | null;
  current_poin: number | null;
  suspended_at: string | null;
  phone: string | null;
  gender: string | null;
  birth_place: string | null;
  birth_date: string | null;
  address: string | null;
  created_at: string;
}

// Label & warna role sekarang tinggal di utils/role — satu sumber untuk
// seluruh app. Versi lokal di file ini sebelumnya tidak punya
// `super_admin_tier3`, padahal role itu ada di sistem, sehingga akun Tier 3
// tidak bisa dipilih saat membuat atau mengubah user.
const ROLE_OPTIONS = ROLE_OPTIONS_SHARED;

export default function SuperAdminUsers() {
  const toast = useToast();
  const { prompt, ConfirmUI } = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>(''); // '', 'active', 'suspended'

  // Modal states
  const [editModal, setEditModal] = useState<{ user: UserRow | null; mode: 'create' | 'edit' }>({ user: null, mode: 'edit' });
  const [deleteModal, setDeleteModal] = useState<UserRow | null>(null);
  // Archive mewajibkan alasan (audit) + re-verify password (T3).
  const [deleteReason, setDeleteReason] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  // Koreksi poin (T3) — hanya untuk role Siswa.
  const [adjustUser, setAdjustUser] = useState<UserRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustPassword, setAdjustPassword] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Timeline (T3, read-only).
  const [timelineUser, setTimelineUser] = useState<UserRow | null>(null);
  const [timeline, setTimeline] = useState<{ type: string; waktu: string; data: Record<string, unknown> }[]>([]);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [passwordModal, setPasswordModal] = useState<UserRow | null>(null);
  const [auditModal, setAuditModal] = useState<UserRow | null>(null);

  const [editForm, setEditForm] = useState({
    name: '', email: '', role: 'santri', password: '',
    phone: '', gender: '', birth_place: '', birth_date: '', address: '',
    nis: '', kelas: '', asrama: '',
  });

  const [newPassword, setNewPassword] = useState('');

  async function refresh() {
    try {
      const r = await api.get('/super-admin/users?per_page=200');
      setUsers(r.data.data || []);
    } catch {
      toast.error('Gagal load users.');
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && u.suspended_at) return false;
      if (statusFilter === 'suspended' && !u.suspended_at) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !(u.email ?? '').toLowerCase().includes(q) && !String(u.id).includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  function openCreate() {
    setEditForm({
      name: '', email: '', role: 'santri', password: '',
      phone: '', gender: '', birth_place: '', birth_date: '', address: '',
      nis: '', kelas: '', asrama: '',
    });
    setEditModal({ user: null, mode: 'create' });
  }

  function openEdit(u: UserRow) {
    setEditForm({
      name: u.name,
      email: u.email ?? '',
      role: u.role,
      password: '',
      phone: u.phone ?? '',
      gender: u.gender ?? '',
      birth_place: u.birth_place ?? '',
      birth_date: u.birth_date ? u.birth_date.substring(0, 10) : '',
      address: u.address ?? '',
      nis: '',
      kelas: '',
      asrama: '',
    });
    setEditModal({ user: u, mode: 'edit' });
  }

  function update<K extends keyof typeof editForm>(key: K, value: string) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveEdit() {
    if (!editForm.name) { toast.error('Nama wajib.'); return; }
    if (editModal.mode === 'create') {
      // Pakai policy yang SAMA dengan server. Dulu UI hanya cek `length < 8`
      // padahal endpoint ini butuh 12 + komposisi huruf — jadi user mengetik
      // password yang terlihat valid lalu ditolak tanpa penjelasan.
      if (editForm.role !== 'santri') {
        const p = checkPasswordPolicy(editForm.password);
        if (!p.ok) { toast.error(`Password tidak memenuhi syarat: ${describeProblems(p.problems)}.`); return; }
      } else if (!editForm.password) {
        toast.error('Password wajib diisi.'); return;
      }
      if (editForm.role === 'santri' && !editForm.nis) { toast.error('NIS wajib untuk Siswa.'); return; }
      try {
        const r = await api.post('/super-admin/users', editForm);
        toast.success(`User dibuat. Default password: ${r.data.default_password}`);
        setEditModal({ user: null, mode: 'edit' });
        refresh();
      } catch (e: any) {
        toast.error(e.response?.data?.message || 'Gagal buat user.');
      }
    } else if (editModal.user) {
      try {
        await api.patch(`/super-admin/users/${editModal.user.id}`, editForm);
        toast.success(`User ${editForm.name} diperbarui.`);
        setEditModal({ user: null, mode: 'edit' });
        refresh();
      } catch (e: any) {
        toast.error(e.response?.data?.message || 'Gagal update.');
      }
    }
  }

  async function doDelete() {
    if (!deleteModal) return;
    if (deleteReason.trim().length < 10) { toast.error('Alasan minimal 10 karakter.'); return; }
    try {
      // Endpoint aslinya POST /super-admin/users/{userId}/delete (bukan DELETE
      // pada path induk). Handler path induk cuma mengimplementasikan
      // GET/PATCH/PUT dan berakhir tanpa fallback, jadi `api.delete(...)` yang
      // lama membalas 200 "OK." tanpa efek samping sama sekali — user
      // terlihat ter-archive padahal tidak terjadi apa-apa.
      await api.post(`/super-admin/users/${deleteModal.id}/delete`, {
        alasan: deleteReason.trim(),
        password_reverify: deletePassword,
      });
      toast.success(`User ${deleteModal.name} di-archive.`);
      setDeleteModal(null); setDeleteReason(''); setDeletePassword('');
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal archive.');
    }
  }

  async function doPasswordReset() {
    if (!passwordModal) return;
    const p = checkPasswordPolicy(newPassword);
    if (!p.ok) { toast.error(`Password tidak memenuhi syarat: ${describeProblems(p.problems)}.`); return; }
    try {
      await api.post(`/super-admin/users/${passwordModal.id}/reset-password`, { new_password: newPassword });
      toast.success(`Password user ${passwordModal.name} sudah di-reset.`);
      setPasswordModal(null);
      setNewPassword('');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal reset.');
    }
  }

  async function toggleSuspend(u: UserRow) {
    // Path lama `/toggle-suspend` tidak pernah ada. Endpoint aslinya
    // POST /super-admin/users/{userId}/suspend dengan { suspended, alasan }.
    const next = !u.suspended_at;
    const alasan = await prompt({
      title: next ? `Suspend ${u.name}?` : `Unsuspend ${u.name}?`,
      description: next
        ? 'Semua akses dicabut: sesi di perangkatnya logout paksa, login berikutnya ditolak.'
        : 'User bisa login dan ber aktivitas seperti semula. User akan diminta ganti password lagi.',
      label: 'Alasan (tercatat di audit log)',
      placeholder: 'mis. akses dipakai orang lain',
      tone: next ? 'danger' : 'info',
      confirmText: next ? 'Ya, Suspend' : 'Ya, Unsuspend',
      validate: (v) => (v.trim().length < 10 ? 'Alasan minimal 10 karakter.' : undefined),
    });
    if (alasan === null) return;
    try {
      await api.post(`/super-admin/users/${u.id}/suspend`, {
        suspended: next,
        alasan: alasan.trim(),
      });
      toast.success(`User ${u.name} di-${next ? 'suspend' : 'unsuspend'}.`);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal.');
    }
  }

  function openAdjust(u: UserRow) {
    if (!u.nis) { toast.error('User ini belum punya data Siswa (NIS kosong).'); return; }
    setAdjustUser(u); setAdjustDelta(''); setAdjustReason(''); setAdjustPassword('');
  }

  async function doAdjust() {
    if (!adjustUser) return;
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) { toast.error('Poin harus bilangan bulat dan bukan 0.'); return; }
    if (adjustReason.trim().length < 30) { toast.error('Alasan minimal 30 karakter.'); return; }
    if (!adjustPassword) { toast.error('Password super admin wajib diisi.'); return; }
    setAdjustBusy(true);
    try {
      const r = await api.post(`/super-admin/siswa/${adjustUser.nis}/adjust-poin`, {
        poin_delta: delta,
        alasan: adjustReason.trim(),
        password_reverify: adjustPassword,
      });
      const s = r.data?.siswa;
      toast.success(`Poin ${adjustUser.nis} disesuaikan ke ${s?.current_poin}.`);
      setAdjustUser(null);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Koreksi poin gagal.');
    } finally {
      setAdjustBusy(false);
    }
  }

  async function openTimeline(u: UserRow) {
    if (!u.nis) { toast.error('User ini belum punya data Siswa (NIS kosong).'); return; }
    setTimelineUser(u); setTimeline([]); setTimelineBusy(true);
    try {
      const r = await api.get(`/super-admin/siswa/${u.nis}/timeline`);
      setTimeline(r.data.timeline ?? []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal load timeline.');
    } finally {
      setTimelineBusy(false);
    }
  }

  return (
    <Layout
      title="User Management"
      titleShort="Users"
      subtitle="CRUD semua user — Admin, Staff, Petugas, Siswa"
      actions={
        <>
          <button onClick={refresh} className="btn btn-ghost text-sm"><RefreshCw className="w-4 h-4" /></button>
          <a href="/super" className="btn btn-secondary text-sm">
            <ChevronLeft className="w-4 h-4" />Dashboard
          </a>
          <button onClick={openCreate} className="btn btn-primary text-sm">
            <Plus className="w-4 h-4" />Tambah User
          </button>
        </>
      }
    >
      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Cari nama, email, atau ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input lg:w-48" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Semua Role</option>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className="input lg:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>Total: <strong>{users.length}</strong></span>
          <span>Aktif: <strong>{users.filter((u) => !u.suspended_at).length}</strong></span>
          <span>Suspended: <strong>{users.filter((u) => u.suspended_at).length}</strong></span>
          <span className="text-slate-400">|</span>
          <span>Ditampilkan: <strong>{filtered.length}</strong></span>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="Tidak ada user" description="Coba ubah filter atau tambah user baru" />
      ) : (
        <div className="card">
          <div className="overflow-x-auto scrollbar-thin max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                <tr>
                  <th className="py-2 font-medium">ID</th>
                  <th className="font-medium">Nama</th>
                  <th className="font-medium">Role</th>
                  <th className="font-medium">Biodata</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 font-mono text-xs">{u.id}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center text-xs font-medium text-slate-600 shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{u.name}</p>
                          <p className="text-xs text-slate-500 truncate">{u.email ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        title={u.role}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[u.role] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">
                      <div className="space-y-0.5">
                        {u.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />{u.phone}
                          </div>
                        )}
                        {u.gender && (
                          <div>{u.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
                        )}
                        {u.birth_place && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />{u.birth_place}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {u.suspended_at
                        ? <Badge tone="red" icon={<Lock className="w-3 h-3" />}>Suspended</Badge>
                        : <Badge tone="green">Aktif</Badge>}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="btn btn-secondary text-xs" title="Edit biodata & role"><Edit3 className="w-3 h-3" /></button>
                        <button onClick={() => setAuditModal(u)} className="btn btn-secondary text-xs" title="View Audit Log"><Activity className="w-3 h-3" /></button>
                        {/* Koreksi poin & timeline hanya relevan untuk Siswa —
                            keduanya berbasis NIS, dan user lain tidak punya NIS. */}
                        {u.role === 'santri' && u.nis && (
                          <>
                            <button onClick={() => openTimeline(u)} className="btn btn-secondary text-xs" title="Lihat timeline aktivitas siswa"><Activity className="w-3 h-3" /></button>
                            <button onClick={() => openAdjust(u)} className="btn btn-secondary text-xs" title="Koreksi poin (T3, perlu konfirmasi password)"><Coins className="w-3 h-3" /></button>
                          </>
                        )}
                        <button onClick={() => setPasswordModal(u)} className="btn btn-secondary text-xs" title="Reset Password"><KeyRound className="w-3 h-3" /></button>
                        <button
                          onClick={() => toggleSuspend(u)}
                          className={`btn text-xs ${u.suspended_at ? 'btn-danger' : 'btn-secondary'}`}
                          title={u.suspended_at ? 'Unsuspend' : 'Suspend'}
                        >
                          <Power className="w-3 h-3" />
                        </button>
                        <button onClick={() => setDeleteModal(u)} className="btn btn-danger text-xs" title="Archive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      <Modal
        open={editModal.user !== null || editModal.mode === 'create'}
        onClose={() => setEditModal({ user: null, mode: 'edit' })}
        title={editModal.mode === 'create' ? 'Tambah User Baru' : `Edit User #${editModal.user?.id}`}
        description={editModal.mode === 'create' ? 'Biodata opsional untuk Siswa & admin/staff' : 'Update biodata. Email/role/password butuh endpoint terpisah.'}
        size="lg"
        footer={
          <>
            <button onClick={() => setEditModal({ user: null, mode: 'edit' })} className="btn btn-secondary flex-1">Batal</button>
            <button onClick={saveEdit} className="btn btn-primary flex-1">
              {editModal.mode === 'create' ? 'Buat User' : 'Simpan'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {editModal.mode === 'create' && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r text-xs text-blue-900">
               Untuk create user baru, password wajib di-set. User bisa ganti sendiri nanti via menu profil.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama *</label>
              <input className="input" value={editForm.name} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
              <select
                className="input"
                value={editForm.role}
                onChange={(e) => update('role', e.target.value)}
                disabled={editModal.mode === 'edit'}
              >
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                className="input"
                type="email"
                value={editForm.email}
                onChange={(e) => update('email', e.target.value)}
                disabled={editModal.mode === 'edit'}
              />
              {editModal.mode === 'edit' && (
                <p className="text-[10px] text-slate-400 mt-1">Email tidak bisa diubah via form ini.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password {editModal.mode === 'create' ? '*' : ''}
              </label>
              <input
                className="input"
                type="text"
                value={editForm.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder={editModal.mode === 'create'
                  ? (editForm.role === 'santri' ? 'min 8 char' : `min ${PASSWORD_MIN_LENGTH} char + huruf besar/kecil/angka`)
                  : 'kosongkan (tidak diubah)'}
              />
            </div>
          </div>

          {editForm.role === 'santri' && editModal.mode === 'create' && (
            <div className="grid grid-cols-3 gap-3 bg-blue-50/50 p-3 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NIS *</label>
                <input className="input" value={editForm.nis} onChange={(e) => update('nis', e.target.value)} placeholder="23001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kelas *</label>
                <input className="input" value={editForm.kelas} onChange={(e) => update('kelas', e.target.value)} placeholder="XII-A" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asrama</label>
                <input className="input" value={editForm.asrama} onChange={(e) => update('asrama', e.target.value)} placeholder="Asrama A" />
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wide font-medium text-slate-500 mb-2">Biodata</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Telepon</label>
                <input className="input" value={editForm.phone} onChange={(e) => update('phone', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                <select className="input" value={editForm.gender} onChange={(e) => update('gender', e.target.value)}>
                  <option value="">—</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tempat Lahir</label>
                <input className="input" value={editForm.birth_place} onChange={(e) => update('birth_place', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                <input type="date" className="input" value={editForm.birth_date} onChange={(e) => update('birth_date', e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Alamat</label>
              <textarea className="input" rows={2} value={editForm.address} onChange={(e) => update('address', e.target.value)} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete/Archive Confirmation */}
      <Modal
        open={!!deleteModal}
        onClose={() => { setDeleteModal(null); setDeleteReason(''); setDeletePassword(''); }}
        title="Archive User"
        size="sm"
        footer={
          <>
            <button onClick={() => { setDeleteModal(null); setDeleteReason(''); setDeletePassword(''); }} className="btn btn-secondary flex-1">Batal</button>
            <button
              onClick={doDelete}
              disabled={deleteReason.trim().length < 10 || !deletePassword}
              className="btn btn-danger flex-1"
            >
              Archive
            </button>
          </>
        }
      >
        {deleteModal && (
          <div className="text-sm space-y-3">
            <p>Archive user <strong>{deleteModal.name}</strong> ({roleLabel(deleteModal.role)})?</p>
            <p className="text-slate-600">
              User tidak akan bisa login. Untuk Siswa, profile juga akan di-archive.
              Hanya berlaku untuk role <strong>Siswa</strong> dan <strong>Admin Kesantrian</strong> —
              role lain yang punya riwayat operasional harus di-suspend.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Alasan <span className="text-slate-400 font-normal">(tercatat di audit log)</span>
              </label>
              <textarea
                className="input"
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="mis. akun lama tidak dipakai lagi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password super admin <span className="text-slate-400 font-normal">(konfirmasi ulang)</span>
              </label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Password Reset */}
      <Modal
        open={!!passwordModal}
        onClose={() => { setPasswordModal(null); setNewPassword(''); }}
        title="Reset Password"
        description={`Set password baru untuk ${passwordModal?.name}. ${PASSWORD_RULES.join(' • ')}.`}
        size="sm"
        footer={
          <>
            <button onClick={() => { setPasswordModal(null); setNewPassword(''); }} className="btn btn-secondary flex-1">Batal</button>
            <button onClick={doPasswordReset} disabled={!checkPasswordPolicy(newPassword).ok} className="btn btn-primary flex-1">
              <Shield className="w-4 h-4" />Reset Password
            </button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
          <input
            className="input"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`min ${PASSWORD_MIN_LENGTH} char`}
            autoFocus
          />
          <p className="text-xs text-slate-500 mt-1">Password ini akan ditampilkan sekali ke admin, dan user harus ganti sendiri di first login berikutnya.</p>
        </div>
      </Modal>

      {/* Audit Log Modal */}
      {auditModal && (
        <Suspense fallback={<ModalFallback />}>
          <UserAuditModal
            userId={auditModal.id}
            userName={auditModal.name}
            open={!!auditModal}
            onClose={() => setAuditModal(null)}
          />
        </Suspense>
      )}

      {/* Koreksi Poin (T3) */}
      <Modal
        open={!!adjustUser}
        onClose={() => setAdjustUser(null)}
        title="Koreksi Poin (T3)"
        description={
          adjustUser
            ? `Tambah/kurangi poin untuk ${adjustUser.name} (NIS ${adjustUser.nis}). Tindakan destruktif — butuh konfirmasi password.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <button onClick={() => setAdjustUser(null)} className="btn btn-secondary flex-1">Batal</button>
            <button
              onClick={doAdjust}
              disabled={adjustBusy || !adjustDelta || adjustReason.trim().length < 30 || !adjustPassword}
              className="btn btn-danger flex-1"
            >
              {adjustBusy ? 'Memproses…' : 'Terapkan'}
            </button>
          </>
        }
      >
        {adjustUser && (
          <div className="text-sm space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Poin saat ini <strong>{adjustUser.current_poin ?? 0}</strong>. Nilai baru akan
              tercatat sebagai satu entri di ledger dengan sumber <code>superadmin.adjust_poin</code>.
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Perubahan poin (+ / −)</label>
              <input
                className="input"
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="mis. -20 (koreksi) atau 50 (kompensasi)"
              />
              <p className="text-xs text-slate-500 mt-1">Boleh negatif. Tidak boleh 0.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Alasan <span className="text-slate-400 font-normal">(tercatat di audit log)</span>
              </label>
              <textarea
                className="input"
                rows={3}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Jelaskan penyebab koreksi — minimal 30 karakter"
              />
              <p className="text-xs text-slate-500 mt-1">{adjustReason.trim().length}/30 karakter</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password super admin <span className="text-slate-400 font-normal">(konfirmasi ulang)</span>
              </label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={adjustPassword}
                onChange={(e) => setAdjustPassword(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Timeline (T3, read-only) */}
      <Modal
        open={!!timelineUser}
        onClose={() => setTimelineUser(null)}
        title="Timeline Siswa"
        description={timelineUser ? `Aktivitas ${timelineUser.name} (NIS ${timelineUser.nis})` : undefined}
        size="lg"
      >
        {timelineBusy ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Memuat…</div>
        ) : timeline.length === 0 ? (
          <EmptyState
            icon={<Activity className="w-6 h-6" />}
            title="Belum ada aktivitas"
            description="Timeline akan terisi setelah ada transaksi atau verifikasi."
          />
        ) : (
          <ol className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
            {timeline.map((t, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-slate-200 my-1" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="blue">{t.type}</Badge>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {new Date(t.waktu).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <pre className="text-[11px] text-slate-600 bg-slate-50 rounded p-2 mt-1.5 overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all">
                    {JSON.stringify(t.data, null, 1)}
                  </pre>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>

      {ConfirmUI}
    </Layout>
  );
}
