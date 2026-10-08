/**
 * Corrections a beach scorer makes on the scoreboard: taking back a point
 * (Undo, Replay, cancelling a change of courts), and what the removed events
 * leave behind in the cloud sync queue.
 *
 * Pure functions, tested in __tests__/utils/scorerCorrections.test.js.
 * Ported from OpenVolley escoresheet/frontend/src/domain/corrections.js
 * (planPointRemoval, syncJobsForEvents, localIdOfExtId), adapted to beach:
 * team1 / team2, no rotation line-ups or libero (a beach point writes no
 * sub-events of its own; a point decided by a BMP is a sub-event N.x of the
 * BMP request and goes with it, exactly as Undo removes it), and a successful
 * team BMP point carries `reversedTeam` (that team loses the disputed point).
 */
import { eventExtId, parseExtId } from './syncIds_beach'

/**
 * The score of one set as its point events give it.
 * @param {Array} events events of the match (any order)
 * @param {number} setIndex
 * @returns {{team1Points:number, team2Points:number}}
 */
export function scoreFromPointEvents(events, setIndex) {
  let team1Points = 0
  let team2Points = 0
  const points = (events || [])
    .filter(e => e && e.type === 'point' && e.setIndex === setIndex)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
  for (const pe of points) {
    // A successful team BMP: the disputed point goes back to the requesting team
    if (pe.payload?.reversedTeam === 'team1') team1Points = Math.max(0, team1Points - 1)
    else if (pe.payload?.reversedTeam === 'team2') team2Points = Math.max(0, team2Points - 1)
    if (pe.payload?.team === 'team1') team1Points++
    else if (pe.payload?.team === 'team2') team2Points++
  }
  return { team1Points, team2Points }
}

/**
 * Plan taking back a point (recorded in error, a rally to be replayed, the
 * point that reached a change of courts): the point and every event of its
 * group (seq N and N.x), and what that does to the set score.
 *
 * Deleting only the newest event row is wrong: after a BMP the newest row is
 * the BMP point or its outcome, not the request, and the score and the events
 * then disagree.
 *
 * @param {Array} events all events of the match
 * @param {object|null} pointEvent the point; null takes the newest point of opts.setIndex
 * @param {{setIndex?:number, includeRallyStart?:boolean}} [opts]
 *   includeRallyStart: also remove the rally_start that opened that rally (as Undo does)
 * @returns {null | {pointEventId:any, setIndex:number, deleteEventIds:Array,
 *   score:{team1Points:number, team2Points:number},
 *   delta:{team1Points:number, team2Points:number}}}
 *   score: the set score from the point events left; delta: what the removed
 *   points had added (subtract it from the stored score to keep a manual
 *   score adjustment)
 */
export function planPointRemoval(events, pointEvent, { setIndex, includeRallyStart = false } = {}) {
  const all = (events || []).filter(Boolean)
  const point = pointEvent || all
    .filter(e => e.type === 'point' && e.setIndex === setIndex)
    .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
  if (!point || point.type !== 'point') return null

  const pointSeq = point.seq || 0
  const baseSeq = Math.floor(pointSeq)
  const rows = all.filter(e => e.id === point.id ||
    (pointSeq > 0 && e.setIndex === point.setIndex && Math.floor(e.seq || 0) === baseSeq))

  if (includeRallyStart) {
    const rallyStart = all
      .filter(e => e.type === 'rally_start' && e.setIndex === point.setIndex && (e.seq || 0) < baseSeq)
      .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
    if (rallyStart && !rows.includes(rallyStart)) rows.push(rallyStart)
  }

  const deleted = new Set(rows.map(e => e.id))
  const before = scoreFromPointEvents(all, point.setIndex)
  const score = scoreFromPointEvents(all.filter(e => !deleted.has(e.id)), point.setIndex)
  return {
    pointEventId: point.id,
    setIndex: point.setIndex,
    deleteEventIds: rows.map(e => e.id),
    score,
    delta: {
      team1Points: before.team1Points - score.team1Points,
      team2Points: before.team2Points - score.team2Points
    }
  }
}

/**
 * The stored set score after removing points whose effect was `delta`:
 * a manual score adjustment made on top of the points is kept.
 */
export function scoreAfterRemoval(set, delta) {
  return {
    team1Points: Math.max(0, (set?.team1Points || 0) - (delta?.team1Points || 0)),
    team2Points: Math.max(0, (set?.team2Points || 0) - (delta?.team2Points || 0))
  }
}

/**
 * The local Dexie id a sync job's external_id stands for: the namespaced form
 * `${seedKey}:e:${id}` / `${seedKey}:s:${id}` (syncIds_beach), or a bare id
 * queued before ids were namespaced. Null for anything else.
 * @param {*} externalId
 * @param {'event'|'set'} kind
 * @returns {string|null}
 */
export function localIdOfExtId(externalId, kind) {
  if (externalId == null) return null
  const parsed = parseExtId(externalId)
  if (parsed) return parsed.kind === kind ? String(parsed.localId) : null
  const bare = String(externalId)
  return /^\d+$/.test(bare) ? bare : null
}

/** Sync-queue statuses of a job that has not reached the cloud (yet). */
export const UNSENT_STATUSES = Object.freeze(['queued', 'error', 'failed'])

/**
 * Unsent sync jobs that write one of the given events: to be dropped when the
 * events are removed locally, so the cloud never receives a phantom row.
 * Event delete jobs are never returned (they are what removes the row).
 * @param {Array} jobs sync_queue rows
 * @param {Iterable} eventIds local Dexie ids
 * @returns {Array} the jobs to delete
 */
export function syncJobsForEvents(jobs, eventIds) {
  const ids = new Set([...(eventIds || [])].map(String))
  return (jobs || []).filter(j => {
    if (!j || j.resource !== 'event' || j.action === 'delete') return false
    if (!UNSENT_STATUSES.includes(j.status)) return false
    const localId = localIdOfExtId(j.payload?.external_id, 'event')
    return localId != null && ids.has(localId)
  })
}

/**
 * The sync job that removes an event from the cloud. Queued for every removed
 * event of a synced match: its insert may already be sent, or be on its way
 * (a delete of a row the cloud never got matches nothing).
 */
export function eventDeleteJob(seedKey, eventId, now = new Date()) {
  return {
    resource: 'event',
    action: 'delete',
    payload: { external_id: eventExtId(seedKey, eventId), match_id: seedKey },
    ts: now.toISOString(),
    status: 'queued'
  }
}

/**
 * The sync job that writes an event's current content to the cloud again
 * (the insert is an upsert on external_id): a decision change moves the point
 * to the other team after its insert may have been sent.
 */
export function eventUpsertJob(seedKey, event, now = new Date()) {
  return {
    resource: 'event',
    action: 'insert',
    payload: {
      external_id: eventExtId(seedKey, event.id),
      match_id: seedKey,
      set_index: event.setIndex,
      type: event.type,
      payload: event.payload || {},
      seq: event.seq,
      test: false
    },
    ts: now.getTime(),
    status: 'queued'
  }
}
