// One BMP per completed rally (the owner, 2026-10-08: "there has to be a
// completed rally, otherwise no"), on the real scoring screen over the app's
// real Dexie database (fake IndexedDB), driven with taps. The court switch and
// set-end dialogs offered a second BMP on the same rally after an unsuccessful
// one; the window is read from the events, so it is the same after a reload.
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
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
// the scoring screen's team BMP buttons ("BMP" + the BMPs left)
const bmpButtons = () => [...document.querySelectorAll('button')].filter(b => /^BMP\d$/.test(b.textContent.trim()))
// a dialog's "BMP request" (team label + "BMP request" + the BMPs left)
const dialogBmp = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('BMP request'))

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_bmp_test',
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

// Team A wins the rally in play (the first one is started by startSet)
async function pointA() {
  const before = (await ofType('point')).length
  fireEvent.click(button('Point A'))
  await waitFor(async () => expect((await ofType('point')).length).toBe(before + 1))
}
async function startRally() {
  await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start rally'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
}
async function switchCourts() {
  await waitFor(() => expect(button('Switch courts')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Switch courts'))
  await waitFor(async () => expect((await ofType('court_switch')).length).toBeGreaterThan(0))
  await waitFor(() => expect(button('Switch courts')).toBeFalsy())
  await settle()
}
async function unsuccessfulBmp(open) {
  const before = (await ofType('challenge_outcome')).length
  fireEvent.click(open)
  await waitFor(() => expect(button('Unsuccessful')).toBeTruthy())
  fireEvent.click(button('Unsuccessful'))
  await waitFor(() => expect(button('Confirm Unsuccessful')).toBeTruthy())
  fireEvent.click(button('Confirm Unsuccessful'))
  await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(before + 1))
  await settle()
}

describe('Scoreboard_beach: one BMP per completed rally', () => {
  it('the court switch dialog offers no second BMP on the same rally; the next completed rally opens it again, also after a reload', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    // set start: no rally completed yet, no BMP
    expect(bmpButtons().every(b => b.disabled)).toBe(true)

    for (let i = 1; i <= 7; i++) {
      if (i > 1) await startRally()
      await pointA()
    }
    // 7:0, the court switch dialog offers team B a BMP on that rally
    await waitFor(() => expect(button('Switch courts')).toBeTruthy(), { timeout: 5000 })
    await waitFor(() => expect(dialogBmp()).toBeTruthy())
    await unsuccessfulBmp(dialogBmp())

    // the dialog is still there, without a second BMP for that rally
    await waitFor(() => expect(button('Switch courts')).toBeTruthy())
    expect(dialogBmp()).toBeFalsy()
    expect(bmpButtons().every(b => b.disabled)).toBe(true)

    await switchCourts()
    expect(bmpButtons().every(b => b.disabled)).toBe(true)

    // reload: still none, read from the events
    cleanup()
    mount(matchId)
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    expect(bmpButtons()).toHaveLength(2)
    expect(bmpButtons().every(b => b.disabled)).toBe(true)

    // during the next rally: greyed; the referee BMP decides that rally
    await startRally()
    expect(bmpButtons().every(b => b.disabled)).toBe(true)
    expect(button('Referee BMP')).toBeTruthy()
    // the next rally completed: a BMP again (team B has one left)
    await pointA()
    await waitFor(() => expect(bmpButtons().every(b => !b.disabled)).toBe(true))
    expect(button('Referee BMP')).toBeFalsy()

    // and after a reload too
    cleanup()
    mount(matchId)
    await waitFor(() => expect(bmpButtons().length).toBe(2), { timeout: 5000 })
    await waitFor(() => expect(bmpButtons().every(b => !b.disabled)).toBe(true))
    cleanup()
  }, 60000)

  it('the set-end dialog, reopened after an unsuccessful BMP, offers no second one on the same rally', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    for (let i = 1; i <= 21; i++) {
      if (i > 1) await startRally()
      await pointA()
      if (i === 7 || i === 14) await switchCourts()
    }
    // 21:0: the set-end dialog with team B's BMP request (2 left)
    const setEndOpen = () => document.body.textContent.includes('Set 1 end')
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await waitFor(() => expect(dialogBmp()).toBeTruthy(), { timeout: 5000 })
    expect(dialogBmp().textContent).toContain('2')
    await unsuccessfulBmp(dialogBmp())

    // the set-end dialog comes back for the same point: no second BMP
    await waitFor(() => expect(setEndOpen()).toBe(true), { timeout: 5000 })
    await settle()
    expect(setEndOpen()).toBe(true)
    expect((await ofType('challenge')).length).toBe(1)
    expect(dialogBmp()).toBeFalsy()
    cleanup()
  }, 90000)
})
