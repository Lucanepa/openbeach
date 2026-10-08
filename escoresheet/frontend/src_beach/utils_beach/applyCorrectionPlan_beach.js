/**
 * The one write path of the beach corrections (during the match and at the
 * match end): a plan from utils_beach/corrections_beach goes to Dexie in ONE
 * transaction, together with everything that follows from it.
 *
 *  1. event rows: delete, update (payload, seq renumbering), add
 *  2. every affected set: its score re-derived from the point events (set
 *     row and, for a finished set, the set_end payload): no score is ever
 *     typed in; set-time changes go to the set row
 *  3. the team sanction flags of the match (improper request, delay warning)
 *     re-derived from the sanction events
 *  4. match.remarks: the plan's lines removed / appended
 *  5. match.manualChanges: the correction-log entry (a sentence)
 *  6. sync jobs: event/insert (an upsert on external_id, so edited and
 *     renumbered rows are re-sent the same way), set/update, match/update:
 *     no direct API writes, corrections work offline
 *  7. unsent insert jobs of removed events are dropped (only inserts:
 *     scorerCorrections_beach syncJobsForEvents)
 *  8. at the match end, a change of the sheet clears the post-match
 *     signatures (they certified the old sheet)
 *
 * The event history (db_beach/eventHistory_beach) is the one record of what
 * the correction removed or changed: its db.events hooks write an
 * event_history row and a void / edit revision job for every deleted or
 * edited row, with the reason 'correction' (withActivityContext below),
 * inside this same transaction (EVENT_HISTORY_SCOPE). The server keeps a
 * removed event as a voided row; no event delete is sent.
 *
 * After the transaction the caller's hooks run (scoresheet refresh, and in
 * the match the referee / livescore push).
 *
 * Ported from OpenVolley src/services/corrections/applyCorrectionPlan.js
 * (b73f053d, de4231b6) with the beach set columns (team1Points /
 * team2Points) and the beach team sanction flags.
 */
import { scoreFromPointEvents, syncJobsForEvents, eventUpsertJob, teamSanctionFlags, UNSENT_STATUSES } from './scorerCorrections_beach'
import { appendRemark, removeRemarkLine, planSetTimes } from './corrections_beach'
import { clearedPostMatchSignatures, POST_MATCH_SIGNATURE_KEYS, signaturesPayload } from './signatures_beach'
import { setExtId } from './syncIds_beach'
import { withActivityContext, EVENT_HISTORY_SCOPE, rememberSeedKey } from '../db_beach/eventHistory_beach'
import { randomUuid } from './deviceId_beach'

/** The event history reason of every row a correction removes or edits. */
export const CORRECTION_REASON = 'correction'

const POST_MATCH_FIELDS = Object.keys(POST_MATCH_SIGNATURE_KEYS)

/** True when the plan changes what the officials signed (anything but the log). */
export function planChangesSheet(plan) {
  return !!plan && (
    (plan.add?.length || 0) + (plan.update?.length || 0) + (plan.remove?.length || 0) +
    (plan.setUpdates?.length || 0) + (plan.remarkAdd?.length || 0) + (plan.remarkRemove?.length || 0) +
    (plan.remarksSet !== undefined ? 1 : 0)
  ) > 0
}

/** The correction-log entry stored in match.manualChanges. */
export function logEntryFor(plan, now = new Date()) {
  if (!plan?.log) return null
  const { action, setIndex = null, team = null, before = null, after = null, text } = plan.log
  return {
    ts: now.toISOString(),
    category: 'correction',
    action,
    setIndex,
    team,
    before,
    after,
    text,
    description: text,
    by: 'scorer'
  }
}

/** The new remarks text after the plan's removals and additions. */
export function remarksAfter(remarks, plan) {
  let out = plan?.remarksSet !== undefined ? String(plan.remarksSet) : (remarks || '')
  for (const line of plan?.remarkRemove || []) out = removeRemarkLine(out, line)
  for (const line of plan?.remarkAdd || []) out = appendRemark(out, line)
  return out
}

