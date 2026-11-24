// The live state of a time-out: its length is the 45 s the screen and its
// relay action count (TEAM_TIMEOUT_SECONDS). The row said 30, and a referee
// tablet that took it from the row counted 30 (stress test 2026-10-25).
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

async function setUpLiveSet() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_live_timeout_test',
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

describe('Scoreboard_beach: the live state of a time-out', () => {
  it('says the 45 s the screen counts', async () => {
    const matchId = await setUpLiveSet()
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(document.querySelector('button[title="Timeout"]:not([disabled])')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(document.querySelector('button[title="Timeout"]:not([disabled])'))
    await waitFor(() => expect(button('Confirm time-out')).toBeTruthy())
    fireEvent.click(button('Confirm time-out'))
    const timeoutStates = () => upserts.filter(u => u.table === 'match_live_state' && u.row.last_event_type === 'timeout').map(u => u.row)
    await waitFor(() => expect(timeoutStates().length).toBeGreaterThan(0), { timeout: 8000 })
    const state = timeoutStates().at(-1)
    expect(state.timeout_active).toBe(true)
    expect(state.last_event_data).toEqual({ duration: 45 })
    cleanup()
  }, 60000)

  // The relay's live state is this screen's broadcast (the local scoreboard
  // gets the same): it carried no start of the time-out, so a referee that
  // opened during the time-out could not count it (stress test 2026-10-25)
  it('the local scoreboard and the relay get the running time-out\'s start', async () => {
    const local = []
    const channel = new BroadcastChannel('openbeach-scoreboard')
    channel.onmessage = (e) => { if (e.data?.type === 'LIVE_STATE_UPDATE') local.push(e.data.data) }
    try {
      const matchId = await setUpLiveSet()
      render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
      await waitFor(() => expect(document.querySelector('button[title="Timeout"]:not([disabled])')).toBeTruthy(), { timeout: 8000 })
      await settle()
      fireEvent.click(document.querySelector('button[title="Timeout"]:not([disabled])'))
      await waitFor(() => expect(button('Confirm time-out')).toBeTruthy())
      const before = Date.now()
      fireEvent.click(button('Confirm time-out'))
      await waitFor(() => {
        const last = local.at(-1)
        expect(last?.timeout_active).toBe(true)
        expect(Math.abs(Date.parse(last?.timeout_started_at) - before)).toBeLessThan(5000)
      }, { timeout: 8000 })
    } finally {
      channel.close()
      cleanup()
    }
  }, 60000)
})

