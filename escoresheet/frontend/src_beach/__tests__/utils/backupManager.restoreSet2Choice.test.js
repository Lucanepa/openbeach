import { describe, it, expect, vi, beforeEach } from 'vitest'

// A restore by PIN in the interval before set 2 (FIVB beach 7.1.2.3: the
// team that lost the first toss chooses serve / receive or the side; each
// team gives its service order again, 7.6.1). The interval's choices log no
// event, only the live row they push has them: the restored match lost the
// side (set 2 went back to where set 1 finished), the serve (set2FirstServe)
// and the service order (team1FirstServe / team2FirstServe), and kept no
// service order at all once set 2 was under way (its events' snapshots have
// it). As savedSet3Toss for the break before set 3.

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
import { setFirstServer } from '../../utils_beach/coinToss_beach'
import { leftTeamInSet } from '../../utils_beach/courtSides_beach'


const MATCH = {
  id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach',
  coin_toss: { team_a: 'team1', team_b: 'team2', confirmed: true, first_serve: 'team1' },
  team1_data: { name: 'Müller/Weber' },
  team2_data: { name: 'Schmidt/Fischer' },
  players_team1: [{ number: 4 }, { number: 7 }],
  players_team2: [{ number: 3 }, { number: 9 }]
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

// set 1's end: A (team1) finished on the left, set 2 starts there; the
// service orders as given before set 1 (team1 #4, team2 #3 first)
const setEnd = { seq: 40, set_index: 1, type: 'set_end', payload: { winner: 'team1' }, created_at: '2026-10-09T10:00:00.000Z',
  state_snapshot: { teamAKey: 'team1', currentSetIndex: 1, setLeftTeamOverrides: { 1: 'A', 2: 'A' }, set2FirstServe: null, team1FirstServe: 4, team2FirstServe: 3 } }
// the break before set 2 after the choices: B (team2) took the left side, A
// moved right and serves with #7 first
const live = (over) => ({
  current_set: 2, set_interval_active: true, match_status: 'interval', points_a: 0, points_b: 0,
  team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer',
  side_a: 'right', serving_team: 'right', server_number: 7, last_event_type: 'manual_interval_setup',
  last_event_ts: '2026-10-09T10:00:30.000Z', ...over
})

describe('restore by PIN: the choices of the interval before set 2', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('in the break: set 2\'s side, its first server and the serving team\'s order (only the live row has them)', async () => {
    const restored = await restore({ events: [setEnd], liveState: live() })
    expect(leftTeamInSet(2, restored)).toBe('B')
    expect(setFirstServer(restored, 2)).toBe('team1')
    expect(restored.set2FirstServe).toBe('team1')
    expect(restored.team1FirstServe).toBe(7)
    // the receiving team's order: as last saved
    expect(restored.team2FirstServe).toBe(3)
    // set 1 as it finished
    expect(leftTeamInSet(1, restored)).toBe('A')
  })

  it('a live row older than the latest event: the events\' snapshot', async () => {
    const restored = await restore({ events: [setEnd], liveState: live({ last_event_ts: '2026-10-09T09:59:00.000Z' }) })
    expect(leftTeamInSet(2, restored)).toBe('A')
    expect(setFirstServer(restored, 2)).toBe('team2')
    expect(restored.team1FirstServe).toBe(4)
  })

  it('the live row\'s Team A is the other team (a swap still queued): the same team on the same side and serving', async () => {
    // the live row names team2 as its Team A: its side_a 'left' is team2's
    const restored = await restore({
      events: [setEnd],
      liveState: live({ team_a_name: 'Schmidt/Fischer', team_b_name: 'Müller/Weber', side_a: 'left', serving_team: 'right', server_number: 7 })
    })
    const leftKey = leftTeamInSet(2, restored) === 'A' ? restored.coinTossTeamA : (restored.coinTossTeamA === 'team1' ? 'team2' : 'team1')
    expect(leftKey).toBe('team2')
    expect(setFirstServer(restored, 2)).toBe('team1')
    expect(restored.team1FirstServe).toBe(7)
  })

  it('set 2 under way: the service orders and set 2\'s first server from the latest snapshot', async () => {
    const point = { seq: 45, set_index: 2, type: 'point', payload: { team: 'team2' }, created_at: '2026-10-09T10:05:00.000Z',
      state_snapshot: { teamAKey: 'team1', currentSetIndex: 2, setLeftTeamOverrides: { 1: 'A', 2: 'B' }, set2FirstServe: 'team1', team1FirstServe: 7, team2FirstServe: 9 } }
    const restored = await restore({
      events: [setEnd, point],
      liveState: live({ set_interval_active: false, match_status: 'live', points_b: 1, side_a: 'right', serving_team: 'left', server_number: 9, last_event_type: 'point', last_event_ts: '2026-10-09T10:05:01.000Z' })
    })
    expect(restored.set2FirstServe).toBe('team1')
    expect(restored.team1FirstServe).toBe(7)
    expect(restored.team2FirstServe).toBe(9)
    expect(leftTeamInSet(2, restored)).toBe('B')
  })
})
