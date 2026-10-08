import { describe, it, expect, vi, beforeEach } from 'vitest'

// The court sides a restore by PIN gives the match, against what the scorer
// did after the latest synced event snapshot (OpenVolley 4c634ac9 checked on
// beach). The manual "Switch sides" (Manual changes) writes the side with no
// event: only the live state it pushes ('manual_side_change') knows it, and
// the restore read the live state only when no event had a snapshot, so the
// switch was lost and the restored court showed the teams on their old sides.
// The live state is not taken over the events otherwise: a TTO's change of
// courts is pushed to the live state, but its event row in the cloud keeps
// courtSwitched: false (the flag is set locally only), so the restored match
// asks for the TTO again and its end makes the change; taking the live side
// too would change the courts twice. A change of courts due and not made is
// asked again from the events (pendingCourtDialog), on the snapshot's sides.
//
// The live row's Team A may not be the cloud coin toss's: "Swap A/B" queues
// the coin toss (sync queue) and writes the live state at once. The live
// row's team names tell its Team A; its side_a and lineup_a are read for
// that team, and a live row not older than the latest event gives the
// restored match its Team A (the swap as the scorer's match has it).

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `http://backend.test${p}`,
  getCloudApiUrl: (p) => `http://backend.test${p}`,
  isBackendAvailable: () => true
}))
const added = vi.hoisted(() => ({ matches: [] }))
vi.mock('../../db_beach/db_beach', () => {
  let id = 0
  const table = (name) => ({
    add: vi.fn(async (row) => { id += 1; if (name === 'matches') added.matches.push(row); return id }),
    hook: () => {}
  })
  return {
    db: {
      transaction: async (...args) => args[args.length - 1](),
      matches: table('matches'),
      teams: table('teams'),
      players: table('players'),
      sets: table('sets'),
      events: table('events'),
      sync_queue: { hook: () => {} }
    }
  }
})

import { fetchMatchByPin, importMatchFromSupabase } from '../../utils_beach/backupManager_beach'
import { leftTeamInSet, switchSidesUpdate } from '../../utils_beach/courtSides_beach'
import { pendingCourtDialog } from '../../utils_beach/courtSwitchState_beach'

const rich = (a, b) => ({ I: { number: a }, II: { number: b } })
const T1 = () => rich(7, 12) // team1's players
const T2 = () => rich(3, 21) // team2's players
const MATCH = {
  id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach',
  coin_toss: { team_a: 'team1', team_b: 'team2', confirmed: true },
  team1_data: { name: 'Müller/Weber' },
  team2_data: { name: 'Schmidt/Fischer' }
}

async function restore({ events = [], liveState = null, match = {} } = {}) {
  added.matches.length = 0
  const restoreByPin = async () => ({
    data: { match: { ...MATCH, ...match }, sets: [], events, liveState },
    error: null,
    status: 200
  })
  const out = await fetchMatchByPin('123456', 12, { restoreByPin })
  await importMatchFromSupabase(out)
  return { out, restored: added.matches[0] }
}

// The events as the imported match has them (courtSwitchState_beach reads these)
const localEvents = (out) => out.events.map(e => ({ type: e.type, setIndex: e.set_index, seq: e.seq, payload: e.payload }))
const point = (seq, setIndex, snapshot, at) => ({
  seq, set_index: setIndex, type: 'point', payload: { team: 'team1' },
  created_at: at, state_snapshot: { teamAKey: 'team1', currentSetIndex: setIndex, ...snapshot }
})
const live = (over) => ({
  current_set: 2, side_a: 'left', lineup_a: T1(), lineup_b: T2(),
  team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', ...over
})

