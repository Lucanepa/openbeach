/**
 * Two beach courts on ONE venue relay (OpenVolley's Node server in --local
 * mode, no internet, no database), opt-in:
 *
 *   OB_RELAY_BACKEND_DIR=<openvolley>/escoresheet/backend \
 *     npx vitest run src_beach/__tests__/integration/venueRelay.integration.test.js
 *
 * starts `node server.js --local` from that directory on a free port and
 * stops it afterwards; or OB_RELAY_URL=http://127.0.0.1:<port> uses a relay
 * that is already running. Skipped without either.
 *
 * Two simulated scorers publish their match with the real client code
 * (relayPublisher_beach on its own socket each, the match read from Dexie on
 * fake-indexeddb); a referee uses serverDataSync_beach like the referee app.
 * Checks: the relay lists both courts; the referee's PIN gets the rosters of
 * its court only; no PIN leaves the relay; live-state-update (serve_player)
 * reaches the referee of that court, and comes again after a sync; scorers
 * never clear each other's match.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'

const RELAY_DIR = process.env.OB_RELAY_BACKEND_DIR || ''
const RELAY_URL_ENV = process.env.OB_RELAY_URL || ''
const relay = { base: RELAY_URL_ENV, child: null }

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  isBackendAvailable: () => false, // no cloud at this venue
  getApiUrl: (p) => `${relay.base}${p.startsWith('/') ? p : `/${p}`}`,
  getCloudApiUrl: () => null,
  getBackendUrl: () => relay.base,
  getRelayWebSocketUrl: () => relay.base.replace(/^http/, 'ws'),
  getWebSocketUrl: () => relay.base.replace(/^http/, 'ws'),
  getCloudWebSocketUrl: () => null
}))
// The referee's cloud reads: none at this venue
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: vi.fn(() => { throw new Error('no cloud at the venue') }) }))

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer()
  srv.on('error', reject)
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address()
    srv.close(() => resolve(port))
  })
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, what, timeoutMs = 5000) {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}
const pin = () => String(100000 + Math.floor(Math.random() * 800000))

describe.skipIf(!RELAY_DIR && !RELAY_URL_ENV)('two beach courts on one venue relay (Node --local)', () => {
  let NodeWebSocket, db, pub, sync, savedDeps
  const courts = {}
  const scorers = []

  beforeAll(async () => {
    if (!relay.base) {
      const port = await freePort()
      const env = { ...process.env, PORT: String(port), OV_PIN_SECRET: randomBytes(36).toString('base64url') }
      for (const k of ['DATABASE_URL', 'IS_CLOUD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'POCKETBASE_URL']) delete env[k]
      relay.child = spawn(process.execPath, ['server.js', '--local'], { cwd: RELAY_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
      relay.output = []
      relay.child.stdout.on('data', (d) => relay.output.push(String(d)))
      relay.child.stderr.on('data', (d) => relay.output.push(String(d)))
      relay.base = `http://127.0.0.1:${port}`
      await waitFor(async () => {
        try { return (await fetch(`${relay.base}/api/server/status`)).ok } catch { return false }
      }, 'the relay', 15000)
    }
    ;({ WebSocket: NodeWebSocket } = await import('ws'))
    const store = new Map()
    const ls = window.localStorage
    ls.getItem.mockImplementation((k) => (store.has(k) ? store.get(k) : null))
    ls.setItem.mockImplementation((k, v) => { store.set(k, String(v)) })
    ls.removeItem.mockImplementation((k) => { store.delete(k) })
    savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    ;({ db } = await import('../../db_beach/db_beach'))
    pub = await import('../../utils_beach/relayPublisher_beach')
    sync = await import('../../utils_beach/serverDataSync_beach')

    // Two courts as MatchSetup_beach creates them (one scorer device each)
    for (const [court, t1, t2] of [['1', ['Muster', 'Beispiel'], ['Rossi', 'Bianchi']], ['2', ['Keller', 'Huber'], ['Dubois', 'Martin']]]) {
      const team1Id = await db.teams.add({ name: t1.join(' / '), color: '#ef4444' })
      const team2Id = await db.teams.add({ name: t2.join(' / '), color: '#3b82f6' })
      await db.players.bulkAdd([
        { teamId: team1Id, number: 1, lastName: t1[0], firstName: 'A', dob: '2001-05-06' },
        { teamId: team1Id, number: 2, lastName: t1[1], firstName: 'B' },
        { teamId: team2Id, number: 1, lastName: t2[0], firstName: 'C' },
        { teamId: team2Id, number: 2, lastName: t2[1], firstName: 'D' }
      ])
      const c = {
        seed: `match_${Date.now()}_court${court}${Math.random().toString(36).slice(2, 6)}`,
        gamePin: pin(), refereePin: pin(), team1Pin: pin(), team2Pin: pin(), matchPin: `local-${court}-${pin()}`
      }
      c.id = await db.matches.add({
        seed_key: c.seed, status: 'live', court, team1Id, team2Id,
        team1Name: t1.join(' / '), team2Name: t2.join(' / '),
        gamePin: c.gamePin, refereePin: c.refereePin, team1Pin: c.team1Pin, team2Pin: c.team2Pin, matchPin: c.matchPin,
        refereeConnectionEnabled: true, team1TeamConnectionEnabled: true, team2TeamConnectionEnabled: false,
        game_n: Number(court) + 10, scheduledAt: new Date().toISOString()
      })
      await db.sets.add({ matchId: c.id, index: 1, team1Points: 0, team2Points: 0, finished: false })
      courts[court] = c
    }
  }, 30000)

  afterAll(async () => {
    for (const s of scorers) s.detach?.()
    await sleep(50)
    db?.close()
    if (savedDeps) Object.assign(Dexie.dependencies, savedDeps)
    if (relay.child) {
      relay.child.kill('SIGTERM')
      await new Promise((r) => { relay.child.once('exit', r); setTimeout(r, 3000) })
    }
  })

  // A scorer device: its own relay connection and publisher, the real code
  async function startScorer(court) {
    const c = courts[court]
    const conn = pub.createScorerRelay({ createSocket: (url) => new NodeWebSocket(url), events: null, doc: null })
    const publisher = pub.createRelayMatchPublisher({ relay: conn })
    const errors = []
    const scorer = { court, conn, publisher, errors, opens: 0 }
    const syncNow = async () => {
      const bundle = await pub.readRelayBundle(db, c.id)
      return publisher.sync(bundle.key, bundle.local)
    }
    scorer.sync = syncNow
    scorer.detach = conn.attach(relay.base.replace(/^http/, 'ws'), {
      onOpen: () => { scorer.opens++; syncNow() },
      onMessage: (m) => { if (m.type === 'error') errors.push(m) }
    })
    scorers.push(scorer)
    await waitFor(() => conn.isOpen() && scorer.opens > 0, `scorer ${court} connected`)
    return scorer
  }

  const listed = async () => (await (await fetch(`${relay.base}/api/match/list`)).json()).matches || []

  it('both scorers publish; the relay lists both courts, in openbeach\'s shape for the referee list', async () => {
    await startScorer('1')
    await startScorer('2')
    const rows = await waitFor(async () => {
      const r = await listed()
      return r.some(m => m.id === courts['1'].seed) && r.some(m => m.id === courts['2'].seed) ? r : null
    }, 'both matches listed')
    const raw = rows.find(m => m.id === courts['1'].seed)
    expect(raw).toMatchObject({ homeTeam: 'Muster / Beispiel', awayTeam: 'Rossi / Bianchi', refereeConnectionEnabled: true, homeTeamConnectionEnabled: true, awayTeamConnectionEnabled: false })
    const viaClient = await sync.listAvailableMatches()
    expect(viaClient.success).toBe(true)
    const row2 = viaClient.matches.find(m => m.id === courts['2'].seed)
    expect(row2).toMatchObject({ team1Name: 'Keller / Huber', team2Name: 'Dubois / Martin' })
    // a game number per court, never a PIN
    const text = JSON.stringify(rows)
    for (const c of Object.values(courts)) for (const p of [c.gamePin, c.refereePin, c.team1Pin, c.team2Pin, c.matchPin]) expect(text.includes(p)).toBe(false)
    for (const s of scorers) expect(s.errors).toEqual([])
  })

  it('the referee PIN of court 1 opens court 1 with both rosters; no PIN in the bundle', async () => {
    const c = courts['1']
    const wrong = await sync.validatePin('000001', 'referee').catch((e) => ({ success: false, error: e.message }))
    expect(wrong.success).toBe(false)
    // court 2's bench PIN for team 2 is off: no match for it
    const off = await sync.validatePin(courts['2'].team2Pin, 'awayTeam').catch((e) => ({ success: false, error: e.message }))
    expect(off.success).toBe(false)

    const ok = await sync.validatePin(c.refereePin, 'referee')
    expect(ok.success, ok.error).toBe(true)
    expect(ok.match.id).toBe(c.seed)
    const got = await sync.getMatchData(c.seed)
    expect(got.success, got.error).toBe(true)
    expect(got.access).toBe('full')
    expect(got.team1.name).toBe('Muster / Beispiel')
    expect(got.team2.name).toBe('Rossi / Bianchi')
    expect(got.team1Players.map(p => p.lastName)).toEqual(['Muster', 'Beispiel'])
    expect(got.team2Players).toHaveLength(2)
    const text = JSON.stringify(got)
    for (const p of [c.gamePin, c.refereePin, c.team1Pin, c.team2Pin, c.matchPin]) expect(text.includes(p), p).toBe(false)
    for (const k of ['homeTeamPin', 'awayTeamPin', 'refereePin', 'gamePin', 'team1Pin', 'matchPin']) expect(text.includes(`"${k}"`), k).toBe(false)
    expect(text.includes('2001-05-06')).toBe(false) // no dates of birth either
  })

  it('the referee follows court 1 live: the bundle, then live-state-update with serve_player, never court 2', async () => {
    const c1 = courts['1']
    const [s1, s2] = scorers
    vi.stubGlobal('WebSocket', NodeWebSocket)
    const received = []
    const unsubscribe = sync.subscribeToMatchData(c1.seed, (d) => received.push(d))
    // A raw subscriber on court 1 too, to see every byte the relay sends
    const raw = new NodeWebSocket(relay.base.replace(/^http/, 'ws'))
    const rawMessages = []
    raw.on('message', (b) => rawMessages.push(String(b)))
    await new Promise((r) => raw.once('open', r))
    raw.send(JSON.stringify({ type: 'subscribe-match', matchId: c1.seed, pin: c1.refereePin }))
    try {
      const first = await waitFor(() => received.find(d => d?.match && d.team1Players?.length === 2), 'full bundle')
      expect(first.team2Players.map(p => p.lastName)).toEqual(['Rossi', 'Bianchi'])

      // A point on court 1, as Scoreboard_beach publishes it
      await db.sets.where('matchId').equals(c1.id).modify({ team1Points: 1 })
      await s1.sync()
      s1.publisher.liveState(c1.seed, { match_id: c1.seed, points_a: 1, points_b: 0, sets_won_a: 0, sets_won_b: 0, side_a: 'left', serving_team: 'left', server_number: 2, team_a_name: 'Muster / Beispiel', team_b_name: 'Rossi / Bianchi', timeouts_a: [], timeouts_b: [] })
      const live = await waitFor(() => received.find(d => d?._liveState?.points_a === 1), 'live state')
      expect(live._liveState).toMatchObject({ serve_player: 2, server_number: 2, sport_type: 'beach', serving_team: 'left' })
      await waitFor(() => received.find(d => d?.sets?.[0]?.team1Points === 1), 'the point in the bundle')

      // A point on court 2 never reaches court 1's referee
      s2.publisher.liveState(courts['2'].seed, { points_a: 7, points_b: 7, server_number: 1 })
      await sleep(300)
      expect(received.some(d => d?._liveState?.points_a === 7)).toBe(false)

      // The next sync of court 1 brings its live state again (a relay may drop it on a sync)
      const before = received.filter(d => d?._liveState).length
      await s1.sync()
      await waitFor(() => received.filter(d => d?._liveState).length > before, 'live state after the sync')

      // Nothing the relay sent to the referee carries a PIN
      await waitFor(() => rawMessages.some(m => m.includes('live-state-update')), 'raw live state')
      const all = rawMessages.join('\n')
      for (const c of Object.values(courts)) for (const p of [c.gamePin, c.refereePin, c.team1Pin, c.team2Pin, c.matchPin]) expect(all.includes(p), p).toBe(false)
      expect(all.includes('homeTeamPin')).toBe(false)
      expect(all.includes('"type":"match-data-update"') || all.includes('"type":"match-full-data"')).toBe(true)
    } finally {
      unsubscribe()
      raw.close()
      vi.unstubAllGlobals()
    }
  }, 20000)

  it('a wrong PIN on the relay socket gets the summary only, no rosters', async () => {
    const c = courts['2']
    const ws = new NodeWebSocket(relay.base.replace(/^http/, 'ws'))
    const msgs = []
    ws.on('message', (b) => msgs.push(JSON.parse(String(b))))
    await new Promise((r) => ws.once('open', r))
    ws.send(JSON.stringify({ type: 'subscribe-match', matchId: c.seed, pin: '000002' }))
    try {
      const data = await waitFor(() => msgs.find(m => m.type === 'match-full-data'), 'summary')
      expect(data.access).not.toBe('full')
      expect(JSON.stringify(data).includes('Keller')).toBe(true) // the pair's name is public
      expect(data.homePlayers?.length ?? 0).toBe(0)
      expect(msgs.some(m => m.type === 'error' && m.code === 'pin-invalid')).toBe(true)
    } finally {
      ws.close()
    }
  })

  it('a scorer reconnecting re-syncs its match and never clears the other court', async () => {
    const [s1] = scorers
    const opensBefore = s1.opens
    s1.conn.socket.close() // the Wi-Fi drops
    s1.conn.reconnectNow()
    await waitFor(() => s1.opens > opensBefore && s1.conn.isOpen(), 'reconnect', 15000)
    const rows = await waitFor(async () => {
      const r = await listed()
      return r.some(m => m.id === courts['1'].seed) && r.some(m => m.id === courts['2'].seed) ? r : null
    }, 'both still listed')
    expect(rows.filter(m => [courts['1'].seed, courts['2'].seed].includes(m.id))).toHaveLength(2)
    for (const s of scorers) expect(s.errors).toEqual([])
  }, 20000)

  it('deleting court 2\'s match removes only court 2', async () => {
    const [, s2] = scorers
    s2.publisher.remove(courts['2'].seed)
    await waitFor(async () => !(await listed()).some(m => m.id === courts['2'].seed), 'court 2 gone')
    expect((await listed()).some(m => m.id === courts['1'].seed)).toBe(true)
  })
})
