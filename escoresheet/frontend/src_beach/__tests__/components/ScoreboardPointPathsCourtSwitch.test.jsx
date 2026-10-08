// Every way a point reaches the score opens what a point from the Point
// buttons opens: the change of courts (every 7 points, every 5 in set 3), the
// technical time-out at 21 (sets 1-2) and the set end, once each, and Undo
// takes it back. A point given by a referee BMP reached 7 or 21 without a
// change of courts or a TTO (found while testing the owner's match,
// 2026-10-08); a successful team BMP or a decision change that takes back a
// set-ending point at a change total, and a decision change made from the
// change-of-courts dialog, lost the dialog too. On the real scoring screen
// over the app's real Dexie database (fake IndexedDB), driven with taps.
// Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
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
const score = async () => {
  const [set1] = await db.sets.toArray()
  return [set1.team1Points, set1.team2Points]
}
const sides = async (matchId) => JSON.stringify((await db.matches.get(matchId)).setLeftTeamOverrides || {})
const dialogBmp = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('BMP request'))
const setEndOpen = () => document.body.textContent.includes('Set 1 end')
const ttoOpen = () => !!button('Start TTO')
const switchOpen = () => !!button('Switch courts')

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_point_paths_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
}
async function startRally() {
  await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start rally'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
}
async function point(label) {
  const before = (await ofType('point')).length
  fireEvent.click(button(label))
  await waitFor(async () => expect((await ofType('point')).length).toBe(before + 1))
}
async function switchCourts() {
  await waitFor(() => expect(button('Switch courts')).toBeTruthy(), { timeout: 5000 })
  const before = (await ofType('court_switch')).length
  fireEvent.click(button('Switch courts'))
  await waitFor(async () => expect((await ofType('court_switch')).length).toBe(before + 1))
  await waitFor(() => expect(button('Switch courts')).toBeFalsy())
  await settle()
}
// `n` rallies from the Point buttons (the first one already started by
// startSet when `first`), the changes of courts at 7 and 14 made
async function rallies(labels, { first = false } = {}) {
  for (let i = 0; i < labels.length; i++) {
    if (!(first && i === 0)) await startRally()
    await point(labels[i])
    const [a, b] = await score()
    if ((a + b) % 7 === 0 && a + b < 21) await switchCourts()
  }
}
// the referee BMP of the rally in play gives the point to the team on `side`
async function refereeBmp(side) {
  const before = (await ofType('referee_bmp_outcome')).length
  fireEvent.click(button('Referee BMP'))
  await waitFor(() => expect(document.querySelector(`[data-testid="referee-bmp-${side}"]`)).toBeTruthy())
  fireEvent.click(document.querySelector(`[data-testid="referee-bmp-${side}"]`))
  await waitFor(() => expect(button('IN')).toBeTruthy())
  fireEvent.click(button('IN'))
  await waitFor(async () => expect(await ofType('referee_bmp_outcome')).toHaveLength(before + 1))
  await settle()
}
async function undoLast() {
  const before = (await events()).length
  await waitFor(() => expect(button('Undo')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(buttons('Undo').length).toBeGreaterThan(1))
  fireEvent.click(buttons('Undo').at(-1))
  await waitFor(async () => expect((await events()).length).toBeLessThan(before))
  await settle()
}
async function successfulBmp(open) {
  fireEvent.click(open)
  await waitFor(() => expect(button('Successful')).toBeTruthy())
  fireEvent.click(button('Successful'))
  await waitFor(() => expect(button('Confirm Successful')).toBeTruthy())
  fireEvent.click(button('Confirm Successful'))
  await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(1))
  await settle()
}
// The TTO is started and ended early with a tap on its countdown (the tap
// reaches the countdown's clickable box); its change of courts is made then
async function endTto() {
  await waitFor(() => expect(button('Start TTO')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start TTO'))
  await waitFor(() => expect(document.body.textContent).toContain('Click to end & switch courts'))
  const hint = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Click to end & switch courts')
  fireEvent.click(hint)
  await waitFor(() => expect(document.body.textContent).not.toContain('Click to end & switch courts'))
  await settle()
}
// the "Decision change" of an open dialog (the scoring screen has its own)
const dialogDecisionChange = (dialogButtonText) =>
  [...button(dialogButtonText).parentElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Decision change')

describe('Scoreboard_beach: every point path opens the change of courts, the TTO and the set end', () => {
  it('a referee BMP giving the 7th point opens the change of courts, once; Undo takes it back', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(['Point A', 'Point A', 'Point A', 'Point A', 'Point A', 'Point A'], { first: true })
    expect(await score()).toEqual([6, 0])
    const sidesBefore = await sides(matchId)

    await startRally()
    await refereeBmp('left')
    expect(await score()).toEqual([7, 0])
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).not.toBe(sidesBefore)
    expect(switchOpen()).toBe(false)

    // Undo: the change of courts, then the referee BMP's point
    await undoLast()
    expect(await ofType('court_switch')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBefore)
    expect(await score()).toEqual([7, 0])
    await undoLast()
    await waitFor(async () => expect(await ofType('referee_bmp_outcome')).toHaveLength(0))
    expect(await score()).toEqual([6, 0])
    expect(switchOpen()).toBe(false)
    expect(await ofType('court_switch')).toHaveLength(0)
    cleanup()
  }, 60000)

  it('a referee BMP giving the 21st point of set 1 opens the TTO, once, and its change of courts; Undo takes it back', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    const labels = Array.from({ length: 20 }, (_, i) => (i % 2 ? 'Point B' : 'Point A'))
    await rallies(labels, { first: true })
    expect(await score()).toEqual([10, 10])
    const sidesBefore = await sides(matchId)
    const switchesBefore = (await ofType('court_switch')).length
    expect(switchesBefore).toBe(2)

    await startRally()
    await refereeBmp('right')
    expect((await score()).reduce((a, b) => a + b)).toBe(21)
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(await ofType('technical_to')).toHaveLength(1)
    expect(switchOpen()).toBe(false)

    // the TTO ends: the courts change (with the TTO, no second dialog)
    await endTto()
    expect(await sides(matchId)).not.toBe(sidesBefore)
    expect(ttoOpen()).toBe(false)
    expect(switchOpen()).toBe(false)
    expect(await ofType('technical_to')).toHaveLength(1)
    expect(await ofType('court_switch')).toHaveLength(switchesBefore)

    // Undo: the TTO (and its change of courts), then the referee BMP's point
    await undoLast()
    expect(await ofType('technical_to')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBefore)
    await undoLast()
    expect(await score()).toEqual([10, 10])
    expect(ttoOpen()).toBe(false)
    cleanup()
  }, 90000)

  it('a successful team BMP turning a set-ending 21:0 into 20:1 opens the TTO (21 points), once; Undo brings the set end back', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 21 }, () => 'Point A'), { first: true })
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await waitFor(() => expect(dialogBmp()).toBeTruthy(), { timeout: 5000 })
    expect(await ofType('technical_to')).toHaveLength(0)

    await successfulBmp(dialogBmp())
    expect(await score()).toEqual([20, 1])
    // the set-end dialog (back under the BMP dialog, 21:0) is gone: the set
    // did not end
    await waitFor(() => expect(setEndOpen()).toBe(false), { timeout: 5000 })
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(await ofType('technical_to')).toHaveLength(1)
    await endTto()
    expect(await ofType('technical_to')).toHaveLength(1)

    // Undo: the TTO, then the BMP: 21:0 and the set end again
    await undoLast()
    expect(await ofType('technical_to')).toHaveLength(0)
    await undoLast()
    expect(await ofType('challenge_outcome')).toHaveLength(0)
    expect(await score()).toEqual([21, 0])
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    expect(ttoOpen()).toBe(false)
    cleanup()
  }, 90000)

  it('a decision change in the set-end dialog turning 21:0 into 20:1 opens the TTO (21 points), once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 21 }, () => 'Point A'), { first: true })
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await settle()

    fireEvent.click(dialogDecisionChange('Confirm'))
    await waitFor(() => expect(document.body.textContent).toContain('Last point was assigned to'))
    fireEvent.click(button('Confirm'))
    await waitFor(async () => expect(await ofType('decision_change')).toHaveLength(1))
    await settle()
    expect(await score()).toEqual([20, 1])
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(setEndOpen()).toBe(false)
    expect(await ofType('technical_to')).toHaveLength(1)
    cleanup()
  }, 90000)

  it('a successful team BMP asked from the change-of-courts dialog at 7:0 (6:1, still 7 points): the dialog stays, one change of courts', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    for (let i = 0; i < 7; i++) {
      if (i > 0) await startRally()
      await point('Point A')
    }
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await waitFor(() => expect(dialogBmp()).toBeTruthy())
    const sidesBefore = await sides(matchId)

    await successfulBmp(dialogBmp())
    expect(await score()).toEqual([6, 1])
    // the dialog shows the new score (6:1 is 7 points: the change stays)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    expect(button('Switch courts').closest('div[style*="padding: 24px"]').textContent).toMatch(/6.*1/)
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).not.toBe(sidesBefore)
    await settle()
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 60000)

  it('a decision change from the change-of-courts dialog: cancelled or confirmed (6:1, still 7 points), the change of courts comes back, once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    for (let i = 0; i < 7; i++) {
      if (i > 0) await startRally()
      await point('Point A')
    }
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await settle()

    // cancelled: the change of courts is still to be made
    fireEvent.click(dialogDecisionChange('Switch courts'))
    await waitFor(() => expect(button('Cancel')).toBeTruthy())
    expect(switchOpen()).toBe(false)
    fireEvent.click(button('Cancel'))
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await settle()

    // confirmed: the point goes to team B, 6:1 is 7 points, the change stays
    fireEvent.click(dialogDecisionChange('Switch courts'))
    await waitFor(() => expect(document.body.textContent).toContain('Last point was assigned to'))
    fireEvent.click(button('Confirm'))
    await waitFor(async () => expect(await ofType('decision_change')).toHaveLength(1))
    expect(await score()).toEqual([6, 1])
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await settle()
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 60000)
})

