/**
 * "Reopen match" after approval. Closing is locked on the server (db/007):
 * once a non-test match reached approved/final there, only an admin can
 * reopen it (POST /api/admin/matches/:id/reopen, audit-logged). This replaces
 * the old client-side reopen password.
 *
 * planReopen decides; MatchEnd carries the decision out:
 * - 'local'          test match or never-synced match (no seed_key): reopen
 *                    locally as before.
 * - 'localUnsynced'  the local queue PROVES no closing update reached the
 *                    server: it holds an unsent (queued / errored / refused)
 *                    closing job of this match and no sent one. Those jobs are
 *                    superseded and the match reopens locally without queuing
 *                    'ended'. The only offline path. No closing job at all is
 *                    no proof (sent jobs are pruned after 7 days, the match
 *                    may have been closed on another device or restored from
 *                    the cloud): then the server is asked.
 * - 'needsConnection' the server may have it closed and there is no connection.
 * - 'serverOpen'     the server has it open (an admin reopened it): reopen
 *                    locally without queuing.
 * - 'adminReopen'    closed on the server and this account is an admin.
 * - 'adminOnly'      closed on the server: only an admin can reopen it.
 * - 'checkFailed'    the server could not be asked.
 *
 * Ported from OpenVolley src/utils/matchReopen.js (2026-10-21): OpenBeach
 * reopened every match locally only, so a match the server had closed stayed
 * closed there and refused every later change. isKnownClosedOnServer is in
 * matchHandover_beach. The admin reopen is sport-blind on the server
 * (lib/accounts reopenMatch, by match id).
 */

import { jobMatchKey } from './syncIds_beach'
import { isScorerMoved } from './matchHandover_beach'

export const CLOSING_STATUSES = ['approved', 'final']

/**
 * A copy this device was still scoring (not ended / approved / final here)
 * whose match the server has closed: the server's closed_at on the row, or a
 * write the server refused as closed (cloudBlock OV_MATCH_CLOSED). Never a
 * test match; never a match another device took over (isScorerMoved).
 * Reads only local evidence, so it holds offline too: such a copy can no
 * longer be scored or synced (useSyncQueue_beach records the first write
 * refused as closed). (OpenVolley utils/matchReopen isStaleClosedCopy.)
 */
export function isStaleClosedCopy(match) {
  if (!match || match.test === true) return false
  if (isScorerMoved(match)) return false
  if (['ended', 'approved', 'final'].includes(match.status)) return false
  return !!match.closed_at || match.cloudBlock?.code === 'OV_MATCH_CLOSED'
}

/**
 * A copy whose match another device went on with: another device took it
 * over (OV_SCORER_MOVED, closed there or not: markScorerMoved makes a copy
 * closed there 'final'), or the server closed it while this device was still
 * scoring it (isStaleClosedCopy). Its state is older than the match's and
 * nothing scores it here any more, so the app writes no new backup file of
 * it (utils_beach/nativeBackup): opening such a copy wrote a fresh file of
 * it, the newest of the match with the older score (OpenVolley 2026-10-29,
 * match 406970). A copy this device ended or approved is never one: its
 * final state is this device's own. Never a test match. Reads only local
 * evidence. (OpenVolley utils/matchReopen isContinuedElsewhere.)
 */
export function isContinuedElsewhere(match) {
  if (!match || match.test === true) return false
  if (match.approved === true || match.status === 'ended') return false
  return isScorerMoved(match) || isStaleClosedCopy(match)
}

/** A sync job that marks its match approved/final on the server. */
export function isClosingSyncJob(job) {
  if (job?.resource !== 'match') return false
  const status = job.action === 'restore' ? job.payload?.match?.status : job.payload?.status
  return CLOSING_STATUSES.includes(status)
}

/**
 * @param {object} args
 * @param {object} args.match the local match row
 * @param {object[]} args.queue every sync_queue row (or at least this match's)
 * @param {boolean} args.online
 * @param {{isAdmin?: boolean, canManageTeams?: boolean}} [args.access]
 * @param {(seedKey: string) => Promise<{data: object|null, error: object|null}>} args.readServerMatch
 * @returns {Promise<{kind: string, row?: object, supersedeIds?: number[]}>}
 */
export async function planReopen({ match, queue, online, access, readServerMatch }) {
  if (!match || match.test || !match.seed_key) return { kind: 'local' }

  const closingJobs = (queue || []).filter(j => isClosingSyncJob(j) && jobMatchKey(j) === match.seed_key)
  const reached = closingJobs.some(j => j.status === 'sent' || j.status === 'sending')
  const unsent = closingJobs.filter(j => j.status === 'queued' || j.status === 'error' || j.status === 'failed')
  if (!reached && unsent.length > 0) {
    return { kind: 'localUnsynced', supersedeIds: unsent.map(j => j.id) }
  }

  if (!online) return { kind: 'needsConnection' }

  let result
  try {
    result = await readServerMatch(match.seed_key)
  } catch {
    return { kind: 'checkFailed' }
  }
  if (!result || result.error) return { kind: 'checkFailed' }
  const row = result.data
  // Not in the cloud (or not visible to this account): nothing is closed there
  if (!row) return { kind: 'serverOpen' }
  const closed = row.closed_at
    ? true
    : (!('closed_at' in row) && CLOSING_STATUSES.includes(row.status))
  if (!closed) return { kind: 'serverOpen', row }
  // An admin, or a beach competition manager (owner, 2026-10-21; /api/me's
  // beach canManageTeams): the server reopens a beach match for both
  if (access?.isAdmin || access?.canManageTeams === true) return { kind: 'adminReopen', row }
  return { kind: 'adminOnly', row }
}
