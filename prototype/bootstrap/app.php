<?php

use App\Http\Middleware\EnforcePasswordChange;
use App\Http\Middleware\EnsureNotSuspended;
use App\Http\Middleware\LogApiTraffic;
use App\Http\Middleware\RequirePasswordForDestructive;
use App\Http\Middleware\RoleMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'must_change_password' => EnforcePasswordChange::class,
            'not_suspended' => EnsureNotSuspended::class,
            'log.traffic' => LogApiTraffic::class,
            // [R5] Tier 3 destructive re-verification
            'require.password' => RequirePasswordForDestructive::class,
        ]);
        // Terapkan EnforcePasswordChange ke semua api routes
        $middleware->appendToGroup('api', EnforcePasswordChange::class);
        // Suspended user diblokir di SELURUH api routes, bukan hanya yang punya
        // middleware `role:` — termasuk /me/profile (PATCH) dan
        // /auth/change-password yang sebelumnya tetap bisa dipakai.
        $middleware->appendToGroup('api', EnsureNotSuspended::class);
        // [R4] Log API traffic ke dedicated channel (hanya di non-local)
        if (env('APP_ENV') !== 'local' && env('APP_ENV') !== 'testing') {
            $middleware->appendToGroup('api', LogApiTraffic::class);
        }
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
