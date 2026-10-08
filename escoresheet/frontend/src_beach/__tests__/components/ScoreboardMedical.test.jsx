// The owner's screencast of 2026-10-08 (batch VS): MTO / RIT, on the real scoring screen
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
  await waitFor(() => expect(button('Start set')).toBeTruthy())
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}

describe('Scoreboard_beach: MTO / RIT are recorded (issue 4a)', () => {
  it('start and end are logged events (synced), with the player; Undo removes them in turn and the countdown follows', async () => {
    const matchId = await setUpMatch()
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await startSet()
    fireEvent.click(button('Point A'))
    await waitFor(async () => expect((await ofType('point')).length).toBe(1))
    await settle()

    // Team A's #2 (Beta): player menu > Medical > MTO
    const player = await waitFor(() => {
      const el = document.querySelector('.court-player[data-team="team1"][data-player-number="2"]')
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(player)
    await waitFor(() => expect(document.querySelector('[data-player-action-menu]')).toBeTruthy())
    fireEvent.click([...document.querySelectorAll('[data-player-action-menu] button')].find(b => b.textContent.includes('Medical')))
    await waitFor(() => expect(document.querySelector('[data-medical-dropdown]')).toBeTruthy())
    expect(document.querySelector('[data-medical-dropdown]').textContent).toContain('#2 Beta')
    fireEvent.click([...document.querySelectorAll('[data-medical-dropdown] button')].find(b => b.textContent.startsWith('MTO')))

    await waitFor(async () => expect(await ofType('mto')).toHaveLength(1))
    const [mto] = await ofType('mto')
    expect(mto.payload).toMatchObject({ team: 'team1', playerNumber: 2, playerName: 'Beta', team1Points: 1, team2Points: 0, servingTeam: 'team1' })
    expect(mto.payload.startTime).toBeTruthy()
    await waitFor(() => expect(document.querySelector('[data-testid="medical-player"]')?.textContent).toContain('#2 Beta'))

    // the forfeit asks first; Back returns to the countdown
    fireEvent.click(document.querySelector('[data-testid="medical-forfeit"]'))
    await waitFor(() => expect(document.querySelector('[data-testid="medical-forfeit-confirm"]')).toBeTruthy())
    fireEvent.click(button('Back'))
    await waitFor(() => expect(document.querySelector('[data-testid="medical-recovered"]')).toBeTruthy())
    fireEvent.click(document.querySelector('[data-testid="medical-recovered"]'))

    await waitFor(async () => expect(await ofType('medical_end')).toHaveLength(1))
    await settle()
    const [end] = await ofType('medical_end')
    expect(end.payload).toMatchObject({ kind: 'mto', startSeq: mto.seq, team: 'team1', playerNumber: 2, playerName: 'Beta', outcome: 'recovered' })
    expect(typeof end.payload.duration).toBe('number')
    // no extra remark, no raw update of the start
    expect(await ofType('remark')).toHaveLength(0)
    expect((await ofType('mto'))[0].payload.outcome).toBeUndefined()
    // both reach the sync queue
    const q = await jobs()
    for (const e of [mto, end]) expect(q.some(j => j.payload?.external_id === `${SEED}:e:${e.id}`)).toBe(true)
    expect(document.querySelector('[data-testid="last-action"]').textContent).toContain('MTO end – A #2 Beta')

    // Undo the end: the countdown is back; undo the start: it is gone
    fireEvent.click(button('Undo'))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    fireEvent.click([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
    await waitFor(async () => expect(await ofType('medical_end')).toHaveLength(0))
    await waitFor(() => expect(document.querySelector('[data-testid="medical-recovered"]')).toBeTruthy())
    expect(await ofType('mto')).toHaveLength(1)
    await settle()
    fireEvent.click(button('Undo'))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    fireEvent.click([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
    await waitFor(async () => expect(await ofType('mto')).toHaveLength(0))
    await waitFor(() => expect(document.querySelector('[data-testid="medical-recovered"]')).toBeNull())
    cleanup()
  }, 30000)
})
