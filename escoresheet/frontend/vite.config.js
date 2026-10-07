import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import scoresheetTailwind from './scripts/vite-plugin-scoresheet-tailwind.js'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const appVersion = packageJson.version

// Android app build (scripts/release-android.sh, the F-Droid recipe): the
// WebView loads the bundled files, so no service worker (an old precache would
// keep serving the previous version after an APK update), and the output goes
// to dist-capacitor (capacitor.config.json webDir).
const isCapacitor = process.env.CAPACITOR === 'true'

export default defineConfig({
  // Set base from env for GitHub Pages project site deployments.
  // If deploying to a custom domain (CNAME), use '/'. Otherwise set to '/<repo-name>/'
  base: process.env.VITE_BASE_PATH || '/',
  publicDir: 'public_beach',
  // Android app: no .env files, only the variables given on the command line.
  // F-Droid builds the APK from source and checks it against the owner-signed
  // one byte for byte, so a value from someone's local .env (e.g. a VITE_*
  // backend URL) must not end up in the bundle.
  envDir: isCapacitor ? false : undefined,
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  plugins: [
    react(),
    // The PDF scoresheet's own Tailwind v3 (was the CDN); before v4 sees it
    scoresheetTailwind(),
    // Tailwind v4 + the volleyui tokens (src_beach/tailwind_beach.css)
    tailwindcss(),
    VitePWA({
      disable: isCapacitor,
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
        name: process.env.VITE_APP_TITLE || 'OpenBeach eScoresheet',
        short_name: 'OpenBeach',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#e2001a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    port: 6173,
    https: process.env.VITE_HTTPS === 'true',
    host: true, // Allow external connections
    allowedHosts: [
      'yael-ethnic-aliana.ngrok-free.dev',
    ],
    proxy: {
      '/api/screenshot': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        rewrite: (path) => '/screenshot',
      },
      '/api/pdf': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        rewrite: (path) => '/pdf',
      },
    },
  },
  build: {
    ...(isCapacitor ? { outDir: 'dist-capacitor' } : {}),
    // Use safer build options to avoid eval in production
    minify: 'esbuild',
    target: 'es2015',
    rollupOptions: {
      input: {
        main: './index.html',
        referee: './referee_beach.html',
        livescore: './livescore_beach.html',
        scoresheet: './scoresheet_beach.html',
        scoresheetArchive: './scoresheet_archive_beach.html',
        admin: './admin_beach.html',
        scoreboard: './scoreboard_beach.html',
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


