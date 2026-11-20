/**
 * The PDF score sheet's pages measured in a real browser (Chromium through
 * Playwright, the dev server through Vite's API): jsdom has no layout, and
 * the PDF captures each page's box and nothing below it, so content taller
 * than the page was cut off the PDF without a word (page 2, 19 px,
 * 2026-11-20).
 *
 * Reads a JSON list of { name, data } on stdin (data: what the match end page
 * puts in sessionStorage 'scoresheetData'), opens scoresheet_beach.html with
 * each, and prints one JSON line: { results: [{ name, pages: [{ id, pageH,
 * paddingBottom, contentBottom, lowest, fitScale }] }] } with heights in the
 * page's own px (the preview's zoom taken out). Without a Chromium build it
 * prints { skipped: reason }.
 *
 * Used by src_beach/__tests__/components/ScoresheetPdfPageFitBrowser.test.js;
 * by hand: node scripts/sheet-page-fit.mjs < variants.json
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const print = (o) => process.stdout.write(JSON.stringify(o) + '\n')

const readStdin = async () => {
  let s = ''
  for await (const chunk of process.stdin) s += chunk
  return JSON.parse(s || '[]')
}

const { chromium } = await import('playwright')
if (!existsSync(chromium.executablePath())) {
  print({ skipped: `no Chromium for Playwright (${chromium.executablePath()}): npx playwright install chromium` })
  process.exit(0)
}

const variants = await readStdin()
const { createServer } = await import('vite')
// its own dependency cache: a dev server already running here keeps its own
const cacheDir = mkdtempSync(join(tmpdir(), 'ob-sheet-fit-'))
const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.js'),
  cacheDir,
  logLevel: 'error',
  clearScreen: false,
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, open: false }
})
let browser
try {
  await server.listen()
  const { port } = server.httpServer.address()
  browser = await chromium.launch()
  const results = []
  for (const { name, data } of variants) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    await context.addInitScript((json) => { sessionStorage.setItem('scoresheetData', json) }, JSON.stringify(data))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://127.0.0.1:${port}/scoresheet_beach.html`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForSelector('#page-2 [data-page-fit]', { timeout: 120000 })
    await page.evaluate(() => document.fonts.ready)
    // the window's first fit-to-window and the sheet's own layout effects
    await page.waitForTimeout(800)
    const pages = await page.evaluate(() => ['page-1', 'page-2'].map((id) => {
      const p = document.getElementById(id)
      const pr = p.getBoundingClientRect()
      const zoom = pr.width / p.offsetWidth
      let bottom = 0
      let lowest = ''
      for (const el of p.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const b = (r.bottom - pr.top) / zoom
        if (b > bottom) { bottom = b; lowest = `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/).slice(0, 4).join('.')}` }
      }
      const fit = p.querySelector('[data-page-fit]')
      return {
        id,
        pageH: p.offsetHeight,
        paddingBottom: parseFloat(getComputedStyle(p).paddingBottom),
        contentBottom: Math.round(bottom * 10) / 10,
        lowest,
        fitScale: fit?.dataset.fitScale ? Number(fit.dataset.fitScale) : 1
      }
    }))
    results.push({ name, pages, errors })
    await context.close()
  }
  print({ results })
} finally {
  await browser?.close()
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
