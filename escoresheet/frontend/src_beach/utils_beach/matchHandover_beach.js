/**
 * A match continued on another device (the scoring-device handover, server
 * db/019, backend lib/scorerDevice.js). A match is scored on ONE device at a
 * time. The app names its installation (utils_beach/deviceId_beach,
 * lib_beach/apiClient_beach writingDevice) in every cloud write; the first
 * device that writes a match scores it. A device that joins the match (a
 * restore by game PIN, a backup restore) or takes it back ("Take back scoring
 * here") queues a claim (sync_queue { resource: 'match', action: 'scorer' }).
 * The server then refuses the previous device's writes with 409
 * OV_SCORER_MOVED and tells it over the relay (scorer-moved): its match
 * carries cloudBlock { code: 'OV_SCORER_MOVED', scorer: { platform, at } }
 * and the scoring screens show ScorerMovedModal_beach, which only offers
 * "Take back scoring here" and "Close". Its unsent writes of the match are
 * set aside (never sent over the other device's score); taking it back loads
 * the cloud copy first.
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/matchHandover.js
 * (2026-10-20, game 406970: started on the PC, finished on a phone), without
 * its retirement of a local copy the server refused with OV_GAME_TAKEN: beach
 * game numbers are not unique (db/013), no beach match is refused for its
 * game.
 */
import { jobMatchKey } from './syncIds_beach'

export const SCORER_MOVED = 'OV_SCORER_MOVED'
export const SCORER_CLAIM_ACTION = 'scorer'
// superseded_by of the jobs a device set aside when another one took the match over
export const SCORER_MOVED_BY = 'scorer-moved'
// Jobs not sent yet (a retry would send them)
const OPEN_JOB = ['queued', 'error', 'failed']

/** The match is scored on another device now (the server said so). */
export const isScorerMoved = (match) => match?.cloudBlock?.code === SCORER_MOVED

/** The claim job of `match` (null: no seed_key, a test match). */
export function scorerClaimJob(match, now = new Date()) {
  if (!match?.seed_key || match.test === true) return null
  return {
    resource: 'match',
    action: SCORER_CLAIM_ACTION,
    payload: { id: match.seed_key },
    ts: now.toISOString(),
    status: 'queued'
  }
}

/** Queue the claim of `match` for this device. @returns {Promise<number|null>} the job id */
export async function queueScorerClaim(database, match) {
  const job = scorerClaimJob(match)
  if (!job || !database?.sync_queue) return null
  return database.sync_queue.add(job)
}

// The jobs that write a match's score (the server checks the scoring device
// of these: matches, sets, events, live state; never "My Matches")
const SCORING_RESOURCES = ['match', 'set', 'event']
const UNSENT_CLAIM = ['queued', 'sending', 'error']

/**
 * Has this device asked to score `seedKey` without an answer yet (a claim
 * queued, in flight or waiting out a backoff)? Until the server confirmed it,
 * an OV_SCORER_MOVED answer to its writes only says the claim is not through
 * yet: retried, never the "scored on another device" notice.
 */
export async function hasUnsentClaim(database, seedKey) {
  if (!seedKey || !database?.sync_queue) return false
  const jobs = await database.sync_queue.where('status').anyOf(UNSENT_CLAIM).toArray()
  return jobs.some(j => j.resource === 'match' && j.action === SCORER_CLAIM_ACTION && jobMatchKey(j) === seedKey)
}

/**
 * This device no longer scores `seedKey`: its unsent writes of the match are
 * set aside (status 'superseded', superseded_by 'scorer-moved'). Sent later,
 * they would write this device's older score over the other device's (on a
 * take-back, or once the server stops checking a closed match), and kept as
 * 'failed' they stay a lasting "refused by the server". The local match keeps
 * its sets and events; "Take back scoring here" loads the cloud copy anyway.
 * @returns {Promise<number>} jobs set aside
 */
export async function setAsideMovedJobs(database, seedKey) {
  if (!seedKey || !database?.sync_queue) return 0
  const jobs = await database.sync_queue.where('status').anyOf(OPEN_JOB).toArray()
  const ids = jobs.filter(j => SCORING_RESOURCES.includes(j.resource) && jobMatchKey(j) === seedKey).map(j => j.id)
  for (const id of ids) await database.sync_queue.update(id, { status: 'superseded', superseded_by: SCORER_MOVED_BY })
  return ids.length
}

/**
 * The server said another device scores `local` now (409 OV_SCORER_MOVED, or
 * the relay nudge confirmed by POST /api/match/scorer): the match carries the
 * block (ScorerMovedModal_beach) and its unsent writes are set aside. A match the
 * server has closed meanwhile is final here too (no longer an open match).
 * @param {{ scorer?: object|null, closed?: boolean, now?: number }} info
 */
