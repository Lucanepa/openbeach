// OB-20 (laptop run of 2026-10-08): syncLiveStateToSupabase was memoised on
// [matchId, captureFullStateSnapshot, broadcastToScoreboard] but read
// ttoModal, timeoutModal and the scorerAttentionTrigger prop: the live state
// it sent (referee, livescore) used the values of when the function was last
// made. A new scorer-attention trigger went out as the old one, and the change
// of courts at the end of a TTO went out with no TTO. (timeoutModal was fresh
// only because broadcastToScoreboard lists it.) The function reads them from
// refs now (as OpenVolley), so its identity does not change with them.
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
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const liveRows = (type) => upserts.filter(u => u.table === 'match_live_state' && u.row.last_event_type === type).map(u => u.row)

// A live set 1 at `team1Points`:`team2Points`, every rally in the events,
// the changes of courts every 7 points made
async function setUpMatch(team1Points, team2Points) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const start = new Date(Date.now() - 600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false,
    externalId: '11111111-2222-4333-8444-555555555555', seed_key: `live_state_fresh_${team1Points}_${team2Points}`,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points, team2Points, finished: false, startTime: start })
  const events = [
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start }
  ]
  let seq = 3
  let a = 0
  let b = 0
  while (a + b < team1Points + team2Points) {
    const team = (a + b) % 2 === 0 && a < team1Points ? 'team1' : b < team2Points ? 'team2' : 'team1'
    if (team === 'team1') a++
    else b++
    events.push({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: start })
    events.push({ matchId, setIndex: 1, type: 'point', payload: { team }, seq: seq++, ts: start })
    if ((a + b) % 7 === 0) events.push({ matchId, setIndex: 1, type: 'court_switch', payload: { setIndex: 1, team1Points: a, team2Points: b }, seq: seq++, ts: start })
  }
  await db.events.bulkAdd(events)
  return matchId
}

const ui = (matchId, trigger) => <ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} scorerAttentionTrigger={trigger} /></LoggingProvider></AlertProvider></ScaleProvider>

describe('Scoreboard_beach: the live state reads the current TTO, time-out and attention trigger', () => {
  beforeEach(async () => {
    cleanup()
    upserts.length = 0
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('a point after a new scorer-attention trigger carries it; a stopped time-out goes out as ended', async () => {
    const matchId = await setUpMatch(1, 0)
    const view = render(ui(matchId, null))
    await waitFor(() => expect([...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'TO' && !b.disabled)).toHaveLength(2), { timeout: 8000 })

    // the scorer-attention trigger changes; the next point carries it
    const trigger = { type: 'referee_call', ts: Date.now() }
    view.rerender(ui(matchId, trigger))
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Point A'))
    await waitFor(() => expect(liveRows('point')).toHaveLength(1), { timeout: 5000 })
    expect(liveRows('point')[0].scorer_attention_trigger).toEqual(trigger)

    // time-out: confirm, then stop it
    await waitFor(() => expect(button('TO')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('TO'))
    await waitFor(() => expect(button('Confirm time-out')).toBeTruthy())
    fireEvent.click(button('Confirm time-out'))
    await waitFor(() => expect(liveRows('timeout')).toHaveLength(1), { timeout: 5000 })
    expect(liveRows('timeout')[0]).toMatchObject({ timeout_active: true, match_status: 'timeout' })
    const stop = await waitFor(() => {
      const el = document.querySelector('[title="Stop time-out"]')
      expect(el).toBeTruthy()
      return el
    })
    // a deliberate later tap: the clicks right after a confirm are swallowed
    // (useConfirmAction_beach, GHOST_CLICK_MS)
    await new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
    fireEvent.click(stop)
    await waitFor(() => expect(liveRows('end_timeout')).toHaveLength(1), { timeout: 5000 })
    expect(liveRows('end_timeout')[0]).toMatchObject({ timeout_active: false, timeout_started_at: null, match_status: 'in_progress' })
  }, 30000)

  it('the change of courts at the end of a TTO goes out with the TTO and its start time', async () => {
    const matchId = await setUpMatch(10, 10)
    render(ui(matchId, null))
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start rally'))
    await waitFor(() => expect(button('Point A')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Point A'))
    await waitFor(() => expect(button('Start TTO')).toBeTruthy(), { timeout: 5000 })
    const beforeStart = Date.now()
    fireEvent.click(button('Start TTO'))
    await waitFor(() => expect(liveRows('tto_start')).toHaveLength(1), { timeout: 5000 })
    await waitFor(() => expect(document.body.textContent).toContain('Click to end & switch courts'))
    const hint = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Click to end & switch courts')
    fireEvent.click(hint)
    await waitFor(() => expect(liveRows('end_tto')).toHaveLength(1), { timeout: 5000 })

    const [startRow] = liveRows('tto_start')
    const startedAt = Date.parse(startRow.tto_started_at)
    expect(startRow).toMatchObject({ tto_active: true })
    expect(startedAt).toBeGreaterThanOrEqual(beforeStart)
    // The TTO's end is one scorer action with one live-state push
    // (useScorerActions_beach, mergeLiveStatePushes): its change of courts
    // goes out in the 'end_tto' push, the courts changed and the TTO over. A
    // 'court_switch' push of its own, if any, carries the running TTO and its
    // own start (set on Start TTO), never a fallback "now".
    for (const switchRow of liveRows('court_switch')) {
      expect(switchRow).toMatchObject({ tto_active: true })
      expect(Date.parse(switchRow.tto_started_at)).toBe(startedAt)
    }
    const [endRow] = liveRows('end_tto')
    expect(endRow).toMatchObject({ tto_active: false, tto_started_at: null })
    expect(endRow.side_a).not.toBe(startRow.side_a)
  }, 30000)
})
