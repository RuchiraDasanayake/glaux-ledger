import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Read-only endpoints worth keeping a cached copy of, so opening the app with no signal
// still shows the last known figures instead of an error page.
const CACHEABLE_API = /^\/(transactions\/summary|categories|transactions)(\?|$)/

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Glaux Ledger',
        short_name: 'Glaux',
        description: 'Record shop sales and expenses in seconds.',
        // Both are paper. The splash then dissolves into the app rather than flashing
        // a dark panel first, which is what a nyx background would do here.
        theme_color: '#FAF7F2',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // Android crops icons to its own shape; this one is full-bleed with the
            // mark inside the safe zone so nothing important gets cut off.
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never serve a cached shell for an API call.
        navigateFallbackDenylist: [
          /^\/(auth|categories|transactions|recurring|reports|health|billing|capabilities|meta)/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && CACHEABLE_API.test(url.pathname + url.search),
            // Fresh figures whenever there is signal; the cache is the fallback, not
            // the default. Money data going stale silently would be worse than a spinner.
            handler: 'NetworkFirst',
            options: {
              cacheName: 'glaux-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'glaux-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Every backend router prefix is listed; a missing one silently returns index.html.
    // bypass lets document navigations (e.g. /admin/login) fall through to the SPA while
    // fetch/XHR API calls under the same prefix still proxy to the backend.
    proxy: Object.fromEntries(
      [
        '/auth',
        '/categories',
        '/transactions',
        '/recurring',
        '/reports',
        '/health',
        '/billing',
        '/admin',
        '/capabilities',
        '/meta',
      ].map((prefix) => [
        prefix,
        {
          target: 'http://localhost:8000',
          bypass: (req: import('node:http').IncomingMessage) =>
            req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
        },
      ]),
    ),
  },
})
