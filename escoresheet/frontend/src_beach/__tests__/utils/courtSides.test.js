import { describe, it, expect } from 'vitest'
import { leftTeamInSet, isTeam1LeftInSet, switchSidesUpdate, nextSetStartSides } from '../../utils_beach/courtSides_beach'

const apply = (match, update) => ({ ...match, ...update })

describe('court sides: one rule for the court, the interval and the switches', () => {
  it('set 1 starts with A on the left; switches flip it', () => {
    let m = { coinTossTeamA: 'team2' }
    expect(leftTeamInSet(1, m)).toBe('A')
    expect(isTeam1LeftInSet(1, m)).toBe(false)
    m = apply(m, switchSidesUpdate(1, m))
    expect(leftTeamInSet(1, m)).toBe('B')
    expect(isTeam1LeftInSet(1, m)).toBe(true)
  })

  it('set 2 starts where set 1 finished (18.1.1: courts change only if requested)', () => {
    const odd = { setLeftTeamOverrides: { 1: 'B' } }
    expect(leftTeamInSet(2, odd)).toBe('B')
    const even = { setLeftTeamOverrides: { 1: 'A' } }
    expect(leftTeamInSet(2, even)).toBe('A')
    expect(leftTeamInSet(2, {})).toBe('A')
  })

  it('"Switch sides" in the interval: an odd number of taps flips, an even one does not', () => {
    const start = apply({ setLeftTeamOverrides: { 1: 'B' } }, nextSetStartSides(2, { setLeftTeamOverrides: { 1: 'B' } }))
    expect(leftTeamInSet(2, start)).toBe('B')
    let m = start
    for (let taps = 1; taps <= 4; taps++) {
      m = apply(m, switchSidesUpdate(2, m, { beforeSetStart: true }))
      expect(leftTeamInSet(2, m)).toBe(taps % 2 ? 'A' : 'B')
    }
  })

  it('the set starts as previewed: the first court switch flips the previewed side', () => {
    let m = apply({ setLeftTeamOverrides: { 1: 'B' } }, nextSetStartSides(2, { setLeftTeamOverrides: { 1: 'B' } }))
    m = apply(m, switchSidesUpdate(2, m, { beforeSetStart: true }))
    const previewed = leftTeamInSet(2, m)
    // the set starts: nothing is written, the court shows the same side
    expect(leftTeamInSet(2, m)).toBe(previewed)
    m = apply(m, switchSidesUpdate(2, m))
    expect(leftTeamInSet(2, m)).toBe(previewed === 'A' ? 'B' : 'A')
  })

  it('set 3: the toss side, and "Switch sides" before the set changes the toss side', () => {
    let m = { setLeftTeamOverrides: { 1: 'B', 2: 'A' } }
    m = apply(m, nextSetStartSides(3, m))
    expect(m.set3LeftTeam).toBe('A')
    expect(leftTeamInSet(3, m)).toBe('A')
    m = apply(m, switchSidesUpdate(3, m, { beforeSetStart: true }))
    expect(m.set3LeftTeam).toBe('B')
    expect(m.setLeftTeamOverrides[3]).toBeUndefined()
    expect(leftTeamInSet(3, m)).toBe('B')
    // a court switch in set 3 (at 5 points) flips from the toss side
    m = apply(m, switchSidesUpdate(3, m))
    expect(leftTeamInSet(3, m)).toBe('A')
    expect(m.set3LeftTeam).toBe('B')
  })

  it('ignores junk values', () => {
    expect(leftTeamInSet(2, { setLeftTeamOverrides: { 2: 'team1' } })).toBe('A')
    expect(leftTeamInSet(undefined, null)).toBe('A')
  })
})
