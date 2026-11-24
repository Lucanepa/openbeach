import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// The scorer's "End set interval" ends the break on the referee: over the
// relay its end_interval action, in the database a match_live_state row with
// set_interval_active false. Only the action was read: a referee on the
// database alone kept counting the break down after the scorer had ended
// it. As OpenVolley f5cb8e36 (the break before set 5 there).

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

const relay = vi.hoisted(() => ({ subscriber: null }))
vi.mock('../../utils_beach/serverDataSync_beach', () => ({
  getMatchData: () => new Promise(() => {}),
  subscribeToMatchData: (_id, cb) => { relay.subscriber = cb; return () => { relay.subscriber = null } },
  listAvailableMatches: async () => ({ success: true, matches: [] }),
  getWebSocketStatus: () => 'connected',
  forceReconnect: vi.fn()
}))
// The relay's actions: the test delivers them (onAction)
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

const { default: Referee } = await import('../../components_beach/Referee_beach')

const NOW = Date.now()
const at = (ms) => new Date(NOW + ms).toISOString()
// set 2 ended 20 s ago, 1:1 in sets: the break before set 3
const SET_END_AT = at(-20000)
const row = (ms, extra = {}) => ({
  updated_at: at(ms), current_set: 3, points_a: 0, points_b: 0, sets_won_a: 1, sets_won_b: 1,
  match_status: 'interval', set_interval_active: true, set_interval_started_at: SET_END_AT,
  side_a: 'left', serving_team: 'left', ...extra
})

function bundle(liveState) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#ef4444' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1, lastName: 'Müller' }, { number: 2, lastName: 'Weber' }],
    team2Players: [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }],
    sets: [
      { index: 1, team1Points: 21, team2Points: 15, finished: true },
      { index: 2, team1Points: 18, team2Points: 21, finished: true },
      { index: 3, team1Points: 0, team2Points: 0, finished: false }
    ],
    events: [],
    liveState
  }
}

const countdownShown = () => screen.queryByText('INTERVAL') !== null
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

async function openInBreak() {
  render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
  await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
  await act(async () => { relay.subscriber(bundle(row(0, { last_event_type: 'set_end' }))) })
  await settle()
  await waitFor(() => expect(cloud.onRow).toBeTypeOf('function'))
  await act(async () => { cloud.onRow({ new: row(100, { last_event_type: 'set_end' }) }) })
  await settle()
  await waitFor(() => expect(countdownShown()).toBe(true))
}

describe('Referee_beach: "End set interval"', () => {
  beforeEach(() => {
    relay.subscriber = null
    cloud.onRow = null
    cloud.onAction = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  it('on the database alone: its row closes the countdown', async () => {
    await openInBreak()
    await act(async () => { cloud.onRow({ new: row(1000, { set_interval_active: false, match_status: 'live', last_event_type: 'end_interval' }) }) })
    await settle()
    expect(countdownShown()).toBe(false)
  })

  it('over the relay: end_interval closes it, and a set end opens the next break', async () => {
    await openInBreak()
    await act(async () => { cloud.onAction('end_interval', {}) })
    await settle()
    expect(countdownShown()).toBe(false)
    await act(async () => {
      cloud.onAction('set_end', { setIndex: 2, winner: 'team2', team1Points: 18, team2Points: 21, countdown: 60, startTimestamp: Date.parse(SET_END_AT), team1SetsWon: 1, team2SetsWon: 1 })
    })
    await settle()
    expect(countdownShown()).toBe(true)
  })
})
