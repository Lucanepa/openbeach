/**
 * useRealtimeConnection Hook
 * Manages connection to match data with strict priority waterfall:
 *   1. Supabase Realtime (primary)
 *   2. WebSocket (exclusive fallback — only when Supabase is unreachable)
 *   3. Disconnected (offline)
 *
 * When in WebSocket fallback mode, periodically rechecks Supabase availability
 * and auto-promotes back to Supabase when it becomes reachable.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib_beach/supabaseClient_beach'  // Realtime only
import { apiFrom } from '../lib_beach/apiClient_beach'
import { subscribeToMatchData, getMatchData } from '../utils_beach/serverDataSync_beach'

// Connection types — kept for backward compatibility, all resolve to auto behavior
export const CONNECTION_TYPES = {
  AUTO: 'auto',
  SUPABASE: 'auto',
  WEBSOCKET: 'auto'
}

// Connection status
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  FALLBACK: 'fallback'    // Using WebSocket fallback
}

// How often to recheck Supabase when in WebSocket fallback mode (ms)
const SUPABASE_RECHECK_INTERVAL = 30000

/**
 * Hook for managing realtime connection with strict priority:
 * Supabase → WebSocket fallback → disconnected
 *
 * @param {Object} options
 * @param {string|number} options.matchId - Match ID to subscribe to
 * @param {string} options.preferredConnection - Ignored (kept for backward compat)
 * @param {function} options.onData - Callback when data is received
 * @param {function} options.onAction - Callback when action is received (timeout, sanction, etc.)
 * @param {function} options.onDeleted - Callback when match is deleted from server
 * @param {boolean} options.enabled - Whether to enable the connection
 */