// Set 3 (changes of courts every 5 points, no TTO): sets 1 and 2 are over
// (one each), set 3 is to be started ("Start set")
async function setUpSet3() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const long = new Date(Date.now() - 3600000).toISOString()
  const end = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_point_paths_set3_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    set3CoinTossWinner: 'team1', set3FirstServe: 'team1'
  })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: long, endTime: long },
    { matchId, index: 2, team1Points: 15, team2Points: 21, finished: true, startTime: long, endTime: end },
    { matchId, index: 3, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() }
  ])
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: long },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: long },
    { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: long },
    { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: long },
    { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end },
    { matchId, setIndex: 3, type: 'set_start', payload: {}, seq: 6, ts: end }
  ])
  return matchId
}
const set3Score = async () => {
  const set3 = (await db.sets.toArray()).find(s => s.index === 3)
  return [set3.team1Points, set3.team2Points]
}
const set3Events = async (type) => (await ofType(type)).filter(e => e.setIndex === 3)

describe('Scoreboard_beach: point paths at every change total', () => {
  it('a referee BMP giving the 14th point of set 1 opens the change of courts, once; Undo takes it back', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    // 13 points (the change at 7 made)
    await rallies(Array.from({ length: 13 }, (_, i) => (i % 2 ? 'Point B' : 'Point A')), { first: true })
    expect(await score()).toEqual([7, 6])
    expect(await ofType('court_switch')).toHaveLength(1)
    const sidesBefore = await sides(matchId)

    await startRally()
    await refereeBmp('left')
    expect((await score()).reduce((a, b) => a + b)).toBe(14)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    expect(ttoOpen()).toBe(false)
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(2)
    expect(await sides(matchId)).not.toBe(sidesBefore)

    await undoLast()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).toBe(sidesBefore)
    await undoLast()
    expect(await score()).toEqual([7, 6])
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 90000)

  it('set 3: a referee BMP giving the 5th point opens the change of courts, once; Undo takes it back', async () => {
    const matchId = await setUpSet3()
    mount(matchId)
    await startSet()
    for (let i = 0; i < 4; i++) {
      if (i > 0) await startRally()
      await point(i % 2 ? 'Point B' : 'Point A')
    }
    expect(await set3Score()).toEqual([2, 2])
    expect(switchOpen()).toBe(false)
    const sidesBefore = await sides(matchId)

    await startRally()
    await refereeBmp('right')
    expect((await set3Score()).reduce((a, b) => a + b)).toBe(5)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    expect(ttoOpen()).toBe(false)
    await switchCourts()
    expect(await set3Events('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).not.toBe(sidesBefore)

    await undoLast()
    expect(await set3Events('court_switch')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBefore)
    await undoLast()
    expect(await set3Score()).toEqual([2, 2])
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 90000)

  it('set 3: a successful team BMP from the change-of-courts dialog that ends the set (11:14 -> 10:15) closes that dialog: only the set end opens', async () => {
    const matchId = await setUpSet3()
    mount(matchId)
    // 10:14 (24 points), every change of courts made
    const labels = [
      ...Array.from({ length: 20 }, (_, i) => (i % 2 ? 'Point B' : 'Point A')), // 10:10
      'Point B', 'Point B', 'Point B', 'Point B' // 10:14
    ]
    await startSet()
    for (let i = 0; i < labels.length; i++) {
      if (i > 0) await startRally()
      await point(labels[i])
      const [a, b] = await set3Score()
      if ((a + b) % 5 === 0) await switchCourts()
    }
    expect(await set3Score()).toEqual([10, 14])
    const switchesBefore = (await set3Events('court_switch')).length
    expect(switchesBefore).toBe(4)

    // 11:14: 25 points, the change of courts
    await startRally()
    await point('Point A')
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await waitFor(() => expect(dialogBmp()).toBeTruthy())

    // B's BMP is successful: 10:15, the set is over
    await successfulBmp(dialogBmp())
    expect(await set3Score()).toEqual([10, 15])
    // (set 3 decides the match: its dialog is the match end)
    await waitFor(() => expect(document.body.textContent).toMatch(/Set 3 end|Match end/), { timeout: 5000 })
    // no change of courts at the end of the set: its dialog is gone, none made
    await waitFor(() => expect(switchOpen()).toBe(false), { timeout: 5000 })
    expect(await set3Events('court_switch')).toHaveLength(switchesBefore)
    cleanup()
  }, 120000)

  it('a decision change asked from the set-end dialog and cancelled: the set-end dialog comes back (no TTO, no change of courts)', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 21 }, () => 'Point A'), { first: true })
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await settle()

    fireEvent.click(dialogDecisionChange('Confirm'))
    await waitFor(() => expect(button('Cancel')).toBeTruthy())
    expect(setEndOpen()).toBe(false)
    fireEvent.click(button('Cancel'))
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await settle()
    expect(await score()).toEqual([21, 0])
    expect(ttoOpen()).toBe(false)
    expect(switchOpen()).toBe(false)
    expect(await ofType('technical_to')).toHaveLength(0)
    expect(await ofType('decision_change')).toHaveLength(0)
    cleanup()
  }, 90000)

  it('a delay penalty giving the 7th point opens the change of courts, once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(['Point A', 'Point A', 'Point A', 'Point A', 'Point A', 'Point A'], { first: true })
    expect(await score()).toEqual([6, 0])

    const sanctionConfirm = () => [...document.querySelectorAll('[data-testid="sanction-confirm"] button')].at(-1)
    // The sixth point on screen too (the rally over): a sanction is asked
    // only between rallies, and a tap while the screen still has the rally in
    // play is ignored (rallies() waits for the database only)
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    await waitFor(() => expect(button('Delay warning')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Delay warning'))
    await waitFor(() => expect(sanctionConfirm()).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(sanctionConfirm())
    await waitFor(async () => expect(await ofType('sanction')).toHaveLength(1))
    await settle()
    await waitFor(() => expect(button('Delay penalty')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Delay penalty'))
    await waitFor(() => expect(sanctionConfirm()).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(sanctionConfirm())
    await waitFor(async () => expect(await ofType('sanction')).toHaveLength(2))
    await settle()
    expect((await score()).reduce((a, b) => a + b)).toBe(7)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    await settle()
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 90000)
})
