import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// The scorer's alarm ("call the referee") reaches the referee as an update of
// the match_live_state row that sets only scorer_attention_trigger: the row
// keeps the updated_at of the scorer's last key event. The relay meanwhile
// pushes a live state on every event (a rally start too), so the row is
// "older" than the newest live state shown. It must still ring.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en', changeLanguage: () => {} } })
}))
vi.mock('../../i18n', () => ({ default: { language: 'en', changeLanguage: () => {} } }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ useSyncQueue: () => ({ syncStatus: 'idle', retryErrors: vi.fn() }) }))

// The database's realtime channel: the test delivers its rows
const cloud = vi.hoisted(() => ({ onRow: null }))
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

const relay = vi.hoisted(() => ({ subscriber: null }))
vi.mock('../../utils_beach/serverDataSync_beach', () => ({
  getMatchData: () => new Promise(() => {}),
  subscribeToMatchData: (_id, cb) => { relay.subscriber = cb; return () => { relay.subscriber = null } },
  listAvailableMatches: async () => ({ success: true, matches: [] }),
  getWebSocketStatus: () => 'connected',
  forceReconnect: vi.fn()
}))
vi.mock('../../hooks_beach/useRealtimeConnection_beach', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useRealtimeConnection: () => ({
      status: real.CONNECTION_STATUS.CONNECTED,
      activeConnection: 'websocket',
      error: null,
      lastUpdate: null,
      forceReconnect: vi.fn()
    })
  }
})

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const { default: Referee } = await import('../../components_beach/Referee_beach')

const NOW = Date.now()
const at = (ms) => new Date(NOW + ms).toISOString()
const live = (ms, a, b, extra = {}) => ({ updated_at: at(ms), current_set: 1, points_a: a, points_b: b, side_a: 'left', match_status: 'live', ...extra })

function bundle(team1Points, team2Points, liveState) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#ef4444' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1, lastName: 'Müller' }, { number: 2, lastName: 'Weber' }],
    team2Players: [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }],
    sets: [{ index: 1, team1Points, team2Points, finished: false }],
    events: [],
    liveState
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

describe('Referee_beach: the scorer alarm', () => {
  beforeEach(() => {
    relay.subscriber = null
    cloud.onRow = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  it('rings for an alarm on a row older than the newest relay push', async () => {
    render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(bundle(10, 8, live(0, 10, 8))) })
    await settle()
    await waitFor(() => expect(cloud.onRow).toBeTypeOf('function'))
    // The rally start after the last point: relay only, stamped later
    await act(async () => { relay.subscriber({ _liveState: live(4000, 10, 8, { rally_in_progress: true }) }) })
    await settle()
    expect(screen.queryByText('Scorer needs attention')).toBeNull()
    // The alarm: the row of the last point (10:8, stamped 0) with the trigger
    await act(async () => { cloud.onRow({ new: live(0, 10, 8, { scorer_attention_trigger: at(5000) }) }) })
    await settle()
    expect(screen.getByText('Scorer needs attention')).toBeInTheDocument()
  })
})
