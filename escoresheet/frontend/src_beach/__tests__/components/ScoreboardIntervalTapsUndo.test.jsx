// The interval's taps survive an undo. "Switch sides", "Switch serve" and
// the service order boxes write the match and log no event; the undo
// restores the stateSnapshot of the event before the one it takes back. A
// snapshot taken before those taps put them back: toss, a sanction in the
// break, "Switch sides", undo the sanction, and set 3 was back on the toss's
// sides (found by a check, 2026-10-09). The taps now refresh the snapshots of
// the interval's events, so an undo keeps them.
// On the real scoring screen over the app's Dexie database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { intervalChoiceShown, tapInterval, serveOrderChange } from '../helpers/intervalChoice'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { captureFullStateSnapshot } from '../../utils_beach/stateSnapshot_beach'
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
const buttons = () => [...document.querySelectorAll('button')]
const button = (text) => buttons().find(b => b.textContent.trim() === text && !b.disabled)
const bAll = (text) => buttons().filter(b => b.textContent.trim() === text && !b.disabled)
const toss = (label) => document.querySelector(`[data-testid="set3-toss-${label}"]`)

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function addTeams() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  return { t1, t2 }
}

// A sanction given in the break, logged like the screen logs an event: its
// seq after the last one, the state after it as its snapshot
async function sanctionInBreak(matchId, setIndex) {
  const events = await db.events.where({ matchId }).toArray()
  const seq = Math.floor(Math.max(...events.map(e => e.seq || 0))) + 1
  const id = await db.events.add({
    matchId, setIndex, type: 'sanction', seq, ts: new Date().toISOString(),
    payload: { team: 'team2', type: 'improper_request' }
  })
  await db.events.update(id, { stateSnapshot: await captureFullStateSnapshot(db, matchId) })
  return id
}

async function undoLast() {
  await waitFor(() => expect(button('Undo')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Undo'))
  await waitFor(() => expect(bAll('Undo').length).toBeGreaterThan(1))
  fireEvent.click(bAll('Undo').at(-1))
}

const choices = (m) => ({
  set3CoinTossWinner: m.set3CoinTossWinner ?? null,
  set3LeftTeam: m.set3LeftTeam ?? null,
  set3FirstServe: m.set3FirstServe ?? null,
  set2FirstServe: m.set2FirstServe ?? null,
  // no override written and an empty one are the same sides
  setLeftTeamOverrides: m.setLeftTeamOverrides && Object.keys(m.setLeftTeamOverrides).length ? m.setLeftTeamOverrides : null,
  team1FirstServe: m.team1FirstServe ?? null,
  team2FirstServe: m.team2FirstServe ?? null
})

describe('Scoreboard_beach: the interval taps survive an undo', () => {
  it('set 3: toss, a sanction, sides, serve and service order switched, undo the sanction: the switches stay', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const end2 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      set3LeftTeam: 'A', set3FirstServe: 'B'
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
      { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 }
    ])
    mount(matchId)
    await waitFor(() => expect(toss('B')).toBeTruthy(), { timeout: 8000 })
    await settle()

    // the toss (B won), then a sanction in the break
    fireEvent.click(toss('B'))
    await waitFor(() => expect(intervalChoiceShown()).toBeTruthy(), { timeout: 5000 })
    await settle()
    await sanctionInBreak(matchId, 3)
    await waitFor(() => expect(serveOrderChange('Gamma / Delta')).toBeTruthy())
    await settle()

    // the winner's choices after the sanction
    await tapInterval('side')
    await waitFor(async () => expect((await db.matches.get(matchId)).set3LeftTeam).toBe('B'))
    await settle()
    await tapInterval('serve')
    await waitFor(async () => expect((await db.matches.get(matchId)).set3FirstServe).toBe('A'))
    await settle()
    fireEvent.click(serveOrderChange('Gamma / Delta'))
    await waitFor(async () => expect((await db.matches.get(matchId)).team2FirstServe).toBe(2))
    await settle()
    const chosen = choices(await db.matches.get(matchId))
    expect(chosen).toMatchObject({ set3CoinTossWinner: 'team2', set3LeftTeam: 'B', set3FirstServe: 'A', team2FirstServe: 2 })
    // the refreshed snapshots are no edit of the events (no history, nothing for the server)
    expect(await db.event_history.where({ matchId }).filter(r => r.op === 'edit').count()).toBe(0)

    await undoLast()
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'sanction' }).count()).toBe(0), { timeout: 5000 })
    await settle()

    // the sanction is gone, the toss and the winner's choices stay
    expect(choices(await db.matches.get(matchId))).toEqual(chosen)
    expect(toss('A')).toBeFalsy()
    cleanup()
  }, 60000)

  it('set 2: two sanctions in the break, sides and serve switched between them, undo the second: the switches stay', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const end1 = new Date(Date.now() - 5000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'A', 2: 'A' }
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: end1 })
    await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: end1 }
    ])
    mount(matchId)
    await waitFor(() => expect(intervalChoiceShown()).toBeTruthy(), { timeout: 8000 })
    await settle()

    await sanctionInBreak(matchId, 2)
    await settle()
    await tapInterval('side')
    await waitFor(async () => expect((await db.matches.get(matchId)).setLeftTeamOverrides?.[2]).toBe('B'))
    await settle()
    await tapInterval('serve')
    await waitFor(async () => expect((await db.matches.get(matchId)).set2FirstServe).toBe('team1'))
    await settle()
    await sanctionInBreak(matchId, 2)
    await settle()
    const chosen = choices(await db.matches.get(matchId))

    await undoLast()
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'sanction' }).count()).toBe(1), { timeout: 5000 })
    await settle()
    expect(choices(await db.matches.get(matchId))).toEqual(chosen)

    // and the first sanction too: still the switched sides and serve
    await undoLast()
    await waitFor(async () => expect(await db.events.where({ matchId, type: 'sanction' }).count()).toBe(0), { timeout: 5000 })
    await settle()
    expect(choices(await db.matches.get(matchId))).toEqual(chosen)
    cleanup()
  }, 60000)
})
