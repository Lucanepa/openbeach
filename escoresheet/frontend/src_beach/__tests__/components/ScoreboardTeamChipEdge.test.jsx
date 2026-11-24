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

// The scoring screen's team chips (the A / B letters and the sets won in
// the header, the court's team labels, the dialogs' team chips) were filled
// with the team colour without an edge: a white or cream team melted into
// the white card. They take teamBoxStyle now, like the setup and coin toss
// bands: a light colour gets an inset ring of itself darkened to 3:1.
// Dark colours stay without one.
describe('Scoreboard_beach: team chips in a very light colour get an edge', () => {
  it('a white team 1: its chips have the ring, the dark team 2 none', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta', color: '#ffffff' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta', color: '#1e3a8a' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 2400000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 3, team2Points: 2, finished: false, startTime: start })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const filled = (rgb) => [...document.querySelectorAll('div, span, button')]
      .filter(e => e.style.background === rgb || e.style.backgroundColor === rgb)
    // the header's letter chips: A (team 1, white) and B (team 2, navy)
    const chip = (rgb, text) => filled(rgb).find(e => e.textContent.trim() === text)
    await waitFor(() => expect(chip('rgb(255, 255, 255)', 'A')).toBeTruthy(), { timeout: 8000 })
    await waitFor(() => expect(chip('rgb(30, 58, 138)', 'B')).toBeTruthy(), { timeout: 8000 })

    // (the players on the court are shirts: drawn with their own outline)
    const white = filled('rgb(255, 255, 255)').filter(e => !e.closest('.court-player'))
    expect(white.length).toBeGreaterThan(0)
    for (const e of white) expect(e.style.boxShadow, e.outerHTML.slice(0, 120)).toMatch(/inset/)
    expect(chip('rgb(30, 58, 138)', 'B').style.boxShadow).toBe('')
    cleanup()
  }, 30000)
})
