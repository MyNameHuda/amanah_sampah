<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PoinLedger;
use App\Models\Produk;
use App\Models\Santri;
use App\Models\SesiVerifikasi;
use App\Models\SesiVerifikasiItem;
use App\Models\TransaksiPembelian;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class VerifikasiController extends Controller
{
    /**
     * Sesi dianggap "menggantung" (idle) setelah tidak ada aktivitas selama
     * DURASI_IDLE_MENIT menit.
     *
     * Kenapa 15 menit: satu verifikasi normal (scan beberapa barang, commit)
     * selesai dalam 2-5 menit. 15 menit tanpa aktivitas tidak mungkin sedang
     * bekerja — itu berarti petugas pergi, HP-nya jatuh, atau browser-nya
     * ke-close. Ambilannya perlu shown karena sesi terbuka tidak hanya
     * "kotor": sesi itu MEMBLOKIR opening sesi baru untuk siswa yang sama,
     * jadi tanpa ada yang menyelesaikan, siswa itu terkunci.
     */
    public const DURASI_IDLE_MENIT = 15;

    /**
     * GET /api/verifikasi/sesi-terbuka — sesi verifikasi yang belum di-commit.
     *
     * Ini yang Consumption notifications untuk petugas. Dua kasus yang harus
     * dibedakan:
     *  - `is_mine: true`  -> sesi milik petugas yang sedang login. INI YANG
     *    PENTING: kalau dia refresh atau browser-nya crash, dia tidak bisa
     *    menemukan sesinya lagi (sebelum ada endpoint ini, tidak ada cara
     *    untuk melanjutkan sesi terbuka sama sekali). Item yang sudah
     *    dia kerjakan jadi tidak bisa di-commit.
     *  - `is_mine: false` -> milik petugas lain. Berguna supaya petugas tahu
     *    harus mencari siapa, bukan bingung melihat error 422 yang tidak
     *    menjelaskan siapa yang memegang sesi.
     */
    public function sesiTerbuka(Request $request)
    {
        $user = $request->user();

        $sesiList = SesiVerifikasi::with(['siswa', 'petugas', 'items'])
            ->whereNull('waktu_selesai')
            ->orderBy('waktu_mulai', 'desc')
            ->get()
            ->map(function ($sesi) use ($user) {
                $lastActivity = $sesi->items->max('created_at') ?? $sesi->waktu_mulai;

                // Arah argumen penting: dihitung DARI lastActivity KE now.
                //
                // Jangan tulis `now()->diffInMinutes($lastActivity)` — sejak
                // Carbon 3, `diffIn*` mengembalikan nilai BERTANDA, jadi itu
                // menghasilkan angka NEGATIF untuk waktu yang sudah lewat,
                // dan setiap sesi akan selalu terbaca "tidak idle".
                $idleMenit = (int) floor($lastActivity->diffInMinutes(now()));

                return [
                    'id' => $sesi->id,
                    'nis' => $sesi->nis,
                    'nama_siswa' => $sesi->siswa?->nama,
                    'kelas_siswa' => $sesi->siswa?->kelas,
                    'petugas_id' => $sesi->petugas_id,
                    'nama_petugas' => $sesi->petugas?->name,
                    'is_mine' => (int) $sesi->petugas_id === (int) $user->id,
                    'waktu_mulai' => $sesi->waktu_mulai,
                    'items_count' => $sesi->items->count(),
                    // Poin yang sudah diinput tapi belum TER-COMMIT ke saldo.
                    // Ini uang yang belum masuk pembukuan — alasan paling kuat
                    // untuk urgedofficer menyelesaikan sesi, bukan sekadar
                    // "data yang belum rapi".
                    'poin_belum_tercatat' => (int) $sesi->items->sum('poin_delta'),
                    'last_activity_at' => $lastActivity,
                    'idle_menit' => $idleMenit,
                    'is_idle' => $idleMenit >= self::DURASI_IDLE_MENIT,
                ];
            });

        $milikSaya = $sesiList->where('is_mine', true);

        return response()->json([
            'data' => $sesiList,
            'count' => $sesiList->count(),
            // Yang paling sering jadi masalah, dan satu-satunya yang bisa
            // langsung diperbaiki oleh petugas yang sedang login.
            'count_mine' => $milikSaya->count(),
            'count_idle_mine' => $milikSaya->where('is_idle', true)->count(),
            'idle_threshold_menit' => self::DURASI_IDLE_MENIT,
            'fetched_at' => now(),
        ]);
    }

    /**
     * Utang terbuka (transaksi status 'open') untuk satu NIS, sudah
     * digabung per barcode.
     *
     * Dipakai oleh `openSesi` DAN `showSesi`. Semula kodenya hanya ada di
     * `openSesi`, jadi response `showSesi` tidak punya open_debts — padahal
     * frontend butuh keduanya supaya bisa melanjutkan sesi yang terputus.
     * Dua salinan query seperti ini gampang banget sampai berbeda, jadi
     * diekstrak ke satu tempat.
     */
    private function openDebtsFor(string $nis)
    {
        return TransaksiPembelian::where('nis', $nis)
            ->where('status', 'open')
            ->selectRaw('barcode, SUM(qty) as qty, MIN(waktu) as oldest')
            ->groupBy('barcode')
            ->get()
            ->map(fn($d) => [
                'barcode' => $d->barcode,
                'nama_produk' => Produk::where('barcode', $d->barcode)->value('nama_produk'),
                'qty' => (int) $d->qty,
                'oldest' => $d->oldest,
            ])
            ->values();
    }

    /**
     * POST /api/verifikasi/sesi — buka sesi baru.
     *
     * Error 422 saat sesi sudah ada DIBUAT informatif: menyebut nama petugas
     * yang memegang sesi. Pets Previous message cuma "ID: 7" — petugas jadi
     * bingung harus cari siapa, padahal solusinya cuma satu: tanya yang
     * memegang sesi itu.
     */
    public function openSesi(Request $request)
    {
        $data = $request->validate([
            'nis' => 'required|string|exists:santri,nis',
        ]);

        $santri = Santri::where('nis', $data['nis'])->first();

        // Akun siswa di-suspend = tidak ada pembuangan yang boleh dicatat
        // untuknya. Sama seperti di POS: yang initiate sesi adalah PETUGAS,
        // jadi yang dicek adalah status akun siswa (subjek), bukan status
        // petugas yang sedang login. Super admin tetap boleh supaya ada
        // jalur pemulihan untuk koreksi.
        $this->assertSantriNotSuspended($santri->nis, $request->user());

        // Cegah multi-session per NIS (lock strategy)
        $activeSession = SesiVerifikasi::with('petugas')
            ->where('nis', $data['nis'])
            ->whereNull('waktu_selesai')
            ->first();
        if ($activeSession) {
            $pemegang = $activeSession->petugas?->name ?? 'petugas lain';
            $milikSendiri = (int) $activeSession->petugas_id === (int) $request->user()->id;

            throw ValidationException::withMessages([
                'nis' => $milikSendiri
                    ? "Kamu masih punya sesi terbuka untuk siswa ini (Sesi #{$activeSession->id}). Lanjutkan atau batalkan dulu dari notifikasi di atas."
                    : "Sesi verifikasi untuk siswa ini sedang dipegang oleh {$pemegang} (Sesi #{$activeSession->id}). Minta dia menyelesaikan atau membatalkan dulu.",
            ]);
        }

        $sesi = SesiVerifikasi::create([
            'nis' => $data['nis'],
            'petugas_id' => $request->user()->id,
            'waktu_mulai' => now(),
        ]);

        // Hitung utang terbuka (use 'qty' field for consistency with SantriController::show)
        $openDebts = $this->openDebtsFor($data['nis']);

        AuditLog::record('verifikasi.open_sesi', [
            'sesi_id' => $sesi->id, 'nis' => $data['nis'],
        ]);

        return response()->json([
            'sesi' => $sesi,
            'open_debts' => $openDebts,
            'santri' => [
                'nis' => $santri->nis,
                'nama' => $santri->nama,
                'current_poin' => $santri->current_poin,
                'is_blocked' => $santri->is_blocked,
            ],
        ], 201);
    }

    /**
     * GET /api/verifikasi/sesi/{id} — lihat sesi + items.
     *
     * Ini juga endpoint RESUME. Response-nya sengaja dibuat sama persis
     * dengan response `openSesi` (sesi + open_debts + santri) supaya frontend
     * bisa melanjutkan sesi yang terputus (browser di-close, halaman di-refresh,
     * HP masuk sleep) tanpa perlu endpoint tambahan.
     *
     * Hanya jadi masalah SEBELUM ini ada: `openSesi` selalu membuat sesi baru,
     * dan `openSesi` juga menolak kalau sesi untuk NIS yang sama masih
     * terbuka. Akibatnya petugas yang refresh di tengah sesi terkunci: tidak
     * bisa lanjut, tidak bisa mulai ulang, dan item yang sudah dia kerjakan
     * jadi tidak bisa di-commit.
     */
    public function showSesi(Request $request, $id)
    {
        $sesi = SesiVerifikasi::with('items')->findOrFail($id);
        if ($sesi->petugas_id !== $request->user()->id && !$request->user()->isAdmin() && !$request->user()->isSuperAdmin()) {
            throw ValidationException::withMessages(['sesi' => 'Akses ditolak.']);
        }

        $santri = Santri::where('nis', $sesi->nis)->first();

        return response()->json([
            'sesi' => $this->presentSesi($sesi),
            'open_debts' => $this->openDebtsFor($sesi->nis),
            'santri' => $santri ? [
                'nis' => $santri->nis,
                'nama' => $santri->nama,
                'current_poin' => $santri->current_poin,
                'is_blocked' => $santri->is_blocked,
            ] : null,
        ]);
    }

    /**
     * Bentuk sesi + items untuk API.
     *
     * Semua item dilewatkan `presentItem()` supaya `foto_bukti_url` ikut
     * terbawa. Tanpa ini, halaman detail sesi dan halaman review admin tidak
     * bisa menampilkan foto bukti.
     */
    private function presentSesi(SesiVerifikasi $sesi): array
    {
        $data = $sesi->toArray();
        $data['items'] = ($sesi->relationLoaded('items') ? $sesi->items : collect())
            ->map(fn($i) => $this->presentItem($i))
            ->all();
        return $data;
    }

    /**
     * POST /api/verifikasi/sesi/{id}/items — tambah item (multiple times per sesi).
     */
    public function addItem(Request $request, $id)
    {
        $data = $request->validate([
            'barcode' => 'required|string|exists:produk,barcode',
            'qty_in' => 'required|integer|min:0',
            // [R6] Tighter validation: hanya JPEG/PNG/WebP, max 5MB
            'foto_bukti' => 'sometimes|file|mimes:jpg,jpeg,png,webp|max:5120',
            // Catatan petugas untuk kasus barcode rusak. Ada di schema
            // ($fillable SesiVerifikasiItem) tapi sebelumnya TIDAK pernah
            // dibaca di sini, jadi nilai yang dikirim frontend dibuang diam-diam.
            'catatan' => 'nullable|string|max:500',
        ]);

        $sesi = SesiVerifikasi::findOrFail($id);
        if ($sesi->waktu_selesai) {
            throw ValidationException::withMessages(['sesi' => 'Sesi sudah selesai.']);
        }

        // Sesi bisa saja sudah terbuka sebelum akun siswa di-suspend. Cek lagi
        // di sini, kalau tidak petugas bisa tetap mengisi sesi yang sudah
        // berjalan dan commit-nya tetap mengubah poin.
        $this->assertSantriNotSuspended($sesi->nis, $request->user());

        return DB::transaction(function () use ($data, $sesi, $request) {
            // Snapshot qty_open_at_time: total qty of debt for this product for this NIS, status=open, recorded at this point
            $openQ = TransaksiPembelian::where('nis', $sesi->nis)
                ->where('barcode', $data['barcode'])
                ->where('status', 'open')
                ->sum('qty');

            $qtyIn = (int) $data['qty_in'];
            $qtyMatched = min($qtyIn, $openQ);
            $qtyExcess = max(0, $qtyIn - $openQ);
            $qtyShortfall = max(0, $openQ - $qtyIn);
            // [v1.1] poin_delta = qty_matched × 2 (was matched − shortfall)
            $poinDelta = $qtyMatched * 2;

            $fotoPath = null;
            if ($request->hasFile('foto_bukti')) {
                // [R6] Use dedicated service untuk defense-in-depth validation
                $photoService = app(\App\Services\PhotoUploadService::class);
                $fotoPath = $photoService->validateAndStore(
                    $request->file('foto_bukti'),
                    'barcode-evidence/' . now()->format('Y-m')
                );
            }

            $item = SesiVerifikasiItem::create([
                'id_sesi' => $sesi->id,
                'barcode' => $data['barcode'],
                'qty_in' => $qtyIn,
                'qty_open_at_time' => $openQ,
                'qty_matched' => $qtyMatched,
                'qty_excess' => $qtyExcess,
                'qty_shortfall' => $qtyShortfall,
                'poin_delta' => $poinDelta,
                'foto_bukti_path' => $fotoPath,
                'catatan' => $data['catatan'] ?? null,
            ]);

            return response()->json([
                'item' => $this->presentItem($item),
                'note' => $qtyIn === 0 && $openQ > 0
                    ? 'Pure-shortfall valid: siswa lapor tanpa bawa sampah. Penalty: -' . ($openQ) . ' poin (sudah dipotong saat pembelian).'
                    : null,
            ], 201);
        });
    }

    /**
     * POST /api/verifikasi/sesi/{id}/commit — finalize + atomic update poin saldo + mark debts settled.
     *
     * Fix (v1.1.1): bulk update "mark all open as settled" → per-item FIFO allocation.
     * Sebelumnya satu query mark SEMUA open transaksi untuk NIS itu sebagai settled,
     * yang menyebabkan hutang produk lain ikut ke-clear padahal tidak di-match.
     * Sekarang: iterate per item, settle only matching barcode transactions (FIFO),
     * dengan split row kalau partial match (preserves audit trail).
     */
    public function commitSesi(Request $request, $id)
    {
        $sesi = SesiVerifikasi::with('items')->findOrFail($id);
        if ($sesi->waktu_selesai) {
            throw ValidationException::withMessages(['sesi' => 'Sesi sudah di-commit.']);
        }

        $this->assertSantriNotSuspended($sesi->nis, $request->user());

        return DB::transaction(function () use ($sesi, $request) {
            $santri = Santri::where('nis', $sesi->nis)->lockForUpdate()->first();
            $before = $santri->current_poin;
            $totalDelta = $sesi->items->sum('poin_delta');
            $newPoin = $before + $totalDelta;

            // FIFO allocation per item: settle only matching barcode transactions
            $matchedTxIds = []; // for audit
            foreach ($sesi->items as $item) {
                $remainingToMatch = $item->qty_matched;
                if ($remainingToMatch <= 0) continue;

                $openTxList = TransaksiPembelian::where('nis', $sesi->nis)
                    ->where('barcode', $item->barcode)
                    ->where('status', 'open')
                    ->orderBy('waktu', 'asc')
                    ->orderBy('id', 'asc') // tie-breaker for stable FIFO
                    ->lockForUpdate()
                    ->get();

                foreach ($openTxList as $tx) {
                    if ($remainingToMatch <= 0) break;

                    if ($tx->qty <= $remainingToMatch) {
                        // Settle entire row
                        $tx->update([
                            'status' => 'settled',
                            'settled_at' => now(),
                            'updated_at' => now(),
                        ]);
                        $remainingToMatch -= $tx->qty;
                    } else {
                        // Partial match: split row
                        // Current row becomes the matched portion (settled)
                        // New row carries the remainder (still open)
                        $remainderQty = $tx->qty - $remainingToMatch;
                        $tx->update([
                            'qty' => $remainingToMatch,
                            'status' => 'settled',
                            'settled_at' => now(),
                            'updated_at' => now(),
                        ]);
                        TransaksiPembelian::create([
                            'nis' => $tx->nis,
                            'barcode' => $tx->barcode,
                            'qty' => $remainderQty,
                            'penalty_per_unit' => $tx->penalty_per_unit,
                            'status' => 'open',
                            'staff_id' => $tx->staff_id,
                            'waktu' => $tx->waktu, // preserve original time
                            'catatan' => 'Split remainder from transaksi #' . $tx->id,
                        ]);
                        $remainingToMatch = 0;
                    }
                    $matchedTxIds[] = ['tx_id' => $tx->id, 'barcode' => $item->barcode, 'qty' => $tx->qty];
                }
            }

            // Insert poin_ledger entries dengan RUNNING balance (incremental per item)
            // saldo_sebelum/sesudah harus reflect saldo berjalan, bukan before/after sesi
            $runningSaldo = $before;
            foreach ($sesi->items as $item) {
                if ($item->poin_delta != 0) {
                    PoinLedger::create([
                        'nis' => $santri->nis,
                        'source_type' => PoinLedger::SOURCE_RETURN_MATCH,
                        'source_id' => $item->id,
                        'poin_delta' => $item->poin_delta,
                        'saldo_sebelum' => $runningSaldo,
                        'saldo_sesudah' => $runningSaldo + $item->poin_delta,
                        'waktu' => now(),
                    ]);
                    $runningSaldo += $item->poin_delta;
                }
            }

            // Update saldo + recompute block state
            $santri->current_poin = $newPoin;
            $negativeLimit = (int) DB::table('config_settings')->where('key', 'default_negative_limit')->value('value');
            $santri->is_blocked = ($newPoin <= $negativeLimit);
            if (!$santri->is_blocked) {
                $santri->block_reason = null;
                $santri->block_at = null;
            }
            $santri->save();

            $sesi->waktu_selesai = now();
            $sesi->total_poin_change = $totalDelta;
            $sesi->save();

            AuditLog::record('verifikasi.commit', [
                'sesi_id' => $sesi->id,
                'nis' => $santri->nis,
                'item_count' => $sesi->items->count(),
                'total_poin_change' => $totalDelta,
                'saldo_after' => $newPoin,
                'matched_tx_count' => count($matchedTxIds),
            ]);

            return response()->json([
                'sesi' => $sesi,
                'santri' => [
                    'nis' => $santri->nis,
                    'current_poin' => $newPoin,
                    'is_blocked' => $santri->is_blocked,
                ],
                'saldo_change' => $totalDelta,
                'matched_tx_count' => count($matchedTxIds),
            ]);
        });
    }

    /**
     * Bentuk item untuk API: tambahkan `foto_bukti_url`.
     *
     * Kenapa URL dikirim dari server, bukan disusun di frontend:
     * lokasi fisiknya berbeda tergantung disk yang aktif. Di development
     * fotonya dilayani dari `/storage/<path>` oleh symlink, sedangkan di
     * produksi foto berada di Cloudflare R2 dengan domain sendiri
     * (`AWS_URL`). Kalau frontend yang menyusun URL, begitu pindah hosting
     * semua foto busted tanpa ada error yang jelas — cuma gambar kosong.
     * Server tahu disk mana yang aktif, jadi server yang harus menyusunnya.
     */
    private function presentItem(SesiVerifikasiItem $item): array
    {
        $data = $item->toArray();

        $data['foto_bukti_url'] = null;
        $data['nama_produk'] = $item->produk?->nama_produk;

        if (! empty($item->foto_bukti_path)) {
            try {
                $data['foto_bukti_url'] = Storage::disk('public')->url($item->foto_bukti_path);
            } catch (\Throwable) {
                // Disk tanpa URL (mis. konfigurasi R2 belum lengkap) — frontend
                // tetap bisa menampilkan path-nya, tidak boleh 500.
                $data['foto_bukti_url'] = null;
            }
        }

        return $data;
    }

    /**
     * Tolak aktivitas bila akun siswa target sedang di-suspend.
     *
     * Dipakai di 4 titik (openSesi, addItem, commitSesi) karena sesi bisa
     * sudah dibuka sebelum siswa di-suspend — hanya guarding di openSesi
     * tidak cukup, karena commit tetap akan mengubah poin.
     *
     * Super admin dilewati: dia jalur pemulihan untuk koreksi. Kalau ikut
     * diblokir, data siswa suspended jadi mustahil diperbaiki tanpa
     * un-suspend lebih dulu.
     */
    private function assertSantriNotSuspended(string $nis, $actor): void
    {
        if ($actor->isSuperAdmin()) {
            return;
        }
        $santri = Santri::where('nis', $nis)->first();
        if ($santri?->isAccountSuspended()) {
            throw ValidationException::withMessages([
                'nis' => "Akun {$santri->nama} (NIS {$nis}) sedang di-suspend. Verifikasi pembuangan tidak bisa dicatat. Hubungi admin untuk membuka akses.",
            ]);
        }
    }

    /**
     * POST /api/verifikasi/sesi/{id}/cancel — cancel sesi.
     *
     * CATATAN: komentar lama di sini menulis "idle auto-cancel handled by
     * cron". Itu TIDAK PERNAH ADA — tidak ada command/cron yang melakukan
     * auto-cancel. Sesi menggantung hanya ditangani lewat notifikasi
     * `sesi-terbuka` (petugas menyelesaikan sendiri) atau force-end dari admin.
     * Kalau suatu saat auto-cancel benar-benar diinginkan, jangan hanya
     * menulis komentarnya: implementasikan, dan pastikan tidak kills sesi
     * yang masih aktif dipakai petugas.
     */
    public function cancelSesi(Request $request, $id)
    {
        $sesi = SesiVerifikasi::findOrFail($id);
        if ($sesi->waktu_selesai) return response()->json(['message' => 'Already closed.']);

        $sesi->waktu_selesai = now();
        $sesi->save();

        AuditLog::record('verifikasi.cancel', ['sesi_id' => $sesi->id, 'reason' => $request->input('reason')]);

        return response()->json(['message' => 'Sesi di-cancel.']);
    }
}
