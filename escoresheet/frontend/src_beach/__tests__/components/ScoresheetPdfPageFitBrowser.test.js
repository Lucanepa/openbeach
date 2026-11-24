// The PDF score sheet's pages in a real browser (2026-11-20): nothing below
// a page's print area, which is all the PDF captures. Page 2 was 19 px too
// tall for every match (the APPROVAL box's captains' post-match signatures
// and the "Winner of Coin Toss" row cut off the PDF); a match with coaches
// lost 34 px of page 1 and 93 px of page 2. jsdom has no layout, so
// scripts/sheet-page-fit.mjs opens the sheet in Chromium (Playwright, the
// Vite dev server) and measures each page; without a Chromium build for
// Playwright it says so and this test is skipped.
// The same run downloads the PDF of some matches and reads it back: each page
// of the sheet at its true size (277 x 190 mm) centred on the A4 page, 10 mm
// all round (2026-11-21: it was stretched over the whole page), and checks
// that long names fit their cells (APPROVAL, TEAMS: smaller, on two lines, at
// worst cut with "…"; they ran past the cell's edge).
import { describe, it, expect, beforeAll } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'
import { PAGE_FIT_TOLERANCE_PX } from '../../../scoresheet_pdf_beach/components_beach/pageFit_beach.ts'

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// The longest values the sheet prints: licences (10 digits, dates) for the
// players and the officials, four line judges, remarks over several lines
function longest() {
  const d = buildVideoMatch()
  d.team_1Players.forEach((p, i) => { p.dob = ['1234567890', '14/03/2008'][i] })
  d.team_2Players.forEach((p, i) => { p.dob = ['2007-05-06', '0042'][i] })
  d.match.officials = [
    { role: '1st referee', firstName: 'Annemarie', lastName: 'Musterfrau-Beispiel', country: 'CHE', dob: '1234567890' },
    { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '1990-03-14' },
    { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'CHE', dob: '0077' },
    { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'ITA', dob: '300402' },
    { role: 'line judge 1', name: 'Lia Linie' },
    { role: 'line judge 2', name: 'Lina Linie' },
    { role: 'line judge 3', name: 'Leo Linie' },
    { role: 'line judge 4', name: 'Luc Linie' }
  ]
  d.match.remarks = 'Rain delay of 12 minutes in set 2; the court was swept and the lines re-taped. ' +
    'Team B asked for the protocol to be checked after set 3; the 1st referee confirmed the score.'
  return d
}

function withCoaches() {
  const d = longest()
  d.match.hasCoach = true
  return d
}

// Made-up names of 30, 40, 50 and 90 characters, "Lastname Firstname" as the sheet prints them
const NAME = {
  30: ['Musterhuber-Beispiel', 'Annemarie'],
  40: ['Beispielmann-Mustergruber', 'Marie-Theresia'],
  50: ['Beispielmann-Mustergruber-Probst', 'Marie-Theresia An'],
  90: ['Beispielmann-Mustergruber-Probst-Vorlagenhofer-Testmannsberger', 'Marie-Theresia Annemarie-Lu']
}
const full = (n) => `${NAME[n][0]} ${NAME[n][1]}`

// The four officials with names of 30, 40, 50 and 90 characters, the line
// judges and the players with 50, with or without a Licence column
function longNames(licence) {
  const d = buildVideoMatch()
  const lic = (v) => (licence ? v : null)
  const official = (role, n, dob) => ({ role, lastName: NAME[n][0], firstName: NAME[n][1], country: 'CHE', dob: lic(dob) })
  d.match.officials = [
    official('1st referee', 30, '1234567890'),
    official('2nd referee', 40, '1990-03-14'),
    official('scorer', 50, '0077'),
    official('assistant scorer', 90, '300402'),
    ...[1, 2, 3, 4].map(i => ({ role: `line judge ${i}`, name: `${NAME[50][1]} ${NAME[50][0]}` }))
  ]
  for (const p of [...d.team_1Players, ...d.team_2Players]) {
    [p.lastName, p.firstName] = NAME[50]
    p.dob = lic('1234567890')
  }
  return d
}

// REMARKS too long for their box even at 6 px: the PDF prints them on pages of text after the sheet
function longRemarks() {
  const d = longest()
  d.match.remarks = Array.from({ length: 120 }, (_, i) => `Remark ${i + 1}: the court was swept and the lines re-taped after a rain delay.`).join(' ')
  return d
}

function measure(variants) {
  return new Promise((done, fail) => {
    const child = execFile(process.execPath, ['scripts/sheet-page-fit.mjs'], { cwd: FRONTEND, maxBuffer: 8 << 20, timeout: 290000 },
      (err, stdout, stderr) => {
        if (err) return fail(new Error(`${err.message}\n${stderr}`))
        done(JSON.parse(stdout.trim().split('\n').pop()))
      })
    child.stdin.end(JSON.stringify(variants))
  })
}

let out
beforeAll(async () => {
  out = await measure([
    { name: 'plain', data: buildVideoMatch() },
    { name: 'longest', data: longest(), pdf: true },
    { name: 'coaches', data: withCoaches(), pdf: true },
    { name: 'long names, Licence', data: longNames(true), pdf: true },
    { name: 'long names', data: longNames(false) },
    { name: 'long remarks', data: longRemarks(), pdf: true }
  ])
  if (out.skipped) console.warn(`[sheet page fit] skipped: ${out.skipped}`)
}, 300000)

const result = (name) => out.results.find(r => r.name === name)

