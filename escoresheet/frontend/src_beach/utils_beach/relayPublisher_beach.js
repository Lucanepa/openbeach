/**
 * The scorer's side of the match relay, kept out of the 18k-line scoring
 * screen so it can be tested: the one relay connection App_beach and
 * Scoreboard_beach share, the wire shape of a sync (team1/team2 -> home/away,
 * the PIN fields), the live state the referee / livescore / LedBox read, and
 * how long to wait before reconnecting.
 *
 * Every relay (the cloud, OpenVolley's Node venue server, the Tauri and
 * Electron desktop relays, the Pi) speaks home/away: homeTeam / awayTeam /
 * homePlayers / awayPlayers, homeTeamPin / awayTeamPin, ...ConnectionEnabled.
 * openbeach's team1 is home, team2 is away. With that mapping done here, every
 * relay keeps the teams and strips the PINs without knowing openbeach's names.
 *
 * Ported in part from OpenVolley escoresheet/frontend/src/utils/relayPublisher.js
 * (createScorerRelay, relayReconnectDelay, isRelayErrorFor).
 */
import { getRelayWebSocketUrl } from './backendConfig_beach'

export const SPORT_TYPE = 'beach'

let knownScorerWsPort = null

/**
 * The relay URL of the scorer page: App_beach and Scoreboard_beach both take it
 * from here, so they attach the shared connection to the SAME url. The local
 * relay's WS port, once learnt (its /api/server/status), is remembered: a
 * Scoreboard remount starts without a status and would otherwise attach to
 * the default-port URL and drop the socket.
 * @param {{ wsPort?: number|string|null }} [options]
 * @returns {string|null}
 */
export function scorerRelayUrl({ wsPort = null } = {}) {
  if (wsPort) knownScorerWsPort = wsPort
  return getRelayWebSocketUrl({ wsPort: wsPort || knownScorerWsPort })
}

/** Tests only: forget the remembered WS port. */
export function resetScorerRelayUrl() {
  knownScorerWsPort = null
}

// ---------------------------------------------------------------------------
// The wire shape
// ---------------------------------------------------------------------------

/**
 * The relay room key of a scorer's match: its seed_key (what the tablets know
 * from the PIN check and the match list), or a test match's seedKey. Null
 * while the match has none: a Dexie id is no key (every device's first match
 * is id 1, so scorers met in room '1').
 * @param {object|null} match
 * @returns {string|null}
 */
export function relayMatchKey(match) {
  for (const seed of [match?.seed_key, match?.seedKey]) {
    if (typeof seed === 'string' && seed.trim()) return seed.trim()
  }
  return null
}

// openbeach's PIN / connection fields -> the relay's home/away names. The
// first non-empty source wins (older builds wrote team1TeamPin).
const PIN_MAP = Object.freeze([
  ['homeTeamPin', ['team1Pin', 'team1TeamPin']],
  ['awayTeamPin', ['team2Pin', 'team2TeamPin']],
  ['homeTeamUploadPin', ['team1UploadPin', 'team1TeamUploadPin']],
  ['awayTeamUploadPin', ['team2UploadPin', 'team2TeamUploadPin']]
])
const CONNECTION_MAP = Object.freeze([
  ['homeTeamConnectionEnabled', 'team1TeamConnectionEnabled'],
  ['awayTeamConnectionEnabled', 'team2TeamConnectionEnabled']
])
// Never on the wire: openbeach's own PIN names (sent under home/away instead),
// the local match PIN that protects the match on this device, and the
// database copies of the PINs.
const NEVER_RELAYED = Object.freeze([
  'team1Pin', 'team2Pin', 'team1TeamPin', 'team2TeamPin',
  'team1UploadPin', 'team2UploadPin', 'team1TeamUploadPin', 'team2TeamUploadPin',
  'matchPin', 'game_pin', 'connection_pins', 'connectionPins'
])
// Every PIN a wire match may carry (stripped by every relay before a client
// sees the match; publicWireMatch leaves them out altogether)
export const WIRE_PIN_FIELDS = Object.freeze(['gamePin', 'refereePin', 'homeTeamPin', 'awayTeamPin', 'homeTeamUploadPin', 'awayTeamUploadPin'])

const pinText = (v) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s || null
}

/**
 * The match object of a sync in the relay's names (see the file comment):
 * the bench PINs and connections under home/away, the team names as
 * homeTeamName / awayTeamName, the game PIN as gamePin, the referee connection
 * as a boolean (it lists the match for the referee tablets), and
 * sportType 'beach' (the relays keep the sport of the room). openbeach's own
 * PIN names, the local match PIN and the database PIN copies are dropped.
 * @param {object} match  the Dexie match
 * @returns {object}
 */
