/**
 * Signatures: saved the moment a pad is confirmed, and changed (Re-sign /
 * Clear) after they were collected. Ported from OpenVolley's
 * utils/saveSignature.js and domain/signatureEdits.js (703cfa9c, b1b15d8f,
 * 17c1f669), with OpenBeach's fields: team1 / team2, captains (and coaches
 * when the match has them) before the match, the post-match captains and
 * the officials after it.
 *
 * Every change is written to the match row at once and queued for the cloud
 * as the match's full `signatures` object, so a reload or a crash before the
 * screen is confirmed no longer loses a signature, and the other signatures
 * travel along and are never wiped. Test matches are saved locally, never
 * synced.
 */

/** The server keys of the pre-match signatures (coin toss, roster setup). */
export const PRE_MATCH_SIGNATURE_KEYS = Object.freeze({
  team1CaptainSignature: 'team1_captain',
  team2CaptainSignature: 'team2_captain',
  team1CoachSignature: 'team1_coach',
  team2CoachSignature: 'team2_coach'
})

/** The server keys of the post-match signatures (match end). */
export const POST_MATCH_SIGNATURE_KEYS = Object.freeze({
  team1PostGameCaptainSignature: 'team1_captain_post_game',
  team2PostGameCaptainSignature: 'team2_captain_post_game',
  asstScorerSignature: 'asst_scorer',
  scorerSignature: 'scorer',
  ref2Signature: 'ref2',
  ref1Signature: 'ref1'
})

/** The match-row field of a coin-toss pad ('team1-captain', 'team2-coach', ...), or null. */
export function signatureFieldOfRole(role) {
  return ({
    'team1-captain': 'team1CaptainSignature',
    'team2-captain': 'team2CaptainSignature',
    'team1-coach': 'team1CoachSignature',
    'team2-coach': 'team2CoachSignature'
  })[role] ?? null
}

/** Every post-match signature field emptied (match end "Reopen last set"). */
export function clearedPostMatchSignatures() {
  return Object.fromEntries(Object.keys(POST_MATCH_SIGNATURE_KEYS).map(field => [field, null]))
}

/**
 * Re-sign and Clear are closed once the match is approved or closed: the
 * signatures then belong to an approved sheet. "Reopen" opens them again.
 */
export function signatureEditLocked(match, { isApproved = false } = {}) {
  if (isApproved) return true
  if (!match) return false
  return match.approved === true || !!match.closed_at || match.status === 'approved' || match.status === 'final'
}

/**
 * The match's `signatures` JSONB as the cloud stores it: the pre-match
 * signatures ('' when missing, as the coin toss sends them) and the
 * post-match ones (null when missing or cleared).
 */
export function signaturesPayload(match) {
  const m = match || {}
  const out = {}
  for (const [field, key] of Object.entries(PRE_MATCH_SIGNATURE_KEYS)) out[key] = m[field] || ''
  for (const [field, key] of Object.entries(POST_MATCH_SIGNATURE_KEYS)) out[key] = m[field] || null
  return out
}

/**
 * The sync-queue job that sends the signatures of `match` (the row AFTER the
 * change), or null when the match does not sync: no seed_key, or a test match.
 */
export function signaturesSyncJob(match, now = new Date()) {
  if (!match?.seed_key || match.test) return null
  return {
    resource: 'match',
    action: 'update',
    payload: { id: match.seed_key, signatures: signaturesPayload(match) },
    ts: now.toISOString(),
    status: 'queued'
  }
}

/**
 * Save one signature to the match row, then queue the match's signatures for
 * the cloud. Returns true when it was written.
 *
 * @param {import('dexie').Dexie & { matches: any, sync_queue: any }} db
 * @param {number|string|null|undefined} matchId
 * @param {string|null} field  a match-row signature field (team1CaptainSignature, ...)
 * @param {string|null} image  the PNG data URL, null to clear
 * @param {object} [extra]  more fields written in the same update
 */
export async function saveMatchSignature(db, matchId, field, image, extra = null) {
  if (matchId === null || matchId === undefined || !field) return false
  try {
    await db.matches.update(matchId, { ...(extra || {}), [field]: image ?? null })
    const job = signaturesSyncJob(await db.matches.get(matchId))
    if (job) await db.sync_queue.add(job)
    return true
  } catch (err) {
    console.error('[signature] Could not save the signature:', err?.message)
    return false
  }
}
