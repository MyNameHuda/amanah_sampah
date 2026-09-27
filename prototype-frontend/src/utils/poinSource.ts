import type { PoinLedgerEntry } from '../api/client';

/**
 * Mapping dari raw `source_type` enum (database) ke label yang user-friendly.
 * User tidak perlu tahu istilah teknis seperti "return_match" — lebih baik
 * "Pengembalian" yang langsung menjelaskan apa yang terjadi.
 *
 * Tone di-mapping ke Badge tone untuk quick visual distinction:
 *   - green  = tambah poin (positif)
 *   - red    = kurangi poin (negatif)
 *   - yellow = penukaran reward (debit, netral tapi perlu perhatian)
 *   - blue   = aksi admin / sistem
 *   - gray   = info / saldo awal
 */
export const POIN_SOURCE_LABELS: Record<string, { label: string; tone: 'green' | 'red' | 'blue' | 'gray' | 'yellow' }> = {
  initial:              { label: 'Saldo Awal',          tone: 'gray' },
  purchase:             { label: 'Pembelian',           tone: 'red' },   // debit (utang)
  return_match:         { label: 'Pengembalian',        tone: 'green' }, // credit (poin masuk)
  redeem:               { label: 'Penukaran Reward',    tone: 'yellow' }, // debit (poin keluar)
  reset:                { label: 'Reset Poin',          tone: 'blue' },  // admin
  admin_adjustment:     { label: 'Penyesuaian Admin',   tone: 'blue' },  // admin
};

/** Default fallback untuk source_type yang tidak dikenal / legacy data. */
const FALLBACK = { label: 'Lainnya', tone: 'gray' as const };

export function getPoinSourceMeta(sourceType: string | undefined | null) {
  if (!sourceType) return FALLBACK;
  return POIN_SOURCE_LABELS[sourceType] ?? FALLBACK;
}

export function formatPoinSource(sourceType: string | undefined | null): string {
  return getPoinSourceMeta(sourceType).label;
}

/** Helper type untuk type-safety di komponen yang consume PoinLedgerEntry. */
export type PoinSourceMeta = ReturnType<typeof getPoinSourceMeta>;

// Re-export PoinLedgerEntry untuk type consumers
export type { PoinLedgerEntry };
