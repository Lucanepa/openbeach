/**
 * Server Data Sync Service
 * Fetches match data from the main scoreboard server instead of using local IndexedDB
 */

import { apiFrom } from '../lib_beach/apiClient_beach'
import { isBackendAvailable, getApiUrl } from '../utils_beach/backendConfig_beach'
import { formatTimeLocal } from './timeUtils'

const SPORT_TYPE = 'beach'

/**
 * Generate a unique seed_key for a match
 * This is the stable identifier used for Supabase sync (stored as external_id)
 * Format: match_{timestamp}_{random} - never includes modifiable fields like gameN
 * @returns {string} Unique seed_key
 */
export function generateMatchSeedKey() {
  const timestamp = Date.now()
  const randomPart = Math.random().toString(36).substring(2, 8)
  return `match_${timestamp}_${randomPart}`
}

// Get server URL - checks for configured backend first, then falls back to current location
function getServerUrl() {
  // Check if we have a configured backend URL (cloud backend)
  const backendUrl = import.meta.env.VITE_BACKEND_URL

  if (backendUrl) {
    return backendUrl
  }

  // Fallback to local server (development or Electron)
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
  const hostname = window.location.hostname
  // In production (HTTPS), use same origin without port (Cloudflare handles routing)
  if (window.location.protocol === 'https:') {
    return `${protocol}://${hostname}`
  }
  const port = window.location.port || '5173'
  return `${protocol}://${hostname}:${port}`
}

// Get WebSocket URL - checks for configured backend first, then falls back to current location
function getWebSocketUrl() {
  // Check if we have a configured backend URL (cloud backend)
  const backendUrl = import.meta.env.VITE_BACKEND_URL

  if (backendUrl) {
    const url = new URL(backendUrl)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${url.host}`
  }

  // Fallback to local WebSocket server (development or Electron)
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const hostname = window.location.hostname
  // In production (HTTPS), use same origin without port (Cloudflare handles routing)
  if (window.location.protocol === 'https:') {
    return `${protocol}://${hostname}`
  }
  const wsPort = 8080 // Default WebSocket port for development
  return `${protocol}://${hostname}:${wsPort}`
}

// ---------------------------------------------------------------------------
// Match access after the PIN step (ported from OpenVolley serverDataSync.js)
// ---------------------------------------------------------------------------
// The relays and the backend hand out a match's bundle (rosters, events) only
// to a device that proved one of its PINs; everyone else gets the public
// summary (teams, status, score). A successful PIN check remembers, per match
// key, the PIN and the backend's match token, and every later subscribe /
// fetch of that match carries them (subscribe-match pin/token, the
// X-OV-Match-Pin / X-OV-Match-Token headers). In memory only: after a reload
// the apps re-check their stored PIN, which remembers it again.
const matchAccess = new Map() // String(match key) -> { pin, token, type? }
const MAX_MATCH_ACCESS = 16

/**
 * Remember what proves access to a match (after a successful PIN check).
 * `type` is the cloud PIN check's type (referee / bench_team1 / bench_team2):
 * with it an expired match token can be renewed with the same PIN.
 */
export function rememberMatchAccess(matchId, { pin = null, token = null, type = null } = {}) {
  if (matchId === undefined || matchId === null || (!pin && !token)) return
  const key = String(matchId)
  const prev = matchAccess.get(key) || {}
  matchAccess.delete(key)
  if (matchAccess.size >= MAX_MATCH_ACCESS) matchAccess.delete(matchAccess.keys().next().value)
  const entry = { pin: pin ? String(pin).trim() : prev.pin || null, token: token || prev.token || null }
  const kind = type || prev.type
  if (kind) entry.type = kind
  matchAccess.set(key, entry)
}

// Token renewals per match (at most one a minute)
const TOKEN_RENEW_MS = 60 * 1000
const tokenRenewedAt = new Map()

/**
 * The API fallback read a remembered match without its rosters: the match
 * token expired (or the backend restarted without a fixed token secret).
 * Renew it with the remembered PIN (cloud PIN check, at most once a minute).
 * @returns {Promise<boolean>} true when a new token was remembered
 */
async function renewMatchToken(matchId, row) {
  const a = matchAccessFor(matchId)
  if (!a?.pin || !a.type || !row || typeof row !== 'object' || 'players_team1' in row) return false
  const key = String(matchId)
  const last = tokenRenewedAt.get(key)
  if (last !== undefined && Date.now() - last < TOKEN_RENEW_MS) return false
  tokenRenewedAt.set(key, Date.now())
  const r = await validatePinSupabase(a.pin, a.type)
  return !!(r?.success && r.token && String(r.match?.id) === key)
}

/** Forget a match's access (exit, PIN no longer valid). No argument: all. */
export function forgetMatchAccess(matchId) {
  if (matchId === undefined) {
    matchAccess.clear()
    tokenRenewedAt.clear()
  } else {
    matchAccess.delete(String(matchId))
    tokenRenewedAt.delete(String(matchId))
  }
}

