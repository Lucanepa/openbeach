// The account approvals (MatchEnd_beach) read the server's list on mount and
// re-check it before "Confirm and approve". The service worker's catch-all
// NetworkFirst route answered from its cache after 3 s: a stale list would
// bring back an approval undone or voided since. The approval endpoints go
// to the network only (the first runtime route, so it wins). Since audit
// SEC-20 that first route covers every /api/ request (pwa-workbox.js
// API_NETWORK_ONLY_ROUTE, swApiNoCache.test.js), in the main build and in the
// Cloudflare Pages build alike; it used to name the approval paths only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAIN_RUNTIME_CACHING, SUBDOMAIN_RUNTIME_CACHING } from '../../../pwa-workbox.js'

const config = readFileSync(resolve(__dirname, '../../../vite.config.js'), 'utf8')

describe('service worker: no cached approvals', () => {
  it.each([['main build', MAIN_RUNTIME_CACHING], ['Cloudflare Pages build', SUBDOMAIN_RUNTIME_CACHING]])('%s: the first runtime route is NetworkOnly for /api/approvals* and /api/account/approval*', (_name, routes) => {
    const [first] = routes
    expect(first, 'a first runtime route').toBeTruthy()
    expect(first.handler).toBe('NetworkOnly')
    for (const url of [
      'https://api.openvolley.app/api/approvals?external_id=match_1_x',
      'https://api.openvolley.app/api/approvals/abc',
      'https://api.openvolley.app/api/account/approvals',
      'https://api.openvolley.app/api/account/approval-pin'
    ]) {
      expect(first.urlPattern.exec(url)?.index, url).toBe(0)
    }
    // every other API answer too (SEC-20: it was cached by URL for the next account)
    expect(first.urlPattern.test('https://api.openvolley.app/api/db')).toBe(true)
    expect(first.urlPattern.test('https://api.openvolley.app/api/me')).toBe(true)
  })

  it('vite.config.js takes its routes from the shared list', () => {
    expect(config).toMatch(/runtimeCaching: MAIN_RUNTIME_CACHING\b/)
  })
})
