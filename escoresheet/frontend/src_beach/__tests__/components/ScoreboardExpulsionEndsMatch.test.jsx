// Laptop run of 2026-10-08 (OB-13): an expulsion whose forfeited set ends the
// match (the opponent already won a set) was confirmed as "Confirm set end /
// This will end the current set / End Set". The opponent's sets were counted
// by a set 'winner' field the set rows do not have, so it was always 0.
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

const clickButton = (text) => fireEvent.click(buttons(text).filter(b => !b.disabled).at(-1))

describe('Scoreboard_beach: an expulsion that ends the match', () => {
  it('is confirmed as the match end, not as a set end', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const at = new Date(Date.now() - 600000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'A', 2: 'B' }
    })
    // team 2 won set 1: losing set 2 by expulsion ends the match for team 1
    await db.sets.add({ matchId, index: 1, team1Points: 15, team2Points: 21, finished: true, startTime: at, endTime: at })
    await db.sets.add({ matchId, index: 2, team1Points: 3, team2Points: 2, finished: false, startTime: at })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: at },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: at },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: at }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const player = () => document.querySelector('.court-player[data-team="team1"][data-player-number="1"]')
    await waitFor(() => expect(player()).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(player())
    await waitFor(() => expect(buttons('Sanction').length).toBeGreaterThan(0))
    clickButton('Sanction')
    await waitFor(() => expect(buttons('Expulsion').length).toBeGreaterThan(0))
    clickButton('Expulsion')
    await waitFor(() => expect(buttons('Confirm').length).toBeGreaterThan(0))
    clickButton('Confirm')

    await waitFor(() => expect(buttons('End Match').length + buttons('End Set').length).toBe(1))
    expect(document.body.textContent).toContain('Confirm match end')
    expect(document.body.textContent).not.toContain('Confirm set end')
    expect(buttons('End Match')).toHaveLength(1)
    cleanup()
  }, 30000)
})