/**
 * Write a correction plan.
 * @param {object} plan from utils_beach/corrections_beach (never one with `error`)
 * @param {{ matchId:any, db:object, mode?:'live'|'review', hooks?:object, now?:Date }} opts
 * @returns {Promise<{ addedIds:Array, signaturesCleared:boolean }>}
 */
export async function applyCorrectionPlan(plan, opts = {}) {
  if (!plan || plan.error) throw new Error(plan?.error || 'No plan')
  return withActivityContext({ reason: CORRECTION_REASON, actionId: randomUuid() }, () => writePlan(plan, opts))
}

// Same minute: the panel's fields hold minutes, so a stored time with seconds
// (a set row restored from the cloud, test mode) shown and blurred unchanged
// is no correction (it logged one and re-sent the set row)
const sameMinute = (a, b) => {
  if (!a || !b) return (a || null) === (b || null)
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000)
}

/**
 * Correct a set's start and / or end time from the stored match: planned by
 * planSetTimes and written by applyCorrectionPlan, as the corrections panel's
 * set times form does. The scoring screen's older "Manual changes" panel
 * wrote the set row directly, so set 1's "Actual start time: HH:MM" remark
 * did not follow a changed start (it does here: replaced, or removed at the
 * scheduled time). A time in the same minute as the stored one is no change.
 *
 * @param {{ db:object, matchId:any, setIndex:number, startTime?:string|null, endTime?:string|null, t?:Function|null, mode?:'live'|'review', hooks?:object }} args
 * @returns {Promise<{ unchanged:true } | { error:string, params?:object } | { addedIds:Array, signaturesCleared:boolean }>}
 */
export async function correctSetTimes({ db, matchId, setIndex, startTime, endTime, t = null, mode = 'live', hooks = {} } = {}) {
  const [match, events, sets] = await Promise.all([
    db.matches.get(matchId),
    db.events.where('matchId').equals(matchId).toArray(),
    db.sets.where('matchId').equals(matchId).toArray()
  ])
  const row = sets.find(s => s.index === setIndex)
  if (!match || !row) return { error: 'corrections.error.notFound' }
  const changes = {}
  if (startTime !== undefined && !sameMinute(startTime, row.startTime)) changes.startTime = startTime
  if (endTime !== undefined && !sameMinute(endTime, row.endTime)) changes.endTime = endTime
  if (Object.keys(changes).length === 0) return { unchanged: true }
  const plan = planSetTimes(events, sets, { setIndex, ...changes }, { t, matchId, mode, match })
  if (plan.error) return { error: plan.error, params: plan.params }
  return applyCorrectionPlan(plan, { matchId, db, mode, hooks })
}

