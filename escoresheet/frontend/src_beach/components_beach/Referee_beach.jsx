import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import i18n from '../i18n'
import { getMatchData, subscribeToMatchData, listAvailableMatches, getWebSocketStatus, forceReconnect } from '../utils_beach/serverDataSync_beach'
import { createLiveStateTracker } from '../utils_beach/liveStateTracker_beach'
import { useRealtimeConnection, CONNECTION_TYPES, CONNECTION_STATUS } from '../hooks_beach/useRealtimeConnection_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { ConnectionManager } from '../utils_beach/connectionManager_beach'
import ConnectionStatus from './ConnectionStatus_beach'
import WsDebugOverlay from './WsDebugOverlay_beach'
import { db } from '../db_beach/db_beach'
import TestModeControls from './TestModeControls_beach'
import SimpleHeader from './SimpleHeader_beach'
import DonutCountdown from './DonutCountdown_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'  // Realtime only
import { apiFrom } from '../lib_beach/apiClient_beach'
import { isBackendAvailable, isVenueMode } from '../utils_beach/backendConfig_beach'
import { useSyncQueue } from '../hooks_beach/useSyncQueue_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'
import { Bell, ChevronDown, Download, Loader2, Maximize, Moon, RefreshCw, Sun, TriangleAlert, X } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { Card } from '../ui/volleyui/Card.jsx'
import { Button } from '../ui/volleyui/Button.jsx'
import { StatusPill } from '../ui/volleyui/StatusPill.jsx'
import { Modal as KitModal } from '../ui/volleyui/Modal.jsx'
import { ConnectionBanner } from '../ui/volleyui/Banner.jsx'
import { NarrowScreenOverlay } from './dashboards/EntryKit_beach.jsx'
import { HEADER_BAR, HEADER_BTN, HEADER_BTN_ON, MENU_PANEL, MENU_SUBROW, MENU_ROW_ON } from './chromeClasses_beach'
import { timeSecondsLabel } from '../ui/volleyui/format.js'
import { BRAND } from '../brand_beach'
import { useDiagCommits } from '../diagnostics_beach/commits_beach'
import { diagnosticsState, exportDiagnostics } from '../diagnostics_beach/index_beach'
import { discPaint } from '../utils_beach/teamColours_beach'
import { medicalFromAction, medicalRemaining, reconcileMedical, medicalEndInEvents, medicalTypeLabel, medicalPlayerLabel, formatDuration } from '../utils_beach/refereeMedical_beach'
import { refereeEventLabel, REFEREE_DISPLAYABLE_EVENTS, BMP_PER_SET } from '../utils_beach/refereeEventLabel_beach'

// Get current version from package.json (injected by Vite at build time)
const currentVersion = __APP_VERSION__

// Flag SVG components for language selector
const FlagGB = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="60" height="42" fill="#012169" />
    <path d="M0,0 L60,42 M60,0 L0,42" stroke="#fff" strokeWidth="7" />
    <path d="M0,0 L60,42 M60,0 L0,42" stroke="#C8102E" strokeWidth="4" clipPath="url(#gbClip)" />
    <path d="M30,0 V42 M0,21 H60" stroke="#fff" strokeWidth="12" />
    <path d="M30,0 V42 M0,21 H60" stroke="#C8102E" strokeWidth="7" />
  </svg>
)

const FlagIT = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="20" height="42" fill="#009246" />
    <rect x="20" width="20" height="42" fill="#fff" />
    <rect x="40" width="20" height="42" fill="#CE2B37" />
  </svg>
)

const FlagDE = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="60" height="14" fill="#000" />
    <rect y="14" width="60" height="14" fill="#DD0000" />
    <rect y="28" width="60" height="14" fill="#FFCE00" />
  </svg>
)

const FlagFR = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="20" height="42" fill="#002395" />
    <rect x="20" width="20" height="42" fill="#fff" />
    <rect x="40" width="20" height="42" fill="#ED2939" />
  </svg>
)

const FlagCH = () => (
  <svg width="14" height="14" viewBox="0 0 32 32" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="32" height="32" fill="#ff0000" />
    <rect x="14" y="6" width="4" height="20" fill="#fff" />
    <rect x="6" y="14" width="20" height="4" fill="#fff" />
  </svg>
)

const languages = [
  { code: 'en', Flag: FlagGB, label: 'EN' }
]

