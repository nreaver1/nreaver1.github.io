import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'pwa-*.png'],

      // ── Web App Manifest ──────────────────────────────────
      manifest: {
        name:             'Keep Track',
        short_name:       'Keep Track',
        description:      'Track wins, losses, and rivalries across any game with your crew.',
        theme_color:      '#f97316',
        background_color: '#0a0a0f',
        display:          'standalone',
        orientation:      'portrait-primary',
        start_url:        '/',
        scope:            '/',
        lang:             'en',
        categories:       ['games', 'sports', 'social'],
        icons: [
          {
            src:   '/pwa-192.png',
            sizes: '192x192',
            type:  'image/png',
          },
          {
            src:   '/pwa-512.png',
            sizes: '512x512',
            type:  'image/png',
          },
          {
            src:     '/pwa-maskable-192.png',
            sizes:   '192x192',
            type:    'image/png',
            purpose: 'maskable',
          },
          {
            src:     '/pwa-maskable-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src:          '/pwa-512.png',
            sizes:        '512x512',
            type:         'image/png',
            form_factor:  'narrow',
            label:        'Keep Track home screen',
          },
        ],
      },

      // ── Service Worker / Workbox config ───────────────────
      workbox: {
        // Cache the app shell (HTML, JS, CSS) with stale-while-revalidate
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

        // Runtime caching strategies
        runtimeCaching: [
          {
            // Supabase API — network-first so data is always fresh
            // Falls back to cache if offline
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName:          'supabase-api',
              expiration:         { maxEntries: 50, maxAgeSeconds: 5 * 60 }, // 5 min
              networkTimeoutSeconds: 10,
              cacheableResponse:  { statuses: [0, 200] },
            },
          },
          {
            // Supabase Storage (avatars) — stale-while-revalidate
            // Images are cache-busted on upload so this is safe
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName:         'supabase-storage',
              expiration:        { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName:         'google-fonts',
              expiration:        { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }, // 1 year
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // Dev: enable SW in dev so we can test
      devOptions: {
        enabled: false, // flip to true to test SW locally
      },
    }),
  ],

  test: {
    environment: 'jsdom',
    globals:     true,
    setupFiles:  ['./src/test/setup.js'],
  },
})
