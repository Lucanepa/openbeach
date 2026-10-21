// The coin toss confirm's checks in the scorer's language (OpenVolley
// 80166421): half of them pushed an English literal ("Team 1 has duplicate
// jersey numbers: ..."), and needMorePlayers / team1NotSet / team2NotSet were
// English in every locale. A blank shirt number is "without a number", not
// also an invalid one.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { coinTossConfirmIssues } from '../../utils_beach/coinTossChecks_beach'

const locale = (l) => JSON.parse(readFileSync(resolve(__dirname, `../../i18n_beach/locales/${l}.json`), 'utf8'))
const fill = (s, params = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k]))

const ready = {
  match: {
    hall: 'Court 1', city: 'Zürich', league: 'Tour', scheduledAt: '2026-10-21T10:00:00Z',
    officials: [{ role: '1st referee', firstName: 'C', lastName: 'Moser' }, { role: 'scorer', firstName: 'P', lastName: 'Schneider' }]
  },
  team1Name: 'Müller / Weber',
  team2Name: 'Schmidt / Fischer',
  team1Roster: [{ number: 1, lastName: 'Müller', firstName: 'A', isCaptain: true }, { number: 2, lastName: 'Weber', firstName: 'L' }],
  team2Roster: [{ number: 1, lastName: 'Schmidt', firstName: 'S', isCaptain: true }, { number: 2, lastName: 'Fischer', firstName: 'M' }]
}

describe('coinTossConfirmIssues', () => {
  it('a ready match: none', () => {
    expect(coinTossConfirmIssues(ready)).toEqual([])
  })

  it('each issue a validation key, its team as team1 / team2', () => {
    const issues = coinTossConfirmIssues({
      ...ready,
      team1Name: 'Team 1',
      match: { ...ready.match, hall: '', officials: [] },
      team1Roster: [{ number: 1, lastName: 'Müller', firstName: 'A' }, { number: 1, lastName: 'müller', firstName: 'a' }],
      team2Roster: [{ number: '', lastName: 'Schmidt', firstName: 'S', isCaptain: true }, { number: 120, lastName: 'Fischer', firstName: 'M', dob: '01.01.1900' }],
      manageDob: true
    })
    expect(issues).toEqual([
      { key: 'validation.team1NotSet' },
      { key: 'validation.refereeNotSet' },
      { key: 'validation.scorerNotSet' },
      { key: 'validation.hallNotSet' },
      { key: 'validation.needMorePlayers', params: { team: 'team2', count: 1 } },
      { key: 'validation.captainNotSet', params: { team: 'team1' } },
      { key: 'validation.duplicateNumbers', params: { team: 'team1', numbers: '1' } },
      { key: 'validation.duplicatePlayers', params: { team: 'team1', names: 'müller a' } },
      { key: 'validation.invalidBirthdate' },
      // the blank number is not invalid too
      { key: 'validation.invalidJerseyNumbers', params: { team: 'team2', numbers: '120' } },
      { key: 'validation.playersWithoutNumbers', params: { team: 'team2', count: 1 } }
    ])
  })

  it('01.01.1900 counts only when dates of birth are kept', () => {
    const roster = [{ ...ready.team1Roster[0], dob: '01.01.1900' }, ready.team1Roster[1]]
    expect(coinTossConfirmIssues({ ...ready, team1Roster: roster })).toEqual([])
  })

  it('every key it gives is translated in all five locales (not the English text)', () => {
    const en = locale('en').validation
    const keys = ['team1NotSet', 'team2NotSet', 'refereeNotSet', 'scorerNotSet', 'hallNotSet', 'cityNotSet', 'leagueNotSet', 'dateNotSet',
      'needMorePlayers', 'captainNotSet', 'duplicateNumbers', 'duplicatePlayers', 'invalidBirthdate', 'invalidJerseyNumbers', 'playersWithoutNumbers']
    for (const l of ['de', 'de-CH', 'fr', 'it']) {
      const v = locale(l).validation
      for (const k of keys) {
        expect(v[k], `${l} ${k}`).toBeTruthy()
        expect(v[k], `${l} ${k}`).not.toBe(en[k])
      }
    }
    expect(fill(locale('de').validation.needMorePlayers, { team: 'Müller / Weber', count: 1 })).toBe('Team Müller / Weber braucht 2 Spieler. Aktuell: 1')
  })

  it('the coin toss puts no English literal in its checks, and the team\'s name in them', () => {
    const src = readFileSync(resolve(__dirname, '../../components_beach/CoinToss_beach.jsx'), 'utf8')
    expect(src).not.toMatch(/validationErrors\.push\(/)
    expect(src).toMatch(/coinTossConfirmIssues\(\{ match, team1Name, team2Name, team1Roster, team2Roster, manageDob \}\)/)
    expect(src).toMatch(/team: teamWord\[params\.team\]/)
  })
})
