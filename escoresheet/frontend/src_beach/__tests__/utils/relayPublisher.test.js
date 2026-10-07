import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  relayMatchKey,
  toWireMatch,
  publicWireMatch,
  toWireBundle,
  syncMatchMessage,
  generateGamePin,
  ensureGamePin,
  readLocalBundle,
  readRelayBundle,
  relayLiveState,
  liveStateMessage,
  isRelayErrorFor,
  createScorerRelay,
  createRelayMatchPublisher,
  relayReconnectDelay,
  scorerRelayUrl,
  resetScorerRelayUrl,
  WIRE_PIN_FIELDS
} from '../../utils_beach/relayPublisher_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// A Dexie match as MatchSetup_beach creates it
const localMatch = (extra = {}) => ({
  id: 3,
  seed_key: 'match_1700000000000_abc123',
  status: 'live',
  team1Id: 11,
  team2Id: 12,
  team1Name: 'Muster / Beispiel',
  team2Name: 'Rossi / Bianchi',
  gamePin: '987654',
  refereePin: '314159',
  team1Pin: '271828',
  team2Pin: '161803',
  matchPin: 'local-secret',
  refereeConnectionEnabled: true,
  team1TeamConnectionEnabled: true,
  team2TeamConnectionEnabled: false,
  game_n: 7,
  ...extra
})
const team1 = { id: 11, name: 'Muster / Beispiel', color: '#ef4444' }
const team2 = { id: 12, name: 'Rossi / Bianchi', color: '#3b82f6' }
const team1Players = [{ id: 1, teamId: 11, number: 1, lastName: 'Muster' }, { id: 2, teamId: 11, number: 2, lastName: 'Beispiel' }]
const team2Players = [{ id: 3, teamId: 12, number: 1, lastName: 'Rossi' }, { id: 4, teamId: 12, number: 2, lastName: 'Bianchi' }]
const local = (extra = {}) => ({
  match: localMatch(extra),
  team1Team: team1,
  team2Team: team2,
  team1Players,
  team2Players,
  sets: [{ index: 1, team1Points: 5, team2Points: 3, finished: false }],
  events: [{ id: 1, type: 'point', setIndex: 1, seq: 1 }]
})

