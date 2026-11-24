// Taps on a scoring screen that has not caught up yet (a slow tablet).
//
// Found driving the app in Chrome with the CPU throttled 6x on a busy machine
// (2026-10-08): a point or a rally start took seconds to show, and a second
// tap on the button still on screen was recorded as well: a point with no
// rally_start before it, two rally_starts in a row. Start rally was no
// scorer action at all here (OpenVolley's is: key 'rally'), so two quick taps
// on it logged two rally starts even on a fast screen. A point's key ('point')
// drops a second tap only until its data is on screen OR the live query has
// not delivered it for COMMIT_FLUSH_MAX_WAIT_MS (useActionLiveQuery_beach):
// then it lets go while the screen still shows the old buttons. A point is
// now written only while its rally is in play in the database, a rally start
// only while none is: one point and one rally start per rally whatever the
// screen shows.
//
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB), driven with taps; the live query's results are held back to
// keep the screen behind the database, as a busy tablet's main thread does.
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

// The screen's live query (hooks_beach/useActionLiveQuery_beach) reads
// through dexie's liveQuery: while `held`, its results wait (in order)
const held = vi.hoisted(() => ({ on: false, queue: [] }))
vi.mock('dexie', async (importOriginal) => {
  const mod = await importOriginal()
  const liveQuery = (querier) => {
    const inner = mod.liveQuery(querier)
    return {
      subscribe(observer) {
        const deliver = (v) => { if (held.on) held.queue.push(() => observer.next(v)); else observer.next(v) }
        return inner.subscribe({ next: deliver, error: (e) => observer.error?.(e) })
      }
    }
  }
  return { ...mod, liveQuery }
})

import '../helpers/fakeIndexedDb'
import { render, fireEvent, waitFor, cleanup, screen, within } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'
import { COMMIT_FLUSH_MAX_WAIT_MS } from '../../hooks_beach/useActionLiveQuery_beach'

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
  held.on = false
  held.queue = []
  await Promise.all(db.tables.map(t => t.clear()))
})
afterEach(() => {
  release()
  setViewport(saved.width, saved.height)
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 150))
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
function release() {
  held.on = false
  const queue = held.queue
  held.queue = []
  for (const deliver of queue) deliver()
}

// Set 1 under way at 1:1 (`started`: else not started yet), team 1 (A) on
// the left; no point awarded on this screen yet (no accidental-start question)
async function setUpMatch({ started = true } = {}) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_stale_taps_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  const t = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await db.sets.add({ matchId, index: 1, team1Points: started ? 1 : 0, team2Points: started ? 1 : 0, finished: false, startTime: started ? t : null })
  let seq = 1
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: t })
  if (!started) return matchId
  await db.events.add({ matchId, setIndex: 1, type: 'set_start', payload: {}, seq: seq++, ts: t })
  const at = (i) => new Date(Date.parse(t) + (i + 1) * 5000).toISOString()
  for (const [i, team] of ['team1', 'team2'].entries()) {
    await db.events.add({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: at(i) })
    await db.events.add({ matchId, setIndex: 1, type: 'point', payload: { team, score: { team1: 1, team2: i } }, seq: seq++, ts: at(i) })
  }
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

// The screen behind the database: the tap is written, the action has let go
// of its key (no live query result for COMMIT_FLUSH_MAX_WAIT_MS), the screen
// still shows what it showed before the tap
async function tapWhileScreenBehind(el, type, count, { staysOnScreen = true } = {}) {
  held.on = true
  fireEvent.click(el)
  await waitFor(async () => expect((await ofType(type)).length).toBe(count + 1), { timeout: 5000 })
  await wait(COMMIT_FLUSH_MAX_WAIT_MS + 300)
  if (staysOnScreen) expect(el.isConnected).toBe(true)
}

describe('Scoreboard_beach: a tap on a screen that has not caught up', () => {
  it('two quick taps on Start rally start one rally', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
    await settle()
    const start = button('Start rally')
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(start)
    fireEvent.click(start)
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies + 1)
  }, 60000)

  it('desktop: a second tap on Start rally starts no second rally', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
    await settle()
    const start = button('Start rally')
    const rallies = (await ofType('rally_start')).length
    await tapWhileScreenBehind(start, 'rally_start', rallies)
    fireEvent.click(start)
    await wait(500)
    release()
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies + 1)
  }, 60000)

  it('a second tap on Start set starts the set once', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch({ started: false }))
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 10000 })
    await settle()
    const startSet = button('Start set')
    fireEvent.click(startSet)
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    await settle()
    // the set start is written, the dialog closed, the screen still says Start set
    await tapWhileScreenBehind(button('Confirm'), 'set_start', 0, { staysOnScreen: false })
    expect(startSet.isConnected).toBe(true)
    fireEvent.click(startSet)
    await wait(1000)
    // a second set start dialog, if one opened, confirmed as the first
    if (button('Confirm')) {
      await settle()
      fireEvent.click(button('Confirm'))
      await wait(1000)
    }
    release()
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    await settle()
    expect((await ofType('set_start')).length).toBe(1)
    expect((await ofType('rally_start')).length).toBe(1)
  }, 60000)

  it('desktop: a second tap on a point button gives no second point for the rally', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
    await settle()
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    await settle()
    const pointA = button('Point A')
    const pointB = button('Point B')
    const points = (await ofType('point')).length
    await tapWhileScreenBehind(pointA, 'point', points)
    fireEvent.click(pointA)
    await wait(500)
    fireEvent.click(pointB)
    await wait(500)
    release()
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    await settle()
    const after = await ofType('point')
    expect(after.length).toBe(points + 1)
    expect(after[after.length - 1].payload.team).toBe('team1')
    const set = (await db.sets.toArray())[0]
    expect([set.team1Points, set.team2Points]).toEqual([2, 1])
  }, 60000)

  it('phone: a second tap on a point button gives no second point for the rally', async () => {
    setViewport(390, 844)
    mount(await setUpMatch())
    await waitFor(() => expect(screen.queryByTestId('phone-scoreboard')).toBeTruthy(), { timeout: 10000 })
    const view = within(screen.getByTestId('phone-scoreboard'))
    await waitFor(() => expect(view.queryByTestId('phone-start')).toBeTruthy(), { timeout: 10000 })
    await settle()
    fireEvent.click(view.getByTestId('phone-start'))
    await waitFor(() => expect(view.queryByRole('button', { name: 'Point A' })).toBeTruthy(), { timeout: 5000 })
    await settle()
    const pointA = view.getByRole('button', { name: 'Point A' })
    const points = (await ofType('point')).length
    await tapWhileScreenBehind(pointA, 'point', points)
    fireEvent.click(pointA)
    await wait(500)
    release()
    await waitFor(() => expect(view.queryByTestId('phone-start')).toBeTruthy(), { timeout: 5000 })
    await settle()
    expect((await ofType('point')).length).toBe(points + 1)
  }, 60000)

  it('the rallies after it are scored as usual, for the team tapped', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    for (const [tapPoint, team] of [['Point B', 'team2'], ['Point A', 'team1']]) {
      await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
      await settle()
      const rallies = (await ofType('rally_start')).length
      fireEvent.click(button('Start rally'))
      await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
      await waitFor(() => expect(button(tapPoint)).toBeTruthy(), { timeout: 5000 })
      await settle()
      const points = (await ofType('point')).length
      fireEvent.click(button(tapPoint))
      await waitFor(async () => expect((await ofType('point')).length).toBe(points + 1), { timeout: 5000 })
      const last = (await ofType('point')).pop()
      expect(last.payload.team).toBe(team)
    }
  }, 60000)
})
