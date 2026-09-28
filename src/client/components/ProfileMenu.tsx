import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { UserCircle2, LogOut, ChevronDown } from 'lucide-react';

// Modal edit biodata — lazy-load on first click (EditProfileModal 6KB).
// ProfileMenu dipakai di sidebar SETIAP halaman — tidak masuk akal download modal ini
// kalau user tidak pernah buka menu.
const EditProfileModal = lazy(() => import('./EditProfileModal').then(m => ({ default: m.EditProfileModal })));

const ModalFallback = () => null;

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-slate-700 truncate max-w-[120px]">{user.name}</p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 animate-slide-up">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email || `ID #${user.id}`}</p>
            <p className="text-xs text-slate-400 mt-1 capitalize">{user.role.replace(/_/g, ' ')}</p>
          </div>
          <button
            onClick={() => { setOpen(false); setShowEdit(true); }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <UserCircle2 className="w-4 h-4" />
            Edit Biodata
          </button>
          <div className="border-t border-slate-100 my-1"></div>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}

      <Suspense fallback={<ModalFallback />}>
        <EditProfileModal open={showEdit} onClose={() => setShowEdit(false)} />
      </Suspense>
    </div>
  );
}
