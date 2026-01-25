/**
 * Backup Manager - Handles automatic backup to file system
 *
 * Chrome/Edge: Uses File System Access API for direct folder writes
 * Safari/Firefox: Falls back to periodic auto-downloads
 */

import { db } from '../db_beach/db_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import { sanitizeSimple } from './stringUtils'

// IndexedDB key for storing file system directory handle
const BACKUP_DB_NAME = 'escoresheet_backup'
const BACKUP_DIR_HANDLE_KEY = 'backup_directory_handle'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'

// Valid Supabase matches table columns - used to filter restore payloads
// to prevent sending invalid columns that don't exist in the schema
const VALID_MATCH_COLUMNS = [
  'external_id', 'game_n', 'game_pin', 'status', 'connections', 'connection_pins',
  'scheduled_at', 'match_info', 'officials', 'team1_team', 'players_team1',
  'team2_team', 'players_team2', 'coin_toss', 'results', 'signatures',
  'approval', 'test', 'created_at', 'updated_at', 'manual_changes', 'current_set',
  'set_results', 'final_score', 'sanctions', 'winner', 'sport_type'
]

/**
 * Filter match payload to only include valid Supabase columns
 * Prevents sync errors from old backup formats with invalid column names
 */
function filterMatchPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => VALID_MATCH_COLUMNS.includes(key))
  )
}

/**
 * Check if File System Access API is available
 */
export function isFileSystemAccessSupported() {
  return 'showDirectoryPicker' in window
}

/**
 * Store directory handle in IndexedDB for persistence
 */
export async function storeDirectoryHandle(handle) {
  return new Promise((resolve, reject) => {
    const dbRequest = indexedDB.open(BACKUP_DB_NAME, 1)

    dbRequest.onerror = () => reject(dbRequest.error)
    dbRequest.onupgradeneeded = (event) => {
      const database = event.target.result
      if (!database.objectStoreNames.contains('handles')) {
        database.createObjectStore('handles')
      }
    }
    dbRequest.onsuccess = () => {
      const database = dbRequest.result
      const tx = database.transaction('handles', 'readwrite')
      const store = tx.objectStore('handles')
      store.put(handle, BACKUP_DIR_HANDLE_KEY)
      tx.oncomplete = () => {
        database.close()
        resolve()
      }
      tx.onerror = () => {
        database.close()
        reject(tx.error)
      }
    }
  })
}

/**
 * Retrieve stored directory handle from IndexedDB
 */
export async function getStoredDirectoryHandle() {
  return new Promise((resolve, reject) => {
    const dbRequest = indexedDB.open(BACKUP_DB_NAME, 1)

    dbRequest.onerror = () => reject(dbRequest.error)
    dbRequest.onupgradeneeded = (event) => {
      const database = event.target.result
      if (!database.objectStoreNames.contains('handles')) {
        database.createObjectStore('handles')
      }
    }
    dbRequest.onsuccess = () => {
      const database = dbRequest.result
      const tx = database.transaction('handles', 'readonly')
      const store = tx.objectStore('handles')
      const request = store.get(BACKUP_DIR_HANDLE_KEY)
      request.onsuccess = () => {
        database.close()
        resolve(request.result || null)
      }
      request.onerror = () => {
        database.close()
        reject(request.error)
      }
    }
  })
}

/**
 * Clear stored directory handle from IndexedDB
 */
export async function clearStoredDirectoryHandle() {
  return new Promise((resolve, reject) => {
    const dbRequest = indexedDB.open(BACKUP_DB_NAME, 1)

    dbRequest.onerror = () => reject(dbRequest.error)
    dbRequest.onupgradeneeded = (event) => {
      const database = event.target.result
      if (!database.objectStoreNames.contains('handles')) {
        database.createObjectStore('handles')
      }
    }
    dbRequest.onsuccess = () => {
      const database = dbRequest.result
      const tx = database.transaction('handles', 'readwrite')
      const store = tx.objectStore('handles')
      store.delete(BACKUP_DIR_HANDLE_KEY)
      tx.oncomplete = () => {
        database.close()
        resolve()
      }
      tx.onerror = () => {
        database.close()
        reject(tx.error)
      }
    }
  })
}

/**
 * Request permission for directory handle
 */
export async function verifyDirectoryPermission(handle) {
  if (!handle) return false

  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') return true

    const requestResult = await handle.requestPermission({ mode: 'readwrite' })
    return requestResult === 'granted'
  } catch {
    return false
  }
}

