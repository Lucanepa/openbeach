// The decision change dialog's two choices ("Assign to other team" /
// "Replay the rally") were clickable <div>s: no keyboard, no role, nothing a
// screen reader or the diagnostics could name. The chosen one also took a
// 2 px border instead of 1 px under "transition: all", so the dialog grew a
// pixel over 200 ms on every choice (diagnostics: geo.jump 407 via 406).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'

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

const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_decision_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy())
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}

const radios = () => [...document.querySelectorAll('[role=radiogroup] [role=radio]')]

describe('decision change choices', () => {
  it('are radio buttons, and choosing one does not change their size', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    fireEvent.click(button('Point A'))
    await waitFor(() => expect(button('Decision change')).toBeTruthy())
    fireEvent.click(button('Decision change'))
    await waitFor(() => expect(radios()).toHaveLength(2))

    const [swap, replay] = radios()
    expect(swap.tagName).toBe('BUTTON')
    expect(replay.tagName).toBe('BUTTON')
    expect(swap.textContent.trim()).toBe('Assign to other team')
    expect(replay.textContent.trim()).toBe('Replay the rally')
    expect(swap.getAttribute('aria-checked')).toBe('true')
    expect(replay.getAttribute('aria-checked')).toBe('false')
    const before = [swap.style.borderWidth, replay.style.borderWidth]

    fireEvent.click(replay)
    await waitFor(() => expect(radios()[1].getAttribute('aria-checked')).toBe('true'))
    expect(radios()[0].getAttribute('aria-checked')).toBe('false')
    // the same border in both states, and no animated size
    expect([radios()[0].style.borderWidth, radios()[1].style.borderWidth]).toEqual(before)
    expect(before[0]).toBe(before[1])
    for (const r of radios()) expect(r.style.transition).not.toMatch(/\ball\b|border-width/)
  })
})
