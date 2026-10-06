import { describe, it, expect } from 'vitest'
import {
  normalizeName, beachNameKey, pairKeyFromName, pairKeyFromPlayers, teamKeys, isoToBeachDob, teamCountry,
  savedTeamToBeachRoster, rosterHasNames, teamMatchesName, findBeachTeamSuggestions, zurichYear
} from '../../utils_beach/savedTeams_beach'
import { beachBundle, COOP_ID, MUELLER_WEBER_ID, ROSSI_ID } from '../fixtures/beachBundle'

// Cache rows as db_beach/savedTeams_beach.js builds them (bundleToRows),
// built here without Dexie so this file stays pure.
function rowsOf(bundle) {
  const comps = new Map(bundle.competitions.map(c => [c.id, { id: c.id, name: c.name, season: c.season, gender: c.gender, archived: c.archived, sport: c.sport }]))
  return bundle.teams.map(t => ({
    id: t.id, competitionId: t.competition_id, competition: comps.get(t.competition_id), name: t.name,
    ...teamKeys(t), players: t.players, staff: t.staff, updatedAt: t.updated_at
  }))
}

const team = (id) => beachBundle().teams.find(t => t.id === id)

describe('name keys', () => {
  it('normalizeName collapses whitespace, case and Unicode forms', () => {
    expect(normalizeName('  Müller   WEBER ')).toBe('müller weber')
    expect(normalizeName('Müller')).toBe('müller')
    expect(normalizeName(null)).toBe('')
  })

  it('beachNameKey drops a trailing (country) and the spaces around /', () => {
    expect(beachNameKey('Müller / Weber (CHE)')).toBe('müller/weber')
    expect(beachNameKey('müller/weber')).toBe('müller/weber')
    expect(beachNameKey('  Müller  /  Weber  ')).toBe('müller/weber')
    expect(beachNameKey('Rossi')).toBe('rossi')
    expect(beachNameKey('')).toBe('')
  })

  it('pair keys do not depend on the order of the players', () => {
    expect(pairKeyFromName('Weber / Müller (CHE)')).toBe('müller/weber')
    expect(pairKeyFromName('Müller/Weber')).toBe('müller/weber')
    expect(pairKeyFromName('Rossi')).toBe('')
    expect(pairKeyFromName('A / B / C')).toBe('')
    expect(pairKeyFromPlayers([{ last_name: 'Weber' }, { last_name: 'Müller' }])).toBe('müller/weber')
    expect(pairKeyFromPlayers([{ last_name: 'Weber' }])).toBe('')
    expect(pairKeyFromPlayers([{ last_name: 'Weber' }, { last_name: ' ' }])).toBe('')
  })

  it('teamKeys prefers the players and falls back to the name', () => {
    expect(teamKeys(team(MUELLER_WEBER_ID))).toEqual({ nameKey: 'müller/weber', pairKey: 'müller/weber' })
    expect(teamKeys({ name: 'Kunz / Abt', players: [] })).toEqual({ nameKey: 'kunz/abt', pairKey: 'abt/kunz' })
    expect(teamKeys(team(ROSSI_ID))).toEqual({ nameKey: 'rossi', pairKey: '' })
  })

  it('teamMatchesName: same name key, or the same pair in another order', () => {
    const [mw, rossi] = rowsOf(beachBundle())
    expect(teamMatchesName(mw, 'Müller / Weber (CHE)')).toBe(true)
    expect(teamMatchesName(mw, 'weber/müller')).toBe(true)
    expect(teamMatchesName(mw, 'Müller')).toBe(false)
    expect(teamMatchesName(mw, '')).toBe(false)
    expect(teamMatchesName(mw, '   ')).toBe(false)
    expect(teamMatchesName(rossi, 'ROSSI')).toBe(true)
  })
})