/** The remembered access of a match, or null. */
export function matchAccessFor(matchId) {
  if (matchId === undefined || matchId === null) return null
  return matchAccess.get(String(matchId)) || null
}

/** Request headers proving access to a match (empty without one). */
export function matchAccessHeaders(matchId) {
  const a = matchAccessFor(matchId)
  const h = {}
  if (a?.token) h['X-OV-Match-Token'] = a.token
  if (a?.pin) h['X-OV-Match-Pin'] = a.pin
  return h
}

/**
 * The subscribe-match message for a match key, with what proves access to it
 * (PIN / match token of the PIN check).
 */
export function subscribeMessage(matchId) {
  const access = matchAccessFor(matchId)
  return {
    type: 'subscribe-match',
    matchId: String(matchId),
    ...(access?.pin ? { pin: access.pin } : {}),
    ...(access?.token ? { token: access.token } : {})
  }
}

/** A match some server says is not a beach match (indoor shares the backend). */
export function isOtherSportMatch(match) {
  const sport = match?.sport_type ?? match?.sportType
  return sport !== undefined && sport !== null && sport !== '' && sport !== SPORT_TYPE
}

/**
 * Validate PIN and get match data from server
 */
export async function validatePin(pin, type = 'referee') {
  const serverUrl = getServerUrl()
  
  try {
    const response = await fetch(`${serverUrl}/api/match/validate-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pin: String(pin).trim(),
        type
      })
    })

    if (!response.ok) {
      let errorMessage = 'Failed to validate PIN'
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    // Check if response has content
    const text = await response.text()
    if (!text || text.trim() === '') {
      throw new Error('Empty response from server. Make sure the main scoresheet is running and connected.')
    }

    let result
    try {
      result = JSON.parse(text)
    } catch (e) {
      console.error('Invalid JSON response:', text)
      throw new Error('Invalid response from server. Make sure the main scoresheet is running and connected.')
    }
    // The cloud relay also holds indoor matches: a PIN of one is not ours
    if (result?.success && isOtherSportMatch(result.match)) {
      return { success: false, error: 'Invalid PIN code' }
    }
    if (result?.success && result.match?.id != null) {
      rememberMatchAccess(result.match.id, { pin, token: result.token || null })
    }
    return result
  } catch (error) {
    // Only log unexpected errors (not network failures from local server not running)
    if (!error.message?.includes('Failed to fetch') && !error.message?.includes('Not Found')) {
      console.error('Error validating PIN:', error)
    }
    // If it's already an Error with a message, re-throw it
    if (error instanceof Error) {
      throw error
    }
    // Otherwise, wrap it
    throw new Error(error.message || 'Failed to validate PIN. Make sure the main scoresheet is running and connected.')
  }
}

/**
 * Get full match data from server (match, teams, players, sets, events)
 * Falls back to Supabase direct fetch if HTTP endpoint is not available
 */
export async function getMatchData(matchId) {
  const serverUrl = getServerUrl()

  // Try HTTP endpoint first (WebSocket server may have it)
  try {
    const response = await fetch(`${serverUrl}/api/match/${matchId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // The PIN / match token of the PIN check: without them the relay
        // answers with the public summary only (no rosters, no events)
        ...matchAccessHeaders(matchId)
      }
    })

    if (response.ok) {
      const result = await response.json()
      // A summary is fine before the PIN step, never a replacement for the
      // bundle after it: then try the database read below
      if (result?.success && result.access === 'summary' && matchAccessFor(matchId)) {
        console.debug('[getMatchData] relay answered with the summary only, trying the API')
      } else if (result?.success && isOtherSportMatch(result.match)) {
        return { success: false, error: 'Match not found' }
      } else {
        return result
      }
    }
  } catch (error) {
    console.debug('[getMatchData] HTTP fetch failed, trying Supabase:', error.message)
  }

  // Fallback to Supabase direct fetch
  if (isBackendAvailable()) {
    try {

      let match = null
      let matchError = null

      // Try 1: Fetch match by external_id (seed_key). The match token of the
      // PIN check unlocks this match's rosters on an anonymous read (other
      // matches: public columns only).
      const readByExtId = () => apiFrom('matches')
        .headers(matchAccessHeaders(matchId))
        .select('*')
        .eq('external_id', matchId)
        .eq('sport_type', SPORT_TYPE)
        .maybeSingle()
      let { data: matchByExtId, error: extIdError } = await readByExtId()
      // Rosters missing after the PIN step: renew the token once and read again
      if (matchByExtId && await renewMatchToken(matchId, matchByExtId)) {
        const again = await readByExtId()
        if (again.data) matchByExtId = again.data
      }

      if (matchByExtId) {
        match = matchByExtId
      } else {
        // Fallback: If matchId is a UUID, try direct id lookup
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRegex.test(matchId)) {
          const { data: matchById, error: idError } = await apiFrom('matches')
            .headers(matchAccessHeaders(matchId))
            .select('*')
            .eq('id', matchId)
            .eq('sport_type', SPORT_TYPE)
            .maybeSingle()

          if (matchById) {
            match = matchById
          } else {
            matchError = idError || extIdError
          }
        } else {
          matchError = extIdError
        }
      }

      if (!match) {
        console.error('[getMatchData] Supabase match fetch error:', matchError)
        return { success: false, error: matchError?.message || 'Match not found' }
      }

      // Fetch live state if available (for Referee app)
      const { data: liveState } = await apiFrom('match_live_state')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle()

      // Build team info from matches table (prefer JSONB, fallback to old columns for transition)
      const team1Name = match.team1_data?.name || match.team1_team?.name || match.team1_team_name || 'Team 1'
      const team2Name = match.team2_data?.name || match.team2_team?.name || match.team2_team_name || 'Team 2'

      // A/B Model: Team A = coin toss winner (constant), side_a = which side they're on
      // Determine coinTossTeamA: is Team A team1 or team2?
      let coinTossTeamA = null
      let teamAIsTeam1 = true

      if (liveState?.team_a_name) {
        // Compare live state team_a_name with matches table to determine if Team A is team1
        teamAIsTeam1 = liveState.team_a_name === team1Name
        coinTossTeamA = teamAIsTeam1 ? 'team1' : 'team2'
      } else {
        // Fallback to coin_toss if live state doesn't have A/B data (prefer JSONB, fallback to old columns)
        const rawTeamA = match.coin_toss?.team_a || match.coin_toss_team_a || 'team1'
        // Normalize legacy 'team1'/'team2' to 'team1'/'team2'
        coinTossTeamA = rawTeamA === 'team1' ? 'team1' : rawTeamA === 'team2' ? 'team2' : rawTeamA
        teamAIsTeam1 = coinTossTeamA === 'team1'
      }

      // Determine which side is team1 based on side_a
      // side_a = 'left' means Team A is on left, side_a = 'right' means Team A is on right
      const sideA = liveState?.side_a || 'left'
      const leftIsTeam1 = (sideA === 'left') === teamAIsTeam1

      // Build team info with live state colors
      const team1ColorFromLive = liveState ? (teamAIsTeam1 ? liveState.team_a_color : liveState.team_b_color) : null
      const team2ColorFromLive = liveState ? (teamAIsTeam1 ? liveState.team_b_color : liveState.team_a_color) : null

      const team1 = {
        name: team1Name,
        shortName: match.team1_data?.short_name || match.team1_team?.short_name || match.team1_short_name || 'T1',
        color: team1ColorFromLive || match.team1_data?.color || match.team1_team?.color || '#ef4444'
      }
      const team2 = {
        name: team2Name,
        shortName: match.team2_data?.short_name || match.team2_team?.short_name || match.team2_short_name || 'T2',
        color: team2ColorFromLive || match.team2_data?.color || match.team2_team?.color || '#3b82f6'
      }

      // Build sets from live state using A/B model
      let sets = []
      if (liveState) {
        // Convert A/B points to team1/team2
        const team1Points = teamAIsTeam1 ? liveState.points_a : liveState.points_b
        const team2Points = teamAIsTeam1 ? liveState.points_b : liveState.points_a

        // Determine serving team - priority: serving_team field, then lineup isServing
        let servingTeam = 'team1'
        let serverNumber = null

        const lineupA = liveState.lineup_a
        const lineupB = liveState.lineup_b

        // First priority: use serving_team from live state (set by manual changes or score events)
        // serving_team stores 'left' or 'right', convert to 'team1'/'team2'
        if (liveState.serving_team) {
          const servingSide = liveState.serving_team // 'left' or 'right'
          // leftIsTeam1 tells us if team1 is on left
          servingTeam = (servingSide === 'left') === leftIsTeam1 ? 'team1' : 'team2'
          // Get server number from the serving team's lineup position I
          // If serving team1 and Team A is team1, use lineupA. Otherwise use lineupB.
          const servingTeamIsA = (servingTeam === 'team1') === teamAIsTeam1
          const servingTeamLineup = servingTeamIsA ? lineupA : lineupB
          serverNumber = servingTeamLineup?.I?.number || liveState.server_number || null
        } else if (lineupA?.I?.isServing) {
          // Fallback: Rich format with serving info in position I (isServing field)
          servingTeam = teamAIsTeam1 ? 'team1' : 'team2'
          serverNumber = lineupA.I.number
        } else if (lineupB?.I?.isServing) {
          servingTeam = teamAIsTeam1 ? 'team2' : 'team1'
          serverNumber = lineupB.I.number
        } else {
        }

        // Final fallback: use server_number from liveState directly
        if (!serverNumber && liveState.server_number) {
          serverNumber = liveState.server_number
        }

        const currentSet = {
          index: liveState.current_set || 1,
          team1Points: team1Points || 0,
          team2Points: team2Points || 0,
          finished: false,
          servingTeam,
          serverNumber
        }
        sets = [currentSet]

        // Set scores
        const team1SetsWon = teamAIsTeam1 ? liveState.sets_won_a : liveState.sets_won_b
        const team2SetsWon = teamAIsTeam1 ? liveState.sets_won_b : liveState.sets_won_a
        // We only have set counts, not individual set scores - this is a limitation
      } else {
        // No live state yet (before first point) - create empty set 1
        sets = [{ index: 1, team1Points: 0, team2Points: 0, finished: false }]
      }

      // Build events array with lineup info from live state
      let events = []

      if (liveState) {
        // Lineup events contain rich data (captain, sanctions embedded per position)
        if (liveState.lineup_a) {
          events.push({
            type: 'lineup',
            setIndex: liveState.current_set || 1,
            seq: 1,
            payload: {
              team: teamAIsTeam1 ? 'team1' : 'team2',
              lineup: liveState.lineup_a,
              isRichFormat: true
            }
          })
        }
        if (liveState.lineup_b) {
          events.push({
            type: 'lineup',
            setIndex: liveState.current_set || 1,
            seq: 1.1,
            payload: {
              team: teamAIsTeam1 ? 'team2' : 'team1',
              lineup: liveState.lineup_b,
              isRichFormat: true
            }
          })
        }

        // Build sanction events from live state (team-level sanctions only)
        if (liveState.sanctions_a) {
          for (const sanction of liveState.sanctions_a) {
            events.push({
              type: 'sanction',
              setIndex: liveState.current_set || 1,
              ts: sanction.ts,
              payload: {
                team: teamAIsTeam1 ? 'team1' : 'team2',
                playerNumber: sanction.player,
                type: sanction.type,
                playerType: sanction.playerType, // 'player'
                position: sanction.position,
                role: sanction.role
              }
            })
          }
        }
        if (liveState.sanctions_b) {
          for (const sanction of liveState.sanctions_b) {
            events.push({
              type: 'sanction',
              setIndex: liveState.current_set || 1,
              ts: sanction.ts,
              payload: {
                team: teamAIsTeam1 ? 'team2' : 'team1',
                playerNumber: sanction.player,
                type: sanction.type,
                playerType: sanction.playerType,
                position: sanction.position,
                role: sanction.role
              }
            })
          }
        }

        // Build timeout events from live state (if stored as JSONB arrays)
        if (Array.isArray(liveState.timeouts_a)) {
          for (const timeout of liveState.timeouts_a) {
            events.push({
              type: 'timeout',
              setIndex: liveState.current_set || 1,
              ts: timeout.ts,
              payload: {
                team: teamAIsTeam1 ? 'team1' : 'team2'
              }
            })
          }
        } else if (typeof liveState.timeouts_a === 'number') {
          // Backwards compatibility: if stored as number, create that many timeout events
          for (let i = 0; i < liveState.timeouts_a; i++) {
            events.push({
              type: 'timeout',
              setIndex: liveState.current_set || 1,
              payload: {
                team: teamAIsTeam1 ? 'team1' : 'team2'
              }
            })
          }
        }
        if (Array.isArray(liveState.timeouts_b)) {
          for (const timeout of liveState.timeouts_b) {
            events.push({
              type: 'timeout',
              setIndex: liveState.current_set || 1,
              ts: timeout.ts,
              payload: {
                team: teamAIsTeam1 ? 'team2' : 'team1'
              }
            })
          }
        } else if (typeof liveState.timeouts_b === 'number') {
          // Backwards compatibility: if stored as number, create that many timeout events
          for (let i = 0; i < liveState.timeouts_b; i++) {
            events.push({
              type: 'timeout',
              setIndex: liveState.current_set || 1,
              payload: {
                team: teamAIsTeam1 ? 'team2' : 'team1'
              }
            })
          }
        }
      }

      // Build players from matches table JSONB columns
      const team1Players = match.players_team1 || []
      const team2Players = match.players_team2 || []

      // Extract captain info from rich lineup format
      let team1Captain = null
      let team2Captain = null
      let team1CourtCaptain = null
      let team2CourtCaptain = null

      const team1Lineup = teamAIsTeam1 ? liveState?.lineup_a : liveState?.lineup_b
      const team2Lineup = teamAIsTeam1 ? liveState?.lineup_b : liveState?.lineup_a

      for (const pos of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
        if (team1Lineup?.[pos]?.isCaptain) team1Captain = team1Lineup[pos].number
        if (team1Lineup?.[pos]?.isCourtCaptain) team1CourtCaptain = team1Lineup[pos].number
        if (team2Lineup?.[pos]?.isCaptain) team2Captain = team2Lineup[pos].number
        if (team2Lineup?.[pos]?.isCourtCaptain) team2CourtCaptain = team2Lineup[pos].number
      }

      // Fallback: check players_team1/players_team2 JSONB for captain info (is_captain field)
      if (!team1Captain && team1Players?.length > 0) {
        const cap = team1Players.find(p => p.isCaptain || p.is_captain || p.captain)
        if (cap) team1Captain = cap.number
      }
      if (!team2Captain && team2Players?.length > 0) {
        const cap = team2Players.find(p => p.isCaptain || p.is_captain || p.captain)
        if (cap) team2Captain = cap.number
      }

      return {
        success: true,
        match: {
          ...match,
          id: matchId, // Use external_id as the reference ID
          // Use liveState.match_status if available (reflects actual game state)
          status: liveState?.match_status || match.status,
          coinTossTeamA: coinTossTeamA, // Derived from live state if not in matches table
          coinTossTeamB: coinTossTeamA === 'team1' ? 'team2' : 'team1',
          coinTossServeA: match.coin_toss?.serve_a ?? match.coin_toss_serve_a,
          firstServe: match.coin_toss?.first_serve || match.first_serve,
          team1FirstServe: match.coin_toss?.team1_first_serve || null,
          team2FirstServe: match.coin_toss?.team2_first_serve || null,
          // coin_toss_confirmed = true if we have liveState with team names (means coin toss happened)
          coin_toss_confirmed: !!(liveState?.team_a_name),
          // Get short names from JSONB, or fallback to old columns
          team1ShortName: match.team1_data?.short_name || match.team1_team?.short_name || match.team1_short_name || team1.shortName,
          team2ShortName: match.team2_data?.short_name || match.team2_team?.short_name || match.team2_short_name || team2.shortName,
          team1Name: team1.name,
          team2Name: team2.name,
          team1Color: team1.color,
          team2Color: team2.color,
          // Captain info
          team1Captain: team1Captain || null,
          team2Captain: team2Captain || null,
          team1CourtCaptain: team1CourtCaptain || null,
          team2CourtCaptain: team2CourtCaptain || null,
          // Also ensure gameNumber is set
          gameNumber: match.game_n ? String(match.game_n) : null,
          gameN: match.game_n
        },
        team1,
        team2,
        team1Players,
        team2Players,
        sets,
        events,
        isRichFormat: true, // Always rich format now
        liveState // Include raw live state for additional data
      }
    } catch (supabaseError) {
      console.error('[getMatchData] Supabase fallback error:', supabaseError)
      return { success: false, error: supabaseError.message }
    }
  }

  return { success: false, error: 'No data source available' }
}

