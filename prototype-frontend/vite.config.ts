import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const proxyConfig = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: proxyConfig,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    proxy: proxyConfig,
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunk strategy — pisahkan vendor agar app code berubah
        // tidak invalidasi vendor cache.
        manualChunks: {
          // React core + Router (perubahan jarang, cache panjang)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Icon set (sekitar 200KB tree-shaken — aman dipecah)
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
