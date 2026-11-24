import { describe, it, expect } from 'vitest'
import { formatCourtScore, courtScoreParts } from '../../utils_beach/scoreText_beach'

describe('scores in court order, with letters', () => {
  it('the left team first', () => {
    expect(formatCourtScore({ team1: 20, team2: 16 }, { leftisTeam1: true, teamAKey: 'team1' })).toBe('A 20 : 16 B')
    expect(formatCourtScore({ team1: 20, team2: 16 }, { leftisTeam1: false, teamAKey: 'team1' })).toBe('B 16 : 20 A')
  })

  it('the letters follow the coin toss, not team1/team2', () => {
    expect(formatCourtScore({ team1: 3, team2: 7 }, { leftisTeam1: true, teamAKey: 'team2' })).toBe('B 3 : 7 A')
    expect(courtScoreParts({ team1Points: 1, team2Points: 2 }, { leftisTeam1: false, teamAKey: 'team2' }))
      .toEqual({ leftLetter: 'A', leftPoints: 2, rightPoints: 1, rightLetter: 'B' })
  })
})
