import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor, fireEvent, screen } from '@testing-library/react'

// The referee court's layout contract (owner, 2026-10-08: "here ball can be
// smaller, and the serve can get much more space that is there"):
// - the serve ball is clearly smaller than a player disc and sits outside the
//   server's disc, with room kept for it inside the players' column;
// - the SERVE block beside the big score has a slot on both sides (nothing
//   moves when the serve changes side) and shows on the serving team's side,
//   in both referee views;
// - the block's number is as big as the score row allows, never taller.

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

const {
  default: Referee,
  REF_DISC_VMIN, REF_BALL_VMIN, REF_BALL_GAP_VMIN, REF_SERVE_SLOT_VMIN, REF_SERVE_SLOT_MAX
} = await import('../../components_beach/Referee_beach')

const px = (v) => parseFloat(String(v))

// Team A (team1) on the left for the 2nd referee; servingTeam picks the side
function bundle(servingTeam) {
  const lineupA = { I: { number: 7, isServing: servingTeam === 'team1', sanctions: [] }, III: { number: 12, isServing: false, sanctions: [] } }
  const lineupB = { II: { number: 3, isServing: false, sanctions: [] }, IV: { number: 21, isServing: servingTeam === 'team2', sanctions: [] } }
  return {
    success: true,
    match: { id: 'match_seed', status: 'live', coinTossTeamA: 'team1', firstServe: 'team1' },
    team1: { name: 'Müller/Weber', color: '#2563eb' },
    team2: { name: 'Schmidt/Fischer', color: '#dc2626' },
    team1Players: [{ number: 7 }, { number: 12 }],
    team2Players: [{ number: 3 }, { number: 21 }],
    sets: [{ index: 1, team1Points: 14, team2Points: 13, finished: false, servingTeam }],
    events: [],
    liveState: {
      updated_at: new Date().toISOString(), current_set: 1, points_a: 14, points_b: 13,
      side_a: 'left', match_status: 'live', lineup_a: lineupA, lineup_b: lineupB
    }
  }
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 200)) })

async function mount(servingTeam) {
  const view = render(<Referee matchId="match_seed" onExit={() => {}} isMasterMode={false} />)
  await waitFor(() => expect(relay.subscriber).toBeTypeOf('function'))
  await act(async () => { relay.subscriber(bundle(servingTeam)) })
  await settle()
  await waitFor(() => expect(document.querySelector('[data-diag="referee-score"]')).not.toBeNull())
  return view
}

const slot = (side) => document.querySelector(`[data-serve-slot="${side}"]`)
const block = (side) => document.querySelector(`[data-serve-block="${side}"]`)
const ball = () => document.querySelector('img[alt="Ball"]')

// The score row's height, as the browser lays it out (jsdom has no layout)
let rowHeight = 0
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