/**
 * Select backup directory using File System Access API
 */
export async function selectBackupDirectory() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API not supported in this browser')
  }

  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents'
  })

  await storeDirectoryHandle(handle)
  return handle
}

/**
 * Export a single match with all related data
 */
export async function exportMatchData(matchId) {
  const match = await db.matches.get(matchId)
  if (!match) throw new Error('Match not found')

  // Get related data
  const [team1, team2] = await Promise.all([
    match.team1Id ? db.teams.get(match.team1Id) : null,
    match.team2Id ? db.teams.get(match.team2Id) : null
  ])

  const [team1Players, team2Players] = await Promise.all([
    match.team1Id ? db.players.where('teamId').equals(match.team1Id).toArray() : [],
    match.team2Id ? db.players.where('teamId').equals(match.team2Id).toArray() : []
  ])

  const sets = await db.sets.where('matchId').equals(matchId).toArray()
  const events = await db.events.where('matchId').equals(matchId).toArray()

  return {
    version: 1, // Schema version for future compatibility
    lastUpdated: new Date().toISOString(),
    match,
    team1,
    team2,
    team1Players,
    team2Players,
    sets,
    events
  }
}

/**
 * Generate backup filename with UTC timestamp
 * Format: backup_g[gameN]_set[setN]_scoreleft[left]_scoreright[right]_[yyyymmdd]_[hhmm].json
 */
export function generateBackupFilename(data) {
  const gameN = data?.match?.gameN || data?.match?.game_n || 1

  // Get latest set info
  let setIndex = 1
  let leftScore = 0
  let rightScore = 0
  if (data?.sets?.length > 0) {
    const latestSet = data.sets.sort((a, b) => (b.index || 0) - (a.index || 0))[0]
    if (latestSet) {
      setIndex = latestSet.index || 1
      leftScore = latestSet.team1Points || 0
      rightScore = latestSet.team2Points || 0
    }
  }

  // Generate UTC timestamp in yyyymmdd_hhmm format
  const now = new Date()
  const utcDate = now.toISOString().slice(0, 10).replace(/-/g, '') // yyyymmdd
  const utcTime = now.toISOString().slice(11, 16).replace(':', '') // hhmm

  return `backup_g${gameN}_set${setIndex}_scoreleft${leftScore}_scoreright${rightScore}_${utcDate}_${utcTime}.json`
}

/**
 * Write match backup to file system (Chrome/Edge)
 */
