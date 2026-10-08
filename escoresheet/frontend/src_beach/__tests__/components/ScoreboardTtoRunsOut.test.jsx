// The technical time-out at 21 points (sets 1-2) ends in one of two ways: the
// scorer taps its countdown, or the 45 seconds run out. Either way the courts
// change, and the TTO's undo snapshot is taken again with the new sides: Undo
// of the next event (a rally start, a time-out, ...) restores that snapshot,
// so it must not put the teams back on their old sides. A TTO that ran out
// changed the courts without it (found while checking the owner's test match,
// 2026-10-08). On the real
// scoring screen over the app's real Dexie database (fake IndexedDB), driven
// with taps; only the countdown's setInterval is faked. Network is off.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const realDelay = (ms) => new Promise(r => setTimeout(r, ms))
const settle = () => realDelay(GHOST_CLICK_MS + 100)
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text && !b.disabled)
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
const score = async () => {
  const [set1] = await db.sets.toArray()
  return [set1.team1Points, set1.team2Points]
}
const sides = async (matchId) => JSON.stringify((await db.matches.get(matchId)).setLeftTeamOverrides || {})
const ttoOpen = () => !!button('Start TTO') || document.body.textContent.includes('Click to end & switch courts')

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_tto_runs_out_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy())
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
  // and on screen (the rally over): an Undo tapped before the screen has the
  // point offers the rally start (found under the full suite's load)
  await waitFor(() => expect(button(label)).toBeFalsy())
}
async function switchCourts() {
  await waitFor(() => expect(button('Switch courts')).toBeTruthy())
  const before = (await ofType('court_switch')).length
  fireEvent.click(button('Switch courts'))
  await waitFor(async () => expect((await ofType('court_switch')).length).toBe(before + 1))
  await waitFor(() => expect(button('Switch courts')).toBeFalsy())
  await settle()
}
async function rallies(labels, { first = false } = {}) {
  for (let i = 0; i < labels.length; i++) {
    if (!(first && i === 0)) await startRally()
    await point(labels[i])
    const [a, b] = await score()
    if ((a + b) % 7 === 0 && a + b < 21) await switchCourts()
  }
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

// The scorer taps the running countdown
async function tapTtoEnd() {
  await waitFor(() => expect(button('Start TTO')).toBeTruthy())
  fireEvent.click(button('Start TTO'))
  await waitFor(() => expect(document.body.textContent).toContain('Click to end & switch courts'))
  const hint = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Click to end & switch courts')
  fireEvent.click(hint)
}
// Nobody taps: the 45 seconds run out (the countdown's setInterval is fake;
// every tick is let render before the next one)
async function letTtoRunOut() {
  await waitFor(() => expect(button('Start TTO')).toBeTruthy())
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  fireEvent.click(button('Start TTO'))
  for (let i = 0; i < 400 && !document.body.textContent.includes('Click to end & switch courts'); i++) await realDelay(5)
  expect(document.body.textContent).toContain('Click to end & switch courts')
  for (let s = 0; s < 50; s++) {
    vi.advanceTimersByTime(1000)
    await realDelay(20)
  }
  vi.useRealTimers()
}

describe('Scoreboard_beach: the TTO ends the same way when tapped and when it runs out', () => {
  it.each([
    ['tapped by the scorer', tapTtoEnd],
    ['run out (45 s)', letTtoRunOut]
  ])('TTO %s: the courts change and Undo of what follows (a rally start, the next point) keeps the new sides', async (_how, endTto) => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 21 }, (_, i) => (i % 2 ? 'Point B' : 'Point A')), { first: true })
    expect(await score()).toEqual([11, 10])
    await waitFor(() => expect(ttoOpen()).toBe(true))
    const sidesBefore = await sides(matchId)

    await endTto()
    await waitFor(() => expect(ttoOpen()).toBe(false))
    await settle()
    const sidesAfter = await sides(matchId)
    expect(sidesAfter).not.toBe(sidesBefore)

    // a rally started and taken back (Undo of "Start rally" restores the
    // TTO's snapshot): the teams stay on their new sides
    await startRally()
    expect(await ofType('rally_start')).toHaveLength(22)
    await undoLast()
    expect(await ofType('rally_start')).toHaveLength(21)
    expect(await sides(matchId)).toBe(sidesAfter)

    // the TTO's snapshot has the sides after the change of courts
    const [tto] = await ofType('technical_to')
    expect(JSON.stringify(tto.stateSnapshot?.setLeftTeamOverrides || {})).toBe(sidesAfter)

    // the next rally and its point, then Undo of that point
    await startRally()
    await point('Point B')
    expect(await score()).toEqual([11, 11])
    await undoLast()
    expect(await score()).toEqual([11, 10])
    expect(await ofType('technical_to')).toHaveLength(1)
    expect(await sides(matchId)).toBe(sidesAfter)

    // Undo of the TTO itself puts the teams back on their old sides
    await undoLast()
    expect(await ofType('technical_to')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBefore)
    cleanup()
  }, 120000)
})
