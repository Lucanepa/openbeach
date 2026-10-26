// The live state's match number: match_live_state.game_n is an integer
// column. A Match No. typed as "12.5" (the field took any text) went into
// every push as 12.5 and the backend refused each one (22P02): the match
// never reached the livescore or the remote scoreboards (stress test
// 2026-10-25). A match saved that way still scores; its push now carries no
// number, and a number as before.
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

async function setUpLiveSet(gameN) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_live_game_number_test', gameN, game_n: Number(gameN),
    externalId: '11111111-2222-4333-8444-555555555557',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2',
    team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'A' }
  })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
  await db.events.add({ matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: start })
  return matchId
}

const pointStates = () => upserts.filter(u => u.table === 'match_live_state' && u.row.last_event_type === 'point').map(u => u.row)

async function scoreAPoint(matchId) {
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
  // the set's start (its first rally starts with it)
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 8000 })
  await settle()
  fireEvent.click(button('Point A'))
  await waitFor(() => expect(pointStates().length).toBeGreaterThan(0), { timeout: 8000 })
  return pointStates().at(-1)
}

describe('Scoreboard_beach: the live state\'s match number', () => {
  it('a match number saved as 12.5 is not sent to the integer column', async () => {
    const state = await scoreAPoint(await setUpLiveSet('12.5'))
    expect(state.game_n).toBeNull()
    cleanup()
  }, 60000)

  it('a match number 12 is sent as 12', async () => {
    const state = await scoreAPoint(await setUpLiveSet('12'))
    expect(state.game_n).toBe(12)
    cleanup()
  }, 60000)
})
