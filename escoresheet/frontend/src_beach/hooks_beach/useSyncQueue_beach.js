import { useEffect, useCallback, useRef, useState } from 'react'
import { db } from '../db_beach/db_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import { getSynologyClient, isSynologyEnabled } from '../lib_beach/synologyClient_beach'

/**
 * ============================================================================
 * SYNC ARCHITECTURE: IndexedDB + Supabase + Synology (PostgreSQL)
 * ============================================================================
 *
 * This app uses a TWO-PATH write architecture with DUAL SYNC TARGETS:
 *
 * PATH 1: QUEUED SYNC (this hook)
 * --------------------------------
 * Used for: Events, Sets, Match metadata
 * Flow: IndexedDB write (immediate) → sync_queue → Supabase + Synology (async)
 *
 * Why queued?
 * - Offline-first: Works without internet, syncs when back online
 * - Dependency ordering: Matches must exist in remote before sets/events
 * - Retry safety: external_id enables idempotent upserts (no duplicates on retry)
 * - JSONB merging: Multiple components write different fields safely
 *
 * PATH 2: DIRECT WRITES (bypasses this queue)
 * --------------------------------
 * Used for: match_live_state table only
 * Flow: Direct upsert to both targets (no local queue)
 *
 * Why direct?
 * - Real-time latency: Spectators need sub-second updates
 * - Queuing adds 1000ms+ delay (polling interval)
 * - Acceptable tradeoff: live_state is ephemeral, can be reconstructed
 *
 * DUAL SYNC TARGETS:
 * -----------------
 * - Supabase: Cloud database (always available via internet)
 * - Synology: Local PostgreSQL via PostgREST (fast on local network)
 *
 * Each target is synced independently. If one fails, the other can still succeed.
 * Per-target status is tracked in sync_queue: supabase_status, synology_status
 *
 * KEY DESIGN DECISIONS:
 * - external_id: Stable identifier across retries (immutable, unlike game_n)
 * - JSONB merging: Fetch existing + merge on update to prevent field overwrites
 * - Dependency retries: Jobs retry up to MAX_DEPENDENCY_RETRIES times
 * - Connection caching: Only recheck connections every 30 seconds
 * - Independent sync: Each target syncs independently, failures don't block others
 *
 * See also:
 * - db.js: sync_queue table schema
 * - Scoreboard.jsx: Event logging + live_state direct writes
 * - synologyClient_beach.js: PostgREST client for Synology
 * ============================================================================
 */

// Sync status types for each target: 'offline' | 'disabled' | 'connecting' | 'syncing' | 'synced' | 'error'
// Combined status: 'offline' | 'syncing' | 'synced' | 'partial' | 'error'

// Resource processing order - matches must be synced before sets/events (FK dependency)
const RESOURCE_ORDER = ['match', 'set', 'event']

// Max retries for jobs waiting on dependencies (e.g., event waiting for match to sync)
const MAX_DEPENDENCY_RETRIES = 10

// Auto-retry interval for errored jobs (every 30 seconds when online)
const ERROR_RETRY_INTERVAL = 30000

// Connection check interval (30 seconds)
const CONNECTION_CHECK_INTERVAL = 30000

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'

// Valid matches table columns - filters out invalid columns from old backup formats
const VALID_MATCH_COLUMNS = [
  'external_id', 'game_n', 'game_pin', 'status', 'connections', 'connection_pins',
  'scheduled_at', 'match_info', 'officials', 'team1_team', 'players_team1',
  'team2_team', 'players_team2', 'coin_toss', 'results', 'signatures',
  'approval', 'test', 'created_at', 'updated_at', 'manual_changes', 'current_set',
  'set_results', 'final_score', 'sanctions', 'winner', 'sport_type'
]

// Filter match payload to only include valid columns
function filterMatchPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => VALID_MATCH_COLUMNS.includes(key))
  )
}

/**
 * Internal helper: Reset errored jobs to queued for a specific target
 * @param {string} target - 'supabase' or 'synology'
 */
