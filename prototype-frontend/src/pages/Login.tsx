import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { LoadingButton } from '../components/LoadingButton';
import { consumeLogoutReason, REASON_SUSPENDED, REASON_EXPIRED } from '../api/client';
import {
  LogIn,
  Sparkles,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  Quote,
  Leaf,
  Coins,
  Gift,
  History,
  ArrowRight,
} from 'lucide-react';

interface QuickRole {
  id: string;
  label: string;
  desc: string;
  login: string;
  password: string;
}

interface Feature {
  icon: typeof Coins;
  title: string;
  desc: string;
}

const QUICK_ROLES: QuickRole[] = [
  { id: 'super',   label: 'Super Admin',   desc: 'Operational', login: 'super@amanah.id',  password: 'super12345' },
  { id: 'admin',   label: 'Admin',         desc: 'Manajemen',   login: 'admin@amanah.id',  password: 'admin12345' },
  { id: 'staff',   label: 'Staff Kantin',  desc: 'Input POS',   login: 'staff@amanah.id',  password: 'staff12345' },
  { id: 'petugas', label: 'Petugas',       desc: 'Verifikasi',  login: 'petugas@amanah.id', password: 'petugas12345' },
  { id: 'siswa',   label: 'Santri',        desc: 'Read-only',   login: '23001',             password: 'demo12345' },
];

const FEATURES: Feature[] = [
  { icon: Coins,   title: 'Poin Digital',  desc: 'Setiap setoran sampah tercatat otomatis dan masuk ke saldo poin.' },
  { icon: Gift,    title: 'Reward Nyata',  desc: 'Tukar poin dengan barang bermanfaat dari katalog reward pesantren.' },
  { icon: History, title: 'Audit Log',     desc: 'Setiap aksi tercatat dengan timestamp untuk transparansi penuh.' },
];

