import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { redirectForRole } from './auth/redirectForRole';
import { ToastProvider } from './components/Toast';
import { MaintenanceGate } from './components/MaintenancePage';
import Login from './pages/Login';
import MustChangePasswordPage from './pages/MustChangePasswordPage';
import type { Role } from './api/client';
import type { ReactNode } from 'react';

// Lazy-load dashboards — each role only downloads its own chunk.
// Santri tidak perlu download AdminDashboard (34KB) atau SuperAdminDashboard (21KB).
const SantriDashboard = lazy(() => import('./pages/SantriDashboard'));
const StaffDashboard = lazy(() => import('./pages/StaffDashboard'));
const PetugasDashboard = lazy(() => import('./pages/PetugasDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const SuperAdminUsers = lazy(() => import('./pages/SuperAdminUsers'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: Role[] }) {
  const { user, token } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to={redirectForRole(user.role)} replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  if (token && user) return <Navigate to={redirectForRole(user.role)} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/santri" element={<ProtectedRoute allowedRoles={['santri']}><SantriDashboard /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute allowedRoles={['staff_kantin', 'super_admin', 'super_admin_tier3']}><StaffDashboard /></ProtectedRoute>} />
        <Route path="/petugas" element={<ProtectedRoute allowedRoles={['petugas_kesantrian', 'super_admin', 'super_admin_tier3']}><PetugasDashboard /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin_kesantrian', 'super_admin', 'super_admin_tier3']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/super" element={<ProtectedRoute allowedRoles={['super_admin', 'super_admin_tier3']}><SuperAdminDashboard /></ProtectedRoute>} />
        <Route path="/super/users" element={<ProtectedRoute allowedRoles={['super_admin', 'super_admin_tier3']}><SuperAdminUsers /></ProtectedRoute>} />
        {/* Note: /change-password-required tidak ada di sini — di-handle oleh AppInner
            yang route ke MustChangePasswordPage kalau flag=true. Setelah password change,
            MustChangePasswordPage navigate explicit ke dashboard. */}
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </Suspense>
  );
}

function HomeRedirect() {
  const { user, token } = useAuth();
  if (token && user) return <Navigate to={redirectForRole(user.role)} replace />;
  return <Navigate to="/login" replace />;
}

function AppInner() {
  const { token, mustChangePassword } = useAuth();

  // Login page SELALU bisa diakses (termasuk saat maintenance ON)
  // — supaya super admin bisa login untuk menonaktifkan maintenance
  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Sudah login tapi wajib ganti password — lock screen sampai clear
  if (mustChangePassword) {
    return (
      <Routes>
        <Route path="/change-password-required" element={<MustChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/change-password-required" replace />} />
      </Routes>
    );
  }

  // Sudah login -> apply maintenance gate
  return (
    <MaintenanceGate>
      <AppRoutes />
    </MaintenanceGate>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
