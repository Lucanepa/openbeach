import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from './db_beach/db_beach'
import MatchSetup, { preloadMatchSetup } from './components_beach/MatchSetup_beach'
import Scoreboard, { preloadScoreboard } from './components_beach/Scoreboard_beach'
import CoinToss from './components_beach/CoinToss_beach'
import MatchEnd, { preloadMatchEnd } from './components_beach/MatchEnd_beach'
import ManualAdjustments from './components_beach/ManualAdjustments_beach'
import InteractiveGuide from './components_beach/InteractiveGuide_beach'
import ConnectionStatus from './components_beach/ConnectionStatus_beach'
import MainHeader from './components_beach/MainHeader_beach'
import BackupTable from './components_beach/BackupTable_beach'
import HomePage from './components_beach/pages/HomePage_beach'
import HomeOptionsModal from './components_beach/options/HomeOptionsModal_beach'
import ConnectionSetupModal from './components_beach/options/ConnectionSetupModal_beach'
import StartupConnectivityModal from './components_beach/StartupConnectivityModal_beach'
import { useSyncQueue, useSyncQueueStats, checkScorerMoved, askScoringDevice, matchEndUpdateNeeded, isClosedHere, hasStoredSessionToken, noteMatchClosedOnServer } from './hooks_beach/useSyncQueue_beach'
import { isKnownClosedOnServer, isScorerMoved, takeBackScoring } from './utils_beach/matchHandover_beach'
import ScorerMovedModal from './components_beach/ScorerMovedModal_beach'
import ClosedOnServerModal from './components_beach/ClosedOnServerModal_beach'
import SelfCheckNotice from './components_beach/SelfCheckNotice_beach'
import { isStaleClosedCopy } from './utils_beach/matchReopen_beach'
import {
  BACKGROUND_HOME_MS, SERVER_CHECK_TIMEOUT_MS, checkCopiesOnServer, cleanUpDuplicateCopies, clearOpenMatch, copyState, findDuplicateCopies,
  hasOtherLocalCopy, isOpenOfficialCopy, lastActivityAt, matchGameNumber, matchToReopen, newestEventOf, noteOpenMatch, readServerMatchRows,
  runDeviceSelfCheck, setScore, trackBackground, unsentOfMatch, withinTimeout
} from './utils_beach/deviceSelfCheck_beach'
import SyncSignInBanner, { SYNC_BANNER_SPACE_VAR } from './components_beach/auth/SyncSignInBanner_beach'
import useAutoBackup from './hooks_beach/useAutoBackup_beach'
import { useDashboardServer } from './hooks_beach/useDashboardServer_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'

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
  getTestTeam2ShortName,
  refereeConnectionDefault
} from './constants_beach/testSeeds_beach'
import { apiFrom } from './lib_beach/apiClient_beach'
import { setExtId, jobsOfMatch } from './utils_beach/syncIds_beach'
import { wipeMatchEvents } from './db_beach/eventHistory_beach'
import { getCloudApiUrl, isBackendAvailable, getBackendUrl, isServedFromLocalServer, getLocalServerStatusUrl, rememberRelayWsPort, isCloudOffline, setCloudOffline, isLanBackendUrl, isRelayOriginPage, isNativeApp } from './utils_beach/backendConfig_beach'
import { useSystemBarsHidden } from './utils_beach/nativeSystemBars_beach'
import { cloudStatusFor } from './utils_beach/cloudStatus_beach'
import { isCapacitorApp, installAppLifecycle, liveOf, setLiveMatch } from './utils_beach/appLifecycle_beach'
import DesktopUpdateNotice from './components_beach/DesktopUpdateNotice_beach'
import { smallScreenGate, turningSidewaysHelps } from './utils_beach/screenGate_beach'
import { detectDisplayMode, isPhoneScreen, normaliseDisplayMode, phoneLayoutKept, readStoredDisplayMode } from './components_beach/scoreboard/phoneLayout_beach'
import RestorePreviewModal from './components_beach/RestorePreviewModal_beach'
import { scorerRelay, scorerPublisher, scorerRelayUrl, readRelayBundle, relayMatchKey, generateGamePin } from './utils_beach/relayPublisher_beach'
import { checkMatchSession, lockMatchSession, unlockMatchSession, verifyGamePin } from './utils_beach/sessionManager_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'
import { fetchMatchByPin, importMatchFromSupabase, restoreMatchFromJson, selectBackupFile, listCloudBackups, fetchCloudBackup, matchBackupFromFile } from './utils_beach/backupManager_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import CompetitionMatchPicker from './components_beach/CompetitionMatchPicker_beach'
import { COMPETITIONS_ENABLED } from './utils_beach/features_beach'
import { FileUp, House, Maximize, Search, Smartphone } from 'lucide-react'
import { Modal as KitModal, modalCancelClass, modalDangerClass } from './ui/volleyui/Modal.jsx'
import { Button } from './ui/volleyui/Button.jsx'
import { cn } from './ui/volleyui/cn.js'
import { confirmDialog, toast } from './ui/volleyui/uiStore.js'
import { DEFAULT_TEAM1_COLOUR, DEFAULT_TEAM2_COLOUR } from './utils_beach/teamColours_beach'

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
  // The home screen's matches as they were when a new test match was asked
  // for, until its Match Setup opens: the new match's 'Continue match /
  // Delete match' showed for a frame first (laptop run 2026-10-08, OB-2)
  const [homeWhilePreparing, setHomeWhilePreparing] = useState(null)
  // The match just closed from Match End (deleted): left out of the home
  // screen and the header at once, while the live queries still see it for
  // a moment (OpenVolley OV-17, laptop run 2026-10-08: one frame of its
  // 'Continue match / Delete match')
  const [closedMatchId, setClosedMatchId] = useState(null)
  // A copy closed on the server that Continue or the self-check's Show asked
  // for (ClosedOnServerModal_beach over the home screen); the open match's
  // own copy needs no id here
  const [closedCopyId, setClosedCopyId] = useState(null)
  // What the self-check found (utils_beach/deviceSelfCheck_beach), on the
  // home screen until dismissed: { closed, flagged, removed }
  const [selfCheck, setSelfCheck] = useState(null)
  // The local matches the last server check found scored here ("Scoring
  // here" on the home screen); any other open official copy is "Not
  // checked" until a check answers for it. Sorted ids.
  const [serverHere, setServerHere] = useState([])
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
  // The periodic connection check reads the latest status (it is not re-created per status)
  const syncStatusRef = useRef(syncStatus)
  syncStatusRef.current = syncStatus
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
  // Offline mode: no cloud call at all (backendConfig_beach isCloudOffline)
  const [offlineMode, setOfflineMode] = useState(() => isCloudOffline())
  const [showStartupConnectivity, setShowStartupConnectivity] = useState(() => !isCloudOffline())
  // Display mode: 'desktop' | 'tablet' | 'phone' | 'auto' (a stored
  // 'smartphone', the option's old name, is the Phone mode)
  const [displayMode, setDisplayMode] = useState(() => {
    const saved = localStorage.getItem('displayMode')
    return normaliseDisplayMode(saved) // default to auto-detect
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
    const assetsToPreload = [ballImage]

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
  // portrait under 600px = phone, <= 1024px = tablet, > 1024px = desktop
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const detected = detectDisplayMode({ width, height })

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

  // Never a copy the server has closed (isStaleClosedCopy): it is not the
  // live match, for the tray and the close / quit prompts
  const activeMatch = useLiveQuery(async () => {
    try {
      return await db.matches
        .where('status')
        .equals('live')
        .filter(m => !isStaleClosedCopy(m))
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

  // The open match's cloud block: OV_SCORER_MOVED shows ScorerMovedModal_beach
  // on every scoring screen of the match (another device scores it now, db/019)
  const openMatchBlock = useLiveQuery(async () => {
    if (!matchId) return null
    try {
      return (await db.matches.get(matchId))?.cloudBlock ?? null
    } catch {
      return null
    }
  }, [matchId])

  // A copy the server has closed (utils_beach/matchReopen_beach
  // isStaleClosedCopy): the one Continue asked for, else the open match
  // (scored here when the first OV_MATCH_CLOSED came).
  // ClosedOnServerModal_beach shows in place of its scoring screen, and goes
  // away once the copy is removed or replaced.
  const shownClosedCopy = useLiveQuery(async () => {
    const id = closedCopyId ?? matchId
    if (id == null) return null
    try {
      const m = await db.matches.get(id)
      return isStaleClosedCopy(m) ? { id: m.id, gameN: matchGameNumber(m) } : null
    } catch {
      return null
    }
  }, [closedCopyId, matchId], null)
  // the live query keeps its last answer until it has read the new id
  const closedCopy = shownClosedCopy && shownClosedCopy.id === (closedCopyId ?? matchId) ? shownClosedCopy : null
  const closedCopyOpen = matchId != null && closedCopy?.id === matchId

  // Every local match id -> whether it is a copy the server has closed, for
  // the self-check's notice while there is one
  const selfCheckShown = selfCheck != null
  const localMatchState = useLiveQuery(async () => {
    if (!selfCheckShown) return null
    try {
      return new Map((await db.matches.toArray()).map(m => [m.id, isStaleClosedCopy(m)]))
    } catch {
      return null
    }
  }, [selfCheckShown], null)

  const currentOfficialMatch = useLiveQuery(async () => {
    try {
      const matches = await db.matches.orderBy('createdAt').reverse().toArray()
      // Only consider matches that have been confirmed (matchInfoConfirmedAt set)
      // This prevents showing Continue/Delete for matches where user hasn't clicked "Create Match"
      // A copy closed on the server is always reachable (Load the official
      // version, Remove), even a restored row without matchInfoConfirmedAt
      return matches.find(m => m.test !== true && m.status !== 'final' && (m.matchInfoConfirmedAt || isStaleClosedCopy(m))) || null
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
    } else if (hasBackendUrl && isCloudOffline() && !isLanBackendUrl(getBackendUrl())) {
      // Offline mode: the cloud backend is not asked
      statuses.api = 'not_applicable'
      statuses.server = 'not_applicable'
      debugInfo.api = { status: 'not_applicable', message: 'Offline mode: the cloud backend is not asked' }
      debugInfo.server = { status: 'not_applicable', message: 'Offline mode: the cloud backend is not asked' }
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

    // The cloud row follows the sync queue's status (also between checks, below)
    const cloud = cloudStatusFor({ canUseCloud: canUseSupabase, syncStatus: syncStatusRef.current, offlineMode: isCloudOffline(), relayOrigin: isRelayOriginPage() })
    statuses.supabase = cloud.status
    debugInfo.supabase = cloud

    setConnectionStatuses(statuses)
    setConnectionDebugInfo(debugInfo)
  }, [currentMatch, serverStatus, canUseSupabase])

  // The cloud row as soon as the sync queue's status changes: the checks
  // above run every 30 s, and the first one ran before the queue's probe
  // answered (a healthy cloud showed "Offline" for 30 s)
  useEffect(() => {
    const cloud = cloudStatusFor({ canUseCloud: canUseSupabase, syncStatus, offlineMode, relayOrigin: isRelayOriginPage() })
    setConnectionStatuses(prev => (prev.supabase === cloud.status ? prev : { ...prev, supabase: cloud.status }))
    setConnectionDebugInfo(prev => ({ ...prev, supabase: cloud }))
  }, [syncStatus, offlineMode, canUseSupabase])

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

  // "Go offline" on the startup check: for this session only (the header's
  // switch is where offline mode is kept for later visits)
  const handleStartupGoOffline = useCallback(() => {
    setCloudOffline(true)
    setOfflineMode(true)
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
    // A copy the server has closed is no match being recorded: the header
    // does not say so, and New match does not wait for it
    if (currentMatch.status === 'final' || (sets.length > 0 && sets.every(s => s.finished)) || isStaleClosedCopy(currentMatch)) {
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

  // The match on the screen, for the start-up and background effects (read
  // after awaits, so never a stale render's value)
  const openMatchIdRef = useRef(matchId)
  openMatchIdRef.current = matchId
  // The start-up's one read of the reload marker (matchToReopen)
  const startupCheckRef = useRef(null)

  // Preload ball and logo images when app loads
  useEffect(() => {
    const imagesToPreload = [ballImage]

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


  // The self-check's server side (utils_beach/deviceSelfCheck_beach): only
  // online, signed in, with a cloud, and not in offline mode. Read each time
  // it runs.
  const selfCheckServer = useCallback(() => {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false
    if (!online || isCloudOffline() || !hasStoredSessionToken() || !getCloudApiUrl('/api/db')) return null
    return { readRows: readServerMatchRows, noteClosed: noteMatchClosedOnServer, scoringDevice: askScoringDevice }
  }, [])

  // What the server said, for the home screen's state of a copy
  // (deviceSelfCheck_beach copyState): the copies it found scored here are
  // "Scoring here". A check that could not ask (offline, signed out, no
  // answer) leaves the copies it covered "Not checked". only: the copies one
  // check covered (Continue: one)
  const noteServerAnswers = useCallback((r, { only = null } = {}) => {
    const covered = (id) => only == null || only.includes(id)
    setServerHere(prev => {
      const next = new Set(prev.filter(id => !covered(id)))
      if (r?.asked) for (const id of r.here || []) if (covered(id)) next.add(id)
      const sorted = [...next].sort((a, b) => a - b)
      return sorted.join(',') === prev.join(',') ? prev : sorted
    })
  }, [])

  // What a check found, for the home screen's notice; nothing found leaves
  // the notice as it is (no notice at every start when nothing is wrong)
  const showSelfCheck = useCallback((report) => {
    const found = { closed: report?.closed || [], flagged: report?.flagged || [], removed: [] }
    if (found.closed.length || found.flagged.length) setSelfCheck(found)
  }, [])

  // The self-check (utils_beach/deviceSelfCheck_beach), at start-up and back
  // from the background: copies of one match flagged, the server asked about
  // every open official copy. Never waited for, and it removes nothing.
  const runSelfCheck = useCallback((openMatchId = null) => (
    runDeviceSelfCheck({ database: db, server: selfCheckServer(), openMatchId })
      .then((report) => {
        showSelfCheck(report)
        noteServerAnswers(report)
      })
      .catch((error) => console.error('[SelfCheck] The check failed:', error))
  ), [selfCheckServer, showSelfCheck, noteServerAnswers])

  // Start-up (utils_beach/deviceSelfCheck_beach, rules 1 and 2). Opening
  // the app always lands on Home: the desktop or Android app started, a new
  // tab, the reopen after a crash or a kill. It resumed the first 'live'
  // match on the device by itself (the lowest id, closed on the server or
  // not), an ended match on Match End and a match with a roster waiting on
  // Match Setup; 2026-10-29 OpenVolley's desktop app froze on exactly such a
  // stale copy reopened at start. Home's Continue card resumes the match in
  // one tap. A reload (the sessionStorage marker of the match screen) or a
  // tab the browser discarded goes straight back to the screen it showed,
  // offline too: the update's reload, Clear cache and the error screen's
  // reload rely on landing there. Never over a match opened in the meantime.
  // The self-check runs once, in the background.
  useEffect(() => {
    let alive = true
    startupCheckRef.current ??= matchToReopen(db).catch(() => null).then((reopen) => {
      runSelfCheck(reopen?.id ?? null)
      return reopen
    })
    startupCheckRef.current.then(async (reopen) => {
      if (!alive) return
      if (!reopen) {
        if (openMatchIdRef.current == null) clearOpenMatch()
        return
      }
      if (openMatchIdRef.current != null) return
      // Match Setup and Match End open filled (OB-2)
      if (reopen.view === 'matchSetup') await preloadMatchSetup(reopen.id).catch(() => {})
      if (reopen.view === 'matchEnd') await preloadMatchEnd(reopen.id).catch(() => {})
      if (!alive || openMatchIdRef.current != null) return
      console.info(`[Start] Reloaded: back to match ${reopen.id} (${reopen.view})`)
      setMatchId(reopen.id)
      setShowMatchSetup(reopen.view === 'matchSetup')
      setShowCoinToss(reopen.view === 'coinToss')
      setShowMatchEnd(reopen.view === 'matchEnd')
    }).catch((error) => console.error('[Start] Could not reopen the match:', error))
    return () => { alive = false }
  }, [runSelfCheck])

  // The match screen on show, for a reload (rule 2): noted whenever it
  // changes, cleared when the scorer leaves it for Home (Home, Close match,
  // Delete, the background rule below). Never before the start-up read it.
  const openView = showMatchEnd || showManualAdjustments ? 'matchEnd' : showCoinToss ? 'coinToss' : showMatchSetup ? 'matchSetup' : 'scoreboard'
  const markedOpenRef = useRef(false)
  useEffect(() => {
    if (matchId != null) {
      noteOpenMatch({ id: matchId, view: openView })
      markedOpenRef.current = true
    } else if (markedOpenRef.current) {
      clearOpenMatch()
      markedOpenRef.current = false
    }
  }, [matchId, openView])

  // Back after 15 minutes or more in the background (rule 3; trackBackground
  // counts only the time the page was hidden, so a screen left on through a
  // long set break or a medical time-out is never acted on): Home with its
  // Continue card. Only the screen changes: nothing is closed, locked or
  // unlocked, set aside or deleted, and Continue opens the match where it was.
  // The self-check runs again, the server asked as on open.
  useEffect(() => trackBackground((gone) => {
    if (openMatchIdRef.current != null) {
      console.info(`[Start] Back after ${Math.round(gone / 60000)} min in the background: the home screen`)
      setMatchId(null)
      setShowMatchSetup(false)
      setShowCoinToss(false)
      setShowMatchEnd(false)
      setShowManualAdjustments(false)
    }
    runSelfCheck(null)
  }, { minHiddenMs: BACKGROUND_HOME_MS }), [runSelfCheck])

  // A roster waiting for the open match (restored from the cloud with it):
  // its Match Setup. Only for the match on the screen: on Home it opened the
  // match by itself, at start too
  useEffect(() => {
    if (!currentMatch || matchId == null || currentMatch.id !== matchId) return

    // Check if there are pending rosters
    const hasPendingTeam1Roster = currentMatch.pendingTeam1Roster !== null && currentMatch.pendingTeam1Roster !== undefined
    const hasPendingTeam2Roster = currentMatch.pendingTeam2Roster !== null && currentMatch.pendingTeam2Roster !== undefined

    // If there are pending rosters and we're not already in match setup, open it
    if ((hasPendingTeam1Roster || hasPendingTeam2Roster) && !showMatchSetup) {
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
        if (message.type === 'scorer-moved') {
          // Another device took a match over (db/019): the server says whether
          // it is this device's (ScorerMovedModal_beach), the message names no
          // device
          checkScorerMoved(message.matchId)
          return
        }
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

      // A match closed here (approved on this device, final, closed on the
      // server) only shows its Match End again: its status and the server
      // copy stay as they are (matchEndUpdateNeeded)
      const closed = isClosedHere(matchRecord)

      // Update local match status to 'ended' (may already be set by Scoreboard)
      if (!closed) await db.matches.update(cur.matchId, { status: 'ended' })

      // Only sync official matches with seed_key
      if (!isTestMatch && matchRecord?.seed_key && !closed) {
        // Build set results array
        const setResults = finishedSets
          .sort((a, b) => a.index - b.index)
          .map(s => ({ set: s.index, team1: s.team1Points, team2: s.team2Points }))

        // Determine winner
        const winner = team1SetsWon > team2SetsWon ? 'team1' : 'team2'
        const finalScore = `${team1SetsWon}-${team2SetsWon}`

        const endPayload = {
          id: matchRecord.seed_key, // Use seed_key (external_id) for Supabase lookup
          status: 'ended', // Match ended, awaiting approval
          set_results: setResults,
          winner,
          final_score: finalScore,
          sanctions: matchRecord?.sanctions || null
        }
        // Once per result: the Scoreboard's "already finished" effect can
        // call this again on every render until Match End shows
        const pendingOfMatch = await db.sync_queue.where('status').anyOf('queued', 'sending', 'error').toArray()
        if (matchEndUpdateNeeded(matchRecord, pendingOfMatch, endPayload)) {
          await db.sync_queue.add({
            resource: 'match',
            action: 'update',
            payload: endPayload,
            ts: new Date().toISOString(),
            status: 'queued'
          })
        }
      }

      // The final result stays on the relay: the referee, the livescore and
      // the LedBox keep showing it (the Scoreboard syncs the final state)

      // Show match end screen, filled at once: the scoreboard's set-end
      // screen stays until it has read the match (OV-14 in OpenBeach)
      await preloadMatchEnd(cur.matchId)
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
    // Leaving Match End too: left on, the NEXT match opened as "Match
    // complete" right after its coin toss (Match End shows while
    // showMatchEnd && matchId)
    setShowMatchEnd(false)
  }

  // Match Setup opens filled (OB-2): the scoreboard stays until it has read the match
  const openMatchSetupView = async () => {
    if (matchId) await preloadMatchSetup(matchId)
    setShowMatchSetup(true)
  }

  const openCoinTossView = () => {
    setShowMatchSetup(false)
    setShowCoinToss(true)
  }

  const returnToMatch = () => setShowMatchSetup(false)

  // A match restored or joined from the cloud: the screen its state needs.
  // Priority: finished match → MatchEnd, live with activity → Scoreboard,
  // else → Setup
  const openRestoredMatch = (newMatchId, cloudData) => {
    setMatchId(newMatchId)
    const matchStatus = cloudData.match?.status
    const hasEvents = cloudData.events && cloudData.events.length > 0
    const hasSets = cloudData.sets && cloudData.sets.length > 0
    const finishedSets = (cloudData.sets || []).filter(s => s.finished)
    const team1SetsWon = finishedSets.filter(s => (s.team1Points ?? s.team1_points ?? 0) > (s.team2Points ?? s.team2_points ?? 0)).length
    const team2SetsWon = finishedSets.filter(s => (s.team2Points ?? s.team2_points ?? 0) > (s.team1Points ?? s.team1_points ?? 0)).length
    const isMatchFinished = team1SetsWon >= 2 || team2SetsWon >= 2
    if (isMatchFinished) {
      setShowMatchSetup(false)
      setShowMatchEnd(true)
    } else if ((matchStatus === 'live' || hasEvents || hasSets) && (hasEvents || hasSets)) {
      setShowMatchEnd(false)
      setShowMatchSetup(false)
    } else {
      setShowMatchEnd(false)
      setShowMatchSetup(true)
    }
  }

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
    setShowMatchEnd(false)
  }

  // The server's copy of a match in place of this device's (Load the
  // official version, the take-back path): fetched with the game PIN this
  // device kept, imported over the local copy (its jobs set aside), then the
  // screen the loaded match needs
  const loadOfficialVersion = async (id) => {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false
    const r = await takeBackScoring(db, id, { fetchCloud: fetchMatchByPin, importCloud: importMatchFromSupabase, online })
    if (!r.ok) return { error: r.reason }
    setClosedCopyId(null)
    openRestoredMatch(r.matchId, r.cloud)
    try { window.dispatchEvent(new Event('sync-queue-write')) } catch { /* no window */ }
    return { ok: true }
  }

  // Home's Clean up (SelfCheckNotice_beach), after one question: the copies
  // of a match that hold nothing of their own go, this device only; a copy
  // that holds something stays with its own Remove
  // (utils_beach/deviceSelfCheck_beach)
  const confirmCleanUp = async ({ key, gameN, count }) => {
    const ok = await confirmDialog({
      title: t('home.selfCheck.cleanUp'),
      message: t('home.selfCheck.cleanUpConfirm', { game: gameN ?? '–', count }),
      confirmLabel: t('home.selfCheck.cleanUp'),
      cancelLabel: t('common.cancel', 'Cancel'),
      tone: 'danger'
    })
    if (!ok) return
    try {
      const { removed } = await cleanUpDuplicateCopies(db, { openMatchId: matchId, keys: [key] })
      // a copy that holds something of its own (since the check) stays, and
      // keeps its line with Remove
      const { flagged } = await findDuplicateCopies(db, { openMatchId: matchId, keys: [key] })
      setSelfCheck(prev => ({
        closed: prev?.closed || [],
        flagged: [...(prev?.flagged || []).filter(f => f.key !== key), ...flagged],
        removed: [...(prev?.removed || []), ...removed]
      }))
    } catch (error) {
      console.error('[SelfCheck] Clean up failed:', error)
    }
  }

  async function clearLocalTestData() {
    await db.transaction('rw', db.events, db.event_history, db.sets, db.matches, db.players, db.teams, async () => {
      const testMatches = await db.matches
        .filter(m => m.test === true || m.externalId === TEST_MATCH_EXTERNAL_ID)
        .toArray()
      for (const match of testMatches) {
        // a wipe, not an undo: no event history (db_beach/eventHistory_beach)
        await wipeMatchEvents(db, match.id, { dropHistory: true })
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

  // id: a given copy (the closed copy's dialog, the self-check's Remove);
  // none: the home screen's match
  async function showDeleteMatchModal(id = null) {
    const matchToDelete = id != null ? await db.matches.get(id) : (currentOfficialMatch || currentMatch)
    if (!matchToDelete) return

    const [team1, team2] = await Promise.all([
      matchToDelete.team1Id ? db.teams.get(matchToDelete.team1Id) : null,
      matchToDelete.team2Id ? db.teams.get(matchToDelete.team2Id) : null
    ])
    const matchName = `${team1?.name || 'Team 1'} vs ${team2?.name || 'Team 2'}`

    // one of two copies of the match here (utils_beach/deviceSelfCheck_beach):
    // the other copy, the match's jobs and the server's match stay
    const otherCopy = await hasOtherLocalCopy(db, matchToDelete)
    // What removing it loses: the changes of the match the server does not
    // have, unsent or set aside (deviceSelfCheck_beach unsentOfMatch). Named
    // in the dialog before Delete; nothing said when there is none. Not for
    // one of two copies: the jobs stay.
    const unsent = otherCopy || matchToDelete.test ? { changes: 0, events: 0 } : unsentOfMatch(await db.sync_queue.toArray(), matchToDelete.seed_key)

    setDeletePinInput('')
    setDeletePinError('')
    setDeleteMatchModal({
      matchName,
      matchId: matchToDelete.id,
      // A test match needs no PIN to delete (its PIN only guards its relay room)
      gamePin: matchToDelete.test ? null : (matchToDelete.gamePin || null),
      // the server keeps its closed record: only this device's copy goes
      closedOnServer: isKnownClosedOnServer(matchToDelete),
      // another device scores it: the server's match and its relay room are
      // that device's, only this device's copy goes
      moved: isScorerMoved(matchToDelete) && !isKnownClosedOnServer(matchToDelete),
      otherCopy,
      unsent
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
    // One of two copies of the match on this device (the self-check): this
    // copy's rows go, nothing more. The match's sync jobs carry its key,
    // which the other copy shares, as do its relay room and its server match.
    const otherCopy = !!matchToDelete && await hasOtherLocalCopy(db, matchToDelete)
    // Remove from this device is local only for a copy the server reported
    // closed or scored on another device (OpenVolley, the owner 2026-10-27):
    // no server delete and no relay delete-match. The server keeps the closed
    // record; a match another device scores is that device's, on the server
    // and in its relay room.
    const localOnly = !!matchToDelete && (isKnownClosedOnServer(matchToDelete) || isScorerMoved(matchToDelete))
    const shouldDeleteFromSupabase = matchToDelete && matchToDelete.status !== 'final' && matchToDelete.seed_key && !localOnly && !otherCopy
    console.debug('[App] Deleting match:', {
      matchId: matchIdToDelete,
      status: matchToDelete?.status,
      seed_key: matchToDelete?.seed_key,
      otherCopy,
      localOnly,
      shouldDeleteFromSupabase
    })

    await db.transaction('rw', db.matches, db.sets, db.events, db.event_history, db.players, db.teams, db.sync_queue, db.match_setup, async () => {

      // Delete sets
      const sets = await db.sets.where('matchId').equals(matchIdToDelete).toArray()
      if (sets.length > 0) {
        await db.sets.bulkDelete(sets.map(s => s.id))
      }

      // Delete events - use direct delete instead of bulkDelete for better reliability
      const eventsCount = await db.events.where('matchId').equals(matchIdToDelete).count()
      // a wipe, not an undo: no event history (db_beach/eventHistory_beach)
      await wipeMatchEvents(db, matchIdToDelete, { dropHistory: true })

      // Get match to find team IDs
      const match = await db.matches.get(matchIdToDelete)

      // Its team and player rows; a team row another local match still uses
      // stays with its players (two copies of one match may share one)
      for (const teamId of new Set([match?.team1Id, match?.team2Id])) {
        if (teamId == null) continue
        if (await db.matches.filter(m => m.id !== matchIdToDelete && (m.team1Id === teamId || m.team2Id === teamId)).count()) continue
        await db.players.where('teamId').equals(teamId).delete()
        await db.teams.delete(teamId)
      }

      // This match's jobs only: the queue also holds the unsent writes of
      // other matches (a match closed offline before has nothing else left on
      // the device; clearing the table lost its end, stress test 2026-10-25).
      // One of two copies leaves them to the other copy.
      const matchJobs = otherCopy ? [] : jobsOfMatch(await db.sync_queue.toArray(), match)
      if (matchJobs.length > 0) await db.sync_queue.bulkDelete(matchJobs.map(j => j.id))

      // Delete match setup draft
      await db.match_setup.clear()

      // Delete match
      await db.matches.delete(matchIdToDelete)
    })

    // Take the deleted match off the relay (its own room only; never the room
    // of a match another copy, the server's closed record or another device
    // still has)
    const deletedRelayKey = localOnly || otherCopy ? null : relayMatchKey(matchToDelete)
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
    if (closedCopyId === matchIdToDelete) setClosedCopyId(null)
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
      color: compMatch.team1_data?.color || DEFAULT_TEAM1_COLOUR,
      createdAt: new Date().toISOString()
    })
    const team2Id = await db.teams.add({
      name: compMatch.team2_data?.name || '',
      color: compMatch.team2_data?.color || DEFAULT_TEAM2_COLOUR,
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
      team1Color: compMatch.team1_data?.color || DEFAULT_TEAM1_COLOUR,
      team2Color: compMatch.team2_data?.color || DEFAULT_TEAM2_COLOUR,
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

  /**
   * "Delete the current match?" before a new one replaces it. A finished
   * match not approved yet says so: its result and signatures exist only on
   * this device until it is approved.
   */
  function askReplaceMatch() {
    if (currentMatch?.status === 'ended' && !currentMatch.approved) {
      return confirmDialog({
        title: t('app.replaceUnapprovedTitle', 'Delete the finished match?'),
        message: t('app.replaceUnapprovedBody', 'This match is finished but not approved: its result and the signatures are only on this device. To keep them, cancel, open it with Continue match and approve it. Deleting it cannot be undone.'),
        confirmLabel: t('app.replaceUnapprovedConfirm', 'Delete anyway and start new'),
        cancelLabel: t('common.cancel', 'Cancel'),
        tone: 'danger'
      })
    }
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
      await db.transaction('rw', db.matches, db.sets, db.events, db.event_history, db.players, db.teams, db.sync_queue, db.match_setup, async () => {

        // Delete sets
        await db.sets.where('matchId').equals(currentMatch.id).delete()

        // Delete events - use direct delete for reliability
        await wipeMatchEvents(db, currentMatch.id, { dropHistory: true })

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

        // This match's jobs only (the other matches' unsent writes stay). An
        // approved match keeps its own, as Close match does: approved offline
        // and replaced without Close match, its approval, last set and
        // scoresheet files never reached the cloud
        if (currentMatch.approved !== true) {
          const matchJobs = jobsOfMatch(await db.sync_queue.toArray(), currentMatch)
          if (matchJobs.length > 0) await db.sync_queue.bulkDelete(matchJobs.map(j => j.id))
        }

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
        // Its relay room is only writable by the socket that proves it
        gamePin: existingMatch?.gamePin || generateGamePin(),
        officials,
        team1CaptainSignature: 'xxxxx',
        team2CaptainSignature: 'xxxxx',
        coinTossConfirmed: false,
        test: true,
        // The referee tablet can join at once (OB-11b); a new test match over
        // an older one turns it on again. Connect tablets can turn it off.
        refereeConnectionEnabled: refereeConnectionDefault({ test: true }),
        seedKey: testSeedKey,
        externalId: TEST_MATCH_EXTERNAL_ID,
        matchInfoConfirmedAt: timestamp // Test matches are pre-configured
      }

      if (existingMatch) {
        await wipeMatchEvents(db, existingMatch.id)
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
      // Match Setup opens filled: the home screen stays until it has read
      // the test match (utils_beach/preload_beach), never 'Not set' first (OB-2)
      await preloadMatchSetup(createdMatchId)
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
    setHomeWhilePreparing({ official: notClosed(currentOfficialMatch), test: notClosed(currentTestMatch), matchStatus: shownMatchStatus, matchInfoData: shownMatchInfoData })

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
      setHomeWhilePreparing(null)
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

      // Match Setup opens filled (OB-2): read before the home screen goes
      if (!['live', 'ended', 'final'].includes(existing.status) && !isMatchSetupComplete) {
        await preloadMatchSetup(existing.id)
      }

      // Determine where to continue based on status
      // Note: status flow is live -> ended -> final (after approval)
      if (existing.status === 'live' || existing.status === 'ended' || existing.status === 'final') {
        // Check if match is finished (one team has won 2 sets: best of 3) - go to MatchEnd
        const sets = await db.sets.where('matchId').equals(existing.id).toArray()
        const finishedSets = sets.filter(s => s.finished)
        const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
        const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
        const isMatchFinished = team1SetsWon >= 2 || team2SetsWon >= 2
        // Match finished but not yet approved - go to MatchEnd, else to the scoreboard
        // 'ended' without the sets won = forfeit or stopped match (Impossibility
        // to resume): also Match End, as OpenVolley
        const toMatchEnd = ((existing.status === 'live' && isMatchFinished) || existing.status === 'ended') && !existing.approved

        // Match End opens filled: read before the home screen goes
        if (toMatchEnd) await preloadMatchEnd(existing.id)
        setMatchId(existing.id)
        setShowMatchSetup(false)
        setShowCoinToss(false)
        setShowMatchEnd(toMatchEnd)
        return
      }

      setMatchId(existing.id)
      if (isMatchSetupComplete && isCoinTossConfirmed) {
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

  // checkServer: opened from the home screen (Continue)
  async function continueMatch(matchIdParam, { checkServer = false } = {}) {
    const targetMatchId = matchIdParam || currentOfficialMatch?.id
    if (!targetMatchId) return

    try {
      // Get the match to check its status
      let match = await db.matches.get(targetMatchId)
      if (!match) return

      // From the home screen, the server is asked first, as at start-up
      // (utils_beach/deviceSelfCheck_beach): a copy it has closed meanwhile
      // opens read-only in its dialog instead of the scoring screen, and one
      // another device scores now under its ScorerMovedModal_beach. A few
      // seconds at most; never offline or signed out, where the match opens
      // at once. A later answer still marks the copy and its state on Home.
      const server = checkServer && isOpenOfficialCopy(match) ? selfCheckServer() : null
      if (server) {
        const only = [match.id]
        const asked = checkCopiesOnServer(db, server, { onlyIds: only })
        asked.then((r) => noteServerAnswers(r, { only })).catch(() => {})
        await withinTimeout(asked, SERVER_CHECK_TIMEOUT_MS)
        match = await db.matches.get(targetMatchId)
        if (!match) return
      }

      // A copy the server has closed: no session lock, no scoring screen;
      // its dialog offers the official version or removing it
      if (isStaleClosedCopy(match)) {
        setClosedCopyId(match.id)
        return
      }

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
        // Check if match is finished (one team has won 2 sets: best of 3) - go to MatchEnd
        const sets = await db.sets.where('matchId').equals(targetMatchId).toArray()
        const finishedSets = sets.filter(s => s.finished)
        const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
        const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
        const isMatchFinished = team1SetsWon >= 2 || team2SetsWon >= 2
        // 'ended' without the sets won = forfeit or stopped match (Impossibility
        // to resume): also Match End. An approved or final match is closed: its
        // Match End too (Close match), not the scoring screen (as OpenVolley)
        const closed = match.approved === true || match.status === 'approved' || match.status === 'final'
        const toMatchEnd = (match.status === 'live' && isMatchFinished) || match.status === 'ended' || closed

        // Match End opens filled: read before the home screen goes
        if (toMatchEnd) await preloadMatchEnd(targetMatchId)
        setMatchId(targetMatchId)
        setShowMatchSetup(false)
        setShowCoinToss(false)

        if (toMatchEnd) {
          // Match finished but not yet approved - go to MatchEnd
          setShowMatchEnd(true)
        } else {
          // Match in progress or already approved - go to scoreboard
          setShowMatchEnd(false)
        }
      } else {
        // Go to match setup (filled at once: OB-2)
        await preloadMatchSetup(targetMatchId)
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

  // The scoring screen in its phone layout (the display mode as the
  // Scoreboard reads it: its options write localStorage), and the match end
  // it leads to (signatures, approval): both get past the size gate on a
  // phone. It is kept on a phone turned sideways: the scoring screen stays
  // mounted under its "hold the phone upright" notice, with its dialogs and
  // countdowns.
  const phoneLayoutOn = phoneLayoutKept(readStoredDisplayMode(), viewportSize)
  const phoneScoringShown = phoneLayoutOn && onScoringScreen
  const phoneMatchEndShown = phoneLayoutOn && !!matchId && showMatchEnd && !showManualAdjustments
  // A phone with Screen mode Tablet or Desktop: the gate offers the phone layout
  const storedDisplayMode = readStoredDisplayMode()
  const gateOffersPhoneLayout = isPhoneScreen() && storedDisplayMode !== 'auto' && storedDisplayMode !== 'phone'
  // The Android app on a tablet hides the status and navigation bars on the
  // scoring screen: an 8" tablet held sideways only gets past the gate
  // without them (nativeSystemBars_beach; a no-op in a browser). The gate
  // waits while they go.
  const systemBarsGoing = useSystemBarsHidden(onScoringScreen && !phoneScoringShown && !isPhoneScreen())
  // In a browser, fullscreen gives the page the room of the browser's bars
  // (the app hides its bars itself; a phone gets the phone layout instead)
  const gateOffersFullscreen = !gateOffersPhoneLayout && !isFullscreen && !isNativeApp() &&
    !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)

  const notClosed = (m) => (m && closedMatchId != null && m.id === closedMatchId ? null : m)
  const shownCurrentMatch = notClosed(currentMatch)
  const shownMatchStatus = notClosed(matchStatus?.match) === null ? null : matchStatus
  const shownMatchInfoData = notClosed(matchInfoData?.match) === null ? null : matchInfoData
  const homeOfficialMatch = homeWhilePreparing ? homeWhilePreparing.official : notClosed(currentOfficialMatch)
  const homeTestMatch = homeWhilePreparing ? homeWhilePreparing.test : notClosed(currentTestMatch)
  // The header's match chip is held with the home screen: it went away for
  // two frames when an older test match was replaced (verification 2026-10-08)
  const headerMatchStatus = homeWhilePreparing ? homeWhilePreparing.matchStatus : shownMatchStatus

  // The self-check's notice, for what is still on the device: a closed copy
  // while it is one (loaded or removed, its line goes), two copies while both
  // are here
  const shownSelfCheck = selfCheck && localMatchState ? {
    closed: selfCheck.closed.filter(c => localMatchState.get(c.id) === true),
    flagged: selfCheck.flagged.filter(c => localMatchState.has(c.id) && localMatchState.has(c.keptId)),
    removed: selfCheck.removed
  } : null

  // Home's Continue card (HomePage_beach): the match Continue resumes, where
  // it stands (teams, set, score), when it was last saved, its state on the
  // server (deviceSelfCheck_beach copyState) and whether it holds changes
  // the server does not have yet (unsentOfMatch). Read on the home screen
  // only: its sets, events and jobs change at every rally.
  const onHome = matchId == null
  const continueTargetId = (homeOfficialMatch || homeTestMatch)?.id ?? null
  const serverHereKey = serverHere.join(',')
  const continueRead = useLiveQuery(async () => {
    if (!onHome || continueTargetId == null) return null
    try {
      const m = await db.matches.get(continueTargetId)
      if (!m) return null
      const [team1, team2, sets, newest, jobs] = await Promise.all([
        m.team1Id != null ? db.teams.get(m.team1Id) : null,
        m.team2Id != null ? db.teams.get(m.team2Id) : null,
        db.sets.where('matchId').equals(m.id).toArray(),
        newestEventOf(db, m.id),
        // only the writes unsentOfMatch counts (unsent or set aside): a long
        // offline spell leaves thousands of sent rows, re-read at every change
        m.seed_key && m.test !== true ? db.sync_queue.where('status').anyOf(['queued', 'sending', 'error', 'failed', 'superseded', 'dropped']).toArray() : []
      ])
      const here = new Set(serverHereKey ? serverHereKey.split(',').map(Number) : [])
      return {
        id: m.id,
        team1: team1?.name || null,
        team2: team2?.name || null,
        score: setScore(sets),
        lastSaved: lastActivityAt(m, newest),
        state: copyState(m, { checkedHere: here.has(m.id) }),
        unsent: unsentOfMatch(jobs, m.seed_key).changes
      }
    } catch {
      return null
    }
  }, [onHome, continueTargetId, serverHereKey], null)
  const continueInfo = continueRead && continueRead.id === continueTargetId ? continueRead : null
  const headerMatchInfoData = homeWhilePreparing ? homeWhilePreparing.matchInfoData : shownMatchInfoData

  return (
    // Every screen is on the volleyui stone page (light only), match end and
    // manual adjustments included.
    <div className={cn('app-root', 'bg-gradient-to-b from-stone-50 to-stone-100')} onClick={(e) => {
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
      {/* Minimum screen size (800×600, a tablet in either orientation) for
          the scoring screen only: below 600 px its score and Undo do not fit
          (phone landscape 844×390 hid the score). It is let through when it
          shows its phone layout (PhoneScoreboard_beach), and so is its match
          end; every other screen fits a phone (screenGate_beach). */}
      {!phoneScoringShown && !phoneMatchEndShown && !systemBarsGoing && smallScreenGate(viewportSize, { scoring: onScoringScreen }) ? (
        <div className="ov-kit flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-stone-200/70 bg-white p-8 text-center shadow-card-lg">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-600 to-red-500" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <Smartphone size={28} aria-hidden="true" />
            </div>
            <p className="text-lg font-bold leading-snug text-stone-900">
              {gateOffersPhoneLayout
                ? t('screenTooSmall.phoneTitle', 'The tablet layout needs a larger screen (minimum 800×600).')
                : t('screenTooSmall.title', 'To use this application, please use a tablet or larger screen (minimum 800×600).')}
            </p>
            <p className="mt-2 text-sm tabular-nums text-stone-500">
              {t('screenTooSmall.current', { defaultValue: 'Current: {{width}} × {{height}} px', width: viewportSize.width, height: viewportSize.height })}
            </p>
            <p className="mt-3 text-sm text-stone-600">
              {gateOffersPhoneLayout
                ? t('screenTooSmall.phoneHint', 'On a phone, the scoring screen has a layout of its own.')
                // upright where it fits sideways (an open foldable, 691×756)
                : turningSidewaysHelps(viewportSize)
                  ? t('screenTooSmall.rotateHint', 'Turn the device sideways: the scoring screen needs at least 800×600. The match is saved on this device.')
                  : t('screenTooSmall.scoringHint', 'The scoring screen needs at least 800×600: score on a tablet or a laptop. The match is saved on this device.')}
            </p>
            {/* Screen mode Tablet or Desktop on a phone: the phone layout fixes it
                (Options, where the mode is set, is not reachable from here) */}
            {gateOffersPhoneLayout && (
              <Button variant="dark" size="xl" block icon={Smartphone} onClick={() => { setDisplayMode('auto'); try { localStorage.setItem('displayMode', 'auto') } catch { /* private mode: the state still switches */ } }} className="mt-6">
                {t('screenTooSmall.usePhone', 'Use the phone layout')}
              </Button>
            )}
            {gateOffersFullscreen && (
              <>
                <Button variant="dark" size="xl" block icon={Maximize} onClick={toggleFullscreen} className="mt-6">
                  {t('screenTooSmall.enterFullscreen', 'Enter fullscreen')}
                </Button>
                <p className="mt-2 text-xs text-stone-500">
                  {t('screenTooSmall.fullscreenNote', 'Fullscreen removes the browser bars to make the most of the screen.')}
                </p>
              </>
            )}
            <Button variant={gateOffersPhoneLayout || gateOffersFullscreen ? 'secondary' : 'dark'} size="xl" block icon={House} onClick={openMatchSetup} className={gateOffersPhoneLayout || gateOffersFullscreen ? 'mt-3' : 'mt-6'}>
              {t('screenTooSmall.home', 'Back to the home screen')}
            </Button>
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
            currentMatch={shownCurrentMatch}
            matchInfoMenuOpen={matchInfoMenuOpen}
            setMatchInfoMenuOpen={setMatchInfoMenuOpen}
            matchInfoData={headerMatchInfoData}
            matchStatus={headerMatchStatus}
            currentOfficialMatch={homeOfficialMatch}
            currentTestMatch={homeTestMatch}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            offlineMode={offlineMode}
            setOfflineMode={(val) => {
              // The header switch: kept for later visits
              setCloudOffline(val, { persist: true })
              setOfflineMode(val)
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
            startCollapsed={phoneScoringShown}
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
            // The phone scoring layout fills the screen edge to edge
            padding: phoneScoringShown ? 0 : '5px',
            overflow: 'hidden'
          }}>
            <div className="panel" style={{
              flex: '1 1 auto',
              height: 'auto',
              overflowY: (matchId && !showCoinToss && !showMatchSetup && !showMatchEnd) ? 'hidden' : 'auto',
              overflowX: 'hidden',
              width: '100%',
              maxWidth: '100%',
              padding: phoneScoringShown ? 0 : '10px',
              // The sign-in banner floating at the bottom: the last action
              // (Confirm the coin toss) scrolls clear of it
              ...(phoneScoringShown ? {} : { paddingBottom: `calc(10px + var(${SYNC_BANNER_SPACE_VAR}, 0px))` }),
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
                    // The next screen opens with the match on it: the coin
                    // toss stays until it has read it (OB-3). A match ended
                    // by forfait goes to Match End (no scoreboard first).
                    const m = await db.matches.get(matchId)
                    if (m?.status === 'ended') {
                      await preloadMatchEnd(matchId)
                      setShowCoinToss(false)
                      setShowMatchEnd(true)
                      return
                    }
                    // Otherwise match status is set to 'live' by CoinToss component
                    await preloadScoreboard(matchId)
                    setShowCoinToss(false)
                  }}
                  onBack={async () => {
                    await preloadMatchSetup(matchId) // filled at once (OB-2)
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
                  onGoHome={({ closed = false } = {}) => {
                    if (closed) setClosedMatchId(matchId)
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
                    newMatchMenuOpen={newMatchMenuOpen}
                    setNewMatchMenuOpen={setNewMatchMenuOpen}
                    createNewOfficialMatch={createNewOfficialMatch}
                    createNewTestMatch={createNewTestMatch}
                    testMatchLoading={testMatchLoading}
                    currentOfficialMatch={homeOfficialMatch}
                    currentTestMatch={homeTestMatch}
                    continueMatch={(id) => continueMatch(id, { checkServer: true })}
                    continueTestMatch={continueTestMatch}
                    continueInfo={continueInfo}
                    selfCheckNotice={
                      <SelfCheckNotice
                        report={shownSelfCheck}
                        onShow={(id) => setClosedCopyId(id)}
                        onRemove={(id) => showDeleteMatchModal(id)}
                        onCleanUp={confirmCleanUp}
                        onDismiss={() => setSelfCheck(null)}
                        className="mb-4"
                      />
                    }
                    showDeleteMatchModal={showDeleteMatchModal}
                    restartTestMatch={restartTestMatch}
                    onOpenSettings={() => setHomeOptionsModal(true)}
                    onRestoreMatch={() => setRestoreMatchModal(true)}
                  />
                </>
              ) : closedCopyOpen ? (
                // Scored here when the server closed it: the scoring screen
                // goes at once (its shortcuts, live state and relay with it),
                // ClosedOnServerModal_beach below takes its place
                null
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

            {/* Closed on the server (utils_beach/matchReopen_beach
                isStaleClosedCopy): read-only, the copy is no longer scored
                or synced; Load the official version, Remove, Close */}
            {closedCopy && !showMatchEnd && !showManualAdjustments && !deleteMatchModal && !restoreMatchModal && !restorePreviewData && (
              <ClosedOnServerModal
                onLoadOfficial={() => loadOfficialVersion(closedCopy.id)}
                onRemove={() => showDeleteMatchModal(closedCopy.id)}
                onUsePin={() => {
                  setClosedCopyId(null)
                  if (closedCopyOpen) goHome()
                  setCloudBackupGameN(closedCopy.gameN != null ? String(closedCopy.gameN) : '')
                  setRestoreMatchModal(true)
                }}
                onClose={() => {
                  setClosedCopyId(null)
                  if (closedCopyOpen) goHome()
                }}
              />
            )}

            {/* Another device scores this match now (db/019): this one stops
                here until the scorer takes it back or goes home */}
            {matchId && isScorerMoved({ cloudBlock: openMatchBlock }) && (
              <ScorerMovedModal
                scorer={openMatchBlock?.scorer || null}
                closed={openMatchBlock?.closed === true}
                onTakeBack={async () => {
                  // The other device's score from the cloud first, then the claim
                  const online = typeof navigator === 'undefined' || navigator.onLine !== false
                  const r = await takeBackScoring(db, matchId, { fetchCloud: fetchMatchByPin, importCloud: importMatchFromSupabase, online })
                  if (!r.ok) return { error: r.reason }
                  openRestoredMatch(r.matchId, r.cloud)
                  try { window.dispatchEvent(new Event('sync-queue-write')) } catch { /* no window */ }
                  return { ok: true }
                }}
                onClose={goHome}
              />
            )}

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
                    {deleteMatchModal.otherCopy
                      ? t('home.deleteModal.removeCopyOnly')
                      : deleteMatchModal.closedOnServer
                        ? t('cloudBlock.removeLocalOnly')
                        : deleteMatchModal.moved
                          ? t('cloudBlock.removeMovedLocalOnly')
                          : t('home.deleteModal.body', 'This deletes all sets, events, players and team data of this match, on this device and in the cloud. It cannot be undone.')}
                  </p>

                  {/* What would be lost: the changes the server does not have */}
                  {deleteMatchModal.unsent?.changes > 0 && (
                    <div role="alert" data-testid="delete-loss-warning" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <p className="m-0 font-semibold">{t('home.deleteModal.lossTitle')}</p>
                      <ul className="my-1 list-disc pl-5">
                        <li>{t('home.deleteModal.lossChanges', { count: deleteMatchModal.unsent.changes })}</li>
                        {deleteMatchModal.unsent.events > 0 && <li>{t('home.deleteModal.lossEvents', { count: deleteMatchModal.unsent.events })}</li>}
                      </ul>
                      <p className="m-0">{t('home.deleteModal.lossEnd')}</p>
                    </div>
                  )}

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
                            // Show preview instead of immediately restoring. A
                            // whole-database export (the set-end download) and a
                            // Match End file (the ZIP's MatchData JSON) are
                            // previewed and restored as the match they hold.
                            setRestorePreviewData({ data: matchBackupFromFile(jsonData), source: 'local' })
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
                  openRestoredMatch(newMatchId, cloudData)
                } catch (err) {
                  console.error('[Restore] Failed to restore match:', err)
                  // backupManager refuses a backup of a match the server has
                  // closed before it writes anything: say so plainly
                  setRestoreError(err?.code === 'OV_MATCH_CLOSED'
                    ? t('cloudBlock.restoreRefused')
                    : (err.message || t('restorePreview.failed', 'Could not restore the match.')))
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
