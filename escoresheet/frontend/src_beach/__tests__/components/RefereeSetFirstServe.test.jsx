import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'

// The referee's court sides without a live state from the scoreboard (an API
// read or a relay bundle without one): the match's sides, by the one rule of
// courtSides_beach (match.setLeftTeamOverrides holds 'A' / 'B'), so after
// the change of courts of the TTO (or any other) the teams are where the
// scorer has them.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en', changeLanguage: () => {} } })
}))
vi.mock('../../i18n', () => ({ default: { language: 'en', changeLanguage: () => {} } }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ useSyncQueue: () => ({ syncStatus: 'idle', retryErrors: vi.fn() }) }))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: () => { throw new Error('no cloud') } }))
// vmin(v) = 10 v px: a 1000 px tablet at 100 %
vi.mock('../../hooks_beach/useScaledLayout_beach', () => ({ useScaledLayout: () => ({ vmin: (v) => v * 10, scaleFactor: 1 }) }))
vi.mock('../../components_beach/WsDebugOverlay_beach', () => ({ default: () => null }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => false,
  isVenueMode: () => true
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

// The referee's serve before a set's first point when the bundle carries no
// serving team (the venue relay's bundle: the match, its sets and events):
// the scorer's own rule (coinToss_beach setFirstServer). Set 2: the serve
// recorded in the interval (set2FirstServe, FIVB beach 7.1.2.3: the loser of
// the first toss chooses serve / receive or side), else the other team than
// set 1's. Set 3: its toss (set3FirstServe), else the other team than set
// 2's. It ignored set2FirstServe and gave set 3 to set 1's first server.
function bundle(match, set) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team1', setLeftTeamOverrides: { 1: 'A', 2: 'A' }, set3LeftTeam: 'A', ...match },
    team1: { name: 'Müller/Weber', color: '#2563eb' },
    team2: { name: 'Schmidt/Fischer', color: '#dc2626' },
    team1Players: [{ number: 7 }, { number: 12 }],
    team2Players: [{ number: 3 }, { number: 21 }],
    sets: [
      { index: 1, team1Points: 21, team2Points: 15, finished: true },
      ...(set.index === 3 ? [{ index: 2, team1Points: 18, team2Points: 21, finished: true }] : []),
      set
    ],
    events: [],
    liveState: null
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

async function mount(match, set) {
  const view = render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
  await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
  await act(async () => { relay.subscriber(bundle(match, set)) })
  await settle()
  await waitFor(() => expect(document.querySelector('[data-diag="referee-score"]')).not.toBeNull())
  return view
}

// The 2nd referee's view: team A (team1) on the left
const servingSide = () => (document.querySelector('[data-serve-block="left"]') ? 'left'
  : document.querySelector('[data-serve-block="right"]') ? 'right' : null)

describe('Referee_beach: who serves first in sets 2 and 3 without a serving team in the bundle', () => {
  beforeEach(() => { relay.subscriber = null })

  it('set 2, A (who served set 1) chose to serve again in the interval: A serves', async () => {
    const view = await mount({ set2FirstServe: 'team1' }, { index: 2, team1Points: 0, team2Points: 0, finished: false })
    expect(servingSide()).toBe('left')
    view.unmount()
  })

  it('set 2 with nothing recorded: the other team than set 1 serves', async () => {
    const view = await mount({}, { index: 2, team1Points: 0, team2Points: 0, finished: false })
    expect(servingSide()).toBe('right')
    view.unmount()
  })

  it('set 3 with no toss serve stored: the other team than set 2\'s first server (as the scorer)', async () => {
    // set 1 A, set 2 A (chosen in the interval), so set 3 B (it said A, set 1's)
    const view = await mount({ set2FirstServe: 'team1' }, { index: 3, team1Points: 0, team2Points: 0, finished: false })
    expect(servingSide()).toBe('right')
    view.unmount()
  })

  it('set 3 with its toss serve stored: that team', async () => {
    const view = await mount({ set3FirstServe: 'B' }, { index: 3, team1Points: 0, team2Points: 0, finished: false })
    expect(servingSide()).toBe('right')
    view.unmount()
  })
})
