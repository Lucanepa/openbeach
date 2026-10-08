// The phone layout of the beach scoring screen (PhoneScoreboard_beach): at
// phone width (390x844, portrait) Scoreboard_beach shows it instead of the
// desktop body, and its buttons drive the screen's own handlers and dialogs.
// Start set, point, BMP, time-out and undo are taken through it here, and
// land in the database as the desktop buttons write them. A landscape screen
// keeps the desktop body.
//
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB), driven with taps. Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
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

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 150))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
const phone = () => screen.queryByTestId('phone-scoreboard')

// Set 1 not started yet: team 1 (A) on the left, serving; two players each
async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta', color: '#facc15' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta', color: '#1c1917' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 3, name: 'Gamma' }, { teamId: t2, number: 4, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_phone_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 3
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

describe('Scoreboard_beach: the phone layout', () => {
  it('a landscape screen keeps the desktop body (no phone layout)', async () => {
    setViewport(1280, 800)
    const matchId = await setUpMatch()
    mount(matchId)
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 10000 })
    expect(phone()).toBeNull()
    expect(screen.getByTestId('scoring-layout')).toBeTruthy()
  })

  it('at 390x844 drives start set, point, BMP, time-out and undo through the phone view', async () => {
    setViewport(390, 844)
    const matchId = await setUpMatch()
    mount(matchId)
    await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
    // the desktop body is not there
    expect(screen.queryByTestId('scoring-layout')).toBeNull()
    const view = within(phone())
    expect(view.getByTestId('phone-score-left').textContent).toBe('0')
    expect(view.getByTestId('phone-score-right').textContent).toBe('0')
    // two players a side, the ball next to team A's first server
    expect(within(view.getByTestId('phone-court-left')).getAllByRole('button').map(b => b.textContent)).toEqual(expect.arrayContaining(['1', '2']))
    expect(within(view.getByTestId('phone-court-left')).getByTestId('phone-serve-ball')).toBeTruthy()
    expect(within(view.getByTestId('phone-court-right')).queryByTestId('phone-serve-ball')).toBeNull()
    expect(view.getByTestId('phone-rhythm').textContent).toMatch(/Switch in 7/)
    expect(view.getByTestId('phone-rhythm').textContent).toMatch(/TTO at 21 \(21\)/)
    // no completed rally yet: no BMP; no rally in play: no referee BMP
    expect(view.getByTestId('phone-bmp-left').disabled).toBe(true)
    expect(view.getByTestId('phone-bmp-right').disabled).toBe(true)
    expect(view.getByTestId('phone-action-refbmp').disabled).toBe(true)
    await settle()

    // ---- Start set: the screen's set start dialog, then the point buttons ----
    expect(view.queryByRole('button', { name: 'Point A' })).toBeNull()
    fireEvent.click(view.getByTestId('phone-start'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy())
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(view.getByRole('button', { name: 'Point A' })).toBeTruthy())
    // square, as wide as their column; lower (not narrower) on a short screen (styles_beach.css)
    expect(view.getByRole('button', { name: 'Point A' }).classList.contains('phone-square')).toBe(true)
    // the referee BMP decides the rally in play
    expect(view.getByTestId('phone-action-refbmp').disabled).toBe(false)
    expect(view.getByTestId('phone-action-replay').disabled).toBe(false)
    await settle()
    fireEvent.click(view.getByRole('button', { name: 'Point A' }))
    await waitFor(async () => expect((await ofType('point')).length).toBe(1))
    expect((await ofType('point'))[0].payload.team).toBe('team1')
    await waitFor(() => expect(view.getByTestId('phone-score-left').textContent).toBe('1'))
    await waitFor(() => expect(view.getByRole('button', { name: 'Start rally' })).toBeTruthy())
    expect(view.getByTestId('phone-rhythm').textContent).toMatch(/Switch in 6/)
    expect(view.getByTestId('phone-recent').textContent).toMatch(/Alpha \/ Beta/)
    await settle()

    // ---- BMP B on the rally just played: the screen's BMP dialog ----
    await waitFor(() => expect(view.getByTestId('phone-bmp-right').disabled).toBe(false))
    expect(view.getByTestId('phone-bmp-right').textContent).toBe('BMP left2')
    fireEvent.click(view.getByTestId('phone-bmp-right'))
    await waitFor(() => expect(button('Unsuccessful')).toBeTruthy())
    fireEvent.click(button('Unsuccessful'))
    await waitFor(() => expect(button('Confirm Unsuccessful')).toBeTruthy())
    fireEvent.click(button('Confirm Unsuccessful'))
    await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(1))
    expect((await ofType('challenge_outcome'))[0].payload.team).toBe('team2')
    // once per rally: both greyed now, B has one left (the request greys
    // them before its outcome is on screen: under the full suite's load the
    // count was read in between)
    await waitFor(() => expect(view.getByTestId('phone-bmp-right').disabled).toBe(true))
    expect(view.getByTestId('phone-bmp-left').disabled).toBe(true)
    await waitFor(() => expect(view.getByTestId('phone-bmp-right').textContent).toBe('BMP left1'))
    await settle()

    // ---- time-out A: the screen's request dialog, then its countdown ----
    fireEvent.click(view.getByTestId('phone-timeout-left'))
    await waitFor(() => expect(button('Confirm time-out')).toBeTruthy())
    await settle()
    fireEvent.click(button('Confirm time-out'))
    await waitFor(async () => expect((await ofType('timeout')).length).toBe(1))
    expect((await ofType('timeout'))[0].payload.team).toBe('team1')
    await waitFor(() => expect(view.getByTestId('phone-countdown')).toBeTruthy())
    await waitFor(() => expect(view.getByTestId('phone-timeout-left').textContent).toMatch('1/1'))
    // one per set: greyed; the other team's stays open
    expect(view.getByTestId('phone-timeout-left').disabled).toBe(true)
    expect(view.getByTestId('phone-timeout-right').disabled).toBe(false)
    await settle()
    fireEvent.click(view.getByRole('button', { name: 'Stop time-out' }))
    await waitFor(() => expect(view.queryByTestId('phone-countdown')).toBeNull())
    await settle()

    // ---- undo: the screen's undo confirmation takes the time-out back ----
    fireEvent.click(view.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    await settle()
    fireEvent.click([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
    await waitFor(async () => expect((await ofType('timeout')).length).toBe(0))
    await waitFor(() => expect(view.getByTestId('phone-timeout-left').textContent).toMatch('0/1'))
    expect(view.getByTestId('phone-timeout-left').disabled).toBe(false)
  }, 60000)

  it('the sanction and MTO · RIT sheets open the screen\'s own menus for the chosen player', async () => {
    setViewport(390, 844)
    const matchId = await setUpMatch()
    mount(matchId)
    await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
    const view = within(phone())
    await settle()
    fireEvent.click(view.getByTestId('phone-action-sanction'))
    await waitFor(() => expect(screen.getByTestId('phone-sanction-B-4')).toBeTruthy())
    fireEvent.click(screen.getByTestId('phone-sanction-B-4'))
    // the screen's sanction menu (the cards), centred on a phone
    await waitFor(() => expect(document.querySelector('.match-record.phone-layout .modal-wrapper-roll-up')).toBeTruthy())
    expect(document.querySelector('.modal-wrapper-roll-up').textContent).toMatch(/Warning/i)
    cleanup()

    // MTO · RIT: the screen's medical menu of that player (team B, #3)
    mount(matchId)
    await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
    await settle()
    fireEvent.click(within(phone()).getByTestId('phone-action-medical'))
    await waitFor(() => expect(screen.getByTestId('phone-medical-B-3')).toBeTruthy())
    fireEvent.click(screen.getByTestId('phone-medical-B-3'))
    await waitFor(() => expect(screen.queryByTestId('phone-medical-sheet')).toBeNull())
    await waitFor(() => expect(document.querySelector('.match-record.phone-layout .modal-wrapper-roll-up')).toBeTruthy())
    expect(document.querySelector('.modal-wrapper-roll-up').textContent).toMatch(/Medical – Team B #3/)
  }, 30000)

  it('a phone turned sideways keeps the phone layout and its countdown, under a notice', async () => {
    const screenSize = { width: window.screen.width, height: window.screen.height }
    Object.defineProperty(window.screen, 'width', { value: 390, configurable: true })
    Object.defineProperty(window.screen, 'height', { value: 844, configurable: true })
    try {
      setViewport(390, 844)
      const matchId = await setUpMatch()
      mount(matchId)
      await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
      const view = within(phone())
      await settle()
      // a running time-out (the screen's own state)
      fireEvent.click(view.getByTestId('phone-timeout-left'))
      await waitFor(() => expect(button('Confirm time-out')).toBeTruthy())
      await settle()
      fireEvent.click(button('Confirm time-out'))
      await waitFor(() => expect(view.getByTestId('phone-countdown')).toBeTruthy())
      const scoreboardRoot = document.querySelector('.match-record')

      // turned sideways: same screen (not remounted), the notice over it
      setViewport(844, 390)
      fireEvent(window, new Event('resize'))
      await waitFor(() => expect(screen.getByTestId('phone-sideways-notice')).toBeTruthy())
      expect(phone()).toBeTruthy()
      expect(document.querySelector('.match-record')).toBe(scoreboardRoot)
      expect(screen.queryByTestId('scoring-layout')).toBeNull()
      expect(screen.getByTestId('phone-countdown')).toBeTruthy()

      // upright again: the notice goes, the countdown is still running
      setViewport(390, 844)
      fireEvent(window, new Event('resize'))
      await waitFor(() => expect(screen.queryByTestId('phone-sideways-notice')).toBeNull())
      expect(screen.getByTestId('phone-countdown')).toBeTruthy()
      expect(document.querySelector('.match-record')).toBe(scoreboardRoot)
    } finally {
      Object.defineProperty(window.screen, 'width', { value: screenSize.width, configurable: true })
      Object.defineProperty(window.screen, 'height', { value: screenSize.height, configurable: true })
    }
  }, 30000)

  it('the Phone display mode shows the phone layout on a landscape screen too', async () => {
    setViewport(1280, 800)
    // localStorage is a mock in these tests (setup.js): the stored choice
    const getItem = localStorage.getItem
    localStorage.getItem = vi.fn((key) => (key === 'displayMode' ? 'phone' : null))
    try {
      const matchId = await setUpMatch()
      mount(matchId)
      await waitFor(() => expect(phone()).toBeTruthy(), { timeout: 10000 })
    } finally {
      localStorage.getItem = getItem
    }
  }, 30000)
})
