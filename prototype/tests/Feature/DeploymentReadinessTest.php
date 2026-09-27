<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * smoke test untuk jalur yang DIPAKAI DEPLOYMENT.
 *
 * Dua hal di sini yang tidak akan pernah gagal kalau tidak diuji:
 *  1. SPA catch-all — tanpa ini, reload di /login atau /super/users 404,
 *     padahal itu routing internal React Router.
 *  2. system health `db_size_kb` — query-nya dulunya hardcode SQLite dan
 *     akan 500 kalau database diganti ke Postgres.
 */
class DeploymentReadinessTest extends TestCase
{
    public function test_spa_catchall_serves_index_html(): void
    {
        $index = public_path('index.html');

        // Simpan & pulihkan file asli. `public/index.html` itu hasil build
        // Vite yang sudah di-deploy — test tidak boleh menimpanya, kalau
        // tidak artifact produksi ikut terhapus setiap kali test jalan.
        $existed = file_exists($index);
        $original = $existed ? file_get_contents($index) : null;

        file_put_contents($index, '<!doctype html><div id="root"></div>');

        try {
            // Route internal React Router, bukan URL API. Reload di halaman
            // ini harus tetap mengembalikan HTML, bukan 404.
            $this->get('/login')->assertStatus(200)
                ->assertSee('id="root"', false)
                ->assertHeader('Content-Type', 'text/html; charset=UTF-8');
            $this->get('/super/users')->assertStatus(200);
            $this->get('/petugas/verify')->assertStatus(200);
        } finally {
            if ($existed && $original !== null) {
                file_put_contents($index, $original);
            } elseif (! $existed) {
                @unlink($index);
            }
        }
    }

    public function test_spa_index_html_is_not_cacheable(): void
    {
        $index = public_path('index.html');
        if (! file_exists($index)) {
            $this->markTestSkipped('Frontend belum di-build (public/index.html tidak ada).');
        }

        // index.html no-cache WAJIB: kalau ter-cache, user pasca-deploy dapat
        // HTML lama yang menunjuk ke asset lama yang sudah dihapus -> white screen.
        //
        // Header dibaca per-token, bukan string utuh: Symfony menormalisasi
        // nilai Cache-Control (mengurutkan ulang + menambah `private`), jadi
        // perbandingan string persis akan rapuh tanpa artinya.
        $cc = (string) $this->get('/login')->assertStatus(200)
            ->headers->get('Cache-Control');

        $this->assertStringContainsString('no-cache', $cc);
        $this->assertStringContainsString('no-store', $cc);
    }

    public function test_spa_returns_helpful_503_when_frontend_not_built(): void
    {
        $index = public_path('index.html');
        $existed = file_exists($index);
        $original = $existed ? file_get_contents($index) : null;

        if ($existed) {
            unlink($index);
        }

        try {
            // 503 + instruksi, bukan 404 kosong yang bikin orang kira app rusak.
            $this->get('/login')->assertStatus(503)
                ->assertSee('Frontend belum di-deploy');
        } finally {
            if ($existed && $original !== null) {
                file_put_contents($index, $original);
            }
        }
    }

    public function test_spa_catchall_does_not_swallow_api_routes(): void
    {
        // Kalau regex `where` salah, /api/* akan ikut tertangkap dan
        // mengembalikan index.html — frontend dapat HTML di mana-mana
        // seharusnya dapat JSON.
        $sa = $this->makeUser('super_admin', ['must_change_password' => false]);
        $this->actAs($sa);

        $this->getJson('/api/super-admin/health')
            ->assertStatus(200)
            ->assertJsonStructure([
                'db_size_kb', 'photo_storage_kb', 'total_active_santri',
                'total_staff', 'recent_error_logs_count', 'modes', 'config', 'checked_at',
            ]);
    }

    public function test_health_db_size_is_numeric(): void
    {
        $sa = $this->makeUser('super_admin', ['must_change_password' => false]);
        $this->actAs($sa);

        $r = $this->getJson('/api/super-admin/health')->assertStatus(200);

        $this->assertIsNumeric($r->json('db_size_kb'), 'db_size_kb harus angka, bukan array');
        $this->assertGreaterThan(0, $r->json('db_size_kb'));
    }

    public function test_root_endpoint_still_returns_json_metadata(): void
    {
        $this->getJson('/')
            ->assertStatus(200)
            ->assertJsonPath('app', 'Amanah Sampah')
            ->assertJsonPath('status', 'running');
    }

    public function test_health_up_endpoint_responds(): void
    {
        // Dipakai UptimeRobot untuk keep-alive + deteksi downtime.
        $this->get('/up')->assertStatus(200);
    }
}
