import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { useLiveQuery } from 'dexie-react-hooks'
import Dexie from 'dexie'
import { db } from '../db_beach/db_beach'
import Modal from './Modal_beach'

import MenuList from './MenuList_beach'
import SyncProgressModal_beach from './SyncProgressModal_beach'
import ScoreboardOptionsModal from './options/ScoreboardOptionsModal_beach'
import ConnectionSetupModal from './options/ConnectionSetupModal_beach'
import { useSyncQueue } from '../hooks_beach/useSyncQueue_beach'
import { useSequentialSync } from '../hooks_beach/useSequentialSync_beach'


// Primary ball image
const ballImage = '/beachball.png'
import { debugLogger, createStateSnapshot } from '../utils_beach/debugLogger_beach'
import { useComponentLogging } from '../contexts_beach/LoggingContext_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import { exportMatchData } from '../utils_beach/backupManager_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'
import { uploadBackupToCloud, uploadLogsToCloud, triggerContinuousBackup } from '../utils_beach/logger_beach'
import { splitLocalDateTime, parseLocalDateTimeToISO, roundToMinute } from '../utils_beach/timeUtils_beach'
import { uploadScoresheetAsync } from '../utils_beach/scoresheetUploader_beach'

/**
 * SYNC ARCHITECTURE NOTE:
 * -----------------------
 * This component uses TWO write paths to Supabase (see useSyncQueue.js for full docs):
 *
 * 1. QUEUED: Events, sets, match metadata → db.sync_queue → processed async
 *    Used for: All scoring events, substitutions, timeouts, sanctions
 *    Why: Offline-first, dependency ordering, retry-safe
 *
 * 2. DIRECT: match_live_state → supabase.upsert() immediately
 *    Used for: Real-time spectator display (lineup, scores, serving team)
 *    Why: Sub-second latency needed for live viewing - queue adds 1s+ delay
 *
 * The eventInProgressRef mutex serializes event creation to prevent race
 * conditions (e.g., rapid clicks causing duplicate sets).
 */

export default function Scoreboard({ matchId, scorerAttentionTrigger = null, onFinishSet, onOpenSetup, onOpenMatchSetup, onOpenCoinToss, onTriggerEventBackup }) {
  const { t } = useTranslation()
  const { showAlert } = useAlert()
  const { syncStatus, flush: flushSyncQueue } = useSyncQueue()
  const cLogger = useComponentLogging('Scoreboard')
  const { syncState, syncSetEnd, resetSyncState } = useSequentialSync()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const syncProceedCallbackRef = useRef(null)
  const handleSyncProceed = useCallback(() => {
    if (syncProceedCallbackRef.current) {
      syncProceedCallbackRef.current()
      syncProceedCallbackRef.current = null
    }
  }, [])
  const [now, setNow] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [duplicateTabError, setDuplicateTabError] = useState(false)
  const tabIdRef = useRef(Math.random().toString(36).substring(2, 15))

  const [showLogs, setShowLogs] = useState(false)
  const [logSearchQuery, setLogSearchQuery] = useState('')
  const [showManualPanel, setShowManualPanel] = useState(false)
  const [manualPanelExpandedSections, setManualPanelExpandedSections] = useState({
    lineup: false,     // Change Current Lineup
    scores: false,     // Score & Sets
    matchSettings: false, // Match Settings (teams setup, status, sides)
    events: false,     // Event History (points, timeouts, subs, sanctions)
    advanced: false,   // Advanced (add events, delete events, times)
    summary: false     // Manual Changes Summary
  })
  const [manualChangesLog, setManualChangesLog] = useState([])
  const [showCurrentSetAdjustment, setShowCurrentSetAdjustment] = useState(false)
  const [showRemarks, setShowRemarks] = useState(false)
  const [remarksText, setRemarksText] = useState('')
  const remarksTextareaRef = useRef(null)
  const [showRosters, setShowRosters] = useState(false)
  const [showSanctions, setShowSanctions] = useState(false)
  const [menuModal, setMenuModal] = useState(false)
  const [showOptionsInMenu, setShowOptionsInMenu] = useState(false)
  const [connectionSetupModal, setConnectionSetupModal] = useState(false)
  const [localManageCaptainOnCourt, setLocalManageCaptainOnCourt] = useState(() => {
    // Load from localStorage, default to false
    const saved = localStorage.getItem('manageCaptainOnCourt')
    return saved === 'true'
  })
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

  // Set 3 Coin Toss Draft State (beach volleyball is best of 3)
  const [set3CoinTossDraft, setSet3CoinTossDraft] = useState({
    serve: 'A', // Default to Team A serving
    sideA: 'left' // Default to Team A on left (standard rotation)
  })

  const [injuryDropdown, setInjuryDropdown] = useState(null)
  // MTO/RIT countdown modal: { type: 'mto'|'rit', ritType?: 'no_blood'|'toilet'|'weather', team, playerNumber, countdown: 300, started: boolean, startedAt?: ISO string, eventId?: number }
  const [medicalModal, setMedicalModal] = useState(null)

  const [setIntervalDuration, setSetIntervalDuration] = useState(() => {
    const saved = localStorage.getItem('setIntervalDuration')
    return saved ? parseInt(saved, 10) : 60 // default 1 minute for beach volleyball
  })
  // Score/countdown font: 'default' | 'orbitron'
  const [scoreFont, setScoreFont] = useState(() => {
    const saved = localStorage.getItem('scoreFont')
    return saved || 'default'
  })
  // Design size for continuous proportional scaling
  const DESIGN_WIDTH = 1920
  const DESIGN_HEIGHT = 1080
  const DESIGN_VMIN = Math.min(DESIGN_WIDTH, DESIGN_HEIGHT) // 1080 - base unit for vmin-like calculations
  const [leftTeamSanctionsExpanded, setLeftTeamSanctionsExpanded] = useState(false)
  const [rightTeamSanctionsExpanded, setRightTeamSanctionsExpanded] = useState(false)
  // Main layout collapsible sections (collapsed by default on tablet)
  const [leftMainOfficialsExpanded, setLeftMainOfficialsExpanded] = useState(false)
  const [rightMainOfficialsExpanded, setRightMainOfficialsExpanded] = useState(false)
  const [rallyStatusExpanded, setRallyStatusExpanded] = useState(false) // Toggle rally status/last action size
  const [accidentalRallyConfirmModal, setAccidentalRallyConfirmModal] = useState(null) // { onConfirm: function } | null
  const [accidentalPointConfirmModal, setAccidentalPointConfirmModal] = useState(null) // { team: 'team1'|'team2', onConfirm: function } | null
  const lastPointAwardedTimeRef = useRef(null) // Track when last point was awarded
  const rallyStartTimeRef = useRef(null) // Track when rally started
  // MUTEX: Serializes event creation to prevent race conditions (e.g., rapid clicks creating duplicate sets)
  // See architecture note at top of file. All event-creating functions acquire this lock.
  const eventInProgressRef = useRef(false)
  const eventQueueRef = useRef([]) // Queue for serializing event creation
  const confirmingTimeoutRef = useRef(false) // Prevent double-click on timeout confirmation
  const [keybindingsEnabled, setKeybindingsEnabled] = useState(() => {
    const saved = localStorage.getItem('keybindingsEnabled')
    return saved === 'true' // default false
  })
  const [keybindingsModalOpen, setKeybindingsModalOpen] = useState(false)
  const defaultKeyBindings = {
    pointLeft: 'a',
    pointRight: 'l',
    timeoutLeft: 'q',
    timeoutRight: 'p',

    undo: 'Backspace',
    confirm: 'Enter',
    cancel: 'Escape',
    startRally: 'Enter'
  }
  const [keyBindings, setKeyBindings] = useState(() => {
    const saved = localStorage.getItem('keyBindings')
    if (saved) {
      try {
        return { ...defaultKeyBindings, ...JSON.parse(saved) }
      } catch {
        return defaultKeyBindings
      }
    }
    return defaultKeyBindings
  })
  const [editingKey, setEditingKey] = useState(null) // Which key binding is being edited

  const [serverRunning, setServerRunning] = useState(false)
  const [serverStatus, setServerStatus] = useState(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [editPinModal, setEditPinModal] = useState(false)
  const [showPinsModal, setShowPinsModal] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [editPinType, setEditPinType] = useState(null) // 'referee' | 'teamA' | 'teamB'
  const [connectionModal, setConnectionModal] = useState(null) // 'referee' | 'teamA' | 'teamB' | null
  const [connectionModalPosition, setConnectionModalPosition] = useState({ x: 0, y: 0 })
  const [courtSwitchModal, setCourtSwitchModal] = useState(null) // { set, team1Points, team2Points, teamThatScored } | null
  const [ttoModal, setTtoModal] = useState(null) // { set, team1Points, team2Points, countdown?, started? } | null - Technical Timeout
  const [preEventPopup, setPreEventPopup] = useState(null) // { message: string } | null - "One point to switch/TTO" notification
  const [timeoutModal, setTimeoutModal] = useState(null) // { team: 'team1'|'team2', countdown: number, started: boolean }
  const [duplicateTimeoutConfirm, setDuplicateTimeoutConfirm] = useState(null) // { team: 'team1'|'team2' } - confirmation for duplicate TO
  const [betweenSetsCountdown, setBetweenSetsCountdown] = useState(null) // { countdown: number, started: boolean, finished?: boolean } | null
  const countdownDismissedRef = useRef(false) // Track if countdown was manually dismissed
  const setEndModalDismissedRef = useRef(null) // Track setIndex where set end modal was dismissed via undo
  const confirmedSetEndRef = useRef(new Set()) // Track which sets have been confirmed to prevent double-processing
  const timeoutStartTimestampRef = useRef(null) // Timestamp when timeout started
  const timeoutInitialCountdownRef = useRef(60) // Initial timeout duration (60s for beach volleyball)
  const betweenSetsStartTimestampRef = useRef(null) // Timestamp when between-sets interval started
  const betweenSetsInitialCountdownRef = useRef(60) // Initial between-sets duration
  const [lineupModal, setLineupModal] = useState(null) // { team: 'team1'|'team2', mode?: 'initial'|'manual' } | null
  const [peekingLineup, setPeekingLineup] = useState({ left: false, right: false }) // Track which team's lineup is being peeked
  const [bmpModal, setBmpModal] = useState(null) // { type: 'team'|'referee', team?: 'team1'|'team2' } | null - Ball Mark Protocol modal
  const [bmpOutcomeModal, setBmpOutcomeModal] = useState(null) // { type: 'team'|'referee', team?: 'team1'|'team2', requestSeq: number } | null - requestSeq links outcome as sub-event
  const [bmpSelectedOutcome, setBmpSelectedOutcome] = useState(null) // 'successful'|'unsuccessful'|'judgment_impossible'|'in'|'out' - selected outcome awaiting confirmation

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

  // Auto-dismiss preEventPopup after 3 seconds or on click
  useEffect(() => {
    if (preEventPopup) {
      const timer = setTimeout(() => setPreEventPopup(null), 3000)
      const dismiss = () => { setPreEventPopup(null); clearTimeout(timer) }
      document.addEventListener('click', dismiss, { once: true })
      return () => { clearTimeout(timer); document.removeEventListener('click', dismiss) }
    }
  }, [preEventPopup])

  const [scoresheetErrorModal, setScoresheetErrorModal] = useState(null) // { error: string, details?: string } | null


  const [undoConfirm, setUndoConfirm] = useState(null) // { event: Event, description: string } | null

  const [reopenSetConfirm, setReopenSetConfirm] = useState(null) // { setId: number, setIndex: number } | null
  const [setStartTimeModal, setSetStartTimeModal] = useState(null) // { setIndex: number, defaultTime: string } | null
  const [setEndTimeModal, setSetEndTimeModal] = useState(null) // { setIndex: number, winner: string, team1Points: number, team2Points: number, defaultTime: string } | null
  const [set3SideServiceModal, setSet3SideServiceModal] = useState(null) // { setIndex: number, set2LeftTeamLabel: string, set2RightTeamLabel: string, set2ServingTeamLabel: string } | null - shown after set 2 ends
  const [set3SelectedLeftTeam, setSet3SelectedLeftTeam] = useState('A')
  const [set3SelectedFirstServe, setSet3SelectedFirstServe] = useState('A')
  const [setTransitionLoading, setSetTransitionLoading] = useState(null) // { step: string } | null - Loading overlay during set transition
  const [set3SetupConfirmed, setSet3SetupConfirmed] = useState(false) // Track if Set 3 coin toss setup is confirmed (inline UI)
  const [betweenSetsSetupConfirmed, setBetweenSetsSetupConfirmed] = useState(false) // Track if between-sets setup (Set 1→2) is confirmed
  const [postMatchSignature, setPostMatchSignature] = useState(null) // 'team1-captain' | 'team2-captain' | null
  const [sanctionConfirm, setSanctionConfirm] = useState(null) // { side: 'left'|'right', type: 'improper_request'|'delay_warning'|'delay_penalty' } | null
  const [sanctionDropdown, setSanctionDropdown] = useState(null) // { team: 'team1'|'team2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, element: HTMLElement, x?: number, y?: number } | null
  const [sanctionConfirmModal, setSanctionConfirmModal] = useState(null) // { team: 'team1'|'team2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, sanctionType: 'warning'|'penalty'|'expulsion'|'disqualification' } | null
  const [courtSanctionExpanded, setCourtSanctionExpanded] = useState(false) // Toggle court sanction dropdown

  const [playerActionMenu, setPlayerActionMenu] = useState(null) // { team: 'team1'|'team2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null

  const [leftDelaysDropdownOpen, setLeftDelaysDropdownOpen] = useState(false) // Narrow mode dropdown for left team delays/sanctions buttons
  const [rightDelaysDropdownOpen, setRightDelaysDropdownOpen] = useState(false) // Narrow mode dropdown for right team delays/sanctions buttons
  const [toSubDetailsModal, setToSubDetailsModal] = useState(null) // { type: 'timeout', side: 'left'|'right' } | null
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [selectedHelpTopic, setSelectedHelpTopic] = useState(null)
  const [replayRallyConfirm, setReplayRallyConfirm] = useState(null) // { event: Event, description: string, selectedOption: 'swap'|'replay' } | null
  const [stopMatchModal, setStopMatchModal] = useState(null) // 'select' | null - Stop the match modal selection
  const [stopMatchTeamSelect, setStopMatchTeamSelect] = useState(null) // { pendingAction: 'forfeit' } | null - Team selection for forfeit
  const [stopMatchConfirm, setStopMatchConfirm] = useState(null) // { type: 'forfeit'|'impossibility', team?: 'team1'|'team2' } | null - Confirmation modal
  const [stopMatchRemarksStep, setStopMatchRemarksStep] = useState(null) // { type: 'forfeit'|'impossibility', team?: 'team1'|'team2' } | null - After remarks

  const leftCourtPositionVRef = useRef(null) // Ref for position V on left court (for modal positioning)
  const rightCourtPositionIIRef = useRef(null) // Ref for position II on right court (for modal positioning)

  // Header collapse state
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [showNamesOnCourt, setShowNamesOnCourtState] = useState(() => {
    const saved = localStorage.getItem('showNamesOnCourt')
    return saved !== 'false' // default true for beach volleyball
  })
  const setShowNamesOnCourt = (val) => {
    setShowNamesOnCourtState(val)
    localStorage.setItem('showNamesOnCourt', String(val))
  }
  const [expandedPlayerName, setExpandedPlayerName] = useState(null) // 'team1-12' | 'team2-5' | null - tracks which player name is expanded
  const [autoDownloadAtSetEnd, setAutoDownloadAtSetEnd] = useState(true)
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1366)
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 768)
  // Compact mode: landscape (width >= height) = width <= 960 OR height < 768
  //               portrait (height > width) = height <= 960 OR width < 768
  const isLandscape = viewportWidth >= viewportHeight
  const isCompactMode = isLandscape
    ? (viewportWidth <= 960 || viewportHeight < 768)
    : (viewportHeight <= 960 || viewportWidth < 768)
  const isVeryCompact = isLandscape
    ? (viewportWidth <= 800 || viewportHeight < 600)
    : (viewportHeight <= 800 || viewportWidth < 600)
  // Laptop mode: between compact (960) and full desktop (1400) - smaller UI than full desktop
  const isLaptopMode = !isCompactMode && viewportWidth > 960 && viewportWidth <= 1400
  // Narrow mode: < 1000px - collapse buttons into dropdowns, column layout for counters
  const isNarrowMode = viewportWidth < 1000
  // Short height mode: < 900px - smaller counters, clickable TO counter, hide TO button
  const isShortHeight = viewportHeight < 900
  const wsRef = useRef(null) // Store WebSocket connection for use in callbacks
  const previousMatchIdRef = useRef(null) // Track previous matchId to detect changes
  const wakeLockRef = useRef(null) // Wake lock to prevent screen sleep
  const syncFunctionRef = useRef(null) // Store sync function for use in action handlers
  const noSleepVideoRef = useRef(null) // Video element for NoSleep fallback
  const logEventRef = useRef(null) // Store latest logEvent function to avoid circular dependencies
  const scoresheetWindowRef = useRef(null) // Reference to opened eScoresheet window

  // Request wake lock to prevent screen from sleeping
  useEffect(() => {
    // Create a tiny looping video that keeps the screen awake on mobile/tablets
    const createNoSleepVideo = () => {
      if (noSleepVideoRef.current) return

      // Base64 encoded tiny MP4 video (blank, silent, loops)
      const mp4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAA1VtZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkxNyAwYTg0ZDk4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxOCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTMgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAbWWIhAAz//727L4FNf2f0JcRLMXaSnA+KqSAgHc0wAAAAwAAAwAAV/8iZ2P/4kTVAAIgAAABHQZ4iRPCv/wAAAwAAAwAAHxQSRJ2C2E0AAAMAAAMAYOLkAADAAAHPgVxpAAKGAAABvBqIAg5LAH4AABLNAAAAHEGeQniFfwAAAwAAAwACNQsIAADAAADABOvIgAAAABoBnmF0Rn8AAAMAAAMAAApFAADAAADAECGAAHUAAAAaAZ5jakZ/AAADAAADAAClYlVkAAADAAADAJdwAAAAVUGaZkmoQWyZTAhv//6qVQAAAwAACjIWAANXJ5AAVKLiPqsAAHG/pAALrZ6AAHUhqAAC8QOAAHo0KAAHqwIAAeNf4AAcfgdSAAGdg+sAAOCnAABH6AAAADdBnoRFESwn/wAAAwAAAwAB7YZ+YfJAAOwAkxZiAgABmtQACVrdYAAbcqMAAPMrOAAH1LsAAJ5gAAAAGgGeo3RGfwAAAwAAAwAAXHMAADAAADAEfmAAdQAAABoBnqVqRn8AAAMAAAMAAKReyQADAAADABYxgAAAAFVBmqpJqEFsmUwIb//+qlUAAAMAAAoWMAANXIYAAUZC4kLQAB8rCgABTxKAADq86AAFHAwAAe3E4AAdTHoAAahnMAAL7zYAAR9BcAAN0SgAASNvQAAAADdBnshFFSwn/wAAAwAAAwAB7YZ+YfJAAOwAkxZiAgABvNIACVqdYAAbcqMAAPcquAAH1LsAAJ5gAAAAGgGe53RGfwAAAwAAAwAAXHUAADAAADAEfmAAdQAAABoBnulqRn8AAAMAAAMAAKRhXQADAAADABVxgAAAAGhBmu5JqEFsmUwIb//+qlUAAAMAAH8yQAB7sgACKrBcSAAIKXS4AAd8MAAG7xwAApriMAASJiQAAXfPOAACmvmAACNqrgAB2OyYAAm0kwABRZvgABCrlAAC7SfAABqJMAAHpZugAAAzQZ8MRRUsJ/8AAAMAAAMA5nIA/VBzAADYASYsxBwAA3mjABLVOsAANuVGAAHuVnAACuYAAAAXAZ8rdEZ/AAADAAADABSsSqyAYAC6zAAAdQAAABkBny1qRn8AAAMAAAMAFGpKrIBgAMDOJKAAdQA='

      const video = document.createElement('video')
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.setAttribute('loop', '')
      video.setAttribute('src', mp4)
      video.style.position = 'fixed'
      video.style.top = '-9999px'
      video.style.left = '-9999px'
      video.style.width = '1px'
      video.style.height = '1px'
      document.body.appendChild(video)
      noSleepVideoRef.current = video

      return video
    }

    const enableNoSleep = async () => {
      // First try native Wake Lock API (works on desktop browsers)
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          wakeLockRef.current.addEventListener('release', () => { })
        }
      } catch (err) {
        // Wake lock not supported or failed
      }

      // Also use video trick as fallback (better for tablets/mobile)
      try {
        const video = createNoSleepVideo()
        if (video) {
          await video.play()
        }
      } catch (err) {
        // Video wake lock failed
      }
    }

    // Enable on user interaction (required on some devices)
    const handleInteraction = () => {
      enableNoSleep()
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
    }

    enableNoSleep()
    document.addEventListener('click', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        enableNoSleep()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
      }
      if (noSleepVideoRef.current) {
        noSleepVideoRef.current.pause()
        noSleepVideoRef.current.remove()
        noSleepVideoRef.current = null
      }
    }
  }, [])
  const [connectionStatuses, setConnectionStatuses] = useState({
    api: 'unknown',
    server: 'unknown',
    websocket: 'unknown',
    scoreboard: 'unknown',
    match: 'unknown',
    db: 'unknown'
  })
  const [connectionDebugInfo, setConnectionDebugInfo] = useState({})
  const [showDebugMenu, setShowDebugMenu] = useState(null) // Which connection type to show debug for


  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Single-tab enforcement - prevent opening scoresheet in multiple tabs for same match
  useEffect(() => {
    if (!matchId) return

    const channelName = `scoresheet-${matchId}`
    const storageKey = `scoresheet-active-${matchId}`
    const tabId = tabIdRef.current

    // Try to claim this tab as active
    const existingTab = localStorage.getItem(storageKey)
    if (existingTab && existingTab !== tabId) {
      // Another tab might be active, check via BroadcastChannel
      try {
        const channel = new BroadcastChannel(channelName)

        // Ask if any other tab is active
        const checkTimeout = setTimeout(() => {
          // No response, claim the tab
          localStorage.setItem(storageKey, tabId)
          channel.close()
        }, 200)

        channel.onmessage = (event) => {
          if (event.data.type === 'PING') {
            // Another tab is checking, respond
            channel.postMessage({ type: 'PONG', tabId: tabId })
          } else if (event.data.type === 'PONG' && event.data.tabId !== tabId) {
            // Another tab responded, this is a duplicate
            clearTimeout(checkTimeout)
            setDuplicateTabError(true)
            channel.close()
          } else if (event.data.type === 'NEW_TAB' && event.data.tabId !== tabId) {
            // A new tab just opened, tell it we're here
            channel.postMessage({ type: 'PONG', tabId: tabId })
          }
        }

        // Announce ourselves
        channel.postMessage({ type: 'NEW_TAB', tabId: tabId })

        return () => {
          clearTimeout(checkTimeout)
          channel.close()
          // Only remove from storage if we're the active tab
          if (localStorage.getItem(storageKey) === tabId) {
            localStorage.removeItem(storageKey)
          }
        }
      } catch {
        // BroadcastChannel not supported, fall back to localStorage only
        localStorage.setItem(storageKey, tabId)
      }
    } else {
      // Claim this tab as active
      localStorage.setItem(storageKey, tabId)
    }

    // Set up BroadcastChannel for ongoing communication
    let channel
    try {
      channel = new BroadcastChannel(channelName)

      channel.onmessage = (event) => {
        if (event.data.type === 'PING' || event.data.type === 'NEW_TAB') {
          // Another tab is checking or just opened, respond
          channel.postMessage({ type: 'PONG', tabId: tabId })
        }
      }
    } catch {
      // BroadcastChannel not supported
    }

    // Listen for storage events (when another tab changes localStorage)
    const handleStorage = (e) => {
      if (e.key === storageKey && e.newValue && e.newValue !== tabId) {
        // Another tab just claimed active status
        setDuplicateTabError(true)
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      if (channel) channel.close()
      // Only remove from storage if we're the active tab
      if (localStorage.getItem(storageKey) === tabId) {
        localStorage.removeItem(storageKey)
      }
    }
  }, [matchId])

  // Send heartbeat to indicate scoresheet is active
  useEffect(() => {
    if (!matchId) return

    const updateHeartbeat = async () => {
      try {
        await db.matches.update(matchId, {
          updatedAt: new Date().toISOString()
        })
      } catch (error) {
        // Silently fail - not critical
      }
    }

    // Initial heartbeat
    updateHeartbeat()

    // Update heartbeat every 10 seconds
    const interval = setInterval(updateHeartbeat, 10000)

    return () => clearInterval(interval)
  }, [matchId])

  // Clear confirmed set end tracking when match changes
  useEffect(() => {
    confirmedSetEndRef.current.clear()
  }, [matchId])

  // Track viewport size for responsive scaling
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-lock orientation to landscape for scoreboard on mount
  useEffect(() => {
    const lockLandscape = async () => {
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape')
        }
      } catch (err) {
        // Orientation lock not supported
      }
    }
    lockLandscape()

    return () => {
      // Unlock orientation when leaving scoreboard
      if (screen.orientation && screen.orientation.unlock) {
        try {
          screen.orientation.unlock()
        } catch (err) {
          // Ignore unlock errors
        }
      }
    }
  }, [])

  // Calculate scale factor for proportional viewport scaling (no cap - scales to fill available space)
  const scaleFactor = Math.min(
    viewportWidth / DESIGN_WIDTH,
    viewportHeight / DESIGN_HEIGHT
  )

  const data = useLiveQuery(async () => {
    const match = await db.matches.get(matchId)
    if (!match) return null

    // Support both old (team1TeamId/team2TeamId) and new (team1Id/team2Id) field names
    const team1TeamId = match?.team1Id || match?.team1TeamId
    const team2TeamId = match?.team2Id || match?.team2TeamId
    const [team1Team, team2Team] = await Promise.all([
      team1TeamId ? db.teams.get(team1TeamId) : null,
      team2TeamId ? db.teams.get(team2TeamId) : null
    ])

    const sets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    // Find the current set: first unfinished set, preferring highest id if duplicates exist
    // Also filter out any duplicate indices, keeping the latest one (highest id)
    const setsByIndex = new Map()
    for (const set of sets) {
      const existing = setsByIndex.get(set.index)
      if (!existing || set.id > existing.id) {
        setsByIndex.set(set.index, set)
      }
    }
    const dedupedSets = Array.from(setsByIndex.values()).sort((a, b) => a.index - b.index)
    const currentSet = dedupedSets.find(s => !s.finished) ?? null

    const [team1Players, team2Players] = await Promise.all([
      team1TeamId
        ? db.players.where('teamId').equals(team1TeamId).sortBy('number')
        : [],
      team2TeamId
        ? db.players.where('teamId').equals(team2TeamId).sortBy('number')
        : []
    ])

    // Get all events for the match (keep logs across sets)
    // Sort by seq if available, otherwise by ts
    const eventsRaw = await db.events
      .where('matchId')
      .equals(matchId)
      .toArray()

    const events = eventsRaw.sort((a, b) => {
      // Sort by sequence number if available
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) {
        return aSeq - bSeq // Ascending
      }
      // Fallback to timestamp for legacy events
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return aTime - bTime
    })

    // Log all action IDs to track sequence numbers (show only base integer IDs, not decimals)
    const baseActionIds = events
      .map(e => {
        const seq = e.seq || 0
        return Math.floor(seq) // Get integer part only
      })
      .filter(id => id > 0)
      .filter((id, index, self) => self.indexOf(id) === index) // Remove duplicates

    // Action IDs tracked internally

    const result = {
      set: currentSet,
      match,
      team1Team,
      team2Team,
      team1Players,
      team2Players,
      events,
      sets: dedupedSets
    }

    return result
  }, [matchId])

  // Check if Set 3 was already confirmed (on mount or when entering Set 3)
  useEffect(() => {
    if (!data?.set || !data?.events) return
    if (data.set.index !== 3) return

    // Check if Set 3 has already started (has points or set3_coin_toss event)
    const hasSet3CoinToss = data.events.some(e => e.type === 'set3_coin_toss' && e.setIndex === 3)
    const hasSet3Points = data.events.some(e => e.type === 'point' && e.setIndex === 3)

    if (hasSet3CoinToss || hasSet3Points) {
      setSet3SetupConfirmed(true)
    }
  }, [data?.set?.index, data?.events])



  // Helper to create state snapshot for debug logging
  const getStateSnapshot = useCallback(() => {
    if (!data) return null
    return {
      matchId: data.match?.id,
      setIndex: data.set?.index,
      team1Score: data.set?.team1Score,
      team2Score: data.set?.team2Score,
      currentServe: data.set?.currentServe,
      team1Rotation: data.set?.team1Rotation,
      team2Rotation: data.set?.team2Rotation,
      team1OnCourt: data.set?.team1OnCourt,
      team2OnCourt: data.set?.team2OnCourt,

      team1Timeouts: data.set?.team1Timeouts,
      team2Timeouts: data.set?.team2Timeouts,
      rallyInProgress: data.set?.rallyInProgress,
      team1SetsWon: data.sets?.filter(s => s.winner === 'team1').length,
      team2SetsWon: data.sets?.filter(s => s.winner === 'team2').length,
      totalEvents: data.events?.length
    }
  }, [data])

  // Load existing manual changes when panel opens
  useEffect(() => {
    if (showManualPanel && data?.match?.manualChanges) {
      setManualChangesLog(data.match.manualChanges)
    }
  }, [showManualPanel, data?.match?.manualChanges])

  // Capture FULL state snapshot for snapshot-based undo system
  // This captures everything needed to restore the match state completely
  const captureFullStateSnapshot = useCallback(async () => {
    const _ts = performance.now()
    if (!matchId) return null

    try {
      // Query fresh data from IndexedDB to avoid stale closure issues
      const match = await db.matches.get(matchId)
      if (!match) return null

      // Get current set from database
      const allSets = await db.sets.where({ matchId }).toArray()
      const currentSet = allSets.find(s => !s.finished) || allSets[allSets.length - 1]
      if (!currentSet) return null

      // Get all events from database
      const allEvents = await db.events.where({ matchId }).toArray()

      // Get players from database (support both old and new field names)
      const team1TeamIdSnapshot = match.team1Id || match.team1TeamId
      const team2TeamIdSnapshot = match.team2Id || match.team2TeamId
      const [team1PlayersDb, team2PlayersDb] = await Promise.all([
        team1TeamIdSnapshot ? db.players.where('teamId').equals(team1TeamIdSnapshot).toArray() : [],
        team2TeamIdSnapshot ? db.players.where('teamId').equals(team2TeamIdSnapshot).toArray() : []
      ])

      // Compute current state
      const finishedSets = allSets.filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

      // A/B Model: Team A = coin toss winner (constant), side_a = which side they're on
      const setIndex = currentSet.index
      const teamAKey = match.coinTossTeamA || 'team1'
      const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
      const is3rdSet = setIndex === 3
      const set3CourtSwitched = match.set3CourtSwitched
      const set3LeftTeam = match.set3LeftTeam

      // Determine which side Team A is on this set
      // setLeftTeamOverrides stores 'A' or 'B' - which team is on the LEFT
      const setLeftTeamOverrides = match.setLeftTeamOverrides || {}
      let sideA
      if (setLeftTeamOverrides[setIndex] !== undefined) {
        // Override stores 'A' or 'B', not 'team1'/'team2'
        sideA = setLeftTeamOverrides[setIndex] === 'A' ? 'left' : 'right'
      } else if (is3rdSet && set3LeftTeam) {
        // Use set3LeftTeam for Set 3 (from coin toss or manual switch)
        sideA = set3LeftTeam === 'A' ? 'left' : 'right'
      } else {
        sideA = setIndex % 2 === 1 ? 'left' : 'right'
      }

      // If Set 3 court switch at 8 points has happened, flip the sides
      if (is3rdSet && set3CourtSwitched) {
        sideA = sideA === 'left' ? 'right' : 'left'
      }

      // Team names and colors
      const teamAName = teamAKey === 'team1' ? match.team1Name : match.team2Name
      const teamBName = teamAKey === 'team1' ? match.team2Name : match.team1Name
      const teamAShort = teamAKey === 'team1' ? match.team1ShortName : match.team2ShortName
      const teamBShort = teamAKey === 'team1' ? match.team2ShortName : match.team1ShortName
      const teamAColor = teamAKey === 'team1' ? match.team1Color : match.team2Color
      const teamBColor = teamAKey === 'team1' ? match.team2Color : match.team1Color

      // Points and set scores
      const pointsA = teamAKey === 'team1' ? currentSet.team1Points : currentSet.team2Points
      const pointsB = teamAKey === 'team1' ? currentSet.team2Points : currentSet.team1Points
      const setScoreA = teamAKey === 'team1' ? team1SetsWon : team2SetsWon
      const setScoreB = teamAKey === 'team1' ? team2SetsWon : team1SetsWon

      // Current set events
      const currentSetEvents = allEvents.filter(e => e.setIndex === currentSet.index)

      // Timeouts
      const timeouts = currentSetEvents.filter(e => e.type === 'timeout').reduce((acc, e) => {
        const team = e.payload?.team
        if (team) acc[team] = (acc[team] || 0) + 1
        return acc
      }, { team1: 0, team2: 0 })
      const timeoutsA = teamAKey === 'team1' ? timeouts.team1 : timeouts.team2
      const timeoutsB = teamAKey === 'team1' ? timeouts.team2 : timeouts.team1

      // Substitutions with details team1
      const subsDetails = currentSetEvents.filter(e => e.type === 'substitution').reduce((acc, e) => {
        const team = e.payload?.team
        if (team) {
          if (!acc[team]) acc[team] = []
          acc[team].push({
            playerIn: e.payload?.playerIn,
            playerOut: e.payload?.playerOut,
            position: e.payload?.position,
            exceptional: e.payload?.exceptional || false,
            ts: e.ts
          })
        }
        return acc
      }, { team1: [], team2: [] })
      const subsA = teamAKey === 'team1' ? subsDetails.team1 : subsDetails.team2
      const subsB = teamAKey === 'team1' ? subsDetails.team2 : subsDetails.team1

      // Get lineups - check ALL events that have lineup data (lineup, rotation, substitution, etc.)
      const getLineupForTeam = (teamKey) => {
        // Find all events for this team in current set that have lineup data
        const eventsWithLineup = allEvents
          .filter(e => e.payload?.team === teamKey && e.setIndex === currentSet.index &&
            (e.payload?.lineup || e.payload?.newLineup))
          .sort((a, b) => (a.seq || 0) - (b.seq || 0))

        if (eventsWithLineup.length === 0) return null

        // Get the most recent event with lineup data
        const lastEvent = eventsWithLineup[eventsWithLineup.length - 1]
        // Prefer newLineup over lineup
        return lastEvent.payload?.newLineup || lastEvent.payload?.lineup || null
      }



      const getInitialLineupForTeam = (teamKey) => {
        const initialLineup = allEvents.find(e =>
          e.type === 'lineup' &&
          e.payload?.team === teamKey &&
          e.setIndex === currentSet.index &&
          e.payload?.isInitial === true
        )
        return initialLineup?.payload?.lineup || null
      }

      const rawLineupA = getLineupForTeam(teamAKey)
      const rawLineupB = getLineupForTeam(teamBKey)
      const initialLineupA = getInitialLineupForTeam(teamAKey)
      const initialLineupB = getInitialLineupForTeam(teamBKey)


      // Captain info
      const getCaptainInfo = (playersDb) => {
        const captain = playersDb.find(p => p.isCaptain || p.captain)
        return captain ? captain.number : null
      }
      const teamAPlayersDb = teamAKey === 'team1' ? team1PlayersDb : team2PlayersDb
      const teamBPlayersDb = teamAKey === 'team1' ? team2PlayersDb : team1PlayersDb
      const captainA = getCaptainInfo(teamAPlayersDb)
      const captainB = getCaptainInfo(teamBPlayersDb)
      const courtCaptainA = teamAKey === 'team1' ? match.team1CourtCaptain : match.team2CourtCaptain
      const courtCaptainB = teamBKey === 'team1' ? match.team1CourtCaptain : match.team2CourtCaptain

      // Serving team calculation
      const pointEvents = allEvents
        .filter(e => e.type === 'point' && e.setIndex === currentSet.index)
        .sort((a, b) => (b.seq || 0) - (a.seq || 0))

      const set1FirstServe = match.firstServe || 'team1'
      let currentSetFirstServe
      if (setIndex === 3 && match.set3FirstServe) {
        currentSetFirstServe = match.set3FirstServe === 'A' ? teamAKey : teamBKey
      } else if (setIndex === 3) {
        // Set 3 default: opposite of set 2 first serve
        const set2First = match.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
        currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
      } else if (setIndex === 2 && match.set2FirstServe) {
        currentSetFirstServe = match.set2FirstServe
      } else if (setIndex === 2) {
        currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
      } else {
        currentSetFirstServe = set1FirstServe
      }

      const servingTeam = pointEvents.length > 0 ? (pointEvents[0].payload?.team || currentSetFirstServe) : currentSetFirstServe
      const servingTeamLineup = getLineupForTeam(servingTeam)
      // In beach volleyball, first server is position I (if this team serves first) or II (if second)
      const serverNumber = servingTeamLineup?.['I'] ? Number(servingTeamLineup['I'])
        : servingTeamLineup?.['II'] ? Number(servingTeamLineup['II']) : null

      // Sanctions
      const getSanctionsForTeam = (teamKey) => {
        return currentSetEvents
          .filter(e => e.type === 'sanction' && e.payload?.team === teamKey)
          .map(e => ({
            player: e.payload?.playerNumber || null,
            type: e.payload?.type || e.payload?.sanctionType,
            playerType: e.payload?.playerType || null,
            position: e.payload?.position || null,
            role: e.payload?.role || null,
            ts: e.ts
          }))
      }
      const sanctionsA = getSanctionsForTeam(teamAKey)
      const sanctionsB = getSanctionsForTeam(teamBKey)

      // Match-wide sanctions (team, players) - persist across sets
      const getMatchTeamSanctionsForTeam = (teamKey) => {
        return allEvents
          .filter(e => e.type === 'sanction' && e.payload?.team === teamKey)
          .map(e => ({
            player: e.payload?.playerNumber || null,
            type: e.payload?.type || e.payload?.sanctionType,
            playerType: e.payload?.playerType || null,
            position: e.payload?.position || null,
            role: e.payload?.role || null,
            ts: e.ts
          }))
      }
      const matchTeamSanctionsA = getMatchTeamSanctionsForTeam(teamAKey)
      const matchTeamSanctionsB = getMatchTeamSanctionsForTeam(teamBKey)

      // Build rich lineup
      const buildRichLineup = (rawLineup, initialLineup, playersDb, sanctions, isServingTeam, captainNum, courtCaptainNum) => {
        if (!rawLineup) return null

        const backRowPositions = ['I', 'V', 'VI']
        const richLineup = {}

        // Check if team captain is on court - if so, don't show court captain badge for anyone
        const captainOnCourt = captainNum && Object.values(rawLineup).some(num => String(num) === String(captainNum))

        for (const position of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
          const playerNum = rawLineup[position]
          if (!playerNum) continue

          const playerNumStr = String(playerNum)
          const player = playersDb.find(p => String(p.number) === playerNumStr)
          const isBackRow = backRowPositions.includes(position)


          const isInInitialLineup = initialLineup && Object.values(initialLineup).some(num => String(num) === playerNumStr)


          const playerSanctions = sanctions.filter(s => String(s.player) === playerNumStr)
          const hasSanction = playerSanctions.length > 0

          const isCaptain = !!(captainNum && String(captainNum) === playerNumStr)
          // Only show court captain badge if team captain is NOT on court
          const isCourtCaptain = !captainOnCourt && !!(courtCaptainNum && String(courtCaptainNum) === playerNumStr)

          const positionData = {
            number: Number(playerNum),
            hasSanction,
            isCaptain,
            isCourtCaptain
          }

          // In beach volleyball, positions I and II are the first servers for each team
          if (position === 'I' || position === 'II') {
            positionData.isServing = isServingTeam
          }



          if (hasSanction) {
            positionData.sanctions = playerSanctions.map(s => ({ type: s.type, ts: s.ts }))
          }

          richLineup[position] = positionData
        }

        return Object.keys(richLineup).length > 0 ? richLineup : null
      }

      const lineupA = buildRichLineup(rawLineupA, initialLineupA, teamAPlayersDb, sanctionsA, servingTeam === teamAKey, captainA, courtCaptainA)
      const lineupB = buildRichLineup(rawLineupB, initialLineupB, teamBPlayersDb, sanctionsB, servingTeam === teamBKey, captainB, courtCaptainB)

      // Check rally status
      const lastRallyStart = currentSetEvents.filter(e => e.type === 'rally_start').sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
      const lastPoint = pointEvents[0]
      const rallyInProgress = lastRallyStart && (!lastPoint || (lastRallyStart.seq || 0) > (lastPoint.seq || 0))

      // Build set results history
      const setResults = finishedSets.map(s => ({
        index: s.index,
        pointsA: teamAKey === 'team1' ? s.team1Points : s.team2Points,
        pointsB: teamAKey === 'team1' ? s.team2Points : s.team1Points,
        winner: s.team1Points > s.team2Points ? (teamAKey === 'team1' ? 'A' : 'B') : (teamAKey === 'team1' ? 'B' : 'A')
      }))

      return {
        // Match info
        matchId,
        matchStatus: match.status || 'live',
        teamAKey,
        teamAName,
        teamAShort: teamAShort || teamAName?.substring(0, 3).toUpperCase(),
        teamAColor: teamAColor || '#ef4444',
        teamBName,
        teamBShort: teamBShort || teamBName?.substring(0, 3).toUpperCase(),
        teamBColor: teamBColor || '#3b82f6',

        // Current set
        currentSetIndex: setIndex,
        sideA,
        pointsA,
        pointsB,
        setScoreA,
        setScoreB,

        // Lineups (rich format)
        lineupA,
        lineupB,

        // Game flow
        servingTeam,
        serverNumber,
        rallyInProgress: !!rallyInProgress,

        // Counts & history
        timeoutsA,
        timeoutsB,
        subsA,
        subsB,
        sanctionsA,
        sanctionsB,
        matchTeamSanctionsA,
        matchTeamSanctionsB,

        // Set results history
        setResults,

        // Match flags
        set3CourtSwitched: !!set3CourtSwitched,
        set3LeftTeam: set3LeftTeam || null
      }
    } catch (err) {
      console.error('[captureFullStateSnapshot] Error:', err)
      return null
    }
  }, [matchId])

  // Restore match state from a snapshot (used by undo)
  const restoreStateFromSnapshot = useCallback(async (snapshot) => {
    if (!snapshot || !matchId) return

    try {
      // Get current set
      const allSets = await db.sets.where({ matchId }).toArray()
      const currentSet = allSets.find(s => s.index === snapshot.currentSetIndex)
      if (!currentSet) return

      // Restore set score
      const teamAKey = snapshot.teamAKey || 'team1'
      await db.sets.update(currentSet.id, {
        team1Points: teamAKey === 'team1' ? snapshot.pointsA : snapshot.pointsB,
        team2Points: teamAKey === 'team1' ? snapshot.pointsB : snapshot.pointsA,
        finished: false
      })

      // Restore match status if needed
      const match = await db.matches.get(matchId)
      if (match && match.status !== snapshot.matchStatus) {
        await db.matches.update(matchId, { status: snapshot.matchStatus })
      }

      // Restore set3 (tie break) court switch flag
      if (snapshot.currentSetIndex === 3 && match) {
        await db.matches.update(matchId, {
          set3CourtSwitched: snapshot.set3CourtSwitched || false
        })
      }
    } catch (err) {
      console.error('[restoreStateFromSnapshot] Error:', err)
    }
  }, [matchId])

  // Connect to WebSocket server and sync match data
  useEffect(() => {
    // If no matchId, clear all matches from server (scoreboard is source of truth)
    if (!matchId) {
      const clearAllMatches = () => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              type: 'clear-all-matches'
            }))
          } catch (err) {
            // Silently ignore
          }
        }
      }

      // Try to clear immediately if WebSocket is open
      clearAllMatches()

      // Also set up a connection to clear when WebSocket opens
      // Use configured backend URL if available (Railway/cloud)
      const backendUrl = import.meta.env.VITE_BACKEND_URL
      let wsUrl
      if (backendUrl) {
        const url = new URL(backendUrl)
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${protocol}//${url.host}`
      } else {
        // Fallback to local WebSocket server
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const hostname = window.location.hostname
        const wsPort = 8080
        wsUrl = `${protocol}://${hostname}:${wsPort}`
      }

      const tempWs = new WebSocket(wsUrl)
      tempWs.onopen = () => {
        tempWs.send(JSON.stringify({ type: 'clear-all-matches' }))
        tempWs.close()
      }
      tempWs.onerror = () => {
        // Ignore - server might not be running
      }

      return () => {
        if (tempWs.readyState === WebSocket.OPEN || tempWs.readyState === WebSocket.CONNECTING) {
          tempWs.close()
        }
      }
    }

    if (!data || !data.match) {
      // Data is still loading - this is expected, wait for it
      return
    }

    let ws = null
    let reconnectTimeout = null

    const connectWebSocket = () => {
      try {
        // Check if we have a configured backend URL (Railway/cloud backend)
        const backendUrl = import.meta.env.VITE_BACKEND_URL

        let wsUrl
        if (backendUrl) {
          // Use configured backend (Railway cloud)
          const url = new URL(backendUrl)
          const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          wsUrl = `${protocol}//${url.host}`
        } else {
          // Fallback to local WebSocket server (development/Electron)
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
          const hostname = window.location.hostname
          let wsPort = 8080
          // Check if we have server status (from Electron or previous API call)
          const currentServerStatus = serverStatus
          if (currentServerStatus?.wsPort) {
            wsPort = currentServerStatus.wsPort
          }
          wsUrl = `${protocol}://${hostname}:${wsPort}`
        }

        ws = new WebSocket(wsUrl)
        wsRef.current = ws // Store in ref for use in callbacks

        // Set error handler first to catch any immediate errors
        ws.onerror = () => {
          // Suppress - browser will show native errors if needed
        }

        ws.onopen = () => {
          // Clear all other matches first (scoreboard is source of truth - only current match should exist)
          try {
            ws.send(JSON.stringify({
              type: 'clear-all-matches',
              keepMatchId: String(matchId) // Keep only the current match
            }))
          } catch (err) {
            // Silently ignore WebSocket errors
          }

          // Send initial match data sync (this will overwrite/add the current match)
          // No periodic sync - data is synced only when actions occur
          syncMatchData()
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)

            if (message.type === 'pin-validation-request') {
              // Respond to PIN validation request
              handlePinValidationRequest(message)
            } else if (message.type === 'match-data-request') {
              // Respond to match data request
              handleMatchDataRequest(message)
            } else if (message.type === 'game-number-request') {
              // Respond to game number request
              handleGameNumberRequest(message)
            } else if (message.type === 'pong') {
              // Heartbeat response
            }
          } catch (err) {
            // console.error('[WebSocket] Error parsing message:', err)
          }
        }


        ws.onclose = (event) => {
          // Don't reconnect on normal closure (code 1000)
          if (event.code === 1000) {
            return
          }
          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(connectWebSocket, 5000)
        }
      } catch (err) {
        // Silently ignore WebSocket connection errors in development/test
      }
    }

    const syncMatchData = async () => {
      // Use wsRef.current to always get the current WebSocket (not stale closure)
      const currentWs = wsRef.current
      if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
        return
      }

      try {
        // Fetch ALL fresh data from IndexedDB (not from React state which may be stale due to closures)
        const freshMatch = await db.matches.get(matchId)
        if (!freshMatch) return

        // Support both old and new field names
        const freshteam1TeamId = freshMatch?.team1Id || freshMatch?.team1TeamId
        const freshteam2TeamId = freshMatch?.team2Id || freshMatch?.team2TeamId
        const [freshteam1Team, freshteam2Team, freshSets, freshEvents, freshteam1Players, freshteam2Players] = await Promise.all([
          freshteam1TeamId ? db.teams.get(freshteam1TeamId) : null,
          freshteam2TeamId ? db.teams.get(freshteam2TeamId) : null,
          db.sets.where('matchId').equals(matchId).toArray(),
          db.events.where('matchId').equals(matchId).toArray(),
          freshteam1TeamId ? db.players.where('teamId').equals(freshteam1TeamId).toArray() : [],
          freshteam2TeamId ? db.players.where('teamId').equals(freshteam2TeamId).toArray() : []
        ])

        // Sync full match data to server - this ALWAYS overwrites existing data (scoreboard is source of truth)
        // The server will replace all data for this matchId with this data
        const sendTimestamp = Date.now()
        const syncPayload = {
          type: 'sync-match-data',
          matchId: matchId,
          match: freshMatch,
          team1Team: freshteam1Team || null,
          team2Team: freshteam2Team || null,
          team1Players: freshteam1Players || [],
          team2Players: freshteam2Players || [],
          sets: freshSets || [],
          events: freshEvents || [],
          _timestamp: sendTimestamp // Track when sent from scoreboard
        }

        currentWs.send(JSON.stringify(syncPayload))
      } catch (err) {
        // console.error('[WebSocket] Error syncing match data:', err)
      }
    }

    // Store sync function in ref so it can be called from action handlers
    syncFunctionRef.current = syncMatchData

    const handlePinValidationRequest = async (request) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      try {
        const { pin, pinType, requestId } = request
        const pinStr = String(pin).trim()

        // Fetch fresh match data from IndexedDB (not from React state which may be stale due to closures)
        const freshMatch = await db.matches.get(matchId)
        if (!freshMatch) {
          ws.send(JSON.stringify({
            type: 'pin-validation-response',
            requestId,
            success: false,
            error: 'Match not found'
          }))
          return
        }

        // Check if PIN matches
        let matchPin = null
        let connectionEnabled = false

        if (pinType === 'referee') {
          matchPin = freshMatch.refereePin
          connectionEnabled = freshMatch.refereeConnectionEnabled === true
        } else if (pinType === 'team1Team') {
          matchPin = freshMatch.team1TeamPin
          connectionEnabled = freshMatch.team1TeamConnectionEnabled === true
        } else if (pinType === 'team2Team') {
          matchPin = freshMatch.team2TeamPin
          connectionEnabled = freshMatch.team2TeamConnectionEnabled === true
        }

        if (matchPin && String(matchPin).trim() === pinStr && connectionEnabled && freshMatch.status !== 'final') {
          // Fetch all related data fresh from IndexedDB (support both old and new field names)
          const pinteam1TeamId = freshMatch?.team1Id || freshMatch?.team1TeamId
          const pinteam2TeamId = freshMatch?.team2Id || freshMatch?.team2TeamId
          const [freshteam1Team, freshteam2Team, freshSets, freshEvents, freshteam1Players, freshteam2Players] = await Promise.all([
            pinteam1TeamId ? db.teams.get(pinteam1TeamId) : null,
            pinteam2TeamId ? db.teams.get(pinteam2TeamId) : null,
            db.sets.where('matchId').equals(matchId).toArray(),
            db.events.where('matchId').equals(matchId).toArray(),
            pinteam1TeamId ? db.players.where('teamId').equals(pinteam1TeamId).toArray() : [],
            pinteam2TeamId ? db.players.where('teamId').equals(pinteam2TeamId).toArray() : []
          ])

          // Send match data with full data
          ws.send(JSON.stringify({
            type: 'pin-validation-response',
            requestId,
            success: true,
            match: {
              id: freshMatch.id,
              refereePin: freshMatch.refereePin,
              team1TeamPin: freshMatch.team1TeamPin,
              team2TeamPin: freshMatch.team2TeamPin,
              team1TeamUploadPin: freshMatch.team1TeamUploadPin,
              team2TeamUploadPin: freshMatch.team2TeamUploadPin,
              refereeConnectionEnabled: freshMatch.refereeConnectionEnabled,
              team1TeamConnectionEnabled: freshMatch.team1TeamConnectionEnabled,
              team2TeamConnectionEnabled: freshMatch.team2TeamConnectionEnabled,
              status: freshMatch.status,
              team1TeamId: freshMatch.team1TeamId,
              team2TeamId: freshMatch.team2TeamId,
              gameNumber: freshMatch.gameNumber,
              game_n: freshMatch.game_n,
              createdAt: freshMatch.createdAt,
              updatedAt: freshMatch.updatedAt
            },
            fullData: {
              matchId: matchId,
              match: freshMatch,
              team1Team: freshteam1Team || null,
              team2Team: freshteam2Team || null,
              team1Players: freshteam1Players || [],
              team2Players: freshteam2Players || [],
              sets: freshSets || [],
              events: freshEvents || []
            }
          }))
        } else {
          // PIN doesn't match or connection disabled
          ws.send(JSON.stringify({
            type: 'pin-validation-response',
            requestId,
            success: false,
            error: connectionEnabled === false
              ? 'Connection is disabled for this match'
              : 'Invalid PIN code'
          }))
        }
      } catch (err) {
        // console.error('[WebSocket] Error handling PIN validation:', err)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'pin-validation-response',
            requestId: request.requestId,
            success: false,
            error: 'Error validating PIN'
          }))
        }
      }
    }

    const handleMatchDataRequest = async (request) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      try {
        const { requestId, matchId: requestedMatchId } = request

        if (String(requestedMatchId) !== String(matchId)) {
          ws.send(JSON.stringify({
            type: 'match-data-response',
            requestId,
            matchId: requestedMatchId,
            success: false,
            error: 'Match ID mismatch'
          }))
          return
        }

        // Fetch ALL fresh data from IndexedDB (not from React state which may be stale due to closures)
        const freshMatch = await db.matches.get(matchId)
        if (!freshMatch) {
          ws.send(JSON.stringify({
            type: 'match-data-response',
            requestId,
            matchId: requestedMatchId,
            success: false,
            error: 'Match not found in database'
          }))
          return
        }

        // Support both old and new field names
        const reqteam1TeamId = freshMatch?.team1Id || freshMatch?.team1TeamId
        const reqteam2TeamId = freshMatch?.team2Id || freshMatch?.team2TeamId
        const [freshteam1Team, freshteam2Team, freshSets, freshEvents, freshteam1Players, freshteam2Players] = await Promise.all([
          reqteam1TeamId ? db.teams.get(reqteam1TeamId) : null,
          reqteam2TeamId ? db.teams.get(reqteam2TeamId) : null,
          db.sets.where('matchId').equals(matchId).toArray(),
          db.events.where('matchId').equals(matchId).toArray(),
          reqteam1TeamId ? db.players.where('teamId').equals(reqteam1TeamId).toArray() : [],
          reqteam2TeamId ? db.players.where('teamId').equals(reqteam2TeamId).toArray() : []
        ])

        ws.send(JSON.stringify({
          type: 'match-data-response',
          requestId,
          matchId: matchId,
          success: true,
          data: {
            match: freshMatch,
            team1Team: freshteam1Team || null,
            team2Team: freshteam2Team || null,
            team1Players: freshteam1Players || [],
            team2Players: freshteam2Players || [],
            sets: freshSets || [],
            events: freshEvents || []
          }
        }))
      } catch (err) {
        // console.error('[WebSocket] Error handling match data request:', err)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'match-data-response',
            requestId: request.requestId,
            matchId: request.matchId,
            success: false,
            error: 'Error fetching match data'
          }))
        }
      }
    }

    const handleGameNumberRequest = async (request) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !data?.match) return

      try {
        const { requestId, gameNumber } = request
        const gameNumStr = String(gameNumber).trim()

        const matchGameNumber = String(data.match.gameNumber || '')
        const matchGameN = String(data.match.game_n || '')
        const matchIdStr = String(data.match.id || '')

        if (matchGameNumber === gameNumStr || matchGameN === gameNumStr || matchIdStr === gameNumStr) {
          ws.send(JSON.stringify({
            type: 'game-number-response',
            requestId,
            success: true,
            match: data.match,
            matchId: matchId
          }))
        } else {
          ws.send(JSON.stringify({
            type: 'game-number-response',
            requestId,
            success: false,
            error: 'Match not found with this game number'
          }))
        }
      } catch (err) {
        // console.error('[WebSocket] Error handling game number request:', err)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'game-number-response',
            requestId: request.requestId,
            success: false,
            error: 'Error finding match'
          }))
        }
      }
    }

    // Removed handleMatchUpdateRequest - using sync-match-data instead

    // When matchId changes, clear the old match from server
    if (previousMatchIdRef.current && previousMatchIdRef.current !== matchId) {
      const oldMatchId = previousMatchIdRef.current
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'delete-match',
            matchId: String(oldMatchId)
          }))
        } catch (err) {
          // Silently ignore
        }
      }
    }
    previousMatchIdRef.current = matchId

    // Connect to WebSocket
    connectWebSocket()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)

      // Clear all matches from server when component unmounts (scoreboard is source of truth)
      if (wsRef.current) {
        const ws = wsRef.current
        const readyState = ws.readyState

        // Clear all matches from server before closing
        if (readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              type: 'clear-all-matches'
            }))
          } catch (err) {
            // Silently ignore errors during cleanup
          }
        }

        // Remove all handlers first to prevent error logs
        try {
          ws.onerror = null
          ws.onclose = null
          ws.onopen = null
          ws.onmessage = null
        } catch (err) {
          // Ignore if handlers can't be set
        }

        // Only try to close if connection is OPEN
        // Don't close if CONNECTING - let it fail naturally to avoid browser errors
        if (readyState === WebSocket.OPEN) {
          try {
            ws.close(1000, 'Component unmounting')
          } catch (err) {
            // Ignore errors during cleanup
          }
        }
        // For CONNECTING or CLOSING states, just null the ref
        wsRef.current = null
      }
    }
  }, [matchId, serverStatus])

  // Sync when connection settings change (e.g., referee dashboard enabled/disabled)
  useEffect(() => {
    if (syncFunctionRef.current && data?.match) {
      syncFunctionRef.current()
    }
  }, [data?.match?.refereeConnectionEnabled, data?.match?.team1TeamConnectionEnabled, data?.match?.team2TeamConnectionEnabled])

  // Sync data to referee - call this after any action that changes match data
  // If WebSocket isn't ready, retry after a short delay
  const syncToReferee = useCallback(() => {
    if (syncFunctionRef.current) {
      syncFunctionRef.current()
    }
    // If WebSocket isn't connected, try again after a short delay
    // This handles cases where lineup is saved while WebSocket is temporarily disconnected
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setTimeout(() => {
        if (syncFunctionRef.current) {
          syncFunctionRef.current()
        }
      }, 1000)
    }
  }, [])

  // Send action to referee for showing modals/countdowns
  const sendActionToReferee = useCallback((actionType, actionData) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    const sendTimestamp = Date.now()
    const actionPayload = {
      type: 'match-action',
      matchId: matchId,
      action: actionType,
      data: actionData,
      timestamp: sendTimestamp,
      _timestamp: sendTimestamp // For latency tracking
    }

    ws.send(JSON.stringify(actionPayload))
  }, [matchId])

  // Sync live state to Supabase for referee.openvolley.app
  // SIMPLIFIED: Uses stateSnapshot from events instead of recomputing everything
  // cachedSnapshot: Optional snapshot passed from logEvent to avoid re-fetching/re-computing
  const syncLiveStateToSupabase = useCallback(async (eventType, eventTeam, eventData, cachedSnapshot = null) => {
    const _tl = performance.now()
    if (!supabase || !matchId) return

    try {
      // Get match to check if it's a test match
      const match = await db.matches.get(matchId)
      if (!match || match.test) return

      // Get the Supabase match UUID
      let supabaseMatchId = null
      const externalId = match.externalId
      if (externalId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId)) {
        supabaseMatchId = externalId
      } else {
        const seedKey = match.seed_key || String(matchId)
        const { data: matchData, error } = await supabase
          .from('matches')
          .select('id')
          .eq('external_id', seedKey)
          .eq('sport_type', SPORT_TYPE)
          .maybeSingle()
        if (error || !matchData) return
        supabaseMatchId = matchData.id
      }
      if (!supabaseMatchId) return

      // Use cached snapshot if provided, otherwise fetch/compute
      let snapshot = cachedSnapshot
      if (!snapshot) {
        if (eventType?.startsWith('manual_')) {
          // Manual change - must capture fresh to reflect the change
          snapshot = await captureFullStateSnapshot()
        } else {
          // Try to get the latest event's stateSnapshot using compound index
          const lastEvent = await db.events.where('[matchId+seq]').between([matchId, Dexie.minKey], [matchId, Dexie.maxKey]).last()
          snapshot = lastEvent?.stateSnapshot

          // Fallback: capture fresh snapshot if none exists (e.g., before first event)
          if (!snapshot) {
            snapshot = await captureFullStateSnapshot()
          }
        }
      }
      if (!snapshot) return

      // Determine match status from event type and current state
      const isSetInterval = eventType === 'set_end' || (match?.status === 'interval' && !isSetFinished)
      const isTimeout = eventType === 'timeout' || (timeoutModal !== null)

      // If it's a timeout, we need a stable start time
      const timeoutStartedAt = eventType === 'timeout'
        ? new Date().toISOString()
        : (timeoutModal?.startedAt || new Date().toISOString())

      // For intervals, we also need a stable start time
      const intervalStartedAt = eventType === 'set_end'
        ? new Date().toISOString()
        : (match?.intervalStartedAt || null)

      // For set_end, we need to show the NEXT set state (interval between sets)
      // The snapshot still has the OLD set data, so we override for set_end
      const nextSetIndex = isSetInterval ? snapshot.currentSetIndex + 1 : snapshot.currentSetIndex

      // Calculate updated set scores including the just-finished set
      // eventData.winner is 'team1' or 'team2' from the set_end event
      // Fallback: if eventData.winner is undefined, calculate from snapshot points
      const setWinner = eventData?.winner
        || (snapshot.pointsA > snapshot.pointsB ? snapshot.teamAKey : null)
        || (snapshot.pointsB > snapshot.pointsA ? snapshot.teamBKey : null)
      const updatedSetScoreA = isSetInterval && setWinner
        ? (setWinner === snapshot.teamAKey ? snapshot.setScoreA + 1 : snapshot.setScoreA)
        : snapshot.setScoreA
      const updatedSetScoreB = isSetInterval && setWinner
        ? (setWinner === snapshot.teamBKey ? snapshot.setScoreB + 1 : snapshot.setScoreB)
        : snapshot.setScoreB

      // Check if match is finished (best-of-3: one team won 2 sets) - don't increment current_set past the final set
      const isMatchFinished = updatedSetScoreA >= 2 || updatedSetScoreB >= 2
      const finalSetIndex = isSetInterval && isMatchFinished ? snapshot.currentSetIndex : nextSetIndex

      // Determine match status - 'ended' takes priority over interval
      let matchStatus = 'in_progress'
      if (isMatchFinished) matchStatus = 'ended'
      else if (isTimeout) matchStatus = 'timeout'
      else if (isSetInterval) matchStatus = 'interval'

      // Calculate side for next set (odd sets: A on left, even sets: A on right)
      // This follows the standard volleyball alternation pattern
      const nextSideA = isSetInterval
        ? (nextSetIndex % 2 === 1 ? 'left' : 'right')
        : snapshot.sideA

      // For interval, points reset to 0 for the new set
      const nextPointsA = isSetInterval ? 0 : snapshot.pointsA
      const nextPointsB = isSetInterval ? 0 : snapshot.pointsB

      // Calculate serving team for next set (for set_end, use alternation pattern)
      let nextServingTeam = snapshot.servingTeam
      if (isSetInterval) {
        // Calculate who serves first in the next set based on alternation pattern
        const set1FirstServe = match.firstServe || 'team1'
        const teamAKey = snapshot.teamAKey
        const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'

        let nextSetFirstServe
        if (nextSetIndex === 3 && match.set3FirstServe) {
          // Set 3 uses coin toss result (stored as 'A' or 'B')
          nextSetFirstServe = match.set3FirstServe === 'A' ? teamAKey : teamBKey
        } else if (nextSetIndex === 3) {
          // Set 3 without set3FirstServe specified - use default (last server from set 2)
          const set2First = match.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
          nextSetFirstServe = set2First === 'team1' ? 'team2' : 'team1' // Opposite of who started set 2
        } else if (nextSetIndex === 2 && match.set2FirstServe) {
          // Set 2 uses editable set2FirstServe if set
          nextSetFirstServe = match.set2FirstServe
        } else if (nextSetIndex === 2) {
          // Set 2 default: opposite of set 1 first serve (who served last in set 1)
          nextSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
        } else {
          // Set 1: use firstServe
          nextSetFirstServe = set1FirstServe
        }
        nextServingTeam = nextSetFirstServe
      }

      // Map directly from snapshot to Supabase table
      const liveStateData = {
        match_id: supabaseMatchId,
        current_set: finalSetIndex,
        // Team A/B info (from snapshot)
        team_a_name: snapshot.teamAName,
        team_a_short: snapshot.teamAShort,
        team_a_color: snapshot.teamAColor,
        team_b_name: snapshot.teamBName,
        team_b_short: snapshot.teamBShort,
        team_b_color: snapshot.teamBColor,
        // Scores by team (updated for set_end)
        sets_won_a: updatedSetScoreA,
        sets_won_b: updatedSetScoreB,
        points_a: nextPointsA,
        points_b: nextPointsB,
        // Which side Team A is on (updated for set_end)
        side_a: nextSideA,
        // Rich lineups with all position data
        lineup_a: snapshot.lineupA,
        lineup_b: snapshot.lineupB,
        // Timeouts and subs (send full array for referee to see substitution details)
        timeouts_a: snapshot.timeoutsA,
        timeouts_b: snapshot.timeoutsB,
        subs_a: snapshot.subsA?.length > 0 ? snapshot.subsA : null,
        subs_b: snapshot.subsB?.length > 0 ? snapshot.subsB : null,
        // All sanctions (team, players) - match-wide, persist across sets
        sanctions_a: snapshot.matchTeamSanctionsA?.length > 0 ? snapshot.matchTeamSanctionsA : null,
        sanctions_b: snapshot.matchTeamSanctionsB?.length > 0 ? snapshot.matchTeamSanctionsB : null,
        // Serving team (convert to left/right) - use next set values for set_end
        serving_team: nextServingTeam === snapshot.teamAKey ? nextSideA : (nextSideA === 'left' ? 'right' : 'left'),
        // Event info
        last_event_type: eventType || null,
        last_event_team: eventTeam || null,
        last_event_data: eventData || null,
        last_event_ts: new Date().toISOString(),
        timeout_active: isTimeout,
        timeout_started_at: isTimeout ? (timeoutModal?.startedAt || timeoutStartedAt) : null,
        set_interval_active: isSetInterval,
        set_interval_started_at: isSetInterval ? (match?.intervalStartedAt || intervalStartedAt) : null,
        match_status: matchStatus,
        scorer_attention_trigger: scorerAttentionTrigger,
        // Match metadata (from IndexedDB match record)
        game_n: match.gameN || match.game_n || null,
        league: match.league || null,
        gender: match.match_type_2 || null,
        updated_at: new Date().toISOString()
      }

      // DIRECT SUPABASE WRITE (bypasses sync_queue) - see architecture note at top of file
      // Reason: match_live_state needs sub-second latency for real-time spectator display.
      // Queuing would add 1s+ delay from the polling interval in useSyncQueue.
      const [liveStateResult, matchResult] = await Promise.all([
        supabase.from('match_live_state').upsert(liveStateData, { onConflict: 'match_id' }),
        supabase.from('matches').update({ current_set: finalSetIndex }).eq('id', supabaseMatchId)
      ])

      if (liveStateResult.error) {
        console.error('[LiveState] Sync error:', liveStateResult.error)
        // Show error notification for direct write failure
        setScoresheetErrorModal({
          error: t('errors.syncFailed'),
          details: liveStateResult.error.message || t('errors.databaseWriteError')
        })
      } else {
      }

      if (matchResult.error) {
        console.error('[LiveState] Match current_set update error:', matchResult.error)
        // matchResult error is also critical but usually fails together with liveState
        if (!liveStateResult.error) {
          setScoresheetErrorModal({
            error: t('errors.syncFailed'),
            details: matchResult.error.message || t('errors.databaseWriteError')
          })
        }
      }
    } catch (err) {
      console.error('[LiveState] Exception:', err)
    }
  }, [matchId, captureFullStateSnapshot])



  // Check connection statuses
  const checkConnectionStatuses = useCallback(async () => {
    const statuses = {
      api: 'unknown',
      server: 'unknown',
      websocket: 'unknown',
      scoreboard: 'unknown',
      match: 'unknown',
      db: 'unknown'
    }
    const debugInfo = {}

    // Get the backend URL - use VITE_BACKEND_URL if configured, otherwise relative URL
    const backendUrl = import.meta.env.VITE_BACKEND_URL || ''
    const isStaticHosting = !import.meta.env.DEV && (
      window.location.hostname.includes('github.io') ||
      window.location.hostname.endsWith('.openvolley.app') // All openvolley.app subdomains are static
    )

    // Skip API checks if on static hosting AND no backend URL configured
    if (isStaticHosting && !backendUrl) {
      statuses.api = 'n/a'
      statuses.server = 'n/a'
      statuses.websocket = 'n/a'
      debugInfo.api = { status: 'n/a', message: 'Static hosting - no backend configured' }
      debugInfo.server = { status: 'n/a', message: 'Static hosting - no backend configured' }
      debugInfo.websocket = { status: 'n/a', message: 'Static hosting - no WebSocket configured' }
    } else try {
      // Use configured backend URL or relative URL
      const apiUrl = backendUrl ? `${backendUrl}/api/match/list` : '/api/match/list'
      const response = await fetch(apiUrl)
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

    // Check WebSocket connection
    if (wsRef.current) {
      const ws = wsRef.current
      if (ws.readyState === WebSocket.OPEN) {
        statuses.websocket = 'connected'
      } else if (ws.readyState === WebSocket.CONNECTING) {
        statuses.websocket = 'connecting'
      } else {
        statuses.websocket = 'disconnected'
      }
    } else {
      // Test if WebSocket server is available
      try {
        // Use configured backend URL if available (Railway/cloud)
        const backendUrlForWs = import.meta.env.VITE_BACKEND_URL
        let wsUrl
        if (backendUrlForWs) {
          const url = new URL(backendUrlForWs)
          const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          wsUrl = `${protocol}//${url.host}`
        } else {
          // Fallback to local WebSocket server
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
          const hostname = window.location.hostname
          const wsPort = serverStatus?.wsPort || 8080
          wsUrl = `${protocol}://${hostname}:${wsPort}`
        }

        const wsTest = new WebSocket(wsUrl)
        let resolved = false

        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true
              try {
                if (wsTest.readyState === WebSocket.CONNECTING || wsTest.readyState === WebSocket.OPEN) {
                  wsTest.close()
                }
              } catch (e) {
                // Ignore errors when closing
              }
              statuses.websocket = 'disconnected'
              resolve()
            }
          }, 2000)

          wsTest.onopen = () => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              try {
                wsTest.close()
              } catch (e) {
                // Ignore errors when closing
              }
              statuses.websocket = 'connected'
              resolve()
            }
          }

          wsTest.onerror = () => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              try {
                if (wsTest.readyState === WebSocket.CONNECTING || wsTest.readyState === WebSocket.OPEN) {
                  wsTest.close()
                }
              } catch (e) {
                // Ignore errors when closing
              }
              statuses.websocket = 'disconnected'
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
      }
    }

    // Check Scoreboard connection (same as server for now)
    statuses.scoreboard = statuses.server

    // Check Match status
    if (data?.match) {
      statuses.match = data.match.status === 'live' ? 'live' : data.match.status === 'scheduled' ? 'scheduled' : data.match.status === 'final' ? 'final' : 'unknown'
    } else {
      statuses.match = 'no_match'
    }

    // Check DB (IndexedDB) - always available in browser
    try {
      await db.matches.count()
      statuses.db = 'connected'
    } catch (err) {
      statuses.db = 'disconnected'
    }

    setConnectionStatuses(statuses)
  }, [data?.match, serverStatus])

  // Periodically check connection statuses (60s interval to reduce console spam when server is down)
  useEffect(() => {
    checkConnectionStatuses()
    const interval = setInterval(checkConnectionStatuses, 60000) // Check every 60 seconds
    return () => clearInterval(interval)
  }, [checkConnectionStatuses])

  const ensuringSetRef = useRef(false)
  const setCreationInProgressRef = useRef(false) // Prevent race condition: don't auto-create set while confirmSetEndTime is running

  const ensureActiveSet = useCallback(async () => {
    if (!matchId) return

    // Set lock immediately to prevent race conditions
    setCreationInProgressRef.current = true


    // GUARD 1: Check if match is over by status
    const match = await db.matches.get(matchId)
    if (match?.status === 'ended' || match?.status === 'approved' || match?.status === 'final') {
      setCreationInProgressRef.current = false
      return
    }

    // GUARD 2: Check if match is over by sets won (best-of-3: 2 sets = match over)
    const allSetsForGuard = await db.sets.where('matchId').equals(matchId).toArray()
    const finishedSetsForGuard = allSetsForGuard.filter(s => s.finished)
    const team1SetsWon = finishedSetsForGuard.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSetsForGuard.filter(s => s.team2Points > s.team1Points).length
    if (team1SetsWon >= 2 || team2SetsWon >= 2) {
      setCreationInProgressRef.current = false
      return
    }

    const existing = await db.sets
      .where('matchId')
      .equals(matchId)
      .and(s => !s.finished)
      .first()

    if (existing) {
      setCreationInProgressRef.current = false
      return
    }

    const allSets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    const nextIndex =
      allSets.length > 0
        ? Math.max(...allSets.map(s => s.index || 0)) + 1
        : 1

    // GUARD 3: Beach volleyball is best-of-3, never create set 4 or higher
    if (nextIndex > 3) {
      setCreationInProgressRef.current = false
      return
    }

    // CRITICAL VALIDATION 1: Check if a set with this index already exists
    const duplicate = allSets.find(s => s.index === nextIndex)
    if (duplicate) {
      setCreationInProgressRef.current = false
      return
    }

    // CRITICAL VALIDATION 2: Check if previous set (nextIndex - 1) is finished
    if (nextIndex > 1) {
      const previousSet = allSets.find(s => s.index === nextIndex - 1)
      if (!previousSet || !previousSet.finished) {
        setCreationInProgressRef.current = false
        return
      }
    }

    // CRITICAL VALIDATION 3: Fresh duplicate check right before creation (race condition guard)
    const freshDuplicateCheck = await db.sets.where({ matchId }).and(s => s.index === nextIndex).first()
    if (freshDuplicateCheck) {
      setCreationInProgressRef.current = false
      return
    }

    const setId = await db.sets.add({
      matchId,
      index: nextIndex,
      team1Points: 0,
      team2Points: 0,
      finished: false
    })

    // Use match from guard check above (already fetched)
    const isTest = match?.test || false

    // Only sync official matches (not test matches)
    if (!isTest) {
      await db.sync_queue.add({
        resource: 'set',
        action: 'insert',
        payload: {
          external_id: String(setId),
          match_id: match?.seed_key || String(matchId),
          index: nextIndex,
          team1_points: 0,
          team2_points: 0,
          finished: false,
          test: isTest,
          start_time: roundToMinute(new Date().toISOString())
        },
        ts: roundToMinute(new Date().toISOString()),
        status: 'queued'
      })
    }

    // Release the lock after successful creation
    setCreationInProgressRef.current = false
  }, [matchId])

  useEffect(() => {
    // Skip if: no match, data exists with active set, already ensuring, or confirmSetEndTime is creating a set
    if (!matchId || !data || data.set || ensuringSetRef.current || setCreationInProgressRef.current) return

    // Skip if match is already ended (best-of-3 complete)
    if (data.match?.status === 'ended' || data.match?.status === 'approved' || data.match?.status === 'final') return

    // Skip if a team has already won 2 sets (best-of-3)
    const finishedSets = data.sets?.filter(s => s.finished) || []
    const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
    if (team1SetsWon >= 2 || team2SetsWon >= 2) return

    ensuringSetRef.current = true
    ensureActiveSet()
      .catch(err => {
        // Silently handle error, but ensure lock is released
        setCreationInProgressRef.current = false
      })
      .finally(() => {
        ensuringSetRef.current = false
      })
  }, [data, ensureActiveSet, matchId])

  // Sync remarks text when modal opens
  useEffect(() => {
    if (showRemarks) {
      const currentRemarks = data?.match?.remarks || ''
      // If there are existing remarks, add a newline at the end for new input
      setRemarksText(currentRemarks ? `${currentRemarks}\n` : '')
      // Focus textarea after modal opens
      setTimeout(() => {
        if (remarksTextareaRef.current) {
          remarksTextareaRef.current.focus()
          const len = remarksTextareaRef.current.value.length
          remarksTextareaRef.current.setSelectionRange(len, len)
        }
      }, 100)
    }
  }, [showRemarks, data?.match?.remarks])

  // Server management - Only check in Electron
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.server

    // Only check server status in Electron mode
    if (!isElectron) {
      return
    }

    const checkServerStatus = async () => {
      try {
        const status = await window.electronAPI.server.getStatus()
        setServerStatus(status)
        setServerRunning(status.running)
      } catch (err) {
        setServerRunning(false)
      }
    }

    checkServerStatus()
    const interval = setInterval(checkServerStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleStartServer = async () => {
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.server

    if (!isElectron) {
      // In browser/PWA - show instructions instead of error
      // The server status will be checked automatically, so we just need to show instructions
      return
    }

    setServerLoading(true)
    try {
      const result = await window.electronAPI.server.start({ https: true })
      if (result.success) {
        setServerStatus(result.status)
        setServerRunning(true)
      } else {
        showAlert(`Failed to start server: ${result.error}`, 'error')
      }
    } catch (error) {
      showAlert(`Error starting server: ${error.message}`, 'error')
    } finally {
      setServerLoading(false)
    }
  }

  const handleStopServer = async () => {
    setServerLoading(true)
    try {
      const isElectron = typeof window !== 'undefined' && window.electronAPI?.server

      if (isElectron) {
        const result = await window.electronAPI.server.stop()
        if (result.success) {
          setServerRunning(false)
          setServerStatus(null)
        }
      }
    } catch (error) {
      showAlert(`Error stopping server: ${error.message}`, 'error')
    } finally {
      setServerLoading(false)
    }
  }

  // Determine which team is A and which is B based on coin toss
  const teamAKey = useMemo(() => {
    if (!data?.match) return 'team1'
    return data.match.coinTossTeamA || 'team1'
  }, [data?.match])

  const teamBKey = useMemo(() => {
    if (!data?.match) return 'team2'
    return data.match.coinTossTeamB || 'team2'
  }, [data?.match])

  const leftisTeam1 = useMemo(() => {
    // Before coin toss, default to team1 left, team2 right
    const isBeforeCoinToss = !data?.match?.coinTossTeamA || !data?.match?.coinTossTeamB
    if (isBeforeCoinToss || !data?.set) return true

    const setIndex = data.set.index

    // Check for manual override first (for sets 1-4)
    if (setIndex >= 1 && setIndex <= 2 && data.match?.setLeftTeamOverrides) {
      const override = data.match.setLeftTeamOverrides[setIndex]
      if (override) {
        // Override is 'A' or 'B'
        const leftTeamKey = override === 'A' ? teamAKey : teamBKey
        return leftTeamKey === 'team1'
      }
    }

    // Set 1: Team A on left
    if (setIndex === 1) {
      return teamAKey === 'team1'
    }

    // Set 3: Special case with court switch at 8 points
    if (setIndex === 3) {
      // Use set3LeftTeam if specified, otherwise default to teams switched (like set 2)
      if (data.match?.set3LeftTeam) {
        const leftTeamKey = data.match.set3LeftTeam === 'A' ? teamAKey : teamBKey
        let isTeam1 = leftTeamKey === 'team1'

        // If court switch has happened at 8 points, switch again
        if (data.match?.set3CourtSwitched) {
          isTeam1 = !isTeam1
        }

        return isTeam1
      }

      // Fallback: Set 3 starts with teams switched (like set 2)
      let isTeam1 = teamAKey !== 'team1'

      // If court switch has happened at 8 points, switch again
      if (data.match?.set3CourtSwitched) {
        isTeam1 = !isTeam1
      }

      return isTeam1
    }

    // Sets 2, 3, 4: Teams alternate sides (automatic if no override)
    // Set 1: Team A left, Team B right
    // Set 2: Team A right, Team B left (switched)
    // Set 3: Team A left, Team B right (new coin toss determines sides)
    // Pattern for beach volleyball: Set 1-2 alternate, Set 3 uses new coin toss
    return setIndex % 2 === 1 ? (teamAKey === 'team1') : (teamAKey !== 'team1')
  }, [data?.set, data?.match?.set3CourtSwitched, data?.match?.set3LeftTeam, data?.match?.setLeftTeamOverrides, teamAKey])

  // Calculate sets won by each team
  const setsWon = useMemo(() => {
    if (!data) return { team1: 0, team2: 0, left: 0, right: 0 }

    const allSets = data.sets || []
    const finishedSets = allSets.filter(s => s.finished)

    const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

    const leftSetsWon = leftisTeam1 ? team1SetsWon : team2SetsWon
    const rightSetsWon = leftisTeam1 ? team2SetsWon : team1SetsWon

    return { team1: team1SetsWon, team2: team2SetsWon, left: leftSetsWon, right: rightSetsWon }
  }, [data, leftisTeam1])

  const mapSideToTeamKey = useCallback(
    side => {
      if (!data?.set) return 'team1'
      if (side === 'left') {
        return leftisTeam1 ? 'team1' : 'team2'
      }
      return leftisTeam1 ? 'team2' : 'team1'
    },
    [data?.set, leftisTeam1]
  )

  const mapTeamKeyToSide = useCallback(
    teamKey => {
      if (!data?.set) return 'left'
      if (teamKey === 'team1') {
        return leftisTeam1 ? 'left' : 'right'
      }
      return leftisTeam1 ? 'right' : 'left'
    },
    [data?.set, leftisTeam1]
  )

  const pointsBySide = useMemo(() => {
    if (!data?.set) return { left: 0, right: 0 }
    return leftisTeam1
      ? { left: data.set.team1Points ?? 0, right: data.set.team2Points ?? 0 }
      : { left: data.set.team2Points ?? 0, right: data.set.team1Points ?? 0 }
  }, [data?.set, leftisTeam1])

  const timeoutsUsed = useMemo(() => {
    if (!data?.events || !data?.set) return { team1: 0, team2: 0 }
    // Only count timeouts for the current set
    return data.events
      .filter(event => event.type === 'timeout' && event.setIndex === data.set.index)
      .reduce(
        (acc, event) => {
          const team = event.payload?.team
          if (team === 'team1' || team === 'team2') {
            acc[team] = (acc[team] || 0) + 1
          }
          return acc
        },
        { team1: 0, team2: 0 }
      )
  }, [data?.events, data?.set])

  // Track if RIT has been used this match (only one allowed per match)
  const ritUsedThisMatch = useMemo(() => {
    return data?.events?.some(e => e.type === 'rit') || false
  }, [data?.events])

  const rallyStatus = useMemo(() => {
    if (!data?.events || !data?.set || data.events.length === 0) return 'idle'

    // Get events for current set only and sort by sequence number (most recent first)
    const currentSetEvents = data.events
      .filter(e => e.setIndex === data.set.index)
      .sort((a, b) => {
        // Sort by sequence number if available, otherwise by timestamp
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) {
          return bSeq - aSeq // Descending by sequence (most recent first)
        }
        // Fallback to timestamp for legacy events
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })

    if (currentSetEvents.length === 0) return 'idle'

    const lastEvent = currentSetEvents[0] // Most recent event is now first

    // Check if last event is point or replay first (these end the rally)
    if (lastEvent.type === 'point' || lastEvent.type === 'replay') {
      return 'idle'
    }

    if (lastEvent.type === 'rally_start') {
      return 'in_play'
    }

    // set_start means set is ready but rally hasn't started yet
    if (lastEvent.type === 'set_start') {
      return 'idle'
    }

    // For lineup events after points, the rally is idle (waiting for next rally_start)
    return 'idle'
  }, [data?.events, data?.set])

  // Check if the rally is replayed (last event is a replay)
  const isRallyReplayed = useMemo(() => {
    if (!data?.events || !data?.set || data.events.length === 0) return false

    // Get events for current set only and sort by sequence number (most recent first)
    const currentSetEvents = data.events
      .filter(e => e.setIndex === data.set.index)
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) {
          return bSeq - aSeq
        }
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })

    if (currentSetEvents.length === 0) return false

    const lastEvent = currentSetEvents[0]
    return lastEvent.type === 'replay'
  }, [data?.events, data?.set])

  // Check if the last event was a point (can replay rally)
  const canReplayRally = useMemo(() => {
    if (!data?.events || !data?.set || data.events.length === 0) {
      return false
    }

    // Get events for current set only and sort by sequence number (most recent first)
    const currentSetEvents = data.events
      .filter(e => e.setIndex === data.set.index)
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) {
          return bSeq - aSeq
        }
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })

    if (currentSetEvents.length === 0) {
      return false
    }

    const lastEvent = currentSetEvents[0]

    // Can replay rally if the last event was a point
    // OR if the last event is a rotation lineup that followed a point (same base seq)
    if (lastEvent.type === 'point') {
      return true
    }

    // Check if last event is a sub-event following a point (decimal seq like 5.1 or 5.2)
    // This covers rotation lineups, etc. that happen automatically after a point
    const lastSeq = lastEvent.seq || 0
    const isSubEvent = lastSeq !== Math.floor(lastSeq)
    if (isSubEvent) {
      // This is a sub-event - check if parent event was a point
      const baseSeq = Math.floor(lastSeq)
      const parentEvent = currentSetEvents.find(e => Math.floor(e.seq || 0) === baseSeq && e.type === 'point')
      if (parentEvent) {
        return true
      }
    }

    return false
  }, [data?.events, data?.set])

  const isFirstRally = useMemo(() => {
    if (!data?.events || !data?.set) return true
    // Check if there are any points in the current set
    // This determines if we show "Start set" vs "Start rally"
    const hasPoints = data.events.some(e => e.type === 'point' && e.setIndex === data.set.index)
    return !hasPoints
  }, [data?.events, data?.set])

  // Check if we're between sets (previous set finished, current set hasn't started)
  const isBetweenSets = useMemo(() => {
    if (!data?.sets || !data?.set) return false
    const allSets = data.sets.sort((a, b) => a.index - b.index)
    const currentSetIndex = data.set.index
    if (currentSetIndex === 1) return false // First set, not between sets

    const previousSet = allSets.find(s => s.index === currentSetIndex - 1)
    if (!previousSet || !previousSet.finished) return false

    // Check if match should have ended (best-of-3: a team won 2 sets)
    const finishedSets = allSets.filter(s => s.finished)
    const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
    if (team1SetsWon >= 2 || team2SetsWon >= 2) return false // Match should have ended, not between sets

    // Check if current set has started (has points or set_start event)
    const hasSetStarted = data.events?.some(e =>
      (e.type === 'point' || e.type === 'set_start') && e.setIndex === currentSetIndex
    )

    return !hasSetStarted
  }, [data?.sets, data?.set, data?.events])

  // Start between-sets countdown when we detect we're between sets
  useEffect(() => {
    // Only start countdown if between sets AND countdown is null (not started yet)
    // Don't restart if countdown exists (even if finished) or was dismissed
    if (isBetweenSets && betweenSetsCountdown === null && !countdownDismissedRef.current) {
      // Calculate remaining time based on previous set's endTime
      const currentSetIndex = data?.set?.index || 1
      const previousSet = data?.sets?.find(s => s.index === currentSetIndex - 1)
      let remainingTime = setIntervalDuration

      if (previousSet?.endTime) {
        const endTime = new Date(previousSet.endTime).getTime()
        const now = Date.now()
        const elapsedSeconds = Math.floor((now - endTime) / 1000)
        remainingTime = Math.max(0, setIntervalDuration - elapsedSeconds)
      }

      // If time has already elapsed, mark as dismissed
      if (remainingTime <= 0) {
        countdownDismissedRef.current = true
      } else {
        setBetweenSetsCountdown({ countdown: remainingTime, started: true })
      }
    } else if (!isBetweenSets) {
      // Reset to null only when no longer between sets (new set started)
      setBetweenSetsCountdown(null)
      setBetweenSetsSetupConfirmed(false) // Reset for next interval
      countdownDismissedRef.current = false // Reset for next time
    }
  }, [isBetweenSets, setIntervalDuration, data?.set?.index, data?.sets]) // Removed betweenSetsCountdown from deps to prevent restart loop

  // Handle between-sets countdown timer
  useEffect(() => {
    if (!betweenSetsCountdown || !betweenSetsCountdown.started) return

    // Initialize refs when interval starts
    if (!betweenSetsStartTimestampRef.current) {
      betweenSetsStartTimestampRef.current = Date.now()
      betweenSetsInitialCountdownRef.current = betweenSetsCountdown.countdown || 60 // 60 seconds for beach volleyball
    }

    // Don't set interval if already at 0
    if (betweenSetsCountdown.countdown <= 0) {
      betweenSetsStartTimestampRef.current = null // Reset for next interval
      return
    }

    // Update every 100ms for smooth visuals (instead of 1000ms)
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - betweenSetsStartTimestampRef.current) / 1000)
      const remaining = Math.max(0, betweenSetsInitialCountdownRef.current - elapsed)

      if (remaining <= 0) {
        // Don't auto-dismiss if between sets setup not confirmed - wait for manual confirmation
        if (isBetweenSets && !betweenSetsSetupConfirmed) {
          // Just stop at 0, keep showing countdown but wait for manual confirmation
          setBetweenSetsCountdown(prev => prev ? { ...prev, countdown: 0 } : null)
        } else {
          // Auto-end the set interval when countdown reaches 0 (normal case)
          countdownDismissedRef.current = true
          setBetweenSetsCountdown(null)
          betweenSetsStartTimestampRef.current = null // Reset for next interval
        }
      } else {
        setBetweenSetsCountdown(prev => {
          if (!prev || !prev.started) return prev
          return { ...prev, countdown: remaining }
        })
      }
    }, 100) // 100ms for smooth visual updates

    return () => clearInterval(timer)
  }, [betweenSetsCountdown, isBetweenSets, betweenSetsSetupConfirmed])

  // Check if set has ended on page load/refresh (score indicates set over but modal not shown)
  useEffect(() => {
    // Don't run if set creation is in progress (prevents race condition)
    if (setCreationInProgressRef.current) return
    if (!data?.set || setEndTimeModal || data.set.finished) return

    // Don't re-show if user dismissed via undo for this set
    if (setEndModalDismissedRef.current === data.set.index) return

    // Don't show modal if this set was already confirmed (prevents race condition on double-confirm)
    if (confirmedSetEndRef.current.has(data.set.index)) return

    const team1Points = data.set.team1Points || 0
    const team2Points = data.set.team2Points || 0
    const is3rdSet = data.set.index === 3
    const pointsToWin = is3rdSet ? 15 : 21

    // Check if score indicates set should have ended
    const team1Won = team1Points >= pointsToWin && team1Points - team2Points >= 2
    const team2Won = team2Points >= pointsToWin && team2Points - team1Points >= 2

    if (team1Won || team2Won) {
      // Set should have ended - show modal
      const winner = team1Won ? 'team1' : 'team2'

      // Calculate if this is match end (beach volleyball: best of 3, first to 2 sets)
      const finishedSets = data.sets?.filter(s => s.finished) || []
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
      const isMatchEnd = winner === 'team1' ? (team1SetsWon + 1) >= 2 : (team2SetsWon + 1) >= 2

      setSetEndTimeModal({
        setIndex: data.set.index,
        winner,
        team1Points,
        team2Points,
        defaultTime: new Date().toISOString(),
        isMatchEnd
      })
    } else {
      // Score no longer indicates set end - clear the dismissed flag so modal can show again if needed
      if (setEndModalDismissedRef.current === data.set.index) {
        setEndModalDismissedRef.current = null
      }
    }
  }, [data?.set, data?.sets, setEndTimeModal])

  // Format countdown time: mm:ss format, but only seconds when < 60
  const formatCountdown = useCallback((seconds) => {
    if (seconds < 60) {
      return String(seconds)
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
  }, [])

  // Format timeout: always just seconds
  const formatTimeout = useCallback((seconds) => {
    return String(seconds)
  }, [])

  // Get font family based on scoreFont setting
  const getScoreFont = useCallback(() => {
    const fonts = {
      'default': 'inherit',
      'orbitron': "'Orbitron', monospace",
      'roboto-mono': "'Roboto Mono', monospace",
      'jetbrains-mono': "'JetBrains Mono', monospace",
      'space-mono': "'Space Mono', monospace",
      'ibm-plex-mono': "'IBM Plex Mono', monospace"
    }
    return fonts[scoreFont] || 'inherit'
  }, [scoreFont])

  const stopBetweenSetsCountdown = useCallback(() => {
    setBetweenSetsCountdown(null)
  }, [])

  const endSetInterval = useCallback(() => {
    // Clear countdown and mark as dismissed so it doesn't restart
    setBetweenSetsCountdown(null)
    countdownDismissedRef.current = true
    // Notify referee to also close their countdown
    sendActionToReferee('end_interval', {})
    // Sync match_status back to 'in_progress' in Supabase
    syncLiveStateToSupabase('end_interval', null, null)
    // The set will start when user clicks "Start set" button
  }, [sendActionToReferee, syncLiveStateToSupabase])

  const getTeamLineupState = useCallback((teamKey) => {
    if (!data?.events || !data?.set) {
      return {
        lineupEvents: [],
        currentLineup: null,
        playersOnCourt: []
      }
    }

    const teamPlayers = teamKey === 'team1' ? data?.team1Players || [] : data?.team2Players || []

    const lineupEvents = data.events
      .filter(e =>
        e.type === 'lineup' &&
        e.payload?.team === teamKey &&
        e.setIndex === data.set.index
      )
      .sort((a, b) => {
        // Sort by sequence number
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) {
          return aSeq - bSeq // Ascending
        }
        // Fallback to timestamp
        return new Date(a.ts) - new Date(b.ts)
      })

    if (lineupEvents.length === 0) {
      return {
        lineupEvents,
        currentLineup: null,
        playersOnCourt: []
      }
    }

    const currentLineup = lineupEvents[lineupEvents.length - 1]?.payload?.lineup || {}


    // Ensure currentLineup only has valid positions (defensive check against 7 players bug)
    // If a position has an empty string, try to recover it from previous lineup events
    const validPositions = ['I', 'II', 'III', 'IV', 'V', 'VI']
    const cleanedCurrentLineup = {}

    // First pass: collect all valid player numbers from current lineup
    const currentPlayerNumbers = new Set()
    for (const pos of validPositions) {
      const playerNumber = currentLineup[pos]
      if (playerNumber !== undefined && playerNumber !== null && playerNumber !== '') {
        cleanedCurrentLineup[pos] = playerNumber
        currentPlayerNumbers.add(String(playerNumber))
      }
    }

    // Second pass: for missing positions, try to recover from previous lineup events
    // but only if the recovered player isn't already on court
    for (const pos of validPositions) {
      if (cleanedCurrentLineup[pos] !== undefined) {
        continue // Already has a valid player
      }

      // Look backwards through lineup events to find the last valid player number for this position
      for (let i = lineupEvents.length - 2; i >= 0; i--) {
        const prevLineup = lineupEvents[i]?.payload?.lineup
        const prevPlayerNumber = prevLineup?.[pos]
        if (prevPlayerNumber && prevPlayerNumber !== '' && prevPlayerNumber !== null && prevPlayerNumber !== undefined) {
          // Only use this recovered player if they're not already on court in another position
          const prevPlayerNumberStr = String(prevPlayerNumber)
          if (!currentPlayerNumbers.has(prevPlayerNumberStr)) {
            cleanedCurrentLineup[pos] = prevPlayerNumber
            currentPlayerNumbers.add(prevPlayerNumberStr)
            break
          }
        }
      }
    }

    const playersOnCourt = Object.values(cleanedCurrentLineup)
      .filter(num => num !== undefined && num !== null && num !== '')
      .map(num => Number(num))
      .filter(num => !Number.isNaN(num) && num !== 0)




    return {
      lineupEvents,
      currentLineup: cleanedCurrentLineup, // Return cleaned lineup
      playersOnCourt
    }
  }, [data?.events, data?.set, data?.team1Players, data?.team2Players])


  const buildOnCourt = useCallback((players, isLeft, teamKey) => {
    // Beach volleyball position numbering (service order, not rotation):
    // Position I: First server of the team that serves first after coin toss
    // Position II: First server of the other team
    // Position III: Second player of the team that serves first
    // Position IV: Second player of the other team
    // These positions switch sides when courts switch!

    const sortedPlayers = [...(players || [])].sort((a, b) => (a.number || 0) - (b.number || 0)).slice(0, 2)

    // Determine which team serves first in this set
    
    // Convert teamKey to 'team1'/'team2' format for comparison
    const teamKeyAsTeamNum = teamKey === 'team1' ? 'team1' : 'team2'
    const setIndex = data?.set?.index || 1
    const set1FirstServe = data?.match?.firstServe || 'team1'
    let currentSetFirstServe
    if (setIndex === 3 && data?.match?.set3FirstServe) {
      // set3FirstServe is 'A' or 'B', teamAKey is 'team1' or 'team2'
      const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
      currentSetFirstServe = data.match.set3FirstServe === 'A' ? teamAKey : teamBKey
    } else if (setIndex === 3) {
      // Set 3 default: opposite of set 2 first serve
      const set2First = data?.match?.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
      currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
    } else if (setIndex === 2 && data?.match?.set2FirstServe) {
      currentSetFirstServe = data.match.set2FirstServe
    } else if (setIndex === 2) {
      currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
    } else {
      currentSetFirstServe = set1FirstServe
    }

    // Check if this team serves first this set
    const thisTeamServesFirst = teamKeyAsTeamNum === currentSetFirstServe

    // Get first serve player number for this team
    const firstServeField = teamKey === 'team1' ? 'team1FirstServe' : 'team2FirstServe'
    const firstServeNumber = data?.match?.[firstServeField]

    // Determine positions based on service order
    // Team that serves first: positions I and III
    // Team that serves second: positions II and IV
    let positions
    if (thisTeamServesFirst) {
      positions = ['I', 'III']
    } else {
      positions = ['II', 'IV']
    }

    // Build the 2-player court
    return positions.map((pos, idx) => {
      let player = null
      if (idx === 0 && firstServeNumber) {
        // First position is the first server of this team
        player = sortedPlayers.find(p => String(p.number) === String(firstServeNumber))
      } else if (idx === 1 && firstServeNumber) {
        // Second position is the other player
        player = sortedPlayers.find(p => String(p.number) !== String(firstServeNumber))
      } else {
        // Fallback: assign by array index
        player = sortedPlayers[idx]
      }

      return {
        id: player?.id ?? `placeholder-${idx}`,
        number: player?.number !== undefined && player?.number !== null ? String(player.number) : '',
        name: player?.name || '',
        firstName: player?.firstName || '',
        lastName: player?.lastName || '',
        isPlaceholder: !player,
        position: pos,
        isCaptain: player?.isCaptain || false,
        isCourtCaptain: false
      }
    })
  }, [data?.team1Players, data?.team2Players, data?.match, data?.set, teamAKey])

  const getCurrentLineup = useCallback(
    teamKey => {
      if (!data?.events || !data?.set) return null
      const lineupEvents = data.events
        .filter(
          e =>
            e.type === 'lineup' &&
            e.payload?.team === teamKey &&
            e.setIndex === data.set.index
        )
        .sort((a, b) => {
          // Sort by sequence number
          const aSeq = a.seq || 0
          const bSeq = b.seq || 0
          if (aSeq !== 0 || bSeq !== 0) {
            return aSeq - bSeq // Ascending
          }
          // Fallback to timestamp
          return new Date(a.ts) - new Date(b.ts)
        })

      if (lineupEvents.length === 0) return null
      return lineupEvents[lineupEvents.length - 1].payload?.lineup || null
    },
    [data?.events, data?.set]
  )

  // Helper to build beach volleyball team display name from player last names
  const buildBeachTeamName = useCallback((players, teamName, country) => {
    // For beach volleyball, build name from player last names if available
    if (players && players.length >= 1) {
      const sortedPlayers = [...players].sort((a, b) => (a.number || 0) - (b.number || 0))
      const lastNames = sortedPlayers
        .slice(0, 2)
        .map(p => {
          // Try lastName first, then extract from name, then use first name
          if (p.lastName) return p.lastName
          if (p.name && p.name.includes(' ')) return p.name.split(' ').pop()
          if (p.name) return p.name
          if (p.firstName) return p.firstName
          // Last resort: use player number
          if (p.number !== undefined && p.number !== null) return `#${p.number}`
          return null
        })
        .filter(n => n)
      if (lastNames.length >= 1) {
        const baseName = lastNames.join('/')
        return country ? `${baseName} (${country})` : baseName
      }
    }
    // Fallback to team name (accept any team name, even generic ones)
    if (teamName) {
      return country ? `${teamName} (${country})` : teamName
    }
    // Final fallback with just country
    return country ? `Team (${country})` : null
  }, [])

  const leftTeam = useMemo(() => {
    if (!data) return { name: 'Team A', color: '#ef4444', players: [] }
    const players = leftisTeam1 ? data.team1Players : data.team2Players
    const team = leftisTeam1 ? data.team1Team : data.team2Team
    const teamKey = leftisTeam1 ? 'team1' : 'team2'
    const isTeamA = teamKey === teamAKey
    const country = leftisTeam1 ? data.match?.team1Country : data.match?.team2Country
    const beachName = buildBeachTeamName(players, team?.name, country)
    return {
      name: beachName || team?.name || (leftisTeam1 ? 'team1' : 'team2'),
      color: team?.color || (leftisTeam1 ? '#ef4444' : '#3b82f6'),
      playersOnCourt: buildOnCourt(players, true, teamKey),
      isTeamA
    }
  }, [buildOnCourt, buildBeachTeamName, data, leftisTeam1, teamAKey])

  const rightTeam = useMemo(() => {
    if (!data) return { name: 'Team B', color: '#3b82f6', players: [] }
    const players = leftisTeam1 ? data.team2Players : data.team1Players
    const team = leftisTeam1 ? data.team2Team : data.team1Team
    const teamKey = leftisTeam1 ? 'team2' : 'team1'
    const isTeamA = teamKey === teamAKey
    const country = leftisTeam1 ? data.match?.team2Country : data.match?.team1Country
    const beachName = buildBeachTeamName(players, team?.name, country)
    return {
      name: beachName || team?.name || (leftisTeam1 ? 'team2' : 'team1'),
      color: team?.color || (leftisTeam1 ? '#3b82f6' : '#ef4444'),
      playersOnCourt: buildOnCourt(players, false, teamKey),
      isTeamA
    }
  }, [buildOnCourt, buildBeachTeamName, data, leftisTeam1, teamAKey])

  // Check if lineups are set for each team in the current set
  // Beach volleyball: No lineup submission needed - both players are always on court
  // Just check that we have players for each team
  const leftTeamLineupSet = useMemo(() => {
    if (!data?.set) return false
    // Beach volleyball: lineup is always set if team has players
    const players = leftisTeam1 ? data.team1Players : data.team2Players
    return players && players.length >= 2
  }, [data?.set, data?.team1Players, data?.team2Players, leftisTeam1])

  const rightTeamLineupSet = useMemo(() => {
    if (!data?.set) return false
    // Beach volleyball: lineup is always set if team has players
    const players = leftisTeam1 ? data.team2Players : data.team1Players
    return players && players.length >= 2
  }, [data?.set, data?.team1Players, data?.team2Players, leftisTeam1])

  // Track which lineups we've already validated (to prevent infinite modal loops)
  const validatedLineupRef = useRef({ team1: null, team2: null })

  // Get players for each team
 
  const formatTimestamp = useCallback(date => {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }, [])

  const isBrightColor = useCallback(color => {
    if (!color || color === 'image.png') return false
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5
  }, [])

  // Helper function to get next sequence number for events (returns integer only)
  const getNextSeq = useCallback(async () => {
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const coinTossEvent = allEvents.find(e => e.type === 'coin_toss')

    // Get the maximum base ID (integer part only, ignoring decimals)
    const maxBaseSeq = allEvents.reduce((max, e) => {
      const seq = e.seq || 0
      const baseSeq = Math.floor(seq) // Get integer part only
      return Math.max(max, baseSeq)
    }, 0)

    // If coin toss exists and has seq=1, ensure next seq is at least 2
    // Otherwise, if no coin toss exists, the next event should be seq=1 (for coin toss)
    // But if coin toss already exists, start from maxBaseSeq + 1
    if (coinTossEvent && Math.floor(coinTossEvent.seq || 0) === 1) {
      return Math.max(2, maxBaseSeq + 1)
    }
    return maxBaseSeq + 1
  }, [matchId])

  // Helper function to get next sub-sequence number for related events (returns decimal like 1.1, 1.2, etc.)
  const getNextSubSeq = useCallback(async (parentSeq) => {
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const baseSeq = Math.floor(parentSeq)

    // Find all events with the same base ID (1, 1.1, 1.2, etc.)
    const relatedEvents = allEvents.filter(e => {
      const eSeq = e.seq || 0
      return Math.floor(eSeq) === baseSeq
    })

    // Find the highest sub-sequence number for this base ID
    const maxSubSeq = relatedEvents.reduce((max, e) => {
      const eSeq = e.seq || 0
      const eBaseSeq = Math.floor(eSeq)
      if (eBaseSeq === baseSeq && eSeq !== baseSeq) {
        // This is a sub-event (has decimal part)
        const subPart = eSeq - baseSeq // e.g., 1.2 - 1 = 0.2
        return Math.max(max, subPart)
      }
      return max
    }, 0)

    // Return next sub-sequence (increment by 0.1)
    return baseSeq + (maxSubSeq + 0.1)
  }, [matchId])

  // Debug functions (available in console)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Debug function to export match data as JSON (for testing fillable PDF)
      window.debugExportMatchData = async () => {
        try {
          const allEvents = await db.events.where('matchId').equals(matchId).toArray()
          const allSets = await db.sets.where('matchId').equals(matchId).toArray()
          const allReferees = await db.referees.toArray()
          const allScorers = await db.scorers.toArray()

          const matchData = {
            match: data?.match,
            team1Team: data?.team1Team,
            team2Team: data?.team2Team,
            team1Players: data?.team1Players || [],
            team2Players: data?.team2Players || [],
            sets: allSets,
            events: allEvents,
            referees: allReferees,
            scorers: allScorers
          }

          // Log to console

          // Also download as file
          const blob = new Blob([JSON.stringify(matchData, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `match-data-${matchId || 'export'}.json`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

        } catch (error) {
          console.error('Error exporting match data:', error)
        }
      }

      // Function to generate fillable PDF (simple form filling)
      window.debugGenerateFillablePDF = async () => {
        try {
          const match = data?.match
          if (!match) {
            console.error('No match data available')
            return
          }

          // Prepare match data in the format expected by fillPdfForm
          const fillableData = {
            match_type_1: match.matchType || match.match_type_1 || 'championship',
            match_type_2: match.gender || match.match_type_2 || '',
            league: match.league || '',
            gameNumber: match.gameNumber || match.externalId || '',
            team1Team: data?.team1Team?.name || '',
            team2Team: data?.team2Team?.name || '',
            city: match.city || '',
            hall: match.venue || match.hall || '',
            scheduledAt: match.scheduledAt,
            officials: match.officials || []
          }

          await generateFillablePdf(fillableData)
        } catch (error) {
          console.error('Error generating fillable PDF:', error)
        }
      }

      // Debug function to check games in progress
      window.debugCheckGamesInProgress = async () => {
        try {

          // 1. Check local IndexedDB
          const allMatches = await db.matches.toArray()
          const inProgressMatches = allMatches.filter(m =>
            m.status === 'live' || m.status === 'scheduled'
          )


          // 2. Check server API (what Referee Dashboard actually uses)
          let serverMatches = []
          try {
            const { listAvailableMatches } = await import('../utils_beach/serverDataSync_beach')
            const serverResult = await listAvailableMatches()
            if (serverResult.success && serverResult.matches) {
              serverMatches = serverResult.matches
            }
          } catch (err) {
            console.warn('[DEBUG] Could not fetch from server API:', err.message)
          }


          if (serverMatches.length > 0 && inProgressMatches.length === 0) {
          }

          // Show server matches (what actually appears in dropdown)
          if (serverMatches.length > 0) {
            console.table(serverMatches.map(m => ({
              id: m.id,
              gameNumber: m.gameNumber,
              team1Team: m.team1Team,
              team2Team: m.team2Team,
              status: m.status,
              dateTime: m.dateTime,
              refereeConnectionEnabled: m.refereeConnectionEnabled
            })))

            serverMatches.forEach((m, idx) => {
            })
          }

          // Show local DB matches with details
          if (inProgressMatches.length > 0) {
            const matchesWithDetails = await Promise.all(
              inProgressMatches.map(async (match) => {
                // Support both old and new field names
                const localteam1TeamId = match.team1Id || match.team1TeamId
                const localteam2TeamId = match.team2Id || match.team2TeamId
                const team1Team = localteam1TeamId ? await db.teams.get(localteam1TeamId) : null
                const team2Team = localteam2TeamId ? await db.teams.get(localteam2TeamId) : null
                const sets = await db.sets.where('matchId').equals(match.id).toArray()
                const currentSet = sets.find(s => !s.finished) || sets[sets.length - 1]
                const eventCount = await db.events.where('matchId').equals(match.id).count()
                const isCurrentMatch = matchId && String(match.id) === String(matchId)

                return {
                  id: match.id,
                  gameNumber: match.gameNumber || match.externalId || 'N/A',
                  team1Team: team1Team?.name || 'Unknown',
                  team2Team: team2Team?.name || 'Unknown',
                  status: match.status,
                  isLive: match.status === 'live',
                  currentSet: currentSet ? {
                    index: currentSet.index,
                    team1Points: currentSet.team1Points,
                    team2Points: currentSet.team2Points
                  } : null,
                  totalSets: sets.length,
                  eventCount: eventCount,
                  refereeConnectionEnabled: match.refereeConnectionEnabled === true,
                  isCurrentMatch: isCurrentMatch
                }
              })
            )

            console.table(matchesWithDetails)

            matchesWithDetails.forEach((m, idx) => {
              const statusLabel = m.isLive ? '[LIVE]' : '[SCHEDULED]'
              if (m.currentSet) {
              }
            })
          }

          return {
            localDB: { matches: inProgressMatches, count: inProgressMatches.length },
            serverAPI: { matches: serverMatches, count: serverMatches.length }
          }
        } catch (error) {
          console.error('[DEBUG] Error checking games in progress:', error)
          return { localDB: { matches: [], count: 0 }, serverAPI: { matches: [], count: 0 }, error: error.message }
        }
      }
    }
    return () => {
      if (typeof window !== 'undefined') {
        if (window.debugExportMatchData) delete window.debugExportMatchData
        if (window.debugGenerateFillablePDF) delete window.debugGenerateFillablePDF
        if (window.debugCheckGamesInProgress) delete window.debugCheckGamesInProgress
      }
    }
  }, [matchId, data?.match, data?.team1Team, data?.team2Team, data?.team1Players, data?.team2Players])

  // Helper function to log manual changes for the summary
  const logManualChange = useCallback((category, field, before, after, description) => {
    const change = {
      ts: new Date().toISOString(),
      category,
      field,
      before,
      after,
      description: description || `Changed ${field} from "${before}" to "${after}"`
    }
    setManualChangesLog(prev => [...prev, change])

    // Also update the match record with the new change
    if (matchId && data?.match) {
      const existingChanges = data.match.manualChanges || []
      const updatedChanges = [...existingChanges, change]
      db.matches.update(matchId, { manualChanges: updatedChanges }).catch((err) => {
        console.error('[ManualChange] IndexedDB error:', err)
      })

      // Sync to Supabase
      if (supabase && data.match?.seed_key) {
        supabase
          .from('matches')
          .update({ manual_changes: updatedChanges })
          .eq('external_id', data.match.seed_key)
          .eq('sport_type', SPORT_TYPE)
          .select('id, external_id, manual_changes')
          .then((result) => {
            if (result.data && result.data.length > 0) {
            } else {
              console.warn('[ManualChange] NO ROWS UPDATED! external_id not found:', data.match.seed_key)
            }
          })
          .catch((err) => {
            console.error('[ManualChange] Supabase error:', err)
          })
      } else {
      }
    } else {
    }

    return change
  }, [matchId, data?.match, supabase])

  // Refresh the eScoresheet window with latest data
  const refreshScoresheet = useCallback(async () => {
    // Check if scoresheet window is still open
    if (!scoresheetWindowRef.current || scoresheetWindowRef.current.closed) {
      return
    }

    try {
      // Fetch fresh data from IndexedDB
      const match = await db.matches.get(matchId)
      if (!match) return

      const team1TeamId = match?.team1Id || match?.team1TeamId
      const team2TeamId = match?.team2Id || match?.team2TeamId
      const [team1Team, team2Team, team1Players, team2Players, sets, events] = await Promise.all([
        team1TeamId ? db.teams.get(team1TeamId) : null,
        team2TeamId ? db.teams.get(team2TeamId) : null,
        team1TeamId ? db.players.where('teamId').equals(team1TeamId).toArray() : [],
        team2TeamId ? db.players.where('teamId').equals(team2TeamId).toArray() : [],
        db.sets.where('matchId').equals(matchId).toArray(),
        db.events.where('matchId').equals(matchId).toArray()
      ])

      const scoresheetData = {
        match,
        team1Team,
        team2Team,
        team1Players,
        team2Players,
        sets,
        events
      }

      // Update sessionStorage and send refresh message
      sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
      scoresheetWindowRef.current.postMessage({ type: 'REFRESH_SCORESHEET' }, '*')
    } catch (err) {
      console.error('[refreshScoresheet] Error:', err)
    }
  }, [matchId])

  const logEvent = useCallback(
    async (type, payload = {}, options = {}) => {
      const _t0 = performance.now()

      if (!data?.set) return null

      // skipMutex: true if caller already holds the mutex (e.g., confirmSubstitution)
      const shouldAcquireMutex = !options.skipMutex

      // MUTEX: Wait for any in-progress event to complete to prevent race conditions
      // This ensures snapshots always see all previous events
      if (shouldAcquireMutex) {
        const maxWaitTime = 5000 // 5 seconds max wait
        const startWait = Date.now()
        while (eventInProgressRef.current && (Date.now() - startWait) < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        if (eventInProgressRef.current) {
          console.warn('[logEvent] Timeout waiting for previous event, proceeding anyway')
        }
        eventInProgressRef.current = true
      }

      try {
        // CRITICAL: Use setIndexOverride if provided, otherwise query fresh from IndexedDB
        let actualSetIndex = options.setIndexOverride
        if (actualSetIndex === undefined) {
          // Query fresh current set to avoid stale data after set transitions
          const allSets = await db.sets.where('matchId').equals(matchId).toArray()
          const freshCurrentSet = allSets.find(s => !s.finished) || allSets[allSets.length - 1]
          actualSetIndex = freshCurrentSet?.index || data.set.index
        }

        // Get max sequence using compound index (O(log n) instead of O(n) full scan)
        const lastEvent = await db.events.where('[matchId+seq]').between([matchId, Dexie.minKey], [matchId, Dexie.maxKey]).last()
        const maxExistingSeq = lastEvent?.seq || 0

        // If parentSeq is provided, create a sub-event with decimal ID (e.g., 1.1, 1.2)
        // Otherwise, create a main event with integer ID
        let nextSeq
        if (options.parentSeq !== undefined) {
          nextSeq = await getNextSubSeq(options.parentSeq)
        } else {
          nextSeq = await getNextSeq()
        }

        // CRITICAL: Validate sequence number is always increasing
        if (nextSeq <= maxExistingSeq && Math.floor(nextSeq) !== Math.floor(maxExistingSeq)) {
          console.error(`[SEQUENCE ERROR] New seq ${nextSeq} is not greater than existing max ${maxExistingSeq}! Type: ${type}`)
          debugLogger.log('SEQUENCE_ERROR', {
            error: 'Sequence number not incrementing correctly',
            newSeq: nextSeq,
            maxExistingSeq,
            eventType: type,
            payload
          })
        }

        // Simple timestamp for reference (not used for ordering)
        const timestamp = options.timestamp ? new Date(options.timestamp) : new Date()

        // Add event first (without snapshot - we need the event to exist to capture state)
        const eventId = await db.events.add({
          matchId,
          setIndex: actualSetIndex,
          type,
          payload,
          ts: timestamp.toISOString(), // Store as ISO string for reference
          seq: nextSeq // Use sequence for ordering
        })

        // Capture FULL state snapshot AFTER the event is applied
        // This is the key to the snapshot-based undo system
        const stateSnapshot = await captureFullStateSnapshot()

        // Update the event with the snapshot
        if (stateSnapshot) {
          await db.events.update(eventId, { stateSnapshot })
        }

        // Log the event with state snapshots
        debugLogger.log('EVENT_CREATED', {
          eventId,
          type,
          payload,
          seq: nextSeq,
          setIndex: actualSetIndex,
          hasSnapshot: !!stateSnapshot
        })

        // Get match to check if it's a test match
        const match = await db.matches.get(matchId)
        const isTest = match?.test || false

        // Only sync official matches to Supabase, not test matches
        if (!isTest) {
          // Query fresh events from IndexedDB to get current lineups (avoid stale closure)
          const allEventsForSync = await db.events.where({ matchId }).toArray()
          const setIndex = actualSetIndex // Use the fresh set index, not stale data.set.index

          // Get rich lineup for a team from fresh event data (same format as match_live_state)
          const getRichLineupForTeamFresh = (teamKey, isServingTeam) => {
            const lineupEvents = allEventsForSync
              .filter(e => e.type === 'lineup' && e.payload?.team === teamKey && e.setIndex === setIndex)
              .sort((a, b) => (a.seq || 0) - (b.seq || 0))
            if (lineupEvents.length === 0) return null

            const lastLineupEvent = lineupEvents[lineupEvents.length - 1]
            const rawLineup = lastLineupEvent.payload?.lineup || {}

            // Get initial lineup (first lineup event)
            const initialLineup = lineupEvents[0]?.payload?.lineup || {}

            // Get players for this team
            const teamPlayers = teamKey === 'team1' ? data.team1Players : data.team2Players

            // Get substitution events for this team in this set
            const substitutionEvents = allEventsForSync
              .filter(e => e.type === 'substitution' && e.payload?.team === teamKey && e.setIndex === setIndex)

            // Get captain info
            const captainNum = teamKey === 'team1' ? match?.team1Captain : match?.team2Captain
            const courtCaptainNum = teamKey === 'team1' ? match?.team1CourtCaptain : match?.team2CourtCaptain

            const backRowPositions = ['I', 'V', 'VI']
            const richLineup = {}

            for (const position of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
              const playerNum = rawLineup[position]
              if (!playerNum && playerNum !== 0) continue

              const playerNumStr = String(playerNum)
              const player = teamPlayers?.find(p => String(p.number) === playerNumStr)
              const isBackRow = backRowPositions.includes(position)

              const positionData = {
                number: Number(playerNum) || playerNum
              }

              // Add serving info for position I or II (beach volleyball first servers)
              if ((position === 'I' || position === 'II') && isServingTeam) {
                positionData.isServing = true
              }

              // Add substitution info
              const subEvent = substitutionEvents.find(e => String(e.payload?.playerIn) === playerNumStr)
              if (subEvent) {
                positionData.isSubstituted = true
                positionData.substitutedFor = subEvent.payload?.playerOut
              }

              // Add captain info
              if (String(captainNum) === playerNumStr) {
                positionData.isCaptain = true
              }
              if (String(courtCaptainNum) === playerNumStr) {
                positionData.isCourtCaptain = true
              }

              richLineup[position] = positionData
            }

            return Object.keys(richLineup).length > 0 ? richLineup : null
          }

          // Simple lineup getter for server number lookup
          const getLineupForTeamFresh = (teamKey) => {
            const lineupEvents = allEventsForSync
              .filter(e => e.type === 'lineup' && e.payload?.team === teamKey && e.setIndex === setIndex)
              .sort((a, b) => (a.seq || 0) - (b.seq || 0))
            if (lineupEvents.length === 0) return null
            const lastLineup = lineupEvents[lineupEvents.length - 1]
            return lastLineup.payload?.lineup || null
          }

          // A/B Model: Team A = coin toss winner (constant), side_a = which side they're on
          const teamAKey = match?.coinTossTeamA || 'team1'
          const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
          const setLeftTeamOverrides = match?.setLeftTeamOverrides || {}

          // Determine which side Team A is on this set
          // setLeftTeamOverrides stores 'A' or 'B', set3LeftTeam stores 'A' or 'B'
          let sideA // 'left' or 'right'
          if (setLeftTeamOverrides[setIndex] !== undefined) {
            sideA = setLeftTeamOverrides[setIndex] === 'A' ? 'left' : 'right'
          } else if (setIndex === 3 && match?.set3CourtSwitched && match?.set3LeftTeam) {
            sideA = match.set3LeftTeam === 'A' ? 'left' : 'right'
          } else {
            // Default fallback - actual positions are set during setup phase
            // Teams stay where they finished the previous set (switching every 7 pts in sets 1-2, every 5 pts in set 3)
            sideA = setIndex % 2 === 1 ? 'left' : 'right'
          }

          // Derive left/right team keys from A/B model
          const leftTeamKey = sideA === 'left' ? teamAKey : teamBKey
          const rightTeamKey = sideA === 'left' ? teamBKey : teamAKey

          // Calculate serving team (same logic as getCurrentServe)
          const set1FirstServe = match?.firstServe || 'team1'
          let currentSetFirstServe
          if (setIndex === 3 && match?.set3FirstServe) {
            currentSetFirstServe = match.set3FirstServe === 'A' ? teamAKey : teamBKey
          } else if (setIndex === 3) {
            const set2First = match?.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
            currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
          } else if (setIndex === 2 && match?.set2FirstServe) {
            currentSetFirstServe = match.set2FirstServe
          } else if (setIndex === 2) {
            currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
          } else {
            currentSetFirstServe = set1FirstServe
          }

          // Find last point event from fresh data to determine current serve
          const pointEventsForSync = allEventsForSync
            .filter(e => e.type === 'point' && e.setIndex === setIndex)
            .sort((a, b) => (b.seq || 0) - (a.seq || 0))
          const servingTeam = pointEventsForSync.length > 0 ? (pointEventsForSync[0].payload?.team || currentSetFirstServe) : currentSetFirstServe

          // Get server number from position I or II of serving team's lineup (beach volleyball)
          const servingTeamLineup = getLineupForTeamFresh(servingTeam)
          const serverNumber = servingTeamLineup?.['I'] ? Number(servingTeamLineup['I'])
            : servingTeamLineup?.['II'] ? Number(servingTeamLineup['II']) : null

          // Get fresh score from the current set for this event
          const allSetsForScore = await db.sets.where('matchId').equals(matchId).toArray()
          const currentSetForScore = allSetsForScore.find(s => s.index === setIndex)
          // teamAKey already defined above at line 3265
          const scoreA = teamAKey === 'team1' ? (currentSetForScore?.team1Points || 0) : (currentSetForScore?.team2Points || 0)
          const scoreB = teamAKey === 'team1' ? (currentSetForScore?.team2Points || 0) : (currentSetForScore?.team1Points || 0)

          await db.sync_queue.add({
            resource: 'event',
            action: 'insert',
            payload: {
              external_id: String(eventId),
              match_id: match?.seed_key || String(matchId), // Use seed_key (external_id) for Supabase lookup
              set_index: setIndex,
              type,
              payload: payload || {},
              seq: nextSeq,
              test: false,
              created_at: new Date().toISOString(),
              // Rich lineup format (same as match_live_state) with captain info
              lineup_left: getRichLineupForTeamFresh(leftTeamKey, servingTeam === leftTeamKey),
              lineup_right: getRichLineupForTeamFresh(rightTeamKey, servingTeam === rightTeamKey),
              serve_team: servingTeam,
              serve_player: serverNumber,
              // Score AFTER this event (Team A/B model)
              score_a: scoreA,
              score_b: scoreB,
              // Full state snapshot for snapshot-based undo/restore
              state_snapshot: stateSnapshot
            },
            ts: Date.now(),
            status: 'queued'
          })
        }

        // Sync to referee after every event
        syncToReferee()

        // Sync live state to Supabase for key events
        const keyEvents = ['point', 'timeout', 'substitution', 'set_start', 'set_end', 'lineup', 'sanction', 'court_captain_designation']
        if (keyEvents.includes(type)) {
          const eventTeam = payload?.team || null
          let eventData = null
          if (type === 'substitution') {
            eventData = { playerIn: payload?.playerIn, playerOut: payload?.playerOut }
          } else if (type === 'timeout') {
            eventData = { duration: 30 }
          } else if (type === 'set_end') {
            // Note: logEvent('set_end', { team: winner, ... }) uses 'team' for the winner
            eventData = { setIndex: payload?.setIndex || data.set.index, winner: payload?.team }
          } else if (type === 'court_captain_designation') {
            eventData = { playerNumber: payload?.playerNumber }
          } else if (type === 'sanction') {
            eventData = {
              type: payload?.type,
              playerType: payload?.playerType || null,
              playerNumber: payload?.playerNumber || null,
              role: payload?.role || null
            }
          }
          // For events that change the lineup, don't use cached snapshot - it was captured BEFORE the event
          // was added to the database. Let syncLiveStateToSupabase fetch a fresh one.
          const lineupChangingEvents = ['substitution', 'lineup']
          const useSnapshot = lineupChangingEvents.includes(type) ? null : stateSnapshot
          syncLiveStateToSupabase(type, eventTeam, eventData, useSnapshot)
        }

        // Continuous cloud backup after every event (non-blocking, throttled)
        if (!isTest) {
          const gameNum = data?.match?.gameNumber || data?.match?.game_n || null
          triggerContinuousBackup(matchId, () => exportMatchData(matchId), gameNum)
        }

        // Refresh eScoresheet if open
        refreshScoresheet()

        // Return the sequence number so it can be used for related events
        return nextSeq
      } finally {
        // MUTEX: Only release the lock if we acquired it
        if (shouldAcquireMutex) {
          eventInProgressRef.current = false
        }
      }
    },
    [data?.set, matchId, getNextSeq, getNextSubSeq, captureFullStateSnapshot, syncToReferee, syncLiveStateToSupabase, refreshScoresheet]
  )

  // Keep logEventRef updated with latest function to avoid circular dependencies
  useEffect(() => {
    logEventRef.current = logEvent
  }, [logEvent])

  const checkSetEnd = useCallback(async (set, team1Points, team2Points) => {
    // Don't show modal if it's already open
    if (setEndTimeModal) return false

    // Determine if this is the 3rd set (tie-break set)
    const is3rdSet = set.index === 3
    const pointsToWin = is3rdSet ? 15 : 21

    // Check if this point would end the set
    if (team1Points >= pointsToWin && team1Points - team2Points >= 2) {
      // Calculate current set scores to determine if this is match-ending
      const allSets = await db.sets.where({ matchId }).toArray()
      const finishedSets = allSets.filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

      // If team1 wins this set, will they have 2 sets?
      const isMatchEnd = (team1SetsWon + 1) >= 2

      // Show set end time confirmation modal
      const defaultTime = new Date().toISOString()
      setSetEndTimeModal({ setIndex: set.index, winner: 'team1', team1Points, team2Points, defaultTime, isMatchEnd })
      return true
    }
    if (team2Points >= pointsToWin && team2Points - team1Points >= 2) {
      // Calculate current set scores to determine if this is match-ending
      const allSets = await db.sets.where({ matchId }).toArray()
      const finishedSets = allSets.filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

      // If team2 wins this set, will they have 2 sets?
      const isMatchEnd = (team2SetsWon + 1) >= 2

      // Show set end time confirmation modal
      const defaultTime = new Date().toISOString()
      setSetEndTimeModal({ setIndex: set.index, winner: 'team2', team1Points, team2Points, defaultTime, isMatchEnd })
      return true
    }
    return false
  }, [matchId, setEndTimeModal])

  // Determine who has serve based on events
  const getCurrentServe = useCallback(() => {
    if (!data?.set || !data?.match) {
      // Normalize firstServe: 'team1'/'team2' -> 'team1'/'team2'
      const rawFirstServe = data?.match?.firstServe || 'team1'
      return rawFirstServe === 'team1' ? 'team1' : rawFirstServe === 'team2' ? 'team2' : rawFirstServe
    }

    const setIndex = data.set.index
    // Normalize firstServe: 'team1'/'team2' -> 'team1'/'team2'
    const rawFirstServe = data.match.firstServe || 'team1'
    const set1FirstServe = rawFirstServe === 'team1' ? 'team1' : rawFirstServe === 'team2' ? 'team2' : rawFirstServe

    // Calculate first serve for current set based on alternation pattern
    // Set 1: set1FirstServe
    // Beach volleyball service alternation:
    // Set 1: determined by coin toss (set1FirstServe)
    // Set 2: opposite of set1FirstServe
    // Set 3: uses set3FirstServe (separate coin toss)
    let currentSetFirstServe

    if (setIndex === 3 && data.match?.set3FirstServe) {
      // Set 3 uses coin toss (stored as 'A' or 'B')
      const teamAKey = data.match.coinTossTeamA || 'team1'
      const teamBKey = data.match.coinTossTeamB || 'team2'
      currentSetFirstServe = data.match.set3FirstServe === 'A' ? teamAKey : teamBKey
    } else if (setIndex === 3) {
      // Set 3 without set3FirstServe specified - use default (opposite of set 2)
      const set2First = data.match?.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
      currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
    } else if (setIndex === 2 && data.match?.set2FirstServe) {
      // Set 2 uses editable set2FirstServe if set
      currentSetFirstServe = data.match.set2FirstServe
    } else if (setIndex === 2) {
      // Set 2 default: opposite of set 1 (who served last in set 1)
      currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
    } else {
      // Set 1
      currentSetFirstServe = set1FirstServe
    }

    if (!data?.events || data.events.length === 0) {
      return currentSetFirstServe
    }

    // Find the last point event in the current set to determine serve
    const pointEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === data.set.index)
      .sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime // Most recent first
      })

    if (pointEvents.length === 0) {
      return currentSetFirstServe
    }

    // The team that scored the last point now has serve
    const lastPoint = pointEvents[0]
    const lastPointTeam = lastPoint.payload?.team
    // Normalize team key: 'team1'/'team2' -> 'team1'/'team2'
    if (lastPointTeam === 'team1') {
      return 'team1'
    } else if (lastPointTeam === 'team2') {
      return 'team2'
    }
    return lastPointTeam || currentSetFirstServe
  }, [data?.events, data?.set, data?.match, data?.match?.set3FirstServe])

  // Calculate which player is serving for a team based on service alternation
  const getServingPlayer = useCallback((teamKey, teamLineup) => {
    if (!teamLineup || !data?.set || !data?.match || !data?.events) {
      // Fallback: return first server (position I or II)
      return teamLineup?.playersOnCourt?.find(p => p.position === 'I' || p.position === 'II')
    }

    const setIndex = data.set.index
    const servingTeam = getCurrentServe()
    
    // If this team doesn't have serve, return null
    if (servingTeam !== teamKey) {
      return null
    }

    // Get first serve player for this team
    const firstServeField = teamKey === 'team1' ? 'team1FirstServe' : 'team2FirstServe'
    const firstServeNumber = data.match[firstServeField]
    
    // Normalize team keys for comparison
    const normalizeTeamKey = (key) => {
      if (key === 'team1') return 'team1'
      if (key === 'team2') return 'team2'
      return key
    }
    
    // Get all point events in this set, sorted chronologically
    const pointEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === setIndex)
      .sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return aTime - bTime // Oldest first
      })

    // Calculate first serve for this set
    const rawFirstServe = data.match.firstServe || 'team1'
    const set1FirstServe = rawFirstServe === 'team1' ? 'team1' : rawFirstServe === 'team2' ? 'team2' : rawFirstServe
    let currentSetFirstServe
    if (setIndex === 3 && data.match?.set3FirstServe) {
      const teamAKey = data.match.coinTossTeamA || 'team1'
      const teamBKey = data.match.coinTossTeamB || 'team2'
      currentSetFirstServe = data.match.set3FirstServe === 'A' ? teamAKey : teamBKey
    } else if (setIndex === 3) {
      const set2First = data.match?.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
      currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
    } else if (setIndex === 2 && data.match?.set2FirstServe) {
      currentSetFirstServe = data.match.set2FirstServe
    } else if (setIndex === 2) {
      currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
    } else {
      currentSetFirstServe = set1FirstServe
    }
    
    // Count how many times this team has gained serve (service changes)
    // Start with first serve
    let trackingServeTeam = normalizeTeamKey(currentSetFirstServe)
    let serviceChangeCount = trackingServeTeam === teamKey ? 1 : 0

    // Track serve changes through point events
    for (const pointEvent of pointEvents) {
      const scoringTeamRaw = pointEvent.payload?.team
      const scoringTeam = normalizeTeamKey(scoringTeamRaw)
      
      // When a team scores, they gain serve (if they didn't already have it)
      if (scoringTeam && scoringTeam !== trackingServeTeam) {
        // Serve changed to scoring team
        trackingServeTeam = scoringTeam
        if (scoringTeam === teamKey) {
          serviceChangeCount++
        }
      }
    }

    // Determine which player serves based on service change count
    // Odd service changes (1, 3, 5...) = first server
    // Even service changes (2, 4, 6...) = second server
    const isFirstServer = serviceChangeCount % 2 === 1
    
    // Normalize team keys for comparison
    const normalizedTeamKey = normalizeTeamKey(teamKey)
    const normalizedFirstServe = normalizeTeamKey(currentSetFirstServe)
    const thisTeamServesFirst = normalizedTeamKey === normalizedFirstServe
    
    // Find the correct player
    if (isFirstServer) {
      // First server: position I (if team serves first) or II (if team serves second)
      const firstServerPosition = thisTeamServesFirst ? 'I' : 'II'
      return teamLineup?.playersOnCourt?.find(p => p.position === firstServerPosition)
    } else {
      // Second server: position III (if team serves first) or IV (if team serves second)
      const secondServerPosition = thisTeamServesFirst ? 'III' : 'IV'
      return teamLineup?.playersOnCourt?.find(p => p.position === secondServerPosition)
    }
  }, [data?.events, data?.set, data?.match, getCurrentServe])

  const leftServeTeamKey = leftisTeam1 ? 'team1' : 'team2'
  const rightServeTeamKey = leftisTeam1 ? 'team2' : 'team1'

  // Compute which team makes decisions in between-sets setup
  // Set 2: Coin toss LOSER gets to choose
  // Set 3: New coin toss WINNER gets to choose
  const betweenSetsDecisionTeam = useMemo(() => {
    if (!isBetweenSets || !data?.set) return null
    const nextSetIndex = data.set.index

    if (nextSetIndex === 2) {
      // Set 2: Coin toss LOSER decides
      const winner = data?.match?.coinTossWinner
      if (!winner) return null
      return winner === 'team1' ? 'team2' : 'team1'
    } else if (nextSetIndex === 3) {
      // Set 3: New coin toss winner decides (stored in set3CoinTossWinner on match)
      return data?.match?.set3CoinTossWinner || null
    }
    return null
  }, [isBetweenSets, data?.set, data?.match?.coinTossWinner, data?.match?.set3CoinTossWinner])

  // Get the name of the decision team for display
  const betweenSetsDecisionTeamName = useMemo(() => {
    if (!betweenSetsDecisionTeam) return null
    if (betweenSetsDecisionTeam === 'team1') {
      return data?.team1Team?.name || data?.team1Team?.shortName || 'Team 1'
    } else {
      return data?.team2Team?.name || data?.team2Team?.shortName || 'Team 2'
    }
  }, [betweenSetsDecisionTeam, data?.team1Team, data?.team2Team])

  // Before coin toss or before set starts, show serve on left (team1) as placeholder
  const isBeforeCoinToss = !data?.match?.coinTossTeamA || !data?.match?.coinTossTeamB
  const hasNoSet = !data?.set

  const currentServeTeam = data?.set ? getCurrentServe() : null

  // Show serve on left as placeholder before coin toss or before set starts
  const leftServing = (isBeforeCoinToss || hasNoSet)
    ? true // Placeholder: serve on left (team1) before coin toss
    : (data?.set ? currentServeTeam === leftServeTeamKey : false)
  const rightServing = (isBeforeCoinToss || hasNoSet)
    ? false
    : (data?.set ? currentServeTeam === rightServeTeamKey : false)

  const serveBallBaseStyle = useMemo(
    () => ({
      width: '28px',
      height: '28px',
      filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))'
    }),
    []
  )

  const renderScoreDisplay = useCallback(
    (style = {}) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', ...style }}>
        {/* Score display container - all elements absolute, colon at center */}
        <div
          className="set-score-display"
          style={{
            position: 'relative',
            width: isCompactMode ? '200px' : isLaptopMode ? '280px' : '350px',
            height: isCompactMode ? '60px' : isLaptopMode ? '85px' : '105px',
            padding: '5px 0',
            letterSpacing: 0
          }}
        >
          {/* Left score - right edge ends before colon */}
          <span style={{
            position: 'absolute',
            right: '50%',
            marginRight: isCompactMode ? '24px' : isLaptopMode ? '32px' : '40px',
            fontVariantNumeric: 'tabular-nums',
            fontSize: isCompactMode ? '52px' : isLaptopMode ? '75px' : '95px',
            fontFamily: getScoreFont(),
            lineHeight: 1,
            letterSpacing: 0,
            minWidth: isCompactMode ? '60px' : isLaptopMode ? '85px' : '110px',
            textAlign: 'right'
          }}>{pointsBySide.left}</span>
          {/* Colon - absolute at center */}
          <span style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: isCompactMode ? '52px' : isLaptopMode ? '75px' : '95px',
            fontFamily: getScoreFont(),
            lineHeight: 1,
            letterSpacing: 0
          }}>:</span>
          {/* Right score - left edge starts after colon */}
          <span style={{
            position: 'absolute',
            left: '50%',
            marginLeft: isCompactMode ? '24px' : isLaptopMode ? '32px' : '40px',
            fontVariantNumeric: 'tabular-nums',
            fontSize: isCompactMode ? '52px' : isLaptopMode ? '75px' : '95px',
            fontFamily: getScoreFont(),
            lineHeight: 1,
            letterSpacing: 0,
            minWidth: isCompactMode ? '60px' : isLaptopMode ? '85px' : '110px',
            textAlign: 'left'
          }}>{pointsBySide.right}</span>
        </div>
      </div>
    ),
    [pointsBySide.left, pointsBySide.right, isCompactMode, isLaptopMode]
  )

  const openManualLineup = useCallback(
    teamKey => {
      if (!data?.set) return
      const existingLineup = getCurrentLineup(teamKey)
      setLineupModal({ team: teamKey, mode: 'manual', lineup: existingLineup })
    },
    [data?.set, getCurrentLineup]
  )

  // Rotate lineup: II→I, III→II, IV→III, V→IV, VI→V, I→VI
  const rotateLineup = useCallback((lineup) => {
    if (!lineup) return null

    const newLineup = {
      I: lineup.II || '',
      II: lineup.III || '',
      III: lineup.IV || '',
      IV: lineup.V || '',
      V: lineup.VI || '',
      VI: lineup.I || ''
    }

    return newLineup
  }, [])

  const handlePoint = useCallback(
    async (side, skipConfirmation = false) => {
      cLogger.logHandler('handlePoint', { side, skipConfirmation })
      if (!data?.set) return
      const teamKey = mapSideToTeamKey(side)

      // Check for accidental point award (if enabled and rally just started)
      if (checkAccidentalPointAward && !skipConfirmation && rallyStartTimeRef.current) {
        const timeSinceRallyStart = (Date.now() - rallyStartTimeRef.current) / 1000
        if (timeSinceRallyStart < accidentalPointAwardDuration) {
          setAccidentalPointConfirmModal({
            team: teamKey,
            onConfirm: () => {
              setAccidentalPointConfirmModal(null)
              handlePoint(side, true) // Call with skipConfirmation = true
            }
          })
          return
        }
      }

      // CRITICAL: Query fresh current set from IndexedDB to avoid stale data after set transitions
      // Use same deduplication logic as useLiveQuery: prefer highest ID for duplicate indices
      const allSets = await db.sets.where('matchId').equals(matchId).toArray()
      const setsByIndex = new Map()
      for (const set of allSets) {
        const existing = setsByIndex.get(set.index)
        if (!existing || set.id > existing.id) {
          setsByIndex.set(set.index, set)
        }
      }
      const dedupedSets = Array.from(setsByIndex.values()).sort((a, b) => a.index - b.index)
      const freshCurrentSet = dedupedSets.find(s => !s.finished) || dedupedSets[dedupedSets.length - 1]
      if (!freshCurrentSet) return

      const field = teamKey === 'team1' ? 'team1Points' : 'team2Points'
      const newPoints = (freshCurrentSet[field] || 0) + 1
      const team1Points = teamKey === 'team1' ? newPoints : (freshCurrentSet.team1Points || 0)
      const team2Points = teamKey === 'team2' ? newPoints : (freshCurrentSet.team2Points || 0)

      // Check who has serve BEFORE this point by querying database directly
      // The team that scored the last point has serve, so check the last point in DB
      const allEventsBeforePoint = await db.events
        .where('matchId')
        .equals(matchId)
        .toArray()
      const pointEventsBefore = allEventsBeforePoint
        .filter(e => e.type === 'point' && e.setIndex === freshCurrentSet.index)
        .sort((a, b) => {
          const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
          const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
          return bTime - aTime // Most recent first
        })

      // Calculate first serve for current set based on alternation pattern
      // Set 1: firstServe, Set 2: opposite, Set 3: same as Set 1, etc.
      const setIndex = freshCurrentSet.index
      const set1FirstServe = data?.match?.firstServe || 'team1'
      let currentSetFirstServe

      if (setIndex === 3 && data.match?.set3FirstServe) {
        const teamAKey = data.match.coinTossTeamA || 'team1'
        const teamBKey = data.match.coinTossTeamB || 'team2'
        currentSetFirstServe = data.match.set3FirstServe === 'A' ? teamAKey : teamBKey
      } else if (setIndex === 3) {
        const set2First = data.match?.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
        currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
      } else if (setIndex === 2 && data.match?.set2FirstServe) {
        currentSetFirstServe = data.match.set2FirstServe
      } else if (setIndex === 2) {
        currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
      } else {
        currentSetFirstServe = set1FirstServe
      }

      let serveBeforePoint = currentSetFirstServe
      if (pointEventsBefore.length > 0) {
        // The last point event shows who has serve now (before this new point)
        const lastPoint = pointEventsBefore[0] // Most recent is first after sorting
        serveBeforePoint = lastPoint.payload?.team || serveBeforePoint
      }

      const scoringTeamHadServe = serveBeforePoint === teamKey

      // Update score and log point FIRST (using fresh set ID)
      await db.sets.update(freshCurrentSet.id, {
        [field]: newPoints
      })
      const pointSeq = await logEvent('point', { team: teamKey, score: { team1: team1Points, team2: team2Points } }, { setIndexOverride: setIndex })

      // Debug log: point awarded
      debugLogger.log('POINT_AWARDED', {
        team: teamKey,
        side,
        newScore: { team1: team1Points, team2: team2Points },
        serveBeforePoint,
        scoringTeamHadServe,
        setIndex: setIndex,
        pointSeq
      }, getStateSnapshot())

      // Track when point was awarded (for accidental rally start check)
      lastPointAwardedTimeRef.current = Date.now()
      // Reset rally start time since rally ended
      rallyStartTimeRef.current = null

      // If scoring team didn't have serve, they rotate their lineup AFTER the point
      if (!scoringTeamHadServe) {
        // Query database directly for the most recent lineup (data.events might be stale)
        const allLineupEvents = await db.events
          .where('matchId')
          .equals(matchId)
          .toArray()
        const teamLineupEvents = allLineupEvents
          .filter(e => e.type === 'lineup' && e.payload?.team === teamKey && e.setIndex === setIndex)
          .sort((a, b) => new Date(b.ts) - new Date(a.ts)) // Most recent first

        let currentLineup = null

        if (teamLineupEvents.length > 0) {
          // Use the most recent lineup
          const lastLineupEvent = teamLineupEvents[0]
          currentLineup = lastLineupEvent.payload?.lineup
        }

        if (currentLineup) {
          // Rotate the lineup
          const rotatedLineup = rotateLineup(currentLineup)
          if (rotatedLineup) {
            // Ensure rotated lineup only has exactly 6 positions (defensive check)
            const validPositions = ['I', 'II', 'III', 'IV', 'V', 'VI']
            const cleanedRotatedLineup = {}
            for (const pos of validPositions) {
              if (rotatedLineup[pos] !== undefined && rotatedLineup[pos] !== '' && rotatedLineup[pos] !== null) {
                cleanedRotatedLineup[pos] = rotatedLineup[pos]
              }
            }

            // CRITICAL: Validate all 6 positions have players - never allow empty positions
            const missingPositions = validPositions.filter(pos => !cleanedRotatedLineup[pos])
            if (missingPositions.length > 0) {
              console.error('[Rotation] CRITICAL BUG: Missing players at positions:', missingPositions,
                { rotatedLineup, cleanedRotatedLineup, currentLineup })
              // Try to recover from current lineup (pre-rotation)
              for (const pos of missingPositions) {
                if (currentLineup[pos]) {
                  cleanedRotatedLineup[pos] = currentLineup[pos]
                }
              }
            }

            // Save the rotated lineup as a new lineup event
            const rotationSeq = await getNextSubSeq(pointSeq)
            const rotationStateBefore = getStateSnapshot()
            const rotationEventId = await db.events.add({
              matchId,
              setIndex: data.set.index,
              type: 'lineup',
              payload: {
                team: teamKey,
                lineup: cleanedRotatedLineup
              },
              ts: new Date().toISOString(),
              seq: rotationSeq,
              stateBefore: rotationStateBefore
            })

            // Debug log: rotation
            debugLogger.log('ROTATION', {
              team: teamKey,
              newLineup: cleanedRotatedLineup,
              rotationSeq
            }, getStateSnapshot())

            // Sync to referee and Supabase
            syncToReferee()
            syncLiveStateToSupabase('rotation', teamKey, { lineup: cleanedRotatedLineup })
          }
        }
      }

      // Beach Volleyball: Court change and TTO logic
      const totalScore = team1Points + team2Points
      const currentSetIndex = data.set.index
      const is3rdSet = currentSetIndex === 3
      const courtChangeInterval = is3rdSet ? 5 : 7
      const pointsToWin = is3rdSet ? 15 : 21

      // Check if this point ends the set (don't show court switch/TTO if set is ending)
      const setIsEnding = (team1Points >= pointsToWin && team1Points - team2Points >= 2) ||
                          (team2Points >= pointsToWin && team2Points - team1Points >= 2)

      // Only show court switch/TTO messages if set is NOT ending
      if (!setIsEnding) {
        // "One point to..." notifications
        const pointsUntilSwitch = courtChangeInterval - (totalScore % courtChangeInterval)

        // One point to TTO: at 20 in sets 1-2 only
        if (totalScore === 20 && currentSetIndex >= 1 && currentSetIndex <= 2) {
          setPreEventPopup({ message: 'One point to TTO' })
        }
        // One point to switch (but not at 20 since that shows TTO message)
        else if (pointsUntilSwitch === 1 && totalScore > 0) {
          setPreEventPopup({ message: 'One point to switch' })
        }

        // At 21 points in Sets 1-2: TTO modal that triggers court switch when dismissed
        if (totalScore === 21 && currentSetIndex >= 1 && currentSetIndex <= 2) {
          // Log technical_to event for PDF scoresheet
          const ttoSeq = await getNextSeq()
          await db.events.add({
            matchId,
            setIndex: currentSetIndex,
            type: 'technical_to',
            payload: {},
            ts: new Date().toISOString(),
            seq: ttoSeq
          })

          // Show TTO modal directly - court switch will happen when TTO ends
          setTtoModal({
            set: data.set,
            team1Points,
            team2Points,
            countdown: 60,
            started: false,
            triggerCourtSwitchAfter: true,  // Flag to trigger court switch when TTO ends
            teamThatScored: teamKey  // Track which team scored to allow BMP for losing team
          })
          return // Don't check for set end yet, wait for TTO + court switch
        }

        // Regular court change: every 7 pts in S1/S2, every 5 pts in S3
        if (totalScore > 0 && totalScore % courtChangeInterval === 0) {
          // Show court switch modal
          setCourtSwitchModal({
            set: data.set,
            team1Points,
            team2Points,
            teamThatScored: teamKey
          })
          return // Don't check for set end yet, wait for court switch confirmation
        }
      }

      const setEnded = checkSetEnd(freshCurrentSet, team1Points, team2Points)
      // If set didn't end, we're done. If it did, checkSetEnd will show the confirmation modal
    },
    [data?.set, data?.events, logEvent, mapSideToTeamKey, checkSetEnd, getCurrentServe, rotateLineup, matchId, syncToReferee]
  )

  const handleStartRally = useCallback(async (skipConfirmation = false) => {
    cLogger.logHandler('handleStartRally', { skipConfirmation })
    // Check for accidental rally start (if enabled and point was just awarded)
    if (checkAccidentalRallyStart && !skipConfirmation && lastPointAwardedTimeRef.current) {
      const timeSinceLastPoint = (Date.now() - lastPointAwardedTimeRef.current) / 1000
      if (timeSinceLastPoint < accidentalRallyStartDuration) {
        setAccidentalRallyConfirmModal({
          onConfirm: () => {
            setAccidentalRallyConfirmModal(null)
            handleStartRally(true) // Call with skipConfirmation = true
          }
        })
        return
      }
    }

    // If this is the first rally, show set start time confirmation
    if (isFirstRally) {
      // Show set start time confirmation
      // For set 1, use scheduled time, for set 2+, use 3 minutes after previous set end
      let defaultTime = roundToMinute(new Date().toISOString())

      if (data?.set?.index === 1) {
        // Use scheduled time from match
        if (data?.match?.scheduledAt) {
          defaultTime = roundToMinute(data.match.scheduledAt)
        }
      } else {
        // Get previous set's end time
        const allSets = await db.sets.where('matchId').equals(matchId).toArray()
        const previousSet = allSets.find(s => s.index === (data.set.index - 1))
        if (previousSet?.endTime) {
          // Add 3 minutes to previous set end time
          const prevEndTime = new Date(previousSet.endTime)
          prevEndTime.setMinutes(prevEndTime.getMinutes() + 3)
          defaultTime = prevEndTime.toISOString()
        }
      }

      setSetStartTimeModal({ setIndex: data?.set?.index, defaultTime })
      return
    }

    // Get current serving team and player
    const servingTeam = getCurrentServe()
    const servingTeamKey = servingTeam
    const teamLineup = servingTeamKey === 'team1'
      ? (leftisTeam1 ? leftTeam : rightTeam)
      : (leftisTeam1 ? rightTeam : leftTeam)
    const servingPlayer = getServingPlayer(servingTeamKey, teamLineup)
    const serverNumber = servingPlayer?.number || null

    await logEvent('rally_start', {
      servingTeam: servingTeam,
      servingPlayerNumber: serverNumber
    })
    // Track when rally started (for accidental point award check)
    rallyStartTimeRef.current = Date.now()
  }, [logEvent, isFirstRally, data?.team1Players, data?.team2Players, data?.events, data?.set, data?.match, matchId, getNextSubSeq, syncToReferee, checkAccidentalRallyStart, accidentalRallyStartDuration, getCurrentServe, getServingPlayer, leftisTeam1, leftTeam, rightTeam])

  const handleReplay = useCallback(async () => {
    // During rally: just log replay event (no point to undo)
    if (rallyStatus === 'in_play') {
      await logEvent('replay')
      return
    }
    // After point: show confirmation modal to undo point
    if (rallyStatus === 'idle' && canReplayRally && data?.events) {
      // Find the last event by sequence number (highest seq)
      const allEvents = [...data.events].sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) {
          return bSeq - aSeq // Descending
        }
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })

      const lastEvent = allEvents[0]
      let pointEvent = null

      if (lastEvent && lastEvent.type === 'point') {
        // Last event is the point itself
        pointEvent = lastEvent
      } else if (lastEvent) {
        // Last event might be a sub-event (decimal seq) following a point
        const lastSeq = lastEvent.seq || 0
        const isSubEvent = lastSeq !== Math.floor(lastSeq)
        if (isSubEvent) {
          // Find the parent point event
          const baseSeq = Math.floor(lastSeq)
          pointEvent = allEvents.find(e => Math.floor(e.seq || 0) === baseSeq && e.type === 'point')
        }
      }

      if (pointEvent) {
        // Simple description for decision change confirmation
        const teamName = pointEvent.payload?.team === 'team1'
          ? (data?.team1Team?.name || 'team1')
          : (data?.team2Team?.name || 'team2')
        const description = `Point for ${teamName}`
        setReplayRallyConfirm({ event: pointEvent, description, selectedOption: 'swap' }) // Default to swap
      }
    }
  }, [logEvent, rallyStatus, canReplayRally, data?.events, data?.team1Team?.name, data?.team2Team?.name])

  // Handle Improper Request sanction
  const handleImproperRequest = useCallback((side) => {
    if (!data?.match || rallyStatus !== 'idle') return
    setSanctionConfirm({ side, type: 'improper_request' })
  }, [data?.match, rallyStatus])

  // Handle Delay Warning sanction
  const handleDelayWarning = useCallback((side) => {
    if (!data?.match || rallyStatus !== 'idle') return
    setSanctionConfirm({ side, type: 'delay_warning' })
  }, [data?.match, rallyStatus])

  // Handle Delay Penalty sanction
  const handleDelayPenalty = useCallback((side) => {
    if (!data?.match || !data?.set || rallyStatus !== 'idle') return
    setSanctionConfirm({ side, type: 'delay_penalty' })
  }, [data?.match, data?.set, rallyStatus])

  // Handle team sanction (for smartphone mode) - takes team key instead of side
  const handleTeamSanction = useCallback((teamKey, sanctionType) => {
    cLogger.logHandler('handleTeamSanction', { teamKey, sanctionType })
    if (!data?.match || rallyStatus !== 'idle') return
    // Convert team key to side
    const side = (teamKey === 'team1' && leftisTeam1) || (teamKey === 'team2' && !leftisTeam1) ? 'left' : 'right'
    setSanctionConfirm({ side, type: sanctionType })
  }, [data?.match, rallyStatus, leftisTeam1])

  // Confirm sanction
  const confirmSanction = useCallback(async () => {
    if (!sanctionConfirm || !data?.match || !data?.set) return

    const { side, type } = sanctionConfirm
    const teamKey = mapSideToTeamKey(side)
    const teamKeyCapitalized = teamKey === 'team1' ? 'team1' : 'team2'

    // Update match sanctions for improper request and delay warning
    // Store by team key (team1/team2) so sanctions follow the team when sides switch
    if (type === 'improper_request' || type === 'delay_warning') {
      const currentSanctions = data.match.sanctions || {}
      await db.matches.update(matchId, {
        sanctions: {
          ...currentSanctions,
          [`${type === 'improper_request' ? 'improperRequest' : 'delayWarning'}${teamKeyCapitalized}`]: true
        }
      })
    }

    // Log the sanction event
    await logEvent('sanction', {
      team: teamKey,
      type: type
    })

    // Debug log: sanction
    debugLogger.log('SANCTION', {
      team: teamKey,
      type,
      side
    }, getStateSnapshot())

    // If delay penalty, award point to the other team (but only if lineups are set)
    if (type === 'delay_penalty') {
      // Check if both lineups are set before awarding point
      const team1LineupSet = data.events?.some(e =>
        e.type === 'lineup' &&
        e.payload?.team === 'team1' &&
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )
      const team2LineupSet = data.events?.some(e =>
        e.type === 'lineup' &&
        e.payload?.team === 'team2' &&
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )

      setSanctionConfirm(null)

      if (team1LineupSet && team2LineupSet) {
        // Both lineups are set - award point immediately
        const otherSide = side === 'left' ? 'right' : 'left'
        await handlePoint(otherSide)
      } else {
        // Lineups not set - show message
        showAlert('Delay penalty recorded. Point will be awarded after both teams set their lineups.', 'info')
      }
    } else {
      setSanctionConfirm(null)
    }
  }, [sanctionConfirm, data?.match, data?.set, data?.events, mapSideToTeamKey, matchId, logEvent, handlePoint])

  // Confirm set start time
  const confirmSetStartTime = useCallback(async (time) => {
    if (!setStartTimeModal || !data?.set) return

    // Check if the confirmed time differs from the expected time
    // Compare only hours and minutes since the modal only shows time, not date
    const expectedDate = new Date(setStartTimeModal.defaultTime)
    const confirmedDate = new Date(time)
    const expectedMinutes = expectedDate.getUTCHours() * 60 + expectedDate.getUTCMinutes()
    const confirmedMinutes = confirmedDate.getUTCHours() * 60 + confirmedDate.getUTCMinutes()
    const timeDifferent = expectedMinutes !== confirmedMinutes

    // Update set with start time (absolute timestamp)
    await db.sets.update(data.set.id, { startTime: roundToMinute(time) })

    // Get the highest sequence number for this match
    const nextSeq1 = await getNextSeq()
    const nextSeq2 = nextSeq1 + 1
    const setStartStateBefore = getStateSnapshot()

    // Log set_start event
    const setStartEventId = await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'set_start',
      payload: {
        setIndex: setStartTimeModal.setIndex,
        startTime: roundToMinute(time)
      },
      ts: roundToMinute(time),
      seq: nextSeq1,
      stateBefore: setStartStateBefore
    })

    // Debug log: set start
    debugLogger.log('SET_START', {
      setIndex: setStartTimeModal.setIndex,
      startTime: time,
      seq: nextSeq1
    }, setStartStateBefore)

    setSetStartTimeModal(null)

    // Trigger event backup for Safari/Firefox
    onTriggerEventBackup?.('set_start')

    // Now actually start the rally
    // Get current serving team and player
    const servingTeam = getCurrentServe()
    const servingTeamKey = servingTeam
    const teamLineup = servingTeamKey === 'team1'
      ? (leftisTeam1 ? leftTeam : rightTeam)
      : (leftisTeam1 ? rightTeam : leftTeam)
    const servingPlayer = getServingPlayer(servingTeamKey, teamLineup)
    const serverNumber = servingPlayer?.number || null

    const rallyStartStateBefore = getStateSnapshot()
    await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'rally_start',
      payload: {
        servingTeam: servingTeam,
        servingPlayerNumber: serverNumber
      },
      ts: new Date().toISOString(),
      seq: nextSeq2,
      stateBefore: rallyStartStateBefore
    })

    // Sync to referee immediately after set start
    syncToReferee()

    // If the start time differs from expected, automatically open remarks
    if (timeDifferent) {
      setShowRemarks(true)
    }
  }, [setStartTimeModal, data?.set, matchId, onTriggerEventBackup, syncToReferee, getCurrentServe, getServingPlayer, leftisTeam1, leftTeam, rightTeam])

  // Confirm set end time
  const confirmSetEndTime = useCallback(async (time) => {

    if (!setEndTimeModal || !data?.match || !data?.set) {
      return
    }

    const { setIndex, winner, team1Points, team2Points } = setEndTimeModal

    // Guard: Check if this set was already confirmed to prevent double-processing
    if (confirmedSetEndRef.current.has(setIndex)) {
      setSetEndTimeModal(null)
      return
    }

    // Mark this set as being confirmed
    confirmedSetEndRef.current.add(setIndex)

    // Close modal immediately to prevent multiple confirmations
    setSetEndTimeModal(null)

    // Show loading overlay
    setSetTransitionLoading({ step: 'Finishing set...' })

    // Show sync progress modal
    setSyncModalOpen(true)

    // CRITICAL: Acquire lock IMMEDIATELY to prevent ensureActiveSet from creating duplicate sets
    // This must happen BEFORE we mark the current set as finished
    setCreationInProgressRef.current = true

    // Cleanup function to ensure resources are released on any failure
    const cleanup = (reason) => {
      setCreationInProgressRef.current = false
      setSetTransitionLoading(null)
      setSyncModalOpen(false)
      resetSyncState()
    }

    try {
      // Determine team labels (A or B) based on coin toss
      const teamAKey = data.match.coinTossTeamA || 'team1'
      const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
      const winnerLabel = winner === 'team1'
        ? (teamAKey === 'team1' ? 'A' : 'B')
        : (teamAKey === 'team2' ? 'A' : 'B')

      // Get start time from current set
      const startTime = data.set.startTime

      // STEP 3: Log set_end event to local DB
      await logEvent('set_end', {
        team: winner,
        teamLabel: winnerLabel,
        setIndex: setIndex,
        team1Points,
        team2Points,
        startTime: startTime,
        endTime: roundToMinute(time)
      })

      // Debug log: set end
      debugLogger.log('SET_END', {
        winner,
        winnerLabel,
        setIndex,
        team1Points,
        team2Points,
        startTime,
        endTime: roundToMinute(time)
      }, getStateSnapshot())

      // STEP 4: Update set with end time and finished status in local DB
      // CRITICAL FIX: Find set by matchId + setIndex to avoid updating wrong set if duplicates exist
      const allSetsBeforeUpdate = await db.sets.where('matchId').equals(matchId).toArray()

      // Find the UNFINISHED set with this index (the one we're actually playing)
      const setToUpdate = allSetsBeforeUpdate.find(s => s.index === setIndex && !s.finished)

      // SAFE FALLBACK: Only use data.set.id if it has the correct index
      let setIdToUpdate = setToUpdate?.id
      if (!setIdToUpdate) {
        // No unfinished set with matching index found - check if data.set has correct index
        if (data.set.index === setIndex) {
          setIdToUpdate = data.set.id
          console.warn('[SET_END] Fallback to data.set.id - set may already be finished but index matches:', setIdToUpdate)
        } else {
          // Check if the set is ALREADY finished (e.g. from a previous confirmation call)
          const alreadyFinishedSet = allSetsBeforeUpdate.find(s => s.index === setIndex && s.finished)
          if (alreadyFinishedSet) {
            cleanup('set already finished')
            return
          }

          // CRITICAL: Cannot find correct set to update - abort to prevent data corruption
          console.error('[SET_END] CRITICAL: Cannot find set with index', setIndex, 'to update.')
          console.error('[SET_END] data.set has index', data.set.index, '- aborting to prevent wrong set update')
          console.error('[SET_END] Available sets:', allSetsBeforeUpdate.map(s => ({ id: s.id, index: s.index, finished: s.finished })))
          showAlert(t('scoreboard.errors.setNotFound'), 'error')
          cleanup('set not found')
          return
        }
      }

      if (setIdToUpdate !== data.set.id) {
        console.warn('[SET_END_DEBUG] WARNING: data.set.id differs from the unfinished set! Using correct set id:', setIdToUpdate)
      }

      setSetTransitionLoading({ step: 'Saving set data...' })
      const updateResult = await db.sets.update(setIdToUpdate, { finished: true, team1Points, team2Points, endTime: roundToMinute(time) })

      // STEP 5: Verify the update actually worked
      const verifySet = await db.sets.get(setIdToUpdate)

      if (!verifySet?.finished) {
        console.error('[SET_END_DEBUG] STEP 5 FAILED: Set was NOT marked as finished! This is a bug.')
      }

      // STEP 6: Get all sets and calculate sets won by each team
      const sets = await db.sets.where({ matchId }).toArray()
      const finishedSets = sets.filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

      // STEP 7: Check if either team has won 2 sets (best-of-3 match win)
      const isMatchEnd = team1SetsWon >= 2 || team2SetsWon >= 2

      // Get match record for both branches (test check, cloud backup)
      const matchRecord = await db.matches.get(matchId)

      // Track sync result for conditional backup download
      let syncResult = null

      // STEP 8: IMMEDIATE SYNC TO SUPABASE (if not a test match)
      // Sync happens FIRST before any UI operations to ensure data is saved
      if (matchRecord?.test !== true && matchRecord?.seed_key) {
        setSetTransitionLoading({ step: 'Syncing to cloud...' })

        // Prepare set update payload
        const setPayload = {
          external_id: String(setIdToUpdate),
          team1_points: team1Points,
          team2_points: team2Points,
          finished: true,
          end_time: time
        }

        // Prepare match payload if match end
        let matchPayload = null
        if (isMatchEnd) {
          const setResults = finishedSets
            .sort((a, b) => a.index - b.index)
            .map(s => ({ set: s.index, team1: s.team1Points, team2: s.team2Points }))
          const matchWinner = team1SetsWon > team2SetsWon ? 'team1' : 'team2'
          const finalScore = `${team1SetsWon}-${team2SetsWon}`

          matchPayload = {
            id: matchRecord.seed_key,
            status: 'ended',
            set_results: setResults,
            winner: matchWinner,
            final_score: finalScore,
            sanctions: matchRecord?.sanctions || null
          }
        }

        // Execute sequential sync (shows progress modal)
        syncResult = await syncSetEnd({
          lastPointPayload: null, // Last point already synced by logEvent
          setPayload,
          matchPayload
        })


        // Handle sync completion based on result
        // - Success: brief 1s delay to show success, then proceed
        // - Warning (offline): 1.5s delay, then proceed
        // - Error: wait for user to click button in modal (with 5s timeout fallback)
        if (!syncResult.success) {
          // Error - wait for modal callback or timeout
          const SYNC_MODAL_TIMEOUT = 5000
          let syncTimeoutId = null

          await Promise.race([
            new Promise((resolve) => {
              syncProceedCallbackRef.current = () => {
                if (syncTimeoutId) clearTimeout(syncTimeoutId)
                setSyncModalOpen(false)
                resetSyncState()
                resolve()
              }
            }),
            new Promise((resolve) => {
              syncTimeoutId = setTimeout(() => {
                console.warn('[SET_END] Sync modal timeout after 5s - proceeding anyway')
                syncProceedCallbackRef.current = null
                setSyncModalOpen(false)
                resetSyncState()
                resolve()
              }, SYNC_MODAL_TIMEOUT)
            })
          ])
        } else {
          // Success or warning - show completion briefly then proceed
          const delay = syncResult.hasWarning ? 1500 : 1000
          await new Promise(resolve => setTimeout(resolve, delay))
          setSyncModalOpen(false)
          resetSyncState()
        }
      } else {
        // For test matches, close sync modal immediately
        setSyncModalOpen(false)
        resetSyncState()
      }


      // STEP 9+: Branch based on match end or set end
      if (isMatchEnd) {
        // IMPORTANT: When match ends, preserve ALL data in database:
        // - All sets remain in db.sets
        // - All events remain in db.events
        // - All players remain in db.players
        // - All teams remain in db.teams
        // - Set status to 'ended' - MatchEnd component will set to 'approved' after approval
        // Status flow: live -> ended -> approved

        // Update local match status to 'ended'
        await db.matches.update(matchId, { status: 'ended' })

        // Verify the status was updated
        const matchAfterStatusUpdate = await db.matches.get(matchId)

        // NOTE: Match update sync is now done in STEP 8 (sequential sync) above

        // Notify server to delete match from matchDataStore (since it's now final)
        const currentWs = wsRef.current
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          try {
            currentWs.send(JSON.stringify({
              type: 'delete-match',
              matchId: String(matchId)
            }))
          } catch (err) {
            // Silently ignore WebSocket errors
          }
        }

        // Trigger event backup for Safari/Firefox (match end)
        onTriggerEventBackup?.('match_end')

        // Cloud backup at match end (non-blocking)
        if (matchRecord?.test !== true) {
          const gameNum = matchRecord?.gameNumber || matchRecord?.game_n || null
          exportMatchData(matchId).then(backupData => {
            uploadBackupToCloud(matchId, backupData)
            uploadLogsToCloud(matchId, gameNum)
          }).catch(() => { })
        }

        // Only call onFinishSet for match end, not between sets
        // (Scoreboard now handles set creation internally)
        if (onFinishSet) onFinishSet(data.set)

        // Release lock for match end path (no new set to create)
        setCreationInProgressRef.current = false
        setSetTransitionLoading(null) // Clear loading overlay

        return // Exit early for match end - don't fall through to new set creation
      } else {
        // Trigger event backup for Safari/Firefox (set end)
        onTriggerEventBackup?.('set_end')

        // Cloud backup at set end (non-blocking)
        if (matchRecord?.test !== true) {
          setSetTransitionLoading({ step: 'Uploading backup...' })
          const gameNum = matchRecord?.gameNumber || matchRecord?.game_n || null
          exportMatchData(matchId).then(backupData => {
            uploadBackupToCloud(matchId, backupData)
            uploadLogsToCloud(matchId, gameNum)
          }).catch(() => { })
        }

        // Auto-download game data at set end if enabled AND sync failed/offline
        // If sync succeeded and we're online, data is safe in cloud - no need to download
        const syncSucceeded = syncResult?.success && !syncResult?.hasWarning
        const isOffline = !navigator.onLine

        if (autoDownloadAtSetEnd && (!syncSucceeded || isOffline)) {
          setSetTransitionLoading({ step: 'Downloading backup...' })
          try {
            const allMatches = await db.matches.toArray()
            const allTeams = await db.teams.toArray()
            const allPlayers = await db.players.toArray()
            const allSets = await db.sets.toArray()
            const allEvents = await db.events.toArray()
            const allReferees = await db.referees.toArray()
            const allScorers = await db.scorers.toArray()

            const exportData = {
              exportDate: new Date().toISOString(),
              exportReason: `set_${setIndex}_end`,
              matchId: matchId,
              matches: allMatches,
              teams: allTeams,
              players: allPlayers,
              sets: allSets,
              events: allEvents,
              referees: allReferees,
              scorers: allScorers
            }

            const jsonString = JSON.stringify(exportData, null, 2)
            const blob = new Blob([jsonString], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `backup_set${setIndex}_${matchId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
          } catch (error) {
            console.error('Auto-download at set end failed:', error)
          }
        }

        // Start countdown immediately when set ends (not match end)
        // Reset dismissed flag and start countdown
        countdownDismissedRef.current = false
        setBetweenSetsCountdown({ countdown: setIntervalDuration, started: true })

        // Send set_end action to referee to show countdown
        sendActionToReferee('set_end', {
          setIndex,
          winner: winner,
          team1Points: team1Points,
          team2Points: team2Points,
          countdown: setIntervalDuration,
          startTimestamp: Date.now(),
          team1SetsWon,
          team2SetsWon
        })

        // Lock was already acquired early in confirmSetEndTime
        // Verify it's still held (should be true)

        // Upload scoresheet to cloud (async, non-blocking) - Set Finished state
        const matchForScoresheet = await db.matches.get(matchId)
        // Support both old and new field names
        const sheetteam1TeamId = matchForScoresheet?.team1Id || matchForScoresheet?.team1TeamId
        const sheetteam2TeamId = matchForScoresheet?.team2Id || matchForScoresheet?.team2TeamId
        const allSetsForScoresheet = await db.sets.where('matchId').equals(matchId).sortBy('index')
        const allEventsForScoresheet = await db.events.where('matchId').equals(matchId).sortBy('seq')
        const team1PlayersForScoresheet = await db.players.where('teamId').equals(sheetteam1TeamId || '').toArray()
        const team2PlayersForScoresheet = await db.players.where('teamId').equals(sheetteam2TeamId || '').toArray()
        const team1TeamForScoresheet = sheetteam1TeamId ? await db.teams.get(sheetteam1TeamId) : null
        const team2TeamForScoresheet = sheetteam2TeamId ? await db.teams.get(sheetteam2TeamId) : null

        uploadScoresheetAsync({
          match: matchForScoresheet,
          team1Team: team1TeamForScoresheet,
          team2Team: team2TeamForScoresheet,
          team1Players: team1PlayersForScoresheet,
          team2Players: team2PlayersForScoresheet,
          sets: allSetsForScoresheet,
          events: allEventsForScoresheet
        })


        // Create next set immediately (lock is still held from earlier)
        // This prevents ensureActiveSet from racing with manual set creation
        try {
          const newSetIndex = setIndex + 1

          // Special handling for Set 3 - need to set up coin toss defaults
          if (newSetIndex === 3) {

            // Get team A/B assignments for set 3
            const set2TeamAKey = data?.match?.coinTossTeamA || 'team1'

            // Determine current positions at end of set 2 (set 2 has teams switched from set 1)
            const set2leftisTeam1 = set2TeamAKey !== 'team1'
            const set2LeftTeamKey = set2leftisTeam1 ? 'team1' : 'team2'
            const set2LeftTeamLabel = set2LeftTeamKey === set2TeamAKey ? 'A' : 'B'

            // Get current serve at end of set 2
            const currentServe = getCurrentServe()
            const set2ServingTeamLabel = currentServe === set2TeamAKey ? 'A' : 'B'

            // Use existing values if set, otherwise use current positions
            const selectedLeftTeam = data?.match?.set3LeftTeam || set2LeftTeamLabel
            const selectedFirstServe = data?.match?.set3FirstServe || set2ServingTeamLabel

            // Set default values for inline setup UI
            setSet3SelectedLeftTeam(selectedLeftTeam)
            setSet3SelectedFirstServe(selectedFirstServe)
            setSet3SetupConfirmed(false) // Mark as not confirmed - inline UI will show

            // Update match with default Set 3 configuration
            await db.matches.update(matchId, {
              set3LeftTeam: selectedLeftTeam,
              set3FirstServe: selectedFirstServe,
              set3CourtSwitched: false
            })
          }

          // Check if a set with this index already exists
          const allSetsForMatch = await db.sets.where('matchId').equals(matchId).toArray()
          const existingSet = allSetsForMatch.find(s => s.index === newSetIndex)

          let newSetId
          if (existingSet) {
            await db.sets.update(existingSet.id, { finished: false, team1Points: 0, team2Points: 0 })
            newSetId = existingSet.id
          } else {
            newSetId = await db.sets.add({
              matchId,
              index: newSetIndex,
              team1Points: 0,
              team2Points: 0,
              finished: false
            })
          }

          // Reset set3CourtSwitched flag (for non-set-5 transitions)
          if (newSetIndex !== 5) {
            await db.matches.update(matchId, { set3CourtSwitched: false })
          }

          // Sync new set to cloud (if not test match)
          const matchRecordForNewSet = await db.matches.get(matchId)
          const isTest = matchRecordForNewSet?.test || false
          if (!isTest && !existingSet) {
            await db.sync_queue.add({
              resource: 'set',
              action: 'insert',
              payload: {
                external_id: String(newSetId),
                match_id: matchRecordForNewSet?.seed_key || String(matchId),
                index: newSetIndex,
                team1_points: 0,
                team2_points: 0,
                finished: false,
                test: isTest,
                start_time: new Date().toISOString()
              },
              ts: new Date().toISOString(),
              status: 'queued'
            })
          }

        } finally {
          // Release lock and clear loading overlay
          setCreationInProgressRef.current = false
          setSetTransitionLoading(null)
        }
      }
    } catch (error) {
      // COMPREHENSIVE ERROR HANDLER - ensures cleanup on ANY failure
      console.error('[SET_END] CRITICAL ERROR in confirmSetEndTime:', error)
      console.error('[SET_END] Error stack:', error.stack)

      // Show user-friendly error message
      showAlert(t('scoreboard.errors.setEndFailed', 'Set end failed. Data saved locally.'), 'error')

      // Ensure cleanup happens
      cleanup('uncaught exception: ' + error.message)

      // Don't re-throw - the match can continue from local data
    }
  }, [setEndTimeModal, data?.match, data?.set, matchId, logEvent, onFinishSet, getCurrentServe, teamAKey, onTriggerEventBackup, syncSetEnd, resetSyncState, setIntervalDuration, showAlert, t])

  // Confirm set 3 side and service choices (works with both modal and inline UI)
  const confirmSet3SideService = useCallback(async (leftTeam, firstServe, inlineMode = false) => {
    // For inline mode, we don't need the modal - just verify we have match data and it's set 3
    if (!inlineMode && !set3SideServiceModal) return
    if (!data?.match) return

    const setIndex = inlineMode ? 3 : set3SideServiceModal.setIndex
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const teamBKey = data.match.coinTossTeamB || 'team2'

    // Determine which team (team1/team2) is on the left
    const leftTeamKey = leftTeam === 'A' ? teamAKey : teamBKey

    // Determine which team (team1/team2) serves first
    const firstServeTeamKey = firstServe === 'A' ? teamAKey : teamBKey

    // For inline mode, database is already updated on button press, so just log the event
    // For modal mode, update the database now
    if (!inlineMode) {
      // Update match with set 3 configuration
      await db.matches.update(matchId, {
        set3LeftTeam: leftTeam,
        set3FirstServe: firstServe,
        set3CourtSwitched: false
      })

      // Create set 3 (check if already exists first)
      const existingSet3 = await db.sets.where({ matchId, index: setIndex }).first()
      let newSetId
      if (existingSet3) {
        await db.sets.update(existingSet3.id, { finished: false, team1Points: 0, team2Points: 0 })
        newSetId = existingSet3.id
      } else {
        newSetId = await db.sets.add({
          matchId,
          index: setIndex,
          team1Points: 0,
          team2Points: 0,
          finished: false
        })
      }

      // Get match to check if it's a test match
      const match = await db.matches.get(matchId)
      const isTest = match?.test || false

      // Only add to sync queue if set was newly created and it's an official match
      if (!existingSet3 && !isTest) {
        await db.sync_queue.add({
          resource: 'set',
          action: 'insert',
          payload: {
            external_id: String(newSetId),
            match_id: match?.seed_key || String(matchId),
            index: setIndex,
            team1_points: 0,
            team2_points: 0,
            finished: false,
            test: isTest,
            start_time: new Date().toISOString()
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    }

    // Log the set 3 coin toss event so it can be undone
    const nextSeq = await getNextSeq()
    const set3CoinTossStateBefore = getStateSnapshot()
    await db.events.add({
      matchId,
      setIndex: setIndex,
      type: 'set3_coin_toss',
      payload: {
        leftTeam,
        firstServe,
        leftTeamKey,
        firstServeTeamKey
      },
      ts: new Date().toISOString(),
      seq: nextSeq,
      stateBefore: set3CoinTossStateBefore
    })

    // Close modal or confirm inline setup
    if (inlineMode) {
      setSet3SetupConfirmed(true)
    } else {
      setSet3SideServiceModal(null)
    }
  }, [set3SideServiceModal, data?.match, matchId, getNextSeq, getStateSnapshot])

  // Handle Set 3 coin toss (before Set 3 starts)
  const handleSet3CoinToss = useCallback(async (winner) => {
    if (!data?.match) return

    await db.matches.update(matchId, { set3CoinTossWinner: winner })

    // Log event for undo
    const nextSeq = await getNextSeq()
    await db.events.add({
      matchId,
      setIndex: 3,
      type: 'set3_coin_toss_winner',
      payload: { winner },
      ts: new Date().toISOString(),
      seq: nextSeq
    })
  }, [matchId, data?.match, getNextSeq])

  // Switch which team starts on which side for the next set
  const handleBetweenSetsSwitchSides = useCallback(async () => {
    if (!data?.match || !data?.set) return

    const setIndex = data.set.index
    const currentOverrides = data.match.setLeftTeamOverrides || {}

    // Get current left team for this set
    let currentLeftTeam
    if (currentOverrides[setIndex]) {
      currentLeftTeam = currentOverrides[setIndex]
    } else {
      // Default pattern: Set 1 = A left, Set 2 = B left
      currentLeftTeam = setIndex % 2 === 1 ? 'A' : 'B'
    }

    // Toggle: if A is on left, make B on left (and vice versa)
    const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
    const updatedOverrides = { ...currentOverrides, [setIndex]: newLeftTeam }

    await db.matches.update(matchId, { setLeftTeamOverrides: updatedOverrides })
  }, [data?.match, data?.set, matchId])

  // Switch which team serves first for the next set (Set 2 or Set 3 interval)
  const handleBetweenSetsSwitchServe = useCallback(async () => {
    if (!data?.match || !data?.set) return

    const setIndex = data.set.index
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const set1FirstServe = data.match.firstServe || 'team1'

    if (setIndex === 3) {
      // Set 3: toggle set3FirstServe between 'A' and 'B'
      const currentFirstServe = data.match.set3FirstServe || 'A'
      const newFirstServe = currentFirstServe === 'A' ? 'B' : 'A'
      console.log('[BetweenSets] Switch serve (Set 3):', { currentFirstServe, newFirstServe })
      await db.matches.update(matchId, { set3FirstServe: newFirstServe })
    } else if (setIndex === 2) {
      // Set 2: toggle set2FirstServe between team1 and team2
      // Default is opposite of set 1 (who served last in set 1)
      const defaultSet2First = set1FirstServe === 'team1' ? 'team2' : 'team1'
      const currentFirstServe = data.match.set2FirstServe || defaultSet2First
      const newFirstServe = currentFirstServe === 'team1' ? 'team2' : 'team1'
      console.log('[BetweenSets] Switch serve (Set 2):', { currentFirstServe, newFirstServe })
      await db.matches.update(matchId, { set2FirstServe: newFirstServe })
    }
  }, [data?.match, data?.set, matchId])

  // Swap first/second server for a team
  const handleBetweenSetsSwitchServiceOrder = useCallback(async (teamKey) => {
    if (!data?.match) return

    const field = teamKey === 'team1' ? 'team1FirstServe' : 'team2FirstServe'
    const players = teamKey === 'team1' ? (data?.team1Players || []) : (data?.team2Players || [])

    if (players.length < 2) return

    const playerNumbers = players.map(p => p.number).sort((a, b) => a - b)
    const currentServer = data.match[field]
    // Find the other player, or if current not set, toggle between first two
    const otherNumber = playerNumbers.find(n => String(n) !== String(currentServer)) ?? playerNumbers[1]

    console.log('[BetweenSets] Switch service order:', { teamKey, field, currentServer, playerNumbers, otherNumber })
    await db.matches.update(matchId, { [field]: otherNumber })
  }, [data?.match, data?.team1Players, data?.team2Players, matchId])

  // Confirm between-sets setup and allow play to begin
  const confirmBetweenSetsSetup = useCallback(async () => {
    if (!data?.set) return

    // Log the setup confirmation event
    const nextSeq = await getNextSeq()
    await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'between_sets_setup_confirmed',
      payload: {
        setIndex: data.set.index,
        confirmedAt: new Date().toISOString()
      },
      ts: new Date().toISOString(),
      seq: nextSeq
    })

    setBetweenSetsSetupConfirmed(true)
    countdownDismissedRef.current = true
    setBetweenSetsCountdown(null)
  }, [matchId, data?.set, getNextSeq])


  // Get action description for an event
  const getActionDescription = useCallback((event) => {
    if (!event || !data) return 'Unknown action'

    const teamName = event.payload?.team === 'team1'
      ? (data.team1Team?.name || 'team1')
      : event.payload?.team === 'team2'
        ? (data.team2Team?.name || 'team2')
        : null

    // Determine team labels (A or B)
    const teamALabel = data?.match?.coinTossTeamA === 'team1' ? 'A' : 'B'
    const teamBLabel = data?.match?.coinTossTeamB === 'team1' ? 'A' : 'B'
    const team1Label = data?.match?.coinTossTeamA === 'team1' ? 'A' : (data?.match?.coinTossTeamB === 'team1' ? 'B' : 'A')
    const team2Label = data?.match?.coinTossTeamA === 'team2' ? 'A' : (data?.match?.coinTossTeamB === 'team2' ? 'B' : 'B')

    // Calculate score at time of event
    const setIdx = event.setIndex || 1
    const setEvents = data.events?.filter(e => (e.setIndex || 1) === setIdx) || []
    const eventIndex = setEvents.findIndex(e => e.id === event.id)

    let team1Score = 0
    let team2Score = 0
    for (let i = 0; i <= eventIndex; i++) {
      const e = setEvents[i]
      if (e.type === 'point') {
        if (e.payload?.team === 'team1') {
          team1Score++
        } else if (e.payload?.team === 'team2') {
          team2Score++
        }
      }
    }

    let eventDescription = ''
    if (event.type === 'coin_toss') {
      const teamAName = event.payload?.teamA === 'team1'
        ? (data?.team1Team?.shortName || data?.team1Team?.name || 'team1')
        : (data?.team2Team?.shortName || data?.team2Team?.name || 'team2')
      const teamBName = event.payload?.teamB === 'team1'
        ? (data?.team1Team?.shortName || data?.team1Team?.name || 'team1')
        : (data?.team2Team?.shortName || data?.team2Team?.name || 'team2')
      // Determine if first serve is Team A or Team B
      const firstServeLabel = event.payload?.firstServe === event.payload?.teamA ? 'A' : 'B'
      eventDescription = `Coin toss - A: ${teamAName}, B: ${teamBName}, First serve: ${firstServeLabel}`
    } else if (event.type === 'point') {
      eventDescription = `Point — ${teamName} (${team1Label} ${team1Score}:${team2Score} ${team2Label})`
    } else if (event.type === 'timeout') {
      eventDescription = `Timeout — ${teamName}`
    } else if (event.type === 'substitution') {
      const playerOut = event.payload?.playerOut || '?'
      const playerIn = event.payload?.playerIn || '?'
      const isExceptional = event.payload?.isExceptional === true
      const substitutionType = isExceptional ? 'Exceptional substitution' : 'Substitution'
      eventDescription = `${substitutionType} — ${teamName} (OUT: ${playerOut} IN: ${playerIn}) (${team1Label} ${team1Score}:${team2Score} ${team2Label})`
    } else if (event.type === 'set_start') {
      // Format the relative time as MM:SS
      const relativeTime = typeof event.ts === 'number' ? event.ts : 0
      const totalSeconds = Math.floor(relativeTime / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      const minutesStr = String(minutes).padStart(2, '0')
      const secondsStr = String(seconds).padStart(2, '0')
      eventDescription = `Set start — ${minutesStr}:${secondsStr}`
    } else if (event.type === 'rally_start') {
      eventDescription = 'Rally started'
    } else if (event.type === 'replay') {
      // Show detailed replay info with scores
      const { oldteam1Points, oldteam2Points, newteam1Points, newteam2Points } = event.payload || {}
      if (oldteam1Points !== undefined && newteam1Points !== undefined) {
        // Get team labels (A/B) based on coin toss
        const teamAKey = data?.match?.coinTossTeamA || 'team1'
        const oldLeftScore = teamAKey === 'team1' ? oldteam1Points : oldteam2Points
        const oldRightScore = teamAKey === 'team1' ? oldteam2Points : oldteam1Points
        const newLeftScore = teamAKey === 'team1' ? newteam1Points : newteam2Points
        const newRightScore = teamAKey === 'team1' ? newteam2Points : newteam1Points
        eventDescription = `${oldLeftScore}:${oldRightScore} Rally Replayed, new score ${newLeftScore}:${newRightScore}`
      } else {
        eventDescription = 'Rally replayed'
      }
    } else if (event.type === 'decision_change') {
      const fromTeam = event.payload?.fromTeam === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')
      const toTeam = event.payload?.toTeam === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')
      eventDescription = `Decision change — Point swapped from ${fromTeam} to ${toTeam}`
    } else if (event.type === 'lineup') {
      // Only show initial lineups, not rotation lineups
      const isInitial = event.payload?.isInitial === true
      const hasSubstitution = event.payload?.fromSubstitution === true

      // Skip rotation lineups (they're part of the point)
      if (!isInitial && !hasSubstitution) {
        return null
      }

      // Only show initial lineups as "Line-up setup"
      if (isInitial) {
        eventDescription = `${t('scoreboard.lineupSetup', 'Line-up setup')} — ${teamName}`
      } else {
        return null // Skip rotation lineups (they're part of the point)
      }
    } else if (event.type === 'set_end') {
      const winnerLabel = event.payload?.teamLabel || '?'
      const setIndex = event.payload?.setIndex || event.setIndex || '?'
      const startTime = event.payload?.startTime
      const endTime = event.payload?.endTime

      let timeInfo = ''
      if (startTime && endTime) {
        const start = new Date(startTime)
        const end = new Date(endTime)
        const durationMs = end - start
        const durationMin = Math.floor(durationMs / 60000)
        const durationSec = Math.floor((durationMs % 60000) / 1000)
        const startTimeStr = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`
        const endTimeStr = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`
        timeInfo = ` (${startTimeStr} - ${endTimeStr}, ${durationMin} min)`
      }

      eventDescription = `Team ${winnerLabel} won Set ${setIndex}${timeInfo}`
    } else if (event.type === 'set3_coin_toss') {
      const leftTeam = event.payload?.leftTeam || '?'
      const firstServe = event.payload?.firstServe || '?'
      eventDescription = `Set 3 coin toss — Left: Team ${leftTeam}, First serve: Team ${firstServe}`
    } else if (event.type === 'set3_coin_toss_winner') {
      const winner = event.payload?.winner
      const winnerTeamName = winner === 'team1'
        ? (data?.team1Team?.name || data?.team1Team?.shortName || 'Team 1')
        : winner === 'team2'
          ? (data?.team2Team?.name || data?.team2Team?.shortName || 'Team 2')
          : '?'
      eventDescription = `Set 3 coin toss winner — ${winnerTeamName}`
    } else if (event.type === 'sanction') {
      const sanctionType = event.payload?.type || 'unknown'
      const sanctionLabel = sanctionType === 'improper_request' ? 'Improper Request' :
        sanctionType === 'delay_warning' ? 'Delay Warning' :
          sanctionType === 'delay_penalty' ? 'Delay Penalty' :
            sanctionType === 'warning' ? 'Warning' :
              sanctionType === 'penalty' ? 'Penalty' :
                sanctionType === 'expulsion' ? 'Expulsion' :
                  sanctionType === 'disqualification' ? 'Disqualification' :
                    sanctionType

      // Add player/official info if available
      let target = ''
      if (event.payload?.playerNumber) {
        target = ` ${event.payload.playerNumber}`
      } else if (event.payload?.role) {
        target = ` ${event.payload.role}`
      } else {
        target = ' Team'
      }

      eventDescription = `Sanction — ${teamName}${target} (${sanctionLabel}) (${team1Label} ${team1Score}:${team2Score} ${team2Label})`
    } else if (event.type === 'remark') {
      const remarkText = event.payload?.text || ''
      // Show first line or first 50 characters
      const preview = remarkText.split('\n')[0].substring(0, 50)
      eventDescription = `Remark added — ${preview}${remarkText.length > 50 ? '...' : ''}`
    } else if (event.type === 'court_captain_designation') {
      const playerNumber = event.payload?.playerNumber || '?'
      eventDescription = `${t('scoreboard.courtCaptainDesignation', 'Court captain designation')} — ${teamName} (#${playerNumber})`
    } else if (event.type === 'challenge') {
      // Team BMP request
      eventDescription = `Team BMP request — ${teamName}`
    } else if (event.type === 'challenge_outcome') {
      // Team BMP outcome
      const result = event.payload?.result
      const resultLabel = result === 'successful' ? 'Successful' :
        result === 'unsuccessful' ? 'Unsuccessful' :
          result === 'judgment_impossible' ? 'Judgment impossible' : result
      const pointAwarded = event.payload?.pointAwarded
      const pointToTeam = event.payload?.pointToTeam
      let pointInfo = ''
      if (pointAwarded && pointToTeam) {
        const pointTeamName = pointToTeam === 'team1'
          ? (data?.team1Team?.name || 'team1')
          : (data?.team2Team?.name || 'team2')
        pointInfo = ` → Point to ${pointTeamName}`
      }
      eventDescription = `Team BMP outcome — ${teamName}: ${resultLabel}${pointInfo}`
    } else if (event.type === 'referee_bmp_request') {
      // Referee BMP request
      eventDescription = `Referee BMP request`
    } else if (event.type === 'referee_bmp_outcome') {
      // Referee BMP outcome
      const result = event.payload?.result
      const resultLabel = result === 'in' ? 'IN' :
        result === 'out' ? 'OUT' :
          result === 'judgment_impossible' ? 'Judgment impossible' : result
      const pointAwarded = event.payload?.pointAwarded
      const pointToTeam = event.payload?.pointToTeam
      let pointInfo = ''
      if (pointAwarded && pointToTeam) {
        const pointTeamName = pointToTeam === 'team1'
          ? (data?.team1Team?.name || 'team1')
          : (data?.team2Team?.name || 'team2')
        pointInfo = ` → Point to ${pointTeamName}`
      }
      eventDescription = `Referee BMP outcome: ${resultLabel}${pointInfo}`
    } else if (event.type === 'court_switch') {
      eventDescription = t('scoreboard.courtSwitch', 'Court switch')
    } else if (event.type === 'mto') {
      // MTO (Medical Timeout) with team A/B label and player number
      const mtoTeamLabel = event.payload?.team === data?.match?.coinTossTeamA ? 'A' : 'B'
      const mtoPlayerNumber = event.payload?.playerNumber || '?'
      const mtoOutcome = event.payload?.outcome
      if (mtoOutcome) {
        const outcomeLabel = mtoOutcome === 'recovered' ? t('scoreboard.recovered', 'Recovered') : t('scoreboard.forfeit', 'Forfeit')
        eventDescription = `MTO — ${t('scoreboard.team', 'Team')} ${mtoTeamLabel} #${mtoPlayerNumber} (${outcomeLabel})`
      } else {
        eventDescription = `MTO — ${t('scoreboard.team', 'Team')} ${mtoTeamLabel} #${mtoPlayerNumber}`
      }
    } else if (event.type === 'rit') {
      // RIT (Recovery Interruption Time) with team A/B label, player number, and type
      const ritTeamLabel = event.payload?.team === data?.match?.coinTossTeamA ? 'A' : 'B'
      const ritPlayerNumber = event.payload?.playerNumber || '?'
      const ritType = event.payload?.ritType
      const ritTypeLabel = ritType === 'no_blood' ? t('scoreboard.ritNoBlood', 'No blood') :
                          ritType === 'toilet' ? t('scoreboard.ritToilet', 'Toilet') :
                          ritType === 'weather' ? t('scoreboard.ritWeather', 'Weather') : ritType
      const ritOutcome = event.payload?.outcome
      if (ritOutcome) {
        const outcomeLabel = ritOutcome === 'recovered' ? t('scoreboard.recovered', 'Recovered') : t('scoreboard.forfeit', 'Forfeit')
        eventDescription = `RIT (${ritTypeLabel}) — ${t('scoreboard.team', 'Team')} ${ritTeamLabel} #${ritPlayerNumber} (${outcomeLabel})`
      } else {
        eventDescription = `RIT (${ritTypeLabel}) — ${t('scoreboard.team', 'Team')} ${ritTeamLabel} #${ritPlayerNumber}`
      }
    } else if (event.type === 'medical_timeout') {
      // Legacy medical_timeout support
      const mtoTeamLabel = event.payload?.team === data?.match?.coinTossTeamA ? 'A' : 'B'
      const mtoPlayerNumber = event.payload?.playerNumber || '?'
      eventDescription = `MTO — ${t('scoreboard.team', 'Team')} ${mtoTeamLabel} #${mtoPlayerNumber}`
    } else if (event.type === 'technical_to') {
      eventDescription = t('scoreboard.technicalTimeout', 'Technical timeout')
    } else if (event.type === 'forfait') {
      const winnerTeam = event.payload?.winner === 'team1'
        ? (data?.team1Team?.name || 'Team 1')
        : (data?.team2Team?.name || 'Team 2')
      eventDescription = `${t('scoreboard.forfeit', 'Forfeit')} — ${winnerTeam} ${t('scoreboard.wins', 'wins')}`
    } else if (event.type === 'match_stopped') {
      eventDescription = t('scoreboard.matchStopped', 'Match stopped')
    } else if (event.type === 'between_sets_setup_confirmed') {
      // Show which team serves and which player (position I or II)
      const setIndex = event.payload?.setIndex || event.setIndex || 1
      const set1FirstServe = data?.match?.firstServe || 'team1'
      const teamAKey = data?.match?.coinTossTeamA || 'team1'
      let servingTeamKey
      if (setIndex === 3 && data?.match?.set3FirstServe) {
        // Set 3: uses A/B notation, convert to team key
        servingTeamKey = data.match.set3FirstServe === 'A' ? teamAKey : (teamAKey === 'team1' ? 'team2' : 'team1')
      } else if (setIndex === 2 && data?.match?.set2FirstServe) {
        // Set 2: use editable set2FirstServe if set
        servingTeamKey = data.match.set2FirstServe
      } else if (setIndex === 2) {
        // Set 2 default: opposite of set 1
        servingTeamKey = set1FirstServe === 'team1' ? 'team2' : 'team1'
      } else {
        // Set 1
        servingTeamKey = set1FirstServe
      }
      const servingTeamLabel = servingTeamKey === teamAKey ? 'A' : 'B'
      // Get first server number from lineup (position I)
      const servingLineup = servingTeamKey === 'team1' ? data?.lineupA : data?.lineupB
      const serverNumber = servingLineup?.['I']?.number || servingLineup?.['I'] || '?'
      eventDescription = `${t('scoreboard.team', 'Team')} ${servingTeamLabel} ${t('scoreboard.serves', 'serves')} #${serverNumber}`
    } else {
      eventDescription = event.type
      if (teamName) {
        eventDescription += ` — ${teamName}`
      }
    }

    return eventDescription
  }, [data])

  // Show undo confirmation
  const showUndoConfirm = useCallback(() => {
    if (!data?.events || data.events.length === 0 || !data?.set) return

    // IMPORTANT: Only consider events from the CURRENT SET
    // Undo should NEVER affect other sets - use "Reopen set" in manual changes for that
    const currentSetIndex = data.set.index
    const currentSetEvents = data.events.filter(e => e.setIndex === currentSetIndex)

    if (currentSetEvents.length === 0) {
      return
    }

    // Find the last event by sequence number (highest seq)
    const sortedEvents = [...currentSetEvents].sort((a, b) => {
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) {
        return bSeq - aSeq // Descending
      }
      // Fallback to timestamp
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return bTime - aTime
    })

    // Find the most recent event (highest sequence)
    // IMPORTANT: Undo should ALWAYS select the event with the highest sequence number
    // Events with decimal sequences (like 7.1) are sub-events that should be undone with their parent

    // Helper to check if an event is a sub-event (decimal sequence like 7.1, 8.1)
    const isSubEvent = (event) => {
      const seq = event.seq || 0
      return seq !== Math.floor(seq) // Has decimal component
    }

    // Helper to check if an event is a rotation lineup (not initial, not from substitution, is a sub-event)
    const isRotationLineup = (event) => {
      if (event.type !== 'lineup') return false
      if (event.payload?.isInitial) return false
      if (event.payload?.fromSubstitution) return false
      // Rotation lineups are sub-events (decimal sequence like 7.1)
      return isSubEvent(event)
    }

    // Find the first undoable event in chronological order (highest sequence)
    let lastUndoableEvent = null
    for (const event of sortedEvents) {
      // Skip sub-events (they'll be undone with their parent)
      if (isSubEvent(event)) {
        // If it's a rotation lineup, find the parent point to undo
        if (isRotationLineup(event)) {
          const baseSeq = Math.floor(event.seq || 0)
          const parentPoint = sortedEvents.find(e => e.type === 'point' && Math.floor(e.seq || 0) === baseSeq)
          if (parentPoint) {
            lastUndoableEvent = parentPoint
            break
          }
        }
        continue // Skip other sub-events
      }

      // Skip coin_toss events - they cannot be undone (would break match flow)
      if (event.type === 'coin_toss') {
        continue
      }

      // This is a main event (integer sequence) - it's undoable
      lastUndoableEvent = event
      break
    }

    if (!lastUndoableEvent) {
      debugLogger.log('UNDO_NO_EVENT_FOUND', {
        eventsChecked: sortedEvents.length,
        allEventsInSet: currentSetEvents.map(e => ({ id: e.id, seq: e.seq, type: e.type }))
      })
      return
    }

    const description = getActionDescription(lastUndoableEvent)
    // If we can't get a description, still allow undo but show the event type
    const displayDescription = description && description !== 'Unknown action'
      ? description
      : `${lastUndoableEvent.type} (seq: ${lastUndoableEvent.seq})`

    // Log to debug logger for persistence
    debugLogger.log('UNDO_SELECTED', {
      selectedEvent: {
        id: lastUndoableEvent.id,
        seq: lastUndoableEvent.seq,
        type: lastUndoableEvent.type
      },
      description: displayDescription,
      allEventsInSet: currentSetEvents.map(e => ({ id: e.id, seq: e.seq, type: e.type }))
    })

    setUndoConfirm({ event: lastUndoableEvent, description: displayDescription })
  }, [data?.events, data?.set, getActionDescription])

  // Check if there's anything that can be undone (mirrors showUndoConfirm logic)
  const canUndo = useMemo(() => {
    if (!data?.events || data.events.length === 0 || !data?.set) return false

    // Only consider events from the CURRENT SET
    const currentSetIndex = data.set.index
    const currentSetEvents = data.events.filter(e => e.setIndex === currentSetIndex)

    if (currentSetEvents.length === 0) return false

    // Sort events by sequence number (highest first)
    const sortedEvents = [...currentSetEvents].sort((a, b) => {
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) {
        return bSeq - aSeq
      }
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return bTime - aTime
    })

    // Helper to check if an event is a sub-event (decimal sequence like 7.1, 8.1)
    const isSubEvent = (event) => {
      const seq = event.seq || 0
      return seq !== Math.floor(seq)
    }

    // Check if there's at least one undoable event
    for (const event of sortedEvents) {
      // Skip sub-events (they get undone with their parent)
      if (isSubEvent(event)) {
        // If it's a rotation lineup sub-event, check if parent point exists
        const baseSeq = Math.floor(event.seq || 0)
        const parentPoint = sortedEvents.find(e => e.type === 'point' && Math.floor(e.seq || 0) === baseSeq)
        if (parentPoint) return true
        continue
      }

      // Skip coin_toss events - they cannot be undone
      if (event.type === 'coin_toss') continue

      // Main events (integer sequence) are undoable
      return true
    }

    return false
  }, [data?.events, data?.set, getActionDescription])

  // NEW SNAPSHOT-BASED UNDO SYSTEM
  // Instead of complex per-event-type logic, we simply:
  // 1. Delete all events with the same base seq
  // 2. Restore state from the previous event's snapshot
  const handleUndo = useCallback(async () => {
    cLogger.logHandler('handleUndo', { hasUndoConfirm: !!undoConfirm, eventType: undoConfirm?.event?.type })
    if (!undoConfirm || !data?.set) {
      setUndoConfirm(null)
      return
    }

    const lastEvent = undoConfirm.event
    const lastEventSeq = lastEvent.seq || 0
    const baseSeq = Math.floor(lastEventSeq)


    try {
      // 1. Find and delete ALL events with the same base seq (main + sub-events)
      const allEvents = await db.events.where('matchId').equals(matchId).toArray()
      const eventsToDelete = allEvents.filter(e => Math.floor(e.seq || 0) === baseSeq)

      // For point events, also delete the preceding rally_start
      if (lastEvent.type === 'point') {
        const rallyStartEvent = allEvents
          .filter(e => e.type === 'rally_start' && e.setIndex === data.set.index && (e.seq || 0) < lastEventSeq)
          .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
        if (rallyStartEvent && !eventsToDelete.some(e => e.id === rallyStartEvent.id)) {
          eventsToDelete.push(rallyStartEvent)
        }
      }

      for (const e of eventsToDelete) {
        await db.events.delete(e.id)
        // Also remove from sync_queue if pending
        const syncItems = await db.sync_queue.where('status').equals('queued').toArray()
        const matchingSyncItem = syncItems.find(s => s.payload?.external_id === String(e.id))
        if (matchingSyncItem) {
          await db.sync_queue.delete(matchingSyncItem.id)
        }
      }

      // 2. Find the previous event's snapshot
      const remainingEvents = allEvents
        .filter(e => Math.floor(e.seq || 0) < baseSeq)
        .sort((a, b) => (b.seq || 0) - (a.seq || 0))

      const previousEvent = remainingEvents[0]

      // 3. Restore state from the previous event's snapshot
      if (previousEvent?.stateSnapshot) {
        await restoreStateFromSnapshot(previousEvent.stateSnapshot)
      } else {
        // No previous event with snapshot - calculate state from remaining events

        // Re-query remaining events (after deletion)
        const remainingAllEvents = await db.events.where({ matchId }).toArray()
        const currentSetIndex = data.set.index
        const remainingPointEvents = remainingAllEvents.filter(e =>
          e.type === 'point' && e.setIndex === currentSetIndex
        )

        // Count points for each team from remaining point events
        let team1Points = 0
        let team2Points = 0
        for (const pe of remainingPointEvents) {
          if (pe.payload?.team === 'team1') team1Points++
          else if (pe.payload?.team === 'team2') team2Points++
        }


        // Update set with calculated score
        const currentSet = await db.sets.where({ matchId }).and(s => s.index === currentSetIndex).first()
        if (currentSet) {
          await db.sets.update(currentSet.id, { team1Points, team2Points, finished: false })
        }

        // Reset match status to live
        await db.matches.update(matchId, { status: 'live' })
      }

      // Handle special cases for set_end undo
      if (lastEvent.type === 'set_end') {
        // Delete the next set if it was created
        const allSets = await db.sets.where({ matchId }).toArray()
        const nextSet = allSets.find(s => s.index === data.set.index + 1)
        if (nextSet) {
          await db.events.where('matchId').equals(matchId).and(e => e.setIndex === nextSet.index).delete()
          await db.sets.delete(nextSet.id)
        }
      }

    } catch (error) {
      console.error('[handleUndo] Error:', error)
    } finally {
      // Always close the modal
      setUndoConfirm(null)
      // Sync to Referee and Supabase after undo
      syncToReferee()
      syncLiveStateToSupabase('undo', null, null)
      // Refresh eScoresheet if open
      refreshScoresheet()
    }
  }, [undoConfirm, data?.set, matchId, restoreStateFromSnapshot, syncToReferee, syncLiveStateToSupabase, refreshScoresheet])

  // OLD UNDO LOGIC REMOVED - The following complex per-event-type logic has been replaced
  // by the snapshot-based undo system above. Keeping this comment for reference.
  // Previously there were ~600 lines of event-specific undo handlers for:
  // - substitution, timeout, sanction, set_end, rally_start, etc.
  // Now all handled by simply restoring the previous event's stateSnapshot.

  const cancelUndo = useCallback(() => {
    setUndoConfirm(null)
  }, [])

  // Handle replay rally - undo last point (go back to state before the point, no rally restart)
  const handleReplayRally = useCallback(async () => {
    if (!replayRallyConfirm || !data?.set) {
      setReplayRallyConfirm(null)
      return
    }

    const lastEvent = replayRallyConfirm.event
    const lastEventSeq = lastEvent.seq || 0
    const baseSeq = Math.floor(lastEventSeq)

    // Find and delete ALL events with the same base ID (point and any related rotation events)
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const eventsToDelete = allEvents.filter(e => {
      const eSeq = e.seq || 0
      return Math.floor(eSeq) === baseSeq
    })

    try {
      // If it's a point, undo the score change
      if (lastEvent.type === 'point' && lastEvent.payload?.team) {
        const team = lastEvent.payload.team
        const field = team === 'team1' ? 'team1Points' : 'team2Points'
        const currentPoints = data.set[field]

        // Decrement the score
        if (currentPoints > 0) {
          await db.sets.update(data.set.id, {
            [field]: currentPoints - 1,
            finished: false
          })
        }

        // Check if there was a rotation after this point (sideout)
        // Find the lineup event that came right after this point (rotation)
        const pointEvents = data.events.filter(e => e.type === 'point' && e.setIndex === data.set.index)
        const sortedPoints = pointEvents.sort((a, b) => (b.seq || 0) - (a.seq || 0))

        // Get the team that had the point before this one (to determine who had serve)
        // Calculate first serve for current set based on alternation pattern
        const replaySetIndex = data.set.index
        const replaySet1FirstServe = data?.match?.firstServe || 'team1'
        let replayCurrentSetFirstServe
        if (replaySetIndex === 3 && data.match?.set3FirstServe) {
          const replayTeamAKey = data.match.coinTossTeamA || 'team1'
          const replayTeamBKey = data.match.coinTossTeamB || 'team2'
          replayCurrentSetFirstServe = data.match.set3FirstServe === 'A' ? replayTeamAKey : replayTeamBKey
        } else if (replaySetIndex === 3) {
          const set2First = data.match?.set2FirstServe || (replaySet1FirstServe === 'team1' ? 'team2' : 'team1')
          replayCurrentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
        } else if (replaySetIndex === 2 && data.match?.set2FirstServe) {
          replayCurrentSetFirstServe = data.match.set2FirstServe
        } else if (replaySetIndex === 2) {
          replayCurrentSetFirstServe = replaySet1FirstServe === 'team1' ? 'team2' : 'team1'
        } else {
          replayCurrentSetFirstServe = replaySet1FirstServe
        }
        let previousServeTeam = replayCurrentSetFirstServe
        if (sortedPoints.length > 1) {
          // The second point is the one before the current one
          previousServeTeam = sortedPoints[1].payload?.team || previousServeTeam
        }

        // If the scoring team didn't have serve (sideout), a rotation was logged after the point
        // We need to undo that rotation too
        if (lastEvent.payload.team !== previousServeTeam) {
          // Find the rotation lineup that was created after this point
          const lineupEvents = data.events.filter(e =>
            e.type === 'lineup' &&
            e.setIndex === data.set.index &&
            !e.payload?.isInitial &&
            !e.payload?.fromSubstitution &&
            (e.seq || 0) > lastEventSeq
          ).sort((a, b) => (a.seq || 0) - (b.seq || 0)) // Ascending by seq

          // The first lineup event after the point is the rotation
          if (lineupEvents.length > 0 && lineupEvents[0].payload?.team === lastEvent.payload.team) {
            const rotationEvent = lineupEvents[0]
            await db.events.delete(rotationEvent.id)
          }
        }
      }

      // Capture the old score (before undoing the point)
      const oldteam1Points = data.set.team1Points
      const oldteam2Points = data.set.team2Points

      // Delete all events with this base seq
      for (const eventToDelete of eventsToDelete) {
        await db.events.delete(eventToDelete.id)
      }

      // Calculate the new score (after undoing the point)
      const undoneTeam = lastEvent.payload?.team
      const newteam1Points = undoneTeam === 'team1' ? oldteam1Points - 1 : oldteam1Points
      const newteam2Points = undoneTeam === 'team2' ? oldteam2Points - 1 : oldteam2Points

      // Log the replay event (this is important for match records)
      const nextSeq = await getNextSeq()
      const replayStateBefore = getStateSnapshot()

      await db.events.add({
        matchId,
        setIndex: data.set.index,
        type: 'replay',
        payload: {
          reason: 'point_replay',
          undonePointTeam: undoneTeam,
          oldteam1Points,
          oldteam2Points,
          newteam1Points,
          newteam2Points
        },
        ts: new Date().toISOString(),
        seq: nextSeq,
        stateBefore: replayStateBefore
      })

      // Go back to idle state - user can then click "Start rally" or "Undo"
      // No automatic rally start

      // Sync to Supabase with fresh snapshot (data has changed)
      syncLiveStateToSupabase('replay', null, { reason: 'point_replay', undoneTeam }, null)

    } catch (error) {
      // Error during replay - silently handle
    } finally {
      setReplayRallyConfirm(null)
      // Refresh eScoresheet if open
      refreshScoresheet()
    }
  }, [replayRallyConfirm, data?.events, data?.set, data?.match, matchId, getNextSeq, syncLiveStateToSupabase, refreshScoresheet])

  const cancelReplayRally = useCallback(() => {
    setReplayRallyConfirm(null)
  }, [])

  // Handle decision change - either swap point to other team or replay rally
  const handleDecisionChange = useCallback(async () => {
    if (!replayRallyConfirm || !data?.set) {
      setReplayRallyConfirm(null)
      return
    }

    const { event: lastEvent, selectedOption } = replayRallyConfirm

    if (selectedOption === 'swap') {
      // Swap the point to the other team
      const oldTeam = lastEvent.payload?.team
      const newTeam = oldTeam === 'team1' ? 'team2' : 'team1'
      const oldField = oldTeam === 'team1' ? 'team1Points' : 'team2Points'
      const newField = newTeam === 'team1' ? 'team1Points' : 'team2Points'

      try {
        // Update scores: decrement old team, increment new team
        const oldTeamPoints = data.set[oldField]
        const newTeamPoints = data.set[newField]

        await db.sets.update(data.set.id, {
          [oldField]: Math.max(0, oldTeamPoints - 1),
          [newField]: newTeamPoints + 1,
          finished: false
        })

        // Update the point event's team
        await db.events.update(lastEvent.id, {
          payload: {
            ...lastEvent.payload,
            team: newTeam,
            swappedFrom: oldTeam // Track that this was swapped
          }
        })

        // Log a decision_change event for the record
        const nextSeq = await getNextSeq()
        await db.events.add({
          matchId,
          setIndex: data.set.index,
          type: 'decision_change',
          payload: {
            reason: 'point_swap',
            fromTeam: oldTeam,
            toTeam: newTeam,
            oldteam1Points: data.set.team1Points,
            oldteam2Points: data.set.team2Points,
            newteam1Points: oldTeam === 'team1' ? data.set.team1Points - 1 : data.set.team1Points + 1,
            newteam2Points: oldTeam === 'team2' ? data.set.team2Points - 1 : data.set.team2Points + 1
          },
          ts: new Date().toISOString(),
          seq: nextSeq
        })

        // Handle rotation changes if serve changed
        // If old team was NOT serving (sideout happened), we need to undo their rotation
        // and apply rotation to new team if new team wasn't serving
        const lastEventSeq = lastEvent.seq || 0

        // Find rotation events that happened after the point
        const rotationEvents = data.events.filter(e =>
          e.type === 'lineup' &&
          e.setIndex === data.set.index &&
          !e.payload?.isInitial &&
          !e.payload?.fromSubstitution &&
          (e.seq || 0) > lastEventSeq
        ).sort((a, b) => (a.seq || 0) - (b.seq || 0))

        // Delete any rotations that were for the old team (sideout that shouldn't have happened)
        for (const rotEvent of rotationEvents) {
          if (rotEvent.payload?.team === oldTeam) {
            await db.events.delete(rotEvent.id)
          }
        }

        // Sync to Supabase with fresh snapshot (data has changed)
        syncLiveStateToSupabase('decision_change', null, { reason: 'point_swap', fromTeam: oldTeam, toTeam: newTeam }, null)

      } catch (error) {
        console.error('[handleDecisionChange] Error swapping point:', error)
      }
    } else {
      // Replay rally - use existing logic
      await handleReplayRally()
      return // handleReplayRally already closes the modal and syncs
    }

    setReplayRallyConfirm(null)
  }, [replayRallyConfirm, data?.set, data?.events, matchId, getNextSeq, handleReplayRally, syncLiveStateToSupabase])



  const handleTimeout = useCallback(
    side => {
      cLogger.logHandler('handleTimeout', { side })
      const teamKey = mapSideToTeamKey(side)
      const used = (timeoutsUsed && timeoutsUsed[teamKey]) || 0
      if (used >= 2) return

      // Check for duplicate timeout (same team, no points scored since last TO)
      if (data?.events && data?.set) {
        const currentSetEvents = data.events.filter(e => e.setIndex === data.set.index)
        const lastTimeoutForTeam = [...currentSetEvents]
          .filter(e => e.type === 'timeout' && e.payload?.team === teamKey)
          .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]

        if (lastTimeoutForTeam) {
          // Check if any points were scored after the last timeout
          const pointsAfterTimeout = currentSetEvents.filter(
            e => e.type === 'point' && (e.seq || 0) > (lastTimeoutForTeam.seq || 0)
          )
          if (pointsAfterTimeout.length === 0) {
            // No points since last timeout for this team - ask for confirmation
            setDuplicateTimeoutConfirm({ team: teamKey })
            return
          }
        }
      }

      setTimeoutModal({ team: teamKey, countdown: 60, started: false })
    },
    [mapSideToTeamKey, timeoutsUsed, data?.events, data?.set]
  )

  const confirmTimeout = useCallback(async () => {
    if (!timeoutModal) return
    // Prevent double-click: if already started, skip
    if (timeoutModal.started) return
    // Mutex: prevent race condition from rapid double-clicks
    if (confirmingTimeoutRef.current) return
    confirmingTimeoutRef.current = true

    debugLogger.log('TO_CONFIRM', {
      team: timeoutModal.team,
      staleTimestampRef: timeoutStartTimestampRef.current
    })

    try {
      // Log the timeout event
      await logEvent('timeout', { team: timeoutModal.team })

      // Debug log: timeout
      debugLogger.log('TIMEOUT', {
        team: timeoutModal.team
      }, getStateSnapshot())

      // Start the timeout countdown
      const startTimestamp = Date.now()
      setTimeoutModal({ ...timeoutModal, started: true, startedAt: new Date(startTimestamp).toISOString() })

      // Send timeout action to referee to show modal
      sendActionToReferee('timeout', {
        team: timeoutModal.team,
        countdown: 60,
        startTimestamp: startTimestamp
      })

      // Trigger event backup for Safari/Firefox
      onTriggerEventBackup?.('timeout')
    } finally {
      confirmingTimeoutRef.current = false
    }
  }, [timeoutModal, logEvent, sendActionToReferee, onTriggerEventBackup])

  const cancelTimeout = useCallback(() => {
    // Only cancel if timeout hasn't started yet
    if (!timeoutModal || timeoutModal.started) return
    debugLogger.log('TO_CANCEL', { team: timeoutModal?.team })
    // Reset refs in case they were set (safety measure)
    timeoutStartTimestampRef.current = null
    timeoutInitialCountdownRef.current = 60
    setTimeoutModal(null)
  }, [timeoutModal])

  const stopTimeout = useCallback(() => {
    // Stop the countdown (close modal) but keep the timeout logged
    // The effect will detect the modal closing and sync timeout_active: false to Supabase/referee
    debugLogger.log('TO_STOP', { wasTimestamp: timeoutStartTimestampRef.current })
    // Reset refs so next timeout starts fresh (fixes intermittent countdown failure)
    timeoutStartTimestampRef.current = null
    timeoutInitialCountdownRef.current = 60
    setTimeoutModal(null)
  }, [])

  // Ball Mark Protocol (BMP) handlers
  const handleTeamBMP = useCallback(async (teamKey) => {
    if (!data?.set) return

    // Get current score and serving team
    const team1Points = data.set.team1Points || 0
    const team2Points = data.set.team2Points || 0
    const servingTeam = getCurrentServe()

    // Log the BMP request event (challenge type for team requests)
    const requestSeq = await logEvent('challenge', {
      team: teamKey,
      score: { team1: team1Points, team2: team2Points },
      servingTeam
    })

    // Show outcome modal with score/serve info for display
    setBmpSelectedOutcome(null) // Reset any previous selection
    setBmpOutcomeModal({
      type: 'team',
      team: teamKey,
      requestSeq, // Store sequence number to link outcome as sub-event
      currentScore: { team1: team1Points, team2: team2Points },
      currentServe: servingTeam
    })
  }, [data?.set, getCurrentServe, logEvent])

  const handleRefereeBMP = useCallback(async () => {
    if (!data?.set) return

    // Get current score and serving team
    const team1Points = data.set.team1Points || 0
    const team2Points = data.set.team2Points || 0
    const servingTeam = getCurrentServe()

    // Log the referee BMP request event
    const requestSeq = await logEvent('referee_bmp_request', {
      score: { team1: team1Points, team2: team2Points },
      servingTeam
    })

    // Show outcome modal with score/serve info for display
    setBmpSelectedOutcome(null) // Reset any previous selection
    setBmpOutcomeModal({
      type: 'referee',
      requestSeq, // Store sequence number to link outcome as sub-event
      currentScore: { team1: team1Points, team2: team2Points },
      currentServe: servingTeam
    })
  }, [data?.set, getCurrentServe, logEvent])

  const handleBMPOutcome = useCallback(async (result, pointToTeam = null) => {
    if (!bmpOutcomeModal || !data?.set) return

    const requestingTeam = bmpOutcomeModal.team
    const isTeamBMP = bmpOutcomeModal.type === 'team'
    const isRefereeBMP = bmpOutcomeModal.type === 'referee'
    const currentSetId = data.set.id

    // Get current score
    let team1Points = data.set.team1Points || 0
    let team2Points = data.set.team2Points || 0

    // Determine if we need to change score
    const shouldChangeScore = (isTeamBMP && result === 'successful') ||
                              (isRefereeBMP && pointToTeam && (result === 'in' || result === 'out'))

    if (shouldChangeScore) {
      // Determine which team gets the point
      const scoringTeam = isTeamBMP ? requestingTeam : pointToTeam

      if (isTeamBMP && result === 'successful') {
        // For successful team BMP: REVERSE the point
        // The opponent scored the disputed point, so:
        // 1. Remove 1 from opponent
        // 2. Add 1 to requesting team
        const opponent = requestingTeam === 'team1' ? 'team2' : 'team1'
        if (opponent === 'team1') {
          team1Points = Math.max(0, team1Points - 1)
        } else {
          team2Points = Math.max(0, team2Points - 1)
        }
        // Add point to requesting team
        if (requestingTeam === 'team1') {
          team1Points += 1
        } else {
          team2Points += 1
        }
        await db.sets.update(currentSetId, { team1Points, team2Points })
      } else {
        // For referee BMP: just award point to the specified team
        if (scoringTeam === 'team1') {
          team1Points += 1
          await db.sets.update(currentSetId, { team1Points })
        } else {
          team2Points += 1
          await db.sets.update(currentSetId, { team2Points })
        }
      }

      // Log the outcome event as a sub-event of the request (uses decimal seq like 7.1)
      const eventType = isTeamBMP ? 'challenge_outcome' : 'referee_bmp_outcome'
      await logEvent(eventType, {
        team: requestingTeam || scoringTeam,
        result,
        pointAwarded: true,
        pointToTeam: scoringTeam,
        newScore: { team1: team1Points, team2: team2Points }
      }, { parentSeq: bmpOutcomeModal.requestSeq })

      // Also log a point event so getCurrentServe() picks up the serve change
      // In beach volleyball, the team that wins the point gets the serve
      await logEvent('point', {
        team: scoringTeam,
        fromBMP: true  // Mark that this point came from BMP
      })

      // Check if this point ends the set
      const freshSet = await db.sets.get(currentSetId)
      if (freshSet) {
        await checkSetEnd(freshSet, team1Points, team2Points)
      }
    } else {
      // Unsuccessful, judgment_impossible - no score change
      const eventType = isTeamBMP ? 'challenge_outcome' : 'referee_bmp_outcome'
      await logEvent(eventType, {
        team: requestingTeam,
        result,
        pointAwarded: false,
        newScore: { team1: team1Points, team2: team2Points }
      }, { parentSeq: bmpOutcomeModal.requestSeq })
    }

    // Sync live state
    syncLiveStateToSupabase('bmp_outcome', requestingTeam || pointToTeam, { result })

    setBmpSelectedOutcome(null)
    setBmpOutcomeModal(null)

    // Check if court switch/TTO modals need to close due to score change after BMP
    if (shouldChangeScore) {
      const newTotal = team1Points + team2Points
      const setIndex = data.set.index

      // Court switch modal: close if new total no longer hits threshold
      if (courtSwitchModal) {
        const interval = setIndex === 3 ? 5 : 7
        if (newTotal === 0 || newTotal % interval !== 0) {
          setCourtSwitchModal(null)
        } else {
          // Update modal with new scores
          setCourtSwitchModal(prev => prev ? { ...prev, team1Points, team2Points } : null)
        }
      }

      // TTO modal: close if new total is not 21 (TTO only at 21 points in sets 1-2)
      if (ttoModal) {
        if (newTotal !== 21 || setIndex === 3) {
          setTtoModal(null)
        } else {
          // Update modal with new scores
          setTtoModal(prev => prev ? { ...prev, team1Points, team2Points } : null)
        }
      }
    }
  }, [bmpOutcomeModal, data?.set, logEvent, checkSetEnd, syncLiveStateToSupabase, courtSwitchModal, ttoModal])

  // Count unsuccessful BMPs per team in current set (each team has 2 unsuccessful per set)
  const getUnsuccessfulBMPsUsed = useCallback((teamKey) => {
    if (!data?.events || !data?.set) return 0
    const setIndex = data.set.index

    // Count challenge_outcome events with result 'unsuccessful' for this team in current set
    return data.events.filter(e =>
      e.type === 'challenge_outcome' &&
      e.setIndex === setIndex &&
      e.payload?.team === teamKey &&
      e.payload?.result === 'unsuccessful'
    ).length
  }, [data?.events, data?.set])

  // Track previous timeout modal state to detect when countdown ends
  const prevTimeoutModalRef = useRef(null)

  useEffect(() => {
    // Detect when timeout ends (was active, now null) and sync to Supabase
    const wasActive = prevTimeoutModalRef.current?.started
    const isNowNull = !timeoutModal

    if (wasActive && isNowNull) {
      // Timeout countdown ended or was stopped - sync timeout_active: false to Supabase
      sendActionToReferee('end_timeout', {})
      syncLiveStateToSupabase('end_timeout', null, null)
    }

    prevTimeoutModalRef.current = timeoutModal
  }, [timeoutModal, sendActionToReferee, syncLiveStateToSupabase])

  useEffect(() => {
    if (!timeoutModal || !timeoutModal.started) return

    // Use startedAt from state if available, otherwise fallback to ref or Date.now()
    const startTimestamp = timeoutModal.startedAt ? new Date(timeoutModal.startedAt).getTime() : (timeoutStartTimestampRef.current || Date.now())
    const initialCountdown = timeoutInitialCountdownRef.current || 60

    // Sync refs for legacy support/internal tracking
    if (!timeoutStartTimestampRef.current) timeoutStartTimestampRef.current = startTimestamp

    if (timeoutModal.countdown <= 0) {
      return
    }

    // Update every 100ms for smooth visuals
    const timer = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTimestamp) / 1000)
      const remaining = Math.max(0, initialCountdown - elapsed)

      if (remaining <= 0) {
        setTimeoutModal(null)
        timeoutStartTimestampRef.current = null
      } else {
        setTimeoutModal(prev => {
          if (!prev || !prev.started) return null
          if (prev.countdown === remaining) return prev
          return { ...prev, countdown: remaining }
        })
      }
    }, 100)

    return () => clearInterval(timer)
  }, [timeoutModal?.started, timeoutModal?.startedAt])

  // Track if TTO countdown just finished (for triggering court switch)
  const ttoCountdownFinishedRef = useRef(false)

  // TTO countdown timer
  useEffect(() => {
    if (!ttoModal || !ttoModal.started) return
    if (ttoModal.countdown <= 0) {
      // Mark that countdown finished so we can trigger court switch
      ttoCountdownFinishedRef.current = true
      return
    }
    const timer = setInterval(() => {
      setTtoModal(prev => {
        if (!prev || !prev.started) return null
        const newCountdown = prev.countdown - 1
        if (newCountdown <= 0) {
          // Mark that countdown finished
          ttoCountdownFinishedRef.current = true
          return { ...prev, countdown: 0 } // Keep modal open briefly to trigger effect
        }
        return { ...prev, countdown: newCountdown }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [ttoModal?.started, ttoModal?.countdown])

  // MTO/RIT countdown timer (5 minutes = 300 seconds)
  useEffect(() => {
    if (!medicalModal || !medicalModal.started) return

    const startTimestamp = medicalModal.startedAt
      ? new Date(medicalModal.startedAt).getTime()
      : Date.now()

    if (medicalModal.countdown <= 0) return

    const timer = setInterval(() => {
      const now = Date.now()
      const elapsed = Math.floor((now - startTimestamp) / 1000)
      const remaining = Math.max(0, 300 - elapsed)

      setMedicalModal(prev => {
        if (!prev || !prev.started) return null
        if (prev.countdown === remaining) return prev
        return { ...prev, countdown: remaining }
      })
    }, 100)

    return () => clearInterval(timer)
  }, [medicalModal?.started, medicalModal?.startedAt])

  // Handle TTO countdown finish - trigger court switch if needed
  useEffect(() => {
    if (ttoCountdownFinishedRef.current && ttoModal?.countdown === 0) {
      ttoCountdownFinishedRef.current = false
      // Call handleTtoEnd after a small delay to show "0:00" briefly
      const timeout = setTimeout(() => {
        if (ttoModal?.triggerCourtSwitchAfter && data?.match && data?.set) {
          const setIndex = ttoModal.set.index
          if (setIndex >= 1 && setIndex <= 4) {
            const currentOverrides = data.match.setLeftTeamOverrides || {}
            let currentLeftTeam
            if (currentOverrides[setIndex]) {
              currentLeftTeam = currentOverrides[setIndex]
            } else {
              currentLeftTeam = setIndex % 2 === 1 ? 'A' : 'B'
            }
            const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
            const updatedOverrides = { ...currentOverrides, [setIndex]: newLeftTeam }
            db.matches.update(matchId, { setLeftTeamOverrides: updatedOverrides })
            if (data.match?.seed_key) {
              db.sync_queue.add({
                resource: 'match',
                action: 'update',
                payload: { id: data.match.seed_key, setLeftTeamOverrides: updatedOverrides },
                createdAt: new Date().toISOString()
              })
            }
            syncLiveStateToSupabase('court_switch', null, { reason: `set${setIndex}_tto_court_switch` }, null)
          }
        }
        setTtoModal(null)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [ttoModal?.countdown, ttoModal?.triggerCourtSwitchAfter, ttoModal?.set, matchId, data?.match, data?.set, syncLiveStateToSupabase])

  const getTimeoutsUsed = useCallback(
    side => {
      const teamKey = mapSideToTeamKey(side)
      return (timeoutsUsed && timeoutsUsed[teamKey]) || 0
    },
    [mapSideToTeamKey, timeoutsUsed]
  )

  

  // Get timeout details with scores
  const getTimeoutDetails = useCallback(
    side => {
      if (!data?.events || !data?.set) return []
      const teamKey = mapSideToTeamKey(side)
      const setIndex = data.set.index

      // Get all timeout events for this team in current set
      const timeoutEvents = data.events.filter(e =>
        e.type === 'timeout' &&
        e.setIndex === setIndex &&
        e.payload?.team === teamKey
      )

      // Calculate scores at the time of each timeout
      const details = timeoutEvents.map((event, index) => {
        // Get all point events before this timeout
        // Sort events by seq if available, otherwise by timestamp
        const eventTime = event.seq || (typeof event.ts === 'number' ? event.ts : new Date(event.ts).getTime())
        const pointsBefore = data.events.filter(e => {
          if (e.type !== 'point' || e.setIndex !== setIndex) return false
          const eTime = e.seq || (typeof e.ts === 'number' ? e.ts : new Date(e.ts).getTime())
          return eTime < eventTime
        })

        let team1Score = 0
        let team2Score = 0
        pointsBefore.forEach(e => {
          if (e.payload?.team === 'team1') team1Score++
          else if (e.payload?.team === 'team2') team2Score++
        })

        return {
          event,
          score: `${team1Score}:${team2Score}`,
          index: index + 1
        }
      })

      return details
    },
    [data?.events, data?.set, mapSideToTeamKey]
  )

  // Get display name for court player (shows last name by default)
  const getCourtPlayerDisplayName = useCallback((teamKey, playerNumber, firstName, lastName) => {
    return lastName || firstName || ''
  }, [])

  // Toggle expanded player name (collapsible menu showing full name and number)
  const toggleExpandedPlayerName = useCallback((teamKey, playerNumber, e) => {
    e.stopPropagation()
    const key = `${teamKey}-${playerNumber}`
    setExpandedPlayerName(prev => prev === key ? null : key)
  }, [])

  // Handle player click for sanction/injury (only when rally is not in play and lineup is set)
  // Beach volleyball: no substitutions
  const handlePlayerClick = useCallback((teamKey, position, playerNumber, event) => {
    // Only allow when rally is not in play and lineup is set
    if (rallyStatus !== 'idle') return
    if (isRallyReplayed) return // Don't allow actions when rally is replayed
    if (!leftTeamLineupSet && teamKey === (leftisTeam1 ? 'team1' : 'team2')) return
    if (!rightTeamLineupSet && teamKey === (leftisTeam1 ? 'team2' : 'team1')) return
    if (!playerNumber || playerNumber === '') return // Can't act on placeholder

    // Get the clicked element position (the circle)
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()

    // Calculate center of the circle
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Calculate radius (half the width/height)
    const radius = rect.width / 2

    // Determine if this is the right side team (menu should open to the left)
    const isRightTeam = teamKey === (leftisTeam1 ? 'team2' : 'team1')

    // Offset to move menu from the circle
    // Positive for left team (opens right), negative for right team (opens left)
    const offset = isRightTeam ? -(radius + 30) : (radius + 30)

    // Close menu if it's already open for this player
    if (playerActionMenu?.playerNumber === playerNumber && playerActionMenu?.position === position) {
      setPlayerActionMenu(null)
      return
    }

    // Show action menu with buttons (beach volleyball: no substitutions)
    setPlayerActionMenu({
      team: teamKey,
      position,
      playerNumber,
      element,
      x: centerX + offset,
      y: centerY,
      side: isRightTeam ? 'right' : 'left',
      canSubstitute: false
    })
  }, [playerActionMenu, leftisTeam1])

 
  // Handle forfait - award all remaining points and sets to opponent
  // scope: 'set' (only current set) or 'match' (all remaining sets)
  const handleForfait = useCallback(async (teamKey, reason, scope = 'match') => {
    cLogger.logHandler('handleForfait', { teamKey, reason, scope })
    if (!data?.set || !data?.match) return

    const opponentKey = teamKey === 'team1' ? 'team2' : 'team1'
    const allSets = await db.sets.where({ matchId }).sortBy('index')
    const currentSetIndex = data.set.index
    const is3rdSet = currentSetIndex === 3
    const pointsToWin = is3rdSet ? 15 : 21 // Beach volleyball is 21 points for regular sets

    // Award current set to opponent
    const currentSet = allSets.find(s => s.index === currentSetIndex)
    if (currentSet && !currentSet.finished) {
      const teamPoints = currentSet[teamKey === 'team1' ? 'team1Points' : 'team2Points'] || 0
      const currentOpponentPoints = currentSet[opponentKey === 'team1' ? 'team1Points' : 'team2Points'] || 0

      // Calculate target points - must have 2-point lead if in deuce
      let opponentPoints = pointsToWin
      if (teamPoints >= pointsToWin - 1) {
        opponentPoints = teamPoints + 2
      }

      // Award points until opponent wins
      const pointsNeeded = opponentPoints - currentOpponentPoints
      if (pointsNeeded > 0) {
        for (let i = 0; i < pointsNeeded; i++) {
          await logEvent('point', {
            team: opponentKey
          })
        }
      }

      // End the set
      await db.sets.update(currentSet.id, {
        finished: true,
        [opponentKey === 'team1' ? 'team1Points' : 'team2Points']: opponentPoints,
        [teamKey === 'team1' ? 'team1Points' : 'team2Points']: teamPoints
      })

      // Log set end
      await logEvent('set_end', {
        team: opponentKey,
        setIndex: currentSetIndex,
        team1Points: opponentKey === 'team1' ? opponentPoints : teamPoints,
        team2Points: opponentKey === 'team2' ? opponentPoints : teamPoints,
        reason: reason || 'forfait'
      })
    }

    // Award all remaining sets to opponent ONLY if scope is 'match'
    if (scope === 'match') {
      const remainingSets = allSets.filter(s => s.index > currentSetIndex && !s.finished)
      for (const set of remainingSets) {
        const setPointsToWin = set.index === 3 ? 15 : 21
        await db.sets.update(set.id, {
          finished: true,
          [opponentKey === 'team1' ? 'team1Points' : 'team2Points']: setPointsToWin,
          [teamKey === 'team1' ? 'team1Points' : 'team2Points']: 0
        })

        await logEvent('set_end', {
          team: opponentKey,
          setIndex: set.index,
          team1Points: opponentKey === 'team1' ? setPointsToWin : 0,
          team2Points: opponentKey === 'team2' ? setPointsToWin : 0,
          reason: reason || 'forfait'
        })
      }
    }

    // Log forfait event
    await logEvent('forfait', {
      team: teamKey,
      reason: reason,
      setIndex: currentSetIndex,
      scope: scope
    })
  }, [data?.set, data?.match, matchId, logEvent])

  // Handle manual forfeit from "Stop the match" menu
  const handleManualForfeit = useCallback(async (teamKey) => {
    if (!data?.set || !data?.match) return

    // Use existing handleForfait logic
    await handleForfait(teamKey, 'forfeit')

    // Update match status to 'ended'
    await db.matches.update(matchId, { status: 'ended' })

    // Trigger backup
    onTriggerEventBackup?.('match_end')

    // Navigate to match end
    if (onFinishSet) onFinishSet(data.set)
  }, [data?.set, data?.match, matchId, handleForfait, onTriggerEventBackup, onFinishSet])

  // Handle "Impossibility to resume" - end match as-is without a winner
  const handleImpossibilityToResume = useCallback(async () => {
    if (!data?.set || !data?.match) return

    // Log match stopped event
    await logEvent('match_stopped', {
      reason: 'impossibility_to_resume',
      setIndex: data.set.index,
      team1Points: data.set.team1Points,
      team2Points: data.set.team2Points
    })

    // Update match status to 'ended' without declaring a winner
    await db.matches.update(matchId, {
      status: 'ended',
      stoppedReason: 'impossibility_to_resume'
    })

    // Trigger backup
    onTriggerEventBackup?.('match_end')

    // Download game data (same logic as menu export)
    try {
      const allMatches = await db.matches.toArray()
      const allTeams = await db.teams.toArray()
      const allPlayers = await db.players.toArray()
      const allSets = await db.sets.toArray()
      const allEvents = await db.events.toArray()
      const allReferees = await db.referees.toArray()
      const allScorers = await db.scorers.toArray()

      const exportData = {
        exportDate: new Date().toISOString(),
        matchId: matchId,
        matches: allMatches,
        teams: allTeams,
        players: allPlayers,
        sets: allSets,
        events: allEvents,
        referees: allReferees,
        scorers: allScorers
      }

      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `match_stopped_${matchId}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting match data:', error)
    }

    // Navigate to match end
    if (onFinishSet) onFinishSet(data.set)
  }, [data?.set, data?.match, matchId, logEvent, onTriggerEventBackup, onFinishSet])

  // Complete the stop match flow after remarks are recorded
  const completeStopMatchFlow = useCallback(async () => {
    if (!stopMatchRemarksStep) return

    const { type, team } = stopMatchRemarksStep

    if (type === 'forfeit' && team) {
      await handleManualForfeit(team)
    } else if (type === 'impossibility') {
      await handleImpossibilityToResume()
    }

    // Clear all stop match states
    setStopMatchModal(null)
    setStopMatchTeamSelect(null)
    setStopMatchConfirm(null)
    setStopMatchRemarksStep(null)
  }, [stopMatchRemarksStep, handleManualForfeit, handleImpossibilityToResume])


  // Common modal position - all modals use the same position
  // For left side teams, menu opens to the right
  // For right side teams, menu opens to the left
  const getCommonModalPosition = useCallback((element, menuX, menuY, side) => {
    const rect = element?.getBoundingClientRect?.()
    const isRightSide = side === 'right'
    if (rect) {
      return {
        x: isRightSide ? rect.left - 30 : rect.right + 30,
        y: rect.top + rect.height / 2,
        side
      }
    }
    return {
      x: isRightSide ? menuX - 30 : menuX + 30,
      y: menuY,
      side
    }
  }, [])

  // Open sanction modal from action menu
  const openSanctionFromMenu = useCallback(() => {
    if (!playerActionMenu) return
    const { team, position, playerNumber, element, side } = playerActionMenu
    const pos = getCommonModalPosition(element, playerActionMenu.x, playerActionMenu.y, side)
    setSanctionDropdown({
      team,
      type: 'player',
      playerNumber,
      position,
      element,
      x: pos.x,
      y: pos.y,
      side: pos.side
    })
    setPlayerActionMenu(null)
  }, [playerActionMenu, getCommonModalPosition])

  // Open medical dropdown from player action menu
  const openMedicalFromMenu = useCallback(() => {
    if (!playerActionMenu || !data?.set) return
    const { team, playerNumber, element, x, y, side } = playerActionMenu

    // Open the medical dropdown with options
    setInjuryDropdown({
      team,
      playerNumber,
      element,
      x,
      y,
      side
    })
    setPlayerActionMenu(null)
  }, [playerActionMenu, data?.set])

  // Handle Start MTO (Medical Timeout) - 5 minute recovery time, unlimited per match
  const handleStartMTO = useCallback(async () => {
    cLogger.logHandler('handleStartMTO', { team: injuryDropdown?.team, player: injuryDropdown?.playerNumber })
    if (!injuryDropdown || !data?.set) return

    const { team, playerNumber } = injuryDropdown
    const startedAt = new Date().toISOString()

    // Log MTO event with start time
    const eventId = await logEvent('mto', {
      team,
      playerNumber,
      startTime: startedAt
    })

    // Start countdown modal
    setMedicalModal({
      type: 'mto',
      team,
      playerNumber,
      countdown: 300,
      started: true,
      startedAt,
      eventId
    })

    setInjuryDropdown(null)
  }, [injuryDropdown, data?.set, logEvent])

  // Handle Start RIT (Recovery Interruption Time) - 5 minute, only ONE per match
  const handleStartRIT = useCallback(async (ritType) => {
    cLogger.logHandler('handleStartRIT', { team: injuryDropdown?.team, player: injuryDropdown?.playerNumber, ritType })
    if (!injuryDropdown || !data?.set) return

    // Check if RIT already used this match
    if (ritUsedThisMatch) {
      showAlert(t('scoreboard.ritAlreadyUsed', 'RIT already used this match'), 'error')
      return
    }

    const { team, playerNumber } = injuryDropdown
    const startedAt = new Date().toISOString()

    // Log RIT event with start time and type
    const eventId = await logEvent('rit', {
      team,
      playerNumber,
      ritType,
      startTime: startedAt
    })

    // Start countdown modal
    setMedicalModal({
      type: 'rit',
      ritType,
      team,
      playerNumber,
      countdown: 300,
      started: true,
      startedAt,
      eventId
    })

    setInjuryDropdown(null)
  }, [injuryDropdown, data?.set, logEvent, ritUsedThisMatch, showAlert, t])

  // Handle MTO/RIT outcome - player recovered or forfeit
  const handleMedicalOutcome = useCallback(async (outcome) => {
    cLogger.logHandler('handleMedicalOutcome', { outcome, medicalModal })
    if (!medicalModal || !data?.set) return

    const { type, ritType, team, playerNumber, startedAt, eventId } = medicalModal
    const endTime = new Date().toISOString()
    const startTime = new Date(startedAt).getTime()
    const endTimeMs = new Date(endTime).getTime()
    const durationSeconds = Math.floor((endTimeMs - startTime) / 1000)
    const durationMinutes = Math.floor(durationSeconds / 60)
    const durationRemainder = durationSeconds % 60

    // Format times for remark
    const startDate = new Date(startedAt)
    const endDate = new Date(endTime)
    const startTimeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
    const endTimeStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    const durationStr = `${durationMinutes}:${String(durationRemainder).padStart(2, '0')}`

    // Get team label (A/B)
    const teamLabel = team === data?.match?.coinTossTeamA ? 'A' : 'B'
    const typeLabel = type === 'mto' ? 'MTO' : `RIT (${ritType === 'no_blood' ? 'No blood' : ritType === 'toilet' ? 'Toilet' : 'Weather'})`
    const outcomeLabel = outcome === 'recovered' ? 'Recovered' : 'Forfeit'

    // Update the event with end time, duration, and outcome
    if (eventId) {
      const existingEvent = await db.events.get(eventId)
      if (existingEvent) {
        await db.events.update(eventId, {
          payload: {
            ...existingEvent.payload,
            endTime,
            duration: durationSeconds,
            outcome
          }
        })
      }
    }

    // Log remark with all details
    const remarkText = `${typeLabel} - Team ${teamLabel} #${playerNumber} - Start: ${startTimeStr}, End: ${endTimeStr}, Duration: ${durationStr}, Outcome: ${outcomeLabel}`
    await logEvent('remark', {
      text: remarkText,
      fullRemarks: remarkText
    })

    // Close the modal
    setMedicalModal(null)

    // If forfeit, trigger forfeit flow
    if (outcome === 'forfeit') {
      await handleForfait(team, 'medical', 'match')
    }
  }, [medicalModal, data?.set, data?.match?.coinTossTeamA, logEvent, handleForfait])

  // Cancel medical dropdown
  const cancelMedical = useCallback(() => {
    setInjuryDropdown(null)
  }, [])

  // Show sanction confirmation modal
  const showSanctionConfirm = useCallback((sanctionType) => {
    if (!sanctionDropdown) return
    setSanctionConfirmModal({
      team: sanctionDropdown.team,
      type: sanctionDropdown.type,
      playerNumber: sanctionDropdown.playerNumber,
      position: sanctionDropdown.position,
      role: sanctionDropdown.role,
      sanctionType
    })
    setSanctionDropdown(null)
  }, [sanctionDropdown])

  // Cancel sanction dropdown
  const cancelSanction = useCallback(() => {
    setSanctionDropdown(null)
  }, [])

  // Cancel sanction confirmation
  const cancelSanctionConfirm = useCallback(() => {
    setSanctionConfirmModal(null)
  }, [])

  // Check if a player has a specific sanction type
  const playerHasSanctionType = useCallback((teamKey, playerNumber, sanctionType) => {
    if (!data?.events) return false

    const hasSanction = data.events.some(e => {
      const isSanction = e.type === 'sanction'
      const teamMatch = e.payload?.team === teamKey
      const playerMatch = e.payload?.playerNumber === playerNumber ||
        String(e.payload?.playerNumber) === String(playerNumber) ||
        Number(e.payload?.playerNumber) === Number(playerNumber)
      const typeMatch = e.payload?.type === sanctionType

      return isSanction && teamMatch && playerMatch && typeMatch
    })

    return hasSanction
  }, [data?.events])

  // Get player's current highest sanction
  const getPlayerSanctionLevel = useCallback((teamKey, playerNumber) => {
    if (!data?.events) return null

    // Get all FORMAL sanctions for this player in this match
    // NOTE: delay_warning and delay_penalty are SEPARATE from the formal escalation path
    // A player can have delay warnings AND formal warnings independently
    // Convert playerNumber to both string and number for comparison (in case of type mismatch)
    const playerSanctions = data.events.filter(e => {
      const isSanction = e.type === 'sanction'
      const teamMatch = e.payload?.team === teamKey
      const playerMatch = e.payload?.playerNumber === playerNumber ||
        String(e.payload?.playerNumber) === String(playerNumber) ||
        Number(e.payload?.playerNumber) === Number(playerNumber)
      const isFormalSanction = ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type)

      return isSanction && teamMatch && playerMatch && isFormalSanction
    })

    if (playerSanctions.length === 0) return null

    // Return the highest sanction level
    const levels = { warning: 1, penalty: 2, expulsion: 3, disqualification: 4 }
    const highest = playerSanctions.reduce((max, s) => {
      const level = levels[s.payload?.type] || 0
      return level > max ? level : max
    }, 0)

    const result = Object.keys(levels).find(key => levels[key] === highest)
    return result
  }, [data?.events])

  // Check if team has received a formal warning (only one per team per game)
  const teamHasFormalWarning = useCallback((teamKey) => {
    if (!data?.events) return false

    // Check all sets for this match for FORMAL warnings only
    // NOTE: delay_warning is separate and doesn't count as a formal warning
    const teamSanctions = data.events.filter(e =>
      e.type === 'sanction' &&
      e.payload?.team === teamKey &&
      e.payload?.type === 'warning' // This is formal warning, NOT delay_warning
    )

    return teamSanctions.length > 0
  }, [data?.events])

  // Get sanctions for a player or official
  const getPlayerSanctions = useCallback((teamKey, playerNumber, role = null) => {
    if (!data?.events) return []

    const sanctions = data.events.filter(e => {
      if (e.type !== 'sanction') return false
      if (e.payload?.team !== teamKey) return false

      // For player sanctions
      if (playerNumber !== null && playerNumber !== undefined) {
        // Convert both to strings for comparison to handle number/string mismatches
        const eventPlayerNumber = e.payload?.playerNumber
        const matchesPlayer = String(eventPlayerNumber) === String(playerNumber)
        const isFormalSanction = ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type)
        return matchesPlayer && isFormalSanction
      }

      // For official sanctions
      if (role) {
        return e.payload?.role === role &&
          ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type)
      }

      return false
    })

    return sanctions
  }, [data?.events])

  // Confirm player sanction
  const confirmPlayerSanction = useCallback(async () => {
    if (!sanctionConfirmModal || !data?.set) return

    const { team, type, playerNumber, position, role, sanctionType } = sanctionConfirmModal

    // Validate that we're not giving the same sanction type again
    if (playerNumber) {
      const hasThisSanction = playerHasSanctionType(team, playerNumber, sanctionType)
      const teamWarning = teamHasFormalWarning(team)

      // Prevent giving the same sanction type again
      if (hasThisSanction) {
        showAlert(`Player ${playerNumber} already has a ${sanctionType}. A player cannot receive the same sanction type twice.`, 'warning')
        setSanctionConfirmModal(null)
        return
      }

      // Special rule for warning: can only be given if team hasn't been warned (player can have other sanctions)
      if (sanctionType === 'warning' && teamWarning) {
        showAlert(`Warning cannot be given because the team has already been warned.`, 'warning')
        setSanctionConfirmModal(null)
        return
      }
    }

    if (sanctionType === 'expulsion') {
      // Expulsion: Incomplete set
      await handleForfait(team, 'expulsion', 'set')
      setSanctionConfirmModal(null)
      return
    } else if (sanctionType === 'disqualification') {
      // Disqualification: Incomplete match
      await handleForfait(team, 'disqualification', 'match')
      setSanctionConfirmModal(null)
      return
    }

    // Regular sanction (warning or penalty)
    await logEvent('sanction', {
      team,
      type: sanctionType,
      playerType: type,
      playerNumber,
      position,
      role
    })

    // If penalty, award point to the other team (but only if lineups are set)
    if (sanctionType === 'penalty') {
      // Check if both lineups are set before awarding point
      const team1TeamKey = leftisTeam1 ? 'team1' : 'team2'
      const team2TeamKey = leftisTeam1 ? 'team2' : 'team1'

      const team1LineupSet = data.events?.some(e =>
        e.type === 'lineup' &&
        e.payload?.team === team1TeamKey &&
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )
      const team2LineupSet = data.events?.some(e =>
        e.type === 'lineup' &&
        e.payload?.team === team2TeamKey &&
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )

      setSanctionConfirmModal(null)

    } else {
      setSanctionConfirmModal(null)
    }
  }, [sanctionConfirmModal, data?.set, data?.events, data?.team1Players, data?.team2Players, logEvent, mapTeamKeyToSide, handlePoint, leftisTeam1, getPlayerSanctionLevel, playerHasSanctionType, teamHasFormalWarning, handleForfait])

  // Keyboard shortcuts handler
  useEffect(() => {
    if (!keybindingsEnabled) return

    const handleKeyDown = (e) => {
      // Don't handle if editing key bindings
      if (editingKey) return
      // Don't handle if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      // Don't handle if options modal is open
      if (showOptionsInMenu || keybindingsModalOpen) return

      const key = e.key


      // Confirm key (Enter)
      if (key === keyBindings.confirm) {
        // Start rally if idle and no modals
        if (!hasDecisionModal && rallyStatus === 'idle') {
          e.preventDefault()
          handleStartRally()
          return
        }
        // Confirm modals
        if (accidentalRallyConfirmModal) {
          e.preventDefault()
          accidentalRallyConfirmModal.onConfirm()
          return
        }
        if (accidentalPointConfirmModal) {
          e.preventDefault()
          accidentalPointConfirmModal.onConfirm()
          return
        }
        if (undoConfirm) {
          e.preventDefault()
          handleUndo()
          return
        }
        if (replayRallyConfirm) {
          e.preventDefault()
          handleDecisionChange()
          return
        }
      }

      // Cancel key (Escape) - only close non-decision modals
      if (key === keyBindings.cancel) {
        // Close dropdowns and menus
        if (playerActionMenu) {
          e.preventDefault()
          setPlayerActionMenu(null)
          return
        }
        if (sanctionDropdown) {
          e.preventDefault()
          setSanctionDropdown(null)
          return
        }
        if (timeoutModal) {
          e.preventDefault()
          setTimeoutModal(null)
          return
        }
        // Don't close decision modals with Escape
        return
      }

      // Don't process other keys if a modal is open
      if (hasDecisionModal || timeoutModal || lineupModal || menuModal) return

      // Point keys
      if (key === keyBindings.pointLeft && rallyStatus === 'in_play') {
        e.preventDefault()
        handlePoint('left')
        return
      }
      if (key === keyBindings.pointRight && rallyStatus === 'in_play') {
        e.preventDefault()
        handlePoint('right')
        return
      }

      // Timeout keys (only when idle)
      if (key === keyBindings.timeoutLeft && rallyStatus === 'idle') {
        e.preventDefault()
        handleTimeout('left')
        return
      }
      if (key === keyBindings.timeoutRight && rallyStatus === 'idle') {
        e.preventDefault()
        handleTimeout('right')
        return
      }

      // Undo key
      if (key === keyBindings.undo && rallyStatus === 'idle') {
        e.preventDefault()
        handleUndo()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    keybindingsEnabled, keyBindings, editingKey, showOptionsInMenu, keybindingsModalOpen,
    rallyStatus, handleStartRally, handlePoint, handleTimeout, handleUndo,
    playerActionMenu, sanctionDropdown,
    timeoutModal, menuModal,sanctionConfirmModal, accidentalRallyConfirmModal,
    accidentalPointConfirmModal, undoConfirm, replayRallyConfirm, handleReplayRally, handleDecisionChange
  ])

  const sanctionButtonStyles = useMemo(() => ({
    improper: {
      flex: 1,
      fontSize: '10px',
      padding: '8px 4px',
      background: 'rgba(156, 163, 175, 0.25)',
      border: '1px solid rgba(156, 163, 175, 0.5)',
      color: '#d1d5db',
      fontWeight: 600,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.05)'
    },
    delayWarning: {
      flex: 1,
      fontSize: '10px',
      padding: '8px 4px',
      background: 'rgba(234, 179, 8, 0.2)',
      border: '1px solid rgba(234, 179, 8, 0.4)',
      color: '#facc15',
      fontWeight: 600,
      boxShadow: '0 0 0 1px rgba(250, 204, 21, 0.15)'
    },
    delayPenalty: {
      flex: 1,
      fontSize: '10px',
      padding: '8px 4px',
      background: 'rgba(239, 68, 68, 0.2)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
      color: '#f87171',
      fontWeight: 600,
      boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.2)'
    }
  }), [])

  // Check if referees are connected (heartbeat within last 15 seconds)
  // Must be before any early returns to comply with Rules of Hooks
  const isReferee1Connected = useMemo(() => {
    if (!data?.match?.lastReferee1Heartbeat) return false
    const lastHeartbeat = new Date(data.match.lastReferee1Heartbeat).getTime()
    const currentTime = new Date().getTime()
    return (currentTime - lastHeartbeat) < 15000 // 15 seconds threshold
  }, [data?.match?.lastReferee1Heartbeat, now])

  const isReferee2Connected = useMemo(() => {
    if (!data?.match?.lastReferee2Heartbeat) return false
    const lastHeartbeat = new Date(data.match.lastReferee2Heartbeat).getTime()
    const currentTime = new Date().getTime()
    return (currentTime - lastHeartbeat) < 15000 // 15 seconds threshold
  }, [data?.match?.lastReferee2Heartbeat, now])

  const isAnyRefereeConnected = isReferee1Connected || isReferee2Connected
  const refereeConnectionEnabled = data?.match?.refereeConnectionEnabled === true
  const team1TeamConnectionEnabled = data?.match?.team1TeamConnectionEnabled === true
  const team2TeamConnectionEnabled = data?.match?.team2TeamConnectionEnabled === true

  // Team labels (A or B) based on coin toss assignment
  const team1Label = data?.match?.coinTossTeamA === 'team1' ? 'A' : (data?.match?.coinTossTeamB === 'team1' ? 'B' : 'A')
  const team2Label = data?.match?.coinTossTeamA === 'team2' ? 'A' : (data?.match?.coinTossTeamB === 'team2' ? 'B' : 'B')

  // Helper function to get connection status and color
  const getConnectionStatus = useCallback((type) => {
    if (type === 'referee') {
      if (!refereeConnectionEnabled) {
        return { status: 'disabled', color: '#6b7280' } // grey
      }
      if (isReferee1Connected || isReferee2Connected) {
        return { status: 'connected', color: '#22c55e' } // green
      }
      // Enabled but not connected
      return { status: 'not_connected', color: '#eab308' } // yellow
    }
    return { status: 'error', color: '#ef4444' } // red - unknown
  }, [refereeConnectionEnabled, isReferee1Connected, isReferee2Connected])

  const handleRefereeConnectionToggle = useCallback(async (enabled) => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, { refereeConnectionEnabled: enabled })
      // Sync to Supabase (use seed_key as external_id)
      const match = await db.matches.get(matchId)
      if (match?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: match.seed_key,
            connections: {
              referee_enabled: enabled
            },
            connection_pins: {
              referee: match?.refereePin || ''
            }
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    } catch (error) {
      console.error('[Scoreboard] Failed to sync referee connection:', error)
    }
  }, [matchId])

  const handleEditPin = useCallback(() => {
    const currentPin = data?.match?.refereePin || ''
    setNewPin(currentPin)
    setPinError('')
    setEditPinType('referee')
    setEditPinModal(true)
  }, [data?.match?.refereePin])

  const handleSavePin = useCallback(async () => {
    if (!matchId) return

    // Validate PIN
    if (!newPin || newPin.length !== 6) {
      setPinError('PIN must be exactly 6 digits')
      return
    }
    if (!/^\d{6}$/.test(newPin)) {
      setPinError('PIN must contain only numbers')
      return
    }

    try {
      await db.matches.update(matchId, { refereePin: newPin })
      setEditPinModal(false)
      setPinError('')
      setEditPinType(null)
    } catch (error) {
      setPinError('Failed to save PIN')
    }
  }, [matchId, newPin, editPinType])

  const confirmCourtSwitch = useCallback(async () => {
    if (!courtSwitchModal || !data?.match || !data?.set) return

    const setIndex = courtSwitchModal.set.index
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'

    if (setIndex === 3) {
      // Set 3: Mark that courts have been switched at 8 points AND swap court sides
      const currentOverrides = data.match.setLeftTeamOverrides || {}

      // Determine current left team (from override or default pattern)
      let currentLeftTeam
      if (currentOverrides[setIndex]) {
        currentLeftTeam = currentOverrides[setIndex] // 'A' or 'B'
      } else {
        // Set 3 uses set3LeftTeam from coin toss
        currentLeftTeam = data.match.set3LeftTeam || 'A'
      }

      // Toggle: if A is on left, make B on left (and vice versa)
      const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
      const updatedOverrides = { ...currentOverrides, [setIndex]: newLeftTeam }

      await db.matches.update(matchId, { set3CourtSwitched: true, setLeftTeamOverrides: updatedOverrides })

      // Sync to Supabase
      if (data.match?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: { id: data.match.seed_key, set3CourtSwitched: true, setLeftTeamOverrides: updatedOverrides },
          createdAt: new Date().toISOString()
        })
      }
    } else if (setIndex >= 1 && setIndex <= 2) {
      // Sets 1-4: Update setLeftTeamOverrides to swap teams
      const currentOverrides = data.match.setLeftTeamOverrides || {}
      
      // Determine current left team (from override or default pattern)
      let currentLeftTeam
      if (currentOverrides[setIndex]) {
        currentLeftTeam = currentOverrides[setIndex] // 'A' or 'B'
      } else {
        // Default pattern for beach volleyball: Set 1 = A left, Set 2 = B left, Set 3 = determined by coin toss
        currentLeftTeam = setIndex % 2 === 1 ? 'A' : 'B'
      }
      
      // Toggle: if A is on left, make B on left (and vice versa)
      const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
      const updatedOverrides = { ...currentOverrides, [setIndex]: newLeftTeam }
      
      await db.matches.update(matchId, { setLeftTeamOverrides: updatedOverrides })
      
      // Sync to Supabase
      if (data.match?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: { id: data.match.seed_key, setLeftTeamOverrides: updatedOverrides },
          createdAt: new Date().toISOString()
        })
      }
    }

    // Log court_switch event for PDF scoresheet
    const nextSeq = await getNextSeq()
    await db.events.add({
      matchId,
      setIndex: setIndex,
      type: 'court_switch',
      payload: {},
      ts: new Date().toISOString(),
      seq: nextSeq
    })

    // Check if TTO should be triggered after court switch (at 21 points in sets 1-2)
    const shouldTriggerTto = courtSwitchModal?.triggerTtoAfter
    const ttoData = shouldTriggerTto ? {
      set: courtSwitchModal.set,
      team1Points: courtSwitchModal.team1Points,
      team2Points: courtSwitchModal.team2Points,
      countdown: 60,
      started: false
    } : null

    // Close the court switch modal
    setCourtSwitchModal(null)

    // Trigger TTO if needed (at 21 points)
    if (shouldTriggerTto && ttoData) {
      setTtoModal(ttoData)
    }

    // Sync to Supabase with fresh snapshot to update side_a and serving_team after court switch
    const reason = setIndex === 3 ? 'set3_8points' : `set${setIndex}_court_switch`
    syncLiveStateToSupabase('court_switch', null, { reason }, null)
  }, [courtSwitchModal, matchId, data?.match, data?.set, syncLiveStateToSupabase, getNextSeq])

  // Handle TTO end - performs court switch if needed (at 21 points in sets 1-2)
  const handleTtoEnd = useCallback(async () => {
    if (!ttoModal) return

    const shouldSwitchCourts = ttoModal.triggerCourtSwitchAfter

    if (shouldSwitchCourts && data?.match && data?.set) {
      const setIndex = ttoModal.set.index

      if (setIndex >= 1 && setIndex <= 4) {
        // Sets 1-4: Update setLeftTeamOverrides to swap teams
        const currentOverrides = data.match.setLeftTeamOverrides || {}

        // Determine current left team (from override or default pattern)
        let currentLeftTeam
        if (currentOverrides[setIndex]) {
          currentLeftTeam = currentOverrides[setIndex] // 'A' or 'B'
        } else {
          // Default pattern for beach volleyball: Set 1 = A left, Set 2 = B left, Set 3 = coin toss
          currentLeftTeam = setIndex % 2 === 1 ? 'A' : 'B'
        }

        // Toggle: if A is on left, make B on left (and vice versa)
        const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
        const updatedOverrides = { ...currentOverrides, [setIndex]: newLeftTeam }

        await db.matches.update(matchId, { setLeftTeamOverrides: updatedOverrides })

        // Sync to Supabase
        if (data.match?.seed_key) {
          await db.sync_queue.add({
            resource: 'match',
            action: 'update',
            payload: { id: data.match.seed_key, setLeftTeamOverrides: updatedOverrides },
            createdAt: new Date().toISOString()
          })
        }

        // Sync live state after court switch
        syncLiveStateToSupabase('court_switch', null, { reason: `set${setIndex}_tto_court_switch` }, null)
      }
    }

    // Close the TTO modal
    setTtoModal(null)
  }, [ttoModal, matchId, data?.match, data?.set, syncLiveStateToSupabase])

  const cancelCourtSwitch = useCallback(async () => {
    if (!courtSwitchModal || !data?.events) return

    // Undo the last point that caused the 8-point threshold
    // Find the last event by sequence number
    const sortedEvents = [...data.events].sort((a, b) => {
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) {
        return bSeq - aSeq // Descending
      }
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return bTime - aTime
    })

    const lastEvent = sortedEvents[0]
    if (lastEvent) {
      // Delete the last event (point or sanction)
      await db.events.delete(lastEvent.id)

      // Update set points
      const newteam1Points = courtSwitchModal.teamThatScored === 'team1'
        ? courtSwitchModal.team1Points - 1
        : courtSwitchModal.team1Points
      const newteam2Points = courtSwitchModal.teamThatScored === 'team2'
        ? courtSwitchModal.team2Points - 1
        : courtSwitchModal.team2Points

      await db.sets.update(courtSwitchModal.set.id, {
        team1Points: newteam1Points,
        team2Points: newteam2Points
      })
    }

    setCourtSwitchModal(null)
  }, [courtSwitchModal, data?.events])

  // Check if match is already finished (loaded a completed match)
  // If so, trigger onFinishSet to navigate to MatchEnd screen
  useEffect(() => {
    if (data && !data.set && data.sets && data.sets.length > 0 && !setTransitionLoading) {
      // No active set but we have sets - check if match is finished
      const finishedSets = data.sets.filter(s => s.finished)
      const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
      const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length
      const isMatchFinished = team1SetsWon >= 2 || team2SetsWon >= 2

      if (isMatchFinished && onFinishSet) {
        // Pass the last finished set to trigger match end navigation
        const lastSet = finishedSets.sort((a, b) => b.index - a.index)[0]
        onFinishSet(lastSet)
      }
    }
  }, [data, setTransitionLoading, onFinishSet])

  if (!data?.set || setTransitionLoading) {
    const loadingStep = setTransitionLoading?.step || 'Loading...'
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 9999,
        gap: '24px'
      }}>
        {/* Spinner */}
        <div style={{
          width: '64px',
          height: '64px',
          border: '4px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: '#3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />

        {/* Loading text */}
        <div style={{
          color: '#fff',
          fontSize: '24px',
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {loadingStep}
        </div>

        {/* CSS for spinner animation */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  const teamALabel = leftTeam.isTeamA ? 'A' : 'B'
  const teamBLabel = rightTeam.isTeamA ? 'A' : 'B'
  const teamAShortName = leftisTeam1
    ? (data?.match?.team1ShortName || leftTeam.name?.substring(0, 3).toUpperCase() || 'A')
    : (data?.match?.team2ShortName || leftTeam.name?.substring(0, 3).toUpperCase() || 'A')
  const teamBShortName = leftisTeam1
    ? (data?.match?.team2ShortName || rightTeam.name?.substring(0, 3).toUpperCase() || 'B')
    : (data?.match?.team1ShortName || rightTeam.name?.substring(0, 3).toUpperCase() || 'B')

  // Help content function
  const getHelpContent = (topicId) => {
    switch (topicId) {
      case 'recording-points':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Recording Points</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when you record a point:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>The score updates automatically for the team that scored</li>
                <li>The point is logged in the event history</li>
                <li>The serving team indicator updates</li>
                <li>If a team reaches 21 points (or 15 in set 3) with a 2-point lead, you'll be prompted to end the set</li>
                <li>All actions are saved automatically to the database</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Keyboard Shortcuts:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>Space</strong>: Award point to Team 1</li>
                <li><strong>Enter</strong>: Award point to Team 2</li>
              </ul>
            </div>
          </div>
        )

      case 'timeouts':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Timeouts</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when you request a timeout:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>A 60-second countdown timer starts automatically</li>
                <li>The timeout is recorded in the event log</li>
                <li>Each team is limited to 1 timeout per set</li>
                <li>The timeout countdown is displayed on screen</li>
                <li>You can see timeout history in the timeout details panel</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Important Notes:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>Timeouts cannot be requested if the team has already used both timeouts in the set</li>
                <li>The timer continues even if you navigate away from the scoreboard</li>
                <li>Timeouts are automatically saved to the database</li>
              </ul>
            </div>
          </div>
        )


      case 'sanctions':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Sanctions</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when you record a sanction:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>Warning (Yellow Card)</strong>: First offense, no point penalty</li>
                <li><strong>Penalty (Red Card)</strong>: Second offense, point awarded to opponent</li>
                <li><strong>Expulsion</strong>: Player must leave the set, can return next set</li>
                <li><strong>Disqualification</strong>: Player must leave the match entirely</li>
                <li>Sanctions are recorded with the score at the time of the sanction</li>
                <li>All sanctions appear in the sanctions table on the match end screen</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Who Can Receive Sanctions:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>Players</li>
                <li>Team (delay warnings/penalties)</li>
              </ul>
            </div>
          </div>
        )

      case 'ending-set':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Ending a Set</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when you end a set:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>You'll be prompted to confirm the set end time</li>
                <li>The set is marked as finished in the database</li>
                <li>Set statistics are calculated (timeouts, duration)</li>
                <li>If it's set 2, you'll be asked to choose sides and first serve for set 3 (new coin toss)</li>
                <li>If it's set 3, the match ends automatically</li>
                <li>If a team wins 2 sets, the match ends and you go to the Match End screen</li>
                <li>Otherwise, the next set begins automatically</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Set End Conditions:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>Sets 1-2</strong>: First team to 21 points with 2-point lead</li>
                <li><strong>Set 3</strong>: First team to 15 points with 2-point lead</li>
                <li>No cap - sets continue until a team wins by 2 points</li>
              </ul>
            </div>
          </div>
        )

      case 'match-end':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Match End</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when the match ends:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>The match status is automatically set to "final"</li>
                <li>You're taken to the Match End screen</li>
                <li>All match data is preserved (sets, events, players, teams)</li>
                <li>For official matches, the match is queued for sync to Supabase</li>
                <li>The session lock is released</li>
                <li>You can review results, sanctions, and match statistics</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Match End Screen:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>View final score and set-by-set breakdown</li>
                <li>Review all sanctions issued</li>
                <li>Collect signatures from captains and officials</li>
                <li>Approve and export match data (PDF, JPG, JSON)</li>
                <li>Return to team1 screen when done</li>
              </ul>
            </div>
          </div>
        )

      case 'undo':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Undo Actions</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens when you undo an action:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>The last action is reversed (point, substitution, timeout, etc.)</li>
                <li>The score or state returns to what it was before</li>
                <li>The undo event is logged in the action history</li>
                <li>You can undo multiple actions in sequence</li>
                <li>Undo works for most actions except set/match end</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>How to Undo:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>Click the <strong>Undo</strong> button in the rally controls</li>
                <li>Or use the keyboard shortcut (if available)</li>
                <li>Confirm the undo action when prompted</li>
                <li>Check the action log to see undo history</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Limitations:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>Cannot undo set end or match end</li>
                <li>Cannot undo actions from previous sets</li>
                <li>Undo only affects the current set</li>
              </ul>
            </div>
          </div>
        )

      case 'set-3':
        return (
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Set 3 (Tie-break)</h3>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '20px', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>What happens in Set 3:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>First team to 15 points wins (instead of 21)</li>
                <li>Must win by 2 points (no cap)</li>
                <li>Teams switch sides every 5 points (not 7 like sets 1-2)</li>
                <li>New coin toss determines sides and first serve</li>
                <li>All other rules remain the same (timeouts, etc.)</li>
              </ul>
              <h4 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px' }}>Court Switch at 5 Points:</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                <li>When teams reach a combined 5 points, the app will prompt for court switch</li>
                <li>You'll confirm which team is now on which side</li>
                <li>The scoreboard updates to reflect the new positions</li>
                <li>Play continues without interruption</li>
              </ul>
            </div>
          </div>
        )

      default:
        return <div>Topic not found</div>
    }
  }

  // Show duplicate tab error if scoresheet is already open in another tab
  if (duplicateTabError) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px'
        }}>⚠️</div>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 600,
          marginBottom: '12px',
          color: '#f59e0b'
        }}>Scoresheet Already Open</h1>
        <p style={{
          fontSize: '16px',
          color: 'rgba(255,255,255,0.7)',
          marginBottom: '24px',
          maxWidth: '400px'
        }}>
          This match scoresheet is already open in another tab or browser window.
          Please close this tab and use the existing one to avoid data conflicts.
        </p>
        <button
          onClick={() => window.close()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 600,
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Close This Tab
        </button>
      </div>
    )
  }

  return (
    <div className="match-record">
      {/* Portrait mode warning overlay for devices that don't support orientation lock (iOS) */}
      {!isLandscape && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '64px',
            marginBottom: '24px',
            animation: 'rotate90 1.5s ease-in-out infinite'
          }}>
            📱
          </div>
          <style>{`
            @keyframes rotate90 {
              0%, 100% { transform: rotate(0deg); }
              50% { transform: rotate(-90deg); }
            }
          `}</style>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: '16px'
          }}>
            Please Rotate Your Device
          </h2>
          <p style={{
            fontSize: '16px',
            color: '#9ca3af',
            maxWidth: '300px',
            lineHeight: 1.5,
            marginBottom: '24px'
          }}>
            The Scoreboard works best in landscape mode. Please rotate your device horizontally to continue.
          </p>
          <div style={{
            padding: '12px 16px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            maxWidth: '320px'
          }}>
            <p style={{
              fontSize: '13px',
              color: '#93c5fd',
              lineHeight: 1.4,
              margin: 0
            }}>
              <strong>Tip:</strong> For auto-backup features, use Chrome or Edge on a desktop/laptop computer.
            </p>
          </div>
          <button
            onClick={() => {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(err => {
                  // Fullscreen not supported
                })
              }
            }}
            style={{
              marginTop: '24px',
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
          <p style={{
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '12px'
          }}>
            Fullscreen removes browser headers to maximize screen space.
          </p>
        </div>
      )}
      <ScoreboardToolbar collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed(!headerCollapsed)}>
        {/* Column 1: Date/Time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <span className="toolbar-clock" style={{ fontSize: isCompactMode ? '11px' : '14px' }}>{formatTimestamp(now)}</span>
        </div>

        {/* Column 2: Left team */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            overflow: 'hidden'
          }}>
            <span style={{
              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {leftTeam.name || (leftisTeam1 ? 'team1' : 'team2')}
            </span>
            <div style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: isCompactMode ? '10px' : '11px',
              fontWeight: 700,
              background: leftTeam.color || '#ef4444',
              color: isBrightColor(leftTeam.color || '#ef4444') ? '#000' : '#fff',
              flexShrink: 0
            }}>
              {teamALabel}
            </div>
          </div>
        </div>

        {/* Column 3: Set Counter (centered) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isCompactMode ? '6px' : '12px'
        }}>
          <span style={{
            padding: isCompactMode ? '2px 6px' : '4px 10px',
            borderRadius: '4px',
            fontSize: isCompactMode ? '12px' : '16px',
            fontWeight: 700,
            background: leftTeam?.color || '#ef4444',
            color: isBrightColor(leftTeam?.color || '#ef4444') ? '#000' : '#fff'
          }}>
            {setsWon?.left || 0}
          </span>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: isCompactMode ? '10px' : '14px'
          }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>SET</span>
            <span style={{ fontWeight: 700 }}>{data?.set?.index || 1}</span>
          </div>
          <span style={{
            padding: isCompactMode ? '2px 6px' : '4px 10px',
            borderRadius: '4px',
            fontSize: isCompactMode ? '12px' : '16px',
            fontWeight: 700,
            background: rightTeam?.color || '#3b82f6',
            color: isBrightColor(rightTeam?.color || '#3b82f6') ? '#000' : '#fff'
          }}>
            {setsWon?.right || 0}
          </span>
        </div>

        {/* Column 4: Right team */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: isCompactMode ? '10px' : '11px',
              fontWeight: 700,
              background: rightTeam.color || '#3b82f6',
              color: isBrightColor(rightTeam.color || '#3b82f6') ? '#000' : '#fff',
              flexShrink: 0
            }}>
              {teamBLabel}
            </div>
            <span style={{
              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {rightTeam.name || (leftisTeam1 ? 'team2' : 'team1')}
            </span>
          </div>
        </div>

        {/* Right: Scoresheet, Menu */}
        <div className="toolbar-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isCompactMode ? '4px' : '12px' }}>
          {/* Scoresheet dropdown menu */}
          <MenuList
            buttonLabel="📄"
            buttonTitle={t('header.scoresheet')}
            menuTitle={t('header.scoresheet')}
            buttonClassName="secondary"
            buttonStyle={{
              background: '#22c55e',
              color: '#000',
              fontWeight: 600,
              padding: '6px 10px',
              fontSize: '16px'
            }}
            showArrow={true}
            position="right"
            items={[
              {
                key: 'scoresheet-preview',
                label: `🔍 ${t('header.preview')}`,
                onClick: async () => {
                  try {
                    const match = data?.match
                    if (!match) {
                      showAlert('No match data available', 'error')
                      return
                    }

                    // Add country data to team objects
                    const team1WithCountry = data?.team1Team ? { ...data.team1Team, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
                    const team2WithCountry = data?.team2Team ? { ...data.team2Team, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

                    const scoresheetData = {
                      match: {
                        ...match,
                        team_1Country: match?.team1Country || '',
                        team_2Country: match?.team2Country || ''
                      },
                      team_1Team: team1WithCountry,
                      team_2Team: team2WithCountry,
                      team_1Players: data?.team1Players || [],
                      team_2Players: data?.team2Players || [],
                      sets: data?.sets || [],
                      events: data?.events || [],
                      sanctions: []
                    }

                    sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
                    const scoresheetWindow = window.open('/scoresheet_beach.html', '_blank', 'width=1200,height=900')

                    if (!scoresheetWindow) {
                      showAlert(t('header.allowPopups'), 'warning')
                      return
                    }

                    // Store reference for live updates
                    scoresheetWindowRef.current = scoresheetWindow

                    const errorListener = (event) => {
                      if (event.data && event.data.type === 'SCORESHEET_ERROR') {
                        setScoresheetErrorModal({
                          error: event.data.error || 'Unknown error',
                          details: event.data.details || event.data.stack || ''
                        })
                        window.removeEventListener('message', errorListener)
                      }
                    }
                    window.addEventListener('message', errorListener)
                    setTimeout(() => window.removeEventListener('message', errorListener), 30000)
                  } catch (error) {
                    console.error('Error opening scoresheet:', error)
                    setScoresheetErrorModal({ error: 'Failed to open scoresheet', details: error.message || '' })
                  }
                }
              },
              {
                key: 'scoresheet-print',
                label: `🖨️ ${t('header.print')}`,
                onClick: async () => {
                  try {
                    const match = data?.match
                    if (!match) {
                      showAlert('No match data available', 'error')
                      return
                    }

                    // Add country data to team objects
                    const team1WithCountry = data?.team1Team ? { ...data.team1Team, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
                    const team2WithCountry = data?.team2Team ? { ...data.team2Team, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

                    const scoresheetData = {
                      match: {
                        ...match,
                        team_1Country: match?.team1Country || '',
                        team_2Country: match?.team2Country || ''
                      },
                      team_1Team: team1WithCountry,
                      team_2Team: team2WithCountry,
                      team_1Players: data?.team1Players || [],
                      team_2Players: data?.team2Players || [],
                      sets: data?.sets || [],
                      events: data?.events || [],
                      sanctions: []
                    }

                    sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
                    const scoresheetWindow = window.open('/scoresheet_beach.html?action=print', '_blank', 'width=1200,height=900')

                    if (!scoresheetWindow) {
                      showAlert(t('header.allowPopups'), 'warning')
                      return
                    }

                    const errorListener = (event) => {
                      if (event.data && event.data.type === 'SCORESHEET_ERROR') {
                        setScoresheetErrorModal({
                          error: event.data.error || 'Unknown error',
                          details: event.data.details || event.data.stack || ''
                        })
                        window.removeEventListener('message', errorListener)
                      }
                    }
                    window.addEventListener('message', errorListener)
                    setTimeout(() => window.removeEventListener('message', errorListener), 30000)
                  } catch (error) {
                    console.error('Error printing scoresheet:', error)
                    setScoresheetErrorModal({ error: 'Failed to print scoresheet', details: error.message || '' })
                  }
                }
              },
              {
                key: 'scoresheet-save',
                label: `💾 ${t('header.savePdf')}`,
                onClick: async () => {
                  try {
                    const match = data?.match
                    if (!match) {
                      showAlert('No match data available', 'error')
                      return
                    }

                    // Add country data to team objects
                    const team1WithCountry = data?.team1Team ? { ...data.team1Team, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
                    const team2WithCountry = data?.team2Team ? { ...data.team2Team, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

                    const scoresheetData = {
                      match: {
                        ...match,
                        team_1Country: match?.team1Country || '',
                        team_2Country: match?.team2Country || ''
                      },
                      team_1Team: team1WithCountry,
                      team_2Team: team2WithCountry,
                      team_1Players: data?.team1Players || [],
                      team_2Players: data?.team2Players || [],
                      sets: data?.sets || [],
                      events: data?.events || [],
                      sanctions: []
                    }

                    sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
                    const scoresheetWindow = window.open('/scoresheet_beach.html?action=save', '_blank', 'width=1200,height=900')

                    if (!scoresheetWindow) {
                      showAlert(t('header.allowPopups'), 'warning')
                      return
                    }

                    const errorListener = (event) => {
                      if (event.data && event.data.type === 'SCORESHEET_ERROR') {
                        setScoresheetErrorModal({
                          error: event.data.error || 'Unknown error',
                          details: event.data.details || event.data.stack || ''
                        })
                        window.removeEventListener('message', errorListener)
                      }
                    }
                    window.addEventListener('message', errorListener)
                    setTimeout(() => window.removeEventListener('message', errorListener), 30000)
                  } catch (error) {
                    console.error('Error saving scoresheet:', error)
                    setScoresheetErrorModal({ error: 'Failed to save scoresheet', details: error.message || '' })
                  }
                }
              }
            ]}
          />
          <MenuList
            buttonLabel="☰"
            buttonTitle="Menu"
            menuTitle="Menu"
            buttonClassName="secondary"
            buttonStyle={{
              background: '#22c55e',
              color: '#000',
              fontWeight: 600,
              width: isCompactMode ? 'auto' : 'auto',
              padding: isCompactMode ? '4px 8px' : (isNarrowMode ? '4px 8px' : '8px 16px'),
              fontSize: isCompactMode ? '14px' : (isNarrowMode ? '12px' : '14px'),
              textAlign: 'center'
            }}
            showArrow={false}
            position="right"
            items={[
              {
                key: 'action-log',
                label: 'Show Action Log',
                onClick: () => {
                  setShowLogs(true)
                }
              },
              {
                key: 'sanctions',
                label: 'Show Sanctions and Results',
                onClick: () => {
                  setShowSanctions(true)
                }
              },
              {
                key: 'manual',
                label: 'Manual Changes',
                onClick: () => {
                  setShowManualPanel(true)
                }
              },
              {
                key: 'remarks',
                label: 'Open Remarks Recording',
                onClick: () => {
                  setShowRemarks(true)
                }
              },
              {
                key: 'stop-match',
                label: t('scoreboard.menu.stopMatch', 'Stop the Match'),
                icon: '⛔',
                onClick: () => {
                  setStopMatchModal('select')
                },
                style: { color: '#ef4444' }
              },
              {
                key: 'rosters',
                label: 'Show Rosters',
                onClick: () => {
                  setShowRosters(true)
                }
              },
              {
                key: 'pins',
                label: 'Show PINs',
                onClick: () => {
                  setShowPinsModal(true)
                }
              },
              ...(onOpenMatchSetup ? [{
                key: 'match-setup',
                label: 'Show Match Setup',
                onClick: () => {
                  onOpenMatchSetup()
                }
              }] : []),
              { separator: true },
              {
                key: 'export',
                label: '📥 Download Game Data (JSON)',
                onClick: async () => {
                  try {
                    // Export all database data
                    const allMatches = await db.matches.toArray()
                    const allTeams = await db.teams.toArray()
                    const allPlayers = await db.players.toArray()
                    const allSets = await db.sets.toArray()
                    const allEvents = await db.events.toArray()
                    const allReferees = await db.referees.toArray()
                    const allScorers = await db.scorers.toArray()

                    const exportData = {
                      exportDate: new Date().toISOString(),
                      matchId: matchId,
                      matches: allMatches,
                      teams: allTeams,
                      players: allPlayers,
                      sets: allSets,
                      events: allEvents,
                      referees: allReferees,
                      scorers: allScorers
                    }

                    // Create a blob and download
                    const jsonString = JSON.stringify(exportData, null, 2)
                    const blob = new Blob([jsonString], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `database_export_${matchId}_${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(url)
                  } catch (error) {
                    console.error('Error exporting database:', error)
                    showAlert(t('scoreboard.errors.exportFailed'), 'error')
                  }
                }
              },
              {
                key: 'options',
                label: '⚙️ Options',
                onClick: () => {
                  setShowOptionsInMenu(true)
                }
              }
            ]}
          />
        </div>
      </ScoreboardToolbar>

      {/* Scoresheet Error Modal */}
      {scoresheetErrorModal && (
        <Modal
          title={t('scoreboard.modals.scoresheetError')}
          open={!!scoresheetErrorModal}
          onClose={() => setScoresheetErrorModal(null)}
        >
          <div style={{ padding: '20px' }}>
            <div style={{
              color: '#ef4444',
              fontSize: '16px',
              fontWeight: 600,
              marginBottom: '12px'
            }}>
              {scoresheetErrorModal.error}
            </div>
            {scoresheetErrorModal.details && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#1e293b',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#cbd5e1',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                {scoresheetErrorModal.details}
              </div>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setScoresheetErrorModal(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rosters Modal */}
      {showRosters && (
        <Modal
          title={t('scoreboard.rosters')}
          open={showRosters}
          onClose={() => setShowRosters(false)}
          width="100vw"
          height="calc(100vh - 40px)"
        >
          {(() => {
            const team1Players = data.team1Players || []
            const team2Players = data.team2Players || []

            // Pad arrays to same length for alignment
            const maxPlayers = Math.max(team1Players.length, team2Players.length)

            const paddedteam1Players = [...team1Players, ...Array(maxPlayers - team1Players.length).fill(null)]
            const paddedteam2Players = [...team2Players, ...Array(maxPlayers - team2Players.length).fill(null)]
     
            return (
              <div className="roster-panel">
                {/* Players Section */}
                <div className="roster-tables">
                  <div className="roster-table-wrapper">
                    <h3>{data.team1Team?.name || t('common.team1')} {t('scoreboard.players')}</h3>
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th>{t('roster.number')}</th>
                          <th>{t('roster.name')}</th>
                          <th>{t('roster.dob')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paddedteam1Players.map((player, idx) => (
                          <tr key={player?.id || `empty-${idx}`}>
                            {player ? (
                              <>
                                <td className="roster-number">
                                  <span>{player.number ?? '—'}</span>
                                  <span className="roster-role">
                                    {player.isCaptain && <span className="roster-badge captain">C</span>}
                                  </span>
                                </td>
                                <td className="roster-name">
                                  {player.lastName || player.name} {player.firstName}
                                </td>
                                <td className="roster-dob">{player.dob || '—'}</td>
                              </>
                            ) : (
                              <td colSpan="3" style={{ height: '40px' }}></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="roster-table-wrapper">
                    <h3>{data.team2Team?.name || t('common.team2')} {t('scoreboard.players')}</h3>
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th>{t('roster.number')}</th>
                          <th>{t('roster.name')}</th>
                          <th>{t('roster.dob')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paddedteam2Players.map((player, idx) => (
                          <tr key={player?.id || `empty-${idx}`}>
                            {player ? (
                              <>
                                <td className="roster-number">
                                  <span>{player.number ?? '—'}</span>
                                  <span className="roster-role">
                                    {player.isCaptain && <span className="roster-badge captain">C</span>}
                                  </span>
                                </td>
                                <td className="roster-name">
                                  {player.lastName || player.name} {player.firstName}
                                </td>
                                <td className="roster-dob">{player.dob || '—'}</td>
                              </>
                            ) : (
                              <td colSpan="3" style={{ height: '40px' }}></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(data?.match?.officials && data.match.officials.length > 0) && (
                  <div className="officials-section" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Match Officials</h3>
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Name</th>
                          <th>Country</th>
                          <th>DOB</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.match.officials.map((official, idx) => (
                          <tr key={idx}>
                            <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{official.role || '—'}</td>
                            <td>{official.lastName || ''} {official.firstName || ''}</td>
                            <td>{official.country || '—'}</td>
                            <td>{official.dob || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        </Modal>
      )}


      {/* Main Scoreboard Layout - Scaled proportionally to viewport */}
      <div style={{
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}>
        <div
          className="match-content"
          style={{
            width: '100%',
            maxWidth: `${DESIGN_WIDTH * scaleFactor - 20}px`,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'none' }}>
            <div className="team-info" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: isCompactMode ? '4px 8px' : '6px 12px',
                  background: leftTeam.color || '#ef4444',
                  color: isBrightColor(leftTeam.color || '#ef4444') ? '#000' : '#fff',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: isCompactMode ? '11px' : '14px',
                  marginBottom: '8px',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
              >
                <span style={{ flexShrink: 0 }}>{teamALabel}</span>
                <span style={{ flexShrink: 0 }}>-</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: isNarrowMode ? '30px' : '40px' }}>{teamAShortName}</span>
                {(isCompactMode || headerCollapsed) && (
                  <span style={{
                    marginLeft: '4px',
                    padding: '2px 6px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {setsWon.left}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <div
                onClick={() => {
                  // Clicking calls timeout if available
                  const canCallTimeout = getTimeoutsUsed('left') < 2 && rallyStatus !== 'in_play' && !isRallyReplayed
                  if (canCallTimeout) {
                    handleTimeout('left')
                  }
                }}
                className="to-sub-counter"
                style={{
                  flex: 1,
                  background: getTimeoutsUsed('left') >= 2
                    ? 'rgba(239, 68, 68, 0.2)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(34, 197, 94, 0.2)'),
                  borderRadius: (isCompactMode || isShortHeight) ? '4px' : '8px',
                  padding: (isCompactMode || isShortHeight) ? '4px' : '12px',
                  textAlign: 'center',
                  border: getTimeoutsUsed('left') >= 2
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(34, 197, 94, 0.4)'),
                  cursor: getTimeoutsUsed('left') >= 2 || rallyStatus === 'in_play' || isRallyReplayed ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="to-sub-label" style={{ fontSize: (isCompactMode || isShortHeight) ? '8px' : '11px', color: 'var(--muted)', marginBottom: (isCompactMode || isShortHeight) ? '1px' : '4px' }}>{t('scoreboard.labels.to')}</div>
                <div className="to-sub-value" style={{
                  fontSize: (isCompactMode || isShortHeight) ? '14px' : '24px',
                  fontWeight: 700,
                  color: getTimeoutsUsed('left') >= 2 ? '#ef4444' : (!(rallyStatus === 'in_play' || isRallyReplayed) ? '#22c55e' : 'inherit')
                }}>{getTimeoutsUsed('left')}</div>
              </div>

            </div>


            {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
            {isNarrowMode ? (
              <div style={{ marginTop: '4px' }}>
                <button
                  onClick={() => setLeftDelaysDropdownOpen(!leftDelaysDropdownOpen)}
                  style={{ width: '100%', fontSize: '10px', padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {t('scoreboard.sanctions.irAndDelays')} {leftDelaysDropdownOpen ? '▲' : '▼'}
                </button>
                {leftDelaysDropdownOpen && (
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam1' : 'improperRequestteam2'] && (
                      <button
                        onClick={() => { handleImproperRequest('left'); setLeftDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.improper}
                      >
                        {t('scoreboard.sanctions.improperRequest')}
                      </button>
                    )}
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam1' : 'delayWarningteam2'] ? (
                      <button
                        onClick={() => { handleDelayWarning('left'); setLeftDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.delayWarning}
                      >
                        {t('scoreboard.sanctions.delayWarning')}
                      </button>
                    ) : (
                      <button
                        onClick={() => { handleDelayPenalty('left'); setLeftDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.delayPenalty}
                      >
                        {t('scoreboard.sanctions.delayPenalty')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam1' : 'improperRequestteam2'] && (
                  <button
                    onClick={() => handleImproperRequest('left')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.improper}
                  >
                    {t('scoreboard.sanctions.improperRequest')}
                  </button>
                )}
                {!data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam1' : 'delayWarningteam2'] ? (
                  <button
                    onClick={() => handleDelayWarning('left')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.delayWarning}
                  >
                    {t('scoreboard.sanctions.delayWarning')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelayPenalty('left')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.delayPenalty}
                  >
                    {t('scoreboard.sanctions.delayPenalty')}
                  </button>
                )}
              </div>
            )}

            {/* Status boxes for team sanctions */}
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam1' : 'improperRequestteam2'] && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(156, 163, 175, 0.15)',
                  border: '1px solid rgba(156, 163, 175, 0.3)',
                  borderRadius: '4px',
                  color: '#d1d5db'
                }}>
                  {t('scoreboard.sanctions.sanctionedImproperRequest')}
                </div>
              )}
              {data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam1' : 'delayWarningteam2'] && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '4px',
                  color: '#facc15'
                }}>
                  {t('scoreboard.sanctions.sanctionedDelayWarning')}
                </div>
              )}
              {teamHasFormalWarning(leftisTeam1 ? 'team1' : 'team2') && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(250, 204, 21, 0.15)',
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  borderRadius: '4px',
                  color: '#fde047'
                }}>
                  {t('scoreboard.sanctions.sanctionedFormalWarning')} 🟨
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: `${8 * scaleFactor}px` }}>

            {/* ===== SECTION 1: Status Row (17% Rally Status | 66% Score | 17% Last Action) ===== */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              minHeight: `${DESIGN_VMIN * 0.12 * scaleFactor}px`
            }}>
              {/* Rally Status - 17% */}
              <div style={{ flex: '0 0 17%', textAlign: 'center', padding: `0 ${4 * scaleFactor}px` }}>
                <div style={{ fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px` }}>
                  <span style={{ color: 'var(--muted)' }}>{t('scoreboard.labels.rallyStatus')}: </span>
                  <span style={{ color: rallyStatus === 'in_play' ? '#4ade80' : '#fb923c', fontWeight: 600 }}>
                    {rallyStatus === 'in_play' ? t('scoreboard.labels.inPlay') : t('scoreboard.labels.notInPlay')}
                  </span>
                </div>
              </div>

              {/* Score Display - 66% */}
              <div style={{
                flex: '0 0 66%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Left Score */}
                <span style={{
                  fontFamily: getScoreFont(),
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: `${DESIGN_VMIN * 0.10 * scaleFactor}px`,
                  fontWeight: 500,
                  lineHeight: 1,
                  minWidth: '1.2em',
                  textAlign: 'right',
                  display: 'inline-block'
                }}>{pointsBySide.left}</span>

                {/* Colon */}
                <span style={{
                  fontFamily: getScoreFont(),
                  fontSize: `${DESIGN_VMIN * 0.10 * scaleFactor}px`,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: '#22c55e',
                  transform: 'translateY(-0.06em)',
                  padding: '0 0.3em'
                }}>:</span>

                {/* Right Score */}
                <span style={{
                  fontFamily: getScoreFont(),
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: `${DESIGN_VMIN * 0.10 * scaleFactor}px`,
                  fontWeight: 500,
                  lineHeight: 1,
                  minWidth: '1.2em',
                  textAlign: 'left',
                  display: 'inline-block'
                }}>{pointsBySide.right}</span>
              </div>

              {/* Last Action - 17% */}
              <div style={{ flex: '0 0 17%', textAlign: 'center', padding: `0 ${4 * scaleFactor}px` }}>
                {data?.events && data.events.length > 0 && data?.set && (() => {
                  const currentSetIndex = data.set.index
                  const currentSetEvents = data.events.filter(e => e.setIndex === currentSetIndex)
                  if (currentSetEvents.length === 0) return null
                  const sortedEvents = [...currentSetEvents].sort((a, b) => {
                    const aSeq = a.seq || 0
                    const bSeq = b.seq || 0
                    if (aSeq !== 0 || bSeq !== 0) return bSeq - aSeq
                    const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
                    const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
                    return bTime - aTime
                  })
                  const isSubEvent = (event) => {
                    const seq = event.seq || 0
                    return seq !== Math.floor(seq)
                  }
                  let lastEvent = null
                  for (const e of sortedEvents) {
                    if (isSubEvent(e)) continue
                    if (e.type === 'rally_start' || e.type === 'replay') continue
                    if (e.type === 'lineup') {
                      const hasInitial = e.payload?.isInitial === true
                      const hasSubstitution = e.payload?.fromSubstitution === true
                      if (!hasInitial && !hasSubstitution) continue
                    }
                    const desc = getActionDescription(e)
                    if (desc && desc !== 'Unknown action') {
                      lastEvent = e
                      break
                    }
                  }
                  if (!lastEvent) return null
                  const description = getActionDescription(lastEvent)
                  return (
                    <div style={{ fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`, wordBreak: 'break-word' }}>
                      <span style={{ color: 'var(--muted)' }}>{t('scoreboard.lastAction', 'Last:')} </span>
                      <span style={{ color: 'var(--text)' }}>{description}</span>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* ===== SECTION 2: Court Row (15% Toolbar | 10% Serve | 50% Court | 10% Serve | 15% Toolbar) ===== */}
            {(
              <>
                <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', overflow: 'hidden' }}>
                  {/* LEFT TEAM TOOLBOX - 15% */}
                  <div style={{
                    flex: '0 0 15%',
                    minWidth: 0,
                    maxWidth: '15%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${6 * scaleFactor}px`,
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: `${8 * scaleFactor}px`,
                    padding: `${6 * scaleFactor}px`,
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}>
                    {/* Team Header - A/B label, team name, country */}
                    {(() => {
                      const currentLeftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const leftTeamData = currentLeftTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                      const leftTeamColor = leftTeamData?.color || (currentLeftTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                      const leftTeamLabel = currentLeftTeamKey === teamAKey ? 'A' : 'B'
                      const leftPlayers = leftisTeam1 ? data?.team1Players : data?.team2Players
                      const leftCountry = leftisTeam1 ? data?.match?.team1Country : data?.match?.team2Country
                      // Build team name from player last names
                      const playerNames = (leftPlayers || [])
                        .filter(p => p?.lastName)
                        .map(p => p.lastName)
                        .join(' / ')
                      return (
                        <div style={{
                          width: '100%',
                          background: leftTeamColor,
                          borderRadius: `${6 * scaleFactor}px`,
                          padding: `${8 * scaleFactor}px ${4 * scaleFactor}px`,
                          textAlign: 'center',
                          color: isBrightColor(leftTeamColor) ? '#000' : '#fff'
                        }}>
                          <div style={{ fontSize: `${DESIGN_VMIN * 0.04 * scaleFactor}px`, fontWeight: 700, lineHeight: 1.2 }}>{leftTeamLabel}</div>
                          {playerNames && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px`, lineHeight: 1.2, wordBreak: 'break-word' }}>{playerNames}</div>
                          )}
                          {leftCountry && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 500, marginTop: `${2 * scaleFactor}px`, opacity: 0.9 }}>{leftCountry}</div>
                          )}
                        </div>
                      )
                    })()}
                    {/* Timeout and BMP buttons row */}
                    {(() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const toUsed = timeoutsUsed[leftTeamKey] || 0
                      const isRallyOngoing = rallyStatus !== 'idle'
                      // Gray if rally ongoing, green if available, red if taken
                      let bg, borderColor, textColor
                      if (toUsed >= 1) {
                        // Timeout taken - red
                        bg = 'transparent'
                        borderColor = '#ef4444'
                        textColor = '#ef4444'
                      } else if (isRallyOngoing) {
                        // Rally ongoing - gray
                        bg = 'rgba(156, 163, 175, 0.3)'
                        borderColor = 'rgba(156, 163, 175, 0.5)'
                        textColor = '#9ca3af'
                      } else {
                        // Available - green border/text
                        bg = 'transparent'
                        borderColor = '#22c55e'
                        textColor = '#22c55e'
                      }
                      return (
                        <div style={{ display: 'flex', gap: `${4 * scaleFactor}px`, width: '100%' }}>
                          <button
                            onClick={() => handleTimeout(leftTeamKey)}
                            disabled={isRallyOngoing || toUsed >= 1}
                            style={{
                              flex: 1,
                              height: `${DESIGN_VMIN * 0.045 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                              fontWeight: 700,
                              background: bg,
                              color: textColor,
                              border: `${2 * scaleFactor}px solid ${borderColor}`,
                              borderRadius: `${6 * scaleFactor}px`,
                              cursor: (isRallyOngoing || toUsed >= 1) ? 'not-allowed' : 'pointer',
                              padding: `${6 * scaleFactor}px`
                            }}
                            title="Time-out"
                          >{toUsed >= 1 ? 'TO' : 'TO'}</button>
                          {(() => {
                            const bmpUsed = getUnsuccessfulBMPsUsed(leftTeamKey)
                            const bmpRemaining = 2 - bmpUsed
                            const bmpExhausted = bmpRemaining <= 0
                            // BMP available when rally is ongoing OR just ended (idle), but not during set break etc.
                            const bmpAvailable = !bmpExhausted && data?.set && !data?.set?.finished
                            return (
                              <button
                                onClick={() => handleTeamBMP(leftTeamKey)}
                                disabled={!bmpAvailable}
                                style={{
                                  flex: 1,
                                  height: `${DESIGN_VMIN * 0.045 * scaleFactor}px`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                                  fontWeight: 700,
                                  background: bmpExhausted ? '#ef4444' : (bmpAvailable ? 'transparent' : 'rgba(156, 163, 175, 0.3)'),
                                  color: bmpExhausted ? '#fff' : (bmpAvailable ? '#f97316' : '#9ca3af'),
                                  border: `${2 * scaleFactor}px solid ${bmpExhausted ? '#ef4444' : (bmpAvailable ? '#f97316' : 'rgba(156, 163, 175, 0.5)')}`,
                                  borderRadius: `${6 * scaleFactor}px`,
                                  cursor: bmpAvailable ? 'pointer' : 'not-allowed',
                                  padding: `${6 * scaleFactor}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: `${6 * scaleFactor}px`
                                }}
                                title={`Ball Mark Protocol (${bmpRemaining} remaining)`}
                              >
                                <span>BMP</span>
                                <span style={{
                                  background: bmpExhausted ? '#fff' : '#f97316',
                                  color: bmpExhausted ? '#ef4444' : '#000',
                                  padding: `${2 * scaleFactor}px ${6 * scaleFactor}px`,
                                  borderRadius: `${4 * scaleFactor}px`,
                                  fontSize: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                  fontWeight: 700
                                }}>{bmpRemaining}</span>
                              </button>
                            )
                          })()}
                        </div>
                      )
                    })()}
                    {/* Improper Request - gray, full width - hide if already given */}
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam1' : 'improperRequestteam2'] && (
                      <button
                        onClick={() => handleTeamSanction(leftisTeam1 ? 'team1' : 'team2', 'improper_request')}
                        style={{
                          width: '100%',
                          height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                          fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                          fontWeight: 600,
                          background: 'rgba(156, 163, 175, 0.2)',
                          color: '#9ca3af',
                          border: `${1 * scaleFactor}px solid rgba(156, 163, 175, 0.4)`,
                          borderRadius: `${4 * scaleFactor}px`,
                          cursor: 'pointer',
                          padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box'
                        }}
                        title="Improper Request"
                      >Improper Request</button>
                    )}
                    {/* Delay Warning / Delay Penalty - yellow if DW not given, red if DW already given */}
                    {(() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const hasDelayWarning = data?.match?.sanctions?.[leftTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      if (hasDelayWarning) {
                        // Delay Penalty - red
                        return (
                          <button
                            onClick={() => handleTeamSanction(leftTeamKey, 'delay_penalty')}
                            style={{
                              width: '100%',
                              height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                              fontWeight: 600,
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: `${1 * scaleFactor}px solid rgba(239, 68, 68, 0.4)`,
                              borderRadius: `${4 * scaleFactor}px`,
                              cursor: 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title="Delay Penalty"
                          >Delay Penalty</button>
                        )
                      } else {
                        // Delay Warning - yellow
                        return (
                          <button
                            onClick={() => handleTeamSanction(leftTeamKey, 'delay_warning')}
                            style={{
                              width: '100%',
                              height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                              fontWeight: 600,
                              background: 'rgba(234, 179, 8, 0.2)',
                              color: '#eab308',
                              border: `${1 * scaleFactor}px solid rgba(234, 179, 8, 0.4)`,
                              borderRadius: `${4 * scaleFactor}px`,
                              cursor: 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title="Delay Warning"
                          >Delay Warning</button>
                        )
                      }
                    })()}
                    {/* Summary Table */}
                    {(() => {
                      const currentLeftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const allSets = (data?.sets || []).sort((a, b) => a.index - b.index)
                      const currentSetIndex = data?.set?.index || 1
                      const setsByIndex = new Map()
                      allSets.forEach(set => {
                        if (set.index <= currentSetIndex) {
                          setsByIndex.set(set.index, set)
                        }
                      })
                      const visibleSets = Array.from(setsByIndex.values()).sort((a, b) => a.index - b.index)

                      return (
                        <div style={{ width: '100%', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, tableLayout: 'fixed' }}>
                            <thead>
                              <tr style={{ borderBottom: `${1 * scaleFactor}px solid rgba(255,255,255,0.2)` }}>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Set</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Points</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Won</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>TO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleSets.map(set => {
                                const leftPoints = (currentLeftTeamKey === 'team1' ? set.team1Points : set.team2Points) ?? 0
                                const rightPoints = (currentLeftTeamKey === 'team1' ? set.team2Points : set.team1Points) ?? 0
                                const won = set.finished && leftPoints > rightPoints ? 1 : 0
                                const timeouts = (data?.events || []).filter(e =>
                                  e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentLeftTeamKey
                                ).length
                                let rowColor = 'inherit'
                                if (set.finished) {
                                  rowColor = won === 1 ? '#22c55e' : '#ef4444'
                                }
                                return (
                                  <tr key={set.id} style={{ borderBottom: `${1 * scaleFactor}px solid rgba(255,255,255,0.1)`, color: rowColor }}>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{set.index}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{leftPoints}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{won}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{timeouts}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                    {/* Sanction Indicators - show IR, DW, DP if given */}
                    {(() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const hasIR = data?.match?.sanctions?.[leftTeamKey === 'team1' ? 'improperRequestteam1' : 'improperRequestteam2']
                      const hasDW = data?.match?.sanctions?.[leftTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      const delayPenaltyCount = (data?.events || []).filter(e =>
                        e.type === 'sanction' && e.payload?.type === 'delay_penalty' && e.payload?.team === leftTeamKey
                      ).length
                      if (!hasIR && !hasDW && delayPenaltyCount === 0) return null
                      return (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: `${2 * scaleFactor}px`,
                          marginTop: `${4 * scaleFactor}px`,
                          width: '100%'
                        }}>
                          {hasIR && (
                            <div style={{
                              fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                              color: '#9ca3af',
                              textAlign: 'center',
                              padding: `${2 * scaleFactor}px`,
                              background: 'rgba(156, 163, 175, 0.15)',
                              borderRadius: `${3 * scaleFactor}px`
                            }}>
                              Improper Request
                            </div>
                          )}
                          {hasDW && (
                            <div style={{
                              fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                              color: '#eab308',
                              textAlign: 'center',
                              padding: `${2 * scaleFactor}px`,
                              background: 'rgba(234, 179, 8, 0.15)',
                              borderRadius: `${3 * scaleFactor}px`
                            }}>
                              Delay Warning
                            </div>
                          )}
                          {delayPenaltyCount > 0 && (
                            [...Array(delayPenaltyCount)].map((_, i) => (
                              <div key={i} style={{
                                fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                color: '#ef4444',
                                textAlign: 'center',
                                padding: `${2 * scaleFactor}px`,
                                background: 'rgba(239, 68, 68, 0.15)',
                                borderRadius: `${3 * scaleFactor}px`
                              }}>
                                Delay Penalty
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* LEFT SERVE INDICATOR - 10% */}
                  <div style={{ flex: '0 0 10%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                    {leftServing && (() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const servingPlayer = getServingPlayer(leftTeamKey, leftTeam)
                      if (!servingPlayer || !servingPlayer.number) {
                        return (
                          <img
                            src={ballImage} onError={(e) => e.target.src = ballimage}
                            alt="Serving team"
                            style={{ ...serveBallBaseStyle, width: '100%', maxWidth: `${DESIGN_VMIN * 0.08 * scaleFactor}px`, height: 'auto', aspectRatio: '1' }}
                          />
                        )
                      }
                      return (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          gap: `${4 * scaleFactor}px`
                        }}>
                          <div style={{
                            fontSize: `${DESIGN_VMIN * 0.022 * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            textTransform: 'uppercase',
                            letterSpacing: `${0.5 * scaleFactor}px`,
                            textAlign: 'center'
                          }}>
                            SERVE
                          </div>
                          <div style={{
                            fontSize: `${DESIGN_VMIN * 0.05 * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            width: '80%',
                            maxWidth: `${DESIGN_VMIN * 0.08 * scaleFactor}px`,
                            aspectRatio: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: `${2 * scaleFactor}px solid var(--accent)`,
                            borderRadius: `${8 * scaleFactor}px`,
                            boxSizing: 'border-box'
                          }}>
                            {servingPlayer.number}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* CENTER COLUMN - Court - 50% */}
                  <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* 1R above court */}
                    {!isCompactMode && (() => {
                      const ref1 = data?.match?.officials?.find(o => o.role === '1st referee' || o.role === '1st Referee')
                      const ref1Name = ref1 ? `${ref1.firstName || ''} ${ref1.lastName || ''}`.trim() : null
                      if (!ref1Name) return null
                      return (
                        <div style={{
                          marginBottom: '4px'
                        }}>
                          <span style={{
                            fontSize: isLaptopMode ? '13px' : '16px',
                            color: 'var(--muted)',
                            whiteSpace: 'nowrap'
                          }}>
                            1R: {ref1Name}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Court or Between-Sets Setup UI */}
                    {isBetweenSets && (data?.set?.index === 3 ? !set3SetupConfirmed : !betweenSetsSetupConfirmed) ? (
                      /* Between-Sets Setup UI - replaces court */
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        transform: `scale(${scaleFactor * 1.2})`,
                        transformOrigin: 'top center',
                        marginTop: '24px'
                      }}>
                        {/* Set 3 needs coin toss first */}
                        {data?.set?.index === 3 && !data?.match?.set3CoinTossWinner ? (
                          <>
                            <div style={{
                              fontSize: '24px',
                              fontWeight: 700,
                              color: 'var(--accent)',
                              marginBottom: '24px',
                              textAlign: 'center'
                            }}>
                              Set 3 Coin Toss
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                              <button
                                onClick={() => handleSet3CoinToss('team1')}
                                style={{
                                  padding: '16px 24px',
                                  fontSize: '16px',
                                  fontWeight: 700,
                                  background: '#22c55e',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                {data?.team1Team?.shortName || data?.team1Team?.name || 'Team 1'} Won Toss
                              </button>
                              <button
                                onClick={() => handleSet3CoinToss('team2')}
                                style={{
                                  padding: '16px 24px',
                                  fontSize: '16px',
                                  fontWeight: 700,
                                  background: '#22c55e',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                {data?.team2Team?.shortName || data?.team2Team?.name || 'Team 2'} Won Toss
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Arrow indicator - points towards decision team (coin toss loser for Set 2) */}
                            {data?.set?.index !== 3 && (
                              <div style={{
                                fontSize: '48px',
                                fontWeight: 700,
                                color: 'var(--accent)',
                                marginBottom: '4px',
                                textAlign: 'center',
                                lineHeight: 1
                              }}>
                                {/* Point arrow towards decision team: left if decision team is on left, right if on right */}
                                {betweenSetsDecisionTeam === (leftisTeam1 ? 'team1' : 'team2') ? '←' : '→'}
                              </div>
                            )}
                            <div style={{
                              fontSize: '18px',
                              fontWeight: 600,
                              color: 'var(--muted)',
                              marginBottom: '16px',
                              textAlign: 'center'
                            }}>
                              {betweenSetsDecisionTeamName} chooses {data?.set?.index === 3 ? '(won coin toss)' : '(lost coin toss)'}
                            </div>

                            {/* Main row: Left serve order box | Switch buttons stacked | Right serve order box */}
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', justifyContent: 'center', alignItems: 'stretch' }}>
                              {/* Left team serve order box with ball */}
                              {(() => {
                                const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                                const leftServes = getCurrentServe() === leftTeamKey
                                const leftPlayers = leftisTeam1 ? (data?.team1Players || []) : (data?.team2Players || [])
                                const leftPlayerNumbers = leftPlayers.map(p => p.number).sort((a, b) => a - b)
                                const leftFirstServeRaw = leftisTeam1 ? data?.match?.team1FirstServe : data?.match?.team2FirstServe
                                const leftFirstServe = leftFirstServeRaw ?? leftPlayerNumbers[0]
                                const leftOther = leftPlayerNumbers.find(n => String(n) !== String(leftFirstServe)) ?? leftPlayerNumbers[1]
                                const leftLabel = leftisTeam1 ? 'A' : 'B'
                                const leftName = leftisTeam1 ? (data?.team1Team?.shortName || 'T1') : (data?.team2Team?.shortName || 'T2')
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: 36, display: 'flex', justifyContent: 'center' }}>
                                      {leftServes && (
                                        <img src={ballImage} onError={(e) => e.target.src = ballimage} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                      )}
                                    </div>
                                    <div
                                      onClick={() => handleBetweenSetsSwitchServiceOrder(leftisTeam1 ? 'team1' : 'team2')}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '10px 16px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '10px',
                                        border: leftServes ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)',
                                        minWidth: '80px',
                                        cursor: 'pointer',
                                        height: '100%',
                                        transition: 'background 0.15s'
                                      }}>
                                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                                        {leftLabel} ({leftName})
                                      </div>
                                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
                                        I: {leftFirstServe || '?'}
                                      </div>
                                      <div style={{ color: 'var(--accent)', fontSize: '10px', lineHeight: 1 }}>⇅</div>
                                      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                        II: {leftOther || '?'}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}

                              {/* Center: Switch buttons stacked */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                                <button
                                  onClick={handleBetweenSetsSwitchSides}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px 20px',
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    background: '#22c55e',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ fontSize: '20px' }}>↔</span>
                                  Switch Sides
                                </button>

                                <button
                                  onClick={handleBetweenSetsSwitchServe}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px 20px',
                                    fontSize: '16px',
                                    fontWeight: 700,
                                    background: '#22c55e',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <img src={ballImage} onError={(e) => e.target.src = ballimage} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                                  Switch Serve
                                </button>
                              </div>

                              {/* Right team serve order box with ball */}
                              {(() => {
                                const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                                const rightServes = getCurrentServe() === rightTeamKey
                                const rightPlayers = leftisTeam1 ? (data?.team2Players || []) : (data?.team1Players || [])
                                const rightPlayerNumbers = rightPlayers.map(p => p.number).sort((a, b) => a - b)
                                const rightFirstServeRaw = leftisTeam1 ? data?.match?.team2FirstServe : data?.match?.team1FirstServe
                                const rightFirstServe = rightFirstServeRaw ?? rightPlayerNumbers[0]
                                const rightOther = rightPlayerNumbers.find(n => String(n) !== String(rightFirstServe)) ?? rightPlayerNumbers[1]
                                const rightLabel = leftisTeam1 ? 'B' : 'A'
                                const rightName = leftisTeam1 ? (data?.team2Team?.shortName || 'T2') : (data?.team1Team?.shortName || 'T1')
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div
                                      onClick={() => handleBetweenSetsSwitchServiceOrder(leftisTeam1 ? 'team2' : 'team1')}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '10px 16px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '10px',
                                        border: rightServes ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)',
                                        minWidth: '80px',
                                        cursor: 'pointer',
                                        height: '100%',
                                        transition: 'background 0.15s'
                                      }}>
                                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                                        {rightLabel} ({rightName})
                                      </div>
                                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
                                        I: {rightFirstServe || '?'}
                                      </div>
                                      <div style={{ color: 'var(--accent)', fontSize: '10px', lineHeight: 1 }}>⇅</div>
                                      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                        II: {rightOther || '?'}
                                      </div>
                                    </div>
                                    <div style={{ width: 36, display: "flex", justifyContent: "center" }}>
                                      {rightServes && (
                                        <img src={ballImage} onError={(e) => e.target.src = ballimage} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>

                            {/* Countdown and Progress bar */}
                            {betweenSetsCountdown && (
                              <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                                <div style={{
                                  width: '100%',
                                  height: '8px',
                                  background: 'rgba(255, 255, 255, 0.15)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  marginBottom: '8px'
                                }}>
                                  <div style={{
                                    width: `${(betweenSetsCountdown.countdown / setIntervalDuration) * 100}%`,
                                    height: '100%',
                                    background: betweenSetsCountdown.countdown <= 30 ? '#ef4444' : 'var(--accent)',
                                    borderRadius: '4px',
                                    transition: 'width 1s linear, background 0.3s',
                                    marginLeft: 'auto'
                                  }} />
                                </div>
                                <div style={{
                                  fontSize: '36px',
                                  fontWeight: 700,
                                  color: betweenSetsCountdown.countdown <= 30 ? '#ef4444' : 'var(--accent)',
                                  fontFamily: getScoreFont()
                                }}>
                                  {betweenSetsCountdown.countdown <= 0 ? "0" : formatCountdown(betweenSetsCountdown.countdown)}
                                </div>
                              </div>
                            )}

                          </>
                        )}
                      </div>
                    ) : (
                    <div className="court" style={{ marginTop: isCompactMode ? '4px' : '2px', marginBottom: isCompactMode ? '2px' : '1px' }}>
                    <div className="court-attack-line court-attack-left" />
                    <div className="court-attack-line court-attack-right" />
                    {/* Beach volleyball: Lineup buttons removed - lineup is determined by first server selection */}
                    <div className="court-side court-side-left">
                      <div className="court-team court-team-left">
                        <div className="court-row court-row-full">
                          {leftTeam.playersOnCourt.map((player, idx) => {
                            const teamKey = leftisTeam1 ? 'team1' : 'team2'
                            const currentServe = getCurrentServe()
                            const leftTeamServes = currentServe === teamKey
                            const servingPlayer = getServingPlayer(teamKey, leftTeam)
                            const shouldShowBall = servingPlayer && servingPlayer.number === player.number

                          // Get sanctions for this player
                          const sanctions = getPlayerSanctions(teamKey, player.number)
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')


                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * 0.08 * scaleFactor
                          return (
                            <div
                              key={`${teamKey}-court-front-${player.position}-${player.id || player.number || idx}`}
                              data-court-position={player.position}
                              data-team={teamKey}
                              data-player-number={player.number}
                              className="court-player"
                              onClick={(e) => handlePlayerClick(teamKey, player.position, player.number, e)}
                              style={{
                                cursor: rallyStatus === 'idle' && !isRallyReplayed ? 'pointer' : 'default',
                                width: `${playerSize}px`,
                                height: `${playerSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.06 * scaleFactor}px`,
                                background: leftTeam.color
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballimage}
                                  alt="Volleyball"
                                  style={{
                                    position: 'absolute',
                                    left: `${-ballSize - 12 * scaleFactor}px`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: `${ballSize}px`,
                                    height: `${ballSize}px`,
                                    zIndex: 5
                                  }}
                                />
                              )}
                              <span className="court-player-number" style={{ fontSize: `${DESIGN_VMIN * 0.07 * scaleFactor}px` }}>{player.number}</span>
                              <span className="court-player-position" style={{
                                top: `${-positionOffset}px`,
                                left: `${-positionOffset}px`,
                                width: `${positionSize}px`,
                                height: `${positionSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                              }}>{player.position}</span>
                              {/* MTO/RIT indicators - top right of player circle (beach volleyball) */}
                              {(player.mto > 0 || player.rit > 0) && (
                                <div style={{
                                  position: 'absolute',
                                  top: `${-positionOffset}px`,
                                  right: `${-positionOffset}px`,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: `${1 * scaleFactor}px`,
                                  zIndex: 10
                                }}>
                                  {player.mto > 0 && (
                                    <span style={{
                                      background: '#dc2626',
                                      color: '#fff',
                                      fontSize: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                      fontWeight: 700,
                                      padding: `${1 * scaleFactor}px ${2 * scaleFactor}px`,
                                      borderRadius: `${2 * scaleFactor}px`,
                                      whiteSpace: 'nowrap'
                                    }}>MTO{player.mto > 1 ? ` x${player.mto}` : ''}</span>
                                  )}
                                  {player.rit > 0 && (
                                    <span style={{
                                      background: '#f59e0b',
                                      color: '#000',
                                      fontSize: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                      fontWeight: 700,
                                      padding: `${1 * scaleFactor}px ${2 * scaleFactor}px`,
                                      borderRadius: `${2 * scaleFactor}px`,
                                      whiteSpace: 'nowrap'
                                    }}>RIT{player.rit > 1 ? ` x${player.rit}` : ''}</span>
                                  )}
                                </div>
                              )}
                              {/* Captain indicator */}
                              {player.isCaptain && (() => {

                                return <span className="court-player-captain" style={{
                                  bottom: `${-positionOffset}px`,
                                  left: `${-positionOffset}px`,
                                  width: `${positionSize}px`,
                                  height: `${positionSize}px`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                                }}>C</span>
                              })()}

                              {/* Sanction cards indicator */}
                              {sanctions.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset}px`,
                                  zIndex: 10
                                }}>
                                  {hasExpulsion ? (
                                    // Expulsion: overlapping rotated cards
                                    <div style={{ position: 'relative', width: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.02 * scaleFactor}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        left: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        right: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : (
                                    // Other sanctions: separate cards
                                    <div style={{ display: 'flex', gap: `${DESIGN_VMIN * 0.0015 * scaleFactor}px` }}>
                                      {(hasWarning || hasDisqualification) && (
                                        <div className="sanction-card yellow" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                      {(hasPenalty || hasDisqualification) && (
                                        <div className="sanction-card red" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-47 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${21 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {[player.firstName, player.lastName].filter(Boolean).join(' ')}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="court-row" style={{ display: 'none' }}>
                        {leftTeam.playersOnCourt.slice(3, 6).map((player, idx) => {
                          const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                          const currentServe = getCurrentServe()
                          const leftTeamServes = currentServe === leftTeamKey
                          const servingPlayer = getServingPlayer(leftTeamKey, leftTeam)
                          const shouldShowBall = servingPlayer && servingPlayer.number === player.number
                        
                          // Get sanctions for this player
                          const sanctions = getPlayerSanctions(leftTeamKey, player.number)
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')


                          return (
                            <div
                              key={`${leftTeamKey}-court-back-${player.position}-${player.id || player.number || idx}`}
                              ref={player.position === 'V' ? leftCourtPositionVRef : undefined}
                              data-court-position={player.position}
                              data-team={leftTeamKey}
                              data-player-number={player.number}
                              className="court-player"
                              style={{
                                background: leftTeam.color
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballimage}
                                  alt="Volleyball"
                                  style={{
                                    position: 'absolute',
                                    left: `${-(DESIGN_VMIN * 0.08 * scaleFactor) - 12 * scaleFactor}px`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: `${DESIGN_VMIN * 0.08 * scaleFactor}px`,
                                    height: `${DESIGN_VMIN * 0.08 * scaleFactor}px`,
                                    zIndex: 5
                                  }}
                                />
                              )}
                              <span className="court-player-position">{player.position}</span>
                              {/* Captain indicator */}
                              {player.isCaptain && (() => {
                                return <span className="court-player-captain">C</span>
                              })()}
                              
                    

                              {/* Sanction cards indicator */}
                              {sanctions.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: '-1vmin',
                                  right: '-1vmin',
                                  zIndex: 10
                                }}>
                                  {hasExpulsion ? (
                                    // Expulsion: overlapping rotated cards
                                    <div style={{ position: 'relative', width: '2vmin', height: '2vmin' }}>
                                      <div className="sanction-card yellow" style={{
                                        width: '1vmin',
                                        height: '1.5vmin',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        left: '0',
                                        top: '0.15vmin',
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: '1px'
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: '1vmin',
                                        height: '1.5vmin',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        right: '0',
                                        top: '0.15vmin',
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: '1px'
                                      }}></div>
                                    </div>
                                  ) : (
                                    // Other sanctions: separate cards
                                    <div style={{ display: 'flex', gap: '0.15vmin' }}>
                                      {(hasWarning || hasDisqualification) && (
                                        <div className="sanction-card yellow" style={{ width: '1.3vmin', height: '1.8vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                      )}
                                      {(hasPenalty || hasDisqualification) && (
                                        <div className="sanction-card red" style={{ width: '1.3vmin', height: '1.8vmin', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '-47px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '3px',
                                    padding: '1px 4px',
                                    fontSize: '18px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.3px',
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {[player.firstName, player.lastName].filter(Boolean).join(' ')}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="court-net" />
                  <div className="court-side court-side-right">
                    <div className="court-team court-team-right">
                      <div className="court-row court-row-full">
                        {rightTeam.playersOnCourt.map((player, idx) => {
                          const teamKey = leftisTeam1 ? 'team2' : 'team1'
                          const currentServe = getCurrentServe()
                          const rightTeamServes = currentServe === teamKey
                          const servingPlayer = getServingPlayer(teamKey, rightTeam)
                          const shouldShowBall = servingPlayer && servingPlayer.number === player.number

                          // Get sanctions for this player
                          const sanctions = getPlayerSanctions(teamKey, player.number)
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')

                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * 0.08 * scaleFactor
                          return (
                            <div
                              key={`${teamKey}-court-front-${player.position}-${player.id || player.number || idx}`}
                              ref={player.position === 'II' ? rightCourtPositionIIRef : undefined}
                              className="court-player"
                              onClick={(e) => handlePlayerClick(teamKey, player.position, player.number, e)}
                              style={{
                                cursor: rallyStatus === 'idle' && !isRallyReplayed ? 'pointer' : 'default',
                                width: `${playerSize}px`,
                                height: `${playerSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.06 * scaleFactor}px`,
                                background: rightTeam.color
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballimage}
                                  alt="Volleyball"
                                  style={{
                                    position: 'absolute',
                                    right: `${-ballSize - 12 * scaleFactor}px`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: `${ballSize}px`,
                                    height: `${ballSize}px`,
                                    zIndex: 5
                                  }}
                                />
                              )}
                              <span className="court-player-number" style={{ fontSize: `${DESIGN_VMIN * 0.07 * scaleFactor}px` }}>{player.number}</span>
                              <span className="court-player-position" style={{
                                top: `${-positionOffset}px`,
                                left: `${-positionOffset}px`,
                                width: `${positionSize}px`,
                                height: `${positionSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                              }}>{player.position}</span>
                              {/* MTO/RIT indicators - top right of player circle (beach volleyball) */}
                              {(player.mto > 0 || player.rit > 0) && (
                                <div style={{
                                  position: 'absolute',
                                  top: `${-positionOffset}px`,
                                  right: `${-positionOffset}px`,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: `${1 * scaleFactor}px`,
                                  zIndex: 10
                                }}>
                                  {player.mto > 0 && (
                                    <span style={{
                                      background: '#dc2626',
                                      color: '#fff',
                                      fontSize: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                      fontWeight: 700,
                                      padding: `${1 * scaleFactor}px ${2 * scaleFactor}px`,
                                      borderRadius: `${2 * scaleFactor}px`,
                                      whiteSpace: 'nowrap'
                                    }}>MTO{player.mto > 1 ? ` x${player.mto}` : ''}</span>
                                  )}
                                  {player.rit > 0 && (
                                    <span style={{
                                      background: '#f59e0b',
                                      color: '#000',
                                      fontSize: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                      fontWeight: 700,
                                      padding: `${1 * scaleFactor}px ${2 * scaleFactor}px`,
                                      borderRadius: `${2 * scaleFactor}px`,
                                      whiteSpace: 'nowrap'
                                    }}>RIT{player.rit > 1 ? ` x${player.rit}` : ''}</span>
                                  )}
                                </div>
                              )}
                              {/* Captain indicator */}
                              {player.isCaptain && (() => {
                                return <span className="court-player-captain" style={{
                                  bottom: `${-positionOffset}px`,
                                  left: `${-positionOffset}px`,
                                  width: `${positionSize}px`,
                                  height: `${positionSize}px`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                                }}>C</span>
                              })()}

                              {/* Sanction cards indicator */}
                              {sanctions.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset}px`,
                                  zIndex: 10
                                }}>
                                  {hasExpulsion ? (
                                    // Expulsion: overlapping rotated cards
                                    <div style={{ position: 'relative', width: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.02 * scaleFactor}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        left: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        right: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : (
                                    // Other sanctions: separate cards
                                    <div style={{ display: 'flex', gap: `${DESIGN_VMIN * 0.0015 * scaleFactor}px` }}>
                                      {(hasWarning || hasDisqualification) && (
                                        <div className="sanction-card yellow" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                      {(hasPenalty || hasDisqualification) && (
                                        <div className="sanction-card red" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-47 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${21 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {[player.firstName, player.lastName].filter(Boolean).join(' ')}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="court-row" style={{ display: 'none' }}>
                        {rightTeam.playersOnCourt.slice(3, 6).map((player, idx) => {
                          const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                          const currentServe = getCurrentServe()
                          const rightTeamServes = currentServe === rightTeamKey
                          const servingPlayer = getServingPlayer(rightTeamKey, rightTeam)
                          const shouldShowBall = servingPlayer && servingPlayer.number === player.number

                          // Get sanctions for this player
                          const sanctions = getPlayerSanctions(rightTeamKey, player.number)
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')

                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * 0.08 * scaleFactor
                          return (
                            <div
                              key={`${rightTeamKey}-court-back-${player.position}-${player.id || player.number || idx}`}
                              data-court-position={player.position}
                              data-team={rightTeamKey}
                              data-player-number={player.number}
                              className="court-player"
                              style={{
                                width: `${playerSize}px`,
                                height: `${playerSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.06 * scaleFactor}px`,
                                background: rightTeam.color
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballimage}
                                  alt="Volleyball"
                                  style={{
                                    position: 'absolute',
                                    right: `${-ballSize - 12 * scaleFactor}px`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: `${ballSize}px`,
                                    height: `${ballSize}px`,
                                    zIndex: 5
                                  }}
                                />
                              )}

                              <span className="court-player-position" style={{
                                top: `${-positionOffset}px`,
                                left: `${-positionOffset}px`,
                                width: `${positionSize}px`,
                                height: `${positionSize}px`,
                                fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                              }}>{player.position}</span>

                              {/* Sanction cards indicator */}
                              {sanctions.length > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset}px`,
                                  zIndex: 10
                                }}>
                                  {hasExpulsion ? (
                                    // Expulsion: overlapping rotated cards
                                    <div style={{ position: 'relative', width: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.02 * scaleFactor}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        left: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${DESIGN_VMIN * 0.01 * scaleFactor}px`,
                                        height: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                        position: 'absolute',
                                        right: '0',
                                        top: `${DESIGN_VMIN * 0.0015 * scaleFactor}px`,
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : (
                                    // Other sanctions: separate cards
                                    <div style={{ display: 'flex', gap: `${DESIGN_VMIN * 0.0015 * scaleFactor}px` }}>
                                      {(hasWarning || hasDisqualification) && (
                                        <div className="sanction-card yellow" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                      {(hasPenalty || hasDisqualification) && (
                                        <div className="sanction-card red" style={{ width: `${DESIGN_VMIN * 0.013 * scaleFactor}px`, height: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-47 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${21 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    textTransform: 'uppercase',
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {[player.firstName, player.lastName].filter(Boolean).join(' ')}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                    )}

                    {/* 2nd Referee - below court */}
                    {!isCompactMode && (() => {
                      const ref2 = data?.match?.officials?.find(o => o.role === '2nd referee' || o.role === '2nd Referee')
                      const ref2Name = ref2 ? `${ref2.firstName || ''} ${ref2.lastName || ''}`.trim() : null
                      if (!ref2Name) return null
                      return (
                        <span style={{
                          fontSize: isLaptopMode ? '13px' : '16px',
                          color: 'var(--muted)',
                          whiteSpace: 'nowrap',
                          marginTop: '4px'
                        }}>
                          2R: {ref2Name}
                        </span>
                      )
                    })()}
                  </div>
                  {/* END CENTER COLUMN */}

                  {/* RIGHT SERVE INDICATOR - 10% */}
                  <div style={{ flex: '0 0 10%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                    {rightServing && (() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const servingPlayer = getServingPlayer(rightTeamKey, rightTeam)
                      if (!servingPlayer || !servingPlayer.number) {
                        return (
                          <img
                            src={ballImage} onError={(e) => e.target.src = ballimage}
                            alt="Serving team"
                            style={{ ...serveBallBaseStyle, width: '100%', maxWidth: `${DESIGN_VMIN * 0.08 * scaleFactor}px`, height: 'auto', aspectRatio: '1' }}
                          />
                        )
                      }
                      return (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          gap: `${4 * scaleFactor}px`
                        }}>
                          <div style={{
                            fontSize: `${DESIGN_VMIN * 0.022 * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            textTransform: 'uppercase',
                            letterSpacing: `${0.5 * scaleFactor}px`,
                            textAlign: 'center'
                          }}>
                            SERVE
                          </div>
                          <div style={{
                            fontSize: `${DESIGN_VMIN * 0.05 * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            width: '80%',
                            maxWidth: `${DESIGN_VMIN * 0.08 * scaleFactor}px`,
                            aspectRatio: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(34, 197, 94, 0.15)',
                            border: `${2 * scaleFactor}px solid var(--accent)`,
                            borderRadius: `${8 * scaleFactor}px`,
                            boxSizing: 'border-box'
                          }}>
                            {servingPlayer.number}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* RIGHT TEAM TOOLBOX - 15% */}
                  <div style={{
                    flex: '0 0 15%',
                    minWidth: 0,
                    maxWidth: '15%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${6 * scaleFactor}px`,
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: `${8 * scaleFactor}px`,
                    padding: `${6 * scaleFactor}px`,
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}>
                    {/* Team Header - A/B label, team name, country */}
                    {(() => {
                      const currentRightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const rightTeamData = currentRightTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                      const rightTeamColor = rightTeamData?.color || (currentRightTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                      const rightTeamLabel = currentRightTeamKey === teamAKey ? 'A' : 'B'
                      const rightPlayers = leftisTeam1 ? data?.team2Players : data?.team1Players
                      const rightCountry = leftisTeam1 ? data?.match?.team2Country : data?.match?.team1Country
                      // Build team name from player last names
                      const playerNames = (rightPlayers || [])
                        .filter(p => p?.lastName)
                        .map(p => p.lastName)
                        .join(' / ')
                      return (
                        <div style={{
                          width: '100%',
                          background: rightTeamColor,
                          borderRadius: `${6 * scaleFactor}px`,
                          padding: `${8 * scaleFactor}px ${4 * scaleFactor}px`,
                          textAlign: 'center',
                          color: isBrightColor(rightTeamColor) ? '#000' : '#fff'
                        }}>
                          <div style={{ fontSize: `${DESIGN_VMIN * 0.04 * scaleFactor}px`, fontWeight: 700, lineHeight: 1.2 }}>{rightTeamLabel}</div>
                          {playerNames && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px`, lineHeight: 1.2, wordBreak: 'break-word' }}>{playerNames}</div>
                          )}
                          {rightCountry && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 500, marginTop: `${2 * scaleFactor}px`, opacity: 0.9 }}>{rightCountry}</div>
                          )}
                        </div>
                      )
                    })()}
                    {/* Timeout and BMP buttons row */}
                    {(() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const toUsed = timeoutsUsed[rightTeamKey] || 0
                      const isRallyOngoing = rallyStatus !== 'idle'
                      // Gray if rally ongoing, green if available, red if taken
                      let bg, borderColor, textColor
                      if (toUsed >= 1) {
                        // Timeout taken - red
                        bg = 'transparent'
                        borderColor = '#ef4444'
                        textColor = '#ef4444'
                      } else if (isRallyOngoing) {
                        // Rally ongoing - gray
                        bg = 'rgba(156, 163, 175, 0.3)'
                        borderColor = 'rgba(156, 163, 175, 0.5)'
                        textColor = '#9ca3af'
                      } else {
                        // Available - green border/text
                        bg = 'transparent'
                        borderColor = '#22c55e'
                        textColor = '#22c55e'
                      }
                      return (
                        <div style={{ display: 'flex', gap: `${4 * scaleFactor}px`, width: '100%' }}>
                          <button
                            onClick={() => handleTimeout(rightTeamKey)}
                            disabled={isRallyOngoing || toUsed >= 1}
                            style={{
                              flex: 1,
                              height: `${DESIGN_VMIN * 0.045 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                              fontWeight: 700,
                              background: bg,
                              color: textColor,
                              border: `${2 * scaleFactor}px solid ${borderColor}`,
                              borderRadius: `${6 * scaleFactor}px`,
                              cursor: (isRallyOngoing || toUsed >= 1) ? 'not-allowed' : 'pointer',
                              padding: `${6 * scaleFactor}px`
                            }}
                            title="Time-out"
                          >{toUsed >= 1 ? 'TO' : 'TO'}</button>
                          {(() => {
                            const bmpUsed = getUnsuccessfulBMPsUsed(rightTeamKey)
                            const bmpRemaining = 2 - bmpUsed
                            const bmpExhausted = bmpRemaining <= 0
                            // BMP available when rally is ongoing OR just ended (idle), but not during set break etc.
                            const bmpAvailable = !bmpExhausted && data?.set && !data?.set?.finished
                            return (
                              <button
                                onClick={() => handleTeamBMP(rightTeamKey)}
                                disabled={!bmpAvailable}
                                style={{
                                  flex: 1,
                                  height: `${DESIGN_VMIN * 0.045 * scaleFactor}px`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                                  fontWeight: 700,
                                  background: bmpExhausted ? '#ef4444' : (bmpAvailable ? 'transparent' : 'rgba(156, 163, 175, 0.3)'),
                                  color: bmpExhausted ? '#fff' : (bmpAvailable ? '#f97316' : '#9ca3af'),
                                  border: `${2 * scaleFactor}px solid ${bmpExhausted ? '#ef4444' : (bmpAvailable ? '#f97316' : 'rgba(156, 163, 175, 0.5)')}`,
                                  borderRadius: `${6 * scaleFactor}px`,
                                  cursor: bmpAvailable ? 'pointer' : 'not-allowed',
                                  padding: `${6 * scaleFactor}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: `${6 * scaleFactor}px`
                                }}
                                title={`Ball Mark Protocol (${bmpRemaining} remaining)`}
                              >
                                <span>BMP</span>
                                <span style={{
                                  background: bmpExhausted ? '#fff' : '#f97316',
                                  color: bmpExhausted ? '#ef4444' : '#000',
                                  padding: `${2 * scaleFactor}px ${6 * scaleFactor}px`,
                                  borderRadius: `${4 * scaleFactor}px`,
                                  fontSize: `${DESIGN_VMIN * 0.015 * scaleFactor}px`,
                                  fontWeight: 700
                                }}>{bmpRemaining}</span>
                              </button>
                            )
                          })()}
                        </div>
                      )
                    })()}
                    {/* Improper Request - gray, full width - hide if already given */}
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam2' : 'improperRequestteam1'] && (
                      <button
                        onClick={() => handleTeamSanction(leftisTeam1 ? 'team2' : 'team1', 'improper_request')}
                        style={{
                          width: '100%',
                          height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                          fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                          fontWeight: 600,
                          background: 'rgba(156, 163, 175, 0.2)',
                          color: '#9ca3af',
                          border: `${1 * scaleFactor}px solid rgba(156, 163, 175, 0.4)`,
                          borderRadius: `${4 * scaleFactor}px`,
                          cursor: 'pointer',
                          padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box'
                        }}
                        title="Improper Request"
                      >Improper Request</button>
                    )}
                    {/* Delay Warning / Delay Penalty - yellow if DW not given, red if DW already given */}
                    {(() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const hasDelayWarning = data?.match?.sanctions?.[rightTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      if (hasDelayWarning) {
                        // Delay Penalty - red
                        return (
                          <button
                            onClick={() => handleTeamSanction(rightTeamKey, 'delay_penalty')}
                            style={{
                              width: '100%',
                              height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                              fontWeight: 600,
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: `${1 * scaleFactor}px solid rgba(239, 68, 68, 0.4)`,
                              borderRadius: `${4 * scaleFactor}px`,
                              cursor: 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title="Delay Penalty"
                          >Delay Penalty</button>
                        )
                      } else {
                        // Delay Warning - yellow
                        return (
                          <button
                            onClick={() => handleTeamSanction(rightTeamKey, 'delay_warning')}
                            style={{
                              width: '100%',
                              height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`,
                              fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px`,
                              fontWeight: 600,
                              background: 'rgba(234, 179, 8, 0.2)',
                              color: '#eab308',
                              border: `${1 * scaleFactor}px solid rgba(234, 179, 8, 0.4)`,
                              borderRadius: `${4 * scaleFactor}px`,
                              cursor: 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title="Delay Warning"
                          >Delay Warning</button>
                        )
                      }
                    })()}
                    {/* Summary Table */}
                    {(() => {
                      const currentRightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const allSets = (data?.sets || []).sort((a, b) => a.index - b.index)
                      const currentSetIndex = data?.set?.index || 1
                      const setsByIndex = new Map()
                      allSets.forEach(set => {
                        if (set.index <= currentSetIndex) {
                          setsByIndex.set(set.index, set)
                        }
                      })
                      const visibleSets = Array.from(setsByIndex.values()).sort((a, b) => a.index - b.index)

                      return (
                        <div style={{ width: '100%', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, tableLayout: 'fixed' }}>
                            <thead>
                              <tr style={{ borderBottom: `${1 * scaleFactor}px solid rgba(255,255,255,0.2)` }}>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Set</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Points</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>Won</th>
                                <th style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: `${DESIGN_VMIN * 0.016 * scaleFactor}px` }}>TO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleSets.map(set => {
                                const rightPoints = (currentRightTeamKey === 'team1' ? set.team1Points : set.team2Points) ?? 0
                                const leftPoints = (currentRightTeamKey === 'team1' ? set.team2Points : set.team1Points) ?? 0
                                const won = set.finished && rightPoints > leftPoints ? 1 : 0
                                const timeouts = (data?.events || []).filter(e =>
                                  e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentRightTeamKey
                                ).length
                                let rowColor = 'inherit'
                                if (set.finished) {
                                  rowColor = won === 1 ? '#22c55e' : '#ef4444'
                                }
                                return (
                                  <tr key={set.id} style={{ borderBottom: `${1 * scaleFactor}px solid rgba(255,255,255,0.1)`, color: rowColor }}>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{set.index}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{rightPoints}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{won}</td>
                                    <td style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center' }}>{timeouts}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                    {/* Sanction Indicators - show IR, DW, DP if given */}
                    {(() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const hasIR = data?.match?.sanctions?.[rightTeamKey === 'team1' ? 'improperRequestteam1' : 'improperRequestteam2']
                      const hasDW = data?.match?.sanctions?.[rightTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      const delayPenaltyCount = (data?.events || []).filter(e =>
                        e.type === 'sanction' && e.payload?.type === 'delay_penalty' && e.payload?.team === rightTeamKey
                      ).length
                      if (!hasIR && !hasDW && delayPenaltyCount === 0) return null
                      return (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: `${2 * scaleFactor}px`,
                          marginTop: `${4 * scaleFactor}px`,
                          width: '100%'
                        }}>
                          {hasIR && (
                            <div style={{
                              fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                              color: '#9ca3af',
                              textAlign: 'center',
                              padding: `${2 * scaleFactor}px`,
                              background: 'rgba(156, 163, 175, 0.15)',
                              borderRadius: `${3 * scaleFactor}px`
                            }}>
                              Improper Request
                            </div>
                          )}
                          {hasDW && (
                            <div style={{
                              fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                              color: '#eab308',
                              textAlign: 'center',
                              padding: `${2 * scaleFactor}px`,
                              background: 'rgba(234, 179, 8, 0.15)',
                              borderRadius: `${3 * scaleFactor}px`
                            }}>
                              Delay Warning
                            </div>
                          )}
                          {delayPenaltyCount > 0 && (
                            [...Array(delayPenaltyCount)].map((_, i) => (
                              <div key={i} style={{
                                fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                color: '#ef4444',
                                textAlign: 'center',
                                padding: `${2 * scaleFactor}px`,
                                background: 'rgba(239, 68, 68, 0.15)',
                                borderRadius: `${3 * scaleFactor}px`
                              }}>
                                Delay Penalty
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
                {/* END SECTION 2 - Court Row */}
              </>
            )}

            {/* ===== SECTION 3: Rally Controls (100%) ===== */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: `${(isCompactMode ? 80 : 120) * scaleFactor}px`
            }}>
              <div className="rally-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${scaleFactor})`, transformOrigin: 'center center' }}>
                {/* Show timeout countdown if timeout is active */}
                {timeoutModal && timeoutModal.started ? (
                  <div
                    onClick={stopTimeout}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                  >
                    {/* Stop sign icon - left side */}
                    <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                      <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                      <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                    </svg>
                    {/* Countdown content - center */}
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--muted)',
                        textAlign: 'center',
                        marginBottom: '4px'
                      }}>
                        Time-out — {timeoutModal.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')}
                      </div>
                      <div style={{
                        fontSize: '42px',
                        fontWeight: 700,
                        color: timeoutModal.countdown <= 10 ? '#ef4444' : 'var(--accent)',
                        textAlign: 'center',
                        fontFamily: getScoreFont(),
                        lineHeight: 1
                      }}>
                        {formatTimeout(timeoutModal.countdown)}
                      </div>
                      {/* Progress bar */}
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginTop: '8px'
                      }}>
                        <div style={{
                          width: `${(timeoutModal.countdown / 60) * 100}%`,
                          height: '100%',
                          background: timeoutModal.countdown <= 10 ? '#ef4444' : 'var(--accent)',
                          borderRadius: '3px',
                          transition: 'width 1s linear, background 0.3s',
                          marginLeft: 'auto'
                        }} />
                      </div>
                    </div>
                    {/* Stop sign icon - right side */}
                    <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                      <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                      <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                    </svg>
                  </div>
                ) : (
                  <>
                    {rallyStatus === 'idle' ? (
                      // Show countdown + End Set Interval during interval, or Start Set/Rally button otherwise
                      (() => {
                        const setupConfirmed = betweenSetsSetupConfirmed || (data?.set?.index === 3 && set3SetupConfirmed)
                        const intervalEnded = !betweenSetsCountdown || betweenSetsCountdown.countdown <= 0
                        const showIntervalControls = isBetweenSets && isFirstRally && setupConfirmed && !intervalEnded

                        if (showIntervalControls) {
                          // Show countdown in clickable box
                          return (
                            <div
                              onClick={endSetInterval}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                            >
                              {/* Stop sign icon - left side */}
                              <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                                <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                                <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                              </svg>
                              {/* Countdown content - center */}
                              <div style={{ flex: 1, minWidth: '140px' }}>
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  color: 'var(--muted)',
                                  textAlign: 'center',
                                  marginBottom: '4px'
                                }}>
                                  {t('scoreboard.buttons.setInterval', 'Set Interval')}
                                </div>
                                <div style={{
                                  fontSize: '36px',
                                  fontWeight: 700,
                                  color: betweenSetsCountdown.countdown <= 30 ? '#ef4444' : 'var(--accent)',
                                  fontFamily: getScoreFont(),
                                  textAlign: 'center',
                                  lineHeight: 1
                                }}>
                                  {formatCountdown(betweenSetsCountdown.countdown)}
                                </div>
                                {/* Progress bar */}
                                <div style={{
                                  width: '100%',
                                  height: '6px',
                                  background: 'rgba(255, 255, 255, 0.15)',
                                  borderRadius: '3px',
                                  overflow: 'hidden',
                                  marginTop: '8px'
                                }}>
                                  <div style={{
                                    width: `${(betweenSetsCountdown.countdown / setIntervalDuration) * 100}%`,
                                    height: '100%',
                                    background: betweenSetsCountdown.countdown <= 30 ? '#ef4444' : 'var(--accent)',
                                    borderRadius: '3px',
                                    transition: 'width 1s linear, background 0.3s',
                                    marginLeft: 'auto'
                                  }} />
                                </div>
                              </div>
                              {/* Stop sign icon - right side */}
                              <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                                <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                                <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                              </svg>
                            </div>
                          )
                        }

                        // Normal case: show Start Set or Start Rally button
                        // But show Confirm button if setup not confirmed yet
                        if (isBetweenSets && isFirstRally && !setupConfirmed) {
                          return (
                            <button
                              onClick={data?.set?.index === 3 ? () => confirmSet3SideService(data?.match?.set3LeftTeam || 'A', data?.match?.set3FirstServe || 'A', true) : confirmBetweenSetsSetup}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '14px 32px',
                                fontSize: '18px',
                                fontWeight: 700,
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              ✓ Confirm
                            </button>
                          )
                        }

                        return (
                          <button
                            className="secondary start-rally-button"
                            onClick={handleStartRally}
                            disabled={isFirstRally && (!leftTeamLineupSet || !rightTeamLineupSet)}
                          >
                            {isFirstRally ? t('scoreboard.buttons.startSet') : t('scoreboard.buttons.startRally')}
                          </button>
                        )
                      })()
                    ) : (
                      <>
                        <div className="rally-controls-row" style={{ gap: '5px' }}>
                          <button className="rally-point-button" onClick={() => handlePoint('left')}>
                            {t('scoreboard.buttons.pointTeam', { team: teamALabel })}
                          </button>
                          <button className="rally-point-button" onClick={() => handlePoint('right')}>
                            {t('scoreboard.buttons.pointTeam', { team: teamBLabel })}
                          </button>
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {rallyStatus === 'in_play' && (
                        <button
                          className="secondary"
                          onClick={handleReplay}
                          style={{ flex: 1 }}
                        >
                          {t('scoreboard.buttons.replay')}
                        </button>
                      )}
                      {rallyStatus === 'idle' && canReplayRally && (
                        <button
                          onClick={handleReplay}
                          style={{
                            flex: 1,
                            background: '#eab308',
                            color: '#000',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {t('scoreboard.buttons.decisionChange')}
                        </button>
                      )}
                      {rallyStatus !== 'idle' && (
                        <button
                          onClick={handleRefereeBMP}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            color: '#f97316',
                            border: '2px solid #f97316',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title="Referee Ball Mark Protocol"
                        >
                          Referee
                          BMP
                        </button>
                      )}
                      <button
                        className="danger"
                        onClick={showUndoConfirm}
                        disabled={!canUndo}
                        style={{
                          flex: (rallyStatus !== 'idle' || canReplayRally) ? 1 : 'none',
                          padding: '8px 12px',
                          fontSize: '13px',
                          fontWeight: 600
                        }}
                      >
                        {t('scoreboard.buttons.undo')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'none' }}>
            <div className="team-info" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: isCompactMode ? '4px 8px' : '6px 12px',
                  background: rightTeam.color || '#3b82f6',
                  color: isBrightColor(rightTeam.color || '#3b82f6') ? '#000' : '#fff',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: isCompactMode ? '11px' : '14px',
                  marginBottom: '8px',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
              >
                <span style={{ flexShrink: 0 }}>{teamBLabel}</span>
                <span style={{ flexShrink: 0 }}>-</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: isNarrowMode ? '30px' : '40px' }}>{teamBShortName}</span>
                {(isCompactMode || headerCollapsed) && (
                  <span style={{
                    marginLeft: '4px',
                    padding: '2px 6px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {setsWon.right}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: (isCompactMode || isShortHeight) ? '4px' : '8px' }}>
              <div
                onClick={() => {
                  // Clicking calls timeout if available
                  const canCallTimeout = getTimeoutsUsed('right') < 2 && rallyStatus !== 'in_play' && !isRallyReplayed
                  if (canCallTimeout) {
                    handleTimeout('right')
                  }
                }}
                className="to-sub-counter"
                style={{
                  flex: 1,
                  background: getTimeoutsUsed('right') >= 2
                    ? 'rgba(239, 68, 68, 0.2)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(34, 197, 94, 0.2)'),
                  borderRadius: (isCompactMode || isShortHeight) ? '4px' : '8px',
                  padding: (isCompactMode || isShortHeight) ? '4px' : '12px',
                  textAlign: 'center',
                  border: getTimeoutsUsed('right') >= 2
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(34, 197, 94, 0.4)'),
                  cursor: getTimeoutsUsed('right') >= 2 || rallyStatus === 'in_play' || isRallyReplayed ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="to-sub-label" style={{ fontSize: (isCompactMode || isShortHeight) ? '8px' : '11px', color: 'var(--muted)', marginBottom: (isCompactMode || isShortHeight) ? '1px' : '4px' }}>{t('scoreboard.labels.to')}</div>
                <div className="to-sub-value" style={{
                  fontSize: (isCompactMode || isShortHeight) ? '14px' : '24px',
                  fontWeight: 700,
                  color: getTimeoutsUsed('right') >= 2 ? '#ef4444' : (!(rallyStatus === 'in_play' || isRallyReplayed) ? '#22c55e' : 'inherit')
                }}>{getTimeoutsUsed('right')}</div>
              </div>
            </div>

            {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
            {isNarrowMode ? (
              <div style={{ marginTop: '4px' }}>
                <button
                  onClick={() => setRightDelaysDropdownOpen(!rightDelaysDropdownOpen)}
                  style={{ width: '100%', fontSize: '10px', padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {t('scoreboard.sanctions.irAndDelays')} {rightDelaysDropdownOpen ? '▲' : '▼'}
                </button>
                {rightDelaysDropdownOpen && (
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam2' : 'improperRequestteam1'] && (
                      <button
                        onClick={() => { handleImproperRequest('right'); setRightDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.improper}
                      >
                        {t('scoreboard.sanctions.improperRequest')}
                      </button>
                    )}
                    {!data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam2' : 'delayWarningteam1'] ? (
                      <button
                        onClick={() => { handleDelayWarning('right'); setRightDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.delayWarning}
                      >
                        {t('scoreboard.sanctions.delayWarning')}
                      </button>
                    ) : (
                      <button
                        onClick={() => { handleDelayPenalty('right'); setRightDelaysDropdownOpen(false) }}
                        disabled={rallyStatus === 'in_play'}
                        style={sanctionButtonStyles.delayPenalty}
                      >
                        {t('scoreboard.sanctions.delayPenalty')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {!data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam2' : 'improperRequestteam1'] && (
                  <button
                    onClick={() => handleImproperRequest('right')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.improper}
                  >
                    {t('scoreboard.sanctions.improperRequest')}
                  </button>
                )}
                {!data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam2' : 'delayWarningteam1'] ? (
                  <button
                    onClick={() => handleDelayWarning('right')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.delayWarning}
                  >
                    {t('scoreboard.sanctions.delayWarning')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelayPenalty('right')}
                    disabled={rallyStatus === 'in_play'}
                    style={sanctionButtonStyles.delayPenalty}
                  >
                    {t('scoreboard.sanctions.delayPenalty')}
                  </button>
                )}
              </div>
            )}

            {/* Status boxes for team sanctions */}
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data?.match?.sanctions?.[leftisTeam1 ? 'improperRequestteam2' : 'improperRequestteam1'] && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(156, 163, 175, 0.15)',
                  border: '1px solid rgba(156, 163, 175, 0.3)',
                  borderRadius: '4px',
                  color: '#d1d5db'
                }}>
                  {t('scoreboard.sanctions.sanctionedImproperRequest')}
                </div>
              )}
              {data?.match?.sanctions?.[leftisTeam1 ? 'delayWarningteam2' : 'delayWarningteam1'] && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '4px',
                  color: '#facc15'
                }}>
                  {t('scoreboard.sanctions.sanctionedDelayWarning')}
                </div>
              )}
              {teamHasFormalWarning(leftisTeam1 ? 'team2' : 'team1') && (
                <div style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: 'rgba(250, 204, 21, 0.15)',
                  border: '1px solid rgba(250, 204, 21, 0.3)',
                  borderRadius: '4px',
                  color: '#fde047'
                }}>
                  {t('scoreboard.sanctions.sanctionedFormalWarning')} 🟨
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Menu Modal - Keep for Options submenu */}
      {menuModal && (
        <Modal
          title={t('scoreboard.menu.menu')}
          open={true}
          onClose={() => setMenuModal(false)}
          width={400}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowLogs(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showActionLog', 'Show Action Log')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowSanctions(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showSanctionsResults', 'Show Sanctions and Results')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowManualPanel(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.manualChanges', 'Manual Changes')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowRemarks(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.openRemarksRecording', 'Open Remarks Recording')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowRosters(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.showRosters')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowPinsModal(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showPins', 'Show PINs')}
              </div>
              {onOpenMatchSetup && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                  onClick={() => {
                    onOpenMatchSetup()
                    setMenuModal(false)
                  }}>
                  {t('scoreboard.menu.showMatchSetup', 'Show Match Setup')}
                </div>
              )}

              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={async () => {
                  try {
                    // Export all database data
                    const allMatches = await db.matches.toArray()
                    const allTeams = await db.teams.toArray()
                    const allPlayers = await db.players.toArray()
                    const allSets = await db.sets.toArray()
                    const allEvents = await db.events.toArray()
                    const allReferees = await db.referees.toArray()
                    const allScorers = await db.scorers.toArray()

                    const exportData = {
                      exportDate: new Date().toISOString(),
                      matchId: matchId,
                      matches: allMatches,
                      teams: allTeams,
                      players: allPlayers,
                      sets: allSets,
                      events: allEvents,
                      referees: allReferees,
                      scorers: allScorers
                    }

                    // Create a blob and download
                    const jsonString = JSON.stringify(exportData, null, 2)
                    const blob = new Blob([jsonString], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `database_export_${matchId}_${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(url)

                    setMenuModal(false)
                  } catch (error) {
                    console.error('Error exporting database:', error)
                    showAlert(t('scoreboard.errors.exportFailed'), 'error')
                  }
                }}>
                📥 {t('scoreboard.menu.downloadGameData', 'Download Game Data (JSON)')}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
                onClick={() => {
                  setShowOptionsInMenu(true)
                }}>
                ⚙️ {t('scoreboard.menu.options', 'Options')}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Show PINs Modal */}
      {showPinsModal && (
        <Modal
          title={t('scoreboard.menu.gamePins')}
          open={true}
          onClose={() => setShowPinsModal(false)}
          width={500}
        >
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Referee PIN */}
              {data?.match?.refereePin && data?.match?.refereeConnectionEnabled === true && (
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  width: '100%'
                }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '16px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    minWidth: 0
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Referee PIN</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                      {String(data.match.refereePin).padStart(6, '0')}
                    </div>
                  </div>
                </div>
              )}

              {/* Game PIN */}
              {data?.match?.gamePin && (
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  width: '100%'
                }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '16px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    minWidth: 0
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Game PIN</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                      {String(data.match.gamePin).padStart(6, '0')}
                    </div>
                  </div>
                </div>
              )}

              {/* Team Dashboard PINs - Same row (50/50) */}
              {((data?.match?.team1TeamPin && data?.match?.team1TeamConnectionEnabled === true) ||
                (data?.match?.team2TeamPin && data?.match?.team2TeamConnectionEnabled === true)) && (
                  <div style={{
                    display: 'flex',
                    gap: '16px',
                    width: '100%'
                  }}>
                    {data?.match?.team1TeamPin && data?.match?.team1TeamConnectionEnabled === true && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '16px',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        minWidth: 0
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                          {data?.team1Team?.name || 'Team 1'} PIN
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                          {String(data.match.team1TeamPin).padStart(6, '0')}
                        </div>
                      </div>
                    )}

                    {data?.match?.team2TeamPin && data?.match?.team2TeamConnectionEnabled === true && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '16px',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        minWidth: 0
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                          {data?.team2Team?.name || 'Team 2'} PIN
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                          {String(data.match.team2TeamPin).padStart(6, '0')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </Modal>
      )}


      {/* Options in Menu Modal */}
      <ScoreboardOptionsModal
        open={showOptionsInMenu}
        onClose={() => setShowOptionsInMenu(false)}

        onOpenKeybindings={() => {
          setShowOptionsInMenu(false)
          setKeybindingsModalOpen(true)
        }}
        onOpenConnectionSetup={() => setConnectionSetupModal(true)}
        server={{
          isAvailable: typeof window !== 'undefined' && Boolean(window.electronAPI?.server),
          serverRunning,
          serverStatus,
          serverLoading,
          onStartServer: handleStartServer,
          onStopServer: handleStopServer
        }}
        matchOptions={{
          checkAccidentalRallyStart,
          setCheckAccidentalRallyStart,
          accidentalRallyStartDuration,
          setAccidentalRallyStartDuration,
          checkAccidentalPointAward,
          setCheckAccidentalPointAward,
          accidentalPointAwardDuration,
          setAccidentalPointAwardDuration,
          setIntervalDuration,
          setSetIntervalDuration,
          scoreFont,
          setScoreFont,
          keybindingsEnabled,
          setKeybindingsEnabled
        }}
        displayOptions={{
          showNamesOnCourt,
          setShowNamesOnCourt,
          autoDownloadAtSetEnd,
          setAutoDownloadAtSetEnd
        }}
        matchId={matchId}
      />

      {/* Scoreboard Guide Modal */}


      {/* Connection Setup Modal */}
      <ConnectionSetupModal
        open={connectionSetupModal}
        onClose={() => setConnectionSetupModal(false)}
        matchId={matchId}
        refereePin={data?.match?.refereePin}
        gameNumber={data?.match?.gameNumber}
      />

      {/* Help & Video Guides Modal */}
      {showHelpModal && (
        <Modal
          title={t('scoreboard.menu.helpVideoGuides')}
          open={true}
          onClose={() => {
            setShowHelpModal(false)
            setSelectedHelpTopic(null)
          }}
          width={800}
        >
          <div style={{ padding: '24px' }}>
            {!selectedHelpTopic ? (
              <div>
                <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--muted)' }}>
                  Select a topic to view video guides and explanations:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                  {[
                    { id: 'recording-points', title: 'Recording Points', description: 'How to record points and update the score' },
                    { id: 'timeouts', title: 'Timeouts', description: 'How to request and manage timeouts' },
                    { id: 'sanctions', title: 'Sanctions', description: 'How to record warnings, penalties, and expulsions' },
                    { id: 'ending-set', title: 'Ending a Set', description: 'What happens when you end a set' },
                    { id: 'match-end', title: 'Match End', description: 'What happens when the match ends' },
                    { id: 'undo', title: 'Undo Actions', description: 'How to undo mistakes' },
                    { id: 'lineup', title: 'Setting Lineup', description: 'How to set initial lineup' },
                    { id: 'set-5', title: 'Set 3 (Tie-break)', description: 'Special rules for the deciding set' }
                  ].map((topic) => (
                    <div
                      key={topic.id}
                      onClick={() => setSelectedHelpTopic(topic.id)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                        {topic.title}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                        {topic.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setSelectedHelpTopic(null)}
                  style={{
                    marginBottom: '20px',
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'var(--text)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  ← Back to Topics
                </button>
                {getHelpContent(selectedHelpTopic)}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Action Log Modal */}
      {showLogs && (
        <Modal
          title={t('scoreboard.menu.actionLog')}
          open={true}
          onClose={() => setShowLogs(false)}
          width={1200}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search events..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  width: '100%'
                }}
              />
            </div>
            {(() => {
              if (!data?.events || data.events.length === 0) {
                return <p>No events recorded yet.</p>
              }

              // Helper function to get set number (before set 1 is set 1, between sets is the next set)
              const getSetNumber = (event) => {
                const eventSetIndex = event.setIndex || 1
                if (eventSetIndex >= 1) return eventSetIndex
                // If setIndex is 0 or undefined, check if we're before set 1
                const allSets = data.sets || []
                const firstSet = allSets.find(s => s.index === 1)
                if (!firstSet) return 1
                // Check if event is before first set start
                const eventTime = typeof event.ts === 'number' ? event.ts : new Date(event.ts).getTime()
                const firstSetStart = firstSet.startTime ? new Date(firstSet.startTime).getTime() : 0
                if (eventTime < firstSetStart) return 1
                // Between sets - find the next set
                const sortedSets = [...allSets].sort((a, b) => a.index - b.index)
                for (let i = 0; i < sortedSets.length - 1; i++) {
                  const currentSet = sortedSets[i]
                  const nextSet = sortedSets[i + 1]
                  const currentEnd = currentSet.endTime ? new Date(currentSet.endTime).getTime() : 0
                  const nextStart = nextSet.startTime ? new Date(nextSet.startTime).getTime() : Infinity
                  if (eventTime >= currentEnd && eventTime < nextStart) {
                    return nextSet.index
                  }
                }
                return eventSetIndex || 1
              }

              // Helper function to get event type for Type column
              const getEventType = (event) => {
                switch (event.type) {
                  case 'point': return 'Point'
                  case 'timeout': return 'Timeout'
                  case 'substitution': return event.payload?.isExceptional ? 'Exc. Sub' : 'Substitution'
                  case 'set_start': return 'Set Start'
                  case 'set_end': return 'Set End'
                  case 'rally_start': return 'Rally'
                  case 'replay': return 'Replay'
                  case 'decision_change': return 'Decision'
                  case 'coin_toss': return 'Coin Toss'
                  case 'lineup': return event.payload?.isInitial ? 'Lineup' : 'Lineup Chg'
                  case 'sanction': {
                    const sanctionType = event.payload?.sanctionType
                    if (sanctionType === 'warning') return 'Warning'
                    if (sanctionType === 'penalty') return 'Penalty'
                    if (sanctionType === 'expulsion') return 'Expulsion'
                    if (sanctionType === 'disqualification') return 'Disqualif.'
                    return 'Sanction'
                  }
                  case 'remark': return 'Remark'
                  default: return event.type || 'Unknown'
                }
              }

              // Helper function to get score at time of event
              // Set 1, 3: A:B always
              // Set 2, 4: B:A always
              // Set 3: depends on which side Team A is on (switches at 8 points)
              const getScoreAtEvent = (event) => {
                const setIdx = event.setIndex || 1
                const setEvents = data.events?.filter(e => (e.setIndex || 1) === setIdx) || []
                const eventIndex = setEvents.findIndex(e => e.id === event.id)

                let team1Score = 0
                let team2Score = 0
                // Count points up to and including this event
                for (let i = 0; i <= eventIndex; i++) {
                  const e = setEvents[i]
                  if (e.type === 'point') {
                    if (e.payload?.team === 'team1') team1Score++
                    else if (e.payload?.team === 'team2') team2Score++
                  }
                }

                // Get Team A (coin toss winner) key
                const coinTossTeamA = data?.match?.coinTossTeamA || 'team1'
                const scoreA = coinTossTeamA === 'team1' ? team1Score : team2Score
                const scoreB = coinTossTeamA === 'team1' ? team2Score : team1Score

                // Determine display order based on set number
                // Set 1, 3: A:B (Team A on left)
                // Set 2, 4: B:A (Team B on left)
                // Set 3: Depends on initial side from coin toss and switches at 8 points
                if (setIdx === 1 || setIdx === 3) {
                  // A:B always
                  return `${scoreA}:${scoreB}`
                } else if (setIdx === 2 || setIdx === 4) {
                  // B:A always
                  return `${scoreB}:${scoreA}`
                } else if (setIdx === 3) {
                  // Set 3: check if we've switched sides (at 8 points)
                  const totalPoints = team1Score + team2Score
                  const hasSwitched = totalPoints >= 8

                  // In set 3, Team A starts on same side as set 1 (left), so A:B initially
                  // After switch, it becomes B:A
                  if (hasSwitched) {
                    return `${scoreB}:${scoreA}`
                  } else {
                    return `${scoreA}:${scoreB}`
                  }
                }

                // Default to A:B
                return `${scoreA}:${scoreB}`
              }

              // Helper function to get simplified action description
              const getSimplifiedAction = (event) => {
                const coinTossTeamA = data?.match?.coinTossTeamA || 'team1'
                // Get team short name for the event's team
                const getTeamShortName = (teamKey) => {
                  if (!teamKey) return ''
                  if (teamKey === 'team1') {
                    return data?.team1Team?.shortName || data?.team1Team?.name || 'team1'
                  } else {
                    return data?.team2Team?.shortName || data?.team2Team?.name || 'team2'
                  }
                }
                const teamShortName = event.payload?.team ? getTeamShortName(event.payload.team) : ''

                switch (event.type) {
                  case 'point': {
                    const setIdx = event.setIndex || 1
                    const setEvents = data.events?.filter(e => (e.setIndex || 1) === setIdx) || []
                    const eventIndex = setEvents.findIndex(e => e.id === event.id)
                    let team1Score = 0, team2Score = 0
                    for (let i = 0; i <= eventIndex; i++) {
                      const e = setEvents[i]
                      if (e.type === 'point') {
                        if (e.payload?.team === 'team1') team1Score++
                        else if (e.payload?.team === 'team2') team2Score++
                      }
                    }
                    const scoreA = coinTossTeamA === 'team1' ? team1Score : team2Score
                    const scoreB = coinTossTeamA === 'team1' ? team2Score : team1Score
                    return `${teamShortName} (A ${scoreA}:${scoreB} B)`
                  }
                  case 'timeout':
                    return `${teamShortName} timeout`
                  case 'substitution': {
                    const playerOut = event.payload?.playerOut || '?'
                    const playerIn = event.payload?.playerIn || '?'
                    return `${teamShortName} OUT:${playerOut} IN:${playerIn}`
                  }
                  case 'set_start':
                    return `Set ${event.setIndex || event.payload?.setIndex || '?'} started`
                  case 'set_end': {
                    const winner = event.payload?.teamLabel || '?'
                    return `Set ${event.setIndex || '?'} won by ${winner}`
                  }
                  case 'rally_start':
                    return 'Rally started'
                  case 'replay':
                    return 'Rally replayed'
                  case 'decision_change': {
                    const fromName = getTeamShortName(event.payload?.fromTeam)
                    const toName = getTeamShortName(event.payload?.toTeam)
                    return `Point ${fromName}→${toName}`
                  }
                  case 'coin_toss':
                    return `First serve: ${event.payload?.firstServe === event.payload?.teamA ? 'A' : 'B'}`
                  case 'lineup':
                    return event.payload?.isInitial ? `${teamShortName} lineup set` : `${teamShortName} lineup changed`
                  case 'sanction': {
                    const sanctionType = event.payload?.sanctionType || 'sanction'
                    const playerNum = event.payload?.playerNumber
                    const role = event.payload?.role
                    const target = playerNum ? `#${playerNum}` : (role || 'team')
                    return `${teamShortName} ${sanctionType} ${target}`
                  }
                  case 'remark':
                    return event.payload?.text || 'Remark added'
                  default:
                    return event.type || 'Unknown'
                }
              }

              // Helper function to get team label
              const getTeamLabel = (event) => {
                const team = event.payload?.team
                if (team === 'team1' || team === 'team2') {
                  const teamKey = team === 'team1' ? teamAKey : teamBKey
                  return teamKey === teamAKey ? 'A' : 'B'
                }
                if (event.type === 'set_start' || event.type === 'set_end' || event.type === 'rally_start' || event.type === 'replay') {
                  return 'GAME'
                }
                if (event.type === 'remark') {
                  return 'GAME'
                }
                if (event.type === 'sanction' && event.payload?.role) {
                  return 'REF'
                }
                return 'GAME'
              }

              // Helper function to get participant
              const getParticipant = (event) => {
                const team = event.payload?.team
                const playerNumber = event.payload?.playerNumber
                const role = event.payload?.role
                const playerType = event.payload?.playerType

                if (event.type === 'set_start' || event.type === 'set_end' || event.type === 'rally_start' || event.type === 'replay') {
                  return 'GAME'
                }

                if (event.type === 'remark') {
                  return 'GAME'
                }


                // Sanction events with player number
                if (playerNumber !== undefined && playerNumber !== null) {
                  return String(playerNumber)
                }


                // Default to team
                if (team === 'team1' || team === 'team2') {
                  const teamKey = team === 'team1' ? teamAKey : teamBKey
                  return teamKey === teamAKey ? 'A' : 'B'
                }

                return 'GAME'
              }

              // Sort events by seq descending (most recent first)
              const sortedEvents = [...data.events].sort((a, b) => {
                const aSeq = a.seq || 0
                const bSeq = b.seq || 0
                if (aSeq !== 0 || bSeq !== 0) {
                  return bSeq - aSeq // Descending
                }
                const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
                const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
                return bTime - aTime // Descending
              })

              // Filter events
              const filteredEvents = sortedEvents.filter(event => {
                if (logSearchQuery.trim() === '') return true
                const searchLower = logSearchQuery.toLowerCase()
                const eventType = getEventType(event) || ''
                const simplifiedAction = getSimplifiedAction(event) || ''
                const setIndex = String(getSetNumber(event))
                const teamLabel = getTeamLabel(event)
                const participant = getParticipant(event)
                return eventType.toLowerCase().includes(searchLower) ||
                  simplifiedAction.toLowerCase().includes(searchLower) ||
                  setIndex.includes(searchLower) ||
                  teamLabel.toLowerCase().includes(searchLower) ||
                  participant.toLowerCase().includes(searchLower)
              })

              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    userSelect: 'text'
                  }}>
                    <thead>
                      <tr style={{
                        borderBottom: '2px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.05)'
                      }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>ID</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Time</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>Team</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Participant</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>Set</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>Score</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Type</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
                            No events found
                          </td>
                        </tr>
                      ) : (
                        filteredEvents
                          .filter(event => {
                            // Filter out sub-events (decimals) - only show main actions (integers)
                            const seq = event.seq || 0
                            return seq === Math.floor(seq) // Only show if it's an integer (no decimal part)
                          })
                          .map(event => {
                            const eventType = getEventType(event)
                            const simplifiedAction = getSimplifiedAction(event)
                            if (!eventType || eventType === 'Unknown') return null

                            const actionId = Math.floor(event.seq || 0) // Show only base integer ID
                            const eventTime = typeof event.ts === 'number' ? new Date(event.ts) : new Date(event.ts)
                            const timeStr = `${String(eventTime.getUTCHours()).padStart(2, '0')}:${String(eventTime.getUTCMinutes()).padStart(2, '0')}:${String(eventTime.getUTCSeconds()).padStart(2, '0')}`
                            const setNum = getSetNumber(event)
                            const score = getScoreAtEvent(event)
                            const team = getTeamLabel(event)
                            const participant = getParticipant(event)

                            return (
                              <tr
                                key={event.id}
                                style={{
                                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                                  transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                  {actionId}
                                </td>
                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                  {timeStr}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {team}
                                </td>
                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                  {participant}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  {setNum}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {score}
                                </td>
                                <td style={{ padding: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  {eventType}
                                </td>
                                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                                  {simplifiedAction}
                                </td>
                              </tr>
                            )
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Manual Changes Modal */}
      {showManualPanel && (
        <Modal
          title={t('scoreboard.menu.manualChanges')}
          open={true}
          onClose={() => setShowManualPanel(false)}
          width={650}
        >
          <div style={{ padding: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
            {/* Collapsible Section: Current Set */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, currentSet: !prev.currentSet }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  Current Set
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.currentSet ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.currentSet && (
                <div style={{ padding: '0 16px 16px 16px' }}>
                  {data?.match && (() => {
                    // Calculate which team is on which side based on set index and overrides
                    const currentSetIndex = data.set?.index || 1
                    const setLeftTeamOverrides = data.match?.setLeftTeamOverrides || {}
                    const is3rdSet = currentSetIndex === 3
                    const set3LeftTeam = data.match?.set3LeftTeam

                    let sideA // 'left' or 'right' for Team A
                    if (setLeftTeamOverrides[currentSetIndex] !== undefined) {
                      // Override stores 'A' or 'B' (not 'team1'/'team2')
                      sideA = setLeftTeamOverrides[currentSetIndex] === 'A' ? 'left' : 'right'
                    } else if (is3rdSet && set3LeftTeam) {
                      // set3LeftTeam stores 'A' or 'B'
                      sideA = set3LeftTeam === 'A' ? 'left' : 'right'
                    } else {
                      // Default alternating pattern: odd sets = A on left, even sets = A on right
                      sideA = currentSetIndex % 2 === 1 ? 'left' : 'right'
                    }

                    // If Team A is on left, and Team A is team1, then team1 is on left
                    const leftisTeam1 = sideA === 'left' ? (teamAKey === 'team1') : (teamAKey !== 'team1')
                    const rightIsTeam1 = !leftisTeam1

                    // Determine current serving team
                    const servingTeam = data.match.firstServe || 'team1'
                    const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                    const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                    const leftTeamName = leftisTeam1 ? (data.team1Team?.shortName || data.team1Team?.name || 'team1') : (data.team2Team?.shortName || data.team2Team?.name || 'team2')
                    const rightTeamName = leftisTeam1 ? (data.team2Team?.shortName || data.team2Team?.name || 'team2') : (data.team1Team?.shortName || data.team1Team?.name || 'team1')
                    const leftTeamColor = leftisTeam1 ? (data.team1Team?.color || '#3b82f6') : (data.team2Team?.color || '#ef4444')
                    const rightTeamColor = leftisTeam1 ? (data.team2Team?.color || '#ef4444') : (data.team1Team?.color || '#3b82f6')
                    const leftIsServing = servingTeam === leftTeamKey
                    const rightIsServing = servingTeam === rightTeamKey

                    return (
                      <>
                        <div
                          className="manual-item"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            paddingBottom: '16px',
                            borderBottom: '1px solid rgba(255,255,255,0.08)'
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Teams Setup</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                            Current court positions and serving team
                          </div>

                          {/* Visual Court Representation */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '16px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.08)'
                          }}>
                            {/* Left Team */}
                            <div style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '12px',
                              background: leftTeamColor,
                              borderRadius: '8px',
                              color: isBrightColor(leftTeamColor) ? '#000' : '#fff'
                            }}>
                              {leftIsServing && <span style={{ fontSize: '20px' }}>🏐</span>}
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{leftTeamName}</div>
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>{leftisTeam1 ? 'Team 1' : 'Team 2'}</div>
                              </div>
                            </div>

                            {/* Net divider */}
                            <div style={{
                              width: '4px',
                              height: '60px',
                              background: 'rgba(255,255,255,0.3)',
                              borderRadius: '2px'
                            }} />

                            {/* Right Team */}
                            <div style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '12px',
                              background: rightTeamColor,
                              borderRadius: '8px',
                              color: isBrightColor(rightTeamColor) ? '#000' : '#fff'
                            }}>
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{rightTeamName}</div>
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>{rightIsTeam1 ? 'TEAM 1' : 'TEAM 2'}</div>
                              </div>
                              {rightIsServing && <span style={{ fontSize: '20px' }}>🏐</span>}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              className="secondary"
                              onClick={async () => {
                                // For sets 1-2, update the override for current set
                                const setIdx = data.set?.index || 1

                                const getTeamLabel = (ab) => ab === 'A' ? (teamAKey === 'team1' ? 'team1' : 'team2') : (teamAKey === 'team1' ? 'team2' : 'team1')

                                if (setIdx === 3) {
                                  const automatic5 = teamAKey === 'team1' ? 'A' : 'B'
                                  const currentLeftTeam = data.match.set3LeftTeam || automatic5
                                  const newLeftTeam = currentLeftTeam === 'A' ? 'B' : 'A'
                                  const oldLeft = getTeamLabel(currentLeftTeam)
                                  const newLeft = getTeamLabel(newLeftTeam)
                                  await db.matches.update(matchId, { set3LeftTeam: newLeftTeam })
                                  // Sync to Supabase
                                  if (data.match?.seed_key) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, set3LeftTeam: newLeftTeam },
                                      createdAt: new Date().toISOString()
                                    })
                                  }
                                  logManualChange('Teams Setup', 'Court Sides', `${oldLeft} on left`, `${newLeft} on left`, `Switched court sides (Set 3)`)
                                  // Sync updated side to Supabase live state
                                  syncLiveStateToSupabase('manual_side_change', null, { oldSide: oldLeft, newSide: newLeft })
                                } else {
                                  // Sets 1-4: Swap coinTossTeamA (A ALWAYS on left in Set 1)
                                  // Swapping which team is "A" effectively swaps the teams on court
                                  const currentTeamA = data.match.coinTossTeamA || 'team1'
                                  const newTeamA = currentTeamA === 'team1' ? 'team2' : 'team1'
                                  const newTeamB = newTeamA === 'team1' ? 'team2' : 'team1'
                                  const oldLeft = leftisTeam1 ? 'team1' : 'team2'
                                  const newLeft = leftisTeam1 ? 'team2' : 'team1'

                                  // Update local IndexedDB
                                  await db.matches.update(matchId, { coinTossTeamA: newTeamA })

                                  // Sync coin_toss JSONB to Supabase
                                  if (data.match?.seed_key) {
                                    const currentServeA = data.match.coinTossServeA ?? true
                                    const firstServeTeam = currentServeA ? newTeamA : newTeamB
                                    await db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: {
                                        id: data.match.seed_key,
                                        coin_toss: {
                                          team_a: newTeamA,
                                          team_b: newTeamB,
                                          serve_a: currentServeA,
                                          confirmed: true,
                                          first_serve: firstServeTeam
                                        }
                                      },
                                      createdAt: new Date().toISOString()
                                    })
                                  }

                                  logManualChange('Teams Setup', 'Court Sides', `${oldLeft} on left`, `${newLeft} on left`, `Switched court sides (Set ${setIdx})`)
                                  // Sync updated side to Supabase live state
                                  syncLiveStateToSupabase('manual_side_change', null, { oldSide: oldLeft, newSide: newLeft })
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              ↔️ Switch Sides
                            </button>
                            <button
                              className="secondary"
                              onClick={async () => {
                                const oldServing = servingTeam === 'team1' ? 'team1' : 'team2'
                                const newServe = servingTeam === 'team1' ? 'team2' : 'team1'
                                const newServing = newServe === 'team1' ? 'team1' : 'team2'

                                if (data.set?.index === 5) {
                                  const currentSet5Serve = data.match.set3FirstServe || 'A'
                                  const newSet5Serve = currentSet5Serve === 'A' ? 'B' : 'A'
                                  await db.matches.update(matchId, { set3FirstServe: newSet5Serve })
                                  // Sync to Supabase
                                  if (data.match?.seed_key) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, set3FirstServe: newSet5Serve },
                                      createdAt: new Date().toISOString()
                                    })
                                  }
                                } else {
                                  const coinTossTeamA = data.match.coinTossTeamA || 'team1'
                                  const coinTossTeamB = coinTossTeamA === 'team1' ? 'team2' : 'team1'
                                  const coinTossServeA = newServe === coinTossTeamA
                                  await db.matches.update(matchId, { firstServe: newServe, coinTossServeA })

                                  // Sync coin_toss JSONB to Supabase
                                  if (data.match?.seed_key) {
                                    await db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: {
                                        id: data.match.seed_key,
                                        coin_toss: {
                                          team_a: coinTossTeamA,
                                          team_b: coinTossTeamB,
                                          serve_a: coinTossServeA,
                                          confirmed: true,
                                          first_serve: newServe
                                        }
                                      },
                                      createdAt: new Date().toISOString()
                                    })
                                  }
                                }
                                logManualChange('Teams Setup', 'First Serve', oldServing, newServing, `Changed first serve from ${oldServing} to ${newServing}`)
                                // Sync updated serve to Supabase live state
                                syncLiveStateToSupabase('manual_serve_change', null, { oldServe: oldServing, newServe: newServing })
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              🏐 Switch Serve
                            </button>
                          </div>

                          {/* Switch Serving Player within each team */}
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px', marginBottom: '8px' }}>
                            Switch which player serves first within each team:
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {/* Team 1 - Switch Server */}
                            <button
                              className="secondary"
                              onClick={async () => {
                                const team1Players = data?.teams?.find(t => t.id === data?.match?.team1Id)?.players || []
                                const currentFirstServe = data?.match?.team1FirstServe
                                const playerNumbers = team1Players.map(p => p.number).sort((a, b) => a - b)

                                if (playerNumbers.length >= 2) {
                                  // Toggle to the other player
                                  const newFirstServe = String(currentFirstServe) === String(playerNumbers[0])
                                    ? playerNumbers[1]
                                    : playerNumbers[0]

                                  await db.matches.update(matchId, { team1FirstServe: newFirstServe })

                                  if (data.match?.seed_key) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, team1FirstServe: newFirstServe },
                                      createdAt: new Date().toISOString()
                                    })
                                  }

                                  logManualChange('Teams Setup', 'Team 1 Server', `Player ${currentFirstServe}`, `Player ${newFirstServe}`, 'Switched first serving player for Team 1')
                                  syncLiveStateToSupabase('manual_server_change', 'team1', { oldServer: currentFirstServe, newServer: newFirstServe })
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '12px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              🔄 {data?.team1Team?.shortName || data?.team1Team?.name || 'team1'} Server: #{data?.match?.team1FirstServe || '?'}
                            </button>
                            {/* Team 2 - Switch Server */}
                            <button
                              className="secondary"
                              onClick={async () => {
                                const team2Players = data?.teams?.find(t => t.id === data?.match?.team2Id)?.players || []
                                const currentFirstServe = data?.match?.team2FirstServe
                                const playerNumbers = team2Players.map(p => p.number).sort((a, b) => a - b)

                                if (playerNumbers.length >= 2) {
                                  // Toggle to the other player
                                  const newFirstServe = String(currentFirstServe) === String(playerNumbers[0])
                                    ? playerNumbers[1]
                                    : playerNumbers[0]

                                  await db.matches.update(matchId, { team2FirstServe: newFirstServe })

                                  if (data.match?.seed_key) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, team2FirstServe: newFirstServe },
                                      createdAt: new Date().toISOString()
                                    })
                                  }

                                  logManualChange('Teams Setup', 'Team 2 Server', `Player ${currentFirstServe}`, `Player ${newFirstServe}`, 'Switched first serving player for Team 2')
                                  syncLiveStateToSupabase('manual_server_change', 'team2', { oldServer: currentFirstServe, newServer: newFirstServe })
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '12px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              🔄 {data?.team2Team?.shortName || data?.team2Team?.name || 'team2'} Server: #{data?.match?.team2FirstServe || '?'}
                            </button>
                          </div>
                        </div>

                        {/* Edit Lineup */}
                        <div
                          className="manual-item"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            paddingTop: '16px',
                            borderTop: '1px solid rgba(255,255,255,0.08)'
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.edit.changeCurrentLineup')}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                            {t('scoreboard.edit.overrideLineupDesc')}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {/* LEFT BUTTON */}
                            <button
                              className="secondary"
                              disabled={!data?.set}
                              onClick={() => openManualLineup(leftTeamKey)}
                              style={{
                                flex: 1,
                                minWidth: '120px',
                                padding: '12px 16px',
                                background: leftTeamColor,
                                color: isBrightColor(leftTeamColor) ? '#000' : '#fff',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              {t('scoreboard.edit.editTeamLeft', { team: leftTeamKey === teamAKey ? 'A' : 'B' })}
                            </button>
                            {/* RIGHT BUTTON */}
                            <button
                              className="secondary"
                              disabled={!data?.set}
                              onClick={() => openManualLineup(rightTeamKey)}
                              style={{
                                flex: 1,
                                minWidth: '120px',
                                padding: '12px 16px',
                                background: rightTeamColor,
                                color: isBrightColor(rightTeamColor) ? '#000' : '#fff',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              {t('scoreboard.edit.editTeamRight', { team: rightTeamKey === teamAKey ? 'A' : 'B' })}
                            </button>
                          </div>
                        </div>

                        {/* Edit Current Set Score */}
                        {data?.set && (
                          <div
                            className="manual-item"
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              paddingTop: '16px',
                              borderTop: '1px solid rgba(255,255,255,0.08)'
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.edit.editCurrentSetScore')}</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                              {t('scoreboard.edit.editCurrentSetScoreDesc')}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {/* LEFT TEAM Score */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', minWidth: '60px' }}>
                                  {leftisTeam1 ? t('common.team1') : t('common.team2')}:
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={(leftisTeam1 ? data.set.team1Points : data.set.team2Points) || 0}
                                  onChange={async (e) => {
                                    const newPoints = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                                    const update = leftisTeam1 ? { team1Points: newPoints } : { team2Points: newPoints }
                                    await db.sets.update(data.set.id, update)

                                    // Sync to Supabase
                                    if (supabase && data.match?.seed_key) {
                                      try {
                                        const sbUpdate = leftisTeam1 ? { team1_points: newPoints } : { team2_points: newPoints }
                                        await supabase.from('sets').update(sbUpdate).eq('external_id', String(data.set.id))
                                      } catch (err) { /* ignore */ }
                                    }

                                    // Update Live State immediately
                                    syncLiveStateToSupabase('manual_score_update')
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '6px 8px',
                                    fontSize: '14px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              {/* RIGHT TEAM Score */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', minWidth: '60px' }}>
                                  {rightisTeam1 ? t('common.team1') : t('common.team2')}:
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={(rightisTeam1 ? data.set.team1Points : data.set.team2Points) || 0}
                                  onChange={async (e) => {
                                    const newPoints = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                                    const update = rightisTeam1 ? { team1Points: newPoints } : { team2Points: newPoints }
                                    await db.sets.update(data.set.id, update)

                                    // Sync to Supabase
                                    if (supabase && data.match?.seed_key) {
                                      try {
                                        const sbUpdate = rightisTeam1 ? { team1_points: newPoints } : { team2_points: newPoints }
                                        await supabase.from('sets').update(sbUpdate).eq('external_id', String(data.set.id))
                                      } catch (err) { /* ignore */ }
                                    }

                                    // Update Live State immediately
                                    syncLiveStateToSupabase('manual_score_update')
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '6px 8px',
                                    fontSize: '14px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Collapsible Section: Score & Sets */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, scores: !prev.scores }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📊</span>
                  Score &amp; Sets
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.scores ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.scores && (
                <div style={{ padding: '0 16px 16px 16px' }}>
                  <div className="manual-list">

                    {/* Reopen completed sets */}
                    {data?.sets && (() => {
                      // Filter out the current set - only show finished sets that are not the current set
                      const currentSetIndex = data?.set?.index
                      const completedSets = data.sets
                        .filter(s => s.finished && s.index !== currentSetIndex)
                        .sort((a, b) => b.index - a.index)
                      if (completedSets.length === 0) return null

                      return (
                        <div
                          className="manual-item"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            paddingTop: '16px'
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.edit.reopenCompletedSets')}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                            {t('scoreboard.edit.reopenCompletedSetsDesc')}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {completedSets.map(set => (
                              <button
                                key={set.id}
                                className="secondary"
                                onClick={() => setReopenSetConfirm({ setId: set.id, setIndex: set.index })}
                                style={{ textAlign: 'left', padding: '10px 16px' }}
                              >
                                {t('scoreboard.edit.reopenSetWithScore', { setIndex: set.index, team1Points: set.team1Points, team2Points: set.team2Points })}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}



                    {/* Edit All Sets */}
                    {data?.sets && data.sets.length > 0 && (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.edit.editAllSets')}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          {t('scoreboard.edit.editAllSetsDesc')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {data.sets.sort((a, b) => a.index - b.index).map(set => (
                            <div key={set.id} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '8px',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: '6px'
                            }}>
                              <div style={{ fontWeight: 600, minWidth: '60px' }}>{t('scoreboard.edit.setNumber', { number: set.index })}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '11px' }}>{t('common.team1')}:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={set.team1Points || 0}
                                  onChange={async (e) => {
                                    const newPoints = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                                    await db.sets.update(set.id, { team1Points: newPoints })
                                    // Sync to Supabase
                                    if (supabase && data.match?.seed_key) {
                                      try {
                                        await supabase.from('sets').update({ team1_points: newPoints }).eq('external_id', String(set.id))
                                      } catch (err) { /* ignore */ }
                                    }
                                  }}
                                  style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    fontSize: '12px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '11px' }}>{t('common.team2')}:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={set.team2Points || 0}
                                  onChange={async (e) => {
                                    const newPoints = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                                    await db.sets.update(set.id, { team2Points: newPoints })
                                    // Sync to Supabase
                                    if (supabase && data.match?.seed_key) {
                                      try {
                                        await supabase.from('sets').update({ team2_points: newPoints }).eq('external_id', String(set.id))
                                      } catch (err) { /* ignore */ }
                                    }
                                  }}
                                  style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    fontSize: '12px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                                <label style={{ fontSize: '11px' }}>{t('scoreboard.edit.finished')}</label>
                                <input
                                  type="checkbox"
                                  checked={set.finished || false}
                                  onChange={async (e) => {
                                    await db.sets.update(set.id, { finished: e.target.checked })
                                    // Sync to Supabase
                                    if (supabase && data.match?.seed_key) {
                                      try {
                                        await supabase.from('sets').update({ finished: e.target.checked }).eq('external_id', String(set.id))
                                      } catch (err) { /* ignore */ }
                                    }
                                  }}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer'
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Section: Match Settings */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, matchSettings: !prev.matchSettings }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>⚙️</span>
                  Match Settings
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.matchSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.matchSettings && (
                <div style={{ padding: '0 16px 16px 16px' }}>



                  {/* Edit Match Information */}
                  {data?.match && (
                    <div
                      className="manual-item"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.edit.editMatchInfo')}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        {t('scoreboard.edit.editMatchInfoDesc')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{ fontSize: '12px', minWidth: '120px' }}>{t('scoreboard.edit.matchStatus')}</label>
                          <select
                            value={data.match.status || 'live'}
                            onChange={async (e) => {
                              const newStatus = e.target.value
                              // Update local IndexedDB
                              await db.matches.update(matchId, { status: newStatus })

                              // Also sync to Supabase if match has seed_key
                              if (supabase && data.match?.seed_key) {
                                try {
                                  await supabase
                                    .from('matches')
                                    .update({ status: newStatus })
                                    .eq('external_id', data.match.seed_key)
                                } catch (err) {
                                  // Failed to sync status to Supabase
                                }
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: '12px',
                              background: '#1e293b',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: '4px',
                              color: 'var(--text)'
                            }}
                          >
                            <option value="setup" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.setup')}</option>
                            <option value="live" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.live')}</option>
                            <option value="final" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.final')}</option>
                            <option value="paused" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.paused')}</option>
                          </select>
                        </div>
                        {data?.set?.index === 3 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <label style={{ fontSize: '12px', minWidth: '120px' }}>{t('scoreboard.edit.set3FirstServe')}</label>
                            <select
                              value={data.match.set3FirstServe || 'A'}
                              onChange={async (e) => {
                                await db.matches.update(matchId, { set3FirstServe: e.target.value })
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                fontSize: '12px',
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            >
                              <option value="A" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.teamA')}</option>
                              <option value="B" style={{ background: '#1e293b', color: 'var(--text)' }}>{t('scoreboard.edit.teamB')}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}


                </div>
              )}
            </div>

            {/* Collapsible Section: Event History */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, events: !prev.events }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📝</span>
                  Event History
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.events ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.events && (
                <div style={{ padding: '0 16px 16px 16px' }}>

                  {/* Edit Points */}
                  {data?.events && (() => {
                    const pointEvents = data.events.filter(e => e.type === 'point').sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, 20)
                    if (pointEvents.length === 0) return null

                    return (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingBottom: '16px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Points ({pointEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          Edit or delete point events. Score shown is at time of point.
                        </div>
                        <div style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {pointEvents.map(event => {
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')

                            // Calculate score at time of this point
                            const setEvents = data.events.filter(e => e.setIndex === setIndex)
                            const eventIndex = setEvents.findIndex(e => e.id === event.id)
                            let team1Score = 0
                            let team2Score = 0
                            for (let i = 0; i <= eventIndex; i++) {
                              const e = setEvents[i]
                              if (e.type === 'point') {
                                if (e.payload?.team === 'team1') team1Score++
                                else if (e.payload?.team === 'team2') team2Score++
                              }
                            }

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px'
                              }}>
                                <span style={{ minWidth: '60px' }}>Set {setIndex}</span>
                                <select
                                  value={team || 'team1'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, team: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '80px'
                                  }}
                                >
                                  <option value="team1" style={{ background: '#1e293b', color: 'var(--text)' }}>Team 1</option>
                                  <option value="team2" style={{ background: '#1e293b', color: 'var(--text)' }}>Team 2</option>
                                </select>
                                <span style={{ minWidth: '50px' }}>Score: {team1Score}-{team2Score}</span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this point event?`)) {
                                      await db.events.delete(event.id)
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Edit Timeouts */}
                  {data?.events && (() => {
                    const timeoutEvents = data.events.filter(e => e.type === 'timeout').sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, 20)
                    if (timeoutEvents.length === 0) return null

                    return (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Timeouts ({timeoutEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          Edit or delete timeout events. Score shown is at time of timeout.
                        </div>
                        <div style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {timeoutEvents.map(event => {
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')

                            // Calculate score at time of this timeout
                            const setEvents = data.events.filter(e => e.setIndex === setIndex)
                            const eventIndex = setEvents.findIndex(e => e.id === event.id)
                            let team1Score = 0
                            let team2Score = 0
                            for (let i = 0; i < eventIndex; i++) {
                              const e = setEvents[i]
                              if (e.type === 'point') {
                                if (e.payload?.team === 'team1') team1Score++
                                else if (e.payload?.team === 'team2') team2Score++
                              }
                            }

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>Set {setIndex}</span>
                                <select
                                  value={team || 'team1'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, team: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: '#1e293b', color: '#fff' }}>Team 1</option>
                                  <option value="team2" style={{ background: '#1e293b', color: '#fff' }}>Team 2</option>
                                </select>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{team1Score}-{team2Score}</span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this timeout event?`)) {
                                      await db.events.delete(event.id)
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Edit Substitutions */}
                  {data?.events && (() => {
                    const substitutionEvents = data.events.filter(e => e.type === 'substitution').sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, 20)
                    if (substitutionEvents.length === 0) return null

                    return (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Substitutions ({substitutionEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          Edit or delete substitution events. Score shown is at time of substitution.
                        </div>
                        <div style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {substitutionEvents.map(event => {
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')
                            const playerOut = event.payload?.playerOut
                            const playerIn = event.payload?.playerIn
                            const position = event.payload?.position

                            // Calculate score at time of this substitution
                            const setEvents = data.events.filter(e => e.setIndex === setIndex)
                            const eventIndex = setEvents.findIndex(e => e.id === event.id)
                            let team1Score = 0
                            let team2Score = 0
                            for (let i = 0; i < eventIndex; i++) {
                              const e = setEvents[i]
                              if (e.type === 'point') {
                                if (e.payload?.team === 'team1') team1Score++
                                else if (e.payload?.team === 'team2') team2Score++
                              }
                            }

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>Set {setIndex}</span>
                                <select
                                  value={team || 'team1'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, team: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: '#1e293b', color: '#fff' }}>Team 1</option>
                                  <option value="team2" style={{ background: '#1e293b', color: '#fff' }}>Team 2</option>
                                </select>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{team1Score}-{team2Score}</span>
                                <select
                                  value={position || 'I'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, position: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    width: '45px'
                                  }}
                                >
                                  {['I', 'II', 'III', 'IV', 'V', 'VI'].map(pos => (
                                    <option key={pos} value={pos} style={{ background: '#1e293b', color: '#fff' }}>{pos}</option>
                                  ))}
                                </select>
                                <span style={{ fontSize: '10px' }}>Out:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={playerOut || ''}
                                  onChange={async (e) => {
                                    const val = parseInt(e.target.value) || null
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, playerOut: val }
                                    })
                                  }}
                                  style={{
                                    width: '40px',
                                    padding: '4px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                                <span style={{ fontSize: '10px' }}>In:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={playerIn || ''}
                                  onChange={async (e) => {
                                    const val = parseInt(e.target.value) || null
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, playerIn: val }
                                    })
                                  }}
                                  style={{
                                    width: '40px',
                                    padding: '4px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                                <label style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <input
                                    type="checkbox"
                                    checked={event.payload?.isInjury || false}
                                    onChange={async (e) => {
                                      await db.events.update(event.id, {
                                        payload: { ...event.payload, isInjury: e.target.checked }
                                      })
                                    }}
                                    style={{ width: '12px', height: '12px', cursor: 'pointer' }}
                                  />
                                  Inj
                                </label>
                                <label style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <input
                                    type="checkbox"
                                    checked={event.payload?.isExceptional || false}
                                    onChange={async (e) => {
                                      await db.events.update(event.id, {
                                        payload: { ...event.payload, isExceptional: e.target.checked }
                                      })
                                    }}
                                    style={{ width: '12px', height: '12px', cursor: 'pointer' }}
                                  />
                                  Exc
                                </label>
                                <label style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <input
                                    type="checkbox"
                                    checked={event.payload?.isExpelled || false}
                                    onChange={async (e) => {
                                      await db.events.update(event.id, {
                                        payload: { ...event.payload, isExpelled: e.target.checked }
                                      })
                                    }}
                                    style={{ width: '12px', height: '12px', cursor: 'pointer' }}
                                  />
                                  Exp
                                </label>
                                <label style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <input
                                    type="checkbox"
                                    checked={event.payload?.isDisqualified || false}
                                    onChange={async (e) => {
                                      await db.events.update(event.id, {
                                        payload: { ...event.payload, isDisqualified: e.target.checked }
                                      })
                                    }}
                                    style={{ width: '12px', height: '12px', cursor: 'pointer' }}
                                  />
                                  Dsq
                                </label>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this substitution event? The lineup will be restored (player OUT returns to court).`)) {
                                      const subTeam = event.payload?.team
                                      const subPosition = event.payload?.position
                                      const subPlayerOut = event.payload?.playerOut
                                      const subSetIndex = event.setIndex

                                      // Delete the substitution event
                                      await db.events.delete(event.id)

                                      // Find and delete the lineup event created by this substitution
                                      // Then restore the previous lineup with the original player
                                      if (subTeam && subPosition && subPlayerOut) {
                                        const allEvents = await db.events.where('matchId').equals(matchId).toArray()
                                        const lineupEvents = allEvents
                                          .filter(e => e.type === 'lineup' && e.payload?.team === subTeam && e.setIndex === subSetIndex)
                                          .sort((a, b) => new Date(b.ts) - new Date(a.ts)) // Most recent first

                                        if (lineupEvents.length > 1) {
                                          // Delete the most recent lineup (created by the substitution)
                                          const mostRecentLineup = lineupEvents[0]
                                          await db.events.delete(mostRecentLineup.id)

                                          // Get the previous lineup and restore it with the original player
                                          const previousLineup = lineupEvents[1]?.payload?.lineup || {}
                                          const restoredLineup = { ...previousLineup }
                                          restoredLineup[subPosition] = String(subPlayerOut)

                                          // Get next sequence number
                                          const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)
                                          const nextSeq = Math.floor(maxSeq) + 1

                                          // Create restored lineup event
                                          const restoredPayload = { team: subTeam, lineup: restoredLineup, fromSubstitution: true }
                                          await db.events.add({
                                            matchId,
                                            setIndex: subSetIndex,
                                            type: 'lineup',
                                            payload: restoredPayload,
                                            ts: new Date().toISOString(),
                                            seq: nextSeq
                                          })
                                        } else if (lineupEvents.length === 1) {
                                          // Only one lineup - just update it to restore the original player
                                          const currentLineup = lineupEvents[0]
                                          const restoredLineup = { ...currentLineup.payload?.lineup }
                                          restoredLineup[subPosition] = String(subPlayerOut)
                                          await db.events.update(currentLineup.id, {
                                            payload: { ...currentLineup.payload, lineup: restoredLineup }
                                          })
                                        }
                                      }
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Edit Sanctions */}
                  {data?.events && (() => {
                    const sanctionEvents = data.events.filter(e => e.type === 'sanction').sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, 20)
                    if (sanctionEvents.length === 0) return null

                    return (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Sanctions ({sanctionEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          Edit or delete sanction events. Score shown is at time of sanction.
                        </div>
                        <div style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {sanctionEvents.map(event => {
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')
                            const sanctionType = event.payload?.type
                            const playerNumber = event.payload?.playerNumber
                            const position = event.payload?.position
                            const role = event.payload?.role

                            // Calculate score at time of this sanction
                            const setEvents = data.events.filter(e => e.setIndex === setIndex)
                            const eventIndex = setEvents.findIndex(e => e.id === event.id)
                            let team1Score = 0
                            let team2Score = 0
                            for (let i = 0; i < eventIndex; i++) {
                              const e = setEvents[i]
                              if (e.type === 'point') {
                                if (e.payload?.team === 'team1') team1Score++
                                else if (e.payload?.team === 'team2') team2Score++
                              }
                            }

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>Set {setIndex}</span>
                                <select
                                  value={team || 'team1'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, team: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: '#1e293b', color: '#fff' }}>Team 1</option>
                                  <option value="team2" style={{ background: '#1e293b', color: '#fff' }}>Team 2</option>
                                </select>
                                <select
                                  value={sanctionType || 'warning'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, type: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '90px'
                                  }}
                                >
                                  <option value="warning" style={{ background: '#1e293b', color: '#fff' }}>Warning</option>
                                  <option value="penalty" style={{ background: '#1e293b', color: '#fff' }}>Penalty</option>
                                  <option value="expulsion" style={{ background: '#1e293b', color: '#fff' }}>Expulsion</option>
                                  <option value="disqualification" style={{ background: '#1e293b', color: '#fff' }}>Disqualif.</option>
                                  <option value="improper_request" style={{ background: '#1e293b', color: '#fff' }}>Improper Req</option>
                                  <option value="delay_warning" style={{ background: '#1e293b', color: '#fff' }}>Delay Warn</option>
                                  <option value="delay_penalty" style={{ background: '#1e293b', color: '#fff' }}>Delay Pen</option>
                                </select>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{team1Score}-{team2Score}</span>
                                {playerNumber !== undefined && playerNumber !== null && (
                                  <>
                                    <span style={{ fontSize: '10px' }}>#</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="99"
                                      value={playerNumber || ''}
                                      onChange={async (e) => {
                                        const val = parseInt(e.target.value) || null
                                        await db.events.update(event.id, {
                                          payload: { ...event.payload, playerNumber: val }
                                        })
                                      }}
                                      style={{
                                        width: '40px',
                                        padding: '4px',
                                        fontSize: '11px',
                                        background: '#1e293b',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '4px',
                                        color: 'var(--text)'
                                      }}
                                    />
                                  </>
                                )}
                                {position && (
                                  <select
                                    value={position || 'I'}
                                    onChange={async (e) => {
                                      await db.events.update(event.id, {
                                        payload: { ...event.payload, position: e.target.value }
                                      })
                                    }}
                                    style={{
                                      padding: '4px',
                                      fontSize: '11px',
                                      background: '#1e293b',
                                      border: '1px solid rgba(255,255,255,0.2)',
                                      borderRadius: '4px',
                                      color: 'var(--text)',
                                      width: '45px'
                                    }}
                                  >
                                    {['I', 'II', 'III', 'IV', 'V', 'VI'].map(pos => (
                                      <option key={pos} value={pos} style={{ background: '#1e293b', color: '#fff' }}>{pos}</option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this sanction event?`)) {
                                      await db.events.delete(event.id)
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Edit Lineups */}
                  {data?.events && (() => {
                    const lineupEvents = data.events.filter(e => e.type === 'lineup' && e.payload?.isInitial).sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, 10)
                    if (lineupEvents.length === 0) return null

                    return (
                      <div
                        className="manual-item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Initial Lineups ({lineupEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          Edit or delete initial lineup events.
                        </div>
                        <div style={{
                          maxHeight: '300px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {lineupEvents.map(event => {
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')
                            const lineup = event.payload?.lineup || {}

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>Set {setIndex}</span>
                                <select
                                  value={team || 'team1'}
                                  onChange={async (e) => {
                                    await db.events.update(event.id, {
                                      payload: { ...event.payload, team: e.target.value }
                                    })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: '#1e293b', color: '#fff' }}>Team 1</option>
                                  <option value="team2" style={{ background: '#1e293b', color: '#fff' }}>Team 2</option>
                                </select>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                  {lineup.I || '-'}/{lineup.II || '-'}/{lineup.III || '-'}/{lineup.IV || '-'}/{lineup.V || '-'}/{lineup.VI || '-'}
                                </span>
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    setLineupModal({ team, mode: 'manual', lineup })
                                    setShowManualPanel(false)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px'
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this lineup event?`)) {
                                      await db.events.delete(event.id)
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Collapsible Section: Advanced */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, advanced: !prev.advanced }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>🔧</span>
                  Advanced
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.advanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.advanced && (
                <div style={{ padding: '0 16px 16px 16px' }}>

                  {/* Edit Set Times */}
                  {data?.sets && data.sets.length > 0 && (
                    <div
                      className="manual-item"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Set Times</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        Edit start and end times for sets.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.sets.sort((a, b) => a.index - b.index).map(set => (
                          <div key={set.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            padding: '8px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '6px'
                          }}>
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>Set {set.index}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '11px', minWidth: '80px' }}>Start Time:</label>
                                <input
                                  type="datetime-local"
                                  defaultValue={(() => {
                                    if (!set.startTime) return ''
                                    const d = new Date(set.startTime)
                                    // Format as local datetime for datetime-local input
                                    const year = d.getFullYear()
                                    const month = String(d.getMonth() + 1).padStart(2, '0')
                                    const day = String(d.getDate()).padStart(2, '0')
                                    const hours = String(d.getHours()).padStart(2, '0')
                                    const minutes = String(d.getMinutes()).padStart(2, '0')
                                    return `${year}-${month}-${day}T${hours}:${minutes}`
                                  })()}
                                  onBlur={async (e) => {
                                    const newTime = e.target.value ? new Date(e.target.value).toISOString() : null
                                    await db.sets.update(set.id, { startTime: newTime })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '11px', minWidth: '80px' }}>End Time:</label>
                                <input
                                  type="datetime-local"
                                  defaultValue={(() => {
                                    if (!set.endTime) return ''
                                    const d = new Date(set.endTime)
                                    // Format as local datetime for datetime-local input
                                    const year = d.getFullYear()
                                    const month = String(d.getMonth() + 1).padStart(2, '0')
                                    const day = String(d.getDate()).padStart(2, '0')
                                    const hours = String(d.getHours()).padStart(2, '0')
                                    const minutes = String(d.getMinutes()).padStart(2, '0')
                                    return `${year}-${month}-${day}T${hours}:${minutes}`
                                  })()}
                                  onBlur={async (e) => {
                                    const newTime = e.target.value ? new Date(e.target.value).toISOString() : null
                                    await db.sets.update(set.id, { endTime: newTime })
                                  }}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add New Event */}
                  <div
                    className="manual-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      paddingTop: '16px',
                      borderTop: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Add New Event</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                      Manually add a new event to the match history.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>Event Type:</label>
                        <select
                          id="newEventType"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          <option value="point" style={{ background: '#1e293b', color: 'var(--text)' }}>Point</option>
                          <option value="timeout" style={{ background: '#1e293b', color: 'var(--text)' }}>Timeout</option>
                          <option value="substitution" style={{ background: '#1e293b', color: 'var(--text)' }}>Substitution</option>
                          <option value="sanction" style={{ background: '#1e293b', color: 'var(--text)' }}>Sanction</option>
                          <option value="lineup" style={{ background: '#1e293b', color: 'var(--text)' }}>Lineup</option>
                          <option value="replay" style={{ background: '#1e293b', color: 'var(--text)' }}>Replay</option>
                          <option value="rally_start" style={{ background: '#1e293b', color: 'var(--text)' }}>Rally Start</option>
                          <option value="set_start" style={{ background: '#1e293b', color: 'var(--text)' }}>Set Start</option>
                          <option value="set_end" style={{ background: '#1e293b', color: 'var(--text)' }}>Set End</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>Set:</label>
                        <select
                          id="newEventSet"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          {data?.sets?.sort((a, b) => a.index - b.index).map(set => (
                            <option key={set.id} value={set.index} style={{ background: '#1e293b', color: 'var(--text)' }}>Set {set.index}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>Team:</label>
                        <select
                          id="newEventTeam"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          <option value="team1" style={{ background: '#1e293b', color: 'var(--text)' }}>Team 1</option>
                          <option value="team2" style={{ background: '#1e293b', color: 'var(--text)' }}>Team 2</option>
                        </select>
                      </div>
                      <button
                        className="secondary"
                        onClick={async () => {
                          const eventType = document.getElementById('newEventType')?.value
                          const setIndex = parseInt(document.getElementById('newEventSet')?.value || '1')
                          const team = document.getElementById('newEventTeam')?.value

                          if (!eventType || !setIndex || !team) {
                            showAlert('Please fill in all fields', 'warning')
                            return
                          }

                          // Get next sequence number
                          const allEvents = await db.events.where('matchId').equals(matchId).toArray()
                          const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)

                          const payload = { team }

                          // Add type-specific fields
                          if (eventType === 'substitution') {
                            payload.position = 'I'
                            payload.playerOut = null
                            payload.playerIn = null
                          } else if (eventType === 'sanction') {
                            payload.type = 'warning'
                          } else if (eventType === 'lineup') {
                            payload.lineup = { I: null, II: null, III: null, IV: null, V: null, VI: null }
                            payload.isInitial = true
                          }

                          const debugSeq = maxSeq + 1
                          const debugEventId = await db.events.add({
                            matchId,
                            setIndex,
                            type: eventType,
                            payload,
                            ts: new Date().toISOString(),
                            seq: debugSeq
                          })

                          showAlert('Event added. You can now edit it in the sections above.', 'success')
                        }}
                        style={{
                          padding: '8px 16px',
                          fontSize: '12px'
                        }}
                      >
                        Add Event
                      </button>
                    </div>
                  </div>

                  {/* Delete Events (Simple List) */}
                  {data?.events && data.events.length > 0 && (
                    <div
                      className="manual-item"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>Delete Events (Quick)</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        Quick delete for any event. Use with caution.
                      </div>
                      <div style={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        {data.events
                          .sort((a, b) => {
                            const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
                            const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
                            return bTime - aTime
                          })
                          .slice(0, 30)
                          .map(event => {
                            const eventType = event.type
                            const setIndex = event.setIndex || 1
                            const team = event.payload?.team
                            const teamLabel = team === teamAKey ? 'A' : (team === teamBKey ? 'B' : '')
                            const description = eventType === 'point' ? `Point ${teamLabel}` :
                              eventType === 'timeout' ? `Timeout ${teamLabel}` :
                                eventType === 'substitution' ? `Substitution ${teamLabel}` :
                                  eventType === 'lineup' ? `Lineup ${teamLabel}` :
                                    eventType === 'sanction' ? `Sanction ${teamLabel}` :
                                      eventType

                            return (
                              <div key={event.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '4px',
                                fontSize: '11px'
                              }}>
                                <span>
                                  Set {setIndex} - {description}
                                </span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (confirm(`Delete this ${eventType} event?`)) {
                                      await db.events.delete(event.id)
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px'
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible Section: Manual Changes Summary */}
            <div style={{
              marginBottom: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setManualPanelExpandedSections(prev => ({ ...prev, summary: !prev.summary }))}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>📋</span>
                  Manual Changes Summary
                  {manualChangesLog.length > 0 && (
                    <span style={{
                      background: 'var(--primary)',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      marginLeft: '4px'
                    }}>
                      {manualChangesLog.length}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '12px', transform: manualPanelExpandedSections.summary ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {manualPanelExpandedSections.summary && (
                <div style={{ padding: '0 16px 16px 16px' }}>
                  {manualChangesLog.length === 0 ? (
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      textAlign: 'center',
                      padding: '24px 0'
                    }}>
                      No manual changes recorded yet.
                      <br />
                      <span style={{ fontSize: '11px' }}>
                        Changes made via this panel will be logged here.
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                        All manual modifications made during this match session:
                      </div>
                      <div style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        {manualChangesLog.slice().reverse().map((change, idx) => {
                          const time = new Date(change.ts)
                          const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`

                          return (
                            <div key={idx} style={{
                              padding: '10px 12px',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.06)',
                              fontSize: '12px'
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '6px'
                              }}>
                                <span style={{
                                  fontWeight: 600,
                                  color: 'var(--primary)',
                                  fontSize: '11px',
                                  textTransform: 'uppercase'
                                }}>
                                  {change.category}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  color: 'var(--muted)',
                                  fontFamily: 'monospace'
                                }}>
                                  {timeStr}
                                </span>
                              </div>
                              <div style={{ marginBottom: '4px', color: 'var(--text)' }}>
                                {change.description}
                              </div>
                              <div style={{
                                display: 'flex',
                                gap: '12px',
                                fontSize: '11px',
                                color: 'var(--muted)'
                              }}>
                                <span>
                                  <strong>Before:</strong> {String(change.before)}
                                </span>
                                <span>→</span>
                                <span>
                                  <strong>After:</strong> {String(change.after)}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Export/Copy Log */}
                      <div style={{
                        marginTop: '8px',
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        <button
                          className="secondary"
                          onClick={() => {
                            const logText = manualChangesLog.map(c => {
                              const time = new Date(c.ts).toLocaleTimeString()
                              return `[${time}] ${c.category} - ${c.field}: "${c.before}" → "${c.after}"`
                            }).join('\n')
                            navigator.clipboard.writeText(logText)
                            showAlert('Manual changes log copied to clipboard!', 'success')
                          }}
                          style={{
                            padding: '8px 16px',
                            fontSize: '12px',
                            width: '100%'
                          }}
                        >
                          📋 Copy Log
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </Modal>
      )}

      {/* Remarks Modal */}
      {showRemarks && (
        <Modal
          title={t('scoreboard.modals.remarksRecording')}
          open={true}
          onClose={() => {
            setShowRemarks(false)
            setRemarksText('')
          }}
          width={600}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <section className="panel">
              <h3>Remarks</h3>
              <textarea
                ref={remarksTextareaRef}
                className="remarks-area"
                placeholder="Record match remarks…"
                value={remarksText}
                onChange={e => {
                  setRemarksText(e.target.value)
                }}
                onBlur={async () => {
                  // When user finishes editing, save and log as event
                  const oldRemarks = data?.match?.remarks || ''
                  const newRemarks = remarksText.trim()

                  if (newRemarks !== oldRemarks) {
                    // Save the new remarks
                    await db.matches.update(matchId, { remarks: newRemarks })

                    // Log remark insertion as an event if new text was added
                    if (data?.set && newRemarks) {
                      // Get the added text (what's new compared to old)
                      const oldLines = oldRemarks.split('\n')
                      const newLines = newRemarks.split('\n')

                      // Find what was added (new lines that weren't in old)
                      const addedLines = newLines.filter((line, idx) => {
                        // If old remarks is empty, all new lines are added
                        if (!oldRemarks) return line.trim()
                        // Check if this line is new (not in old remarks)
                        return idx >= oldLines.length || line !== oldLines[idx]
                      }).filter(line => line.trim())

                      if (addedLines.length > 0) {
                        const addedText = addedLines.join('\n')
                        await logEvent('remark', {
                          text: addedText,
                          fullRemarks: newRemarks
                        })
                      }
                    }
                  }
                }}
                style={{
                  width: '95%',
                  minHeight: '300px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  background: 'var(--bg-secondary)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  resize: 'vertical'
                }}
              />
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                <div>• Existing remarks are shown above</div>
                <div>• Add new remarks on a new line</div>
                <div>• Changes are saved automatically when you click outside the text area</div>
              </div>
            </section>
          </div>
        </Modal>
      )}

      {/* Stop Match Modal - Choose between Forfeit or Impossibility */}
      {stopMatchModal === 'select' && (
        <Modal
          title={t('scoreboard.stopMatch.title', 'Stop the Match')}
          open={true}
          onClose={() => setStopMatchModal(null)}
          width={400}
        >
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              className="secondary"
              onClick={() => {
                setStopMatchModal(null)
                setStopMatchTeamSelect({ pendingAction: 'forfeit' })
              }}
              style={{ padding: '16px', fontSize: '16px' }}
            >
              {t('scoreboard.stopMatch.teamForfeits', 'A team forfeits')}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setStopMatchModal(null)
                setStopMatchConfirm({ type: 'impossibility' })
              }}
              style={{ padding: '16px', fontSize: '16px' }}
            >
              {t('scoreboard.stopMatch.impossibilityToResume', 'Impossibility to resume')}
            </button>
          </div>
        </Modal>
      )}

      {/* Stop Match - Team Selection (for Forfeit) */}
      {stopMatchTeamSelect && (
        <Modal
          title={t('scoreboard.stopMatch.selectForfeitingTeam', 'Select Forfeiting Team')}
          open={true}
          onClose={() => setStopMatchTeamSelect(null)}
          width={400}
        >
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ marginBottom: '12px', color: 'var(--muted)' }}>
              {t('scoreboard.stopMatch.selectTeamPrompt', 'Which team is forfeiting?')}
            </div>
            <button
              onClick={() => {
                setStopMatchTeamSelect(null)
                setStopMatchConfirm({ type: 'forfeit', team: 'team1' })
              }}
              style={{
                padding: '16px',
                fontSize: '16px',
                background: data?.team1Team?.color || '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {data?.team1Team?.name || t('common.team1', 'team1')} ({team1Label})
            </button>
            <button
              onClick={() => {
                setStopMatchTeamSelect(null)
                setStopMatchConfirm({ type: 'forfeit', team: 'team2' })
              }}
              style={{
                padding: '16px',
                fontSize: '16px',
                background: data?.team2Team?.color || '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {data?.team2Team?.name || t('common.team2', 'team2')} ({team2Label})
            </button>
          </div>
        </Modal>
      )}

      {/* Stop Match - Confirmation */}
      {stopMatchConfirm && (
        <Modal
          title={stopMatchConfirm.type === 'forfeit'
            ? t('scoreboard.stopMatch.confirmForfeitTitle', 'Confirm Forfeit')
            : t('scoreboard.stopMatch.confirmImpossibilityTitle', 'Impossibility to Resume')}
          open={true}
          onClose={() => setStopMatchConfirm(null)}
          width={500}
        >
          <div style={{ padding: '20px' }}>
            {stopMatchConfirm.type === 'forfeit' ? (
              <>
                <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                  {t('scoreboard.stopMatch.confirmForfeitMessage',
                    '{{team}} will forfeit. The opponent will be awarded all remaining points and sets to win the match.', {
                    team: stopMatchConfirm.team === 'team1'
                      ? (data?.team1Team?.name || t('common.team1', 'team1'))
                      : (data?.team2Team?.name || t('common.team2', 'team2'))
                  })}
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                  {t('scoreboard.stopMatch.confirmImpossibilityMessage',
                    'The match will end with current scores. No winner will be declared. Match data will be downloaded.')}
                </div>
              </>
            )}
            <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)' }}>
              {t('scoreboard.stopMatch.addRemarksPrompt', 'Please record remarks explaining the match stoppage.')}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setStopMatchConfirm(null)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => {
                  // Move to remarks step
                  setStopMatchRemarksStep({
                    type: stopMatchConfirm.type,
                    team: stopMatchConfirm.team
                  })
                  setStopMatchConfirm(null)
                  setShowRemarks(true) // Open the existing remarks modal
                }}
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
              >
                {t('scoreboard.stopMatch.continueToRemarks', 'Continue to Remarks')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Stop Match - Final step after remarks (shown when remarks modal closes) */}
      {stopMatchRemarksStep && !showRemarks && (
        <Modal
          title={t('scoreboard.stopMatch.finalConfirmTitle', 'End Match')}
          open={true}
          onClose={() => setStopMatchRemarksStep(null)}
          width={400}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px', fontSize: '16px' }}>
              {stopMatchRemarksStep.type === 'forfeit'
                ? t('scoreboard.stopMatch.finalConfirmForfeit', 'End match with {{winner}} as winner?', {
                  winner: stopMatchRemarksStep.team === 'team1'
                    ? (data?.team2Team?.name || t('common.team2', 'team2'))
                    : (data?.team1Team?.name || t('common.team1', 'team1'))
                })
                : t('scoreboard.stopMatch.finalConfirmImpossibility', 'End match without a winner?')}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setStopMatchRemarksStep(null)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={completeStopMatchFlow}
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
              >
                {t('scoreboard.stopMatch.endMatch', 'End Match')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sanctions and Results Modal */}
      {showSanctions && (
        <Modal
          title={t('scoreboard.modals.sanctionsAndResults')}
          open={true}
          onClose={() => setShowSanctions(false)}
          width={1000}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <section className="panel">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', overflowX: 'auto' }}>
                {/* Left half: Sanctions */}
                <div>
                  <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Sanctions</h4>
                  {/* Improper Request Row */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', minWidth: '100px' }}>Improper Request:</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['A', 'B'].map(team => {
                        const teamKey = team === 'A' ? teamAKey : teamBKey
                        const teamKeyCapitalized = teamKey === 'team1' ? 'team1' : 'team2'
                        const hasImproperRequest = data?.match?.sanctions?.[`improperRequest${teamKeyCapitalized}`]

                        return (
                          <div key={team} style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            position: 'relative'
                          }}>
                            {team}
                            {hasImproperRequest && (
                              <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '20px',
                                color: '#ef4444',
                                fontWeight: 900
                              }}>
                                ✕
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Sanctions Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Warn</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Pen</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Exp</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Disq</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Team</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Set</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Get all sanction events except improper_request (already shown in box above)
                        const sanctionEvents = (data?.events || []).filter(e =>
                          e.type === 'sanction' && e.payload?.type !== 'improper_request'
                        )

                        if (sanctionEvents.length === 0) {
                          return (
                            <tr>
                              <td colSpan="7" style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
                                No sanctions recorded
                              </td>
                            </tr>
                          )
                        }

                        return sanctionEvents.map((event, idx) => {
                          const sanctionType = event.payload?.type
                          const team = event.payload?.team
                          const teamLabel = team === teamAKey ? 'A' : 'B'
                          const setIndex = event.setIndex || 1
                          const playerNumber = event.payload?.playerNumber

                          // Get the identifier to display (player number)
                          const identifier = (playerNumber !== undefined && playerNumber !== null) ? String(playerNumber) : null

                          // Calculate score at time of sanction
                          const setEvents = (data?.events || []).filter(e => e.setIndex === setIndex)
                          const eventIndex = setEvents.findIndex(e => e.id === event.id)
                          let team1Score = 0
                          let team2Score = 0
                          for (let i = 0; i <= eventIndex; i++) {
                            const e = setEvents[i]
                            if (e.type === 'point') {
                              if (e.payload?.team === 'team1') team1Score++
                              else if (e.payload?.team === 'team2') team2Score++
                            }
                          }

                          const sanctionedTeamScore = team === 'team1' ? team1Score : team2Score
                          const otherTeamScore = team === 'team1' ? team2Score : team1Score
                          const scoreDisplay = `${sanctionedTeamScore}:${otherTeamScore}`

                          return (
                            <tr key={event.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                {sanctionType === 'warning' && identifier}
                                {sanctionType === 'delay_warning' && !identifier && 'D'}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                {sanctionType === 'penalty' && identifier}
                                {sanctionType === 'delay_penalty' && !identifier && 'D'}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                {sanctionType === 'expulsion' && identifier}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                {sanctionType === 'disqualification' && identifier}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>{teamLabel}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>{setIndex}</td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>{scoreDisplay}</td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Right half: Results */}
                <div>
                  <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Results</h4>
                  {(() => {
                    // Get current left and right teams
                    const currentLeftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                    const currentRightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                    const leftTeamData = currentLeftTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                    const rightTeamData = currentRightTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                    const leftTeamColor = leftTeamData?.color || (currentLeftTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                    const rightTeamColor = rightTeamData?.color || (currentRightTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                    const leftTeamName = leftTeamData?.name || 'Left Team'
                    const rightTeamName = rightTeamData?.name || 'Right Team'
                    const leftTeamLabel = currentLeftTeamKey === teamAKey ? 'A' : 'B'
                    const rightTeamLabel = currentRightTeamKey === teamAKey ? 'A' : 'B'

                    // Get all sets including current
                    const allSets = (data?.sets || []).sort((a, b) => a.index - b.index)
                    const finishedSets = allSets.filter(s => s.finished)

                    // Check if match is final
                    const isMatchFinal = data?.match?.status === 'final'

                    // If match is final, show match results table
                    if (isMatchFinal) {
                      // Calculate totals for each team
                      const leftTotalTimeouts = finishedSets.reduce((sum, set) => {
                        return sum + (data?.events || []).filter(e =>
                          e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentLeftTeamKey
                        ).length
                      }, 0)
                      const rightTotalTimeouts = finishedSets.reduce((sum, set) => {
                        return sum + (data?.events || []).filter(e =>
                          e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentRightTeamKey
                        ).length
                      }, 0)

                      const leftTotalSubs = finishedSets.reduce((sum, set) => {
                        return sum + (data?.events || []).filter(e =>
                          e.type === 'substitution' && e.setIndex === set.index && e.payload?.team === currentLeftTeamKey
                        ).length
                      }, 0)
                      const rightTotalSubs = finishedSets.reduce((sum, set) => {
                        return sum + (data?.events || []).filter(e =>
                          e.type === 'substitution' && e.setIndex === set.index && e.payload?.team === currentRightTeamKey
                        ).length
                      }, 0)

                      const leftTotalWins = finishedSets.filter(s => {
                        const leftPoints = currentLeftTeamKey === 'team1' ? s.team1Points : s.team2Points
                        const rightPoints = currentRightTeamKey === 'team1' ? s.team1Points : s.team2Points
                        return leftPoints > rightPoints
                      }).length
                      const rightTotalWins = finishedSets.filter(s => {
                        const leftPoints = currentLeftTeamKey === 'team1' ? s.team1Points : s.team2Points
                        const rightPoints = currentRightTeamKey === 'team1' ? s.team1Points : s.team2Points
                        return rightPoints > leftPoints
                      }).length

                      const leftTotalPoints = finishedSets.reduce((sum, set) => {
                        return sum + (currentLeftTeamKey === 'team1' ? set.team1Points : set.team2Points)
                      }, 0)
                      const rightTotalPoints = finishedSets.reduce((sum, set) => {
                        return sum + (currentRightTeamKey === 'team1' ? set.team1Points : set.team2Points)
                      }, 0)

                      // Calculate total match duration
                      let totalDurationMin = 0
                      finishedSets.forEach(set => {
                        if (set.startTime && set.endTime) {
                          const start = new Date(set.startTime)
                          const end = new Date(set.endTime)
                          const durationMs = end - start
                          totalDurationMin += Math.floor(durationMs / 60000)
                        }
                      })

                      // Find match start time (first set_start event or first set startTime)
                      const firstSetStartEvent = (data?.events || []).find(e => e.type === 'set_start' && e.setIndex === 1)
                      const matchStartTime = firstSetStartEvent ? new Date(firstSetStartEvent.ts) : (finishedSets[0]?.startTime ? new Date(finishedSets[0].startTime) : null)

                      // Find match end time (last set endTime)
                      const matchEndTime = finishedSets.length > 0 && finishedSets[finishedSets.length - 1]?.endTime
                        ? new Date(finishedSets[finishedSets.length - 1].endTime)
                        : null

                      // Calculate match duration
                      let matchDurationMin = 0
                      if (matchStartTime && matchEndTime) {
                        const durationMs = matchEndTime - matchStartTime
                        matchDurationMin = Math.floor(durationMs / 60000)
                      }

                      // Determine winner
                      const winnerTeamKey = leftTotalWins > rightTotalWins ? currentLeftTeamKey : currentRightTeamKey
                      const winnerTeamData = winnerTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                      const winnerTeamName = winnerTeamData?.name || (winnerTeamKey === 'team1' ? 'team1' : 'team2')
                      const winnerScore = `${leftTotalWins}-${rightTotalWins}`

                      // Get captain signatures
                      const team1CaptainSignature = data?.match?.team1PostGameCaptainSignature || null
                      const team2CaptainSignature = data?.match?.team2PostGameCaptainSignature || null

                      return (
                        <div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                            <thead>
                              <tr>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', width: '42%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10px', wordBreak: 'break-word' }}>{leftTeamName}</span>
                                    <span style={{
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      background: leftTeamColor,
                                      color: isBrightColor(leftTeamColor) ? '#000' : '#fff'
                                    }}>{leftTeamLabel}</span>
                                  </div>
                                </th>
                                <th style={{ padding: '4px', fontSize: '8px', width: '16%' }}>Dur</th>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', width: '42%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10px', wordBreak: 'break-word' }}>{rightTeamName}</span>
                                    <span style={{
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      background: rightTeamColor,
                                      color: isBrightColor(rightTeamColor) ? '#000' : '#fff'
                                    }}>{rightTeamLabel}</span>
                                  </div>
                                </th>
                              </tr>
                              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>T</th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>W</th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>P</th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}></th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>P</th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>W</th>
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>T</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{leftTotalTimeouts}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{leftTotalWins}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{leftTotalPoints}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px', color: 'var(--muted)' }}>{totalDurationMin}'</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{rightTotalPoints}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{rightTotalWins}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}>{rightTotalTimeouts}</td>
                              </tr>
                            </tbody>
                          </table>

                          {/* Match time information */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginTop: '12px' }}>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match start time:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchStartTime ? `${String(matchStartTime.getUTCHours()).padStart(2, '0')}:${String(matchStartTime.getUTCMinutes()).padStart(2, '0')}:${String(matchStartTime.getUTCSeconds()).padStart(2, '0')}` : '—'}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match end time:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchEndTime ? `${String(matchEndTime.getUTCHours()).padStart(2, '0')}:${String(matchEndTime.getUTCMinutes()).padStart(2, '0')}:${String(matchEndTime.getUTCSeconds()).padStart(2, '0')}` : '—'}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match duration:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchDurationMin > 0 ? `${matchDurationMin} min` : '—'}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Winner:</td>
                                <td colSpan="5" style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {winnerTeamName} ({winnerScore})
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* Post-match signatures */}
                          <div style={{ marginTop: '16px', display: 'flex', gap: '16px', justifyContent: 'space-around' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '9px', fontWeight: 600, marginBottom: '4px' }}>
                                {data?.team1Team?.name || 'team1'} Captain
                              </div>
                              {team1CaptainSignature ? (
                                <div style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'rgba(255,255,255,0.05)' }}>
                                  <img src={team1CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team1-captain')}
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    fontSize: '9px',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Sign
                                </button>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '9px', fontWeight: 600, marginBottom: '4px' }}>
                                {data?.team2Team?.name || 'team2'} Captain
                              </div>
                              {team2CaptainSignature ? (
                                <div style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'rgba(255,255,255,0.05)' }}>
                                  <img src={team2CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team2-captain')}
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    fontSize: '9px',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Sign
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Otherwise show set breakdown
                    // Helper to convert set number to Roman numeral
                    const toRoman = (num) => {
                      const romanNumerals = ['I', 'II', 'III', 'IV', 'V']
                      return romanNumerals[num - 1] || num.toString()
                    }

                    // Only show sets that have been played (started or have points)
                    const playedSets = allSets.filter(s => s.team1Points > 0 || s.team2Points > 0 || s.finished || s.startTime)

                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '4px 2px', textAlign: 'center', width: '8%' }}></th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', width: '38%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', wordBreak: 'break-word' }}>{leftTeamName}</span>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  background: leftTeamColor,
                                  color: isBrightColor(leftTeamColor) ? '#000' : '#fff'
                                }}>{leftTeamLabel}</span>
                              </div>
                            </th>
                            <th style={{ padding: '4px 2px', fontSize: '8px', width: '8%' }}>Dur</th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)', width: '38%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', wordBreak: 'break-word' }}>{rightTeamName}</span>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  background: rightTeamColor,
                                  color: isBrightColor(rightTeamColor) ? '#000' : '#fff'
                                }}>{rightTeamLabel}</span>
                              </div>
                            </th>
                          </tr>
                          <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>Set</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>T</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>W</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>P</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}></th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>P</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>W</th>
                            <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>T</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playedSets.map(set => {
                            // Always show from CURRENT left/right perspective
                            const leftPoints = (currentLeftTeamKey === 'team1' ? set.team1Points : set.team2Points) ?? 0
                            const rightPoints = (currentRightTeamKey === 'team1' ? set.team1Points : set.team2Points) ?? 0

                            // Calculate timeouts for current left/right teams
                            const leftTimeouts = (data?.events || []).filter(e =>
                              e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentLeftTeamKey
                            ).length
                            const rightTimeouts = (data?.events || []).filter(e =>
                              e.type === 'timeout' && e.setIndex === set.index && e.payload?.team === currentRightTeamKey
                            ).length

                            // Determine winner for current left/right teams
                            const leftWon = leftPoints > rightPoints ? 1 : 0
                            const rightWon = rightPoints > leftPoints ? 1 : 0

                            // Calculate set duration
                            let duration = ''
                            if (set.startTime && set.endTime) {
                              const start = new Date(set.startTime)
                              const end = new Date(set.endTime)
                              const durationMs = end - start
                              const durationMin = Math.floor(durationMs / 60000)
                              duration = `${durationMin}'`
                            }

                            return (
                              <tr key={set.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}>{toRoman(set.index)}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{leftTimeouts || 0}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{leftWon}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{leftPoints}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px', color: 'var(--muted)' }}>{duration}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{rightPoints}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{rightWon}</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px' }}>{rightTimeouts || 0}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
              </div>

              {/* Remarks section */}
              {data?.match?.remarks && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Remarks</h4>
                  <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {data.match.remarks}
                  </div>
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}

      {/* Timeout confirmation modal - only show before timeout starts, not during countdown */}
      {timeoutModal && !timeoutModal.started && (
        <Modal
          title={`Time-out — ${timeoutModal.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')}`}
          open={true}
          onClose={cancelTimeout}
          width={400}
        >
          <div style={{ textAlign: 'center', padding: '24px', fontSize: '16px' }}>
            {/* Display current score - requesting team on left */}
            {(() => {
              const requestingTeamData = timeoutModal.team === 'team1' ? data?.team1Team : data?.team2Team
              const otherTeamData = timeoutModal.team === 'team1' ? data?.team2Team : data?.team1Team
              const requestingTeamScore = timeoutModal.team === 'team1' ? (data?.set?.team1Points || 0) : (data?.set?.team2Points || 0)
              const otherTeamScore = timeoutModal.team === 'team1' ? (data?.set?.team2Points || 0) : (data?.set?.team1Points || 0)
              const requestingTeamLabel = timeoutModal.team === teamAKey ? 'A' : 'B'
              const otherTeamLabel = timeoutModal.team === teamAKey ? 'B' : 'A'
              const requestingTeamColor = requestingTeamData?.color || (timeoutModal.team === 'team1' ? '#ef4444' : '#3b82f6')
              const otherTeamColor = otherTeamData?.color || (timeoutModal.team === 'team1' ? '#3b82f6' : '#ef4444')
              const isRequestingBright = isBrightColor(requestingTeamColor)
              const isOtherBright = isBrightColor(otherTeamColor)
              const currentTimeouts = timeoutsUsed[timeoutModal.team] || 0
              const isSecondTimeout = currentTimeouts === 1
              return (
                <div style={{ marginBottom: '16px', fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: requestingTeamColor,
                    color: isRequestingBright ? '#000' : '#fff'
                  }}>{requestingTeamLabel}</span>
                  <span>{requestingTeamScore}</span>
                  <span>:</span>
                  <span>{otherTeamScore}</span>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: otherTeamColor,
                    color: isOtherBright ? '#000' : '#fff'
                  }}>{otherTeamLabel}</span>
                </div>
              )
            })()}
            <p style={{ marginBottom: '24px', color: 'var(--muted)', fontSize: '16px' }}>
              Confirm {(timeoutsUsed[timeoutModal.team] || 0) === 1 && <><span style={{ color: '#ef4444', fontWeight: 700 }}>2nd</span>{' '}</>}time-out request?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={confirmTimeout} style={{ fontSize: '16px' }}>
                Confirm time-out
              </button>
              <button className="secondary" onClick={cancelTimeout} style={{ fontSize: '16px' }}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {lineupModal && <LineupModal
        team={lineupModal.team}
        teamData={
          lineupModal.team === 'team1'
            ? data?.team1Team
            : data?.team2Team
        }
        players={
          lineupModal.team === 'team1'
            ? data?.team1Players
            : data?.team2Players
        }
        matchId={matchId}
        setIndex={data?.set?.index}
        mode={lineupModal.mode || 'initial'}
        lineup={lineupModal.lineup}
        teamAKey={teamAKey}
        teamBKey={teamBKey}
        onClose={() => setLineupModal(null)}
        onSave={async () => {
          setLineupModal(null)
        }}
        onLineupSaved={() => {
          syncToReferee()
          // Also sync to Supabase match_live_state
          syncLiveStateToSupabase('lineup', lineupModal?.team || null, null)
        }}
      />}

      {playerActionMenu && (() => {
        // Get element position - use stored coordinates if available
        // For left side teams, menu opens to the right (use left CSS)
        // For right side teams, menu opens to the left (use right CSS)
        const isRightSide = playerActionMenu.side === 'right'
        let menuStyle
        if (playerActionMenu.x !== undefined && playerActionMenu.y !== undefined) {
          menuStyle = {
            position: 'fixed',
            left: isRightSide ? undefined : `${playerActionMenu.x}px`,
            right: isRightSide ? `${window.innerWidth - playerActionMenu.x}px` : undefined,
            top: `${playerActionMenu.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = playerActionMenu.element?.getBoundingClientRect?.()
          menuStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${rect.top + rect.height / 2}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          } : {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000
          }
        }

        // Get available substitutes for this player
        const { team, position, playerNumber } = playerActionMenu


        // Get sanction availability
        const teamWarning = teamHasFormalWarning(team)
        const hasWarning = playerHasSanctionType(team, playerNumber, 'warning')
        const hasPenalty = playerHasSanctionType(team, playerNumber, 'penalty')
        const hasExpulsion = playerHasSanctionType(team, playerNumber, 'expulsion')
        const canGetWarning = !hasWarning && !teamWarning
        const canGetPenalty = !hasPenalty
        const canGetExpulsion = !hasExpulsion

        const showSanctionConfirmFromMenu = (sanctionType) => {
          setPlayerActionMenu(null)
          setCourtSubExpanded(false)
          setCourtSanctionExpanded(false)
          setSanctionConfirmModal({
            team,
            type: 'player',
            playerNumber,
            position,
            sanctionType
          })
        }



        return (
          <>
            {/* Backdrop to close menu on click outside */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999,
                background: 'transparent'
              }}
              onClick={() => { setPlayerActionMenu(null); setCourtSanctionExpanded(false) }}
            />
            {/* Action Menu */}
            <div style={menuStyle} className="modal-wrapper-roll-down">
              <div
                data-player-action-menu
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '140px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'center', marginBottom: '4px' }}>
                  # {playerNumber}
                </div>


                {/* Sanction - expandable */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    onClick={() => setCourtSanctionExpanded(!courtSanctionExpanded)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#000',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#1a1a1a'
                      e.currentTarget.style.transform = 'scale(1.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#000'
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    <span>Sanction</span>
                    <span style={{ fontSize: '14px', lineHeight: '1', transform: courtSanctionExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  {courtSanctionExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <button
                        onClick={() => showSanctionConfirmFromMenu('warning')}
                        disabled={!canGetWarning}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: canGetWarning ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          color: canGetWarning ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          cursor: canGetWarning ? 'pointer' : 'not-allowed',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: canGetWarning ? 1 : 0.5
                        }}
                      >
                        <div className="sanction-card yellow" style={{ flexShrink: 0, width: '20px', height: '26px' }}></div>
                        <span>Warning</span>
                      </button>
                      <button
                        onClick={() => showSanctionConfirmFromMenu('penalty')}
                        disabled={!canGetPenalty}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: canGetPenalty ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          color: canGetPenalty ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          cursor: canGetPenalty ? 'pointer' : 'not-allowed',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: canGetPenalty ? 1 : 0.5
                        }}
                      >
                        <div className="sanction-card red" style={{ flexShrink: 0, width: '20px', height: '26px' }}></div>
                        <span>Penalty</span>
                      </button>
                      <button
                        onClick={() => showSanctionConfirmFromMenu('expulsion')}
                        disabled={!canGetExpulsion}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: canGetExpulsion ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          color: canGetExpulsion ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          cursor: canGetExpulsion ? 'pointer' : 'not-allowed',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: canGetExpulsion ? 1 : 0.5
                        }}
                      >
                        <div className="sanction-card combo" style={{ flexShrink: 0, width: '24px', height: '26px' }}></div>
                        <span>Expulsion</span>
                      </button>
                      <button
                        onClick={() => showSanctionConfirmFromMenu('disqualification')}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <div className="sanction-cards-separate" style={{ flexShrink: 0, display: 'flex', gap: '2px' }}>
                          <div className="sanction-card yellow" style={{ width: '16px', height: '22px' }}></div>
                          <div className="sanction-card red" style={{ width: '16px', height: '22px' }}></div>
                        </div>
                        <span>Disqualification</span>
                      </button>
                    </div>
                  )}
                </div>
                {/* Medical - opens dropdown with Medical Timeout / Player Unable to Play */}
                <button
                  onClick={openMedicalFromMenu}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#dc2626',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ef4444'
                    e.currentTarget.style.transform = 'scale(1.02)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#dc2626'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <span>Medical</span>
                  <span style={{ fontSize: '14px', lineHeight: '1' }}>✚</span>
                </button>
              </div>
            </div>
          </>
        )
      })()}





      {sanctionDropdown && (() => {
        // Get element position - use stored coordinates if available
        // For left side teams, menu opens to the right (use left CSS)
        // For right side teams, menu opens to the left (use right CSS)
        const isRightSide = sanctionDropdown.side === 'right'
        let dropdownStyle
        if (sanctionDropdown.x !== undefined && sanctionDropdown.y !== undefined) {
          dropdownStyle = {
            position: 'fixed',
            left: isRightSide ? undefined : `${sanctionDropdown.x}px`,
            right: isRightSide ? `${window.innerWidth - sanctionDropdown.x}px` : undefined,
            top: `${sanctionDropdown.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = sanctionDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${rect.top + rect.height / 2}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          } : {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000
          }
        }

        return (
          <>
            {/* Backdrop to close dropdown on click outside */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999,
                background: 'transparent'
              }}
              onClick={cancelSanction}
            />
            {/* Dropdown */}
            <div style={dropdownStyle} className="modal-wrapper-roll-up">
              <div
                data-sanction-dropdown
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '160px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '6px' }}>
                  {sanctionDropdown.playerNumber ? `Sanction for ${sanctionDropdown.playerNumber}` : 'Sanction'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(() => {
                    const teamKey = sanctionDropdown.team
                    const playerNumber = sanctionDropdown.playerNumber
                    const teamWarning = teamHasFormalWarning(teamKey)

                    // Check if player has each specific sanction type (for back-sanctioning rules)
                    const hasWarning = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'warning') : false
                    const hasPenalty = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'penalty') : false
                    const hasExpulsion = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'expulsion') : false
                    const hasDisqualification = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'disqualification') : false

                    // Determine which sanctions are available
                    // Rule: A player cannot get the same sanction type twice
                    // Exception: Warning can only be given if team hasn't been warned (player can have other sanctions)
                    const canGetWarning = !hasWarning && !teamWarning
                    // Penalty: can be given if player doesn't already have a penalty (back-sanctioning allowed)
                    const canGetPenalty = !hasPenalty
                    // Expulsion: can be given if player doesn't already have an expulsion (back-sanctioning allowed)
                    const canGetExpulsion = !hasExpulsion
                    // Disqualification: can be given if player doesn't already have a disqualification (back-sanctioning allowed)
                    const canGetDisqualification = !hasDisqualification

                    return (
                      <>
                        <button
                          onClick={() => showSanctionConfirm('warning')}
                          disabled={!canGetWarning}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: canGetWarning ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                            color: canGetWarning ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            cursor: canGetWarning ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            opacity: canGetWarning ? 1 : 0.5
                          }}
                          onMouseEnter={(e) => {
                            if (canGetWarning) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetWarning) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                            }
                          }}
                        >
                          <div className="sanction-card yellow" style={{ flexShrink: 0, width: '24px', height: '32px' }}></div>
                          <span>Warning{!canGetWarning && (teamWarning ? ' (Team has warning)' : ' (Already sanctioned)')}</span>
                        </button>
                        <button
                          onClick={() => showSanctionConfirm('penalty')}
                          disabled={!canGetPenalty}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: canGetPenalty ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                            color: canGetPenalty ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            cursor: canGetPenalty ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            opacity: canGetPenalty ? 1 : 0.5
                          }}
                          onMouseEnter={(e) => {
                            if (canGetPenalty) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetPenalty) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                            }
                          }}
                        >
                          <div className="sanction-card red" style={{ flexShrink: 0, width: '24px', height: '32px' }}></div>
                          <span>Penalty{!canGetPenalty && ' (Already sanctioned)'}</span>
                        </button>
                        <button
                          onClick={() => showSanctionConfirm('expulsion')}
                          disabled={!canGetExpulsion}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: canGetExpulsion ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                            color: canGetExpulsion ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            cursor: canGetExpulsion ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            opacity: canGetExpulsion ? 1 : 0.5
                          }}
                          onMouseEnter={(e) => {
                            if (canGetExpulsion) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetExpulsion) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                            }
                          }}
                        >
                          <div className="sanction-card combo" style={{ flexShrink: 0, width: '28px', height: '32px' }}></div>
                          <span>Expulsion{!canGetExpulsion && ' (Already sanctioned)'}</span>
                        </button>
                        <button
                          onClick={() => showSanctionConfirm('disqualification')}
                          disabled={false}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <div className="sanction-cards-separate" style={{ flexShrink: 0 }}>
                            <div className="sanction-card yellow" style={{ width: '20px', height: '28px' }}></div>
                            <div className="sanction-card red" style={{ width: '20px', height: '28px' }}></div>
                          </div>
                          <span>Disqualification</span>
                        </button>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Medical Dropdown - MTO / RIT */}
      {injuryDropdown && (() => {
        const isRightSide = injuryDropdown.side === 'right'
        let dropdownStyle
        if (injuryDropdown.x !== undefined && injuryDropdown.y !== undefined) {
          dropdownStyle = {
            position: 'fixed',
            left: isRightSide ? undefined : `${injuryDropdown.x}px`,
            right: isRightSide ? `${window.innerWidth - injuryDropdown.x}px` : undefined,
            top: `${injuryDropdown.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = injuryDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${rect.top + rect.height / 2}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          } : {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000
          }
        }

        const teamLabel = injuryDropdown.team === data?.match?.coinTossTeamA ? 'A' : 'B'
        const playerNumber = injuryDropdown.playerNumber

        return (
          <>
            {/* Backdrop */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999,
                background: 'transparent'
              }}
              onClick={cancelMedical}
            />
            {/* Dropdown */}
            <div style={dropdownStyle} className="modal-wrapper-roll-up">
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '2px solid rgba(220, 38, 38, 0.5)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '220px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '6px' }}>
                  {t('scoreboard.medical', 'Medical')} - {t('scoreboard.team', 'Team')} {teamLabel} #{playerNumber}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* MTO - Medical Timeout */}
                  <button
                    onClick={handleStartMTO}
                    style={{
                      padding: '10px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#fff',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.6)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>MTO</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
                      {t('scoreboard.mtoDescription', '5 min recovery - unlimited')}
                    </span>
                  </button>

                  {/* RIT Section Header */}
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: ritUsedThisMatch ? 'var(--muted)' : 'var(--text)',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>RIT</span>
                    {ritUsedThisMatch && (
                      <span style={{ fontSize: '9px', color: '#ef4444' }}>
                        {t('scoreboard.ritUsed', 'Already used')}
                      </span>
                    )}
                  </div>

                  {/* RIT - No blood */}
                  <button
                    onClick={() => handleStartRIT('no_blood')}
                    disabled={ritUsedThisMatch}
                    style={{
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: ritUsedThisMatch ? 'rgba(100, 100, 100, 0.1)' : 'rgba(249, 115, 22, 0.2)',
                      color: ritUsedThisMatch ? 'var(--muted)' : '#fff',
                      border: `1px solid ${ritUsedThisMatch ? 'rgba(100, 100, 100, 0.2)' : 'rgba(249, 115, 22, 0.4)'}`,
                      borderRadius: '6px',
                      cursor: ritUsedThisMatch ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      opacity: ritUsedThisMatch ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.3)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.6)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)'
                      }
                    }}
                  >
                    {t('scoreboard.ritNoBlood', 'No blood')}
                  </button>

                  {/* RIT - Use of toilet */}
                  <button
                    onClick={() => handleStartRIT('toilet')}
                    disabled={ritUsedThisMatch}
                    style={{
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: ritUsedThisMatch ? 'rgba(100, 100, 100, 0.1)' : 'rgba(249, 115, 22, 0.2)',
                      color: ritUsedThisMatch ? 'var(--muted)' : '#fff',
                      border: `1px solid ${ritUsedThisMatch ? 'rgba(100, 100, 100, 0.2)' : 'rgba(249, 115, 22, 0.4)'}`,
                      borderRadius: '6px',
                      cursor: ritUsedThisMatch ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      opacity: ritUsedThisMatch ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.3)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.6)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)'
                      }
                    }}
                  >
                    {t('scoreboard.ritToilet', 'Use of toilet')}
                  </button>

                  {/* RIT - Severe weather */}
                  <button
                    onClick={() => handleStartRIT('weather')}
                    disabled={ritUsedThisMatch}
                    style={{
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: ritUsedThisMatch ? 'rgba(100, 100, 100, 0.1)' : 'rgba(249, 115, 22, 0.2)',
                      color: ritUsedThisMatch ? 'var(--muted)' : '#fff',
                      border: `1px solid ${ritUsedThisMatch ? 'rgba(100, 100, 100, 0.2)' : 'rgba(249, 115, 22, 0.4)'}`,
                      borderRadius: '6px',
                      cursor: ritUsedThisMatch ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      opacity: ritUsedThisMatch ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.3)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.6)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!ritUsedThisMatch) {
                        e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'
                        e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)'
                      }
                    }}
                  >
                    {t('scoreboard.ritWeather', 'Severe weather')}
                  </button>

                  {!ritUsedThisMatch && (
                    <span style={{ fontSize: '9px', color: 'var(--muted)', textAlign: 'center' }}>
                      {t('scoreboard.ritOnlyOne', 'Only one RIT per match')}
                    </span>
                  )}

                  {/* Cancel */}
                  <button
                    onClick={cancelMedical}
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--muted)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      marginTop: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* MTO/RIT Countdown Modal */}
      {medicalModal && medicalModal.started && (
        <Modal
          title={medicalModal.type === 'mto'
            ? t('scoreboard.mtoTitle', 'Medical Timeout (MTO)')
            : `${t('scoreboard.ritTitle', 'Recovery Interruption Time (RIT)')} - ${
                medicalModal.ritType === 'no_blood' ? t('scoreboard.ritNoBlood', 'No blood') :
                medicalModal.ritType === 'toilet' ? t('scoreboard.ritToilet', 'Use of toilet') :
                t('scoreboard.ritWeather', 'Severe weather')
              }`
          }
          open={true}
          onClose={() => {}}
          width={400}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {/* Team and Player Info */}
            <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)' }}>
              {t('scoreboard.team', 'Team')} {medicalModal.team === data?.match?.coinTossTeamA ? 'A' : 'B'} #{medicalModal.playerNumber}
            </div>

            {/* Countdown Display */}
            <div style={{
              fontSize: '72px',
              fontWeight: 700,
              fontFamily: scoreFont === 'orbitron' ? "'Orbitron', monospace" : 'inherit',
              color: medicalModal.countdown <= 30 ? '#ef4444' : 'var(--text)',
              marginBottom: '8px',
              lineHeight: 1
            }}>
              {Math.floor(medicalModal.countdown / 60)}:{String(medicalModal.countdown % 60).padStart(2, '0')}
            </div>

            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '24px'
            }}>
              <div style={{
                width: `${(medicalModal.countdown / 300) * 100}%`,
                height: '100%',
                background: medicalModal.countdown <= 30 ? '#ef4444' : medicalModal.type === 'mto' ? '#3b82f6' : '#f97316',
                transition: 'width 0.1s linear'
              }} />
            </div>

            {/* Outcome Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {/* Player Recovered */}
              <button
                onClick={() => handleMedicalOutcome('recovered')}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#16a34a'
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#22c55e'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                {t('scoreboard.playerRecovered', 'Player Recovered')}
              </button>

              {/* Forfeit */}
              <button
                onClick={() => handleMedicalOutcome('forfeit')}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#b91c1c'
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#dc2626'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                {t('scoreboard.forfeit', 'Forfeit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Keyboard Shortcuts Configuration Modal */}
      {keybindingsModalOpen && (
        <Modal
          title={t('scoreboard.menu.keyboardShortcuts')}
          open={true}
          onClose={() => {
            setKeybindingsModalOpen(false)
            setEditingKey(null)
          }}
          width={500}
        >
          <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
            <p style={{ marginBottom: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {t('scoreboard.keybindings.instruction', 'Click on a key to change it. Press the new key to assign, or Escape to cancel.')}
            </p>
            {[
              { key: 'pointLeft', labelKey: 'scoreboard.keybindings.pointLeftTeam', descKey: 'scoreboard.keybindings.pointLeftTeamDesc', label: 'Point Left Team', description: 'Award point to left team' },
              { key: 'pointRight', labelKey: 'scoreboard.keybindings.pointRightTeam', descKey: 'scoreboard.keybindings.pointRightTeamDesc', label: 'Point Right Team', description: 'Award point to right team' },
              { key: 'timeoutLeft', labelKey: 'scoreboard.keybindings.timeoutLeftTeam', descKey: 'scoreboard.keybindings.timeoutLeftTeamDesc', label: 'Timeout Left Team', description: 'Call timeout for left team' },
              { key: 'timeoutRight', labelKey: 'scoreboard.keybindings.timeoutRightTeam', descKey: 'scoreboard.keybindings.timeoutRightTeamDesc', label: 'Timeout Right Team', description: 'Call timeout for right team' },

              { key: 'undo', labelKey: 'scoreboard.keybindings.undo', descKey: 'scoreboard.keybindings.undoDesc', label: 'Undo', description: 'Undo last action' },
              { key: 'startRally', labelKey: 'scoreboard.keybindings.startRallyConfirm', descKey: 'scoreboard.keybindings.startRallyConfirmDesc', label: 'Start Rally / Confirm', description: 'Start rally or confirm modal' },
              { key: 'cancel', labelKey: 'scoreboard.keybindings.cancelClose', descKey: 'scoreboard.keybindings.cancelCloseDesc', label: 'Cancel / Close', description: 'Cancel or close menus' }
            ].map(({ key, labelKey, descKey, label, description }) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: editingKey === key ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: editingKey === key ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{t(labelKey, label)}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{t(descKey, description)}</div>
                </div>
                <button
                  onClick={() => {
                    if (editingKey === key) {
                      setEditingKey(null)
                    } else {
                      setEditingKey(key)
                      // Listen for next keypress
                      const handleKeyCapture = (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (e.key === 'Escape') {
                          setEditingKey(null)
                        } else {
                          const newBindings = { ...keyBindings, [key]: e.key }
                          setKeyBindings(newBindings)
                          localStorage.setItem('keyBindings', JSON.stringify(newBindings))
                          setEditingKey(null)
                        }
                        window.removeEventListener('keydown', handleKeyCapture, true)
                      }
                      window.addEventListener('keydown', handleKeyCapture, true)
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: editingKey === key ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                    color: editingKey === key ? '#fff' : 'var(--text)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    minWidth: '80px',
                    textAlign: 'center'
                  }}
                >
                  {editingKey === key ? t('scoreboard.keybindings.pressKey', 'Press key...') : (
                    keyBindings[key] === ' ' ? 'Space' :
                      keyBindings[key] === 'Enter' ? 'Enter' :
                        keyBindings[key] === 'Escape' ? 'Esc' :
                          keyBindings[key] === 'Backspace' ? 'Backspace' :
                            keyBindings[key] === 'ArrowUp' ? '↑' :
                              keyBindings[key] === 'ArrowDown' ? '↓' :
                                keyBindings[key] === 'ArrowLeft' ? '←' :
                                  keyBindings[key] === 'ArrowRight' ? '→' :
                                    keyBindings[key].toUpperCase()
                  )}
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setKeyBindings(defaultKeyBindings)
                  localStorage.setItem('keyBindings', JSON.stringify(defaultKeyBindings))
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--text)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {t('scoreboard.keybindings.resetToDefaults', 'Reset to Defaults')}
              </button>
              <button
                onClick={() => {
                  setKeybindingsModalOpen(false)
                  setEditingKey(null)
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {t('scoreboard.keybindings.done', 'Done')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Accidental Rally Start Confirmation Modal */}
      {accidentalRallyConfirmModal && (
        <Modal
          title={t('scoreboard.modals.confirmRallyStart')}
          open={true}
          onClose={() => setAccidentalRallyConfirmModal(null)}
          width={320}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', fontSize: '48px' }}>⚠️</div>
            <p style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
              {t('scoreboard.confirm.rallyStartedQuickly')}
            </p>
            <p style={{ marginBottom: '24px', fontSize: '12px', color: 'var(--muted)' }}>
              {t('scoreboard.confirm.areYouSureRallyStarted')}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={accidentalRallyConfirmModal.onConfirm}
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
                {t('scoreboard.confirm.yesStartRally')}
              </button>
              <button
                onClick={() => setAccidentalRallyConfirmModal(null)}
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
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Accidental Point Award Confirmation Modal */}
      {accidentalPointConfirmModal && (
        <Modal
          title={t('scoreboard.modals.confirmPoint')}
          open={true}
          onClose={() => setAccidentalPointConfirmModal(null)}
          width={320}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', fontSize: '48px' }}>⚠️</div>
            <p style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
              {t('scoreboard.confirm.pointAwardedQuickly')}
            </p>
            <p style={{ marginBottom: '24px', fontSize: '12px', color: 'var(--muted)' }}>
              {t('scoreboard.confirm.areYouSureAwardPoint', { team: accidentalPointConfirmModal.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2') })}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={accidentalPointConfirmModal.onConfirm}
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
                {t('scoreboard.confirm.yesAwardPoint')}
              </button>
              <button
                onClick={() => setAccidentalPointConfirmModal(null)}
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
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Duplicate Timeout Confirmation Modal */}
      {duplicateTimeoutConfirm && (
        <Modal
          title={t('scoreboard.modals.confirmTimeout', 'Confirm Timeout')}
          open={true}
          onClose={() => setDuplicateTimeoutConfirm(null)}
          width={320}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px', fontSize: '48px' }}>⏱️</div>
            <p style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
              {t('scoreboard.confirm.timeoutAlreadyTaken', 'Timeout already taken')}
            </p>
            <p style={{ marginBottom: '24px', fontSize: '12px', color: 'var(--muted)' }}>
              {t('scoreboard.confirm.areYouSureAnotherTimeout', {
                team: duplicateTimeoutConfirm.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2'),
                defaultValue: `${duplicateTimeoutConfirm.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')} already has a timeout with no points since. Are you sure you want another timeout?`
              })}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const team = duplicateTimeoutConfirm.team
                  setDuplicateTimeoutConfirm(null)
                  setTimeoutModal({ team, countdown: 60, started: false })
                }}
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
                {t('scoreboard.confirm.yesTimeout', 'Yes, Timeout')}
              </button>
              <button
                onClick={() => setDuplicateTimeoutConfirm(null)}
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
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {sanctionConfirmModal && (() => {
        const teamData = sanctionConfirmModal.team === 'team1' ? data?.team1Team : data?.team2Team
        const teamColor = teamData?.color || (sanctionConfirmModal.team === 'team1' ? '#ef4444' : '#3b82f6')
        const teamLabel = sanctionConfirmModal.team === teamAKey ? 'A' : 'B'
        const teamName = teamData?.name || (sanctionConfirmModal.team === 'team1' ? 'team1' : 'team2')
        const isBright = isBrightColor(teamColor)

        return (
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>{teamName}</span>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: teamColor,
                  color: isBright ? '#000' : '#fff'
                }}>{teamLabel}</span>
              </div>
            }
            open={true}
            onClose={cancelSanctionConfirm}
            width={240}
            hideCloseButton={true}
          >
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                {sanctionConfirmModal.type === 'player' && `#${sanctionConfirmModal.playerNumber}`}
                {sanctionConfirmModal.type === 'official' && `${sanctionConfirmModal.role}`}
              </p>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {sanctionConfirmModal.sanctionType === 'warning' && <div className="sanction-card yellow" style={{ width: '28px', height: '38px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'penalty' && <div className="sanction-card red" style={{ width: '28px', height: '38px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'expulsion' && <div className="sanction-card combo" style={{ width: '32px', height: '38px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'disqualification' && (
                  <div className="sanction-cards-separate">
                    <div className="sanction-card yellow" style={{ width: '24px', height: '32px' }}></div>
                    <div className="sanction-card red" style={{ width: '24px', height: '32px' }}></div>
                  </div>
                )}
              </div>
              <p style={{ marginBottom: '16px', fontSize: '13px', fontWeight: 600 }}>
                {sanctionConfirmModal.sanctionType === 'warning' && 'Warning'}
                {sanctionConfirmModal.sanctionType === 'penalty' && 'Penalty'}
                {sanctionConfirmModal.sanctionType === 'expulsion' && 'Expulsion'}
                {sanctionConfirmModal.sanctionType === 'disqualification' && 'Disqualification'}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={confirmPlayerSanction}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={cancelSanctionConfirm}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'var(--text)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}


      {reopenSetConfirm && (
        <Modal
          title={t('scoreboard.modals.reopenSet')}
          open={true}
          onClose={() => setReopenSetConfirm(null)}
          width={400}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px' }}>
              Reopen Set {reopenSetConfirm.setIndex}? This will delete all subsequent sets and their events.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  // Mark the set as not finished
                  await db.sets.update(reopenSetConfirm.setId, { finished: false })

                  // Delete all subsequent sets
                  const allSets = await db.sets.where('matchId').equals(matchId).toArray()
                  const setsToDelete = allSets.filter(s => s.index > reopenSetConfirm.setIndex)
                  for (const s of setsToDelete) {
                    // Delete events for this set
                    await db.events.where('matchId').equals(matchId).and(e => e.setIndex === s.index).delete()
                    // Delete the set
                    await db.sets.delete(s.id)
                  }

                  // Update match status back to 'live' if it was 'final'
                  if (data.match?.status === 'final') {
                    await db.matches.update(matchId, { status: 'live' })
                  }

                  setReopenSetConfirm(null)
                }}
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
                Yes, Reopen
              </button>
              <button
                onClick={() => setReopenSetConfirm(null)}
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

      {setStartTimeModal && (
        <SetStartTimeModal
          setIndex={setStartTimeModal.setIndex}
          defaultTime={setStartTimeModal.defaultTime}
          onConfirm={confirmSetStartTime}
          onCancel={() => setSetStartTimeModal(null)}
        />
      )}

      {setEndTimeModal && (
        <SetEndTimeModal
          setIndex={setEndTimeModal.setIndex}
          winner={setEndTimeModal.winner}
          team1Points={setEndTimeModal.team1Points}
          team2Points={setEndTimeModal.team2Points}
          defaultTime={setEndTimeModal.defaultTime}
          teamAKey={teamAKey}
          leftisTeam1={leftisTeam1}
          isMatchEnd={setEndTimeModal.isMatchEnd}
          team1TeamName={leftisTeam1 ? leftTeam.name : rightTeam.name}
          team2TeamName={leftisTeam1 ? rightTeam.name : leftTeam.name}
          team1TeamColor={data?.team1Team?.color || '#ef4444'}
          team2TeamColor={data?.team2Team?.color || '#3b82f6'}
          losingTeamBmpRemaining={(() => {
            const losingTeam = setEndTimeModal.winner === 'team1' ? 'team2' : 'team1'
            const unsuccessfulUsed = getUnsuccessfulBMPsUsed(losingTeam)
            return Math.max(0, 2 - unsuccessfulUsed)
          })()}
          onBmpRequest={(teamKey) => {
            // Close set end modal and open BMP modal
            setSetEndTimeModal(null)
            handleTeamBMP(teamKey)
          }}
          onConfirm={confirmSetEndTime}
          onDecisionChange={async () => {
            // Track that user dismissed via undo to prevent re-showing
            setEndModalDismissedRef.current = setEndTimeModal.setIndex

            // Find the last point event directly and open decision modal
            if (data?.events && data?.set) {
              const currentSetEvents = data.events
                .filter(e => e.setIndex === data.set.index)
                .sort((a, b) => (b.seq || 0) - (a.seq || 0))

              // Find the last POINT event (ignoring set_end, sanctions, etc that might be after it)
              // We need to find the actual point that caused the set end condition
              const pointEvent = currentSetEvents.find(e => e.type === 'point')

              if (pointEvent) {
                // Open decision modal (no selectedOption forces choice)
                setReplayRallyConfirm({ event: pointEvent, description: 'Decision Change', selectedOption: null })
              }
            }

            // Close the set end modal
            setSetEndTimeModal(null)
          }}
        />
      )}

      {/* Sync Progress Modal - shown during set end sync */}
      <SyncProgressModal_beach
        open={syncModalOpen}
        steps={syncState?.steps || []}
        errorMessage={syncState?.hasError ? t('scoreboard.sync.syncError', 'Sync failed. Data saved locally.') : null}
        onProceed={handleSyncProceed}
        isComplete={syncState?.isComplete || false}
        hasError={syncState?.hasError || false}
        hasWarning={syncState?.hasWarning || false}
      />

      {toSubDetailsModal && (
        <ToSubDetailsModal
          type={toSubDetailsModal.type}
          side={toSubDetailsModal.side}
          timeoutDetails={toSubDetailsModal.type === 'timeout' ? getTimeoutDetails(toSubDetailsModal.side) : null}
          substitutionDetails={toSubDetailsModal.type === 'substitution' ? getSubstitutionDetails(toSubDetailsModal.side) : null}
          teamName={toSubDetailsModal.side === 'left'
            ? (leftisTeam1 ? (data?.team1Team?.name || 'Left Team') : (data?.team2Team?.name || 'Left Team'))
            : (leftisTeam1 ? (data?.team2Team?.name || 'Right Team') : (data?.team1Team?.name || 'Right Team'))}
          onClose={() => setToSubDetailsModal(null)}
        />
      )}

      {sanctionConfirm && (
        <Modal
          title={t('scoreboard.modals.confirmSanction')}
          open={true}
          onClose={() => setSanctionConfirm(null)}
          width={400}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px' }}>
              Apply {sanctionConfirm.type === 'improper_request' ? 'Improper Request' :
                sanctionConfirm.type === 'delay_warning' ? 'Delay Warning' :
                  'Delay Penalty'} to Team {(() => {
                    const sideTeamKey = sanctionConfirm.side === 'left' ? (leftisTeam1 ? 'team1' : 'team2') : (leftisTeam1 ? 'team2' : 'team1')
                    return sideTeamKey === teamAKey ? 'A' : 'B'
                  })()}?
            </p>
            {sanctionConfirm.type === 'delay_penalty' && (
              <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)', fontStyle: 'italic' }}>
                This will award a point and service to the opponent team
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmSanction}
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
                onClick={() => setSanctionConfirm(null)}
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
                No
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Connection Status Popover */}
      {connectionModal && connectionModal !== 'teamA' && connectionModal !== 'teamB' && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConnectionModal(null)
            }
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            background: 'transparent'
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${connectionModalPosition.x}px`,
              top: `${connectionModalPosition.y}px`,
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px',
              padding: '16px',
              minWidth: '200px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 10001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thought bubble tail */}
            <div style={{
              position: 'absolute',
              top: '-7px',
              left: '20px',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderBottom: '8px solid rgba(15, 23, 42, 0.98)'
            }} />
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: '20px',
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderBottom: '8px solid rgba(255,255,255,0.2)'
            }} />

            <div style={{ marginBottom: '12px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  {connectionModal === 'referee' ? 'Referee Connection' : connectionModal === 'teamA' ? `Team ${teamAShortName} Connection` : `Team ${teamBShortName} Connection`}
                </span>
                <button
                  onClick={() => setConnectionModal(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '18px',
                    lineHeight: 1,
                    padding: 0,
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: '8px 0'
              }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Enable Dashboard
                </span>
                <div style={{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  background: (connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team1TeamConnectionEnabled : team2TeamConnectionEnabled) ? '#22c55e' : '#6b7280',
                  borderRadius: '12px',
                  transition: 'background 0.2s',
                  cursor: 'pointer'
                }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (connectionModal === 'referee') {
                      handleRefereeConnectionToggle(!refereeConnectionEnabled)
                    } else if (connectionModal === 'teamA') {
                      handleteam1TeamConnectionToggle(!team1TeamConnectionEnabled)
                    } else if (connectionModal === 'teamB') {
                      handleteam2TeamConnectionToggle(!team2TeamConnectionEnabled)
                    }
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: (connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team1TeamConnectionEnabled : team2TeamConnectionEnabled) ? '22px' : '2px',
                    width: '20px',
                    height: '20px',
                    background: '#fff',
                    borderRadius: '50%',
                    transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </div>
              </label>

              {(connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team1TeamConnectionEnabled : team2TeamConnectionEnabled) && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PIN
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: '18px',
                      color: 'var(--accent)',
                      letterSpacing: '2px',
                      fontFamily: 'monospace'
                    }}>
                      {connectionModal === 'referee'
                        ? (data?.match?.refereePin || '—')
                        : connectionModal === 'teamA'
                          ? (data?.match?.team1TeamPin || '—')
                          : (data?.match?.team2TeamPin || '—')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditPin(connectionModal === 'referee' ? 'referee' : connectionModal === 'teamA' ? 'teamA' : 'teamB')
                        setConnectionModal(null)
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: 'rgba(255,255,255,0.1)',
                        color: 'var(--text)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit PIN Modal */}
      {editPinModal && (
        <Modal
          title={editPinType === 'referee' ? 'Edit Referee PIN' : editPinType === 'teamA' ? `Edit Team ${teamAShortName} PIN` : `Edit Team ${teamBShortName} PIN`}
          open={true}
          onClose={() => {
            setEditPinModal(false)
            setPinError('')
            setEditPinType(null)
          }}
          width={400}
        >
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Enter new 6-digit PIN:
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newPin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  if (value.length <= 6) {
                    setNewPin(value)
                    setPinError('')
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
                  border: pinError ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              {pinError && (
                <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>
                  {pinError}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setEditPinModal(false)
                  setPinError('')
                  setEditPinType(null)
                }}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: 'rgba(255,255,255,0.1)',
                  color: 'var(--text)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePin}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Save PIN
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* TTO (Technical Timeout) Modal - at 21 points in Sets 1-2 with 60s countdown */}
      {ttoModal && (
        <Modal
          title="Technical Timeout"
          open={true}
          onClose={() => { }}
          width={450}
          hideCloseButton={true}
          zIndex={2000}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
              Technical Timeout at 21 points
            </p>
            <div style={{ marginBottom: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{ background: data?.team1Team?.color || '#ef4444', color: isBrightColor(data?.team1Team?.color || '#ef4444') ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{teamAKey === 'team1' ? 'A' : 'B'}</span>
              <span>{data?.team1Team?.shortName || data?.team1Team?.name || 'Team 1'}</span>
              <strong style={{ fontSize: '20px' }}>{ttoModal.team1Points} : {ttoModal.team2Points}</strong>
              <span>{data?.team2Team?.shortName || data?.team2Team?.name || 'Team 2'}</span>
              <span style={{ background: data?.team2Team?.color || '#3b82f6', color: isBrightColor(data?.team2Team?.color || '#3b82f6') ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{teamAKey === 'team2' ? 'A' : 'B'}</span>
            </div>
            {ttoModal.triggerCourtSwitchAfter && (
              <p style={{ marginBottom: '16px', fontSize: '13px', color: '#facc15', fontWeight: 500 }}>
                Courts will switch when TTO ends
              </p>
            )}
            {ttoModal.started ? (
              <div
                onClick={handleTtoEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  margin: '0 auto'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              >
                {/* Stop sign icon - left side */}
                <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                  <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                  <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                </svg>
                {/* Countdown content - center */}
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <div style={{
                    fontSize: '42px',
                    fontWeight: 700,
                    color: ttoModal.countdown <= 10 ? '#ef4444' : 'var(--accent)',
                    fontFamily: getScoreFont(),
                    textAlign: 'center',
                    lineHeight: 1
                  }}>
                    {formatTimeout(ttoModal.countdown)}
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div style={{
                      width: `${(ttoModal.countdown / 60) * 100}%`,
                      height: '100%',
                      background: ttoModal.countdown <= 10 ? '#ef4444' : 'var(--accent)',
                      borderRadius: '3px',
                      transition: 'width 1s linear',
                      marginLeft: 'auto'
                    }} />
                  </div>
                  {ttoModal.triggerCourtSwitchAfter && (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '6px' }}>
                      Click to end & switch courts
                    </div>
                  )}
                </div>
                {/* Stop sign icon - right side */}
                <svg viewBox="0 0 24 24" width="45" height="45" style={{ flexShrink: 0 }}>
                  <polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86" fill="#ef4444" />
                  <text x="12" y="13" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="5" fontWeight="bold">STOP</text>
                </svg>
              </div>
            ) : (
              <>
                <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)' }}>
                  Technical timeout is automatic at 21 points.
                </p>
                <button
                  onClick={() => setTtoModal(prev => ({ ...prev, started: true }))}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Start TTO
                </button>
                {/* BMP Request for losing team - only before countdown starts */}
                {(() => {
                  const losingTeamKey = ttoModal.teamThatScored === 'team1' ? 'team2' : 'team1'
                  const bmpUsed = getUnsuccessfulBMPsUsed(losingTeamKey)
                  const bmpRemaining = 2 - bmpUsed
                  const bmpAvailable = bmpRemaining > 0

                  if (!bmpAvailable) return null

                  const losingTeamData = losingTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                  const losingTeamColor = losingTeamData?.color || (losingTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                  const losingTeamLabel = losingTeamKey === teamAKey ? 'A' : 'B'

                  return (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleTeamBMP(losingTeamKey)}
                        style={{
                          padding: '10px 20px',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: 'transparent',
                          color: '#f97316',
                          border: '2px solid #f97316',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <span style={{
                          background: losingTeamColor,
                          color: isBrightColor(losingTeamColor) ? '#000' : '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700
                        }}>
                          {losingTeamLabel}
                        </span>
                        BMP Request
                        <span style={{
                          background: '#f97316',
                          color: '#000',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>{bmpRemaining}</span>
                      </button>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </Modal>
      )}

      {/* "One point to switch/TTO" popup notification */}
      {preEventPopup && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          color: 'white',
          padding: '24px 48px',
          borderRadius: '16px',
          fontSize: '30px',
          fontWeight: 'bold',
          zIndex: 1500,
          pointerEvents: 'none',
          animation: 'preEventPulse 1s ease-in-out infinite'
        }}>
          {preEventPopup.message}
        </div>
      )}

      {/* BMP Outcome Modal */}
      {bmpOutcomeModal && (() => {
        const currentScore = bmpOutcomeModal.currentScore || { team1: 0, team2: 0 }
        const currentServe = bmpOutcomeModal.currentServe
        const requestingTeam = bmpOutcomeModal.team
        const isReferee = bmpOutcomeModal.type === 'referee'

        // Get team colors and labels (team1 = team1Team, team2 = team2Team)
        const team1Color = leftisTeam1 ? leftTeam?.color : rightTeam?.color
        const team2Color = leftisTeam1 ? rightTeam?.color : leftTeam?.color
        const team1Label = leftisTeam1 ? 'A' : 'B'
        const team2Label = leftisTeam1 ? 'B' : 'A'
        const team1Name = leftisTeam1 ? leftTeam?.name : rightTeam?.name
        const team2Name = leftisTeam1 ? rightTeam?.name : leftTeam?.name

        // Calculate what score/serve would be if BMP is successful
        // For team BMP: REVERSE the point - remove from opponent, give to requesting team
        // For referee BMP: no change to current score (ref BMP awards point via separate UI)
        const successScore = isReferee ? currentScore : {
          // Remove 1 from opponent, add 1 to requesting team
          team1: requestingTeam === 'team1'
            ? currentScore.team1 + 1  // Requesting team gets +1
            : Math.max(0, currentScore.team1 - 1),  // Opponent loses 1
          team2: requestingTeam === 'team2'
            ? currentScore.team2 + 1  // Requesting team gets +1
            : Math.max(0, currentScore.team2 - 1)   // Opponent loses 1
        }
        const successServe = isReferee ? currentServe : requestingTeam

        return (
          <Modal
            title={isReferee ? 'Referee Ball Mark Protocol' : 'Ball Mark Protocol'}
            open={true}
            onClose={() => setBmpOutcomeModal(null)}
            width={500}
            zIndex={2100}
          >
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)', textAlign: 'center' }}>
                {isReferee ? (
                  'Referee ball mark check'
                ) : (
                  <span>BMP requested by <strong><span style={{ background: requestingTeam === 'team1' ? team1Color : team2Color, color: isBrightColor(requestingTeam === 'team1' ? team1Color : team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginRight: '4px' }}>{requestingTeam === 'team1' ? team1Label : team2Label}</span>{requestingTeam === 'team1' ? team1Name : team2Name}</strong></span>
                )}
              </p>


              {/* Outcome buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {isReferee ? (
                  <>
                    {/* Referee BMP: Point Left | Mark Unavailable | Point Right in a row */}
                    {(() => {
                      // Get team A and team B keys
                      const teamATeamKey = teamAKey // 'team1' or 'team2'
                      const teamBTeamKey = teamBKey // 'team1' or 'team2'
                      const teamAName = teamATeamKey === 'team1' ? team1Name : team2Name
                      const teamBName = teamBTeamKey === 'team1' ? team1Name : team2Name
                      const teamAColor = teamATeamKey === 'team1' ? team1Color : team2Color
                      const teamBColor = teamBTeamKey === 'team1' ? team1Color : team2Color

                      // Determine left/right team based on court position
                      // leftTeam = team that's on the left side of the court
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const leftLabel = leftTeamKey === teamATeamKey ? 'A' : 'B'
                      const rightLabel = rightTeamKey === teamATeamKey ? 'A' : 'B'
                      const leftTeamName = leftTeamKey === 'team1' ? team1Name : team2Name
                      const rightTeamName = rightTeamKey === 'team1' ? team1Name : team2Name
                      const leftTeamColor = leftTeamKey === 'team1' ? team1Color : team2Color
                      const rightTeamColor = rightTeamKey === 'team1' ? team1Color : team2Color

                      // Calculate scores if point is awarded
                      const getScoreForTeam = (awardToTeam) => {
                        const newTeam1 = awardToTeam === 'team1' ? currentScore.team1 + 1 : currentScore.team1
                        const newTeam2 = awardToTeam === 'team2' ? currentScore.team2 + 1 : currentScore.team2
                        const newServe = awardToTeam // Point winner gets serve
                        return {
                          team1: newTeam1,
                          team2: newTeam2,
                          serve: newServe
                        }
                      }

                      const leftTeamScore = getScoreForTeam(leftTeamKey)
                      const rightTeamScore = getScoreForTeam(rightTeamKey)

                      // Determine which team is selected (if any)
                      const selectedTeam = bmpSelectedOutcome === 'left' ? 'left'
                        : bmpSelectedOutcome === 'right' ? 'right'
                        : bmpSelectedOutcome === 'judgment_impossible' ? 'unavailable'
                        : null

                      return (
                        <>
                          {/* Button row: Point Left | Mark Unavailable | Point Right */}
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
                            {/* Point Left Button */}
                            <button
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'left' ? null : 'left')}
                              style={{
                                flex: 1,
                                padding: '10px 8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                background: selectedTeam === 'left' ? '#ca8a04' : '#eab308',
                                color: '#000',
                                border: selectedTeam === 'left' ? '2px solid #fde047' : '2px solid transparent',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <span style={{ background: leftTeamColor, color: isBrightColor(leftTeamColor) ? '#000' : '#fff', padding: '2px 5px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{leftLabel}</span>
                              <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leftTeamName}</span>
                            </button>
                            {/* Mark Unavailable Button */}
                            <button
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'judgment_impossible' ? null : 'judgment_impossible')}
                              style={{
                                flex: 1,
                                padding: '10px 8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: selectedTeam === 'unavailable' ? '#6b7280' : '#9ca3af',
                                color: '#fff',
                                border: selectedTeam === 'unavailable' ? '2px solid #d1d5db' : '2px solid transparent',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              Unavailable
                            </button>
                            {/* Point Right Button */}
                            <button
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'right' ? null : 'right')}
                              style={{
                                flex: 1,
                                padding: '10px 8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                background: selectedTeam === 'right' ? '#ca8a04' : '#eab308',
                                color: '#000',
                                border: selectedTeam === 'right' ? '2px solid #fde047' : '2px solid transparent',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <span style={{ background: rightTeamColor, color: isBrightColor(rightTeamColor) ? '#000' : '#fff', padding: '2px 5px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{rightLabel}</span>
                              <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rightTeamName}</span>
                            </button>
                          </div>

                          {/* Shared expansion area */}
                          {selectedTeam && (
                            <div style={{
                              background: selectedTeam === 'unavailable' ? 'rgba(156, 163, 175, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              border: selectedTeam === 'unavailable' ? '2px solid #9ca3af' : '2px solid #eab308',
                              borderRadius: '10px',
                              padding: '12px',
                              transition: 'all 0.2s ease'
                            }}>
                              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                  <span>Current:</span>
                                  <span><strong>{currentScore.team1} : {currentScore.team2}</strong> · 🏐 {currentServe === 'team1' ? team1Name : team2Name}</span>
                                </div>
                                {selectedTeam === 'unavailable' ? (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(156, 163, 175, 0.15)', borderRadius: '6px', border: '1px solid rgba(156, 163, 175, 0.3)' }}>
                                    <span style={{ color: '#9ca3af' }}>No change:</span>
                                    <span><strong>{currentScore.team1} : {currentScore.team2}</strong> · 🏐 {currentServe === 'team1' ? team1Name : team2Name}</span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(234, 179, 8, 0.15)', borderRadius: '6px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                                    <span style={{ color: '#eab308' }}>New:</span>
                                    <span><strong style={{ color: '#eab308' }}>
                                      {selectedTeam === 'left' ? leftTeamScore.team1 : rightTeamScore.team1} : {selectedTeam === 'left' ? leftTeamScore.team2 : rightTeamScore.team2}
                                    </strong> · 🏐 {(selectedTeam === 'left' ? leftTeamScore.serve : rightTeamScore.serve) === 'team1' ? team1Name : team2Name}</span>
                                  </div>
                                )}
                              </div>
                              {selectedTeam === 'unavailable' ? (
                                <button
                                  onClick={() => handleBMPOutcome('judgment_impossible')}
                                  style={{
                                    width: '100%',
                                    padding: '10px 20px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    background: 'var(--accent)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Confirm Unavailable
                                </button>
                              ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    onClick={() => handleBMPOutcome('in', selectedTeam === 'left' ? leftTeamKey : rightTeamKey)}
                                    style={{
                                      flex: 1,
                                      padding: '10px 16px',
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      background: '#374151',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    IN
                                  </button>
                                  <button
                                    onClick={() => handleBMPOutcome('out', selectedTeam === 'left' ? leftTeamKey : rightTeamKey)}
                                    style={{
                                      flex: 1,
                                      padding: '10px 16px',
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      background: '#374151',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    OUT
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </>
                ) : (
                  <>
                    {/* Team BMP: Successful | Unsuccessful | Mark Unavailable in a row */}
                    {/* Button row */}
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
                      <button
                        onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'successful' ? null : 'successful')}
                        style={{
                          flex: 1,
                          padding: '12px 8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: bmpSelectedOutcome === 'successful' ? '#16a34a' : '#22c55e',
                          color: '#fff',
                          border: bmpSelectedOutcome === 'successful' ? '2px solid #86efac' : '2px solid transparent',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Successful
                      </button>
                      <button
                        onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'unsuccessful' ? null : 'unsuccessful')}
                        style={{
                          flex: 1,
                          padding: '12px 8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: bmpSelectedOutcome === 'unsuccessful' ? '#dc2626' : '#ef4444',
                          color: '#fff',
                          border: bmpSelectedOutcome === 'unsuccessful' ? '2px solid #fca5a5' : '2px solid transparent',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Unsuccessful
                      </button>
                      <button
                        onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'judgment_impossible' ? null : 'judgment_impossible')}
                        style={{
                          flex: 1,
                          padding: '12px 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: bmpSelectedOutcome === 'judgment_impossible' ? '#6b7280' : '#9ca3af',
                          color: '#fff',
                          border: bmpSelectedOutcome === 'judgment_impossible' ? '2px solid #d1d5db' : '2px solid transparent',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Unavailable
                      </button>
                    </div>

                    {/* Shared expansion area */}
                    {(bmpSelectedOutcome === 'successful' || bmpSelectedOutcome === 'unsuccessful' || bmpSelectedOutcome === 'judgment_impossible') && (
                      <div style={{
                        background: bmpSelectedOutcome === 'successful' ? 'rgba(34, 197, 94, 0.15)'
                          : bmpSelectedOutcome === 'unsuccessful' ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(156, 163, 175, 0.15)',
                        border: bmpSelectedOutcome === 'successful' ? '2px solid #22c55e'
                          : bmpSelectedOutcome === 'unsuccessful' ? '2px solid #ef4444'
                          : '2px solid #9ca3af',
                        borderRadius: '10px',
                        padding: '12px',
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                            <span>Current:</span>
                            <span><strong>{currentScore.team1} : {currentScore.team2}</strong> · 🏐 {currentServe === 'team1' ? team1Name : team2Name}</span>
                          </div>
                          {bmpSelectedOutcome === 'successful' ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                              <span style={{ color: '#22c55e' }}>New:</span>
                              <span><strong style={{ color: '#22c55e' }}>{successScore.team1} : {successScore.team2}</strong> · 🏐 {successServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          ) : bmpSelectedOutcome === 'unsuccessful' ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                              <span style={{ color: '#ef4444' }}>No change:</span>
                              <span><strong>{currentScore.team1} : {currentScore.team2}</strong> · 🏐 {currentServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(156, 163, 175, 0.15)', borderRadius: '6px', border: '1px solid rgba(156, 163, 175, 0.3)' }}>
                              <span style={{ color: '#9ca3af' }}>No change:</span>
                              <span><strong>{currentScore.team1} : {currentScore.team2}</strong> · 🏐 {currentServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleBMPOutcome(bmpSelectedOutcome)}
                          style={{
                            width: '100%',
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            background: 'var(--accent)',
                            color: '#000',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          Confirm {bmpSelectedOutcome === 'successful' ? 'Successful' : bmpSelectedOutcome === 'unsuccessful' ? 'Unsuccessful' : 'Unavailable'}
                        </button>
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setBmpSelectedOutcome(null); setBmpOutcomeModal(null) }}
                  className="secondary"
                  style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Court Switch Modal (5th Set at 8 points) - highest priority, blocks everything */}
      {courtSwitchModal && (
        <Modal
          title={t('scoreboard.modals.courtSwitchRequired')}
          open={true}
          onClose={() => { }}
          width={450}
          hideCloseButton={true}
          zIndex={2000}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
              {t('scoreboard.modals.teamsMustSwitchCourts')}
            </p>
            <div style={{ marginBottom: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{ background: data?.team1Team?.color || '#ef4444', color: isBrightColor(data?.team1Team?.color || '#ef4444') ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{teamAKey === 'team1' ? 'A' : 'B'}</span>
              <span>{data?.team1Team?.shortName || data?.team1Team?.name || 'Team 1'}</span>
              <strong style={{ fontSize: '20px' }}>{courtSwitchModal.team1Points} : {courtSwitchModal.team2Points}</strong>
              <span>{data?.team2Team?.shortName || data?.team2Team?.name || 'Team 2'}</span>
              <span style={{ background: data?.team2Team?.color || '#3b82f6', color: isBrightColor(data?.team2Team?.color || '#3b82f6') ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{teamAKey === 'team2' ? 'A' : 'B'}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmCourtSwitch}
                style={{
                  flex: '1 1 0',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {t('scoreboard.buttons.switchCourts')}
              </button>
              <button
                onClick={() => {
                  // Find the last point event to open decision change modal
                  if (data?.events && data?.set) {
                    const currentSetEvents = data.events
                      .filter(e => e.setIndex === data.set.index)
                      .sort((a, b) => (b.seq || 0) - (a.seq || 0))

                    const pointEvent = currentSetEvents.find(e => e.type === 'point')
                    if (pointEvent) {
                      setReplayRallyConfirm({ event: pointEvent, description: 'Decision Change', selectedOption: null })
                    }
                  }
                  // Close court switch modal
                  setCourtSwitchModal(null)
                }}
                style={{
                  flex: '1 1 0',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: '#facc15',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {t('scoreboard.buttons.decisionChange')}
              </button>
            </div>
            {/* BMP Request for losing team */}
            {(() => {
              const losingTeamKey = courtSwitchModal.teamThatScored === 'team1' ? 'team2' : 'team1'
              const bmpUsed = getUnsuccessfulBMPsUsed(losingTeamKey)
              const bmpRemaining = 2 - bmpUsed
              const bmpAvailable = bmpRemaining > 0

              if (!bmpAvailable) return null

              const losingTeamData = losingTeamKey === 'team1' ? data?.team1Team : data?.team2Team
              const losingTeamName = losingTeamData?.shortName || losingTeamData?.name || (losingTeamKey === 'team1' ? 'Team 1' : 'Team 2')
              const losingTeamColor = losingTeamData?.color || (losingTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
              const losingTeamLabel = losingTeamKey === teamAKey ? 'A' : 'B'

              return (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleTeamBMP(losingTeamKey)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'transparent',
                      color: '#f97316',
                      border: '2px solid #f97316',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{
                      background: losingTeamColor,
                      color: isBrightColor(losingTeamColor) ? '#000' : '#fff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700
                    }}>
                      {losingTeamLabel}
                    </span>
                    BMP Request
                    <span style={{
                      background: '#f97316',
                      color: '#000',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>{bmpRemaining}</span>
                  </button>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Exceptional Substitution Modal */}


      {/* Set 3 Side and Service Modal */}
      {set3SideServiceModal && (() => {
        const { set2LeftTeamLabel, set2RightTeamLabel, set2ServingTeamLabel } = set3SideServiceModal

        // Get team data based on selected left team
        const leftTeamKey = set3SelectedLeftTeam === 'A' ? teamAKey : teamBKey
        const rightTeamKey = set3SelectedLeftTeam === 'A' ? teamBKey : teamAKey
        const leftTeamData = leftTeamKey === 'team1' ? data?.team1Team : data?.team2Team
        const rightTeamData = rightTeamKey === 'team1' ? data?.team1Team : data?.team2Team
        const leftTeamName = leftTeamData?.name || `Team ${set3SelectedLeftTeam}`
        const rightTeamName = rightTeamData?.name || `Team ${set3SelectedLeftTeam === 'A' ? 'B' : 'A'}`
        const leftTeamColor = leftTeamData?.color || (leftTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
        const rightTeamColor = rightTeamData?.color || (rightTeamKey === 'team1' ? '#ef4444' : '#3b82f6')

        // Determine which side is serving (left or right)
        const servingTeamLabel = set3SelectedFirstServe
        const leftTeamLabel = set3SelectedLeftTeam
        const rightTeamLabel = set3SelectedLeftTeam === 'A' ? 'B' : 'A'
        const leftIsServing = servingTeamLabel === leftTeamLabel
        const rightIsServing = servingTeamLabel === rightTeamLabel

        return (
          <Modal
            title={t('scoreboard.modals.set3ChooseSideService')}
            open={true}
            onClose={() => { }}
            width={500}
            hideCloseButton={true}
          >
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '24px', fontSize: '16px', textAlign: 'center' }}>
                Configure teams and service for Set 3.
              </p>

              {/* Teams on Sides */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  {/* Team A Box */}
                  <div style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '16px',
                    background: leftTeamColor,
                    borderRadius: '8px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                      Team {leftTeamLabel}
                    </div>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                      {leftTeamName}
                    </div>
                    {/* Serve ball underneath if serving */}
                    {leftIsServing && (
                      <img
                        src={ballImage} onError={(e) => e.target.src = ballimage}
                        alt="Serving team"
                        style={{
                          width: '5vmin',
                          height: '5vmin',
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
                          marginTop: '8px'
                        }}
                      />
                    )}
                  </div>

                  {/* Team B Box */}
                  <div style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '16px',
                    background: rightTeamColor,
                    borderRadius: '8px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                      Team {rightTeamLabel}
                    </div>
                    <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '8px' }}>
                      {rightTeamName}
                    </div>
                    {/* Serve ball underneath if serving */}
                    {rightIsServing && (
                      <img
                        src={ballImage} onError={(e) => e.target.src = ballimage}
                        alt="Serving team"
                        style={{
                          width: '5vmin',
                          height: '5vmin',
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
                          marginTop: '8px'
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Switch Teams Button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      setSet3SelectedLeftTeam(set3SelectedLeftTeam === 'A' ? 'B' : 'A')
                    }}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Switch Teams
                  </button>
                </div>

                {/* Switch Serve Button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    onClick={() => {
                      setSet3SelectedFirstServe(set3SelectedFirstServe === 'A' ? 'B' : 'A')
                    }}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Switch Serve
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => confirmSet3SideService(set3SelectedLeftTeam, set3SelectedFirstServe)}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {undoConfirm && (
        <Modal
          title={t('scoreboard.modals.confirmUndo')}
          open={true}
          onClose={cancelUndo}
          width={400}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '16px' }}>
              Do you want to undo action?
            </p>
            <p style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--muted)', fontStyle: 'italic' }}>
              {undoConfirm.description}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleUndo}
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
                onClick={cancelUndo}
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

      {replayRallyConfirm && (() => {
        const lastEvent = replayRallyConfirm.event
        const oldTeam = lastEvent?.payload?.team
        const newTeam = oldTeam === 'team1' ? 'team2' : 'team1'
        const selectedOption = replayRallyConfirm.selectedOption || 'swap'

        // Current scores
        const currentteam1Points = data?.set?.team1Points || 0
        const currentteam2Points = data?.set?.team2Points || 0

        // Calculate new scores for swap option
        const swapteam1Points = oldTeam === 'team1' ? currentteam1Points - 1 : currentteam1Points + 1
        const swapteam2Points = oldTeam === 'team2' ? currentteam2Points - 1 : currentteam2Points + 1

        // Calculate new scores for replay option
        const replayteam1Points = oldTeam === 'team1' ? currentteam1Points - 1 : currentteam1Points
        const replayteam2Points = oldTeam === 'team2' ? currentteam2Points - 1 : currentteam2Points

        // Get team names for display
        const team1TeamName = data?.team1Team?.shortName || data?.team1Team?.name || 'team1'
        const team2TeamName = data?.team2Team?.shortName || data?.team2Team?.name || 'team2'
        const oldTeamName = oldTeam === 'team1' ? team1TeamName : team2TeamName
        const newTeamName = newTeam === 'team1' ? team1TeamName : team2TeamName

        // A/B labels and team colors
        const team1Label = teamAKey === 'team1' ? 'A' : 'B'
        const team2Label = teamAKey === 'team2' ? 'A' : 'B'
        const oldTeamLabel = oldTeam === 'team1' ? team1Label : team2Label
        const team1Color = data?.team1Team?.color || '#ef4444'
        const team2Color = data?.team2Team?.color || '#3b82f6'
        const oldTeamColor = oldTeam === 'team1' ? team1Color : team2Color

        // Determine which team has serve after each option
        // For swap: the new team gets the point, so they get/keep serve
        // For replay: no point scored, serve stays with who had it before this point
        const swapServeTeam = newTeam
        const replayServeTeam = oldTeam // The team that WAS going to have serve (sideout was reversed)

        // Helper to render team with A/B badge
        const TeamWithLabel = ({ team, name }) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              background: 'var(--accent)',
              color: '#000',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700
            }}>{team === 'team1' ? team1Label : team2Label}</span>
            {name}
          </span>
        )

        return (
          <Modal
            title={t('scoreboard.modals.decisionChange')}
            open={true}
            onClose={cancelReplayRally}
            width={500}
          >
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)', textAlign: 'center' }}>
                Last point was assigned to <strong><span style={{ background: oldTeamColor, color: isBrightColor(oldTeamColor) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginRight: '4px' }}>{oldTeamLabel}</span>{oldTeamName}</strong>
              </p>

              {/* Horizontal radio buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {/* Option 1: Swap */}
                <div
                  onClick={() => setReplayRallyConfirm({ ...replayRallyConfirm, selectedOption: 'swap' })}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: selectedOption === 'swap' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: selectedOption === 'swap' ? '2px solid #eab308' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: selectedOption === 'swap' ? '5px solid #eab308' : '2px solid rgba(255, 255, 255, 0.3)',
                    background: selectedOption === 'swap' ? '#eab308' : 'transparent',
                    flexShrink: 0
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Assign to other team</span>
                </div>

                {/* Option 2: Replay */}
                <div
                  onClick={() => setReplayRallyConfirm({ ...replayRallyConfirm, selectedOption: 'replay' })}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: selectedOption === 'replay' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: selectedOption === 'replay' ? '2px solid #eab308' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: selectedOption === 'replay' ? '5px solid #eab308' : '2px solid rgba(255, 255, 255, 0.3)',
                    background: selectedOption === 'replay' ? '#eab308' : 'transparent',
                    flexShrink: 0
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Replay the rally</span>
                </div>
              </div>

              {/* Expanded details panel */}
              <div style={{
                padding: '16px',
                marginBottom: '20px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '55px', textAlign: 'right' }}>Current:</span>
                    <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: team1Color, color: isBrightColor(team1Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team1Label}</span>
                      <strong>{team1TeamName} {currentteam1Points} : {currentteam2Points} {team2TeamName}</strong>
                      <span style={{ background: team2Color, color: isBrightColor(team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team2Label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '55px', textAlign: 'right' }}>New:</span>
                    <div style={{ background: 'rgba(34, 197, 94, 0.15)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: team1Color, color: isBrightColor(team1Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team1Label}</span>
                      <strong style={{ color: '#22c55e' }}>
                        {team1TeamName} {selectedOption === 'swap' ? swapteam1Points : replayteam1Points} : {selectedOption === 'swap' ? swapteam2Points : replayteam2Points} {team2TeamName}
                      </strong>
                      <span style={{ background: team2Color, color: isBrightColor(team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team2Label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '55px', textAlign: 'right' }}>Serve:</span>
                    <span style={{ fontSize: '16px' }}>🏐</span>
                    <span style={{ background: (selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1Color : team2Color, color: isBrightColor((selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1Color : team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                      {(selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1Label : team2Label}
                    </span>
                    <strong>{(selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1TeamName : team2TeamName}</strong>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={handleDecisionChange}
                  style={{
                    padding: '12px 32px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: '#eab308',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={cancelReplayRally}
                  style={{
                    padding: '12px 32px',
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
        )
      })()}



      {postMatchSignature && (
        <Modal
          title={`${postMatchSignature === 'team1-captain' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2')} Captain Signature`}
          open={true}
          onClose={() => setPostMatchSignature(null)}
          width={500}
        >
          <div style={{ padding: '24px' }}>
            <SignaturePad
              onSave={async (signatureDataUrl) => {
                const fieldName = postMatchSignature === 'team1-captain' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature'
                await db.matches.update(matchId, { [fieldName]: signatureDataUrl })
                setPostMatchSignature(null)
              }}
              onCancel={() => setPostMatchSignature(null)}
            />
          </div>
        </Modal>
      )}

    </div>
  )
}

function ScoreboardToolbar({ children, collapsed, onToggle }) {
  return (
    <div style={{ position: 'relative' }}>
      <div
        className="match-toolbar"
        style={{
          display: collapsed ? 'none' : 'grid',
          transition: 'all 0.2s ease'
        }}
      >
        {children}
      </div>
      {/* Collapse/Expand arrow button at bottom center */}
      <div
        onClick={onToggle}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.25'}
        style={{
          position: 'absolute',
          top: collapsed ? '0' : '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '40px',
          height: '24px',
          background: '#22c55e',
          borderRadius: '0 0 8px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease',
          opacity: 0.25
        }}
      >
        <span style={{
          fontSize: '14px',
          color: '#000',
          fontWeight: 700,
          transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease'
        }}>
          ▲
        </span>
      </div>
    </div>
  )
}

function ScoreboardTeamColumn({ side, children }) {
  return (
    <aside className="team-controls" data-side={side}>
      {children}
    </aside>
  )
}

function ScoreboardCourtColumn({ children }) {
  return <section className="court-wrapper">{children}</section>
}

function LineupModal({ team, teamData, players, matchId, setIndex, mode = 'initial', lineup: presetLineup = null, teamAKey, teamBKey, onClose, onSave, onLineupSaved }) {
  const { t } = useTranslation()
  const [lineup, setLineup] = useState(() => {
    if (presetLineup) {
      const positionMapping = ['IV', 'III', 'II', 'V', 'VI', 'I']
      return positionMapping.map(pos => (presetLineup[pos] !== undefined ? String(presetLineup[pos] ?? '') : ''))
    }
    return ['', '', '', '', '', '']
  }) // [IV, III, II, V, VI, I]
  const [errors, setErrors] = useState({}) // Use an object for specific error messages
  const [confirmMessage, setConfirmMessage] = useState(null)
  const [editHistory, setEditHistory] = useState([]) // Track edit history: [{ index, previousValue }]

  // Get all events to check for disqualifications
  const events = useLiveQuery(async () => {
    return await db.events.where('matchId').equals(matchId).toArray()
  }, [matchId])

  const handleInputChange = (index, value, skipHistory = false) => {
    const numValue = value.replace(/[^0-9]/g, '')
    const previousValue = lineup[index]

    // Track edit history (only if the value actually changed and not skipping)
    if (!skipHistory && numValue !== previousValue) {
      setEditHistory(prev => [...prev, { index, previousValue }])
    }

    const newLineup = [...lineup]
    newLineup[index] = numValue
    setLineup(newLineup)

    // Automatically validate the number as it's entered
    if (numValue && numValue.trim() !== '') {
      const num = Number(numValue)
      const player = players?.find(p => String(p.number) === String(num))
      const newErrors = { ...errors }

      // Check if not on roster
      if (!player) {
        newErrors[index] = 'Not on roster'
      }

      // Check if disqualified
      else if (events) {
        const isDisqualified = events.some(e =>
          e.type === 'sanction' &&
          e.payload?.team === team &&
          e.payload?.playerNumber === num &&
          e.payload?.type === 'disqualification'
        )
        if (isDisqualified) {
          newErrors[index] = 'Disqualified'
        }

      } else {
        // Clear error if valid
        delete newErrors[index]
      }

      setErrors(newErrors)
    } else {
      // Clear error when field is empty
      const newErrors = { ...errors }
      delete newErrors[index]
      setErrors(newErrors)
    }

    setConfirmMessage(null)
  }

  // Handle click on available player - SINGLE click assigns to first available position
  const handlePlayerClick = (playerNumber) => {
    // Find first empty box (I to VI order: indices 5, 2, 1, 0, 3, 4 for I, II, III, IV, V, VI)
    const positionOrder = [5, 2, 1, 0, 3, 4] // I, II, III, IV, V, VI
    for (const idx of positionOrder) {
      if (!lineup[idx] || lineup[idx].trim() === '') {
        handleInputChange(idx, String(playerNumber))
        break
      }
    }
  }

  // Drag and drop state
  const [draggedPlayer, setDraggedPlayer] = useState(null)
  const [dragOverPosition, setDragOverPosition] = useState(null)

  // Handle drag start for available players
  const handleDragStart = (e, playerNumber) => {
    setDraggedPlayer(playerNumber)
    e.dataTransfer.setData('text/plain', String(playerNumber))
    e.dataTransfer.effectAllowed = 'move'

    // Create custom drag image showing the player number
    const dragImage = document.createElement('div')
    dragImage.textContent = String(playerNumber)
    dragImage.style.cssText = `
      position: absolute;
      top: -1000px;
      left: -1000px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #4ade80;
      color: #000;
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 25, 25)

    // Clean up drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage)
    }, 0)
  }

  const handleDragEnd = () => {
    setDraggedPlayer(null)
    setDragOverPosition(null)
  }

  // Handle drag over for position inputs
  const handleDragOver = (e, positionIndex) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverPosition(positionIndex)
  }

  const handleDragLeave = () => {
    setDragOverPosition(null)
  }

  // Handle drop on position input
  const handleDrop = (e, positionIndex) => {
    e.preventDefault()
    const playerNumber = e.dataTransfer.getData('text/plain')
    if (playerNumber) {
      handleInputChange(positionIndex, playerNumber)
    }
    setDraggedPlayer(null)
    setDragOverPosition(null)
  }

  // Undo the last edit
  const handleUndoLastEdit = () => {
    if (editHistory.length === 0) return

    const lastEdit = editHistory[editHistory.length - 1]
    // Restore the previous value (skip history tracking for undo)
    handleInputChange(lastEdit.index, lastEdit.previousValue, true)
    // Remove the last entry from history
    setEditHistory(prev => prev.slice(0, -1))
    setConfirmMessage(null)
  }

  // Clear all lineup entries
  const handleClearLineup = () => {
    // Save current state to history before clearing
    lineup.forEach((value, index) => {
      if (value && value.trim() !== '') {
        setEditHistory(prev => [...prev, { index, previousValue: value }])
      }
    })
    setLineup(['', '', '', '', '', ''])
    setErrors({})
    setConfirmMessage(null)
  }

  // Rotate lineup clockwise (forward): I->II, II->III, III->IV, IV->V, V->VI, VI->I
  // Array indices: [IV=0, III=1, II=2, V=3, VI=4, I=5]
  // Clockwise means each player moves to next position: 0->3, 1->0, 2->1, 3->4, 4->5, 5->2
  const handleRotateClockwise = () => {
    const newLineup = ['', '', '', '', '', '']
    // IV(0) -> V(3), III(1) -> IV(0), II(2) -> III(1), V(3) -> VI(4), VI(4) -> I(5), I(5) -> II(2)
    newLineup[3] = lineup[0]  // IV -> V
    newLineup[0] = lineup[1]  // III -> IV
    newLineup[1] = lineup[2]  // II -> III
    newLineup[4] = lineup[3]  // V -> VI
    newLineup[5] = lineup[4]  // VI -> I
    newLineup[2] = lineup[5]  // I -> II
    setLineup(newLineup)
    setConfirmMessage(null)
  }

  // Rotate lineup counterclockwise (backward): I->VI, VI->V, V->IV, IV->III, III->II, II->I
  const handleRotateCounterClockwise = () => {
    const newLineup = ['', '', '', '', '', '']
    // IV(0) -> III(1), III(1) -> II(2), II(2) -> I(5), V(3) -> IV(0), VI(4) -> V(3), I(5) -> VI(4)
    newLineup[1] = lineup[0]  // IV -> III
    newLineup[2] = lineup[1]  // III -> II
    newLineup[5] = lineup[2]  // II -> I
    newLineup[0] = lineup[3]  // V -> IV
    newLineup[3] = lineup[4]  // VI -> V
    newLineup[4] = lineup[5]  // I -> VI
    setLineup(newLineup)
    setConfirmMessage(null)
  }

  // Modify lineup (undo confirm and go back to editing)
  const handleModify = () => {
    setConfirmMessage(null)
  }

  const handleConfirm = () => {
    const newErrors = {}
    const lineupNumbers = lineup.map(n => (n ? Number(n) : null))

    // Check for duplicates first, as it's a cross-field validation
    const numberCounts = lineupNumbers.reduce((acc, num) => {
      if (num !== null) acc[num] = (acc[num] || 0) + 1
      return acc
    }, {})

    lineup.forEach((numStr, i) => {
      // 1. Required
      if (!numStr || numStr.trim() === '') {
        newErrors[i] = 'Required'
        return // Move to next input
      }

      const num = Number(numStr)

      // 2. Duplicate
      if (numberCounts[num] > 1) {
        newErrors[i] = 'Duplicate'
        // Don't return, so we can flag all duplicates
      }

      const player = players?.find(p => String(p.number) === String(num))

      // 3. Not on roster
      if (!player) {
        newErrors[i] = 'Not on roster'
        return
      }



      // 5. Is disqualified - cannot enter the game ever again
      if (events) {
        const isDisqualified = events.some(e =>
          e.type === 'sanction' &&
          e.payload?.team === team &&
          e.payload?.playerNumber === num &&
          e.payload?.type === 'disqualification'
        )
        if (isDisqualified) {
          newErrors[i] = 'Disqualified'
          return
        }
      }


    })

    // Re-check for duplicates to mark all of them
    lineupNumbers.forEach((num, i) => {
      if (num !== null && numberCounts[num] > 1) {
        newErrors[i] = 'Duplicate'
      }
    })

    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      return
    }

    // Save lineup: Map positions I->I, II->II, III->III, IV->IV
    // Lineup array indices: [0=IV, 1=III, 2=II, 3=V, 4=VI, 5=I]
    const positionMapping = ['IV', 'III', 'II', 'V', 'VI', 'I']
    const lineupData = {}
    positionMapping.forEach((pos, idx) => {
      lineupData[pos] = lineupNumbers[idx]
    })

    // Save lineup as an event (mark as initial lineup or manual override)
    if (matchId && setIndex) {
      // Save lineup with sequence number
      (async () => {
        // Get next sequence number
        const allEvents = await db.events.where('matchId').equals(matchId).toArray()
        const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)

        const manualLineupSeq = maxSeq + 1
        const manualLineupEventId = await db.events.add({
          matchId,
          setIndex,
          ts: new Date().toISOString(),
          type: 'lineup',
          payload: {
            team,
            lineup: lineupData,
            isInitial: mode === 'initial'
          },
          seq: manualLineupSeq
        })

        // Sync to referee immediately after lineup is saved
        if (onLineupSaved) {
          onLineupSaved()
        }

        // Check if both lineups are now set - if so, award any pending penalty points
        // Reuse allEvents from above to avoid redeclaration
        const team1LineupSet = allEvents.some(e =>
          e.type === 'lineup' &&
          e.payload?.team === 'team1' &&
          e.setIndex === setIndex &&
          e.payload?.isInitial
        )
        const team2LineupSet = allEvents.some(e =>
          e.type === 'lineup' &&
          e.payload?.team === 'team2' &&
          e.setIndex === setIndex &&
          e.payload?.isInitial
        )

        if (team1LineupSet && team2LineupSet) {
          // Both lineups are set - check for pending penalty sanctions in this set
          const pendingPenalties = allEvents.filter(e =>
            e.type === 'sanction' &&
            e.setIndex === setIndex &&
            e.payload?.type === 'penalty'
          )

          // Check if points have already been awarded for these penalties
          const pointEvents = allEvents.filter(e => e.type === 'point' && e.setIndex === setIndex)

          if (pendingPenalties.length > 0 && pointEvents.length === 0) {
            // Award points for each pending penalty
            for (const penalty of pendingPenalties) {
              const sanctionedTeam = penalty.payload?.team
              const otherTeam = sanctionedTeam === 'team1' ? 'team2' : 'team1'

              // Award point to the other team
              const currentSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === setIndex).first()
              if (currentSet) {
                const field = otherTeam === 'team1' ? 'team1Points' : 'team2Points'
                const currentPoints = currentSet[field] || 0
                await db.sets.update(currentSet.id, {
                  [field]: currentPoints + 1
                })

                // Log point event
                const penaltyPointSeq = maxSeq + 2 + pendingPenalties.indexOf(penalty)
                await db.events.add({
                  matchId,
                  setIndex,
                  ts: new Date().toISOString(),
                  type: 'point',
                  payload: { team: otherTeam, fromPenalty: true },
                  seq: penaltyPointSeq
                })

              }
            }
          }
        }

        // Auto-close modal after successful save (skip confirmation step)
        onSave()
      })().catch(err => {
        // Don't auto-close - let user close manually with close button
        setErrors({ 0: 'Save failed', 1: 'Save failed', 2: 'Save failed', 3: 'Save failed', 4: 'Save failed', 5: 'Save failed' })
      })
    } else {
      // Auto-close modal after successful save
      onSave()
    }
  }

  // Determine if this team is A or B
  const isTeamA = team === teamAKey
  const teamLabel = isTeamA ? 'A' : 'B'
  const teamColor = teamData?.color || (isTeamA ? '#ef4444' : '#3b82f6')

  // Helper function to determine if a color is bright
  const isBrightColor = (color) => {
    if (!color) return false
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 155
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>{teamData?.name || (team === 'team1' ? 'team1' : 'team2')}</span>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 700,
              background: teamColor,
              color: isBrightColor(teamColor) ? '#000' : '#fff'
            }}
          >
            {teamLabel}
          </span>
        </div>
      }
      open={true}
      onClose={onClose}
      width={500}
      hideCloseButton={true}
    >
      <div style={{ padding: '24px' }}>
        {/* Centered container for position inputs */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '24px'
        }}>
          <div className="lineup-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            position: 'relative'
          }}>
            {/* Net indicator */}
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              height: '2px',
              background: 'var(--accent)',
              zIndex: 1
            }} />
            <div style={{
              position: 'absolute',
              top: '-20px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--accent)',
              zIndex: 2,
              background: 'var(--bg)',
              padding: '0 8px'
            }}>
            </div>

            {/* Top row (closer to net) */}
            {[
              { idx: 0, pos: 'IV' },
              { idx: 1, pos: 'III' },
              { idx: 2, pos: 'II' }
            ].map(({ idx, pos }) => (
              <div key={`top-${idx}`} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                {/* Position label rectangle */}
                <div style={{
                  width: '60px',
                  height: '24px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px 4px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text)'
                }}>
                  {pos}
                </div>
                {/* Input square with captain indicator (circled number) - droppable */}
                <div
                  style={{ position: 'relative', width: '60px' }}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    min="1"
                    max="99"
                    value={lineup[idx]}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      if (val === '' || (Number(val) >= 1 && Number(val) <= 99)) {
                        handleInputChange(idx, val)
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // Counterclockwise order: I(5) → II(2) → III(1) → IV(0) → V(3) → VI(4) → I(5)
                        const counterclockwiseOrder = [5, 2, 1, 0, 3, 4]
                        const currentOrderIdx = counterclockwiseOrder.indexOf(idx)
                        const inputs = e.target.closest('.lineup-grid')?.querySelectorAll('input')
                        if (inputs) {
                          for (let i = 1; i <= 6; i++) {
                            const nextOrderIdx = (currentOrderIdx + i) % 6
                            const nextIdx = counterclockwiseOrder[nextOrderIdx]
                            if (!inputs[nextIdx]?.value) {
                              inputs[nextIdx].focus()
                              return
                            }
                          }
                          e.target.blur()
                        }
                      }
                    }}
                    style={{
                      width: '60px',
                      height: '60px',
                      padding: '0',
                      fontSize: '18px',
                      fontWeight: 700,
                      textAlign: 'center',
                      background: dragOverPosition === idx ? 'rgba(74, 222, 128, 0.2)' : 'var(--bg-secondary)',
                      borderTop: 'none',
                      borderLeft: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderRight: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderBottom: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: '0 0 8px 8px',
                      color: 'var(--text)',
                      transition: 'background 0.15s, border-color 0.15s'
                    }}
                  />
                  {lineup[idx] && players?.find(p => String(p.number) === String(lineup[idx]) && p.isCaptain) && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      borderTop: '2px solid var(--accent)',
                      borderLeft: '2px solid var(--accent)',
                      borderRight: '2px solid var(--accent)',
                      borderBottom: '2px solid var(--accent)',
                      pointerEvents: 'none',
                      zIndex: 1
                    }} />
                  )}
                </div>
                <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', height: '14px', textAlign: 'center' }}>
                  {errors[idx] || ''}
                </div>
              </div>
            ))}

            {/* Bottom row (further from net) */}
            {[
              { idx: 3, pos: 'V' },
              { idx: 4, pos: 'VI' },
              { idx: 5, pos: 'I' }
            ].map(({ idx, pos }) => (
              <div
                key={`bottom-${idx}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  marginTop: '8px'
                }}
              >
                {/* Position label rectangle */}
                <div style={{
                  width: '60px',
                  height: '24px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px 4px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text)'
                }}>
                  {pos}
                </div>
                {/* Input square with captain indicator (circled number) - droppable */}
                <div
                  style={{ position: 'relative', width: '60px' }}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    min="1"
                    max="99"
                    value={lineup[idx]}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      if (val === '' || (Number(val) >= 1 && Number(val) <= 99)) {
                        handleInputChange(idx, val)
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // Counterclockwise order: I(5) → II(2) → III(1) → IV(0) → V(3) → VI(4) → I(5)
                        const counterclockwiseOrder = [5, 2, 1, 0, 3, 4]
                        const currentOrderIdx = counterclockwiseOrder.indexOf(idx)
                        const inputs = e.target.closest('.lineup-grid')?.querySelectorAll('input')
                        if (inputs) {
                          for (let i = 1; i <= 6; i++) {
                            const nextOrderIdx = (currentOrderIdx + i) % 6
                            const nextIdx = counterclockwiseOrder[nextOrderIdx]
                            if (!inputs[nextIdx]?.value) {
                              inputs[nextIdx].focus()
                              return
                            }
                          }
                          e.target.blur()
                        }
                      }
                    }}
                    style={{
                      width: '60px',
                      height: '60px',
                      padding: '0',
                      fontSize: '18px',
                      fontWeight: 700,
                      textAlign: 'center',
                      background: dragOverPosition === idx ? 'rgba(74, 222, 128, 0.2)' : 'var(--bg-secondary)',
                      borderTop: 'none',
                      borderLeft: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderRight: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderBottom: `2px solid ${errors[idx] ? '#ef4444' : dragOverPosition === idx ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: '0 0 8px 8px',
                      color: 'var(--text)',
                      transition: 'background 0.15s, border-color 0.15s'
                    }}
                  />
                  {lineup[idx] && players?.find(p => String(p.number) === String(lineup[idx]) && p.isCaptain) && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      borderTop: '2px solid var(--accent)',
                      borderLeft: '2px solid var(--accent)',
                      borderRight: '2px solid var(--accent)',
                      borderBottom: '2px solid var(--accent)',
                      pointerEvents: 'none',
                      zIndex: 1
                    }} />
                  )}
                </div>
                <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', height: '14px', textAlign: 'center' }}>
                  {errors[idx] || ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available players (excluding disqualified) */}
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px'
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--muted)',
            marginBottom: '8px'
          }}>
            {t('scoreboard.lineupModal.availablePlayers', 'Available Players:')}
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {players?.filter(p => {
              // Exclude players already in the lineup
              if (lineup.includes(String(p.number))) return false

              if (events) {
                // Exclude players substituted due to disqualification (cannot take part for rest of game)
                const wasDisqualifiedSub = events.some(e =>
                  e.type === 'substitution' &&
                  e.payload?.team === team &&
                  String(e.payload?.playerOut) === String(p.number) &&
                  e.payload?.isDisqualified === true
                )
                if (wasDisqualifiedSub) {
                  return false
                }

                // Exclude exceptionally substituted players (cannot take part for rest of game)
                const wasExceptionallySubstituted = events.some(e =>
                  e.type === 'substitution' &&
                  e.payload?.team === team &&
                  String(e.payload?.playerOut) === String(p.number) &&
                  e.payload?.isExceptional === true
                )
                if (wasExceptionallySubstituted) {
                  return false
                }

                // Exclude expelled players in the current set (cannot take part in this set)
                if (setIndex) {
                  // Check for substitution due to expulsion in current set
                  const wasExpelledSub = events.some(e =>
                    e.type === 'substitution' &&
                    e.payload?.team === team &&
                    String(e.payload?.playerOut) === String(p.number) &&
                    e.payload?.isExpelled === true &&
                    e.setIndex === setIndex
                  )
                  if (wasExpelledSub) {
                    return false
                  }

                  // Also check for sanction-based expulsion in current set
                  const isExpelledInSet = events.some(e =>
                    e.type === 'sanction' &&
                    e.payload?.team === team &&
                    String(e.payload?.playerNumber) === String(p.number) &&
                    e.payload?.type === 'expulsion' &&
                    e.setIndex === setIndex
                  )
                  if (isExpelledInSet) {
                    return false
                  }
                }

                // Also check for sanction-based disqualification
                const isDisqualified = events.some(e =>
                  e.type === 'sanction' &&
                  e.payload?.team === team &&
                  String(e.payload?.playerNumber) === String(p.number) &&
                  e.payload?.type === 'disqualification'
                )
                if (isDisqualified) {
                  return false
                }
              }

              return true
            }).sort((a, b) => a.number - b.number).map(p => (
              <div
                key={p.number}
                draggable
                onClick={() => handlePlayerClick(p.number)}
                onDragStart={(e) => handleDragStart(e, p.number)}
                onDragEnd={handleDragEnd}
                style={{
                  position: 'relative',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: draggedPlayer === p.number ? 'rgba(74, 222, 128, 0.4)' : 'rgba(74, 222, 128, 0.2)',
                  border: '2px solid #4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#4ade80',
                  cursor: 'grab',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                  opacity: draggedPlayer === p.number ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!draggedPlayer) {
                    e.currentTarget.style.background = 'rgba(74, 222, 128, 0.3)'
                    e.currentTarget.style.transform = 'scale(1.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!draggedPlayer) {
                    e.currentTarget.style.background = 'rgba(74, 222, 128, 0.2)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
                title={t('scoreboard.lineupModal.clickOrDragTooltip', 'Click or drag to assign to a position')}
              >
                {p.isCaptain && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#4ade80',
                    color: '#000',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                    C
                  </span>
                )}
                {p.number}
              </div>
            ))}
          </div>
        </div>

        {/* Instruction text */}
        <div style={{
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--muted)',
          marginBottom: '16px',
          fontStyle: 'italic'
        }}>
          {t('scoreboard.lineupModal.dragInstruction', 'Please write the number, drag and drop it, or click on available player to fill each of the available positions')}
        </div>

        {/* Undo, Clear, and Rotate buttons - hidden when lineup is confirmed */}
        {!confirmMessage && (
          <>
            {/* Undo and Clear buttons row */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '12px'
            }}>
              {editHistory.length > 0 && (
                <button
                  className="secondary"
                  onClick={handleUndoLastEdit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    fontSize: '13px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>↩</span>
                  {t('scoreboard.lineupModal.undoLastEdit', 'Undo last edit')}
                </button>
              )}
              {lineup.some(v => v && v.trim() !== '') && (
                <button
                  className="secondary"
                  onClick={handleClearLineup}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    color: '#ef4444',
                    borderColor: 'rgba(239, 68, 68, 0.3)'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>✕</span>
                  {t('scoreboard.lineupModal.clearLineup', 'Clear lineup')}
                </button>
              )}
            </div>

            {/* Rotate buttons row */}
            {lineup.some(v => v && v.trim() !== '') && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <button
                  className="secondary"
                  onClick={handleRotateClockwise}
                  title={t('scoreboard.lineupModal.rotateClockwise', 'Rotate clockwise')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    padding: '0',
                    fontSize: '20px',
                    borderRadius: '50%'
                  }}
                >
                  ↻
                </button>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '12px',
                  color: 'var(--muted)'
                }}>
                  {t('scoreboard.lineupModal.rotate', 'Rotate')}
                </span>

                <button
                  className="secondary"
                  onClick={handleRotateCounterClockwise}
                  title={t('scoreboard.lineupModal.rotateCounterclockwise', 'Rotate counterclockwise')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    padding: '0',
                    fontSize: '20px',
                    borderRadius: '50%'
                  }}
                >
                  ↺
                </button>
              </div>
            )}
          </>
        )}

        {errors.length > 0 && (
          <div style={{
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#ef4444',
            fontSize: '14px'
          }}>
            {t('scoreboard.lineupModal.validationError', 'Please check: All numbers must exist in roster and not be duplicated.')}
          </div>
        )}

        {confirmMessage && (
          <div style={{
            padding: '12px',
            background: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid #4ade80',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#4ade80',
            fontSize: '14px',
            fontWeight: 600,
            textAlign: 'center'
          }}>
            {confirmMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>

          {confirmMessage === null && (
            <button onClick={handleConfirm}>
              {t('scoreboard.lineupModal.confirm', 'Confirm')}
            </button>
          )}

          <button
            className={confirmMessage === null ? 'secondary' : ''}
            onClick={() => {
              // If lineup was confirmed (confirmMessage exists), refresh state before closing
              if (confirmMessage) {
                onSave()
              } else {
                onClose()
              }
            }}
          >
            {t('scoreboard.lineupModal.close', 'Close')}
          </button>
          {confirmMessage !== null && (
            <button
              className="secondary"
              onClick={handleModify}
              style={{
                background: 'rgba(0, 0, 0, 1)',
                color: '#fff',
                border: '1px solid rgba(0, 0, 0, 1)',
                borderRadius: '10px',
                cursor: 'point  er'
              }}
            >
              {t('scoreboard.lineupModal.modify', 'Modify')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function SetStartTimeModal({ setIndex, defaultTime, onConfirm, onCancel }) {
  const [time, setTime] = useState(() => {
    // Extract local time from UTC ISO string
    const { time: localTime } = splitLocalDateTime(defaultTime)
    return localTime
  })

  const handleTimeChange = (e) => {
    let value = e.target.value
    // Remove any non-digit characters except colon
    value = value.replace(/[^\d:]/g, '')
    // Ensure format is HH:MM (24-hour)
    if (value.length <= 5) {
      // Allow typing and auto-format
      if (value.length === 2 && !value.includes(':')) {
        value = value + ':'
      }
      setTime(value)
    }
  }

  const handleConfirm = () => {
    // Validate time format (HH:MM, 24-hour)
    const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      alert('Please enter a valid time in 24-hour format (HH:MM)')
      return
    }
    // Get the date component from defaultTime and combine with entered time
    const { date } = splitLocalDateTime(defaultTime)
    // Convert local time to UTC ISO string
    const isoString = parseLocalDateTimeToISO(date, time)
    onConfirm(isoString)
  }

  return (
    <Modal
      title={`Set ${setIndex} Start Time`}
      open={true}
      onClose={onCancel}
      width={400}
      hideCloseButton={true}
    >
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ marginBottom: '24px', fontSize: '16px' }}>
          Confirm the start time for Set {setIndex}:
        </p>
        <input
          type="text"
          value={time}
          onChange={handleTimeChange}
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          maxLength={5}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: `2px solid rgba(255,255,255,0.2)`,
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '8px',
            width: '150px',
            fontFamily: 'monospace',
            letterSpacing: '2px'
          }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={handleConfirm}
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
            Confirm
          </button>
          <button
            onClick={onCancel}
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
  )
}

function ToSubDetailsModal({ type, side, timeoutDetails, substitutionDetails, teamName, onClose }) {
  return (
    <Modal
      title={type === 'timeout' ? `Timeouts - ${teamName}   ` : `Substitutions - ${teamName}  `}
      open={true}
      onClose={onClose}
      width={400}
    >
      <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
        {type === 'timeout' ? (
          <div>
            {timeoutDetails && timeoutDetails.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {timeoutDetails.map((detail, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 600 }}>
                        Timeout {detail.index}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                        {detail.score}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                No timeouts taken yet
              </div>
            )}
          </div>
        ) : (
          <div>
            {substitutionDetails && substitutionDetails.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {substitutionDetails.map((detail, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 600 }}>
                        Substitution {detail.index}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                        {detail.score}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--muted)' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>Position:</span> {detail.position}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>Out:</span> {detail.playerOut}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>In:</span> {detail.playerIn}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                No substitutions taken yet
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function SetEndTimeModal({ setIndex, winner, team1Points, team2Points, defaultTime, teamAKey, leftisTeam1, isMatchEnd, team1TeamName, team2TeamName, team1TeamColor, team2TeamColor, losingTeamBmpRemaining, onBmpRequest, onConfirm, onDecisionChange }) {
  const [time, setTime] = useState(() => {
    // Extract local time from UTC ISO string
    const { time: localTime } = splitLocalDateTime(defaultTime)
    return localTime
  })
  const [isConfirming, setIsConfirming] = useState(false) // Prevent double-clicks

  // Get winner and loser team info
  const winnerTeamName = winner === 'team1' ? team1TeamName : team2TeamName
  const loserTeam = winner === 'team1' ? 'team2' : 'team1'
  const loserTeamName = winner === 'team1' ? team2TeamName : team1TeamName
  const loserTeamColor = winner === 'team1' ? team2TeamColor : team1TeamColor
  const loserTeamLabel = (winner === 'team1' ? 'team2' : 'team1') === (leftisTeam1 ? 'team1' : 'team2') ? 'A' : 'B'

  // Calculate left and right team names and scores
  const leftTeamName = leftisTeam1 ? team1TeamName : team2TeamName
  const rightTeamName = leftisTeam1 ? team2TeamName : team1TeamName
  const leftScore = leftisTeam1 ? team1Points : team2Points
  const rightScore = leftisTeam1 ? team2Points : team1Points

  // Helper to check if color is bright
  const isBrightColor = (color) => {
    if (!color) return false
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5
  }

  const handleTimeChange = (e) => {
    let value = e.target.value
    // Remove any non-digit characters except colon
    value = value.replace(/[^\d:]/g, '')
    // Ensure format is HH:MM (24-hour)
    if (value.length <= 5) {
      // Allow typing and auto-format
      if (value.length === 2 && !value.includes(':')) {
        value = value + ':'
      }
      setTime(value)
    }
  }

  const handleConfirm = () => {
    if (isConfirming) return // Prevent double-clicks
    // Validate time format (HH:MM, 24-hour)
    const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      alert('Please enter a valid time in 24-hour format (HH:MM)')
      setIsConfirming(false)
      return
    }
    setIsConfirming(true)
    // Get the date component from defaultTime and combine with entered time
    const { date } = splitLocalDateTime(defaultTime)
    // Convert local time to UTC ISO string
    const isoString = parseLocalDateTimeToISO(date, time)
    onConfirm(isoString)
  }

  return (
    <Modal
      title={isMatchEnd ? 'Match End' : `Set ${setIndex} End`}
      open={true}
      onClose={onDecisionChange}
      width={400}
      hideCloseButton={true}
    >
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ marginBottom: '16px', fontSize: '36px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <span style={{
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '18px',
            fontWeight: 700,
            background: leftisTeam1 ? team1TeamColor : team2TeamColor,
            color: isBrightColor(leftisTeam1 ? team1TeamColor : team2TeamColor) ? '#000' : '#fff'
          }}>
            {leftisTeam1 ? (teamAKey === 'team1' ? 'A' : 'B') : (teamAKey === 'team2' ? 'A' : 'B')}
          </span>
          <span>{leftScore} : {rightScore}</span>
          <span style={{
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '18px',
            fontWeight: 700,
            background: leftisTeam1 ? team2TeamColor : team1TeamColor,
            color: isBrightColor(leftisTeam1 ? team2TeamColor : team1TeamColor) ? '#000' : '#fff'
          }}>
            {leftisTeam1 ? (teamAKey === 'team2' ? 'A' : 'B') : (teamAKey === 'team1' ? 'A' : 'B')}
          </span>
        </div>
        <p style={{ marginBottom: '24px', fontSize: '16px', fontWeight: 600, color: 'var(--accent)' }}>
          {isMatchEnd ? `${winnerTeamName} won the Match!` : `${winnerTeamName} wins!`}
        </p>
        <p style={{ marginBottom: '16px', fontSize: '16px' }}>
          Confirm the end time:
        </p>
        <input
          type="text"
          value={time}
          onChange={handleTimeChange}
          placeholder="HH:MM"
          pattern="[0-2][0-9]:[0-5][0-9]"
          maxLength={5}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: `2px solid rgba(255,255,255,0.2)`,
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '16px',
            width: '150px',
            fontFamily: 'monospace',
            letterSpacing: '2px'
          }}
        />
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '16px' }}>
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              background: isConfirming ? 'var(--muted)' : 'var(--accent)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: isConfirming ? 'not-allowed' : 'pointer',
              opacity: isConfirming ? 0.7 : 1
            }}
          >
            {isConfirming ? 'Confirming...' : 'Confirm'}
          </button>
          <button
            onClick={onDecisionChange}
            disabled={isConfirming}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              background: '#eab308',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: isConfirming ? 'not-allowed' : 'pointer',
              opacity: isConfirming ? 0.7 : 1
            }}
          >
            Decision Change
          </button>
        </div>
        {/* BMP Request button for losing team */}
        {losingTeamBmpRemaining > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <button
              onClick={() => onBmpRequest(loserTeam)}
              disabled={isConfirming}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                background: '#f97316',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isConfirming ? 'not-allowed' : 'pointer',
                opacity: isConfirming ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                margin: '0 auto'
              }}
            >
              <span style={{
                background: loserTeamColor,
                color: isBrightColor(loserTeamColor) ? '#000' : '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700
              }}>
                {loserTeamLabel}
              </span>
              BMP Request ({losingTeamBmpRemaining} remaining)
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
