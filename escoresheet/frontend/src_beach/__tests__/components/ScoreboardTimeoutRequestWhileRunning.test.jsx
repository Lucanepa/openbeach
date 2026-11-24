// The time-out counters stay open while a time-out runs (the other team's
// time-out right after): the request dialog replaced the running time-out,
// and Cancel then dropped it (the countdown was gone, the referee's ran on).
// And undoing the time-out while it ran (the phone layout's Undo stays in its
// header) kept its countdown on screen. (OpenVolley 519f3c9c.) The real scoring screen over the app's Dexie
// database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
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
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT, width: window.innerWidth, height: window.innerHeight }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(async () => {
  cleanup()
  window.innerWidth = saved.width
  window.innerHeight = saved.height
  vi.mocked(localStorage.getItem).mockReset()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text && !b.disabled)
// the running time-out: the desktop's stop sign, the phone's Stop time-out
const running = () => document.querySelector('[title="Stop time-out"]') || buttons('Stop time-out')[0]
const ghost = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 150))

async function seed({ phone = false } = {}) {
  if (phone) {
    window.innerWidth = 390
    window.innerHeight = 844
  }
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 300000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false, startTime: start })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
    { matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: 3, ts: start },
    { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: start }
  ])
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
  if (phone) await waitFor(() => expect(document.querySelector('[data-testid="phone-scoreboard"]')).toBeTruthy(), { timeout: 10000 })
  else await waitFor(() => expect(buttons('TO')).toHaveLength(2), { timeout: 8000 })
  return matchId
}

const timeoutCounter = (side, phone) => phone
  ? document.querySelector(`[data-testid="phone-timeout-${side}"]`)
  : buttons('TO')[side === 'left' ? 0 : buttons('TO').length - 1]

// Team A (team 1, on the left) takes its time-out: the countdown runs
async function startTimeout({ phone = false } = {}) {
  fireEvent.click(timeoutCounter('left', phone))
  await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(1))
  fireEvent.click(buttons('Confirm time-out')[0])
  await waitFor(() => expect(running()).toBeTruthy())
  await ghost()
}

describe('Scoreboard_beach: a time-out request while a time-out runs', () => {
  it('Cancel keeps the running time-out and its countdown', async () => {
    const matchId = await seed()
    await startTimeout()
    // the other team's counter opens its request over the running time-out
    expect(buttons('TO')).toHaveLength(1)
    fireEvent.click(buttons('TO')[0])
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(1))
    fireEvent.click(buttons('Cancel')[0])
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(0))
    // the running time-out is back, still counting
    await waitFor(() => expect(running()).toBeTruthy())
    expect(running().textContent).toMatch(/Time-out – Alpha \/ Beta/)
    expect(await db.events.where({ matchId, type: 'timeout' }).count()).toBe(1)
  }, 30000)

  it('Escape on the request keeps the running time-out (keyboard shortcuts on)', async () => {
    // (localStorage is setup.js's mock)
    vi.mocked(localStorage.getItem).mockImplementation((key) => (key === 'keybindingsEnabled' ? 'true' : undefined))
    await seed()
    await startTimeout()
    fireEvent.click(buttons('TO')[0])
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(1))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(buttons('Confirm time-out')).toHaveLength(0))
    await waitFor(() => expect(running()).toBeTruthy())
    expect(running().textContent).toMatch(/Time-out – Alpha \/ Beta/)
  }, 30000)
})

describe('Scoreboard_beach: undoing a time-out while it runs', () => {
  it('stops its countdown (the phone layout)', async () => {
    const matchId = await seed({ phone: true })
    await startTimeout({ phone: true })
    expect(document.body.textContent).toMatch(/Time-out – Alpha \/ Beta/)
    fireEvent.click(document.querySelector('[data-testid="phone-scoreboard"] button[aria-label="Undo"]'))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    fireEvent.click([...document.querySelectorAll('[data-testid="undo-confirm"] button')].find(b => b.textContent.trim() === 'Undo'))
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'timeout' }).count()).toBe(0))
    await waitFor(() => expect(running()).toBeFalsy())
    expect(document.body.textContent).not.toMatch(/Time-out – Alpha \/ Beta/)
    expect(timeoutCounter('left', true).disabled).toBe(false)
  }, 30000)
})
