// The changes of courts of a set against its score: which made change the
// score no longer reaches (to be changed back), what a screen opened on the
// set must ask (a pending change, TTO or change back), and the sides the
// change back restores.
import { describe, it, expect } from 'vitest'
import {
  courtChangeInterval, hasTto, ttoCourtSwitchMade, staleCourtSwitches,
  switchBackUpdate, snapshotsAfterSwitchBack, pendingTto, pendingCourtDialog
} from '../../utils_beach/courtSwitchState_beach'
import { isTeam1LeftInSet, switchSidesUpdate } from '../../utils_beach/courtSides_beach'
import { swapTeamDesignation } from '../../utils_beach/coinToss_beach'

let seq = 0
const ev = (type, payload = {}, extra = {}) => ({ id: ++seq, seq, setIndex: 1, type, payload, ...extra })
const cs = (t1, t2, pre = {}, extra = {}) => ev('court_switch', { score: { team1: t1, team2: t2 }, preSwitchOverrides: pre }, extra)
const tto = (payload = {}, extra = {}) => ev('technical_to', { preSwitchOverrides: { 1: 'B' }, ...payload }, extra)
const set = (team1Points, team2Points, extra = {}) => ({ index: 1, team1Points, team2Points, finished: false, ...extra })

describe('courtSwitchState_beach', () => {
  it('intervals: 7 in sets 1-2, 5 in set 3; the TTO in sets 1-2 only', () => {
    expect(courtChangeInterval(1)).toBe(7)
    expect(courtChangeInterval(2)).toBe(7)
    expect(courtChangeInterval(3)).toBe(5)
    expect([1, 2, 3].map(hasTto)).toEqual([true, true, false])
  })

  it('a TTO says whether its change of courts is made; one logged before that field is judged by the sides', () => {
    expect(ttoCourtSwitchMade(tto({ courtSwitched: false }), [], {})).toBe(false)
    expect(ttoCourtSwitchMade(tto({ courtSwitched: true }), [], {})).toBe(true)
    // legacy: sides still the ones before the TTO -> not made; changed -> made
    const legacy = tto()
    expect(ttoCourtSwitchMade(legacy, [legacy], { setLeftTeamOverrides: { 1: 'B' } })).toBe(false)
    expect(ttoCourtSwitchMade(legacy, [legacy], { setLeftTeamOverrides: { 1: 'A' } })).toBe(true)
    // legacy followed by a later change of courts: made
    const later = cs(14, 14, { 1: 'A' })
    expect(ttoCourtSwitchMade(legacy, [legacy, later], { setLeftTeamOverrides: { 1: 'B' } })).toBe(true)
  })

  it('stale changes: made at a total above the score, oldest first; a TTO only once its change is made', () => {
    const c7 = cs(7, 0, {})
    const c14 = cs(10, 4, { 1: 'B' })
    const t = tto({ courtSwitched: true })
    const events = [c7, c14, t]
    expect(staleCourtSwitches(events, 1, 21, {})).toEqual([])
    expect(staleCourtSwitches(events, 1, 20, {}).map(e => e.id)).toEqual([t.id])
    expect(staleCourtSwitches(events, 1, 13, {}).map(e => e.id)).toEqual([c14.id, t.id])
    expect(staleCourtSwitches(events, 1, 6, {}).map(e => e.id)).toEqual([c7.id, c14.id, t.id])
    // a TTO whose change is pending is not a change made
    expect(staleCourtSwitches([tto({ courtSwitched: false })], 1, 20, {})).toEqual([])
    // other sets do not count
    expect(staleCourtSwitches([cs(5, 0, {}, { setIndex: 3 })], 1, 0, {})).toEqual([])
  })

  it('the change back restores the sides before the oldest stale change, else flips once per change', () => {
    expect(switchBackUpdate([cs(7, 0, { 2: 'A' })], 1, {})).toEqual({ setLeftTeamOverrides: { 2: 'A' } })
    const noSaved = { ...cs(7, 0), payload: { score: { team1: 7, team2: 0 } } }
    expect(switchBackUpdate([noSaved], 1, { setLeftTeamOverrides: { 1: 'B' } })).toEqual({ setLeftTeamOverrides: { 1: 'A' } })
    expect(switchBackUpdate([noSaved, noSaved], 1, {})).toBe(null)
    expect(switchBackUpdate([], 1, {})).toBe(null)
  })

  it('the undo snapshots logged after the oldest stale change get the restored sides', () => {
    const before = ev('point', { team: 'team1' }, { stateSnapshot: { sideA: 'left', setLeftTeamOverrides: {} } })
    const c7 = cs(7, 0, {})
    const after = ev('timeout', { team: 'team2' }, { stateSnapshot: { sideA: 'right', setLeftTeamOverrides: { 1: 'B' }, pointsA: 6 } })
    const noSnapshot = ev('rally_start')
    const rows = snapshotsAfterSwitchBack([before, c7, after, noSnapshot], [c7], 1, { setLeftTeamOverrides: {} })
    expect(rows).toEqual([{ id: after.id, stateSnapshot: { sideA: 'left', setLeftTeamOverrides: {}, pointsA: 6 } }])
  })

  it('a TTO logged at 21 with its change of courts not made is pending', () => {
    expect(pendingTto([tto({ courtSwitched: false })], 1, {})?.type).toBe('technical_to')
    expect(pendingTto([tto({ courtSwitched: true })], 1, {})).toBe(null)
    expect(pendingTto([], 1, {})).toBe(null)
    expect(pendingTto([tto({ courtSwitched: false }, { setIndex: 3 })], 3, {})).toBe(null)
  })

  it('what a screen opened on the set asks: the change back, a pending change or TTO, or nothing', () => {
    // a change made at 7, the score back at 6: change back
    expect(pendingCourtDialog([cs(7, 0)], set(6, 0), {})).toBe('back')
    // 7 points, no change made: the change; made: nothing
    expect(pendingCourtDialog([], set(4, 3), {})).toBe('point')
    expect(pendingCourtDialog([cs(4, 3)], set(4, 3), {})).toBe(null)
    // not a change total, 0:0, a finished set: nothing
    expect(pendingCourtDialog([], set(4, 2), {})).toBe(null)
    expect(pendingCourtDialog([], set(0, 0), {})).toBe(null)
    expect(pendingCourtDialog([], set(4, 3, { finished: true }), {})).toBe(null)
    // 21: the TTO, logged or not, until its change is made
    expect(pendingCourtDialog([cs(4, 3), cs(7, 7)], set(11, 10), {})).toBe('point')
    expect(pendingCourtDialog([cs(4, 3), cs(7, 7), tto({ courtSwitched: false })], set(11, 10), {})).toBe('point')
    expect(pendingCourtDialog([cs(4, 3), cs(7, 7), tto({ courtSwitched: true })], set(11, 10), {})).toBe(null)
    // a set-ending score at a change total (set 3, 15:10): the set end, not a change
    expect(pendingCourtDialog([], { index: 3, team1Points: 15, team2Points: 10, finished: false }, {})).toBe(null)
    // set 3 changes every 5
    expect(pendingCourtDialog([], { index: 3, team1Points: 3, team2Points: 2, finished: false }, {})).toBe('point')
  })
})