export async function markScorerMoved(database, local, { scorer = null, closed = false, now = Date.now() } = {}) {
  if (!local?.id) return 0
  const prev = isScorerMoved(local) ? local.cloudBlock : null
  const block = { code: SCORER_MOVED, claim: null, scorer: scorer || prev?.scorer || null, at: prev?.at || now, ...(closed || prev?.closed ? { closed: true } : {}) }
  await database.matches.update(local.id, { cloudBlock: block, ...(block.closed && local.status !== 'final' ? { status: 'final' } : {}) })
  return setAsideMovedJobs(database, local.seed_key)
}

/**
 * "Take back scoring here": this device scores the match again, from the
 * score the other device left in the cloud. Its own copy is older (it
 * stopped when the other device took over), so the cloud match is loaded
 * first, the same as a join with the game PIN (the local match is replaced
 * and the claim queued, backupManager_beach importMatchFromSupabase), and the
 * scoring screens open the replaced match. Needs a connection and the game
 * PIN the device kept; a match closed meanwhile loads as closed (its Match
 * End), the claim then has nothing to take.
 * @param {{ fetchCloud: (pin: string, gameN: number|string) => Promise<object>, importCloud: (cloudData: object) => Promise<number>, online?: boolean }} deps
 * @returns {Promise<{ ok: true, matchId: number, cloud: object } | { ok: false, reason: 'offline'|'noPin'|'notFound'|'otherMatch'|'failed', message?: string }>}
 */
export async function takeBackScoring(database, matchId, { fetchCloud, importCloud, online = true } = {}) {
  const match = await database.matches.get(matchId)
  if (!match?.seed_key) return { ok: false, reason: 'notFound' }
  const pin = match.gamePin ?? match.game_pin
  const gameN = match.gameN ?? match.game_n ?? match.gameNumber
  if (pin == null || String(pin).trim() === '' || gameN == null || gameN === '') return { ok: false, reason: 'noPin' }
  if (!online) return { ok: false, reason: 'offline' }
  let cloud
  try {
    cloud = await fetchCloud(String(pin).trim(), gameN)
  } catch (err) {
    return { ok: false, reason: err?.network || err?.status === 0 ? 'offline' : 'failed', message: err?.message }
  }
  if (!cloud?.match) return { ok: false, reason: 'notFound' }
  // The game PIN names the game: never load another match over this one
  if (cloud.match.external_id && cloud.match.external_id !== match.seed_key) return { ok: false, reason: 'otherMatch' }
  const newId = await importCloud(cloud)
  if (newId == null) return { ok: false, reason: 'failed' }
  console.log(`[Handover] ${match.seed_key}: scoring taken back on this device from the cloud copy`)
  return { ok: true, matchId: newId, cloud }
}

/**
 * A scorer-moved message from the relay (the server names the match only):
 * ask whether this device still scores it; when not, its match is marked
 * (markScorerMoved). A device that asked to score it and has no answer yet
 * is not marked: the nudge is about its own claim's predecessor.
 * @param {{ check: (seedKey: string) => Promise<{data?: {mine: boolean|null, closed?: boolean, scorer?: object}, error?: object}> }} deps
 * @returns {Promise<boolean>} true when the match was marked as moved
 */
export async function noteScorerMoved(database, seedKey, { check, now = Date.now() } = {}) {
  if (!seedKey || typeof check !== 'function') return false
  const local = await database.matches.filter(m => m.seed_key === seedKey).first()
  if (!local || local.test === true || local.status === 'final') return false
  if (await hasUnsentClaim(database, seedKey)) return false
  const { data, error } = await check(seedKey)
  if (error || data?.mine !== false) return false
  await markScorerMoved(database, local, { scorer: data.scorer || null, closed: data.closed === true, now })
  return true
}

/**
 * At app start (online): a match this device lost to another one is asked
 * about again. Once the server has closed it, it is final here too: no
 * longer an open match, nothing of it left to send.
 * @returns {Promise<number>} local matches marked final
 */
export async function closeMovedMatches(database, { check }) {
  if (typeof check !== 'function') return 0
  const moved = (await database.matches.toArray()).filter(m => isScorerMoved(m) && m.status !== 'final' && m.test !== true && m.seed_key)
  let n = 0
  for (const m of moved) {
    const { data, error } = await check(m.seed_key)
    if (error || data?.closed !== true) continue
    await markScorerMoved(database, m, { scorer: data.scorer || null, closed: true })
    n++
  }
  return n
}

// The states of a match the server has closed (db/007)
const CLOSING_STATUSES = ['approved', 'final']

/**
 * Is the local match known to be closed on the server? It carries the
 * server's closed_at, it was closed on the device that took it over
 * (OV_SCORER_MOVED, closed), or its local status is approved / final. Never
 * a test match. (OpenVolley utils/matchReopen isKnownClosedOnServer.)
 */
export function isKnownClosedOnServer(match) {
  if (!match || match.test === true) return false
  if (match.closed_at) return true
  if (isScorerMoved(match) && match.cloudBlock?.closed === true) return true
  return CLOSING_STATUSES.includes(match.status)
}