describe('isoToBeachDob and teamCountry', () => {
  it('formats ISO dates as DD/MM/YYYY', () => {
    expect(isoToBeachDob('1998-01-05')).toBe('05/01/1998')
    expect(isoToBeachDob('1998-01-05T00:00:00.000Z')).toBe('05/01/1998')
    expect(isoToBeachDob(null)).toBe('')
    expect(isoToBeachDob('05.01.1998')).toBe('')
  })
  it('gives the one shared country, else nothing', () => {
    expect(teamCountry([{ country: 'CHE' }, { country: 'che' }])).toBe('CHE')
    expect(teamCountry([{ country: 'CHE' }, { country: null }])).toBe('CHE')
    expect(teamCountry([{ country: 'CHE' }, { country: 'ITA' }])).toBe('')
    expect(teamCountry([])).toBe('')
  })
})

describe('savedTeamToBeachRoster', () => {
  it('fills both slots from the fixture pair, with DOB, country and coach', () => {
    const r = savedTeamToBeachRoster(team(MUELLER_WEBER_ID))
    expect(r.roster).toEqual([
      { number: 1, firstName: 'Anna', lastName: 'Müller', dob: '05/01/1998', isCaptain: false },
      { number: 2, firstName: 'Sara', lastName: 'Weber', dob: '12/03/1997', isCaptain: false }
    ])
    expect(r.country).toBe('CHE')
    expect(r.meta).toEqual({ name: 'Müller / Weber', shortName: 'MÜLLER/WEBER', color: '#3b82f6' })
    expect(r.coach).toEqual({ firstName: 'Eva', lastName: 'Kunz' })
    expect(r.warnings).toEqual([])
  })

  it('a single saved player leaves slot 2 empty and warns', () => {
    const r = savedTeamToBeachRoster(team(ROSSI_ID))
    expect(r.roster[0]).toMatchObject({ number: 1, lastName: 'Rossi', dob: '' })
    expect(r.roster[1]).toEqual({ number: 2, firstName: '', lastName: '', dob: '', isCaptain: false })
    expect(r.country).toBe('ITA')
    expect(r.meta).toEqual({ name: 'Rossi', shortName: '', color: '' })
    expect(r.coach).toBeNull()
    expect(r.warnings).toEqual([{ key: 'savedTeams.incompleteTeam', params: { name: 'Rossi' } }])
  })

  it('mixed countries give no team country and a warning', () => {
    const t = team(MUELLER_WEBER_ID)
    t.players[1].country = 'GER'
    const r = savedTeamToBeachRoster(t)
    expect(r.country).toBe('')
    expect(r.warnings).toEqual([{ key: 'savedTeams.countryMismatch', params: { name: 'Müller / Weber' } }])
  })

  it('places players by number; unnumbered ones take the first free slot; extras are ignored', () => {
    const r = savedTeamToBeachRoster({
      name: 'X',
      players: [
        { number: 2, first_name: 'Two', last_name: 'B' },
        { number: null, first_name: 'Free', last_name: 'A' },
        { number: 9, first_name: 'Extra', last_name: 'C' }
      ]
    })
    expect(r.roster.map(p => [p.number, p.firstName])).toEqual([[1, 'Free'], [2, 'Two']])
  })

  it('rosterHasNames looks at trimmed first and last names', () => {
    expect(rosterHasNames([])).toBe(false)
    expect(rosterHasNames([{ number: 1, firstName: ' ', lastName: '' }])).toBe(false)
    expect(rosterHasNames([{ firstName: '', lastName: 'X' }])).toBe(true)
    expect(rosterHasNames(undefined)).toBe(false)
  })
})

