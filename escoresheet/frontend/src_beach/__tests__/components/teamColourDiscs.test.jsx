import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { discPaint, TEXT_DARK, TEXT_LIGHT } from '../../utils_beach/teamColours_beach'

// Row 27 of the OpenBeach port (OpenVolley 57d0be0e, 822a3cb3, 92e87df4): the
// referee tablet's two discs per team wear the team colour with a readable
// number (near-black on white, white with an outline on the default red), and
// a white disc gets a darker ring so it shows on the sand.

// jsdom normalises inline colours to rgb()
const rgb = (hex) => {
  const h = hex.replace('#', '')
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
}

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
    useRealtimeConnection: () => ({ status: real.CONNECTION_STATUS.CONNECTED, activeConnection: 'websocket', error: null, lastUpdate: null, forceReconnect: vi.fn() })
  }
})

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const { default: Referee } = await import('../../components_beach/Referee_beach')

function bundle(team1Color, team2Color) {
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: team1Color },
    team2: { name: 'Schmidt/Fischer', color: team2Color },
    team1Players: [{ number: 3, lastName: 'Müller' }, { number: 4, lastName: 'Weber' }],
    team2Players: [{ number: 7, lastName: 'Schmidt' }, { number: 8, lastName: 'Fischer' }],
    sets: [{ index: 1, team1Points: 5, team2Points: 4, finished: false }],
    events: []
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })
const discOf = (number) => [...document.querySelectorAll('[data-player-disc]')].find(d => d.querySelector('[data-disc-number]')?.textContent === String(number))

describe('referee tablet: team-colour discs', () => {
  beforeEach(() => {
    relay.subscriber = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
  })

  async function mount(team1Color, team2Color) {
    render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
    await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
    await act(async () => { relay.subscriber(bundle(team1Color, team2Color)) })
    await settle()
    await waitFor(() => expect(document.querySelectorAll('[data-player-disc]').length).toBe(4))
  }

  it('both players of a team wear its colour; white gets a near-black number and a ring on the sand', async () => {
    await mount('#ffffff', '#ef4444')
    const white = discPaint('#ffffff')
    for (const n of [3, 4]) {
      const el = discOf(n)
      expect(el.style.background).toBe(rgb('#ffffff'))
      expect(el.style.color).toBe(rgb(TEXT_DARK))
      expect(el.style.borderColor).toBe(rgb(white.ring))
      expect(el.querySelector('[data-disc-number]').style.textShadow).toBe('')
    }
  })

  it('red #ef4444 takes a near-black number (the higher contrast), no outline', async () => {
    await mount('#ffffff', '#ef4444')
    const red = discPaint('#ef4444')
    for (const n of [7, 8]) {
      const el = discOf(n)
      expect(el.style.background).toBe(rgb('#ef4444'))
      expect(el.style.color).toBe(rgb(TEXT_DARK))
      expect(el.style.textShadow).toBe('')
      expect(el.querySelector('[data-disc-number]').style.textShadow).toBe('')
      expect(el.style.borderColor).toBe(rgb(red.ring))
    }
  })

  it('a navy team stands out from the sand: no ring, the light hairline stays', async () => {
    await mount('#000080', '#ef4444')
    const el = discOf(3)
    expect(el.style.background).toBe(rgb('#000080'))
    expect(el.style.color).toBe(rgb(TEXT_LIGHT))
    expect(el.style.borderColor).toBe('rgba(255, 255, 255, 0.35)')
  })
})