export function toWireMatch(match) {
  const src = match && typeof match === 'object' ? match : {}
  const out = { ...src }
  for (const k of NEVER_RELAYED) delete out[k]
  for (const [wire, sources] of PIN_MAP) {
    const v = sources.map((k) => pinText(src[k])).find(Boolean) ?? pinText(src[wire])
    if (v) out[wire] = v
    else delete out[wire]
  }
  for (const [wire, local] of CONNECTION_MAP) {
    out[wire] = src[local] === true || src[wire] === true
  }
  out.refereeConnectionEnabled = src.refereeConnectionEnabled === true
  const gamePin = pinText(src.gamePin) ?? pinText(src.game_pin)
  if (gamePin) out.gamePin = gamePin
  else delete out.gamePin
  const refereePin = pinText(src.refereePin)
  if (refereePin) out.refereePin = refereePin
  else delete out.refereePin
  if (src.team1Name && !out.homeTeamName) out.homeTeamName = src.team1Name
  if (src.team2Name && !out.awayTeamName) out.awayTeamName = src.team2Name
  out.sportType = SPORT_TYPE
  return out
}

/** A wire match without any PIN (answers a relay hands to other clients). */
export function publicWireMatch(match) {
  const out = toWireMatch(match)
  for (const k of WIRE_PIN_FIELDS) delete out[k]
  return out
}

/**
 * The bundle of a sync in the relay's names: home = team1, away = team2.
 * @param {{ match: object, team1Team?: object|null, team2Team?: object|null,
 *   team1Players?: object[], team2Players?: object[], sets?: object[], events?: object[] }} local
 * @param {{ withPins?: boolean }} [options]  false: a match without PINs
 */
export function toWireBundle({ match, team1Team = null, team2Team = null, team1Players = [], team2Players = [], sets = [], events = [] }, { withPins = true } = {}) {
  return {
    match: withPins ? toWireMatch(match) : publicWireMatch(match),
    homeTeam: team1Team || null,
    awayTeam: team2Team || null,
    homePlayers: Array.isArray(team1Players) ? team1Players : [],
    awayPlayers: Array.isArray(team2Players) ? team2Players : [],
    sets: Array.isArray(sets) ? sets : [],
    events: Array.isArray(events) ? events : []
  }
}

/**
 * The sync-match-data message of a match: the room key as matchId, the wire
 * bundle with its PINs (the relay proves the scorer with the game PIN and
 * checks the referee / bench PINs against the stored ones; it never hands
 * them out).
 * @param {string} key  relayMatchKey of the match
 * @param {object} local  see toWireBundle
 * @param {{ now?: number }} [options]
 */
export function syncMatchMessage(key, local, { now = Date.now() } = {}) {
  return { type: 'sync-match-data', matchId: key, ...toWireBundle(local), _timestamp: now }
}

/**
 * A new 6-digit game PIN. The relays only let the socket that proved the
 * match's game PIN write to it (anti-hijack): a synced official match must
 * have one.
 * @param {() => number} [random]
 */
export function generateGamePin(random = Math.random) {
  let pin = ''
  for (let i = 0; i < 6; i++) pin += String(Math.floor(random() * 10) % 10)
  return pin
}

/**
 * The game PIN a sync of this match carries: its own, or a new one when the
 * match has none yet (the caller stores it). A test match gets one too: its
 * per-device relay room is then writable only by the socket that proved it,
 * like an official match's (it is never sent to the cloud).
 * @param {object} match
 * @param {() => string} [generate]
 * @returns {{ gamePin: string|null, created: boolean }}
 */
export function ensureGamePin(match, generate = generateGamePin) {
  if (!match) return { gamePin: null, created: false }
  const own = pinText(match.gamePin) ?? pinText(match.game_pin)
  if (own) return { gamePin: own, created: false }
  return { gamePin: generate(), created: true }
}

/**
 * Reads what a sync of the match sends from IndexedDB (fresh, not React
 * state): the match, both teams and their players, the sets and the events.
 * @param {import('dexie').Dexie} db
 * @param {number} matchId  the local (Dexie) id
 * @returns {Promise<object|null>} the local bundle (see toWireBundle), null without the match
 */
