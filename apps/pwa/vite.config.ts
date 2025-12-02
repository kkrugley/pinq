import { svelte } from '@sveltejs/vite-plugin-svelte';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      buffer: resolve(
        __dirname,
        '../../node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js',
      ),
      events: resolve(__dirname, 'src/lib/polyfills/events.ts'),
      util: resolve(__dirname, 'src/lib/polyfills/util.ts'),
    },
  },
  optimizeDeps: {
    include: ['buffer', 'events', 'util'],
    esbuildOptions: {
      banner: {
        js: 'globalThis.chrome = globalThis.chrome || {};',
      },
    },
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
        background_color: '#02091b',
        theme_color: '#0f172a',
        icons: [
          {
            src: '/icons/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
