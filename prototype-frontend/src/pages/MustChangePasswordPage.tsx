import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { redirectForRole } from '../auth/redirectForRole';
import { useToast } from '../components/Toast';
import { LoadingButton } from '../components/LoadingButton';
import api from '../api/client';
import { ShieldCheck, KeyRound, LogOut, AlertCircle } from 'lucide-react';

export default function MustChangePasswordPage() {
  const { user, logout, clearMustChangePassword, refreshAuth } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPwId = useId();
  const confirmPwId = useId();
  const errorId = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Password dan konfirmasi tidak sama.');
      return;
    }

    setLoading(true);
    try {
      // for_first_login=true -> skip current_password check (admin set this password)
      await api.post('/auth/change-password', {
        for_first_login: true,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      toast.success('Password berhasil diganti. Selamat datang!');
      clearMustChangePassword();
      await refreshAuth();
      // Explicit navigate ke dashboard (avoid multi-redirect chain via /login + role-based)
      navigate(redirectForRole(user?.role ?? 'santri'), { replace: true });
    } catch (e: any) {
      const data = e.response?.data;
      const msg = data?.message || data?.errors?.new_password?.[0] || 'Gagal ganti password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blobs — hidden if reduced motion */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse-soft motion-reduce:hidden" aria-hidden="true" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-red-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse-soft motion-reduce:hidden" aria-hidden="true" style={{ animationDelay: '1s' }} />

      <div className="w-full max-w-md relative">
        <header className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-2xl mb-4 shadow-md" aria-hidden="true">
            <ShieldCheck className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Ganti Password</h1>
          <p className="text-slate-600 mt-1">
            Wajib ganti password sebelum lanjut.
          </p>
        </header>

        {user && (
          <div className="bg-white p-2 rounded-full shadow-sm border border-slate-200 mb-4 flex items-center gap-3 px-4 max-w-xs mx-auto">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role.replace(/_/g, ' ')}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={submit}
          noValidate
          className="card space-y-4 animate-slide-up motion-reduce:animate-none"
          aria-label="Form ganti password wajib"
        >
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r text-xs text-amber-900" role="note">
            <div className="flex items-start gap-2">
              <KeyRound className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Password sementara harus diganti</p>
                <p className="mt-1">Password ini diset oleh Super Admin. Pilih password baru yang kuat dan mudah diingat.</p>
              </div>
            </div>
          </div>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor={newPwId} className="block text-sm font-medium text-slate-700 mb-1">
              Password Baru
            </label>
            <input
              id={newPwId}
              name="new_password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
              placeholder="min 8 karakter"
              autoFocus
              required
              minLength={8}
              aria-describedby={`${errorId} ${newPwId}-hint`}
              aria-invalid={!!error || undefined}
            />
            <p id={`${newPwId}-hint`} className="text-xs text-slate-500 mt-1">
              Disarankan: kombinasi huruf besar, kecil, angka, dan simbol.
            </p>
          </div>

          <div>
            <label htmlFor={confirmPwId} className="block text-sm font-medium text-slate-700 mb-1">
              Konfirmasi Password
            </label>
            <input
              id={confirmPwId}
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              placeholder="ketik ulang password baru"
              required
              minLength={8}
              aria-invalid={!!error || undefined}
            />
          </div>

          <div className="flex gap-2">
            <LoadingButton
              type="button"
              variant="secondary"
              loading={loading}
              onClick={logout}
              className="flex-1"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Logout
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Menyimpan..."
              className="flex-1"
              variant="primary"
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              Ganti Password
            </LoadingButton>
          </div>

          <p className="text-[10px] text-slate-400 text-center">
            Aksi ini akan tercatat di audit log.
          </p>
        </form>
      </div>
    </div>
  );
}
