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
 *   dist-beachapp/       → beach.openvolley.app (main scoresheet; the Pages project keeps the beachapp name)
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
import { PWA_INCLUDE_ASSETS, PWA_ICONS, THEME_COLOR } from '../pwa-icons.js'
import { subdomains, htmlFor } from './subdomain-pages.js'
import { precacheUnderFinalName } from './subdomain-precache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// vite.config.js is loaded for every subdomain build too (Tailwind, the PDF
// scoresheet's Tailwind): its own VitePWA must stay out, or its manifest
// ("OpenBeach eScoresheet") replaced each app's own name and short name.
process.env.OB_SUBDOMAIN_BUILD = 'true'
const frontendDir = resolve(__dirname, '..')
const disablePWA = process.env.DISABLE_PWA === 'true'

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(frontendDir, 'package.json'), 'utf-8'))
const appVersion = packageJson.version

async function buildSubdomain(subdomain, basePath = '/') {
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
  const htmlContent = htmlFor(config)
  writeFileSync(tempIndexPath, htmlContent)

  try {
    await build({
      root: frontendDir,
      base: basePath,
      publicDir: false, // We'll copy assets manually
      define: {
        __APP_VERSION__: JSON.stringify(appVersion)
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'dexie']
      },
      plugins: [
        react(),
        ...(!disablePWA ? [VitePWA({
          registerType: 'prompt',
          includeAssets: PWA_INCLUDE_ASSETS,
          workbox: {
            // The page is built as _build_<app>.html and renamed to index.html
            // below: precache it under that name, or the worker's install 404s
            manifestTransforms: [precacheUnderFinalName(tempIndexName)],
            // The app's entry is one chunk here (2.4 MB in 2.0.2), over
            // workbox's 2 MiB default: the build failed ("won't be
            // precached") and Cloudflare Pages kept serving the last good
            // build (2.0.1). It must be precached: scorers work offline.
            maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
            theme_color: THEME_COLOR,
            icons: PWA_ICONS
          }
        })] : [])
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

  const baseArgIndex = process.argv.indexOf('--base')
  const basePath = baseArgIndex !== -1 ? process.argv[baseArgIndex + 1] : '/'

  if (targetSubdomain) {
    await buildSubdomain(targetSubdomain, basePath)
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

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
