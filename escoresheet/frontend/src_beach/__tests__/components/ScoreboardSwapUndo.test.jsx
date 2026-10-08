// An undo after "Swap team A ↔ B" (Manual changes). The swap is a change of
// designation: it re-labels the teams and moves the A/B labels that name a
// team (set3FirstServe) with them. The undo restored the snapshot of the
// event before the one it took back, taken before the swap: its labels are
// of the old designation and came back against the swapped teams (set 3's
// first server became the other team). Found by a check, 2026-10-09. The
// undo now writes those labels in the designation the match has now.
// On the real scoring screen over the app's Dexie database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { setFirstServer } from '../../utils_beach/coinToss_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'

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
beforeEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const buttons = () => [...document.querySelectorAll('button')]
const button = (text) => buttons().find(b => b.textContent.trim() === text && !b.disabled)
const bAll = (text) => buttons().filter(b => b.textContent.trim() === text && !b.disabled)
const points = async (matchId) => db.events.where({ matchId, type: 'point' }).count()

async function scorePoint(matchId, label) {
  const before = await points(matchId)
  await waitFor(() => expect(button(label)).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button(label))
  await waitFor(async () => expect(await points(matchId)).toBe(before + 1), { timeout: 5000 })
  await settle()
}

describe('Scoreboard_beach: an undo after "Swap team A ↔ B"', () => {
  it('set 3: two points, the swap, undo the second point: set 3\'s first server stays the same team', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta', shortName: 'ALB' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta', shortName: 'GAD' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    // Team A = team1, set 3's toss: A (team1) serves first, A on the left
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
      team1FirstServe: 1, team2FirstServe: 1, set3CoinTossWinner: 'team1', set3LeftTeam: 'A', set3FirstServe: 'A'
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
      { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 },
      { matchId, setIndex: 3, type: 'set3_coin_toss_winner', payload: { winner: 'team1', team: 'team1' }, seq: 6, ts: end2 }
    ])
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

    // the interval ended, set 3 started, two rallies won by A (team1)
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(button('End set interval'))
    await settle()
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Confirm'))
    await scorePoint(matchId, 'Point A')
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Start rally'))
    await scorePoint(matchId, 'Point A')
    expect(setFirstServer(await db.matches.get(matchId), 3)).toBe('team1')

    // Manual changes > Current set > Swap team A ↔ B
    const menu = await waitFor(() => {
      const b = buttons().find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
      expect(b).toBeTruthy()
      return b
    })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByText('Manual changes'))
    await waitFor(() => expect(button('Current set')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Current set'))
    await waitFor(() => expect(button('Swap team A ↔ B')).toBeTruthy(), { timeout: 5000 })
    await settle()
    fireEvent.click(button('Swap team A ↔ B'))
    await waitFor(async () => expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2'), { timeout: 5000 })
    const swapped = await db.matches.get(matchId)
    // the same team serves set 3 first, now named B
    expect(swapped.set3FirstServe).toBe('B')
    expect(setFirstServer(swapped, 3)).toBe('team1')
    // close Manual changes
    fireEvent.keyDown(document, { key: 'Escape' })
    await settle()

    // undo the second point
    const undoButton = await waitFor(() => {
      const b = bAll('Undo')[0]
      expect(b).toBeTruthy()
      return b
    }, { timeout: 5000 })
    fireEvent.click(undoButton)
    await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
    fireEvent.click(bAll('Undo').at(-1))
    await waitFor(async () => expect(await points(matchId)).toBe(1), { timeout: 5000 })
    await settle()

    const after = await db.matches.get(matchId)
    // still the swapped designation, set 3's first server still team1 (B)
    expect(after.coinTossTeamA).toBe('team2')
    expect(after.set3FirstServe).toBe('B')
    expect(setFirstServer(after, 3)).toBe('team1')
    // the score is 1:0 for team1
    const set3 = (await db.sets.where({ matchId }).toArray()).find(s => s.index === 3)
    expect([set3.team1Points, set3.team2Points]).toEqual([1, 0])
    cleanup()
  }, 60000)
})