describe('the wire shape: team1 = home, team2 = away', () => {
  it('relayMatchKey is the seed key, never the Dexie id', () => {
    expect(relayMatchKey(localMatch())).toBe('match_1700000000000_abc123')
    expect(relayMatchKey({ id: 1, seedKey: 'test-match-default' })).toBe('test-match-default')
    expect(relayMatchKey({ id: 1 })).toBeNull()
    expect(relayMatchKey({ id: 1, seed_key: '  ' })).toBeNull()
    expect(relayMatchKey(null)).toBeNull()
  })

  it('maps the bench PINs and connections to home/away and drops the beach names and the local PIN', () => {
    const m = toWireMatch(localMatch({ team1TeamUploadPin: '111111', connection_pins: { referee: '314159' }, game_pin: '987654' }))
    expect(m).toMatchObject({
      gamePin: '987654',
      refereePin: '314159',
      homeTeamPin: '271828',
      awayTeamPin: '161803',
      homeTeamUploadPin: '111111',
      refereeConnectionEnabled: true,
      homeTeamConnectionEnabled: true,
      awayTeamConnectionEnabled: false,
      homeTeamName: 'Muster / Beispiel',
      awayTeamName: 'Rossi / Bianchi',
      sportType: 'beach',
      seed_key: 'match_1700000000000_abc123'
    })
    for (const k of ['team1Pin', 'team2Pin', 'team1TeamUploadPin', 'matchPin', 'connection_pins', 'game_pin', 'awayTeamUploadPin']) {
      expect(k in m, k).toBe(false)
    }
  })

  it('reads the older team1TeamPin names and the database game_pin', () => {
    const m = toWireMatch({ seed_key: 's', team1TeamPin: '222222', team2TeamPin: '333333', game_pin: '444444' })
    expect(m).toMatchObject({ homeTeamPin: '222222', awayTeamPin: '333333', gamePin: '444444' })
    expect(m.team1TeamPin).toBeUndefined()
    // the referee connection is always a boolean (the referee tablets list on it)
    expect(m.refereeConnectionEnabled).toBe(false)
  })

  it('a public wire match carries no PIN at all', () => {
    const m = publicWireMatch(localMatch())
    for (const k of [...WIRE_PIN_FIELDS, 'team1Pin', 'team2Pin', 'matchPin']) expect(k in m, k).toBe(false)
    expect(m.homeTeamConnectionEnabled).toBe(true)
  })

  it('a sync is home/away only, keyed by the seed key, with the PINs for the relay', () => {
    const msg = syncMatchMessage('match_1700000000000_abc123', local(), { now: 42 })
    expect(msg.type).toBe('sync-match-data')
    expect(msg.matchId).toBe('match_1700000000000_abc123')
    expect(msg.homeTeam).toBe(team1)
    expect(msg.awayTeam).toBe(team2)
    expect(msg.homePlayers.map(p => p.lastName)).toEqual(['Muster', 'Beispiel'])
    expect(msg.awayPlayers.map(p => p.lastName)).toEqual(['Rossi', 'Bianchi'])
    expect(msg.sets).toHaveLength(1)
    expect(msg._timestamp).toBe(42)
    for (const k of ['team1Team', 'team2Team', 'team1Players', 'team2Players', 'team1', 'team2']) expect(k in msg, k).toBe(false)
    expect(msg.match.gamePin).toBe('987654')
    expect(JSON.stringify(msg).includes('local-secret')).toBe(false)
  })

  it('toWireBundle without PINs (answers for other clients)', () => {
    const b = toWireBundle(local(), { withPins: false })
    expect(b.match.gamePin).toBeUndefined()
    expect(b.match.homeTeamPin).toBeUndefined()
    expect(b.homePlayers).toHaveLength(2)
  })
})

describe('the game PIN', () => {
  it('is six digits', () => {
    for (let i = 0; i < 20; i++) expect(generateGamePin()).toMatch(/^\d{6}$/)
    expect(generateGamePin(() => 0.999999)).toBe('999999')
  })

  it('an official match keeps its own or gets one; a test match has none', () => {
    expect(ensureGamePin(localMatch())).toEqual({ gamePin: '987654', created: false })
    expect(ensureGamePin(localMatch({ gamePin: null, game_pin: '555555' }))).toEqual({ gamePin: '555555', created: false })
    expect(ensureGamePin(localMatch({ gamePin: null }), () => '123456')).toEqual({ gamePin: '123456', created: true })
    expect(ensureGamePin(localMatch({ gamePin: '', test: true }))).toEqual({ gamePin: null, created: false })
    expect(ensureGamePin(null)).toEqual({ gamePin: null, created: false })
  })
})

describe('the live state on the relay', () => {
  it('adds serve_player (the LedBox server digit) and the sport', () => {
    const s = relayLiveState({ points_a: 3, points_b: 2, server_number: 2, serving_team: 'left', side_a: 'left' })
    expect(s).toMatchObject({ points_a: 3, server_number: 2, serve_player: 2, sport_type: 'beach', serving_team: 'left' })
    expect(relayLiveState({ points_a: 0 }).serve_player).toBeNull()
    expect(liveStateMessage('k', { server_number: 1 })).toEqual({ type: 'live-state-update', matchId: 'k', liveState: { server_number: 1, serve_player: 1, sport_type: 'beach' } })
  })
})

