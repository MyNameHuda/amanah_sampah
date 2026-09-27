<?php

namespace Tests;

use App\Services\PhotoUploadService;
use Illuminate\Http\UploadedFile;
use RuntimeException;

/**
 * Fixture upload gambar untuk test.
 *
 * Kenapa file JPEG asli, bukan `UploadedFile::fake()->image()`:
 * `fake()->image()` butuh ekstensi GD, yang tidak selalu ada di CI/test env.
 * JPG yang lebih kecil, valid, dan disisipkan sebagai base64 supaya test
 * photo-upload tidak pernah di-skip. Jalur upload foto adalah tempat
 * keracunan data paling mungkin terjadi (polyglot file, MIME palsu), dan
 * jalur itu tidak boleh hanya mengandalkan test yang di-skip.
 */
trait MakesUploads
{
    /**
     * JPEG 1x1 piksel, grayscale, valid. Cukup untuk dideteksi finfo sebagai
     * image/jpeg tanpa perlu GD.
     */
    private const TINY_JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL'
        .'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA'
        .'/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

    /** PNG 1x1 piksel, valid. */
    private const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8'
        .'z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    /**
     * Buat UploadedFile berisi gambar JPEG asli.
     *
     * @param string|null $filename nama asli (untuk menguji sanitasi)
     * @param int         $appendBytes ukuran tambahan supaya bisa exceed batas
     */
    protected function makeJpeg(?string $filename = 'bukti.jpg', int $appendBytes = 0): UploadedFile
    {
        return $this->makeImageUpload(self::TINY_JPEG, $filename, 'image/jpeg', $appendBytes);
    }

    protected function makePng(?string $filename = 'bukti.png'): UploadedFile
    {
        return $this->makeImageUpload(self::TINY_PNG, $filename, 'image/png', 0);
    }

    /**
     * File berisi byte gambar + penanda PHP/JS setelahnya (polyglot).
     * Persis skenario yang harus ditolak PhotoUploadService.
     */
    protected function makePolyglot(string $token = '<?php'): UploadedFile
    {
        $raw = base64_decode(self::TINY_JPEG) . "\n" . $token . " system('id'); ?>";
        return $this->makeUploadFromBytes($raw, 'polyglot.jpg', 'image/jpeg');
    }

    private function makeImageUpload(string $b64, string $filename, string $mime, int $appendBytes): UploadedFile
    {
        $raw = base64_decode($b64);
        if ($appendBytes > 0) {
            // Padding dengan byte acak supaya file jadi sebesar yang diminta.
            // Isinya bukan gambar, tapi test ini memang memeriksa batas ukuran
            // — service harus menolak berdasarkan ukuran, bukan karena gambar rusak.
            $raw .= str_repeat("\0", $appendBytes);
        }
        return $this->makeUploadFromBytes($raw, $filename, $mime);
    }

    private function makeUploadFromBytes(string $bytes, string $filename, string $mime): UploadedFile
    {
        $tmp = tempnam(sys_get_temp_dir(), 'amanah-test-');
        if ($tmp === false) {
            throw new RuntimeException('Tidak bisa membuat file temp untuk test upload.');
        }
        file_put_contents($tmp, $bytes);

        // `$test = true` supaya Symfony tidak complains file belum "moved".
        return new UploadedFile($tmp, $filename, $mime, null, true);
    }
}