// Hook to compute synced font size for paired texts using off-screen measurement
function useSyncedFontSize(texts, containerWidth, baseFontSize, minFontSize, isSingleLine = false, maxLines = 3) {
  const [result, setResult] = useState({ fontSize: baseFontSize, maxLines: 1 })
  const measureRef = useRef(null)

  useEffect(() => {
    if (containerWidth <= 0) return

    // Create off-screen measurement element if needed
    if (!measureRef.current) {
      measureRef.current = document.createElement('div')
      measureRef.current.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;'
      document.body.appendChild(measureRef.current)
    }

    const measureEl = measureRef.current
    if (!measureEl) return

    if (isSingleLine) {
      // Single line mode: find largest font that fits all texts
      const fontSizes = []
      for (let fs = baseFontSize; fs >= minFontSize; fs -= 2) {
        fontSizes.push(fs)
      }
      if (fontSizes[fontSizes.length - 1] !== minFontSize) {
        fontSizes.push(minFontSize)
      }

      for (const fs of fontSizes) {
        let allFit = true
        for (const text of texts) {
          measureEl.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${fs}px;font-weight:700;padding:4px 18px;top:-9999px;left:-9999px;`
          measureEl.textContent = text
          if (measureEl.scrollWidth > containerWidth) {
            allFit = false
            break
          }
        }
        if (allFit) {
          setResult({ fontSize: fs, maxLines: 1 })
          return
        }
      }
      // Nothing fits, use minimum (will truncate with ellipsis)
      setResult({ fontSize: minFontSize, maxLines: 1 })
    } else {
      // Multi-line mode: try 1 line -> 2 lines -> 3 lines at each font size
      const fontSizes = [baseFontSize, Math.round(baseFontSize * 0.75), minFontSize]

      for (const fs of fontSizes) {
        for (let lines = 1; lines <= maxLines; lines++) {
          let allFit = true
          for (const text of texts) {
            measureEl.style.cssText = `position:absolute;visibility:hidden;font-size:${fs}px;font-weight:700;padding:4px 14px;line-height:1.2;word-break:break-word;width:${containerWidth}px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;top:-9999px;left:-9999px;`
            measureEl.textContent = text
            // Check if text overflows the line clamp
            const maxHeight = lines * fs * 1.2 + 8 // +8 for padding
            if (measureEl.scrollHeight > maxHeight + 2) {
              allFit = false
              break
            }
          }
          if (allFit) {
            setResult({ fontSize: fs, maxLines: lines })
            return
          }
        }
      }
      // Nothing fits, use minimum with max lines
      setResult({ fontSize: minFontSize, maxLines })
    }
  }, [texts.join('|'), containerWidth, baseFontSize, minFontSize, isSingleLine, maxLines])

  // Cleanup measurement element on unmount
  useEffect(() => {
    return () => {
      if (measureRef.current && measureRef.current.parentNode) {
        measureRef.current.parentNode.removeChild(measureRef.current)
        measureRef.current = null
      }
    }
  }, [])

  return result
}

// The realtime link may be down this long (a quick reconnect) before the
// referee is warned that the score may be out of date
const LINK_DOWN_AFTER_MS = 5000

export default function Referee({ matchId, onExit, isMasterMode }) {
  // diagnostics mode: React commits per user action (nothing while it is off)
  useDiagCommits('referee')
  const { t } = useTranslation()
  const { vmin } = useScaledLayout()
  const { showAlert } = useAlert()
  const { syncStatus, retryErrors } = useSyncQueue()
  const [refereeView, setRefereeView] = useState('2nd') // '1st' or '2nd'
  const [attentionModalOpen, setAttentionModalOpen] = useState(false)
  const lastAttentionTriggerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  // Score/countdown font from settings
  const [scoreFont, setScoreFont] = useState(() => {
    const saved = localStorage.getItem('scoreFont')
    return saved || 'default'
  })
  const getScoreFont = () => {
    const fonts = {
      'default': 'inherit',
      'orbitron': "'Orbitron', monospace",
      'roboto-mono': "'Roboto Mono', monospace",
      'jetbrains-mono': "'JetBrains Mono', monospace",
      'space-mono': "'Space Mono', monospace",
      'ibm-plex-mono': "'IBM Plex Mono', monospace"
    }
    return fonts[scoreFont] || 'inherit'
  }
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 400)
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 700)

  // Container width refs for adaptive text sizing
  const section2AContainerRef = useRef(null)
  const [section2AWidth, setSection2AWidth] = useState(150)

  // Modal states (from Scoreboard actions)
  const [timeoutModal, setTimeoutModal] = useState(null) // { team, countdown, started }
  const [showTimeoutModal, setShowTimeoutModal] = useState(false) // Modal visibility (separate from countdown state)
  const timeoutActiveRef = useRef(false) // Track if timeout is active (for closure-safe checks)
  const [ttoModal, setTtoModal] = useState(null) // { countdown, startTimestamp, initialCountdown, started }
  const ttoActiveRef = useRef(false)
  // MTO / RIT recovery time (rule 17.1.2): { kind, ritType, team, playerNumber, playerName, startTimestamp, initialCountdown, source }
  const [medicalModal, setMedicalModal] = useState(null)
  const [medicalNow, setMedicalNow] = useState(() => Date.now())
  const medicalRef = useRef(null)
  medicalRef.current = medicalModal
  // Start times of recoveries the scorer's end_medical closed: a read of the
  // events from before the end synced must not show them again
  const medicalEndedRef = useRef([])
  const [preEventPopup, setPreEventPopup] = useState(null) // { message: string }
  const prevTotalScoreRef = useRef(null)
  const prevSetIndexRef = useRef(null)

  // Connection type state (auto, supabase, websocket)
  const [connectionType] = useState(CONNECTION_TYPES.AUTO)


  // Connection state
  const [connectionStatuses, setConnectionStatuses] = useState({
    api: 'unknown',
    server: 'unknown',
    websocket: 'unknown',
    scoreboard: 'unknown',
    match: 'unknown',
    db: 'unknown'
  })
  const [connectionDebugInfo, setConnectionDebugInfo] = useState({})

  const wakeLockRef = useRef(null) // Wake lock to prevent screen sleep
  const [wakeLockActive, setWakeLockActive] = useState(false) // Track wake lock status
  const [betweenSetsCountdown, setBetweenSetsCountdown] = useState(null) // { countdown, started }
  const [showIntervalModal, setShowIntervalModal] = useState(false) // Modal visibility (separate from countdown state)
  const [lastEvent, setLastEvent] = useState(null) // { type, team, data, timestamp }
  const intervalDismissedRef = useRef(false) // Track when interval was manually dismissed
  const setIntervalDuration = 60 // 1 minute for beach volleyball (FIVB standard)
  const [peekingLineup, setPeekingLineup] = useState({ left: false, right: false }) // Track which team's lineup is being peeked

  // Reset peeking state on any mouseup/touchend (since overlay disappears when peeking)
  useEffect(() => {
    const resetPeeking = () => setPeekingLineup({ left: false, right: false })
    document.addEventListener('mouseup', resetPeeking)
    document.addEventListener('touchend', resetPeeking)
    return () => {
      document.removeEventListener('mouseup', resetPeeking)
      document.removeEventListener('touchend', resetPeeking)
    }
  }, [])

  // Track viewport size for narrow screen blocking
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Request wake lock to prevent screen from sleeping
  useEffect(() => {
    const enableNativeWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          // Release existing lock first
          if (wakeLockRef.current) {
            try { await wakeLockRef.current.release() } catch (e) { }
          }
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => {
            // Only set inactive if we're not re-acquiring
            if (!wakeLockRef.current) {
              setWakeLockActive(false)
            }
          })
          return true
        }
      } catch (err) {
      }
      return false
    }

    const handleInteraction = async () => {
      const success = await enableNativeWakeLock()
      if (success) {
      }
    }

    // Try to enable on mount
    enableNativeWakeLock()

    // Also try on user interaction (required by some browsers)
    document.addEventListener('click', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await enableNativeWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => { })
        wakeLockRef.current = null
      }
    }
  }, [])

  // Match data state
  const [data, setData] = useState(null)

  // Debounce ref to prevent flickering from rapid updates
  const lastDataUpdateRef = useRef(0)
  const pendingDataRef = useRef(null)
  const debounceTimerRef = useRef(null)
  const DATA_UPDATE_DEBOUNCE_MS = 150 // Wait 150ms before applying new data

  const lastLiveStateRef = useRef(null)
  // When the last relay bundle push was applied: a refetch started before it is older
  const lastPushAtRef = useRef(0)
  const fetchSeqRef = useRef(0)
  // Newest live state seen from any source (relay push, relay bundle, database
  // row) and the last bundle as received: a newer live state wins over an
  // older bundle's score, and an older one never replaces it (liveStateTracker_beach).
  const liveTrackerRef = useRef(null)
  if (liveTrackerRef.current === null) liveTrackerRef.current = createLiveStateTracker()
  useEffect(() => {
    liveTrackerRef.current.reset()
    lastLiveStateRef.current = null
  }, [matchId])

  // Helper function to update match data state (with debounce to reduce flickering)
  const updateMatchDataState = useCallback((incoming) => {
    if (incoming && incoming.success) {
      const result = liveTrackerRef.current.bundle(incoming)
      const sets = (result.sets || []).sort((a, b) => a.index - b.index)
      const currentSet = sets.find(s => !s.finished) || null

      const newData = {
        match: result.match,
        team1: result.team1,
        team2: result.team2,
        team1Players: (result.team1Players || []).sort((a, b) => (a.number || 0) - (b.number || 0)),
        team2Players: (result.team2Players || []).sort((a, b) => (a.number || 0) - (b.number || 0)),
        sets,
        currentSet,
        events: result.events || [],
        // A relay bundle without a live state keeps the last one (the API
        // read's), so a roster push does not blank the score / lineups
        liveState: result.liveState !== undefined ? (result.liveState || null) : lastLiveStateRef.current
      }
      lastLiveStateRef.current = newData.liveState

      const now = Date.now()
      const timeSinceLastUpdate = now - lastDataUpdateRef.current

      // If it's been long enough since last update, apply immediately
      if (timeSinceLastUpdate >= DATA_UPDATE_DEBOUNCE_MS) {
        lastDataUpdateRef.current = now
        setData(newData)
      } else {
        // Otherwise, queue the update and wait for debounce
        pendingDataRef.current = newData
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
          if (pendingDataRef.current) {
            lastDataUpdateRef.current = Date.now()
            setData(pendingDataRef.current)
            pendingDataRef.current = null
          }
        }, DATA_UPDATE_DEBOUNCE_MS - timeSinceLastUpdate)
      }
    }
  }, [])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Create mock data for master mode
  useEffect(() => {
    if (isMasterMode && !data) {
      setData({
        match: {
          id: -1,
          status: 'live',
          team1ShortName: 'T1',
          team2ShortName: 'T2',
          coinTossTeamA: 'team1',
          firstServe: 'team1'
        },
        team1: { name: 'Team 1', color: '#ef4444' },
        team2: { name: 'Team 2', color: '#3b82f6' },
        // Beach volleyball: 2 players per team
        team1Players: [
          { number: 1 }, { number: 2 }
        ],
        team2Players: [
          { number: 11 }, { number: 12 }
        ],
        sets: [{ index: 1, team1Points: 12, team2Points: 10, finished: false }],
        currentSet: { index: 1, team1Points: 12, team2Points: 10, finished: false },
        events: [
          { type: 'lineup', setIndex: 1, payload: { team: 'team1', lineup: { '1': 1, '2': 2 } } },
          { type: 'lineup', setIndex: 1, payload: { team: 'team2', lineup: { '1': 11, '2': 12 } } }
        ]
      })
    }
  }, [isMasterMode, data])

  // No heartbeat needed - Referee just listens for WebSocket updates from Scoreboard

  // Check connection statuses
  const checkConnectionStatuses = useCallback(async () => {
    const statuses = { api: 'unknown', server: 'unknown', websocket: 'unknown', scoreboard: 'unknown', match: 'unknown', db: 'unknown' }
    const debugInfo = {}

    try {
      const result = await listAvailableMatches()
      if (result.success) {
        statuses.api = 'connected'
        statuses.server = 'connected'
      } else {
        statuses.api = 'disconnected'
        statuses.server = 'disconnected'
      }
    } catch (err) {
      statuses.api = 'disconnected'
      statuses.server = 'disconnected'
    }

    statuses.scoreboard = statuses.server

    // Get WebSocket status
    if (isMasterMode) {
      statuses.websocket = 'test_mode'
    } else if (matchId) {
      statuses.websocket = getWebSocketStatus(matchId)
    } else {
      statuses.websocket = 'disconnected'
    }

    if (isMasterMode) {
      statuses.match = 'test_mode'
      debugInfo.match = { status: 'test_mode', message: 'Running in test mode' }
    } else if (matchId && data?.match) {
      statuses.match = data.match.status === 'live' ? 'live' : data.match.status === 'scheduled' ? 'scheduled' : 'final'
    } else {
      statuses.match = 'no_match'
    }

    try {
      await db.matches.count()
      statuses.db = 'connected'
    } catch (err) {
      statuses.db = 'error'
    }

    setConnectionStatuses(statuses)
    setConnectionDebugInfo(debugInfo)
  }, [matchId, data?.match, isMasterMode])

  // The check depends on the match (a new object on every point): the
  // interval reads the latest check through a ref and is set up once. With
  // the check itself as dependency it ran on every point (a /api/match/list
  // call and a test WebSocket each time, 429s from the backend).
  const checkConnectionStatusesRef = useRef(checkConnectionStatuses)
  checkConnectionStatusesRef.current = checkConnectionStatuses
  useEffect(() => {
    const run = () => checkConnectionStatusesRef.current()
    run()
    const interval = setInterval(run, 60000)
    return () => clearInterval(interval)
  }, [])

  // Track consecutive fetch failures to detect deleted matches
  const fetchFailureCountRef = useRef(0)
  const MAX_FETCH_FAILURES = 3 // After 3 consecutive failures, assume match is deleted

  // Force fetch fresh data from server
  const fetchFreshData = useCallback(async () => {
    if (isMasterMode) {
      return
    }
    if (!matchId) {
      return
    }
    const seq = ++fetchSeqRef.current
    const startedAt = Date.now()
    try {
      const result = await getMatchData(matchId)
      // A newer fetch was started, or a relay bundle push landed while this
      // one was in flight: this answer may be older than what is shown.
      if (seq !== fetchSeqRef.current || lastPushAtRef.current > startedAt) return
      if (result && result.success) {
        fetchFailureCountRef.current = 0 // Reset on success
        updateMatchDataState(result)
        console.debug('[Referee] Updated match data:', {
          currentSet: result.sets?.find(s => !s.finished)?.index,
          team1Points: result.sets?.find(s => !s.finished)?.team1Points,
          team2Points: result.sets?.find(s => !s.finished)?.team2Points
        })
      } else {
        // Match not found or fetch failed
        fetchFailureCountRef.current++
        console.warn(`[Referee] Fetch failed (${fetchFailureCountRef.current}/${MAX_FETCH_FAILURES})`)
        if (fetchFailureCountRef.current >= MAX_FETCH_FAILURES) {
          if (onExit) onExit()
        }
      }
    } catch (err) {
      fetchFailureCountRef.current++
      console.error(`[Referee] Error fetching fresh data (${fetchFailureCountRef.current}/${MAX_FETCH_FAILURES}):`, err)
      if (fetchFailureCountRef.current >= MAX_FETCH_FAILURES) {
        if (onExit) onExit()
      }
    }
  }, [matchId, updateMatchDataState, isMasterMode, onExit])

  // Handle realtime data updates
  const handleRealtimeData = useCallback((result) => {
    if (!result || !result.success) return

    const receiveTimestamp = Date.now()
    console.debug('[Referee] Received realtime data:', {
      hasteam1Team: !!result.team1,
      hasteam2Team: !!result.team2,
      setsCount: result.sets?.length,
      eventsCount: result.events?.length
    })

    // Only update if data is complete (has teams and sets)
    if (result.team1 && result.team2 && result.sets?.length > 0) {
      lastPushAtRef.current = receiveTimestamp
      updateMatchDataState(result)
    } else {
      console.debug('[Referee] Received partial data (missing teams/sets), skipping UI update')
    }
  }, [updateMatchDataState])

  // The scorer's live state from the relay (live-state-update, every point):
  // the score, sides, serve and timeouts move without waiting for the cloud
  // (a venue relay has none). The next bundle keeps it (lastLiveStateRef).
  // A late copy of an older state is dropped; a newer one also moves the
  // score of the last bundle at once (liveStateTracker_beach).
  const handleRelayLiveState = useCallback((liveState) => {
    const tracker = liveTrackerRef.current
    if (!tracker.liveState(liveState)) return
    if (tracker.lastBundle) {
      // with the bundle the scorer sends next (serve, court): one update
      tracker.hold(() => updateMatchDataState(tracker.lastBundle))
      return
    }
    lastLiveStateRef.current = tracker.newest
    setData(prev => (prev ? { ...prev, liveState: tracker.newest } : prev))
  }, [updateMatchDataState])

  // Handle realtime actions (timeout, set_end)
  const handleRealtimeAction = useCallback((action, actionData) => {
    const receiveTimestamp = Date.now()

    if (action === 'timeout') {
      console.debug('[Referee] Received timeout action:', {
        team: actionData.team,
        countdown: actionData.countdown,
        startTimestamp: actionData.startTimestamp,
        receiveTimestamp
      })
      timeoutActiveRef.current = true
      const newTimeoutModal = {
        team: actionData.team,
        countdown: actionData.countdown || 30,
        startTimestamp: actionData.startTimestamp || Date.now(), // Fallback for backward compat
        initialCountdown: actionData.countdown || 30,
        started: true
      }
      setTimeoutModal(newTimeoutModal)
      setShowTimeoutModal(true) // Show the modal overlay
    } else if (action === 'set_end') {
      console.debug('[Referee] Received set_end action:', {
        setIndex: actionData.setIndex,
        winner: actionData.winner,
        team1Points: actionData.team1Points,
        team2Points: actionData.team2Points,
        countdown: actionData.countdown,
        team1SetsWon: actionData.team1SetsWon,
        team2SetsWon: actionData.team2SetsWon
      })

      // Check if match is finished (one team won 2 sets) - don't show interval
      const isMatchFinishedNow = actionData.team1SetsWon >= 2 || actionData.team2SetsWon >= 2
      if (isMatchFinishedNow) {
        // Clear any existing interval state - full-screen match ended view will show
        setBetweenSetsCountdown(null)
        setShowIntervalModal(false)
      } else {
        setBetweenSetsCountdown({
          countdown: actionData.countdown || 60,
          startTimestamp: actionData.startTimestamp || Date.now(), // Fallback for backward compat
          initialCountdown: actionData.countdown || 60,
          started: true,
          setIndex: actionData.setIndex,
          winner: actionData.winner
        })
        setShowIntervalModal(true) // Show the modal overlay
      }
    } else if (action === 'end_timeout') {
      // Scoreboard ended the timeout - clear countdown and modal
      timeoutActiveRef.current = false
      setTimeoutModal(null)
      setShowTimeoutModal(false)
    } else if (action === 'end_interval') {
      // Scoreboard ended the set interval - clear countdown and modal
      intervalDismissedRef.current = true
      setBetweenSetsCountdown(null)
      setShowIntervalModal(false)
    } else if (action === 'tto') {
      ttoActiveRef.current = true
      setTtoModal({
        countdown: actionData.countdown || 45,
        startTimestamp: actionData.startTimestamp || Date.now(),
        initialCountdown: actionData.countdown || 45,
        started: true
      })
    } else if (action === 'end_tto') {
      ttoActiveRef.current = false
      setTtoModal(null)
    } else if (action === 'medical') {
      // MTO / RIT: 5 minutes recovery time for the player (rule 17.1.2)
      const medical = medicalFromAction(actionData)
      setMedicalModal(medical)
      if (medical) {
        setLastEvent({ type: medical.kind, team: medical.team, data: { ...actionData }, timestamp: receiveTimestamp })
      }
    } else if (action === 'end_medical') {
      // The end names the kind and the player; the type, the name and the
      // duration come from the running recovery
      const running = medicalRef.current
      if (running) medicalEndedRef.current = [...medicalEndedRef.current.slice(-9), running.startTimestamp]
      const endData = {
        ...(running ? {
          ritType: running.ritType,
          playerName: running.playerName,
          duration: Math.max(0, Math.round((receiveTimestamp - running.startTimestamp) / 1000))
        } : {}),
        ...actionData
      }
      setMedicalModal(null)
      setLastEvent({ type: 'medical_end', team: actionData?.team || null, data: endData, timestamp: receiveTimestamp })
    }
  }, [])

  // Handle match deletion - navigate back to home
  const handleMatchDeleted = useCallback(() => {
    if (onExit) {
      onExit()
    }
  }, [onExit])

  // Use realtime connection hook (handles Supabase + WebSocket with fallback)
  const {
    status: realtimeStatus,
    activeConnection: realtimeConnection,
    error: realtimeError,
    lastUpdate: realtimeLastUpdate,
    forceReconnect: realtimeReconnect
  } = useRealtimeConnection({
    matchId,
    preferredConnection: connectionType,
    onData: handleRealtimeData,
    onAction: handleRealtimeAction,
    onDeleted: handleMatchDeleted,
    enabled: !isMasterMode && !!matchId
  })

  // No link to the scoresheet: the device is offline, or no transport of the
  // realtime connection has been up for a few seconds (a quick reconnect is
  // not worth a warning). The dashboard then shows a warning: what it shows
  // may be out of date. The connection's own state decides, not the relay
  // socket: in AUTO mode the database fallback still brings the updates while
  // the relay is down.
  const [linkDown, setLinkDown] = useState(false)
  const realtimeLinkRef = useRef({ status: realtimeStatus, connection: realtimeConnection })
  realtimeLinkRef.current = { status: realtimeStatus, connection: realtimeConnection }
  // This component's own match_live_state channel (below) is subscribed
  const dbChannelUpRef = useRef(false)
  useEffect(() => {
    if (isMasterMode || !matchId) {
      setLinkDown(false)
      return undefined
    }
    let downSince = null
    const transportUp = () => {
      // The live-state channel brings the score even while the relay is down
      if (dbChannelUpRef.current) return true
      const { status, connection } = realtimeLinkRef.current
      if (status !== CONNECTION_STATUS.CONNECTED && status !== CONNECTION_STATUS.FALLBACK) return false
      // The relay as the active transport: its socket must be open right now
      if (connection === 'websocket') return getWebSocketStatus(matchId) === 'connected'
      return true
    }
    const check = () => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline || !transportUp()) {
        if (downSince === null) downSince = Date.now()
      } else {
        downSince = null
      }
      setLinkDown(offline || (downSince !== null && Date.now() - downSince >= LINK_DOWN_AFTER_MS))
    }
    check()
    const timer = setInterval(check, 2000)
    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', check)
      window.removeEventListener('offline', check)
    }
  }, [matchId, isMasterMode])

  // The relay room of the match (after the PIN step: subscribe-match carries
  // the PIN / match token, so the relay sends the full bundle). It pushes the
  // scorer's every sync (rosters, sets, events) and the match actions
  // (timeout, TTO, set end) at once; the live socket above only says
  // "something changed" and the page refetches.
  useEffect(() => {
    if (isMasterMode || !matchId) return undefined
    return subscribeToMatchData(matchId, (msg) => {
      if (!msg) return
      if (msg._action) handleRealtimeAction(msg._action, msg._actionData)
      else if (msg._liveState) handleRelayLiveState(msg._liveState)
      else if (msg.match) handleRealtimeData({ success: true, ...msg })
    })
  }, [matchId, isMasterMode, handleRealtimeAction, handleRealtimeData, handleRelayLiveState])

  // Initial data fetch when connection changes or component mounts
  useEffect(() => {
    if (!isMasterMode && matchId && realtimeStatus === CONNECTION_STATUS.CONNECTED) {
      fetchFreshData()
    }
  }, [isMasterMode, matchId, realtimeStatus, fetchFreshData])

  // Refetch data when page becomes visible (handles screen wake from sleep)
  useEffect(() => {
    if (isMasterMode || !matchId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchFreshData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [matchId, isMasterMode, fetchFreshData])

  // Track last processed event to avoid duplicates from Supabase realtime
  const lastProcessedEventRef = useRef(null)

  // Store Supabase UUID for realtime subscription (match_live_state.match_id is UUID, not seed_key)
  const [supabaseMatchUuid, setSupabaseMatchUuid] = useState(null)

  // Look up Supabase UUID from seed_key when matchId changes
  useEffect(() => {
    if (!isBackendAvailable() || !matchId) return

    const lookupUuid = async () => {
      const { data, error } = await apiFrom('matches')
        .select('id')
        .eq('external_id', matchId)
        .maybeSingle()

      if (!error && data?.id) {
        setSupabaseMatchUuid(data.id)
      } else {
        console.warn('[Referee] Could not find Supabase UUID for matchId:', matchId, error)
      }
    }

    lookupUuid()
  }, [matchId])

  // Supabase realtime subscription for live state updates (backup/alternative to WebSocket)
  useEffect(() => {
    if (!supabase || !supabaseMatchUuid || isMasterMode) return


    // Add unique ID to prevent StrictMode double-mount conflicts
    const channelId = `match_live_state:${supabaseMatchUuid}-${Date.now()}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_live_state',
          filter: `match_id=eq.${supabaseMatchUuid}`
        },
        (payload) => {
          const state = payload.new
          if (!state) return

          // Simple deduplication - only skip if exact same updated_at within 50ms
          const now = Date.now()
          const lastProcessed = lastProcessedEventRef.current
          if (lastProcessed && state.updated_at === lastProcessed.updatedAt && (now - lastProcessed.time) < 50) {
            return
          }
          lastProcessedEventRef.current = { time: now, updatedAt: state.updated_at }

          // Check for scorer attention trigger. Before the late-copy check:
          // the alarm only sets this column and keeps the row's updated_at
          // (the scorer's last key event), which the relay's live state of a
          // later rally start has already passed.
          if (state.scorer_attention_trigger && state.scorer_attention_trigger !== lastAttentionTriggerRef.current) {
            setAttentionModalOpen(true)
            lastAttentionTriggerRef.current = state.scorer_attention_trigger
            try {
              // Try to vibrate if supported
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([200, 100, 200])
              }
            } catch (e) { /* ignore */ }
          }

          // A late copy of an older state than the newest seen (the relay
          // push and the database row arrive out of order): its score,
          // timeout and interval flags are out of date, so it changes nothing.
          if (liveTrackerRef.current.isLate(state)) return

          console.debug('[Referee] Live state update:', {
            event: state.last_event_type,
            points: `${state.points_a || 0}-${state.points_b || 0}`,
            set: state.current_set,
            lineup_a: !!state.lineup_a,
            lineup_b: !!state.lineup_b
          })

          // A/B Model: Convert left/right to team1/team2 using side_a (for modal handling)
          // side_a = 'left' or 'right' indicates which side Team A is on
          const localTeamAKey = data?.match?.coinTossTeamA || 'team1'
          const sideA = state.side_a || 'left'
          const team1OnLeft = (sideA === 'left') === (localTeamAKey === 'team1')
          const getTeamFromSide = (side) => {
            if (side === 'left') return team1OnLeft ? 'team1' : 'team2'
            return team1OnLeft ? 'team2' : 'team1'
          }

          // Handle timeout start/stop based on timeout_active flag
          if (state.timeout_active) {
            // Timeout is active - show/update modal if not already active or if it's a new timeout
            const serverStartTs = state.timeout_started_at ? new Date(state.timeout_started_at).getTime() : Date.now()

            // Only update/start if not already tracking THIS timeout (compare start timestamps)
            if (!timeoutModal || Math.abs(timeoutModal.startTimestamp - serverStartTs) > 2000) {
              const team = getTeamFromSide(state.last_event_team)
              timeoutActiveRef.current = true
              setTimeoutModal({
                team,
                countdown: state.last_event_data?.duration || 30,
                startTimestamp: serverStartTs,
                initialCountdown: state.last_event_data?.duration || 30,
                started: true
              })
              setShowTimeoutModal(true)
            }
          } else if (timeoutActiveRef.current) {
            // Timeout was active but is now not active - clear modal
            timeoutActiveRef.current = false
            setTimeoutModal(null)
            setShowTimeoutModal(false)
          }

          // Handle TTO start/stop based on tto_active flag
          console.debug('[Referee TTO DEBUG] liveState received:', {
            tto_active: state.tto_active,
            tto_started_at: state.tto_started_at,
            timeout_active: state.timeout_active,
            last_event_type: state.last_event_type,
            points_a: state.points_a,
            points_b: state.points_b,
            ttoActiveRefCurrent: ttoActiveRef.current
          })
          if (state.tto_active) {
            const serverStartTs = state.tto_started_at ? new Date(state.tto_started_at).getTime() : Date.now()
            if (!ttoModal || Math.abs(ttoModal.startTimestamp - serverStartTs) > 2000) {
              ttoActiveRef.current = true
              setTtoModal({
                countdown: 45,
                startTimestamp: serverStartTs,
                initialCountdown: 45,
                started: true
              })
            }
          } else if (ttoActiveRef.current) {
            ttoActiveRef.current = false
            setTtoModal(null)
          }

          // Handle set end (1-minute interval)
          if (state.last_event_type === 'set_end' || state.set_interval_active) {
            console.debug('[Referee] Set end detected from live state:', {
              current_set: state.current_set,
              sets_won_a: state.sets_won_a,
              sets_won_b: state.sets_won_b,
              points_a: state.points_a,
              points_b: state.points_b,
              side_a: state.side_a,
              serving_team: state.serving_team,
              match_status: state.match_status,
              set_interval_active: state.set_interval_active,
              last_event_type: state.last_event_type,
              last_event_data: state.last_event_data
            })

            // Check if match is finished (one team won 3 sets) - don't show interval
            const isMatchFinishedNow = state.sets_won_a >= 3 || state.sets_won_b >= 3
            if (isMatchFinishedNow) {
              // Clear any existing interval state - full-screen match ended view will show
              setBetweenSetsCountdown(null)
              setShowIntervalModal(false)
            } else {
              const serverStartTs = state.set_interval_started_at ? new Date(state.set_interval_started_at).getTime() : Date.now()

              // Only update if not already tracking this interval
              if (!betweenSetsCountdown || Math.abs(betweenSetsCountdown.startTimestamp - serverStartTs) > 2000) {
                setBetweenSetsCountdown({
                  countdown: 60,
                  startTimestamp: serverStartTs,
                  initialCountdown: 60,
                  started: true,
                  setIndex: state.last_event_data?.setIndex || state.current_set,
                  winner: state.last_event_data?.winner
                })
                setShowIntervalModal(true)
              }
            }
          }

          // Last event for the footer (only specific event types)
          const showLastEvent = () => {
            if (state.last_event_type && REFEREE_DISPLAYABLE_EVENTS.includes(state.last_event_type)) {
              setLastEvent({
                type: state.last_event_type,
                team: state.last_event_team,
                data: state.last_event_data,
                timestamp: Date.now()
              })
            }
          }

          // Refetch on ANY change - handles points, lineups, sanctions,
          // undoes, replays, etc. This row's score, when it is newer than the
          // bundle shown (the scorer's sync can land after its live state),
          // and its last event wait for that bundle (tracker.hold): shown
          // alone, the score changed first and the serve and the court
          // ~200 ms later. An older copy read back never rolls the score back.
          const tracker = liveTrackerRef.current
          if (tracker.liveState(state) && tracker.lastBundle) {
            tracker.hold(() => {
              showLastEvent()
              updateMatchDataState(tracker.lastBundle)
            })
          } else {
            showLastEvent()
          }
          fetchFreshData()
        }
      )
      // A transport of its own: the offline warning counts it (linkDown)
      .subscribe((status) => {
        dbChannelUpRef.current = status === 'SUBSCRIBED'
      })

    return () => {
      dbChannelUpRef.current = false
      supabase.removeChannel(channel)
    }
  }, [supabaseMatchUuid, isMasterMode, data?.match?.coinTossTeamA, fetchFreshData, updateMatchDataState])

  // Handle timeout countdown timer
  useEffect(() => {
    if (!timeoutModal || !timeoutModal.started) return

    const startTimestamp = timeoutModal.startTimestamp
    const initialCountdown = timeoutModal.initialCountdown || 30

    if (timeoutModal.countdown <= 0) {
      // Don't auto-clear here, wait for tick to hit 0 to avoid rapid state flickering
      // if (timeoutModal.countdown < 0) setTimeoutModal(null)
      // return
    }

    // Update every 100ms for smooth visuals
    const timer = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTimestamp) / 1000)
      const remaining = Math.max(0, initialCountdown - elapsed)

      if (remaining <= 0) {
        // If it was already 0 for a bit, clear it
        setTimeoutModal(prev => {
          if (prev && prev.countdown === 0 && (Date.now() - (prev.startTimestamp + prev.initialCountdown * 1000)) > 2000) {
            return null
          }
          if (!prev) return null
          return { ...prev, countdown: 0 }
        })
      } else {
        setTimeoutModal(prev => {
          if (!prev || !prev.started) return null
          // Only update if the value actually changed to reduce re-renders
          if (prev.countdown === remaining) return prev
          return { ...prev, countdown: remaining }
        })
      }
    }, 100)

    return () => clearInterval(timer)
  }, [timeoutModal?.started, timeoutModal?.startTimestamp, timeoutModal?.initialCountdown])

  // Handle TTO countdown timer (45 seconds)
  useEffect(() => {
    if (!ttoModal || !ttoModal.started) return

    const startTimestamp = ttoModal.startTimestamp
    const initialCountdown = ttoModal.initialCountdown || 45

    const timer = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTimestamp) / 1000)
      const remaining = Math.max(0, initialCountdown - elapsed)

      if (remaining <= 0) {
        setTtoModal(prev => {
          if (prev && prev.countdown === 0 && (Date.now() - (prev.startTimestamp + prev.initialCountdown * 1000)) > 2000) {
            ttoActiveRef.current = false
            return null
          }
          if (!prev) return null
          return { ...prev, countdown: 0 }
        })
      } else {
        setTtoModal(prev => {
          if (!prev || !prev.started) return null
          if (prev.countdown === remaining) return prev
          return { ...prev, countdown: remaining }
        })
      }
    }, 100)

    return () => clearInterval(timer)
  }, [ttoModal?.started, ttoModal?.startTimestamp, ttoModal?.initialCountdown])

  // MTO / RIT: rebuilt from the events (reconnect, a missed action, an
  // undone start), and its countdown ticks while it runs
  useEffect(() => {
    if (!data?.events) return
    // An end the events hold now: from here on the events decide (an undone end reopens it)
    medicalEndedRef.current = medicalEndedRef.current.filter(ms => !medicalEndInEvents(data.events, ms))
    setMedicalModal(prev => reconcileMedical(prev, data.events, Date.now(), medicalEndedRef.current))
  }, [data?.events])
  useEffect(() => {
    if (!medicalModal) return undefined
    setMedicalNow(Date.now())
    const timer = setInterval(() => setMedicalNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [medicalModal])

  // Auto-dismiss preEventPopup after 3 seconds
  useEffect(() => {
    if (preEventPopup) {
      const timer = setTimeout(() => setPreEventPopup(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [preEventPopup])

  // Calculate statistics - Beach volleyball: timeouts + BMP challenges used
  const stats = useMemo(() => {
    // First, try to get stats from liveState (most accurate for Supabase-sourced data)
    if (data?.liveState) {
      const liveState = data.liveState
      const teamAIsTeam1 = data.match?.coinTossTeamA === 'team1'

      // Helper to get count from either array (new format) or number (old format)
      const getCount = (value) => {
        if (Array.isArray(value)) return value.length
        if (typeof value === 'number') return value
        return 0
      }

      return {
        team1: {
          timeouts: teamAIsTeam1 ? getCount(liveState.timeouts_a) : getCount(liveState.timeouts_b),
          challengesUsed: teamAIsTeam1 ? (liveState.challenges_used_a || 0) : (liveState.challenges_used_b || 0)
        },
        team2: {
          timeouts: teamAIsTeam1 ? getCount(liveState.timeouts_b) : getCount(liveState.timeouts_a),
          challengesUsed: teamAIsTeam1 ? (liveState.challenges_used_b || 0) : (liveState.challenges_used_a || 0)
        }
      }
    }

    // Fallback: count from events (when data comes from local IndexedDB or WebSocket)
    if (!data || !data.events || !data.currentSet) {
      return {
        team1: { timeouts: 0, challengesUsed: 0 },
        team2: { timeouts: 0, challengesUsed: 0 }
      }
    }

    const currentSetEvents = data.events.filter(
      e => (e.setIndex || 1) === (data.currentSet?.index || 1)
    )

    return {
      team1: {
        timeouts: currentSetEvents.filter(e => e.type === 'timeout' && e.payload?.team === 'team1').length,
        challengesUsed: currentSetEvents.filter(e => e.type === 'challenge_outcome' && e.payload?.team === 'team1' && e.payload?.result === 'unsuccessful').length
      },
      team2: {
        timeouts: currentSetEvents.filter(e => e.type === 'timeout' && e.payload?.team === 'team2').length,
        challengesUsed: currentSetEvents.filter(e => e.type === 'challenge_outcome' && e.payload?.team === 'team2' && e.payload?.result === 'unsuccessful').length
      }
    }
  }, [data])

  // Get lineup for current set - returns null for team if no lineup exists
  // Beach volleyball: 2 players per team (positions 1 and 2)
  // Rich format: lineup positions contain { number, isServing, hasSanction, sanctions, isCaptain }
  // Legacy format: lineup positions just contain player number
  const lineup = useMemo(() => {
    // Helper: build a fallback lineup from team players (beach volleyball: 2 players)
    // First-serving team: positions I (first server) and III (second server)
    // Second-serving team: positions II (first server) and IV (second server)
    // Enriches with serve/captain info from currentSet and match data
    const buildFallbackLineup = (players, servingTeamKey, teamKey, serverNumber, captainNumber, firstServeTeam, teamFirstServeNum) => {
      if (!players || players.length === 0) return null
      const isServingTeam = servingTeamKey === teamKey
      const thisTeamServesFirst = teamKey === firstServeTeam
      const pos1 = thisTeamServesFirst ? 'I' : 'II'
      const pos2 = thisTeamServesFirst ? 'III' : 'IV'
      const sorted = [...players].sort((a, b) => (a.number || 0) - (b.number || 0))
      let firstServer, secondServer
      if (teamFirstServeNum) {
        firstServer = sorted.find(p => String(p.number) === String(teamFirstServeNum))
        secondServer = sorted.find(p => String(p.number) !== String(teamFirstServeNum))
      } else {
        firstServer = sorted[0]
        secondServer = sorted[1]
      }
      const result = {}
      if (firstServer) {
        result[pos1] = {
          number: firstServer.number,
          isServing: isServingTeam && serverNumber != null && String(firstServer.number) === String(serverNumber),
          isCaptain: captainNumber != null && String(firstServer.number) === String(captainNumber)
        }
      }
      if (secondServer) {
        result[pos2] = {
          number: secondServer.number,
          isServing: isServingTeam && serverNumber != null && String(secondServer.number) === String(serverNumber),
          isCaptain: captainNumber != null && String(secondServer.number) === String(captainNumber)
        }
      }
      return Object.keys(result).length > 0 ? result : null
    }

    if (!data) return { team1: null, team2: null, isRichFormat: false }

    const servingTeam = data.currentSet?.servingTeam || null
    const serverNumber = data.currentSet?.serverNumber || null
    const team1Captain = data.match?.team1Captain || null
    const team2Captain = data.match?.team2Captain || null
    const firstServeTeam = data.match?.firstServe || 'team1'
    const team1FirstServe = data.match?.team1FirstServe || null
    const team2FirstServe = data.match?.team2FirstServe || null

    // PRIORITY 1: Use raw liveState lineup_a/lineup_b directly (rich format with isCaptain, sanctions)
    // The liveState is the most accurate source, written by the Scoreboard in real-time
    const liveState = data.liveState
    if (liveState?.lineup_a || liveState?.lineup_b) {
      // Determine which lineup belongs to team1 vs team2 using the A/B model
      const teamAKey = data.match?.coinTossTeamA || 'team1'
      const teamAIsTeam1 = teamAKey === 'team1'
      const team1Lineup = teamAIsTeam1 ? liveState.lineup_a : liveState.lineup_b
      const team2Lineup = teamAIsTeam1 ? liveState.lineup_b : liveState.lineup_a
      return {
        team1: team1Lineup || null,
        team2: team2Lineup || null,
        isRichFormat: true
      }
    }

    // PRIORITY 2: Use lineup events from data.events
    if (data.events?.length > 0 && data.currentSet) {
      const currentSetIndex = data.currentSet?.index || 1
      const currentSetEvents = data.events.filter(
        e => (e.setIndex || 1) === currentSetIndex
      )

      const team1LineupEvents = currentSetEvents.filter(e => e.type === 'lineup' && e.payload?.team === 'team1')
      const team2LineupEvents = currentSetEvents.filter(e => e.type === 'lineup' && e.payload?.team === 'team2')

      const latestTeam1Lineup = team1LineupEvents[team1LineupEvents.length - 1]
      const latestTeam2Lineup = team2LineupEvents[team2LineupEvents.length - 1]

      let team1LineupData = latestTeam1Lineup?.payload?.lineup
      let team2LineupData = latestTeam2Lineup?.payload?.lineup

      const isRichFormat = latestTeam1Lineup?.payload?.isRichFormat ||
        latestTeam2Lineup?.payload?.isRichFormat ||
        team1LineupData?.I?.isServing !== undefined ||
        team2LineupData?.I?.isServing !== undefined

      // Check if we're between sets
      const previousSetIndex = currentSetIndex - 1
      if (previousSetIndex >= 1) {
        const previousSet = data.sets?.find(s => s.index === previousSetIndex)
        const currentSetHasPoints = data.events?.some(e => e.type === 'point' && (e.setIndex || 1) === currentSetIndex)
        if (previousSet?.finished && !currentSetHasPoints && !team1LineupEvents.length && !team2LineupEvents.length) {
          return { team1: null, team2: null, isRichFormat: false, isBetweenSets: true }
        }
      }

      if (team1LineupData || team2LineupData) {
        // Fallback for missing team data
        if (!team1LineupData && data.team1Players?.length > 0) team1LineupData = buildFallbackLineup(data.team1Players, servingTeam, 'team1', serverNumber, team1Captain, firstServeTeam, team1FirstServe)
        if (!team2LineupData && data.team2Players?.length > 0) team2LineupData = buildFallbackLineup(data.team2Players, servingTeam, 'team2', serverNumber, team2Captain, firstServeTeam, team2FirstServe)
        return { team1: team1LineupData, team2: team2LineupData, isRichFormat: isRichFormat || true }
      }
    }

    // PRIORITY 3: Fallback from team players - enrich with serve/captain from match data
    if (data.team1Players?.length > 0 || data.team2Players?.length > 0) {
      return {
        team1: buildFallbackLineup(data.team1Players, servingTeam, 'team1', serverNumber, team1Captain, firstServeTeam, team1FirstServe),
        team2: buildFallbackLineup(data.team2Players, servingTeam, 'team2', serverNumber, team2Captain, firstServeTeam, team2FirstServe),
        isRichFormat: true
      }
    }

    return { team1: null, team2: null, isRichFormat: false }
  }, [data])

  // Calculate sets won by each team (from finished sets)
  const setsWon = useMemo(() => {
    if (!data) return { team1: 0, team2: 0 }

    const finishedSets = data.sets?.filter(s => s.finished) || []
    return {
      team1: finishedSets.filter(s => s.team1Points > s.team2Points).length,
      team2: finishedSets.filter(s => s.team2Points > s.team1Points).length
    }
  }, [data])

  // Determine who has serve
  const getCurrentServe = useMemo(() => {
    console.debug('[Referee] Calculating serve:', {
      currentSetServingTeam: data?.currentSet?.servingTeam,
      matchFirstServe: data?.match?.firstServe,
      setIndex: data?.currentSet?.index
    })
    // First priority: use servingTeam from Supabase live state (most accurate)
    if (data?.currentSet?.servingTeam) {
      return data.currentSet.servingTeam
    }

    if (!data?.currentSet || !data?.match) {
      return data?.match?.firstServe || 'team1'
    }

    const setIndex = data.currentSet.index
    const set1FirstServe = data.match.firstServe || 'team1'
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const teamBKey = data.match.coinTossTeamB || 'team2'

    // Calculate first serve for current set based on alternation pattern
    // Beach volleyball is best-of-3: Set 3 is the tie break
    let currentSetFirstServe
    if (setIndex === 3 && data.match?.set3FirstServe) {
      currentSetFirstServe = data.match.set3FirstServe === 'A' ? teamAKey : teamBKey
    } else if (setIndex === 3) {
      currentSetFirstServe = set1FirstServe
    } else {
      // Sets 1-2: odd sets (1) same as Set 1, even sets (2) opposite
      currentSetFirstServe = setIndex % 2 === 1 ? set1FirstServe : (set1FirstServe === 'team1' ? 'team2' : 'team1')
    }

    if (!data?.events || data.events.length === 0) {
      return currentSetFirstServe
    }

    const pointEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === data.currentSet.index)
      .sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })

    if (pointEvents.length === 0) {
      return currentSetFirstServe
    }

    return pointEvents[0].payload?.team || currentSetFirstServe
  }, [data?.events, data?.currentSet, data?.match])

  // Determine team labels
  const teamAKey = data?.match?.coinTossTeamA || 'team1'
  const team1Label = teamAKey === 'team1' ? 'A' : 'B'
  const team2Label = teamAKey === 'team2' ? 'A' : 'B'

  // Determine which team is on the left (from referee's perspective)
  // Uses same alternating pattern as Scoreboard: odd sets = Team A on left, even sets = Team A on right
  const team1OnLeftFor2ndRef = useMemo(() => {
    if (!data?.currentSet) return true

    // PRIORITY 1: Live state from server (Scoreboard source of truth)
    // side_a indicates which side Team A is on ('left' or 'right')
    if (data?.liveState?.side_a) {
      const sideA = data.liveState.side_a
      return sideA === 'left' ? (teamAKey === 'team1') : (teamAKey !== 'team1')
    }

    const setIndex = data.currentSet.index
    const setLeftTeamOverrides = data?.match?.setLeftTeamOverrides || {}
    // Beach volleyball is best-of-3: Set 3 is the tie break
    const is3rdSet = setIndex === 3
    const set3CourtSwitched = data?.match?.set3CourtSwitched
    const set3LeftTeam = data?.match?.set3LeftTeam

    // Determine which side Team A is on this set
    let sideA
    if (setLeftTeamOverrides[setIndex] !== undefined) {
      // Manual override for this set
      sideA = setLeftTeamOverrides[setIndex] === teamAKey ? 'left' : 'right'
    } else if (is3rdSet && set3CourtSwitched && set3LeftTeam) {
      // Set 3 (tie break) special configuration (after 8-point switch)
      sideA = set3LeftTeam === teamAKey ? 'left' : 'right'
    } else {
      // Default alternating pattern: odd sets = Team A on left, even sets = Team A on right
      sideA = setIndex % 2 === 1 ? 'left' : 'right'
    }

    // Convert sideA to team1OnLeft:
    // If sideA='left' (Team A on left), then team1 is on left only if teamAKey='team1'
    // If sideA='right' (Team A on right), then team1 is on left only if teamAKey!='team1' (i.e., Team B is on left)
    return sideA === 'left' ? (teamAKey === 'team1') : (teamAKey !== 'team1')
  }, [data?.currentSet, data?.match?.setLeftTeamOverrides, data?.match?.set3CourtSwitched, data?.match?.set3LeftTeam, teamAKey, data?.liveState?.side_a])

  const team1OnLeft = refereeView === '1st' ? !team1OnLeftFor2ndRef : team1OnLeftFor2ndRef

  const leftTeam = team1OnLeft ? 'team1' : 'team2'
  const rightTeam = team1OnLeft ? 'team2' : 'team1'
  const leftTeamData = leftTeam === 'team1' ? data?.team1 : data?.team2
  const rightTeamData = rightTeam === 'team1' ? data?.team1 : data?.team2
  const leftLabel = leftTeam === 'team1' ? team1Label : team2Label
  const rightLabel = rightTeam === 'team1' ? team1Label : team2Label
  const leftServing = getCurrentServe === leftTeam
  const rightServing = getCurrentServe === rightTeam
  const leftColor = leftTeamData?.color || (leftTeam === 'team1' ? '#ef4444' : '#3b82f6')
  const rightColor = rightTeamData?.color || (rightTeam === 'team1' ? '#ef4444' : '#3b82f6')

  // Compute team name texts for adaptive sizing
  const leftShortName = (leftTeam === 'team1' ? data?.match?.team1ShortName : data?.match?.team2ShortName) || leftTeamData?.name || 'Team'
  const rightShortName = (rightTeam === 'team1' ? data?.match?.team1ShortName : data?.match?.team2ShortName) || rightTeamData?.name || 'Team'

  // Resize observer for adaptive text container widths
  useEffect(() => {
    const updateWidths = () => {
      if (section2AContainerRef.current) {
        setSection2AWidth(section2AContainerRef.current.clientWidth)
      }
    }
    updateWidths()

    const observer = new ResizeObserver(updateWidths)
    if (section2AContainerRef.current) observer.observe(section2AContainerRef.current)

    return () => observer.disconnect()
  }, [])

  // Synced font sizes for paired team names (SECTION 2A)
  const section2AFontSize = useSyncedFontSize([leftShortName, rightShortName], section2AWidth, 28, 14, true)

  // Get team-level sanctions (formal warning, improper request, delay warning)
  // Also returns player-level sanctions (warnings, penalties, expulsions, disqualifications)

  const getTeamSanctions = useCallback((teamKey) => {
    if (!data?.events) return {
      formalWarning: false, improperRequest: false, delayWarning: false, delayPenalty: false,
      warnings: [], penalties: [], expulsions: [], disqualifications: []
    }

    const teamSanctions = data.events.filter(e =>
      e.type === 'sanction' && e.payload?.team === teamKey
    )

    // Helper to get display identifier (player number)
    const getIdentifier = (s) => {
      return s.payload?.playerNumber || s.payload?.player
    }

    // Warnings (player only, excluding team/formal warnings and delay warnings)
    const warnings = teamSanctions.filter(s => {
      const type = s.payload?.type || s.payload?.sanctionType
      const playerNum = s.payload?.playerNumber || s.payload?.player
      const playerType = s.payload?.playerType
      const hasValidTarget = playerNum && String(playerNum) !== 'D'
      return type === 'warning' &&
        hasValidTarget &&
        playerType !== 'team' && !s.payload?.isTeamWarning
    }).map(s => ({
      id: getIdentifier(s)
    }))

    // Penalties (player only, excluding delay penalties)
    const penalties = teamSanctions.filter(s => {
      const type = s.payload?.type || s.payload?.sanctionType
      const playerNum = s.payload?.playerNumber || s.payload?.player
      const hasValidTarget = playerNum && String(playerNum) !== 'D'
      return type === 'penalty' && hasValidTarget
    }).map(s => ({
      id: getIdentifier(s)
    }))

    // Expulsions (player only)
    const expulsions = teamSanctions.filter(s => {
      const type = s.payload?.type || s.payload?.sanctionType
      return type === 'expulsion'
    }).map(s => ({
      id: getIdentifier(s)
    }))

    // Disqualifications (player only)
    const disqualifications = teamSanctions.filter(s => {
      const type = s.payload?.type || s.payload?.sanctionType
      return type === 'disqualification'
    }).map(s => ({
      id: getIdentifier(s)
    }))

    return {
      // Formal warning: ANY warning to ANY player triggers this
      formalWarning: teamSanctions.some(s => {
        const type = s.payload?.type || s.payload?.sanctionType
        return type === 'warning'
      }),
      improperRequest: teamSanctions.some(s =>
        s.payload?.type === 'improper_request' || s.payload?.sanctionType === 'improper_request'
      ),
      delayWarning: teamSanctions.some(s =>
        (s.payload?.type === 'delay_warning' || s.payload?.sanctionType === 'delay_warning') ||
        ((s.payload?.type === 'warning' || s.payload?.sanctionType === 'warning') &&
          (String(s.payload?.playerNumber) === 'D' || String(s.payload?.player) === 'D'))
      ),
      delayPenalty: teamSanctions.some(s =>
        (s.payload?.type === 'delay_penalty' || s.payload?.sanctionType === 'delay_penalty') ||
        ((s.payload?.type === 'penalty' || s.payload?.sanctionType === 'penalty') &&
          (String(s.payload?.playerNumber) === 'D' || String(s.payload?.player) === 'D'))
      ),
      warnings,
      penalties,
      expulsions,
      disqualifications
    }
  }, [data?.events])

  const leftTeamSanctions = getTeamSanctions(leftTeam)
  const rightTeamSanctions = getTeamSanctions(rightTeam)

  // Get sanctions for a player
  const getPlayerSanctions = useCallback((teamKey, playerNumber) => {
    if (!data?.events || !playerNumber) return []

    return data.events.filter(e =>
      e.type === 'sanction' &&
      e.payload?.team === teamKey &&
      (String(e.payload?.player) === String(playerNumber) || String(e.payload?.playerNumber) === String(playerNumber))
    )
  }, [data?.events])

  // Helper to determine if a color is bright
  const isBrightColor = (color) => {
    if (!color) return false
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 155
  }


  // Re-enable wake lock (call this when entering fullscreen or on user interaction)
  const reEnableWakeLock = useCallback(async () => {
    // Try native Wake Lock API
    try {
      if ('wakeLock' in navigator) {
        if (wakeLockRef.current) {
          try { await wakeLockRef.current.release() } catch (e) { }
        }
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        setWakeLockActive(true)
        wakeLockRef.current.addEventListener('release', () => {
        })
        return true
      }
    } catch (err) {
    }
    return false
  }, [])

  // Toggle wake lock manually
  const toggleWakeLock = useCallback(async () => {
    if (wakeLockActive) {
      // Disable wake lock
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release()
          wakeLockRef.current = null
        } catch (e) { }
      }
      setWakeLockActive(false)
    } else {
      // Enable wake lock
      const success = await reEnableWakeLock()
      if (success) {
      } else {
        // Show visual feedback that it's "on" even if API failed
        setWakeLockActive(true)
      }
    }
  }, [wakeLockActive, reEnableWakeLock])

  // Detect iOS (Fullscreen API doesn't work on iOS Safari/Chrome)
  const isIOS = useMemo(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [])

  // Fullscreen handlers
  const toggleFullscreen = useCallback(async () => {
    // iOS doesn't support Fullscreen API
    if (isIOS) {
      if (!isFullscreen) {
        // Simulate fullscreen with CSS class
        document.body.classList.add('ios-fullscreen')
        setIsFullscreen(true)
        reEnableWakeLock()
        // Show a helpful tip
        showAlert('Tip: For true fullscreen on iOS, tap Share → Add to Home Screen, then open from there.', 'info')
      } else {
        document.body.classList.remove('ios-fullscreen')
        setIsFullscreen(false)
      }
      return
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
        // Re-enable wake lock when entering fullscreen
        setTimeout(() => reEnableWakeLock(), 500)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error)
      // Fallback: try simulated fullscreen
      if (!isFullscreen) {
        document.body.classList.add('ios-fullscreen')
        setIsFullscreen(true)
      }
    }
  }, [reEnableWakeLock, isIOS, isFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)
      // Re-enable wake lock when entering fullscreen
      if (isFs) {
        reEnableWakeLock()
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [reEnableWakeLock])

  // Periodically re-enable wake lock in fullscreen mode (every 2 minutes)
  useEffect(() => {
    if (!isFullscreen) return

    const interval = setInterval(() => {
      reEnableWakeLock()
    }, 120000) // Every 2 minutes

    return () => clearInterval(interval)
  }, [isFullscreen, reEnableWakeLock])

  // Format countdown
  // Detect if we're between sets (previous set finished but current set not started)
  const isBetweenSets = useMemo(() => {
    if (!data?.sets || !data?.set) return false

    const currentSetIndex = data.set.index
    if (currentSetIndex <= 1) return false

    const previousSet = data.sets.find(s => s.index === currentSetIndex - 1)
    if (!previousSet || !previousSet.finished) return false

    // Check if current set has started (has points or set_start event)
    const hasSetStarted = data.events?.some(e =>
      (e.type === 'point' || e.type === 'set_start') && e.setIndex === currentSetIndex
    )

    return !hasSetStarted
  }, [data?.sets, data?.set, data?.events])

  // Check if match has ended (from liveState status or sets won)
  const isMatchEnded = data?.liveState?.match_status === 'ended' ||
    (data?.liveState?.sets_won_a >= 2 || data?.liveState?.sets_won_b >= 2) ||
    (setsWon.team1 >= 2 || setsWon.team2 >= 2)

  // Check if we're in set interval (from liveState or local detection)
  // But NOT if match is already finished
  const isInSetInterval = !isMatchEnded && (data?.liveState?.set_interval_active || isBetweenSets)
  // During interval, currentSet is already the NEW set (Scoreboard creates it immediately on set_end)
  // So we should use currentSet.index directly, not add +1
  // Also check liveState.current_set which is already set to the next set index
  const nextSetIndex = isInSetInterval
    ? (data?.liveState?.current_set || data?.currentSet?.index || 1)
    : null

  // During set interval or match ended, show cleared values
  const leftLineup = (isInSetInterval || isMatchEnded) ? null : (leftTeam === 'team1' ? lineup.team1 : lineup.team2)
  const rightLineup = (isInSetInterval || isMatchEnded) ? null : (rightTeam === 'team1' ? lineup.team1 : lineup.team2)
  const leftStats = (isInSetInterval || isMatchEnded)
    ? { timeouts: 0, challengesUsed: 0 }
    : (leftTeam === 'team1' ? stats.team1 : stats.team2)
  const rightStats = (isInSetInterval || isMatchEnded)
    ? { timeouts: 0, challengesUsed: 0 }
    : (rightTeam === 'team1' ? stats.team1 : stats.team2)
  // BMP left in the set, as the scorer's BMP button shows it (two unsuccessful
  // requests per set)
  const bmpLeft = (teamStats) => Math.max(0, BMP_PER_SET - (teamStats?.challengesUsed || 0))

  // Get the last finished set's final score for display when match ends
  const lastFinishedSet = useMemo(() => {
    if (!data?.sets) return null
    const finishedSets = data.sets.filter(s => s.finished).sort((a, b) => b.index - a.index)
    return finishedSets[0] || null
  }, [data?.sets])

  // Current set points - when match ended, show last set's final score
  const leftPoints = isMatchEnded && lastFinishedSet
    ? (leftTeam === 'team1' ? lastFinishedSet.team1Points : lastFinishedSet.team2Points)
    : (leftTeam === 'team1' ? data?.currentSet?.team1Points || 0 : data?.currentSet?.team2Points || 0)
  const rightPoints = isMatchEnded && lastFinishedSet
    ? (rightTeam === 'team1' ? lastFinishedSet.team1Points : lastFinishedSet.team2Points)
    : (rightTeam === 'team1' ? data?.currentSet?.team1Points || 0 : data?.currentSet?.team2Points || 0)

  // Sets won by each side - use liveState if available (from Supabase), otherwise fall back to setsWon
  const liveStateSetsWonTeam1 = teamAKey === 'team1'
    ? (data?.liveState?.sets_won_a ?? setsWon.team1)
    : (data?.liveState?.sets_won_b ?? setsWon.team1)
  const liveStateSetsWonTeam2 = teamAKey === 'team1'
    ? (data?.liveState?.sets_won_b ?? setsWon.team2)
    : (data?.liveState?.sets_won_a ?? setsWon.team2)
  const leftSetsWon = leftTeam === 'team1' ? liveStateSetsWonTeam1 : liveStateSetsWonTeam2
  const rightSetsWon = rightTeam === 'team1' ? liveStateSetsWonTeam1 : liveStateSetsWonTeam2

  // During interval, show sets won; during play, show current set points
  const leftDisplayScore = leftPoints
  const rightDisplayScore = rightPoints
  // Display set index - during interval show the NEXT set, but never show more than Set 3 (beach is best-of-3)
  const displaySetIndex = Math.min(
    isInSetInterval ? nextSetIndex : (data?.currentSet?.index || 1),
    3
  )

  // "One point to switch" / "One point to TTO" reactive detection
  useEffect(() => {
    if (isInSetInterval || isMatchEnded || !data?.currentSet) return

    const currentSetIndex = data.currentSet.index
    const totalScore = leftPoints + rightPoints

    // Reset tracking on set change
    if (currentSetIndex !== prevSetIndexRef.current) {
      prevSetIndexRef.current = currentSetIndex
      prevTotalScoreRef.current = totalScore
      return
    }

    // Only trigger on score CHANGE (not on every liveState update)
    if (totalScore === prevTotalScoreRef.current) return
    prevTotalScoreRef.current = totalScore

    if (totalScore === 0) return

    const is3rdSet = currentSetIndex === 3
    const courtChangeInterval = is3rdSet ? 5 : 7
    const pointsToWin = is3rdSet ? 15 : 21
    const pointsUntilSwitch = courtChangeInterval - (totalScore % courtChangeInterval)

    // Don't show banner if set is about to end
    const team1Pts = data.currentSet.team1Points || 0
    const team2Pts = data.currentSet.team2Points || 0
    const maxPts = Math.max(team1Pts, team2Pts)
    const minPts = Math.min(team1Pts, team2Pts)
    const setIsEnding = (maxPts >= pointsToWin - 1 && maxPts - minPts >= 1)
    if (setIsEnding) return

    // One point to TTO: total score = 20 in Sets 1-2
    if (totalScore === 20 && currentSetIndex <= 2) {
      setPreEventPopup({ message: 'One point to TTO' })
    }
    // One point to switch (but not at 20 in sets 1-2 since that shows TTO)
    else if (pointsUntilSwitch === 1) {
      setPreEventPopup({ message: 'One point to switch' })
    }
  }, [leftPoints, rightPoints, data?.currentSet?.index, data?.currentSet?.team1Points, data?.currentSet?.team2Points, isInSetInterval, isMatchEnded])

  // Check if this is the first rally of the set (no points scored yet)
  const isFirstRally = useMemo(() => {
    if (!data?.events || !data?.set) return true
    const hasPoints = data.events.some(e => e.type === 'point' && e.setIndex === data.set.index)
    return !hasPoints
  }, [data?.events, data?.set])

  // Start between-sets countdown when we detect we're between sets
  useEffect(() => {
    // Only start countdown if between sets AND countdown hasn't been started yet (null means never started)
    // AND it wasn't manually dismissed
    if (isBetweenSets && betweenSetsCountdown === null && !intervalDismissedRef.current) {
      setBetweenSetsCountdown({
        countdown: 60,
        started: true,
        startTimestamp: Date.now(),
        initialCountdown: 60
      })
      setShowIntervalModal(true)
    } else if (!isBetweenSets) {
      // Reset to null only when no longer between sets (new set started)
      setBetweenSetsCountdown(null)
      setShowIntervalModal(false) // Hide the modal when set starts
      intervalDismissedRef.current = false // Reset dismissal flag when set starts
    }
  }, [isBetweenSets]) // Remove betweenSetsCountdown from deps to prevent restart loop

  // Handle between-sets countdown timer
  useEffect(() => {
    if (!betweenSetsCountdown || !betweenSetsCountdown.started) return

    const startTimestamp = betweenSetsCountdown.startTimestamp || Date.now()
    const initialCountdown = betweenSetsCountdown.initialCountdown || 60

    // Update every 100ms for smooth visuals
    const timer = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTimestamp) / 1000)
      const remaining = Math.max(0, initialCountdown - elapsed)

      if (remaining <= 0) {
        setBetweenSetsCountdown(prev => {
          if (prev && prev.countdown === 0 && (Date.now() - (prev.startTimestamp + prev.initialCountdown * 1000)) > 2000) {
            return prev // Keep it at 0
          }
          if (!prev) return null
          return { ...prev, countdown: 0, started: false }
        })
      } else {
        setBetweenSetsCountdown(prev => {
          if (!prev || !prev.started) return prev
          if (prev.countdown === remaining) return prev
          return { ...prev, countdown: remaining }
        })
      }
    }, 100)

    return () => clearInterval(timer)
  }, [betweenSetsCountdown?.started, betweenSetsCountdown?.startTimestamp, betweenSetsCountdown?.initialCountdown])

  // Check if match is waiting for coin toss (status is 'setup' or no data yet)
  // This must be checked BEFORE the !data return to show awaiting screen
  // A match is awaiting coin toss if: no data, status is 'setup', OR (no firstServe AND no coinTossTeamA AND not master mode AND no currentSet)
  const coinTossConfirmed = data?.match?.firstServe || data?.match?.coinTossTeamA || data?.match?.coin_toss_confirmed
  const isAwaitingCoinToss = !data || data?.match?.status === 'setup' || (!coinTossConfirmed && !isMasterMode && !data?.currentSet)

  // Show awaiting coin toss screen when connected but no match data yet
  if (isAwaitingCoinToss && !isMasterMode && realtimeStatus === CONNECTION_STATUS.CONNECTED) {
    return (
      <div style={{
        height: '100dvh', // Use dynamic viewport height (respects iOS browser chrome)
        maxHeight: '100dvh',
        width: '100vw',
        maxWidth: '800px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }} className="bg-stone-100 text-stone-800">
        {/* Header - kit bar: screen tools left, refresh centre, language / exit right */}
        <div
          className={cn('ov-kit', HEADER_BAR, 'flex items-center justify-between gap-2')}
          style={{ height: '40px', minHeight: '40px', maxHeight: '40px', padding: '0 12px' }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              className={cn(HEADER_BTN, 'w-9 px-0', isFullscreen && HEADER_BTN_ON)}
              aria-label={isFullscreen ? t('header.exitFullscreen', 'Exit fullscreen') : t('header.fullscreen', 'Fullscreen')}
              title={isFullscreen ? t('header.exitFullscreen', 'Exit fullscreen') : t('header.fullscreen', 'Fullscreen')}
            >
              <Maximize size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={toggleWakeLock}
              aria-pressed={wakeLockActive}
              className={cn(HEADER_BTN, 'w-9 px-0', wakeLockActive && HEADER_BTN_ON)}
              aria-label={t('refereeDashboard.keepScreenOn', 'Keep screen on')}
              title={wakeLockActive ? t('refereeDashboard.screenWillStayOn') : t('refereeDashboard.screenMayTurnOff')}
            >
              {wakeLockActive ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>

            <ConnectionStatus
              venueMode={isVenueMode()}
              connectionStatuses={connectionStatuses}
              connectionDebugInfo={{
                ...connectionDebugInfo,
                match: {
                  ...connectionDebugInfo?.match,
                  matchId: matchId,
                  team1: data?.team1?.name,
                  team2: data?.team2?.name
                }
              }}
              queueStats={syncStatus}
              onRetryErrors={retryErrors}
              position="right"
              size="small"
            />
          </div>

          {/* Center - Refresh Button */}
          <button
            type="button"
            onClick={fetchFreshData}
            className={HEADER_BTN}
            aria-label={t('refereeDashboard.refresh')}
            title={t('refereeDashboard.refresh')}
          >
            <RefreshCw size={14} aria-hidden="true" /> {window.innerWidth >= 500 && t('refereeDashboard.refresh')}
          </button>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setLanguageMenuOpen(!languageMenuOpen)
                }}
                aria-expanded={languageMenuOpen}
                className={cn(HEADER_BTN, 'gap-1 px-2', languageMenuOpen && 'bg-stone-100')}
                aria-label={t('header.language', 'Language')}
                title={t('header.language', 'Language')}
              >
                {(() => { const current = languages.find(l => l.code === i18n.language); return current ? <current.Flag /> : <FlagGB /> })()}
                <ChevronDown size={12} aria-hidden="true" className="text-stone-400" />
              </button>

              {/* Language Dropdown */}
              {languageMenuOpen && (
                <>
                  <div
                    onClick={() => setLanguageMenuOpen(false)}
                    className="fixed inset-0"
                    style={{ zIndex: 998 }}
                  />
                  <div className={cn('absolute right-0 top-full mt-1.5 flex min-w-[120px] flex-col', MENU_PANEL)} style={{ zIndex: 1000 }}>
                    {languages.map((lang) => (
                      <button
                        type="button"
                        key={lang.code}
                        aria-pressed={i18n.language === lang.code}
                        onClick={(e) => {
                          e.stopPropagation()
                          i18n.changeLanguage(lang.code)
                          setLanguageMenuOpen(false)
                        }}
                        className={cn(MENU_SUBROW, i18n.language === lang.code && MENU_ROW_ON)}
                      >
                        <span className="flex w-5 items-center justify-center"><lang.Flag /></span>
                        <span>{lang.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Version */}
            <span className="hidden text-[10px] tabular-nums tracking-normal text-stone-500 sm:inline">
              v{currentVersion}
            </span>
            {/* Exit */}
            <button
              type="button"
              onClick={onExit}
              className={cn(HEADER_BTN, 'w-9 border-red-200 px-0 text-red-600 hover:bg-red-50')}
              aria-label={t('refereeDashboard.exit', 'Exit')}
              title={t('refereeDashboard.exit', 'Exit')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="ov-kit flex flex-1 flex-col items-center overflow-y-auto bg-gradient-to-b from-stone-50 to-stone-100 px-4 py-6">
          <Card stack={false} className="my-auto w-full max-w-md rounded-3xl p-6 text-center shadow-card-lg sm:p-8">
            {/* Team names if available */}
            {data?.team1?.name && data?.team2?.name && (
              <p className="mb-5 text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
                {data.team1.name} <span className="font-medium text-stone-400">{t('refereeDashboard.vs', 'vs')}</span> {data.team2.name}
              </p>
            )}

            {/* Awaiting Coin Toss Message */}
            <div className="flex justify-center">
              <StatusPill tone="todo" className="px-3 py-1 text-xs">
                {t('refereeDashboard.awaitingCoinToss', 'Awaiting coin toss')}
              </StatusPill>
            </div>

            <p className="mx-auto mt-4 max-w-sm text-sm text-stone-600">
              {t('refereeDashboard.awaitingCoinTossDesc', 'The match will begin once the coin toss has been confirmed on the scoresheet.')}
            </p>

            {/* Loading indicator */}
            <Loader2 size={28} className="mx-auto mt-6 animate-spin text-stone-400" aria-label={t('common.loading', 'Loading...')} />
          </Card>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Player circle component - Beach volleyball simplified (2 players per team)
  // positionData: for rich format this is { number, isServing, hasSanction, sanctions, isCaptain }
  //               for legacy format this is just a number
  const PlayerCircle = ({ number: legacyNumber, positionData, position, team, isServing: legacyIsServing }) => {
    // Support both rich format (positionData) and legacy format (number)
    let isRichFormat = positionData && typeof positionData === 'object' && positionData.number !== undefined

    // Extract number - ensure it's always a primitive, never an object
    let number = isRichFormat ? positionData.number : (positionData || legacyNumber)

    // Extra safety: if positionData was passed as a number but we're in legacy mode,
    // but that "number" is actually an object (edge case from malformed data), handle it
    if (number && typeof number === 'object' && number.number !== undefined) {
      isRichFormat = true
      positionData = number
      number = number.number
    }

    if (!number) return null

    const teamPlayers = team === 'team1' ? data.team1Players : data.team2Players
    const player = teamPlayers?.find(p => String(p.number) === String(number))

    let shouldShowBall
    let hasWarning, hasPenalty, hasExpulsion, hasDisqualification
    let isCaptain
    const teamCaptain = team === 'team1' ? data.match?.team1Captain : data.match?.team2Captain

    if (isRichFormat) {
      shouldShowBall = !!positionData.isServing
      isCaptain = positionData.isCaptain || player?.isCaptain || player?.is_captain || player?.captain || (teamCaptain && String(teamCaptain) === String(number))
      const sanctions = positionData.sanctions || []
      hasWarning = sanctions.some(s => s.type === 'warning')
      hasPenalty = sanctions.some(s => s.type === 'penalty')
      hasExpulsion = sanctions.some(s => s.type === 'expulsion')
      hasDisqualification = sanctions.some(s => s.type === 'disqualification')
    } else {
      shouldShowBall = legacyIsServing
      const sanctions = getPlayerSanctions(team, number)
      hasWarning = sanctions.some(s => s.payload?.type === 'warning')
      hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
      hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
      hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
      isCaptain = player?.isCaptain || player?.is_captain || player?.captain || (teamCaptain && String(teamCaptain) === String(number))
    }

    // Position label — pass through as-is (I, II, III, IV)
    const posRoman = position

    // Team colour: both discs wear the shirt colour, the number near-black or
    // white, whichever reads better (outlined on mid-tone shirts), and a ring
    // of the shirt colour when the disc would melt into the sand
    // (utils_beach/teamColours_beach.js). An unreadable colour keeps the old look.
    const teamColor = team === 'team1'
      ? (data?.team1?.color || data?.match?.team1Color || '#ef4444')
      : (data?.team2?.color || data?.match?.team2Color || '#3b82f6')
    const paint = discPaint(teamColor)
    const textColor = paint?.color ?? (isBrightColor(teamColor) ? '#000' : '#fff')

    // Player name — "Fname LNAME" format (matching Scoreboard)
    const firstName = player?.firstName || player?.first_name || ''
    const lastName = player?.lastName || player?.last_name || ''
    const nameParts = []
    if (firstName) nameParts.push(firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase())
    if (lastName) nameParts.push(lastName.toUpperCase())
    const playerName = nameParts.join(' ')

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: vmin(0.5),
        flexShrink: 0
      }}>
        {/* Circle + badges wrapper */}
        <div data-player-disc={position} style={{
          position: 'relative',
          width: vmin(10.5),
          height: vmin(10.5),
          borderRadius: '50%',
          border: `${vmin(0.2)}px solid ${paint?.ring ?? 'rgba(255, 255, 255, 0.35)'}`,
          background: paint?.background ?? teamColor,
          color: textColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: vmin(6),
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.6)',
          flexShrink: 0
        }}>
          {/* Serve ball indicator */}
          {shouldShowBall && (
            <img
              src={ballImage}
              alt="Ball"
              style={{
                position: 'absolute',
                left: team === rightTeam ? `calc(100% + ${vmin(0.8)}px)` : 'auto',
                right: team === leftTeam ? `calc(100% + ${vmin(0.8)}px)` : 'auto',
                top: '50%',
                transform: 'translateY(-50%)',
                width: vmin(6),
                height: vmin(6),
                filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.5))'
              }}
            />
          )}

          {/* Top-left: Position badge (I / II / III / IV) */}
          <span style={{
            position: 'absolute',
            top: vmin(-0.6),
            left: vmin(-0.6),
            width: vmin(2.6),
            height: vmin(2.6),
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: vmin(0.6),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: vmin(1.4),
            fontWeight: 700,
            color: '#fff'
          }}>
            {posRoman}
          </span>

          {/* Bottom-left: Captain badge (C) */}
          {isCaptain && (
            <span style={{
              position: 'absolute',
              bottom: vmin(-0.6),
              left: vmin(-0.6),
              width: vmin(2.6),
              height: vmin(2.6),
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid #22c55e',
              borderRadius: vmin(0.6),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: vmin(1.4),
              fontWeight: 700,
              color: '#22c55e'
            }}>
              C
            </span>
          )}

          {/* Bottom-right: Sanction indicators */}
          {(hasWarning || hasPenalty || hasExpulsion || hasDisqualification) && (
            <div style={{
              position: 'absolute',
              bottom: vmin(-0.6),
              right: vmin(-0.4),
              display: 'flex',
              gap: 1,
              zIndex: 10
            }}>
              {hasWarning && !hasPenalty && !hasExpulsion && !hasDisqualification && (
                <div style={{ width: vmin(2.2), height: vmin(3), background: 'linear-gradient(160deg, #fde047, #facc15)', borderRadius: vmin(0.4), border: '1px solid #000' }} />
              )}
              {hasPenalty && !hasExpulsion && !hasDisqualification && (
                <div style={{ width: vmin(2.2), height: vmin(3), background: 'linear-gradient(160deg, #ef4444, #b91c1c)', borderRadius: vmin(0.4), border: '1px solid #000' }} />
              )}
              {(hasExpulsion || hasDisqualification) && (
                <div style={{ position: 'relative', width: vmin(3.5), height: vmin(3) }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: vmin(1.9), height: vmin(2.8), background: 'linear-gradient(160deg, #fde047, #facc15)', borderRadius: vmin(0.3), border: '1px solid #000', transform: 'rotate(-8deg)' }} />
                  <div style={{ position: 'absolute', right: 0, top: 0, width: vmin(1.9), height: vmin(2.8), background: 'linear-gradient(160deg, #ef4444, #b91c1c)', borderRadius: vmin(0.3), border: '1px solid #000', transform: 'rotate(8deg)' }} />
                </div>
              )}
            </div>
          )}

          {/* Player number (the outline belongs to the number alone: the
              badges stay crisp) */}
          <span data-disc-number="" style={paint?.textShadow ? { textShadow: paint.textShadow } : undefined}>{number}</span>
        </div>

        {/* Player name rectangle beneath circle */}
        {playerName && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: vmin(0.4),
            padding: `${vmin(0.15)}px ${vmin(0.8)}px`,
            fontSize: vmin(1.8),
            fontWeight: 600,
            color: '#fff',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            letterSpacing: '0.3px',
            lineHeight: 1.2
          }}>
            {playerName}
          </div>
        )}
      </div>
    )
  }

  // Check if match is finished - use isMatchEnded which includes liveState check
  const isMatchFinished = isMatchEnded

  // Match finished info - use liveState sets won for accurate data
  const matchWinner = isMatchFinished && data
    ? (liveStateSetsWonTeam1 > liveStateSetsWonTeam2
      ? (data.team1?.name || 'Team 1')
      : (data.team2?.name || 'Team 2'))
    : ''

  const matchResult = isMatchFinished
    ? `${Math.max(liveStateSetsWonTeam1, liveStateSetsWonTeam2)}:${Math.min(liveStateSetsWonTeam1, liveStateSetsWonTeam2)}`
    : ''

  // Show results when match is finished
  if (isMatchFinished) {
    return (
      <div style={{
        height: '100dvh', // Use dynamic viewport height (respects iOS browser chrome)
        maxHeight: '100dvh',
        width: '100vw',
        maxWidth: '800px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflow: 'hidden'
      }} className="bg-stone-100 text-stone-800">
        <div className="ov-kit w-full max-w-sm">
          <Card stack={false} className="rounded-3xl p-6 text-center shadow-card-lg sm:p-8">
            {/* Match Ended Banner */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              {t('refereeDashboard.matchHasEnded', 'The match has ended')}
            </p>

            {/* Winner and Result */}
            <div className="mt-4 text-center">
              <div className="mb-2 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {matchWinner}
              </div>
              <div className="text-5xl font-bold tabular-nums text-stone-900">
                {matchResult}
              </div>
            </div>

            <Button variant="secondary" size="xl" block className="mt-6" onClick={onExit}>
              {t('refereeDashboard.exit', 'Exit')}
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div data-diag="referee" style={{
      height: '100dvh', // Use dynamic viewport height (respects iOS browser chrome)
      maxHeight: '100dvh',
      width: '100vw',
      maxWidth: '800px',
      margin: '0 auto',
      // volleyui: the stone page. Team colours, the sand court, the score
      // digits, serve / captain / sanction markers and the counters keep their
      // shapes and sizes; only the neutral surfaces around them went light.
      background: 'var(--ov-page)',
      color: 'var(--ov-text)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Narrow screen blocking overlay */}
      {(viewportWidth < 357 || viewportHeight < 650) && <NarrowScreenOverlay t={t} />}

      {/* No link to the scoresheet: what is shown may be out of date */}
      {linkDown && (
        <ConnectionBanner state="offline">
          {t('refereeDashboard.linkDown', 'Offline: no connection to the scoresheet. Score and server may be out of date.')}
        </ConnectionBanner>
      )}

      {/* Debug overlay - triple-tap to show */}
      {!isMasterMode && <WsDebugOverlay matchId={matchId} />}

      {/* SECTION 1: Header - 40px */}
      <SimpleHeader
        toggleOptions={[
          { label: `1 ${t('refereeDashboard.refAbbr')}`, active: refereeView === '1st', onClick: () => setRefereeView('1st') },
          { label: `2 ${t('refereeDashboard.refAbbr')}`, active: refereeView === '2nd', onClick: () => setRefereeView('2nd') }
        ]}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        menuItems={[
          // Screen options
          { header: t('refereeDashboard.screenOptions') },
          {
            icon: wakeLockActive ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />,
            label: t('refereeDashboard.keepScreenOn'),
            onClick: toggleWakeLock,
            toggle: wakeLockActive,
            keepOpen: true
          },
          { divider: true },
          // No connection choice: OpenBeach's referee always picks its
          // connection itself (CONNECTION_TYPES are all 'auto'), so the three
          // former options showed as selected at once and did nothing.
          // Test mode indicator
          ...(isMasterMode ? [
            {
              icon: <TriangleAlert size={14} aria-hidden="true" />,
              label: t('refereeDashboard.testMode'),
              disabled: true,
              color: '#fbbf24'
            },
            { divider: true }
          ] : []),
          // Diagnostics mode on (?diag=1): the referee tablet's lines leave
          // only through this export (no Options on this screen)
          ...(diagnosticsState().on ? [
            {
              icon: <Download size={14} aria-hidden="true" />,
              label: t('options.exportDiagnostics'),
              onClick: async () => {
                const result = await exportDiagnostics().catch(() => false)
                if (result === 'empty') showAlert(t('options.diagnosticsEmpty'), 'info')
                else if (!result) showAlert(t('options.diagnosticsExportFailed'), 'error')
              }
            },
            { divider: true }
          ] : []),
          // Refresh (always visible)
          {
            icon: <RefreshCw size={14} aria-hidden="true" />,
            label: t('refereeDashboard.refresh'),
            onClick: fetchFreshData,
            color: '#3b82f6'
          },
          { divider: true },
          // Exit
          {
            icon: <X size={14} aria-hidden="true" />,
            label: t('refereeDashboard.exit'),
            onClick: onExit,
            color: '#ef4444'
          }
        ]}
      />

      {/* Main content wrapper - percentage-based heights */}
      <div data-diag="referee-content" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>

        {/* SECTION 2A: Set Counter Row - 8% */}
        <div data-diag="referee-sets" style={{ flex: '0 0 10%', padding: `${vmin(0.6)}px ${vmin(1.2)}px`, background: 'var(--ov-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ov-hairline)', width: '100%', minHeight: 0, overflow: 'hidden' }}>
          {/* Left: Team Name (centered in its space) + A/B */}
          <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', gap: vmin(1.2), minWidth: 0 }}>
            <div ref={section2AContainerRef} style={{ flex: '1 1 0', display: 'flex', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
              <div style={{
                fontSize: `${section2AFontSize.fontSize}px`,
                fontWeight: 700,
                background: leftColor,
                color: isBrightColor(leftColor) ? '#000' : '#fff',
                boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)',
                padding: `${vmin(0.6)}px ${vmin(1.5)}px`,
                borderRadius: vmin(0.6),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%'
              }}>
                {leftShortName}
              </div>
            </div>
            <div style={{ padding: `${vmin(0.6)}px ${vmin(1.5)}px`, background: leftColor, color: isBrightColor(leftColor) ? '#000' : '#fff', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)', borderRadius: vmin(0.6), fontSize: vmin(3.5), fontWeight: 800, flexShrink: 0 }}>{leftLabel}</div>
          </div>

          {/* Center: Set scores + SET n */}
          <div style={{ display: 'flex', alignItems: 'center', gap: vmin(1), flexShrink: 0, marginLeft: vmin(0.8), marginRight: vmin(0.8) }}>
            <div style={{
              padding: `${vmin(0.6)}px ${vmin(1.8)}px`, background: 'var(--ov-sunken-strong)', border: '1px solid var(--ov-hairline)', borderRadius: vmin(0.8),
              fontSize: vmin(3), fontWeight: 800, fontVariantNumeric: 'tabular-nums'
            }}>
              {leftSetsWon}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: vmin(3), color: 'var(--ov-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SET</span>
              <span style={{ fontSize: vmin(4), fontWeight: 800 }}>{displaySetIndex}</span>
            </div>
            <div style={{
              padding: `${vmin(0.6)}px ${vmin(1.8)}px`, background: 'var(--ov-sunken-strong)', border: '1px solid var(--ov-hairline)',
              borderRadius: vmin(0.8), fontSize: vmin(3), fontWeight: 800, fontVariantNumeric: 'tabular-nums'
            }}>{rightSetsWon}</div>
          </div>

          {/* Right: A/B + Team Name (centered in its space) */}
          <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: vmin(1.2), minWidth: 0 }}>
            <div style={{ padding: `${vmin(0.6)}px ${vmin(1.5)}px`, background: rightColor, color: isBrightColor(rightColor) ? '#000' : '#fff', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)', borderRadius: vmin(0.6), fontSize: vmin(3.5), fontWeight: 800, flexShrink: 0 }}>{rightLabel}</div>
            <div style={{ flex: '1 1 0', display: 'flex', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: `${section2AFontSize.fontSize}px`,
                  fontWeight: 700,
                  background: rightColor,
                  color: isBrightColor(rightColor) ? '#000' : '#fff',
                  boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)',
                  padding: `${vmin(0.6)}px ${vmin(1.5)}px`,
                  borderRadius: vmin(0.6),
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    minWidth: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    verticalAlign: 'bottom',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                  }}
                >
                  {rightShortName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2B: Score & Serve - 12% */}
        <div data-diag="referee-score" style={{
          flex: '0 0 15%',
          padding: `${vmin(0.4)}px 0`,
          background: 'var(--ov-card)',
          borderBottom: '1px solid var(--ov-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0
        }}>
          {/* LEFT SERVE indicator - absolute positioned so it doesn't affect score centering */}
          {leftServing && (
            <div style={{
              position: 'absolute',
              left: vmin(2),
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2
            }}>
              <span style={{ fontSize: vmin(2.5), color: 'var(--ov-success)', fontWeight: 700 }}>SERVE</span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: vmin(0.8),
                background: '#ecfdf5',
                border: '2px solid #10b981',
                borderRadius: vmin(0.8),
                aspectRatio: '1/1',
                minWidth: vmin(5.5)
              }}>
                <span style={{ fontSize: vmin(6), fontWeight: 700, color: 'var(--ov-success)', lineHeight: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {(() => {
                    // Find serving player number from lineup (isServing flag)
                    for (const pos of [leftLineup?.I, leftLineup?.II, leftLineup?.III, leftLineup?.IV]) {
                      if (pos && typeof pos === 'object' && pos.isServing) return pos.number
                    }
                    // Fallback: use serverNumber from currentSet
                    return data?.currentSet?.serverNumber || ''
                  })()}
                </span>
              </div>
            </div>
          )}

          {/* Score section - always centered, full width */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            gap: 0
          }}>
            <span style={{
              fontFamily: getScoreFont(),
              fontSize: vmin(15),
              fontWeight: 600,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              flex: '1 1 0',
              textAlign: 'right',
              paddingRight: vmin(0.5)
            }}>
              {leftDisplayScore}
            </span>
            <span style={{
              fontFamily: getScoreFont(), fontSize: vmin(11), fontWeight: 800, color: 'var(--ov-text-faint)', lineHeight: 1, marginTop: vmin(-0.5), flexShrink: 0
            }}>:</span>
            <span style={{
              fontFamily: getScoreFont(),
              fontSize: vmin(15),
              fontWeight: 600,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              flex: '1 1 0',
              textAlign: 'left',
              paddingLeft: vmin(0.5)
            }}>
              {rightDisplayScore}
            </span>
          </div>

          {/* RIGHT SERVE indicator - absolute positioned so it doesn't affect score centering */}
          {rightServing && (
            <div style={{
              position: 'absolute',
              right: vmin(2),
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2
            }}>
              <span style={{ fontSize: vmin(2.5), color: 'var(--ov-success)', fontWeight: 700 }}>SERVE</span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: vmin(0.8),
                background: '#ecfdf5',
                border: '2px solid #10b981',
                borderRadius: vmin(0.8),
                aspectRatio: '1/1',
                minWidth: vmin(5.5)
              }}>
                <span style={{ fontSize: vmin(6), fontWeight: 700, color: 'var(--ov-success)', lineHeight: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {(() => {
                    // Find serving player number from lineup (isServing flag)
                    for (const pos of [rightLineup?.I, rightLineup?.II, rightLineup?.III, rightLineup?.IV]) {
                      if (pos && typeof pos === 'object' && pos.isServing) return pos.number
                    }
                    // Fallback: use serverNumber from currentSet
                    return data?.currentSet?.serverNumber || ''
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Court Area - Beach Volleyball (2 players per team) */}
        <div data-diag="referee-court" style={{
          flex: '0 0 40%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0
        }}>
          {/* Court visualization - takes full space */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            minHeight: 0
          }}>
            <div style={{
              width: '98%',
              height: '98%',
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'linear-gradient(90deg, #e6c288, #dcb67d)',
              border: '1px solid var(--ov-hairline-strong)',
              overflow: 'hidden'
            }}>
              {/* Net */}
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '50%',
                width: '4px',
                transform: 'translateX(-50%)',
                background: 'repeating-linear-gradient(to bottom, rgba(248, 250, 252, 0.85), rgba(248, 250, 252, 0.85) 6px, rgba(148, 163, 184, 0.45) 6px, rgba(148, 163, 184, 0.45) 12px)',
                borderRadius: '4px',
                boxShadow: '0 0 14px rgba(241, 245, 249, 0.18)',
                zIndex: 2,
                border: '1px solid rgba(148, 163, 184, 0.35)'
              }} />

              {/* Left side - Beach volleyball: 2 players */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                height: '100%'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  height: '95%',
                  padding: vmin(3),
                  gap: vmin(2)
                }}>
                  {(() => {
                    // Collect all players from lineup (keys: I, II, III, IV, or 1, 2)
                    const posOrder = ['I', 'II', 'III', 'IV', '1', '2']
                    const players = posOrder.filter(k => leftLineup?.[k]).map(k => ({ pos: k, data: leftLineup[k] }))
                    if (players.length === 0) return null
                    return players.slice(0, 2).map(({ pos, data }) => (
                      <PlayerCircle key={pos} positionData={data} position={pos} team={leftTeam} isServing={leftServing} />
                    ))
                  })()}
                </div>
              </div>

              {/* Right side - Beach volleyball: 2 players */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                height: '100%'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  height: '95%',
                  padding: vmin(3),
                  gap: vmin(2)
                }}>
                  {(() => {
                    const posOrder = ['I', 'II', 'III', 'IV', '1', '2']
                    const players = posOrder.filter(k => rightLineup?.[k]).map(k => ({ pos: k, data: rightLineup[k] }))
                    if (players.length === 0) return null
                    return players.slice(0, 2).map(({ pos, data }) => (
                      <PlayerCircle key={pos} positionData={data} position={pos} team={rightTeam} isServing={rightServing} />
                    ))
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>{/* End SECTION 3: Court Area */}

        {/* SECTION 4: TO counters + Sanctions - Beach volleyball (no substitutions) */}
        <div data-diag="referee-counters" style={{
          flex: '1 1 auto',
          borderTop: '1px solid var(--ov-hairline)',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'var(--ov-card)',
          gap: '12px',
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {/* Left team counters - TO + BMP (beach volleyball: 1 timeout per set) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: vmin(1),
            fontSize: vmin(4),
            fontWeight: 700
          }}>
            {/* TO counter */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--ov-text-muted)', fontSize: '0.6em' }}>TO</span>
              <span style={{
                background: leftStats.timeouts >= 1 ? 'var(--ov-danger-soft)' : 'var(--ov-sunken-strong)',
                padding: `${vmin(0.7)}px ${vmin(1.4)}px`,
                borderRadius: vmin(0.6),
                border: leftStats.timeouts >= 1 ? '1px solid #fca5a5' : '1px solid var(--ov-hairline-strong)',
                minWidth: vmin(4.2),
                aspectRatio: '1',
                textAlign: 'center',
                color: leftStats.timeouts >= 1 ? 'var(--ov-danger-text)' : 'var(--ov-text)',
                fontVariantNumeric: 'tabular-nums'
              }}>{leftStats.timeouts}</span>
            </div>
            {/* BMP counter */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--ov-text-muted)', fontSize: '0.6em' }}>BMP</span>
              <span style={{
                background: bmpLeft(leftStats) <= 0 ? 'var(--ov-danger-soft)' : 'var(--ov-sunken-strong)',
                padding: `${vmin(0.7)}px ${vmin(1.4)}px`,
                borderRadius: vmin(0.6),
                border: bmpLeft(leftStats) <= 0 ? '1px solid #fca5a5' : '1px solid var(--ov-hairline-strong)',
                minWidth: vmin(4.2),
                aspectRatio: '1',
                textAlign: 'center',
                color: bmpLeft(leftStats) <= 0 ? 'var(--ov-danger-text)' : 'var(--ov-text)',
                fontVariantNumeric: 'tabular-nums'
              }} title={t('referee.bmpLeft', { count: bmpLeft(leftStats), defaultValue: 'Ball mark protocol: {{count}} left' })}>{bmpLeft(leftStats)}</span>
            </div>
          </div>

          {/* Center: Inner container with sanctions + countdown/icon */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'flex-start',
            height: '100%',
            gap: '8px',
            paddingTop: '4px'
          }}>
            {/* Left team sanctions */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '4px',
              border: (leftTeamSanctions.formalWarning || leftTeamSanctions.improperRequest || leftTeamSanctions.delayWarning || leftTeamSanctions.delayPenalty || leftTeamSanctions.warnings.length > 0 || leftTeamSanctions.penalties.length > 0 || leftTeamSanctions.expulsions.length > 0 || leftTeamSanctions.disqualifications.length > 0) ? '1px solid var(--ov-hairline)' : 'none',
              padding: '4px',
              height: '100%',

            }}>
              {/* Sanctions title if any sanctions exist */}
              {(leftTeamSanctions.formalWarning || leftTeamSanctions.improperRequest || leftTeamSanctions.delayWarning || leftTeamSanctions.delayPenalty || leftTeamSanctions.warnings.length > 0 || leftTeamSanctions.penalties.length > 0 || leftTeamSanctions.expulsions.length > 0 || leftTeamSanctions.disqualifications.length > 0) && (
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ov-text-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sanctions</div>
              )}
              {(leftTeamSanctions.formalWarning || leftTeamSanctions.improperRequest || leftTeamSanctions.delayWarning || leftTeamSanctions.delayPenalty || leftTeamSanctions.warnings.length > 0 || leftTeamSanctions.penalties.length > 0 || leftTeamSanctions.expulsions.length > 0 || leftTeamSanctions.disqualifications.length > 0) && (
                <div style={{ borderTop: '1px solid var(--ov-hairline)', height: 0, width: '100%', margin: '4px 0' }}></div>
              )}
              {/* Team-level sanctions at top (Formal warning, Improper Request only) */}
              {(leftTeamSanctions.formalWarning || leftTeamSanctions.improperRequest) && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  {leftTeamSanctions.formalWarning && (
                    <span style={{
                      background: '#fde047',
                      color: '#000',
                      padding: '1px 6px',
                      borderRadius: '3px'
                    }}>Formal warning</span>
                  )}
                  {leftTeamSanctions.improperRequest && (
                    <span style={{
                      background: '#000',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px'
                    }}>Improper Request</span>
                  )}
                </div>
              )}
              {(leftTeamSanctions.formalWarning || leftTeamSanctions.improperRequest || leftTeamSanctions.delayWarning || leftTeamSanctions.delayPenalty || leftTeamSanctions.warnings.length > 0 || leftTeamSanctions.penalties.length > 0 || leftTeamSanctions.expulsions.length > 0 || leftTeamSanctions.disqualifications.length > 0) && (
                <div style={{ borderTop: '1px solid var(--ov-hairline)', height: 0, width: '100%', margin: '4px 0' }}></div>
              )}
              {/* Personal sanctions in grid: W|P|E|D columns, DW/DP below */}
              {(leftTeamSanctions.warnings.length > 0 || leftTeamSanctions.penalties.length > 0 || leftTeamSanctions.expulsions.length > 0 || leftTeamSanctions.disqualifications.length > 0 || leftTeamSanctions.delayWarning || leftTeamSanctions.delayPenalty) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(24px, auto))',
                  gap: '3px',
                  alignItems: 'start',
                  justifyContent: 'center'
                }}>
                  {/* Column 1: Warnings (W) + Delay Warning */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {leftTeamSanctions.warnings.map((w, i) => (
                      <span key={`w${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#fde047',
                        width: '50px',
                        textAlign: 'center',
                        color: '#000',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>W - {w.id}</span>
                    ))}
                    {leftTeamSanctions.delayWarning && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        width: '50px',
                        textAlign: 'center',
                        background: '#fde047',
                        color: '#000',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>D W</span>
                    )}
                  </div>
                  {/* Column 2: Penalties (P) + Delay Penalty */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {leftTeamSanctions.penalties.map((p, i) => (
                      <span key={`p${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#ef4444',
                        color: '#fff',
                        width: '50px',
                        padding: '1px 4px',
                        textAlign: 'center',
                        borderRadius: '3px'
                      }}>P - {p.id}</span>
                    ))}
                    {leftTeamSanctions.delayPenalty && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#ef4444',
                        width: '50px',
                        color: '#000000ff',
                        textAlign: 'center',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>D P</span>
                    )}
                  </div>
                  {/* Column 3: Expulsions (E) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {leftTeamSanctions.expulsions.map((e, i) => (
                      <span key={`e${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #ef4444 50%, #fde047 50%)',
                        color: '#000000ff',
                        width: '50px',
                        padding: '1px 4px',
                        textAlign: 'center',
                        borderRadius: '3px'
                      }}>E - {e.id}</span>
                    ))}
                  </div>
                  {/* Column 4: Disqualifications (D) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {leftTeamSanctions.disqualifications.map((d, i) => (
                      <span key={`d${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: 'linear-gradient(90deg, #ef4444 50%, #fde047 50%)',
                        color: '#000000ff',
                        width: '50px',
                        padding: '1px 4px',
                        textAlign: 'center',
                        borderRadius: '3px'
                      }}>D - {d.id}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Center: Countdown when active, otherwise Favicon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              alignSelf: 'center'
            }}>
              {timeoutModal ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', color: 'var(--ov-text-muted)', fontWeight: 600, marginBottom: '4px' }}>TIMEOUT</div>
                  <DonutCountdown current={timeoutModal.countdown} total={45} size={130} strokeWidth={6}>
                    <div style={{ fontSize: vmin(5), fontFamily: getScoreFont(), fontWeight: 600, color: timeoutModal.countdown <= 10 ? 'var(--ov-danger-text)' : 'var(--ov-success)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {timeoutModal.countdown}"
                    </div>
                  </DonutCountdown>
                </div>
              ) : ttoModal ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ov-success)', fontWeight: 700, marginBottom: '2px' }}>
                    Technical Timeout
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ov-text-muted)', fontWeight: 500, marginBottom: '6px' }}>
                    at 21 points
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span style={{ background: leftColor, color: isBrightColor(leftColor) ? '#000' : '#fff', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>{leftLabel}</span>
                    <strong style={{ fontSize: '16px', color: 'var(--ov-text)', fontVariantNumeric: 'tabular-nums' }}>{leftPoints} - {rightPoints}</strong>
                    <span style={{ background: rightColor, color: isBrightColor(rightColor) ? '#000' : '#fff', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>{rightLabel}</span>
                  </div>
                  <DonutCountdown current={ttoModal.countdown} total={45} size={130} strokeWidth={6}>
                    <div style={{ fontSize: vmin(5), fontFamily: getScoreFont(), fontWeight: 600, color: ttoModal.countdown <= 10 ? 'var(--ov-danger-text)' : 'var(--ov-success)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {ttoModal.countdown}"
                    </div>
                  </DonutCountdown>
                  <div style={{ fontSize: '11px', color: 'var(--ov-warning-text)', fontWeight: 500, marginTop: '4px' }}>
                    Courts will switch when TTO ends
                  </div>
                </div>
              ) : medicalModal ? (
                (() => {
                  // MTO / RIT: 5:00 recovery time (rule 17.1.2)
                  const remaining = medicalRemaining(medicalModal, medicalNow)
                  const medTeamLetter = medicalModal.team === 'team1' ? team1Label : medicalModal.team === 'team2' ? team2Label : ''
                  const medPlayers = medicalModal.team === 'team1' ? data?.team1Players : data?.team2Players
                  const medPlayer = (medPlayers || []).find(p => String(p.number) === String(medicalModal.playerNumber))
                  const medName = medicalModal.playerName || medPlayer?.lastName || medPlayer?.last_name || ''
                  return (
                    <div style={{ textAlign: 'center' }} data-testid="referee-medical">
                      <div style={{ fontSize: '16px', color: 'var(--ov-danger-text)', fontWeight: 700, marginBottom: '2px' }}>
                        {medicalTypeLabel(medicalModal.kind, medicalModal.ritType, t)}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--ov-text)', fontWeight: 600, marginBottom: '6px' }}>
                        {medicalPlayerLabel({ teamLetter: medTeamLetter, playerNumber: medicalModal.playerNumber, playerName: medName })}
                      </div>
                      <DonutCountdown current={remaining} total={medicalModal.initialCountdown} size={130} strokeWidth={6}>
                        <div style={{ fontSize: vmin(5), fontFamily: getScoreFont(), fontWeight: 600, color: remaining <= 60 ? 'var(--ov-danger-text)' : 'var(--ov-success)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {formatDuration(remaining)}
                        </div>
                      </DonutCountdown>
                      <div style={{ fontSize: '12px', color: 'var(--ov-text-muted)', fontWeight: 500, marginTop: '4px' }}>
                        {t('referee.medical.recoveryTime', 'Recovery time')}
                      </div>
                    </div>
                  )
                })()
              ) : betweenSetsCountdown && betweenSetsCountdown.countdown > 0 ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--ov-text-muted)', fontWeight: 600, marginBottom: '4px' }}>INTERVAL</div>
                  <DonutCountdown current={betweenSetsCountdown.countdown} total={setIntervalDuration} size={90} strokeWidth={5}>
                    <div style={{ fontSize: vmin(4.5), fontFamily: getScoreFont(), fontWeight: 800, color: betweenSetsCountdown.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--ov-success)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.floor(betweenSetsCountdown.countdown / 60)}:{String(betweenSetsCountdown.countdown % 60).padStart(2, '0')}
                    </div>
                  </DonutCountdown>
                </div>
              ) : (
                <img
                  src={BRAND.mark}
                  alt="OpenBeach"
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: vmin(20),
                    aspectRatio: '1',
                    objectFit: 'contain',
                    opacity: 0.7
                  }}
                />
              )}
            </div>

            {/* Right team sanctions */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '4px',
              border: (rightTeamSanctions.formalWarning || rightTeamSanctions.improperRequest || rightTeamSanctions.delayWarning || rightTeamSanctions.delayPenalty || rightTeamSanctions.warnings.length > 0 || rightTeamSanctions.penalties.length > 0 || rightTeamSanctions.expulsions.length > 0 || rightTeamSanctions.disqualifications.length > 0) ? '1px solid var(--ov-hairline)' : 'none',
              padding: '4px',
              height: '100%',
            }}>
              {/* Sanctions title if any sanctions exist */}
              {(rightTeamSanctions.formalWarning || rightTeamSanctions.improperRequest || rightTeamSanctions.delayWarning || rightTeamSanctions.delayPenalty || rightTeamSanctions.warnings.length > 0 || rightTeamSanctions.penalties.length > 0 || rightTeamSanctions.expulsions.length > 0 || rightTeamSanctions.disqualifications.length > 0) && (
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ov-text-body)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sanctions</div>
              )}
              {(rightTeamSanctions.formalWarning || rightTeamSanctions.improperRequest || rightTeamSanctions.delayWarning || rightTeamSanctions.delayPenalty || rightTeamSanctions.warnings.length > 0 || rightTeamSanctions.penalties.length > 0 || rightTeamSanctions.expulsions.length > 0 || rightTeamSanctions.disqualifications.length > 0) && (
                <div style={{ borderTop: '1px solid var(--ov-hairline)', height: 0, width: '100%', margin: '4px 0' }}></div>
              )}
              {/* Team-level sanctions at top (Formal warning, Improper Request only) */}
              {(rightTeamSanctions.formalWarning || rightTeamSanctions.improperRequest) && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  {rightTeamSanctions.formalWarning && (
                    <span style={{
                      background: '#fde047',
                      color: '#000',
                      padding: '1px 6px',
                      borderRadius: '3px'
                    }}>Formal warning</span>
                  )}
                  {rightTeamSanctions.improperRequest && (
                    <span style={{
                      background: '#000',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: '3px'
                    }}>Improper Request</span>
                  )}
                </div>
              )}
              {(rightTeamSanctions.formalWarning || rightTeamSanctions.improperRequest || rightTeamSanctions.delayWarning || rightTeamSanctions.delayPenalty || rightTeamSanctions.warnings.length > 0 || rightTeamSanctions.penalties.length > 0 || rightTeamSanctions.expulsions.length > 0 || rightTeamSanctions.disqualifications.length > 0) && (
                <div style={{ borderTop: '1px solid var(--ov-hairline)', height: 0, width: '100%', margin: '4px 0' }}></div>
              )}
              {/* Personal sanctions in grid: W|P|E|D columns, DW/DP below */}
              {(rightTeamSanctions.warnings.length > 0 || rightTeamSanctions.penalties.length > 0 || rightTeamSanctions.expulsions.length > 0 || rightTeamSanctions.disqualifications.length > 0 || rightTeamSanctions.delayWarning || rightTeamSanctions.delayPenalty) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(24px, auto))',
                  gap: '3px',
                  alignItems: 'start',
                  justifyContent: 'center'
                }}>
                  {/* Column 1: Warnings (W) + Delay Warning */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {rightTeamSanctions.warnings.map((w, i) => (
                      <span key={`w${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#fde047',
                        color: '#000',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        width: '50px',
                        textAlign: 'center',
                      }}>W - {w.id}</span>
                    ))}
                    {rightTeamSanctions.delayWarning && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        width: '50px',
                        textAlign: 'center',
                        background: '#fde047',
                        color: '#000',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>D W</span>
                    )}
                  </div>
                  {/* Column 2: Penalties (P) + Delay Penalty */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {rightTeamSanctions.penalties.map((p, i) => (
                      <span key={`p${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#ef4444',
                        color: '#000000ff',
                        width: '50px',
                        textAlign: 'center',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>P - {p.id}</span>
                    ))}
                    {rightTeamSanctions.delayPenalty && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#ef4444',
                        color: '#000000ff',
                        padding: '1px 4px',
                        width: '50px',
                        textAlign: 'center',
                        borderRadius: '3px'
                      }}>D P</span>
                    )}
                  </div>
                  {/* Column 3: Expulsions (E) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {rightTeamSanctions.expulsions.map((e, i) => (
                      <span key={`e${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #ef4444 50%, #fde047 50%)',
                        color: '#000000ff',
                        padding: '1px 4px',
                        width: '50px',
                        textAlign: 'center',
                        borderRadius: '3px',
                      }}>E - {e.id}</span>
                    ))}
                  </div>
                  {/* Column 4: Disqualifications (D) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', minWidth: '24px' }}>
                    {rightTeamSanctions.disqualifications.map((d, i) => (
                      <span key={`d${i}`} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        width: '50px',
                        textAlign: 'center',
                        background: 'linear-gradient(90deg,#ef4444 50%, #fde047 50%)',
                        color: '#000000ff',
                        padding: '1px 4px',
                        borderRadius: '3px'

                      }}>D - {d.id}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right team counters - TO + BMP (beach volleyball: 1 timeout per set) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: vmin(1),
            fontSize: vmin(4),
            fontWeight: 700
          }}>
            {/* TO counter */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--ov-text-muted)', fontSize: '0.6em' }}>TO</span>
              <span style={{
                background: rightStats.timeouts >= 1 ? 'var(--ov-danger-soft)' : 'var(--ov-sunken-strong)',
                padding: `${vmin(0.7)}px ${vmin(1.4)}px`,
                borderRadius: vmin(0.6),
                aspectRatio: '1',
                border: rightStats.timeouts >= 1 ? '1px solid #fca5a5' : '1px solid var(--ov-hairline-strong)',
                minWidth: vmin(4.2),
                textAlign: 'center',
                color: rightStats.timeouts >= 1 ? 'var(--ov-danger-text)' : 'var(--ov-text)',
                fontVariantNumeric: 'tabular-nums'
              }}>{rightStats.timeouts}</span>
            </div>
            {/* BMP counter */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--ov-text-muted)', fontSize: '0.6em' }}>BMP</span>
              <span style={{
                background: bmpLeft(rightStats) <= 0 ? 'var(--ov-danger-soft)' : 'var(--ov-sunken-strong)',
                padding: `${vmin(0.7)}px ${vmin(1.4)}px`,
                borderRadius: vmin(0.6),
                aspectRatio: '1',
                border: bmpLeft(rightStats) <= 0 ? '1px solid #fca5a5' : '1px solid var(--ov-hairline-strong)',
                minWidth: vmin(4.2),
                textAlign: 'center',
                color: bmpLeft(rightStats) <= 0 ? 'var(--ov-danger-text)' : 'var(--ov-text)',
                fontVariantNumeric: 'tabular-nums'
              }} title={t('referee.bmpLeft', { count: bmpLeft(rightStats), defaultValue: 'Ball mark protocol: {{count}} left' })}>{bmpLeft(rightStats)}</span>
            </div>
          </div>
        </div>

        {/* SECTION 5: Footer - Last Action - 40px */}
        <div data-diag="referee-footer" style={{
          flex: '0 0 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
          background: 'var(--ov-card)',
          borderTop: '1px solid var(--ov-hairline)',
          fontSize: vmin(2),
          color: 'var(--ov-text-secondary)',
          overflow: 'hidden',
          minHeight: 0
        }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            <span style={{ color: 'var(--ov-text-muted)', fontWeight: 500 }}>{t('refereeDashboard.lastAction')}:</span>
            {lastEvent ? (
              <>
                <span style={{ color: 'var(--ov-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {timeSecondsLabel(lastEvent.timestamp)}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--ov-text-body)' }}>
                  {refereeEventLabel(lastEvent, {
                    team1Label,
                    team2Label,
                    team1Short: data?.match?.team1ShortName || data?.team1?.name || 'Team 1',
                    team2Short: data?.match?.team2ShortName || data?.team2?.name || 'Team 2',
                    leftLabel,
                    rightLabel,
                    leftPoints: leftDisplayScore,
                    rightPoints: rightDisplayScore,
                    t
                  })}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--ov-text-faint)' }}>{t('refereeDashboard.events.noAction')}</span>
            )}
          </span>
        </div>

      </div>{/* End main content wrapper */}

      {/* Test Mode Controls - only shown in test mode */}
      {
        (matchId === -1 || data?.match?.test === true) && (
          <TestModeControls
            matchId={matchId}
            onRefresh={async () => {
              // In test mode, reload from local IndexedDB
              try {
                const match = await db.matches.get(matchId)
                const sets = await db.sets.where('matchId').equals(matchId).sortBy('index')
                const events = await db.events.where('matchId').equals(matchId).sortBy('seq')
                const team1 = await db.teams.get(match?.team1Id)
                const team2 = await db.teams.get(match?.team2Id)

                console.debug('[Referee] Reloaded from IndexedDB:', {
                  matchId,
                  sets: sets.length,
                  events: events.length,
                  currentSet: sets.find(s => !s.finished)?.index
                })

                // Update state with fresh local data
                setData({
                  success: true,
                  match,
                  team1,
                  team2,
                  sets,
                  events
                })
              } catch (err) {
                console.error('[TestModeControls] Error reloading from IndexedDB:', err)
              }
            }}
          />
        )
      }
      {/* Scorer Attention Modal */}
      {attentionModalOpen && (
        <div className="ov-kit">
          <KitModal
            open
            decision
            dismissible={false}
            onClose={() => setAttentionModalOpen(false)}
            size="sm"
            closeLabel={t('common.close', 'Close')}
          >
            <div className="p-1 text-center sm:p-3">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Bell size={32} aria-hidden="true" />
              </div>
              <p role="alert" className="mb-5 font-bold text-red-700" style={{ fontSize: vmin(3) }}>
                {t('refereeDashboard.scorerAttention', 'Scorer needs attention')}
              </p>
              <Button variant="dark" size="xl" block className="h-14 text-base" onClick={() => setAttentionModalOpen(false)}>
                {t('refereeDashboard.acknowledge', 'Acknowledge')}
              </Button>
            </div>
          </KitModal>
        </div>
      )}

      {/* "One point to switch/TTO" popup notification */}
      {preEventPopup && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--ov-success)',
          color: 'var(--ov-on-dark)',
          boxShadow: 'var(--ov-shadow-pop)',
          padding: `${vmin(3)}px ${vmin(6)}px`,
          borderRadius: `${vmin(1.5)}px`,
          fontSize: `${vmin(5)}px`,
          fontWeight: 'bold',
          zIndex: 1500,
          pointerEvents: 'none',
          animation: 'preEventPulse 1s ease-in-out infinite',
          textAlign: 'center',
          whiteSpace: 'nowrap'
        }}>
          {preEventPopup.message}
        </div>
      )}
    </div >
  )
}
