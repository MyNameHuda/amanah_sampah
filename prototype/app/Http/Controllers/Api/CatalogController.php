<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\KategoriProduk;
use App\Models\Produk;
use App\Models\TransaksiPembelian;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CatalogController extends Controller
{
    /**
     * GET /api/kategori — list (public).
     */
    public function indexKategori()
    {
        return response()->json(['data' => KategoriProduk::with('produk')->get()]);
    }

    /**
     * POST /api/kategori — staff/admin/petugas create.
     * [FEAT] Staff kantin sekarang bisa menambahkan kategori produk baru
     * untuk mengelompokkan produk yang belum ada kategorinya.
     */
    public function storeKategori(Request $request)
    {
        $user = $request->user();
        if (!$this->canManageProduk($user)) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $data = $request->validate([
            'nama_kategori' => 'required|string|max:50|unique:kategori_produk,nama_kategori',
            'deskripsi' => 'nullable|string|max:500',
            'is_default_excluded' => 'boolean',
        ]);
        $kat = KategoriProduk::create($data);
        AuditLog::record('kategori.create', [
            'id' => $kat->id,
            'name' => $kat->nama_kategori,
            'is_default_excluded' => $kat->is_default_excluded,
            'created_by' => $user->id,
            'role' => $user->role,
        ], ['user' => $user]);
        return response()->json(['kategori' => $kat], 201);
    }

    /**
     * GET /api/kategori/{id}/check-name — real-time check untuk form Tambah Kategori.
     * Returns 200 jika nama tersedia, 409 jika duplikat.
     */
    public function checkKategoriName(Request $request, $id = null)
    {
        $nama = trim((string) $request->query('nama'));
        if ($nama === '' || strlen($nama) > 50) {
            return response()->json([
                'available' => false,
                'reason' => 'invalid_format',
                'message' => 'Nama kategori kosong atau terlalu panjang (max 50 char).',
            ], 422);
        }

        $query = KategoriProduk::where('nama_kategori', $nama);
        if ($id) {
            $query->where('id', '!=', $id);  // skip self saat edit
        }
        $existing = $query->first();

        if ($existing) {
            return response()->json([
                'available' => false,
                'reason' => 'duplicate',
                'message' => "Nama kategori '{$nama}' sudah dipakai.",
                'existing' => [
                    'id' => $existing->id,
                    'nama_kategori' => $existing->nama_kategori,
                ],
            ], 409);
        }

        return response()->json([
            'available' => true,
            'nama' => $nama,
            'message' => 'Nama kategori tersedia.',
        ]);
    }

    /**
     * GET /api/produk — list (any auth user).
     */
    public function indexProduk(Request $request)
    {
        $query = Produk::with('kategori');
        // Filter archived by default (POS only sees active); admin/super can include archived
        $user = $request->user();
        if ($request->boolean('include_archived') && ($user->isAdmin() || $user->isSuperAdmin())) {
            // Include archived
        } else {
            $query->whereNull('archived_at');
        }
        if ($barcode = $request->query('barcode')) {
            $query->where('barcode', 'like', "%$barcode%");
        }
        if ($nama = $request->query('nama')) {
            $query->where('nama_produk', 'like', "%$nama%");
        }
        if ($kat = $request->query('kategori')) {
            $query->whereHas('kategori', fn($q) => $q->where('nama_kategori', $kat));
        }
        if ($archived = $request->query('archived')) {
            if ($archived === 'only') $query->whereNotNull('archived_at');
            elseif ($archived === 'no') $query->whereNull('archived_at');
        }
        return response()->json(['data' => $query->limit(200)->get()]);
    }

    /**
     * GET /api/produk/scan/{barcode} — quick lookup untuk scanner camera.
     *
     * Optimized untuk real-time scanning: 1 query, minimal payload,
     * return archived status agar scanner UI bisa tampilkan warning.
     *
     * Response 200 (found):
     * { "found": true, "produk": {barcode, nama_produk, kategori, is_excluded_from_debit, archived} }
     *
     * Response 404 (not found):
     * { "found": false, "barcode": "..." }
     */
    public function scanProduk(Request $request, $barcode)
    {
        $user = $request->user();
        $barcode = trim((string) $barcode);

        if ($barcode === '' || strlen($barcode) > 50) {
            throw ValidationException::withMessages([
                'barcode' => 'Barcode kosong atau terlalu panjang.'
            ]);
        }

        $produk = Produk::with('kategori:id,nama_kategori')
            ->where('barcode', $barcode)
            ->first();

        if (!$produk) {
            // Audit: user scan produk yang tidak ada di katalog
            AuditLog::record('produk.scan_not_found', [
                'barcode' => $barcode,
            ], ['user' => $user]);

            return response()->json([
                'found' => false,
                'barcode' => $barcode,
                'message' => 'Produk tidak ditemukan di katalog.',
            ], 404);
        }

        // Audit: scan success (useful for analytics — produk mana yang paling sering di-scan)
        AuditLog::record('produk.scan_hit', [
            'barcode' => $barcode,
            'produk_id' => $produk->barcode,
            'archived' => $produk->archived_at !== null,
        ], ['user' => $user]);

        return response()->json([
            'found' => true,
            'produk' => [
                'barcode' => $produk->barcode,
                'nama_produk' => $produk->nama_produk,
                'kategori' => $produk->kategori?->nama_kategori,
                'is_excluded_from_debit' => $produk->is_excluded_from_debit,
                'archived_at' => $produk->archived_at,
                'is_active' => $produk->archived_at === null,
            ],
        ]);
    }

    /**
     * POST /api/produk — staff/admin/super_admin create.
     */
    public function storeProduk(Request $request)
    {
        $user = $request->user();
        if (!$this->canManageProduk($user)) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $data = $request->validate([
            'barcode' => 'required|string|max:50|unique:produk,barcode',
            'nama_produk' => 'required|string|max:100',
            'id_kategori' => 'required|exists:kategori_produk,id',
            'is_excluded_from_debit' => 'boolean',
        ]);
        $data['created_by'] = $user->id;
        $produk = Produk::create($data);
        AuditLog::record(
            'produk.create',
            ['barcode' => $produk->barcode, 'nama_produk' => $produk->nama_produk, 'created_by' => $user->id, 'role' => $user->role],
            ['user' => $user]
        );
        return response()->json(['produk' => $produk->load('kategori')], 201);
    }

    /**
     * GET /api/produk/check-barcode/{barcode} — real-time duplicate check
     * untuk Form Tambah Produk. Lebih informatif dari generic 422.
     *
     * Response 200 (tersedia, belum ada):
     * { "available": true, "barcode": "..." }
     *
     * Response 409 (duplikat):
     * { "available": false, "barcode": "...", "existing": {...} }
     */
    public function checkBarcodeAvailability(Request $request, $barcode)
    {
        $barcode = trim((string) $barcode);
        if ($barcode === '' || strlen($barcode) > 50) {
            return response()->json([
                'available' => false,
                'barcode' => $barcode,
                'reason' => 'invalid_format',
                'message' => 'Barcode kosong atau terlalu panjang (max 50 char).',
            ], 422);
        }

        $existing = Produk::with('kategori:id,nama_kategori')
            ->where('barcode', $barcode)
            ->first();

        if ($existing) {
            return response()->json([
                'available' => false,
                'barcode' => $barcode,
                'reason' => 'duplicate',
                'message' => "Barcode '{$barcode}' sudah dipakai oleh '{$existing->nama_produk}'.",
                'existing' => [
                    'barcode' => $existing->barcode,
                    'nama_produk' => $existing->nama_produk,
                    'kategori' => $existing->kategori?->nama_kategori,
                    'archived' => $existing->archived_at !== null,
                ],
            ], 409);
        }

        return response()->json([
            'available' => true,
            'barcode' => $barcode,
            'message' => 'Barcode tersedia untuk produk baru.',
        ]);
    }

    /**
     * PATCH /api/produk/{barcode} — staff/admin/super_admin update.
     */
    public function updateProduk(Request $request, $barcode)
    {
        $user = $request->user();
        if (!$this->canEditProduk($user)) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $produk = Produk::findOrFail($barcode);
        if ($produk->archived_at) {
            throw ValidationException::withMessages(['produk' => 'Produk sudah di-archive. Unarchive dulu untuk edit.']);
        }
        $data = $request->validate([
            'nama_produk' => 'sometimes|string|max:100',
            'id_kategori' => 'sometimes|exists:kategori_produk,id',
            'is_excluded_from_debit' => 'sometimes|boolean',
        ]);
        $data['updated_by'] = $user->id;
        $before = $produk->only(['nama_produk', 'id_kategori', 'is_excluded_from_debit']);
        $produk->update($data);
        AuditLog::record(
            'produk.update',
            [
                'barcode' => $produk->barcode,
                'before' => $before,
                'after' => $produk->only(['nama_produk', 'id_kategori', 'is_excluded_from_debit']),
                'updated_by' => $user->id,
            ],
            ['user' => $user]
        );
        return response()->json(['produk' => $produk->fresh()->load('kategori')]);
    }

    /**
     * DELETE /api/produk/{barcode} — archive (soft-delete).
     * Staff/admin/super_admin bisa archive. Hanya super_admin yang bisa unarchive.
     */
    public function archiveProduk(Request $request, $barcode)
    {
        $user = $request->user();
        if (!$this->canEditProduk($user)) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak.']);
        }
        $produk = Produk::findOrFail($barcode);
        $produk->archived_at = now();
        $produk->archived_by = $user->id;
        $produk->updated_by = $user->id;
        $produk->save();

        AuditLog::record(
            'produk.archive',
            ['barcode' => $produk->barcode, 'nama_produk' => $produk->nama_produk, 'archived_by' => $user->id],
            ['user' => $user]
        );
        return response()->json([
            'message' => "Produk '{$produk->nama_produk}' sudah di-archive. Tidak akan muncul di POS lagi.",
            'produk' => $produk->fresh(),
        ]);
    }

    /**
     * POST /api/produk/{barcode}/unarchive — restore.
     * Super_admin only (sesuai PRD T3 intervensi).
     */
    public function unarchiveProduk(Request $request, $barcode)
    {
        $user = $request->user();
        if (!$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak — super admin only.']);
        }
        $produk = Produk::findOrFail($barcode);
        if (!$produk->archived_at) {
            throw ValidationException::withMessages(['produk' => 'Produk tidak dalam keadaan archived.']);
        }
        $produk->archived_at = null;
        $produk->archived_by = null;
        $produk->updated_by = $user->id;
        $produk->save();

        AuditLog::record(
            'produk.unarchive',
            ['barcode' => $produk->barcode, 'restored_by' => $user->id],
            ['user' => $user]
        );
        return response()->json([
            'message' => "Produk '{$produk->nama_produk}' sudah di-restore.",
            'produk' => $produk->fresh(),
        ]);
    }

    /**
     * GET /api/produk/{barcode}/log — log barang masuk & keluar (admin/super_admin view).
     * Masuk = created/updated by staff (audit_log entries).
     * Keluar = purchased by siswa (transaksi_pembelian rows).
     */
    public function productLog(Request $request, $barcode)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            throw ValidationException::withMessages(['auth' => 'Akses ditolak — admin atau super admin.']);
        }
        $produk = Produk::with('kategori')->findOrFail($barcode);

        // === Events: MASUK (created/updated) ===
        $incomingEvents = AuditLog::whereIn('action', ['produk.create', 'produk.update', 'produk.archive', 'produk.unarchive'])
            ->whereRaw("JSON_EXTRACT(payload, '$.barcode') = ?", [$barcode])
            ->orderBy('waktu', 'asc')
            ->limit(200)
            ->get()
            ->map(function ($log) {
                $actionLabel = match ($log->action) {
                    'produk.create' => 'Produk ditambah ke katalog',
                    'produk.update' => 'Produk di-update',
                    'produk.archive' => 'Produk di-archive',
                    'produk.unarchive' => 'Produk di-restore',
                    default => $log->action,
                };
                return [
                    'event_type' => 'masuk', // masuk = incoming (catalog change)
                    'subtype' => $log->action,
                    'label' => $actionLabel,
                    'waktu' => $log->waktu,
                    'actor_name' => $log->payload['created_by'] ?? $log->payload['updated_by'] ?? null,
                    'actor_role' => $log->role,
                    'payload' => $log->payload,
                ];
            });

        // === Events: KELUAR (purchased by siswa) ===
        $outgoingStats = DB::table('transaksi_pembelian')
            ->where('barcode', $barcode)
            ->selectRaw("
                SUM(CASE WHEN status = 'settled' THEN qty ELSE 0 END) as qty_settled,
                SUM(CASE WHEN status = 'open' THEN qty ELSE 0 END) as qty_open,
                SUM(CASE WHEN status = 'cancelled' THEN qty ELSE 0 END) as qty_cancelled,
                COUNT(*) as tx_count
            ")
            ->first();

        $purchaseEvents = DB::table('transaksi_pembelian as t')
            ->join('santri as s', 's.nis', '=', 't.nis')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('t.barcode', $barcode)
            ->orderBy('t.waktu', 'asc')
            ->limit(200)
            ->get(['t.id', 't.nis', 's.nama as nama_siswa', 'u.name as actor_name', 't.qty', 't.penalty_per_unit', 't.status', 't.waktu'])
            ->map(function ($row) {
                $statusLabel = match ($row->status) {
                    'open' => 'Hutang (belum setor)',
                    'settled' => 'Disetor (matched)',
                    'cancelled' => 'Dibatalkan',
                    default => $row->status,
                };
                return [
                    'event_type' => 'keluar', // keluar = outgoing (purchase)
                    'subtype' => 'transaksi_pembelian',
                    'label' => "Dibeli {$row->qty} unit oleh {$row->nama_siswa} (NIS {$row->nis}) — {$statusLabel}",
                    'waktu' => $row->waktu,
                    'actor_name' => $row->nama_siswa,
                    'actor_role' => 'santri',
                    'nis' => $row->nis,
                    'qty' => $row->qty,
                    'penalty_per_unit' => $row->penalty_per_unit,
                    'status' => $row->status,
                ];
            });

        // Merge + sort by waktu (array_merge handles plain arrays without getKey() issue)
        $events = collect(array_merge($incomingEvents->all(), $purchaseEvents->all()))
            ->sortByDesc('waktu')
            ->values();

        return response()->json([
            'produk' => $produk,
            'summary' => [
                'created_at' => $produk->created_at,
                'created_by' => $produk->created_by,
                'updated_at' => $produk->updated_at,
                'updated_by' => $produk->updated_by,
                'archived_at' => $produk->archived_at,
                'archived_by' => $produk->archived_by,
                'purchases' => [
                    'total_tx' => (int) $outgoingStats->tx_count,
                    'qty_settled' => (int) $outgoingStats->qty_settled,
                    'qty_open' => (int) $outgoingStats->qty_open,
                    'qty_cancelled' => (int) $outgoingStats->qty_cancelled,
                ],
            ],
            'events' => $events,
        ]);
    }

    /**
     * Helper: staff kantin + admin + super_admin + petugas boleh manage produk.
     * [FEAT] Petugas bisa add produk baru (barcode scan di lapangan), tapi tidak bisa edit/archive.
     * (Edit & archive masih restricted via canEditProduk().)
     */
    private function canManageProduk($user): bool
    {
        if (!$user) return false;
        return $user->role === 'staff_kantin'
            || $user->isAdmin()
            || $user->isSuperAdmin()
            || $user->isPetugas();
    }

    /**
     * Helper: edit/archive produk hanya untuk admin + super_admin + petugas.
     * (Staff kantin hanya bisa add.)
     */
    private function canEditProduk($user): bool
    {
        if (!$user) return false;
        return $user->isAdmin()
            || $user->isSuperAdmin()
            || $user->isPetugas();
    }
}
