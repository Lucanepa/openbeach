import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { subdomains } from '../../../scripts/subdomain-pages.js'

// Every subdomain build wrote the main app's manifest ("OpenBeach
// eScoresheet", short name "OpenBeach"): vite.config.js's VitePWA ran next to
// the subdomain's own one and won. An installed referee or livescore app had
// the scoresheet's name on the home screen.

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('subdomain app names', () => {
  it('each app has its own OpenBeach name and a short name a launcher can show', () => {
    const names = Object.values(subdomains).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    expect(subdomains['beach-referee'].name).toBe('OpenBeach Referee')
    expect(subdomains['beach-livescore'].name).toBe('OpenBeach Livescore')
    for (const [key, c] of Object.entries(subdomains)) {
      expect(c.name, key).toMatch(/^OpenBeach /)
      expect(c.shortName.length, key).toBeLessThanOrEqual(12)
      expect(c.title, key).toMatch(/OpenBeach/)
    }
    const shorts = Object.values(subdomains).map((c) => c.shortName)
    expect(new Set(shorts).size).toBe(shorts.length)
  })

  it('the subdomain build switches the main config\'s PWA off (its manifest won before)', () => {
    const script = readFileSync(resolve(frontendDir, 'scripts/build-subdomains.js'), 'utf8')
    const config = readFileSync(resolve(frontendDir, 'vite.config.js'), 'utf8')
    expect(script).toMatch(/process\.env\.OB_SUBDOMAIN_BUILD = 'true'/)
    expect(config).toMatch(/disable: isCapacitor \|\| isSubdomainBuild/)
  })
})
