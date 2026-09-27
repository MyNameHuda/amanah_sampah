import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export interface DashboardNavItem {
  /** Unique ID untuk active-state detection. Mis. 'health', 'users'. */
  id: string;
  /** Label ditampilkan di sidebar. */
  label: string;
  /**
   * Label ringkas untuk mobile tab strip. Kalau diisi, dipakai di strip dan
   * `label` tetap dipakai di sidebar desktop. Kalau kosong, `label` dipakai
   * di kedua tempat. Memakai label penuh di strip bikin 7 pill melebihi lebar
   * layar dan sebagian besar terpotong di luar viewport.
   */
  shortLabel?: string;
  /** Optional icon component (lucide-react). */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** Optional badge count (mis. jumlah users). */
  badge?: number;
}

export interface DashboardNavGroup {
  /** Optional section label (mis. "Main", "Tools"). */
  label?: string;
  items: DashboardNavItem[];
}

interface DashboardLayoutProps {
  /** Title dashboard — ditampilkan di header. */
  title: string;
  /**
   * Versi pendek untuk layar sempit (<sm). Kalau diisi, title ini yang
   * tampil di mobile sehingga header tidak perlu terpotong ellipsis.
   * Kalau kosong, `title` tetap dipakai (dipotong ellipsis sebagai gantinya).
   */
  titleShort?: string;
  /** Subtitle di header. Disembunyikan otomatis di mobile — di 360px teksnya
   *  hanya jadi "Oper..." yang tidak terbaca, lebih baik tidak ditampilkan. */
  subtitle?: string;
  /** Slot untuk extra action buttons di header (mis. "User Management"). */
  headerActions?: ReactNode;
  /** Konfigurasi navigasi. */
  nav: DashboardNavGroup[];
  /** ID item yang sedang aktif. Sidebar highlight + parent route update. */
  activeId: string;
  /** Handler saat user click item di sidebar. Parent handle state/URL update. */
  onNavigate: (id: string) => void;
  /** Content utama (yang saat ini adalah tab content). */
  children: ReactNode;
}

/**
 * Responsive dashboard layout dengan sidebar navigation.
 *
 * - Desktop (md+): persistent sidebar di kiri (240px), content di kanan.
 * - Mobile (<md): header ringkas (judul pendek, CTA jadi icon-only) +
 *   horizontal tab strip di bawahnya. Strip ini membuat SETIAP tujuan
 *   terjangkau dalam 1 tap dan menunjukkan posisi sekarang — sebelumnya
 *   semua nav tersembunyi di balik hamburger (2 tap per navigasi, tanpa
 *   indikasi posisi). Drawer tetap ada untuk info user + logout.
 * - Sticky header + tab strip digabung dalam satu wrapper agar tidak perlu
 *   menghitung tinggi header secara manual saat subtitle hide/show.
 * - Active route highlighted dengan background brand color.
 * - Safe-area inset dihormati untuk perangkat ber-notch (iPhone).
 *
 * Compatible dengan semua role dashboard (Super Admin, Admin, dll) —
 * cukup pass `nav` config yang relevan.
 */
