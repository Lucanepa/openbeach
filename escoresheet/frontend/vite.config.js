import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Set base from env for GitHub Pages project site deployments.
  // If deploying to a custom domain (CNAME), use '/'. Otherwise set to '/<repo-name>/'
  base: process.env.VITE_BASE_PATH || '/',
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // Cache all assets for offline use
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Use NetworkFirst for API calls, but CacheFirst for assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'network-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              }
            }
          }
        ]
      },
      manifest: {
        name: process.env.VITE_APP_TITLE || 'Open eScoresheet',
        short_name: 'eScoresheet',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: { port: 5173 },
  build: {
    // Use safer build options to avoid eval in production
    minify: 'esbuild',
    target: 'es2015',
    rollupOptions: {
      input: {
        main: './index_beach.html',
        referee: './referee_beach.html',
        scoresheet: './scoresheet_beach.html',
      },
      output: {
        // Avoid eval in production builds
        format: 'es',
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'dexie-vendor': ['dexie', 'dexie-react-hooks'],
          'pdf-vendor': ['jspdf', 'pdfjs-dist', 'pdf-lib']
        }
      }
    }
  }
})


