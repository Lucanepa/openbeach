import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// Row 14 of the OpenBeach port (OpenVolley 23054276, 570198f3, f887f226,
// a351046a): the referee shows the newest live state whatever path brought
// it. An older relay copy read back, or a late live-state push, never rolls
// the score back; a newer push moves the score at once.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en', changeLanguage: () => {} } })
}))
vi.mock('../../i18n', () => ({ default: { language: 'en', changeLanguage: () => {} } }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ useSyncQueue: () => ({ syncStatus: 'idle', retryErrors: vi.fn() }) }))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: () => { throw new Error('no cloud') } }))
vi.mock('../../hooks_beach/useScaledLayout_beach', () => ({ useScaledLayout: () => ({ vmin: (v) => v * 10, scaleFactor: 1 }) }))
vi.mock('../../components_beach/WsDebugOverlay_beach', () => ({ default: () => null }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => false,
  isVenueMode: () => true
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

// The setup's ResizeObserver stub is not a constructor
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const { default: Referee } = await import('../../components_beach/Referee_beach')

const NOW = Date.now()
const at = (ms) => new Date(NOW + ms).toISOString()
const live = (ms, a, b, side_a = 'left') => ({ updated_at: at(ms), current_set: 1, points_a: a, points_b: b, side_a, match_status: 'live' })

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
    ...(liveState ? { liveState } : {})
  }
}

// The big score: the two digits around the ':' separator
function shownScore() {
  const sep = [...document.querySelectorAll('span')].find(s => s.textContent === ':' && s.previousElementSibling && s.nextElementSibling)
  if (!sep) return null
  return `${sep.previousElementSibling.textContent}:${sep.nextElementSibling.textContent}`
}

// The relay pushes are applied at most every 150 ms (anti-flicker debounce)
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

describe('Referee_beach: the newest live state wins', () => {
  beforeEach(() => {
    relay.subscriber = null
    relay.fetches = []
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  async function mountWith(first) {
    render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(first) })
    await settle()
    await waitFor(() => expect(shownScore()).not.toBeNull())
  }

  it('a newer live-state push moves the score at once', async () => {
    await mountWith(bundle(10, 8, live(0, 10, 8)))
    expect(shownScore()).toBe('10:8')
    await act(async () => { relay.subscriber({ _liveState: live(1000, 11, 8) }) })
    await settle()
    expect(shownScore()).toBe('11:8')
  })

  it('a late older live-state push does not roll the sides back', async () => {
    await mountWith(bundle(11, 8, live(1000, 11, 8)))
    expect(shownScore()).toBe('11:8')
    // A copy from before the change of courts at 14 points (7:6, team A on
    // the right) arrives late: it must not swap the teams back
    await act(async () => { relay.subscriber({ _liveState: live(-2000, 7, 6, 'right') }) })
    await settle()
    expect(shownScore()).toBe('11:8')
  })

  it('a refetch that started before a relay push lands without effect', async () => {
    await mountWith(bundle(10, 8, live(0, 10, 8)))
    // The initial refetch (connection up) is in flight; a newer bundle is pushed
    await waitFor(() => expect(relay.fetches.length).toBeGreaterThan(0))
    await settle()
    await act(async () => { relay.subscriber(bundle(11, 8, live(1000, 11, 8))) })
    await settle()
    expect(shownScore()).toBe('11:8')
    // ... then the old read comes back with the score before the push
    await act(async () => { relay.fetches[0](bundle(10, 8, live(0, 10, 8))) })
    await settle()
    expect(shownScore()).toBe('11:8')
  })

  it('a copy read back before the newest push keeps the newer score', async () => {
    await mountWith(bundle(10, 8, live(0, 10, 8)))
    await act(async () => { relay.subscriber({ _liveState: live(1000, 11, 8) }) })
    await settle()
    // The relay's copy of the scorer's previous sync arrives after the push
    await act(async () => { relay.subscriber(bundle(10, 8, live(0, 10, 8))) })
    await settle()
    expect(shownScore()).toBe('11:8')
  })

  it('warns that the score may be out of date while the device is offline', async () => {
    await mountWith(bundle(10, 8, live(0, 10, 8)))
    expect(screen.queryByTestId('connection-banner')).toBeNull()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    try {
      await act(async () => { window.dispatchEvent(new Event('offline')) })
      expect(screen.getByTestId('connection-banner')).toHaveTextContent('Score and server may be out of date')
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    }
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByTestId('connection-banner')).toBeNull()
  })
})
