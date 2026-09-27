import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type User } from '../api/client';
import { redirectForRole } from './redirectForRole';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('amanah_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('amanah_token'));
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    const stored = localStorage.getItem('amanah_user');
    if (stored) {
      try { return !!JSON.parse(stored).must_change_password; } catch { return false; }
    }
    return false;
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then((r) => {
          setUser(r.data);
          setMustChangePassword(!!r.data.must_change_password);
          localStorage.setItem('amanah_user', JSON.stringify(r.data));
        })
        .catch(() => {
          // Token invalid, force logout
          localStorage.removeItem('amanah_token');
          localStorage.removeItem('amanah_user');
          setToken(null);
          setUser(null);
          setMustChangePassword(false);
        });
    }
  }, [token]);

  const login = async (loginId: string, password: string) => {
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { login: loginId, password });
      const { token, user } = r.data;
      localStorage.setItem('amanah_token', token);
      localStorage.setItem('amanah_user', JSON.stringify(user));
      setToken(token);
      setUser(user);
      setMustChangePassword(!!user.must_change_password);
      // Kalau wajib ganti password, redirect ke change-password page
      // (route handler di App.tsx yang akan auto-route ke MustChangePasswordPage)
      navigate(redirectForRole(user.role));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('amanah_token');
    localStorage.removeItem('amanah_user');
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
    navigate('/login');
  };

  const refreshAuth = async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data);
      setMustChangePassword(!!r.data.must_change_password);
      localStorage.setItem('amanah_user', JSON.stringify(r.data));
    } catch {
      logout();
    }
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
    if (user) {
      const updated = { ...user, must_change_password: false };
      setUser(updated);
      localStorage.setItem('amanah_user', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, mustChangePassword, login, logout, refreshAuth, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
