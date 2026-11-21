// The PDF score sheet's TEAMS box (owner 19.11.2026): the value beside each
// player's name is the licence, or a date of birth printed dd.mm.yyyy, under
// the heading "Licence". A match without any value keeps the FIVB layout.
// The APPROVAL box (owner 20.11.2026) prints the officials' licences the same
// way: they were stored but the box had no column for them.
// Long names (owner 21.11.2026): with the Licence column a name of 30 and more
// characters was cut off at the edge of APPROVAL's Name column (and a player's
// of 26 in TEAMS). A name now fits its cell: smaller, on two lines, at worst
// cut with "…" (nameFit_beach). jsdom has no layout: the fitting is checked
// on a modelled text box here and in Chromium in ScoresheetPdfPageFitBrowser.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

let Sheet, nameFit
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
  nameFit = await import('../../../scoresheet_pdf_beach/components_beach/nameFit_beach.ts')
})

function sheet(matchData) {
  let fields = null
  const view = render(<Sheet matchData={matchData} onDataReady={(f) => { fields = f }} />)
  if (!fields) throw new Error('the sheet never reported its fields')
  return { fields, container: view.container }
}

function withValues(t1, t2) {
  const data = buildVideoMatch()
  data.team_1Players.forEach((p, i) => { p.dob = t1[i] })
  data.team_2Players.forEach((p, i) => { p.dob = t2[i] })
  return data
}

describe('score sheet PDF: the Licence column', () => {
  it('prints licences verbatim and dates as dd.mm.yyyy, under "Licence"', async () => {
    const { fields, container } = sheet(withValues(['123456', '14/03/2008'], ['2007-05-06', '0042']))
    expect(fields.b_t1_p1_lic).toBe('123456')
    expect(fields.b_t1_p2_lic).toBe('14.03.2008')
    expect(fields.b_t2_p1_lic).toBe('06.05.2007')
    expect(fields.b_t2_p2_lic).toBe('0042')
    // the field shows next to the name (rendered after the data is set)
    await new Promise(r => setTimeout(r, 0))
    const heads = [...container.querySelectorAll('[data-teams-licence-head]')]
    expect(heads.map(h => h.textContent)).toEqual(['Licence', 'Licence'])
    const values = [...container.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('123456')
    expect(values).toContain('14.03.2008')
    expect(container.textContent).not.toMatch(/DoB|Date of birth/i)
    cleanup()
  })

  it('the 01.01.1900 placeholder prints nothing; a match without values has no Licence column', async () => {
    const { fields, container } = sheet(withValues(['01.01.1900', ''], [null, undefined]))
    expect(fields.b_t1_p1_lic).toBeUndefined()
    expect(fields.teams_licence_col).toBeUndefined()
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-teams-licence-head]')).toBeNull()
    cleanup()
  })
})

function withOfficials(officials) {
  const data = buildVideoMatch()
  data.match.officials = officials
  return data
}

