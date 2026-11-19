// The PDF score sheet's TEAMS box (owner 19.11.2026): the value beside each
// player's name is the licence, or a date of birth printed dd.mm.yyyy, under
// the heading "Licence". A match without any value keeps the FIVB layout.
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
