// The live state during the break between two sets. set_interval_active was
// true only on the set end's own push: it needed the match status
// 'interval', which the scorer never writes, so every later push in the
// break (an undo, the set 3 toss) told the referee and the livescore the
// break was over (found by a check, 2026-10-09). Every push while the
// scorer's interval runs now keeps it, with the set end's start time, as
// OpenVolley's set 5 setup pushes do (keepInterval).
// On the real scoring screen over the app's Dexie database (fake IndexedDB),
// the backend on, its live-state writes recorded.
import '../helpers/fakeIndexedDb'
import { intervalChoiceShown, tapInterval, serveOrderChange } from '../helpers/intervalChoice'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
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
const bAll = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text && !b.disabled)
const toss = (label) => document.querySelector(`[data-testid="set3-toss-${label}"]`)
const liveStates = () => upserts.filter(u => u.table === 'match_live_state').map(u => u.row)

const liveRows = (type) => liveStates().filter(r => r.last_event_type === type)

describe('Scoreboard_beach: the live state keeps the break between sets', () => {
  it('set 2 won, the toss, its undo: the undo\'s push keeps the break (set 3, 0:0, the set end\'s start time); End set interval ends it', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 2400000).toISOString()
    const start2 = new Date(Date.now() - 1200000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'test-seed-break',
      externalId: '11111111-2222-4333-8444-555555555557',
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'A', 2: 'A' }
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start2 })
    await db.sets.add({ matchId, index: 2, team1Points: 15, team2Points: 20, finished: false, startTime: start2 })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start2 },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start2 }
    ])
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

    // set 2 won by B 15:21 on the screen
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point B')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Point B'))
    await waitFor(() => expect(document.body.textContent).toContain('Set 2 end'), { timeout: 8000 })
    await settle()
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 8000 })
    await waitFor(() => expect(liveRows('set_end').length).toBeGreaterThan(0), { timeout: 5000 })
    const setEnd = liveRows('set_end').at(-1)
    expect(setEnd).toMatchObject({ set_interval_active: true, current_set: 3 })
    await settle()

    // the toss, then its undo: both in the break
    fireEvent.click(toss('B'))
    await waitFor(() => expect(intervalChoiceShown()).toBeTruthy(), { timeout: 5000 })
    await settle()
    upserts.length = 0
    fireEvent.click(button('Undo'))
    await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
    fireEvent.click(bAll('Undo').at(-1))
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 5000 })
    await waitFor(() => expect(liveRows('undo').length).toBeGreaterThan(0), { timeout: 5000 })
    const undo = liveRows('undo').at(-1)
    expect(undo).toMatchObject({ set_interval_active: true, match_status: 'interval', current_set: 3, points_a: 0, points_b: 0, sets_won_a: 1, sets_won_b: 1 })
    // the same break as the set end's: the referee's countdown does not restart
    expect(Math.abs(Date.parse(undo.set_interval_started_at) - Date.parse(setEnd.set_interval_started_at))).toBeLessThan(2000)
    await settle()

    // End set interval: the break is over
    fireEvent.click(button('End set interval'))
    await waitFor(() => expect(liveRows('end_interval').length).toBeGreaterThan(0), { timeout: 5000 })
    expect(liveRows('end_interval').at(-1)).toMatchObject({ set_interval_active: false, match_status: 'in_progress' })
    cleanup()
  }, 60000)
})
