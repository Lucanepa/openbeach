// Laptop run of 2026-10-08 (OB-19): the page was reloaded during a rally of
// set 2 (team B on the left); after that rally a tap on a court player opened
// no menu (no sanction, no medical) until the next reload. handlePlayerClick
// read rallyStatus / isRallyReplayed from a stale closure: its useCallback
// listed only playerActionMenu and leftisTeam1, so it was last rebuilt when the
// sides arrived with the data, while the rally was in play.
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

describe('Scoreboard_beach: the player menu after a rally', () => {
  it('opens once the rally has ended', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const at = new Date(Date.now() - 60000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      // team 2 (B) on the left: the sides change when the data arrives
      setLeftTeamOverrides: { 1: 'B' }
    })
    const setId = await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: at })
    // the set start began the first rally: in play
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: at },
      { matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: 3, ts: at }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(buttons('Point A').length).toBeGreaterThan(0), { timeout: 8000 })
    fireEvent.click(buttons('Point A')[0])
    await waitFor(() => expect(buttons('Start rally')).toHaveLength(1))

    const player = document.querySelector('.court-player[data-team="team2"][data-player-number="1"]')
    fireEvent.click(player)
    await waitFor(() => expect(buttons('Sanction').length).toBeGreaterThan(0))
    expect((await db.sets.get(setId)).team1Points + (await db.sets.get(setId)).team2Points).toBe(1)
    cleanup()
  }, 30000)
})