// Global WebSocket connection manager to prevent multiple connections
const wsConnections = new Map() // Map<matchId, { ws, subscribers, reconnectTimeout, reconnectAttempts, isIntentionallyClosed, pingInterval }>

// Ping interval in ms - keeps connection alive on mobile networks (NAT timeout is usually 30-60s)
const PING_INTERVAL = 25000

// Debug info for mobile debugging
const wsDebugInfo = {
  connectedAt: null,
  lastMessageAt: null,
  lastPingAt: null,
  lastPongAt: null,
  messagesReceived: 0,
  connectionAttempts: 0,
  errors: [],
  wsUrl: null,
  readyState: null,
  lastError: null
}

/**
 * Get WebSocket debug info for on-screen debugging
 */
export function getWsDebugInfo(matchId) {
  const matchIdStr = String(matchId)
  const connection = wsConnections.get(matchIdStr)

  return {
    ...wsDebugInfo,
    readyState: connection?.ws?.readyState ?? -1,
    readyStateLabel: connection?.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][connection.ws.readyState] : 'NO_CONNECTION',
    subscriberCount: connection?.subscribers?.size ?? 0,
    reconnectAttempts: connection?.reconnectAttempts ?? 0,
    isIntentionallyClosed: connection?.isIntentionallyClosed ?? false
  }
}

