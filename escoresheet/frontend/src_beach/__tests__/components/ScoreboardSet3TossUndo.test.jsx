// Undoing the set 3 coin toss. Found by a verifier (2026-10-08): the undo
// took the toss's event away but the match kept the recorded winner
// (set3CoinTossWinner), so the toss buttons never came back.
// The undo restored the snapshot of the event before the toss, set 2's set
// end. That snapshot is of set 2: it reopened set 2 (15:21, not finished, the
// screen back in set 2) and cleared set 3's sides and serve; with no snapshot
// there (an older event) the winner stayed. Undoing set 2's start reopened
// set 1 the same way.
// On the real scoring screen over the app's Dexie database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen, within } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
const setViewport = (width, height) => {
  window.innerWidth = width
  window.innerHeight = height
}
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT, width: window.innerWidth, height: window.innerHeight }
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
afterEach(() => {
  setViewport(saved.width, saved.height)
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
const toss = (label) => document.querySelector(`[data-testid="set3-toss-${label}"]`)
const ofType = async (matchId, type) => db.events.where({ matchId, type }).toArray()

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function addTeams() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  return { t1, t2 }
}

// Set 1 won by team1 (team A); set 2 at 15:20 for team2 (team B), started
async function setUpSet2() {
  const { t1, t2 } = await addTeams()
  const start = new Date(Date.now() - 2400000).toISOString()
  const start2 = new Date(Date.now() - 1200000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'A', 2: 'A' }
  })
  await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start2 })
  await db.sets.add({ matchId, index: 2, team1Points: 15, team2Points: 20, finished: false, startTime: start2 })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
    { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start2 },
    { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start2 }
  ])
  return matchId
}

// The set started on the screen ("Start set", its time confirmed)
async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
}

// `point` scores the set's last point, the set end is confirmed
async function endSet(point, setIndex) {
  await startSet()
  await waitFor(() => expect(button(point)).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button(point))
  await waitFor(() => expect(document.body.textContent).toContain(`Set ${setIndex} end`), { timeout: 8000 })
  await settle()
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
}

