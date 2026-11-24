import { apiStorage } from '../lib_beach/apiClient_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'
import { SCORESHEET_UPLOAD_RESOURCE } from './syncIds_beach'

/**
 * Folder of every beach scoresheet in the shared 'scoresheets' bucket. Indoor
 * (OpenVolley) writes {date}/game{n}.json at the bucket root: without the
 * prefix a beach and an indoor game n on the same date overwrite each other.
 */
export const BEACH_SCORESHEET_PREFIX = 'beach'

/** YYYY-MM-DD of the match's scheduled date (today without one). */
export function scoresheetDate(match) {
  return match?.scheduledAt
    ? new Date(match.scheduledAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)
}

/**
 * Storage path of a beach scoresheet file:
 * beach/{scheduled_date}/game{n}_{seed_key}{_final}.{ext}
 *
 * The seed_key makes the key unique per match: two tournaments (or two
 * accounts) play a game n on the same date, and a storage key belongs to the
 * account that wrote it first (the second upload would be refused, or one
 * game would overwrite the other). A match without a seed_key keeps the old
 * game{n}{_final}.{ext}.
 * @param {object} match - local match (scheduledAt, gameNumber / externalId / game_n, seed_key)
 * @param {{ ext?: 'json'|'pdf', final?: boolean }} [options]
 */
export function scoresheetStoragePath(match, { ext = 'json', final = false } = {}) {
  const gameNumber = match?.gameNumber || match?.externalId || match?.game_n || 'unknown'
  const seed = match?.seed_key ? `_${String(match.seed_key).replace(/[^A-Za-z0-9_-]/g, '-')}` : ''
  return `${BEACH_SCORESHEET_PREFIX}/${scoresheetDate(match)}/game${gameNumber}${seed}${final ? '_final' : ''}.${ext}`
}

/**
 * A final scoresheet file name of a date folder (game{n}[_{seed}]_final.json):
 * its game number and the name of its PDF, or null for any other file.
 * @param {string} name
 * @returns {{ game: string, pdfName: string }|null}
 */
export function parseFinalScoresheetName(name) {
  const m = /^game(\d+)(_[A-Za-z0-9_-]+?)?_final\.json$/.exec(String(name || ''))
  if (!m) return null
  return { game: m[1], pdfName: `game${m[1]}${m[2] || ''}.pdf` }
}

/**
 * Upload the scoresheet PDF next to its JSON (scoresheetStoragePath, .pdf).
 * @param {object} match - local match
 * @param {Blob} blob - the PDF
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function uploadScoresheetPdf(match, blob) {
  if (!isBackendAvailable() || !match) return { success: false, error: 'No backend or match' }
  if (match.test) return { success: false, error: 'Test match' }
  if (!blob) return { success: false, error: 'No PDF' }
  const path = scoresheetStoragePath(match, { ext: 'pdf' })
  try {
    const { error } = await apiStorage
      .from('scoresheets')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (error) {
      console.warn('[scoresheetUploader] PDF upload failed:', error)
      return { success: false, error: error.message || 'Upload failed' }
    }
    return { success: true, path }
  } catch (err) {
    console.warn('[scoresheetUploader] PDF upload error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * The scoresheet JSON file of a match (what uploadScoresheet stores), with the
 * keys eScoresheet_beach.tsx reads (team1Team / team2Team, team1Players /
 * team2Players) and the coin toss keys normalised (team_1 -> team1).
 */
export function scoresheetJsonBlob({ match, team1, team2, team1Players, team2Players, sets, events }) {
  const normalizeTeamKey = (key) => {
    if (!key) return key
    if (key === 'team_1') return 'team1'
    if (key === 'team_2') return 'team2'
    return key
  }

  // Build match object with normalized coinTossData for PDF rendering
  const normalizedMatch = {
    ...match,
    sport_type: 'beach',
    team_1Country: match?.team1Country || '',
    team_2Country: match?.team2Country || '',
    coinTossTeamA: normalizeTeamKey(match?.coinTossTeamA),
    coinTossTeamB: normalizeTeamKey(match?.coinTossTeamB),
    coinTossData: {
      coinTossWinner: normalizeTeamKey(match?.coinTossWinner),
      teamA: normalizeTeamKey(match?.coinTossTeamA),
      teamB: normalizeTeamKey(match?.coinTossTeamB)
    }
  }

  const scoresheetData = {
    match: normalizedMatch,
    team1: team1,
    team2: team2,
    team1Team: team1,
    team2Team: team2,
    team_1Team: team1,
    team_2Team: team2,
    team1Players,
    team2Players,
    team_1Players: team1Players,
    team_2Players: team2Players,
    // eslint-disable-next-line no-unused-vars
    sets: (sets || []).map(({ matchId, lineupA, lineupB, serverNumber, ...rest }) => rest),
    events,
    uploadedAt: new Date().toISOString()
  }
  return new Blob([JSON.stringify(scoresheetData)], { type: 'application/json' })
}

