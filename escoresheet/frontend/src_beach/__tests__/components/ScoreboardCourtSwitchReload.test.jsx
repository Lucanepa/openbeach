// The changes of courts and the technical time-out of a beach set follow the
// score, also when the scoring screen is opened again (reload, the app opened
// again). Two parts (owner's decisions, 2026-10-08, ported from OpenVolley):
// - B2: the dialogs lived only in the screen's state: reloaded with the
//   change-of-courts dialog, the TTO dialog, or a decision change asked from
//   one of them, open, the screen came back without it and the courts
//   unchanged (verifier finding). Once per set on first show it asks again.
// - B1: a change of courts made at a total the score no longer reaches (no
//   live scoring path lowers the total after a change: the screen offers no
//   decision change until the next rally; a correction that takes out the
//   point that reached it leaves it) asks to change the courts back, and the
//   change (with a TTO's change, the TTO) is asked again at that total.
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB), driven with taps. Network is off: no relay socket, no fetch.
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
  // and on screen (the rally over): an Undo tapped before the screen has the
  // point offers the rally start (found under the full suite's load)
  await waitFor(() => expect(button(label)).toBeFalsy(), { timeout: 5000 })
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
  // the confirmation gone from the screen too, so the next Undo offers the
  // event that is now last
  await waitFor(() => expect(buttons('Undo').length).toBeLessThanOrEqual(1), { timeout: 5000 })
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

const switchBackOpen = () => !!button('Switch courts back')
const decisionOpen = () => document.body.textContent.includes('Last point was assigned to')
const ttoStarted = () => document.body.textContent.includes('Click to end & switch courts')
const screenDecisionChange = () => buttons('Decision change').at(-1)
async function reload(matchId) {
  cleanup()
  mount(matchId)
  await waitFor(() => expect(document.body.textContent).toMatch(/Start rally|Switch courts|Start TTO|Click to end/), { timeout: 10000 })
  await settle()
}
async function switchCourtsBack() {
  await waitFor(() => expect(switchBackOpen()).toBe(true), { timeout: 5000 })
  expect(document.body.textContent).toContain('Court switch back required')
  fireEvent.click(button('Switch courts back'))
  await waitFor(() => expect(switchBackOpen()).toBe(false))
  await settle()
}
// a correction took the last point out (its rally start too): the score
// loses it, what it reached stays recorded
async function takeLastPointOut(matchId) {
  const all = await events()
  const last = all.filter(e => e.type === 'point').at(-1)
  const rally = all.filter(e => e.type === 'rally_start' && e.seq < last.seq).at(-1)
  await db.events.bulkDelete([last.id, rally.id])
  const [set1] = await db.sets.toArray()
  const field = last.payload.team === 'team1' ? 'team1Points' : 'team2Points'
  await db.sets.update(set1.id, { [field]: set1[field] - 1 })
}
// set 1 at 11:10 (21 points, the changes at 7 and 14 made), the TTO dialog open
async function toTto() {
  await startSet()
  await rallies(Array.from({ length: 21 }, (_, i) => (i % 2 ? 'Point B' : 'Point A')), { first: true })
  expect(await score()).toEqual([11, 10])
  await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
}

