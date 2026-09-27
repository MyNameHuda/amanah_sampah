<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Santri;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    /**
     * GET /api/me/profile
     * All roles: get own profile + biodata.
     */
    public function me(Request $request)
    {
        $user = $request->user();
        $payload = [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'suspended_at' => $user->suspended_at,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
                'biodata' => $user->biodata,
            ],
            'editable_fields' => User::selfEditableFields(),
        ];

        // Role-specific extras
        if ($user->isSantri()) {
            $santri = Santri::where('user_id', $user->id)->first();
            if ($santri) {
                $payload['role_data'] = [
                    'type' => 'santri',
                    'nis' => $santri->nis,
                    'kelas' => $santri->kelas,
                    'asrama' => $santri->asrama,
                    'current_poin' => $santri->current_poin,
                    'is_blocked' => $santri->is_blocked,
                    'block_reason' => $santri->block_reason,
                    'prior_open_count' => $santri->prior_open_count,
                    'penalty_tier' => $santri->current_penalty_tier,
                ];
            }
        } else {
            $payload['role_data'] = [
                'type' => $user->role,
                'label' => match ($user->role) {
                    'staff_kantin' => 'Staff Kantin',
                    'petugas_kesantrian' => 'Petugas Kesantrian',
                    'admin_kesantrian' => 'Admin Kesantrian',
                    'super_admin' => 'Super Admin',
                    'super_admin_tier3' => 'Super Admin (Tier 3)',
                    default => $user->role,
                },
            ];
        }

        return response()->json($payload);
    }

    /**
     * PATCH /api/me/profile
     * Update own biodata. Cannot change email, role, password.
     */
    public function updateMe(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => 'sometimes|string|max:100',
            'phone' => 'sometimes|nullable|string|max:25',
            'gender' => 'sometimes|nullable|in:L,P',
            'birth_place' => 'sometimes|nullable|string|max:100',
            'birth_date' => 'sometimes|nullable|date_format:Y-m-d',
            'address' => 'sometimes|nullable|string|max:500',
        ]);

        if (empty($data)) {
            throw ValidationException::withMessages(['body' => 'Tidak ada field yang di-update.']);
        }

        $oldBiodata = $user->biodata;
        $user->fill($data);
        $user->save();

        // Sync name to Santri table if user is Santri (legacy duplicate column)
        if ($user->isSantri() && isset($data['name'])) {
            Santri::where('user_id', $user->id)->update(['nama' => $data['name']]);
        }

        AuditLog::record('profile.update_self', [
            'user_id' => $user->id,
            'fields_updated' => array_keys($data),
        ]);

        return response()->json([
            'message' => 'Biodata berhasil diperbarui.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'biodata' => $user->fresh()->biodata,
            ],
            'diff' => array_diff_assoc($data, $oldBiodata),
        ]);
    }
}
