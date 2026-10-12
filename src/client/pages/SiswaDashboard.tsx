import { useEffect, useState } from 'react';
import api, { type Siswa, type PoinLedgerEntry, type Reward, type TransaksiPembelian } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Badge, PoinBadge } from '../components/Badge';
import { StatCard } from '../components/StatCard';
import { CardSkeleton, EmptyState } from '../components/Skeleton';
import { LoadingButton } from '../components/LoadingButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getPoinSourceMeta } from '../utils/poinSource';
import { Wallet, AlertTriangle, ShoppingBag, Gift, History, TrendingUp, TrendingDown, Check, Lock } from 'lucide-react';

export default function SiswaDashboard() {
  const toast = useToast();
  const [siswa, setSiswa] = useState<Siswa | null>(null);
  const [openDebts, setOpenDebts] = useState<{ barcode: string; nama_produk: string; qty: number }[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [ledger, setLedger] = useState<PoinLedgerEntry[]>([]);
  const [transaksi, setTransaksi] = useState<TransaksiPembelian[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmRedeem, setConfirmRedeem] = useState<Reward | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      // `GET /api/siswa/me` menggantikan dua request (/auth/me untuk
      // mendapatkan NIS, lalu /siswa/{nis}). Endpoint ini mengembalikan
      // profile, utang terbuka, dan 20 ledger terakhir sekaligus, dan
      // memverifikasi sendiri bahwa NIS-nya milik pemanggil — jadi
      // /siswa/{nis} yang juga menerima NIS milik orang lain tidak dipakai.
      const detail = await api.get('/siswa/me');
      setSiswa(detail.data.siswa);
      setOpenDebts(detail.data.open_debts ?? []);
      setLedger(detail.data.recent_ledger ?? []);

      // Riwayat transaksi lengkap. Dijauhkan dari Promise.all supaya satu
      // failure di sini tidak ikut menggagalkan seluruh card di atas.
      api.get(`/siswa/${detail.data.siswa.nis}/pembelian`)
        .then((r) => setTransaksi(r.data.data ?? []))
        .catch(() => setTransaksi([]));

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
      <Layout title="Dashboard Siswa">
        <div className="grid md:grid-cols-3 gap-4 mb-4" aria-busy="true" aria-label="Memuat data">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <CardSkeleton />
      </Layout>
    );
  }

  if (!siswa) {
    return (
      <Layout title="Dashboard Siswa">
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6" />}
          title="Gagal load data"
          description="Silakan login ulang atau hubungi admin."
        />
      </Layout>
    );
  }

  const poinTone: 'success' | 'danger' | 'default' =
    siswa.current_poin < 0 ? 'danger' : siswa.current_poin > 0 ? 'success' : 'default';

  return (
    <Layout
      title={`Halo, ${siswa.nama.split(' ')[0]}`}
      titleShort={`Halo, ${siswa.nama.split(' ')[0]}`}
      subtitle={`NIS ${siswa.nis} | ${siswa.kelas}`}
    >
      {/* Subtitle (NIS | kelas) disembunyikan <sm oleh Layout, jadi NIS
          ditampilkan ulang di sini agar tidak hilang di mobile. */}
      <p className="sm:hidden text-xs text-slate-500 -mt-1 mb-3">
        NIS {siswa.nis} | {siswa.kelas}
      </p>

      {/* Stats — 2 kolom di mobile (bukan 1) supaya 3 kartu jadi 2 baris
          ringkas, bukan 3 baris penuh. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard
          compact
          icon={<Wallet className="w-5 h-5" />}
          label="Poin Saldo"
          value={<PoinBadge value={siswa.current_poin} />}
          hint={siswa.current_poin >= 0 ? 'Saldo positif' : 'Saldo minus'}
          tone={poinTone}
        />
        <StatCard
          compact
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Hutang Terbuka"
          value={openDebts.reduce((sum, d) => sum + (d.qty || 0), 0)}
          hint={openDebts.length === 0 ? 'Tidak ada' : `${openDebts.length} produk`}
          tone={siswa.is_blocked ? 'danger' : openDebts.length > 0 ? 'warning' : 'success'}
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
      {siswa.is_blocked && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg mb-6 flex items-start gap-3" role="alert">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Akun terblokir</p>
            <p className="text-sm mt-0.5">{siswa.block_reason || 'Tidak boleh beli produk kemasan plastik.'}</p>
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
              const affordable = !!siswa && siswa.current_poin >= r.biaya_poin && r.stok > 0 && r.status_aktif;
              const isLoading = redeemingId === r.id_reward;
              // Tombol "Tukar" yang disabled tanpa penjelasan membuat item
              // terasa seperti error. Sebutkan alasannya secara spesifik —
              // "stok habis" dan "kurang N poin" butuh tindakan berbeda.
              const blockedReason = !r.status_aktif
                ? 'Tidak aktif'
                : r.stok === 0
                  ? 'Stok habis'
                  : siswa.current_poin < r.biaya_poin
                    ? `Kurang ${r.biaya_poin - siswa.current_poin} poin`
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

      {/* Riwayat transaksi pembelian */}
      <div className="card mt-6">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-5 h-5 text-amber-600" aria-hidden="true" />
          <h3 className="font-semibold text-slate-800">Riwayat Transaksi</h3>
          <span className="text-xs text-slate-500">(50 terakhir)</span>
        </div>
        {transaksi.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="w-6 h-6" />}
            title="Belum ada transaksi"
            description="Transaksi pembelian di POS akan muncul di sini."
          />
        ) : (
          <>
            {/* Mobile: card list — 4 kolom tabel tidak muat di 360px. */}
            <ul className="md:hidden divide-y divide-slate-100">
              {transaksi.map((t) => (
                <li key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {t.produk?.nama_produk ?? t.barcode}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {new Date(t.waktu).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {/* Sama seperti tabel: besaran per unit tanpa tanda, dan
                        total tanpa minus manual (nilainya sudah negatif). */}
                    <p className="text-sm font-semibold text-red-700 tabular-nums">
                      {t.qty} × {Math.abs(t.penalty_per_unit)} = {t.penalty_per_unit * t.qty}
                    </p>
                    <Badge tone={t.status === 'open' ? 'yellow' : t.status === 'settled' ? 'green' : 'gray'}>
                      {t.status === 'open' ? 'Belum lunas' : t.status === 'settled' ? 'Lunas' : 'Dibatalkan'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium">Waktu</th>
                    <th className="pb-2 font-medium">Produk</th>
                    <th className="pb-2 font-medium">Barcode</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 pr-6 text-right font-medium">Poin/unit</th>
                    <th className="pb-2 pr-6 text-right font-medium">Total</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transaksi.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2 text-slate-600 text-xs whitespace-nowrap">{new Date(t.waktu).toLocaleString('id-ID')}</td>
                      <td className="text-slate-800">{t.produk?.nama_produk ?? '—'}</td>
                      <td className="font-mono text-xs text-slate-500">{t.barcode}</td>
                      <td className="text-right tabular-nums">{t.qty}</td>
                      {/* `penalty_per_unit` disimpan NEGATIF di database
                          (PENALTY_PER_UNIT = -1 di server/routes/pembelian).
                          Kolom ini menampilkan besarnya saja — tanda minus
                          sudah dipakai kolom Total. Sebelumnya nilai mentah
                          tampil "-1" DAN kolom Total jadi "−-1" (minus dobel). */}
                      <td className="text-right pr-6 tabular-nums">{Math.abs(t.penalty_per_unit)}</td>
                      <td className="text-right pr-6 tabular-nums font-medium text-red-700">
                        {t.penalty_per_unit * t.qty}
                      </td>
                      <td>
                        <Badge tone={t.status === 'open' ? 'yellow' : t.status === 'settled' ? 'green' : 'gray'}>
                          {t.status === 'open' ? 'Belum lunas' : t.status === 'settled' ? 'Lunas' : 'Dibatalkan'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
