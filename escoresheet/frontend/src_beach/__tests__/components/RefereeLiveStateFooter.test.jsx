import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { LIVE_STATE_HOLD_MS } from '../../utils_beach/liveStateTracker_beach'

// The referee following through the cloud: a point's first news is the
// match_live_state row. Its score waits for the scorer's bundle (tracker.hold,
// one update with the serve and the court), and so did the footer's "Last
// action". The refetch the row starts brings that bundle within the hold,
// which cancelled the hold and with it the footer: the last action never
// changed. It must show with the bundle.

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

const relay = vi.hoisted(() => ({ subscriber: null, fetches: [] }))
vi.mock('../../utils_beach/serverDataSync_beach', () => ({
  // Each refetch resolves when the test says so
  getMatchData: () => new Promise(res => relay.fetches.push(res)),
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

// The big score: the two digits around the ':' separator
function shownScore() {
  const sep = [...document.querySelectorAll('span')].find(s => s.textContent === ':' && s.previousElementSibling && s.nextElementSibling)
  if (!sep) return null
  return `${sep.previousElementSibling.textContent}:${sep.nextElementSibling.textContent}`
}

const footerPoint = () => screen.queryByText(/^Point\b/)

// The relay pushes are applied at most every 150 ms (anti-flicker debounce)
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

describe('Referee_beach: a database-row point reaches the footer', () => {
  beforeEach(() => {
    relay.subscriber = null
    relay.fetches = []
    cloud.onRow = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  it('the last action shows with the bundle that ends the hold', async () => {
    render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(bundle(10, 8, live(0, 10, 8))) })
    await settle()
    await waitFor(() => expect(cloud.onRow).toBeTypeOf('function'))
    expect(shownScore()).toBe('10:8')
    expect(footerPoint()).toBeNull()

    // The point arrives as the database row: score and footer wait together
    const before = relay.fetches.length
    const row = live(1000, 11, 8, { last_event_type: 'point', last_event_team: 'team1' })
    await act(async () => { cloud.onRow({ new: row }) })
    expect(shownScore()).toBe('10:8')
    expect(footerPoint()).toBeNull()

    // The refetch the row started brings the scorer's bundle within the hold
    await waitFor(() => expect(relay.fetches.length).toBeGreaterThan(before))
    await act(async () => { relay.fetches[relay.fetches.length - 1](bundle(11, 8, row)) })
    await settle()
    expect(shownScore()).toBe('11:8')
    expect(footerPoint()).not.toBeNull()

    // ... and stays once the hold would have run out
    await act(async () => { await new Promise(r => setTimeout(r, LIVE_STATE_HOLD_MS)) })
    expect(footerPoint()).not.toBeNull()
  })
})
