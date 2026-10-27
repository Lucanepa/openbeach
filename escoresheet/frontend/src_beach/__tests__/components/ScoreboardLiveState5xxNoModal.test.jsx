// Stress test 2026-10-25 (ob-livestate-5xx-blocking-modal): one live-state
// upsert answered 502 (a Cloudflare page while the backend restarts) or 503
// (database unavailable) opened "Scoresheet error / Sync failed" over the
// scoring screen; the tap on Start rally landed on its backdrop. The point
// itself was saved and synced. A transient failure is no modal now: the
// state is held for the sync queue, the next push supersedes it.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

const live = vi.hoisted(() => ({ upserts: [], answer: null }))
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const builder = (table) => {
    let isUpsert = false
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const result = isUpsert && table === 'match_live_state' && live.answer ? live.answer : { data: null, error: null }
          return (res, rej) => Promise.resolve(result).then(res, rej)
        }
        if (prop === 'upsert') return (row) => { isUpsert = true; live.upserts.push({ table, row }); return b }
        return () => b
      }
    })
    return b
  }
  return { ...actual, apiFrom: (table) => builder(table) }
})
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isBackendAvailable: () => true }
})

import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { heldLiveState } from '../../utils_beach/liveStateOutbox_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
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
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

// a tap on the rally buttons the moment they changed is the end of the tap
// that changed them (Scoreboard_beach rallyButtonsJustShown): wait as a scorer does
const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const SEED = 'match_1792931096817_live5xx'

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false,
    externalId: '11111111-2222-4333-8444-555555555555', seed_key: SEED,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false, startTime: start })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
    { matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: 3, ts: start },
    { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: start }
  ])
  return matchId
}

const ui = (matchId) => <ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>

describe('Scoreboard_beach: a transient live-state failure', () => {
  beforeEach(async () => {
    cleanup()
    useMemoryLocalStorage()
    live.upserts.length = 0
    live.answer = null
    await Promise.all(db.tables.map(t => t.clear()))
  })

  for (const [label, error] of [
    ['a 502 page', { message: 'Database operation failed (502)', status: 502 }],
    ['a 503 database unavailable', { message: 'Database unavailable', status: 503, code: 'OV_DB_UNAVAILABLE' }]
  ]) {
    it(`${label}: no "Sync failed" modal over the scoring screen; the state is held for the queue`, async () => {
      const matchId = await setUpMatch()
      render(ui(matchId))
      await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
      live.answer = { data: null, error }
      fireEvent.click(button('Start rally'))
      await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
      await settle()
      fireEvent.click(button('Point A'))
      await waitFor(() => expect(live.upserts.some(u => u.table === 'match_live_state' && u.row.last_event_type === 'point')).toBe(true), { timeout: 5000 })
      await new Promise(r => setTimeout(r, 300))
      expect(document.body.textContent).not.toContain('Sync failed')
      expect(heldLiveState(SEED)).toMatchObject({ last_event_type: 'point' })
      // the next tap is a tap on the scoring screen
      await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    }, 30000)
  }
})
