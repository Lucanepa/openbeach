// A double or triple tap on the rally buttons: one tap, one action (ported
// from OpenVolley 904f6350, taps only).
//
// Start rally and Point A | Point B replace each other in the same place:
// the second tap of a double tap (a wet or bouncing finger, a tablet
// registering one tap twice) landed on the button that had just replaced the
// first one. Stress test 2026-10-25, real mouse taps 120 to 200 ms apart: a
// triple tap on a point button logged point, rally_start, point within about
// 300 ms, two points for one rally (5 bursts in 8; on an official match on
// the server too), and a double tap left a rally running in the break. For
// GHOST_CLICK_MS after the buttons change, a tap on them is now taken as the
// end of the tap that changed them. Their keys are not: a key is pressed on
// purpose.
//
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB); the next tap lands the moment the new button is on screen.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import '../helpers/fakeIndexedDb'
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
afterAll(() => {
  cleanup()
  setViewport(saved.width, saved.height)
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 150))
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const ofType = async (type) => (await db.events.toArray()).filter(e => e.type === type)
const button = (text, root = document) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const score = async () => {
  const set = (await db.sets.toArray())[0]
  return [set.team1Points, set.team2Points]
}

// The next tap of a double tap: as soon as `text` is on screen (the commit
// that drew it, before anything else runs), tap it
function tapAsSoonAsShown(text, root = () => document) {
  return new Promise((resolve) => {
    const tryTap = () => {
      const el = button(text, root())
      if (!el) return false
      fireEvent.click(el)
      resolve()
      return true
    }
    if (tryTap()) return
    const observer = new MutationObserver(() => { if (tryTap()) observer.disconnect() })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}

// Set 1 under way at 1:1, team 1 (A) on the left
async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_double_tap_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  const t = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 1, finished: false, startTime: t })
  let seq = 1
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: t })
  await db.events.add({ matchId, setIndex: 1, type: 'set_start', payload: {}, seq: seq++, ts: t })
  const at = (i) => new Date(Date.parse(t) + (i + 1) * 5000).toISOString()
  for (const [i, team] of ['team1', 'team2'].entries()) {
    await db.events.add({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: at(i) })
    await db.events.add({ matchId, setIndex: 1, type: 'point', payload: { team, score: { team1: 1, team2: i } }, seq: seq++, ts: at(i) })
  }
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

describe('Scoreboard_beach: a double or triple tap on the rally buttons', () => {
  it('desktop: a triple tap on Point gives its rally one point and starts no rally', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
    await settle()
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(button('Point B')).toBeTruthy(), { timeout: 5000 })
    await settle()
    const points = (await ofType('point')).length
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(button('Point B'))
    // second tap: on Start rally, drawn where Point B was
    await tapAsSoonAsShown('Start rally')
    await wait(150)
    // third tap: on whatever is there now
    const third = button('Point B') || button('Start rally')
    if (third) fireEvent.click(third)
    await settle()
    expect((await ofType('point')).length).toBe(points + 1)
    expect((await ofType('rally_start')).length).toBe(rallies)
    expect(await score()).toEqual([1, 2])
    expect(button('Start rally')).toBeTruthy()

    // the next rally is started and scored as usual
    fireEvent.click(button('Start rally'))
    await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    await settle()
    fireEvent.click(button('Point A'))
    await waitFor(async () => expect((await ofType('point')).length).toBe(points + 2), { timeout: 5000 })
    expect(await score()).toEqual([2, 2])
  }, 60000)

  it('desktop: a double tap on Start rally starts the rally and scores no point', async () => {
    setViewport(1280, 800)
    mount(await setUpMatch())
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 10000 })
    await settle()
    const points = (await ofType('point')).length
    fireEvent.click(button('Start rally'))
    // the second tap lands on Point B, drawn where Start rally was
    await tapAsSoonAsShown('Point B')
    await settle()
    expect((await ofType('point')).length).toBe(points)
    expect(await score()).toEqual([1, 1])
    expect(button('Point A')).toBeTruthy()
  }, 60000)

  it('phone: a double tap on a point button starts no rally', async () => {
    setViewport(390, 844)
    mount(await setUpMatch())
    await waitFor(() => expect(screen.queryByTestId('phone-scoreboard')).toBeTruthy(), { timeout: 10000 })
    const phone = () => screen.getByTestId('phone-scoreboard')
    const view = within(phone())
    await waitFor(() => expect(view.queryByTestId('phone-start')).toBeTruthy(), { timeout: 10000 })
    await settle()
    fireEvent.click(view.getByTestId('phone-start'))
    await waitFor(() => expect(view.queryByRole('button', { name: 'Point A' })).toBeTruthy(), { timeout: 5000 })
    await settle()
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(view.getByRole('button', { name: 'Point A' }))
    // the second tap lands on the start button drawn in its place
    await new Promise((resolve) => {
      const tryTap = () => {
        const el = phone().querySelector('[data-testid="phone-start"]')
        if (!el) return false
        fireEvent.click(el)
        resolve()
        return true
      }
      if (tryTap()) return
      const observer = new MutationObserver(() => { if (tryTap()) observer.disconnect() })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies)
    expect(await score()).toEqual([2, 1])
  }, 60000)
})