// Store connect functions for each match to allow force reconnect
const connectFunctions = new Map()

/**
 * Force reconnect WebSocket for a match
 */
export function forceReconnect(matchId) {
  const matchIdStr = String(matchId)
  const connection = wsConnections.get(matchIdStr)

  if (!connection) {
    return false
  }


  // Close existing connection with code 4000 (custom code that triggers reconnect)
  if (connection.ws) {
    try {
      connection.ws.close(4000, 'Force reconnect')
    } catch (e) {}
    connection.ws = null
  }

  // Clear timeouts
  if (connection.reconnectTimeout) {
    clearTimeout(connection.reconnectTimeout)
    connection.reconnectTimeout = null
  }
  if (connection.pingInterval) {
    clearInterval(connection.pingInterval)
    connection.pingInterval = null
  }

  // Reset flags
  connection.isIntentionallyClosed = false
  connection.reconnectAttempts = 0

  // Trigger reconnect using stored connect function
  const connectFn = connectFunctions.get(matchIdStr)
  if (connectFn) {
    setTimeout(connectFn, 100) // Small delay to ensure cleanup completes
    return true
  }

  return false
}

/**
 * Subscribe to match data updates via WebSocket
 */
export function subscribeToMatchData(matchId, onUpdate) {
  const wsUrl = getWebSocketUrl()
  const matchIdStr = String(matchId)
  
  // Get or create connection manager for this match
  let connection = wsConnections.get(matchIdStr)
  if (!connection) {
    connection = {
      ws: null,
      subscribers: new Set(),
      reconnectTimeout: null,
      reconnectAttempts: 0,
      isIntentionallyClosed: false,
      pingInterval: null
    }
    wsConnections.set(matchIdStr, connection)
  }
  
  // Add this subscriber
  connection.subscribers.add(onUpdate)
  
  const maxReconnectDelay = 10000 // Max 10 seconds

  const connect = () => {
    // Store this connect function for force reconnect
    connectFunctions.set(matchIdStr, connect)
    // Don't reconnect if intentionally closed or already connected
    if (connection.isIntentionallyClosed) return
    if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      // Already connected, just send subscription message
      try {
        connection.ws.send(JSON.stringify(subscribeMessage(matchIdStr)))
      } catch (err) {
        console.error('[ServerDataSync] Error sending subscription:', err)
      }
      return
    }
    if (connection.ws && connection.ws.readyState === WebSocket.CONNECTING) {
      // Already connecting, wait for it
      return
    }

    try {
      // Close existing connection if any (but not if it's already closed)
      if (connection.ws && connection.ws.readyState !== WebSocket.CLOSED) {
        connection.ws.close()
      }

      wsDebugInfo.wsUrl = wsUrl
      wsDebugInfo.connectionAttempts++
      connection.ws = new WebSocket(wsUrl)

      connection.ws.onopen = () => {
        // Skip if intentionally closed (cleanup ran before connection opened)
        if (connection.isIntentionallyClosed || !connection.ws) return

        connection.reconnectAttempts = 0 // Reset on successful connection
        wsDebugInfo.connectedAt = Date.now()
        wsDebugInfo.lastError = null

        // Request match data subscription
        try {
          connection.ws.send(JSON.stringify(subscribeMessage(matchIdStr)))
        } catch (err) {
          // Error sending subscription
        }

        // Start ping interval to keep connection alive (important for mobile networks)
        if (connection.pingInterval) {
          clearInterval(connection.pingInterval)
        }
        connection.pingInterval = setInterval(() => {
          if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
            try {
              wsDebugInfo.lastPingAt = Date.now()
              connection.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
            } catch (err) {
              console.warn('[ServerDataSync] Error sending ping:', err)
            }
          }
        }, PING_INTERVAL)
      }

      connection.ws.onmessage = (event) => {
        // Skip if intentionally closed
        if (connection.isIntentionallyClosed) return

        try {
          const message = JSON.parse(event.data)
          wsDebugInfo.lastMessageAt = Date.now()
          wsDebugInfo.messagesReceived++

          // Handle pong (heartbeat response)
          if (message.type === 'pong') {
            wsDebugInfo.lastPongAt = Date.now()
            return
          }

          if (message.type === 'match-data-update' && String(message.matchId) === matchIdStr) {
            // Match data updated, notify all subscribers
            // Pass through timestamp fields for latency tracking
            // Server sends data directly on message, not in a .data wrapper
            const dataWithTimestamps = {
              match: message.match,
              team1: message.team1 || message.teams?.[0],
              team2: message.team2 || message.teams?.[1],
              team1Players: message.team1Players || message.players?.filter(p => p.teamId === message.match?.team1Id) || [],
              team2Players: message.team2Players || message.players?.filter(p => p.teamId === message.match?.team2Id) || [],
              sets: message.sets || [],
              events: message.events || [],
              _timestamp: message._timestamp || message.timestamp,
              _scoreboardTimestamp: message._scoreboardTimestamp || message.timestamp
            }
            connection.subscribers.forEach(subscriber => {
              try {
                subscriber(dataWithTimestamps)
              } catch (err) {
                console.error('[ServerDataSync] Error in subscriber callback:', err)
              }
            })
          } else if (message.type === 'match-full-data' && String(message.matchId) === matchIdStr) {
            // Full match data received, notify all subscribers
            connection.subscribers.forEach(subscriber => {
              try {
                subscriber(message.data)
              } catch (err) {
                console.error('[ServerDataSync] Error in subscriber callback:', err)
              }
            })
          } else if (message.type === 'match-action' && String(message.matchId) === matchIdStr) {
            // Action received from scoreboard (timeout, set_end, etc.)
            connection.subscribers.forEach(subscriber => {
              try {
                // Pass the action with a special _action wrapper, including timestamps for latency tracking
                subscriber({ 
                  _action: message.action, 
                  _actionData: message.data, 
                  _timestamp: message._timestamp || message.timestamp,
                  _scoreboardTimestamp: message._scoreboardTimestamp || message.timestamp
                })
              } catch (err) {
                console.error('[ServerDataSync] Error in subscriber callback for action:', err)
              }
            })
          }
        } catch (err) {
          console.error('[ServerDataSync] Error parsing message:', err)
        }
      }

      connection.ws.onerror = (error) => {
        // Track error for debugging
        wsDebugInfo.lastError = {
          time: Date.now(),
          message: error?.message || 'WebSocket error',
          readyState: connection.ws?.readyState
        }
        wsDebugInfo.errors.push(wsDebugInfo.lastError)
        if (wsDebugInfo.errors.length > 10) wsDebugInfo.errors.shift() // Keep last 10 errors

        // Skip if ws is null (cleanup already happened) or intentionally closed
        if (!connection.ws || connection.isIntentionallyClosed) return

        // Only log if it's not a connection error (which is expected during initial connection)
        // Connection errors are usually handled by onclose
        if (connection.ws.readyState === WebSocket.CONNECTING) {
          // This is expected during initial connection attempts, don't log as error
          return
        }
        console.warn('[ServerDataSync] WebSocket error (will attempt reconnect):', error)
      }

      connection.ws.onclose = (event) => {
        // Clear ping interval
        if (connection.pingInterval) {
          clearInterval(connection.pingInterval)
          connection.pingInterval = null
        }

        // Don't reconnect if intentionally closed or ws is null
        if (connection.isIntentionallyClosed || !connection.ws) return

        // Don't reconnect on normal closure (code 1000)
        if (event.code === 1000) {
          return
        }

        // Only reconnect if there are still subscribers
        if (connection.subscribers.size === 0) {
          return
        }

        // Exponential backoff for reconnection
        connection.reconnectAttempts++
        const delay = Math.min(3000 * connection.reconnectAttempts, maxReconnectDelay)
        connection.reconnectTimeout = setTimeout(connect, delay)
      }
    } catch (err) {
      console.error('[ServerDataSync] Connection error:', err)
      // Exponential backoff for reconnection
      connection.reconnectAttempts++
      const delay = Math.min(3000 * connection.reconnectAttempts, maxReconnectDelay)
      connection.reconnectTimeout = setTimeout(connect, delay)
    }
  }

  // Connect if not already connected
  if (!connection.ws || connection.ws.readyState === WebSocket.CLOSED) {
    connect()
  } else if (connection.ws.readyState === WebSocket.OPEN) {
    // Already connected, send subscription immediately
    try {
      connection.ws.send(JSON.stringify(subscribeMessage(matchIdStr)))
    } catch (err) {
      console.error('[ServerDataSync] Error sending subscription:', err)
    }
  }

  // Return unsubscribe function
  return () => {
    // Remove this subscriber
    connection.subscribers.delete(onUpdate)

    // If no more subscribers, close the connection
    if (connection.subscribers.size === 0) {
      connection.isIntentionallyClosed = true
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout)
        connection.reconnectTimeout = null
      }
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval)
        connection.pingInterval = null
      }
      if (connection.ws) {
        connection.ws.close(1000, 'Unsubscribing') // Normal closure
        connection.ws = null
      }
      // Remove from maps
      wsConnections.delete(matchIdStr)
      connectFunctions.delete(matchIdStr)
    }
  }
}