describe('restore by PIN: a manual "Switch sides" after the latest snapshot', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('set 2: the switched side, and the restored match\'s "Switch sides" moves the teams', async () => {
    // set 2 started with A on the left (override [2] from the set end); then
    // Manual changes "Switch sides": B left, no event, the live state pushed
    const { restored } = await restore({
      events: [point(20, 2, { sideA: 'left', setLeftTeamOverrides: { 1: 'B', 2: 'A' } }, '2026-10-08T10:00:00.000Z')],
      liveState: live({ side_a: 'right', last_event_type: 'manual_side_change', last_event_ts: '2026-10-08T10:01:00.000Z' })
    })
    expect(leftTeamInSet(2, restored)).toBe('B')
    expect(leftTeamInSet(1, restored)).toBe('B')
    expect(leftTeamInSet(2, { ...restored, ...switchSidesUpdate(2, restored) })).toBe('A')
  })

  it('set 1 with no change of courts yet (the snapshot has no override): the switched side', async () => {
    const { restored } = await restore({
      events: [point(3, 1, { sideA: 'left', setLeftTeamOverrides: {} }, '2026-10-08T10:00:00.000Z')],
      liveState: live({ current_set: 1, side_a: 'right', last_event_type: 'manual_side_change', last_event_ts: '2026-10-08T10:01:00.000Z' })
    })
    expect(leftTeamInSet(1, restored)).toBe('B')
  })

  it('set 3 before its start: its start side (set3LeftTeam), so the set 3 toss still moves the court', async () => {
    const { restored } = await restore({
      events: [point(40, 2, { sideA: 'left', set3LeftTeam: 'A', setLeftTeamOverrides: { 1: 'B', 2: 'A' } }, '2026-10-08T10:00:00.000Z')],
      liveState: live({ current_set: 3, match_status: 'interval', side_a: 'right', last_event_type: 'manual_side_change', last_event_ts: '2026-10-08T10:01:00.000Z' })
    })
    expect(leftTeamInSet(3, restored)).toBe('B')
    expect(restored.setLeftTeamOverrides?.[3]).toBeUndefined()
    expect(leftTeamInSet(3, { ...restored, set3LeftTeam: 'A' })).toBe('A')
  })

  it('a switch older than the latest synced change of courts: the change\'s snapshot', async () => {
    // the switch, then a change of courts whose live state push failed
    // (offline) while its event was queued and synced later
    const { restored } = await restore({
      events: [{
        seq: 25, set_index: 2, type: 'court_switch', payload: { score: { team1: 4, team2: 3 } },
        created_at: '2026-10-08T10:05:00.000Z',
        state_snapshot: { teamAKey: 'team1', currentSetIndex: 2, sideA: 'left', setLeftTeamOverrides: { 1: 'B', 2: 'A' } }
      }],
      liveState: live({ side_a: 'right', last_event_type: 'manual_side_change', last_event_ts: '2026-10-08T10:01:00.000Z' })
    })
    expect(leftTeamInSet(2, restored)).toBe('A')
  })
})

describe('restore by PIN: a change of courts asked for and not made yet', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('at 4:3 in set 1: the sides before the change, and the change is asked again', async () => {
    const { out, restored } = await restore({
      events: [point(9, 1, { sideA: 'left', setLeftTeamOverrides: {} }, '2026-10-08T10:00:00.000Z')],
      liveState: live({ current_set: 1, side_a: 'left', points_a: 4, points_b: 3, last_event_type: 'point', last_event_ts: '2026-10-08T10:00:01.000Z' })
    })
    expect(leftTeamInSet(1, restored)).toBe('A')
    expect(pendingCourtDialog(localEvents(out), { index: 1, team1Points: 4, team2Points: 3 }, restored)).toBe('point')
  })

  it('a TTO whose change of courts was made (the cloud row says not): asked again, the courts changed once', async () => {
    // changes at 7 (B left) and 14 (A left); the TTO at 21 (11:10) ended and
    // changed the courts: the live state says B left, the cloud TTO row
    // keeps courtSwitched: false and its snapshot from before the change
    const at = (m) => `2026-10-08T10:${String(m).padStart(2, '0')}:00.000Z`
    const { out, restored } = await restore({
      events: [
        { seq: 10, set_index: 1, type: 'court_switch', payload: { score: { team1: 4, team2: 3 }, preSwitchOverrides: {} }, created_at: at(1), state_snapshot: { teamAKey: 'team1', currentSetIndex: 1, sideA: 'right', setLeftTeamOverrides: { 1: 'B' } } },
        { seq: 20, set_index: 1, type: 'court_switch', payload: { score: { team1: 7, team2: 7 }, preSwitchOverrides: { 1: 'B' } }, created_at: at(2), state_snapshot: { teamAKey: 'team1', currentSetIndex: 1, sideA: 'left', setLeftTeamOverrides: { 1: 'A' } } },
        { seq: 30, set_index: 1, type: 'technical_to', payload: { preSwitchOverrides: { 1: 'A' }, courtSwitched: false }, created_at: at(3), state_snapshot: { teamAKey: 'team1', currentSetIndex: 1, sideA: 'left', setLeftTeamOverrides: { 1: 'A' } } }
      ],
      liveState: live({ current_set: 1, side_a: 'right', points_a: 11, points_b: 10, last_event_type: 'end_tto', last_event_ts: at(4) })
    })
    expect(leftTeamInSet(1, restored)).toBe('A')
    expect(pendingCourtDialog(localEvents(out), { index: 1, team1Points: 11, team2Points: 10 }, restored)).toBe('point')
    // the TTO's end changes the courts: B on the left, as the live state
    expect(leftTeamInSet(1, { ...restored, ...switchSidesUpdate(1, restored) })).toBe('B')
  })
})

