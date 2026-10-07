import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRelayLivescoreFeed,
  fetchRelayLivescoreList,
  isBeachListRow,
  newerLiveState,
  relayLiveRow,
  relayLivescoreMode,
  relayLivescoreWsUrl,
  setResultsFromSets,
  LIVESCORE_LIVE_FIELDS
} from '../../utils_beach/relayLivescore_beach'
import { setBackendOverride } from '../../utils_beach/backendConfig_beach'
import { toWireBundle } from '../../utils_beach/relayPublisher_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// (1) The beach livescore only read the cloud: at a venue without internet
// (the desktop app's relay, a venue server) it stayed empty. Ported from
// OpenVolley's relayLivescore: the relay's match list and one PIN-free
// subscription per match. Relay list rows carry sportType: indoor courts on
// the same relay are not followed.

const PIN = '987654'
const DOB = '2001-04-17'

// A live state as the beach scorer pushes it (Scoreboard_beach broadcastData
// through relayPublisher_beach.relayLiveState)
function liveState(overrides = {}) {
  return {
    match_id: 'seed-1',
    current_set: 2,
    team_a_name: 'Müller/Weber (CHE)',
    team_a_short: 'CHE',
    team_a_color: '#3b82f6',
    team_b_name: 'Schmidt/Fischer (DEU)',
    team_b_short: 'DEU',
    team_b_color: '#ef4444',
    sets_won_a: 1,
    sets_won_b: 0,
    points_a: 7,
    points_b: 5,
    side_a: 'right',
    serving_team: 'right',
    server_number: 2,
    serve_player: 2,
    rally_in_progress: false,
    challenges_used_a: 1,
    challenges_used_b: 0,
    timeouts_a: 1,
    timeouts_b: 0,
    timeout_active: false,
    set_interval_active: false,
    match_status: 'live',
    game_n: '12',
    league: 'Beach Tour',
    gender: 'women',
    updated_at: '2026-10-06T18:00:05.000Z',
    sport_type: 'beach',
    _seq: 10,
    _session: 's1',
    ...overrides
  }
}

// What a relay sends a subscriber without a PIN (relaySummaryBundle)
function summary(type, matchId, extra = {}) {
  return {
    type,
    matchId,
    access: 'summary',
    match: { id: 1, status: 'live', seed_key: matchId, test: false, sportType: 'beach' },
    homeTeam: { name: 'Müller/Weber (CHE)', color: '#3b82f6' },
    awayTeam: { name: 'Schmidt/Fischer (DEU)' },
    homePlayers: [],
    awayPlayers: [],
    sets: [{ id: 1, index: 1, homePoints: 21, awayPoints: 18, finished: true }, { id: 2, index: 2, homePoints: 7, awayPoints: 5, finished: false }],
    events: [],
    ...extra
  }
}

function fakeSocket() {
  const s = {
    readyState: 0,
    sent: [],
    send(text) { s.sent.push(JSON.parse(text)) },
    close: vi.fn(() => { s.readyState = 3 }),
    open() { s.readyState = 1; s.onopen?.() },
    receive(msg) { s.onmessage?.({ data: JSON.stringify(msg) }) },
    drop() { s.readyState = 3; s.onclose?.({ code: 1006 }) }
  }
  return s
}

beforeEach(() => {
  useMemoryLocalStorage()
})

describe('relayLivescoreMode', () => {
  it('reads the relay when the page or the chosen server is on this machine / the LAN', () => {
    expect(relayLivescoreMode({ servedFromLocalServer: true, origin: 'http://192.168.1.20:5174' })).toBe(true)
    expect(relayLivescoreMode({ servedFromLocalServer: true, origin: 'http://localhost:5174' })).toBe(true) // the desktop display window
    expect(relayLivescoreMode({ override: 'http://192.168.1.20:5174' })).toBe(true) // Android app
  })

  it('keeps the cloud everywhere else', () => {
    expect(relayLivescoreMode({ servedFromLocalServer: false, origin: 'https://beach-livescore.openvolley.app' })).toBe(false)
    expect(relayLivescoreMode({ servedFromLocalServer: true, origin: 'http://192.168.1.20:5174', override: 'https://backend.openvolley.app' })).toBe(false)
    expect(relayLivescoreMode({})).toBe(false)
  })
})

