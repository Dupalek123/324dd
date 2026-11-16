import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ikona.svg'],
      manifest: {
        name: 'Beskid Floor Panel',
        short_name: 'Beskid Floor',
        description: 'Panel do prowadzenia firmy wykonawczej: zlecenia, oferty, koszty, godziny, rozliczenia.',
        lang: 'pl',
        start_url: './',
        display: 'standalone',
        background_color: '#f4efe8',
        theme_color: '#6b5a4a',
        icons: [
          { src: 'ikona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'ikona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'ikona-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
