// "Swap team A ↔ B" (Manual changes > Current set) only corrects which team
// is A and which is B (owner's decision, 2026-10-09, as OpenVolley): nothing
// moves on the court. The team on the left stays on the left, the same team
// serves, each team keeps its points, sets, time-outs and sanctions (only
// their A/B label changes). It kept the A/B side labels, so the teams
// visibly changed courts on the swap ("i tried to swap teams": the owner).
// Undo of an event logged before the swap keeps each team on its side too.
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
import { captureFullStateSnapshot } from '../../utils_beach/stateSnapshot_beach'
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
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text && !b.disabled)
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
const setOf = async (index) => (await db.sets.toArray()).find(s => s.index === index)

const T1 = 'Alpha / Beta'
const T2 = 'Gamma / Delta'

// The court as the scorer sees it: the team on the left (the screen's left
// column and the live state the referee / livescore get), the serving team,
// each team's points
async function court(setIndex) {
  const snap = await captureFullStateSnapshot(db, (await db.matches.toArray())[0].id)
  const other = (k) => (k === 'team1' ? 'team2' : 'team1')
  const set = await setOf(setIndex)
  return {
    left: snap.sideA === 'left' ? snap.teamAKey : other(snap.teamAKey),
    server: snap.servingTeam,
    team1Points: set.team1Points,
    team2Points: set.team2Points
  }
}
// on screen: the team whose name heads the left one of the two team panels
// of the scoring layout (the team names in document order, outside the last
// action column in the middle)
const screenLeft = () => {
  const layout = document.querySelector('[data-testid="scoring-layout"]')
  if (!layout) return null
  const names = [...layout.querySelectorAll('div')]
    .filter(n => n.children.length === 0 && (n.textContent.trim() === T1 || n.textContent.trim() === T2) &&
      !n.closest('[data-testid="last-action-column"]'))
    .map(n => n.textContent.trim())
  if (names.length < 2) return null
  return names[0] === T1 ? 'team1' : 'team2'
}

