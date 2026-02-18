#!/usr/bin/env node
/**
 * Build script for subdomain deployments
 * Builds each dashboard as a standalone app for Cloudflare Pages deployment
 *
 * Usage:
 *   node scripts/build-subdomains.js            # Build all subdomains
 *   node scripts/build-subdomains.js beachapp   # Build only beachapp
 *
 * Output:
 *   dist-beachapp/       → beachapp.openvolley.app (main scoresheet)
 *   dist-beach-referee/  → beach-referee.openvolley.app
 *   dist-beach-livescore/→ beach-livescore.openvolley.app
 *   dist-beach-scoresheet/→ beach-scoresheet.openvolley.app
 *   dist-beach-roster/   → beach-roster.openvolley.app
 */

import { build } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync, copyFileSync, cpSync } from 'fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(__dirname, '..')

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(frontendDir, 'package.json'), 'utf-8'))
const appVersion = packageJson.version

// Subdomain configurations
const subdomains = {
  beachapp: {
    name: 'OpenBeach eScoresheet',
    shortName: 'Beach',
    description: 'Beach volleyball match scoring application',
    title: 'OpenBeach eScoresheet',
    mainEntry: 'main_beach',
    themeColor: '#f59e0b'
  },
  'beach-referee': {
    name: 'Beach Referee Dashboard',
    shortName: 'Referee',
    description: 'Referee view for beach volleyball match scoring',
    title: 'Beach Referee Dashboard - OpenBeach',
    mainEntry: 'referee-main_beach',
    themeColor: '#1e40af'
  },
  'beach-livescore': {
    name: 'Beach Live Scoreboard',
    shortName: 'Livescore',
    description: 'Live scoring display for beach volleyball match',
    title: 'Beach Live Scoreboard - OpenBeach',
    mainEntry: 'livescore-main_beach',
    themeColor: '#7c3aed'
  },
  'beach-scoresheet': {
    name: 'Beach Scoresheet Archive',
    shortName: 'Scoresheet',
    description: 'View and download beach volleyball match scoresheets',
    title: 'Beach Scoresheet Archive - OpenBeach',
    mainEntry: 'scoresheet-main_beach',
    themeColor: '#0891b2',
    customHtml: true
  }
}

function createIndexHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" sizes="16x16 32x32 48x48 64x64" href="/favicon_beach.png" />
    <link rel="icon" type="image/png" sizes="128x128 256x256" href="/favicon_beach.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon_beach.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="${config.themeColor}" />
    <meta name="description" content="${config.description}" />
    <title>${config.title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src_beach/${config.mainEntry}.jsx"></script>
  </body>
</html>
`
}

function createScoresheetHtml(config) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" sizes="16x16 32x32 48x48 64x64" href="/favicon_beach.png" />
  <link rel="icon" type="image/png" sizes="128x128 256x256" href="/favicon_beach.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon_beach.png" />
  <meta name="theme-color" content="${config.themeColor}" />
  <meta name="description" content="${config.description}" />
  <title>${config.title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Global Font Setting */
    body {
      font-family: 'Aptos Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    /* Custom print styles to ensure background graphics/colors print */
    @media print {
      html,
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        margin: 0 !important;
        padding: 0 !important;
        height: 100% !important;
        overflow: hidden !important;
      }

      @page {
        size: A4 landscape;
        margin: 0;
      }

      #root {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        height: 100vh !important;
        max-height: 100vh !important;
      }
    }

    /* Hide scrollbar for cleaner look in inputs */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .vertical-text {
      writing-mode: vertical-lr;
      transform: rotate(180deg);
    }

    /* Dense table utils */
    .input-dense {
      text-align: center;
      background-color: transparent;
      width: 100%;
      height: 100%;
      outline: none;
    }

    .input-dense:focus {
      background-color: rgba(59, 130, 246, 0.1);
    }
  </style>
</head>
<body class="bg-gray-100 text-gray-900 antialiased print:bg-white text-[10px] overflow-auto">
  <div id="root"></div>
  <script type="module" src="/src_beach/${config.mainEntry}.jsx"></script>
</body>
</html>
`
}

