import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// MTO / RIT on the referee screen (rule 17.1.2: 5 minutes recovery time).
// The scorer relays `medical` / `end_medical`; on reconnect the recovery is
// rebuilt from the events.

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

const relay = vi.hoisted(() => ({ subscriber: null, fetches: [], onAction: null }))
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
    useRealtimeConnection: ({ onAction }) => (relay.onAction = onAction, {
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

function bundle(team1Points, team2Points, events = []) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#ef4444' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1, lastName: 'Müller' }, { number: 2, lastName: 'Weber' }],
    team2Players: [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }],
    sets: [{ index: 1, team1Points, team2Points, finished: false }],
    currentSet: { index: 1, team1Points, team2Points },
    events
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

describe('Referee_beach: MTO / RIT', () => {
  beforeEach(() => {
    relay.subscriber = null
    relay.fetches = []
    relay.onAction = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  async function mountWith(first) {
    render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(first) })
    await settle()
  }

  it('the scorer\'s medical action shows a 5:00 recovery countdown with type, team and player; end_medical clears it', async () => {
    await mountWith(bundle(10, 8))
    expect(screen.queryByTestId('referee-medical')).toBeNull()
    await act(async () => {
      relay.onAction('medical', { kind: 'rit', ritType: 'toilet', team: 'team2', playerNumber: 2, playerName: 'Fischer', startTime: new Date().toISOString(), durationSec: 300 })
    })
    const box = await screen.findByTestId('referee-medical')
    expect(box.textContent).toContain('RIT (toilet)')
    expect(box.textContent).toContain('B #2 Fischer')
    expect(box.textContent).toMatch(/[45]:\d\d/)
    // Last action names it too
    expect(document.body.textContent).toContain('RIT (toilet) – B #2 Fischer')
    await act(async () => { relay.onAction('end_medical', { kind: 'rit', team: 'team2', playerNumber: 2, playerName: 'Fischer', outcome: 'recovered' }) })
    await waitFor(() => expect(screen.queryByTestId('referee-medical')).toBeNull())
    expect(document.body.textContent).toContain('RIT (toilet) end – B #2 Fischer (0:00, recovered)')
  })

  it('a running MTO is rebuilt from the events on reconnect (player name from the roster)', async () => {
    const startTime = new Date(NOW - 60_000).toISOString()
    await mountWith(bundle(10, 8, [{ seq: 5, setIndex: 1, type: 'mto', payload: { team: 'team1', playerNumber: 1, startTime } }]))
    const box = await screen.findByTestId('referee-medical')
    expect(box.textContent).toContain('MTO')
    expect(box.textContent).toContain('A #1 Müller')
  })
})