export async function writeMatchBackup(matchId, directoryHandle) {
  const data = await exportMatchData(matchId)
  const filename = generateBackupFilename(data)

  try {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
    return { success: true, filename }
  } catch (error) {
    console.error('Error writing backup:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Download match backup as file (Safari/Firefox fallback)
 */
export async function downloadMatchBackup(matchId) {
  const data = await exportMatchData(matchId)
  const filename = generateBackupFilename(data)

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return filename
}

/**
 * Restore match from JSON backup data
 * WIPE & REPLACE: Clears all local match data, restores from backup, queues Supabase sync
 */
export async function restoreMatchFromJson(jsonData) {
  // Validate schema
  if (!jsonData.version || !jsonData.match) {
    throw new Error('Invalid backup file format')
  }

  const { match, team1, team2, team1Players, team2Players, sets, events } = jsonData

  // Get external_id for Supabase sync (seed_key in local, external_id in backup)
  const externalId = match.seed_key || match.seedKey || match.external_id
  if (!externalId) {
    console.warn('[Restore] No external_id found - Supabase sync will be skipped')
  }

  let restoredMatchId = null

  // Start transaction - WIPE then RESTORE
  await db.transaction('rw', db.matches, db.teams, db.players, db.sets, db.events, db.sync_queue, async () => {
    // STEP A: WIPE ALL existing match data from IndexedDB
    // (Keep teams/players/referees/scorers as they're reusable)
    await db.events.clear()
    await db.sets.clear()
    await db.matches.clear()
    await db.sync_queue.clear()

    // STEP B: Create teams (reuse existing or create new)
    let team1Id = null
    let team2Id = null

    if (team1) {
      const existingTeam1 = await db.teams.where('name').equals(team1.name).first()
      if (existingTeam1) {
        team1Id = existingTeam1.id
        await db.teams.update(team1Id, {
          ...team1,
          id: team1Id,
          updatedAt: new Date().toISOString()
        })
      } else {
        team1Id = await db.teams.add({
          ...team1,
          id: undefined,
          createdAt: new Date().toISOString()
        })
      }
    }

    if (team2) {
      const existingTeam2 = await db.teams.where('name').equals(team2.name).first()
      if (existingTeam2) {
        team2Id = existingTeam2.id
        await db.teams.update(team2Id, {
          ...team2,
          id: team2Id,
          updatedAt: new Date().toISOString()
        })
      } else {
        team2Id = await db.teams.add({
          ...team2,
          id: undefined,
          createdAt: new Date().toISOString()
        })
      }
    }

    // Create match with ID=1 (always single match in session)
    const matchId = await db.matches.add({
      ...match,
      id: 1, // Fixed ID for single match
      team1Id,
      team2Id,
      seed_key: externalId, // Ensure seed_key is set for sync
      restoredAt: new Date().toISOString()
    })

    restoredMatchId = matchId

    // Delete existing players for these teams and recreate
    if (team1Id) {
      await db.players.where('teamId').equals(team1Id).delete()
    }
    if (team2Id) {
      await db.players.where('teamId').equals(team2Id).delete()
    }

    // Create players
    if (team1Players?.length && team1Id) {
      for (const player of team1Players) {
        await db.players.add({
          ...player,
          id: undefined,
          teamId: team1Id
        })
      }
    }

    if (team2Players?.length && team2Id) {
      for (const player of team2Players) {
        await db.players.add({
          ...player,
          id: undefined,
          teamId: team2Id
        })
      }
    }

    // Create sets with sequential IDs
    if (sets?.length) {
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i]
        await db.sets.add({
          ...set,
          id: i + 1, // Sequential IDs
          matchId
        })
      }
    }

    // Create events with sequential IDs
    if (events?.length) {
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        await db.events.add({
          ...event,
          id: i + 1, // Sequential IDs
          matchId
        })
      }
    }

    // STEP C: Queue Supabase 'restore' sync job (DELETE first, then UPSERT)
    if (externalId) {

      // Build match payload for Supabase (convert local field names to Supabase column names)
      const matchPayload = {
        external_id: externalId,
        sport_type: SPORT_TYPE,
        game_pin: match.gamePin || match.game_pin,
        game_n: match.gameN || match.game_n,
        status: match.status || 'live',
        team1_team: team1 ? {
          name: team1.name,
          short_name: team1.shortName || team1.short_name,
          color: team1.color
        } : null,
        team2_team: team2 ? {
          name: team2.name,
          short_name: team2.shortName || team2.short_name,
          color: team2.color
        } : null,
        players_team1: team1Players || [],
        players_team2: team2Players || [],
        // Include match_info fields (stored as JSONB)
        match_info: {
          hall: match.hall,
          city: match.city,
          league: match.league,
          championship_type: match.championshipType || match.championship_type,
          ...(match.matchInfo || match.match_info || {})
        },
        coin_toss: {
          confirmed: match.coinTossConfirmed || match.coin_toss_confirmed,
          team_a: match.coinTossTeamA || match.coin_toss_team_a,
          team_b: match.coinTossTeamB || match.coin_toss_team_b,
          first_serve: match.firstServe || match.first_serve,
          ...(match.coinToss || match.coin_toss || {})
        }
      }

      // Build sets payload (convert local to Supabase format)
      const setsPayload = (sets || []).map(s => ({
        external_id: s.externalId || s.external_id || `${externalId}_set_${s.index}`,
        index: s.index,
        team1_points: s.team1Points ?? s.team1_points ?? 0,
        team2_points: s.team2Points ?? s.team2_points ?? 0,
        finished: s.finished || false,
        start_time: s.startTime || s.start_time,
        end_time: s.endTime || s.end_time
      }))

      // Build events payload (convert local to Supabase format)
      const eventsPayload = (events || []).map(e => ({
        external_id: e.externalId || e.external_id || `${externalId}_event_${e.seq || e.id}`,
        set_index: e.setIndex ?? e.set_index,
        type: e.type,
        payload: e.payload,
        ts: e.ts,
        seq: e.seq
      }))

      // Build live state payload from latest set data
      const latestSet = sets?.length > 0
        ? [...sets].sort((a, b) => (b.index || 0) - (a.index || 0))[0]
        : null
      const finishedSets = (sets || []).filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => (s.team1Points ?? s.team1_points ?? 0) > (s.team2Points ?? s.team2_points ?? 0)).length
      const team2SetsWon = finishedSets.filter(s => (s.team2Points ?? s.team2_points ?? 0) > (s.team1Points ?? s.team1_points ?? 0)).length

      const liveStatePayload = {
        current_set: latestSet?.index || 1,
        points_a: latestSet?.team1Points ?? latestSet?.team1_points ?? 0,
        points_b: latestSet?.team2Points ?? latestSet?.team2_points ?? 0,
        sets_won_a: team1SetsWon,
        sets_won_b: team2SetsWon,
        status: match.status || 'live'
      }

      // Queue the restore job (filter payload to valid columns only)
      await db.sync_queue.add({
        resource: 'match',
        action: 'restore',
        payload: {
          match: filterMatchPayload(matchPayload),
          sets: setsPayload,
          events: eventsPayload,
          liveState: liveStatePayload
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })

      console.debug('[BackupManager] Queued restore sync job:', {
        matchId: externalId,
        setsCount: setsPayload.length,
        eventsCount: eventsPayload.length
      })
    }
  })

  return restoredMatchId
}

