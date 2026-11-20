// The PDF score sheet's pages in a real browser (2026-11-20): nothing below
// a page's print area, which is all the PDF captures. Page 2 was 19 px too
// tall for every match (the APPROVAL box's captains' post-match signatures
// and the "Winner of Coin Toss" row cut off the PDF); a match with coaches
// lost 34 px of page 1 and 93 px of page 2. jsdom has no layout, so
// scripts/sheet-page-fit.mjs opens the sheet in Chromium (Playwright, the
// Vite dev server) and measures each page; without a Chromium build for
// Playwright it says so and this test is skipped.
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

function measure(variants) {
  return new Promise((done, fail) => {
    const child = execFile(process.execPath, ['scripts/sheet-page-fit.mjs'], { cwd: FRONTEND, maxBuffer: 8 << 20, timeout: 170000 },
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
    { name: 'longest', data: longest() },
    { name: 'coaches', data: withCoaches() }
  ])
  if (out.skipped) console.warn(`[sheet page fit] skipped: ${out.skipped}`)
}, 180000)

const result = (name) => out.results.find(r => r.name === name)

describe('score sheet PDF: every page fits its print area (Chromium)', () => {
  it.each(['plain', 'longest', 'coaches'])('%s: nothing on pages 1 and 2 runs past the page', (name) => {
    if (out.skipped) return
    const { pages, errors } = result(name)
    expect(errors).toEqual([])
    expect(pages.map(p => p.id)).toEqual(['page-1', 'page-2'])
    for (const p of pages) {
      // the content ends inside the page's box, at most the tolerance into its 2 mm padding
      expect(p.contentBottom, `${name} ${p.id}: ${p.lowest}`).toBeLessThanOrEqual(p.pageH - p.paddingBottom + PAGE_FIT_TOLERANCE_PX + 0.5)
    }
  })

  it.each(['plain', 'longest'])('%s: a match without coaches prints at full size', (name) => {
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
