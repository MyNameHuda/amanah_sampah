<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Laravel\Sanctum\PersonalAccessToken;

class PurgeExpiredTokens extends Command
{
    protected $signature = 'amanah:purge-expired-tokens {--days=30 : Purge tokens expired more than N days ago}';
    protected $description = 'Purge expired Sanctum tokens dari database';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $cutoff = now()->subDays($days);

        $tokens = PersonalAccessToken::where(function ($q) use ($cutoff) {
            $q->where('expires_at', '<', $cutoff)
              ->orWhere('last_used_at', '<', $cutoff);
        })->get();

        $count = 0;
        foreach ($tokens as $token) {
            $token->delete();
            $count++;
        }

        $this->info("Purged {$count} expired tokens (cutoff: {$cutoff->toIso8601String()}, days={$days}).");
        return self::SUCCESS;
    }
}
