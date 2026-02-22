import { supabase } from '../lib_beach/supabaseClient_beach'

/**
 * Upload scoresheet data as JSON to Supabase storage.
 * PDFs are generated on-demand at scoresheet.openvolley.app/storage
 * Uploads to: scoresheets/{scheduled_date}/game{n}.json (or game{n}_final.json if final=true)
 *
 * @param {Object} options
 * @param {Object} options.match - Match data
 * @param {Object} options.team1 - Team 1 data
 * @param {Object} options.team2 - Team 2 data
 * @param {Array} options.team1Players - Team 1 players
 * @param {Array} options.team2Players - Team 2 players
 * @param {Array} options.sets - Sets data
 * @param {Array} options.events - Events data
 * @param {boolean} options.final - If true, uploads as game{n}_final.json (approved match)
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
  if (!supabase || !match) {
    return { success: false, error: 'No supabase or match' }
  }

  // Skip test matches
  if (match.test) {
    return { success: false, error: 'Test match' }
  }

  try {
    // Normalize coinToss keys (team_1 -> team1) for scoresheet compatibility
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

    // Prepare scoresheet data as JSON
    // Use keys that eScoresheet_beach.tsx expects: team1Team/team2Team, team1Players/team2Players
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
      sets: (sets || []).map(({ matchId, lineupA, lineupB, serverNumber, ...rest }) => rest),
      events,
      uploadedAt: new Date().toISOString()
    }

    // Convert to JSON string
    const jsonString = JSON.stringify(scoresheetData)
    const jsonBlob = new Blob([jsonString], { type: 'application/json' })

    // Determine storage path: {scheduled_date}/game{n}.json or game{n}_final.json
    const scheduledDate = match.scheduledAt
      ? new Date(match.scheduledAt).toISOString().slice(0, 10) // YYYY-MM-DD
      : new Date().toISOString().slice(0, 10)

    const gameNumber = match.gameNumber || match.externalId || match.game_n || 'unknown'
    const suffix = final ? '_final' : ''
    const storagePath = `${scheduledDate}/game${gameNumber}${suffix}.json`

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
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
