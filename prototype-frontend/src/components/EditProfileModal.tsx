import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import api from '../api/client';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { useAuth } from '../auth/AuthContext';

interface Biodata {
  phone: string | null;
  gender: string | null;
  birth_place: string | null;
  birth_date: string | null;
  address: string | null;
}

interface ProfileFormData {
  name: string;
  phone: string;
  gender: '' | 'L' | 'P';
  birth_place: string;
  birth_date: string;
  address: string;
}

interface MeProfileResponse {
  user: {
    id: number;
    name: string;
    email: string | null;
    role: string;
    biodata: Biodata;
  };
  role_data?: {
    type: string;
    [key: string]: any;
  };
}

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const EMPTY: ProfileFormData = {
  name: '',
  phone: '',
  gender: '',
  birth_place: '',
  birth_date: '',
  address: '',
};

export function EditProfileModal({ open, onClose, onUpdated }: EditProfileModalProps) {
  const toast = useToast();
  const { user, refreshAuth } = useAuth();
  const [form, setForm] = useState<ProfileFormData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    api.get<MeProfileResponse>('/me/profile')
      .then((r) => {
        const b = r.data.user.biodata;
        setForm({
          name: r.data.user.name ?? '',
          phone: b.phone ?? '',
          gender: (b.gender ?? '') as '' | 'L' | 'P',
          birth_place: b.birth_place ?? '',
          birth_date: b.birth_date ?? '',
          address: b.address ?? '',
        });
      })
      .catch((e) => toast.error('Gagal load profil.'))
      .finally(() => setFetching(false));
  }, [open]);

  function update<K extends keyof ProfileFormData>(key: K, value: ProfileFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setLoading(true);
    try {
      const payload: Record<string, any> = {};
      if (form.name.trim() && form.name !== user?.name) payload.name = form.name.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      else payload.phone = null;
      if (form.gender) payload.gender = form.gender;
      else payload.gender = null;
      if (form.birth_place.trim()) payload.birth_place = form.birth_place.trim();
      else payload.birth_place = null;
      if (form.birth_date) payload.birth_date = form.birth_date;
      else payload.birth_date = null;
      if (form.address.trim()) payload.address = form.address.trim();
      else payload.address = null;

      // [Fix M4] Guard: kalau tidak ada field yang berubah, jangan kirim request
      if (Object.keys(payload).length === 0) {
        toast.info('Tidak ada perubahan untuk disimpan.');
        onClose();
        return;
      }

      await api.patch('/me/profile', payload);
      toast.success('Biodata berhasil diperbarui.');
      await refreshAuth?.();
      onUpdated?.();
      onClose();
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Gagal update.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const fieldClass = 'w-full px-3 py-2 border border-slate-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-200 bg-white text-sm';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Biodata"
      description={`${user?.name} | ${user?.role.replace(/_/g, ' ')}`}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary flex-1">Batal</button>
          <button onClick={save} disabled={loading || fetching} className="btn btn-primary flex-1">
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </>
      }
    >
      {fetching ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
            <span>
              Anda dapat mengubah biodata sendiri. <strong>Email, role, dan password</strong> hanya dapat diubah oleh Super Admin.
            </span>
          </div>

          <div>
            <label className={labelClass}>Nama</label>
            <input className={fieldClass} value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>No. Telepon</label>
              <input className={fieldClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="08xxx" />
            </div>
            <div>
              <label className={labelClass}>Jenis Kelamin</label>
              <select className={fieldClass} value={form.gender} onChange={(e) => update('gender', e.target.value as any)}>
                <option value="">—</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tempat Lahir</label>
              <input className={fieldClass} value={form.birth_place} onChange={(e) => update('birth_place', e.target.value)} placeholder="Kota" />
            </div>
            <div>
              <label className={labelClass}>Tanggal Lahir</label>
              <input type="date" className={fieldClass} value={form.birth_date} onChange={(e) => update('birth_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Alamat</label>
            <textarea className={fieldClass} rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Jl. ..." />
          </div>
        </div>
      )}
    </Modal>
  );
}
