// The live state the referee and the livescore read in the set interval: its
// side_a is the side team A plays the next set on, by the scorer's own rule
// (courtSides_beach: the teams stay where they finished the set, its changes
// of courts and the TTO's included; FIVB beach rule 18.1.1). It alternated
// the sides by the set's number: a set 1 that ended with A on the left (4
// changes of courts: 7, 14, the TTO at 21, 28) showed A on the right in the
// interval. On the real scoring screen over the app's Dexie database (fake
// IndexedDB), the backend on, its live-state write recorded.
import '../helpers/fakeIndexedDb'
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

// Set 1 at 20:a, with `overrides` the sides its changes of courts left (the
// TTO's included); team1 is coin-toss team A
async function setUpSet1({ a, overrides }) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 1200000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_live_sides_test',
    externalId: '11111111-2222-4333-8444-555555555555',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2',
    team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: overrides
  })
  await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: a, finished: false, startTime: start })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
  return matchId
}

// team1 scores the set's last point (21:a) and the set end is confirmed: the
// interval's live state
async function endSet1() {
  // the set's start (its first rally started with it)
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  // team1 is team A (coinTossTeamA team1): its button is "Point A"
  await waitFor(() => expect(button('Point A')).toBeTruthy())
  fireEvent.click(button('Point A'))
  await waitFor(() => expect(document.body.textContent).toContain('Set 1 end'), { timeout: 8000 })
  await settle()
  // the set-end dialog's Confirm (its end time as proposed)
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(intervalState()).toBeTruthy(), { timeout: 8000 })
  return intervalState()
}
const intervalState = () => upserts
  .filter(u => u.table === 'match_live_state' && u.row.set_interval_active && u.row.current_set === 2)
  .at(-1)?.row

describe('Scoreboard_beach: the live state of the set interval keeps the sides the set ended on', () => {
  it('set 1 ended 21:10 with A on the left (4 changes: 7, 14, the TTO at 21, 28): set 2 shows A on the left', async () => {
    const matchId = await setUpSet1({ a: 10, overrides: { 1: 'A' } })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const state = await endSet1()
    expect(state.side_a).toBe('left')
    // the side set 2 is created on for the scorer's screen
    await waitFor(async () => expect((await db.matches.get(matchId)).setLeftTeamOverrides?.[2]).toBe('A'), { timeout: 8000 })
    cleanup()
  }, 60000)

  it('set 1 ended 21:16 with B on the left (5 changes, the TTO\'s among them): set 2 shows A on the right', async () => {
    const matchId = await setUpSet1({ a: 16, overrides: { 1: 'B' } })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const state = await endSet1()
    expect(state.side_a).toBe('right')
    cleanup()
  }, 60000)
})
