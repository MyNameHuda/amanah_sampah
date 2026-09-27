<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use Illuminate\Console\Command;

class ArchiveAuditLogs extends Command
{
    protected $signature = 'amanah:archive-audit {--force}';
    protected $description = 'Archive current month audit logs ke audit_logs_archive; purge archive bulan sebelumnya';

    public function handle(): int
    {
        $now = now();
        $archiveDate = $now->copy()->startOfMonth(); // 1st of current month
        $purgeDate = $archiveDate->copy()->subMonth(); // 1st of previous month

        $this->info("Archive current month (before {$archiveDate}) + purge archive before {$purgeDate}");

        // 1. Mark logs ready for archive: those with waktu < start of current month
        $archived = AuditLog::where('waktu', '<', $archiveDate)
            ->whereNull('archive_at')
            ->update(['archive_at' => $archiveDate]);

        $this->info("Marked $archived logs for archive.");

        // 2. [Fix S7] Hanya copy logs yang baru di-mark untuk archive di run ini,
        //    bukan semua yang punya archive_at. Use insertOrIgnore untuk safety
        //    dengan unique constraint di original_log_id.
        $logs = AuditLog::where('archive_at', $archiveDate)->get();
        $inserted = 0;
        foreach ($logs as $log) {
            $archiveRow = $log->toArray();
            // Cast json field back to string since toArray() returns array
            if (isset($archiveRow['payload']) && is_array($archiveRow['payload'])) {
                $archiveRow['payload'] = json_encode($archiveRow['payload']);
            }
            $archiveRow['original_log_id'] = $log->id;
            $archiveRow['archived_to_table_at'] = now();
            unset($archiveRow['id']); // biarkan auto-increment, original_log_id sebagai traceable ref
            try {
                \DB::table('audit_logs_archive')->insert($archiveRow);
                $inserted++;
            } catch (\Illuminate\Database\QueryException $e) {
                // Ignore duplicate (UNIQUE original_log_id) untuk idempotency
                if (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate')) {
                    continue; // skip silently
                }
                throw $e;
            }
        }
        $this->info("Copied $inserted logs to archive (skipped duplicates if any).");

        // 3. Mark for purge: archive entries older than 1 month
        $purged = \DB::table('audit_logs_archive')
            ->where('waktu', '<', $purgeDate)
            ->whereNull('purged_at')
            ->update(['purged_at' => $now]);
        $this->info("Marked $purged archive rows for purge.");

        // 4. Delete purged rows (yang lama). Hanya delete yang SEHARUSNYA sudah diproses di step 3.
        $deleted = \DB::table('audit_logs_archive')
            ->whereNotNull('purged_at')
            ->delete();
        $this->info("Deleted $deleted old rows.");

        // Cleanup audit_logs yang sudah di-archive (sudah di-copy)
        \DB::table('audit_logs')
            ->whereNotNull('archive_at')
            ->where('waktu', '<', $archiveDate)
            ->delete();

        $this->info("Done.");
        return 0;
    }
}
