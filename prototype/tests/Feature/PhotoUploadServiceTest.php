<?php

namespace Tests\Feature;

use App\Services\PhotoUploadService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\MakesUploads;
use Tests\TestCase;

/**
 * Jalur upload foto bukti.
 *
 * Test-test ini SEBELUMNYA di-skip karena butuh GD untuk membuat JPEG, padahal
 * PhotoUploadService sendiri tidak memakai GD sama sekali (cuma finfo). Sekarang
 * JPEG valid disisipkan sebagai base64, jadi jalur ini benar-benar teruji.
 *
 * Ini penting karena jalur upload foto adalah tempat paling mungkin terjadi
 * keracunan data: polyglot file (gambar + PHP), MIME yang dipalsukan, nama file
 * path-traversal. Kalau test-nya di-skip, tidak ada yang protecting.
 */
class PhotoUploadServiceTest extends TestCase
{
    use MakesUploads;

    public function test_valid_jpeg_is_accepted_and_stored(): void
    {
        $service = new PhotoUploadService();
        Storage::fake('public');

        $path = $service->validateAndStore($this->makeJpeg(), 'barcode-evidence/test');

        $this->assertNotEmpty($path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_valid_png_is_accepted(): void
    {
        Storage::fake('public');
        $service = new PhotoUploadService();

        $path = $service->validateAndStore($this->makePng(), 'barcode-evidence/test');

        $this->assertNotEmpty($path);
    }

    public function test_stored_path_is_not_the_original_filename(): void
    {
        // Nama asli bisa berisi spasi/unicode/ekstensi aneh. File yang
        // tersimpan harus pakai nama aman supaya tidak bisa dipakai untuk
        // menimpa file lain lewat URL.
        Storage::fake('public');
        $service = new PhotoUploadService();

        $path = $service->validateAndStore(
            $this->makeJpeg('../../evil.jpg'),
            'barcode-evidence/test'
        );

        $this->assertStringNotContainsString('..', $path);
        $this->assertStringNotContainsString('evil.jpg', $path);
    }

    public function test_polyglot_image_with_php_code_is_rejected(): void
    {
        Storage::fake('public');
        $service = new PhotoUploadService();

        $this->expectException(ValidationException::class);
        $service->validateAndStore($this->makePolyglot('<?php'), 'test');
    }

    public function test_polyglot_image_with_script_tag_is_rejected(): void
    {
        Storage::fake('public');
        $service = new PhotoUploadService();

        $this->expectException(ValidationException::class);
        $service->validateAndStore($this->makePolyglot('<script'), 'test');
    }

    public function test_disallowed_mime_rejected(): void
    {
        Storage::fake('public');
        $pdf = \Illuminate\Http\UploadedFile::fake()->create('dokumen.pdf', 10, 'application/pdf');
        $service = new PhotoUploadService();

        $this->expectException(ValidationException::class);
        $service->validateAndStore($pdf, 'test');
    }

    public function test_oversized_file_rejected(): void
    {
        Storage::fake('public');
        $service = new PhotoUploadService();

        $this->expectException(ValidationException::class);
        $service->validateAndStore($this->makeJpeg('besar.jpg', 6 * 1024 * 1024), 'test');
    }

    public function test_stored_file_never_escapes_target_directory(): void
    {
        // Ini invariant yang sebenarnya penting, bukan "exception dilempar".
        // Symfony sudah melakukan basename() di UploadedFile::getName(), jadi
        // `../` hilang SEBELUM guard PhotoUploadService sempat mengeceknya.
        // Yang wajib dijamin: file hasil simpan berada di dalam direktori
        // tujuan, apa pun nama asli yang dikirim.
        Storage::fake('public');
        $service = new PhotoUploadService();

        foreach (['../../etc/passwd.jpg', '..\\..\\windows\\system32\\evil.jpg', 'a/b/c.jpg'] as $name) {
            $path = $service->validateAndStore($this->makeJpeg($name), 'barcode-evidence/test');

            $this->assertStringNotContainsString('..', $path, "path traversal lolos: {$name}");
            $this->assertStringNotContainsString('\\', $path, "backslash lolos: {$name}");
            $this->assertStringStartsWith('barcode-evidence/test/', $path);
        }
    }

    public function test_allowed_mimes_listed_in_code(): void
    {
        // Keep documentation in sync dengan ALLOWED_MIMES.
        $this->assertSame(
            ['image/jpeg', 'image/png', 'image/webp'],
            PhotoUploadService::allowedMimes()
        );
    }
}
