// The owner's screencast of 2026-10-08 (batch VS, issue 2): "Switch sides" in
// the set interval, on the real scoring screen over the app's Dexie database
// (fake IndexedDB). A double tap is two switches: the side comes back.
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

async function setUpInterval() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const end = new Date(Date.now() - 30000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    // set 1 finished with B on the left; set 2 starts there (rule 18.1.1)
    setLeftTeamOverrides: { 1: 'B', 2: 'B' }
  })
  await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: new Date(Date.now() - 1200000).toISOString(), endTime: end })
  await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: end },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: end },
    { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: end }
  ])
  return matchId
}

describe('Scoreboard_beach: "Switch sides" in the 1-2 interval (issue 2)', () => {
  it('one tap flips the side, a double tap leaves it', async () => {
    const matchId = await setUpInterval()
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(button('Switch sides')).toBeTruthy(), { timeout: 8000 })
    const left = async () => (await db.matches.get(matchId)).setLeftTeamOverrides?.[2]

    // a double tap, both taps before the screen re-renders
    const b = button('Switch sides')
    fireEvent.click(b)
    fireEvent.click(b)
    await new Promise(r => setTimeout(r, 400))
    expect(await left()).toBe('B')

    fireEvent.click(button('Switch sides'))
    await waitFor(async () => expect(await left()).toBe('A'))
    cleanup()
  }, 30000)
})
