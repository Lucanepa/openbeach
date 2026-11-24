import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'

// The referee read the whole match again on every row of the database
// channel, one per change of the scorer's live state: under fast scoring 3
// tablets made about 1600 reads in 2.3 minutes behind one venue IP, 455 of
// 676 relay reads got 429, and the scorer's own reads in the same per-IP
// budget were refused, so its live-state pushes were dropped (stress test
// 2026-10-25). And three failed reads in a row (429 included) took the
// referee out of the running match. A burst of rows now makes one read,
// none while the relay pushes the bundle, and a refused read keeps the match.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en', changeLanguage: () => {} } })
}))
vi.mock('../../i18n', () => ({ default: { language: 'en', changeLanguage: () => {} } }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ useSyncQueue: () => ({ syncStatus: 'idle', retryErrors: vi.fn() }) }))

// The database's realtime channel: the test delivers its rows
const cloud = vi.hoisted(() => ({ onRow: null, onAction: null }))
vi.mock('../../lib_beach/supabaseClient_beach', () => {
  const channel = {
    on: (_kind, _filter, cb) => { cloud.onRow = cb; return channel },
    subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); return channel }
  }
  return { supabase: { channel: () => channel, removeChannel: () => {} } }
})
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiFrom: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: '00000000-0000-4000-8000-000000000001' }, error: null }) }
    return q
  }
}))
vi.mock('../../hooks_beach/useScaledLayout_beach', () => ({ useScaledLayout: () => ({ vmin: (v) => v * 10, scaleFactor: 1 }) }))
vi.mock('../../components_beach/WsDebugOverlay_beach', () => ({ default: () => null }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true,
  isVenueMode: () => false
}))

const relay = vi.hoisted(() => ({ subscriber: null, reads: 0, answer: null }))
vi.mock('../../utils_beach/serverDataSync_beach', () => ({
  // the referee's reads of the whole match: counted, answered as the test says
  getMatchData: async () => { relay.reads++; return relay.answer },
  subscribeToMatchData: (_id, cb) => { relay.subscriber = cb; return () => { relay.subscriber = null } },
  listAvailableMatches: async () => ({ success: true, matches: [] }),
  getWebSocketStatus: () => 'connected',
  forceReconnect: vi.fn()
}))
vi.mock('../../hooks_beach/useRealtimeConnection_beach', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useRealtimeConnection: ({ onAction }) => {
      cloud.onAction = onAction
      return { status: real.CONNECTION_STATUS.CONNECTED, activeConnection: 'websocket', error: null, lastUpdate: null, forceReconnect: vi.fn() }
    }
  }
})

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const { default: Referee } = await import('../../components_beach/Referee_beach')

const row = (n, extra = {}) => ({
  updated_at: new Date(Date.now() + n).toISOString(), current_set: 1, points_a: n, points_b: 0, sets_won_a: 0, sets_won_b: 0,
  match_status: 'live', side_a: 'left', serving_team: 'left', last_event_type: 'point', ...extra
})

function bundle(points = 0) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#ef4444' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1, lastName: 'Müller' }, { number: 2, lastName: 'Weber' }],
    team2Players: [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }],
    sets: [{ index: 1, team1Points: points, team2Points: 0, finished: false }],
    events: []
  }
}

const sleep = (ms) => act(async () => { await new Promise(r => setTimeout(r, ms)) })

async function open(onExit = () => {}) {
  render(<Referee matchId="match_seed" onExit={onExit} isMasterMode={false} />)
  await waitFor(() => expect(cloud.onRow).toBeTypeOf('function'))
  await sleep(300)
}

describe('Referee_beach: reads of the whole match on the database\'s rows', () => {
  beforeEach(() => {
    relay.subscriber = null
    relay.reads = 0
    relay.answer = bundle()
    cloud.onRow = null
    cloud.onAction = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  it('20 rows in a burst: one read at once and one after the gap, not 20', async () => {
    await open()
    const before = relay.reads
    for (let n = 1; n <= 20; n++) {
      await act(async () => { cloud.onRow({ new: row(n) }) })
    }
    await sleep(2200)
    expect(relay.reads - before).toBeGreaterThanOrEqual(1)
    expect(relay.reads - before).toBeLessThanOrEqual(2)
  }, 20000)

  it('while the relay pushes the bundle: no read for the rows it covers', async () => {
    await open()
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(bundle(0)) })
    const before = relay.reads
    for (let n = 1; n <= 10; n++) {
      await act(async () => { cloud.onRow({ new: row(n) }) })
      await act(async () => { relay.subscriber(bundle(n)) })
      await sleep(50)
    }
    await sleep(3000)
    expect(relay.reads - before).toBe(0)
  }, 20000)

  it('refused reads (429) do not take the referee out of the match', async () => {
    const onExit = vi.fn()
    relay.answer = { success: false, error: 'Too many requests' }
    await open(onExit)
    for (let n = 1; n <= 6; n++) {
      await act(async () => { cloud.onRow({ new: row(n) }) })
      await sleep(400)
    }
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await sleep(200)
    expect(onExit).not.toHaveBeenCalled()
  }, 20000)
})