async function writePlan(plan, { matchId, db, mode = 'live', hooks = {}, now = new Date() } = {}) {
  const result = { addedIds: [], signaturesCleared: false }
  const historyTables = EVENT_HISTORY_SCOPE.map(name => db[name]).filter(Boolean)

  await db.transaction('rw', [db.events, db.sets, db.matches, db.sync_queue, ...historyTables], async () => {
    const match = await db.matches.get(matchId)
    if (!match) throw new Error('Match not found')
    // the history hooks queue the revision jobs in this transaction when they know the match's key
    rememberSeedKey(matchId, match.seed_key ?? null, match.test === true)
    const before = await db.events.where('matchId').equals(matchId).toArray()
    const byId = new Map(before.map(e => [e.id, e]))

    // 1. event rows
    const removeIds = [...new Set(plan.remove || [])].filter(id => byId.has(id))
    const removing = new Set(removeIds)
    if (removeIds.length) await db.events.bulkDelete(removeIds)
    const touched = new Set()
    for (const u of plan.update || []) {
      if (!byId.has(u.id) || removing.has(u.id)) continue
      await db.events.update(u.id, u.changes)
      touched.add(u.id)
    }
    for (const row of plan.add || []) {
      // eslint-disable-next-line no-unused-vars
      const { tempKey, id, ...clean } = row
      const newId = await db.events.add({ ...clean, matchId })
      result.addedIds.push(newId)
      touched.add(newId)
    }

    const events = await db.events.where('matchId').equals(matchId).toArray()
    const sets = await db.sets.where('matchId').equals(matchId).toArray()
    const changedSets = new Map()

    // 2. set scores from the point events; set times
    for (const setIndex of plan.affectedSets || []) {
      const row = sets.find(s => s.index === setIndex)
      if (!row) continue
      const score = scoreFromPointEvents(events, setIndex)
      await db.sets.update(row.id, score)
      changedSets.set(row.id, { ...row, ...score })
      const end = events.find(e => e.type === 'set_end' && (e.setIndex ?? 1) === setIndex)
      if (end) {
        const payload = { ...end.payload, team1Points: score.team1Points, team2Points: score.team2Points }
        await db.events.update(end.id, { payload })
        end.payload = payload
        touched.add(end.id)
      }
    }
    for (const su of plan.setUpdates || []) {
      const row = sets.find(s => s.index === su.setIndex)
      if (!row) continue
      await db.sets.update(row.id, su.changes)
      changedSets.set(row.id, { ...(changedSets.get(row.id) || row), ...su.changes })
    }

    // 3-5, 8. the match row
    const patch = {}
    const sanctions = teamSanctionFlags(events, match.sanctions || {})
    if (JSON.stringify(sanctions) !== JSON.stringify(match.sanctions || {})) patch.sanctions = sanctions
    const remarks = remarksAfter(match.remarks, plan)
    if (remarks !== (match.remarks || '')) patch.remarks = remarks
    const entry = logEntryFor(plan, now)
    if (entry) patch.manualChanges = [...(match.manualChanges || []), entry]
    if (mode === 'review' && planChangesSheet(plan) && POST_MATCH_FIELDS.some(f => match[f])) {
      Object.assign(patch, clearedPostMatchSignatures())
      result.signaturesCleared = true
    }
    if (Object.keys(patch).length) await db.matches.update(matchId, patch)

    // 6-7. sync jobs (official matches only)
    if (match.seed_key && !match.test) {
      const ts = now.toISOString()
      if (removeIds.length) {
        // An insert still waiting for a removed row is dropped; the void job
        // the deletion queued (event history) stays and voids the server copy
        const unsent = await db.sync_queue.where('status').anyOf(...UNSENT_STATUSES).toArray()
        const stale = syncJobsForEvents(unsent, removeIds)
        if (stale.length) await db.sync_queue.bulkDelete(stale.map(j => j.id))
      }
      for (const id of touched) {
        const ev = events.find(e => e.id === id)
        if (ev) await db.sync_queue.add(eventUpsertJob(match.seed_key, ev, now))
      }
      for (const s of changedSets.values()) {
        const payload = {
          external_id: setExtId(match.seed_key, s.id),
          team1_points: Number(s.team1Points) || 0,
          team2_points: Number(s.team2Points) || 0
        }
        if (s.startTime !== undefined) payload.start_time = s.startTime ?? null
        if (s.endTime !== undefined) payload.end_time = s.endTime ?? null
        await db.sync_queue.add({ resource: 'set', action: 'update', payload, ts, status: 'queued' })
      }
      const matchPayload = { id: match.seed_key }
      if (patch.manualChanges) matchPayload.manual_changes = patch.manualChanges
      if (patch.sanctions) matchPayload.sanctions = patch.sanctions
      if (result.signaturesCleared) matchPayload.signatures = signaturesPayload({ ...match, ...patch })
      if (Object.keys(matchPayload).length > 1) {
        await db.sync_queue.add({ resource: 'match', action: 'update', payload: matchPayload, ts, status: 'queued' })
      }
    }
  })

  try { window.dispatchEvent(new Event('sync-queue-write')) } catch { /* no window */ }
  for (const hook of ['notifyScoresheetUpdate', 'syncToReferee', 'syncLiveState']) {
    try { await hooks[hook]?.(plan, result) } catch (err) { console.warn(`[corrections] ${hook} failed`, err?.message) }
  }
  return result
}