describe('Scoreboard_beach B2: a reload with a dialog of the courts pending asks for it again', () => {
  it('reloaded with the change-of-courts dialog open: it is asked again, the change made once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    for (let i = 0; i < 7; i++) {
      if (i > 0) await startRally()
      await point(i % 2 ? 'Point B' : 'Point A')
    }
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    const sidesBefore = await sides(matchId)

    await reload(matchId)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).not.toBe(sidesBefore)

    // the next point asks nothing; another reload asks nothing
    await startRally()
    await point('Point A')
    await settle()
    expect(switchOpen()).toBe(false)
    await reload(matchId)
    expect(switchOpen()).toBe(false)
    expect(await ofType('court_switch')).toHaveLength(1)
    cleanup()
  }, 60000)

  it('reloaded with a decision change asked from the change-of-courts dialog: the change is asked', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    for (let i = 0; i < 7; i++) {
      if (i > 0) await startRally()
      await point('Point A')
    }
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await settle()
    fireEvent.click(dialogDecisionChange('Switch courts'))
    await waitFor(() => expect(decisionOpen()).toBe(true))

    await reload(matchId)
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    expect(decisionOpen()).toBe(false)
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    cleanup()
  }, 60000)

  it('reloaded with the TTO dialog open (not started, then started): the TTO is asked again, its change of courts made once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await toTto()
    const sidesBefore = await sides(matchId)

    await reload(matchId)
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(await ofType('technical_to')).toHaveLength(1)
    expect(switchOpen()).toBe(false)

    // started, then reloaded: asked again (not started)
    fireEvent.click(button('Start TTO'))
    await waitFor(() => expect(ttoStarted()).toBe(true))
    await reload(matchId)
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(await sides(matchId)).toBe(sidesBefore)

    await endTto()
    expect(await sides(matchId)).not.toBe(sidesBefore)
    expect((await ofType('technical_to'))[0].payload.courtSwitched).toBe(true)
    const sidesAfter = await sides(matchId)

    // ended: a reload asks nothing and changes nothing
    await reload(matchId)
    expect(ttoOpen()).toBe(false)
    expect(switchOpen()).toBe(false)
    expect(await sides(matchId)).toBe(sidesAfter)
    expect(await ofType('technical_to')).toHaveLength(1)
    expect(await ofType('court_switch')).toHaveLength(2)
    cleanup()
  }, 120000)

  it('a TTO logged before its change was recorded on it: pending while the sides are the ones before it, done once they changed', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await toTto()
    // logged by an older version: no courtSwitched field
    const [legacy] = await ofType('technical_to')
    const { courtSwitched, ...payload } = legacy.payload
    expect(courtSwitched).toBe(false)
    await db.events.update(legacy.id, { payload })

    await reload(matchId)
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    await endTto()
    const [ended] = await ofType('technical_to')
    const { courtSwitched: made, ...endedPayload } = ended.payload
    expect(made).toBe(true)
    await db.events.update(ended.id, { payload: endedPayload })
    const sidesAfter = await sides(matchId)

    await reload(matchId)
    expect(ttoOpen()).toBe(false)
    expect(await sides(matchId)).toBe(sidesAfter)
    cleanup()
  }, 120000)
})