/**
 * A sync_queue job that stores one scoresheet file (the approval's PDF or
 * final JSON) in the 'scoresheets' bucket. The job carries the file itself (a
 * Blob, kept by IndexedDB), so the queue retries it like the match's other
 * writes until it is stored, also after Close match has removed the match
 * from this device. They were uploaded once, at the approval: an approval
 * made while the venue Wi-Fi or the backend was down left the cloud without
 * the PDF for good (the manager's Scoresheets list: pdf false), with nothing
 * but a console warning (stress test 2026-10-25; OpenVolley ba894c6d).
 */
export function scoresheetUploadJob(match, path, file, contentType) {
  return {
    resource: SCORESHEET_UPLOAD_RESOURCE,
    action: 'upload',
    // match_external_id: the match the file belongs to (jobMatchKey)
    payload: { path, file, contentType, match_external_id: match?.seed_key || null },
    ts: new Date().toISOString(),
    status: 'queued'
  }
}

/** Store the file of a scoresheetUploadJob ({ data, error } as apiStorage). */
export function uploadQueuedScoresheet({ path, file, contentType } = {}) {
  return apiStorage.from('scoresheets').upload(path, file, { contentType, upsert: true })
}

/**
 * Upload scoresheet data as JSON to the backend's 'scoresheets' bucket.
 * Uploads to: scoresheets/beach/{scheduled_date}/game{n}_{seed}.json (or
 * ..._final.json if final=true), see scoresheetStoragePath.
 *
 * @param {Object} options
 * @param {Object} options.match - Match data
 * @param {Object} options.team1 - Team 1 data
 * @param {Object} options.team2 - Team 2 data
 * @param {Array} options.team1Players - Team 1 players
 * @param {Array} options.team2Players - Team 2 players
 * @param {Array} options.sets - Sets data
 * @param {Array} options.events - Events data
 * @param {boolean} options.final - If true, uploads as game{n}_{seed}_final.json (approved match)
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function uploadScoresheet({
  match,
  team1,
  team2,
  team1Players,
  team2Players,
  sets,
  events,
  final = false
}) {
  // Skip if no supabase or no match
  if (!isBackendAvailable() || !match) {
    return { success: false, error: 'No supabase or match' }
  }

  // Skip test matches
  if (match.test) {
    return { success: false, error: 'Test match' }
  }

  try {
    const jsonBlob = scoresheetJsonBlob({ match, team1, team2, team1Players, team2Players, sets, events })

    // beach/{scheduled_date}/game{n}_{seed}.json or ..._final.json
    const storagePath = scoresheetStoragePath(match, { final })

    // Upload to Supabase storage
    const { error: uploadError } = await apiStorage
      .from('scoresheets')
      .upload(storagePath, jsonBlob, {
        contentType: 'application/json',
        upsert: true // Overwrite if exists
      })

    if (uploadError) {
      console.warn('[scoresheetUploader] Failed to upload:', uploadError)
      return { success: false, error: uploadError.message }
    }

    return { success: true, path: storagePath }

  } catch (error) {
    console.error('[scoresheetUploader] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Upload scoresheet in the background (fire and forget)
 * Logs result but doesn't block the caller
 */
export function uploadScoresheetAsync(options) {
  uploadScoresheet(options)
    .then(result => {
      if (result.success) {
      } else {
        console.warn('[scoresheetUploader] Background upload failed:', result.error)
      }
    })
    .catch(err => {
      console.error('[scoresheetUploader] Background upload error:', err)
    })
}
