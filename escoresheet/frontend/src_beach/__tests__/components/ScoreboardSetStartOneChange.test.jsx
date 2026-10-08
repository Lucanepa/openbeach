// Laptop run of 2026-10-08 (OB-15): confirming the set start time closed the
// dialog one frame (79 ms) before the set start showed on the scoreboard: the
// set row, the set start, the rally start and the dialog were separate writes.
// They are one action, as in OpenVolley.
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

describe('Scoreboard_beach: confirming the set start time', () => {
  it('the dialog closes with the set started, in one change', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const toss = new Date(Date.now() - 60000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: toss })

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(buttons('Start set')).toHaveLength(1), { timeout: 8000 })
    fireEvent.click(buttons('Start set')[0])
    await waitFor(() => expect(document.body.textContent).toContain('Confirm the start time for Set 1'))

    // what each committed change shows: the start time dialog, the set started
    const states = []
    const observer = new MutationObserver(() => {
      states.push({
        dialog: document.body.textContent.includes('Confirm the start time for Set 1'),
        started: buttons('Start set').length === 0
      })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })

    fireEvent.click(buttons('Confirm').at(-1))
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'rally_start' }).count()).toBe(1))
    await new Promise(r => setTimeout(r, 400))
    observer.disconnect()

    expect(states.at(-1)).toMatchObject({ dialog: false, started: true })
    // never the dialog gone with the set not started yet, or the other way round
    expect(states.filter(s => s.dialog === s.started)).toEqual([])
    cleanup()
  }, 30000)
})
