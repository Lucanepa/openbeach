import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import scoresheetTailwind from './scripts/vite-plugin-scoresheet-tailwind.js'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { PWA_INCLUDE_ASSETS, PWA_ICONS, THEME_COLOR } from './pwa-icons.js'

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
// scripts/build-subdomains.js: each subdomain app brings its own VitePWA
// (its own manifest name); this one would overwrite it
const isSubdomainBuild = process.env.OB_SUBDOMAIN_BUILD === 'true'

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
    // Vite injects the stylesheets of the CSS chunks that several pages share
    // (tailwind_beach, flag-icons) in a racy order, so two builds of the same
    // commit could differ in admin_beach.html / index.html. F-Droid rebuilds
    // the tag and needs the same bytes as the signed APK (Binaries in the
    // recipe): put the injected <link rel="stylesheet"> tags in a fixed order
    // (by file name; flag-icons and the Tailwind layers do not overlap).
    {
      name: 'stable-css-order',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const re = /^[ \t]*<link rel="stylesheet" crossorigin href="[^"]+">\n/gm
          const links = html.match(re)
          if (!links || links.length < 2) return html
          const sorted = [...links].sort()
          let i = 0
          return html.replace(re, () => sorted[i++])
        },
      },
    },
    // The PDF scoresheet's own Tailwind v3 (was the CDN); before v4 sees it
    scoresheetTailwind(),
    // Tailwind v4 + the volleyui tokens (src_beach/tailwind_beach.css)
    tailwindcss(),
    VitePWA({
      disable: isCapacitor || isSubdomainBuild,
      // 'prompt', not 'autoUpdate': a new worker waits until the scorer taps
      // "Refresh to update" (UpdateBanner_beach). autoUpdate (skipWaiting) let
      // it take over by itself after a deploy or a desktop app update, and
      // clients.claim() then swapped the worker under every open page, the
      // scoretable mid-match included (useServiceWorker_beach).
      registerType: 'prompt',
      includeAssets: PWA_INCLUDE_ASSETS,
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        // Cache all assets for offline use
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // The phone signing page (public_beach/sign/, OpenVolley cb20be70) is
        // opened by OTHER phones from a QR code, never by the app: not
        // precached. (vite-plugin-pwa's own defaults are kept: setting
        // globIgnores replaces them.)
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', 'sign/**'],
        // Workbox's 2 MiB default fails a build whose entry chunk outgrows it
        // (the subdomain build did at 2.4 MB, 2.0.2): the entry must be
        // precached, scorers work offline (scripts/build-subdomains.js too)
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // A multi-page app: no SPA fallback. With workbox's default every
        // navigation the service worker controls got index.html, so on the
        // desktop / venue relay a tablet's /referee or /livescore (the QR
        // code links) opened the scoretable once the worker was installed.
        // The subdomain builds (scripts/build-subdomains.js) do the same.
        navigateFallback: null,
        // Use NetworkFirst for API calls, but CacheFirst for assets
        runtimeCaching: [
          {
            // The account approvals and the approval PIN status are never
            // answered from a cache: the NetworkFirst route below falls back
            // to the last copy after 3 s, and a stale list would bring back
            // an approval undone or voided since and pass the re-check
            // before "Confirm and approve" (MatchEnd_beach)
            urlPattern: /^https:\/\/[^/]+\/api\/(?:approvals|account\/approval)/,
            handler: 'NetworkOnly'
          },
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
        theme_color: THEME_COLOR,
        icons: PWA_ICONS
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


