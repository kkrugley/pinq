import { svelte } from '@sveltejs/vite-plugin-svelte';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bufferPath = resolve(
  __dirname,
  '../../node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js',
);

export default defineConfig({
  resolve: {
    alias: {
      buffer: bufferPath,
      events: resolve(__dirname, 'src/lib/polyfills/events.ts'),
    },
  },
  optimizeDeps: {
    include: ['buffer', 'events'],
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pair-In Quick',
        short_name: 'pinq',
        description: 'P2P file and text transfer',
        start_url: '/',
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#3b82f6',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