describe('Referee_beach: serve ball and SERVE block layout', () => {
  beforeEach(() => {
    relay.subscriber = null
    rowHeight = 0
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() { return this.dataset?.diag === 'referee-score' ? rowHeight : 0 }
    })
  })
  afterEach(() => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight)
  })

  it('the serve ball is clearly smaller than a player disc (55-65 %)', async () => {
    await mount('team1')
    const disc = ball().closest('[data-player-disc]')
    const ratio = px(ball().style.width) / px(disc.style.width)
    expect(px(disc.style.width)).toBe(REF_DISC_VMIN * 10)
    expect(ratio).toBeGreaterThanOrEqual(0.55)
    expect(ratio).toBeLessThanOrEqual(0.65)
    expect(px(ball().style.height)).toBe(px(ball().style.width))
  })

  it('the ball sits outside the disc on the back-line side, with its room kept in the column', async () => {
    await mount('team1')
    // Left team serving (2nd referee view): the ball left of the disc
    expect(ball().dataset.serveBall).toBe('left')
    expect(ball().style.right).toBe(`calc(100% + ${REF_BALL_GAP_VMIN * 10}px)`)
    expect(ball().style.left).toBe('auto')
    // Every disc keeps the ball's room on both sides (its side margins)
    const discs = document.querySelectorAll('[data-player-disc]')
    expect(discs.length).toBe(4)
    for (const disc of discs) {
      expect(px(disc.style.marginLeft)).toBeGreaterThanOrEqual((REF_BALL_VMIN + REF_BALL_GAP_VMIN) * 10)
      expect(px(disc.style.marginRight)).toBeGreaterThanOrEqual((REF_BALL_VMIN + REF_BALL_GAP_VMIN) * 10)
    }
    // ... and the court's halves never grow with a long name
    const court = document.querySelector('[data-player-stack="left"]').parentElement.parentElement
    expect(court.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)')
    for (const side of ['left', 'right']) {
      const stack = document.querySelector(`[data-player-stack="${side}"]`)
      expect(stack.style.width).toBe('100%')
      expect(stack.style.minWidth).toBe('0px')
    }
  })

  it('reserves a SERVE slot on both sides of the score and shows the block on the serving side', async () => {
    await mount('team1')
    const row = document.querySelector('[data-diag="referee-score"]')
    const slotWidth = `min(${REF_SERVE_SLOT_VMIN * 10}px, ${REF_SERVE_SLOT_MAX})`
    expect(row.dataset.columns).toBe(`${slotWidth} minmax(0, 1fr) ${slotWidth}`)
    expect(slot('left')).not.toBeNull()
    expect(slot('right')).not.toBeNull()
    // The slots are the row's first and last cells, the score between them
    expect(row.firstElementChild).toBe(slot('left'))
    expect(row.lastElementChild).toBe(slot('right'))
    expect(block('left')).not.toBeNull()
    expect(block('right')).toBeNull()
    expect(slot('right').getAttribute('aria-hidden')).toBe('true')
    // The server's number and place in the serve order
    expect(block('left').querySelector('[data-serve-number]').textContent).toBe('7')
    expect(block('left').querySelector('[data-serve-order]').textContent).toBe('I')
    expect(screen.getByRole('status', { name: 'Serve 7' })).toBe(block('left'))
  })

  it('the block follows the serving team to the right, and to the other side in the 1st referee view', async () => {
    await mount('team2')
    expect(block('right')).not.toBeNull()
    expect(block('left')).toBeNull()
    expect(block('right').querySelector('[data-serve-number]').textContent).toBe('21')
    expect(block('right').querySelector('[data-serve-order]').textContent).toBe('IV')
    expect(ball().dataset.serveBall).toBe('right')
    expect(ball().style.left).toBe(`calc(100% + ${REF_BALL_GAP_VMIN * 10}px)`)
    // The 1st referee sees the court from the other side
    const row = document.querySelector('[data-diag="referee-score"]')
    const columns = row.dataset.columns
    expect(columns).toMatch(/^min\(.+\) minmax\(0, 1fr\) min\(.+\)$/)
    fireEvent.click(screen.getByRole('button', { name: /^1 / }))
    await settle()
    expect(block('left')).not.toBeNull()
    expect(block('right')).toBeNull()
    expect(ball().dataset.serveBall).toBe('left')
    // Same reserved slots: nothing moves
    expect(row.dataset.columns).toBe(columns)
  })

  it('the SERVE number fits the score row (never makes it taller)', async () => {
    rowHeight = 114
    await mount('team1')
    await waitFor(() => expect(px(block('left').querySelector('[data-serve-number]').style.fontSize)).toBeGreaterThan(0))
    const row = document.querySelector('[data-diag="referee-score"]')
    const b = block('left')
    const number = px(b.querySelector('[data-serve-number]').style.fontSize)
    const label = px(b.querySelector('span > span').style.fontSize)
    const used = number * 0.95 + label + px(b.style.gap) + 2 * px(b.style.paddingTop) + 2 * px(b.style.borderTopWidth)
    expect(used).toBeLessThanOrEqual(rowHeight - 2 * px(row.style.paddingTop))
    // ... and bigger than the old 6 vmin box
    expect(number).toBeGreaterThan(60)
  })
})