/**
 * Get WebSocket connection status for a match
 * Returns: 'connected', 'connecting', 'disconnected', or 'unknown'
 */
export function getWebSocketStatus(matchId) {
  const matchIdStr = String(matchId)
  const connection = wsConnections.get(matchIdStr)
  
  if (!connection || !connection.ws) {
    return 'disconnected'
  }
  
  switch (connection.ws.readyState) {
    case WebSocket.CONNECTING:
      return 'connecting'
    case WebSocket.OPEN:
      return 'connected'
    case WebSocket.CLOSING:
    case WebSocket.CLOSED:
      return 'disconnected'
    default:
      return 'unknown'
  }
}

/**
 * Find match by game number from server
 */
export async function findMatchByGameNumber(gameNumber) {
  const serverUrl = getServerUrl()
  
  try {
    const response = await fetch(`${serverUrl}/api/match/by-game-number?gameNumber=${encodeURIComponent(gameNumber)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      return null
    }

    const result = await response.json()
    return result.match || null
  } catch (error) {
    console.error('Error finding match by game number:', error)
    return null
  }
}

/**
 * Update match data on server (for upload roster, etc.)
 */
export async function updateMatchData(matchId, updates) {
  const serverUrl = getServerUrl()
  
  try {
    const response = await fetch(`${serverUrl}/api/match/${matchId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    })

    if (!response.ok) {
      throw new Error('Failed to update match data')
    }

    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error updating match data:', error)
    throw error
  }
}

