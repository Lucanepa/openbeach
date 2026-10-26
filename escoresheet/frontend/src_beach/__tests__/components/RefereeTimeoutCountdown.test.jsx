import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'

// The referee's time-out countdown (stress test 2026-10-25, official cloud
// match): the scorer counts 45 s (TEAM_TIMEOUT_SECONDS) and its relay action
// says 45, but its live-state row said duration 30, and the database
// channel's handler compared the row with the countdown of its mount (none):
// every row restarted the time-out at 30, so a tablet showed 24" where the
// scorer showed 39 s, or 45 when the row came first. And the countdown was
// 45 - (the tablet's own Date.now() - the scorer's start): a tablet 150 s
// slow showed 173", one 150 s fast no time-out. It now counts the scorer's
// length on the tablet's own clock from how long the time-out had run when
// the scorer sent it (the scorer's two readings: the start and the send time).

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

const row = (scorerNow, extra = {}) => ({
  updated_at: new Date(scorerNow).toISOString(), current_set: 1, points_a: 5, points_b: 4, sets_won_a: 0, sets_won_b: 0,
  match_status: 'live', side_a: 'left', serving_team: 'left', ...extra
})

function bundle(liveState) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#ef4444' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1, lastName: 'Müller' }, { number: 2, lastName: 'Weber' }],
    team2Players: [{ number: 1, lastName: 'Schmidt' }, { number: 2, lastName: 'Fischer' }],
    sets: [{ index: 1, team1Points: 5, team2Points: 4, finished: false }],
    events: [],
    liveState
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 300)) })
// The seconds the time-out countdown shows (its 45" text), null without one
const shownSeconds = () => {
  const el = [...document.querySelectorAll('div')].find(d => d.children.length === 0 && /^\d+"$/.test(d.textContent.trim()))
  return el ? Number(el.textContent.trim().slice(0, -1)) : null
}

async function openMatch(scorerNow) {
  render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
  await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
  await act(async () => { relay.subscriber(bundle(row(scorerNow))) })
  await settle()
  await waitFor(() => expect(cloud.onRow).toBeTypeOf('function'))
}

// The scorer's row of a running time-out: as the scorers before this fix
// wrote it (duration 30) unless `duration` is given
const timeoutRow = (start, sentAt, duration = 30) => row(sentAt, {
  last_event_type: 'timeout', last_event_team: 'left', last_event_data: { duration },
  timeout_active: true, timeout_started_at: new Date(start).toISOString()
})

describe('Referee_beach: the time-out countdown', () => {
  beforeEach(() => {
    relay.subscriber = null
    cloud.onRow = null
    cloud.onAction = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  it('the relay action\'s 45 s stays when the database row of the same time-out comes after it', async () => {
    const start = Date.now()
    await openMatch(start - 5000)
    await act(async () => { relay.subscriber({ _action: 'timeout', _actionData: { team: 'team1', countdown: 45, startTimestamp: start }, _scoreboardTimestamp: start + 20 }) })
    await settle()
    expect(shownSeconds()).toBeGreaterThanOrEqual(44)
    await act(async () => { cloud.onRow({ new: timeoutRow(start, start + 40) }) })
    await settle()
    expect(shownSeconds()).toBeGreaterThanOrEqual(44)
  })

  it('a row of this version says 45: a tablet on the database alone counts 45', async () => {
    const start = Date.now()
    await openMatch(start - 5000)
    await act(async () => { cloud.onRow({ new: timeoutRow(start, start + 40, 45) }) })
    await settle()
    expect(shownSeconds()).toBeGreaterThanOrEqual(44)
  })

  it('a tablet whose clock is 150 s slow or fast counts the time-out from 45, not 195 or none', async () => {
    for (const skew of [150000, -150000]) {
      // the scorer's clock reads `skew` more than this tablet's
      const start = Date.now() + skew
      await openMatch(start - 5000)
      await act(async () => { relay.subscriber({ _action: 'timeout', _actionData: { team: 'team1', countdown: 45, startTimestamp: start }, _scoreboardTimestamp: start + 20 }) })
      await settle()
      const shown = shownSeconds()
      expect(shown).toBeGreaterThanOrEqual(44)
      expect(shown).toBeLessThanOrEqual(45)
      document.body.innerHTML = ''
    }
  })

  it('a tablet that joins 10 s into the time-out, its clock 150 s slow, shows 35', async () => {
    const start = Date.now() + 150000
    await openMatch(start - 5000)
    await act(async () => { cloud.onRow({ new: timeoutRow(start, start + 10000, 45) }) })
    await settle()
    const shown = shownSeconds()
    expect(shown).toBeGreaterThanOrEqual(34)
    expect(shown).toBeLessThanOrEqual(35)
  })
})
