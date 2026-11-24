// Audit SEC-20: the service worker of every OpenBeach site kept the backend's
// API answers by URL (the token no part of the key): the Cloudflare Pages
// build (scripts/build-subdomains.js) in 'api-cache' (NetworkFirst, 10 s,
// 24 h), the main build (vite.config.js) in 'network-cache' (a catch-all
// NetworkFirst https route, 3 s). On a shared beach tablet, when the Wi-Fi
// dropped or took longer than that, the next account (or a signed-out page)
// got the previous account's /api/me, saved teams and approvals as a normal
// 200. Now the API goes to the network only, first of all routes, in both
// builds; the old caches are deleted at start and when a session ends.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { generateSW } from 'workbox-build'
import {
  API_NETWORK_ONLY_ROUTE,
  MAIN_RUNTIME_CACHING,
  SUBDOMAIN_RUNTIME_CACHING,
  OLD_API_CACHES
} from '../../../pwa-workbox.js'

const frontendDir = resolve(__dirname, '../../..')
const BUILDS = { 'main build (vite.config.js)': MAIN_RUNTIME_CACHING, 'Cloudflare Pages build (build-subdomains.js)': SUBDOMAIN_RUNTIME_CACHING }

// Workbox's router: the first route that matches wins; a RegExp route takes a
// cross-origin URL only when it matches from the URL's start (RegExpRoute)
function firstRoute(routes, url, pageOrigin = 'https://beach.openvolley.app') {
  const sameOrigin = new URL(url).origin === pageOrigin
  return routes.find((r) => {
    const m = r.urlPattern.exec(url)
    return m && (sameOrigin || m.index === 0)
  }) || null
}

const API_URLS = [
  'https://backend.openvolley.app/api/me',
  'https://backend.openvolley.app/api/account/approvals',
  'https://backend.openvolley.app/api/approvals?external_id=match_1_x',
  'https://backend.openvolley.app/api/saved-teams?sport=beach',
  'https://backend.openvolley.app/api/match/bundle/match_1',
  'https://backend.openvolley.app/api/storage/download/logo.png',
  'http://192.168.1.20:8080/api/match/list',
  'https://beach.openvolley.app/api/db'
]

