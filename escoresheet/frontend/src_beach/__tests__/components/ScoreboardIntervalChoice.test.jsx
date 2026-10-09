// The owner (2026-10-09): "at the intervals the teams would not switch (in a
// new set a team can choose which side to start play on). Also make the
// 'switch serve order' clearer (now it is only the two arrows)."
//
// FIVB beach rules 2025-2028: between sets nothing moves by itself (18.1.1,
// "the change of courts (if requested)"); before set 2 the team that LOST
// the first toss chooses serve / receive OR the side, the other team takes
// the remaining choice (7.1.2, 7.1.2.3, Casebook 3.1.2); before set 3 a new
// toss, its winner chooses (7.1.2.3); each team gives its service order
// again in each interval (7.6.1, 18.1.1).
//
// On the real scoring screen over the app's Dexie database (fake IndexedDB),
// desktop and phone layouts.
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
  try { localStorage.removeItem('displayMode') } catch { /* no storage */ }
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const buttons = (root = document) => [...root.querySelectorAll('button')]
const button = (text, root = document) => buttons(root).find(b => b.textContent.trim() === text && !b.disabled)
const byId = (id, root = document) => root.querySelector(`[data-testid="${id}"]`)
const pressed = (id, root = document) => byId(id, root)?.getAttribute('aria-pressed') === 'true'
const rowLabel = (kind, root = document) => byId(`interval-${kind}-row`, root)?.getAttribute('aria-label')
const match = (id) => db.matches.get(id)

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function addTeams() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Anna Alpha' }, { teamId: t1, number: 2, name: 'Bea Beta' },
    { teamId: t2, number: 1, name: 'Gina Gamma' }, { teamId: t2, number: 2, name: 'Dora Delta' }
  ])
  return { t1, t2 }
}

// Set 1 at 20:14, started; team1 (A) won the toss and served first; B
// (team2) is on the left after the set's changes of courts
async function setUpSet1() {
  const { t1, t2 } = await addTeams()
  const start = new Date(Date.now() - 1200000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    coinTossWinner: 'team1', firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'B' }
  })
  await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: 14, finished: false, startTime: start })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start }
  ])
  return matchId
}

// The set's last point on the screen ("Start set" first, as the rally
// buttons need), its end confirmed
async function endSet(point, setIndex) {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button(point)).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button(point))
  await waitFor(() => expect(document.body.textContent).toContain(`Set ${setIndex} end`), { timeout: 8000 })
  await settle()
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
}

