/**
 * What the backup files leave out of the match row, and what the coalescing
 * key of the app backups ignores.
 *
 * Backup files go to a folder or the Downloads of the scorer's device (and on
 * Android 10 and older, other apps can read them; on Android they stay after
 * an uninstall). Connection PINs, the game PIN and session ids are access
 * secrets, not scoring data: a restore keeps the PINs of the local copy it
 * replaces or makes new ones (backupManager_beach restoreMatchFromJson). The
 * cloud backup upload is unchanged.
 *
 * Ported from OpenVolley src/utils/nativeBackup/redact.js, with openbeach's
 * PIN names (team1Pin / team2Pin, team1UploadPin / team2UploadPin, matchPin).
 */

import { VOLATILE_MATCH_KEY } from './matchWriteHook_beach'

// The match-row PINs (local names, older spellings and cloud spellings)
export const MATCH_SECRET_FIELDS = [
  'gamePin', 'game_pin', 'matchPin',
  'refereePin', 'referee_pin',
  'team1Pin', 'team2Pin', 'team1TeamPin', 'team2TeamPin',
  'team1UploadPin', 'team2UploadPin', 'team1TeamUploadPin', 'team2TeamUploadPin',
  'homeTeamPin', 'awayTeamPin', 'homeTeamUploadPin', 'awayTeamUploadPin',
  'connection_pins', 'connectionPins',
  'sessionId', 'session_id'
]
// Any other PIN- or session-id-like key, so a new field is never written by accident
const SECRET_KEY = /(^|[a-z0-9_])pins?$|session_?id$|token$|secret/i

/** Marker in the file: the restore must not expect PINs in it. */
export const SECRETS_REMOVED = 'secretsRemoved'

/** The match row without PINs and session ids (a copy). */
export function redactMatch(match) {
  if (!match || typeof match !== 'object') return match
  const out = {}
  for (const [key, value] of Object.entries(match)) {
    if (MATCH_SECRET_FIELDS.includes(key) || SECRET_KEY.test(key)) continue
    out[key] = value
  }
  return out
}

/** A backup (exportMatchData) as written to a file: no secrets in the match row. */
export function redactBackup(data) {
  if (!data || typeof data !== 'object') return data
  return { ...data, match: redactMatch(data.match), [SECRETS_REMOVED]: true }
}

/** The match row without its bookkeeping fields (heartbeats, sessions, sync stamps, updatedAt). */
export function stableMatch(match) {
  if (!match || typeof match !== 'object') return match
  const out = {}
  for (const [key, value] of Object.entries(match)) {
    if (!VOLATILE_MATCH_KEY.test(key)) out[key] = value
  }
  return out
}
