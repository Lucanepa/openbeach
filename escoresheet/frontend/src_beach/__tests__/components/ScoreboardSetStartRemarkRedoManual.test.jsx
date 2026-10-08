// "Actual start time: HH:MM" (owner, 2026-10-08) on the real scoring screen
// over the real Dexie database (fake IndexedDB), driven with taps:
//  - undo, then the set started again (another time, then the scheduled
//    time): always at most one line, the right one;
//  - the "Manual changes" panel (Advanced > Set times) moving set 1's start
//    moves the line, set 2's start leaves the remarks alone, and it all
//    survives a reload (the screen mounted again).
// Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import { eventHistorySettled } from '../../db_beach/eventHistory_beach'
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
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${clockOf(d)}`
const remarks = async (matchId) => (await db.matches.get(matchId)).remarks
const plus = (d, min) => new Date(d.getTime() + min * 60000)

function scheduledTwoHoursAgo() {
  const d = new Date(Date.now() - 120 * 60000)
  d.setSeconds(0, 0)
  if (clockOf(d) === '00:00') d.setMinutes(d.getMinutes() - 1)
  return d
}

async function addMatch(scheduledAt, extra = {}) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  return db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_start_remark_redo',
    scheduledAt: scheduledAt.toISOString(), remarks: 'Ball changed', sanctions: {}, manualChanges: [],
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    ...extra
  })
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet(clock) {
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })
  if (clock) fireEvent.change(document.querySelector('input[inputmode="numeric"]'), { target: { value: clock } })
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
  await settle()
}

async function undoLast() {
  await waitFor(() => expect(button('Undo')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
  fireEvent.click(bAll('Undo').at(-1))
}

async function undoSetStart() {
  await undoLast()
  await waitFor(async () => expect(await ofType('rally_start')).toHaveLength(0))
  await settle()
  await undoLast()
  await waitFor(async () => expect(await ofType('set_start')).toHaveLength(0))
  await settle()
}

async function openSetTimes() {
  await waitFor(() => expect(document.querySelector('button[title="Menu"]')).toBeTruthy(), { timeout: 5000 })
  const menu = document.querySelector('button[title="Menu"]')
  fireEvent.click(menu)
  await waitFor(() => expect([...document.querySelectorAll('button, [role="menuitem"], div')].some(el => el.textContent.trim() === 'Manual changes' && el.children.length <= 2)).toBe(true))
  const item = [...document.querySelectorAll('button, [role="menuitem"]')].find(el => el.textContent.trim() === 'Manual changes')
  fireEvent.click(item)
  await waitFor(() => expect(button('Advanced')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Advanced'))
  await waitFor(() => expect(document.querySelectorAll('input[type="datetime-local"]').length).toBeGreaterThan(0))
}

// Start / end inputs in set order: [set1 start, set1 end, set2 start, ...]
const timeInputs = () => [...document.querySelectorAll('input[type="datetime-local"]')]

async function typeTime(input, date) {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: localInput(date) } })
  fireEvent.blur(input)
  await new Promise(r => setTimeout(r, 50))
  await eventHistorySettled()
}

describe('Scoreboard_beach: "Actual start time" through undo, a new start, and the manual panel', () => {
  it('undo then start again: another time gives exactly its line, the scheduled time none', async () => {
    const scheduled = scheduledTwoHoursAgo()
    const matchId = await addMatch(scheduled)
    mount(matchId)

    await startSet(clockOf(plus(scheduled, 5)))
    expect(await remarks(matchId)).toBe(`Ball changed\nActual start time: ${clockOf(plus(scheduled, 5))}`)
    await undoSetStart()
    expect(await remarks(matchId)).toBe('Ball changed')

    await startSet(clockOf(plus(scheduled, 10)))
    expect(await remarks(matchId)).toBe(`Ball changed\nActual start time: ${clockOf(plus(scheduled, 10))}`)
    await undoSetStart()
    expect(await remarks(matchId)).toBe('Ball changed')

    await startSet(null)
    expect(await remarks(matchId)).toBe('Ball changed')
    expect((await ofType('set_start'))[0].payload.autoRemark).toBeUndefined()
    cleanup()
  }, 90000)

  it('the manual panel moves set 1\'s line; it survives a reload', async () => {
    const scheduled = scheduledTwoHoursAgo()
    const matchId = await addMatch(scheduled)
    const view = mount(matchId)
    await startSet(clockOf(plus(scheduled, 5)))

    await openSetTimes()
    await typeTime(timeInputs()[0], plus(scheduled, 12))
    await waitFor(async () => expect(await remarks(matchId)).toBe(`Ball changed\nActual start time: ${clockOf(plus(scheduled, 12))}`))
    const set1 = (await db.sets.toArray()).find(s => s.index === 1)
    expect(new Date(set1.startTime).getTime()).toBe(plus(scheduled, 12).getTime())

    await typeTime(timeInputs()[0], scheduled)
    await waitFor(async () => expect(await remarks(matchId)).toBe('Ball changed'))

    await typeTime(timeInputs()[0], plus(scheduled, 3))
    await waitFor(async () => expect(await remarks(matchId)).toBe(`Ball changed\nActual start time: ${clockOf(plus(scheduled, 3))}`))

    // reload: the screen mounted again from the stored match
    view.unmount()
    cleanup()
    mount(matchId)
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    expect(await remarks(matchId)).toBe(`Ball changed\nActual start time: ${clockOf(plus(scheduled, 3))}`)
    await openSetTimes()
    expect(timeInputs()[0].value).toBe(localInput(plus(scheduled, 3)))
    // a blur without a change writes nothing
    const logBefore = (await db.matches.get(matchId)).manualChanges.length
    fireEvent.focus(timeInputs()[0]); fireEvent.blur(timeInputs()[0])
    await new Promise(r => setTimeout(r, 50))
    expect((await db.matches.get(matchId)).manualChanges.length).toBe(logBefore)
    cleanup()
  }, 90000)

  it('set 2\'s start in the manual panel leaves the remarks alone; set 1\'s still moves the line', async () => {
    const scheduled = scheduledTwoHoursAgo()
    const line = `Actual start time: ${clockOf(plus(scheduled, 5))}`
    const matchId = await addMatch(scheduled, { remarks: `Ball changed\n${line}\nNet repaired` })
    const s1 = plus(scheduled, 5); const e1 = plus(scheduled, 25); const s2 = plus(scheduled, 28)
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: s1.toISOString(), endTime: e1.toISOString() })
    await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false, startTime: s2.toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: s1.toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'set_start', payload: { setIndex: 1, startTime: s1.toISOString(), autoRemark: line }, seq: 2, ts: s1.toISOString() })
    await db.events.add({ matchId, setIndex: 1, type: 'set_end', payload: { setIndex: 1, team1Points: 21, team2Points: 15 }, seq: 3, ts: e1.toISOString() })
    await db.events.add({ matchId, setIndex: 2, type: 'set_start', payload: { setIndex: 2, startTime: s2.toISOString() }, seq: 4, ts: s2.toISOString() })
    mount(matchId)
    await openSetTimes()
    const inputs = timeInputs()
    expect(inputs).toHaveLength(4)

    await typeTime(inputs[2], plus(scheduled, 31))
    await waitFor(async () => {
      const set2 = (await db.sets.toArray()).find(s => s.index === 2)
      expect(new Date(set2.startTime).getTime()).toBe(plus(scheduled, 31).getTime())
    })
    expect(await remarks(matchId)).toBe(`Ball changed\n${line}\nNet repaired`)

    await typeTime(timeInputs()[0], plus(scheduled, 7))
    await waitFor(async () => expect(await remarks(matchId)).toBe(`Ball changed\nNet repaired\nActual start time: ${clockOf(plus(scheduled, 7))}`))
    cleanup()
  }, 90000)
})
