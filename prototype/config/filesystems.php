<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        /**
         * Disk untuk file yang diakses lewat URL publik (foto bukti barcode).
         *
         * Otomatis-arahkan ke object storage S3-compatible (Cloudflare R2,
         * Supabase Storage, Backblaze B2, ...) kalau AWS_ENDPOINT diisi, dan
         * tetap lokal kalau tidak. Alasannya: `PhotoUploadService` menyimpan
         * dengan disk 'public' secara hardcode, jadi yang perlu diubah adalah
         * definisi disk 'public' itu sendiri, bukan kode service.
         *
         * Kenapa object storage wajib di Render: free tier tidak punya
         * persistent disk, jadi file yang ditulis ke storage lokal container
         * akan hilang pada setiap deploy/restart.
         *
         * Catatan pindah provider: hanya 7 env var yang berubah
         * (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT, AWS_BUCKET,
         * AWS_URL, AWS_DEFAULT_REGION, AWS_USE_PATH_STYLE_ENDPOINT). Tidak
         * ada kode yang perlu disunting. Perhatikan `AWS_URL` dan
         * `AWS_USE_PATH_STYLE_ENDPOINT` — keduanya format-nya beda per
         * provider, lihat render.yaml.
         */
        'public' => env('AWS_ENDPOINT') ? [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            // Default-nya us-east-1 (bukan "auto") supaya konsisten dengan
            // config/cache.php, queue.php, dan services.php. Nilai "auto"
            // hanya sah untuk Cloudflare R2; Supabase/B2 butuh kode region
            // sungguhan dan akan gagal dengan SignatureDoesNotMatch kalau
            // ketinggal "auto".
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'bucket' => env('AWS_BUCKET'),
            // URL publik bucket. Untuk R2: https://<nama-pub>.r2.dev
            // Untuk Supabase: https://<ref>.supabase.co/storage/v1/object/public/<bucket>
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ] : [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