/**
 * Restore match in place - overwrite existing match with backup data
 * Used for cloud backup restore during active match
 * IMPORTANT: Queues sync job to update match_live_state in Supabase
 */
export async function restoreMatchInPlace(matchId, jsonData) {
  if (!jsonData.version || !jsonData.match) {
    throw new Error('Invalid backup file format')
  }

  const { match, team1, team2, team1Players, team2Players, sets, events } = jsonData

  // Get external_id for Supabase sync
  const externalId = match.seed_key || match.seedKey || match.external_id
  if (!externalId) {
    console.warn('[RestoreInPlace] No external_id found - Supabase sync will be skipped')
  }

  await db.transaction('rw', db.matches, db.sets, db.events, db.sync_queue, async () => {
    // Update match data (keep same ID)
    await db.matches.update(matchId, {
      ...match,
      id: matchId,
      seed_key: externalId, // Ensure seed_key is set for sync
      restoredAt: new Date().toISOString()
    })

    // Delete existing sets and events for this match
    await db.sets.where('matchId').equals(matchId).delete()
    await db.events.where('matchId').equals(matchId).delete()

    // Recreate sets
    if (sets?.length) {
      for (const set of sets) {
        await db.sets.add({
          ...set,
          id: undefined,
          matchId
        })
      }
    }

    // Recreate events
    if (events?.length) {
      for (const event of events) {
        await db.events.add({
          ...event,
          id: undefined,
          matchId
        })
      }
    }

    // Queue Supabase 'restore' sync job (same as restoreMatchFromJson)
    if (externalId) {

      // Build match payload for Supabase
      const matchPayload = {
        external_id: externalId,
        sport_type: SPORT_TYPE,
        game_pin: match.gamePin || match.game_pin,
        game_n: match.gameN || match.game_n,
        status: match.status || 'live',
        team1_team: team1 ? {
          name: team1.name,
          short_name: team1.shortName || team1.short_name,
          color: team1.color
        } : (match.team1_team || null),
        team2_team: team2 ? {
          name: team2.name,
          short_name: team2.shortName || team2.short_name,
          color: team2.color
        } : (match.team2_team || null),
        players_team1: team1Players || match.players_team1 || [],
        players_team2: team2Players || match.players_team2 || [],
        // Include match_info fields (stored as JSONB)
        match_info: {
          hall: match.hall,
          city: match.city,
          league: match.league,
          championship_type: match.championshipType || match.championship_type,
          ...(match.matchInfo || match.match_info || {})
        },
        coin_toss: {
          confirmed: match.coinTossConfirmed || match.coin_toss_confirmed,
          team_a: match.coinTossTeamA || match.coin_toss_team_a,
          team_b: match.coinTossTeamB || match.coin_toss_team_b,
          first_serve: match.firstServe || match.first_serve,
          ...(match.coinToss || match.coin_toss || {})
        }
      }

      // Build sets payload
      const setsPayload = (sets || []).map(s => ({
        external_id: s.externalId || s.external_id || `${externalId}_set_${s.index}`,
        index: s.index,
        team1_points: s.team1Points ?? s.team1_points ?? 0,
        team2_points: s.team2Points ?? s.team2_points ?? 0,
        finished: s.finished || false,
        start_time: s.startTime || s.start_time,
        end_time: s.endTime || s.end_time
      }))

      // Build events payload
      const eventsPayload = (events || []).map(e => ({
        external_id: e.externalId || e.external_id || `${externalId}_event_${e.seq || e.id}`,
        set_index: e.setIndex ?? e.set_index,
        type: e.type,
        payload: e.payload,
        ts: e.ts,
        seq: e.seq
      }))

      // Build live state payload from latest set data
      const latestSet = sets?.length > 0
        ? [...sets].sort((a, b) => (b.index || 0) - (a.index || 0))[0]
        : null
      const finishedSets = (sets || []).filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => (s.team1Points ?? s.team1_points ?? 0) > (s.team2Points ?? s.team2_points ?? 0)).length
      const team2SetsWon = finishedSets.filter(s => (s.team2Points ?? s.team2_points ?? 0) > (s.team1Points ?? s.team1_points ?? 0)).length

      const liveStatePayload = {
        current_set: latestSet?.index || 1,
        points_a: latestSet?.team1Points ?? latestSet?.team1_points ?? 0,
        points_b: latestSet?.team2Points ?? latestSet?.team2_points ?? 0,
        sets_won_a: team1SetsWon,
        sets_won_b: team2SetsWon,
        status: match.status || 'live'
      }

      // Queue the restore job (filter payload to valid columns only)
      await db.sync_queue.add({
        resource: 'match',
        action: 'restore',
        payload: {
          match: filterMatchPayload(matchPayload),
          sets: setsPayload,
          events: eventsPayload,
          liveState: liveStatePayload
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })

      console.debug('[BackupManager] Queued restore in place sync job:', {
        matchId: externalId,
        setsCount: setsPayload.length,
        eventsCount: eventsPayload.length,
        liveState: liveStatePayload
      })
    }
  })

  return matchId
}

