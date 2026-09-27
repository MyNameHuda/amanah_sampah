import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/Skeleton';

const UserAuditModal = lazy(() => import('../components/UserAuditModal').then(m => ({ default: m.UserAuditModal })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
import {
  Users, Plus, Search, Edit3, Trash2, KeyRound, Power, Lock, RefreshCw,
  Shield, ChevronLeft, UserCircle2, Activity, Info, Phone, MapPin
} from 'lucide-react';

interface UserRow {
  id: number;
  name: string;
  email: string | null;
  role: string;
  suspended_at: string | null;
  phone: string | null;
  gender: string | null;
  birth_place: string | null;
  birth_date: string | null;
  address: string | null;
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: 'santri', label: 'Santri' },
  { value: 'staff_kantin', label: 'Staff Kantin' },
  { value: 'petugas_kesantrian', label: 'Petugas Kesantrian' },
  { value: 'admin_kesantrian', label: 'Admin Kesantrian' },
  { value: 'super_admin', label: 'Super Admin' },
];

const ROLE_COLOR: Record<string, string> = {
  'santri': 'bg-blue-100 text-blue-700',
  'staff_kantin': 'bg-emerald-100 text-emerald-700',
  'petugas_kesantrian': 'bg-violet-100 text-violet-700',
  'admin_kesantrian': 'bg-amber-100 text-amber-700',
  'super_admin': 'bg-rose-100 text-rose-700',
};

export default function SuperAdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>(''); // '', 'active', 'suspended'

  // Modal states
  const [editModal, setEditModal] = useState<{ user: UserRow | null; mode: 'create' | 'edit' }>({ user: null, mode: 'edit' });
  const [deleteModal, setDeleteModal] = useState<UserRow | null>(null);
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
      if (!editForm.password || editForm.password.length < 8) { toast.error('Password min 8 char.'); return; }
      if (editForm.role === 'santri' && !editForm.nis) { toast.error('NIS wajib untuk Santri.'); return; }
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
    try {
      await api.delete(`/super-admin/users/${deleteModal.id}`);
      toast.success(`User ${deleteModal.name} di-archive.`);
      setDeleteModal(null);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal archive.');
    }
  }

  async function doPasswordReset() {
    if (!passwordModal) return;
    if (newPassword.length < 8) { toast.error('Password min 8 char.'); return; }
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
    try {
      await api.post(`/super-admin/users/${u.id}/toggle-suspend`);
      toast.success(`User ${u.suspended_at ? 'unsuspended' : 'suspended'}.`);
      refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal.');
    }
  }

  return (
    <Layout
      title="User Management"
      titleShort="Users"
      subtitle="CRUD semua user — Admin, Staff, Petugas, Santri"
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
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[u.role] || 'bg-slate-100 text-slate-700'}`}>
                        {u.role.replace(/_/g, ' ')}
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
        description={editModal.mode === 'create' ? 'Biodata opsional untuk Santri & admin/staff' : 'Update biodata. Email/role/password butuh endpoint terpisah.'}
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
                placeholder={editModal.mode === 'create' ? 'min 8 char' : 'kosongkan (tidak diubah)'}
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
        onClose={() => setDeleteModal(null)}
        title="Archive User"
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteModal(null)} className="btn btn-secondary flex-1">Batal</button>
            <button onClick={doDelete} className="btn btn-danger flex-1">Archive</button>
          </>
        }
      >
        {deleteModal && (
          <div className="text-sm">
            <p className="mb-2">Archive user <strong>{deleteModal.name}</strong> ({deleteModal.role.replace(/_/g, ' ')})?</p>
            <p className="text-slate-600">User tidak akan bisa login. Untuk Santri, profile juga akan di-archive. Bisa di-restore via un-archive (belum di-implementasi).</p>
          </div>
        )}
      </Modal>

      {/* Password Reset */}
      <Modal
        open={!!passwordModal}
        onClose={() => { setPasswordModal(null); setNewPassword(''); }}
        title="Reset Password"
        description={`Set password baru untuk ${passwordModal?.name}. Min 8 karakter.`}
        size="sm"
        footer={
          <>
            <button onClick={() => { setPasswordModal(null); setNewPassword(''); }} className="btn btn-secondary flex-1">Batal</button>
            <button onClick={doPasswordReset} disabled={newPassword.length < 8} className="btn btn-primary flex-1">
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
            placeholder="min 8 char"
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
    </Layout>
  );
}
