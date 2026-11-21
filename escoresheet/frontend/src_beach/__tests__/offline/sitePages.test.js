import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_PAGES, subdomains, hostFor, builtPageNames, missingFromBuild } from '../../../scripts/subdomain-pages.js'
import { cloudRoleUrl } from '../../components_beach/connect/tabletLinks_beach.js'

// beach.openvolley.app (the beachapp build, scripts/build-subdomains.js) had
// only its index.html: /scoresheet_beach.html, /referee_beach.html,
// /livescore_beach.html and /scoresheet_archive_beach.html answered 404 with
// the scoretable, so the match-end PDF window never made a PDF on the website
// (21.11.2026). The desktop and Android builds (vite.config.js) had them.

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SITE_PAGES = ['scoresheet_beach.html', 'referee_beach.html', 'livescore_beach.html', 'scoresheet_archive_beach.html']

describe('beach.openvolley.app pages', () => {
  it('the beachapp build has the sheet, referee, livescore and archive pages', () => {
    expect(builtPageNames(subdomains.beachapp)).toEqual(expect.arrayContaining(['index.html', ...SITE_PAGES]))
  })

  it('and every other page the scoretable opens on its own origin', () => {
    // Open scoreboard (/scoreboard_beach.html?mode=local), the login's
    // competitions admin link (/admin_beach.html)
    expect(builtPageNames(subdomains.beachapp)).toEqual(expect.arrayContaining(['scoreboard_beach.html', 'admin_beach.html']))
  })

  it('each page is an HTML file of the frontend', () => {
    for (const page of Object.values(APP_PAGES)) {
      expect(existsSync(resolve(frontendDir, page)), page).toBe(true)
    }
  })

  it('the main build (desktop, Android) builds the same pages, under the same input names', () => {
    const config = readFileSync(resolve(frontendDir, 'vite.config.js'), 'utf8')
    expect(config).toMatch(/import \{ APP_PAGES \} from '\.\/scripts\/subdomain-pages\.js'/)
    expect(config).toMatch(/input: \{\s*main: '\.\/index\.html',\s*\.\.\.APP_PAGES,?\s*\}/)
  })

  it('the subdomain build puts a config\'s pages into its input and checks its output', () => {
    const script = readFileSync(resolve(frontendDir, 'scripts/build-subdomains.js'), 'utf8')
    expect(script).toMatch(/input: config\.pages\s*\?\s*\{ main: tempIndexPath, \.\.\./)
    expect(script).toMatch(/const missing = missingFromBuild\(outDir, config, \{ pwa: !disablePWA \}\)/)
    expect(script).toMatch(/if \(missing\.length\) \{\s*throw new Error/)
  })
})

describe('missingFromBuild (the build fails on any)', () => {
  let dir
  const all = () => builtPageNames(subdomains.beachapp)
  const write = (name, text = '<!doctype html>') => {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  const sw = (pages) => write('sw.js', `define(["./workbox-1"],function(e){e.precacheAndRoute([${pages.map((p) => `{url:"${p}",revision:"r"}`).join(',')}],{})})`)

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ob-site-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('passes a complete build', () => {
    for (const p of all()) write(p)
    sw(all())
    expect(missingFromBuild(dir, subdomains.beachapp)).toEqual([])
  })

  it('names each page the output lacks (the site before the fix)', () => {
    write('index.html')
    sw(['index.html'])
    const missing = missingFromBuild(dir, subdomains.beachapp)
    for (const p of SITE_PAGES) expect(missing).toContain(p)
    expect(missing).not.toContain('index.html')
  })

  it('names a page the service worker does not precache, and a missing sw.js', () => {
    for (const p of all()) write(p)
    sw(all().filter((p) => p !== 'scoresheet_beach.html'))
    expect(missingFromBuild(dir, subdomains.beachapp)).toEqual(['scoresheet_beach.html (not precached in sw.js)'])
    rmSync(join(dir, 'sw.js'))
    expect(missingFromBuild(dir, subdomains.beachapp)).toEqual(['sw.js'])
    // DISABLE_PWA=true builds have no worker to check
    expect(missingFromBuild(dir, subdomains.beachapp, { pwa: false })).toEqual([])
  })

  it('a single-page site needs only its index.html', () => {
    write('index.html')
    sw(['index.html'])
    expect(missingFromBuild(dir, subdomains['beach-referee'])).toEqual([])
  })
})

describe('the cloud tablet links open the sites that exist', () => {
  // The links named beach-referee / beach-livescore.openvolley.app (the build
  // keys), which have no DNS record; the sites are referee-beach and
  // livescore-beach
  it('referee and livescore on their own sites, the scoretable on beach.openvolley.app', () => {
    expect(cloudRoleUrl('referee', 'm1')).toBe(`https://${hostFor('beach-referee')}/?match=m1`)
    expect(cloudRoleUrl('livescore', null)).toBe(`https://${hostFor('beach-livescore')}/`)
    expect(cloudRoleUrl('main', null)).toBe(`https://${hostFor('beachapp')}/`)
    expect(hostFor('beach-referee')).toBe('referee-beach.openvolley.app')
    expect(hostFor('beach-livescore')).toBe('livescore-beach.openvolley.app')
  })
})
