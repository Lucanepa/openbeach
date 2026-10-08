// The account approvals (MatchEnd_beach) read the server's list on mount and
// re-check it before "Confirm and approve". The service worker's catch-all
// NetworkFirst route answers from its cache after 3 s: a stale list would
// bring back an approval undone or voided since. The approval endpoints go
// to the network only (the first runtime route, so it wins).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const config = readFileSync(resolve(__dirname, '../../../vite.config.js'), 'utf8')

describe('service worker: no cached approvals', () => {
  it('the first runtime route is NetworkOnly for /api/approvals* and /api/account/approval*', () => {
    const routes = config.slice(config.indexOf('runtimeCaching: ['))
    const first = routes.match(/urlPattern: (\/.*\/[a-z]*),\s*handler: '(\w+)'/)
    expect(first, 'a first runtime route').not.toBeNull()
    expect(first[2]).toBe('NetworkOnly')
    const re = new Function(`return ${first[1]}`)()
    for (const url of [
      'https://api.openvolley.app/api/approvals?external_id=match_1_x',
      'https://api.openvolley.app/api/approvals/abc',
      'https://api.openvolley.app/api/account/approvals',
      'https://api.openvolley.app/api/account/approval-pin'
    ]) {
      expect(re.test(url), url).toBe(true)
    }
    expect(re.test('https://api.openvolley.app/api/db')).toBe(false)
    expect(re.test('https://api.openvolley.app/api/me')).toBe(false)
  })
})