describe('findBeachTeamSuggestions', () => {
  const base = (over = {}) => ({
    id: 'r', competitionId: 'c', name: 'Müller / Weber', nameKey: 'müller/weber', pairKey: 'müller/weber',
    competition: { id: 'c', name: 'Coop Beachtour', season: '2026', gender: 'women', archived: false },
    players: [], staff: [], updatedAt: '2026-01-01T00:00:00Z', ...over
  })
  const comp = (over) => ({ id: 'c', name: 'Coop Beachtour', season: '2026', gender: 'women', archived: false, ...over })

  it('finds the fixture teams by name on each side', () => {
    const rows = rowsOf(beachBundle())
    const s = findBeachTeamSuggestions(rows, { team1Name: 'Weber / Müller', team2Name: 'Rossi', league: 'Coop Beachtour', gender: 'women', date: '2026-07-01' })
    expect(s.team1.id).toBe(MUELLER_WEBER_ID)
    expect(s.team2.id).toBe(ROSSI_ID)
    expect(s.team1.competition.id).toBe(COOP_ID)
  })

  it('returns null for unmatched or empty names', () => {
    const s = findBeachTeamSuggestions(rowsOf(beachBundle()), { team1Name: '', team2Name: 'Nobody' })
    expect(s).toEqual({ team1: null, team2: null })
    expect(findBeachTeamSuggestions(null, {})).toEqual({ team1: null, team2: null })
  })

  it('ranks league first, then gender, then season, then the latest update', () => {
    const league = base({ id: 'league', competition: comp({ name: 'Coop Beachtour', gender: 'men', season: '2020' }), updatedAt: '2020-01-01T00:00:00Z' })
    const gender = base({ id: 'gender', competition: comp({ name: 'Other', gender: 'women', season: '2026' }), updatedAt: '2026-09-01T00:00:00Z' })
    const ctx = { team1Name: 'Müller / Weber', league: 'coop  beachtour', gender: 'women', date: '2026-07-01' }
    expect(findBeachTeamSuggestions([gender, league], ctx).team1.id).toBe('league')

    const season = base({ id: 'season', competition: comp({ name: 'Other', season: '2026' }), updatedAt: '2020-01-01T00:00:00Z' })
    const oldSeason = base({ id: 'old', competition: comp({ name: 'Other', season: '2025' }), updatedAt: '2026-09-01T00:00:00Z' })
    expect(findBeachTeamSuggestions([oldSeason, season, { ...gender, id: 'men', competition: comp({ name: 'Other', gender: 'men', season: '2026' }) }], ctx).team1.id).toBe('season')

    const older = base({ id: 'older', competition: comp({ name: 'Other' }), updatedAt: '2026-01-01T00:00:00Z' })
    const newer = base({ id: 'newer', competition: comp({ name: 'Other' }), updatedAt: '2026-05-01T00:00:00Z' })
    expect(findBeachTeamSuggestions([older, newer], ctx).team1.id).toBe('newer')
  })

  it('without a match date the season is this Zurich year', () => {
    const now = base({ id: 'now', competition: comp({ name: 'Other', season: zurichYear() }), updatedAt: '2000-01-01T00:00:00Z' })
    const other = base({ id: 'other', competition: comp({ name: 'Other', season: '1999' }), updatedAt: '2026-09-01T00:00:00Z' })
    expect(findBeachTeamSuggestions([other, now], { team1Name: 'Müller/Weber', gender: 'women' }).team1.id).toBe('now')
  })

  it('never suggests a team of an archived competition', () => {
    const archived = base({ id: 'arch', competition: comp({ archived: true }), updatedAt: '2030-01-01T00:00:00Z' })
    expect(findBeachTeamSuggestions([archived], { team1Name: 'Müller / Weber' }).team1).toBeNull()
  })

  it('does not offer the same team on both sides', () => {
    const s = findBeachTeamSuggestions([base({ id: 'same' })], { team1Name: 'Müller / Weber', team2Name: 'Weber / Müller' })
    expect(s.team1.id).toBe('same')
    expect(s.team2).toBeNull()
  })
})

describe('zurichYear', () => {
  it('uses the Swiss calendar year', () => {
    expect(zurichYear(new Date('2026-12-31T23:30:00Z'))).toBe('2027')
    expect(zurichYear(new Date('2026-06-01T12:00:00Z'))).toBe('2026')
  })
})
