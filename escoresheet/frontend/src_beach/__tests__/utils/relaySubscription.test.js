/**
 * The referee's relay subscription (serverDataSync_beach.subscribeToMatchData):
 * the match bundle in openbeach's shape, and the scorer's live-state-update
 * on every point, on the relay URL backendConfig names.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: vi.fn() }))
vi.mock('../../utils_beach/backendConfig_beach', () => ({
  isBackendAvailable: () => false,
  getApiUrl: () => null,
  getCloudApiUrl: () => null,
  getBackendUrl: () => 'http://192.168.1.20:5174',
  getRelayWebSocketUrl: () => 'ws://192.168.1.20:8081'
}))

const { subscribeToMatchData, rememberMatchAccess, forgetMatchAccess } = await import('../../utils_beach/serverDataSync_beach')

class FakeSocket {
  static instances = []
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeSocket.instances.push(this)
  }
  send(text) { this.sent.push(JSON.parse(text)) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }) }
}

describe('the referee on the relay', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    forgetMatchAccess()
  })

  it('subscribes with its PIN on the relay\'s WebSocket port, reads home/away and the live state', () => {
    rememberMatchAccess('match_k', { pin: '314159' })
    const got = []
    const unsubscribe = subscribeToMatchData('match_k', (d) => got.push(d))
    const ws = FakeSocket.instances[0]
    expect(ws.url).toBe('ws://192.168.1.20:8081')
    ws.open()
    expect(ws.sent[0]).toEqual({ type: 'subscribe-match', matchId: 'match_k', pin: '314159' })

    ws.receive({ type: 'match-full-data', matchId: 'match_k', access: 'full', match: { id: 'match_k', sportType: 'beach' }, homeTeam: { name: 'A / B' }, awayTeam: { name: 'C / D' }, homePlayers: [{ number: 1 }, { number: 2 }], awayPlayers: [{ number: 1 }], sets: [{ index: 1 }], events: [] })
    expect(got[0].team1.name).toBe('A / B')
    expect(got[0].team2Players).toHaveLength(1)

    ws.receive({ type: 'live-state-update', matchId: 'match_k', liveState: { points_a: 4, points_b: 2, serve_player: 1, sport_type: 'beach' } })
    expect(got[1]).toEqual({ _liveState: { points_a: 4, points_b: 2, serve_player: 1, sport_type: 'beach' } })

    // Another court's room and an indoor live state are not this match's
    ws.receive({ type: 'live-state-update', matchId: 'match_other', liveState: { points_a: 9 } })
    ws.receive({ type: 'live-state-update', matchId: 'match_k', liveState: { points_a: 9, sport_type: 'indoor' } })
    ws.receive({ type: 'live-state-update', matchId: 'match_k' })
    expect(got).toHaveLength(2)
    unsubscribe()
  })
})