/**
 * Fetch match from Supabase by Game N and Game PIN
 * Uses JSONB columns for team/player data (teams/players tables were dropped)
 */
export async function fetchMatchByPin(gamePin, gameN) {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  // Find match by game_n and game_pin (filtered by sport_type)
  let query = supabase
    .from('matches')
    .select('*')
    .eq('game_pin', gamePin)
    .eq('sport_type', SPORT_TYPE)

  // If gameN provided, also filter by game_n
  if (gameN) {
    query = query.eq('game_n', parseInt(gameN, 10))
  }

  const { data: matchData, error: matchError } = await query.maybeSingle()

  if (matchError) throw matchError
  if (!matchData) throw new Error('Match not found with this ID and PIN')

  // Fetch sets, events, and live state using the UUID match id
  const [setsResult, eventsResult, liveStateResult] = await Promise.all([
    supabase.from('sets').select('*').eq('match_id', matchData.id),
    supabase.from('events').select('*').eq('match_id', matchData.id),
    supabase.from('match_live_state').select('*').eq('match_id', matchData.id).maybeSingle()
  ])

  let events = eventsResult.data || []
  const liveState = liveStateResult.data

  console.debug('[BackupManager] Fetched match data from Supabase:', {
    matchId: matchData.id,
    matchStatus: matchData.status,
    setsCount: setsResult.data?.length || 0,
    eventsCount: events.length,
    hasLiveState: !!liveState,
    liveStatePoints: liveState ? `${liveState.points_a}-${liveState.points_b}` : 'N/A',
    liveStateSet: liveState?.current_set,
    hasLineupA: !!liveState?.lineup_a,
    hasLineupB: !!liveState?.lineup_b
  })

  // Helper: Extract player numbers from rich format lineup
  const extractLineupNumbers = (lineup) => {
    if (!lineup) return null
    const result = {}
    for (const pos of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
      if (lineup[pos]) {
        // Rich format has { number, isServing, ... }, legacy format is just a number
        result[pos] = typeof lineup[pos] === 'object' && lineup[pos].number !== undefined
          ? lineup[pos].number
          : lineup[pos]
      }
    }
    return Object.keys(result).length > 0 ? result : null
  }

  // Check if events already have lineup type events
  const hasLineupTypeEvents = events.some(e => e.type === 'lineup')

  // If no lineup type events, create them from event lineup_left/lineup_right columns
  // or from match_live_state
  if (!hasLineupTypeEvents) {
    const teamAIsTeam1 = matchData.coin_toss_team_a === 'team1'

    // First try: get lineup from the latest event that has lineup_left/lineup_right
    const eventWithLineup = [...events]
      .sort((a, b) => (b.seq || 0) - (a.seq || 0))
      .find(e => e.lineup_left || e.lineup_right)

    if (eventWithLineup) {
      const setIndex = eventWithLineup.set_index || 1
      // Determine left/right to team1/team2 mapping from the event
      // lineup_left/lineup_right are stored by court position, need to map to team
      // For now, use coin_toss_team_a to determine
      const leftIsTeam1 = (setIndex % 2 === 1) ? (teamAIsTeam1) : (!teamAIsTeam1)

      const team1RawLineup = leftIsTeam1 ? eventWithLineup.lineup_left : eventWithLineup.lineup_right
      const team2RawLineup = leftIsTeam1 ? eventWithLineup.lineup_right : eventWithLineup.lineup_left
      const team1Lineup = extractLineupNumbers(team1RawLineup)
      const team2Lineup = extractLineupNumbers(team2RawLineup)

      console.debug('[BackupManager] Extracted lineups from event:', {
        eventSeq: eventWithLineup.seq,
        setIndex,
        leftIsTeam1,
        team1Lineup,
        team2Lineup,
        rawLineupLeft: eventWithLineup.lineup_left,
        rawLineupRight: eventWithLineup.lineup_right
      })

      if (team1Lineup) {
        const payload = { team: 'team1', lineup: team1Lineup, isInitial: true }
        events.push({
          type: 'lineup',
          set_index: setIndex,
          seq: 0.5,
          payload,
          ts: eventWithLineup.ts || new Date().toISOString()
        })
      }
      if (team2Lineup) {
        const payload = { team: 'team2', lineup: team2Lineup, isInitial: true }
        events.push({
          type: 'lineup',
          set_index: setIndex,
          seq: 0.6,
          payload,
          ts: eventWithLineup.ts || new Date().toISOString()
        })
      }
    } else if (liveState) {
      // Fallback: get lineup from match_live_state
      const currentSet = liveState.current_set || 1
      const lineupANumbers = extractLineupNumbers(liveState.lineup_a)
      const lineupBNumbers = extractLineupNumbers(liveState.lineup_b)

      if (lineupANumbers) {
        const payload = {
          team: teamAIsTeam1 ? 'team1' : 'team2',
          lineup: lineupANumbers,
          isInitial: true
        }
        events.push({
          type: 'lineup',
          set_index: currentSet,
          seq: 0.5,
          payload,
          ts: liveState.updated_at || new Date().toISOString()
        })
      }

      if (lineupBNumbers) {
        const payload = {
          team: teamAIsTeam1 ? 'team2' : 'team1',
          lineup: lineupBNumbers,
          isInitial: true
        }
        events.push({
          type: 'lineup',
          set_index: currentSet,
          seq: 0.6,
          payload,
          ts: liveState.updated_at || new Date().toISOString()
        })
      }
    }
  }

  return {
    match: matchData,
    // JSONB data is already in matchData: team1_team, team2_team, players_team1, players_team2, officials
    sets: setsResult.data || [],
    events,
    liveState // Include live state for additional data
  }
}

