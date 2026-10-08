import { describe, it, expect } from 'vitest'
import { set3TossBefore, set3TossUndoUpdate, snapshotOfOtherSet, undoKeepsMatch, SET3_TOSS_FIELDS } from '../../utils_beach/set3Toss_beach'

describe('set3Toss_beach', () => {
  it('keeps every field the toss and the interval after it write, null when the match has none', () => {
    const before = set3TossBefore({ set3LeftTeam: 'A', set3FirstServe: 'B', setLeftTeamOverrides: { 1: 'A' }, team1FirstServe: 2, other: 'x' })
    expect(Object.keys(before).sort()).toEqual([...SET3_TOSS_FIELDS].sort())
    expect(before).toEqual({
      set3CoinTossWinner: null, set3LeftTeam: 'A', set3FirstServe: 'B', set3CourtSwitched: null,
      setLeftTeamOverrides: { 1: 'A' }, team1FirstServe: 2, team2FirstServe: null
    })
  })

  it('copies the overrides: a later change of the match does not reach the stored values', () => {
    const match = { setLeftTeamOverrides: { 1: 'A' } }
    const before = set3TossBefore(match)
    match.setLeftTeamOverrides[3] = 'B'
    expect(before.setLeftTeamOverrides).toEqual({ 1: 'A' })
  })

  it('undo writes the stored values back; an older toss event only takes the winner back', () => {
    const before = set3TossBefore({ set3LeftTeam: 'B', set3FirstServe: 'A', team2FirstServe: 1 })
    expect(set3TossUndoUpdate({ payload: { winner: 'team1', before } })).toEqual(before)
    expect(set3TossUndoUpdate({ payload: { winner: 'team1' } })).toEqual({ set3CoinTossWinner: null })
    expect(set3TossUndoUpdate(null)).toEqual({ set3CoinTossWinner: null })
  })

  it('a snapshot of another set than the undone event is not restored', () => {
    expect(snapshotOfOtherSet({ currentSetIndex: 2 }, { setIndex: 3 })).toBe(true)
    expect(snapshotOfOtherSet({ currentSetIndex: 3 }, { setIndex: 3 })).toBe(false)
    expect(snapshotOfOtherSet({ currentSetIndex: 1 }, { payload: { setIndex: 2 } })).toBe(true)
    expect(snapshotOfOtherSet(null, { setIndex: 3 })).toBe(false)
    expect(snapshotOfOtherSet({}, { setIndex: 3 })).toBe(false)
    expect(snapshotOfOtherSet({ currentSetIndex: 2 }, {})).toBe(false)
  })

  it('a set start undo keeps the match; other undos restore a snapshot of their own set', () => {
    expect(undoKeepsMatch({ currentSetIndex: 3, set3LeftTeam: 'A' }, { type: 'set_start', setIndex: 3 })).toBe(true)
    expect(undoKeepsMatch(null, { type: 'set_start', setIndex: 1 })).toBe(true)
    expect(undoKeepsMatch({ currentSetIndex: 2 }, { type: 'set3_coin_toss_winner', setIndex: 3 })).toBe(true)
    expect(undoKeepsMatch({ currentSetIndex: 3 }, { type: 'rally_start', setIndex: 3 })).toBe(false)
    expect(undoKeepsMatch({ currentSetIndex: 3 }, { type: 'point', setIndex: 3 })).toBe(false)
  })
})
