import { useEffect, useState } from 'react';
import api from '../api/client';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Package, ShoppingBag, Plus, Minus, Edit3, Archive, RotateCcw, User as UserIcon, Calendar, Hash } from 'lucide-react';

interface ProductEvent {
  event_type: 'masuk' | 'keluar';
  subtype: string;
  label: string;
  waktu: string;
  actor_name: string | null;
  actor_role: string;
  payload?: any;
  nis?: string;
  qty?: number;
  penalty_per_unit?: number;
  status?: string;
}

interface ProductLogResponse {
  produk: {
    barcode: string;
    nama_produk: string;
    id_kategori: number;
    is_excluded_from_debit: boolean;
    archived_at: string | null;
    kategori?: { id: number; nama_kategori: string };
  };
  summary: {
    created_at: string;
    created_by: number | null;
    updated_at: string;
    updated_by: number | null;
    archived_at: string | null;
    archived_by: number | null;
    purchases: {
      total_tx: number;
      qty_settled: number;
      qty_open: number;
      qty_cancelled: number;
    };
  };
  events: ProductEvent[];
}

interface ProductLogModalProps {
  barcode: string;
  productName: string;
  open: boolean;
  onClose: () => void;
}

const eventTypeTones: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'gray'> = {
  'produk.create': 'green',
  'produk.update': 'blue',
  'produk.archive': 'red',
  'produk.unarchive': 'green',
  'transaksi_pembelian': 'blue',
};

const eventTypeIcons: Record<string, typeof Plus> = {
  'produk.create': Plus,
  'produk.update': Edit3,
  'produk.archive': Archive,
  'produk.unarchive': RotateCcw,
  'transaksi_pembelian': ShoppingBag,
};

export function ProductLogModal({ barcode, productName, open, onClose }: ProductLogModalProps) {
  const toast = useToast();
  const [data, setData] = useState<ProductLogResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !barcode) return;
    setLoading(true);
    api.get<ProductLogResponse>(`/produk/${barcode}/log`)
      .then((r) => setData(r.data))
      .catch(() => { toast.error('Gagal load log.'); setData(null); })
      .finally(() => setLoading(false));
  }, [open, barcode]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Log Produk | ${productName}`}
      description={`${barcode} | Log barang masuk/keluar`}
      size="lg"
    >
      {loading && <div className="text-slate-500 text-sm py-8 text-center">Loading log...</div>}

      {!loading && !data && <div className="text-red-500 text-sm py-8 text-center">Gagal load.</div>}

      {!loading && data && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Transaksi</p>
              <p className="text-xl font-bold text-slate-800">{data.summary.purchases.total_tx}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-xs text-green-700">Disetor</p>
              <p className="text-xl font-bold text-green-800">{data.summary.purchases.qty_settled}</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-xs text-amber-700">Open</p>
              <p className="text-xl font-bold text-amber-800">{data.summary.purchases.qty_open}</p>
            </div>
            <div className="bg-slate-100 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Cancelled</p>
              <p className="text-xl font-bold text-slate-700">{data.summary.purchases.qty_cancelled}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Status</p>
              <p className="text-sm font-medium">
                {data.produk.archived_at
                  ? <span className="text-red-600">Archived</span>
                  : <span className="text-green-700">Aktif</span>}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.produk.archived_at
                  ? new Date(data.produk.archived_at).toLocaleDateString('id-ID')
                  : 'Sedang dijual'}
              </p>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div className="bg-slate-50 p-2.5 rounded">
              <p className="text-slate-500">Kategori</p>
              <p className="font-medium text-slate-700">{data.produk.kategori?.nama_kategori ?? '—'}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded">
              <p className="text-slate-500">Tipe</p>
              <p className="font-medium text-slate-700">
                {data.produk.is_excluded_from_debit ? 'Non-Plastik (no debt)' : 'Plastik (creates debt)'}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />Timeline ({data.events.length} events)
            </h4>

            {data.events.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-500">Belum ada aktivitas.</div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {data.events.map((event, i) => {
                  const Icon = eventTypeIcons[event.subtype] ?? (event.event_type === 'masuk' ? Plus : ShoppingBag);
                  const tone = eventTypeTones[event.subtype] ?? 'gray';
                  return (
                    <div key={i} className={`p-2.5 rounded-lg border ${event.event_type === 'masuk' ? 'border-green-200 bg-green-50/40' : 'border-blue-200 bg-blue-50/40'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-1.5 rounded shrink-0 ${
                          tone === 'green' ? 'bg-green-100 text-green-700' :
                          tone === 'blue' ? 'bg-blue-100 text-blue-700' :
                          tone === 'red' ? 'bg-red-100 text-red-700' :
                          tone === 'yellow' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{event.label}</p>
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              {new Date(event.waktu).toLocaleString('id-ID', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <UserIcon className="w-3 h-3" />
                            <span>{event.actor_name ?? '—'}</span>
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] uppercase">{event.actor_role}</span>
                            {event.qty !== undefined && (
                              <>
                                <span>|</span>
                                <span className="font-medium">{event.qty} unit</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
