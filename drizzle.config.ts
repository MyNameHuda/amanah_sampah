import { defineConfig } from 'drizzle-kit';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Wajib diisi lewat environment. JANGAN commit nilai aslinya.
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
} satisfies Config;
