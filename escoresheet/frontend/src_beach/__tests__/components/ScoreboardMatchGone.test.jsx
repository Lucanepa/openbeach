// Stress test 2026-10-25 (ob-db-deleted-loading-forever): the 'escoresheet'
// database was deleted under a running scorer (clear-db, the browser's
// "clear site data", an update that clears it). Dexie opened an empty one,
// the scoring screen's read found no match and it said 'Loading…' for good
// while every tap timed out. It now says the match is no longer on this
// device and points to Restore match. A take-back, which replaces the local
// copy and opens the new one at once, never shows it.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const builder = () => {
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej)
        return () => b
      }
    })
    return b
  }
  return { ...actual, apiFrom: () => builder() }
})

import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

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

const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const GONE = 'This match is no longer on this device'

async function addMatch(seed) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true, seed_key: seed,
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

const ui = (matchId, onOpenSetup) => (
  <ScaleProvider><AlertProvider><LoggingProvider>
    <Scoreboard matchId={matchId} onOpenSetup={onOpenSetup} />
  </LoggingProvider></AlertProvider></ScaleProvider>
)

describe('Scoreboard_beach: the match is gone from this device', () => {
  beforeEach(async () => {
    cleanup()
    useMemoryLocalStorage()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('says so and points to Restore match, with a way home, instead of Loading… for good', async () => {
    const matchId = await addMatch('match_1792931096817_gone')
    const onOpenSetup = vi.fn()
    render(ui(matchId, onOpenSetup))
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    // the database emptied under the screen
    await Promise.all(db.tables.map(t => t.clear()))
    await waitFor(() => expect(document.body.textContent).toContain(GONE), { timeout: 6000 })
    expect(document.body.textContent).toContain('Restore match')
    fireEvent.click(button('Home'))
    expect(onOpenSetup).toHaveBeenCalled()
  }, 30000)

  it('a take-back (the copy replaced and the new one opened at once) never shows it', async () => {
    const first = await addMatch('match_1792931096817_takeback')
    const view = render(ui(first, vi.fn()))
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    await db.transaction('rw', db.matches, db.sets, db.events, async () => {
      await db.events.where('matchId').equals(first).delete()
      await db.sets.where('matchId').equals(first).delete()
      await db.matches.delete(first)
    })
    const second = await addMatch('match_1792931096817_takeback')
    await new Promise(r => setTimeout(r, 200))
    view.rerender(ui(second, vi.fn()))
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    await new Promise(r => setTimeout(r, 2500))
    expect(document.body.textContent).not.toContain(GONE)
  }, 30000)
})