/**
 * List available matches from server (for game number dropdown)
 */
export async function listAvailableMatches() {
  const serverUrl = getServerUrl()
  const url = `${serverUrl}/api/match/list`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      return { success: false, matches: [], error: `HTTP ${response.status}: ${response.statusText}` }
    }

    // Check content type - if server returns HTML (e.g., Vite dev server fallback), skip JSON parse
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return { success: false, matches: [], error: 'Server returned non-JSON response' }
    }

    const result = await response.json()
    return result
  } catch (error) {
    // Suppress noisy errors when local server isn't running (expected in Supabase-only mode)
    if (error.message?.includes('not valid JSON') || error.message?.includes('Failed to fetch')) {
      return { success: false, matches: [], error: 'Local server not available' }
    }
    console.error('[listAvailableMatches] Error:', error.message)
    return { success: false, matches: [], error: error.message }
  }
}

/**
 * List available beach matches from the backend (cloud mode)
 * Returns matches that are in 'setup' or 'live' status with referee_connection_enabled = true
 */
export async function listAvailableMatchesSupabase() {
  if (!isBackendAvailable()) {
    return { success: false, matches: [], error: 'Supabase client not initialized' }
  }

  try {
    const { data, error } = await apiFrom('matches')
      .select(`
        id,
        external_id,
        game_n,
        status,
        scheduled_at,
        team1_data,
        team2_data,
        connections
      `)
      .in('status', ['setup', 'live'])
      .eq('sport_type', SPORT_TYPE)
      .order('scheduled_at', { ascending: true })

    if (error) {
      console.error('[listAvailableMatchesSupabase] Error:', error)
      return { success: false, matches: [], error: error.message }
    }

    // Filter to only show matches where referee connection is enabled
    const filteredData = (data || []).filter(m => {
      const connections = m.connections || {}
      return connections.referee_enabled === true
    })

    // Format to match the WebSocket server format
    const formattedMatches = filteredData.map(m => {
      let dateTime = 'TBD'
      if (m.scheduled_at) {
        try {
          // Ensure timestamp is parsed as UTC (Supabase may return without 'Z')
          let scheduledStr = m.scheduled_at
          if (!scheduledStr.endsWith('Z') && !scheduledStr.includes('+')) {
            scheduledStr = scheduledStr + 'Z'
          }
          const scheduledDate = new Date(scheduledStr)
          // Display in local timezone
          const dateStr = scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const timeStr = formatTimeLocal(scheduledStr)
          dateTime = `${dateStr} ${timeStr}`
        } catch (e) {
          dateTime = 'TBD'
        }
      }

      // Read from JSONB columns only (clean schema)
      const team1Name = m.team1_data?.name || m.team1_team?.name || 'Team 1'
      const team2Name = m.team2_data?.name || m.team2_team?.name || 'Team 2'
      const connections = m.connections || {}

      return {
        id: m.external_id || m.id,
        external_id: m.external_id, // Keep original for Supabase writes
        gameNumber: m.game_n || m.external_id,
        team1: team1Name,
        team2: team2Name,
        team1Name: team1Name,
        team2Name: team2Name,
        scheduledAt: m.scheduled_at,
        dateTime,
        status: m.status,
        refereeConnectionEnabled: connections.referee_enabled === true
        // No PINs: the backend never sends them; a PIN is checked server-side
        // (validatePinSupabase)
      }
    })

    return { success: true, matches: formattedMatches }
  } catch (error) {
    console.error('[listAvailableMatchesSupabase] Exception:', error)
    return { success: false, matches: [], error: error.message }
  }
}

