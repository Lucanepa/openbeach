// After a reload mid-match the event history (db_beach/eventHistory_beach)
// has not seen the match row being written, so it does not know its
// seed_key. The scoreboard tells it when the match is open: the void job of
// an undone event is then queued INSIDE the action's transaction (it commits
// or rolls back with the undo) instead of in a second transaction after it,
// which a closed tab or a crash in between would lose. Ported from OpenVolley
// Scoreboard.jsx (rememberSeedKey effect, 248c239b).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import { rememberSeedKey, eventHistorySettled } from '../../db_beach/eventHistory_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'

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

const SEED = 'match_1_reload'
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

describe('Scoreboard_beach tells the event history the open match\'s seed_key', () => {
  it('after a reload, an undone event\'s void job is queued inside the action\'s transaction', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: SEED,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
    const eventId = await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })

    // A reload: the history's seed_key cache (200 matches) no longer has this match
    for (let i = 1; i <= 201; i++) rememberSeedKey(100000 + i, null, false)

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })

    // An action's transaction (db.tables, as useScorerActions) taking the event back
    let inside = null
    await db.transaction('rw', db.tables, async () => {
      await db.events.delete(eventId)
      inside = (await db.sync_queue.toArray()).filter(j => j.action === 'void')
    })
    expect(inside).toHaveLength(1)
    expect(inside[0].payload).toMatchObject({ external_id: `${SEED}:e:${eventId}`, match_id: SEED, reason: 'delete' })

    // and only once (no second job after the commit)
    await new Promise(r => setTimeout(r, 20))
    await eventHistorySettled()
    expect((await db.sync_queue.toArray()).filter(j => j.action === 'void')).toHaveLength(1)
  })
})