describe('Scoreboard_beach: the interval before set 2 (rules 7.1.2.3, 18.1.1)', () => {
  it('set 1 ends at 21:14 (35 points): no change of courts, set 2 starts where set 1 finished; the loser of the toss chooses, the other team takes the rest', async () => {
    const matchId = await setUpSet1()
    mount(matchId)
    await endSet('Point A', 1)

    // the interval: who chooses, and why
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    await settle()
    expect(byId('interval-chooser').textContent).toBe('B · Gamma / Delta chooses (lost the coin toss)')
    // nothing moved: no change of courts at 35, set 2 on set 1's last side
    expect(await db.events.where({ matchId, type: 'court_switch' }).count()).toBe(0)
    expect((await match(matchId)).setLeftTeamOverrides).toEqual({ 1: 'B', 2: 'B' })
    // no pick yet: no rows, the teams stay
    expect(byId('interval-side-row')).toBeNull()

    // B chooses the side: B's side row, then A's serve or receive
    fireEvent.click(byId('interval-choice-side'))
    await waitFor(() => expect(byId('interval-side-row')).toBeTruthy())
    expect(pressed('interval-choice-side')).toBe(true)
    expect(rowLabel('side')).toBe('B · Gamma / Delta: side')
    expect(rowLabel('serve')).toBe('A · Alpha / Beta: serve or receive')
    // as now: B on the left; A receives (set 2's serve: the other team than set 1's)
    expect(pressed('interval-side-left')).toBe(true)
    expect(pressed('interval-serve-receive')).toBe(true)

    // B takes the right: a double tap is one move (a pick, not a toggle)
    const right = byId('interval-side-right')
    fireEvent.click(right)
    fireEvent.click(right)
    await waitFor(async () => expect((await match(matchId)).setLeftTeamOverrides?.[2]).toBe('A'))
    await settle()
    expect((await match(matchId)).setLeftTeamOverrides?.[2]).toBe('A')
    await waitFor(() => expect(pressed('interval-side-right')).toBe(true))

    // A serves
    fireEvent.click(byId('interval-serve-serve'))
    await waitFor(async () => expect((await match(matchId)).set2FirstServe).toBe('team1'))
    await waitFor(() => expect(pressed('interval-serve-serve')).toBe(true))
    await settle()

    // B chooses serve or receive instead: the rows change hands
    fireEvent.click(byId('interval-choice-serve'))
    await waitFor(() => expect(rowLabel('serve')).toBe('B · Gamma / Delta: serve or receive'))
    expect(rowLabel('side')).toBe('A · Alpha / Beta: side')
    // B receives (A serves), A is on the left now
    expect(pressed('interval-serve-receive')).toBe(true)
    expect(pressed('interval-side-left')).toBe(true)
    cleanup()
  }, 60000)

  it('the serve order: a labelled "Change" button per team naming its players, which swaps the first and second server', async () => {
    const matchId = await setUpSet1()
    mount(matchId)
    await endSet('Point A', 1)
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    await settle()

    const changeOf = (team) => buttons().find(b => b.dataset.testid === 'serve-order-change' && b.getAttribute('aria-label').includes(team))
    const boxOf = (team) => changeOf(team).closest('[data-testid="serve-order"]')
    expect(changeOf('A · Alpha / Beta').textContent.trim()).toBe('Change')
    expect(changeOf('A · Alpha / Beta').getAttribute('aria-label'))
      .toBe('Change the serve order of A · Alpha / Beta: #2 Beta serves first, then #1 Alpha')
    expect(boxOf('A · Alpha / Beta').textContent).toContain('Serve order')
    expect(boxOf('A · Alpha / Beta').textContent).toContain('1 · #1 Alpha')
    expect(boxOf('A · Alpha / Beta').textContent).toContain('2 · #2 Beta')

    fireEvent.click(changeOf('A · Alpha / Beta'))
    await waitFor(async () => expect((await match(matchId)).team1FirstServe).toBe(2))
    await waitFor(() => expect(boxOf('A · Alpha / Beta').textContent).toContain('1 · #2 Beta'))
    expect(boxOf('A · Alpha / Beta').textContent).toContain('2 · #1 Alpha')
    // the other team's order is its own
    expect((await match(matchId)).team2FirstServe).toBe(1)
    cleanup()
  }, 60000)
})

