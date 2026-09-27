<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'app' => 'Amanah Sampah',
        'status' => 'running',
        'version' => 'v1.1',
        'docs' => '/api',
        'useful_links' => [
            'health' => '/up',
            'list_users' => '/api/santri (after login)',
            'login' => 'POST /api/auth/login',
        ],
    ]);
});

/**
 * SPA catch-all — wajib ada untuk deployment single-origin.
 *
 * Tanpa route ini, reload browser di halaman seperti `/login` atau
 * `/super/users` akan 404, padahal itu routing internal React Router.
 * Build Vite diletakkan di `public/` supaya Laravel menyajikan SPA dan API
 * dari domain yang sama (base URL axios tetap `/api`, tanpa CORS).
 *
 * Route API (`/api/*`) dan health (`/up`) TIDAK ikut tertangkap karena
 * prefix `api` punya file route sendiri dan `/up` terdaftar lebih dulu.
 */
Route::get('/{any}', function (string $any) {
    $index = public_path('index.html');

    // Build frontend belum di-deploy. Kembalikan instruksi yang jelas
    // alih-alih 404 misterius yang akan membuat orang mengira aplikasinya rusak.
    if (! file_exists($index)) {
        return response()->view('spa-missing', [], 503);
    }

    // Dibaca sebagai string, bukan response()->file(). Alasannya:
    //  1. BinaryFileResponse tidak bisa diset Content-Type & cache header
    //     secara manual, dan `getContent()`-nya kosong — membuat smoke test
    //     tidak bisa memverifikasi isi yang benar-benar dikirim ke browser.
    //  2. index.html WAJIB no-cache. Asset-nya sendiri (file ber-hash di
    //     /assets/) boleh di-cache lama. Kalau index.html ikut ter-cache,
    //     user yang baru deploy akan dapat HTML lama yang menunjuk ke
    //     asset lama yang sudah dihapus -> halaman putih.
    return response(file_get_contents($index), 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache, no-store, must-revalidate',
    ]);
})->where('any', '^(?!api|up|storage|build|horizon|telescope).*$');
