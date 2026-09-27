<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // [R3] Register API rate limiters
        $this->configureRateLimiters();
    }

    /**
     * Configure named rate limiters untuk sensitive endpoints.
     */
    protected function configureRateLimiters(): void
    {
        // Login: max 5 attempts per minute per IP (anti-brute force)
        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip())
                ->response(function () {
                    return response()->json([
                        'message' => 'Terlalu banyak percobaan login. Coba lagi dalam 1 menit.',
                    ], 429);
                });
        });

        // Change password: max 3 per minute per user
        RateLimiter::for('password', function (Request $request) {
            return Limit::perMinute(3)->by(optional($request->user())->id ?: $request->ip())
                ->response(function () {
                    return response()->json(['message' => 'Terlalu sering ganti password. Tunggu 1 menit.'], 429);
                });
        });

        // Super admin destructive actions: max 10 per minute per user
        RateLimiter::for('admin-destructive', function (Request $request) {
            return Limit::perMinute(10)->by(optional($request->user())->id ?: $request->ip())
                ->response(function () {
                    return response()->json([
                        'message' => 'Terlalu banyak aksi admin. Tunggu 1 menit.',
                    ], 429);
                });
        });

        // Read endpoints: more lenient (60 per minute per IP)
        RateLimiter::for('api-read', function (Request $request) {
            return Limit::perMinute(60)->by($request->ip());
        });
    }
}
