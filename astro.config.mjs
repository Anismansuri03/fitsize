import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Set SITE_URL when you know your domain (used for canonical links + sitemap).
const site = process.env.SITE_URL || 'https://fitsize.example.com';

export default defineConfig({
  site,
  integrations: [react()],
  trailingSlash: 'always',
  vite: {
    // jSquash ships its own WASM glue; keep Vite from pre-bundling it.
    optimizeDeps: {
      exclude: [
        '@jsquash/jpeg',
        '@jsquash/png',
        '@jsquash/oxipng',
        '@jsquash/webp',
        '@jsquash/avif',
        '@jsquash/resize',
      ],
    },
    worker: { format: 'es' },
    build: { target: 'es2022' },
  },
});
