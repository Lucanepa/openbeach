import { describe, it, expect, vi, beforeEach } from 'vitest'

// A match restored by its PIN without lineup events: the lineups come from
// the latest synced event. Its lineup_left / lineup_right are by court side
// (written by the scorer's court rule, courtSides_beach); its state snapshot
// has them by team (A / B). The restore guessed the side by the set number
// (odd sets A left, even sets A right), which is not beach's rule at all: the
// teams change courts every 7 points (5 in set 3) and at the TTO, and stay
// where they are between sets. And it read Team A from a coin_toss_team_a
// column the matches table does not have (the coin toss is the coin_toss
// JSON), so Team A was always team2. The restored match also lost its sides
// (setLeftTeamOverrides / set3LeftTeam), so the scorer's court showed A on
// the left whatever the court was.

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

const rich = (a, b, serving = false) => ({ I: { number: a, ...(serving ? { isServing: true } : {}) }, II: { number: b, ...(serving ? { isServing: true } : {}) } })
const T1 = (serving) => rich(7, 12, serving) // team1's players
const T2 = (serving) => rich(3, 21, serving) // team2's players

function restoreWith(event, { match = {}, liveState = null, events = [] } = {}) {
  const restoreByPin = async () => ({
    data: {
      match: { id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach', coin_toss: { team_a: 'team1', team_b: 'team2', confirmed: true }, ...match },
      sets: [],
      events: [...events, { seq: 10, type: 'point', payload: { team: 'team1' }, ...event }],
      liveState
    },
    error: null,
    status: 200
  })
  return fetchMatchByPin('123456', 12, { restoreByPin })
}
const lineupOf = (out, team) => out.events.find(e => e.type === 'lineup' && e.payload.team === team)?.payload.lineup

describe('fetchMatchByPin: lineups from the latest event go to the right team', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('set 1 after a change of courts (B on the left): the snapshot\'s lineups by team', async () => {
    const out = await restoreWith({
      set_index: 1,
      serve_team: 'team1',
      lineup_left: T2(false),
      lineup_right: T1(true),
      state_snapshot: { teamAKey: 'team1', currentSetIndex: 1, sideA: 'right', lineupA: T1(true), lineupB: T2(false), setLeftTeamOverrides: { 1: 'B' } }
    })
    expect(lineupOf(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineupOf(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('team A is team2: the snapshot\'s A lineup is team2\'s', async () => {
    const out = await restoreWith({
      set_index: 2,
      serve_team: 'team2',
      lineup_left: T2(true),
      lineup_right: T1(false),
      state_snapshot: { teamAKey: 'team2', currentSetIndex: 2, sideA: 'left', lineupA: T2(true), lineupB: T1(false) }
    }, { match: { coin_toss: { team_a: 'team2', team_b: 'team1' } } })
    expect(lineupOf(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineupOf(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('a snapshot of another set: the court-side columns, the side from the row\'s serve marks', async () => {
    // set 2 (A stays left from set 1, then a change of courts: B left); the
    // snapshot is set 3's (its lineups would be filed under set 2)
    const out = await restoreWith({
      set_index: 2,
      serve_team: 'team2',
      lineup_left: T2(true),
      lineup_right: T1(false),
      state_snapshot: { teamAKey: 'team1', currentSetIndex: 3, lineupA: rich(99, 98), lineupB: rich(97, 96) }
    })
    expect(lineupOf(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineupOf(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('a row without a snapshot or serve marks: the scorer\'s rule with the match\'s last saved sides', async () => {
    const out = await restoreWith(
      { set_index: 2, lineup_left: T2(false), lineup_right: T1(false) },
      { events: [{ seq: 5, set_index: 2, type: 'point', state_snapshot: { teamAKey: 'team1', currentSetIndex: 2, setLeftTeamOverrides: { 1: 'B', 2: 'B' } } }] }
    )
    expect(lineupOf(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineupOf(out, 'team2')).toEqual({ I: 3, II: 21 })
  })

  it('without an event lineup: the live state\'s lineup_a goes to Team A from the coin toss JSON', async () => {
    const restoreByPin = async () => ({
      data: {
        match: { id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach', coin_toss: { team_a: 'team1', team_b: 'team2' } },
        sets: [],
        events: [],
        liveState: { current_set: 1, side_a: 'left', lineup_a: T1(true), lineup_b: T2(false) }
      },
      error: null,
      status: 200
    })
    const out = await fetchMatchByPin('123456', 12, { restoreByPin })
    expect(lineupOf(out, 'team1')).toEqual({ I: 7, II: 12 })
    expect(lineupOf(out, 'team2')).toEqual({ I: 3, II: 21 })
  })
})

describe('the restored match keeps its court sides', () => {
  beforeEach(() => { added.matches.length = 0 })

  it('the latest snapshot\'s setLeftTeamOverrides and set3LeftTeam', async () => {
    const out = await restoreWith({
      set_index: 3,
      serve_team: 'team1',
      lineup_left: T2(false),
      lineup_right: T1(true),
      state_snapshot: { teamAKey: 'team1', currentSetIndex: 3, lineupA: T1(true), lineupB: T2(false), set3LeftTeam: 'A', setLeftTeamOverrides: { 1: 'B', 2: 'A', 3: 'B' } }
    })
    await importMatchFromSupabase(out)
    expect(added.matches[0].setLeftTeamOverrides).toEqual({ 1: 'B', 2: 'A', 3: 'B' })
    expect(added.matches[0].set3LeftTeam).toBe('A')
  })

  it('without a snapshot: the live state\'s side_a for its set', async () => {
    const restoreByPin = async () => ({
      data: {
        match: { id: 'uuid', external_id: 'seed', game_n: 12, status: 'live', sport_type: 'beach', coin_toss: { team_a: 'team1', team_b: 'team2' } },
        sets: [],
        events: [],
        liveState: { current_set: 2, side_a: 'right', lineup_a: T1(true), lineup_b: T2(false) }
      },
      error: null,
      status: 200
    })
    const out = await fetchMatchByPin('123456', 12, { restoreByPin })
    await importMatchFromSupabase(out)
    expect(added.matches[0].setLeftTeamOverrides).toEqual({ 2: 'B' })
  })
})
