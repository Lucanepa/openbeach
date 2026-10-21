// Finder run of 2026-10-21 (BUG-forfeit-set2): a forfeit by the team that won
// set 1, in set 2, left the match at 1:1 with set 3 at 0:0 and the interval
// running. Between the award of set 2 and the end of handleForfait the
// Scoreboard opened set 3 at 0:0 (the match had not ended yet), so the forfeit
// took set 3 as already there and awarded nothing.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react'
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
afterEach(() => cleanup())
afterAll(() => {
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const buttons = (text) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === text)
const clickButton = (text) => fireEvent.click(buttons(text).filter(b => !b.disabled).at(-1))
// a tap right after a dialog opens can be taken as a stale one: tap again until it took
const tapUntil = (text, done) => waitFor(() => {
  if (!done() && buttons(text).length) clickButton(text)
  expect(done(), `${text}: ${[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).join(' | ')}`).toBe(true)
}, { timeout: 5000 })

// team 1 won set 1 and set 2 runs at 3:2 (inSet1: set 1 runs at 2:5)
async function seedMatch({ inSet1 = false, ...extra } = {}) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const at = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: true,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'A', 2: 'B' },
    ...extra
  })
  if (inSet1) {
    const set1 = await db.sets.add({ matchId, index: 1, team1Points: 2, team2Points: 5, finished: false, startTime: at })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: at }
    ])
    return { matchId, set1 }
  }
  const set1 = await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: at, endTime: at })
  const set2 = await db.sets.add({ matchId, index: 2, team1Points: 3, team2Points: 2, finished: false, startTime: at })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: at },
    { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: at },
    { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: at }
  ])
  return { matchId, set1, set2 }
}

// Menu > Stop the match > A team forfeits > team 1 > remarks > End Match:
// handleManualForfeit, whose writes are each their own transaction
async function team1Forfeits(matchId) {
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
  const menu = await waitFor(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
    expect(b).toBeTruthy()
    return b
  }, { timeout: 8000 })
  fireEvent.click(menu)
  fireEvent.click(await screen.findByText('Stop the match'))
  await tapUntil('A team forfeits', () => buttons('Alpha / Beta (A)').length === 1)
  await tapUntil('Alpha / Beta (A)', () => buttons('Continue to remarks').length === 1)
  await tapUntil('Continue to remarks', () => !!document.querySelector('textarea.remarks-area'))
  await waitFor(() => {
    const close = document.querySelector('textarea.remarks-area')?.closest('[role="dialog"]')?.querySelector('[data-modal-close]')
    if (close) fireEvent.click(close)
    expect(buttons('End match').length).toBe(1)
  })
  await tapUntil('End match', () => buttons('End match').length === 0)
  await waitFor(async () => expect((await db.matches.get(matchId))?.status).toBe('ended'), { timeout: 8000 })
  // what a late re-render could still add
  await new Promise(r => setTimeout(r, 500))
}

describe('Scoreboard_beach: a team forfeits (Stop the match)', () => {
  it('in set 2 after it won set 1: the opponent gets sets 2 and 3 (1:2), no open set', async () => {
    const { matchId } = await seedMatch()
    await team1Forfeits(matchId)

    const sets = (await db.sets.where({ matchId }).toArray()).sort((a, b) => a.index - b.index)
    expect(sets.map(s => [s.index, s.finished, s.team1Points, s.team2Points])).toEqual([
      [1, true, 21, 15],
      [2, true, 3, 21],
      [3, true, 0, 15]
    ])
  }, 30000)

  it('in set 1: the opponent gets sets 1 and 2 (2:0), no set 3', async () => {
    const { matchId } = await seedMatch({ inSet1: true })
    await team1Forfeits(matchId)

    const sets = (await db.sets.where({ matchId }).toArray()).sort((a, b) => a.index - b.index)
    expect(sets.map(s => [s.index, s.finished, s.team1Points, s.team2Points])).toEqual([
      [1, true, 2, 21],
      [2, true, 0, 21]
    ])
  }, 30000)
})
