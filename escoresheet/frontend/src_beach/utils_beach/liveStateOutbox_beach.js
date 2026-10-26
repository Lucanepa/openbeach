/**
 * The newest match_live_state row the scorer could not write, per match.
 *
 * The scoring screen writes the live state straight to the backend, outside
 * the sync queue (spectators need it at once: Scoreboard_beach
 * syncLiveStateToSupabase). A write that fails (offline, signed out, the
 * backend or its database unreachable, the match not in the cloud yet) was
 * dropped, and nothing sent the state again: after a match that ended while
 * the venue Wi-Fi was down the queue delivered every set and the match end,
 * but match_live_state kept 'set 2 17:0 in_progress' for good, and once the
 * match was approved the server refused every later change (409
 * OV_MATCH_CLOSED, db/007). Stress test 2026-10-25.
 *
 * Such a row is held here (localStorage: a reload or a crash keeps it) and
 * sent again by the sync queue (hooks_beach/useSyncQueue_beach): after every
 * pass that reached the backend (back online, signed in again, the database
 * back), and always before the match's closing update (approved / final), so
 * the closed guard never locks a stale live state in. A later write that
 * reached the cloud replaces it. Never sent over a newer row this device
 * wrote: the held row's updated_at is compared with the last one written.
 */

// { [seed_key]: row } in one localStorage item
const STORAGE_KEY = 'ob_live_state_unsent'

// seed_key -> updated_at (ms) of the newest row this page wrote to the cloud
const lastWrittenAt = new Map()

const timeOf = (row) => {
  const t = Date.parse(row?.updated_at)
  return Number.isFinite(t) ? t : 0
}

function readAll() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const all = raw ? JSON.parse(raw) : null
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {}
  } catch {
    return {}
  }
}

function writeAll(all) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* storage full or blocked: the next write goes again anyway */ }
}

/** The live-state row held for `seedKey` (no match_id: resolved when sent), or null. */
export function heldLiveState(seedKey) {
  if (!seedKey) return null
  const row = readAll()[seedKey]
  return row && typeof row === 'object' ? row : null
}

/** Seed keys with a held row. */
export function heldLiveStateKeys() {
  return Object.keys(readAll())
}

/**
 * Keep `row` (a match_live_state row, its match_id is dropped) as the state
 * owed to the cloud for `seedKey`, unless a newer row is held or was written.
 */
export function holdLiveState(seedKey, row) {
  if (!seedKey || !row) return
  const t = timeOf(row)
  if (t < (lastWrittenAt.get(seedKey) || 0)) return
  const held = heldLiveState(seedKey)
  if (held && timeOf(held) > t) return
  // eslint-disable-next-line no-unused-vars
  const { match_id: _matchId, ...rest } = row
  writeAll({ ...readAll(), [seedKey]: rest })
}

/** A row up to `updatedAt` reached the cloud: a held one not newer is owed no more. */
export function liveStateWritten(seedKey, updatedAt) {
  if (!seedKey) return
  const t = Date.parse(updatedAt)
  const at = Number.isFinite(t) ? t : Date.now()
  if (at > (lastWrittenAt.get(seedKey) || 0)) lastWrittenAt.set(seedKey, at)
  const held = heldLiveState(seedKey)
  if (held && timeOf(held) <= at) dropHeldLiveState(seedKey)
}

export function dropHeldLiveState(seedKey) {
  const all = readAll()
  if (!(seedKey in all)) return
  delete all[seedKey]
  writeAll(all)
}

/**
 * Can a live-state write that failed with `error` succeed later (offline,
 * signed out, rate limited, an old bundle, the backend or its database
 * down)? The other refusals (another device scores the match, the match is
 * closed, not this account's, a bad row) cannot: never held.
 */
export function isLiveStateRetryable(error) {
  if (!error) return false
  if (error.network) return true
  const st = error.status ?? 0
  return st === 0 || st === 401 || st === 408 || st === 426 || st === 429 || st >= 500
}

/**
 * Send the row held for `seedKey`.
 * @param {string} seedKey
 * @param {{ apiFrom: Function, sportType?: string }} deps
 * @returns {Promise<'none'|'sent'|'dropped'|'kept'>} 'kept': it failed and stays held
 */
export async function sendHeldLiveState(seedKey, { apiFrom, sportType = 'beach' }) {
  const row = heldLiveState(seedKey)
  if (!row) return 'none'
  if (timeOf(row) < (lastWrittenAt.get(seedKey) || 0)) {
    dropHeldLiveState(seedKey)
    return 'dropped'
  }
  try {
    const { data: matchData, error: lookupError } = await apiFrom('matches')
      .select('id')
      .eq('external_id', seedKey)
      .eq('sport_type', sportType)
      .maybeSingle()
    if (lookupError) return 'kept'
    if (!matchData) return 'kept' // not in the cloud yet: its insert comes first
    // A newer row reached the cloud while this one waited for the lookup
    if (timeOf(row) < (lastWrittenAt.get(seedKey) || 0) || heldLiveState(seedKey)?.updated_at !== row.updated_at) return 'kept'
    const { error } = await apiFrom('match_live_state').upsert({ ...row, match_id: matchData.id }, { onConflict: 'match_id' })
    if (error) {
      if (!isLiveStateRetryable(error)) {
        console.warn('[LiveState] Held live state refused, dropped:', error.code || error.status)
        dropHeldLiveState(seedKey)
        return 'dropped'
      }
      return 'kept'
    }
    liveStateWritten(seedKey, row.updated_at)
    console.log('[LiveState] Held live state sent:', seedKey)
    return 'sent'
  } catch (err) {
    console.warn('[LiveState] Could not send the held live state:', err?.message)
    return 'kept'
  }
}

/** Send every held row (one match after the other). */
export async function sendHeldLiveStates(deps) {
  const out = {}
  for (const seedKey of heldLiveStateKeys()) out[seedKey] = await sendHeldLiveState(seedKey, deps)
  return out
}

/** Tests: forget what this page wrote. */
export function resetLiveStateOutboxForTests() {
  lastWrittenAt.clear()
  for (const k of heldLiveStateKeys()) dropHeldLiveState(k)
}