describe('Scoreboard_beach: the interval before set 3 (rule 7.1.2.3: a new toss)', () => {
  it('the toss winner chooses; set 3 is on the side set 2 finished on until a pick moves it', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      coinTossWinner: 'team1', firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      // set 2 finished with B on the left; set 3 starts there (set at set 2's end)
      setLeftTeamOverrides: { 1: 'A', 2: 'B' }, set3LeftTeam: 'B', set3FirstServe: 'B'
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
    await waitFor(() => expect(byId('set3-toss-A')).toBeTruthy(), { timeout: 8000 })
    await settle()
    // no choice before the toss
    expect(byId('interval-chooser')).toBeNull()

    fireEvent.click(byId('set3-toss-A'))
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 5000 })
    expect(byId('interval-chooser').textContent).toBe('A · Alpha / Beta chooses (won the set 3 coin toss)')
    // the toss moved nothing
    expect((await match(matchId)).set3LeftTeam).toBe('B')
    await settle()

    // A takes serve or receive: A serves; B takes the side and stays left
    fireEvent.click(byId('interval-choice-serve'))
    await waitFor(() => expect(rowLabel('serve')).toBe('A · Alpha / Beta: serve or receive'))
    expect(rowLabel('side')).toBe('B · Gamma / Delta: side')
    expect(pressed('interval-side-left')).toBe(true)
    fireEvent.click(byId('interval-serve-serve'))
    await waitFor(async () => expect((await match(matchId)).set3FirstServe).toBe('A'))
    expect((await match(matchId)).set3LeftTeam).toBe('B')
    cleanup()
  }, 60000)

  // As set 2's end leaves it: no set3FirstServe yet. Set 3's serve is then
  // the other team than set 2's first server (A served first in set 2, so B
  // serves): "Serve" for A has to make A serve (it read the missing serve as
  // A, so the tap wrote nothing and B kept the serve)
  it('with no set 3 serve stored yet, the toss winner can take the serve away from the default', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      coinTossWinner: 'team1', firstServe: 'team2', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'A', 2: 'B' }, set3LeftTeam: 'B'
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
    await waitFor(() => expect(byId('set3-toss-A')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(byId('set3-toss-A'))
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 5000 })
    await settle()

    fireEvent.click(byId('interval-choice-serve'))
    await waitFor(() => expect(rowLabel('serve')).toBe('A · Alpha / Beta: serve or receive'))
    // as now: set 1 B served first, set 2 A, so set 3 B: A receives
    expect(pressed('interval-serve-receive')).toBe(true)
    fireEvent.click(byId('interval-serve-serve'))
    await waitFor(async () => expect((await match(matchId)).set3FirstServe).toBe('A'), { timeout: 5000 })
    await waitFor(() => expect(pressed('interval-serve-serve')).toBe(true))
    await settle()
    // and back: A receives, B serves
    fireEvent.click(byId('interval-serve-receive'))
    await waitFor(async () => expect((await match(matchId)).set3FirstServe).toBe('B'), { timeout: 5000 })
    cleanup()
  }, 60000)
})

describe('Scoreboard_beach: the interval on the phone layout', () => {
  it('the same choice and the labelled serve order buttons', async () => {
    try { localStorage.setItem('displayMode', 'phone') } catch { /* no storage */ }
    setViewport(390, 844)
    const matchId = await setUpSet1()
    // set 1 ended already: the interval before set 2
    await db.sets.where({ matchId }).modify({ team1Points: 21, team2Points: 14, finished: true, endTime: new Date(Date.now() - 5000).toISOString() })
    await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    await db.matches.update(matchId, { setLeftTeamOverrides: { 1: 'B', 2: 'B' } })
    await db.events.add({ matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: new Date(Date.now() - 5000).toISOString() })
    mount(matchId)
    const phone = () => screen.queryByTestId('phone-scoreboard')
    await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
    await waitFor(() => expect(byId('interval-chooser', phone())).toBeTruthy(), { timeout: 8000 })
    await settle()
    const view = phone()
    expect(byId('interval-chooser', view).textContent).toBe('B · Gamma / Delta chooses (lost the coin toss)')

    // the serve order: "Change" buttons, named for screen readers
    const changes = within(view).getAllByRole('button', { name: /^Change the serve order of / })
    expect(changes.map(b => b.textContent.trim())).toEqual(['Change', 'Change'])
    fireEvent.click(within(view).getByRole('button', { name: /^Change the serve order of B · Gamma \/ Delta/ }))
    await waitFor(async () => expect((await match(matchId)).team2FirstServe).toBe(2))
    await settle()

    // B chooses the side and goes right
    fireEvent.click(byId('interval-choice-side', view))
    await waitFor(() => expect(byId('interval-side-row', view)).toBeTruthy())
    fireEvent.click(byId('interval-side-right', view))
    await waitFor(async () => expect((await match(matchId)).setLeftTeamOverrides?.[2]).toBe('A'))
    cleanup()
  }, 60000)
})
