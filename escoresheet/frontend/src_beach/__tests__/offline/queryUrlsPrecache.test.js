import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// workbox's own precache lookup (what the service worker runs on a request)
import { generateURLVariations } from 'workbox-precaching/utils/generateURLVariations.js'
import { IGNORE_URL_PARAMETERS } from '../../../pwa-workbox.js'
import { canReachAppServer } from '../../utils_beach/appReload_beach'

// Offline, the service worker served the plain pages but none of the URLs
// the app opens itself with a query string: Menu > Open scoreboard
// (/scoreboard_beach.html?mode=local), the scoresheet's print and the
// approval PDF (?action=print, ?action=getBlob&pdfReq=..) and the error
// screen's Reload (/?cache_bust=..) failed with ERR_FAILED at a beach with no
// internet (stress test 2026-10-25). Workbox looks a request up in the
// precache without the parameters ignoreURLParametersMatching names, by
// default only utm_* and fbclid; both builds now ignore every parameter.

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ORIGIN = 'https://beach.example.test'

// The precached page a request is served from, or null (the network)
function precachedPage(url, precached, ignoreURLParametersMatching) {
  for (const variation of generateURLVariations(ORIGIN + url, { ignoreURLParametersMatching })) {
    const path = new URL(variation).pathname + new URL(variation).search
    if (precached.includes(path)) return path
  }
  return null
}

describe('offline: the URLs the app opens with a query string', () => {
  const precached = ['/index.html', '/scoreboard_beach.html', '/scoresheet_beach.html', '/referee_beach.html', '/livescore_beach.html']
  const opened = [
    ['/?cache_bust=1792937000000', '/index.html'],
    ['/scoreboard_beach.html?mode=local', '/scoreboard_beach.html'],
    ['/scoresheet_beach.html?action=print', '/scoresheet_beach.html'],
    ['/scoresheet_beach.html?action=save', '/scoresheet_beach.html'],
    ['/scoresheet_beach.html?action=getBlob&pdfReq=abc', '/scoresheet_beach.html'],
    ['/referee_beach.html?match=12&pin=123456', '/referee_beach.html']
  ]

  it.each(opened)('%s is served from the precache (%s)', (url, page) => {
    expect(precachedPage(url, precached, IGNORE_URL_PARAMETERS)).toBe(page)
  })

  it('workbox\'s default would send them to the network', () => {
    expect(precachedPage('/scoreboard_beach.html?mode=local', precached, undefined)).toBe(null)
  })

  // Options > Clear cache refuses offline: it asks the server first
  // (canReachAppServer), with a query no cache holds. With every parameter
  // ignored the precache answered that probe too, offline, and Clear cache
  // wiped the caches and the worker and reloaded into a browser error page.
  describe('the Clear cache probe', () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each([
      ['/', '?match=12'],
      ['/index.html', ''],
      ['/scoreboard_beach.html', '?mode=local'],
      ['/referee_beach.html', '?match=12&pin=123456']
    ])('of %s%s is never served from the precache', async (page, query) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      await canReachAppServer(1000, { location: { pathname: page, href: ORIGIN + page + query } })
      const probe = new URL(fetchMock.mock.calls[0][0])
      expect(precachedPage(probe.pathname + probe.search, precached, IGNORE_URL_PARAMETERS)).toBe(null)
    })
  })

  it('the main build and the subdomain builds use the rule', () => {
    for (const file of ['vite.config.js', 'scripts/build-subdomains.js']) {
      const source = readFileSync(resolve(frontendDir, file), 'utf8')
      expect(source, file).toMatch(/ignoreURLParametersMatching: IGNORE_URL_PARAMETERS/)
    }
  })
})
