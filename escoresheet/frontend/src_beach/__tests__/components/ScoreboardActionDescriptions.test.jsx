// The full text of an action (the undo dialog, the phone's recent actions):
// - 'Set start — 00:00' in every set: the MM:SS came from a numeric ts, and
//   set_start's ts is an ISO string (roundToMinute)
// - 'Forfeit — <team 2> wins' whoever forfeited: the forfait event has the
//   forfeiting team, not a winner (BUG-forfeit-set2 screenshot)
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
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
afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(tb => tb.clear()))
})
afterAll(() => {
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text)

// set 1 at 3:2; `last` is the newest event of the set
async function undoDialogText(last) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const at = new Date(Date.now() - 600000)
  at.setSeconds(0, 0)
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: at.toISOString() })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at.toISOString() },
    { matchId, setIndex: 1, seq: 2, ts: at.toISOString(), ...last }
  ])
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
  await waitFor(() => expect(buttons('Undo').filter(b => !b.disabled).length).toBeGreaterThan(0), { timeout: 8000 })
  const dialog = () => [...document.querySelectorAll('[role="dialog"]')].find(d => /undo/i.test(d.textContent))
  await waitFor(() => {
    if (!dialog()) fireEvent.click(buttons('Undo').filter(b => !b.disabled).at(-1))
    expect(dialog()).toBeTruthy()
  }, { timeout: 5000 })
  return dialog().textContent
}

describe('Scoreboard_beach: the full text of an action', () => {
  it('a set start has no 00:00', async () => {
    const text = await undoDialogText({ type: 'set_start', payload: {} })
    expect(text).toContain('Set start')
    expect(text).not.toContain('00:00')
  }, 30000)

  it('a forfeit names the opponent of the forfeiting team as the winner', async () => {
    const text = await undoDialogText({ type: 'forfait', payload: { team: 'team2', reason: 'forfeit', setIndex: 1, scope: 'match' } })
    expect(text).toContain('Alpha / Beta wins')
    expect(text).not.toContain('Gamma / Delta wins')
  }, 30000)
})