/**
 * Import match data from Supabase to local Dexie
 * Uses JSONB columns for team/player data (teams/players tables were dropped)
 */
export async function importMatchFromSupabase(cloudData) {
  const { match, sets, events } = cloudData

  let importedMatchId = null

  await db.transaction('rw', db.matches, db.teams, db.players, db.sets, db.events, async () => {
    // Extract team data from JSONB columns
    const team1Data = match.team1_team || {}
    const team2Data = match.team2_team || {}
    const playersTeam1 = match.players_team1 || []
    const playersTeam2 = match.players_team2 || []

    // Create local teams (always create new teams for imported matches to avoid duplicates)
    let team1Id = null
    let team2Id = null

    if (team1Data.name) {
      team1Id = await db.teams.add({
        name: team1Data.name,
        shortName: team1Data.short_name,
        color: team1Data.color,
        createdAt: new Date().toISOString()
      })
    }

    if (team2Data.name) {
      team2Id = await db.teams.add({
        name: team2Data.name,
        shortName: team2Data.short_name,
        color: team2Data.color,
        createdAt: new Date().toISOString()
      })
    }

    // Extract JSONB data with fallback to legacy columns
    const matchInfo = match.match_info || {}
    const coinToss = match.coin_toss || {}
    const signatures = match.signatures || {}
    const results = match.results || {}
    const approval = match.approval || {}
    const connections = match.connections || {}
    const connectionPins = match.connection_pins || {}

    // Create match with all JSONB data (prefer JSONB, fallback to legacy)
    const localMatchId = await db.matches.add({
      team1Id,
      team2Id,
      status: match.status,
      scheduledAt: match.scheduled_at,
      // Match info: prefer JSONB, fallback to legacy
      hall: matchInfo.hall || match.hall,
      city: matchInfo.city || match.city,
      league: matchInfo.league || match.league,
      championshipType: matchInfo.championship_type || match.championship_type,
      refereePin: match.referee_pin,
      gamePin: match.game_pin,
      gameN: match.game_n,
      gameNumber: match.game_n ? String(match.game_n) : null, // Also set gameNumber
      test: match.test || false,
      seed_key: match.external_id,
      // Short names at match level (for easy access)
      team1ShortName: team1Data.short_name || null,
      team2ShortName: team2Data.short_name || null,
      // JSONB data stored locally
      officials: match.officials || [],
      // Signatures: prefer JSONB, fallback to legacy
      team1CaptainSignature: signatures.team1_captain || match.team1_captain_signature,
      team2CaptainSignature: signatures.team2_captain || match.team2_captain_signature,
      team1CaptainPostGameSignature: signatures.team1_captain_post_game || match.team1_captain_post_game_signature,
      team2CaptainPostGameSignature: signatures.team2_captain_post_game || match.team2_captain_post_game_signature,
      refereeSignature: signatures.referee || match.referee_signature,
      scorerSignature: signatures.scorer || match.scorer_signature,
      // Coin toss: prefer JSONB, fallback to legacy
      coinTossConfirmed: coinToss.confirmed !== undefined ? coinToss.confirmed : match.coin_toss_confirmed,
      coinTossTeamA: coinToss.team_a || match.coin_toss_team_a,
      coinTossTeamB: coinToss.team_b || match.coin_toss_team_b,
      coinTossServeA: coinToss.serve_a !== undefined ? coinToss.serve_a : match.coin_toss_serve_a,
      firstServe: coinToss.first_serve || match.first_serve,
      // Match result: prefer JSONB, fallback to legacy
      setResults: results.set_results || match.set_results,
      winner: results.winner || match.winner,
      finalScore: results.final_score || match.final_score,
      sanctions: results.sanctions || match.sanctions,
      // Approval: prefer JSONB, fallback to legacy
      approved: approval.approved !== undefined ? approval.approved : match.approved,
      approvedAt: approval.approved_at || match.approved_at,
      // Connection settings: prefer JSONB, fallback to legacy
      refereeConnectionEnabled: connections.referee_enabled !== undefined ? connections.referee_enabled : match.referee_connection_enabled,
      refereePin: connectionPins.referee || match.referee_pin,
      team1UploadPin: connectionPins.upload_team1 || match.team1_team_upload_pin,
      team2UploadPin: connectionPins.upload_team2 || match.team2_team_upload_pin,
      // Pending rosters: prefer JSONB, fallback to legacy
      pendingteam1Roster: connections.pending_team1_roster || match.pending_team1_roster,
      pendingTeam2Roster: connections.pending_team2_roster || match.pending_team2_roster,
      // Import metadata
      importedFrom: 'supabase',
      importedAt: new Date().toISOString(),
      createdAt: match.created_at || new Date().toISOString(),
      // Mark match info as confirmed since we're restoring an existing match
      matchInfoConfirmedAt: match.created_at || new Date().toISOString()
    })

    importedMatchId = localMatchId

    // Create players from JSONB arrays (fresh teams, so no duplicates)
    if (playersTeam1.length && team1Id) {
      for (const p of playersTeam1) {
        await db.players.add({
          teamId: team1Id,
          number: p.number,
          name: `${p.last_name || ''} ${p.first_name || ''}`.trim(),
          firstName: p.first_name,
          lastName: p.last_name,
          dob: p.dob,
          isCaptain: p.is_captain,
          createdAt: new Date().toISOString()
        })
      }
    }

    if (playersTeam2.length && team2Id) {
      for (const p of playersTeam2) {
        await db.players.add({
          teamId: team2Id,
          number: p.number,
          name: `${p.last_name || ''} ${p.first_name || ''}`.trim(),
          firstName: p.first_name,
          lastName: p.last_name,
          dob: p.dob,
          isCaptain: p.is_captain,
          createdAt: new Date().toISOString()
        })
      }
    }

    // Create sets
    for (const set of sets) {
      await db.sets.add({
        matchId: localMatchId,
        index: set.index,
        team1Points: set.team1_points,
        team2Points: set.team2_points,
        finished: set.finished,
        startTime: set.start_time,
        endTime: set.end_time,
        externalId: set.external_id
      })
    }

    // If no sets exist but match has coin toss confirmed or has events, create Set 1
    // This handles the case where a match was started but no rallies were played yet
    if (sets.length === 0 && (match.coin_toss_confirmed || events.length > 0)) {
      await db.sets.add({
        matchId: localMatchId,
        index: 1,
        team1Points: 0,
        team2Points: 0,
        finished: false
      })
    }

    // Create events
    for (const event of events) {
      await db.events.add({
        matchId: localMatchId,
        setIndex: event.set_index,
        type: event.type,
        payload: event.payload,
        ts: event.ts,
        seq: event.seq,
        externalId: event.external_id
      })
    }
  })

  return importedMatchId
}