describe('the publisher', () => {
  const fakeRelay = () => {
    const sent = []
    let open = true
    return { sent, setOpen: (v) => { open = v }, send: (p) => { if (!open) return false; sent.push(p); return true } }
  }

  it('sends nothing without a key or a socket', () => {
    const relay = fakeRelay()
    const pub = createRelayMatchPublisher({ relay })
    expect(pub.sync(null, local())).toBe(false)
    expect(pub.liveState(null, { points_a: 1 })).toBe(false)
    relay.setOpen(false)
    expect(pub.sync('k', local())).toBe(false)
    expect(relay.sent).toHaveLength(0)
  })

  it('sends the last live state again after every sync (a relay may drop it on a sync)', () => {
    const relay = fakeRelay()
    const pub = createRelayMatchPublisher({ relay, now: () => 1 })
    pub.sync('k', local())
    expect(relay.sent.map(m => m.type)).toEqual(['sync-match-data'])
    pub.liveState('k', { points_a: 4, server_number: 1 })
    pub.sync('k', local())
    expect(relay.sent.map(m => m.type)).toEqual(['sync-match-data', 'live-state-update', 'sync-match-data', 'live-state-update'])
    expect(relay.sent.at(-1)).toMatchObject({ matchId: 'k', liveState: { points_a: 4, serve_player: 1 } })
    // a live state that could not be sent is still the one resent
    relay.setOpen(false)
    pub.liveState('k', { points_a: 5 })
    relay.setOpen(true)
    pub.sync('k', local())
    expect(relay.sent.at(-1).liveState.points_a).toBe(5)
    // another court's match is its own
    pub.sync('other', local({ seed_key: 'other' }))
    expect(relay.sent.at(-1).type).toBe('sync-match-data')
  })

  it('never sends clear-all-matches; removing a match deletes only its own room', () => {
    const relay = fakeRelay()
    const pub = createRelayMatchPublisher({ relay })
    pub.liveState('k', { points_a: 1 })
    pub.remove('k')
    expect(relay.sent.at(-1)).toEqual({ type: 'delete-match', matchId: 'k' })
    expect(pub.lastLiveState('k')).toBeNull()
    expect(relay.sent.some(m => m.type === 'clear-all-matches')).toBe(false)
  })

  it('answers the relay\'s requests in the wire shape', () => {
    const relay = fakeRelay()
    const pub = createRelayMatchPublisher({ relay })
    pub.answer({ type: 'match-data-request', requestId: 'r1', matchId: 'k' }, 'k', local())
    expect(relay.sent.at(-1)).toMatchObject({ type: 'match-data-response', requestId: 'r1', matchId: 'k', success: true })
    expect(relay.sent.at(-1).data.homePlayers).toHaveLength(2)
    expect(relay.sent.at(-1).data.match.homeTeamPin).toBe('271828')
    pub.answer({ type: 'match-data-request', requestId: 'r2', matchId: 'other' }, 'k', local())
    expect(relay.sent.at(-1)).toMatchObject({ requestId: 'r2', success: false })

    pub.answer({ type: 'game-number-request', requestId: 'r3', gameNumber: '7' }, 'k', local())
    const found = relay.sent.at(-1)
    expect(found).toMatchObject({ type: 'game-number-response', requestId: 'r3', success: true, matchId: 'k' })
    for (const f of WIRE_PIN_FIELDS) expect(found.match[f], f).toBeUndefined()
    pub.answer({ type: 'game-number-request', requestId: 'r4', gameNumber: '8' }, 'k', local())
    expect(relay.sent.at(-1)).toMatchObject({ requestId: 'r4', success: false })
    expect(pub.answer({ type: 'pin-validation-request', requestId: 'r5' }, 'k', local())).toBe(false)
  })

  it('recognises relay errors about this match only', () => {
    const ids = [3, 'match_1700000000000_abc123']
    expect(isRelayErrorFor({ type: 'error', code: 'not-match-owner', matchId: 'match_1700000000000_abc123' }, ids)).toBe(true)
    expect(isRelayErrorFor({ type: 'error', message: 'x' }, ids)).toBe(true)
    expect(isRelayErrorFor({ type: 'error', matchId: 'match_other' }, ids)).toBe(false)
    expect(isRelayErrorFor({ type: 'pong' }, ids)).toBe(false)
  })
})

