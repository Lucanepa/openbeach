import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from './db_beach/db_beach'
import MatchSetup from './components_beach/MatchSetup_beach'
import Scoreboard from './components_beach/Scoreboard_beach'
import CoinToss from './components_beach/CoinToss_beach'
import MatchEnd from './components_beach/MatchEnd_beach'
import ManualAdjustments from './components_beach/ManualAdjustments_beach'
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
  isTestMatchSeedKey,
  testMatchSeedKeyFor,
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
import { isCapacitorApp, installAppLifecycle, liveOf, setLiveMatch } from './utils_beach/appLifecycle_beach'
import DesktopUpdateNotice from './components_beach/DesktopUpdateNotice_beach'
import { smallScreenGate } from './utils_beach/screenGate_beach'
import RestorePreviewModal from './components_beach/RestorePreviewModal_beach'
import { scorerRelay, scorerPublisher, scorerRelayUrl, readRelayBundle, relayMatchKey } from './utils_beach/relayPublisher_beach'
import { checkMatchSession, lockMatchSession, unlockMatchSession, verifyGamePin } from './utils_beach/sessionManager_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'
import { fetchMatchByPin, importMatchFromSupabase, restoreMatchFromJson, selectBackupFile, listCloudBackups, fetchCloudBackup } from './utils_beach/backupManager_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import CompetitionMatchPicker from './components_beach/CompetitionMatchPicker_beach'
import { COMPETITIONS_ENABLED } from './utils_beach/features_beach'
import { FileUp, House, Maximize, Search, Smartphone } from 'lucide-react'
import { Modal as KitModal, modalCancelClass, modalDangerClass } from './ui/volleyui/Modal.jsx'
import { Button } from './ui/volleyui/Button.jsx'
import { cn } from './ui/volleyui/cn.js'
import { confirmDialog, toast } from './ui/volleyui/uiStore.js'

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
  const { t } = useTranslation()
  const [matchId, setMatchId] = useState(null)
  const [showMatchSetup, setShowMatchSetup] = useState(false)
  const [showCoinToss, setShowCoinToss] = useState(false)
  const [showMatchEnd, setShowMatchEnd] = useState(false)
  const [showManualAdjustments, setShowManualAdjustments] = useState(false)
  const [deleteMatchModal, setDeleteMatchModal] = useState(null)
  const [deletePinInput, setDeletePinInput] = useState('')
  const [deletePinError, setDeletePinError] = useState('')
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

  // The desktop app (Tauri): close hides to the tray, quit asks first, the
  // tray shows tablets and a live match, and the updater starts once the page
  // has reported (utils_beach/appLifecycle_beach.js). Nothing elsewhere.
  useEffect(() => installAppLifecycle(), [])
  useEffect(() => {
    setLiveMatch(liveOf(activeMatch))
  }, [activeMatch?.status, activeMatch?.test]) // eslint-disable-line react-hooks/exhaustive-deps

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
        // This is a real confirmed match - ask first
        if (await askReplaceMatch()) await replaceCurrentMatch({ type: 'official' })
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
      setShowCompetitionPicker(false)
      if (await askReplaceMatch()) await replaceCurrentMatch({ type: 'competition', competitionMatch: compMatch })
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

  /** "Delete the current match?" before a new one replaces it. */
  function askReplaceMatch() {
    return confirmDialog({
      title: t('app.replaceMatchTitle', 'Delete the current match?'),
      message: t('app.replaceMatchBody', 'The match on this device and all its data are deleted, then the new match starts. This cannot be undone.'),
      confirmLabel: t('app.replaceMatchConfirm', 'Delete and start new'),
      cancelLabel: t('common.cancel', 'Cancel'),
      tone: 'danger'
    })
  }

  /** Delete the current match, then start the requested one. */
  async function replaceCurrentMatch(request) {

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

    if (request.type === 'official') {
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
    } else if (request.type === 'test') {
      // Create test match (reuse the existing createNewTestMatch logic)
      await createTestMatchData()
      setShowCoinToss(false) // Ensure we go to match setup, not coin toss
    } else if (request.type === 'competition' && request.competitionMatch) {
      await createMatchFromCompetition(request.competitionMatch)
    }
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
        (await db.matches.filter(m => isTestMatchSeedKey(m.seedKey)).first()) ||
        (await db.matches.filter(m => m.test === true && !m.seedKey).first())

      // This device's own relay room (testMatchSeedKeyFor), kept across restarts
      const testSeedKey = testMatchSeedKeyFor(existingMatch?.seedKey)
      if (existingMatch && existingMatch.seedKey !== testSeedKey) {
        await db.matches.update(existingMatch.id, { seedKey: testSeedKey })
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
        seedKey: testSeedKey,
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
      const ok = await confirmDialog({
        title: t('app.newTestMatchTitle', 'Start a new test match?'),
        message: t('app.newTestMatchBody', 'An official match is still recording on this device. It stays; the previous test match is deleted.'),
        confirmLabel: t('app.newTestMatchConfirm', 'Start test match'),
        cancelLabel: t('common.cancel', 'Cancel'),
        tone: 'danger'
      })
      if (!ok) return
    }

    setTestMatchLoading(true)

    try {
      // Clear previous test match locally
      await clearLocalTestData()

      // Create test match locally only - no Supabase interaction
      await createTestMatchData()
    } catch (error) {
      console.error('Failed to prepare test match:', error)
      toast.error(t('app.testMatchFailed', { error: error?.message || String(error), defaultValue: 'Could not prepare the test match: {{error}}' }))
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
      toast.info(t('app.noTestMatch', 'There is no test match. Start a new one first.'))
    }
  }

  async function restartTestMatch() {
    if (testMatchLoading) return

    // Set loading state immediately to disable buttons
    setTestMatchLoading(true)
    try {
      const ok = await confirmDialog({
        title: t('app.deleteTestMatchTitle', 'Delete the test match?'),
        message: t('app.deleteTestMatchBody', 'The test match and all its data are deleted from this device.'),
        confirmLabel: t('app.deleteTestMatchConfirm', 'Delete test match'),
        cancelLabel: t('common.cancel', 'Cancel'),
        tone: 'danger'
      })
      if (!ok) return

      // Find the test match - use toArray and filter to avoid index requirement
      const matches = await db.matches.orderBy('createdAt').reverse().toArray()
      const testMatch = matches.find(m => m.test === true && m.status !== 'final')
      if (!testMatch) {
        toast.info(t('app.noTestMatch', 'There is no test match. Start a new one first.'))
        return
      }

      // Delete all test match data
      await clearLocalTestData()

      // Clear matchId to return to home view
      setMatchId(null)
      setShowMatchSetup(false)
      setShowCoinToss(false)
      setShowManualAdjustments(false)

      toast.success(t('app.testMatchDeleted', 'Test match deleted.'))
    } catch (error) {
      console.error('Failed to delete test match:', error)
      toast.error(t('app.deleteTestMatchFailed', { error: error?.message || String(error), defaultValue: 'Could not delete the test match: {{error}}' }))
    } finally {
      setTestMatchLoading(false)
    }
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
        toast.info(t('app.useContinueTestMatch', 'This is a test match: continue it from the test match on the home screen.'))
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
      toast.error(t('app.openMatchFailed', 'Could not open the match. Please try again.'))
    }
  }

  // The scoring screen is on (not setup, coin toss, match end or manual changes)
  const onScoringScreen = !!(matchId && !showCoinToss && !showMatchSetup && !showMatchEnd && !showManualAdjustments)

  return (
    // Home, setup, coin toss and the scoring screen are restyled (volleyui,
    // light); manual adjustments and match end keep the legacy dark frame
    // until their own restyle.
    <div className={cn('app-root', !(matchId && !showCoinToss && !showMatchSetup && (showManualAdjustments || showMatchEnd)) && 'bg-gradient-to-b from-stone-50 to-stone-100')} onClick={(e) => {
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
      {/* Minimum screen size (800×600, a tablet in either orientation). In
          fullscreen the setup, coin toss and match end screens are let
          through, but never the scoring screen: below 600 px its score and
          Undo do not fit (phone landscape 844×390 hid the score). */}
      {smallScreenGate(viewportSize, { isFullscreen, scoring: onScoringScreen }) ? (
        <div className="ov-kit flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-stone-200/70 bg-white p-8 text-center shadow-card-lg">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-600 to-red-500" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <Smartphone size={28} aria-hidden="true" />
            </div>
            <p className="text-lg font-bold leading-snug text-stone-900">
              {t('screenTooSmall.title', 'To use this application, please use a tablet or larger screen (minimum 800×600).')}
            </p>
            <p className="mt-2 text-sm tabular-nums text-stone-500">
              {t('screenTooSmall.current', { defaultValue: 'Current: {{width}} × {{height}} px', width: viewportSize.width, height: viewportSize.height })}
            </p>
            {isFullscreen ? (
              <>
                <p className="mt-3 text-sm text-stone-600">
                  {t('screenTooSmall.scoringHint', 'The scoring screen needs at least 800×600: score on a tablet or a laptop. The match is saved on this device.')}
                </p>
                <Button variant="dark" size="xl" block icon={House} onClick={openMatchSetup} className="mt-6">
                  {t('screenTooSmall.home', 'Back to the home screen')}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-stone-600">
                  {t('screenTooSmall.hint', 'Try rotating your device or entering fullscreen mode.')}
                </p>
                <Button variant="dark" size="xl" block icon={Maximize} onClick={toggleFullscreen} className="mt-6">
                  {t('screenTooSmall.enterFullscreen', 'Enter fullscreen')}
                </Button>
                <p className="mt-3 text-xs text-stone-500">
                  {t('screenTooSmall.fullscreenNote', 'Fullscreen removes the browser bars to make the most of the screen.')}
                </p>
              </>
            )}
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
                  {/* desktop app: "Update x is ready" (home screen only, never during a match) */}
                  <DesktopUpdateNotice />
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

            {/* Delete Match Modal (volleyui decision dialog; above the header, like the legacy modals) */}
            {deleteMatchModal && (
              <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
                <KitModal
                  open
                  decision
                  dismissible={false}
                  size="sm"
                  onClose={cancelDeleteMatch}
                  closeLabel={t('common.close')}
                  title={t('home.deleteModal.title', { defaultValue: 'Delete «{{name}}»?', name: deleteMatchModal.matchName })}
                  footer={(
                    <>
                      <button type="button" onClick={cancelDeleteMatch} className={modalCancelClass}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" onClick={confirmDeleteMatch} className={modalDangerClass} data-testid="delete-match-confirm">
                        {t('home.deleteModal.confirm', 'Delete')}
                      </button>
                    </>
                  )}
                >
                  <p className="text-sm text-stone-600">
                    {t('home.deleteModal.body', 'This deletes all sets, events, players and team data of this match, on this device and in the cloud. It cannot be undone.')}
                  </p>

                  {/* PIN confirmation for matches with gamePin */}
                  {deleteMatchModal.gamePin && (
                    <div className="mt-4">
                      <label htmlFor="ob-delete-pin" className="mb-1.5 block text-sm font-medium text-stone-700">
                        {t('home.deleteModal.pinLabel', 'Enter the game PIN to confirm')}
                      </label>
                      <input
                        id="ob-delete-pin"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        data-autofocus
                        value={deletePinInput}
                        onChange={(e) => {
                          setDeletePinInput(e.target.value)
                          setDeletePinError('')
                        }}
                        placeholder={t('home.gamePin')}
                        aria-invalid={deletePinError ? true : undefined}
                        aria-describedby={deletePinError ? 'ob-delete-pin-error' : undefined}
                        className={cn(
                          'h-11 w-full max-w-[220px] rounded-lg border bg-white px-3 text-center font-mono text-lg font-semibold tracking-[0.3em] text-stone-900 outline-none focus:ring-2 focus:ring-red-500',
                          deletePinError ? 'border-red-400 bg-red-50' : 'border-stone-300'
                        )}
                      />
                      {deletePinError && (
                        <p id="ob-delete-pin-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                          {deletePinError}
                        </p>
                      )}
                    </div>
                  )}
                </KitModal>
              </div>
            )}

            {/* Restore Match Modal (volleyui content dialog) */}
            {restoreMatchModal && (() => {
              const closeRestore = () => {
                setRestoreMatchModal(false)
                setRestoreMatchIdInput('')
                setRestorePin('')
                setRestoreError('')
                setCloudBackups([])
                setCloudBackupPin('')
                setCloudBackupGameN('')
                setCloudBackupError('')
              }
              const searchDisabled = cloudBackupLoading || cloudBackupPin.length !== 6
              return (
                <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
                  <KitModal
                    open
                    dismissible={false}
                    size="lg"
                    layout="sections"
                    onClose={closeRestore}
                    closeLabel={t('common.close')}
                    title={t('home.restoreModal.title', 'Restore match')}
                  >
                    {/* Restore from Cloud Backup */}
                    {!offlineMode && (
                      <section className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-stone-800">{t('home.restoreModal.cloudTitle', 'From a cloud backup')}</h3>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {t('home.restoreModal.cloudHint', 'Enter the match number and the game PIN to look for cloud backups.')}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <label htmlFor="ob-restore-game-n" className="mb-1.5 block text-xs font-medium text-stone-600">
                              {t('home.restoreModal.matchNumber', 'Match number')}
                            </label>
                            <input
                              id="ob-restore-game-n"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={cloudBackupGameN}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '')
                                setCloudBackupGameN(value)
                              }}
                              placeholder="123456"
                              className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-center font-mono text-lg font-semibold tabular-nums text-stone-900 outline-none focus:ring-2 focus:ring-red-500"
                            />
                          </div>
                          <div className="min-w-0 flex-[1.5]">
                            <label htmlFor="ob-restore-pin" className="mb-1.5 block text-xs font-medium text-stone-600">
                              {t('home.gamePin')}
                            </label>
                            <input
                              id="ob-restore-pin"
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
                              className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-center font-mono text-lg font-semibold tracking-[0.3em] text-stone-900 outline-none focus:ring-2 focus:ring-red-500"
                            />
                          </div>
                        </div>
                        <Button
                          variant="dark"
                          size="xl"
                          block
                          icon={Search}
                          loading={cloudBackupLoading}
                          disabled={searchDisabled}
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
                        >
                          {t('home.restoreModal.search', 'Search cloud backups')}
                        </Button>
                        {cloudBackupError && (
                          <p role="alert" className="text-xs font-medium text-red-600">{cloudBackupError}</p>
                        )}
                        {cloudBackups.length > 0 && (
                          <div className="max-h-[300px] overflow-y-auto rounded-xl border border-stone-200">
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
                      </section>
                    )}

                    {/* Divider before the local backup */}
                    {!offlineMode && (
                      <div className="flex items-center gap-3" aria-hidden="true">
                        <div className="h-px flex-1 bg-stone-200" />
                        <span className="text-xs text-stone-500">{t('home.restoreModal.or', 'or')}</span>
                        <div className="h-px flex-1 bg-stone-200" />
                      </div>
                    )}

                    {/* Offline/File restore */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-stone-800">{t('home.restoreModal.fileTitle', 'From a backup file')}</h3>
                      <Button
                        variant="secondary"
                        size="xl"
                        block
                        icon={FileUp}
                        loading={restoreLoading}
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
                      >
                        {t('home.restoreModal.selectFile', 'Select backup file')}
                      </Button>
                      {restoreError && !restorePreviewData && (
                        <p role="alert" className="text-xs font-medium text-red-600">{restoreError}</p>
                      )}
                    </section>
                  </KitModal>
                </div>
              )
            })()}

            {/* Restore Preview (volleyui decision dialog) */}
            <RestorePreviewModal
              preview={restorePreviewData}
              loading={restoreLoading}
              error={restoreError}
              onSelectAnother={() => setRestorePreviewData(null)}
              onCancel={() => {
                setRestorePreviewData(null)
                setRestoreMatchModal(false)
                setRestoreMatchIdInput('')
                setRestorePin('')
                setCloudBackups([])
                setCloudBackupPin('')
                setCloudBackupGameN('')
                setCloudBackupError('')
              }}
              onConfirm={async () => {
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
                  setRestoreError(err.message || t('restorePreview.failed', 'Could not restore the match.'))
                } finally {
                  setRestoreLoading(false)
                }
              }}
            />

            {/* Competition Match Picker (off until the backend serves competitions) */}
            {COMPETITIONS_ENABLED && (
              <CompetitionMatchPicker
                open={showCompetitionPicker}
                onClose={() => setShowCompetitionPicker(false)}
                onSelect={loadCompetitionMatch}
              />
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