describe('relayLiveRow', () => {
  it('is a beach match_live_state row of the public fields the livescore shows', () => {
    const row = relayLiveRow('seed-1', { liveState: liveState(), ...summary('match-full-data', 'seed-1') })
    expect(row).toMatchObject({ match_id: 'seed-1', sport_type: 'beach', points_a: 7, points_b: 5, side_a: 'right', server_number: 2, challenges_used_a: 1, test: false })
    expect(row.matches).toEqual({ set_results: [{ set: 1, team1: 21, team2: 18 }] })
    for (const k of Object.keys(row)) expect([...LIVESCORE_LIVE_FIELDS, 'match_id', 'matches', 'test']).toContain(k)
  })

  it('keeps nothing else even when a message carries more', () => {
    const leaky = summary('match-full-data', 'seed-1', {
      match: { id: 1, status: 'live', gamePin: PIN, refereePin: '314159' },
      homePlayers: [{ number: 7, lastName: 'Player', dob: DOB }]
    })
    const text = JSON.stringify(relayLiveRow('seed-1', { liveState: liveState({ gamePin: PIN, dob: DOB, lineup_a: { x: 1 } }), ...leaky }))
    expect(text).not.toContain(PIN)
    expect(text).not.toContain('314159')
    expect(text).not.toContain(DOB)
    expect(text).not.toContain('Player')
    expect(text).not.toContain('lineup_a')
  })

  it('no row before the first live state, nor for an indoor match', () => {
    expect(relayLiveRow('seed-1', summary('match-full-data', 'seed-1'))).toBeNull()
    expect(relayLiveRow('seed-1', { liveState: liveState({ sport_type: 'indoor' }) })).toBeNull()
    expect(relayLiveRow('seed-1', { liveState: liveState({ sport_type: undefined }), listed: { id: 'seed-1', sportType: 'indoor' } })).toBeNull()
  })

  it('marks a rehearsal match', () => {
    expect(relayLiveRow('t', { liveState: liveState(), match: {}, listed: { test: true } }).test).toBe(true)
  })
})

describe('the relay list\'s sportType', () => {
  it('keeps beach rows and rows of an older relay without a sport', () => {
    expect(isBeachListRow({ id: 'a', sportType: 'beach' })).toBe(true)
    expect(isBeachListRow({ id: 'b' })).toBe(true)
    expect(isBeachListRow({ id: 'c', sportType: 'indoor' })).toBe(false)
  })

  it('fetchRelayLivescoreList drops the indoor courts of the relay', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, matches: [{ id: 'a', sportType: 'beach' }, { id: 'i', sportType: 'indoor' }, { id: 'old' }] }) }))
    const result = await fetchRelayLivescoreList('http://r/api/match/list?finished=1', fetchImpl)
    expect(result.matches.map(m => m.id)).toEqual(['a', 'old'])
  })
})

describe('setResultsFromSets', () => {
  it('turns finished sets (home = team1) into beach set results, in order', () => {
    expect(setResultsFromSets([
      { index: 3, home_points: 15, away_points: 13, finished: true },
      { index: 1, homePoints: 21, awayPoints: 19, finished: true },
      { index: 2, homePoints: 3, awayPoints: 1 }
    ])).toEqual([{ set: 1, team1: 21, team2: 19 }, { set: 3, team1: 15, team2: 13 }])
    expect(setResultsFromSets(null)).toEqual([])
  })

  it('the scorer\'s wire sets carry the score under the names a relay summary keeps', () => {
    const bundle = toWireBundle({ match: { seed_key: 's' }, sets: [{ index: 1, team1Points: 21, team2Points: 17, finished: true }] })
    expect(bundle.sets[0]).toMatchObject({ team1Points: 21, team2Points: 17, homePoints: 21, awayPoints: 17 })
    // what the relay keeps (SUMMARY_SET_FIELDS) is enough for the set results
    const kept = bundle.sets.map(({ index, homePoints, awayPoints, finished }) => ({ index, homePoints, awayPoints, finished }))
    expect(setResultsFromSets(kept)).toEqual([{ set: 1, team1: 21, team2: 17 }])
  })
})

