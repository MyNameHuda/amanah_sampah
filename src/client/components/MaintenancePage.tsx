import { LogOut, Wrench, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useMaintenance } from '../hooks/useMaintenance';

interface MaintenancePageProps {
  children: React.ReactNode;
}

export function MaintenanceGate({ children }: MaintenancePageProps) {
  const { user } = useAuth();
  const { is_maintenance, refresh } = useMaintenance();

  // Super admin selalu boleh lewat (untuk manage maintenance itu sendiri)
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'super_admin_tier3';

  // Kalau tidak maintenance, render normal
  // Kalau maintenance + super admin, render dengan banner info aja (biar bisa manage)
  // Kalau maintenance + non-super-admin, render full maintenance page

  if (!is_maintenance) {
    return <>{children}</>;
  }

  if (isSuperAdmin) {
    // Render children tapi kasih banner top
    return (
      <>
        <SuperAdminMaintenanceBanner onRefresh={refresh} />
        {children}
      </>
    );
  }

  // Non-super-admin -> full maintenance page
  return <FullMaintenancePage />;
}

function FullMaintenancePage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}></div>

      <div className="relative max-w-md w-full text-center">
        {/* Logo */}
        <div className="inline-block bg-white p-4 rounded-2xl shadow-2xl mb-6 animate-slide-up">
          <img
            src="/logo-pesantren.webp"
            alt="Pesantren Minhaj Shahabah"
            className="w-24 h-24 object-contain grayscale-0"
          />
        </div>

        {/* Icon */}
        <div className="mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/20 backdrop-blur rounded-full ring-2 ring-amber-400/40">
            <Wrench className="w-8 h-8 text-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          Sedang Maintenance
        </h1>
        <p className="text-slate-300 mb-6 animate-slide-up" style={{ animationDelay: '0.25s' }}>
          Aplikasi sedang dalam perbaikan rutin.
          <br />Mohon kembali beberapa saat lagi.
        </p>

        {/* Status card */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 mb-6 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-amber-300 uppercase tracking-wide">Status</span>
          </div>
          <p className="text-sm text-slate-200">
            Sistem sedang di-maintenance oleh tim teknis.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Estimasi selesai: tidak tersedia
          </p>
        </div>

        {/* Spinner */}
        <div className="flex justify-center mb-6 animate-slide-up" style={{ animationDelay: '0.35s' }}>
          <div className="flex items-center gap-2 text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs">Auto-checking status setiap 30 detik</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          {user && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-left">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Login sebagai</p>
              <p className="text-sm text-slate-200 font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email || `NIS ${user.id}`} | {user.role}</p>
            </div>
          )}
          <button
            onClick={() => { logout(); }}
            className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-500 mt-8">
          Pesantren Minhaj Shahabah | Bogor
        </p>
      </div>
    </div>
  );
}

function SuperAdminMaintenanceBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium sticky top-0 z-50 shadow-md">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        <strong>MAINTENANCE MODE</strong> aktif — semua writes dari non-super-admin diblokir. Hanya kamu yang bisa akses.
      </span>
      <button
        onClick={onRefresh}
        className="ml-2 underline hover:no-underline flex items-center gap-1"
      >
        <RefreshCw className="w-3 h-3" />
        Check
      </button>
    </div>
  );
}
