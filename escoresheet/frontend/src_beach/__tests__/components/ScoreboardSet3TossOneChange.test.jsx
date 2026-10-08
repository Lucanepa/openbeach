// Checked in OpenBeach for the OpenVolley finding OV-12 (laptop run
// 2026-10-08: confirming the set 5 setup removed the interval countdown a
// frame before the court showed). Beach has no setup confirm in the interval;
// its set 3 setup starts with the coin toss winner, and that tap wrote the
// toss, its event and the event's snapshot in three transactions: in Chrome
// the toss buttons gave way to the sides / serve buttons and LAST ACTION
// named the toss winner 117 ms (6 frames) later. The toss is one scorer
// action now: one change.
// The real scoring screen over the app's Dexie database (fake IndexedDB).
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

describe('Scoreboard_beach: the set 3 coin toss in the interval', () => {
  it('the toss buttons give way with the toss in LAST ACTION, in one change', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
      { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const toss = () => document.querySelector('[data-testid="set3-toss-A"]')
    await waitFor(() => expect(toss()).toBeTruthy(), { timeout: 8000 })

    // what each committed change shows: the toss buttons, the toss in LAST ACTION
    const tossInLastAction = () => /coin toss/i.test(document.querySelector('[data-testid="last-action"]')?.textContent || '')
    const states = []
    const observer = new MutationObserver(() => {
      states.push({ tossButtons: !!toss(), lastAction: tossInLastAction() })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    fireEvent.click(toss())
    await waitFor(() => expect(tossInLastAction()).toBe(true), { timeout: 5000 })
    await new Promise(r => setTimeout(r, 400))
    observer.disconnect()

    expect((await db.matches.get(matchId)).set3CoinTossWinner).toBe('team1')
    expect(await db.events.where({ matchId, type: 'set3_coin_toss_winner' }).count()).toBe(1)
    expect(states.at(-1)).toEqual({ tossButtons: false, lastAction: true })
    // never the toss buttons gone with LAST ACTION not naming the toss yet
    expect(states.filter(st => st.tossButtons === st.lastAction)).toEqual([])
    cleanup()
  }, 30000)
})
