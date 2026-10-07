import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { compileScoresheetCss, SCORESHEET_CSS } from '../../../scripts/vite-plugin-scoresheet-tailwind.js'

// OpenBeach runs offline (the Android app, the desktop relay at a hall with no
// internet): no page may load a script, stylesheet or font from a CDN. The PDF
// scoresheet used to load cdn.tailwindcss.com and came out unstyled offline.

const root = resolve(__dirname, '../../..')
const REMOTE = /<(script|link)\b[^>]*\b(src|href)=["']https?:\/\//i

describe('offline pages', () => {
  const pages = readdirSync(root).filter((f) => f.endsWith('.html'))

  it('finds the entry pages', () => {
    expect(pages).toEqual(expect.arrayContaining(['index.html', 'scoresheet_beach.html', 'referee_beach.html']))
  })

  for (const page of ['index.html', 'scoresheet_beach.html', 'referee_beach.html', 'livescore_beach.html', 'scoreboard_beach.html', 'scoresheet_archive_beach.html', 'admin_beach.html']) {
    it(`${page} loads nothing from the network`, () => {
      const html = readFileSync(resolve(root, page), 'utf8')
      expect(html).not.toMatch(REMOTE)
      expect(html).not.toMatch(/importmap/)
    })
  }

  it('the subdomain build writes no CDN tag either', () => {
    expect(readFileSync(resolve(root, 'scripts/build-subdomains.js'), 'utf8')).not.toMatch(/cdn\.tailwindcss\.com"/)
  })

  it('the scoresheet entry imports its compiled Tailwind', () => {
    expect(readFileSync(resolve(root, 'scoresheet_pdf_beach/index.tsx'), 'utf8')).toMatch(/import '\.\/scoresheet_beach\.css'/)
  })
})

describe('the scoresheet Tailwind (v3, as the CDN was)', () => {
  it('compiles the sheet classes, v3 order kept', async () => {
    const css = await compileScoresheetCss(readFileSync(resolve(root, SCORESHEET_CSS), 'utf8'), { root, from: resolve(root, SCORESHEET_CSS) })
    expect(css).not.toMatch(/@tailwind/)
    // preflight, as the CDN gave it
    expect(css).toMatch(/border-color: #e5e7eb/)
    // classes from the sheet and from the page's <body>
    for (const cls of ['.border-black', '.text-\\[10px\\]', '.bg-gray-100', '.font-mono', '.divide-black']) {
      expect(css).toContain(cls)
    }
    // the sheet's inputs carry `text-center ... text-left`: v3 centres them
    // (text-center comes later), v4 would left-align them
    expect(css.indexOf('.text-center')).toBeGreaterThan(css.indexOf('.text-left'))
  }, 30000)
})
