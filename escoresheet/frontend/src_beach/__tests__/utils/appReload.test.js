import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildReloadUrl,
  canReachAppServer,
  clearCachesAndReload,
  stripCacheBustParam
} from '../../utils_beach/appReload_beach'

// Options > Clear cache went to `pathname + '?cache_bust='`, which dropped
// ?match= (the home screen's match, a referee / livescore tablet's live
// match), and it wiped the precache and unregistered the service worker with
// no connectivity check: offline, the reload then had nothing to load from.
// (OpenVolley 644f8571, 8efbd12e.)

const originalLocation = window.location
const originalSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function restoreBrowserStubs() {
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true, writable: true })
  if (originalSW) Object.defineProperty(navigator, 'serviceWorker', originalSW)
  else delete navigator.serviceWorker
  delete globalThis.caches
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
}

function stubLocation(href) {
  const replace = vi.fn()
  const u = new URL(href)
  Object.defineProperty(window, 'location', {
    value: { href, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, replace },
    configurable: true,
    writable: true
  })
  return replace
}

function stubCachesAndSW() {
  const cachesDelete = vi.fn().mockResolvedValue(true)
  globalThis.caches = { keys: vi.fn().mockResolvedValue(['workbox-precache-v2-x', 'network-cache']), delete: cachesDelete }
  const unregister = vi.fn().mockResolvedValue(true)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) }
  })
  return { cachesDelete, unregister }
}

describe('buildReloadUrl', () => {
  it('keeps match / team / server and the hash, adds cache_bust', () => {
    const url = new URL(buildReloadUrl('https://host/referee_beach.html?match=42&team=1&server=10.0.0.2#x', 123))
    expect(url.pathname).toBe('/referee_beach.html')
    expect(url.searchParams.get('match')).toBe('42')
    expect(url.searchParams.get('team')).toBe('1')
    expect(url.searchParams.get('server')).toBe('10.0.0.2')
    expect(url.searchParams.get('cache_bust')).toBe('123')
    expect(url.hash).toBe('#x')
  })

  it('replaces an earlier cache_bust instead of piling them up', () => {
    const url = new URL(buildReloadUrl('https://host/?cache_bust=1&match=7', 2))
    expect(url.searchParams.getAll('cache_bust')).toEqual(['2'])
    expect(url.searchParams.get('match')).toBe('7')
  })
})

describe('stripCacheBustParam', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('removes only cache_bust and keeps the rest of the query', () => {
    window.history.replaceState(null, '', '/livescore_beach.html?match=9&cache_bust=55&team=2')
    stripCacheBustParam()
    expect(window.location.pathname).toBe('/livescore_beach.html')
    const params = new URLSearchParams(window.location.search)
    expect(params.has('cache_bust')).toBe(false)
    expect(params.get('match')).toBe('9')
    expect(params.get('team')).toBe('2')
  })

  it('leaves the URL alone without one', () => {
    window.history.replaceState(null, '', '/referee_beach.html?match=1')
    stripCacheBustParam()
    expect(window.location.pathname + window.location.search).toBe('/referee_beach.html?match=1')
  })
})

describe('canReachAppServer', () => {
  afterEach(restoreBrowserStubs)

  it('asks this page\'s own server for the page, past every cache', async () => {
    stubLocation('https://beach.openvolley.app/referee_beach.html?match=4')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    expect(await canReachAppServer()).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    const probe = new URL(url)
    expect(probe.origin + probe.pathname).toBe('https://beach.openvolley.app/referee_beach.html')
    expect(probe.searchParams.has('ob_probe')).toBe(true)
    expect(init.cache).toBe('no-store')
  })

  it('false on a network error or an error status', async () => {
    stubLocation('https://host/')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await canReachAppServer()).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    expect(await canReachAppServer()).toBe(false)
  })
})

describe('clearCachesAndReload', () => {
  afterEach(restoreBrowserStubs)

  it('wipes the caches, unregisters and reloads with ?match= kept when the server answers', async () => {
    const replace = stubLocation('https://host/referee_beach.html?match=42&team=1')
    const { cachesDelete, unregister } = stubCachesAndSW()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    expect(await clearCachesAndReload()).toBe(true)

    expect(cachesDelete).toHaveBeenCalledTimes(2)
    expect(unregister).toHaveBeenCalledTimes(1)
    const url = new URL(replace.mock.calls[0][0])
    expect(url.pathname).toBe('/referee_beach.html')
    expect(url.searchParams.get('match')).toBe('42')
    expect(url.searchParams.get('team')).toBe('1')
    expect(url.searchParams.has('cache_bust')).toBe(true)
  })

  it('touches nothing when the server is unreachable (the reload could not load the app)', async () => {
    const replace = stubLocation('https://host/?match=42')
    const { cachesDelete, unregister } = stubCachesAndSW()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const clear = vi.spyOn(localStorage, 'clear')

    expect(await clearCachesAndReload({ includeLocalStorage: true })).toBe(false)

    expect(cachesDelete).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('clears the settings too when asked', async () => {
    stubLocation('https://host/')
    stubCachesAndSW()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const clear = vi.spyOn(localStorage, 'clear')
    expect(await clearCachesAndReload({ includeLocalStorage: true })).toBe(true)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  // Both Clear cache actions go through the helper: the old reload to
  // `pathname + '?cache_bust='` dropped ?match=, and neither checked the server.
  it.each([
    'components_beach/options/HomeOptionsModal_beach.jsx',
    'components_beach/options/ScoreboardOptionsModal_beach.jsx'
  ])('%s clears the cache through clearCachesAndReload', (file) => {
    const src = readFileSync(resolve(__dirname, '../..', file), 'utf8')
    expect(src).not.toMatch(/location\.pathname \+ '\?cache_bust='/)
    expect(src).not.toMatch(/registration\.unregister\(\)/)
    expect(src).toMatch(/clearCachesAndReload\(\{ includeLocalStorage \}\)/)
    expect(src).toMatch(/options\.alerts\.clearCacheNeedsServer/)
  })
})