async function setUpMatch(extra = {}) {
  const t1 = await db.teams.add({ name: T1 })
  const t2 = await db.teams.add({ name: T2 })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
    team1FirstServe: 1, team2FirstServe: 1, ...extra
  })
  return matchId
}
const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}
async function startRally() {
  await waitFor(() => expect(button('Start rally')).toBeTruthy())
  fireEvent.click(button('Start rally'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}
async function point(label) {
  const before = (await ofType('point')).length
  fireEvent.click(button(label))
  await waitFor(async () => expect((await ofType('point')).length).toBe(before + 1))
  await waitFor(() => expect(button(label)).toBeFalsy())
  await settle()
}
async function switchCourts() {
  await waitFor(() => expect(button('Switch courts')).toBeTruthy())
  const before = (await ofType('court_switch')).length
  fireEvent.click(button('Switch courts'))
  await waitFor(async () => expect((await ofType('court_switch')).length).toBe(before + 1))
  await waitFor(() => expect(button('Switch courts')).toBeFalsy())
  await settle()
}
async function undoLast() {
  const before = (await events()).length
  await waitFor(() => expect(button('Undo')).toBeTruthy())
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(buttons('Undo').length).toBeGreaterThan(1))
  fireEvent.click(buttons('Undo').at(-1))
  await waitFor(async () => expect((await events()).length).toBeLessThan(before))
  await settle()
}
// Manual changes > Current set > Swap team A ↔ B, then closed
async function swapAB(matchId) {
  const teamA = (await db.matches.get(matchId)).coinTossTeamA || 'team1'
  const menu = await waitFor(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
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
  await waitFor(async () => expect((await db.matches.get(matchId)).coinTossTeamA).not.toBe(teamA), { timeout: 5000 })
  const close = document.querySelector('[data-modal-close]')
  if (close) fireEvent.click(close)
  else fireEvent.keyDown(document, { key: 'Escape' })
  await settle()
}

describe('Scoreboard_beach: "Swap team A ↔ B" moves nothing on the court', () => {
  it('set 1: the same team on the left, the same server, each team\'s points; the next point and its undo too', async () => {
    const matchId = await setUpMatch()
    await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
    mount(matchId)
    await startSet()
    await point('Point A') // team1 1:0
    await startRally()
    await point('Point B') // team2 1:1, team2 serves
    await startRally()
    await point('Point B') // 1:2
    const before = await court(1)
    expect(before).toEqual({ left: 'team1', server: 'team2', team1Points: 1, team2Points: 2 })
    await waitFor(() => expect(screenLeft()).toBe('team1'))

    await swapAB(matchId)
    expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2')
    expect(await court(1)).toEqual(before)
    // on screen: team1 still on the left
    await waitFor(() => expect(screenLeft()).toBe('team1'))

    // the next rally: "Point A" is team2 now
    await startRally()
    await point('Point A')
    expect(await court(1)).toEqual({ left: 'team1', server: 'team2', team1Points: 1, team2Points: 3 })
    // its undo: as before it, nobody moved
    await undoLast()
    expect(await court(1)).toEqual(before)
    expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2')
    await waitFor(() => expect(screenLeft()).toBe('team1'))
    cleanup()
  }, 60000)

  it('set 1 after a change of courts: undo of points and of the change logged before the swap keep each team on its side', async () => {
    const matchId = await setUpMatch()
    await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
    mount(matchId)
    await startSet()
    // 4:3, the change of courts at 7: team2 on the left
    for (const [i, label] of ['Point A', 'Point B', 'Point A', 'Point B', 'Point A', 'Point B', 'Point A'].entries()) {
      if (i > 0) await startRally()
      await point(label)
    }
    await switchCourts()
    const atSeven = await court(1)
    expect(atSeven).toEqual({ left: 'team2', server: 'team1', team1Points: 4, team2Points: 3 })
    await waitFor(() => expect(screenLeft()).toBe('team2'))
    await startRally()
    await point('Point B') // 4:4
    const beforeSwap = await court(1)
    expect(beforeSwap.left).toBe('team2')

    await swapAB(matchId)
    expect(await court(1)).toEqual(beforeSwap)
    await waitFor(() => expect(screenLeft()).toBe('team2'))

    // undo the point logged before the swap: the court as at 4:3
    await undoLast()
    expect(await court(1)).toEqual(atSeven)
    expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2')
    await waitFor(() => expect(screenLeft()).toBe('team2'))

    // undo the change of courts (logged before the swap with A = team1):
    // the teams go back to the sides they had before it, team1 on the left
    expect((await events()).at(-1).type).toBe('court_switch')
    await undoLast()
    expect((await court(1)).left).toBe('team1')
    expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2')
    await waitFor(() => expect(screenLeft()).toBe('team1'))
    cleanup()
  }, 90000)

  it('set 3 with its toss: the toss\'s side and first server stay with the same team, also after an undo', async () => {
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    // set 3's toss: team2 (B) on the left, team2 serves first
    const matchId = await setUpMatch({ set3CoinTossWinner: 'team2', set3LeftTeam: 'B', set3FirstServe: 'B', setLeftTeamOverrides: { 2: 'A' } })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
      { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 },
      { matchId, setIndex: 3, type: 'set3_coin_toss_winner', payload: { winner: 'team2', team: 'team2' }, seq: 6, ts: end2 }
    ])
    mount(matchId)
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(button('End set interval'))
    await settle()
    await startSet()
    await point('Point B') // team2 1:0
    await startRally()
    await point('Point A') // team1 1:1, team1 serves
    const before = await court(3)
    expect(before).toEqual({ left: 'team2', server: 'team1', team1Points: 1, team2Points: 1 })
    await waitFor(() => expect(screenLeft()).toBe('team2'))

    await swapAB(matchId)
    expect(await court(3)).toEqual(before)
    const swapped = await db.matches.get(matchId)
    expect(swapped.set3LeftTeam).toBe('A')
    expect(swapped.set3FirstServe).toBe('A')
    await waitFor(() => expect(screenLeft()).toBe('team2'))

    await undoLast()
    expect(await court(3)).toEqual({ left: 'team2', server: 'team2', team1Points: 0, team2Points: 1 })
    await waitFor(() => expect(screenLeft()).toBe('team2'))
    // the sets each team won are its own still
    const sets = (await db.sets.toArray()).sort((a, b) => a.index - b.index)
    expect(sets.slice(0, 2).map(s => [s.team1Points, s.team2Points])).toEqual([[21, 15], [18, 21]])
    cleanup()
  }, 90000)
})
