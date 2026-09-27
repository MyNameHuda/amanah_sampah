<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

/**
 * [R5] Require password re-verification untuk destructive operations.
 *
 * Berlaku untuk super_admin_tier3. Super_admin (tier 1) bypass.
 * Cara pakai: taruh middleware SETELAH auth:sanctum di route.
 */
class RequirePasswordForDestructive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Tier 1 (super_admin) bypass re-verification
        if ($user->isSuperAdminTier1()) {
            return $next($request);
        }

        // Tier 3 harus provide password di body
        if ($user->isSuperAdminTier3()) {
            $password = $request->input('password') ?? $request->header('X-Re-Verified-Password');
            if (!$password) {
                return response()->json([
                    'message' => 'Tier 3 admin harus re-verify password untuk aksi ini.',
                    'action_required' => 'password_reverify',
                    'field' => 'password',
                ], 403);
            }

            if (!Hash::check($password, $user->password)) {
                return response()->json([
                    'message' => 'Password re-verifikasi gagal.',
                ], 403);
            }

            // Log re-verification success ke audit + security channel
            \App\Models\AuditLog::record('superadmin.destructive_reverified', [
                'path' => '/' . $request->path(),
                'method' => $request->method(),
            ], ['user' => $user]);
        }

        return $next($request);
    }
}
