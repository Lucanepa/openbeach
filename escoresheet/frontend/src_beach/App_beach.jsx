import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db_beach/db_beach'
import MatchSetup from './components_beach/MatchSetup_beach'
import Scoreboard from './components_beach/Scoreboard_beach'
import CoinToss from './components_beach/CoinToss_beach'
import MatchEnd from './components_beach/MatchEnd_beach'
import ManualAdjustments from './components_beach/ManualAdjustments_beach'
import Modal from './components_beach/Modal_beach'
import InteractiveGuide from './components_beach/InteractiveGuide_beach'
import ConnectionStatus from './components_beach/ConnectionStatus_beach'
import MainHeader from './components_beach/MainHeader_beach'
import BackupTable from './components_beach/BackupTable_beach'
import HomePage from './components_beach/pages/HomePage_beach'
import HomeOptionsModal from './components_beach/options/HomeOptionsModal_beach'
import ConnectionSetupModal from './components_beach/options/ConnectionSetupModal_beach'
import StartupConnectivityModal from './components_beach/StartupConnectivityModal_beach'
import { useSyncQueue, useSyncQueueStats } from './hooks_beach/useSyncQueue_beach'
import SyncSignInBanner from './components_beach/auth/SyncSignInBanner_beach'
import useAutoBackup from './hooks_beach/useAutoBackup_beach'
import { useDashboardServer } from './hooks_beach/useDashboardServer_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'

// Logo for HomePage
const openbeachLogo = '/openbeach_no_bg.png'
import {
  TEST_REFEREE_SEED_DATA,
  TEST_SCORER_SEED_DATA,
  TEST_TEAM_SEED_DATA,
  TEST_MATCH_SEED_KEY,
  TEST_MATCH_EXTERNAL_ID,
  TEST_TEAM_1_EXTERNAL_ID,
  TEST_TEAM_2_EXTERNAL_ID,
  TEST_MATCH_DEFAULTS,
  getNextTestMatchStartTime,
  getTestTeam1ShortName,
  getTestTeam2ShortName
} from './constants_beach/testSeeds_beach'
import { apiFrom } from './lib_beach/apiClient_beach'
import { setExtId } from './utils_beach/syncIds_beach'
import { isBackendAvailable, getBackendUrl, isServedFromLocalServer, getLocalServerStatusUrl, rememberRelayWsPort } from './utils_beach/backendConfig_beach'
import { isCapacitorApp } from './utils_beach/appLifecycle_beach'
import { scorerRelay, scorerPublisher, scorerRelayUrl, readRelayBundle, relayMatchKey } from './utils_beach/relayPublisher_beach'
import { checkMatchSession, lockMatchSession, unlockMatchSession, verifyGamePin } from './utils_beach/sessionManager_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'
import { fetchMatchByPin, importMatchFromSupabase, restoreMatchFromJson, selectBackupFile, listCloudBackups, fetchCloudBackup } from './utils_beach/backupManager_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import CompetitionMatchPicker from './components_beach/CompetitionMatchPicker_beach'
import { COMPETITIONS_ENABLED } from './utils_beach/features_beach'
import { Smartphone } from './components_beach/Icons_beach'

function parseDateTime(dateTime) {
  const [datePart, timePart] = dateTime.split(' ')
  const [day, month, year] = datePart.split('.').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes))
  return date.toISOString()
}