export function useRealtimeConnection({
  matchId,
  preferredConnection,  // ignored — always auto
  onData,
  onAction,
  onDeleted,
  enabled = true
}) {
  const [activeConnection, setActiveConnection] = useState(null) // 'supabase' | 'websocket' | null
  const [status, setStatus] = useState(CONNECTION_STATUS.DISCONNECTED)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const supabaseChannelRef = useRef(null)
  const wsUnsubscribeRef = useRef(null)
  const isMountedRef = useRef(true)
  const isConnectingRef = useRef(false)
  const supabaseRecheckRef = useRef(null)

  // Store callbacks in refs to avoid dependency changes
  const onDataRef = useRef(onData)
  const onActionRef = useRef(onAction)
  const onDeletedRef = useRef(onDeleted)

  // Update refs when callbacks change (without triggering re-renders)
  useEffect(() => { onDataRef.current = onData }, [onData])
  useEffect(() => { onActionRef.current = onAction }, [onAction])
  useEffect(() => { onDeletedRef.current = onDeleted }, [onDeleted])

  // UUID retry timer ref
  const uuidRetryRef = useRef(null)

  // Cleanup function — tears down all connections and timers
  const cleanup = useCallback(() => {
    // Clear UUID retry timer
    if (uuidRetryRef.current) {
      clearTimeout(uuidRetryRef.current)
      uuidRetryRef.current = null
    }

    // Clear Supabase recheck timer
    if (supabaseRecheckRef.current) {
      clearInterval(supabaseRecheckRef.current)
      supabaseRecheckRef.current = null
    }

    // Cleanup Supabase subscription
    if (supabaseChannelRef.current) {
      try {
        supabase?.removeChannel(supabaseChannelRef.current)
      } catch (e) {
        console.warn('[RealtimeConnection] Error removing Supabase channel:', e)
      }
      supabaseChannelRef.current = null
    }

    // Cleanup WebSocket subscription
    if (wsUnsubscribeRef.current) {
      try {
        wsUnsubscribeRef.current()
      } catch (e) {
        console.warn('[RealtimeConnection] Error unsubscribing WebSocket:', e)
      }
      wsUnsubscribeRef.current = null
    }

    setActiveConnection(null)
  }, [])

  // Helper: fetch data and deliver to callback
  const fetchAndDeliver = useCallback((reason) => {
    getMatchData(matchId).then(result => {
      if (result.success && onDataRef.current) {
        onDataRef.current(result)
      }
    }).catch(err => {
      console.error(`[RealtimeConnection] Error fetching data after ${reason}:`, err)
    })
  }, [matchId])

  // Helper: build a Supabase channel with all subscriptions
  const buildChannel = useCallback((supabaseMatchUuid) => {
    const channelId = `match-${matchId}-${Date.now()}`
    const channel = supabase.channel(channelId)

    // Subscribe to events, sets, and match_live_state using UUID
    if (supabaseMatchUuid) {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `match_id=eq.${supabaseMatchUuid}` },
          () => { if (!isMountedRef.current) return; setLastUpdate(Date.now()); fetchAndDeliver('event') })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sets', filter: `match_id=eq.${supabaseMatchUuid}` },
          () => { if (!isMountedRef.current) return; setLastUpdate(Date.now()); fetchAndDeliver('set update') })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_live_state', filter: `match_id=eq.${supabaseMatchUuid}` },
          () => { if (!isMountedRef.current) return; setLastUpdate(Date.now()); fetchAndDeliver('live state update') })
    }

    // Always subscribe to matches table (uses external_id, no UUID needed)
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `external_id=eq.${matchId}` },
        (payload) => {
          if (!isMountedRef.current) return
          setLastUpdate(Date.now())
          if (payload.eventType === 'DELETE') {
            if (onDeletedRef.current) onDeletedRef.current()
            return
          }
          fetchAndDeliver('match update')
        })

    return channel
  }, [matchId, fetchAndDeliver])

  // Connect to Supabase Realtime
  const connectSupabase = useCallback(async () => {
    if (!supabase || !matchId) {
      return false
    }

    // Clear any pending UUID retry
    if (uuidRetryRef.current) {
      clearTimeout(uuidRetryRef.current)
      uuidRetryRef.current = null
    }

    try {
      setStatus(CONNECTION_STATUS.CONNECTING)

      // Look up the Supabase UUID from external_id (seed_key)
      let supabaseMatchUuid = null
      const { data: matchData } = await apiFrom('matches')
        .select('id')
        .eq('external_id', matchId)
        .maybeSingle()

      if (matchData?.id) {
        supabaseMatchUuid = matchData.id
      }

      // Build and subscribe to channel
      const channel = buildChannel(supabaseMatchUuid)

      channel.subscribe((status) => {
        if (!isMountedRef.current) return

        if (status === 'SUBSCRIBED') {
          setStatus(CONNECTION_STATUS.CONNECTED)
          setActiveConnection('supabase')
          setError(null)

          // If we connected WITHOUT the UUID, retry the lookup periodically
          // so we can upgrade to full subscriptions once the match is synced
          if (!supabaseMatchUuid) {
            console.warn('[RealtimeConnection] Connected without UUID — will retry lookup')
            const retryLookup = async () => {
              if (!isMountedRef.current) return
              const { data } = await apiFrom('matches')
                .select('id')
                .eq('external_id', matchId)
                .maybeSingle()

              if (data?.id) {
                // UUID now available — rebuild channel with full subscriptions
                console.log('[RealtimeConnection] UUID found on retry, upgrading subscriptions')
                try { supabase?.removeChannel(channel) } catch {}
                const fullChannel = buildChannel(data.id)
                fullChannel.subscribe((s) => {
                  if (!isMountedRef.current) return
                  if (s === 'SUBSCRIBED') {
                    setStatus(CONNECTION_STATUS.CONNECTED)
                    setActiveConnection('supabase')
                    // Fetch fresh data now that we have full subscriptions
                    fetchAndDeliver('uuid retry')
                  }
                })
                supabaseChannelRef.current = fullChannel
              } else if (isMountedRef.current) {
                // Still no UUID, retry again in 3 seconds
                uuidRetryRef.current = setTimeout(retryLookup, 3000)
              }
            }
            uuidRetryRef.current = setTimeout(retryLookup, 3000)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[RealtimeConnection] Supabase channel error/timeout, status:', status)
        }
      })

      supabaseChannelRef.current = channel
      return true
    } catch (err) {
      console.error('[RealtimeConnection] Supabase connection error:', err)
      setError(err.message)
      return false
    }
  }, [matchId, buildChannel, fetchAndDeliver])

  // Connect to WebSocket (exclusive fallback)
  const connectWebSocket = useCallback(() => {
    if (!matchId) return false

    try {
      setStatus(CONNECTION_STATUS.CONNECTING)

      const unsubscribe = subscribeToMatchData(matchId, (data) => {
        if (!isMountedRef.current) return
        setLastUpdate(Date.now())

        // Check if this is an action
        if (data && data._action) {
          if (onActionRef.current) {
            onActionRef.current(data._action, data._actionData)
          }
        } else if (data && data.match) {
          if (onDataRef.current) {
            onDataRef.current({ success: true, ...data })
          }
        }
      })

      wsUnsubscribeRef.current = unsubscribe
      setStatus(CONNECTION_STATUS.FALLBACK)
      setActiveConnection('websocket')
      setError(null)
      return true
    } catch (err) {
      console.error('[RealtimeConnection] WebSocket connection error:', err)
      setError(err.message)
      return false
    }
  }, [matchId])

  // Force reconnect — runs the waterfall again
  const reconnect = useCallback(() => {
    isConnectingRef.current = false
    cleanup()
    if (!matchId) return

    const doReconnect = async () => {
      isConnectingRef.current = true
      try {
        // Strict waterfall: Supabase → WebSocket → disconnected
        const supabaseSuccess = await connectSupabase()
        if (!supabaseSuccess) {
          const wsSuccess = connectWebSocket()
          if (!wsSuccess) {
            setStatus(CONNECTION_STATUS.ERROR)
          }
        }
      } finally {
        isConnectingRef.current = false
      }
    }
    doReconnect()
  }, [matchId, cleanup, connectSupabase, connectWebSocket])

  // Main connection effect — strict waterfall: Supabase → WebSocket → disconnected
  useEffect(() => {
    if (isConnectingRef.current) return

    isMountedRef.current = true

    const doConnect = async () => {
      if (!enabled || !matchId) return

      isConnectingRef.current = true
      cleanup()

      try {
        // Priority 1: Try Supabase
        const supabaseSuccess = await connectSupabase()
        if (!supabaseSuccess) {
          // Priority 2: Fall back to WebSocket (exclusive — Supabase is not running)
          const wsSuccess = connectWebSocket()
          if (!wsSuccess) {
            // Priority 3: Disconnected
            setStatus(CONNECTION_STATUS.ERROR)
          }
        }
      } finally {
        isConnectingRef.current = false
      }
    }

    doConnect()

    return () => {
      isMountedRef.current = false
      isConnectingRef.current = false
      cleanup()
    }
  }, [matchId, enabled]) // Only core dependencies

  // Supabase recheck: when in WebSocket fallback, periodically try to promote to Supabase
  useEffect(() => {
    if (status !== CONNECTION_STATUS.FALLBACK || !matchId || !enabled) {
      // Not in fallback mode — clear any existing recheck timer
      if (supabaseRecheckRef.current) {
        clearInterval(supabaseRecheckRef.current)
        supabaseRecheckRef.current = null
      }
      return
    }

    // Start periodic recheck
    supabaseRecheckRef.current = setInterval(async () => {
      if (!isMountedRef.current || isConnectingRef.current) return

      console.log('[RealtimeConnection] Rechecking Supabase availability...')

      // Quick probe: try a lightweight query
      try {
        const { error: probeError } = await apiFrom('matches').select('id').limit(1)
        if (probeError) return // Supabase still not available

        // Supabase is back! Promote from WebSocket → Supabase
        console.log('[RealtimeConnection] Supabase is back — promoting from WebSocket fallback')
        isConnectingRef.current = true

        // Tear down WebSocket
        if (wsUnsubscribeRef.current) {
          try { wsUnsubscribeRef.current() } catch {}
          wsUnsubscribeRef.current = null
        }

        // Connect to Supabase
        const success = await connectSupabase()
        if (!success) {
          // Failed to promote — stay on WebSocket
          console.warn('[RealtimeConnection] Promotion failed, reconnecting WebSocket')
          connectWebSocket()
        }

        isConnectingRef.current = false
      } catch {
        // Supabase still not reachable — stay on WebSocket
      }
    }, SUPABASE_RECHECK_INTERVAL)

    return () => {
      if (supabaseRecheckRef.current) {
        clearInterval(supabaseRecheckRef.current)
        supabaseRecheckRef.current = null
      }
    }
  }, [status, matchId, enabled, connectSupabase, connectWebSocket])

  // No-op for backward compatibility
  const switchConnection = useCallback(() => {}, [])

  return {
    // State
    connectionType: 'auto', // Always auto now
    activeConnection,
    status,
    error,
    lastUpdate,

    // Computed
    isConnected: status === CONNECTION_STATUS.CONNECTED || status === CONNECTION_STATUS.FALLBACK,
    isSupabase: activeConnection === 'supabase',
    isWebSocket: activeConnection === 'websocket',
    isFallback: status === CONNECTION_STATUS.FALLBACK,

    // Actions
    switchConnection, // no-op for backward compat
    reconnect,
    setConnectionType: switchConnection // no-op for backward compat
  }
}

export default useRealtimeConnection