const OFFICIALS = [
  { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
  { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '2001-02-03' },
  { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'CHE', dob: '0077' },
  { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'ITA', dob: null },
  { role: 'line judge 1', name: 'Lia Linie' },
  { role: 'line judge 2', name: 'Lina Linie' }
]

describe('score sheet PDF: the officials\' licences in APPROVAL', () => {
  it('prints each official\'s licence verbatim and a date as dd.mm.yyyy, under "Licence"', async () => {
    const { fields, container } = sheet(withOfficials(OFFICIALS))
    expect(fields.ref1_name).toBe('Referee Rita')
    expect(fields.ref1_lic).toBe('204411')
    expect(fields.ref2_lic).toBe('03.02.2001')
    expect(fields.scorer_lic).toBe('0077')
    expect(fields.asst_scorer_lic).toBeUndefined()
    expect(fields.approval_licence_col).toBe('true')
    // the line judges keep their names (they have no licence field)
    expect(fields.lj1).toBe('Lia Linie')
    expect(fields.lj2).toBe('Lina Linie')
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-approval-licence-head]')?.textContent).toBe('Licence')
    const cell = (k) => container.querySelector(`[data-approval-licence="${k}"] input`)?.value
    expect(cell('ref1')).toBe('204411')
    expect(cell('ref2')).toBe('03.02.2001')
    expect(cell('scorer')).toBe('0077')
    expect(cell('asst_scorer')).toBe('')
    // the column sits between Name and Country; the line judges' rows span it
    const head = [...container.querySelector('[data-approval-licence-head]').parentElement.children].map(td => td.textContent)
    expect(head).toEqual(['Officials', 'Name', 'Licence', 'Country', 'Signature'])
    const table = container.querySelector('[data-approval-licence-head]').closest('table')
    expect(table.querySelectorAll('colgroup col')).toHaveLength(5)
    const rows = [...table.querySelectorAll('tbody tr')]
    const span = (tr) => [...tr.children].reduce((n, td) => n + (Number(td.getAttribute('colspan')) || 1), 0)
    // four officials, two line judge rows (the first has the rowSpan label), the captains' signatures
    expect(rows.map(span)).toEqual([5, 5, 5, 5, 5, 4, 5])
    cleanup()
  })

  it('no official with a value: the APPROVAL box keeps its four columns', async () => {
    const { fields, container } = sheet(withOfficials(OFFICIALS.map(o => ({ ...o, dob: o.dob == null ? o.dob : '01.01.1900' }))))
    expect(fields.ref1_name).toBe('Referee Rita')
    expect(fields.ref1_lic).toBeUndefined()
    expect(fields.approval_licence_col).toBeUndefined()
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-approval-licence-head]')).toBeNull()
    expect(container.querySelector('[data-approval-licence]')).toBeNull()
    const head = [...container.querySelectorAll('thead tr td')].map(td => td.textContent)
    expect(head).toContain('Officials')
    expect(head).not.toContain('Licence')
    cleanup()
  })

  it('officials saved by Manual adjustments (an object) print too, with their licences', async () => {
    const { fields } = sheet(withOfficials({
      ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
      ref2: { firstName: '', lastName: '', country: '', dob: '' },
      scorer: { firstName: 'Sina', lastName: 'Schreiber', dob: '14/03/1990' },
      asstScorer: { firstName: 'Ada', lastName: 'Assist', dob: '' }
    }))
    expect(fields.ref1_name).toBe('Referee Rita')
    expect(fields.ref1_country).toBe('CHE')
    expect(fields.ref1_lic).toBe('204411')
    expect(fields.scorer_name).toBe('Schreiber Sina')
    expect(fields.scorer_lic).toBe('14.03.1990')
    expect(fields.asst_scorer_name).toBe('Assist Ada')
    expect(fields.ref2_lic).toBeUndefined()
    expect(fields.approval_licence_col).toBe('true')
    cleanup()
  })
})

// A name cell's textarea as the browser lays it out: the cell `cellW` x
// `cellH` px, a monospace font `charW` px a character, 4 px padding each
// side; the text wraps after spaces and hyphens (a word longer than a line
// overflows, or breaks anywhere once overflow-wrap is "anywhere").
function nameBox({ cellW, cellH, charW = 4.8 }) {
  const el = document.createElement('textarea')
  const size = (v, base) => (v && v.endsWith('%') ? parseFloat(v) / 100 * base : base)
  const width = () => size(el.style.width, cellW)
  const lineH = () => parseFloat(el.style.lineHeight) || cellH
  const layout = () => {
    const perLine = Math.floor((width() - 8) / charW)
    const anywhere = el.style.overflowWrap === 'anywhere'
    const words = el.value.match(/[^\s-]*-?\s*/g).filter(Boolean)
    let lines = 1, used = 0, widest = 0
    for (const w of words) {
      const len = w.trimEnd().length
      if (used > 0 && used + len > perLine) { lines++; used = 0 }
      if (anywhere && len > perLine) { lines += Math.ceil(len / perLine) - 1; used = len % perLine; widest = perLine; continue }
      used += w.length
      widest = Math.max(widest, Math.min(used, Math.max(len, used - (w.length - len))))
    }
    return { lines, widest }
  }
  Object.defineProperty(el, 'clientWidth', { get: () => Math.round(width()) })
  Object.defineProperty(el, 'clientHeight', { get: () => Math.round(size(el.style.height, cellH)) })
  Object.defineProperty(el, 'scrollWidth', { get: () => Math.round(Math.max(width(), layout().widest * charW + 8)) })
  Object.defineProperty(el, 'scrollHeight', { get: () => Math.round(Math.max(size(el.style.height, cellH), layout().lines * lineH())) })
  return el
}

