// The sheet's Match No.: it printed String(match.game_n), so a match number
// saved as free text ("M01", game_n NaN) printed "NaN" on the preview and
// the downloaded PDF (stress test 2026-10-25).
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

let Sheet
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
})

function fill(matchData) {
  let fields = null
  render(<Sheet matchData={matchData} onDataReady={(f) => { fields = f }} />)
  cleanup()
  if (!fields) throw new Error('the sheet never reported its fields')
  return fields
}

const matchData = (match) => ({
  match: { id: 7, scheduledAt: '2026-10-25T09:00:00.000Z', coinTossTeamA: 'team1', coinTossTeamB: 'team2', ...match },
  team_1Team: { id: 1, name: 'Alpha / Beta' },
  team_2Team: { id: 2, name: 'Gamma / Delta' },
  team_1Players: [],
  team_2Players: [],
  sets: [],
  events: []
})

describe('score sheet PDF: the Match No.', () => {
  it('prints the number', () => {
    expect(fill(matchData({ game_n: 715, gameNumber: '715' })).match_no).toBe('715')
  })

  it('a match number saved as text before it had to be a number prints as typed, never NaN', () => {
    expect(fill(matchData({ game_n: NaN, gameNumber: 'M01' })).match_no).toBe('M01')
    expect(fill(matchData({ game_n: 12.5, gameNumber: '12.5' })).match_no).toBe('12.5')
  })
})
