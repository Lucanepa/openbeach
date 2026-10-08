/**
 * Which live state is the newest, for the referee tablet.
 *
 * The referee hears the scorer's live state (score, sides, serve, timeouts)
 * over several paths that can arrive out of order: the relay's
 * live-state-update push, the relay bundle (pushed, or read back with
 * getMatchData after a change), and the match_live_state row of the database
 * (realtime push, or the API read when the relay has no copy). Whatever path
 * brings it, an older state must never replace a newer one on screen.
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/serverDataSync.js
 * (newerLiveState, isLiveStateNewerThanBundle, applyNewerLiveState,
 * createLiveStateTracker: 23054276, 570198f3) with the clock rules of
 * livescoreModel.isLateFrame (a351046a), adapted to openbeach:
 * - sets carry team1Points / team2Points; team A is match.coinTossTeamA
 *   ('team1' | 'team2');
 * - a bundle says when it was read by match._syncedSeq / _syncSession (the
 *   scorer's live-state order) or match._syncedAt (the scorer's clock). Until
 *   the beach scorer stamps those, the live state the bundle carries is its
 *   marker: a bundle whose own live state is older than the newest seen was
 *   read before that newest was pushed. A bundle built from the
 *   match_live_state row (the API read) has its sets from that row, so its
 *   marker is exact.
 */

/**
 * updated_at is the scorer device's clock. A stamp further ahead of this
 * page's clock than this is not trusted for ordering (the hub clamps the same).
 */
export const LIVE_STATE_MAX_FUTURE_SKEW_MS = 5 * 1000

/**
 * Out-of-order delivery (relay push vs database row vs read-back) is seconds
 * apart. A state older than the shown one by more than this is a scorer clock
 * that stepped back (NTP correction, scorer moved to another device), not a
 * late copy: it is taken, or the referee would freeze on the old state.
 */
export const LIVE_STATE_REORDER_WINDOW_MS = 60 * 1000

const stampOf = (liveState) => Date.parse(liveState?.updated_at || '')

/**
 * The scorer's order of a live state: its sequence number and session, or
 * null (a database row, a scorer that does not number its states).
 */
function liveStateOrderOf(liveState) {
  const seq = Number(liveState?._seq)
  const session = liveState?._session
  return Number.isFinite(seq) && typeof session === 'string' && session ? { seq, session } : null
}

/**
 * Is `incoming` a late copy of a state older than `current`?
 * - Two states of one scorer session compare by sequence number (never by the
 *   wall clock).
 * - Otherwise by updated_at: older by at most LIVE_STATE_REORDER_WINDOW_MS.
 *   A shown state stamped further than LIVE_STATE_MAX_FUTURE_SKEW_MS ahead of
 *   this page never blocks later states; an incoming future stamp is clamped.
 * Missing or unreadable stamps are never late.
 * @param {object|null} current  the state shown
 * @param {object|null} incoming
 * @param {number} [now]  this page's clock
 */
export function isLateLiveState(current, incoming, now = Date.now()) {
  if (!current || !incoming) return false
  const a = liveStateOrderOf(current)
  const b = liveStateOrderOf(incoming)
  if (a && b && a.session === b.session) return b.seq < a.seq
  const shownAt = stampOf(current)
  const rawAt = stampOf(incoming)
  if (!Number.isFinite(shownAt) || !Number.isFinite(rawAt)) return false
  const ceiling = now + LIVE_STATE_MAX_FUTURE_SKEW_MS
  if (shownAt > ceiling) return false
  const behind = shownAt - Math.min(rawAt, ceiling)
  return behind > 0 && behind <= LIVE_STATE_REORDER_WINDOW_MS
}

/**
 * Which live state to keep when `incoming` arrives after `current`:
 * `incoming` unless it is a late copy (isLateLiveState). Either may be missing.
 */
export function newerLiveState(current, incoming, now = Date.now()) {
  if (!incoming) return current || null
  if (!current) return incoming
  return isLateLiveState(current, incoming, now) ? current : incoming
}

/**
 * Was `liveState` computed after the relay bundle was read on the scorer?
 * - Same scorer session: its sequence number is higher than the bundle's
 *   match._syncedSeq.
 * - Else, with match._syncedAt: its updated_at is later (both scorer clock).
 * - Else, with a live state in the bundle: it is strictly newer than that one
 *   (same session: a higher number; otherwise a later updated_at).
 * False when the bundle says none of this.
 */