export async function readLocalBundle(db, matchId) {
  const match = await db.matches.get(matchId)
  if (!match) return null
  const team1Id = match.team1Id || match.team1TeamId
  const team2Id = match.team2Id || match.team2TeamId
  const [team1Team, team2Team, sets, events, team1Players, team2Players] = await Promise.all([
    team1Id ? db.teams.get(team1Id) : null,
    team2Id ? db.teams.get(team2Id) : null,
    db.sets.where('matchId').equals(matchId).toArray(),
    db.events.where('matchId').equals(matchId).toArray(),
    team1Id ? db.players.where('teamId').equals(team1Id).toArray() : [],
    team2Id ? db.players.where('teamId').equals(team2Id).toArray() : []
  ])
  return {
    match,
    team1Team: team1Team || null,
    team2Team: team2Team || null,
    team1Players: team1Players || [],
    team2Players: team2Players || [],
    sets: (sets || []).sort((a, b) => (a.index || 0) - (b.index || 0)),
    events: events || []
  }
}

/**
 * The local bundle a sync publishes (readLocalBundle), with its relay key.
 * A match without a game PIN (an official or a test match) gets one first, stored on the match:
 * the relays only let the socket that proved it write to the room, and the
 * next sync must carry the same one.
 * @param {import('dexie').Dexie} db
 * @param {number} matchId
 * @param {{ generate?: () => string }} [options]
 * @returns {Promise<{ key: string|null, local: object }|null>}
 */
export async function readRelayBundle(db, matchId, { generate = generateGamePin } = {}) {
  const local = await readLocalBundle(db, matchId)
  if (!local) return null
  const { gamePin, created } = ensureGamePin(local.match, generate)
  if (created) {
    await db.matches.update(matchId, { gamePin })
    local.match = { ...local.match, gamePin }
  }
  return { key: relayMatchKey(local.match), local }
}

/**
 * The live state the relay carries to the referee, the livescore and the
 * LedBox bridge (point-hub reads serve_player for the server digit). Built
 * from the scorer's local broadcast (team A / B, sides, points, sets won,
 * timeouts used, serving side, server number).
 * @param {object} state
 * @returns {object}
 */
export function relayLiveState(state) {
  const s = state && typeof state === 'object' ? state : {}
  return {
    ...s,
    sport_type: SPORT_TYPE,
    serve_player: s.serve_player ?? s.server_number ?? null
  }
}

/** The live-state-update message of a match. */
export function liveStateMessage(key, liveState) {
  return { type: 'live-state-update', matchId: key, liveState: relayLiveState(liveState) }
}

/**
 * True for a relay `error` message about this match: it names one of `ids`
 * (the relay key or the local id), or names none at all.
 */
export function isRelayErrorFor(message, ids) {
  if (!message || message.type !== 'error') return false
  if (message.matchId === undefined || message.matchId === null) return true
  const id = String(message.matchId)
  return ids.some((k) => k !== undefined && k !== null && String(k) === id)
}

// ---------------------------------------------------------------------------
// The connection
// ---------------------------------------------------------------------------

const WS_CONNECTING = 0
const WS_OPEN = 1
const isRelayRequest = (message) => typeof message?.type === 'string' && message.type.endsWith('-request')

export const RELAY_RECONNECT_BASE_MS = 5000
export const RELAY_RECONNECT_MAX_MS = 60000

/**
 * Delay before reconnect attempt `attempt` (0 = first after a drop): 5 s,
 * 10 s, 20 s, 40 s, then 60 s. A relay that is not there is not hammered.
 */
export function relayReconnectDelay(attempt) {
  const n = Math.max(0, Math.min(Number(attempt) || 0, 16))
  return Math.min(RELAY_RECONNECT_BASE_MS * 2 ** n, RELAY_RECONNECT_MAX_MS)
}

/**
 * The scorer's ONE relay connection. App_beach (the current match, in every
 * view) and Scoreboard_beach (every scoring action) both attach to it. Two
 * sockets would each prove the match (the relay grants the scoreboard role
 * per socket) and count twice against the relay's per-address claim limit,
 * which every scorer behind the venue's NAT shares.
 *
 * - attach(url, { onOpen(socket), onMessage(message, socket) }) -> detach().
 *   onOpen runs on every (re)connect, and right away when the socket is
 *   already open. Relay requests ('*-request') go to the most recently
 *   attached user only, so each gets one answer; everything else to all.
 * - The socket closes once the last user detached (not in between: an effect
 *   re-run detaches and attaches again in the same commit).
 * - Reconnects with relayReconnectDelay; at once when the device is back
 *   online or the tab visible again, and when a ping gets no answer (a
 *   half-open socket on venue Wi-Fi without uplink otherwise stays OPEN).
 */