const N30 = 'Musterhuber-Beispiel Annemarie'
const N40 = 'Beispielmann-Mustergruber Marie-Theresia'
const N50 = 'Beispielmann-Mustergruber-Probst Marie-Theresia An'
const N90 = 'Beispielmann-Mustergruber-Probst-Vorlagenhofer-Testmannsberger Marie-Theresia Annemarie-Lu'

describe('score sheet PDF: long names fit their cell (nameFit_beach)', () => {
  it('the sizes tried: each on one line first, two lines once two fit the row, not below 75 %', () => {
    const steps = nameFit.nameFitSteps(8, 15)
    expect(steps).toEqual([
      { px: 8, lines: 1 }, { px: 7.5, lines: 1 }, { px: 7, lines: 1 },
      { px: 6.5, lines: 1 }, { px: 6.5, lines: 2 }, { px: 6, lines: 1 }, { px: 6, lines: 2 }
    ])
    // two lines of 6.5 px with room for descenders fill the 15 px row, no more
    for (const st of steps.filter(x => x.lines === 2)) expect(2 * st.px * nameFit.NAME_LINE_FACTOR).toBeLessThanOrEqual(15)
    // TEAMS' rows: 9 px, 18 px high; the steps end on 75 % itself
    const teams = nameFit.nameFitSteps(9, 18)
    expect(teams.map(x => x.px)).toEqual([9, 8.5, 8, 7.5, 7.5, 7, 7, 6.75, 6.75])
    expect(teams.at(-1)).toEqual({ px: 6.75, lines: 2 })
  })

  it('"…" after the longest start that fits', () => {
    expect(nameFit.clipWithEllipsis('abcdefghij', c => c.length <= 5)).toBe('abcd\u2026')
    // no space left before "…"
    expect(nameFit.clipWithEllipsis('abc defghij', c => c.length <= 5)).toBe('abc\u2026')
    expect(nameFit.clipWithEllipsis('abc', () => false)).toBe('\u2026')
  })

  // APPROVAL's Name column: 155 px beside a licence, 182 px without; rows 15 px inside
  it.each([
    ['a name that fits stays at full size', 155, N30, { scale: 1, lines: 1 }],
    ['40 characters beside a licence: two lines', 155, N40, { scale: 0.8125, lines: 2 }],
    ['40 characters without the Licence column: one line, a little smaller', 182, N40, { scale: 0.875, lines: 1 }],
    ['50 characters: two lines', 155, N50, { scale: 0.8125, lines: 2 }]
  ])('%s', (_, cellW, text, expected) => {
    const el = nameBox({ cellW, cellH: 15 })
    const fit = nameFit.fitNameBox(el, text, { fontPx: 8 })
    expect(fit).toEqual({ ...expected, clipped: null })
    expect(el.value).toBe(text)
    // the font stays at the cell's size (a browser's minimum font size cannot hold it up): the box is scaled
    expect(el.style.fontSize).toBe('8px')
    expect(el.style.transform).toBe(expected.scale < 1 ? `scale(${expected.scale})` : '')
    expect(parseFloat(el.style.width) * expected.scale).toBeCloseTo(100, 6)
    expect(parseFloat(el.style.height) * expected.scale).toBeCloseTo(100, 6)
    // one line fills the row (centred), two lines share it
    expect(parseFloat(el.style.lineHeight) * expected.scale * expected.lines).toBeCloseTo(15, 6)
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth + 1)
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight + 1)
    expect(el.dataset.nameFit).toBe(String(Math.round(expected.scale * 1000) / 1000))
  })

  it('a name too long even for two lines at 75 %: its start and "…", the whole name while editing', () => {
    const el = nameBox({ cellW: 155, cellH: 15 })
    const fit = nameFit.fitNameBox(el, N90, { fontPx: 8 })
    expect(fit.scale).toBe(0.75)
    expect(fit.lines).toBe(2)
    expect(fit.clipped).toMatch(/\u2026$/)
    expect(N90.startsWith(fit.clipped.slice(0, -1))).toBe(true)
    expect(el.value).toBe(fit.clipped)
    expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight + 1)
    expect(el.dataset.nameClipped).toBe('true')
    // with the focus (clip: false) the whole name, at the smallest size
    const editing = nameFit.fitNameBox(el, N90, { fontPx: 8, clip: false })
    expect(editing).toEqual({ scale: 0.75, lines: 2, clipped: null })
    expect(el.value).toBe(N90)
    expect(el.dataset.nameClipped).toBeUndefined()
  })

  it('no layout (jsdom, a hidden window): left as it is', () => {
    const el = document.createElement('textarea')
    expect(nameFit.fitNameBox(el, N90)).toEqual({ scale: 1, lines: 1, clipped: null })
    expect(el.value).toBe(N90)
    expect(el.style.transform).toBe('')
  })
})