async function undoLast() {
  await waitFor(() => expect(button('Undo')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
  fireEvent.click(bAll('Undo').at(-1))
}

// The match fields the set 3 interval reads and writes
const set3Fields = (m) => ({
  set3CoinTossWinner: m.set3CoinTossWinner ?? null,
  set3LeftTeam: m.set3LeftTeam ?? null,
  set3FirstServe: m.set3FirstServe ?? null,
  set3CourtSwitched: !!m.set3CourtSwitched,
  setLeftTeamOverrides: m.setLeftTeamOverrides ?? null,
  team1FirstServe: m.team1FirstServe ?? null,
  team2FirstServe: m.team2FirstServe ?? null
})
const setRows = async (matchId) => (await db.sets.where({ matchId }).toArray())
  .sort((a, b) => a.index - b.index)
  .map(s => ({ index: s.index, team1Points: s.team1Points, team2Points: s.team2Points, finished: !!s.finished }))

describe('Scoreboard_beach: undoing the set 3 coin toss', () => {
  it('set 2 won on the screen, toss, sides and serve changed, undo: the toss buttons come back, the match as before the toss, set 2 stays won', async () => {
    const matchId = await setUpSet2()
    mount(matchId)
    await endSet('Point B', 2)
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 8000 })
    await settle()

    const before = set3Fields(await db.matches.get(matchId))
    const setsBefore = await setRows(matchId)
    // set 3 was given set 2's end sides and serve
    expect(before).toMatchObject({ set3CoinTossWinner: null, set3LeftTeam: 'A', set3FirstServe: 'B' })
    expect(setsBefore.map(s => s.finished)).toEqual([true, true, false])

    // the toss (B won), then the winner's choices: sides and serve swapped
    fireEvent.click(toss('B'))
    await waitFor(() => expect(button('Switch sides')).toBeTruthy(), { timeout: 5000 })
    expect(toss('A')).toBeFalsy()
    await settle()
    fireEvent.click(button('Switch sides'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3LeftTeam).toBe('B'))
    await settle()
    fireEvent.click(button('Switch serve'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3FirstServe).toBe('A'))
    await settle()

    await undoLast()
    await waitFor(async () => expect(await ofType(matchId, 'set3_coin_toss_winner')).toHaveLength(0), { timeout: 5000 })
    await settle()

    // the toss is to be made again
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 5000 })
    expect(toss('B')).toBeTruthy()
    // the match is as before the toss: winner, sides, serve
    expect(set3Fields(await db.matches.get(matchId))).toEqual(before)
    // set 2 stays won, set 3 stays (the interval goes on)
    expect(await setRows(matchId)).toEqual(setsBefore)
    cleanup()
  }, 60000)

  it('a toss without a snapshot before it (older events): undo takes the winner back and the toss buttons come back', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      set3LeftTeam: 'B', set3FirstServe: 'A'
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
      { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 }
    ])
    mount(matchId)
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 8000 })
    await settle()
    const before = set3Fields(await db.matches.get(matchId))

    fireEvent.click(toss('A'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3CoinTossWinner).toBe('team1'), { timeout: 5000 })
    await waitFor(() => expect(toss('A')).toBeFalsy())
    await settle()

    await undoLast()
    await waitFor(async () => expect(await ofType(matchId, 'set3_coin_toss_winner')).toHaveLength(0), { timeout: 5000 })
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 5000 })
    expect(set3Fields(await db.matches.get(matchId))).toEqual(before)
    expect((await setRows(matchId)).map(s => s.finished)).toEqual([true, true, false])
    await settle()
    cleanup()
  }, 60000)

  it('the phone layout: its toss, its undo, its toss buttons back; the service order changed after the toss goes back too', async () => {
    try { localStorage.setItem('displayMode', 'phone') } catch { /* no storage */ }
    setViewport(390, 844)
    try {
      const { t1, t2 } = await addTeams()
      const start = new Date(Date.now() - 2400000).toISOString()
      const end2 = new Date(Date.now() - 5000).toISOString()
      const matchId = await db.matches.add({
        team1Id: t1, team2Id: t2, status: 'live', test: true,
        firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
        set3LeftTeam: 'A', set3FirstServe: 'B'
      })
      await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
      await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
      await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
      await db.events.bulkAdd([
        { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
        { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
        { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
        { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
        // set 2's end with the snapshot it has in a real match: of set 2
        { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2, stateSnapshot: { currentSetIndex: 2, teamAKey: 'team1', pointsA: 18, pointsB: 21, matchStatus: 'live', set3CoinTossWinner: null, set3LeftTeam: null, set3FirstServe: null, setLeftTeamOverrides: {} } }
      ])
      mount(matchId)
      const phone = () => screen.queryByTestId('phone-scoreboard')
      await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
      const view = within(phone())
      await waitFor(() => expect(view.getByTestId('phone-toss-B')).toBeTruthy(), { timeout: 8000 })
      await settle()
      const before = set3Fields(await db.matches.get(matchId))

      fireEvent.click(view.getByTestId('phone-toss-B'))
      await waitFor(async () => expect((await db.matches.get(matchId)).set3CoinTossWinner).toBe('team2'), { timeout: 5000 })
      await waitFor(() => expect(view.queryByTestId('phone-toss-B')).toBeNull())
      await settle()
      // the winner's service order swapped (team B's first server)
      const order = view.getAllByTestId(/phone-service-order-/).find(b => b.textContent.includes('Gamma'))
      fireEvent.click(order)
      await waitFor(async () => expect((await db.matches.get(matchId)).team2FirstServe).toBe(2))
      await settle()

      fireEvent.click(view.getByRole('button', { name: 'Undo' }))
      await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy(), { timeout: 5000 })
      await settle()
      fireEvent.click([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
      await waitFor(async () => expect(await ofType(matchId, 'set3_coin_toss_winner')).toHaveLength(0), { timeout: 5000 })

      await waitFor(() => expect(within(phone()).getByTestId('phone-toss-A')).toBeTruthy(), { timeout: 5000 })
      expect(within(phone()).getByTestId('phone-toss-B')).toBeTruthy()
      expect(set3Fields(await db.matches.get(matchId))).toEqual(before)
      // set 2 stays won (its snapshot is not restored over it)
      expect((await setRows(matchId)).map(s => [s.index, s.team1Points, s.team2Points, s.finished]))
        .toEqual([[1, 21, 15, true], [2, 18, 21, true], [3, 0, 0, false]])
      await settle()
      cleanup()
    } finally {
      try { localStorage.removeItem('displayMode') } catch { /* no storage */ }
    }
  }, 60000)
})

describe('Scoreboard_beach: an undo never reopens the set before', () => {
  it('set 1 won on the screen, set 2 started, its rally start and set start undone: set 1 stays won 21:15', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 1200000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'A' }
    })
    await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: 15, finished: false, startTime: start })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
    mount(matchId)
    await endSet('Point A', 1)
    // set 2's interval ended, the set started
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(button('End set interval'))
    await settle()
    await startSet()
    await waitFor(async () => expect(await ofType(matchId, 'set_start')).toHaveLength(2), { timeout: 5000 })
    await settle()

    await undoLast() // the rally start
    await waitFor(async () => expect(await ofType(matchId, 'rally_start')).toHaveLength(1), { timeout: 5000 })
    await settle()
    await undoLast() // set 2's start
    await waitFor(async () => expect(await ofType(matchId, 'set_start')).toHaveLength(1), { timeout: 5000 })
    await settle()

    expect((await setRows(matchId)).map(s => [s.index, s.team1Points, s.team2Points, s.finished]))
      .toEqual([[1, 21, 15, true], [2, 0, 0, false]])
    // the screen is back in set 2's interval, not in set 1
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 5000 })
    expect(button('Switch sides')).toBeTruthy()
    expect(button('Point A')).toBeFalsy()
    cleanup()
  }, 60000)

  // Verifier (2026-10-08): undoing set 3's start restored the toss's
  // snapshot, taken before the winner switched sides and serve (those buttons
  // log no event): the interval came back with the toss's sides and serve,
  // not the ones set 3 was started with
  it('toss, sides and serve switched, set 3 started, its rally start and set start undone: sides and serve as set 3 was started', async () => {
    const matchId = await setUpSet2()
    mount(matchId)
    await endSet('Point B', 2)
    await waitFor(() => expect(toss('A')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(toss('B'))
    await waitFor(() => expect(button('Switch sides')).toBeTruthy(), { timeout: 5000 })
    await settle()
    fireEvent.click(button('Switch sides'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3LeftTeam).toBe('B'))
    await settle()
    fireEvent.click(button('Switch serve'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3FirstServe).toBe('A'))
    await settle()
    const atStart = set3Fields(await db.matches.get(matchId))
    expect(atStart).toMatchObject({ set3CoinTossWinner: 'team2', set3LeftTeam: 'B', set3FirstServe: 'A' })

    fireEvent.click(button('End set interval'))
    await settle()
    await startSet()
    const set3Starts = async () => (await ofType(matchId, 'set_start')).filter(e => e.setIndex === 3)
    await waitFor(async () => expect(await set3Starts()).toHaveLength(1), { timeout: 5000 })
    await settle()

    await undoLast() // the rally start
    await waitFor(async () => expect((await ofType(matchId, 'rally_start')).filter(e => e.setIndex === 3)).toHaveLength(0), { timeout: 5000 })
    await settle()
    await undoLast() // set 3's start
    await waitFor(async () => expect(await set3Starts()).toHaveLength(0), { timeout: 5000 })
    await settle()

    expect(set3Fields(await db.matches.get(matchId))).toEqual(atStart)
    expect((await setRows(matchId)).map(s => [s.index, s.team1Points, s.team2Points, s.finished]))
      .toEqual([[1, 21, 15, true], [2, 15, 21, true], [3, 0, 0, false]])
    // the toss stays made: its buttons do not come back
    expect(toss('A')).toBeFalsy()
    cleanup()
  }, 60000)
})
