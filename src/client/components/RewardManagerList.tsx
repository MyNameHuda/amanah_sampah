import { useState } from 'react';
import { Plus, RefreshCw, Search, Pencil, Power, Archive, RotateCcw, History, Package, Coins, Gift } from 'lucide-react';
import type { Reward, RewardFilter } from '../api/client';
import { Badge } from './Badge';
import { EmptyState } from './Skeleton';
import { LoadingButton } from './LoadingButton';

interface RewardListProps {
  rewards: Reward[];
  loading: boolean;
  filter: RewardFilter;
  onFilterChange: (f: RewardFilter) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onEdit: (r: Reward) => void;
  onAdd: () => void;
  onRefresh: () => void;
  onArchive: (r: Reward) => void;
  onRestore: (r: Reward) => void;
  onToggleActive: (r: Reward) => void;
}

const FILTER_TABS: { value: RewardFilter; label: string; tone: 'green' | 'gray' | 'amber' | 'red' }[] = [
  { value: 'all', label: 'Semua', tone: 'gray' },
  { value: 'active', label: 'Aktif', tone: 'green' },
  { value: 'inactive', label: 'Non-aktif', tone: 'amber' },
  { value: 'archived', label: 'Archived', tone: 'red' },
];

const FILTER_BUTTON_BG: Record<typeof FILTER_TABS[number]['tone'], string> = {
  green: 'bg-green-100 text-green-800 ring-green-200',
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
};

export function RewardManagerList({
  rewards,
  loading,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onEdit,
  onAdd,
  onRefresh,
  onArchive,
  onRestore,
  onToggleActive,
}: RewardListProps) {
  const [searchInput, setSearchInput] = useState(search);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSearchChange(searchInput);
  }

  return (
    <section className="card card-hover animate-fade-in motion-reduce:animate-none" aria-label="Manajemen catalog reward">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-pink-600" aria-hidden="true" />
          <h3 className="font-semibold text-slate-800">Catalog Reward</h3>
          <Badge tone="gray">{rewards.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <LoadingButton variant="secondary" onClick={onRefresh} loading={loading} loadingText="Memuat...">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </LoadingButton>
          <LoadingButton variant="primary" onClick={onAdd}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Tambah Reward
          </LoadingButton>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onFilterChange(tab.value)}
            aria-pressed={filter === tab.value}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              filter === tab.value
                ? `${FILTER_BUTTON_BG[tab.tone]} ring-current`
                : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <form onSubmit={handleSearchSubmit} className="ml-auto relative" role="search">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama reward..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Cari reward berdasarkan nama"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-full bg-white transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none w-44 sm:w-56"
          />
        </form>
      </div>

      {/* Table */}
      {loading && rewards.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500" aria-busy="true">Memuat data reward...</div>
      ) : rewards.length === 0 ? (
        <EmptyState
          icon={<Package className="w-6 h-6" />}
          title={search || filter !== 'all' ? 'Tidak ada reward sesuai filter' : 'Belum ada reward'}
          description={search || filter !== 'all' ? 'Coba ubah filter atau kata kunci pencarian.' : 'Tambahkan reward pertama untuk memulai catalog.'}
          action={
            !search && filter === 'all' ? (
              <button
                type="button"
                onClick={onAdd}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Tambah Reward
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th scope="col" className="py-2 px-3 font-medium">Nama</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">Biaya</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">Stok</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">Redeem</th>
                <th scope="col" className="py-2 px-3 font-medium">Status</th>
                <th scope="col" className="py-2 px-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id_reward} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${r.is_archived ? 'bg-slate-50/50' : ''}`}>
                  <td className="py-2.5 px-3 align-top">
                    <div className="flex items-start gap-2">
                      <Gift className={`w-4 h-4 mt-0.5 shrink-0 ${r.is_archived ? 'text-slate-300' : 'text-pink-500'}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${r.is_archived ? 'text-slate-500 line-through decoration-slate-400' : 'text-slate-800'}`}>{r.nama_reward}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{r.id_reward.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right align-top font-medium text-slate-700">{r.biaya_poin}</td>
                  <td className="py-2.5 px-3 text-right align-top">
                    <span className={r.stok === 0 ? 'text-red-600 font-semibold' : 'text-slate-700'}>{r.stok}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right align-top text-slate-500">{r.redeemed_count ?? 0}</td>
                  <td className="py-2.5 px-3 align-top">
                    {r.is_archived ? (
                      <Badge tone="red">Archived</Badge>
                    ) : r.status_aktif ? (
                      <Badge tone="green">Aktif</Badge>
                    ) : (
                      <Badge tone="yellow">Non-aktif</Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right align-top">
                    <div className="inline-flex items-center gap-1">
                      {r.is_archived ? (
                        <button
                          type="button"
                          onClick={() => onRestore(r)}
                          aria-label={`Restore ${r.nama_reward}`}
                          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(r)}
                            aria-label={`Edit ${r.nama_reward}`}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleActive(r)}
                            aria-label={r.status_aktif ? `Nonaktifkan ${r.nama_reward}` : `Aktifkan ${r.nama_reward}`}
                            title={r.status_aktif ? 'Nonaktifkan' : 'Aktifkan'}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Power className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onArchive(r)}
                            aria-label={`Archive ${r.nama_reward}`}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                          >
                            <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <History className="w-3 h-3" aria-hidden="true" />
          <span>Setiap aksi CRUD tercatat di audit log super-admin.</span>
        </div>
        {rewards.length > 0 && (
          <span>{rewards.length} reward ditampilkan</span>
        )}
      </div>
    </section>
  );
}
