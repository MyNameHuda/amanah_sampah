<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Santri;
use App\Models\User;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Login: Santri pakai NIS, selainnya pakai email.
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'login' => 'required|string', // bisa NIS atau email
            'password' => 'required|string',
        ]);

        // Detect: Santri pakai NIS, others pakai email
        $loginField = filter_var($data['login'], FILTER_VALIDATE_EMAIL) ? 'email' : null;
        if (!$loginField && strlen($data['login']) <= 20) {
            // Mungkin NIS — coba cek tabel users by email (NULL)
            // Cari via NIS di tabel santri
            $santri = Santri::with('user')->where('nis', $data['login'])->where('archived_at', null)->first();
            if ($santri && $santri->user && Hash::check($data['password'], $santri->user->password)) {
                if ($santri->user->isSuspended()) {
                    throw ValidationException::withMessages(['login' => 'Akun di-suspend. Hubungi admin.']);
                }
                return $this->issueToken($santri->user);
            }
        }

        // Untuk email-based login
        $user = User::where('email', $data['login'])->first();
        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['login' => 'Kredensial salah.']);
        }
        if ($user->isSuspended()) {
            throw ValidationException::withMessages(['login' => 'Akun di-suspend. Hubungi admin.']);
        }

        return $this->issueToken($user);
    }

    private function issueToken(User $user)
    {
        // Hapus token lama untuk device ini? Tidak — multi-device allowed (B7).
        // [R2] Token expiry: 60 menit default (config/sanctum.php).
        // "remember_me" diperpanjang menjadi 7 hari untuk trusted devices.
        $rememberMe = (bool) request()->boolean('remember_me');
        $expiresAt = $rememberMe ? now()->addDays(7) : null;  // null = pakai config default
        $tokenName = 'auth-' . $user->role . ($rememberMe ? '-remembered' : '');
        $token = $user->createToken($tokenName, ['*'], $expiresAt)->plainTextToken;

        // Pass user explicitly — token baru belum aktif di current request,
        // jadi auth()->user() return null kalau di-read di sini.
        AuditLog::record('auth.login', [
            'user_id' => $user->id,
            'role' => $user->role,
            'remember_me' => $rememberMe,
        ], ['user' => $user]);

        // [R4] Log ke dedicated security channel untuk forensic/compliance
        if (config('logging.channels.security.driver')) {
            Log::channel('security')->info('auth.login', [
                'user_id' => $user->id,
                'role' => $user->role,
                'ip' => request()->ip(),
                'user_agent' => substr((string) request()->userAgent(), 0, 200),
                'remember_me' => $rememberMe,
            ]);
        }

        return response()->json([
            'token' => $token,
            'token_expires_in' => $rememberMe ? 7 * 24 * 60 : 60,  // minutes
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'suspended_at' => $user->suspended_at,
                'must_change_password' => (bool) $user->must_change_password,
            ],
        ]);
    }

    /**
     * Logout: revoke current token.
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        $user->currentAccessToken()->delete();
        // Pass user explicitly — setelah delete, auth()->user() return null
        AuditLog::record('auth.logout', [], ['user' => $user]);
        return response()->json(['message' => 'Logout berhasil.']);
    }

    /**
     * Me: info user saat ini + role-specific extras.
     */
    public function me(Request $request)
    {
        $user = $request->user()->loadMissing('santri');
        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'suspended_at' => $user->suspended_at,
            'must_change_password' => (bool) $user->must_change_password,
        ];

        // Tambahkan info role-specific
        if ($user->isSantri()) {
            $santri = $user->santri ?? Santri::where('user_id', $user->id)->first();
            if ($santri) {
                $data['santri'] = $santri;
                $data['prior_open_count'] = $santri->prior_open_count;
                $data['penalty_tier'] = $santri->current_penalty_tier;
            }
        }

        return response()->json($data);
    }

    /**
     * Change password (force change on first login untuk Santri).
     */
    public function changePassword(Request $request)
    {
        // for_first_login=true (e.g. after admin reset) → skip current_password check,
        // karena user belum tentu tau current password (admin yang set).
        $isFirstLogin = $request->boolean('for_first_login');

        $rules = [
            'new_password' => 'required|string|min:8|confirmed',
        ];
        if (!$isFirstLogin) {
            $rules['current_password'] = 'required|string';
        }
        $data = $request->validate($rules);

        $user = $request->user();

        if (!$isFirstLogin) {
            if (!Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'Password lama salah.']);
            }
        } elseif (!$user->must_change_password) {
            // for_first_login=true tapi flag off → tolak (keamanan)
            throw ValidationException::withMessages(['for_first_login' => 'Mode ini hanya untuk first-login (must_change_password=true).']);
        }

        $user->password = $data['new_password'];
        $user->must_change_password = false;
        $user->save();

        AuditLog::record(
            $isFirstLogin ? 'auth.password_change_first_login' : 'auth.password_change',
            ['is_first_login' => $isFirstLogin]
        );

        return response()->json(['message' => 'Password berhasil diubah.']);
    }
}