// Beach PIN types of POST /api/match/validate-connection-pin (sport 'beach')
export const BEACH_PIN_TYPES = Object.freeze(['referee', 'bench_team1', 'bench_team2'])

/**
 * Validate a referee / team bench PIN on the backend
 * (POST /api/match/validate-connection-pin with sport 'beach'). The PINs never
 * reach the browser: the server compares them. On success the PIN and the
 * match token are remembered for the match (rememberMatchAccess), so the
 * relay subscription and the match reads that follow get the rosters.
 * Bounded by `timeoutMs`: on a venue network without internet this check must
 * fail fast so the caller can fall back to the LAN relay.
 * @param {string} pin
 * @param {'referee'|'bench_team1'|'bench_team2'} [type]
 * @returns {Promise<{success: boolean, match?: object, token?: string|null, error?: string}>}
 */
export async function validatePinSupabase(pin, type = 'referee', { timeoutMs = 3000, fetchImpl = fetch } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const pinStr = String(pin ?? '').trim()

    if (!pinStr || pinStr.length !== 6) {
      return { success: false, error: 'Invalid PIN format' }
    }
    if (!BEACH_PIN_TYPES.includes(type)) {
      return { success: false, error: 'Invalid PIN type' }
    }

    const apiUrl = getApiUrl('/api/match/validate-connection-pin')
    if (!apiUrl) return { success: false, error: 'Backend not available' }

    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinStr, type, sport: SPORT_TYPE }),
      ...(controller ? { signal: controller.signal } : {})
    })

    let result
    try {
      result = await response.json()
    } catch {
      return { success: false, error: 'Validation failed' }
    }

    if (!response.ok || !result?.success || !result.match) {
      return { success: false, error: result?.error || 'Invalid PIN code' }
    }
    // A backend that ignores `sport` would answer with an indoor match
    if ((result.match.sportType ?? result.match.sport_type) !== SPORT_TYPE) {
      return { success: false, error: 'Invalid PIN code' }
    }

    const m = result.match
    const match = {
      ...m,
      // Older beach screens read team1 / team2 (names)
      team1: m.team1Team || 'Team 1',
      team2: m.team2Team || 'Team 2',
      team1Color: m.team1TeamColor,
      team2Color: m.team2TeamColor
    }
    if (match.id != null) rememberMatchAccess(match.id, { pin: pinStr, token: result.token || null, type })
    return { success: true, match, token: result.token || null }
  } catch (error) {
    if (error?.name === 'AbortError') return { success: false, error: 'Server PIN check timed out', unreachable: true }
    console.error('[validatePinSupabase] Exception:', error)
    return { success: false, error: error.message }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
