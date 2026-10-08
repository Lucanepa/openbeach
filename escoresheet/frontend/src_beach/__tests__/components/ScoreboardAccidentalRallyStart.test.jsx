// The accidental rally start check (options: "Check accidental rally start"):
// with it on, "Start rally" pressed within the set number of seconds of a
// point being awarded asks "Rally started very quickly / Are you sure the
// rally has actually started?" before the rally is started. Found by the
// phone-scorer builders (2026-10-08): the Start rally button handed its click
// event to handleStartRally, whose first parameter means "skip the
// confirmation", so a tap on the button never asked; only the Enter key did.
// The button now asks as the key does; the dialog's own "Yes, start rally"
// still starts the rally without asking again.
//
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB), driven with taps. Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

const SETTINGS = ['checkAccidentalRallyStart', 'accidentalRallyStartDuration', 'keybindingsEnabled']
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
  // the global setup stubs localStorage: the settings are read from it
  useMemoryLocalStorage()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterEach(() => {
  for (const key of SETTINGS) localStorage.removeItem(key)
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
const askOpen = () => document.body.textContent.includes('Rally started very quickly')

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_rally_check_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

// Start set (no point awarded yet: it does not ask), then Point A
async function firstRallyWonByA() {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 10000 })
  await settle()
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
  await settle()
  fireEvent.click(button('Point A'))
  await waitFor(async () => expect((await ofType('point')).length).toBe(1), { timeout: 5000 })
  await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
  await settle()
}

async function mountWithCheck(duration) {
  localStorage.setItem('checkAccidentalRallyStart', 'true')
  localStorage.setItem('accidentalRallyStartDuration', String(duration))
  mount(await setUpMatch())
  await firstRallyWonByA()
}

describe('Scoreboard_beach: the accidental rally start check', () => {
  it('the Start rally button asks when pressed right after a point; "Yes, start rally" starts it', async () => {
    await mountWithCheck(60)
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(askOpen()).toBe(true), { timeout: 5000 })
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies)
    expect(button('Point A')).toBeFalsy()
    fireEvent.click(button('Yes, start rally'))
    await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
    await waitFor(() => expect(askOpen()).toBe(false))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
  }, 60000)

  it('Cancel on the question starts no rally', async () => {
    await mountWithCheck(60)
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(askOpen()).toBe(true), { timeout: 5000 })
    await settle()
    fireEvent.click(button('Cancel'))
    await waitFor(() => expect(askOpen()).toBe(false))
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies)
    expect(button('Start rally')).toBeTruthy()
  }, 60000)

  it('the Enter key asks too, and Enter on the question starts the rally', async () => {
    localStorage.setItem('keybindingsEnabled', 'true')
    await mountWithCheck(60)
    const rallies = (await ofType('rally_start')).length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(askOpen()).toBe(true), { timeout: 5000 })
    await settle()
    expect((await ofType('rally_start')).length).toBe(rallies)
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
    await waitFor(() => expect(askOpen()).toBe(false))
  }, 60000)

  it('does not ask once the set number of seconds has passed since the point', async () => {
    await mountWithCheck(1)
    await wait(1100)
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(button('Start rally'))
    await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
    expect(askOpen()).toBe(false)
  }, 60000)

  it('with the check off (the default) the button starts the rally at once', async () => {
    mount(await setUpMatch())
    await firstRallyWonByA()
    const rallies = (await ofType('rally_start')).length
    fireEvent.click(button('Start rally'))
    await waitFor(async () => expect((await ofType('rally_start')).length).toBe(rallies + 1), { timeout: 5000 })
    expect(askOpen()).toBe(false)
  }, 60000)
})
