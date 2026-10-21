import { describe, it, expect } from 'vitest'
import { missingForfeitSets } from '../../utils_beach/forfeitSets_beach'

// FIVB Beach 6.4: the opponent of a team declared in default gets the sets it
// needs to win the match (2), 21:0 and 15:0 in the deciding set
describe('missingForfeitSets', () => {
  it('a forfeit in set 1 (set 1 just awarded): set 2 is added, won 21:0', () => {
    expect(missingForfeitSets([{ index: 1, finished: true, team1Points: 12, team2Points: 21 }], 'team2'))
      .toEqual([{ index: 2, team1Points: 0, team2Points: 21 }])
  })

  it('a forfeit in set 2 at 1:1 after it: the deciding set is added, won 15:0', () => {
    const sets = [
      { index: 1, finished: true, team1Points: 21, team2Points: 18 },
      { index: 2, finished: true, team1Points: 22, team2Points: 20 }
    ]
    expect(missingForfeitSets(sets, 'team1')).toEqual([])
    expect(missingForfeitSets(sets.map(s => s.index === 2 ? { ...s, team1Points: 19, team2Points: 21 } : s), 'team2'))
      .toEqual([{ index: 3, team1Points: 0, team2Points: 15 }])
  })

  it('nothing to add once the opponent has its two sets; never a fourth set', () => {
    expect(missingForfeitSets([
      { index: 1, finished: true, team1Points: 21, team2Points: 0 },
      { index: 2, finished: true, team1Points: 21, team2Points: 0 }
    ], 'team1')).toEqual([])
    expect(missingForfeitSets([
      { index: 1, finished: true, team1Points: 21, team2Points: 10 },
      { index: 2, finished: true, team1Points: 21, team2Points: 10 },
      { index: 3, finished: true, team1Points: 0, team2Points: 15 }
    ], 'team2')).toEqual([])
  })

  it('a forfeit before any set ended (no rows): both sets', () => {
    expect(missingForfeitSets([], 'team1')).toEqual([
      { index: 1, team1Points: 21, team2Points: 0 },
      { index: 2, team1Points: 21, team2Points: 0 }
    ])
  })

  // BUG-forfeit-set2: set 3 was opened at 0:0 while the forfeit of set 2 ran;
  // the sets after it started at index 4, so nothing was awarded (1:1)
  it('a set opened at 0:0 meanwhile is awarded, not stepped over', () => {
    const sets = [
      { id: 1, index: 1, finished: true, team1Points: 21, team2Points: 15 },
      { id: 2, index: 2, finished: true, team1Points: 3, team2Points: 21 },
      { id: 3, index: 3, finished: false, team1Points: 0, team2Points: 0 }
    ]
    expect(missingForfeitSets(sets, 'team2')).toEqual([{ id: 3, index: 3, team1Points: 0, team2Points: 15 }])
  })

  it('a forfeit in set 1 with set 2 opened meanwhile: set 2 is awarded, no set 3', () => {
    const sets = [
      { id: 1, index: 1, finished: true, team1Points: 2, team2Points: 21 },
      { id: 2, index: 2, finished: false, team1Points: 0, team2Points: 0 }
    ]
    expect(missingForfeitSets(sets, 'team2')).toEqual([{ id: 2, index: 2, team1Points: 0, team2Points: 21 }])
  })

  it('an open set keeps the defaulting team\'s points, the opponent wins it by two', () => {
    expect(missingForfeitSets([{ id: 7, index: 1, finished: false, team1Points: 20, team2Points: 5 }], 'team2')).toEqual([
      { id: 7, index: 1, team1Points: 20, team2Points: 22 },
      { index: 2, team1Points: 0, team2Points: 21 }
    ])
  })
})
