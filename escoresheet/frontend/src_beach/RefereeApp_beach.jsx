import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, CalendarX2, Loader2, RefreshCw } from 'lucide-react'
import { validatePin, listAvailableMatches, validatePinSupabase, listAvailableMatchesSupabase, forgetMatchAccess, setRelayDevice, relayIsCloud as relayIsTheCloud, pinMatchKey } from './utils_beach/serverDataSync_beach'
import Referee from './components_beach/Referee_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import DashboardHeader from './components_beach/DashboardHeader_beach'
import { Whistle } from './ui/volleyui/AppSpinner.jsx'
import { Button } from './ui/volleyui/Button.jsx'
import { IconButton } from './ui/volleyui/IconButton.jsx'
import { Field, FormError } from './ui/volleyui/Field.jsx'
import { EmptyState, EmptyInset } from './ui/volleyui/EmptyState.jsx'
import { RowList } from './ui/volleyui/Row.jsx'
import { SkeletonRows } from './ui/volleyui/Skeleton.jsx'
import { Modal as KitModal } from './ui/volleyui/Modal.jsx'
import { EntryPage, EntryCard, PinInput, ListLabel, GameRow } from './components_beach/dashboards/EntryKit_beach.jsx'
import { db } from './db_beach/db_beach'
import { getRelayWebSocketUrl, isLanBackendUrl, isRelayOriginPage } from './utils_beach/backendConfig_beach'
import { loadRefereeMatches } from './utils_beach/refereeMatches_beach'

// This page's relay sockets are a referee tablet: the scorer's Connect
// tablets dialog shows it as connected (only referee-main_beach loads this)
setRelayDevice('referee')

// A relay on the internet (the cloud) may need longer to answer than one on the venue LAN
const isCloudRelayUrl = (wsUrl) => !isLanBackendUrl(String(wsUrl).replace(/^ws/, 'http'))

// Master PIN for testing without a match
const MASTER_PIN = '123456'

// A refusal that compared nothing (too many wrong PINs from this address):
// the cloud check's 429, or the relay's thrown 429
const isRateLimited = (r) => r?.status === 429
// The relay's validatePin throws on every refusal: a 429 stays a rate limit
const failedLanCheck = (err) => (err?.status === 429 ? { success: false, status: 429, error: err.message } : null)

/**
 * Re-check a stored referee PIN (after a reload) the way handlePinSubmit checks
 * a typed one: the backend's check first, then the LAN relay. Both are asked
 * for the stored match only (its seed key: matchExternalId, the relay's
 * matchId), never a lookup among every match (OpenVolley audit SEC-06), and
 * the match must still be the stored one. A refusal that compared nothing
 * (429, too many wrong PINs from this address) is no answer about the PIN:
 * it throws (rateLimited), and the caller keeps the stored PIN for the next
 * load instead of dropping it like a wrong one. Ids stay strings: they are
 * seed keys ('match_…'), and Number() of one is NaN. Ported from OpenVolley
 * RefereeApp.
 * @returns {Promise<object|null>} the match, or null (the PIN no longer opens it)
 */
export async function revalidateRefereeSession(storedMatchId, storedPin, { checkCloud = validatePinSupabase, checkLan = validatePin, relayIsCloud = relayIsTheCloud } = {}) {
  const same = (r) => r?.success && r.match && String(r.match.id) === String(storedMatchId)
  const rateLimited = (r) => Object.assign(new Error(r?.error || 'Too many failed attempts'), { rateLimited: true })
  // a LAN relay's numeric id names no cloud match: the relay only
  const cloudKey = pinMatchKey(storedMatchId)
  let result = cloudKey ? null : { unreachable: true }
  if (cloudKey) {
    try { result = await checkCloud(storedPin, 'referee', { matchExternalId: cloudKey }) } catch { result = { unreachable: true } }
    if (same(result)) return result.match
    if (isRateLimited(result)) throw rateLimited(result)
    if (cloudAnswered(result, relayIsCloud)) return null
  }
  try { result = await checkLan(storedPin, 'referee', { matchId: String(storedMatchId) }) } catch (err) { result = failedLanCheck(err) }
  if (same(result)) return result.match
  if (isRateLimited(result)) throw rateLimited(result)
  return null
}

