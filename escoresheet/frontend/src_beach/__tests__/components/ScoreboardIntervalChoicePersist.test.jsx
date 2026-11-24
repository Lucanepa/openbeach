// The interval's chooser pick (IntervalChoice_beach: "Side" or "Serve or
// receive", by the team that lost the first toss before set 2, or won the
// set 3 toss) lived only in the screen's memory: a reload in the break, or a
// restore by PIN, showed the chooser with nothing picked and hid the two
// rows (the side and serve buttons), while the teams had already moved.
// The pick is kept with the match (intervalChoices), reaches the cloud in
// the match's coin_toss (interval_choices, a JSONB merge) and comes back
// with a restore by PIN, the toss winner too (the chooser is named from it).
//
// On the real scoring screen over the app's Dexie database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { importMatchFromSupabase, coinTossForRestore } from '../../utils_beach/backupManager_beach'
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
const byId = (id, root = document) => root.querySelector(`[data-testid="${id}"]`)
const pressed = (id) => byId(id)?.getAttribute('aria-pressed') === 'true'
const rowLabel = (kind) => byId(`interval-${kind}-row`)?.getAttribute('aria-label')
const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

// The break before set 2: set 1 ended 21:14 a few seconds ago; team1 (A) won
// the toss, so team2 (B) chooses; B on the left
async function inBreakBeforeSet2({ test = true, seedKey = null } = {}) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Anna Alpha' }, { teamId: t1, number: 2, name: 'Bea Beta' },
    { teamId: t2, number: 1, name: 'Gina Gamma' }, { teamId: t2, number: 2, name: 'Dora Delta' }
  ])
  const start = new Date(Date.now() - 1200000).toISOString()
  const end = new Date(Date.now() - 5000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test, ...(seedKey ? { seed_key: seedKey } : {}),
    coinTossWinner: 'team1', firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    setLeftTeamOverrides: { 1: 'B', 2: 'B' }
  })
  await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 14, finished: true, startTime: start, endTime: end })
  await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
    { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: end }
  ])
  return matchId
}

describe('Scoreboard_beach: the interval\'s chooser pick is kept with the match', () => {
  it('a reload in the break shows the pick and its two rows again', async () => {
    const matchId = await inBreakBeforeSet2()
    mount(matchId)
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(byId('interval-choice-side'))
    await waitFor(() => expect(byId('interval-side-row')).toBeTruthy())
    // B takes the right
    fireEvent.click(byId('interval-side-right'))
    await waitFor(async () => expect((await db.matches.get(matchId)).setLeftTeamOverrides?.[2]).toBe('A'))
    await settle()

    // the reload: the screen again, from the database
    cleanup()
    mount(matchId)
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    await waitFor(() => expect(byId('interval-side-row')).toBeTruthy(), { timeout: 5000 })
    expect(pressed('interval-choice-side')).toBe(true)
    expect(rowLabel('side')).toBe('B · Gamma / Delta: side')
    expect(rowLabel('serve')).toBe('A · Alpha / Beta: serve or receive')
    expect(pressed('interval-side-right')).toBe(true)
    expect((await db.matches.get(matchId)).intervalChoices).toEqual({ '2:team2': 'side' })
    await settle()

    // a change after the reload is kept too
    fireEvent.click(byId('interval-choice-serve'))
    await waitFor(async () => expect((await db.matches.get(matchId)).intervalChoices).toEqual({ '2:team2': 'serve' }))
    cleanup()
  }, 60000)

  it('the pick reaches the cloud in the match\'s coin toss (interval_choices)', async () => {
    const matchId = await inBreakBeforeSet2({ test: false, seedKey: 'seed-persist' })
    mount(matchId)
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    await settle()
    fireEvent.click(byId('interval-choice-serve'))
    await waitFor(async () => {
      const jobs = await db.sync_queue.toArray()
      const job = jobs.reverse().find(j => j.resource === 'match' && j.action === 'update' && j.payload?.coin_toss?.interval_choices)
      expect(job?.payload).toEqual({ id: 'seed-persist', coin_toss: { winner: 'team1', interval_choices: { '2:team2': 'serve' } } })
    }, { timeout: 5000 })
    cleanup()
  }, 60000)

  it('a restore by PIN in the break shows the chooser, the pick and its rows', async () => {
    const start = new Date(Date.now() - 1200000).toISOString()
    const end = new Date(Date.now() - 5000).toISOString()
    // the server's match as restore-by-pin returns it
    const matchId = await importMatchFromSupabase({
      match: {
        id: 'uuid', external_id: 'seed-pin', game_n: 12, status: 'live', sport_type: 'beach', test: false,
        coin_toss: {
          team_a: 'team1', team_b: 'team2', confirmed: true, first_serve: 'team1', serve_a: true,
          winner: 'team1', interval_choices: { '2:team2': 'serve' }
        },
        team1_data: { name: 'Alpha / Beta' },
        team2_data: { name: 'Gamma / Delta' },
        players_team1: [{ number: 1, first_name: 'Anna', last_name: 'Alpha' }, { number: 2, first_name: 'Bea', last_name: 'Beta' }],
        players_team2: [{ number: 1, first_name: 'Gina', last_name: 'Gamma' }, { number: 2, first_name: 'Dora', last_name: 'Delta' }]
      },
      sets: [
        { index: 1, team1_points: 21, team2_points: 14, finished: true, start_time: start, end_time: end },
        { index: 2, team1_points: 0, team2_points: 0, finished: false }
      ],
      events: [
        { set_index: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
        { set_index: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
        { set_index: 1, type: 'set_end', payload: {}, seq: 3, ts: end }
      ],
      courtSides: { setLeftTeamOverrides: { 1: 'B', 2: 'B' } },
      gamePin: '123456'
    })
    const restored = await db.matches.get(matchId)
    expect(restored.coinTossWinner).toBe('team1')
    expect(restored.intervalChoices).toEqual({ '2:team2': 'serve' })

    mount(matchId)
    await waitFor(() => expect(byId('interval-chooser')).toBeTruthy(), { timeout: 8000 })
    expect(byId('interval-chooser').textContent).toBe('B · Gamma / Delta chooses (lost the coin toss)')
    await waitFor(() => expect(byId('interval-serve-row')).toBeTruthy(), { timeout: 5000 })
    expect(pressed('interval-choice-serve')).toBe(true)
    expect(rowLabel('serve')).toBe('B · Gamma / Delta: serve or receive')
    expect(rowLabel('side')).toBe('A · Alpha / Beta: side')
    cleanup()
  }, 60000)

  it('a restore in place sends the toss winner and the picks back with the coin toss', () => {
    const coinToss = coinTossForRestore({
      coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team1',
      coinTossWinner: 'team2', intervalChoices: { '2:team1': 'side', '3:team2': 'serve', junk: 'x', '2:team2': 'nope' }
    })
    expect(coinToss.winner).toBe('team2')
    expect(coinToss.interval_choices).toEqual({ '2:team1': 'side', '3:team2': 'serve' })
  })
})
