// The PDF score sheet's TEAMS box (owner 19.11.2026): the value beside each
// player's name is the licence, or a date of birth printed dd.mm.yyyy, under
// the heading "Licence". A match without any value keeps the FIVB layout.
// The APPROVAL box (owner 20.11.2026) prints the officials' licences the same
// way: they were stored but the box had no column for them.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

let Sheet
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
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
