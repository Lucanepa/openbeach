/**
 * Cloud sync of the running score of the open set, and the live-state status
 * of a sync.
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/eventSync.js
 * (queueSetScoreSync): the cloud sets row used to stay 0:0 for the whole set
 * (only the set end wrote the score) while match_live_state carried the
 * points. OpenVolley queues the score of the open set after every point and
 * undo; openbeach does the same, with its team1_points / team2_points columns.
 *
 * Every job is an ordinary sync_queue row (offline-first). Test matches and
 * matches without a seed_key never get jobs. Nothing here throws into the
 * scoring flow: a failure to queue is logged and the local write stands.
 */
import { setExtId, jobMatchKey } from './syncIds_beach'
import { REVISION_OPS, revisionOfJob } from './eventRevisions_beach'

// Set update fields that only carry the running score: a newer score of the
// same set makes an older, still queued one pointless.
const SCORE_ONLY_KEYS = new Set(['external_id', 'team1_points', 'team2_points', 'sport_type'])

/**
 * Live-state sync event types that change the score of the open set. A set
 * end is not one: the set end writes the finished set itself.
 */
export const SCORE_CHANGING_EVENTS = Object.freeze([
  'point', 'undo', 'replay', 'decision_change', 'bmp_outcome',
  'challenge_outcome', 'referee_bmp_outcome', 'manual_score_update'
])

/** @param {string|null|undefined} eventType */
export function changesSetScore(eventType) {
  return SCORE_CHANGING_EVENTS.includes(eventType)
}

/** A still queued update of `setExternalId` that carries nothing but its score. */
export function isScoreOnlySetUpdate(job, setExternalId) {
  return job?.resource === 'set' && job.action === 'update' && job.status === 'queued' &&
    job.payload?.external_id === setExternalId &&
    Object.keys(job.payload).every(k => SCORE_ONLY_KEYS.has(k))
}

/**
 * The open set of a match: the highest index that is not finished, else the
 * highest index.
 * @param {Array<object>} sets
 */
export function openSetOf(sets) {
  const sorted = [...(sets || [])].sort((a, b) => (b.index || 0) - (a.index || 0))
  return sorted.find(s => !s.finished) || sorted[0] || null
}

/**
 * Queue the running score of a set of the match (default: the open set).
 * Older, still queued score-only updates of the same set are dropped first, so
 * a long offline period sends one update per set, not one per rally.
 * @param {import('dexie').Dexie} db
 * @param {{ matchId: number, setIndex?: number|null }} p
 * @returns {Promise<boolean>} true when a job was queued
 */
export async function queueSetScoreSync(db, { matchId, setIndex = null }) {
  try {
    const match = await db.matches.get(matchId)
    if (!match || match.test || !match.seed_key) return false
    const sets = await db.sets.where('matchId').equals(matchId).toArray()
    const set = setIndex == null ? openSetOf(sets) : sets.find(s => s.index === setIndex)
    if (!set) return false
    const externalId = setExtId(match.seed_key, set.id)
    const stale = await db.sync_queue.where('status').equals('queued')
      .and(j => isScoreOnlySetUpdate(j, externalId))
      .toArray()
    if (stale.length > 0) await db.sync_queue.bulkDelete(stale.map(j => j.id))
    await db.sync_queue.add({
      resource: 'set',
      action: 'update',
      payload: {
        external_id: externalId,
        team1_points: set.team1Points || 0,
        team2_points: set.team2Points || 0
      },
      ts: new Date().toISOString(),
      status: 'queued'
    })
    return true
  } catch (err) {
    console.warn('[eventSync] could not queue the set score', matchId, setIndex, err?.message)
    return false
  }
}

/**
 * Is a live-state sync in the break between two sets? At the set end itself,
 * or while the match is in its interval and the set the snapshot shows is not
 * marked finished yet (once it is, the snapshot already counts it and moves on:
 * shifting it again would count the set twice).
 * @param {{ eventType?: string|null, matchStatus?: string|null, snapshotSetFinished?: boolean }} p
 */
export function isLiveSetInterval({ eventType = null, matchStatus = null, snapshotSetFinished = false } = {}) {
  if (eventType === 'set_end') return true
  return matchStatus === 'interval' && !snapshotSetFinished
}

// ---------------------------------------------------------------------------
// Event revisions (undo / delete / edit / restore) for the server
// ---------------------------------------------------------------------------

/**
 * Is this sync job an event revision (queued by db_beach/eventHistory_beach)?
 * They keep resource 'event', so the queue's per-entity order holds a void
 * behind its event's insert.
 */
export function isEventRevisionJob(job) {
  return job?.resource === 'event' && REVISION_OPS.includes(job.action)
}

/**
 * The POST /api/match/event-revisions request of a revision job:
 * { matchExternalId, revisions: [one] }, or null when the job cannot be sent
 * (no rev_uid, no match key): the queue drops it.
 */
export function eventRevisionRequest(job) {
  if (!isEventRevisionJob(job)) return null
  const revision = revisionOfJob({ ...job.payload, op: job.payload?.op || job.action })
  const matchExternalId = jobMatchKey(job)
  if (!revision || !matchExternalId) return null
  return { matchExternalId, revisions: [revision] }
}

/**
 * How the queue treats the answer to a revision:
 * 'sent'; 'wait' (404 OV_MATCH_NOT_FOUND: the match is not in the cloud yet,
 * retried like an event insert); 'no_route' (any other 404: a server without
 * the route, an older backend or a LAN relay: parked as refused, retried
 * hourly); 'error' (everything else: the queue's usual failure classes).
 * @param {{error?: object|null, status?: number}} answer
 */
export function eventRevisionOutcome({ error = null, status } = {}) {
  if (!error) return 'sent'
  const st = error.status ?? status
  if (st === 404 && error.code === 'OV_MATCH_NOT_FOUND') return 'wait'
  if (st === 404) return 'no_route'
  return 'error'
}