/**
 * Select a backup file using file picker
 * Returns parsed JSON data or null if cancelled
 */
export async function selectBackupFile() {
  // Try File System Access API first (Chrome/Edge)
  if ('showOpenFilePicker' in window) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON Backup Files',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      })
      const file = await fileHandle.getFile()
      const text = await file.text()
      return JSON.parse(text)
    } catch (error) {
      if (error.name === 'AbortError') {
        return null // User cancelled
      }
      throw error
    }
  }

  // Fallback for Safari/Firefox - use hidden input
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'

    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) {
        resolve(null)
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text)
        resolve(data)
      } catch (error) {
        reject(new Error('Invalid JSON file'))
      }
    }

    input.oncancel = () => resolve(null)

    // Safari doesn't fire oncancel, so we use a focus event workaround
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          resolve(null)
        }
        window.removeEventListener('focus', handleFocus)
      }, 300)
    }
    window.addEventListener('focus', handleFocus)

    input.click()
  })
}

/**
 * List cloud backups from Supabase storage for a match
 * @param {string} gamePin - The 6-digit game PIN
 * @param {number} gameN - The game number (default 1)
 * @returns {Array} Array of backup file info
 */
export async function listCloudBackups(gamePin, gameN = 1) {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  // Use the same path format as logger.js continuous backups
  const folderPath = `backups/backup_g${gameN}`

  const { data, error } = await supabase
    .storage
    .from('backup')
    .list(folderPath, {
      sortBy: { column: 'name', order: 'desc' }
    })

  if (error) throw error

  // Parse filenames to extract useful info
  // Format: backup_g785111_set2_scoreleft23_scoreright23_20260105_113229_798.json
  return (data || [])
    .filter(f => f.name.endsWith('.json'))
    .map(f => {
      const match = f.name.match(/^backup_g(\d+)_set(\d+)_scoreleft(\d+)_scoreright(\d+)_(\d{8})_(\d{6})_(\d{3})\.json$/)
      if (match) {
        return {
          name: f.name,
          path: `${folderPath}/${f.name}`,
          gameN: parseInt(match[1]),
          setIndex: parseInt(match[2]),
          leftScore: parseInt(match[3]),
          rightScore: parseInt(match[4]),
          date: match[5],
          time: match[6],
          ms: match[7],
          created: f.created_at,
          size: f.metadata?.size || 0
        }
      }
      // Fallback for files that don't match the pattern
      return {
        name: f.name,
        path: `${folderPath}/${f.name}`,
        created: f.created_at,
        size: f.metadata?.size || 0
      }
    })
}

/**
 * Fetch a cloud backup file content
 * @param {string} path - Full path to the backup file
 * @returns {Object} Parsed JSON backup data
 */
export async function fetchCloudBackup(path) {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const { data, error } = await supabase
    .storage
    .from('backup')
    .download(path)

  if (error) throw error

  const text = await data.text()
  return JSON.parse(text)
}

/**
 * Get backup settings from localStorage
 */
export function getBackupSettings() {
  return {
    autoBackupEnabled: localStorage.getItem('autoBackupEnabled') === 'true',
    backupFrequencyMinutes: parseInt(localStorage.getItem('backupFrequencyMinutes') || '5', 10)
  }
}

/**
 * Save backup settings to localStorage
 */
export function saveBackupSettings(settings) {
  if (settings.autoBackupEnabled !== undefined) {
    localStorage.setItem('autoBackupEnabled', String(settings.autoBackupEnabled))
  }
  if (settings.backupFrequencyMinutes !== undefined) {
    localStorage.setItem('backupFrequencyMinutes', String(settings.backupFrequencyMinutes))
  }
}
