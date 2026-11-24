// A double tap on the set end's Confirm: the dialog closes at once, and the
// second tap landed on "End set interval" under it, so the interval ended
// before it began and the screen went straight to "Start set" (stress test
// 2026-10-25, 3 of 4 double taps at 120 to 400 ms). Taps right after the
// Confirm are swallowed, as after the other scorer confirms.
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
import { GHOST_CLICK_MS, resetGhostClickGuard } from '../../hooks_beach/useConfirmAction_beach'

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
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_set_end_double_tap',
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

describe('Scoreboard_beach: a double tap on the set end\'s Confirm', () => {
  it('the second tap does not end the interval', async () => {
    resetGhostClickGuard()
    const matchId = await setUpMatch({ index: 1, a: 4 })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy())
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point B')).toBeTruthy())
    await settle()
    fireEvent.click(button('Point B'))
    await waitFor(() => expect(document.body.textContent).toContain('Set 1 end'), { timeout: 8000 })
    await settle()
    await waitFor(() => expect(button('Confirm')).toBeTruthy())
    const confirmedAt = Date.now()
    fireEvent.click(button('Confirm'))
    // the second tap of the double tap, on what is under the dialog now
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 2000 })
    expect(Date.now() - confirmedAt).toBeLessThan(GHOST_CLICK_MS)
    fireEvent.click(button('End set interval'))
    await new Promise(r => setTimeout(r, 800))
    expect(button('End set interval')).toBeTruthy()
    cleanup()
  }, 60000)
})
