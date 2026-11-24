// Laptop run of 2026-10-08 (OB-6): confirming a time-out showed the time-out
// as taken on the scoreboard while the request dialog was still open, and the
// countdown came one frame later. The time-out event and the countdown are one
// action: the screen never shows the taken time-out under the request.
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

const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text)

describe('Scoreboard_beach: confirming a time-out', () => {
  it('the request dialog closes with the time-out taken, in one change', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 300000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false, startTime: start })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: start }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(buttons('TO').filter(b => !b.disabled)).toHaveLength(2), { timeout: 8000 })

    fireEvent.click(buttons('TO')[0])
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(1))

    // what each committed change shows: the request dialog, a taken time-out
    const states = []
    const observer = new MutationObserver(() => {
      states.push({
        request: document.body.textContent.includes('Confirm time-out request?'),
        taken: buttons('TO').filter(b => b.disabled).length
      })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })

    fireEvent.click(buttons('Confirm time-out')[0])
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'timeout' }).count()).toBe(1))
    await new Promise(r => setTimeout(r, 400))
    observer.disconnect()

    expect(states.at(-1)).toMatchObject({ request: false, taken: 1 })
    expect(states.filter(s => s.request && s.taken > 0)).toEqual([])
    cleanup()
  }, 30000)
})
