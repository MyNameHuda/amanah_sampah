<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Deploy Belum Lengkap</title>
    <style>
        :root { color-scheme: light dark; }
        body {
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
            margin: 0; min-height: 100vh; display: grid; place-items: center;
            background: #f8fafc; color: #0f172a; padding: 1.5rem;
        }
        main { max-width: 34rem; background: #fff; border: 1px solid #e2e8f0;
               border-radius: 12px; padding: 1.75rem; }
        h1 { font-size: 1.15rem; margin: 0 0 .75rem; }
        p { line-height: 1.65; font-size: .9rem; color: #334155; margin: 0 0 1rem; }
        code { background: #f1f5f9; padding: .15rem .4rem; border-radius: 4px;
               font-size: .85em; word-break: break-all; }
        ol { padding-left: 1.15rem; line-height: 1.8; font-size: .875rem; color: #334155; }
        .hint { font-size: .8rem; color: #64748b; border-top: 1px solid #e2e8f0;
                padding-top: .85rem; margin-bottom: 0; }
    </style>
</head>
<body>
    <main>
        <h1>Frontend belum di-deploy</h1>
        <p>
            API Laravel sudah jalan, tapi hasil build frontend React belum ada di
            <code>public/</code>. Setiap halaman aplikasi (login, dashboard, POS)
            dilayani oleh frontend tersebut, jadi aplikasi belum bisa dipakai.
        </p>
        <p>Jalankan di direktori <code>prototype-frontend/</code>:</p>
        <ol>
            <li><code>npm ci</code></li>
            <li><code>npm run build</code></li>
            <li><code>npm run deploy:sync</code> (menyalin <code>dist/</code> ke <code>prototype/public/</code>)</li>
        </ol>
        <p class="hint">Kalau kamu melihat halaman ini, berarti domain sudah
           mengarah ke server yang benar — hanya build frontend-nya yang kurang.</p>
    </main>
</body>
</html>