// The backend's PIN check did not answer (timeout, network, no backend, 5xx).
function cloudUnreachable(r) {
  return !r || r.unreachable === true
}

// The backend's answer is final: a rate limit (429) always; a wrong PIN (404)
// when the relay is the cloud itself, because both checks then charge the same
// per-address failure budget (one typo would cost two attempts, and referees
// behind one venue NAT would lock each other out twice as fast). A venue relay
// is still asked after a 404: it holds the matches the cloud never sees (a test
// match, a match not synced yet).
function cloudAnswered(r, relayIsCloud) {
  if (cloudUnreachable(r)) return false
  return r.status === 429 || relayIsCloud()
}

/**
 * Check a typed referee PIN: the backend's check (beach matches only), then
 * the LAN relay unless the backend's answer is final (cloudAnswered). A
 * thrown relay error is a failed check, not the message to show.
 * `matchKey`: the match the referee picked in the list (or the link names):
 * both checks compare the PIN with that match only, in its own brute-force
 * scope (the backend's matchExternalId, the relay's matchId), and an answer
 * for another match is refused. A PIN check without one is a lookup among
 * every open beach match, and the OpenVolley backend's lock of those lookups
 * refused every OpenBeach referee (audit SEC-06): it is left only for a
 * tablet that could not list the games (offline). A LAN relay's numeric id
 * names a room on that relay only, so the cloud is not asked for it.
 * @returns {Promise<{ match: object|null, source?: 'supabase'|'websocket', error?: string }>}
 */
export async function validateRefereePin(pin, { checkCloud = validatePinSupabase, checkLan = validatePin, relayIsCloud = relayIsTheCloud, matchKey = null, gameNumber = null } = {}) {
  const ok = (r) => r?.success && r.match
  const named = pinMatchKey(matchKey, { relay: true })
  const cloudKey = pinMatchKey(matchKey)
  const other = (r) => !!named && String(r.match.id) !== named
  let cloud
  if (named && !cloudKey) {
    cloud = { unreachable: true }
  } else {
    try { cloud = await (cloudKey ? checkCloud(pin, 'referee', { matchExternalId: cloudKey }) : checkCloud(pin, 'referee')) } catch { cloud = { unreachable: true } }
    if (ok(cloud) && other(cloud)) cloud = { success: false, status: 404 }
  }
  if (ok(cloud)) return { match: cloud.match, source: 'supabase' }
  if (cloudAnswered(cloud, relayIsCloud)) return { match: null, ...(isRateLimited(cloud) ? { error: cloud.error } : {}) }
  const lanMatch = named ? { matchId: named } : (gameNumber !== null && gameNumber !== undefined && String(gameNumber) !== '' ? { gameNumber: String(gameNumber) } : {})
  let lan
  try { lan = await checkLan(pin, 'referee', lanMatch) } catch (err) { lan = failedLanCheck(err) }
  if (ok(lan) && other(lan)) lan = null
  if (ok(lan)) return { match: lan.match, source: 'websocket' }
  return { match: null, ...(isRateLimited(lan) ? { error: lan.error } : {}) }
}

// Numeric LAN ids stay numbers, seed keys stay strings
const toMatchId = (id) => (/^\d+$/.test(String(id)) ? Number(id) : id)

// A row of the game list as the picker tells it from the others: its match
// key, else its id, else its game number
const gameRowId = (m) => String(listedMatchKey(m) ?? m?.id ?? m?.gameNumber ?? '')

