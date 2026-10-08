// "Actual start time: HH:MM" (owner, 2026-10-08) on the real scoring screen
// over the app's real Dexie database (fake IndexedDB), driven with taps: set 1
// confirmed at another time than scheduled writes the line, and undoing the
// set start takes it out again, as in OpenVolley (the set_start event records
// the line as payload.autoRemark). It stayed until set 1 was confirmed again.
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
const bAll = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text)
const ofType = async (type) => (await db.events.toArray()).filter(e => e.type === type)
const pad = (n) => String(n).padStart(2, '0')
const clockOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Scheduled an hour ago (never at 00:00: that is "a date without a time")
function scheduledAnHourAgo() {
  const d = new Date(Date.now() - 60 * 60000)
  d.setSeconds(0, 0)
  if (clockOf(d) === '00:00') d.setMinutes(d.getMinutes() - 1)
  return d
}

async function setUpMatch(scheduledAt) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_start_remark_test',
    scheduledAt: scheduledAt.toISOString(), remarks: 'Ball changed',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function undoLast() {
  await waitFor(() => expect(button('Undo')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
  fireEvent.click(bAll('Undo').at(-1))
}

describe('Scoreboard_beach: undoing the set 1 start takes its "Actual start time" remark out', () => {
  it('confirmed at another time: the line is written; undo of the set start removes it, the other remarks stay', async () => {
    const scheduled = scheduledAnHourAgo()
    const actual = new Date(scheduled.getTime() + 5 * 60000)
    const matchId = await setUpMatch(scheduled)
    mount(matchId)

    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    // the dialog proposes the scheduled time; the scorer types the actual one
    const input = document.querySelector('input[inputmode="numeric"]')
    expect(input.value).toBe(clockOf(scheduled))
    fireEvent.change(input, { target: { value: clockOf(actual) } })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })

    const line = `Actual start time: ${clockOf(actual)}`
    expect((await db.matches.get(matchId)).remarks).toBe(`Ball changed\n${line}`)
    const [setStart] = await ofType('set_start')
    expect(setStart.payload.autoRemark).toBe(line)
    await settle()

    // undo the rally start, then the set start
    await undoLast()
    await waitFor(async () => expect(await ofType('rally_start')).toHaveLength(0))
    await settle()
    expect((await db.matches.get(matchId)).remarks).toBe(`Ball changed\n${line}`)
    await undoLast()
    await waitFor(async () => expect(await ofType('set_start')).toHaveLength(0))
    await waitFor(async () => expect((await db.matches.get(matchId)).remarks).toBe('Ball changed'))
    await settle()
    cleanup()
  }, 60000)

  it('confirmed at the scheduled time: no line, and undo leaves the remarks alone', async () => {
    const scheduled = scheduledAnHourAgo()
    const matchId = await setUpMatch(scheduled)
    mount(matchId)

    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    expect((await db.matches.get(matchId)).remarks).toBe('Ball changed')
    const [setStart] = await ofType('set_start')
    expect(setStart.payload.autoRemark).toBeUndefined()
    await settle()

    await undoLast()
    await waitFor(async () => expect(await ofType('rally_start')).toHaveLength(0))
    await settle()
    await undoLast()
    await waitFor(async () => expect(await ofType('set_start')).toHaveLength(0))
    await settle()
    expect((await db.matches.get(matchId)).remarks).toBe('Ball changed')
    cleanup()
  }, 60000)
})
