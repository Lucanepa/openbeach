// The scoreboard's debug lines carry a state snapshot. It counted sets won by
// s.winner and read team1Score / team2Score: no set has those fields, so every
// snapshot said 0 : 0 in sets with no score. A set has team1Points /
// team2Points and `finished`.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import { debugLogger } from '../../utils_beach/debugLogger_beach'
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

describe('Scoreboard_beach: the debug state snapshot', () => {
  it('has the set score and the sets each team won', async () => {
    const logSpy = vi.spyOn(debugLogger, 'log')
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 1800000).toISOString()
    const set2 = new Date(Date.now() - 300000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: set2 },
      { matchId, index: 2, team1Points: 3, team2Points: 1, finished: false, startTime: set2 }
    ])
    const events = [
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start }
    ]
    let seq = 3
    for (let i = 0; i < 36; i++) {
      events.push({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: start })
      events.push({ matchId, setIndex: 1, type: 'point', payload: { team: i < 21 ? 'team1' : 'team2' }, seq: seq++, ts: start })
    }
    events.push({ matchId, setIndex: 1, type: 'set_end', payload: { team: 'team1', setIndex: 1 }, seq: seq++, ts: set2 })
    events.push({ matchId, setIndex: 2, type: 'set_start', payload: {}, seq: seq++, ts: set2 })
    for (const team of ['team1', 'team2', 'team1', 'team1']) {
      events.push({ matchId, setIndex: 2, type: 'rally_start', payload: {}, seq: seq++, ts: set2 })
      events.push({ matchId, setIndex: 2, type: 'point', payload: { team }, seq: seq++, ts: set2 })
    }
    await db.events.bulkAdd(events)

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(buttons('TO').filter(b => !b.disabled)).toHaveLength(2), { timeout: 8000 })

    fireEvent.click(buttons('TO')[0])
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(1))
    fireEvent.click(buttons('Confirm time-out')[0])
    await waitFor(() => expect(logSpy.mock.calls.some(c => c[0] === 'TIMEOUT')).toBe(true), { timeout: 5000 })

    const snapshot = logSpy.mock.calls.find(c => c[0] === 'TIMEOUT')[2]
    expect(snapshot).toMatchObject({ setIndex: 2, team1Score: 3, team2Score: 1, team1SetsWon: 1, team2SetsWon: 0 })
  }, 20000)
})

describe('debugLogger_beach createStateSnapshot', () => {
  it('counts the finished sets each team won and reads the set score', async () => {
    const { createStateSnapshot } = await import('../../utils_beach/debugLogger_beach')
    const sets = [
      { index: 1, team1Points: 21, team2Points: 17, finished: true },
      { index: 2, team1Points: 19, team2Points: 21, finished: true },
      { index: 3, team1Points: 9, team2Points: 6, finished: false }
    ]
    expect(createStateSnapshot({ match: { id: 1 }, sets, currentSet: sets[2], events: [] }))
      .toMatchObject({ setIndex: 3, team1Score: 9, team2Score: 6, team1SetsWon: 1, team2SetsWon: 1 })
  })
})
