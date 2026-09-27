# Amanah Sampah — Frontend Prototype (React + TS + Vite)

**Status:** v1.1 prototype, runnable end-to-end
**Backend:** `../prototype/` (Laravel 11 + Sanctum + SQLite)

---

## Apa Ini?

Frontend SPA berbasis **Vite + React 18 + TypeScript + Tailwind CSS** untuk sistem Amanah Sampah. Lima dashboard sesuai role (Santri, Staff Kantin, Petugas, Admin, Super Admin).

## Quick Start

```powershell
# Terminal 1: backend (jika belum jalan)
cd "C:\Users\bangn\Documents\Kerja\amanah_sampah\prototype"
php artisan serve --host=127.0.0.1 --port=8000

# Terminal 2: frontend
cd "C:\Users\bangn\Documents\Kerja\amanah_sampah\prototype-frontend"
npm install
npm run dev
```

Akses di: `http://127.0.0.1:5173`

Vite proxy akan forward `/api/*` ke `http://127.0.0.1:8000/api/*` — tidak ada CORS issue.

## Default Login (Quick Fill Buttons di Login Page)

| Role | Login | Password |
|---|---|---|
| Admin Kesantrian | `admin@amanah.id` | `admin12345` |
| Staff Kantin | `staff@amanah.id` | `staff12345` |
| Petugas Kesantrian | `petugas@amanah.id` | `petugas12345` |
| Super Admin | `super@amanah.id` | `super12345` |
| Santri (50 total) | NIS `23001` | `demo12345` |

## Halaman per Role

### 1. Login (`/login`)
- Single login form (NIS atau email)
- Quick-fill buttons untuk testing 5 role
- Auto-redirect ke dashboard sesuai role

### 2. Santri Dashboard (`/santri`)
- Poin saldo (color-coded: merah < 0, hijau > 0)
- Block status badge
- Open debt list
- Reward catalog (toggle "Tukar" jika poin cukup)
- Poin ledger history (20 terakhir)

### 3. Staff Kantin POS (`/staff`)
- Input NIS → lookup siswa (display poin, blocked, penalty tier)
- Scan/pilih barcode → display produk info (plastik/non-plastik badge)
- Input qty → commit transaksi
- Live update saldo siswa setelah commit
- History 100 transaksi terakhir

### 4. Petugas Verifikasi (`/petugas`)
- Open sesi: input NIS → display open debts + saldo
- Add items (multiple produk per sesi):
  - Input barcode + qty_in
  - Pure-shortfall valid (qty_in=0)
- Live display items table dengan matched/excess/shortfall
- Commit sesi → atomic saldo update

### 5. Admin Kesantrian (`/admin`)
Tabs:
- **Siswa**: List 50 siswa dengan filter, search, reset poin button (3-step modal)
- **Coverage**: Per-santri coverage rate dengan color-coded badges

Reset Poin Modal:
- Step 1: Konfirmasi siswa sudah bayar denda
- Step 2: Apply reset → poin = 0, blocked = FALSE, debts tetap OPEN

### 6. Super Admin (`/super`)
Tabs:
- **System Health**: DB size, photo storage, active siswa, modes
- **Users**: List + force logout + suspend + reset password
- **Mode & Config**: Toggle maintenance + read-only, manual cron trigger
- **Coverage**: Per-santri coverage breakdown
- **Audit Log**: 50 terakhir dengan action & payload
- **Tier 3 (Restricted)**: Reverse transaction modal dengan mandatory alasan + password re-verify

## File Structure

```
prototype-frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── api/
    │   └── client.ts
    ├── auth/
    │   └── AuthContext.tsx
    ├── components/
    │   └── Layout.tsx
    └── pages/
        ├── Login.tsx
        ├── SantriDashboard.tsx
        ├── StaffDashboard.tsx
        ├── PetugasDashboard.tsx
        ├── AdminDashboard.tsx
        └── SuperAdminDashboard.tsx
```

## Tech Stack

- **Vite 5** — dev server + production build
- **React 18** + **TypeScript 5** — UI framework
- **Tailwind CSS 3** — utility-first styling
- **React Router 6** — client-side routing
- **Axios 1.7** — HTTP client dengan interceptors

## Production Build

```bash
npm run build
```

Output di `dist/`. Untuk deploy production, build lalu serve via static hosting (Vercel, Netlify) atau via Laravel sendiri dari `public/frontend/`.

## Known Limitations

- Tidak ada real barcode scanner (pakai input field + datalist dropdown)
- Tidak ada offline mode (per PRD F2)
- Tidak ada email integration (per PRD E7)
- Tier 3 reverse transaction butuh input manual transaction ID (perlu improved UX untuk production)

## Next Steps

Lihat `../DECISION-LOG.md` dan `../PRD.md` untuk referensi business rules dan acceptance criteria.

Possible next iterations:
1. Real barcode scanner via `getUserMedia()` + library (e.g. `react-qr-barcode-scanner`)
2. Real-time updates via WebSocket / polling
3. PWA (offline-capable) — saat ini F2 mandatory online
4. Mobile-first polish (saat ini responsive tapi desktop-first)