describe('reading the local bundle', () => {
  let db
  let saved
  beforeEach(async () => {
    saved = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    db = new Dexie(`relay-bundle-${Math.random()}`)
    db.version(1).stores({ matches: '++id', teams: '++id', players: '++id, teamId', sets: '++id, matchId', events: '++id, matchId' })
    await db.open()
  })
  afterEach(() => {
    db.close()
    Object.assign(Dexie.dependencies, saved)
  })

  it('takes the match, both teams with their players, sets by index and events', async () => {
    const t1 = await db.teams.add({ name: 'A' })
    const t2 = await db.teams.add({ name: 'B' })
    await db.players.bulkAdd([{ teamId: t1, number: 1 }, { teamId: t1, number: 2 }, { teamId: t2, number: 1 }])
    const id = await db.matches.add({ seed_key: 'match_x', team1Id: t1, team2Id: t2 })
    await db.sets.bulkAdd([{ matchId: id, index: 2 }, { matchId: id, index: 1 }, { matchId: id + 1, index: 1 }])
    await db.events.add({ matchId: id, type: 'point' })
    const b = await readLocalBundle(db, id)
    expect(b.team1Team.name).toBe('A')
    expect(b.team2Team.name).toBe('B')
    expect(b.team1Players).toHaveLength(2)
    expect(b.team2Players).toHaveLength(1)
    expect(b.sets.map(s => s.index)).toEqual([1, 2])
    expect(b.events).toHaveLength(1)
    expect(await readLocalBundle(db, 999)).toBeNull()
  })

  it('readRelayBundle gives an official match without a game PIN one, once, and keys it by its seed', async () => {
    const id = await db.matches.add({ seed_key: 'match_y', gamePin: null })
    const first = await readRelayBundle(db, id, { generate: () => '424242' })
    expect(first.key).toBe('match_y')
    expect(first.local.match.gamePin).toBe('424242')
    expect((await db.matches.get(id)).gamePin).toBe('424242')
    const again = await readRelayBundle(db, id, { generate: () => '000000' })
    expect(again.local.match.gamePin).toBe('424242')
    const testId = await db.matches.add({ seedKey: 'test-match-default', test: true })
    const test = await readRelayBundle(db, testId, { generate: () => '111111' })
    expect(test.key).toBe('test-match-default')
    expect(test.local.match.gamePin).toBeUndefined()
    expect(await readRelayBundle(db, 999)).toBeNull()
  })
})

