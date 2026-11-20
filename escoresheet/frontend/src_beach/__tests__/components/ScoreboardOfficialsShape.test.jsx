import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, waitFor, cleanup, screen } from '@testing-library/react'
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

async function liveMatch(officials) {
  const t1 = await db.teams.add({ name: 'Muster / Beispiel', color: '#1e3a8a' })
  const t2 = await db.teams.add({ name: 'Sonne / Strand', color: '#b91c1c' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Muster' }, { teamId: t1, number: 2, name: 'Beispiel' },
    { teamId: t2, number: 1, name: 'Sonne' }, { teamId: t2, number: 2, name: 'Strand' }
  ])
  const start = new Date(Date.now() - 2400000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true, officials,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 3, team2Points: 2, finished: false, startTime: start })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start }
  ])
  return matchId
}

const mount = (matchId) =>
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

// A manual adjustment saved the officials as { ref1, ref2, scorer, asstScorer }
// until 2026-11-20 (Match Setup keeps a list): the scoring screen's
// officials.find(...) for the referees' names above and below the court threw
// on such a match. It reads either shape (utils_beach/officials_beach).
describe('Scoreboard_beach: the officials, whatever shape the match stored', () => {
  it('the object form of an older manual adjustment: the referees\' names show, nothing throws', async () => {
    const errors = []
    const onError = (e) => errors.push(e.message || String(e.error))
    window.addEventListener('error', onError)
    const matchId = await liveMatch({
      ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '' },
      ref2: { firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '' },
      scorer: { firstName: 'Sina', lastName: 'Schreiber', dob: '' },
      asstScorer: { firstName: '', lastName: '', dob: '' }
    })
    mount(matchId)
    expect(await screen.findByText(/Rita Referee/, {}, { timeout: 8000 })).toBeTruthy()
    expect(screen.getByText(/Remo Zweiter/)).toBeTruthy()
    window.removeEventListener('error', onError)
    expect(errors.filter(m => /find is not a function/.test(m))).toEqual([])
    cleanup()
  }, 30000)

  it('Match Setup\'s list: the same names', async () => {
    const matchId = await liveMatch([
      { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE' },
      { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE' },
      { role: 'line judge 1', name: 'Lia Linie' }
    ])
    mount(matchId)
    expect(await screen.findByText(/Rita Referee/, {}, { timeout: 8000 })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/Remo Zweiter/)).toBeTruthy())
    cleanup()
  }, 30000)
})
