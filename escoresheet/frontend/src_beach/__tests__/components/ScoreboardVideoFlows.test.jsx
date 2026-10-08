// The owner's screencast of 2026-10-08 (batch VS), on the real scoring screen
// over the app's real Dexie database (fake IndexedDB), driven with taps.
// Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
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
  // the screen renders as in the app: an intermediate state may show up
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

// After a confirm, taps are swallowed for GHOST_CLICK_MS (the trailing tap of
// a double tap); the next deliberate tap waits for it
const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const SEED = 'match_1_test'
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const tapTwice = (el) => { fireEvent.click(el); fireEvent.click(el) }
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const score = async () => { const s = await db.sets.toArray(); return [s[0].team1Points, s[0].team2Points] }
const jobs = async () => db.sync_queue.toArray()
const ofType = async (type) => (await events()).filter(e => e.type === type)

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: SEED,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const bmpButtons = () => [...document.querySelectorAll('button')].filter(b => /^BMP\d$/.test(b.textContent.trim()))

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}

describe('Scoreboard_beach: team BMP (issues 3 and 14)', () => {
  it('possible after a point, greyed during the next rally; Cancel logs nothing', async () => {
    await db.delete(); await db.open()
    const matchId = await setUpMatch()
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await startSet()

    // rally in play: both team BMP buttons are greyed
    expect(bmpButtons()).toHaveLength(2)
    expect(bmpButtons().every(b => b.disabled)).toBe(true)

    fireEvent.click(button('Point A'))
    await waitFor(async () => expect((await ofType('point')).length).toBe(1))
    await waitFor(() => expect(bmpButtons().every(b => !b.disabled)).toBe(true))

    // ask, then cancel: nothing recorded
    fireEvent.click(bmpButtons()[1])
    await waitFor(() => expect(button('Cancel')).toBeTruthy())
    fireEvent.click(button('Cancel'))
    await settle()
    expect(await ofType('challenge')).toHaveLength(0)
    expect((await jobs()).filter(j => j.payload?.payload?.type === 'challenge' || j.payload?.type === 'challenge')).toHaveLength(0)

    // the next rally starts: greyed again
    await waitFor(() => expect(button('Start rally')).toBeTruthy())
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(button('Point A')).toBeTruthy())
    await waitFor(() => expect(bmpButtons().every(b => b.disabled)).toBe(true))

    // a confirmed BMP still records the request, then its outcome as a sub-event
    fireEvent.click(button('Point A'))
    await waitFor(async () => expect((await ofType('point')).length).toBe(2))
    await waitFor(() => expect(bmpButtons().every(b => !b.disabled)).toBe(true))
    fireEvent.click(bmpButtons()[1])
    await waitFor(() => expect(button('Unsuccessful')).toBeTruthy())
    fireEvent.click(button('Unsuccessful'))
    await waitFor(() => expect(button('Confirm Unsuccessful')).toBeTruthy())
    fireEvent.click(button('Confirm Unsuccessful'))
    await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(1))
    const [req] = await ofType('challenge')
    const [out] = await ofType('challenge_outcome')
    expect(req.payload).toMatchObject({ team: 'team2', score: { team1: 2, team2: 0 } })
    expect(Math.floor(out.seq)).toBe(req.seq)
    // and the BMP is spent for this point
    await waitFor(() => expect(bmpButtons().every(b => b.disabled)).toBe(true))
    cleanup()
  }, 30000)
})
