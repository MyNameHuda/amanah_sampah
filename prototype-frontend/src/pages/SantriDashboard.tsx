import { useEffect, useState } from 'react';
import api, { type Santri, type PoinLedgerEntry, type Reward } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge, PoinBadge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { CardSkeleton, EmptyState } from '../components/Skeleton';
import { LoadingButton } from '../components/LoadingButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getPoinSourceMeta } from '../utils/poinSource';
import { Wallet, AlertTriangle, ShoppingBag, Gift, History, TrendingUp, TrendingDown, Check, Lock } from 'lucide-react';

export default function SantriDashboard() {
  const toast = useToast();
  const [santri, setSantri] = useState<Santri | null>(null);
  const [openDebts, setOpenDebts] = useState<{ barcode: string; nama_produk: string; qty: number }[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [ledger, setLedger] = useState<PoinLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmRedeem, setConfirmRedeem] = useState<Reward | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const me = await api.get('/auth/me');
      const nis = me.data.santri?.nis;
      if (!nis) { return; }
      const detail = await api.get(`/santri/${nis}`);
      setSantri(detail.data.santri);
      setOpenDebts(detail.data.open_debts);
      setLedger(detail.data.recent_ledger);
      const rw = await api.get('/reward');
      setRewards(rw.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function performRedeem(reward: Reward) {
    setRedeemingId(reward.id_reward);
    try {
      const r = await api.post(`/reward/${reward.id_reward}/redeem`);
      toast.success(r.data.message);
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Redeem gagal.');
    } finally {
      setRedeemingId(null);
    }
  }

  function askRedeem(reward: Reward) {
    // Tidak ada inline guard "poin tidak cukup" di sini: tombol sudah
    // `disabled` saat reward tidak affordable, jadi cabang tersebut tidak akan
    // pernah tercapai. Validasi shortfall tetap ada di backend saat redeem —
    // dua lapis, tapi yang di sini murni UX, bukan security boundary.
    setConfirmRedeem(reward);
  }

  if (loading) {
    return (
      <Layout title="Dashboard Santri">
        <div className="grid md:grid-cols-3 gap-4 mb-4" aria-busy="true" aria-label="Memuat data">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <CardSkeleton />
      </Layout>
    );
  }

  if (!santri) {
    return (
      <Layout title="Dashboard Santri">
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6" />}
          title="Gagal load data"
          description="Silakan login ulang atau hubungi admin."
        />
      </Layout>
    );
  }

  const poinTone: 'success' | 'danger' | 'default' =
    santri.current_poin < 0 ? 'danger' : santri.current_poin > 0 ? 'success' : 'default';

  return (
    <Layout
      title={`Halo, ${santri.nama.split(' ')[0]}`}
      titleShort={`Halo, ${santri.nama.split(' ')[0]}`}
      subtitle={`NIS ${santri.nis} | ${santri.kelas}`}
    >
      {/* Subtitle (NIS | kelas) disembunyikan <sm oleh Layout, jadi NIS
          ditampilkan ulang di sini agar tidak hilang di mobile. */}
      <p className="sm:hidden text-xs text-slate-500 -mt-1 mb-3">
        NIS {santri.nis} | {santri.kelas}
      </p>

      {/* Stats — 2 kolom di mobile (bukan 1) supaya 3 kartu jadi 2 baris
          ringkas, bukan 3 baris penuh. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard
          compact
          icon={<Wallet className="w-5 h-5" />}
          label="Poin Saldo"
          value={<PoinBadge value={santri.current_poin} />}
          hint={santri.current_poin >= 0 ? 'Saldo positif' : 'Saldo minus'}
          tone={poinTone}
        />
        <StatCard
          compact
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Hutang Terbuka"
          value={openDebts.reduce((sum, d) => sum + (d.qty || 0), 0)}
          hint={openDebts.length === 0 ? 'Tidak ada' : `${openDebts.length} produk`}
          tone={santri.is_blocked ? 'danger' : openDebts.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          compact
          icon={<Gift className="w-5 h-5" />}
          label="Reward Tersedia"
          value={rewards.filter((r) => r.status_aktif && r.stok > 0).length}
          hint={`dari ${rewards.length} total`}
          tone="default"
        />
      </div>

      {/* Block warning banner */}
      {santri.is_blocked && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg mb-6 flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Akun terblokir</p>
            <p className="text-sm mt-0.5">{santri.block_reason || 'Tidak boleh beli produk kemasan plastik.'}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Hutang terbuka */}
        <div className="card card-hover">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag className="w-5 h-5 text-amber-600" aria-hidden="true" />
            <h3 className="font-semibold text-slate-800">Hutang yang Perlu Disetor</h3>
          </div>
          {openDebts.length === 0 ? (
            <EmptyState
              icon={<Check className="w-6 h-6 text-green-600" />}
              title="Bersih!"
              description="Tidak ada utang terbuka. Pertahankan!"
            />
          ) : (
            <ul className="divide-y divide-slate-100 -mx-2">
              {openDebts.map((d, i) => (
                <li key={i} className="px-2 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 rounded transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.nama_produk}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate" title={d.barcode}>{d.barcode}</p>
                  </div>
                  <Badge tone="red">{d.qty} unit</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reward catalog */}
        <div className="card card-hover">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-pink-600" aria-hidden="true" />
            <h3 className="font-semibold text-slate-800">Catalog Reward</h3>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
            {rewards.length === 0 ? (
              <EmptyState
                icon={<Gift className="w-6 h-6" />}
                title="Belum ada reward"
                description="Reward akan muncul setelah admin menambahkannya."
              />
            ) : rewards.map((r) => {
              const affordable = !!santri && santri.current_poin >= r.biaya_poin && r.stok > 0 && r.status_aktif;
              const isLoading = redeemingId === r.id_reward;
              // Tombol "Tukar" yang disabled tanpa penjelasan membuat item
              // terasa seperti error. Sebutkan alasannya secara spesifik —
              // "stok habis" dan "kurang N poin" butuh tindakan berbeda.
              const blockedReason = !r.status_aktif
                ? 'Tidak aktif'
                : r.stok === 0
                  ? 'Stok habis'
                  : santri.current_poin < r.biaya_poin
                    ? `Kurang ${r.biaya_poin - santri.current_poin} poin`
                    : null;
              return (
                <div key={r.id_reward} className={`flex justify-between items-center gap-2 p-2.5 rounded-lg border transition-all ${affordable ? 'border-brand-200 bg-brand-50/30 hover:bg-brand-50' : 'border-slate-200 bg-white'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{r.nama_reward}</p>
                    <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{r.biaya_poin} poin</span>
                      <span className="text-slate-300" aria-hidden="true">|</span>
                      <span className={r.stok === 0 ? 'text-red-500' : ''}>stok {r.stok}</span>
                      {blockedReason && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">|</span>
                          <span className="text-amber-600 font-medium">{blockedReason}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <LoadingButton
                    variant={affordable ? 'primary' : 'secondary'}
                    loading={isLoading}
                    loadingText="..."
                    disabled={!affordable}
                    onClick={() => askRedeem(r)}
                    aria-label={
                      affordable
                        ? `Tukar ${r.nama_reward} dengan ${r.biaya_poin} poin`
                        : `${r.nama_reward} tidak bisa ditukar: ${blockedReason}`
                    }
                    className="text-xs shrink-0"
                  >
                    {affordable ? 'Tukar' : <Lock className="w-3 h-3" aria-hidden="true" />}
                  </LoadingButton>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Poin ledger */}
      <div className="card mt-6">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-5 h-5 text-blue-600" aria-hidden="true" />
          <h3 className="font-semibold text-slate-800">Riwayat Poin</h3>
          <span className="text-xs text-slate-500">(20 terakhir)</span>
        </div>
        {ledger.length === 0 ? (
          <EmptyState
            icon={<History className="w-6 h-6" />}
            title="Belum ada mutasi"
            description="Mutasi poin akan muncul setelah ada transaksi."
          />
        ) : (
          <>
            {/* Mobile: card list. 4 kolom (Waktu/Sumber/Δ Poin/Saldo) di 360px
                butuh scroll horizontal; "Waktu" yang jadi kolom pertama justru
                yang paling panjang, jadi yang paling pertama terpotong. */}
            <ul className="md:hidden divide-y divide-slate-100">
              {ledger.map((l) => (
                <li key={l.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Badge tone={getPoinSourceMeta(l.source_type).tone}>
                      {getPoinSourceMeta(l.source_type).label}
                    </Badge>
                    <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                      {new Date(l.waktu).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className={`text-sm font-semibold inline-flex items-center gap-1 ${
                      l.poin_delta >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {l.poin_delta >= 0
                        ? <TrendingUp className="w-3 h-3" aria-hidden="true" />
                        : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                      {l.poin_delta > 0 ? '+' : ''}{l.poin_delta}
                    </p>
                    <PoinBadge value={l.saldo_sesudah} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 font-medium" scope="col">Waktu</th>
                    <th className="font-medium" scope="col">Sumber</th>
                    <th className="font-medium text-right" scope="col">Δ Poin</th>
                    <th className="font-medium text-right" scope="col">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 text-slate-600 text-xs whitespace-nowrap">{new Date(l.waktu).toLocaleString('id-ID')}</td>
                      <td>
                        <Badge tone={getPoinSourceMeta(l.source_type).tone}>
                          {getPoinSourceMeta(l.source_type).label}
                        </Badge>
                      </td>
                      <td className={`text-right font-medium ${l.poin_delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {l.poin_delta >= 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                          {l.poin_delta > 0 ? '+' : ''}{l.poin_delta}
                        </span>
                      </td>
                      <td className="text-right"><PoinBadge value={l.saldo_sesudah} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRedeem}
        title="Konfirmasi Penukaran Reward"
        description={
          confirmRedeem
            ? `Tukar "${confirmRedeem.nama_reward}" dengan ${confirmRedeem.biaya_poin} poin? Saldo poin kamu akan berkurang setelah konfirmasi.`
            : ''
        }
        confirmText="Ya, Tukar"
        cancelText="Batal"
        tone="info"
        loading={!!redeemingId}
        onConfirm={() => {
          if (confirmRedeem) performRedeem(confirmRedeem);
          setConfirmRedeem(null);
        }}
        onCancel={() => setConfirmRedeem(null)}
      />
    </Layout>
  );
}
