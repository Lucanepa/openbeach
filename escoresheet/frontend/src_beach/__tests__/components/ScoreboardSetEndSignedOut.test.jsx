// The owner's screencast of 2026-10-08 (batch VS, issue 16): at the set end a
// device that is not signed in was held up by "Syncing to cloud…". On the
// real scoring screen over the app's Dexie database (fake IndexedDB), signed
// out: the set ends without the sync progress modal, its jobs are queued.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
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

const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

describe('Scoreboard_beach: set end while signed out (issue 16)', () => {
  it('no sync progress modal; the set is finished and its sync jobs wait in the queue', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_signed_out',
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: 13, finished: false, startTime: new Date(Date.now() - 900000).toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })

    // every title the sync progress modal can show
    let syncModalSeen = false
    const titles = /^(Syncing…|Not synced|Saved on this device|Synced)$/
    const observer = new MutationObserver(() => {
      if ([...document.querySelectorAll('h1,h2,h3,[role="dialog"] *')].some(e => titles.test(e.textContent.trim()))) syncModalSeen = true
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Point A'))

    // the set end time
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 8000 })
    const started = Date.now()
    fireEvent.click(button('Confirm'))
    await waitFor(async () => {
      const sets = await db.sets.where('matchId').equals(matchId).toArray()
      expect(sets.find(s => s.index === 1)?.finished).toBe(true)
      expect(sets.some(s => s.index === 2)).toBe(true)
    }, { timeout: 8000 })
    await waitFor(() => expect(document.querySelector('[data-testid="set-transition-status"]')).toBeNull(), { timeout: 8000 })
    observer.disconnect()

    expect(syncModalSeen).toBe(false)
    // not held up by the 1.5 s "warning" pause
    expect(Date.now() - started).toBeLessThan(1500)
    const jobs = await db.sync_queue.toArray()
    expect(jobs.some(j => j.resource === 'set' && j.action === 'update' && j.status === 'queued')).toBe(true)
    cleanup()
  }, 40000)
})
