import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

/**
 * Vite + Vercel Functions dalam satu project.
 *
 * Catatan: `/api` DIHAPUS dari folder public Vercel otomatis dan fungsi
 * di `/api/*.ts` diprioritaskan sebelum rewrite, jadi tidak perlu proxy
 * di produksi. Proxy hanya dipakai saat `npm run dev`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Hanya untuk pengembangan: arahkan ke Vercel dev server
      // (jalankan `npm run dev:api` di terminal terpisah)
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Manual chunk — pisahkan vendor agar perubahan app code
        // tidak menginvalidasi cache vendor di HP staff.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