describe('newerLiveState', () => {
  it('one scorer session by sequence number, otherwise by time', () => {
    expect(newerLiveState(liveState({ _seq: 5 }), liveState({ _seq: 4, points_a: 1 })).points_a).toBe(7)
    expect(newerLiveState(liveState({ _seq: 5 }), liveState({ _seq: 6, points_a: 1 })).points_a).toBe(1)
    expect(newerLiveState(null, liveState()).points_a).toBe(7)
    const a = { updated_at: '2026-10-06T18:00:00Z', points_a: 1 }
    const b = { updated_at: '2026-10-06T17:59:00Z', points_a: 2 }
    expect(newerLiveState(a, b)).toBe(a)
  })
})

describe('relayLivescoreWsUrl', () => {
  const setLocation = (url) => {
    const u = new URL(url)
    Object.defineProperty(window, 'location', {
      value: { hostname: u.hostname, protocol: u.protocol, port: u.port, origin: u.origin, host: u.host, search: '' },
      writable: true,
      configurable: true
    })
  }
  const original = window.location
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_BACKEND_URL', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('asks the page\'s relay for its WebSocket port', async () => {
    setLocation('http://192.168.1.20:5180/livescore')
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ wsPort: 8090 }) }))
    await expect(relayLivescoreWsUrl({ fetchImpl })).resolves.toBe('ws://192.168.1.20:8090')
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:5180/api/server/status')
    // No answer: the default WS port
    await expect(relayLivescoreWsUrl({ fetchImpl: async () => { throw new Error('x') } })).resolves.toBe('ws://192.168.1.20:5180')
  })

  it('asks a chosen LAN server for its port once (a ?server= link on another port)', async () => {
    setLocation('http://localhost:5191/livescore')
    setBackendOverride('http://192.168.1.20:5191')
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ wsPort: 8191 }) }))
    await expect(relayLivescoreWsUrl({ fetchImpl })).resolves.toBe('ws://192.168.1.20:8191')
    await expect(relayLivescoreWsUrl({ fetchImpl })).resolves.toBe('ws://192.168.1.20:8191')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:5191/api/server/status', expect.anything())
  })

  it('uses the chosen server of the Android app', async () => {
    setLocation('https://localhost/livescore/index.html')
    window.Capacitor = { isNativePlatform: () => true }
    try {
      setBackendOverride('http://192.168.1.20:5174')
      // The relay does not answer: OpenBeach's desktop default 5174 -> 8081
      const fetchImpl = vi.fn(async () => { throw new Error('offline') })
      await expect(relayLivescoreWsUrl({ fetchImpl })).resolves.toBe('ws://192.168.1.20:8081')
      expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:5174/api/server/status', expect.anything())
    } finally {
      delete window.Capacitor
    }
  })
})

