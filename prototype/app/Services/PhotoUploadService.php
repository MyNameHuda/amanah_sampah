<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

/**
 * [R6] Service untuk validasi photo upload dengan defense-in-depth.
 *
 * Beyond Laravel's `image` rule (which checks extension + magic bytes for common formats),
 * this service does additional checks:
 * - Allowlist specific MIME types (jpeg/png/webp)
 * - File size limit
 * - Block potential malicious filenames (path traversal, null bytes)
 * - Detect polyglot files (file claiming to be image but containing PHP/JS code)
 */
class PhotoUploadService
{
    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    private const MAX_BYTES = 5 * 1024 * 1024;  // 5MB
    private const BLOCKED_CONTENT_TOKENS = [
        '<?php', '<?=', '<script', 'eval(', 'exec(',
    ];

    /**
     * Validate uploaded file dan return sanitized metadata.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function validateAndStore(UploadedFile $file, string $directory): string
    {
        // 1. MIME content check (read actual file, not just filename)
        $actualMime = $file->getMimeType();
        if (!in_array($actualMime, self::ALLOWED_MIMES, true)) {
            throw ValidationException::withMessages([
                'file' => "MIME type '{$actualMime}' tidak diizinkan.",
            ]);
        }

        // 2. Size check
        if ($file->getSize() > self::MAX_BYTES) {
            throw ValidationException::withMessages([
                'file' => 'File terlalu besar (max 5MB).',
            ]);
        }

        // 3. Filename sanitization (block path traversal / null bytes)
        $originalName = $file->getClientOriginalName();
        if (str_contains($originalName, "\0")
            || str_contains($originalName, '../')
            || str_contains($originalName, '..\\')) {
            throw ValidationException::withMessages([
                'file' => 'Nama file tidak valid.',
            ]);
        }

        // 4. Polyglot detection: file content tidak boleh mengandung PHP/JS
        $contents = file_get_contents($file->getRealPath(), false, null, 0, 8192);
        foreach (self::BLOCKED_CONTENT_TOKENS as $token) {
            if (stripos($contents, $token) !== false) {
                throw ValidationException::withMessages([
                    'file' => "File mengandung konten mencurigakan: '{$token}'.",
                ]);
            }
        }

        // 5. Store dengan filename yang aman (timestamp + hash)
        return $file->store($directory, 'public');
    }

    /**
     * Get list of allowed MIME types untuk dokumentasi/UI.
     */
    public static function allowedMimes(): array
    {
        return self::ALLOWED_MIMES;
    }
}
