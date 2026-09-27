<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Suspended user tidak boleh melakukan APAPUN — transaksi, pengembalian,
 * redeem reward, edit profil, ganti password, semua request.
 *
 * Kenapa middleware ini terpisah dari RoleMiddleware:
 * `RoleMiddleware` hanya jalan pada route yang punya `->middleware('role:...')`.
 * Itu TIDAK mencakup `/auth/me`, `/me/profile` (PATCH — write!),
 * `/auth/change-password`, `/produk`, dan `/kategori` yang cuma dibungkus
 * `auth:sanctum`. Akibatnya user yang di-suspend tapi masih memegang token
 * yang valid bisa tetap mengubah biodata sendiri dan mengganti password-nya
 * sendiri. Celah itu ditutup di sini: middleware ini di-append ke seluruh
 * group `api`, jadi tidak ada endpoint yang bisa dilewati.
 *
 * Pola ini sengaja meniru `EnforcePasswordChange` (keduanya global di group
 * `api`, keduanya menyertakan marker di response body supaya frontend bisa
 * bereaksi spesifik alih-alih menampilkan error generik).
 */
class EnsureNotSuspended
{
    /**
     * Endpoint yang tetap boleh diakses user yang di-suspend.
     *
     * Hanya `logout` — supaya user bisa mengakhiri sesi dengan rapi, bukan
     * terseset dengan token yang tidak bisa dipakai dan tidak bisa dibuang.
     * Ini bukan "melakukan sesuatu": tidak mengubah data bisnis apa pun.
     */
    private const ALLOWED = [
        'api/auth/logout',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Guest (belum login) bukan urusan middleware ini — AuthController
        // sudah menolak user suspended di titik login.
        if (!$user) {
            return $next($request);
        }

        if (!$user->isSuspended()) {
            return $next($request);
        }

        $path = trim($request->path(), '/');
        if (in_array($path, self::ALLOWED, true)) {
            return $next($request);
        }

        return response()->json([
            'message' => 'Akun Anda di-suspend dan tidak dapat melakukan aktivitas apa pun. Hubungi admin.',
            'suspended' => true,
            'action_required' => 'logout',
        ], 403);
    }
}
