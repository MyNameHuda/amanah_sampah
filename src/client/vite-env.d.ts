/// <reference types="vite/client" />

/**
 * Variabel env yang dibaca aplikasi.
 *
 * Hanya `VITE_API_BASE_URL` yang dipakai, dan itu pun opsional — default-nya
 * `/api` (single-origin, deployment produksi). Yang penting dideklarasikan di
 * sini supaya `import.meta.env.VITE_API_BASE_URL` tidak error TypeScript.
 */
interface ImportMetaEnv {
  /**
   * Base URL API absolut, mis. `https://api.domain.com/api`.
   * Kosongkan untuk single-origin (relative `/api`).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
