<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforcePasswordChange
{
    /**
     * Kalau user.must_change_password=true, blok semua endpoint protected
     * kecuali endpoint yang dibolehkan (change-password, logout, me, status).
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->must_change_password) {
            $allowed = [
                'api/auth/change-password',
                'api/auth/logout',
                'api/auth/me',
                'api/status',
            ];
            $path = trim($request->path(), '/');
            foreach ($allowed as $a) {
                if ($path === $a) {
                    return $next($request);
                }
            }
            return response()->json([
                'message' => 'Anda wajib ganti password terlebih dahulu.',
                'must_change_password' => true,
                'action_required' => 'change_password',
            ], 403);
        }
        return $next($request);
    }
}