/**
 * The match a link names (`?match=<seed key>`: the scorer's Connect tablets
 * code), or null. The link only preselects the match; the referee still
 * enters the PIN (ported from OpenVolley RefereeApp, 23054276).
 * @param {string} [search] window.location.search
 */
export function linkedMatchKey(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const key = new URLSearchParams(search || '').get('match')
    return key && key.trim() ? key.trim() : null
  } catch {
    return null
  }
}

/**
 * The linked match in the referee's game list (listed by its seed key), or
 * null when it is not listed (yet).
 * @param {string|null} key
 * @param {object[]} matches
 */
export function linkedMatchRow(key, matches) {
  if (!key || !Array.isArray(matches)) return null
  return matches.find(m => m && [m.id, m.seed_key, m.external_id].some(v => v != null && String(v) === key)) || null
}

/**
 * The game number of the linked match in the referee's game list (listed by
 * its seed key), or null when it is not listed (yet).
 * @param {string|null} key
 * @param {object[]} matches
 */
export function linkedGameNumber(key, matches) {
  const listed = linkedMatchRow(key, matches)
  return listed?.gameNumber != null && listed.gameNumber !== '' ? String(listed.gameNumber) : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The key the PIN check names a listed game by: its seed key (the cloud
 * list's external_id, the relay list's room id), else the row's id (a LAN
 * relay's own). Two rows of one game number stay two games. A cloud row
 * without an external_id lists its database id (a uuid), which names no
 * match to the PIN check: none then (the check looks the PIN up, as before).
 * @param {object} row  a row of the referee's game list
 * @returns {string|null}
 */
export function listedMatchKey(row) {
  if (!row || typeof row !== 'object') return null
  for (const v of [row.external_id, row.seed_key]) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  const id = row.id !== undefined && row.id !== null ? String(row.id).trim() : ''
  return id && !UUID_RE.test(id) ? id : null
}

export default function RefereeApp() {
  const { t, i18n } = useTranslation()
  const [pinInput, setPinInput] = useState('')
  const [matchId, setMatchId] = useState(null)
  const [error, setError] = useState('')
  const [match, setMatch] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [availableMatches, setAvailableMatches] = useState([])
  // The game picked in the list (gameRowId of its row): the PIN check names
  // that match (listedMatchKey), never only its game number
  const [selectedRowId, setSelectedRowId] = useState('')
  // A match link (QR code) preselects its game; the PIN is still asked
  const [linkedKey] = useState(() => linkedMatchKey())
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [showGameModal, setShowGameModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [serverConnected, setServerConnected] = useState(false)
  const [isMasterMode, setIsMasterMode] = useState(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const [testModeClicks, setTestModeClicks] = useState(0)
  const wakeLockRef = useRef(null)
  const testModeTimeoutRef = useRef(null)

  const [connectionStatuses, setConnectionStatuses] = useState({
    api: 'unknown',
    server: 'unknown',
    websocket: 'unknown',
    scoreboard: 'unknown',
    match: 'unknown',
    db: 'unknown'
  })

  // Check connection statuses
  const checkConnectionStatuses = async () => {
    const statuses = {
      api: 'unknown',
      server: 'unknown',
      websocket: 'unknown',
      scoreboard: 'unknown',
      match: 'unknown',
      db: 'unknown'
    }
    const debugInfo = {}
    
    // Check API/Server connection
    try {
      const result = await listAvailableMatches()
      if (result.success) {
        statuses.api = 'connected'
        statuses.server = 'connected'
        setServerConnected(true)
        debugInfo.api = { status: 'connected', message: 'API endpoint responding' }
        debugInfo.server = { status: 'connected', message: 'Server is reachable' }
      } else {
        statuses.api = 'disconnected'
        statuses.server = 'disconnected'
        setServerConnected(false)
        debugInfo.api = { status: 'disconnected', message: `API request failed: ${result.error || 'Unknown error'}` }
        debugInfo.server = { status: 'disconnected', message: `Server request failed: ${result.error || 'Unknown error'}` }
      }
    } catch (err) {
      statuses.api = 'disconnected'
      statuses.server = 'disconnected'
      setServerConnected(false)
      debugInfo.api = { status: 'disconnected', message: `Network error: ${err.message || 'Failed to connect to API'}` }
      debugInfo.server = { status: 'disconnected', message: `Network error: ${err.message || 'Failed to connect to server'}` }
    }
    
    // Check WebSocket server availability
    try {
      // The relay the scorer publishes to (backendConfig: a venue relay's own
      // WebSocket port, or the cloud)
      const wsUrl = getRelayWebSocketUrl()
      if (!wsUrl) throw new Error('No WebSocket relay for this page')
      const onCloud = isCloudRelayUrl(wsUrl)

      const wsTest = new WebSocket(wsUrl)
      let resolved = false

      // Use longer timeout for cloud backends
      const connectionTimeout = onCloud ? 10000 : 2000

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            try { wsTest.close() } catch (e) {}
            statuses.websocket = 'disconnected'
            debugInfo.websocket = { status: 'disconnected', message: `Connection timeout after ${connectionTimeout / 1000}s` }
            resolve()
          }
        }, connectionTimeout)

        wsTest.onopen = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            try { wsTest.close() } catch (e) {}
            statuses.websocket = 'connected'
            debugInfo.websocket = { status: 'connected', message: 'WebSocket server is reachable' }
            resolve()
          }
        }

        wsTest.onerror = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            try { wsTest.close() } catch (e) {}
            statuses.websocket = 'disconnected'
            debugInfo.websocket = { status: 'disconnected', message: `WebSocket connection error` }
            resolve()
          }
        }
        
        wsTest.onclose = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            statuses.websocket = 'disconnected'
            resolve()
          }
        }
      })
    } catch (err) {
      statuses.websocket = 'disconnected'
      debugInfo.websocket = { status: 'disconnected', message: `Error: ${err.message}` }
    }
    
    statuses.scoreboard = statuses.server
    debugInfo.scoreboard = debugInfo.server
    
    if (matchId && match) {
      statuses.match = match.status === 'live' ? 'live' : match.status === 'scheduled' ? 'scheduled' : 'final'
      debugInfo.match = { status: statuses.match, message: `Match status: ${statuses.match}` }
    } else if (isMasterMode) {
      statuses.match = 'test_mode'
      debugInfo.match = { status: 'test_mode', message: 'Running in test mode with master PIN' }
    } else {
      statuses.match = 'no_match'
      debugInfo.match = { status: 'no_match', message: 'No match connected.' }
    }
    
    try {
      await db.matches.count()
      statuses.db = 'connected'
      debugInfo.db = { status: 'connected', message: 'IndexedDB is accessible' }
    } catch (err) {
      statuses.db = 'disconnected'
      debugInfo.db = { status: 'disconnected', message: `IndexedDB error: ${err.message}` }
    }
    
    setConnectionStatuses(statuses)
  }

  // Load available matches function - called on mount and manually via button
  // Try Supabase first (cloud-persistent), fall back to WebSocket (local/cloud)
  const loadMatches = useCallback(async () => {
    setLoadingMatches(true)
    try {
      const { result } = await loadRefereeMatches({
        relayOrigin: isRelayOriginPage(),
        listCloud: listAvailableMatchesSupabase,
        listRelay: listAvailableMatches
      })

      if (result.success && result.matches) {
        console.debug('[RefereeApp] Loaded matches:', result.matches.map(m => ({
          id: m.id,
          gameNumber: m.gameNumber,
          refereeEnabled: m.refereeConnectionEnabled
        })))
        setAvailableMatches(result.matches)
        setServerConnected(true)
      } else {
        setServerConnected(false)
      }
    } catch (err) {
      console.error('[RefereeApp] Failed to load matches:', err)
      setServerConnected(false)
    } finally {
      setLoadingMatches(false)
    }
  }, [])

  // Load matches on mount only (no auto-polling - use manual refresh button)
  useEffect(() => {
    loadMatches()
    checkConnectionStatuses()
  }, [loadMatches])
  
  // Fullscreen functionality
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error)
    }
  }
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Wake lock - request on mount
  useEffect(() => {
    const enableWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          if (wakeLockRef.current) {
            try { await wakeLockRef.current.release() } catch (e) {}
          }
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => {
            if (!wakeLockRef.current) {
              setWakeLockActive(false)
            }
          })
        }
      } catch (err) {
      }
    }

    enableWakeLock()

    // Re-enable on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        enableWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [])

  // Toggle wake lock manually
  const toggleWakeLock = useCallback(async () => {
    if (wakeLockActive) {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release()
          wakeLockRef.current = null
        } catch (e) {}
      }
      setWakeLockActive(false)
    } else {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
        }
      } catch (err) {
        setWakeLockActive(true)
      }
    }
  }, [wakeLockActive])

  // Auto-connect on mount if we have stored credentials
  useEffect(() => {
    const storedMatchId = localStorage.getItem('refereeMatchId')
    const storedPin = localStorage.getItem('refereePin')
    const storedMasterMode = localStorage.getItem('refereeMasterMode')
    
    if (storedMasterMode === 'true') {
      setIsMasterMode(true)
      setMatchId(-1) // Use -1 as a sentinel for master mode
    } else if (storedMatchId && storedPin) {
      revalidateRefereeSession(storedMatchId, storedPin)
        .then(restored => {
          if (restored) {
            setMatchId(toMatchId(restored.id))
            setMatch(restored)
            setPinInput(storedPin)
          } else {
            localStorage.removeItem('refereeMatchId')
            localStorage.removeItem('refereePin')
          }
        })
        // Unreachable now, or refused without comparing the PIN (429, too
        // many wrong PINs from this address): keep the credentials for the
        // next load
        .catch((err) => { if (err?.rateLimited) setError(err.message) })
    }
  }, [])
  
  // The linked match in the game list (by its seed key) is the game picked
  useEffect(() => {
    if (!linkedKey || selectedRowId) return
    const row = linkedMatchRow(linkedKey, availableMatches)
    if (row) setSelectedRowId(gameRowId(row))
  }, [linkedKey, availableMatches, selectedRowId])

  // The picked game's row (null when none is picked, or the reloaded list no
  // longer has it: the referee picks again before the PIN)
  const selectedRow = selectedRowId ? (availableMatches.find(m => gameRowId(m) === selectedRowId) || null) : null

  const handleSelectGame = (row) => {
    setSelectedRowId(gameRowId(row))
    setShowGameModal(false)
  }

  // Monitor match connection status
  useEffect(() => {
    if (match && match.refereeConnectionEnabled === false) {
      setMatchId(null)
      setMatch(null)
      setPinInput('')
      setIsMasterMode(false)
      localStorage.removeItem('refereeMatchId')
      localStorage.removeItem('refereePin')
      localStorage.removeItem('refereeMasterMode')
      setError(t('refereeDashboard.errors.connectionDisabled'))
    }
  }, [match, t])

  const handlePinSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!pinInput || pinInput.length !== 6) {
      setError(t('refereeDashboard.errors.enterPin'))
      setIsLoading(false)
      return
    }

    // Check for master PIN first
    if (pinInput === MASTER_PIN) {
      setIsMasterMode(true)
      setMatchId(-1) // Use -1 as sentinel for master/test mode
      localStorage.setItem('refereeMasterMode', 'true')
      setIsLoading(false)
      return
    }

    try {
      // The backend's check first (beach matches only); the LAN relay only
      // when the backend did not answer. Both for the game picked (or the
      // one the link names), never a lookup among every match (SEC-06)
      const result = await validateRefereePin(pinInput.trim(), {
        matchKey: selectedRow ? listedMatchKey(selectedRow) : linkedKey,
        gameNumber: selectedRow?.gameNumber ?? null
      })

      if (result.match) {
        setMatchId(toMatchId(result.match.id))
        setMatch(result.match)
        localStorage.setItem('refereeMatchId', String(result.match.id))
        localStorage.setItem('refereePin', pinInput)
      } else {
        setError(result.error || t('refereeDashboard.errors.invalidPin'))
        setPinInput('')
        localStorage.removeItem('refereeMatchId')
        localStorage.removeItem('refereePin')
      }
    } catch (err) {
      console.error('Error validating PIN:', err)
      setError(err.message || t('refereeDashboard.errors.invalidPin'))
      setPinInput('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExit = useCallback((reason) => {
    forgetMatchAccess()
    setMatchId(null)
    setMatch(null)
    setPinInput('')
    setIsMasterMode(false)
    localStorage.removeItem('refereeMatchId')
    localStorage.removeItem('refereePin')
    localStorage.removeItem('refereeMasterMode')

    if (reason === 'heartbeat_failure') {
      setError(t('refereeDashboard.errors.connectionLost'))
    } else {
      setError('')
    }

    // Refresh the match list when returning to home
    loadMatches()
  }, [t, loadMatches])

  // Monitor match status - clear credentials if match becomes final
  useEffect(() => {
    if (match && match.status === 'final') {
      localStorage.removeItem('refereeMatchId')
      localStorage.removeItem('refereePin')
      setMatchId(null)
      setMatch(null)
      setPinInput('')
      setError(t('refereeDashboard.errors.matchEnded'))
    }
  }, [match, t])

  // Hidden test mode - 6 clicks on "No active game found"
  const handleTestModeClick = useCallback(() => {
    if (testModeTimeoutRef.current) {
      clearTimeout(testModeTimeoutRef.current)
    }

    setTestModeClicks(prev => {
      const newCount = prev + 1
      if (newCount >= 6) {
        // Trigger test/master mode
        setIsMasterMode(true)
        setMatchId(-1)
        localStorage.setItem('refereeMasterMode', 'true')
        return 0
      }
      return newCount
    })

    // Reset clicks after 2 seconds of no clicking
    testModeTimeoutRef.current = setTimeout(() => {
      setTestModeClicks(0)
    }, 2000)
  }, [])

  // Render Referee component if connected (either to match or in master mode)
  if (matchId) {
    // The referee view is an 800 px column: the stone page fills the sides
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--ov-page)' }}>
        <Referee matchId={matchId} onExit={handleExit} isMasterMode={isMasterMode} />
      </div>
    )
  }

  const reload = () => { loadMatches(); checkConnectionStatuses() }

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      maxWidth: '100vw',
      margin: '0 auto',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }} className="bg-stone-100 text-stone-800">
      <UpdateBanner />

      {/* Header */}
      <DashboardHeader
        title={t('refereeDashboard.title')}
        connectionStatuses={connectionStatuses}
        onLoadGames={reload}
        loadingMatches={loadingMatches}
        matchCount={availableMatches.length}
        showFullscreen={true}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        showWakeLock={true}
        wakeLockActive={wakeLockActive}
        onToggleWakeLock={toggleWakeLock}
      />

      {/* Main content */}
      <EntryPage className="overflow-y-auto">
        <EntryCard
          art={<Whistle size={88} strokeWidth={1.5} className="text-stone-900" />}
          title={t('refereeDashboard.dashboardTitle')}
        >
          {/* Show "no active game" when server is connected but no games available */}
          {serverConnected && availableMatches.length === 0 && !loadingMatches ? (
            <div onClick={handleTestModeClick} className="cursor-default select-none">
              <EmptyState icon={CalendarX2} className="py-6">
                {t('refereeDashboard.noActiveGame')}
              </EmptyState>
            </div>
          ) : (
          <form onSubmit={handlePinSubmit} className="flex flex-col gap-4 text-left">
            {availableMatches.length > 0 && (
              <div className="flex flex-col gap-3">
                <ListLabel
                  action={
                    <IconButton
                      variant="outline"
                      className="h-11 w-11"
                      icon={loadingMatches ? <Loader2 size={16} className="animate-spin" aria-hidden /> : RefreshCw}
                      label={t('refereeDashboard.loadGames', 'Load games')}
                      onClick={reload}
                      disabled={loadingMatches}
                    />
                  }
                >
                  {t('refereeDashboard.selectGame')} ({t('refereeDashboard.gamesAvailable', { count: availableMatches.length })})
                </ListLabel>

                <Button
                  variant="secondary"
                  size="xl"
                  block
                  iconRight={ChevronRight}
                  onClick={() => setShowGameModal(true)}
                  disabled={isLoading}
                >
                  {t('refereeDashboard.selectGame')}
                </Button>

                {selectedRow && (() => {
                  const selected = selectedRow

                  return (
                    <RowList framed soft className="rounded-lg">
                      <GameRow
                        match={selected}
                        lang={i18n.language}
                        home={selected.team1Name}
                        away={selected.team2Name}
                        gameLabel={t('refereeDashboard.gameNumber', { number: selected.gameNumber })}
                        noDate={selected.dateTime || t('refereeDashboard.tbd')}
                      />
                    </RowList>
                  )
                })()}
              </div>
            )}

            {/* Only show PIN input when offline OR when a game has been selected */}
            {(!serverConnected || (availableMatches.length > 0 && selectedRow)) && (
              <Field label={t('refereeDashboard.connectionPin')} className="text-left">
                <PinInput
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  aria-label={t('refereeDashboard.connectionPin')}
                  maxLength={6}
                  disabled={isLoading}
                  invalid={!!error}
                />
              </Field>
            )}

            <FormError size="md" className="text-center">{error}</FormError>

            {(!serverConnected || (availableMatches.length > 0 && selectedRow)) && (
              <Button type="submit" size="xl" block disabled={isLoading} loading={isLoading}>
                {isLoading ? t('refereeDashboard.connecting') : t('refereeDashboard.enter')}
              </Button>
            )}
          </form>
          )}
        </EntryCard>
      </EntryPage>

      <div className="ov-kit">
        <KitModal
          open={showGameModal}
          onClose={() => setShowGameModal(false)}
          title={t('refereeDashboard.selectGameTitle')}
          closeLabel={t('common.close', 'Close')}
          size="lg"
          bodyClassName="max-h-[70vh] overflow-y-auto"
        >
          {loadingMatches ? (
            <SkeletonRows rows={3} pill={false} />
          ) : availableMatches.length === 0 ? (
            <EmptyInset className="text-center">{t('refereeDashboard.noAvailableGames')}</EmptyInset>
          ) : (
            <RowList soft>
              {availableMatches.map((m) => (
                <GameRow
                  key={m.id}
                  match={m}
                  lang={i18n.language}
                  home={m.team1Name}
                  away={m.team2Name}
                  gameLabel={t('refereeDashboard.gameNumber', { number: m.gameNumber })}
                  noDate={m.dateTime || t('refereeDashboard.tbd')}
                  onOpen={() => handleSelectGame(m)}
                  selectedLabel={selectedRowId === gameRowId(m) ? t('refereeDashboard.selected', 'Selected') : undefined}
                  status={selectedRowId === gameRowId(m)
                    ? <Check size={16} className="text-stone-900" aria-hidden />
                    : <ChevronRight size={16} className="text-stone-400" aria-hidden />}
                />
              ))}
            </RowList>
          )}
        </KitModal>
      </div>
    </div>
  )
}
