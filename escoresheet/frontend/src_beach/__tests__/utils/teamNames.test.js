import { describe, it, expect } from 'vitest'
import { pairTeamName, teamNameForCoinToss } from '../../utils_beach/teamNames_beach'
import { TEST_TEAM_SEED_DATA } from '../../constants_beach/testSeeds_beach'

// The OpenBeach screencast of 2026-10-08: "Müller/Weber (CHE)" next to
// "Schmidt / Fischer", the country twice on the setup cards, the coin toss
// and the scoresheet header, and "(Müller/Weber (CHE))" in a dialog.
describe('beach team names', () => {
  it('"Last / Last" by player number, title case, no country', () => {
    expect(pairTeamName([{ number: 2, lastName: 'weber' }, { number: 1, lastName: 'müller' }])).toBe('Müller / Weber')
    expect(pairTeamName([{ number: 1, last_name: 'van der berg' }])).toBe('Van Der Berg')
    expect(pairTeamName([])).toBe('')
  })

  it('the coin toss keeps the stored name and never adds the country', () => {
    const players = [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }]
    expect(teamNameForCoinToss('', players, 'Team 2')).toBe('Schmidt / Fischer')
    expect(teamNameForCoinToss('Team 2', players, 'Team 2')).toBe('Schmidt / Fischer')
    expect(teamNameForCoinToss('Beach Dragons', players, 'Team 2')).toBe('Beach Dragons')
    expect(teamNameForCoinToss('', [], 'Team 2')).toBe('Team 2')
  })

  it('the test rosters are named as any other team, the country apart', () => {
    for (const team of TEST_TEAM_SEED_DATA) {
      expect(team.name).toBe(pairTeamName(team.players))
      expect(team.name).not.toMatch(/\(/)
      expect(team.country).toMatch(/^[A-Z]{3}$/)
    }
  })

  it('the coin toss no longer builds "Last / Last (CHE)"', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const src = readFileSync(resolve(__dirname, '../../components_beach/CoinToss_beach.jsx'), 'utf8')
    expect(src).not.toMatch(/\$\{namesPart\} \(\$\{country/)
    expect(src).toMatch(/teamNameForCoinToss\(team1Data\?\.name/)
  })
})