async function buildSubdomain(subdomain) {
  const config = subdomains[subdomain]
  if (!config) {
    console.error(`Unknown subdomain: ${subdomain}`)
    console.error(`Available: ${Object.keys(subdomains).join(', ')}`)
    process.exit(1)
  }

  const outDir = resolve(frontendDir, `dist-${subdomain}`)
  const tempIndexName = `_build_${subdomain.replace('-', '_')}.html`
  const tempIndexPath = resolve(frontendDir, tempIndexName)

  // Clean output directory
  if (existsSync(outDir)) rmSync(outDir, { recursive: true })

  console.log(`\n🏐 Building ${subdomain}.openvolley.app...`)

  // Create temp index.html in frontend root (use custom HTML for scoresheet)
  const htmlContent = config.customHtml ? createScoresheetHtml(config) : createIndexHtml(config)
  writeFileSync(tempIndexPath, htmlContent)

  try {
    await build({
      root: frontendDir,
      base: '/',
      publicDir: false, // We'll copy assets manually
      define: {
        __APP_VERSION__: JSON.stringify(appVersion)
      },
      optimizeDeps: {
        include: ['pdfjs-dist', 'react', 'react-dom', 'dexie', 'dexie-react-hooks']
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'dexie']
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['favicon_beach.png'],
          workbox: {
            skipWaiting: false,
            clientsClaim: true,
            navigateFallback: null,
            runtimeCaching: [
              {
                urlPattern: /^https?:\/\/.*\/api\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
                  networkTimeoutSeconds: 10
                }
              },
              {
                urlPattern: /\.(?:js|css|png|jpg|jpeg|svg|gif|woff|woff2)$/,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'static-assets',
                  expiration: { maxEntries: 100, maxAgeSeconds: 2592000 }
                }
              },
              {
                urlPattern: /\.html$/,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'html-cache',
                  expiration: { maxEntries: 10, maxAgeSeconds: 86400 }
                }
              }
            ],
            navigateFallbackDenylist: [/^\/api\//],
            cleanupOutdatedCaches: true
          },
          manifest: {
            name: config.name,
            short_name: config.shortName,
            description: config.description,
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: config.themeColor,
            icons: [
              { src: 'favicon_beach.png', sizes: '192x192', type: 'image/png' },
              { src: 'favicon_beach.png', sizes: '512x512', type: 'image/png' }
            ]
          }
        })
      ],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: tempIndexPath,
          output: {
            format: 'es',
            manualChunks: (id) => {
              if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
                return 'react-vendor'
              }
              if (id.includes('node_modules/dexie')) {
                return 'dexie-vendor'
              }
            }
          }
        }
      },
      logLevel: 'warn'
    })

    // Rename the built HTML to index.html
    const builtHtmlPath = resolve(outDir, tempIndexName)
    const finalHtmlPath = resolve(outDir, 'index.html')
    if (existsSync(builtHtmlPath)) {
      renameSync(builtHtmlPath, finalHtmlPath)
    }

    // Copy all public_beach assets to output (fonts, images, PWA icons, etc.)
    const publicDir = resolve(frontendDir, 'public_beach')
    if (existsSync(publicDir)) {
      cpSync(publicDir, outDir, { recursive: true })
    }

    // Copy favicon from root if it exists (legacy path)
    const faviconSrc = resolve(frontendDir, 'favicon_beach.png')
    const faviconDest = resolve(outDir, 'favicon_beach.png')
    if (existsSync(faviconSrc) && !existsSync(faviconDest)) {
      copyFileSync(faviconSrc, faviconDest)
    }

    // Create 404.html for SPA routing
    if (existsSync(finalHtmlPath)) {
      copyFileSync(finalHtmlPath, resolve(outDir, '404.html'))
    }

    console.log(`✅ Built ${subdomain}.openvolley.app → dist-${subdomain}/`)

  } finally {
    // Clean up temp file
    if (existsSync(tempIndexPath)) {
      rmSync(tempIndexPath)
    }
  }
}

async function main() {
  const targetSubdomain = process.argv[2]

  console.log('🏖️  OpenBeach Subdomain Builder')
  console.log(`   Version: ${appVersion}`)

  if (targetSubdomain) {
    await buildSubdomain(targetSubdomain)
  } else {
    console.log('\n📦 Building all subdomains...')
    for (const subdomain of Object.keys(subdomains)) {
      await buildSubdomain(subdomain)
    }
    console.log('\n✨ All subdomain builds complete!')
    console.log('\n📁 Output directories:')
    for (const subdomain of Object.keys(subdomains)) {
      console.log(`   dist-${subdomain}/ → ${subdomain}.openvolley.app`)
    }
  }
}

main().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
