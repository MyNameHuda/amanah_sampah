import { memo, type ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode | number | string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  /**
   * Padat: padding & ukuran font dikecilkan supaya 6 stat card muat dalam
   * 3 baris pada grid 2-kolom di mobile, bukan 6 baris penuh. Berguna
   * saat label pendek + satu angka (tipikal kartu statistik).
   */
  compact?: boolean;
}

const TONE_BG = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

export const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  compact = false,
}: StatCardProps) {
  // Defensive: kalau value number tapi NaN/undefined, tampilkan "0"
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : value;

  return (
    <div className={`card hover:shadow-md transition-shadow ${compact ? 'p-3' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-medium text-slate-500 ${compact ? 'text-[11px] leading-tight' : 'text-sm'}`}>{label}</p>
          <p className={`font-bold text-slate-800 truncate ${compact ? 'text-xl mt-0.5' : 'text-2xl mt-1'}`}>{safeValue}</p>
          {hint && <p className="text-xs text-slate-500 mt-1 truncate">{hint}</p>}
        </div>
        <div className={`shrink-0 rounded-lg ${TONE_BG[tone]} ${compact ? 'p-1.5' : 'p-2'}`} aria-hidden="true">{icon}</div>
      </div>
    </div>
  );
});