export function createScorerRelay({
  createSocket = (url) => new WebSocket(url),
  reconnectDelay = (attempt) => relayReconnectDelay(attempt),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  events = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  pingIntervalMs = 25000,
  pongTimeoutMs = 10000
} = {}) {
  const users = []
  let url = null
  let ws = null
  let attempt = 0
  let reconnectTimer = null
  let closeTimer = null
  let pingTimer = null
  let pongTimer = null
  let lastMessageAt = 0
  let listening = false

  const safe = (fn) => {
    try { fn() } catch (err) { console.error('[ScorerRelay] handler failed:', err) }
  }
  const isOpen = () => !!ws && ws.readyState === WS_OPEN

  function stopPing() {
    if (pingTimer) clearTimer(pingTimer)
    if (pongTimer) clearTimer(pongTimer)
    pingTimer = null
    pongTimer = null
  }

  function drop(socket, code, reason) {
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = () => {}
    try {
      if (socket.readyState === WS_OPEN) socket.close(code, reason)
      // Closing a socket that is still connecting logs a browser error: close it once open
      else if (socket.readyState === WS_CONNECTING) socket.onopen = () => { try { socket.close(code, reason) } catch { /* gone */ } }
    } catch { /* already gone */ }
  }

  function scheduleReconnect(delay = null) {
    if (users.length === 0 || reconnectTimer) return
    reconnectTimer = setTimer(connect, delay ?? reconnectDelay(attempt))
    attempt += 1
  }

  function ping() {
    pingTimer = null
    const socket = ws
    if (!socket || socket.readyState !== WS_OPEN) return
    const sentAt = Date.now()
    try { socket.send(JSON.stringify({ type: 'ping', timestamp: sentAt })) } catch { /* closing */ }
    pongTimer = setTimer(() => {
      pongTimer = null
      if (ws !== socket) return
      if (lastMessageAt >= sentAt) {
        pingTimer = setTimer(ping, pingIntervalMs)
        return
      }
      // No answer: dead, even though it still says OPEN
      ws = null
      drop(socket, 4000, 'No answer to ping')
      scheduleReconnect(0)
    }, pongTimeoutMs)
  }

  function connect() {
    reconnectTimer = null
    if (!url || users.length === 0) return
    if (ws && (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING)) return
    let socket
    try {
      socket = createSocket(url)
    } catch (err) {
      console.error('[ScorerRelay] connection error:', err)
      scheduleReconnect()
      return
    }
    ws = socket
    socket.onerror = () => { /* onclose follows */ }
    socket.onopen = () => {
      if (ws !== socket) return
      attempt = 0
      lastMessageAt = Date.now()
      stopPing()
      pingTimer = setTimer(ping, pingIntervalMs)
      for (const user of [...users]) safe(() => user.onOpen?.(socket))
    }
    socket.onmessage = (event) => {
      if (ws !== socket) return
      lastMessageAt = Date.now()
      let message
      try { message = JSON.parse(event.data) } catch { return }
      if (!message || typeof message !== 'object') return
      const targets = isRelayRequest(message) ? users.slice(-1) : [...users]
      for (const user of targets) safe(() => user.onMessage?.(message, socket))
    }
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      stopPing()
      scheduleReconnect()
    }
  }

  // Back online / tab visible again: reconnect now instead of after the backoff
  function reconnectNow() {
    if (users.length === 0) return
    if (doc && doc.visibilityState === 'hidden') return
    if (ws && (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING)) return
    if (reconnectTimer) {
      clearTimer(reconnectTimer)
      reconnectTimer = null
    }
    connect()
  }

  function listen(on) {
    if (on === listening) return
    listening = on
    const method = on ? 'addEventListener' : 'removeEventListener'
    events?.[method]?.('online', reconnectNow)
    doc?.[method]?.('visibilitychange', reconnectNow)
  }

  function shutdown() {
    closeTimer = null
    if (users.length > 0) return
    listen(false)
    stopPing()
    if (reconnectTimer) clearTimer(reconnectTimer)
    reconnectTimer = null
    attempt = 0
    if (ws) {
      const socket = ws
      ws = null
      drop(socket, 1000, 'Scorer left the match')
    }
    url = null
  }

  return {
    get socket() { return ws },
    /** The relay URL the connection is attached to (null when detached). */
    get url() { return url },
    get userCount() { return users.length },
    isOpen,
    reconnectNow,
    /** Send on the open socket; false when there is none. */
    send(payload) {
      if (!isOpen()) return false
      try {
        ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
        return true
      } catch {
        return false
      }
    },
    attach(nextUrl, user = {}) {
      if (!nextUrl) return () => {}
      if (closeTimer) {
        clearTimer(closeTimer)
        closeTimer = null
      }
      const entry = { onOpen: user.onOpen, onMessage: user.onMessage }
      users.push(entry)
      listen(true)
      if (url !== nextUrl) {
        // Another relay (the local server's WS port is known now, the override changed)
        url = nextUrl
        if (ws) {
          const old = ws
          ws = null
          stopPing()
          drop(old, 1000, 'Relay changed')
        }
        if (reconnectTimer) clearTimer(reconnectTimer)
        reconnectTimer = null
        attempt = 0
        connect()
      } else if (isOpen()) {
        const socket = ws
        Promise.resolve().then(() => {
          if (users.includes(entry) && ws === socket) safe(() => entry.onOpen?.(socket))
        })
      } else if (!ws && !reconnectTimer) {
        connect()
      }
      return () => {
        const i = users.indexOf(entry)
        if (i === -1) return
        users.splice(i, 1)
        if (users.length === 0 && !closeTimer) closeTimer = setTimer(shutdown, 0)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Publishing a match
// ---------------------------------------------------------------------------

/**
 * What the scorer publishes on its relay connection, per match key:
 * - sync(key, local): the sync-match-data, then the last live state again
 *   (a relay may drop its stored live state on a sync, and a referee or the
 *   LedBox that joined meanwhile needs it at once);
 * - liveState(key, state): the live-state-update, remembered for the next sync;
 * - remove(key): delete-match (the scorer deleted or finished the match);
 * - answer(message, local): the relay's match-data-request / game-number-request.
 * Nothing is sent without a key (a blank match before Create Match) or
 * without an open socket; the next (re)connect syncs again.
 * @param {{ relay: { send: (payload: object) => boolean }, now?: () => number }} deps
 */
export function createRelayMatchPublisher({ relay, now = () => Date.now() }) {
  const lastLive = new Map() // key -> liveState
  const MAX_KEYS = 8

  const remember = (key, state) => {
    lastLive.delete(key)
    if (lastLive.size >= MAX_KEYS) lastLive.delete(lastLive.keys().next().value)
    lastLive.set(key, state)
  }

  return {
    sync(key, local) {
      if (!key || !local?.match) return false
      if (!relay.send(syncMatchMessage(key, local, { now: now() }))) return false
      const live = lastLive.get(key)
      if (live) relay.send(liveStateMessage(key, live))
      return true
    },
    liveState(key, state) {
      if (!key || !state) return false
      remember(key, state)
      return relay.send(liveStateMessage(key, state))
    },
    lastLiveState(key) {
      return lastLive.get(key) || null
    },
    remove(key) {
      if (!key) return false
      lastLive.delete(key)
      return relay.send({ type: 'delete-match', matchId: key })
    },
    /**
     * Answer a relay request about the match `key` from its local bundle.
     * match-data-request: the wire bundle (with PINs: only the match's proven
     * scoreboard is asked, and the relay stores it as the sync). Another match
     * gets a refusal. game-number-request: the match without PINs when the
     * number is this match's.
     * @returns {boolean} true when the request was answered
     */
    answer(message, key, local) {
      if (!message || !key) return false
      if (message.type === 'match-data-request') {
        const asked = String(message.matchId ?? '')
        const local_id = local?.match?.id != null ? String(local.match.id) : null
        if (!local?.match || (asked !== key && asked !== local_id)) {
          return relay.send({ type: 'match-data-response', requestId: message.requestId, matchId: message.matchId, success: false, error: 'Match ID mismatch' })
        }
        return relay.send({ type: 'match-data-response', requestId: message.requestId, matchId: key, success: true, data: toWireBundle(local) })
      }
      if (message.type === 'game-number-request') {
        const asked = String(message.gameNumber ?? '').trim()
        const m = local?.match
        const own = m ? [m.gameNumber, m.game_n, m.gameN, key].filter((v) => v !== undefined && v !== null && v !== '').map(String) : []
        if (!asked || !own.includes(asked)) {
          return relay.send({ type: 'game-number-response', requestId: message.requestId, success: false, error: 'Match not found with this game number' })
        }
        return relay.send({ type: 'game-number-response', requestId: message.requestId, success: true, matchId: key, match: publicWireMatch(m) })
      }
      return false
    },
    /** Tests only. */
    reset() {
      lastLive.clear()
    }
  }
}

/** The scorer page's relay connection, shared by App_beach and Scoreboard_beach. */
export const scorerRelay = createScorerRelay()

/** What the scorer page publishes on it. */
export const scorerPublisher = createRelayMatchPublisher({ relay: scorerRelay })
