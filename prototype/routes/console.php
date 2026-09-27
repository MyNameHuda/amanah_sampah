<?php

use Illuminate\Support\Facades\Schedule;

// Auto-archive audit logs at 00:00 on day 1 of each month
Schedule::command('amanah:archive-audit')->monthlyOn(1, '00:00');

// Purge expired Sanctum tokens — daily at 03:00 (off-peak hours)
// Keeps DB kecil dan mengurangi security risk dari stale tokens
Schedule::command('amanah:purge-expired-tokens --days=30')->dailyAt('03:00');
