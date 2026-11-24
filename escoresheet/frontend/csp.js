import { createHash } from 'crypto'
import { THEME_BOOT_SCRIPT } from './theme-boot.js'

/**
 * Content-Security-Policy and frame protection of OpenBeach's pages (audit
 * SEC-44, SEC-50; OpenVolley's csp.js, fe-shell-pwa-6 / android-7).
 * Shared by scripts/build-subdomains.js (a _headers file in every
 * dist-beach* build, which Cloudflare Pages sends as headers) and
 * vite.config.js (a <meta> in the Android app's build, which has no server
 * to send a header). The desktop app serves the main build from its relay
 * without it, as OpenVolley's does.
 *
 * The four sites (beach., referee-beach., livescore-beach.,
 * scoresheet-beach.openvolley.app) are trusted origins of the backend (CORS
 * with credentials) and passkey origins of openvolley.app: any script that
 * ran there could use the session in localStorage. They sent no policy, no
 * frame protection and no nosniff of their own.
 *
 * What the pages need, and nothing more where that is known:
 *   - scripts: the bundle ('self') and the colour theme boot script (inline,
 *     by its hash: theme-boot.js). No other inline script, no eval.
 *     WebAssembly ('wasm-unsafe-eval') only where a backup file is sealed or
 *     opened: Argon2id of the match PINs (hash-wasm in
 *     src_beach/utils_beach/backupCrypto/kdf_beach.js, audit SEC-22), in the
 *     Android app (its backup files) and the scorer site (Restore match from
 *     an exported file). Not the referee, livescore, scoreboard or sheet
 *     sites.
 *   - styles: inline style attributes (React's style props, the PDF sheet's
 *     own Tailwind) and <style> tags of libraries: 'unsafe-inline' for styles
 *     only.
 *   - images: the app's own, data: (signatures, QR codes, the sheet's
 *     rasterised pages) and blob: (PDF capture).
 *   - connections: the backend is per build and per user (the cloud, a
 *     venue's own relay on a LAN address over http / ws), so connect-src
 *     names schemes, not hosts (isAllowedBackendUrl in
 *     utils_beach/backendConfig_beach.js decides the hosts).
 *   - frames: the Android in-app view, the PDF capture frame and the archive's
 *     PDF view are the app's own pages or blob: URLs. frame-ancestors (header
 *     only, a <meta> cannot carry it): only the app's own pages may frame
 *     them, except the livescore display (no action on it; a club may show it
 *     in its own page), as OpenVolley's livescore.
 */

const sha256Source = (script) => `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`

export const THEME_BOOT_HASH = sha256Source(THEME_BOOT_SCRIPT)

// The builds that open sealed backup files (Restore match): WebAssembly for
// the PIN key derivation. The Android app's <meta> has it too (cspMeta).
export const WASM_BUILDS = Object.freeze(['beachapp'])

const scriptSrc = (wasm) => (wasm ? `'self' 'wasm-unsafe-eval' ${THEME_BOOT_HASH}` : `'self' ${THEME_BOOT_HASH}`)

const DIRECTIVES = [
  ["default-src", "'self'"],
  ["script-src", null], // scriptSrc(wasm)
  ["style-src", "'self' 'unsafe-inline'"],
  ["img-src", "'self' data: blob:"],
  ["font-src", "'self' data:"],
  ["connect-src", "'self' https: wss: http: ws:"],
  ["worker-src", "'self' blob:"],
  ["frame-src", "'self' blob:"],
  ["media-src", "'self' data: blob:"],
  ["manifest-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
]

/**
 * The policy as one header / meta value.
 * @param {{ frameAncestors?: string|null, wasm?: boolean }} [opts]
 *   frameAncestors null: none (a <meta>, or a page any site may frame);
 *   wasm: WebAssembly allowed (WASM_BUILDS, the Android app)
 */
export function contentSecurityPolicy({ frameAncestors = "'self'", wasm = false } = {}) {
  const parts = DIRECTIVES.map(([name, value]) => `${name} ${name === 'script-src' ? scriptSrc(wasm) : value}`)
  if (frameAncestors) parts.push(`frame-ancestors ${frameAncestors}`)
  return parts.join('; ')
}

/** Subdomain builds (scripts/subdomain-pages.js keys) whose pages any site may frame. */
export const FRAMEABLE_BUILDS = Object.freeze(['beach-livescore'])

// The branch Cloudflare Pages publishes as the live sites
export const PRODUCTION_BRANCH = 'main'

/**
 * 'dev' for a Cloudflare Pages preview (CF_PAGES=1 on any branch but main),
 * else 'production'. OB_BUILD_CHANNEL=dev|production wins (a local test).
 * A dev build sends the policy as Report-Only: a page it would break shows
 * up in the console of the preview site first; production enforces it.
 * @param {Record<string, string|undefined>} [env]
 * @returns {'dev'|'production'}
 */
export function buildChannel(env = process.env) {
  const explicit = String(env.OB_BUILD_CHANNEL || '').trim().toLowerCase()
  if (explicit === 'dev' || explicit === 'production') return explicit
  if (env.CF_PAGES === '1' && env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH) return 'dev'
  return 'production'
}

/**
 * The header lines of a web build's _headers rule for every path: the
 * policy and frame protection.
 * @param {string} name the subdomain build (scripts/subdomain-pages.js key)
 * @param {'dev'|'production'} [channel]
 */
export function securityHeaderLines(name, channel = 'production') {
  const frameable = FRAMEABLE_BUILDS.includes(name)
  const policy = contentSecurityPolicy({ frameAncestors: frameable ? null : "'self'", wasm: WASM_BUILDS.includes(name) })
  const header = channel === 'dev' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
  const lines = [`  ${header}: ${policy}`, '  X-Content-Type-Options: nosniff']
  if (!frameable) lines.push('  X-Frame-Options: SAMEORIGIN')
  return lines
}

/**
 * The _headers file of a web build (Cloudflare Pages reads it from the
 * output root): the policy, frame protection, nosniff and the referrer rule
 * for every path.
 * @param {string} name the subdomain build
 * @param {'dev'|'production'} [channel]
 */
export function headersFor(name, channel = buildChannel()) {
  return ['/*', ...securityHeaderLines(name, channel), '  Referrer-Policy: strict-origin-when-cross-origin', ''].join('\n')
}

/**
 * Vite plugin: the policy as a <meta http-equiv> at the top of every page of
 * a build (the Android app: CAPACITOR=true in vite.config.js). Without
 * frame-ancestors, which a <meta> cannot set; with WebAssembly (its backup
 * files are sealed with the match PINs).
 * @param {{ enabled?: boolean }} [opts]
 */
export function cspMeta({ enabled = true } = {}) {
  return {
    name: 'openbeach-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      // After the other plugins' tags: each head-prepend tag goes to the top,
      // so the last one is first, and a policy <meta> governs only what comes
      // after it (the theme boot script among them)
      order: 'post',
      handler(html) {
        if (!enabled) return html
        return [{
          tag: 'meta',
          // the app's backup files are sealed with the match PINs (WebAssembly)
          attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy({ frameAncestors: null, wasm: true }) },
          injectTo: 'head-prepend'
        }]
      }
    }
  }
}