describe('createRelayLivescoreFeed', () => {
  let sockets
  let timers
  let lists
  let changes
  let feed

  const flush = () => new Promise((r) => setTimeout(r, 0))
  function make(opts = {}) {
    sockets = []
    timers = []
    changes = []
    lists = []
    feed = createRelayLivescoreFeed({
      listMatches: vi.fn(async () => lists.shift() || { success: true, matches: [{ id: 'seed-1', homeTeam: 'Müller/Weber (CHE)', status: 'live', sportType: 'beach' }] }),
      getWsUrl: async () => 'ws://192.168.1.20:8081',
      onChange: (rows) => changes.push(rows),
      createSocket: (url) => { const s = fakeSocket(); s.url = url; sockets.push(s); return s },
      setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t },
      clearTimer: (t) => { const i = timers.indexOf(t); if (i !== -1) timers.splice(i, 1) },
      ...opts
    })
    return feed
  }
  const last = () => changes[changes.length - 1]

  it('subscribes to every listed match without a PIN and follows its score', async () => {
    const onLive = vi.fn()
    make({ onLive })
    feed.start()
    await flush()
    const ws = sockets[0]
    expect(ws.url).toBe('ws://192.168.1.20:8081')
    ws.open()
    expect(onLive).toHaveBeenLastCalledWith(true)
    const subs = ws.sent.filter((m) => m.type === 'subscribe-match')
    expect(subs[0]).toEqual({ type: 'subscribe-match', matchId: 'seed-1', device: 'livescore' })
    for (const m of ws.sent) expect(m).not.toHaveProperty('pin')

    ws.receive(summary('match-full-data', 'seed-1', { liveState: liveState() }))
    expect(last()).toHaveLength(1)
    expect(last()[0]).toMatchObject({ match_id: 'seed-1', points_a: 7, points_b: 5 })

    ws.receive({ type: 'live-state-update', matchId: 'seed-1', liveState: liveState({ points_a: 8, _seq: 11 }) })
    expect(last()[0].points_a).toBe(8)
    // An older push of the same scorer session is not applied over it
    const count = changes.length
    ws.receive({ type: 'live-state-update', matchId: 'seed-1', liveState: liveState({ points_a: 6, _seq: 9 }) })
    expect(changes).toHaveLength(count)
    expect(feed.rows()[0].points_a).toBe(8)
    // Another match's frames are ignored
    ws.receive({ type: 'live-state-update', matchId: 'other', liveState: liveState({ points_a: 1, _seq: 99 }) })
    expect(feed.rows()).toHaveLength(1)

    // A match-data-update brings the finished sets
    ws.receive(summary('match-data-update', 'seed-1', { sets: [{ index: 1, homePoints: 25, awayPoints: 21, finished: true }, { index: 2, homePoints: 25, awayPoints: 23, finished: true }] }))
    expect(last()[0].matches.set_results).toEqual([{ set: 1, team1: 25, team2: 21 }, { set: 2, team1: 25, team2: 23 }])
    expect(last()[0].points_a).toBe(8) // the live state stays

    ws.receive({ type: 'match-deleted', matchId: 'seed-1' })
    expect(last()).toEqual([])
    feed.stop()
    expect(onLive).toHaveBeenLastCalledWith(false)
  })

  it('polls the list, follows new matches and resubscribes after a reconnect', async () => {
    const onList = vi.fn()
    make({ onList })
    feed.start()
    await flush()
    const ws = sockets[0]
    ws.open()
    await flush()
    expect(onList).toHaveBeenCalledWith({ ok: true })
    // The poll timer brings a second match
    lists.push({ success: true, matches: [{ id: 'seed-1' }, { id: 7 }] })
    const poll = timers.find((t) => t.ms === 10000)
    timers.splice(timers.indexOf(poll), 1)
    poll.fn()
    await flush()
    expect(ws.sent.filter((m) => m.type === 'subscribe-match').map((m) => m.matchId)).toContain('7')

    // The relay drops: a reconnect after the backoff, every match again
    ws.drop()
    expect(feed.live).toBe(false)
    const retry = timers.find((t) => t.ms === 5000)
    expect(retry).toBeTruthy()
    timers.splice(timers.indexOf(retry), 1)
    await retry.fn()
    const again = sockets[1]
    again.open()
    expect(again.sent.filter((m) => m.type === 'subscribe-match').map((m) => m.matchId)).toEqual(['seed-1', '7'])
    for (const m of again.sent) expect(m).not.toHaveProperty('pin')

    // A failed list is reported, the followed matches stay
    lists.push({ success: false, matches: [], error: 'HTTP 502' })
    await expect(feed.refresh()).resolves.toEqual({ ok: false, error: 'HTTP 502' })
    expect(onList).toHaveBeenLastCalledWith({ ok: false, error: 'HTTP 502' })
    feed.stop()
    expect(again.close).toHaveBeenCalled()
  })

  it('replaces a socket that stops answering pings', async () => {
    make({ pingMs: 1000, pongTimeoutMs: 500 })
    feed.start()
    await flush()
    const ws = sockets[0]
    ws.open()
    const ping = timers.find((t) => t.ms === 1000)
    timers.splice(timers.indexOf(ping), 1)
    await new Promise((r) => setTimeout(r, 5)) // the ping goes out after the last message
    ping.fn()
    expect(ws.sent.some((m) => m.type === 'ping')).toBe(true)
    const pong = timers.find((t) => t.ms === 500)
    timers.splice(timers.indexOf(pong), 1)
    pong.fn() // no message since the ping
    expect(feed.live).toBe(false)
    const retry = timers.find((t) => t.ms === 0)
    await retry.fn()
    expect(sockets).toHaveLength(2)
    feed.stop()
  })

  it('never subscribes to an indoor court listed on the same relay', async () => {
    make()
    lists.push({ success: true, matches: [{ id: 'beach-1', sportType: 'beach' }, { id: 'indoor-1', sportType: 'indoor' }] })
    feed.start()
    await flush()
    const ws = sockets[0]
    ws.open()
    expect(ws.sent.filter((m) => m.type === 'subscribe-match').map((m) => m.matchId)).toEqual(['beach-1'])
    feed.stop()
  })
})