describe('restore by PIN: the live row\'s own Team A', () => {
  beforeEach(() => { added.matches.length = 0 })
  const lineup = (out, team) => out.events.find(e => e.type === 'lineup' && e.payload.team === team)?.payload.lineup
  // the live row after "Swap A/B": A = team2 (Schmidt/Fischer), on the left
  const swapped = (over) => live({ side_a: 'left', lineup_a: T2(), lineup_b: T1(), team_a_name: 'Schmidt/Fischer', team_b_name: 'Müller/Weber', last_event_type: 'manual_team_swap', last_event_ts: '2026-10-08T10:01:00.000Z', ...over })

  it('"Swap A/B" still in the sync queue: the restored match has the live row\'s Team A, its side and lineups', async () => {
    const { out, restored } = await restore({ liveState: swapped() })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(restored.coinTossTeamB).toBe('team1')
    expect(leftTeamInSet(2, restored)).toBe('A')
    expect(lineup(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineup(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('the same with a snapshot from before the swap: the sides as the scorer\'s match has them', async () => {
    // beach's swap keeps the A / B sides: A on the left is team2 now
    const { restored } = await restore({
      events: [point(20, 2, { sideA: 'left', setLeftTeamOverrides: { 1: 'B', 2: 'A' } }, '2026-10-08T10:00:00.000Z')],
      liveState: swapped()
    })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(leftTeamInSet(2, restored)).toBe('A')
  })

  it('a live row older than the latest synced event: the cloud coin toss, the live side still read for its own Team A', async () => {
    const { out, restored } = await restore({
      events: [{ seq: 30, set_index: 2, type: 'timeout', payload: { team: 'team1' }, created_at: '2026-10-08T10:05:00.000Z' }],
      liveState: swapped()
    })
    expect(restored.coinTossTeamA).toBe('team1')
    // team2 on the left: B with A = team1
    expect(leftTeamInSet(2, restored)).toBe('B')
    expect(lineup(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('a row placed by the rule (no snapshot, no serve mark) synced before the swap: by its own Team A, the cloud coin toss\'s', async () => {
    // set 1, no change of courts: A = team1 on the left when the row was
    // written; the restored match takes the live row's Team A (team2)
    const row = {
      seq: 5, set_index: 1, type: 'point', payload: { team: 'team1' }, created_at: '2026-10-08T10:00:00.000Z',
      lineup_left: T1(), lineup_right: T2()
    }
    const { out, restored } = await restore({ events: [row], liveState: swapped({ current_set: 1 }) })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(lineup(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineup(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('"Swap A/B" still in the sync queue: the same first server, the A / B serve flag follows the swap', async () => {
    // the cloud coin toss from before the swap: A = team1 serving first
    const { restored } = await restore({
      match: { coin_toss: { team_a: 'team1', team_b: 'team2', serve_a: true, first_serve: 'team1', confirmed: true } },
      liveState: swapped()
    })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(restored.firstServe).toBe('team1')
    // team1 is B now: A (team2) does not serve first
    expect(restored.coinTossServeA).toBe(false)
  })

  it('the same with only the serve flag in the cloud coin toss: the team it named serves first', async () => {
    const { restored } = await restore({
      match: { coin_toss: { team_a: 'team1', team_b: 'team2', serve_a: false, confirmed: true } },
      liveState: swapped()
    })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(restored.firstServe).toBe('team2')
    expect(restored.coinTossServeA).toBe(true)
  })

  it('names that do not tell (the same on both teams, or missing): the cloud coin toss\'s Team A', async () => {
    const same = await restore({
      match: { team1_data: { name: 'X' }, team2_data: { name: 'X' } },
      liveState: live({ side_a: 'left', team_a_name: 'X', team_b_name: 'X' })
    })
    expect(same.restored.coinTossTeamA).toBe('team1')
    expect(leftTeamInSet(2, same.restored)).toBe('A')
    const missing = await restore({ liveState: live({ side_a: 'left', team_a_name: null, team_b_name: null }) })
    expect(missing.restored.coinTossTeamA).toBe('team1')
    expect(leftTeamInSet(2, missing.restored)).toBe('A')
  })
})
