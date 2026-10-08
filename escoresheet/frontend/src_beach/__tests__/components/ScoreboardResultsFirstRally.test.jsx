// "Sanctions and results" (the scoring screen's Match menu) shows the match
// start, end and duration of a finished match. Like the score sheet and the
// "Match complete" card (matchTimes_beach, owner 2026-10-08: "both print
// time of first rally"), they count from set 1's FIRST RALLY, not from the
// scheduled time the scorer kept in the "Set 1 start time" dialog.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react'
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

// local wall-clock times (the panel shows the device's local time)
const at = (h, m, s = 0) => new Date(2026, 9, 8, h, m, s).toISOString()

describe('Scoreboard_beach: Sanctions and results, times from the first rally', () => {
  it('match start = set 1 first rally; durations count from it, not from the kept scheduled time', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'final', test: true, scheduledAt: at(14, 30),
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    // set 1: the scorer kept the scheduled 14:30, the first rally was 16:05
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: at(14, 30), endTime: at(16, 24) })
    await db.sets.add({ matchId, index: 2, team1Points: 21, team2Points: 17, finished: true, startTime: at(16, 27), endTime: at(16, 45) })
    // the screen needs a set to show (an empty one, never played)
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at(14, 0) },
      { matchId, setIndex: 1, type: 'set_start', payload: { setIndex: 1, startTime: at(14, 30) }, seq: 2, ts: at(14, 30) },
      { matchId, setIndex: 1, type: 'rally_start', payload: { servingTeam: 'team1' }, seq: 3, ts: at(16, 5, 41) },
      { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: at(16, 6, 10) },
      { matchId, setIndex: 2, type: 'set_start', payload: { setIndex: 2, startTime: at(16, 27) }, seq: 5, ts: at(16, 27) },
      { matchId, setIndex: 2, type: 'rally_start', payload: { servingTeam: 'team2' }, seq: 6, ts: at(16, 28, 2) },
      { matchId, setIndex: 2, type: 'point', payload: { team: 'team1' }, seq: 7, ts: at(16, 28, 40) }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const menu = await waitFor(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
      expect(b).toBeTruthy()
      return b
    }, { timeout: 8000 })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByText('Show sanctions and results', {}))

    const row = await waitFor(() => {
      const label = [...document.querySelectorAll('td')].find(td => td.textContent.trim() === 'Match start time:')
      expect(label).toBeTruthy()
      return label.parentElement
    })
    const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim())
    // 16:05 (set 1 first rally) - 16:45 (set 2 end) = 40 min
    expect(cells[1]).toBe('16:05:00')
    expect(cells[3]).toBe('16:45:00')
    expect(cells[5]).toBe('40 min')
    // the total of the set durations: 19' (16:05-16:24) + 17' (16:28-16:45)
    const durs = [...document.querySelectorAll('td')].map(td => td.textContent.trim()).filter(x => /^\d+'$/.test(x))
    expect(durs).toContain("36'")
    expect(durs).not.toContain("132'")
  }, 30000)

  it('during the match, a finished set\'s duration counts from its first rally', async () => {
    cleanup()
    const t1 = await db.teams.add({ name: 'Eta / Theta' })
    const t2 = await db.teams.add({ name: 'Iota / Kappa' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Eta' }, { teamId: t1, number: 2, name: 'Theta' },
      { teamId: t2, number: 1, name: 'Iota' }, { teamId: t2, number: 2, name: 'Kappa' }
    ])
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true, scheduledAt: at(14, 30),
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: at(14, 30), endTime: at(16, 24) })
    await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at(14, 0) },
      { matchId, setIndex: 1, type: 'set_start', payload: { setIndex: 1, startTime: at(14, 30) }, seq: 2, ts: at(14, 30) },
      { matchId, setIndex: 1, type: 'rally_start', payload: { servingTeam: 'team1' }, seq: 3, ts: at(16, 5, 41) },
      { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: at(16, 6, 10) }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const menu = await waitFor(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
      expect(b).toBeTruthy()
      return b
    }, { timeout: 8000 })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByText('Show sanctions and results', {}))
    await waitFor(() => {
      const durs = [...document.querySelectorAll('td')].map(td => td.textContent.trim()).filter(x => /^\d+'$/.test(x))
      // 16:05 - 16:24, not 14:30 - 16:24 (114')
      expect(durs).toContain("19'")
      expect(durs).not.toContain("114'")
    })
  }, 30000)
})
