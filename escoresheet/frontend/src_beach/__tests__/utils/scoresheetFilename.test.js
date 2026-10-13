import { describe, it, expect } from 'vitest'
import { beachScoresheetFilename, filenamePart } from '../../utils_beach/scoresheetFilename_beach'

const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

describe('beach scoresheet file name (owner 2026-10-13: game<n>_<league>_<YYYY-MM-DD>)', () => {
  it('game<n>_<league>_<day>.pdf, the league left out when there is none', () => {
    const match = { game_n: 7, league: 'Coop Beachtour', scheduledAt: local(2026, 10, 11, 9) }
    expect(beachScoresheetFilename({ match })).toBe('game7_Coop-Beachtour_2026-10-11.pdf')
    expect(beachScoresheetFilename({ match: { ...match, league: '' } })).toBe('game7_2026-10-11.pdf')
  })

  it('no game number: the teams in its place; no date: today', () => {
    const name = beachScoresheetFilename({ match: { league: 'Zürich Open' }, team1Team: { name: 'Müller / Weber' }, team2Team: { name: 'Schmidt / Fischer' } }, new Date(2026, 9, 13, 12))
    expect(name).toBe('Mueller-Weber_vs_Schmidt-Fischer_Zuerich-Open_2026-10-13.pdf')
    expect(name.slice(0, -4)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('the local day of the start, not the UTC one', () => {
    expect(beachScoresheetFilename({ match: { game_n: 3, scheduledAt: local(2026, 10, 12, 0, 30) } })).toBe('game3_2026-10-12.pdf')
  })

  it('every part sanitised', () => {
    expect(filenamePart('../a/b:c.d', 60)).toBe('a-b-c-d')
    expect(filenamePart('---')).toBe('')
  })
})
