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


function bundle(match, set = { index: 1, team1Points: 12, team2Points: 10, finished: false, servingTeam: 'team1' }) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1', ...match },
    team1: { name: 'Müller/Weber', color: '#2563eb' },
    team2: { name: 'Schmidt/Fischer', color: '#dc2626' },
    team1Players: [{ number: 7 }, { number: 12 }],
    team2Players: [{ number: 3 }, { number: 21 }],
    sets: [set],
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
  await waitFor(() => expect(document.querySelector('[data-player-stack="left"]')).not.toBeNull())
  return view
}

const numbersOn = (side) => Array.from(document.querySelector(`[data-player-stack="${side}"]`).querySelectorAll('[data-player-disc]'))
  .map(d => d.textContent.replace(/\D/g, '')).sort()

describe('Referee_beach: the court sides without a live state', () => {
  beforeEach(() => { relay.subscriber = null })

  it('set 3 before its first change: the side chosen at its toss', async () => {
    const view = await mount({ setLeftTeamOverrides: { 1: 'A', 2: 'A' }, set3LeftTeam: 'B' }, { index: 3, team1Points: 1, team2Points: 2, finished: false, servingTeam: 'team1' })
    expect(numbersOn('left')).toEqual(['21', '3'])
    view.unmount()
  })

  it('set 1 before any change of courts: team A (team1) on the left', async () => {
    const view = await mount({ setLeftTeamOverrides: { 1: 'A' } })
    expect(numbersOn('left')).toEqual(['12', '7'])
    expect(numbersOn('right')).toEqual(['21', '3'])
    view.unmount()
  })

  it('after a change of courts (the TTO\'s at 21): team B (team2) on the left', async () => {
    const view = await mount({ setLeftTeamOverrides: { 1: 'B' } }, { index: 1, team1Points: 11, team2Points: 10, finished: false, servingTeam: 'team1' })
    expect(numbersOn('left')).toEqual(['21', '3'])
    expect(numbersOn('right')).toEqual(['12', '7'])
    view.unmount()
  })

  it('team A is team2: the override names the team by its letter, not its key', async () => {
    const view = await mount({ coinTossTeamA: 'team2', setLeftTeamOverrides: { 1: 'A' } })
    expect(numbersOn('left')).toEqual(['21', '3'])
    view.unmount()
  })

  it('set 2 with no override of its own starts where set 1 ended (no change between sets unless asked)', async () => {
    const view = await mount({ setLeftTeamOverrides: { 1: 'A' } }, { index: 2, team1Points: 3, team2Points: 2, finished: false, servingTeam: 'team1' })
    expect(numbersOn('left')).toEqual(['12', '7'])
    view.unmount()
  })
})
