import { describe, it, expect, vi, beforeEach } from 'vitest'

// The set 3 coin toss reaches the server since 621827e (its
// set3_coin_toss_winner event). A restore by PIN brought the event back but
// not what the toss decided: no set3CoinTossWinner, so in the break before
// set 3 the toss buttons came back (the toss made twice), and no
// set3FirstServe, so set 3 was served as if there had been no toss. The
// restore now takes the winner from the event, set 3's first server from the
// latest snapshot taken with the toss made (in the restored match's A / B:
// "Swap team A ↔ B" keeps the same team serving), and, in the break, the
// interval's choices made after the toss from the live row (they log no
// event). As OpenVolley 44fd44f8 for its set 5 coin toss.

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

import { fetchMatchByPin, importMatchFromSupabase, savedSet3Toss } from '../../utils_beach/backupManager_beach'
import { setFirstServer } from '../../utils_beach/coinToss_beach'
import { leftTeamInSet } from '../../utils_beach/courtSides_beach'

const MATCH = {
  id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach',
  coin_toss: { team_a: 'team1', team_b: 'team2', confirmed: true, first_serve: 'team1' },
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
  return added.matches[0]
}

// set 2's end, then the set 3 toss won by team2 (team1 is A); its snapshot
// has set 3's side and first server as set 2's end set them
const setEnd = { seq: 50, set_index: 2, type: 'set_end', payload: { winner: 'team2' }, created_at: '2026-10-09T10:00:00.000Z',
  state_snapshot: { teamAKey: 'team1', currentSetIndex: 2, set3LeftTeam: null, set3FirstServe: null, setLeftTeamOverrides: { 1: 'A', 2: 'B' } } }
const toss = (over = {}, snap = {}) => ({
  seq: 51, set_index: 3, type: 'set3_coin_toss_winner', created_at: '2026-10-09T10:01:00.000Z',
  payload: { winner: 'team2', team: 'team2', teamA: 'team1', before: {}, ...over },
  state_snapshot: { teamAKey: 'team1', currentSetIndex: 3, set3CoinTossWinner: 'team2', set3LeftTeam: 'A', set3FirstServe: 'B', setLeftTeamOverrides: { 1: 'A', 2: 'B' }, ...snap }
})
const live = (over) => ({
  current_set: 3, set_interval_active: true, match_status: 'interval', points_a: 0, points_b: 0,
  team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer',
  side_a: 'left', serving_team: 'right', last_event_type: 'set3_coin_toss_winner',
  last_event_ts: '2026-10-09T10:01:01.000Z', ...over
})

describe('restore by PIN: the set 3 coin toss', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('in the break: the winner (no toss buttons), set 3\'s side and first server', async () => {
    const restored = await restore({ events: [setEnd, toss()], liveState: live() })
    expect(restored.set3CoinTossWinner).toBe('team2')
    expect(restored.set3FirstServe).toBe('B')
    expect(setFirstServer(restored, 3)).toBe('team2')
    expect(leftTeamInSet(3, restored)).toBe('A')
  })

  it('the interval\'s "Switch sides" and "Switch serve" after the toss (only the live row has them)', async () => {
    const restored = await restore({
      events: [setEnd, toss()],
      liveState: live({ side_a: 'right', serving_team: 'right', last_event_type: 'manual_interval_setup', last_event_ts: '2026-10-09T10:02:00.000Z' })
    })
    expect(restored.set3CoinTossWinner).toBe('team2')
    expect(leftTeamInSet(3, restored)).toBe('B')
    expect(restored.set3FirstServe).toBe('A')
    expect(setFirstServer(restored, 3)).toBe('team1')
  })

  it('a live row older than the toss: the toss\'s snapshot', async () => {
    const restored = await restore({
      events: [setEnd, toss()],
      liveState: live({ side_a: 'right', serving_team: 'right', last_event_ts: '2026-10-09T09:59:00.000Z' })
    })
    expect(restored.set3FirstServe).toBe('B')
    expect(setFirstServer(restored, 3)).toBe('team2')
  })

  it('A and B swapped since the toss: the same team serves set 3 first', async () => {
    // the cloud coin toss names team2 as A now; the toss's snapshot is in
    // the old designation (team1 A, B = team2 serving)
    const restored = await restore({
      events: [setEnd, toss()],
      match: { coin_toss: { team_a: 'team2', team_b: 'team1', confirmed: true, first_serve: 'team1' } }
    })
    expect(restored.coinTossTeamA).toBe('team2')
    expect(restored.set3FirstServe).toBe('A')
    expect(setFirstServer(restored, 3)).toBe('team2')
    expect(restored.set3CoinTossWinner).toBe('team2')
  })

  it('set 3 under way: the first server from its latest point\'s snapshot', async () => {
    const point = { seq: 60, set_index: 3, type: 'point', payload: { team: 'team1' }, created_at: '2026-10-09T10:10:00.000Z',
      state_snapshot: { teamAKey: 'team1', currentSetIndex: 3, set3CoinTossWinner: 'team2', set3LeftTeam: 'B', set3FirstServe: 'A' } }
    const restored = await restore({
      events: [setEnd, toss(), point],
      liveState: live({ set_interval_active: false, match_status: 'live', points_a: 1, last_event_type: 'point', last_event_ts: '2026-10-09T10:10:01.000Z' })
    })
    expect(restored.set3CoinTossWinner).toBe('team2')
    expect(setFirstServer(restored, 3)).toBe('team1')
  })

  it('no toss on the server (or undone): nothing of set 3\'s toss', async () => {
    const restored = await restore({ events: [setEnd], liveState: live({ last_event_type: 'set_end' }) })
    expect(restored).not.toHaveProperty('set3CoinTossWinner')
    expect(restored).not.toHaveProperty('set3FirstServe')
    expect(savedSet3Toss([], null)).toEqual({})
  })

  it('the latest toss counts', () => {
    const again = toss({ winner: 'team1', team: 'team1' }, { set3CoinTossWinner: 'team1', set3FirstServe: 'A' })
    expect(savedSet3Toss([toss(), { ...again, seq: 55 }], null, { teamAKey: 'team1' }))
      .toEqual({ set3CoinTossWinner: 'team1', set3FirstServe: 'A' })
  })
})