// "Swap team A ↔ B" after a change of courts: the swap re-labels the teams
// and flips the match's A/B sides (each team stays where it is). A change's
// saved sides (preSwitchOverrides) and the snapshots are of the designation
// they were logged with: read in today's, the change back puts each team
// where it was before the change, not on the other side.
describe('courtSwitchState_beach after a swap of team A / B', () => {
  const isTeam1Left = (m) => isTeam1LeftInSet(1, m)

  it('the change back restores the sides from before the change, in the match\'s designation now', () => {
    // A = team1 on the left (no side yet), change at 4:3 (B left); swap: A = team2
    const change = cs(4, 3, {}, { stateSnapshot: { teamAKey: 'team1' } })
    const before = { coinTossTeamA: 'team1' }
    const afterChange = { ...before, ...switchSidesUpdate(1, before) }
    const swapped = { ...afterChange, ...swapTeamDesignation(afterChange) }
    expect(isTeam1Left(swapped)).toBe(isTeam1Left(afterChange))
    const update = switchBackUpdate([change], 1, swapped)
    expect(isTeam1Left({ ...swapped, ...update })).toBe(isTeam1Left(before))
  })

  it('the designation from the event\'s payload (teamA) first', () => {
    const change = cs(4, 3, { 1: 'B' }, {})
    change.payload.teamA = 'team2'
    // logged with A = team2: B (team1) on the left before it; now A = team1
    const update = switchBackUpdate([change], 1, { coinTossTeamA: 'team1', setLeftTeamOverrides: { 1: 'B' } })
    expect(isTeam1Left({ coinTossTeamA: 'team1', ...update })).toBe(true)
  })

  it('a TTO logged before courtSwitched: its saved sides compared in the designation now', () => {
    const legacy = tto({}, { stateSnapshot: { teamAKey: 'team1' } })
    // its sides before: B (team2) left. Swapped since (A = team2): no change made = A left
    expect(ttoCourtSwitchMade(legacy, [legacy], { coinTossTeamA: 'team2', setLeftTeamOverrides: { 1: 'A' } })).toBe(false)
    expect(ttoCourtSwitchMade(legacy, [legacy], { coinTossTeamA: 'team2', setLeftTeamOverrides: { 1: 'B' } })).toBe(true)
  })

  it('snapshots rewritten after a change back keep their own designation', () => {
    const change = cs(4, 3, {}, { stateSnapshot: { teamAKey: 'team1' } })
    const later = ev('point', { team: 'team1' }, { stateSnapshot: { teamAKey: 'team1', sideA: 'right', setLeftTeamOverrides: { 1: 'B' } } })
    // the match now: A = team2, team1 back on the left (B left)
    const sidesMatch = { coinTossTeamA: 'team2', setLeftTeamOverrides: { 1: 'B' } }
    const [row] = snapshotsAfterSwitchBack([change, later], [change], 1, sidesMatch)
    // in the snapshot's designation (A = team1): A (team1) on the left
    expect(row.stateSnapshot.setLeftTeamOverrides).toEqual({ 1: 'A' })
    expect(row.stateSnapshot.sideA).toBe('left')
    expect(isTeam1LeftInSet(1, { coinTossTeamA: 'team1', ...row.stateSnapshot })).toBe(isTeam1LeftInSet(1, sidesMatch))
  })
})
