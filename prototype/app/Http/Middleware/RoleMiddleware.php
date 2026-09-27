<?php

namespace App\Http\Middleware;

use App\Models\ConfigSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Usage: ->middleware('role:staff_kantin,super_admin')
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->isSuspended()) {
            return response()->json(['message' => 'Akun di-suspend. Hubungi admin.'], 403);
        }

        // [Fix M1] Role check dilakukan SEBELUM maintenance/read-only check
        // agar user dengan role salah langsung dapat 403 (role mismatch) yang akurat,
        // bukan 503 (maintenance) yang misleading.
        if (!in_array($user->role, $roles, true)) {
            return response()->json([
                'message' => 'Akses ditolak. Role ' . $user->role . ' tidak punya akses.',
                'required_roles' => $roles,
            ], 403);
        }

        // [v1.1] Maintenance mode: block ALL writes untuk non-super-admin
        if (ConfigSetting::isMaintenance() && !$user->isSuperAdmin() && in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            return response()->json([
                'message' => 'Sistem sedang dalam maintenance mode. Coba lagi nanti.',
                'mode' => 'maintenance',
            ], 503);
        }

        // [v1.1] Read-only mode: block writes untuk non-super-admin
        if (ConfigSetting::isReadOnly() && !$user->isSuperAdmin() && in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            return response()->json([
                'message' => 'Sistem sedang read-only. Hanya super admin yang bisa write saat ini.',
                'mode' => 'readonly',
            ], 503);
        }

        return $next($request);
    }
}