function generateRefereePin() {
  const chars = '0123456789'
  let pin = ''
  for (let i = 0; i < 6; i++) {
    pin += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pin
}

export default function App() {
  const [matchId, setMatchId] = useState(null)
  const [showMatchSetup, setShowMatchSetup] = useState(false)
  const [showCoinToss, setShowCoinToss] = useState(false)
  const [showMatchEnd, setShowMatchEnd] = useState(false)
  const [showManualAdjustments, setShowManualAdjustments] = useState(false)
  const [deleteMatchModal, setDeleteMatchModal] = useState(null)
  const [deletePinInput, setDeletePinInput] = useState('')
  const [deletePinError, setDeletePinError] = useState('')
  const [newMatchModal, setNewMatchModal] = useState(null)
  const [restoreMatchModal, setRestoreMatchModal] = useState(false)
  const [restoreMatchIdInput, setRestoreMatchIdInput] = useState('')
  const [restorePin, setRestorePin] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [cloudBackups, setCloudBackups] = useState([])
  const [cloudBackupPin, setCloudBackupPin] = useState('')
  const [cloudBackupGameN, setCloudBackupGameN] = useState('')
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false)
  const [cloudBackupError, setCloudBackupError] = useState('')
  const [restorePreviewData, setRestorePreviewData] = useState(null) // { data, source: 'database'|'cloud'|'local' }
  const [testMatchLoading, setTestMatchLoading] = useState(false)
  const [alertModal, setAlertModal] = useState(null) // { message: string }
  const [confirmModal, setConfirmModal] = useState(null) // { message: string, onConfirm: function, onCancel: function }
  const [newMatchMenuOpen, setNewMatchMenuOpen] = useState(false)
  const [homeOptionsModal, setHomeOptionsModal] = useState(false)
  const [interactiveGuideOpen, setInteractiveGuideOpen] = useState(false)
  const [connectionSetupModal, setConnectionSetupModal] = useState(false)
  const [showCompetitionPicker, setShowCompetitionPicker] = useState(false)
  const { syncStatus, retryErrors, isOnline } = useSyncQueue()
  // Live queue counts for the connection indicator (pending / error / failed)
  const syncQueueCounts = useSyncQueueStats()
  const backup = useAutoBackup(matchId)
  const canUseSupabase = isBackendAvailable()

  // Dashboard Server state
  const [dashboardServerEnabled, setDashboardServerEnabled] = useState(
    () => localStorage.getItem('dashboardServerEnabled') === 'true'
  )
  const dashboardServerData = useDashboardServer({
    enabled: dashboardServerEnabled,
    matchId: matchId
  })
  const [serverStatus, setServerStatus] = useState(null)
  const [showConnectionMenu, setShowConnectionMenu] = useState(false)
  const [connectionStatuses, setConnectionStatuses] = useState({
    api: 'unknown',
    server: 'unknown',
    websocket: 'unknown',
    scoreboard: 'unknown',
    match: 'unknown',
    db: 'unknown',
    supabase: 'unknown'
  })
  const [connectionDebugInfo, setConnectionDebugInfo] = useState({})
  const [scorerAttentionTrigger, setScorerAttentionTrigger] = useState(null)
  const [showDebugMenu, setShowDebugMenu] = useState(null) // Which connection type to show debug for
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [matchInfoMenuOpen, setMatchInfoMenuOpen] = useState(false)
  const [offlineMode, setOfflineMode] = useState(() => {
    const saved = localStorage.getItem('offlineMode')
    return saved === 'true'
  })
  const [showStartupConnectivity, setShowStartupConnectivity] = useState(() => {
    return localStorage.getItem('offlineMode') !== 'true'
  })
  // Display mode: 'desktop' | 'tablet' | 'smartphone' | 'auto'
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem('displayMode')
    return saved || 'auto' // default to auto-detect
  })
  const [detectedDisplayMode, setDetectedDisplayMode] = useState('desktop') // What mode was auto-detected
  const [checkAccidentalRallyStart, setCheckAccidentalRallyStart] = useState(() => {
    const saved = localStorage.getItem('checkAccidentalRallyStart')
    return saved === 'true' // default false
  })
  const [accidentalRallyStartDuration, setAccidentalRallyStartDuration] = useState(() => {
    const saved = localStorage.getItem('accidentalRallyStartDuration')
    return saved ? parseInt(saved, 10) : 3 // default 3 seconds
  })
  const [checkAccidentalPointAward, setCheckAccidentalPointAward] = useState(() => {
    const saved = localStorage.getItem('checkAccidentalPointAward')
    return saved === 'true' // default false
  })
  const [accidentalPointAwardDuration, setAccidentalPointAwardDuration] = useState(() => {
    const saved = localStorage.getItem('accidentalPointAwardDuration')
    return saved ? parseInt(saved, 10) : 3 // default 3 seconds
  })
  const [manageCaptainOnCourt, setManageCaptainOnCourt] = useState(() => {
    const saved = localStorage.getItem('manageCaptainOnCourt')
    return saved === 'true' // default false
  })
  const [keybindingsEnabled, setKeybindingsEnabled] = useState(() => {
    const saved = localStorage.getItem('keybindingsEnabled')
    return saved === 'true' // default false
  })
  const [manageDob, setManageDob] = useState(() => {
    const saved = localStorage.getItem('manageDob')
    return saved === 'true' // default false
  })

  // Wake lock refs and state
  const wakeLockRef = useRef(null)
  const noSleepVideoRef = useRef(null)
  const [wakeLockActive, setWakeLockActive] = useState(false)

  // Request wake lock to prevent screen from sleeping
  useEffect(() => {
    const enableNoSleep = async () => {
      try {
        if ('wakeLock' in navigator) {
          if (wakeLockRef.current) { try { await wakeLockRef.current.release() } catch (e) { } }
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => {
            if (!wakeLockRef.current) setWakeLockActive(false)
          })
        }
      } catch (err) { /* WakeLock failed, ignore */ }
      try {
        if (!noSleepVideoRef.current) {
          const video = document.createElement('video')
          video.setAttribute('playsinline', '')
          video.setAttribute('loop', '')
          video.setAttribute('muted', '')
          video.style.cssText = 'position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0.01;pointer-events:none;'
          video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhmcmVlAAAACG1kYXQAAAAfAgAABQAJJMAAkMAAKQAAH0AAOMAAH0AAOAAAAB9GABtB'
          document.body.appendChild(video)
          noSleepVideoRef.current = video
        }
        await noSleepVideoRef.current.play()
      } catch (err) { /* NoSleep video failed, ignore */ }
    }
    const handleInteraction = async () => { await enableNoSleep() }
    enableNoSleep()
    document.addEventListener('click', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })
    const handleVisibilityChange = async () => { if (document.visibilityState === 'visible') await enableNoSleep() }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
      if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => { }); wakeLockRef.current = null }
      if (noSleepVideoRef.current) { noSleepVideoRef.current.pause(); noSleepVideoRef.current.remove(); noSleepVideoRef.current = null }
    }
  }, [])

  const reEnableWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        if (wakeLockRef.current) { try { await wakeLockRef.current.release() } catch (e) { } }
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        setWakeLockActive(true)
        wakeLockRef.current.addEventListener('release', () => { })
        return true
      }
    } catch (err) { /* Failed to re-acquire, ignore */ }
    return false
  }, [])

  const toggleWakeLock = useCallback(async () => {
    if (wakeLockActive) {
      if (wakeLockRef.current) { try { await wakeLockRef.current.release(); wakeLockRef.current = null } catch (e) { } }
      setWakeLockActive(false)
    } else {
      const success = await reEnableWakeLock()
      if (!success) setWakeLockActive(true)
    }
  }, [wakeLockActive, reEnableWakeLock])

  // Preload assets that are used later (e.g., coin toss ball image, logo)
  useEffect(() => {
    const assetsToPreload = [
      ballImage,
      openbeachLogo
    ]

    assetsToPreload.forEach(src => {
      const img = new Image()
      img.src = src
    })
  }, [])

  // Fetch server status periodically
  useEffect(() => {
    // Only a page a local server serves has /api/server/status: the desktop
    // app's relay, a venue server, the Electron app, or a build that says so
    // (VITE_LOCAL_SERVER=true). Elsewhere (the static PWA, the native app, the
    // Vite dev server against the cloud backend) every poll was a 404.
    const localServerMode = isServedFromLocalServer() || !!window.electronAPI?.server || import.meta.env.VITE_LOCAL_SERVER === 'true'
    const statusUrl = getLocalServerStatusUrl()
    if (!localServerMode || !statusUrl) return

    const fetchServerStatus = async () => {
      try {
        const response = await fetch(statusUrl)
        if (response.ok) {
          const status = await response.json()
          // The relay's WebSocket port (a desktop relay takes it on a port of
          // its own): the referee pages served here find it again
          if (status?.wsPort) rememberRelayWsPort(window.location.origin, status.wsPort)
          setServerStatus(status)
        }
      } catch (err) {
        // Server might not be running, that's okay
        if (import.meta.env.DEV) {
        }
      }
    }

    fetchServerStatus()
    const interval = setInterval(fetchServerStatus, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [])

  // Screen size detection for display mode
  // < 768px = smartphone, 768-1024px = tablet, > 1024px = desktop
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      let detected = 'desktop'

      if (width < 768) {
        detected = 'smartphone'
      } else if (width <= 1024) {
        detected = 'tablet'
      }
      // > 1024px = desktop (default)

      setDetectedDisplayMode(detected)
      setViewportSize({ width, height })
    }

    // Check on mount
    checkScreenSize()

    // Check on resize
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Fullscreen for tablet/smartphone modes (orientation lock handled by Scoreboard/Scoresheet)
  const enterDisplayMode = useCallback((mode) => {
    // Request fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
      })
    }

    // Note: Orientation locking is now handled by Scoreboard and Scoresheet components
    // so other screens (MatchSetup, CoinToss, etc.) can work in portrait mode

    // Set the display mode
    setDisplayMode(mode)
    localStorage.setItem('displayMode', mode)
  }, [])

  // Exit fullscreen and reset to desktop mode
  const exitDisplayMode = useCallback(() => {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
      })
    }

    setDisplayMode('desktop')
    localStorage.setItem('displayMode', 'desktop')
  }, [])

  // Get the active display mode
  const activeDisplayMode = displayMode === 'auto' ? detectedDisplayMode : displayMode

  // Toggle no-scroll class on body when on home page
  useEffect(() => {
    if (!matchId && !showMatchSetup && !showMatchEnd) {
      document.body.classList.add('no-scroll')
    } else {
      document.body.classList.remove('no-scroll')
    }
    return () => {
      document.body.classList.remove('no-scroll')
    }
  }, [matchId, showMatchSetup, showMatchEnd])

  const activeMatch = useLiveQuery(async () => {
    try {
      return await db.matches
        .where('status')
        .equals('live')
        .first()
    } catch (error) {
      console.error('Unable to load active match', error)
      return null
    }
  }, [])

  // Get current match (most recent match that's not final)
  const currentMatch = useLiveQuery(async () => {
    try {
      // First try to get a live match
      const liveMatch = await db.matches.where('status').equals('live').first()
      if (liveMatch) return liveMatch

      // Otherwise get the most recent match that's not final
      const matches = await db.matches.orderBy('createdAt').reverse().toArray()
      const nonFinalMatch = matches.find(m => m.status !== 'final')
      return nonFinalMatch || null
    } catch (error) {
      console.error('Unable to load current match', error)
      return null
    }
  }, [])

  const currentOfficialMatch = useLiveQuery(async () => {
    try {
      const matches = await db.matches.orderBy('createdAt').reverse().toArray()
      // Only consider matches that have been confirmed (matchInfoConfirmedAt set)
      // This prevents showing Continue/Delete for matches where user hasn't clicked "Create Match"
      return matches.find(m => m.test !== true && m.status !== 'final' && m.matchInfoConfirmedAt) || null
    } catch (error) {
      console.error('Unable to load official match', error)
      return null
    }
  }, [])

  // Fullscreen functionality
  const toggleFullscreen = useCallback(async () => {
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
      // Fallback: try alternative fullscreen methods
      const doc = document.documentElement
      if (doc.webkitRequestFullscreen) {
        doc.webkitRequestFullscreen()
        setIsFullscreen(true)
      } else if (doc.msRequestFullscreen) {
        doc.msRequestFullscreen()
        setIsFullscreen(true)
      } else if (doc.mozRequestFullScreen) {
        doc.mozRequestFullScreen()
        setIsFullscreen(true)
      }
    }
  }, [])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Check connection statuses
  const checkConnectionStatuses = useCallback(async () => {
    const statuses = {
      api: 'unknown',
      server: 'unknown',
      websocket: 'unknown',
      scoreboard: 'unknown',
      match: 'unknown',
      db: 'unknown',
      supabase: 'unknown'
    }
    const debugInfo = {}

    // Check if we're on a static deployment (GitHub Pages, Cloudflare Pages, etc.)
    const isStaticDeployment = !import.meta.env.DEV && (
      window.location.hostname.includes('github.io') ||
      window.location.hostname.endsWith('.openvolley.app') // All openvolley.app subdomains are static
    )

    // Check if we have a configured backend URL (cloud backend)
    const hasBackendUrl = isBackendAvailable()

    // Check API/Server connection
    if (isStaticDeployment && !hasBackendUrl) {
      // No backend configured - pure standalone mode
      statuses.api = 'not_available'
      statuses.server = 'not_available'
      debugInfo.api = { status: 'not_available', message: 'API not available in static deployment (using local database only)' }
      debugInfo.server = { status: 'not_available', message: 'Server not available in static deployment (using local database only)' }
    } else if (hasBackendUrl) {
      // Backend URL configured - check cloud backend health
      try {
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/health`)
        if (response.ok) {
          const data = await response.json()
          statuses.api = 'connected'
          statuses.server = 'connected'
          debugInfo.api = { status: 'connected', message: `Cloud backend responding (${data.mode} mode)` }
          debugInfo.server = { status: 'connected', message: `Backend healthy, ${data.connections} connections, ${data.activeRooms} active rooms` }
        } else {
          statuses.api = 'disconnected'
          statuses.server = 'disconnected'
          debugInfo.api = { status: 'disconnected', message: `Backend returned status ${response.status}` }
          debugInfo.server = { status: 'disconnected', message: `Backend returned status ${response.status}` }
        }
      } catch (err) {
        statuses.api = 'disconnected'
        statuses.server = 'disconnected'
        debugInfo.api = { status: 'disconnected', message: `Backend unreachable: ${err.message}` }
        debugInfo.server = { status: 'disconnected', message: `Backend unreachable: ${err.message}` }
      }
    } else {
      try {
        const response = await fetch('/api/match/list')
        if (response.ok) {
          statuses.api = 'connected'
          statuses.server = 'connected'
          debugInfo.api = { status: 'connected', message: 'API endpoint responding' }
          debugInfo.server = { status: 'connected', message: 'Server is reachable' }
        } else {
          statuses.api = 'disconnected'
          statuses.server = 'disconnected'
          debugInfo.api = { status: 'disconnected', message: `API returned status ${response.status}: ${response.statusText}` }
          debugInfo.server = { status: 'disconnected', message: `Server returned status ${response.status}: ${response.statusText}` }
        }
      } catch (err) {
        statuses.api = 'disconnected'
        statuses.server = 'disconnected'
        const errMsg = import.meta.env.DEV
          ? `Network error: ${err.message || 'Failed to connect to API'}`
          : 'Server not available (running in standalone mode)'
        debugInfo.api = { status: 'disconnected', message: errMsg }
        debugInfo.server = { status: 'disconnected', message: errMsg }
      }
    }

    // The relay WebSocket: the scorer's own relay socket (shared with the
    // Scoreboard, see relayPublisher_beach), never a throwaway probe socket
    const relayUrl = scorerRelayUrl({ wsPort: serverStatus?.wsPort })
    const relaySocket = scorerRelay.socket
    if (!relayUrl) {
      statuses.websocket = 'not_available'
      debugInfo.websocket = { status: 'not_available', message: 'No WebSocket relay for this page (using local database only)' }
    } else if (relaySocket && relaySocket.readyState === 1) {
      statuses.websocket = 'connected'
      debugInfo.websocket = { status: 'connected', message: 'WebSocket relay is reachable (active connection)', details: `Relay: ${relayUrl}` }
    } else if (relaySocket && relaySocket.readyState === 0) {
      statuses.websocket = 'connecting'
      debugInfo.websocket = { status: 'connecting', message: 'Connecting to the WebSocket relay...', details: `Relay: ${relayUrl}` }
    } else if (!scorerRelay.url) {
      // No match is published yet: nothing to connect
      statuses.websocket = 'not_configured'
      debugInfo.websocket = { status: 'not_configured', message: 'No match on the relay yet', details: `Relay: ${relayUrl}` }
    } else {
      statuses.websocket = 'disconnected'
      debugInfo.websocket = { status: 'disconnected', message: 'Not connected to the WebSocket relay (retrying in the background)', details: `Relay: ${relayUrl}` }
    }

    // Check Scoreboard connection (same as server for now)
    statuses.scoreboard = statuses.server
    debugInfo.scoreboard = debugInfo.server

    // Check Match status (both official and test matches)
    if (currentMatch) {
      statuses.match = currentMatch.status === 'live' ? 'live' : currentMatch.status === 'scheduled' ? 'scheduled' : currentMatch.status === 'final' ? 'final' : 'unknown'
      debugInfo.match = { status: statuses.match, message: `Match status: ${statuses.match} (${currentMatch.test ? 'Test' : 'Official'} match)` }
    } else {
      statuses.match = 'no_match'
      debugInfo.match = { status: 'no_match', message: 'No match found. Create a new match to start.' }
    }

    // Check DB (IndexedDB)
    try {
      await db.matches.count()
      statuses.db = 'connected'
      debugInfo.db = { status: 'connected', message: 'IndexedDB is accessible' }
    } catch (err) {
      statuses.db = 'disconnected'
      debugInfo.db = { status: 'disconnected', message: `IndexedDB error: ${err.message || 'Database not accessible'}` }
    }

    // Check Supabase status (based on syncStatus and canUseSupabase)
    // First check if Supabase is configured at all
    if (!canUseSupabase) {
      statuses.supabase = 'not_configured'
      debugInfo.supabase = {
        status: 'not_configured',
        message: 'Cloud backend is not configured',
        details: 'No backend URL: set VITE_BACKEND_URL (e.g. https://backend.openvolley.app) or choose a server.'
      }
    } else if (syncStatus === 'auth_required') {
      // The backend is reachable; writes wait for a sign-in (banner says so)
      statuses.supabase = 'connected'
      debugInfo.supabase = { status: 'connected', message: 'Cloud backend is reachable. Sign in to sync this device\'s matches.' }
    } else if (syncStatus === 'synced' || syncStatus === 'syncing') {
      statuses.supabase = 'connected'
      debugInfo.supabase = { status: 'connected', message: 'Supabase is connected and syncing' }
    } else if (syncStatus === 'online_no_supabase') {
      // The server answered without /api/db: a LAN relay (desktop app, venue
      // server) that only relays matches
      statuses.supabase = 'not_configured'
      debugInfo.supabase = {
        status: 'not_configured',
        message: 'Offline: no cloud backend here',
        details: 'This server is an offline LAN relay or the build has no backend URL. Matches are kept on this device.'
      }
    } else if (syncStatus === 'connecting') {
      statuses.supabase = 'connecting'
      debugInfo.supabase = { status: 'connecting', message: 'Connecting to Supabase...' }
    } else if (syncStatus === 'error') {
      statuses.supabase = 'error'
      debugInfo.supabase = {
        status: 'error',
        message: 'Supabase connection error',
        details: 'Check your Supabase credentials and network connection'
      }
    } else if (syncStatus === 'offline') {
      statuses.supabase = 'offline'
      debugInfo.supabase = { status: 'offline', message: 'Device is offline or Supabase is unreachable' }
    } else {
      statuses.supabase = 'unknown'
      debugInfo.supabase = { status: 'unknown', message: 'Supabase status unknown' }
    }

    setConnectionStatuses(statuses)
    setConnectionDebugInfo(debugInfo)
  }, [currentMatch, syncStatus, serverStatus])

  // Periodically check connection statuses
  // The check depends on the match (a new object on every point): the
  // interval reads the latest check through a ref and is set up once. With
  // the check itself as dependency it ran on every point (a /api/match/list
  // call and a test WebSocket each time, 429s from the backend).
  const checkConnectionStatusesRef = useRef(checkConnectionStatuses)
  checkConnectionStatusesRef.current = checkConnectionStatuses
  useEffect(() => {
    const run = () => checkConnectionStatusesRef.current()
    run()
    const interval = setInterval(run, 30000)
    return () => clearInterval(interval)
  }, [])

  // Show startup connectivity popup when toggling from offline to online
  const prevOfflineModeRef = useRef(offlineMode)
  useEffect(() => {
    if (prevOfflineModeRef.current === true && offlineMode === false) {
      setShowStartupConnectivity(true)
      checkConnectionStatuses()
    }
    prevOfflineModeRef.current = offlineMode
  }, [offlineMode, checkConnectionStatuses])

  const handleStartupGoOffline = useCallback(() => {
    setOfflineMode(true)
    localStorage.setItem('offlineMode', 'true')
    setShowStartupConnectivity(false)
  }, [])

  const handleStartupDismiss = useCallback(() => {
    setShowStartupConnectivity(false)
  }, [])

  const currentTestMatch = useLiveQuery(async () => {
    try {
      const matches = await db.matches.orderBy('createdAt').reverse().toArray()
      const testMatch = matches.find(m => m.test === true && m.status !== 'final')
      // Return test match if it exists, regardless of setup status
      return testMatch || null
    } catch (error) {
      console.error('Unable to load test match', error)
      return null
    }
  }, [])

  // Get match status and details
  const matchStatus = useLiveQuery(async () => {
    if (!currentMatch) return null

    // For test matches that have been restarted (no signatures, only initial set, no events), don't show status
    if (currentMatch.test === true) {
      const hasSignatures = currentMatch.team1CaptainSignature ||
        currentMatch.team2CaptainSignature

      if (!hasSignatures) {
        const sets = await db.sets.where('matchId').equals(currentMatch.id).toArray()
        const events = await db.events.where('matchId').equals(currentMatch.id).toArray()
        // If only initial set exists and no events, it's been restarted - don't show status
        if (sets.length === 1 && events.length === 0) {
          return null
        }
      }
    }

    const team1Promise = currentMatch.team1Id ? db.teams.get(currentMatch.team1Id) : Promise.resolve(null)
    const team2Promise = currentMatch.team2Id ? db.teams.get(currentMatch.team2Id) : Promise.resolve(null)

    const setsPromise = db.sets.where('matchId').equals(currentMatch.id).toArray()
    const eventsPromise = db.events.where('matchId').equals(currentMatch.id).toArray()
    const team1PlayersPromise = currentMatch.team1Id
      ? db.players.where('teamId').equals(currentMatch.team1Id).count()
      : Promise.resolve(0)
    const team2PlayersPromise = currentMatch.team2Id
      ? db.players.where('teamId').equals(currentMatch.team2Id).count()
      : Promise.resolve(0)

    const [team1, team2, sets, events, team1Players, team2Players] = await Promise.all([
      team1Promise,
      team2Promise,
      setsPromise,
      eventsPromise,
      team1PlayersPromise,
      team2PlayersPromise
    ])

    const signaturesComplete = Boolean(
      currentMatch.team1CaptainSignature &&
      currentMatch.team2CaptainSignature
    )

    const infoConfigured = Boolean(
      (currentMatch.scheduledAt && String(currentMatch.scheduledAt).trim() !== '') ||
      (currentMatch.city && String(currentMatch.city).trim() !== '') ||
      (currentMatch.hall && String(currentMatch.hall).trim() !== '') ||
      (currentMatch.league && String(currentMatch.league).trim() !== '')
    )

    const rostersReady = team1Players === 2 && team2Players === 2
    const matchReadyForPlay = infoConfigured && signaturesComplete && rostersReady

    const hasActiveSet = sets.some(set => {
      return Boolean(
        set.finished ||
        set.startTime ||
        set.team1Points > 0 ||
        set.team2Points > 0
      )
    })

    const hasEventActivity = events.some(event =>
      ['set_start', 'rally_start', 'point'].includes(event.type)
    )

    let status = 'No data'
    if (currentMatch.status === 'final' || (sets.length > 0 && sets.every(s => s.finished))) {
      status = 'Match ended'
    } else if ((currentMatch.status === 'live' || hasActiveSet || hasEventActivity) && matchReadyForPlay) {
      status = 'Match recording'
    } else if (team1Players > 0 || team2Players > 0) {
      if (signaturesComplete) {
        status = 'Coin toss'
      } else {
        status = 'Setup'
      }
    }

    return {
      match: currentMatch,
      team1,
      team2,
      status
    }
  }, [currentMatch])

  // Query for match info menu (teams for active match or home view)
  const matchInfoData = useLiveQuery(async () => {
    // For active match
    if (matchId && currentMatch) {
      const team1Promise = currentMatch.team1Id ? db.teams.get(currentMatch.team1Id) : Promise.resolve(null)
      const team2Promise = currentMatch.team2Id ? db.teams.get(currentMatch.team2Id) : Promise.resolve(null)
      const [team1, team2] = await Promise.all([team1Promise, team2Promise])
      return {
        team1,
        team2,
        match: currentMatch
      }
    }

    // For home view (use currentOfficialMatch or currentTestMatch)
    if (!matchId) {
      const matchToUse = currentOfficialMatch || currentTestMatch
      if (matchToUse) {
        const team1Promise = matchToUse.team1Id ? db.teams.get(matchToUse.team1Id) : Promise.resolve(null)
        const team2Promise = matchToUse.team2Id ? db.teams.get(matchToUse.team2Id) : Promise.resolve(null)
        const [team1, team2] = await Promise.all([team1Promise, team2Promise])
        return {
          team1,
          team2,
          match: matchToUse
        }
      }
    }

    return null
  }, [matchId, currentMatch, currentOfficialMatch, currentTestMatch])

  const restoredRef = useRef(false)

  // Preload ball and logo images when app loads
  useEffect(() => {
    const imagesToPreload = [ballImage, openbeachLogo]

    imagesToPreload.forEach(src => {
      // Preload the image
      const img = new Image()
      img.src = src

      // Also add a preload link to the document head for early loading
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = src
      document.head.appendChild(link)
    })

    return () => {
      // Cleanup: remove preload links if component unmounts
      imagesToPreload.forEach(src => {
        const existingLink = document.querySelector(`link[href="${src}"]`)
        if (existingLink) {
          document.head.removeChild(existingLink)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const disableRefreshKeys = event => {
      const key = event.key?.toLowerCase?.()
      const isRefresh =
        key === 'f5' ||
        ((event.ctrlKey || event.metaKey) && key === 'r') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'r') || // Ctrl+Shift+R
        (event.shiftKey && key === 'f5')

      if (isRefresh) {
        event.preventDefault()
        event.stopPropagation()
        return false
      }
    }

    const disableBackspaceNavigation = event => {
      // Prevent backspace from navigating back (but allow it in input fields)
      if (event.key === 'Backspace' || event.keyCode === 8) {
        const target = event.target || event.srcElement
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (!isInput) {
          event.preventDefault()
          return false
        }
      }
    }

    const blockHistoryNavigation = event => {
      // Push a new state to prevent back/forward navigation
      history.pushState(null, '', window.location.href)
    }

    // Android app: the Back button is MainActivity's (it goes back in real
    // history, e.g. from the referee view, and on the first page asks "Exit
    // OpenBeach?", utils_beach/appLifecycle_beach.js). An entry pushed here
    // would make WebView.canGoBack() true, and Back then only replayed this
    // block instead of asking (as in OpenVolley's App.jsx).
    const blockHistory = !isCapacitorApp()

    if (blockHistory) {
      // Push initial state to prevent back navigation
      try {
        history.pushState(null, '', window.location.href)
      } catch (err) {
        // Ignore history errors (e.g., older browsers or restricted environments)
      }

      // Prevent browser back/forward buttons
      window.addEventListener('popstate', blockHistoryNavigation)
    }

    // Prevent refresh keyboard shortcuts
    window.addEventListener('keydown', disableRefreshKeys, { passive: false })

    // Prevent backspace navigation (except in input fields)
    window.addEventListener('keydown', disableBackspaceNavigation, { passive: false })

    // Also prevent context menu refresh option (right-click refresh)
    window.addEventListener('contextmenu', event => {
      // Allow context menu but we can't prevent refresh from it directly
      // The keydown handler will catch Ctrl+R if user tries that
    })

    return () => {
      window.removeEventListener('keydown', disableRefreshKeys)
      window.removeEventListener('keydown', disableBackspaceNavigation)
      window.removeEventListener('popstate', blockHistoryNavigation)
    }
  }, [])


  useEffect(() => {
    if (activeMatch) {
      if (!restoredRef.current && !matchId) {
        setMatchId(activeMatch.id)
        restoredRef.current = true
      }
    } else {
      restoredRef.current = false
    }
  }, [activeMatch, matchId])

  // Check for pending roster upload on mount
  useEffect(() => {
    if (!currentMatch) return

    // Check if there are pending rosters
    const hasPendingTeam1Roster = currentMatch.pendingTeam1Roster !== null && currentMatch.pendingTeam1Roster !== undefined
    const hasPendingTeam2Roster = currentMatch.pendingTeam2Roster !== null && currentMatch.pendingTeam2Roster !== undefined

    // If there are pending rosters and we're not already in match setup, open it
    if ((hasPendingTeam1Roster || hasPendingTeam2Roster) && !showMatchSetup) {
      setMatchId(currentMatch.id)
      setShowMatchSetup(true)
    }
  }, [currentMatch, matchId, showMatchSetup])

  // Update document title based on match type
  useEffect(() => {
    if (!currentMatch) {
      document.title = 'openBeach eScoresheet'
      return
    }

    const isTestMatch = currentMatch.test === true

    if (isTestMatch) {
      // Test matches don't have a game number - just show base title
      document.title = 'openBeach eScoresheet'
    } else {
      // Official match - show game number only
      const gameNumber = currentMatch.externalId || 'Official Match'
      document.title = `openBeach eScoresheet - ${gameNumber}`
    }
  }, [currentMatch])

  // The current match on the relay, from every view (home page, setup), so
  // the referee, the livescore and the LedBox keep it: App's share of the
  // scorer's one relay connection (relayPublisher_beach, shared with
  // Scoreboard_beach). It syncs on every (re)connect and every 30 s; when the
  // scorer switches matches, the previous one leaves the relay. The relay
  // holds every court's match, so nothing here clears it.
  const publishedRelayKeyRef = useRef(null)
  const activeRelayMatchId = matchId || currentMatch?.id || null
  useEffect(() => {
    if (!activeRelayMatchId) return undefined
    let active = true

    const syncMatchData = async () => {
      if (!scorerRelay.isOpen()) return
      try {
        const bundle = await readRelayBundle(db, activeRelayMatchId)
        if (!active || !bundle?.key) return
        const previous = publishedRelayKeyRef.current
        if (previous && previous !== bundle.key) scorerPublisher.remove(previous)
        publishedRelayKeyRef.current = bundle.key
        scorerPublisher.sync(bundle.key, bundle.local)
      } catch (err) {
        console.warn('[App relay] sync failed:', err?.message)
      }
    }

    const detach = scorerRelay.attach(scorerRelayUrl({ wsPort: serverStatus?.wsPort }), {
      onOpen: () => { syncMatchData() },
      onMessage: async (message) => {
        // A desktop relay asks the scoreboard for a match it does not hold
        if (message.type !== 'match-data-request' && message.type !== 'game-number-request') return
        try {
          const bundle = await readRelayBundle(db, activeRelayMatchId)
          if (active && bundle) scorerPublisher.answer(message, bundle.key, bundle.local)
        } catch { /* the relay times the request out */ }
      }
    })
    // Backup only: the Scoreboard syncs on every action
    const interval = setInterval(syncMatchData, 30000)

    return () => {
      active = false
      clearInterval(interval)
      detach()
    }
  }, [activeRelayMatchId, serverStatus?.wsPort])

  async function finishSet(cur) {
    const matchRecord = await db.matches.get(cur.matchId)
    const isTestMatch = matchRecord?.test === true

    // Calculate current set scores
    const sets = await db.sets.where({ matchId: cur.matchId }).toArray()
    const finishedSets = sets.filter(s => s.finished)
    const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

    // Check if either team has won 2 sets (match win)
    const isMatchEnd = team1SetsWon >= 2 || team2SetsWon >= 2

    if (isMatchEnd) {
      // IMPORTANT: When match ends, preserve ALL data in database:
      // - All sets remain in db.sets
      // - All events remain in db.events
      // - All players remain in db.players
      // - All teams remain in db.teams
      // - Set status to 'ended' - MatchEnd component will set to 'approved' after approval
      // Status flow: live -> ended -> approved

      // Unlock session when match ends
      try {
        await unlockMatchSession(cur.matchId)
      } catch (error) {
        console.error('Error unlocking session:', error)
      }

      // Update local match status to 'ended' (may already be set by Scoreboard)
      await db.matches.update(cur.matchId, { status: 'ended' })

      // Only sync official matches with seed_key
      if (!isTestMatch && matchRecord?.seed_key) {
        // Build set results array
        const setResults = finishedSets
          .sort((a, b) => a.index - b.index)
          .map(s => ({ set: s.index, team1: s.team1Points, team2: s.team2Points }))

        // Determine winner
        const winner = team1SetsWon > team2SetsWon ? 'team1' : 'team2'
        const finalScore = `${team1SetsWon}-${team2SetsWon}`

        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: matchRecord.seed_key, // Use seed_key (external_id) for Supabase lookup
            status: 'ended', // Match ended, awaiting approval
            set_results: setResults,
            winner,
            final_score: finalScore,
            sanctions: matchRecord?.sanctions || null
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      // The final result stays on the relay: the referee, the livescore and
      // the LedBox keep showing it (the Scoreboard syncs the final state)

      // Show match end screen
      setShowMatchEnd(true)
      return
    }

    // Continue to next set (legacy logic - shouldn't reach here with new logic)
    const setId = await db.sets.add({ matchId: cur.matchId, index: cur.index + 1, team1Points: 0, team2Points: 0, finished: false })

    // Only sync official matches with seed_key
    if (!isTestMatch && matchRecord?.seed_key) {
      await db.sync_queue.add({
        resource: 'set',
        action: 'insert',
        payload: {
          external_id: setExtId(matchRecord.seed_key, setId),
          match_id: matchRecord.seed_key, // Use seed_key (external_id) for Supabase lookup
          index: cur.index + 1,
          team1_points: 0,
          team2_points: 0,
          finished: false,
          start_time: new Date().toISOString()
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })
    }
  }

  const openMatchSetup = () => {
    setMatchId(null)
    setShowManualAdjustments(false)
  }

  const openMatchSetupView = () => setShowMatchSetup(true)

  const openCoinTossView = () => {
    setShowMatchSetup(false)
    setShowCoinToss(true)
  }

  const returnToMatch = () => setShowMatchSetup(false)

  const goHome = async () => {
    // Unlock session if match was open
    if (matchId) {
      try {
        await unlockMatchSession(matchId)
      } catch (error) {
        console.error('Error unlocking session:', error)
      }
    }
    setMatchId(null)
    setShowMatchSetup(false)
    setShowManualAdjustments(false)
  }

  async function clearLocalTestData() {
    await db.transaction('rw', db.events, db.sets, db.matches, db.players, db.teams, async () => {
      const testMatches = await db.matches
        .filter(m => m.test === true || m.externalId === TEST_MATCH_EXTERNAL_ID)
        .toArray()
      for (const match of testMatches) {
        await db.events.where('matchId').equals(match.id).delete()
        await db.sets.where('matchId').equals(match.id).delete()
        await db.matches.delete(match.id)
      }

      const testTeams = await db.teams
        .filter(
          t =>
            t.externalId === TEST_TEAM_1_EXTERNAL_ID ||
            t.externalId === TEST_TEAM_2_EXTERNAL_ID ||
            (t.seedKey && t.seedKey.startsWith('test-'))
        )
        .toArray()

      for (const team of testTeams) {
        await db.players.where('teamId').equals(team.id).delete()
        await db.teams.delete(team.id)
      }
    })

  }


  const firstNames = ['Max', 'Luca', 'Tom', 'Jonas', 'Felix', 'Noah', 'David', 'Simon', 'Daniel', 'Michael', 'Anna', 'Sarah', 'Lisa', 'Emma', 'Sophie', 'Laura', 'Julia', 'Maria', 'Nina', 'Sara']
  const lastNames = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun']

  function randomDate(start, end) {
    const startDate = new Date(start).getTime()
    const endDate = new Date(end).getTime()
    const randomTime = startDate + Math.random() * (endDate - startDate)
    const date = new Date(randomTime)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  function formatISODateToDisplay(dateString) {
    if (!dateString) return null
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) {
      return dateString
    }
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  function generateRandomPlayers(teamId) {
    // Beach volleyball: 2 players per team
    const numbers = [1, 2]

    return numbers.map((number, idx) => {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      const dob = randomDate('1990-01-01', '2005-12-31')

      return {
        teamId,
        number,
        name: `${lastName} ${firstName}`,
        lastName,
        firstName,
        dob,
        isCaptain: idx === 0, // First player is captain
        role: null,
        createdAt: new Date().toISOString()
      }
    })
  }

  async function showDeleteMatchModal() {
    const matchToDelete = currentOfficialMatch || currentMatch
    if (!matchToDelete) return

    const [team1, team2] = await Promise.all([
      matchToDelete.team1Id ? db.teams.get(matchToDelete.team1Id) : null,
      matchToDelete.team2Id ? db.teams.get(matchToDelete.team2Id) : null
    ])
    const matchName = `${team1?.name || 'Team 1'} vs ${team2?.name || 'Team 2'}`

    setDeletePinInput('')
    setDeletePinError('')
    setDeleteMatchModal({
      matchName,
      matchId: matchToDelete.id,
      gamePin: matchToDelete.gamePin || null
    })
  }

  async function confirmDeleteMatch() {
    if (!deleteMatchModal) return

    // Require PIN confirmation if match has a gamePin
    if (deleteMatchModal.gamePin) {
      if (!deletePinInput.trim()) {
        setDeletePinError('Please enter the Game PIN to confirm deletion')
        return
      }
      if (deletePinInput.trim() !== deleteMatchModal.gamePin) {
        setDeletePinError('Incorrect PIN. Please enter the correct Game PIN.')
        return
      }
    }

    const matchIdToDelete = deleteMatchModal.matchId

    // Get match before deleting to check status and seed_key
    const matchToDelete = await db.matches.get(matchIdToDelete)
    const shouldDeleteFromSupabase = matchToDelete && matchToDelete.status !== 'final' && matchToDelete.seed_key
    console.debug('[App] Deleting match:', {
      matchId: matchIdToDelete,
      status: matchToDelete?.status,
      seed_key: matchToDelete?.seed_key,
      shouldDeleteFromSupabase
    })

    await db.transaction('rw', db.matches, db.sets, db.events, db.players, db.teams, db.sync_queue, db.match_setup, async () => {

      // Delete sets
      const sets = await db.sets.where('matchId').equals(matchIdToDelete).toArray()
      if (sets.length > 0) {
        await db.sets.bulkDelete(sets.map(s => s.id))
      }

      // Delete events - use direct delete instead of bulkDelete for better reliability
      const eventsCount = await db.events.where('matchId').equals(matchIdToDelete).count()
      await db.events.where('matchId').equals(matchIdToDelete).delete()

      // Get match to find team IDs
      const match = await db.matches.get(matchIdToDelete)

      // Delete players
      if (match?.team1Id) {
        const team1PlayersCount = await db.players.where('teamId').equals(match.team1Id).count()
        await db.players.where('teamId').equals(match.team1Id).delete()
      }
      if (match?.team2Id) {
        const team2PlayersCount = await db.players.where('teamId').equals(match.team2Id).count()
        await db.players.where('teamId').equals(match.team2Id).delete()
      }

      // Delete teams
      if (match?.team1Id) {
        await db.teams.delete(match.team1Id)
      }
      if (match?.team2Id) {
        await db.teams.delete(match.team2Id)
      }

      // Delete all sync queue items (since we can't filter by matchId easily)
      const syncQueueCount = await db.sync_queue.count()
      await db.sync_queue.clear()

      // Delete match setup draft
      await db.match_setup.clear()

      // Delete match
      await db.matches.delete(matchIdToDelete)
    })

    // Take the deleted match off the relay (its own room only)
    const deletedRelayKey = relayMatchKey(matchToDelete)
    if (deletedRelayKey) {
      scorerPublisher.remove(deletedRelayKey)
      if (publishedRelayKeyRef.current === deletedRelayKey) publishedRelayKeyRef.current = null
    }

    // Delete from Supabase if match hasn't ended (not 'final')
    // This prevents clutter from test matches while preserving completed match history
    if (shouldDeleteFromSupabase) {
      try {
        await db.sync_queue.add({
          resource: 'match',
          action: 'delete',
          payload: {
            id: matchToDelete.seed_key
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      } catch (err) {
        console.error('[App] Error queuing Supabase match deletion:', err)
      }
    } else {
    }

    setDeleteMatchModal(null)
    setMatchId(null)
    setShowMatchSetup(false)
    setShowManualAdjustments(false)
  }

  function cancelDeleteMatch() {
    setDeleteMatchModal(null)
    setDeletePinInput('')
    setDeletePinError('')
  }

  async function createNewOfficialMatch() {
    // Check if match is ongoing
    if (matchStatus?.status === 'Match recording') {
      return // Don't allow creating new match when one is ongoing
    }

    // Check if there's a CONFIRMED match (has matchInfoConfirmedAt)
    // Unconfirmed matches (user started but didn't click "Create Match") should be silently deleted
    if (currentMatch) {
      if (currentMatch.matchInfoConfirmedAt) {
        // This is a real confirmed match - warn the user
        setNewMatchModal({
          type: 'official',
          message: 'There is an existing match. Do you want to delete it and create a new official match?'
        })
        return
      } else {
        // This is an unconfirmed match - delete it silently
        await db.matches.delete(currentMatch.id)
      }
    }

    // Clear any stray draft data from previous sessions
    await db.match_setup.clear()

    // Create new blank match
    const newMatchId = await db.matches.add({
      status: 'scheduled',
      refereePin: generateRefereePin(),
      coinTossConfirmed: false,
      createdAt: new Date().toISOString()
    })

    setMatchId(newMatchId)
    setShowMatchSetup(true)
    setShowCoinToss(false) // Ensure we go to match setup, not coin toss
  }

  async function loadCompetitionMatch(compMatch) {
    // Check if match is ongoing
    if (matchStatus?.status === 'Match recording') return

    // If there's a confirmed match, warn first
    if (currentMatch && currentMatch.matchInfoConfirmedAt) {
      setNewMatchModal({
        type: 'competition',
        message: 'There is an existing match. Do you want to delete it and load the competition match?',
        competitionMatch: compMatch
      })
      setShowCompetitionPicker(false)
      return
    }

    // If unconfirmed match exists, delete silently
    if (currentMatch) {
      await db.matches.delete(currentMatch.id)
    }

    await createMatchFromCompetition(compMatch)
  }

  async function createMatchFromCompetition(compMatch) {
    // Clear draft
    await db.match_setup.clear()

    // Create teams in Dexie
    const team1Id = await db.teams.add({
      name: compMatch.team1_data?.name || '',
      color: compMatch.team1_data?.color || '#ef4444',
      createdAt: new Date().toISOString()
    })
    const team2Id = await db.teams.add({
      name: compMatch.team2_data?.name || '',
      color: compMatch.team2_data?.color || '#3b82f6',
      createdAt: new Date().toISOString()
    })

    // Create players
    const now = new Date().toISOString()
    for (const p of (compMatch.players_team1 || [])) {
      await db.players.add({
        teamId: team1Id,
        number: p.number || '',
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        dob: p.dob || '',
        isCaptain: p.is_captain || false,
        createdAt: now
      })
    }
    for (const p of (compMatch.players_team2 || [])) {
      await db.players.add({
        teamId: team2Id,
        number: p.number || '',
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        dob: p.dob || '',
        isCaptain: p.is_captain || false,
        createdAt: now
      })
    }

    // Build officials array
    const officials = (compMatch.officials || []).map(o => ({
      role: o.role || '',
      firstName: o.firstName || o.first_name || '',
      lastName: o.lastName || o.last_name || '',
      country: o.country || '',
      dob: o.dob || ''
    }))

    // Parse scheduled_at
    const scheduledAt = compMatch.scheduled_at || null

    // Create new match with all competition data pre-filled
    const newMatchId = await db.matches.add({
      team1Id,
      team2Id,
      status: 'scheduled',
      scheduledAt,
      site: compMatch.match_info?.site || '',
      beach: compMatch.match_info?.beach || '',
      court: compMatch.match_info?.court || '',
      gender: compMatch.match_info?.gender || '',
      phase: compMatch.match_info?.phase || '',
      round: compMatch.match_info?.round || '',
      hasCoach: compMatch.match_info?.has_coach || false,
      team1Name: compMatch.team1_data?.name || '',
      team2Name: compMatch.team2_data?.name || '',
      team1ShortName: compMatch.team1_data?.short_name || '',
      team2ShortName: compMatch.team2_data?.short_name || '',
      team1Color: compMatch.team1_data?.color || '#ef4444',
      team2Color: compMatch.team2_data?.color || '#3b82f6',
      team1Country: compMatch.team1_data?.country || '',
      team2Country: compMatch.team2_data?.country || '',
      game_n: compMatch.game_n || null,
      league: compMatch.competition_name || '',
      officials,
      refereePin: generateRefereePin(),
      coinTossConfirmed: false,
      competitionMatchId: compMatch.id || null, // Link back to competition match template
      createdAt: now
    })

    // Mark competition match as claimed (atomic check)
    // claimed_match_external_id will be set later when seed_key is generated in MatchSetup
    if (COMPETITIONS_ENABLED && isBackendAvailable() && compMatch.id) {
      try {
        await apiFrom('beach_competition_matches')
          .update({ status: 'claimed' })
          .eq('id', compMatch.id)
          .eq('status', 'template')
      } catch (err) {
        console.warn('[App] Failed to mark competition match as claimed:', err)
      }
    }

    setMatchId(newMatchId)
    setShowMatchSetup(true)
    setShowCoinToss(false)
    setShowCompetitionPicker(false)
  }

  async function confirmNewMatch() {
    if (!newMatchModal) return

    // Delete current match first
    if (currentMatch) {
      await db.transaction('rw', db.matches, db.sets, db.events, db.players, db.teams, db.sync_queue, db.match_setup, async () => {

        // Delete sets
        await db.sets.where('matchId').equals(currentMatch.id).delete()

        // Delete events - use direct delete for reliability
        await db.events.where('matchId').equals(currentMatch.id).delete()

        // Delete players
        if (currentMatch.team1Id) {
          await db.players.where('teamId').equals(currentMatch.team1Id).delete()
        }
        if (currentMatch.team2Id) {
          await db.players.where('teamId').equals(currentMatch.team2Id).delete()
        }

        // Delete teams
        if (currentMatch.team1Id) {
          await db.teams.delete(currentMatch.team1Id)
        }
        if (currentMatch.team2Id) {
          await db.teams.delete(currentMatch.team2Id)
        }

        // Delete all sync queue items
        await db.sync_queue.clear()

        // Delete match setup draft
        await db.match_setup.clear()

        // Delete match
        await db.matches.delete(currentMatch.id)
      })
    }

    setNewMatchModal(null)

    if (newMatchModal.type === 'official') {
      // Create new blank match
      const newMatchId = await db.matches.add({
        status: 'scheduled',
        refereePin: generateRefereePin(),
        coinTossConfirmed: false,
        createdAt: new Date().toISOString()
      })
      setMatchId(newMatchId)
      setShowMatchSetup(true)
      setShowCoinToss(false) // Ensure we go to match setup, not coin toss
    } else if (newMatchModal.type === 'test') {
      // Create test match (reuse the existing createNewTestMatch logic)
      await createTestMatchData()
      setShowCoinToss(false) // Ensure we go to match setup, not coin toss
    } else if (newMatchModal.type === 'competition' && newMatchModal.competitionMatch) {
      await createMatchFromCompetition(newMatchModal.competitionMatch)
    }
  }

  function cancelNewMatch() {
    setNewMatchModal(null)
  }

  useEffect(() => {
    ensureSeedTestTeams().catch(error => {
      console.error('Failed to ensure seeded test teams:', error)
    })
    ensureSeedTestOfficials().catch(error => {
      console.error('Failed to ensure seeded officials:', error)
    })
  }, [])

  async function ensureSeedTestTeams() {
    const seededTeams = []

    await db.transaction('rw', db.teams, db.players, db.sync_queue, async () => {
      for (const definition of TEST_TEAM_SEED_DATA) {
        let team = await db.teams.filter(t => t.seedKey === definition.seedKey).first()
        const isTestSeed = definition.seedKey?.startsWith('test-')

        if (!team) {
          const timestamp = new Date().toISOString()
          const teamId = await db.teams.add({
            name: definition.name,
            shortName: definition.shortName,
            color: definition.color,
            seedKey: definition.seedKey,
            test: true,
            createdAt: timestamp
          })

          // Don't sync test seed data to Supabase - it comes from the seed script

          const playersToCreate = definition.players.map(player => ({
            teamId,
            number: player.number,
            name: `${player.lastName} ${player.firstName}`,
            lastName: player.lastName,
            firstName: player.firstName,
            dob: player.dob,
            isCaptain: player.isCaptain,
            role: null,
            test: true,
            createdAt: timestamp
          }))

          await db.players.bulkAdd(playersToCreate, undefined, { allKeys: true })
          // Don't sync test seed players to Supabase - they come from the seed script

          team = {
            id: teamId,
            name: definition.name,
            shortName: definition.shortName,
            color: definition.color,
            seedKey: definition.seedKey,
            test: true,
            createdAt: timestamp
          }
        } else {
          // Update shortName if it doesn't match the seed definition
          if (team.shortName !== definition.shortName) {
            await db.teams.update(team.id, { shortName: definition.shortName })
            team = { ...team, shortName: definition.shortName }
          }
          const playerCount = await db.players.where('teamId').equals(team.id).count()
          if (playerCount === 0) {
            const timestamp = new Date().toISOString()
            const playersToCreate = definition.players.map(player => ({
              teamId: team.id,
              number: player.number,
              name: `${player.lastName} ${player.firstName}`,
              lastName: player.lastName,
              firstName: player.firstName,
              dob: player.dob,
              isCaptain: player.isCaptain,
              role: null,
              test: true,
              createdAt: timestamp
            }))

            await db.players.bulkAdd(playersToCreate)
          }
        }

        seededTeams.push(team)
      }
    })

    return seededTeams
  }

  async function ensureSeedTestOfficials() {
    const seededReferees = []
    const seededScorers = []

    // Local Dexie records only - no Supabase sync (officials stored as JSONB in match)
    await db.transaction('rw', db.referees, db.scorers, async () => {
      for (const definition of TEST_REFEREE_SEED_DATA) {
        let referee = await db.referees.filter(r => r.seedKey === definition.seedKey).first()

        if (!referee) {
          const timestamp = new Date().toISOString()
          const baseRecord = {
            seedKey: definition.seedKey,
            firstName: definition.firstName,
            lastName: definition.lastName,
            country: definition.country,
            dob: definition.dob,
            test: true,
            createdAt: timestamp
          }
          const refereeId = await db.referees.add(baseRecord)
          referee = { id: refereeId, ...baseRecord }
        } else {
          const definitionChanged =
            referee.firstName !== definition.firstName ||
            referee.lastName !== definition.lastName ||
            referee.country !== definition.country ||
            referee.dob !== definition.dob

          if (definitionChanged) {
            await db.referees.update(referee.id, {
              firstName: definition.firstName,
              lastName: definition.lastName,
              country: definition.country,
              dob: definition.dob
            })
            referee = {
              ...referee,
              firstName: definition.firstName,
              lastName: definition.lastName,
              country: definition.country,
              dob: definition.dob
            }
          }
        }

        seededReferees.push(referee)
      }

      for (const definition of TEST_SCORER_SEED_DATA) {
        let scorer = await db.scorers.filter(s => s.seedKey === definition.seedKey).first()

        if (!scorer) {
          const timestamp = new Date().toISOString()
          const baseRecord = {
            seedKey: definition.seedKey,
            firstName: definition.firstName,
            lastName: definition.lastName,
            country: definition.country || 'CHE',
            dob: definition.dob,
            test: true,
            createdAt: timestamp
          }
          const scorerId = await db.scorers.add(baseRecord)
          scorer = { id: scorerId, ...baseRecord }
        } else {
          const definitionChanged =
            scorer.firstName !== definition.firstName ||
            scorer.lastName !== definition.lastName ||
            (scorer.country || 'CHE') !== (definition.country || 'CHE') ||
            scorer.dob !== definition.dob

          if (definitionChanged) {
            await db.scorers.update(scorer.id, {
              firstName: definition.firstName,
              lastName: definition.lastName,
              country: definition.country || 'CHE',
              dob: definition.dob
            })
            scorer = {
              ...scorer,
              firstName: definition.firstName,
              lastName: definition.lastName,
              country: definition.country || 'CHE',
              dob: definition.dob
            }
          }
        }

        seededScorers.push(scorer)
      }
    })

    return { referees: seededReferees, scorers: seededScorers }
  }

  async function createTestMatchData() {
    // Clear any stray draft data from previous sessions
    await db.match_setup.clear()

    const seededTeams = await ensureSeedTestTeams()
    const { referees, scorers } = await ensureSeedTestOfficials()
    if (seededTeams.length < 2) {
      console.error('Not enough seeded test teams available.')
      return
    }

    const [team1, team2] = seededTeams
    const scheduledAt = getNextTestMatchStartTime()
    const timestamp = new Date().toISOString()

    // Get country codes from test seed data
    const team1Seed = TEST_TEAM_SEED_DATA.find(t => t.seedKey === team1.seedKey)
    const team2Seed = TEST_TEAM_SEED_DATA.find(t => t.seedKey === team2.seedKey)
    const team1Country = team1Seed?.country || 'CHE'
    const team2Country = team2Seed?.country || 'DEU'

    const findSeededRecord = (collection, seed) => {
      if (!seed) return null
      if (!collection?.length) return seed
      const seeded = collection.find(item => item.seedKey === seed.seedKey)
      return seeded || collection[0] || seed
    }

    const firstRef = findSeededRecord(referees, TEST_REFEREE_SEED_DATA[0])
    const secondRef = findSeededRecord(referees, TEST_REFEREE_SEED_DATA[1] || TEST_REFEREE_SEED_DATA[0])
    const primaryScorer = findSeededRecord(scorers, TEST_SCORER_SEED_DATA[0])
    const assistantScorer = findSeededRecord(scorers, TEST_SCORER_SEED_DATA[1] || TEST_SCORER_SEED_DATA[0])

    const officials = [
      {
        role: '1st referee',
        firstName: firstRef?.firstName || 'Claudia',
        lastName: firstRef?.lastName || 'Moser',
        country: firstRef?.country || 'CHE',
        dob: firstRef?.dob ? formatISODateToDisplay(firstRef.dob) : formatISODateToDisplay('1982-04-19')
      },
      {
        role: '2nd referee',
        firstName: secondRef?.firstName || 'Martin',
        lastName: secondRef?.lastName || 'Kunz',
        country: secondRef?.country || 'CHE',
        dob: secondRef?.dob ? formatISODateToDisplay(secondRef.dob) : formatISODateToDisplay('1979-09-02')
      },
      {
        role: 'scorer',
        firstName: primaryScorer?.firstName || 'Petra',
        lastName: primaryScorer?.lastName || 'Schneider',
        country: primaryScorer?.country || 'CHE',
        dob: primaryScorer?.dob ? formatISODateToDisplay(primaryScorer.dob) : formatISODateToDisplay('1990-01-15')
      },
      {
        role: 'assistant scorer',
        firstName: assistantScorer?.firstName || 'Lukas',
        lastName: assistantScorer?.lastName || 'Baumann',
        country: assistantScorer?.country || 'CHE',
        dob: assistantScorer?.dob ? formatISODateToDisplay(assistantScorer.dob) : formatISODateToDisplay('1988-06-27')
      },
      { role: 'line judge 1', name: 'Andrea Müller' },
      { role: 'line judge 2', name: 'Thomas Fischer' }
    ]

    let createdMatchId = null

    await db.transaction('rw', db.matches, db.sets, db.events, db.sync_queue, async () => {
      let existingMatch =
        (await db.matches.filter(m => m.seedKey === TEST_MATCH_SEED_KEY).first()) ||
        (await db.matches.filter(m => m.test === true && !m.seedKey).first())

      if (existingMatch && existingMatch.seedKey !== TEST_MATCH_SEED_KEY) {
        await db.matches.update(existingMatch.id, { seedKey: TEST_MATCH_SEED_KEY })
        existingMatch = await db.matches.get(existingMatch.id)
      }

      const baseMatchData = {
        status: 'scheduled',
        team1Id: team1.id,
        team2Id: team2.id,
        team1ShortName: team1.shortName,
        team2ShortName: team2.shortName,
        team1Country,
        team2Country,
        hall: TEST_MATCH_DEFAULTS.hall,
        city: TEST_MATCH_DEFAULTS.city,
        league: TEST_MATCH_DEFAULTS.league,
        gameNumber: TEST_MATCH_DEFAULTS.gameNumber,
        court: TEST_MATCH_DEFAULTS.court || '',
        gender: TEST_MATCH_DEFAULTS.gender || 'men',
        phase: TEST_MATCH_DEFAULTS.phase || 'main',
        round: TEST_MATCH_DEFAULTS.round || 'pool',
        scheduledAt,
        refereePin: generateRefereePin(),
        officials,
        team1CaptainSignature: 'xxxxx',
        team2CaptainSignature: 'xxxxx',
        coinTossConfirmed: false,
        test: true,
        seedKey: TEST_MATCH_SEED_KEY,
        externalId: TEST_MATCH_EXTERNAL_ID,
        matchInfoConfirmedAt: timestamp // Test matches are pre-configured
      }

      if (existingMatch) {
        await db.events.where('matchId').equals(existingMatch.id).delete()
        await db.sets.where('matchId').equals(existingMatch.id).delete()

        await db.matches.update(existingMatch.id, {
          ...baseMatchData,
          // Preserve existing refereePin if it exists
          refereePin: existingMatch.refereePin || baseMatchData.refereePin,
          createdAt: existingMatch.createdAt || timestamp,
          updatedAt: timestamp
        })

        createdMatchId = existingMatch.id
        // Don't sync test match metadata to Supabase - it comes from the seed script
      } else {
        const newMatchId = await db.matches.add({
          ...baseMatchData,
          createdAt: timestamp,
          updatedAt: timestamp
        })

        createdMatchId = newMatchId
        // Don't sync test match metadata to Supabase - it comes from the seed script
      }
    })

    // Create draft in match_setup with country codes for immediate availability
    if (createdMatchId) {
      await db.match_setup.add({
        team1Country,
        team2Country,
        updatedAt: timestamp
      })
    }

    if (createdMatchId) {
      setMatchId(createdMatchId)
      setShowMatchSetup(true)
      setShowCoinToss(false)
    }
  }

  async function createNewTestMatch() {
    if (testMatchLoading) return

    const officialMatchRecording = matchStatus?.status === 'Match recording' && currentOfficialMatch
    if (officialMatchRecording) {
      setConfirmModal({
        message: 'An official match is still recording. Starting a new test match will wipe the previous test session. Continue?',
        onConfirm: async () => {
          setConfirmModal(null)
          setTestMatchLoading(true)
          try {
            await clearLocalTestData()
            await createTestMatchData()
          } catch (error) {
            console.error('Failed to prepare test match:', error)
            setAlertModal(`Unable to prepare the test match: ${error.message || error}`)
          } finally {
            setTestMatchLoading(false)
          }
        },
        onCancel: () => {
          setConfirmModal(null)
        }
      })
      return
    }

    setTestMatchLoading(true)

    try {
      // Clear previous test match locally
      await clearLocalTestData()

      // Create test match locally only - no Supabase interaction
      await createTestMatchData()
    } catch (error) {
      console.error('Failed to prepare test match:', error)
      setAlertModal(`Unable to prepare the test match: ${error.message || error}`)
    } finally {
      setTestMatchLoading(false)
    }
  }

  async function continueTestMatch() {
    if (testMatchLoading) return

    // Use toArray and filter to avoid index requirement
    const matches = await db.matches.orderBy('createdAt').reverse().toArray()
    const existing = matches.find(m => m.test === true && m.status !== 'final')
    if (existing) {
      // Check if coin toss is confirmed
      const isCoinTossConfirmed = existing.coinTossTeamA !== null &&
        existing.coinTossTeamA !== undefined &&
        existing.coinTossTeamB !== null &&
        existing.coinTossTeamB !== undefined &&
        existing.coinTossServeA !== null &&
        existing.coinTossServeA !== undefined &&
        existing.coinTossServeB !== null &&
        existing.coinTossServeB !== undefined

      // PIN check removed - no longer required

      // Check match state to determine where to continue
      const isMatchSetupComplete = existing.team1CaptainSignature &&
        existing.team2CaptainSignature

      setMatchId(existing.id)

      // Determine where to continue based on status
      // Note: status flow is live -> ended -> final (after approval)
      if (existing.status === 'live' || existing.status === 'ended' || existing.status === 'final') {
        // Check if match is finished (one team has won 3 sets) - go to MatchEnd
        const sets = await db.sets.where('matchId').equals(existing.id).toArray()
        const finishedSets = sets.filter(s => s.finished)
        const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
        const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
        const isMatchFinished = team1SetsWon >= 3 || team2SetsWon >= 3

        setShowMatchSetup(false)
        setShowCoinToss(false)

        if ((existing.status === 'live' || existing.status === 'ended') && isMatchFinished && !existing.approved) {
          // Match finished but not yet approved - go to MatchEnd
          setShowMatchEnd(true)
        } else {
          // Match in progress - go to scoreboard
          setShowMatchEnd(false)
        }
      } else if (isMatchSetupComplete && isCoinTossConfirmed) {
        // Match setup and coin toss complete - go to scoreboard
        setShowMatchSetup(false)
        setShowCoinToss(false)
      } else if (isMatchSetupComplete) {
        // Match setup complete but coin toss not done - go to coin toss
        setShowMatchSetup(false)
        setShowCoinToss(true)
      } else {
        // Match setup not complete - go to match setup
        setShowMatchSetup(true)
        setShowCoinToss(false)
      }
    } else {
      setAlertModal('No test match found. Please create a new test match first.')
    }
  }

  async function restartTestMatch() {
    if (testMatchLoading) return

    // Set loading state immediately to disable buttons
    setTestMatchLoading(true)

    setConfirmModal({
      message: 'This will delete the test match and all its data. Continue?',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          // Find the test match - use toArray and filter to avoid index requirement
          const matches = await db.matches.orderBy('createdAt').reverse().toArray()
          const testMatch = matches.find(m => m.test === true && m.status !== 'final')
          if (!testMatch) {
            setAlertModal('No test match found. Please create a new test match first.')
            setTestMatchLoading(false)
            return
          }

          // Delete all test match data
          await clearLocalTestData()

          // Clear matchId to return to home view
          setMatchId(null)
          setShowMatchSetup(false)
          setShowCoinToss(false)
          setShowManualAdjustments(false)

          setAlertModal('Test match deleted successfully.')
        } catch (error) {
          console.error('Failed to delete test match:', error)
          setAlertModal(`Unable to delete test match: ${error.message || error}`)
        } finally {
          setTestMatchLoading(false)
        }
      },
      onCancel: () => {
        setConfirmModal(null)
        setTestMatchLoading(false)
      }
    })
  }

  async function continueMatch(matchIdParam) {
    const targetMatchId = matchIdParam || currentOfficialMatch?.id
    if (!targetMatchId) return

    try {
      // Get the match to check its status
      const match = await db.matches.get(targetMatchId)
      if (!match) return

      // Check session lock (only for non-test matches)
      if (!match.test) {
        const sessionCheck = await checkMatchSession(targetMatchId)

        if (sessionCheck.locked && !sessionCheck.isCurrentSession) {
          // Match is locked by another session - just take over (no PIN required)
          await lockMatchSession(targetMatchId)
        } else if (!sessionCheck.locked) {
          // Match is not locked - lock it for this session
          await lockMatchSession(targetMatchId)
        }
        // If isCurrentSession is true, we already own it - no need to lock again
      }

      // PIN check removed - no longer required

      // Check if coin toss is confirmed (for navigation logic)
      const isCoinTossConfirmed = match.coinTossTeamA !== null &&
        match.coinTossTeamA !== undefined &&
        match.coinTossTeamB !== null &&
        match.coinTossTeamB !== undefined &&
        match.coinTossServeA !== null &&
        match.coinTossServeA !== undefined &&
        match.coinTossServeB !== null &&
        match.coinTossServeB !== undefined

      // If coin toss is confirmed and match is live, allow test matches to go to scoreboard
      // (This handles the case when coin toss is just confirmed)
      if (match.test === true && match.status === 'live' && isCoinTossConfirmed) {
        // Go directly to scoreboard for test matches after coin toss confirmation
        setMatchId(targetMatchId)
        setShowMatchSetup(false)
        setShowCoinToss(false)
        return
      }

      // Reject test matches for other cases
      if (match.test === true) {
        setAlertModal('This is a test match. Use "Continue test match" instead.')
        return
      }

      // Determine where to continue based on status
      // Note: status flow is live -> ended -> final (after approval)
      if (match.status === 'live' || match.status === 'ended' || match.status === 'final') {
        // Check if match is finished (one team has won 3 sets) - go to MatchEnd
        const sets = await db.sets.where('matchId').equals(targetMatchId).toArray()
        const finishedSets = sets.filter(s => s.finished)
        const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
        const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
        const isMatchFinished = team1SetsWon >= 3 || team2SetsWon >= 3

        setMatchId(targetMatchId)
        setShowMatchSetup(false)
        setShowCoinToss(false)

        if ((match.status === 'live' || match.status === 'ended') && isMatchFinished && !match.approved) {
          // Match finished but not yet approved - go to MatchEnd
          setShowMatchEnd(true)
        } else {
          // Match in progress or already approved - go to scoreboard
          setShowMatchEnd(false)
        }
      } else {
        // Go to match setup
        setMatchId(targetMatchId)
        setShowMatchSetup(true)
      }
    } catch (error) {
      console.error('Error continuing match:', error)
      setAlertModal('Error opening match. Please try again.')
    }
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: 'auto', maxWidth: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => {
      // Close connection menu and debug menu when clicking outside
      if (showConnectionMenu && !e.target.closest('[data-connection-menu]')) {
        setShowConnectionMenu(false)
      }
      if (showDebugMenu && !e.target.closest('[data-debug-menu]')) {
        setShowDebugMenu(null)
      }
      // Close match info menu when clicking outside
      if (matchInfoMenuOpen && !e.target.closest('[data-match-info-menu]')) {
        setMatchInfoMenuOpen(false)
      }
    }}>
      {/* Cloud sync waits for a sign-in: say so once, without blocking scoring */}
      {!offlineMode && (
        <SyncSignInBanner
          syncStatus={syncStatus}
          compact={!!(matchId && !showCoinToss && !showMatchSetup && !showMatchEnd && !showManualAdjustments)}
        />
      )}
      {/* Minimum screen size warning - block phones/small screens */}
      {/* Allow if at least one dimension >= 800 (tablet in any orientation), but enforce min 500 on both */}
      {/* Skip warning in fullscreen mode - trust user has adequate screen space */}
      {!isFullscreen && ((viewportSize.width < 800 && viewportSize.height < 800) || viewportSize.width < 600 || viewportSize.height < 600) ? (
        <div style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.9)',
          gap: '20px'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '10px'
          }}>
            <Smartphone />
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            maxWidth: '400px',
            lineHeight: '1.5'
          }}>
            To use this application, please use a tablet or larger screen (minimum 800×600).
          </div>
          <div style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.6)'
          }}>
            Current: {viewportSize.width} × {viewportSize.height}px
          </div>
          <div style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.5)',
            marginTop: '10px'
          }}>
            Try rotating your device or entering fullscreen mode.
          </div>
          <button
            onClick={toggleFullscreen}
            style={{
              marginTop: '20px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>⛶</span>
            <span>Enter Fullscreen</span>
          </button>
          <div style={{
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.4)',
            marginTop: '12px'
          }}>
            Fullscreen removes browser headers to maximize screen space.
          </div>
        </div>
      ) : (
        <>
          {/* Global Header */}
          <MainHeader
            connectionStatuses={connectionStatuses}
            connectionDebugInfo={connectionDebugInfo}
            showMatchSetup={showMatchSetup}
            matchId={matchId}
            currentMatch={currentMatch}
            matchInfoMenuOpen={matchInfoMenuOpen}
            setMatchInfoMenuOpen={setMatchInfoMenuOpen}
            matchInfoData={matchInfoData}
            matchStatus={matchStatus}
            currentOfficialMatch={currentOfficialMatch}
            currentTestMatch={currentTestMatch}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            offlineMode={offlineMode}
            setOfflineMode={(val) => {
              setOfflineMode(val)
              localStorage.setItem('offlineMode', val.toString())
            }}
            onOpenSetup={openMatchSetup}
            queueStats={syncQueueCounts}
            onRetryErrors={retryErrors}
            dashboardServer={dashboardServerEnabled ? {
              enabled: dashboardServerEnabled,
              dashboardCount: dashboardServerData.dashboardCount,
              refereePin: currentMatch?.refereePin,
              onOpenOptions: () => setHomeOptionsModal(true),
              serverIP: dashboardServerData.serverIP,
              serverPort: dashboardServerData.serverPort,
              wsPort: dashboardServerData.wsPort,
              connectionUrl: dashboardServerData.connectionUrl,
              wsConnectionUrl: dashboardServerData.wsConnectionUrl,
              serverRunning: dashboardServerData.serverRunning,
              refereeCount: dashboardServerData.refereeCount
            } : null}
            collapsible={!!(matchId && !showCoinToss && !showMatchSetup && !showMatchEnd)}
            onTriggerAlarm={async () => {
              if (!matchId || !isBackendAvailable() || !currentMatch) return

              // Identify the UUID for Supabase
              let supabaseMatchId = null
              const externalId = currentMatch.externalId
              // Check if externalId is already a UUID
              if (externalId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId)) {
                supabaseMatchId = externalId
              } else {
                // Fallback: look up standard ID from matches table using the match seed key
                const seedKey = currentMatch.seed_key || String(matchId)
                const { data: matchData } = await apiFrom('matches')
                  .select('id')
                  .eq('external_id', seedKey)
                  .maybeSingle()
                if (matchData) supabaseMatchId = matchData.id
              }

              if (!supabaseMatchId) {
                console.warn('[Alarm] Could not resolve Supabase UUID for match', matchId)
                return
              }

              const trigger = new Date().toISOString()
              setScorerAttentionTrigger(trigger)
              try {
                const { error } = await apiFrom('match_live_state')
                  .update({ scorer_attention_trigger: trigger })
                  .eq('match_id', supabaseMatchId)
                if (error) throw error
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(100)
                }
              } catch (err) {
                console.error('Failed to trigger alarm:', err)
              }
            }}
            alarmEnabled={currentMatch?.refereeConnectionEnabled === true}
            onOpenGuide={() => setInteractiveGuideOpen(true)}
          />
          <div className="container" style={{
            minHeight: 0,
            flex: '1 1 auto',
            width: '100%',
            height: 'auto',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            padding: '5px',
            overflow: 'hidden'
          }}>
            <div className="panel" style={{
              flex: '1 1 auto',
              height: 'auto',
              overflowY: (matchId && !showCoinToss && !showMatchSetup && !showMatchEnd) ? 'hidden' : 'auto',
              overflowX: 'hidden',
              width: '100%',
              maxWidth: '100%',
              padding: (matchId && !showCoinToss && !showMatchSetup && !showMatchEnd) ? '10px' : '10px',
              // Vertical centering for CoinToss and MatchSetup screens
              ...(showCoinToss || showMatchSetup ? {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              } : {})
            }}>
              {showCoinToss && matchId ? (
                <CoinToss
                  matchId={matchId}
                  onConfirm={async () => {
                    setShowCoinToss(false)
                    // Check if match was ended by forfait (skip to MatchEnd)
                    const m = await db.matches.get(matchId)
                    if (m?.status === 'ended') {
                      setShowMatchEnd(true)
                    }
                    // Otherwise match status is set to 'live' by CoinToss component
                  }}
                  onBack={() => {
                    setShowCoinToss(false)
                    setShowMatchSetup(true)
                  }}
                />
              ) : showMatchSetup && matchId ? (
                <MatchSetup
                  matchId={matchId}
                  onStart={continueMatch}
                  onReturn={returnToMatch}
                  onOpenOptions={() => setHomeOptionsModal(true)}
                  onOpenCoinToss={() => {
                    setShowMatchSetup(false)
                    setShowCoinToss(true)
                  }}
                  offlineMode={offlineMode}
                  onLoadCompetitionMatch={COMPETITIONS_ENABLED && canUseSupabase ? () => setShowCompetitionPicker(true) : undefined}
                />
              ) : showManualAdjustments && matchId ? (
                <ManualAdjustments
                  matchId={matchId}
                  onClose={() => {
                    setShowManualAdjustments(false)
                    setShowMatchEnd(true)
                  }}
                  onSave={() => {
                    setShowManualAdjustments(false)
                    setShowMatchEnd(true)
                  }}
                />
              ) : showMatchEnd && matchId ? (
                <MatchEnd
                  matchId={matchId}
                  onGoHome={() => {
                    setMatchId(null)
                    setShowMatchEnd(false)
                    setShowManualAdjustments(false)
                  }}
                  onReopenLastSet={() => {
                    // Just hide MatchEnd - Scoreboard will show for the same matchId
                    setShowMatchEnd(false)
                    setShowManualAdjustments(false)
                  }}
                  onManualAdjustments={() => {
                    setShowMatchEnd(false)
                    setShowManualAdjustments(true)
                  }}
                />
              ) : !matchId ? (
                <>
                  <UpdateBanner showClearDataOption={true} />
                  <HomePage
                    favicon={openbeachLogo}
                    newMatchMenuOpen={newMatchMenuOpen}
                    setNewMatchMenuOpen={setNewMatchMenuOpen}
                    createNewOfficialMatch={createNewOfficialMatch}
                    createNewTestMatch={createNewTestMatch}
                    testMatchLoading={testMatchLoading}
                    currentOfficialMatch={currentOfficialMatch}
                    currentTestMatch={currentTestMatch}
                    continueMatch={continueMatch}
                    continueTestMatch={continueTestMatch}
                    showDeleteMatchModal={showDeleteMatchModal}
                    restartTestMatch={restartTestMatch}
                    onOpenSettings={() => setHomeOptionsModal(true)}
                    onRestoreMatch={() => setRestoreMatchModal(true)}
                  />
                </>
              ) : (
                <Scoreboard
                  matchId={matchId}
                  scorerAttentionTrigger={scorerAttentionTrigger}
                  onFinishSet={finishSet}
                  onOpenSetup={openMatchSetup}
                  onOpenMatchSetup={openMatchSetupView}
                  onOpenCoinToss={openCoinTossView}
                  onTriggerEventBackup={backup.triggerEventBackup}
                />
              )}
            </div>

            {/* Delete Match Modal */}
            {deleteMatchModal && (
              <Modal
                title="Delete Match"
                open={true}
                onClose={cancelDeleteMatch}
                width={420}
              >
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '16px', fontSize: '16px' }}>
                    Are you sure you want to delete all data for: <strong>{deleteMatchModal.matchName}</strong>?
                  </p>
                  <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--muted)' }}>
                    This will delete all sets, events, players, and team data for this match from local storage and from the cloud database.
                  </p>

                  {/* PIN confirmation for matches with gamePin */}
                  {deleteMatchModal.gamePin && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#ef4444' }}>
                        Enter Game PIN to confirm deletion:
                      </label>
                      <input
                        type="text"
                        value={deletePinInput}
                        onChange={(e) => {
                          setDeletePinInput(e.target.value)
                          setDeletePinError('')
                        }}
                        placeholder="Game PIN"
                        style={{
                          width: '100%',
                          maxWidth: '200px',
                          padding: '12px',
                          fontSize: '18px',
                          fontWeight: 600,
                          textAlign: 'center',
                          letterSpacing: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: deletePinError ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '8px',
                          color: 'var(--text)'
                        }}
                      />
                      {deletePinError && (
                        <p style={{ marginTop: '8px', fontSize: '13px', color: '#ef4444' }}>
                          {deletePinError}
                        </p>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={confirmDeleteMatch}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={cancelDeleteMatch}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Restore Match Modal */}
            {restoreMatchModal && (
              <Modal
                title="Restore Match"
                open={true}
                onClose={() => {
                  setRestoreMatchModal(false)
                  setRestoreMatchIdInput('')
                  setRestorePin('')
                  setRestoreError('')
                  setCloudBackups([])
                  setCloudBackupPin('')
                  setCloudBackupGameN('')
                  setCloudBackupError('')
                }}
                width={500}
              >
                <div style={{ padding: '24px' }}>
                  {/* Restore from Cloud Backup */}
                  {!offlineMode && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)' }}>
                        Restore from Cloud Backup
                      </h3>
                      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px' }}>
                        Enter the match number and PIN to search for cloud backups.
                      </p>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                            Match #:
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={cloudBackupGameN}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '')
                              setCloudBackupGameN(value)
                            }}
                            placeholder="123456"
                            style={{
                              width: '100%',
                              padding: '12px',
                              fontSize: '20px',
                              fontWeight: 700,
                              textAlign: 'center',
                              fontFamily: 'monospace',
                              background: 'var(--bg)',
                              border: '2px solid rgba(255,255,255,0.2)',
                              borderRadius: '8px',
                              color: 'var(--text)',
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div style={{ flex: 1.5 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                            Game PIN:
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={cloudBackupPin}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '')
                              if (value.length <= 6) {
                                setCloudBackupPin(value)
                              }
                            }}
                            placeholder="000000"
                            maxLength={6}
                            style={{
                              width: '100%',
                              padding: '12px',
                              fontSize: '20px',
                              fontWeight: 700,
                              textAlign: 'center',
                              letterSpacing: '4px',
                              fontFamily: 'monospace',
                              background: 'var(--bg)',
                              border: '2px solid rgba(255,255,255,0.2)',
                              borderRadius: '8px',
                              color: 'var(--text)',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (cloudBackupPin.length !== 6) {
                            setCloudBackupError('Please enter a 6-digit PIN')
                            return
                          }
                          setCloudBackupLoading(true)
                          setCloudBackupError('')
                          try {
                            const gameN = parseInt(cloudBackupGameN) || 1
                            // Cloud backups (backend 'backup' bucket)
                            const cloudResults = await listCloudBackups(cloudBackupPin, gameN).catch(() => [])
                            const taggedCloud = cloudResults.map(b => ({ ...b, source: b.source || 'cloud' }))
                            // Most recent first
                            const merged = [...taggedCloud].sort((a, b) => {
                              const dateA = a.created || a.updated_at || ''
                              const dateB = b.created || b.updated_at || ''
                              return dateB.localeCompare(dateA)
                            })
                            setCloudBackups(merged)
                            if (merged.length === 0) {
                              setCloudBackupError('No backups found for this Game Number')
                            }
                          } catch (err) {
                            setCloudBackupError(err.message || 'Failed to list backups')
                          } finally {
                            setCloudBackupLoading(false)
                          }
                        }}
                        disabled={cloudBackupLoading || cloudBackupPin.length !== 6}
                        style={{
                          width: '100%',
                          padding: '12px 24px',
                          fontSize: '14px',
                          fontWeight: 600,
                          background: cloudBackupLoading || cloudBackupPin.length !== 6 ? 'rgba(139, 92, 246, 0.3)' : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: cloudBackupLoading || cloudBackupPin.length !== 6 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {cloudBackupLoading ? 'Loading...' : 'Search Cloud Backups'}
                      </button>
                      {cloudBackupError && (
                        <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px', marginBottom: '0' }}>{cloudBackupError}</p>
                      )}
                      {cloudBackups.length > 0 && (
                        <div style={{
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '8px',
                          marginTop: '8px',
                          maxHeight: '300px',
                          overflowY: 'auto'
                        }}>
                          <BackupTable
                            backups={cloudBackups}
                            onBackupSelect={async (backup) => {
                              setRestoreLoading(true)
                              setRestoreError('')
                              try {
                                const cloudData = await fetchCloudBackup(backup.path)
                                if (!cloudData) {
                                  setRestoreError('Failed to fetch backup data')
                                  setRestoreLoading(false)
                                  return
                                }
                                setRestorePreviewData({ data: cloudData, source: backup.source || 'cloud', backupName: backup.name })
                              } catch (err) {
                                setRestoreError(err.message || 'Failed to load backup')
                              } finally {
                                setRestoreLoading(false)
                              }
                            }}
                            loading={restoreLoading}
                            mode="button"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Divider before local backup */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '24px'
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>or</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
                  </div>

                  {/* Offline/File restore */}
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)' }}>
                      Restore from Local File
                    </h3>
                    <button
                      onClick={async () => {
                        setRestoreLoading(true)
                        setRestoreError('')
                        try {
                          const jsonData = await selectBackupFile()
                          if (!jsonData) {
                            setRestoreLoading(false)
                            return // User cancelled
                          }
                          // Show preview instead of immediately restoring
                          setRestorePreviewData({ data: jsonData, source: 'local' })
                        } catch (err) {
                          setRestoreError(err.message || 'Failed to restore from file')
                        } finally {
                          setRestoreLoading(false)
                        }
                      }}
                      disabled={restoreLoading}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: restoreLoading ? 'rgba(249, 115, 22, 0.3)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: restoreLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {restoreLoading ? 'Loading...' : 'Select Backup File'}
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Restore Preview Modal */}
            {restorePreviewData && (
              <Modal
                title="Restore Preview"
                open={true}
                onClose={() => setRestorePreviewData(null)}
                width={700}
              >
                <div style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
                  {(() => {
                    // Normalize data from different sources
                    const d = restorePreviewData.data
                    const isDbFormat = d.match?.team1_data || d.match?.team1_team || d.liveState

                    const team1Name = isDbFormat
                      ? (d.match?.team1_data?.name || d.match?.team1_team?.name || d.match?.team1Name || 'Team 1')
                      : (d.team1?.name || d.match?.team1Name || 'Team 1')
                    const team2Name = isDbFormat
                      ? (d.match?.team2_data?.name || d.match?.team2_team?.name || d.match?.team2Name || 'Team 2')
                      : (d.team2?.name || d.match?.team2Name || 'Team 2')

                    const events = d.events || []
                    const sets = d.sets || []

                    // Get latest set
                    const latestSet = [...sets].sort((a, b) => (b.index || 0) - (a.index || 0))[0]
                    const currentSetIndex = latestSet?.index || d.liveState?.current_set || 1
                    const team1Points = latestSet?.team1Points ?? latestSet?.team1_points ?? d.liveState?.points_a ?? 0
                    const team2Points = latestSet?.team2Points ?? latestSet?.team2_points ?? d.liveState?.points_b ?? 0

                    // Get lineups (from events or liveState)
                    const lineupEvents = events.filter(e => e.type === 'lineup')
                    const team1Lineup = lineupEvents.find(e => e.payload?.team === 'team1')?.payload?.lineup ||
                      (isDbFormat ? d.liveState?.lineup_a : null)
                    const team2Lineup = lineupEvents.find(e => e.payload?.team === 'team2')?.payload?.lineup ||
                      (isDbFormat ? d.liveState?.lineup_b : null)

                    // Get timeouts for current set
                    const timeoutEvents = events.filter(e => e.type === 'timeout' && e.setIndex === currentSetIndex)
                    const team1Timeouts = timeoutEvents.filter(e => e.payload?.team === 'team1').length
                    const team2Timeouts = timeoutEvents.filter(e => e.payload?.team === 'team2').length

                    // Get sanctions
                    const sanctionEvents = events.filter(e => e.type === 'sanction')

                    // Get serving team
                    const pointEvents = events.filter(e => e.type === 'point').sort((a, b) => (b.seq || 0) - (a.seq || 0))
                    const lastPoint = pointEvents[0]
                    const servingTeam = lastPoint?.payload?.scoringTeam || d.liveState?.serving_team || 'team1'

                    // Helper to render lineup (beach volleyball: 2 players)
                    const renderLineup = (lineup, teamName) => {
                      if (!lineup) return <span style={{ color: 'rgba(255,255,255,0.4)' }}>No lineup data</span>
                      const positions = ['I', 'II']
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                          {positions.map(pos => {
                            const posData = lineup[pos]
                            const num = typeof posData === 'object' ? posData?.number : posData
                            const isServing = typeof posData === 'object' && posData?.isServing
                            return (
                              <div key={pos} style={{
                                padding: '6px 8px',
                                background: isServing ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                                borderRadius: '4px',
                                textAlign: 'center',
                                fontSize: '13px'
                              }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{pos}</span>
                                <br />
                                <span style={{ fontWeight: 600 }}>{num || '-'}</span>
                                {isServing && <span style={{ color: '#22c55e', marginLeft: '4px' }}>●</span>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                    return (
                      <>
                        {/* Source indicator */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'center',
                          marginBottom: '16px',
                          gap: '8px'
                        }}>
                          <span style={{
                            padding: '4px 12px',
                            background: restorePreviewData.source === 'database' ? '#3b82f6' :
                              restorePreviewData.source === 'cloud' ? '#8b5cf6' : '#f97316',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {restorePreviewData.source === 'database' ? 'From Database' :
                              restorePreviewData.source === 'cloud' ? 'Restore from Cloud Backup' : 'From Local File'}
                          </span>
                          {restorePreviewData.backupName && (
                            <span style={{
                              padding: '4px 12px',
                              background: 'rgba(255,255,255,0.1)',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontFamily: 'monospace'
                            }}>
                              {restorePreviewData.backupName.replace('.json', '')}
                            </span>
                          )}
                        </div>

                        {/* Teams header */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '8px',
                          marginBottom: '16px'
                        }}>
                          <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{team1Name}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Team 1</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0 16px' }}>
                            <div style={{ fontSize: '24px', fontWeight: 700 }}>{team1Points} - {team2Points}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Set {currentSetIndex}</div>
                          </div>
                          <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{team2Name}</div>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Team 2</div>
                          </div>
                        </div>

                        {/* Serving indicator */}
                        <div style={{
                          textAlign: 'center',
                          marginBottom: '16px',
                          fontSize: '14px'
                        }}>
                          <span style={{ color: '#22c55e' }}>● </span>
                          Serving: <strong>{servingTeam === 'team1' ? team1Name : team2Name}</strong>
                        </div>

                        {/* Lineups */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '16px',
                          marginBottom: '16px'
                        }}>
                          <div>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
                              {team1Name} Lineup
                            </h4>
                            {renderLineup(team1Lineup)}
                          </div>
                          <div>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
                              {team2Name} Lineup
                            </h4>
                            {renderLineup(team2Lineup)}
                          </div>
                        </div>

                        {/* Timeouts */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '16px',
                          marginBottom: '16px'
                        }}>
                          <div style={{
                            padding: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Timeouts</div>
                            <div style={{ fontSize: '20px', fontWeight: 700 }}>{team1Timeouts}/1</div>
                          </div>
                          <div style={{
                            padding: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Timeouts</div>
                            <div style={{ fontSize: '20px', fontWeight: 700 }}>{team2Timeouts}/1</div>
                          </div>
                        </div>

                        {/* Sanctions */}
                        {sanctionEvents.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'rgba(255,255,255,0.7)' }}>
                              Sanctions ({sanctionEvents.length})
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {sanctionEvents.map((s, i) => (
                                <div key={i} style={{
                                  padding: '4px 8px',
                                  background: s.payload?.type === 'red' ? 'rgba(239, 68, 68, 0.2)' :
                                    s.payload?.type === 'yellow' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.1)',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}>
                                  {s.payload?.team === 'team1' ? team1Name : team2Name}{s.payload?.playerNumber ? ` #${s.payload.playerNumber}` : ''} - {s.payload?.type || 'sanction'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Set scores summary */}
                        {sets.length > 0 && (
                          <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'rgba(255,255,255,0.7)' }}>
                              Set Scores
                            </h4>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {[...sets].sort((a, b) => (a.index || 0) - (b.index || 0)).map(s => (
                                <div key={s.index} style={{
                                  padding: '8px 12px',
                                  background: s.finished ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.2)',
                                  borderRadius: '6px',
                                  textAlign: 'center'
                                }}>
                                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Set {s.index}</div>
                                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                    {s.team1Points ?? s.team1_points ?? 0} - {s.team2Points ?? s.team2_points ?? 0}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Error display */}
                        {restoreError && (
                          <div style={{
                            padding: '12px',
                            marginBottom: '16px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '8px',
                            color: '#ef4444',
                            fontSize: '13px'
                          }}>
                            {restoreError}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{
                          display: 'flex',
                          gap: '12px',
                          justifyContent: 'center',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          <button
                            onClick={async () => {
                              setRestoreLoading(true)
                              setRestoreError('')
                              try {
                                const cloudData = restorePreviewData.data
                                let newMatchId

                                if (restorePreviewData.source === 'database') {
                                  newMatchId = await importMatchFromSupabase(cloudData)
                                } else {
                                  newMatchId = await restoreMatchFromJson(cloudData)
                                }

                                // Close modals
                                setRestorePreviewData(null)
                                setRestoreMatchModal(false)
                                setRestoreMatchIdInput('')
                                setRestorePin('')
                                setCloudBackups([])
                                setCloudBackupPin('')
                                setCloudBackupGameN('')
                                setCloudBackupError('')
                                setMatchId(newMatchId)

                                // Determine where to go based on match state
                                const matchStatus = cloudData.match?.status
                                const hasEvents = cloudData.events && cloudData.events.length > 0
                                const hasSets = cloudData.sets && cloudData.sets.length > 0
                                const finishedSets = (cloudData.sets || []).filter(s => s.finished)
                                const team1SetsWon = finishedSets.filter(s => (s.team1Points ?? s.team1_points ?? 0) > (s.team2Points ?? s.team2_points ?? 0)).length
                                const team2SetsWon = finishedSets.filter(s => (s.team2Points ?? s.team2_points ?? 0) > (s.team1Points ?? s.team1_points ?? 0)).length
                                const isMatchFinished = team1SetsWon >= 2 || team2SetsWon >= 2

                                // Priority: finished match → MatchEnd, live with activity → Scoreboard, else → Setup
                                if (isMatchFinished) {
                                  // Match is complete - go directly to MatchEnd
                                  setShowMatchSetup(false)
                                  setShowMatchEnd(true)
                                } else if ((matchStatus === 'live' || hasEvents || hasSets) && (hasEvents || hasSets)) {
                                  // Match in progress with activity - go to Scoreboard
                                  setShowMatchSetup(false)
                                } else {
                                  // New or setup-phase match - go to MatchSetup
                                  setShowMatchSetup(true)
                                }
                              } catch (err) {
                                console.error('[Restore] Failed to restore match:', err)
                                setRestoreError(err.message || 'Failed to restore match')
                              } finally {
                                setRestoreLoading(false)
                              }
                            }}
                            disabled={restoreLoading}
                            style={{
                              padding: '12px 32px',
                              fontSize: '15px',
                              fontWeight: 600,
                              background: restoreLoading ? 'rgba(34, 197, 94, 0.3)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: restoreLoading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {restoreLoading ? 'Restoring...' : 'Confirm Restore'}
                          </button>
                          <button
                            onClick={() => setRestorePreviewData(null)}
                            disabled={restoreLoading}
                            style={{
                              padding: '12px 24px',
                              fontSize: '14px',
                              fontWeight: 600,
                              background: 'rgba(255,255,255,0.1)',
                              color: 'var(--text)',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: '8px',
                              cursor: restoreLoading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Select Another
                          </button>
                          <button
                            onClick={() => {
                              setRestorePreviewData(null)
                              setRestoreMatchModal(false)
                              setRestoreMatchIdInput('')
                              setRestorePin('')
                              setCloudBackups([])
                              setCloudBackupPin('')
                              setCloudBackupGameN('')
                              setCloudBackupError('')
                            }}
                            disabled={restoreLoading}
                            style={{
                              padding: '12px 24px',
                              fontSize: '14px',
                              fontWeight: 600,
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '8px',
                              cursor: restoreLoading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </Modal>
            )}

            {/* New Match Modal */}
            {newMatchModal && (
              <Modal
                title="Create New Match"
                open={true}
                onClose={cancelNewMatch}
                width={400}
              >
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '24px', fontSize: '16px' }}>
                    {newMatchModal.message}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={confirmNewMatch}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'var(--accent)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={cancelNewMatch}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Competition Match Picker (off until the backend serves competitions) */}
            {COMPETITIONS_ENABLED && (
              <CompetitionMatchPicker
                open={showCompetitionPicker}
                onClose={() => setShowCompetitionPicker(false)}
                onSelect={loadCompetitionMatch}
              />
            )}

            {/* Alert Modal */}
            {alertModal && (
              <Modal
                title="Alert"
                open={true}
                onClose={() => setAlertModal(null)}
                width={400}
                hideCloseButton={true}
              >
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '24px', fontSize: '16px' }}>
                    {alertModal}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setAlertModal(null)}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'var(--accent)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Confirm Modal */}
            {confirmModal && (
              <Modal
                title="Confirm"
                open={true}
                onClose={confirmModal.onCancel}
                width={400}
                hideCloseButton={true}
              >
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ marginBottom: '24px', fontSize: '16px' }}>
                    {confirmModal.message}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={confirmModal.onConfirm}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'var(--accent)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Yes
                    </button>
                    <button
                      onClick={confirmModal.onCancel}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Modal>
            )}

            {/* Home Options Modal */}
            <HomeOptionsModal
              open={homeOptionsModal}
              onClose={() => setHomeOptionsModal(false)}
              onOpenConnectionSetup={() => setConnectionSetupModal(true)}
              matchOptions={{
                checkAccidentalRallyStart,
                setCheckAccidentalRallyStart,
                accidentalRallyStartDuration,
                setAccidentalRallyStartDuration,
                checkAccidentalPointAward,
                setCheckAccidentalPointAward,
                accidentalPointAwardDuration,
                setAccidentalPointAwardDuration,
                manageCaptainOnCourt,
                setManageCaptainOnCourt,
                keybindingsEnabled,
                setKeybindingsEnabled,
                manageDob,
                setManageDob
              }}
              displayOptions={{
                displayMode,
                setDisplayMode,
                detectedDisplayMode,
                activeDisplayMode,
                enterDisplayMode,
                exitDisplayMode
              }}
              wakeLock={{
                wakeLockActive,
                toggleWakeLock
              }}
              backup={backup}
              dashboardServer={window.electronAPI ? {
                enabled: dashboardServerEnabled,
                onToggle: () => {
                  const newValue = !dashboardServerEnabled
                  setDashboardServerEnabled(newValue)
                  localStorage.setItem('dashboardServerEnabled', String(newValue))
                },
                serverRunning: dashboardServerData.serverRunning,
                connectionUrl: dashboardServerData.connectionUrl,
                refereePin: currentMatch?.refereePin,
                dashboardCount: dashboardServerData.dashboardCount,
                refereeCount: dashboardServerData.refereeCount,
                connectedDashboards: dashboardServerData.connectedDashboards
              } : null}
            />

            {/* Interactive Guide Modal */}
            <InteractiveGuide
              open={interactiveGuideOpen}
              onClose={() => setInteractiveGuideOpen(false)}
            />

            {/* Connection Setup Modal */}
            <ConnectionSetupModal
              open={connectionSetupModal}
              onClose={() => setConnectionSetupModal(false)}
              matchId={matchId}
              refereePin={currentMatch?.refereePin}
              gameNumber={currentMatch?.gameNumber}
            />

            <StartupConnectivityModal
              open={showStartupConnectivity && !offlineMode}
              connectionStatuses={connectionStatuses}
              onDismiss={handleStartupDismiss}
              onGoOffline={handleStartupGoOffline}
            />

          </div>
        </>
      )}
    </div>
  )
}
