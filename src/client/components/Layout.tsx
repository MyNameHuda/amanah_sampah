import { memo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { User as UserIcon } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import { ROLE_COLOR, roleLabel } from '../utils/role';

interface LayoutProps {
  children: ReactNode;
  title: string;
  /**
   * Versi pendek untuk layar <sm supaya judul tidak terpotong ellipsis.
   * Kalau kosong, `title` tetap dipakai (dan akan truncate).
   */
  titleShort?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default memo(function Layout({ children, title, titleShort, subtitle, actions }: LayoutProps) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-brand-500 focus:text-sm focus:font-medium"
      >
        Lewati ke konten utama
      </a>
      <header
        role="banner"
        className="bg-white border-b border-slate-200 sticky top-0 z-30 backdrop-blur-sm bg-white/95"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src="/logo-pesantren.webp"
              alt="Logo Pesantren Minhaj Shahabah"
              width="48"
              height="48"
              loading="eager"
              decoding="async"
              className="h-9 w-9 sm:h-12 sm:w-12 object-contain shrink-0 rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="min-w-0 border-l border-slate-200 pl-2 sm:pl-3">
              <h1 className="font-semibold text-slate-800 text-base sm:text-lg leading-tight truncate">
                <span className="sm:hidden">{titleShort || title}</span>
                <span className="hidden sm:inline">{title}</span>
              </h1>
              {/* Subtitle deskriptif — disembunyikan <sm karena di 360px hanya
                  jadi potongan 3-4 karakter yang tidak terbaca. */}
              {subtitle && (
                <p className="hidden sm:block text-xs text-slate-500 truncate">{subtitle}</p>
              )}
              <p className="hidden sm:block text-[10px] text-slate-400 truncate">Pesantren Minhaj Shahabah | Bogor</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {actions}
            {user && (
              <>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${ROLE_COLOR[user.role] || 'bg-slate-100 text-slate-700'}`}
                  aria-label={`Role: ${roleLabel(user.role)}`}
                >
                  <UserIcon className="w-3 h-3" aria-hidden="true" />
                  {roleLabel(user.role)}
                </span>
                <ProfileMenu />
              </>
            )}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-fade-in"
      >
        {children}
      </main>
    </div>
  );
});
