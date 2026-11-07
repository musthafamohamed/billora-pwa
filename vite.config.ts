import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Billora is served from the root of invitedigital.online, not a
  // repository subpath. Keep generated manifest, icon, and Workbox URLs root-relative.
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Register the service worker in dev too, so the Settings install
      // diagnostics can pass during development testing. This does NOT
      // make Chrome install from a plain-HTTP LAN address: install still
      // requires a secure context (HTTPS or localhost).
      devOptions: { enabled: true },
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'Simple Bill',
        short_name: 'Simple Bill',
        description: 'Simple, offline-first invoicing for a single business. Create tax invoices and bills on your phone.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0b0b0c',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'simple-bill-pages', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
});
