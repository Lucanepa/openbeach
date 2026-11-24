/**
 * The scoresheet remarks (match.remarks) go to the server (OpenVolley
 * backend db/017, matches.remarks). Ported from OpenVolley
 * src/db/remarksSync.js.
 *
 * Remarks are written from several places: the remarks box on the scoreboard
 * and on the match end page, the forfeit lines (coin toss, match end), the
 * "Actual start time: HH:MM" line, the Corrections panel and undo. Instead of
 * a sync job at each of them, a Dexie table hook on db.matches (like
 * eventHistory_beach) queues one match update { remarks } for every committed
 * change of the text, whichever screen made it. The MTO / RIT lines are not
 * stored in the remarks (medicalRemarks_beach builds them from the events,
 * which sync already).
 *
 *  - Only for a cloud match: a seed_key and not a test match.
 *  - The job carries the whole text (a full snapshot): last write wins on the
 *    server, like every other plain match column, and an older errored job
 *    never overwrites a newer sent one (useSyncQueue_beach
 *    supersedeStaleUpdates).
 *  - Inside the writing transaction when it includes sync_queue, else right
 *    after it commits. A rolled-back write queues nothing.
 *  - Never shortens the local text; what is sent is clipped to REMARKS_MAX.
 *  - A match added with remarks (backup restore, import from the server) is
 *    not an edit: the restore job carries them, an import came from there.
 *
 * Remark text never goes to a log: the activity log keeps the length only,
 * and useSyncQueue_beach's redactForLog prints a length for it.
 */

// The server's CHECK on matches.remarks (characters, not bytes)
export const REMARKS_MAX = 8000

const textOf = (v) => (typeof v === 'string' ? v : '')

/**
 * The remarks text as the server takes it: a string ('' when there are none),
 * at most REMARKS_MAX characters (code points, like Postgres length()).
 * @param {unknown} remarks
 * @returns {string}
 */
export function remarksForServer(remarks) {
  const text = textOf(remarks)
  if (text.length <= REMARKS_MAX) return text
  const chars = Array.from(text)
  return chars.length <= REMARKS_MAX ? text : chars.slice(0, REMARKS_MAX).join('')
}

const job = (seedKey, remarks, now) => ({
  resource: 'match',
  action: 'update',
  payload: { id: seedKey, remarks: remarksForServer(remarks) },
  ts: now.toISOString(),
  status: 'queued'
})

/**
 * The sync job for a change of the remarks, or null (no change, no seed_key,
 * a test match).
 * @param {object|undefined} before the stored match row
 * @param {object} after the row after the update (top-level fields)
 * @param {{ now?: Date }} [opts]
 */
export function remarksSyncJob(before, after, { now = new Date() } = {}) {
  const seedKey = after?.seed_key
  if (!seedKey || after?.test === true) return null
  const next = textOf(after.remarks)
  if (next === textOf(before?.remarks)) return null
  return job(seedKey, next, now)
}

/**
 * A job that sends the match's current remarks as they are (the approval
 * queues one just before its own job). Its own job, so a server without
 * db/017 refuses only it, never the approval. Null without a seed_key or for
 * a test match.
 * @param {object|undefined} match the local match row
 * @param {{ now?: Date }} [opts]
 */
export function remarksSnapshotJob(match, { now = new Date() } = {}) {
  if (!match?.seed_key || match.test === true) return null
  return job(match.seed_key, match.remarks, now)
}

function afterCommit(tx, fn) {
  const run = () => {
    try { fn() } catch (e) { console.warn('[RemarksSync] queueing failed:', e?.message || e) }
  }
  try {
    if (tx && typeof tx.on === 'function') {
      tx.on('complete', run)
      return
    }
  } catch { /* fall through */ }
  setTimeout(run, 0)
}

const installedOn = new WeakSet()

/**
 * Install the db.matches hook (once per database). Called by db_beach.js at
 * module load; tests call it with their own database.
 * @param {import('dexie').Dexie} database
 */
export function installRemarksSyncHook(database) {
  if (!database?.matches?.hook || !database.sync_queue) return
  if (installedOn.has(database)) return
  installedOn.add(database)

  database.matches.hook('updating', function (mods, primKey, obj, tx) {
    try {
      if (!mods || !obj || !Object.prototype.hasOwnProperty.call(mods, 'remarks')) return
      const j = remarksSyncJob(obj, { ...obj, ...mods })
      if (!j) return
      const names = tx?.storeNames || []
      if (names.includes('sync_queue')) {
        tx.table('sync_queue').add(j).catch((e) => console.warn('[RemarksSync] in-transaction job failed:', e?.message || e))
        return
      }
      afterCommit(tx, () => {
        Promise.resolve(database.sync_queue.add(j)).catch((e) => console.warn('[RemarksSync] job failed:', e?.message || e))
      })
    } catch (e) {
      console.warn('[RemarksSync] hook failed:', e?.message || e)
    }
  })
}