describe('score sheet PDF: every page fits its print area (Chromium)', () => {
  it.each(['plain', 'longest', 'coaches', 'long names, Licence', 'long names', 'long remarks'])('%s: nothing on pages 1 and 2 runs past the page', (name) => {
    if (out.skipped) return
    const { pages, errors } = result(name)
    expect(errors).toEqual([])
    expect(pages.map(p => p.id)).toEqual(['page-1', 'page-2'])
    for (const p of pages) {
      // the content ends inside the page's box, at most the tolerance into its 2 mm padding
      expect(p.contentBottom, `${name} ${p.id}: ${p.lowest}`).toBeLessThanOrEqual(p.pageH - p.paddingBottom + PAGE_FIT_TOLERANCE_PX + 0.5)
    }
  })

  it.each(['plain', 'longest', 'long names, Licence', 'long names'])('%s: a match without coaches prints at full size', (name) => {
    if (out.skipped) return
    expect(result(name).pages.map(p => p.fitScale)).toEqual([1, 1])
  })

  it('a match with coaches is scaled, not cut, and stays legible', () => {
    if (out.skipped) return
    const [page1, page2] = result('coaches').pages
    for (const p of [page1, page2]) {
      expect(p.fitScale).toBeLessThan(1)
      expect(p.fitScale).toBeGreaterThanOrEqual(0.85)
    }
  })
})

describe('score sheet PDF: each page at its true size on A4 (Chromium)', () => {
  it.each(['longest', 'coaches', 'long names, Licence', 'long remarks'])('%s: 277 x 190 mm, 10 mm from every edge, in its own proportions', (name) => {
    if (out.skipped) return
    const { pdf, errors } = result(name)
    expect(errors).toEqual([])
    const sheetPages = pdf.filter(p => p.images.length > 0)
    expect(sheetPages).toHaveLength(2)
    for (const p of pdf) {
      // A4 landscape
      expect(p.widthMm).toBeCloseTo(297, 1)
      expect(p.heightMm).toBeCloseTo(210, 1)
    }
    for (const p of sheetPages) {
      expect(p.images).toHaveLength(1)
      const [img] = p.images
      expect(img.x).toBeCloseTo(10, 2)
      expect(img.y).toBeCloseTo(10, 2)
      expect(img.w).toBeCloseTo(277, 2)
      expect(img.h).toBeCloseTo(190, 2)
      // the capture is not stretched: its pixels have the proportions it is placed in (within a pixel's rounding)
      expect(Math.abs((img.pxW / img.pxH) / (img.w / img.h) - 1)).toBeLessThan(0.001)
      // sharp enough to print: about 190 dpi
      expect(img.pxW / (img.w / 25.4)).toBeGreaterThan(150)
    }
  })

  it('REMARKS too long for the sheet: the pages of text after it carry no picture', () => {
    if (out.skipped) return
    const { pdf } = result('long remarks')
    expect(pdf.length).toBeGreaterThan(2)
    expect(pdf.slice(2).every(p => p.images.length === 0)).toBe(true)
  })
})

describe('score sheet PDF: long names fit their cells (Chromium)', () => {
  const names = (name) => result(name).names
  const byLabel = (name, label) => names(name).find(n => n.label === label)

  it.each(['longest', 'long names, Licence', 'long names'])('%s: every name inside its cell, nothing past its box', (name) => {
    if (out.skipped) return
    const list = names(name)
    // four officials, four line judges, four players
    expect(list.length).toBe(12)
    for (const n of list) {
      expect(n.inCell, `${name} ${n.label}`).toBe(true)
      expect(n.scrollWidth, `${name} ${n.label}`).toBeLessThanOrEqual(n.clientWidth + 1)
      expect(n.scrollHeight, `${name} ${n.label}`).toBeLessThanOrEqual(n.clientHeight + 1)
      // legible: not under 75 % of the cell's size
      expect(n.scale).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('names that fit stay at full size on one line', () => {
    if (out.skipped) return
    for (const n of names('longest')) {
      expect(n.scale, n.label).toBe(1)
      expect(n.lines, n.label).toBe(1)
    }
  })

  it.each(['long names, Licence', 'long names'])('%s: names of 30, 40 and 50 characters are printed whole', (name) => {
    if (out.skipped) return
    for (const [label, n] of [['1st Referee name', 30], ['2nd Referee name', 40], ['Scorer name', 50], ['Line judge 1 name', 50], ['Team 1 player 1 name', 50]]) {
      const cell = byLabel(name, label)
      expect(cell.clipped, label).toBe(false)
      expect(cell.shown.replace(/\s+/g, ' ').trim(), label).toBe(label.startsWith('Line') ? `${NAME[50][1]} ${NAME[50][0]}` : full(n))
    }
    // the narrower Name column (Licence) needs at least as small a size
    if (name === 'long names, Licence') {
      expect(byLabel(name, 'Scorer name').scale).toBeLessThan(1)
      expect(byLabel(name, 'Scorer name').lines).toBe(2)
    }
  })

  it('a 90-character name beside a licence is cut at the end of its second line with "…"', () => {
    if (out.skipped) return
    const cell = byLabel('long names, Licence', 'Asst. Scorer name')
    expect(cell.clipped).toBe(true)
    expect(cell.lines).toBe(2)
    expect(cell.scale).toBe(0.75)
    expect(cell.shown.endsWith('\u2026')).toBe(true)
    expect(full(90).startsWith(cell.shown.slice(0, -1).trimEnd())).toBe(true)
    // the whole name stays the field's value (shown while it has the focus, and as its tooltip)
    expect(cell.text).toBe(full(90))
  })

  it('without the Licence column the 90-character name has a wider cell: whole on two lines, or cut with "…"', () => {
    if (out.skipped) return
    const cell = byLabel('long names', 'Asst. Scorer name')
    expect(cell.lines).toBe(2)
    if (cell.clipped) expect(cell.shown.endsWith('\u2026')).toBe(true)
    else expect(cell.shown.replace(/\s+/g, ' ').trim()).toBe(full(90))
  })
})
