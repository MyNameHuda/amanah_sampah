<?php

namespace Tests\Feature;

use App\Models\SesiVerifikasiItem;
use App\Services\PhotoUploadService;
use Illuminate\Support\Facades\Storage;
use Tests\MakesUploads;
use Tests\TestCase;

/**
 * Alur "barcode rusak": petugas mengetik barcode manual + melampirkan foto
 * barcode yang rusak sebagai bukti.
 *
 * Ini menutup gap yang sebelumnya ada: backend sudah menerima `foto_bukti`
 * sejak awal, tapi TIDAK PERNAH ada frontend yang mengirimnya — dan `catatan`
 * ada di schema tapi tidak pernah dibaca controller, jadi selalu dibuang.
 */
class FotoBuktiVerifikasiTest extends TestCase
{
    use MakesUploads;

    private function openSesi(): array
    {
        $santri = $this->makeSantri('23100');
        $santri->update(['current_poin' => 50]);
        $petugas = $this->makeUser('petugas_kesantrian', ['must_change_password' => false]);
        $this->actAs($petugas);

        $r = $this->postJson('/api/verifikasi/sesi', ['nis' => $santri->nis])->assertStatus(201);

        return [$r->json('sesi.id'), $santri->nis];
    }

    public function test_item_dengan_foto_bukti_tersimpan(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $r = $this->post("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 2,
            'catatan' => 'Barcode sobek, tinggal separuh yang kebaca.',
            'foto_bukti' => $this->makeJpeg('barcode-rusak.jpg'),
        ], ['Accept' => 'application/json']);

        $r->assertStatus(201);

        $item = SesiVerifikasiItem::latest('id')->first();
        $this->assertNotNull($item->foto_bukti_path, 'foto_bukti_path kosong — file tidak tersimpan');
        $this->assertSame('Barcode sobek, tinggal separuh yang kebaca.', $item->catatan);

        Storage::disk('public')->assertExists($item->foto_bukti_path);
    }

    public function test_response_termasuk_url_foto_yang_langsung_bisa_dipakai(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $r = $this->post("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'foto_bukti' => $this->makeJpeg(),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        $url = $r->json('item.foto_bukti_url');

        $this->assertNotEmpty($url, 'foto_bukti_url kosong — frontend tidak bisa menampilkan foto');
        $this->assertStringNotContainsString(' ', $url);
        // Path relatif harus ikut di URL supaya tidak jadi URL root domain.
        $this->assertStringContainsString('barcode-evidence/', $url);
    }

    public function test_item_tanpa_foto_tetap_boleh_dan_url_null(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $r = $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
        ])->assertStatus(201);

        // Jalur scanner normal tidak punya foto — tidak boleh error.
        $this->assertNull($r->json('item.foto_bukti_url'));
        $this->assertNull($r->json('item.foto_bukti_path'));
    }

    public function test_catatan_tanpa_foto_tetap_tersimpan(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'catatan' => 'Produk Gregorius tanpa barcode sama sekali.',
        ])->assertStatus(201);

        $this->assertSame(
            'Produk Gregorius tanpa barcode sama sekali.',
            SesiVerifikasiItem::latest('id')->first()->catatan
        );
    }

    public function test_polyglot_ditolak_dan_tidak_ada_item_yang_tersimpan(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();
        $before = SesiVerifikasiItem::count();

        $this->post("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'foto_bukti' => $this->makePolyglot('<?php'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame($before, SesiVerifikasiItem::count(), 'Item tersimpan padahal file-nya berbahaya');
    }

    public function test_catatan_terlalu_panjang_ditolak(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $this->postJson("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'catatan' => str_repeat('x', 501),
        ])->assertStatus(422);
    }

    public function test_foto_bukti_ikut_tampil_di_detail_sesi(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $this->post("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'catatan' => 'Barcode gosok.',
            'foto_bukti' => $this->makeJpeg(),
        ], ['Accept' => 'application/json'])->assertStatus(201);

        // Halaman detail sesi (dipakai admin untuk review) harus bisa
        // menampilkan foto — kalau tidak, bukti tidak pernah dibaca siapa pun.
        $r = $this->getJson("/api/verifikasi/sesi/{$sesiId}")->assertStatus(200);

        $item = $r->json('sesi.items.0');
        $this->assertNotEmpty($item['foto_bukti_url']);
        $this->assertSame('Barcode gosok.', $item['catatan']);
    }

    public function test_endpoint_tolak_file_bukan_gambar(): void
    {
        Storage::fake('public');
        [$sesiId] = $this->openSesi();

        $this->post("/api/verifikasi/sesi/{$sesiId}/items", [
            'barcode' => 'TEST001',
            'qty_in' => 1,
            'foto_bukti' => \Illuminate\Http\UploadedFile::fake()->create('virus.php', 5, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }
}
