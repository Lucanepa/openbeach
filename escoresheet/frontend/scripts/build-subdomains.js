#!/usr/bin/env node
/**
 * Build script for subdomain deployments
 * Builds each dashboard as a standalone app for Cloudflare Pages deployment
 *
 * Usage:
 *   node scripts/build-subdomains.js            # Build all subdomains
 *   node scripts/build-subdomains.js beachapp   # Build only beachapp
 *
 * Output (the hosts: subdomain-pages.js `host`):
 *   dist-beachapp/         → beach.openvolley.app (main scoresheet and the pages
 *                            it opens: APP_PAGES; the Pages project keeps the beachapp name)
 *   dist-beach-referee/    → referee-beach.openvolley.app
 *   dist-beach-livescore/  → livescore-beach.openvolley.app
 *   dist-beach-scoresheet/ → scoresheet-beach.openvolley.app
 *   dist-beach-scoreboard/ → no site of its own (beach.openvolley.app/scoreboard_beach.html)
 */

import { build } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync, copyFileSync, cpSync } from 'fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { PWA_INCLUDE_ASSETS, PWA_ICONS, THEME_COLOR } from '../pwa-icons.js'
import { IGNORE_URL_PARAMETERS, SUBDOMAIN_RUNTIME_CACHING } from '../pwa-workbox.js'
import { subdomains, htmlFor, hostFor, missingFromBuild } from './subdomain-pages.js'
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

  console.log(`\n🏐 Building ${hostFor(subdomain)}...`)

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
            // Same offline rule as the main build (pwa-workbox.js): /?cache_bust=..
            // is the precached index.html
            ignoreURLParametersMatching: IGNORE_URL_PARAMETERS,
            // The API from the network only, first (one account's answers
            // were kept for the next: pwa-workbox.js API_NETWORK_ONLY_ROUTE)
            runtimeCaching: SUBDOMAIN_RUNTIME_CACHING,
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
        rolldownOptions: {
          // beachapp: its index.html and the pages the scoretable opens on
          // its own origin (APP_PAGES; the PDF sheet reads the scorer's
          // sessionStorage). Under vite.config.js's input names: the two
          // configs merge, an object input key by key.
          input: config.pages
            ? { main: tempIndexPath, ...Object.fromEntries(Object.entries(config.pages).map(([k, p]) => [k, resolve(frontendDir, p)])) }
            : tempIndexPath,
          output: {
            format: 'es',
            codeSplitting: {
              groups: [
                { name: 'react-vendor', test: /node_modules[\\/]react(-dom)?[\\/]/ },
                { name: 'dexie-vendor', test: /node_modules[\\/]dexie/ }
              ]
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

    // A site without a page the app opens (the match-end PDF's sheet among
    // them) must not go live: fail the build, Cloudflare Pages keeps the last
    // good deploy
    const missing = missingFromBuild(outDir, config, { pwa: !disablePWA })
    if (missing.length) {
      throw new Error(`dist-${subdomain} lacks: ${missing.join(', ')}`)
    }

    console.log(`✅ Built ${hostFor(subdomain)} → dist-${subdomain}/`)

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
      console.log(`   dist-${subdomain}/ → ${hostFor(subdomain)}`)
    }
  }
}

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
