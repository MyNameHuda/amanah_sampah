import type { ReactNode } from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/**
 * `TableRowSkeleton` & `TableSkeleton` dihapus: tidak ada importer di seluruh
 * `src/`. Semua halaman yang punya tabel memuat data lewat
 * `EmptyState`/spinner, bukan skeleton tabel — dan di mobile tabelnya
 * dirender sebagai card list, jadi skeleton tabel tidak relevan.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 text-slate-400 rounded-full mb-3 ring-1 ring-slate-200">
        {icon}
      </div>
      <h3 className="font-medium text-slate-700">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