describe('the scorer\'s one relay connection (App + Scoreboard)', () => {
  class FakeSocket {
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.sent = []
      this.closed = null
    }
    send(text) { this.sent.push(JSON.parse(text)) }
    close(code) {
      this.readyState = 3
      this.closed = code
      this.onclose?.({ code })
    }
    open() {
      this.readyState = 1
      this.onopen?.()
    }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }) }
    drop() {
      this.readyState = 3
      this.onclose?.({ code: 1006 })
    }
  }
  let sockets
  let events
  const make = (opts = {}) => {
    sockets = []
    events = new EventTarget()
    return createScorerRelay({
      createSocket: (url) => {
        const s = new FakeSocket(url)
        sockets.push(s)
        return s
      },
      events,
      doc: null,
      ...opts
    })
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('App and Scoreboard share one socket; a relay request gets one answer', async () => {
    const relay = make()
    const app = { onOpen: vi.fn(), onMessage: vi.fn() }
    const board = { onOpen: vi.fn(), onMessage: vi.fn() }
    const detachApp = relay.attach('wss://relay', app)
    sockets[0].open()
    expect(app.onOpen).toHaveBeenCalledTimes(1)
    const detachBoard = relay.attach('wss://relay', board)
    await Promise.resolve()
    expect(sockets).toHaveLength(1)
    expect(board.onOpen).toHaveBeenCalledWith(sockets[0])

    sockets[0].receive({ type: 'error', code: 'not-match-owner', matchId: 'k' })
    expect(app.onMessage).toHaveBeenCalledTimes(1)
    expect(board.onMessage).toHaveBeenCalledTimes(1)
    sockets[0].receive({ type: 'match-data-request', requestId: 'r1', matchId: 'k' })
    expect(board.onMessage).toHaveBeenCalledTimes(2)
    expect(app.onMessage).toHaveBeenCalledTimes(1)

    // The Scoreboard leaving (a sub-view) keeps the socket for App
    detachBoard()
    vi.runOnlyPendingTimers()
    expect(sockets[0].closed).toBeNull()
    sockets[0].receive({ type: 'game-number-request', requestId: 'r2' })
    expect(app.onMessage).toHaveBeenCalledTimes(2)

    // An effect re-run (detach + attach in one commit) keeps it too
    detachApp()
    const detachAgain = relay.attach('wss://relay', app)
    vi.runOnlyPendingTimers()
    expect(sockets[0].closed).toBeNull()
    expect(sockets).toHaveLength(1)

    // The last one leaving closes it, without a word to the relay
    detachAgain()
    vi.runOnlyPendingTimers()
    expect(sockets[0].closed).toBe(1000)
    expect(sockets[0].sent.some(m => m.type === 'clear-all-matches')).toBe(false)
    expect(relay.send({ type: 'ping' })).toBe(false)
  })

  it('reconnects with backoff, at once when back online, and re-runs every onOpen (the publisher syncs again)', () => {
    const relay = make()
    const app = { onOpen: vi.fn() }
    relay.attach('wss://relay', app)
    sockets[0].open()
    sockets[0].drop()
    vi.advanceTimersByTime(4999)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
    sockets[1].drop()
    events.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(3)
    sockets[2].open()
    expect(app.onOpen).toHaveBeenCalledTimes(2)
    expect(app.onOpen).toHaveBeenLastCalledWith(sockets[2])
  })

  it('replaces a socket that stops answering pings (Wi-Fi without uplink keeps it OPEN)', () => {
    const relay = make({ pingIntervalMs: 1000, pongTimeoutMs: 500 })
    relay.attach('wss://relay', {})
    sockets[0].open()
    vi.advanceTimersByTime(1000)
    expect(sockets[0].sent.at(-1).type).toBe('ping')
    sockets[0].receive({ type: 'pong' })
    vi.advanceTimersByTime(500)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1500) // next ping, no answer
    expect(sockets[0].closed).toBe(4000)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
  })

  it('moves to another relay URL (the local server\'s WS port is known now)', () => {
    const relay = make()
    relay.attach('ws://host:8080', {})
    sockets[0].open()
    relay.attach('ws://host:8081', {})
    expect(sockets[0].closed).toBe(1000)
    expect(sockets[1].url).toBe('ws://host:8081')
    expect(relay.url).toBe('ws://host:8081')
  })

  it('the publisher on a real connection: sync then live state, nothing while closed', () => {
    const relay = make()
    const pub = createRelayMatchPublisher({ relay, now: () => 7 })
    relay.attach('wss://relay', { onOpen: () => pub.sync('k', local()) })
    expect(pub.liveState('k', { points_a: 1 })).toBe(false) // not open yet: remembered
    sockets[0].open()
    expect(sockets[0].sent.map(m => m.type)).toEqual(['sync-match-data', 'live-state-update'])
    expect(sockets[0].sent[1].liveState.points_a).toBe(1)
  })

  it('backs off from 5 s to a 60 s cap', () => {
    expect([0, 1, 2, 3, 4, 5].map(relayReconnectDelay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000])
  })
})

describe('scorerRelayUrl (App and Scoreboard attach to the same url)', () => {
  const realLocation = window.location
  beforeEach(() => {
    useMemoryLocalStorage()
    vi.stubEnv('VITE_BACKEND_URL', '')
    vi.stubEnv('DEV', false)
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', protocol: 'http:', port: '5174', origin: 'http://localhost:5174', host: 'localhost:5174' },
      writable: true,
      configurable: true
    })
  })
  afterEach(() => {
    resetScorerRelayUrl()
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
  })

  it('the desktop window publishes on 8081; a port the relay named is remembered across remounts', () => {
    expect(scorerRelayUrl()).toBe('ws://localhost:8081')
    const withPort = scorerRelayUrl({ wsPort: 8181 })
    expect(withPort).toBe('ws://localhost:8181')
    expect(scorerRelayUrl()).toBe(withPort)
  })
})