export function DashboardLayout({ title, titleShort, subtitle, headerActions, nav, activeId, onNavigate, children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const stripRef = useRef<HTMLElement>(null);

  // Auto-close mobile drawer saat route berubah (UX: drawer menutup setelah navigasi)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Scroll tab strip supaya pill aktif selalu terlihat.
  // Target disejajarkan ke KIRI (scroll-snap-align: start), bukan ke tengah:
  // kalau di-center, snap mandatory akan menariknya balik ke kiri setelah
  // smooth scroll selesai dan terlihat seperti lompatan. Pakai scrollLeft
  // manual (bukan scrollIntoView) supaya halaman utama tidak ikut ter-scroll.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const pill = strip.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`);
    if (!pill) return;
    strip.scrollTo({ left: Math.max(0, pill.offsetLeft - 8), behavior: 'smooth' });
  }, [activeId]);

  // Lock body scroll saat drawer mobile terbuka
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // Close on Escape (accessibility)
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  function renderNavItem(item: DashboardNavItem) {
    const Icon = item.icon;
    const isActive = item.id === activeId;
    return (
      <button
        type="button"
        key={item.id}
        onClick={() => onNavigate(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={[
          'group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          isActive
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-slate-700 hover:bg-slate-100',
        ].join(' ')}
      >
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'}`} aria-hidden="true" />}
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700 group-hover:bg-slate-300'
          }`}>
            {item.badge}
          </span>
        )}
      </button>
    );
  }

  function renderSidebarContent() {
    return (
      <div className="flex flex-col h-full">
        {/* Brand header */}
        <div className="px-4 py-4 border-b border-slate-200 shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-pesantren.webp"
              alt="Logo Pesantren Minhaj Shahabah"
              width="36"
              height="36"
              loading="eager"
              className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold text-slate-800 truncate">Amanah Sampah</p>
              <p className="text-[10px] text-slate-500 truncate">Minhaj Shahabah</p>
            </div>
          </div>
        </div>

        {/* Nav groups (scrollable) */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Dashboard navigation">
          {nav.map((group, gIdx) => (
            <div key={gIdx}>
              {group.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + logout (always at bottom) */}
        {user && (
          <div className="border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate capitalize">
                  {user.role.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-2 w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Logout"
            >
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
              Logout
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Skip-to-content untuk keyboard users */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-brand-500 focus:text-sm focus:font-medium"
      >
        Lewati ke konten utama
      </a>

      {/* Desktop sidebar (md+) — persistent */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen"
        aria-label="Dashboard sidebar"
      >
        {renderSidebarContent()}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="presentation">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in motion-reduce:animate-none"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-slide-from-right motion-reduce:animate-none"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation drawer"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Tutup menu navigasi"
              className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 z-10"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}
      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky wrapper: header + mobile tab strip digabung supaya keduanya
            menempel sebagai satu blok dan tidak perlu offset manual. */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
          {/* Top bar (mobile: hamburger + short title; desktop: full header) */}
          <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 pt-[max(0.625rem,env(safe-area-inset-top))]">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden shrink-0 -ml-1 p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Buka menu navigasi"
              aria-expanded={mobileOpen}
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Title block */}
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-semibold text-slate-800 leading-tight truncate">
                {/* Mobile: judul pendek supaya tidak terpotong. */}
                <span className="sm:hidden">{titleShort || title}</span>
                <span className="hidden sm:inline">{title}</span>
              </h1>
              {/* Subtitle dekoratif — hide di mobile, tidak ada ruang untuk membacanya. */}
              {subtitle && (
                <p className="hidden sm:block text-xs text-slate-500 truncate">{subtitle}</p>
              )}
            </div>

            {/* Header actions */}
            {headerActions && <div className="shrink-0 flex items-center gap-1 sm:gap-2">{headerActions}</div>}
          </div>

          {/* Mobile tab strip — semua tujuan dalam 1 tap, plus indikator posisi.
              md+ pakai sidebar persistent, jadi strip disembunyikan. */}
          <nav
            ref={stripRef}
            aria-label="Dashboard sections"
            className="md:hidden flex gap-1.5 overflow-x-auto scrollbar-hide snap-x-mandatory px-4 pb-2 -mb-px"
          >
            {nav.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-tab-id={item.id}
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'snap-start-always shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200',
                  ].join(' ')}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  {item.shortLabel || item.label}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`shrink-0 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-300 text-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 px-4 sm:px-6 py-4 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-fade-in motion-reduce:animate-none relative overflow-hidden"
        >
          {/* [F-feat] Logo pesantren sebagai watermark di tengah area konten.
              Opacity lebih rendah di mobile supaya tidakeghambat pembacaan
              angka kecil saat layar sempit. */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <img
              src="/logo-pesantren.webp"
              alt=""
              width="400"
              height="400"
              loading="lazy"
              decoding="async"
              className="w-56 h-56 sm:w-96 sm:h-96 object-contain opacity-[0.07] sm:opacity-[0.12] motion-reduce:opacity-[0.16] select-none"
              draggable={false}
            />
          </div>
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