describe('score sheet PDF: the name cells on the sheet', () => {
  const LONG = [
    { role: '1st referee', lastName: 'Beispielmann-Mustergruber', firstName: 'Marie-Theresia', country: 'CHE', dob: '204411' },
    { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '2001-02-03' },
    { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'CHE', dob: '0077' },
    { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'ITA', dob: null },
    { role: 'line judge 1', name: 'Marie-Theresia An Beispielmann-Mustergruber-Probst' },
    { role: 'line judge 2', name: 'Lina Linie' }
  ]

  it('APPROVAL: each official\'s and line judge\'s whole name in a fitted text box, still editable', async () => {
    const { container } = sheet(withOfficials(LONG))
    await new Promise(r => setTimeout(r, 0))
    const box = (k) => container.querySelector(`[data-approval-name="${k}"] textarea[data-name-fit]`)
    expect(box('ref1').value).toBe(N40)
    expect(box('ref2').value).toBe('Zweiter Remo')
    expect(box('asst_scorer').value).toBe('Assist Ada')
    // the cell holds the text box (absolutely positioned: it never grows the row)
    expect(box('ref1').parentElement.className.split(' ')).toContain('relative')
    expect(box('ref1').className.split(' ')).toContain('absolute')
    const lj = (n) => container.querySelector(`[data-approval-lj="${n}"] textarea[data-name-fit]`)
    expect(lj(1).value).toBe('Marie-Theresia An Beispielmann-Mustergruber-Probst')
    expect(lj(2).value).toBe('Lina Linie')
    expect(lj(3).value).toBe('')
    // typed corrections still go in
    fireEvent.change(box('ref2'), { target: { value: 'Zweiter Remo-Luca' } })
    expect(box('ref2').value).toBe('Zweiter Remo-Luca')
    // one line of text: a pasted line break becomes a space
    fireEvent.change(box('ref2'), { target: { value: 'Zweiter\nRemo' } })
    expect(box('ref2').value).toBe('Zweiter Remo')
    cleanup()
  })

  it('TEAMS: the players\' names fit the same way', async () => {
    const data = buildVideoMatch()
    data.team_1Players[0].lastName = 'Beispielmann-Mustergruber-Probst'
    data.team_1Players[0].firstName = 'Marie-Theresia An'
    const { container } = sheet(data)
    await new Promise(r => setTimeout(r, 0))
    const names = [...container.querySelectorAll('[data-teams-player-name] textarea[data-name-fit]')]
    expect(names).toHaveLength(4)
    expect(names[0].value).toBe(N50)
    expect(names.every(n => n.style.fontSize === '9px')).toBe(true)
    cleanup()
  })
})