describe('Scoreboard_beach B1: the courts follow the score', () => {
  // The check: no live scoring path lowers the total after a change of courts
  // or the TTO's change (a replay, a BMP replaying the rally, an undo): the
  // screen's decision change is offered for the last point only, and the
  // change's event comes after it; undo takes the change back first.
  it('no decision change on the scoring screen once the change of courts is made; Undo takes the change back first', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 7 }, () => 'Point A'), { first: true })
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(screenDecisionChange()).toBeFalsy()

    await undoLast()
    expect(await ofType('court_switch')).toHaveLength(0)
    expect(await score()).toEqual([7, 0])
    expect(screenDecisionChange()).toBeTruthy()
    cleanup()
  }, 60000)

  // Undo takes the change of courts (or the ended TTO) back before its point.
  // A rally started then went on past that total: 7:1 with the courts never
  // changed at 7, and nothing asked again (verifier finding). The change owed
  // is asked instead of the rally; Undo can still go further back.
  it('a rally started after Undo took the change of courts back asks for the change first', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    const sidesBefore = await sides(matchId)
    await rallies(Array.from({ length: 7 }, () => 'Point A'), { first: true })
    const sidesSwitched = await sides(matchId)
    await undoLast()
    expect(await ofType('court_switch')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBefore)
    expect(switchOpen()).toBe(false)

    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    expect(button('Point A')).toBeFalsy()
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).toBe(sidesSwitched)
    await startRally()
    await point('Point B')
    expect(await score()).toEqual([7, 1])
    expect(await sides(matchId)).toBe(sidesSwitched)

    // Undo further back: the point at 7 goes, and the next rally asks nothing
    await undoLast()
    await undoLast()
    await undoLast()
    expect(await score()).toEqual([6, 0])
    expect(await sides(matchId)).toBe(sidesBefore)
    await startRally()
    expect(switchOpen()).toBe(false)
    cleanup()
  }, 90000)

  it('a rally started after Undo took the ended TTO back asks for the TTO, its change made once', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await toTto()
    const sidesBeforeTto = await sides(matchId)
    await endTto()
    const sidesAfterTto = await sides(matchId)
    await undoLast()
    expect(await ofType('technical_to')).toHaveLength(0)
    expect(await sides(matchId)).toBe(sidesBeforeTto)

    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    expect(await ofType('technical_to')).toHaveLength(1)
    await endTto()
    expect(await sides(matchId)).toBe(sidesAfterTto)
    await startRally()
    await point('Point B')
    expect(await score()).toEqual([11, 11])
    expect(await sides(matchId)).toBe(sidesAfterTto)
    expect(await ofType('technical_to')).toHaveLength(1)
    cleanup()
  }, 120000)

  it('the keyboard shortcuts start no rally and score no point under the TTO dialog', async () => {
    // (localStorage is a mock in these tests)
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(key => (key === 'keybindingsEnabled' ? 'true' : null))
    try {
      const matchId = await setUpMatch()
      mount(matchId)
      await toTto()
      await settle()
      fireEvent.keyDown(window, { key: 'Enter' })
      await settle()
      fireEvent.keyDown(window, { key: 'a' })
      await settle()
      expect(await score()).toEqual([11, 10])
      expect(await ofType('rally_start')).toHaveLength(21)
      expect(ttoOpen()).toBe(true)
    } finally {
      getItem.mockReset()
    }
    cleanup()
  }, 120000)

  it('a change of courts the score no longer reaches (7 back to 6) asks to change back; at 7 again the change is asked again', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    const sidesBefore = await sides(matchId)
    await rallies(Array.from({ length: 7 }, () => 'Point A'), { first: true })
    const sidesSwitched = await sides(matchId)
    expect(sidesSwitched).not.toBe(sidesBefore)

    await takeLastPointOut(matchId)
    await reload(matchId)
    expect(await score()).toEqual([6, 0])
    await waitFor(() => expect(switchBackOpen()).toBe(true), { timeout: 5000 })
    expect(switchOpen()).toBe(false)
    expect(document.body.textContent).toContain('the teams switch courts back')
    // no BMP for the change back (no point reached it)
    expect(dialogBmp()).toBeFalsy()
    await switchCourtsBack()
    expect(await sides(matchId)).toBe(sidesBefore)
    expect(await ofType('court_switch')).toHaveLength(0)

    await startRally()
    await point('Point A')
    await waitFor(() => expect(switchOpen()).toBe(true), { timeout: 5000 })
    await switchCourts()
    expect(await ofType('court_switch')).toHaveLength(1)
    expect(await sides(matchId)).toBe(sidesSwitched)

    // Undo: the change, then the point; the courts never change twice
    await undoLast()
    expect(await sides(matchId)).toBe(sidesBefore)
    await undoLast()
    expect(await score()).toEqual([6, 0])
    expect(await sides(matchId)).toBe(sidesBefore)
    cleanup()
  }, 90000)

  it('a decision change asked from the change-back dialog and cancelled brings it back', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await rallies(Array.from({ length: 7 }, () => 'Point A'), { first: true })
    await takeLastPointOut(matchId)
    await reload(matchId)
    await waitFor(() => expect(switchBackOpen()).toBe(true), { timeout: 5000 })

    fireEvent.click(dialogDecisionChange('Switch courts back'))
    await waitFor(() => expect(decisionOpen()).toBe(true))
    expect(switchBackOpen()).toBe(false)
    fireEvent.click(button('Cancel'))
    await waitFor(() => expect(switchBackOpen()).toBe(true), { timeout: 5000 })
    await switchCourtsBack()
    expect(await ofType('court_switch')).toHaveLength(0)
    cleanup()
  }, 90000)

  it("the TTO's change of courts the score no longer reaches (21 back to 20) asks to change back; at 21 the TTO and its change come again", async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await toTto()
    const sidesBeforeTto = await sides(matchId)
    await endTto()
    const sidesAfterTto = await sides(matchId)
    expect(sidesAfterTto).not.toBe(sidesBeforeTto)

    await takeLastPointOut(matchId)
    await reload(matchId)
    expect((await score()).reduce((a, b) => a + b)).toBe(20)
    await switchCourtsBack()
    expect(await sides(matchId)).toBe(sidesBeforeTto)
    expect(await ofType('technical_to')).toHaveLength(0)
    expect(await ofType('court_switch')).toHaveLength(2)

    await startRally()
    await point('Point B')
    await waitFor(() => expect(ttoOpen()).toBe(true), { timeout: 5000 })
    await endTto()
    expect(await sides(matchId)).toBe(sidesAfterTto)
    expect(await ofType('technical_to')).toHaveLength(1)
    cleanup()
  }, 120000)
})
