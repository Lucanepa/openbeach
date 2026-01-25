/**
 * Server Data Sync Service
 * Fetches match data from the main scoreboard server instead of using local IndexedDB
 */

import { supabase } from '../lib_beach/supabaseClient_beach'
import { formatTimeLocal } from './timeUtils'

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
  // Check if we have a configured backend URL (Railway/cloud backend)
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
  // Check if we have a configured backend URL (Railway/cloud backend)
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

    try {
      const result = JSON.parse(text)
      return result
    } catch (e) {
      console.error('Invalid JSON response:', text)
      throw new Error('Invalid response from server. Make sure the main scoresheet is running and connected.')
    }
  } catch (error) {
    console.error('Error validating PIN:', error)
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
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const result = await response.json()
      return result
    }
  } catch (error) {
    console.debug('[getMatchData] HTTP fetch failed, trying Supabase:', error.message)
  }

  // Fallback to Supabase direct fetch
  if (supabase) {
    try {

      let match = null
      let matchError = null

      // Try 1: Fetch match by external_id (seed_key)
      const { data: matchByExtId, error: extIdError } = await supabase
        .from('matches')
        .select('*')
        .eq('external_id', matchId)
        .maybeSingle()

      if (matchByExtId) {
        match = matchByExtId
      } else {
        // Fallback: If matchId is a UUID, try direct id lookup
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidRegex.test(matchId)) {
          const { data: matchById, error: idError } = await supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
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
      const { data: liveState } = await supabase
        .from('match_live_state')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle()

      // Build team info from matches table (prefer JSONB, fallback to old columns for transition)
      const team1Name = match.team1_team?.name || match.team1_team_name || 'Team 1'
      const team2Name = match.team2_team?.name || match.team2_team_name || 'Team 2'

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
        shortName: match.team1_team?.short_name || match.team1_short_name || 'T1',
        color: team1ColorFromLive || match.team1_team?.color || '#ef4444'
      }
      const team2 = {
        name: team2Name,
        shortName: match.team2_team?.short_name || match.team2_short_name || 'T2',
        color: team2ColorFromLive || match.team2_team?.color || '#3b82f6'
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
          serverNumber = servingTeamLineup?.I?.number || null
        } else if (lineupA?.I?.isServing) {
          // Fallback: Rich format with serving info in position I (isServing field)
          servingTeam = teamAIsTeam1 ? 'team1' : 'team2'
          serverNumber = lineupA.I.number
        } else if (lineupB?.I?.isServing) {
          servingTeam = teamAIsTeam1 ? 'team2' : 'team1'
          serverNumber = lineupB.I.number
        } else {
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
          // coin_toss_confirmed = true if we have liveState with team names (means coin toss happened)
          coin_toss_confirmed: !!(liveState?.team_a_name),
          // Get short names from JSONB, or fallback to old columns
          team1ShortName: match.team1_team?.short_name || match.team1_short_name || team1.shortName,
          team2ShortName: match.team2_team?.short_name || match.team2_short_name || team2.shortName,
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
        connection.ws.send(JSON.stringify({
          type: 'subscribe-match',
          matchId: matchIdStr
        }))
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
          connection.ws.send(JSON.stringify({
            type: 'subscribe-match',
            matchId: matchIdStr
          }))
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
      connection.ws.send(JSON.stringify({
        type: 'subscribe-match',
        matchId: matchIdStr
      }))
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

    const result = await response.json()
    return result
  } catch (error) {
    console.error('[listAvailableMatches] Error:', error.message)
    return { success: false, matches: [], error: error.message }
  }
}

/**
 * List available matches from Supabase (for Supabase-only mode)
 * Returns matches that are in 'setup' or 'live' status with referee_connection_enabled = true
 */
export async function listAvailableMatchesSupabase() {
  if (!supabase) {
    return { success: false, matches: [], error: 'Supabase client not initialized' }
  }

  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        external_id,
        game_n,
        status,
        scheduled_at,
        team1_team,
        team2_team,
        connections,
        connection_pins
      `)
      .in('status', ['setup', 'live'])
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
      const team1Name = m.team1_team?.name || 'Team 1'
      const team2Name = m.team2_team?.name || 'Team 2'
      const connections = m.connections || {}
      const connectionPins = m.connection_pins || {}

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
        refereeConnectionEnabled: connections.referee_enabled === true,
        // Include upload PINs for roster upload app
        team1UploadPin: connectionPins.upload_team1,
        team2UploadPin: connectionPins.upload_team2
      }
    })

    return { success: true, matches: formattedMatches }
  } catch (error) {
    console.error('[listAvailableMatchesSupabase] Exception:', error)
    return { success: false, matches: [], error: error.message }
  }
}

export async function validatePinSupabase(pin, type = 'referee') {
  try {
    const pinStr = String(pin).trim()

    if (!pinStr || pinStr.length !== 6) {
      return { success: false, error: 'Invalid PIN format' }
    }

    // Query matches by PIN in connection_pins JSONB
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        external_id,
        game_n,
        status,
        scheduled_at,
        team1_team,
        team2_team,
        connections,
        connection_pins
      `)
      .in('status', ['setup', 'live'])

    if (error) {
      console.error('[validatePinSupabase] Error:', error)
      return { success: false, error: error.message }
    }

    // Find match where PIN matches the appropriate type in connection_pins
    const matchData = (data || []).find(m => {
      const connectionPins = m.connection_pins || {}
      const connections = m.connections || {}

      if (type === 'referee') {
        return connectionPins.referee === pinStr && connections.referee_enabled
      }
      return false
    })

    if (!matchData) {
      return { success: false, error: 'Invalid PIN code' }
    }

    // Read from JSONB columns only (clean schema)
    const connections = matchData.connections || {}

    const match = {
      id: matchData.external_id || matchData.id,
      gameNumber: matchData.game_n || matchData.external_id,
      status: matchData.status,
      scheduledAt: matchData.scheduled_at,
      refereeConnectionEnabled: connections.referee_enabled,
      team1: matchData.team1_team?.name || 'Team 1',
      team2: matchData.team2_team?.name || 'Team 2',
      team1Color: matchData.team1_team?.color,
      team2Color: matchData.team2_team?.color
    }

    return { success: true, match }
  } catch (error) {
    console.error('[validatePinSupabase] Exception:', error)
    return { success: false, error: error.message }
  }
}