export default function Login() {
  const { login, loading } = useAuth();
  const toast = useToast();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const loginIdRef = useRef<HTMLInputElement>(null);
  const loginIdId = useId();
  const passwordId = useId();
  const errorId = useId();

  useEffect(() => {
    const t = setTimeout(() => loginIdRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Sesi bisa terputus karena dua alasan yang perlu dibedakan(user-nya):
  // token dicabut admin (suspended), atau token sekadar kedaluwarsa. Tanpa
  // ini, user tiba-tiba menemukan form login kosong tanpa penjelasan.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('suspended') === '1'
      ? REASON_SUSPENDED
      : consumeLogoutReason();

    if (reason === REASON_SUSPENDED) {
      setError('Akun Anda di-suspend. Semua aktivitas dinonaktifkan. Hubungi admin untuk membuka akses kembali.');
    } else if (reason === REASON_EXPIRED) {
      setError('Sesi Anda berakhir. Silakan login kembali.');
    }
    // Bersihkan query supaya refresh tidak memunculkan banner yang sama lagi.
    if (params.has('suspended') || params.has('expired')) {
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!loginId.trim() || !password) {
      setError('NIS/Email dan password wajib diisi.');
      loginIdRef.current?.focus();
      return;
    }

    try {
      await login(loginId.trim(), password);
      toast.success('Login berhasil!');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.login?.[0] || 'Login gagal.';
      setError(msg);
    }
  }

  function quickFill(role: QuickRole) {
    setLoginId(role.login);
    setPassword(role.password);
    setSelectedRole(role.id);
    setError(null);
    document.getElementById(passwordId)?.focus();
  }

  return (
    <div className="min-h-screen bg-white md:grid md:grid-cols-2">
      {/* ────────── Left: Image panel ────────── */}
      <aside
        className="relative isolate hidden md:flex md:flex-col md:justify-between overflow-hidden bg-slate-900 text-white"
        aria-hidden="true"
      >
        {/* Background image */}
        <img
          src="/bg-pesantren.webp"
          alt=""
          width="1280"
          height="720"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {/* Gradient overlay — bottom-to-top untuk readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/70 to-slate-900/40" />
        {/* Extra dark vignette di atas (top gradient) — agar logo & text selalu kontras tinggi */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-900/70 to-transparent pointer-events-none" />
        {/* Subtle green tint matching brand */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/30 via-transparent to-emerald-900/30" />

        {/* Top: Logo */}
        <div className="relative z-10 p-8 lg:p-10 animate-drop-in motion-reduce:animate-none" style={{ animationDelay: '100ms' }}>
          <div className="inline-flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/50 backdrop-blur-md ring-1 ring-white/15 shadow-lg shadow-black/10">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center ring-1 ring-white/30 shadow-sm shrink-0">
              <img
                src="/logo-pesantren.webp"
                alt=""
                width="32"
                height="32"
                loading="eager"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div className="leading-tight pr-1">
              <p className="font-semibold text-sm tracking-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>Amanah Sampah</p>
              <p className="text-[11px] text-white/85" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>Pesantren Minhaj Shahabah</p>
            </div>
          </div>
        </div>

        {/* Bottom: Tagline + Quote */}
        <div className="relative z-10 p-8 lg:p-10">
          {/* Feature pill */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-4 bg-white/10 backdrop-blur-sm ring-1 ring-white/20 rounded-full text-xs font-medium text-white/90 animate-drop-in motion-reduce:animate-none" style={{ animationDelay: '250ms' }}>
            <Leaf className="w-3 h-3 text-brand-300" aria-hidden="true" />
            Deposit-Refund System
          </div>

          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight leading-tight max-w-md animate-reveal-up motion-reduce:animate-none" style={{ animationDelay: '350ms' }}>
            Sampah plastik punya nilai.<br />
            <span className="text-brand-300">Santri yang jaga amanah.</span>
          </h2>

          <p className="mt-3 text-sm text-white/80 max-w-sm leading-relaxed animate-reveal-up motion-reduce:animate-none" style={{ animationDelay: '500ms' }}>
            Sistem poin digital yang menghargai setiap botol plastik yang disetor kembali —
            edukasi lingkungan hidup untuk generasi pesantren yang bertanggung jawab.
          </p>

          {/* Quote */}
          <figure className="mt-6 pt-6 border-t border-white/15 max-w-sm animate-reveal-up motion-reduce:animate-none" style={{ animationDelay: '650ms' }}>
            <Quote className="w-5 h-5 text-brand-300/70 -scale-x-100" aria-hidden="true" />
            <blockquote className="mt-2 text-sm italic text-white/85 leading-relaxed">
              "Bersih adalah sebagian dari iman. Kelola sampah dengan jujur, jaga pesantren dengan amanah."
            </blockquote>
          </figure>
        </div>
      </aside>

      {/* ────────── Right: Form panel ────────── */}
      <main className="relative flex flex-col bg-white overflow-hidden">
        {/* Layer 1: Multi-stop soft gradient — brand warmth tanpa noise */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 15% 0%, rgb(220 252 231 / 0.6), transparent 60%),
              radial-gradient(ellipse 70% 50% at 85% 100%, rgb(224 231 255 / 0.5), transparent 60%),
              linear-gradient(180deg, rgb(255 255 255 / 1) 0%, rgb(248 250 252 / 1) 100%)
            `,
          }}
        />

        {/* Layer 2: Decorative blurred shapes — slow drift for "alive" feel */}
        <div
          className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-brand-200/40 blur-3xl pointer-events-none motion-reduce:hidden"
          aria-hidden="true"
          style={{ animation: 'drift 20s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-emerald-200/30 blur-3xl pointer-events-none motion-reduce:hidden"
          aria-hidden="true"
          style={{ animation: 'drift 25s ease-in-out infinite reverse', animationDelay: '5s' }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full bg-teal-100/40 blur-3xl pointer-events-none motion-reduce:hidden"
          aria-hidden="true"
          style={{ animation: 'drift 18s ease-in-out infinite', animationDelay: '2s' }}
        />

        {/* Layer 3: Dot grid overlay (subtle, rad-masked) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(100 116 139 / 0.15) 1px, transparent 0)`,
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 50%, black 0%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 50%, black 0%, transparent 80%)',
          }}
        />

        {/* Top section: Brand (mobile) + Form (centered) */}
        <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8 sm:py-12 relative z-10">
          <div className="w-full max-w-md relative">
            {/* Mobile-only brand header */}
            <div className="md:hidden text-center mb-6 animate-fade-in motion-reduce:animate-none" style={{ animationDelay: '150ms' }}>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 mb-3">
                <img
                  src="/logo-pesantren.webp"
                  alt="Logo Pesantren Minhaj Shahabah"
                  width="40"
                  height="40"
                  className="w-9 h-9 object-contain"
                />
              </div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Amanah Sampah</h1>
              <p className="text-xs text-slate-500 mt-0.5">Pesantren Minhaj Shahabah | Bogor</p>
            </div>

            {/* Desktop title */}
            <header className="hidden md:block mb-6 animate-slide-from-right motion-reduce:animate-none" style={{ animationDelay: '200ms' }}>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Selamat datang kembali</h1>
              <p className="text-sm text-slate-500 mt-1">Masuk untuk melanjutkan ke dashboard Anda</p>
            </header>

            {/* Login Card */}
            <section
              className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-6 sm:p-7 animate-zoom-fade-in motion-reduce:animate-none" style={{ animationDelay: '400ms' }}
              aria-label="Form login"
            >
              <div className="md:hidden mb-5">
                <h2 className="text-base font-semibold text-slate-900">Masuk ke akun Anda</h2>
                <p className="text-xs text-slate-500 mt-0.5">Gunakan NIS atau email terdaftar</p>
              </div>

              <form onSubmit={submit} noValidate className="space-y-4">
                {error && (
                  <div
                    id={errorId}
                    role="alert"
                    className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 ring-1 ring-red-200/80 text-sm text-red-700 animate-fade-in"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor={loginIdId} className="block text-xs font-medium text-slate-700 mb-1.5">
                    NIS / Email
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                    <input
                      ref={loginIdRef}
                      id={loginIdId}
                      name="login"
                      type="text"
                      autoComplete="username"
                      inputMode="text"
                      spellCheck={false}
                      className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                      value={loginId}
                      onChange={(e) => { setLoginId(e.target.value); setError(null); }}
                      placeholder="23001 atau admin@amanah.id"
                      required
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={!!error || undefined}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={passwordId} className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                    <input
                      id={passwordId}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={!!error || undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      aria-pressed={showPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText="Memproses..."
                  className="w-full mt-1 py-2.5"
                  variant="primary"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  Masuk
                </LoadingButton>

                <p className="text-[11px] text-slate-400 text-center pt-1 flex items-center justify-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 font-mono text-[10px]">Enter</kbd>
                  <span>untuk login</span>
                </p>
              </form>
            </section>

            {/* Quick Login */}
            <section
              className="mt-5 animate-slide-from-right motion-reduce:animate-none"
              style={{ animationDelay: '600ms' }}
              aria-label="Quick login untuk testing"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>Quick login</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Testing</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_ROLES.map((role) => {
                  const isSelected = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => quickFill(role)}
                      aria-label={`Isi kredensial role ${role.label}: ${role.login}`}
                      aria-pressed={isSelected}
                      className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
                        isSelected
                          ? 'bg-brand-600 text-white ring-1 ring-brand-600 shadow-sm'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{role.label}</span>
                      <ChevronRight className={`w-3 h-3 transition-transform ${isSelected ? 'opacity-100' : 'opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0'}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* Bottom section: Features highlights + Footer */}
        <div className="border-t border-slate-200/80 bg-white/70 backdrop-blur-md px-5 sm:px-8 py-6 md:py-7 relative z-10">
          <div className="max-w-3xl mx-auto">
            {/* Features row */}
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 motion-reduce:animate-none"
              aria-label="Fitur unggulan aplikasi"
            >
              {FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex items-start gap-3 animate-zoom-fade-in"
                    style={{ animationDelay: `${800 + i * 100}ms` }}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-200/80 flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 leading-tight">{feature.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500 animate-fade-in motion-reduce:animate-none" style={{ animationDelay: '1100ms' }}>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-500" aria-hidden="true" />
                <span>Dilindungi Sanctum Token | End-to-end aman</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span>v1.1 | Prototype</span>
                <span aria-hidden="true">|</span>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-600 transition-colors inline-flex items-center gap-1"
                >
                  Docs
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
