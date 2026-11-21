/**
 * The PDF score sheet's pages measured in a real browser (Chromium through
 * Playwright, the dev server through Vite's API): jsdom has no layout, and
 * the PDF captures each page's box and nothing below it, so content taller
 * than the page was cut off the PDF without a word (page 2, 19 px,
 * 2026-11-20).
 *
 * Reads a JSON list of { name, data, pdf? } on stdin (data: what the match
 * end page puts in sessionStorage 'scoresheetData'), opens
 * scoresheet_beach.html with each, and prints one JSON line: { results: [{
 * name, pages: [{ id, pageH, paddingBottom, contentBottom, lowest, fitScale
 * }], names: [...], pdf? }] } with heights in the page's own px (the
 * preview's zoom taken out). `names`: every fitted name field on pages 1 and
 * 2 (nameFit_beach), its text box against its cell. With `pdf`, the PDF the
 * Download button saves, read back: each page's size and the pictures on it
 * (pixels, placement in mm from the top left). Without a Chromium build it
 * prints { skipped: reason }.
 *
 * Used by src_beach/__tests__/components/ScoresheetPdfPageFitBrowser.test.js;
 * by hand: node scripts/sheet-page-fit.mjs < variants.json
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
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

const MM_PER_PT = 25.4 / 72

/** Each page of a jsPDF file: its size and the pictures drawn on it ("w 0 0 h x y cm /I Do"), in mm from the top left. */
async function readPdf(file) {
  const { PDFDocument, PDFName, PDFArray } = await import('pdf-lib')
  const doc = await PDFDocument.load(readFileSync(file))
  return doc.getPages().map((page) => {
    const { width, height } = page.getSize()
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents]
    const ops = streams.map((st) => {
      const raw = Buffer.from(st.getContents())
      return (st.dict.get(PDFName.of('Filter')) ? inflateSync(raw) : raw).toString('latin1')
    }).join('\n')
    const xobjects = page.node.Resources()?.get(PDFName.of('XObject'))
    const xdict = xobjects ? doc.context.lookup(xobjects) : null
    const images = []
    for (const m of ops.matchAll(/([-\d.]+)\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm\s*\/(\S+)\s+Do/g)) {
      const [w, h, x, y] = m.slice(1, 5).map(Number)
      const ref = xdict?.get(PDFName.of(m[5]))
      const xo = ref ? doc.context.lookup(ref) : null
      images.push({
        pxW: xo?.dict.get(PDFName.of('Width'))?.asNumber(),
        pxH: xo?.dict.get(PDFName.of('Height'))?.asNumber(),
        x: x * MM_PER_PT,
        y: (height - y - h) * MM_PER_PT,
        w: w * MM_PER_PT,
        h: h * MM_PER_PT
      })
    }
    return { widthMm: width * MM_PER_PT, heightMm: height * MM_PER_PT, images }
  })
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
  for (const { name, data, pdf } of variants) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: !!pdf })
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
    // every fitted name: its text inside its text box, the box inside its cell
    const names = await page.evaluate(() => [...document.querySelectorAll('#page-1 textarea[data-name-fit], #page-2 textarea[data-name-fit]')].map((el) => {
      const cell = el.parentElement
      const r = el.getBoundingClientRect()
      const c = cell.getBoundingClientRect()
      const cs = getComputedStyle(cell)
      // the cell's padding box (inside its borders), on screen
      const box = {
        left: c.left + parseFloat(cs.borderLeftWidth),
        top: c.top + parseFloat(cs.borderTopWidth),
        right: c.right - parseFloat(cs.borderRightWidth),
        bottom: c.bottom - parseFloat(cs.borderBottomWidth)
      }
      return {
        cell: Object.entries(cell.dataset).map(([k, v]) => `${k}=${v}`).join(' '),
        label: el.getAttribute('aria-label'),
        text: el.title || el.value,
        shown: el.value,
        scale: Number(el.dataset.nameFit),
        lines: Number(el.dataset.nameLines),
        clipped: el.dataset.nameClipped === 'true',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        inCell: r.left >= box.left - 0.5 && r.top >= box.top - 0.5 && r.right <= box.right + 0.5 && r.bottom <= box.bottom + 0.5
      }
    }))
    let pdfPages
    if (pdf) {
      const download = page.waitForEvent('download', { timeout: 120000 })
      await page.getByRole('button', { name: /Download PDF/i }).first().click()
      const file = join(cacheDir, `${name}.pdf`)
      await (await download).saveAs(file)
      pdfPages = await readPdf(file)
    }
    results.push({ name, pages, names, errors, ...(pdf ? { pdf: pdfPages } : {}) })
    await context.close()
  }
  print({ results })
} finally {
  await browser?.close()
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