async function retryErrorsForTarget(target) {
  try {
    const statusField = `${target}_status`
    const errorJobs = await db.sync_queue.where(statusField).equals('error').toArray()
    if (errorJobs.length === 0) return false

    for (const job of errorJobs) {
      await db.sync_queue.update(job.id, {
        [statusField]: 'queued',
        [`${target}_retry_count`]: 0
      })
    }
    return true
  } catch (err) {
    console.error(`[SyncQueue] Auto-retry errors for ${target} failed:`, err)
    return false
  }
}

/**
 * Internal helper: Reset all errored jobs to queued (for backwards compatibility)
 */
async function retryErrorsInternal() {
  let hadErrors = false
  hadErrors = await retryErrorsForTarget('supabase') || hadErrors
  hadErrors = await retryErrorsForTarget('synology') || hadErrors
  return hadErrors
}

export function useSyncQueue() {
  const busy = useRef(false)

  // Per-target sync status
  const [supabaseStatus, setSupabaseStatus] = useState('offline')
  const [synologyStatus, setSynologyStatus] = useState('disabled')

  // Combined sync status for backwards compatibility
  const [syncStatus, setSyncStatus] = useState('offline')

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  // Cache connection state to avoid checking on every flush
  const supabaseConnectionVerified = useRef(false)
  const synologyConnectionVerified = useRef(false)
  const lastSupabaseCheck = useRef(0)
  const lastSynologyCheck = useRef(0)

  // Synology client ref (refreshed when settings change)
  const synologyClientRef = useRef(null)

  // Refresh Synology client from settings
  // Auto-enabled when URL is configured - no manual enable needed
  const refreshSynologyClient = useCallback(() => {
    synologyClientRef.current = getSynologyClient()
    if (synologyClientRef.current) {
      setSynologyStatus('offline') // Will be updated on connection check
    } else {
      setSynologyStatus('disabled')
    }
  }, [])

  // Update combined sync status based on individual target statuses
  const updateCombinedStatus = useCallback((newSupabaseStatus, newSynologyStatus) => {
    // If both disabled/offline, we're offline
    if ((newSupabaseStatus === 'offline' || newSupabaseStatus === 'disabled') &&
        (newSynologyStatus === 'offline' || newSynologyStatus === 'disabled')) {
      setSyncStatus('offline')
      return
    }

    // If either is syncing, we're syncing
    if (newSupabaseStatus === 'syncing' || newSynologyStatus === 'syncing') {
      setSyncStatus('syncing')
      return
    }

    // If both configured targets are synced, we're synced
    const supabaseOk = newSupabaseStatus === 'synced' || newSupabaseStatus === 'disabled'
    const synologyOk = newSynologyStatus === 'synced' || newSynologyStatus === 'disabled'
    if (supabaseOk && synologyOk) {
      setSyncStatus('synced')
      return
    }

    // If one is synced and other has error, we're partial
    if ((newSupabaseStatus === 'synced' && newSynologyStatus === 'error') ||
        (newSupabaseStatus === 'error' && newSynologyStatus === 'synced')) {
      setSyncStatus('partial')
      return
    }

    // If either has error, we have error
    if (newSupabaseStatus === 'error' || newSynologyStatus === 'error') {
      setSyncStatus('error')
      return
    }

    // Default to syncing
    setSyncStatus('syncing')
  }, [])

  // Check Supabase connection (with caching)
  const checkSupabaseConnection = useCallback(async (forceCheck = false) => {
    if (!supabase) {
      setSupabaseStatus('disabled')
      return false
    }

    const now = Date.now()
    if (!forceCheck && supabaseConnectionVerified.current &&
        (now - lastSupabaseCheck.current) < CONNECTION_CHECK_INTERVAL) {
      return true
    }

    try {
      if (!supabaseConnectionVerified.current) {
        setSupabaseStatus('connecting')
      }
      const { error } = await supabase.from('matches').select('id').limit(1)
      if (error) {
        supabaseConnectionVerified.current = false
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setSupabaseStatus('disabled')
          return false
        }
        if (error.message?.includes('secret API key') || error.message?.includes('Forbidden use of secret') ||
            error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          setSupabaseStatus('error')
          return false
        }
        console.error('[SyncQueue] Supabase connection check error:', error)
        setSupabaseStatus('error')
        return false
      }
      supabaseConnectionVerified.current = true
      lastSupabaseCheck.current = now
      return true
    } catch (err) {
      supabaseConnectionVerified.current = false
      console.warn('[SyncQueue] Supabase connection check failed:', err.message || err)
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setSupabaseStatus('offline')
        return false
      }
      console.error('[SyncQueue] Supabase connection check exception:', err)
      setSupabaseStatus('error')
      return false
    }
  }, [])

  // Check Synology connection (with caching)
  const checkSynologyConnection = useCallback(async (forceCheck = false) => {
    const client = synologyClientRef.current
    if (!client) {
      setSynologyStatus('disabled')
      return false
    }

    const now = Date.now()
    if (!forceCheck && synologyConnectionVerified.current &&
        (now - lastSynologyCheck.current) < CONNECTION_CHECK_INTERVAL) {
      return true
    }

    try {
      if (!synologyConnectionVerified.current) {
        setSynologyStatus('connecting')
      }
      const { error } = await client.from('matches').select('id').limit(1).execute()
      if (error) {
        synologyConnectionVerified.current = false
        console.error('[SyncQueue] Synology connection check error:', error)
        setSynologyStatus('error')
        return false
      }
      synologyConnectionVerified.current = true
      lastSynologyCheck.current = now
      return true
    } catch (err) {
      synologyConnectionVerified.current = false
      if (err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('timeout')) {
        setSynologyStatus('offline')
        return false
      }
      console.error('[SyncQueue] Synology connection check exception:', err)
      setSynologyStatus('error')
      return false
    }
  }, [])

  /**
   * Process a single job to a specific target
   * @param {object} job - The sync queue job
   * @param {object} client - The database client (supabase or synology)
   * @param {string} targetName - 'supabase' or 'synology' for logging
   * @returns {boolean|null} true=success, false=error, null=retry later
   */
  const processJobToTarget = useCallback(async (job, client, targetName) => {
    try {
      // ==================== MATCH ====================
      if (job.resource === 'match' && job.action === 'insert') {
        const matchPayload = filterMatchPayload({ ...job.payload, sport_type: SPORT_TYPE })
        const { error } = await client
          .from('matches')
          .upsert(matchPayload, { onConflict: 'external_id' })
        if (error) {
          console.error(`[SyncQueue:${targetName}] Match insert error:`, error, matchPayload)
          return false
        }
        return true
      }

      if (job.resource === 'match' && job.action === 'update') {
        const { id, ...updateData } = job.payload

        // JSONB columns that need to be merged instead of replaced
        const jsonbColumns = ['connections', 'connection_pins', 'team_a', 'team_b', 'officials', 'coin_toss', 'set_results', 'sanctions']
        const hasJsonbColumns = jsonbColumns.some(col => updateData[col] !== undefined)

        let finalUpdateData = { ...updateData }

        // If updating JSONB columns, fetch existing values and merge
        if (hasJsonbColumns) {
          const columnsToFetch = jsonbColumns.filter(col => updateData[col] !== undefined)
          const { data: existingMatch, error: fetchError } = await client
            .from('matches')
            .select(columnsToFetch.join(','))
            .eq('external_id', id)
            .eq('sport_type', SPORT_TYPE)
            .maybeSingle()

          if (fetchError) {
            console.error(`[SyncQueue:${targetName}] Match fetch for merge error:`, fetchError)
          }

          if (existingMatch) {
            for (const col of columnsToFetch) {
              if (updateData[col] && typeof updateData[col] === 'object' && !Array.isArray(updateData[col])) {
                finalUpdateData[col] = {
                  ...(existingMatch[col] || {}),
                  ...updateData[col]
                }
              }
            }
          }
        }

        const { error } = await client
          .from('matches')
          .update(finalUpdateData)
          .eq('external_id', id)
          .eq('sport_type', SPORT_TYPE)
        if (error) {
          console.error(`[SyncQueue:${targetName}] Match update error:`, error, job.payload)
          return false
        }
        return true
      }

      if (job.resource === 'match' && job.action === 'delete') {
        const { id } = job.payload

        const { data: matchData, error: lookupError } = await client
          .from('matches')
          .select('id')
          .eq('external_id', id)
          .eq('sport_type', SPORT_TYPE)
          .maybeSingle()

        if (lookupError) {
          console.error(`[SyncQueue:${targetName}] Match lookup error:`, lookupError, job.payload)
          return false
        }

        if (!matchData) {
          return true // Already deleted
        }

        const matchUuid = matchData.id

        // Delete related records
        await client.from('events').delete().eq('match_id', matchUuid)
        await client.from('sets').delete().eq('match_id', matchUuid)
        await client.from('match_live_state').delete().eq('match_id', matchUuid)

        const { error: matchError } = await client
          .from('matches')
          .delete()
          .eq('id', matchUuid)
        if (matchError) {
          console.error(`[SyncQueue:${targetName}] Match delete error:`, matchError, job.payload)
          return false
        }
        return true
      }

      // ==================== MATCH RESTORE ====================
      if (job.resource === 'match' && job.action === 'restore') {
        const { match, sets, events, liveState } = job.payload

        if (!match?.external_id) {
          console.error(`[SyncQueue:${targetName}] Restore failed: missing external_id`)
          return false
        }

        const externalId = match.external_id

        try {
          // Look up existing match
          const { data: existingMatch, error: lookupError } = await client
            .from('matches')
            .select('id')
            .eq('external_id', externalId)
            .eq('sport_type', SPORT_TYPE)
            .maybeSingle()

          if (lookupError) {
            console.error(`[SyncQueue:${targetName}] Restore lookup error:`, lookupError)
            return false
          }

          // Delete existing data for this match
          if (existingMatch) {
            const matchUuid = existingMatch.id
            await client.from('events').delete().eq('match_id', matchUuid)
            await client.from('sets').delete().eq('match_id', matchUuid)
            await client.from('match_live_state').delete().eq('match_id', matchUuid)
          }

          // Upsert match
          const filteredMatch = filterMatchPayload({ ...match, sport_type: SPORT_TYPE })
          const { data: upsertedMatch, error: matchError } = await client
            .from('matches')
            .upsert(filteredMatch, { onConflict: 'external_id' })
            .select('id')
            .single()

          if (matchError) {
            console.error(`[SyncQueue:${targetName}] Match upsert failed:`, matchError)
            return false
          }

          const matchUuid = upsertedMatch.id

          // Insert sets
          if (sets?.length > 0) {
            for (const set of sets) {
              const setPayload = { ...set, match_id: matchUuid }
              await client.from('sets').upsert(setPayload, { onConflict: 'external_id' })
            }
          }

          // Insert events
          if (events?.length > 0) {
            const eventsWithMatchId = events.map(e => ({ ...e, match_id: matchUuid }))
            await client.from('events').upsert(eventsWithMatchId, { onConflict: 'external_id' })
          }

          // Upsert live state
          if (liveState) {
            const liveStatePayload = { ...liveState, match_id: matchUuid }
            await client.from('match_live_state').upsert(liveStatePayload, { onConflict: 'match_id' })
          }

          return true
        } catch (restoreErr) {
          console.error(`[SyncQueue:${targetName}] Restore exception:`, restoreErr)
          return false
        }
      }

      // ==================== SET ====================
      if (job.resource === 'set' && job.action === 'insert') {
        let setPayload = { ...job.payload }

        if (setPayload.match_id && typeof setPayload.match_id === 'string') {
          const { data: matchData } = await client
            .from('matches')
            .select('id')
            .eq('external_id', setPayload.match_id)
            .eq('sport_type', SPORT_TYPE)
            .maybeSingle()

          if (!matchData) {
            return null // Retry later - match not yet synced
          }
          setPayload.match_id = matchData.id
        }

        const { error } = await client
          .from('sets')
          .upsert(setPayload, { onConflict: 'external_id' })
        if (error) {
          console.error(`[SyncQueue:${targetName}] Set insert error:`, error, setPayload)
          return false
        }
        return true
      }

      if (job.resource === 'set' && job.action === 'update') {
        const { external_id, ...updateData } = job.payload
        const { error } = await client
          .from('sets')
          .update(updateData)
          .eq('external_id', external_id)
        if (error) {
          console.error(`[SyncQueue:${targetName}] Set update error:`, error, job.payload)
          return false
        }
        return true
      }

      // ==================== EVENT ====================
      if (job.resource === 'event' && job.action === 'insert') {
        let eventPayload = { ...job.payload }

        if (eventPayload.match_id && typeof eventPayload.match_id === 'string') {
          const { data: matchData } = await client
            .from('matches')
            .select('id')
            .eq('external_id', eventPayload.match_id)
            .eq('sport_type', SPORT_TYPE)
            .maybeSingle()

          if (!matchData) {
            return null // Retry later - match not yet synced
          }
          eventPayload.match_id = matchData.id
        }

        const { error } = await client
          .from('events')
          .upsert(eventPayload, { onConflict: 'external_id' })
        if (error) {
          console.error(`[SyncQueue:${targetName}] Event insert error:`, error, eventPayload)
          return false
        }
        return true
      }

      // Unknown resource/action
      console.warn(`[SyncQueue:${targetName}] Unknown job type:`, job.resource, job.action)
      return true

    } catch (err) {
      console.error(`[SyncQueue:${targetName}] Job processing error:`, err, job)
      return false
    }
  }, [])

  // Legacy processJob for Supabase (backwards compatibility)
  const processJob = useCallback(async (job) => {
    if (!supabase) return false
    return processJobToTarget(job, supabase, 'supabase')
  }, [processJobToTarget])

  const flush = useCallback(async () => {
    if (busy.current) return

    // Refresh Synology client in case settings changed
    refreshSynologyClient()

    const synologyClient = synologyClientRef.current
    const hasSupabase = !!supabase
    const hasSynology = !!synologyClient

    // If neither target is configured, nothing to do
    if (!hasSupabase && !hasSynology) {
      setSyncStatus('offline')
      return
    }

    // Check connections
    const supabaseConnected = hasSupabase ? await checkSupabaseConnection() : false
    const synologyConnected = hasSynology ? await checkSynologyConnection() : false

    // If both fail, nothing to sync
    if (!supabaseConnected && !synologyConnected) {
      updateCombinedStatus(supabaseStatus, synologyStatus)
      return
    }

    try {
      // Get jobs that need processing for either target
      const allJobs = await db.sync_queue.toArray()

      // Filter to jobs that need work
      const jobsForSupabase = supabaseConnected
        ? allJobs.filter(j => j.supabase_status === 'queued' || j.supabase_status === undefined)
        : []
      const jobsForSynology = synologyConnected
        ? allJobs.filter(j => j.synology_status === 'queued' || j.synology_status === undefined)
        : []

      if (jobsForSupabase.length === 0 && jobsForSynology.length === 0) {
        if (supabaseConnected) setSupabaseStatus('synced')
        if (synologyConnected) setSynologyStatus('synced')
        updateCombinedStatus(
          supabaseConnected ? 'synced' : supabaseStatus,
          synologyConnected ? 'synced' : synologyStatus
        )
        return
      }

      busy.current = true

      // Process Supabase jobs
      if (supabaseConnected && jobsForSupabase.length > 0) {
        setSupabaseStatus('syncing')
        let hasError = false
        let hasRetry = false

        // Group by resource
        const jobsByResource = {}
        for (const job of jobsForSupabase) {
          if (!jobsByResource[job.resource]) jobsByResource[job.resource] = []
          jobsByResource[job.resource].push(job)
        }

        // Process in dependency order
        for (const resource of RESOURCE_ORDER) {
          const jobs = jobsByResource[resource] || []
          for (const job of jobs) {
            const result = await processJobToTarget(job, supabase, 'supabase')

            if (result === true) {
              await db.sync_queue.update(job.id, {
                supabase_status: 'sent',
                supabase_retry_count: 0
              })
            } else if (result === false) {
              await db.sync_queue.update(job.id, { supabase_status: 'error' })
              hasError = true
            } else if (result === null) {
              const currentRetries = job.supabase_retry_count || 0
              if (currentRetries >= MAX_DEPENDENCY_RETRIES) {
                await db.sync_queue.update(job.id, {
                  supabase_status: 'error',
                  supabase_retry_count: currentRetries
                })
                hasError = true
              } else {
                await db.sync_queue.update(job.id, {
                  supabase_retry_count: currentRetries + 1
                })
                hasRetry = true
              }
            }
          }
        }

        if (hasError) {
          setSupabaseStatus('error')
        } else if (hasRetry) {
          setSupabaseStatus('syncing')
        } else {
          setSupabaseStatus('synced')
        }
      }

      // Process Synology jobs
      if (synologyConnected && jobsForSynology.length > 0) {
        setSynologyStatus('syncing')
        let hasError = false
        let hasRetry = false

        // Group by resource
        const jobsByResource = {}
        for (const job of jobsForSynology) {
          if (!jobsByResource[job.resource]) jobsByResource[job.resource] = []
          jobsByResource[job.resource].push(job)
        }

        // Process in dependency order
        for (const resource of RESOURCE_ORDER) {
          const jobs = jobsByResource[resource] || []
          for (const job of jobs) {
            const result = await processJobToTarget(job, synologyClient, 'synology')

            if (result === true) {
              await db.sync_queue.update(job.id, {
                synology_status: 'sent',
                synology_retry_count: 0
              })
            } else if (result === false) {
              await db.sync_queue.update(job.id, { synology_status: 'error' })
              hasError = true
            } else if (result === null) {
              const currentRetries = job.synology_retry_count || 0
              if (currentRetries >= MAX_DEPENDENCY_RETRIES) {
                await db.sync_queue.update(job.id, {
                  synology_status: 'error',
                  synology_retry_count: currentRetries
                })
                hasError = true
              } else {
                await db.sync_queue.update(job.id, {
                  synology_retry_count: currentRetries + 1
                })
                hasRetry = true
              }
            }
          }
        }

        if (hasError) {
          setSynologyStatus('error')
        } else if (hasRetry) {
          setSynologyStatus('syncing')
        } else {
          setSynologyStatus('synced')
        }
      }

      // Update combined status
      updateCombinedStatus(supabaseStatus, synologyStatus)

      // Clean up fully synced jobs (both targets done)
      const jobsToCheck = await db.sync_queue.toArray()
      for (const job of jobsToCheck) {
        const supabaseOk = job.supabase_status === 'sent' || !hasSupabase
        const synologyOk = job.synology_status === 'sent' || !hasSynology
        if (supabaseOk && synologyOk) {
          await db.sync_queue.update(job.id, { status: 'sent' })
        }
      }

    } catch (err) {
      console.error('[SyncQueue] Flush error:', err)
      setSyncStatus('error')
    } finally {
      busy.current = false
    }
  }, [
    checkSupabaseConnection,
    checkSynologyConnection,
    processJobToTarget,
    refreshSynologyClient,
    updateCombinedStatus,
    supabaseStatus,
    synologyStatus
  ])

  // Monitor online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      setIsOnline(true)
      supabaseConnectionVerified.current = false
      synologyConnectionVerified.current = false

      setTimeout(async () => {
        await retryErrorsInternal()
        flush()
      }, 500)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
      setSupabaseStatus('offline')
      if (synologyClientRef.current) {
        setSynologyStatus('offline')
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial setup
    refreshSynologyClient()

    if (isOnline) {
      retryErrorsInternal().then(() => flush())
    } else {
      setSyncStatus('offline')
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline, flush, refreshSynologyClient])

  // Real-time sync - check every 1 second for new items
  useEffect(() => {
    if (!isOnline || syncStatus === 'offline') return

    const interval = setInterval(() => {
      if (!busy.current) {
        flush()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isOnline, syncStatus, flush])

  // Auto-retry errored jobs every 30 seconds when online
  useEffect(() => {
    if (!isOnline || syncStatus === 'offline') return

    const interval = setInterval(async () => {
      if (!busy.current) {
        const hadErrors = await retryErrorsInternal()
        if (hadErrors) {
          flush()
        }
      }
    }, ERROR_RETRY_INTERVAL)

    return () => clearInterval(interval)
  }, [isOnline, syncStatus, flush])

  // Listen for Synology settings changes
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'synology_url' || e.key === 'synology_enabled') {
        synologyConnectionVerified.current = false
        refreshSynologyClient()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [refreshSynologyClient])

  /**
   * Manual retry: reset all 'error' status jobs to 'queued' for immediate reprocessing
   */
  const retryErrors = useCallback(async () => {
    const hadErrors = await retryErrorsInternal()
    if (hadErrors) {
      flush()
    }
  }, [flush])

  return {
    flush,
    retryErrors,
    syncStatus,
    supabaseStatus,
    synologyStatus,
    isOnline,
    // Expose refresh function for settings UI
    refreshSynologyClient
  }
}