export function isLiveStateNewerThanBundle(liveState, bundle) {
  if (!liveState || !bundle || liveState === bundle.liveState) return false
  const match = bundle.match
  const order = liveStateOrderOf(liveState)
  const syncedSeq = Number(match?._syncedSeq)
  if (order && Number.isFinite(syncedSeq) && match?._syncSession === order.session) {
    return order.seq > syncedSeq
  }
  const liveAt = stampOf(liveState)
  const syncedAt = Number(match?._syncedAt)
  if (Number.isFinite(syncedAt)) return Number.isFinite(liveAt) && liveAt > syncedAt
  const own = bundle.liveState
  if (!own || typeof own !== 'object') return false
  const ownOrder = liveStateOrderOf(own)
  if (order && ownOrder && order.session === ownOrder.session) return order.seq > ownOrder.seq
  const ownAt = stampOf(own)
  return Number.isFinite(liveAt) && Number.isFinite(ownAt) && liveAt > ownAt
}

/**
 * The bundle with a live state that is newer than it applied: the live
 * state's points replace those of the (unfinished) set it names, so the
 * referee shows the newest score whichever path brought it. A bundle that
 * does not say when it was read, or an older live state, is returned as is.
 * @param {object} bundle  { match, sets, liveState?, ... } with team1Points / team2Points
 * @param {object|null} [liveState]  defaults to the bundle's own
 */
export function applyNewerLiveState(bundle, liveState = bundle?.liveState) {
  if (!bundle || !liveState || !Array.isArray(bundle.sets)) return bundle
  if (!isLiveStateNewerThanBundle(liveState, bundle)) return bundle
  const out = { ...bundle, liveState }
  const index = Number(liveState.current_set)
  const pointsA = Number(liveState.points_a)
  const pointsB = Number(liveState.points_b)
  if (!Number.isFinite(index) || !Number.isFinite(pointsA) || !Number.isFinite(pointsB)) return out
  const teamAIsTeam1 = (bundle.match?.coinTossTeamA || 'team1') === 'team1'
  const team1Points = teamAIsTeam1 ? pointsA : pointsB
  const team2Points = teamAIsTeam1 ? pointsB : pointsA
  let changed = false
  const sets = bundle.sets.map((s) => {
    if (!s || Number(s.index) !== index || s.finished) return s
    if (s.team1Points === team1Points && s.team2Points === team2Points) return s
    changed = true
    return { ...s, team1Points, team2Points }
  })
  return changed ? { ...out, sets } : out
}

const bundleSaysWhenRead = (result) => {
  const m = result?.match
  return m?._syncedSeq != null || m?._syncedAt != null || (result?.liveState && typeof result.liveState === 'object')
}

/**
 * The newest live state the referee has seen from any source and the last
 * bundle as received:
 * - bundle(result): a match bundle (getMatchData / relay push). Returns it with
 *   the newest live state applied (its score and its liveState). A bundle read
 *   after the kept state supersedes it, which also frees a state kept from
 *   before a clock step on the scorer.
 * - liveState(row): a live state from elsewhere (relay live-state-update,
 *   database row). True when it is now the newest: re-deliver
 *   bundle(lastBundle) to show its score.
 * - isLate(row): a late copy of an older state than the newest (drop it).
 * @param {{ now?: () => number }} [opts]
 */
/**
 * How long a newer live state waits for the scorer's bundle (tracker.hold). A
 * point sends both: the live state carries the score, the bundle the serve
 * and the court. Shown apart (the bundle lands ~200 ms later) the referee saw
 * the score change, then the ball and the teams move. Within this time the
 * bundle arrives and both are shown in one update; without it the live
 * state's score is shown alone. Ported from OpenVolley (serverDataSync.js).
 */
export const LIVE_STATE_HOLD_MS = 400

export function createLiveStateTracker({ now = () => Date.now() } = {}) {
  let newest = null
  let lastBundle = null
  let holdTimer = null
  const dropHold = () => {
    clearTimeout(holdTimer)
    holdTimer = null
  }
  return {
    get newest() { return newest },
    get lastBundle() { return lastBundle },
    reset() {
      newest = null
      lastBundle = null
      dropHold()
    },
    /**
     * Show a newer live state (`apply`) only if no bundle comes within
     * LIVE_STATE_HOLD_MS: the bundle has the serve and the court too and shows
     * them all in one update. A second hold replaces the first.
     */
    hold(apply) {
      dropHold()
      holdTimer = setTimeout(() => {
        holdTimer = null
        apply()
      }, LIVE_STATE_HOLD_MS)
    },
    bundle(result) {
      if (!result?.success || !Array.isArray(result.sets)) return result
      dropHold()
      lastBundle = result
      if (newest && bundleSaysWhenRead(result) && !isLiveStateNewerThanBundle(newest, result)) {
        newest = null
      }
      newest = newerLiveState(newest, result.liveState || null, now())
      const applied = applyNewerLiveState(result, newest)
      return newest && applied.liveState !== newest ? { ...applied, liveState: newest } : applied
    },
    liveState(row) {
      if (!row || typeof row !== 'object') return false
      const before = newest
      newest = newerLiveState(newest, row, now())
      return newest !== before
    },
    isLate(row) {
      return isLateLiveState(newest, row, now())
    }
  }
}