describe('service worker: no API answer is ever kept', () => {
  it('the API route is NetworkOnly with no cache', () => {
    expect(API_NETWORK_ONLY_ROUTE.handler).toBe('NetworkOnly')
    expect(API_NETWORK_ONLY_ROUTE.options?.cacheName).toBeUndefined()
    for (const u of API_URLS) expect(API_NETWORK_ONLY_ROUTE.urlPattern.exec(u)?.index, u).toBe(0)
    for (const u of ['https://beach.openvolley.app/referee_beach.html', 'https://beach.openvolley.app/assets/index-abc.js']) {
      expect(API_NETWORK_ONLY_ROUTE.urlPattern.test(u), u).toBe(false)
    }
  })

  it.each(Object.entries(BUILDS))('%s: the API route comes first and every API URL reaches it', (_name, routes) => {
    expect(routes[0]).toBe(API_NETWORK_ONLY_ROUTE)
    for (const u of API_URLS) expect(firstRoute(routes, u)?.handler, u).toBe('NetworkOnly')
    // no route keeps answers in the old API caches, no catch-all NetworkFirst
    for (const r of routes) {
      expect(OLD_API_CACHES).not.toContain(r.options?.cacheName)
      expect(String(r.urlPattern)).not.toBe(String(/^https:\/\/.*/))
    }
  })

  it.each(['vite.config.js', 'scripts/build-subdomains.js'])('%s uses the shared lists and names no API cache of its own', (file) => {
    const src = readFileSync(resolve(frontendDir, file), 'utf8')
    expect(src).toMatch(file === 'vite.config.js' ? /runtimeCaching: MAIN_RUNTIME_CACHING\b/ : /runtimeCaching: SUBDOMAIN_RUNTIME_CACHING\b/)
    expect(src).not.toMatch(/api-cache|network-cache|cacheName/)
  })

  // The generated sw.js itself, as workbox-build writes it for the sites
  // (the audit's PoC: Chromium served account A's /api/me to B from it)
  it.each(Object.entries(BUILDS))('%s: the generated sw.js registers the NetworkOnly API route before any caching route', async (_name, routes) => {
    const dir = mkdtempSync(join(tmpdir(), 'ob-sw-'))
    try {
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>sw</title>')
      await generateSW({
        globDirectory: dir,
        globPatterns: ['index.html'],
        swDest: join(dir, 'sw.js'),
        mode: 'development',
        inlineWorkboxRuntime: false,
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: null,
        runtimeCaching: routes.map((r) => ({ ...r }))
      })
      const sw = readFileSync(join(dir, 'sw.js'), 'utf8')
      const registrations = [...sw.matchAll(/workbox\.registerRoute\(([^\n]*)/g)].map((m) => m[1])
      expect(registrations.length).toBeGreaterThan(0)
      expect(registrations[0]).toContain(String(API_NETWORK_ONLY_ROUTE.urlPattern))
      expect(registrations[0]).toMatch(/new workbox\.NetworkOnly\(/)
      expect(sw).not.toMatch(/"api-cache"|"network-cache"/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})

describe('the old API caches are deleted', () => {
  it('dropOldApiCaches deletes api-cache and network-cache, and never throws', async () => {
    vi.resetModules()
    vi.doMock('../../utils_beach/backendConfig_beach', () => ({ getCloudApiUrl: (p) => `https://backend.test${p}` }))
    const { dropOldApiCaches } = await import('../../lib_beach/apiClient_beach')
    const store = { delete: vi.fn(async () => true) }
    await dropOldApiCaches({ caches: store })
    expect(store.delete.mock.calls.map((c) => c[0]).sort()).toEqual(['api-cache', 'network-cache'])
    await expect(dropOldApiCaches({ caches: { delete: () => { throw new Error('blocked') } } })).resolves.toBeUndefined()
    await expect(dropOldApiCaches({ caches: { delete: async () => { throw new Error('blocked') } } })).resolves.toBeUndefined()
    await expect(dropOldApiCaches({ caches: undefined })).resolves.toBeUndefined()
    vi.doUnmock('../../utils_beach/backendConfig_beach')
  })

  it('at start (the API client loads), at sign-out and when another account signs in', async () => {
    vi.resetModules()
    vi.doMock('../../utils_beach/backendConfig_beach', () => ({ getCloudApiUrl: (p) => `https://backend.test${p}` }))
    const store = { delete: vi.fn(async () => true) }
    const values = new Map([['api_auth_token', JSON.stringify({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' } })]])
    vi.stubGlobal('caches', store)
    vi.stubGlobal('localStorage', { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null, error: null }) })))
    try {
      const { apiAuth } = await import('../../lib_beach/apiClient_beach')
      expect(store.delete).toHaveBeenCalledWith('api-cache')
      expect(store.delete).toHaveBeenCalledWith('network-cache')
      store.delete.mockClear()
      await apiAuth.signOut()
      expect(store.delete).toHaveBeenCalledWith('api-cache')
      expect(store.delete).toHaveBeenCalledWith('network-cache')
      // the next account signing in on the device
      store.delete.mockClear()
      fetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: { user: { id: 'u2' }, session: { access_token: 'tok2', user: { id: 'u2' } } }, error: null }) }))
      await apiAuth.signInWithPassword({ email: 'b@example.test', password: 'pw-b' })
      expect(store.delete).toHaveBeenCalledWith('api-cache')
      expect(store.delete).toHaveBeenCalledWith('network-cache')
    } finally {
      vi.unstubAllGlobals()
      vi.doUnmock('../../utils_beach/backendConfig_beach')
    }
  })
})
