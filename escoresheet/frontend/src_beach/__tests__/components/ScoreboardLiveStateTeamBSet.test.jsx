// The live state at a set end won by team B (the coin toss's B; here team2).
//
// The set_end push counted the set for its winner by comparing it with the
// snapshot's teamBKey, which captureStateSnapshot never returned: a set won
// by B was never counted. In the interval after it the sets read 0-0, and
// at the end of a match B won the push said sets 0-1, set 3, 'interval':
// the referee showed "1:0", the remote scoreboard LIVE, the livescore 0:0,
// and nothing corrected it, the scorer sends no more pushes (stress test
// 2026-10-25). On the real scoring screen over the app's Dexie database
// (fake IndexedDB), the backend on, its live-state write recorded.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

const upserts = vi.hoisted(() => [])
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true
}))
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const result = { data: null, error: null }
  const chain = (table) => {
    const q = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return (res, rej) => Promise.resolve(result).then(res, rej)
        if (key === 'upsert') return (row) => { upserts.push({ table, row }); return q }
        return () => q
      }
    })
    return q
  }
  return { ...actual, apiFrom: (table) => chain(table) }
})

import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
beforeEach(async () => {
  cleanup()
  upserts.length = 0
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

// team1 is coin-toss team A, team2 B; set `index` at `a`:20 under way
async function setUpMatch({ index, a, finished = [] }) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 1200000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_live_team_b_test',
    externalId: '11111111-2222-4333-8444-555555555556',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2',
    team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'A', 2: 'A' }
  })
  let seq = 1
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: start })
  for (const set of finished) {
    await db.sets.add({ matchId, index: set.index, team1Points: set.team1, team2Points: set.team2, finished: true, startTime: start, endTime: start })
    await db.events.add({ matchId, setIndex: set.index, type: 'set_start', payload: {}, seq: seq++, ts: start })
    await db.events.add({ matchId, setIndex: set.index, type: 'set_end', payload: { team: set.team1 > set.team2 ? 'team1' : 'team2', setIndex: set.index, team1Points: set.team1, team2Points: set.team2 }, seq: seq++, ts: start })
  }
  await db.sets.add({ matchId, index, team1Points: a, team2Points: 20, finished: false, startTime: start })
  return matchId
}

// team2 (B) scores the set's last point (a:21) and the set end is confirmed
async function teamBEndsTheSet(title) {
  // the set's start (its first rally started with it)
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point B')).toBeTruthy())
  await settle()
  fireEvent.click(button('Point B'))
  await waitFor(() => expect(document.body.textContent).toContain(title), { timeout: 8000 })
  await settle()
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
}
const setEndStates = () => upserts.filter(u => u.table === 'match_live_state' && u.row.last_event_type === 'set_end').map(u => u.row)

describe('Scoreboard_beach: the live state counts a set won by team B', () => {
  it('set 1 won by B: the interval shows sets 0-1', async () => {
    const matchId = await setUpMatch({ index: 1, a: 4 })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await teamBEndsTheSet('Set 1 end')
    await waitFor(() => expect(setEndStates().length).toBeGreaterThan(0), { timeout: 8000 })
    const state = setEndStates().at(-1)
    expect([state.sets_won_a, state.sets_won_b]).toEqual([0, 1])
    expect(state.current_set).toBe(2)
    expect(state.match_status).toBe('interval')
    cleanup()
  }, 60000)

  it('the match won by B 2-0: ended, sets 0-2, set 2', async () => {
    const matchId = await setUpMatch({ index: 2, a: 4, finished: [{ index: 1, team1: 4, team2: 21 }] })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await teamBEndsTheSet('Match end')
    await waitFor(() => expect(setEndStates().length).toBeGreaterThan(0), { timeout: 8000 })
    const state = setEndStates().at(-1)
    expect([state.sets_won_a, state.sets_won_b]).toEqual([0, 2])
    expect(state.current_set).toBe(2)
    expect(state.match_status).toBe('ended')
    cleanup()
  }, 60000)
})

// The local scoreboard (BroadcastChannel) and the venue relay get the same
// state (broadcastToScoreboard). Their last one at the match end was the
// set_end event's snapshot, taken before the set counted: "Set 2 • 0 - 1",
// not ended, for good, whichever team won (stress test 2026-10-25)
describe('Scoreboard_beach: the local scoreboard at the match end', () => {
  const local = []
  let channel
  beforeEach(() => {
    local.length = 0
    channel = new BroadcastChannel('openbeach-scoreboard')
    channel.onmessage = (e) => { if (e.data?.type === 'LIVE_STATE_UPDATE') local.push(e.data.data) }
  })
  afterEach(() => channel.close())

  it('the match won by B 2-0: ended, sets 0-2', async () => {
    const matchId = await setUpMatch({ index: 2, a: 4, finished: [{ index: 1, team1: 4, team2: 21 }] })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await teamBEndsTheSet('Match end')
    await waitFor(() => {
      const last = local.at(-1)
      expect([last?.sets_won_a, last?.sets_won_b, last?.match_status]).toEqual([0, 2, 'ended'])
    }, { timeout: 8000 })
    cleanup()
  }, 60000)
})

// The same at a set end: the local scoreboard's and the relay's last state
// was the set_end event's snapshot (set 1, sets 0-0) for the whole interval.
// The database row of that action counts the set but is stamped as the action
// runs, the relay's copy just after it: a referee kept the relay's as the
// newer and read sets 0-0 in the interval (stress fixes, integration
// 2026-10-26). The state goes out again once the set counted, stamped after
// the row.
describe('Scoreboard_beach: the local scoreboard and the relay at a set end', () => {
  const local = []
  let channel
  beforeEach(() => {
    local.length = 0
    channel = new BroadcastChannel('openbeach-scoreboard')
    channel.onmessage = (e) => { if (e.data?.type === 'LIVE_STATE_UPDATE') local.push(e.data.data) }
  })
  afterEach(() => channel.close())

  it('set 1 won by B: set 2, sets 0-1, not older than the database row', async () => {
    const matchId = await setUpMatch({ index: 1, a: 4 })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await teamBEndsTheSet('Set 1 end')
    await waitFor(() => expect(setEndStates().length).toBeGreaterThan(0), { timeout: 8000 })
    await waitFor(() => {
      const last = local.at(-1)
      expect([last?.current_set, last?.sets_won_a, last?.sets_won_b]).toEqual([2, 0, 1])
    }, { timeout: 8000 })
    expect(Date.parse(local.at(-1).updated_at)).toBeGreaterThanOrEqual(Date.parse(setEndStates().at(-1).updated_at))
    cleanup()
  }, 60000)
})
