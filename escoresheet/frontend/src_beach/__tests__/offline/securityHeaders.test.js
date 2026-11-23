// Audit SEC-44 / SEC-50: the OpenBeach sites (beach., referee-beach.,
// livescore-beach., scoresheet-beach.openvolley.app) and the Android app's
// build had no Content-Security-Policy, no frame protection and no nosniff of
// their own, although they are trusted CORS and passkey origins of the
// backend. Every Cloudflare Pages build now writes a _headers file
// (scripts/build-subdomains.js, csp.js headersFor), and the Android build
// carries the policy as a <meta> (vite.config.js cspMeta), as OpenVolley's.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contentSecurityPolicy, headersFor, securityHeaderLines, buildChannel, cspMeta, THEME_BOOT_HASH, FRAMEABLE_BUILDS, WASM_BUILDS } from '../../../csp.js'
import { THEME_BOOT_SCRIPT, themeBoot } from '../../../theme-boot.js'
import { subdomains } from '../../../scripts/subdomain-pages.js'

const frontendDir = resolve(__dirname, '../../..')

// "/*" rule of a _headers file -> { header: value }
function parseHeaders(text) {
  const lines = text.split('\n')
  expect(lines[0]).toBe('/*')
  const out = {}
  for (const l of lines.slice(1).filter(Boolean)) {
    const m = /^ {2}([A-Za-z-]+): (.+)$/.exec(l)
    expect(m, l).not.toBeNull()
    out[m[1]] = m[2]
  }
  return out
}
const directives = (policy) => Object.fromEntries(policy.split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v.join(' ')] }))

describe('the _headers file of every dist-beach* build', () => {
  it.each(Object.keys(subdomains))('%s', (name) => {
    const h = parseHeaders(headersFor(name, 'production'))
    const csp = directives(h['Content-Security-Policy'])
    expect(csp['default-src']).toBe("'self'")
    // the bundle and the theme boot script, nothing else inline, no eval;
    // WebAssembly only on the scorer site, which opens sealed backup files
    // (audit SEC-22: Argon2id of the match PINs)
    expect(csp['script-src']).toBe(WASM_BUILDS.includes(name) ? `'self' 'wasm-unsafe-eval' ${THEME_BOOT_HASH}` : `'self' ${THEME_BOOT_HASH}`)
    expect(csp['script-src'].replace("'wasm-unsafe-eval'", '')).not.toMatch(/unsafe-inline|unsafe-eval|\*/)
    expect(csp['object-src']).toBe("'none'")
    expect(csp['base-uri']).toBe("'self'")
    expect(csp['form-action']).toBe("'self'")
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    if (FRAMEABLE_BUILDS.includes(name)) {
      // the livescore display may be shown in a club's own page
      expect(csp['frame-ancestors']).toBeUndefined()
      expect(h['X-Frame-Options']).toBeUndefined()
    } else {
      expect(csp['frame-ancestors']).toBe("'self'")
      expect(h['X-Frame-Options']).toBe('SAMEORIGIN')
    }
  })

  it('WebAssembly only where sealed backup files are opened: the scorer site', () => {
    expect(WASM_BUILDS).toEqual(['beachapp'])
    for (const name of ['beach-referee', 'beach-livescore', 'beach-scoreboard', 'beach-scoresheet']) {
      expect(headersFor(name, 'production'), name).not.toMatch(/wasm-unsafe-eval/)
    }
  })

  it('the scorer, the referee view and the sheets are not frameable by other sites; only the livescore is', () => {
    expect(FRAMEABLE_BUILDS).toEqual(['beach-livescore'])
    for (const name of ['beachapp', 'beach-referee', 'beach-scoresheet', 'beach-scoreboard']) {
      expect(headersFor(name, 'production'), name).toMatch(/frame-ancestors 'self'/)
    }
  })

  it('a Cloudflare Pages preview (any branch but main) sends the policy as Report-Only; main enforces it', () => {
    expect(buildChannel({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' })).toBe('production')
    expect(buildChannel({ CF_PAGES: '1', CF_PAGES_BRANCH: 'fix/x' })).toBe('dev')
    expect(buildChannel({})).toBe('production')
    expect(buildChannel({ CF_PAGES: '1', CF_PAGES_BRANCH: 'fix/x', OB_BUILD_CHANNEL: 'production' })).toBe('production')
    const dev = parseHeaders(headersFor('beachapp', 'dev'))
    expect(dev['Content-Security-Policy-Report-Only']).toBe(parseHeaders(headersFor('beachapp', 'production'))['Content-Security-Policy'])
    expect(dev['Content-Security-Policy']).toBeUndefined()
    expect(securityHeaderLines('beachapp', 'dev')).toContain('  X-Frame-Options: SAMEORIGIN')
  })

  it('the theme boot script the pages carry inline is the one the policy allows', () => {
    const hash = `'sha256-${createHash('sha256').update(THEME_BOOT_SCRIPT, 'utf8').digest('base64')}'`
    expect(THEME_BOOT_HASH).toBe(hash)
    const [tag] = themeBoot().transformIndexHtml('', { path: '/index.html' })
    expect(tag).toMatchObject({ tag: 'script', injectTo: 'head-prepend', children: THEME_BOOT_SCRIPT })
    // the paper form gets none
    expect(themeBoot().transformIndexHtml('<html>', { path: '/scoresheet_beach.html' })).toBe('<html>')
  })

  it('build-subdomains.js writes it into every build, after the public_beach copy', () => {
    const src = readFileSync(resolve(frontendDir, 'scripts/build-subdomains.js'), 'utf8')
    const write = src.indexOf("writeFileSync(resolve(outDir, '_headers'), headersFor(subdomain, buildChannel()))")
    expect(write).toBeGreaterThan(0)
    expect(write).toBeGreaterThan(src.indexOf('cpSync(publicDir, outDir'))
  })
})

describe('the Android app build (CAPACITOR=true)', () => {
  it('carries the policy as the first <meta> of every page, without frame-ancestors', () => {
    const hook = cspMeta({ enabled: true }).transformIndexHtml
    // a post hook: its head-prepend tag is injected last, so it comes first,
    // above the theme boot script (a policy <meta> governs only what follows)
    expect(hook.order).toBe('post')
    const [tag] = hook.handler('<html>')
    expect(tag).toMatchObject({ tag: 'meta', injectTo: 'head-prepend', attrs: { 'http-equiv': 'Content-Security-Policy' } })
    expect(tag.attrs.content).toBe(contentSecurityPolicy({ frameAncestors: null, wasm: true }))
    expect(tag.attrs.content).not.toMatch(/frame-ancestors/)
    // the app's backup files are sealed with the match PINs: Argon2id is
    // WebAssembly (audit SEC-22); still no eval and no other inline script
    const script = directives(tag.attrs.content)['script-src']
    expect(script).toBe(`'self' 'wasm-unsafe-eval' ${THEME_BOOT_HASH}`)
    expect(cspMeta({ enabled: false }).transformIndexHtml.handler('<html>')).toBe('<html>')
    expect(cspMeta().apply).toBe('build')
  })

  it('vite.config.js turns it on for the Capacitor build only', () => {
    const src = readFileSync(resolve(frontendDir, 'vite.config.js'), 'utf8')
    expect(src).toMatch(/cspMeta\(\{ enabled: isCapacitor \}\)/)
    expect(src).toMatch(/themeBoot\(\)/)
  })
})
