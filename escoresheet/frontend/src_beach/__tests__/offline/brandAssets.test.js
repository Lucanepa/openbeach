// The OpenBeach logo B2 files (rendered from brand/ by
// scripts/make-brand-assets.py) and every place that links to them.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { PWA_ICONS, PWA_INCLUDE_ASSETS, THEME_COLOR } from '../../../pwa-icons.js'
import { subdomains, htmlFor } from '../../../scripts/subdomain-pages.js'

const frontendDir = resolve(__dirname, '../../..')
const pub = (p) => resolve(frontendDir, 'public_beach', p)
const res = (p) => resolve(frontendDir, 'android/app/src/main/res', p)

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path) {
  const b = readFileSync(path)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

const HEAD_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="32x32" />',
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'
]

const PAGES = ['index.html', 'referee_beach.html', 'livescore_beach.html', 'scoresheet_beach.html',
  'scoresheet_archive_beach.html', 'scoreboard_beach.html', 'admin_beach.html', 'clear-db_beach.html']

describe('OpenBeach logo B2', () => {
  it('every page head links the favicon (ico + svg) and the apple-touch icon, theme colour from pwa-icons.js', () => {
    for (const page of PAGES) {
      const html = readFileSync(resolve(frontendDir, page), 'utf8')
      for (const link of HEAD_LINKS) expect(html, page).toContain(link)
      expect(html, page).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`)
    }
    for (const name of Object.keys(subdomains)) {
      const html = htmlFor(subdomains[name])
      for (const link of HEAD_LINKS) expect(html, name).toContain(link)
      expect(html, name).toContain(`content="${THEME_COLOR}"`)
    }
  })

  it('the linked files exist, at their sizes', () => {
    expect(existsSync(pub('favicon.ico'))).toBe(true)
    expect(readFileSync(pub('favicon.svg'), 'utf8')).toMatch(/^<svg [^>]*viewBox="0 0 512 512"/)
    expect(pngSize(pub('apple-touch-icon.png'))).toEqual([180, 180])
    for (const icon of PWA_ICONS) {
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(pub(icon.src)), icon.src).toEqual([w, h])
    }
    for (const asset of PWA_INCLUDE_ASSETS.filter((a) => !a.includes('*'))) {
      expect(existsSync(pub(asset)), asset).toBe(true)
    }
    expect(PWA_ICONS.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable', 'maskable'])
  })

  it('public_beach/favicon.svg is brand/favicon.svg (the generator copies it)', () => {
    expect(readFileSync(pub('favicon.svg'), 'utf8')).toBe(readFileSync(resolve(frontendDir, 'brand/favicon.svg'), 'utf8'))
  })

  it('the sunglasses-ball rasters and the stale static manifest are gone, and nothing links them', () => {
    const old = ['openbeach_no_bg.png', 'pwa-192.png', 'pwa-512.png', 'favicon_beach.png', 'manifest.webmanifest']
    for (const f of old) expect(existsSync(pub(f)), f).toBe(false)
    expect(existsSync(resolve(frontendDir, 'favicon_beach.png'))).toBe(false)
    const sources = readdirSync(resolve(frontendDir, 'src_beach'), { recursive: true })
      .filter((f) => /\.(jsx?|tsx?)$/.test(f) && !f.includes('__tests__'))
      .map((f) => resolve(frontendDir, 'src_beach', f))
    for (const f of [...sources, ...PAGES.map((p) => resolve(frontendDir, p)), resolve(frontendDir, 'scripts/build-subdomains.js'), resolve(frontendDir, 'vite.config.js')]) {
      const text = readFileSync(f, 'utf8')
      for (const name of old.slice(0, 4)) expect(text, `${f} links ${name}`).not.toContain(name)
    }
  })

  it('the Android adaptive icon: dune background, a monochrome layer (themed icons) at every density', () => {
    for (const xml of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const text = readFileSync(res(`mipmap-anydpi-v26/${xml}`), 'utf8')
      expect(text).toContain('<background android:drawable="@color/ic_launcher_background"/>')
      expect(text).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>')
    }
    expect(readFileSync(res('values/ic_launcher_background.xml'), 'utf8')).toContain('#EFD8AE')
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
    for (const [d, f] of Object.entries(densities)) {
      for (const layer of ['ic_launcher_foreground', 'ic_launcher_monochrome']) {
        expect(pngSize(res(`mipmap-${d}/${layer}.png`)), `${d} ${layer}`).toEqual([108 * f, 108 * f])
      }
      for (const legacy of ['ic_launcher', 'ic_launcher_round']) {
        expect(pngSize(res(`mipmap-${d}/${legacy}.png`)), `${d} ${legacy}`).toEqual([48 * f, 48 * f])
      }
    }
  })

  it('the store icon is 512 px', () => {
    expect(pngSize(resolve(frontendDir, '../../fastlane/metadata/android/en-US/images/icon.png'))).toEqual([512, 512])
  })
})
