import { useEffect, useState } from 'react';
import api from '../api/client';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Activity, FileText, User as UserIcon, Calendar, Tag } from 'lucide-react';

interface AuditLogEntry {
  id: number;
  waktu: string;
  role: string;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  payload: any;
  admin_alasan: string | null;
  ip_address: string | null;
  is_actor: boolean;
}

interface UserAuditResponse {
  user: { id: number; name: string; email: string | null; role: string; created_at: string };
  stats: {
    total_actions: number;
    as_actor: number;
    as_target: number;
    last_activity: string | null;
    action_breakdown: Record<string, number>;
  };
  logs: AuditLogEntry[];
}

interface UserAuditModalProps {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}

export function UserAuditModal({ userId, userName, open, onClose }: UserAuditModalProps) {
  const [data, setData] = useState<UserAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setFilter('');
    api.get<UserAuditResponse>(`/super-admin/users/${userId}/audit`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const actionTones: Record<string, 'green' | 'red' | 'yellow' | 'blue' | 'gray'> = {
    'auth.login': 'green',
    'auth.logout': 'gray',
    'auth.password_change': 'blue',
    'pembelian.create': 'green',
    'verifikasi.commit': 'green',
    'verifikasi.cancel': 'yellow',
    'verifikasi.open_sesi': 'blue',
    'verifikasi.force_end': 'red',
    'reset.start': 'yellow',
    'reset.step1': 'yellow',
    'reset.complete': 'green',
    'reward.create': 'green',
    'reward.redeem': 'green',
    'profile.update_self': 'blue',
    'superadmin.user_create': 'green',
    'superadmin.user_update': 'blue',
    'superadmin.user_delete': 'red',
    'superadmin.force_logout': 'yellow',
    'superadmin.password_reset': 'yellow',
    'superadmin.toggle_suspend': 'yellow',
    'superadmin.mode_toggle': 'yellow',
    'superadmin.config_update': 'yellow',
    'superadmin.cron_manual_trigger': 'blue',
    'superadmin.reverse_transaction': 'red',
    'superadmin.adjust_poin': 'yellow',
    'superadmin.recompute_saldo': 'yellow',
    'superadmin.coverage': 'blue',
    'superadmin.audit': 'blue',
  };

  const filtered = data?.logs.filter((log) => !filter || log.action === filter) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Audit Log | ${userName}`}
      description="Riwayat aktivitas terkait user ini (sebagai actor & target)"
      size="lg"
    >
      {loading && <div className="text-slate-500 text-sm py-8 text-center">Loading audit log...</div>}

      {!loading && !data && <div className="text-red-500 text-sm py-8 text-center">Gagal load audit log.</div>}

      {!loading && data && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Total Actions</p>
              <p className="text-xl font-bold text-slate-800">{data.stats.total_actions}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Sebagai Actor</p>
              <p className="text-xl font-bold text-blue-700">{data.stats.as_actor}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Sebagai Target</p>
              <p className="text-xl font-bold text-amber-700">{data.stats.as_target}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500">Aktivitas Terakhir</p>
              <p className="text-sm font-medium text-slate-800">
                {data.stats.last_activity ? new Date(data.stats.last_activity).toLocaleString('id-ID') : '—'}
              </p>
            </div>
          </div>

          {/* Action breakdown + filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filter action:</span>
            <button
              onClick={() => setFilter('')}
              className={`text-xs px-2 py-0.5 rounded ${filter === '' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Semua ({data.logs.length})
            </button>
            {Object.entries(data.stats.action_breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([action, count]) => (
                <button
                  key={action}
                  onClick={() => setFilter(action)}
                  className={`text-xs px-2 py-0.5 rounded font-mono ${
                    filter === action
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {action} ({count})
                </button>
              ))}
          </div>

          {/* Timeline */}
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              {filter ? `Tidak ada log dengan action "${filter}".` : 'Belum ada aktivitas.'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                  <tr>
                    <th className="py-2 font-medium">Waktu</th>
                    <th className="font-medium">Role</th>
                    <th className="font-medium">Action</th>
                    <th className="font-medium">Actor?</th>
                    <th className="font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(log.waktu).toLocaleString('id-ID', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td>
                        <Badge tone="gray">{log.role}</Badge>
                      </td>
                      <td>
                        <Badge tone={actionTones[log.action] || 'gray'} icon={<Tag className="w-3 h-3" />}>
                          {log.action}
                        </Badge>
                      </td>
                      <td>
                        {log.is_actor
                          ? <Badge tone="blue" icon={<UserIcon className="w-3 h-3" />}>Actor</Badge>
                          : <Badge tone="yellow" icon={<Activity className="w-3 h-3" />}>Target</Badge>}
                      </td>
                      <td className="text-xs font-mono text-slate-600 max-w-md">
                        {log.admin_alasan && (
                          <div className="bg-amber-50 text-amber-900 p-1.5 rounded mb-1 not-italic">
                            <strong>Alasan:</strong> {log.admin_alasan}
                          </div>
                        )}
                        <pre className="whitespace-pre-wrap break-all text-[10px]">
                          {JSON.stringify(log.payload, null, 0)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
