// OB-16 (laptop run of 2026-10-08): the "End set interval" button never
// showed (it waited for betweenSetsCountdown.isActive and a match status
// 'between_sets' / 'set_complete', which nothing sets), so a set interval
// ended only by starting the set or by running out, and the referee kept
// counting. As in OpenVolley: while the interval runs, the controls offer
// "End set interval" (Start set once it has ended); it ends the interval here
// and tells the referee (end_interval) and the live state.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

const upserts = []
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const builder = (table) => {
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej)
        if (prop === 'upsert') return (row) => { upserts.push({ table, row }); return b }
        return () => b
      }
    })
    return b
  }
  return { ...actual, apiFrom: (table) => builder(table) }
})
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isBackendAvailable: () => true }
})

import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import { scorerRelay } from '../../utils_beach/relayPublisher_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
const relaySent = []
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  // the venue relay is up: the referee hears the scorer's actions
  vi.spyOn(scorerRelay, 'isOpen').mockReturnValue(true)
  vi.spyOn(scorerRelay, 'send').mockImplementation((msg) => { relaySent.push(msg); return true })
  vi.spyOn(scorerRelay, 'attach').mockImplementation((url, handlers) => { setTimeout(() => handlers?.onOpen?.(), 0); return () => {} })
})
beforeEach(async () => {
  cleanup()
  upserts.length = 0
  relaySent.length = 0
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
const liveRows = (type) => upserts.filter(u => u.table === 'match_live_state' && u.row.last_event_type === type).map(u => u.row)
const refereeActions = () => relaySent.filter(m => m.type === 'match-action').map(m => m.action)
// the scorer has joined the match's relay room (its first sync went out)
const relayJoined = () => waitFor(() => expect(relaySent.length).toBeGreaterThan(0), { timeout: 5000 })

// Sets already played (each [team1, team2] points), the last one ended 10 s
// ago, and the next set created: its interval runs
async function setUpInterval(played) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const ago = (s) => new Date(Date.now() - s * 1000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false,
    externalId: '11111111-2222-4333-8444-555555555555', seed_key: `end_set_interval_${played.length}`,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  const events = [{ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: ago(1300) }]
  let seq = 2
  for (let i = 0; i < played.length; i++) {
    const [a, b] = played[i]
    const last = i === played.length - 1
    await db.sets.add({ matchId, index: i + 1, team1Points: a, team2Points: b, finished: true, startTime: ago(1200 - i * 600), endTime: ago(last ? 10 : 610) })
    events.push({ matchId, setIndex: i + 1, type: 'set_start', payload: {}, seq: seq++, ts: ago(1200 - i * 600) })
    for (let p = 0; p < a + b; p++) {
      events.push({ matchId, setIndex: i + 1, type: 'rally_start', payload: {}, seq: seq++, ts: ago(900) })
      events.push({ matchId, setIndex: i + 1, type: 'point', payload: { team: p < a ? 'team1' : 'team2' }, seq: seq++, ts: ago(900) })
    }
    events.push({ matchId, setIndex: i + 1, type: 'set_end', payload: { team: a > b ? 'team1' : 'team2', setIndex: i + 1 }, seq: seq++, ts: ago(last ? 10 : 610) })
  }
  await db.sets.add({ matchId, index: played.length + 1, team1Points: 0, team2Points: 0, finished: false })
  await db.events.bulkAdd(events)
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

describe('Scoreboard_beach: End set interval', () => {
  it('set 1-2 interval: ends the interval, tells the referee, then offers Start set', async () => {
    const matchId = await setUpInterval([[21, 15]])
    mount(matchId)
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    expect(button('Start set')).toBeFalsy()
    await relayJoined()

    fireEvent.click(button('End set interval'))
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    expect(button('End set interval')).toBeFalsy()
    expect(refereeActions()).toContain('end_interval')
    await waitFor(() => expect(liveRows('end_interval')).toHaveLength(1), { timeout: 5000 })
    expect(liveRows('end_interval')[0]).toMatchObject({ set_interval_active: false, set_interval_started_at: null, match_status: 'in_progress' })
  }, 30000)

  it('set 2-3 interval: the coin toss panel keeps the countdown; End set interval ends it', async () => {
    const matchId = await setUpInterval([[21, 15], [17, 21]])
    mount(matchId)
    await waitFor(() => expect(document.querySelector('[data-testid="set3-toss-A"]')).toBeTruthy(), { timeout: 8000 })
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(document.querySelector('[data-testid="set3-toss-A"]'))
    await waitFor(() => expect(document.querySelector('[data-testid="set3-toss-A"]')).toBeFalsy(), { timeout: 5000 })

    expect(button('End set interval')).toBeTruthy()
    expect(button('Start set')).toBeFalsy()
    await relayJoined()
    fireEvent.click(button('End set interval'))
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    expect(refereeActions()).toContain('end_interval')
  }, 30000)

  it('set 2-3 interval with the set 3 setup recorded (no panel): the countdown shows with the button', async () => {
    const matchId = await setUpInterval([[21, 15], [17, 21]])
    const last = (await db.events.toArray()).reduce((m, e) => Math.max(m, e.seq), 0)
    await db.matches.update(matchId, { set3CoinTossWinner: 'team1' })
    await db.events.add({ matchId, setIndex: 3, type: 'set3_coin_toss', payload: { leftTeam: 'A', firstServe: 'A', leftTeamKey: 'team1', firstServeTeamKey: 'team1' }, seq: last + 1, ts: new Date().toISOString() })
    mount(matchId)
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    expect(document.body.textContent).toMatch(/Set interval\s*[1-5]\d(?!\d)/i)
    expect(button('Start set')).toBeFalsy()
    fireEvent.click(button('End set interval'))
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    expect(document.body.textContent).not.toMatch(/Set interval/i)
  }, 30000)
  it('after ending the 1-2 interval early, the 2-3 interval runs its own clock', async () => {
    const matchId = await setUpInterval([[21, 15]])
    mount(matchId)
    await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
    await relayJoined()
    fireEvent.click(button('End set interval'))
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })

    // set 2 starts, lasts longer than a set interval (the clock moves on
    // 70 s) and is won by team 2; set 3 is created and its interval begins
    let seq = (await db.events.toArray()).reduce((m, e) => Math.max(m, e.seq), 0)
    const set2Id = (await db.sets.where({ matchId }).and(s => s.index === 2).first()).id
    await db.transaction('rw', db.sets, db.events, async () => {
      const ts = new Date().toISOString()
      await db.events.bulkAdd([
        { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: ++seq, ts },
        { matchId, setIndex: 2, type: 'rally_start', payload: {}, seq: ++seq, ts },
        { matchId, setIndex: 2, type: 'point', payload: { team: 'team1' }, seq: ++seq, ts }
      ])
      await db.sets.update(set2Id, { team1Points: 1, startTime: ts })
    })
    // set 2 under way (no interval)
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    const realNow = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 70000)
    try {
      const end2 = new Date(Date.now()).toISOString()
      await db.transaction('rw', db.sets, db.events, async () => {
        await db.sets.update(set2Id, { team1Points: 10, team2Points: 21, finished: true, endTime: end2 })
        await db.events.add({ matchId, setIndex: 2, type: 'set_end', payload: { team: 'team2', setIndex: 2 }, seq: ++seq, ts: end2 })
        await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
      })
      await waitFor(() => expect(document.querySelector('[data-testid="set3-toss-A"]')).toBeTruthy(), { timeout: 8000 })
      // the 1-2 interval's start would put it at 0 at once (Start set instead)
      await waitFor(() => expect(button('End set interval')).toBeTruthy(), { timeout: 8000 })
      await new Promise(r => setTimeout(r, 600))
      expect(button('End set interval')).toBeTruthy()
      expect(button('Start set')).toBeFalsy()
    } finally {
      vi.mocked(Date.now).mockRestore()
    }
  }, 30000)
})
