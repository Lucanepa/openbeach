import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { useLiveQuery } from 'dexie-react-hooks'
import Dexie from 'dexie'
import { db } from '../db_beach/db_beach'
import LegacyModal from './Modal_beach'

import MenuList from './MenuList_beach'
import { matchMenuSections, toMenuListItems } from './matchMenu_beach'
import { matchTimes, setDurationMinutes } from '../../scoresheet_pdf_beach/components_beach/matchTimes_beach'
import SyncProgressModal_beach from './SyncProgressModal_beach'
import ScoreboardOptionsModal from './options/ScoreboardOptionsModal_beach'
import ConnectionSetupModal from './options/ConnectionSetupModal_beach'
import { useSyncQueue } from '../hooks_beach/useSyncQueue_beach'
import { useConfirmAction } from '../hooks_beach/useConfirmAction_beach'
import { useActionLiveQuery } from '../hooks_beach/useActionLiveQuery_beach'
import { useScorerActions, pickLiveStateSnapshot, isReportedActionError } from '../hooks_beach/useScorerActions_beach'
import { withActivityContext, currentActivityContext, maxVoidedSeq, rememberSeedKey, withoutEventHistory } from '../db_beach/eventHistory_beach'
import CorrectionsPanel from './corrections/CorrectionsPanel_beach'
import { useSequentialSync } from '../hooks_beach/useSequentialSync_beach'


// Primary ball image
const ballImage = '/beachball.png'
import { debugLogger, createStateSnapshot } from '../utils_beach/debugLogger_beach'
import { useComponentLogging } from '../contexts_beach/LoggingContext_beach'
import { apiFrom } from '../lib_beach/apiClient_beach'
import { setExtId, eventExtId } from '../utils_beach/syncIds_beach'
import { changesSetScore, isLiveSetInterval, queueSetScoreSync } from '../utils_beach/eventSync_beach'
import { planPointRemoval, scoreAfterRemoval, syncJobsForEvents, syncJobsForSets, eventUpsertJob, setReopenJob, planDecisionChangeReversal, scoreDeltaOfRemoval, teamSanctionFlags, UNSENT_STATUSES } from '../utils_beach/scorerCorrections_beach'
import { askConfirm } from '../utils_beach/askConfirm_beach'
import { rallyStatusOf, currentSetOf } from '../utils_beach/rally_beach'
import { toast } from '../ui/volleyui/uiStore.js'
import { isBackendAvailable, getApiUrl, isNativeApp } from '../utils_beach/backendConfig_beach'
import { lockLandscape as lockNativeLandscape, unlockOrientation as unlockNativeOrientation } from '../utils_beach/nativeOrientation_beach'
import { scorerRelay, scorerPublisher, scorerRelayUrl, readRelayBundle, relayMatchKey } from '../utils_beach/relayPublisher_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'
import { useDiagCommits } from '../diagnostics_beach/commits_beach'
import { exportMatchData } from '../utils_beach/backupManager_beach'
import { captureFullStateSnapshot as captureStateSnapshot, refreshIntervalSnapshots } from '../utils_beach/stateSnapshot_beach'
import { leftTeamInSet, isTeam1LeftInSet, switchSidesUpdate, nextSetStartSides } from '../utils_beach/courtSides_beach'
import { swapTeamDesignation, coinTossCloud, setFirstServer, switchFirstServeUpdate, labelsInDesignation, eventTeamA } from '../utils_beach/coinToss_beach'
import { set3TossBefore, set3TossUndoUpdate, undoKeepsMatch } from '../utils_beach/set3Toss_beach'
import { staleCourtSwitches, switchBackUpdate, snapshotsAfterSwitchBack, pendingTto, pendingCourtDialog } from '../utils_beach/courtSwitchState_beach'
import { teamBmpBlockReason } from '../utils_beach/bmpAvailability_beach'
import { TTO_TOTAL, courtChangeEvery, hasTechnicalTimeout, nextCourtEvents } from '../utils_beach/courtRhythm_beach'
import PhoneScoreboard from './scoreboard/PhoneScoreboard_beach.jsx'
import IntervalChoice, { ServeOrder } from './scoreboard/IntervalChoice_beach.jsx'
import { intervalChooser } from '../utils_beach/intervalChoice_beach'
import { detectDisplayMode, isPhoneScreen, normaliseDisplayMode, phoneHeldSideways, phoneLayoutActive, readStoredDisplayMode, recentActions } from './scoreboard/phoneLayout_beach'
import { defaultSetStartTime, scheduledClock, withActualStartTimeRemark, actualStartTimeLine, startScheduleOf, typedStartNear } from '../utils_beach/setStartTime_beach'
import { withoutAutoRemarks, errorText as correctionErrorText, pointsToWin as setPointsToWin } from '../utils_beach/corrections_beach'
import { correctSetTimes } from '../utils_beach/applyCorrectionPlan_beach'
import { cloudSyncWaitNow } from '../utils_beach/cloudStatus_beach'
import { formatCourtScore } from '../utils_beach/scoreText_beach'
import { medicalStartPayload, medicalEndPayload, findOpenMedical, formatMedicalDuration, medicalSecondsLeft, MEDICAL_RECOVERY_SECONDS } from '../utils_beach/medicalEvents_beach'

// Sport type for beach volleyball
const SPORT_TYPE = 'beach'

// Team time-out and technical time-out countdowns: 45 s ON PURPOSE, do not
// "fix" them to 30 s. FIVB Beach rules 15.4.1 / 15.4.2 give 30 s, but the
// referee whistles at 45 s (Swiss practice): the countdown runs to the whistle.
const TEAM_TIMEOUT_SECONDS = 45
const TTO_SECONDS = 45
import CountryFlag from './CountryFlag_beach'
import SignaturePad from './SignaturePad_beach'
import { saveMatchSignature } from '../utils_beach/signatures_beach'
import { signatureSourceUpdate } from '../utils_beach/phoneSignature_beach'
import { uploadBackupToCloud, uploadLogsToCloud, triggerContinuousBackup } from '../utils_beach/logger_beach'
import { splitLocalDateTime, parseLocalDateTimeToISO, roundToMinute, formatTimeLocal } from '../utils_beach/timeUtils_beach'
import { TimeInput24 } from './TimeInput24_beach'
import { uploadScoresheetAsync } from '../utils_beach/scoresheetUploader_beach'
import { useConnectionHealthMonitor } from '../hooks_beach/useConnectionHealthMonitor_beach'
import { ArrowLeftRight, Card, ChartColumn, ClipboardList, Copy, Download, FileText, NotebookPen, RefreshCw, Save, Search, Settings, Smartphone, TriangleAlert, Volleyball, Wrench } from './Icons_beach'
import { ChevronDown, ChevronUp, Ban, Expand, IdCard, KeyRound, ListChecks, Menu as MenuIcon, MessageSquareText, MonitorPlay, ScrollText, SlidersHorizontal, Users, Zap } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { AppSpinner } from '../ui/volleyui/AppSpinner.jsx'
import { modalCancelClass, modalPrimaryClass, ActionSheet, ActionSheetItem } from '../ui/volleyui/Modal.jsx'
import { dayLabel, timeSecondsLabel } from '../ui/volleyui/format.js'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
import { discPaint, effectiveTeamColour, isLightColour } from '../utils_beach/teamColours_beach'
import { preload, usePreloaded } from '../utils_beach/preload_beach'

// ── volleyui chrome for the scoring screen ───────────────────────────────────
// Only the chrome around the court takes these: the toolbar, the side columns,
// the rally controls, menus and dialogs. Team colours, the score digits, the
// court and its players, and the serve / BMP / time-out / sanction markers keep
// their meaning and their colours (volleyui §7). Sizes stay as they were, so
// every tap target keeps its courtside size.

/** Toolbar trigger (Scoresheet, Menu): white, stone hairline, lucide glyph. Not
 *  inside the toolbar's flow change: h-9 like before, and the ::before pad grows
 *  the hit area to 44px+ without moving the layout. */
const SB_TOOLBAR_BTN = `relative inline-flex items-center justify-center gap-1 h-9 min-w-11 px-3 rounded-lg border border-stone-200 bg-white text-sm font-semibold tracking-normal text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] ${FOCUS_RING}`

/** Rally controls: the big courtside buttons keep their inline sizes (92px+ at
 *  full scale); these give them the volleyui faces. Start / End interval are
 *  the dark key action, a point is the emerald confirm, Replay the white
 *  outline, Decision change amber (a decision), Undo the red outline (it goes
 *  through a confirm). The Referee BMP keeps its orange (a domain marker). */
/** The rally controls scale with the screen, but never below this: at 0.53
 *  (a 1024×600 tablet) Undo came out 22 px tall, Start set 49 px. With the
 *  floor and the min sizes below, Undo stays ≥ 44 px and a point button
 *  ≥ 54 px on that screen (volleyui §7). */
const RALLY_MIN_SCALE = 0.85

const SB_RALLY_BASE = `inline-flex min-h-12 items-center justify-center rounded-xl border font-bold tracking-normal transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`
const SB_RALLY_START = `${SB_RALLY_BASE} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`
const SB_RALLY_POINT = `${SB_RALLY_BASE} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`
const SB_RALLY_OUTLINE = `${SB_RALLY_BASE} border-stone-300 bg-white text-stone-700 hover:bg-stone-50`
const SB_RALLY_DECISION = `${SB_RALLY_BASE} border-amber-400 bg-amber-300 text-stone-900 hover:bg-amber-400`
const SB_RALLY_BMP = `${SB_RALLY_BASE} border-orange-500 bg-orange-500 text-stone-950 hover:bg-orange-600`
const SB_RALLY_UNDO = `${SB_RALLY_BASE} border-red-200 bg-white text-red-700 hover:bg-red-50`

/** The in-rally row (Replay | Point A | Point B | Referee BMP): one sizing
 *  rule, so "Referee BMP" no longer wraps onto two lines next to the big point
 *  buttons. The point buttons are as big as the row allows (volleyui §7):
 *  wider, and on a 1024×600 tablet as tall as fits above Undo. */
function rallyRowButton(scaleFactor, kind) {
  const isPoint = kind === 'point'
  return {
    padding: '12px 16px',
    minHeight: `${Math.max(58, 110 * scaleFactor)}px`,
    minWidth: isPoint ? '150px' : '140px',
    fontSize: isPoint ? '24px' : '20px',
    lineHeight: 1.1,
    whiteSpace: 'nowrap'
  }
}

/** The player menu's height with Sanction open (4 items + Medical, 44 px+
 *  each): it opens where that fits, so opening Sanction never moves it. */
const PLAYER_MENU_OPEN_HEIGHT = 380

/** A popover's top: centred on `centerY`, but inside the window. */
function clampedMenuTop(centerY, height) {
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800
  return Math.max(8, Math.min(centerY - height / 2, winH - height - 8))
}

/** The serve indicator and the serving ball, as fractions of the design vmin
 *  (scaled with the screen like the rest of the court). The SERVE box was
 *  ~75 px with small text, and the ball (0.08) almost the size of the player
 *  disc (0.10), touching its position badge: now a bigger SERVE box and a
 *  ball of 60 % of the disc, which keeps clear of the badge. */
const SERVE_LABEL = 0.033
const SERVE_NUMBER = 0.083
const SERVE_BOX = 0.13
const SERVE_BALL = 0.06

/** The Referee BMP dialog's three choices: equal columns that shrink inside
 *  the dialog (a long team name is cut with an ellipsis, never past the edge). */
const bmpChoiceButton = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  padding: '12px 10px',
  minHeight: '52px',
  fontSize: '16px',
  fontWeight: 600,
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis'
}

/** A label that some locales break with a soft "-\n" (de: "Verzögerungs-\nwarnung"), on one line. */
const oneLine = (text) => String(text).replace(/-\n/g, '').replace(/\n/g, ' ')

// Finished sets a team won. A set row holds its points, not its winner.
const setsWonBy = (sets, teamKey) => (sets || []).filter(s => s.finished &&
  (teamKey === 'team1' ? s.team1Points > s.team2Points : s.team2Points > s.team1Points)).length

/** Every dialog of the scoring screen is the volleyui one (Modal_beach tone="light"). */
function Modal(props) {
  return <LegacyModal tone="light" {...props} />
}

/** Micro-label over a value (SET, rally status, last action). */
const SB_EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500'

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

// matches.current_set follows the set being played, through the sync queue
// (the live state carries it too, but only the matches row is the record)
async function queueCurrentSet(seedKey, index) {
  if (!seedKey || !index) return
  await db.sync_queue.add({
    resource: 'match',
    action: 'update',
    payload: { id: seedKey, current_set: index },
    ts: new Date().toISOString(),
    status: 'queued'
  })
}

// Live-state write failures already shown to the scorer this session (one
// modal per kind, never one per point)
const liveStateErrorShown = new Set()

// The scoring screen's data, read in ONE read transaction (useActionLiveQuery:
// a scorer action's dialogs change in the render that shows its data)
function readScoreboard(matchId) {
  return db.transaction('r', db.matches, db.teams, db.sets, db.players, db.events, async () => {
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
  })
}

const scoreboardKey = (matchId) => `scoreboard:${matchId}`

/**
 * Read by App before it opens the scoreboard: its first paint shows the
 * match, never 'Loading...' first (laptop run 2026-10-08, OB-3), and the
 * screen before it stays until then.
 */
export const preloadScoreboard = (matchId) => preload(scoreboardKey(matchId), () => readScoreboard(matchId))

export default function Scoreboard({ matchId, scorerAttentionTrigger = null, onFinishSet, onOpenSetup, onOpenMatchSetup, onOpenCoinToss, onTriggerEventBackup }) {
  // diagnostics mode: React commits per user action (nothing while it is off)
  useDiagCommits('scoreboard')
  const { t } = useTranslation()
  const { vmin } = useScaledLayout()
  const { showAlert } = useAlert()
  const { syncStatus, flush: flushSyncQueue } = useSyncQueue()
  const cLogger = useComponentLogging('Scoreboard')
  // Confirmation dialogs close before they write (useConfirmAction), so a write
  // that fails must say so: the dialog is no longer there to show it
  const onConfirmFailed = useCallback((err) => {
    // A scorer action's failure is reported once (useScorerActions_beach)
    if (isReportedActionError(err)) return
    console.error('[confirm] action failed after its dialog closed', err)
    showAlert(t('scoreboard.confirmFailed'), 'error')
  }, [showAlert, t])
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
  // The phone layout's match menu (an action sheet of the toolbar's Menu)
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false)
  const [showOptionsInMenu, setShowOptionsInMenu] = useState(false)
  const [connectionSetupModal, setConnectionSetupModal] = useState(false)
  const [localManageCaptainOnCourt, setLocalManageCaptainOnCourt] = useState(() => {
    // Load from localStorage, default to false
    const saved = localStorage.getItem('manageCaptainOnCourt')
    return saved === 'true'
  })
  const manageDob = localStorage.getItem('manageDob') === 'true'
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
  // MTO/RIT countdown modal: { type: 'mto'|'rit', ritType?: 'no_blood'|'toilet'|'weather', team, playerNumber, playerName, countdown: 300, started: boolean, startedAt?: ISO string, startSeq?: number }
  // (the running MTO / RIT is also rebuilt from the events: medicalEvents_beach)
  const [medicalModal, setMedicalModal] = useState(null)

  const setIntervalDuration = 60 // 1 minute for beach volleyball (FIVB standard)
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
  const [showPinsModal, setShowPinsModal] = useState(false)
  const [courtSwitchModal, setCourtSwitchModal] = useState(null) // { set, team1Points, team2Points, teamThatScored } | null
  const [ttoModal, setTtoModal] = useState(null) // { set, team1Points, team2Points, countdown?, started? } | null - Technical Timeout
  const [preEventPopup, setPreEventPopup] = useState(null) // { message: string } | null - "One point to switch/TTO" notification
  const [timeoutModal, setTimeoutModal] = useState(null) // { team: 'team1'|'team2', countdown: number, started: boolean }
  // Latest values for syncLiveStateToSupabase, which does not list them (as
  // OpenVolley): listing them would remake it, and all that depends on it,
  // at every countdown tick; reading the state froze them at its last remake.
  const timeoutModalRef = useRef(null)
  const ttoModalRef = useRef(null)
  const scorerAttentionTriggerRef = useRef(scorerAttentionTrigger)
  useEffect(() => { timeoutModalRef.current = timeoutModal }, [timeoutModal])
  useEffect(() => { ttoModalRef.current = ttoModal }, [ttoModal])
  useEffect(() => { scorerAttentionTriggerRef.current = scorerAttentionTrigger }, [scorerAttentionTrigger])
  // The break between two sets runs on this screen (set by the effect after
  // isBetweenSets): every live-state push in it keeps the break
  const breakRunningRef = useRef(false)
const [betweenSetsCountdown, setBetweenSetsCountdown] = useState(null) // { countdown: number, started: boolean, finished?: boolean } | null
  const countdownDismissedRef = useRef(false) // Track if countdown was manually dismissed
  const setEndModalDismissedRef = useRef(null) // Track setIndex where set end modal was dismissed via undo
  const confirmedSetEndRef = useRef(new Set()) // Track which sets have been confirmed to prevent double-processing
  const timeoutStartTimestampRef = useRef(null) // Timestamp when timeout started
  const timeoutInitialCountdownRef = useRef(TEAM_TIMEOUT_SECONDS) // Initial timeout duration (45 s on purpose: see TEAM_TIMEOUT_SECONDS)
  const betweenSetsStartTimestampRef = useRef(null) // Timestamp when between-sets interval started
  const betweenSetsInitialCountdownRef = useRef(60) // Initial between-sets duration
  const [bmpModal, setBmpModal] = useState(null) // { type: 'team'|'referee', team?: 'team1'|'team2' } | null - Ball Mark Protocol modal
  const [bmpOutcomeModal, setBmpOutcomeModal] = useState(null) // { type: 'team'|'referee', team?: 'team1'|'team2', requestedAt, currentScore, currentServe } | null - the request is logged with its outcome
  const [bmpSelectedOutcome, setBmpSelectedOutcome] = useState(null) // 'successful'|'unsuccessful'|'judgment_impossible'|'in'|'out' - selected outcome awaiting confirmation

  // "One point to switch / TTO": a chip under the rally status (it was a big
  // banner over the players, gone on the next tap). It covers nothing, so it
  // stays a few seconds.
  useEffect(() => {
    if (preEventPopup) {
      const timer = setTimeout(() => setPreEventPopup(null), 8000)
      return () => clearTimeout(timer)
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
  // What the team that chooses in the interval took (side, or serve or
  // receive), per set and chooser: { '2:team2': 'side' }. Only which buttons
  // the interval shows; the sides and the serve themselves are on the match
  const [intervalChoices, setIntervalChoices] = useState({})
  const [postMatchSignature, setPostMatchSignature] = useState(null) // 'team1-captain' | 'team2-captain' | null
  const [sanctionConfirm, setSanctionConfirm] = useState(null) // { side: 'left'|'right', type: 'improper_request'|'delay_warning'|'delay_penalty' } | null
  const [sanctionDropdown, setSanctionDropdown] = useState(null) // { team: 'team1'|'team2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, element: HTMLElement, x?: number, y?: number } | null
  const [sanctionConfirmModal, setSanctionConfirmModal] = useState(null) // { team: 'team1'|'team2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, sanctionType: 'warning'|'penalty'|'expulsion'|'disqualification' } | null
  const [expulsionConfirmModal, setExpulsionConfirmModal] = useState(null) // { team, type, playerNumber, position, role, sanctionType, endsMatch: boolean } | null - Secondary confirmation for expulsion/disqualification
  const [courtSanctionExpanded, setCourtSanctionExpanded] = useState(false) // Toggle court sanction dropdown

  const [playerActionMenu, setPlayerActionMenu] = useState(null) // { team: 'team1'|'team2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null

  const [leftDelaysDropdownOpen, setLeftDelaysDropdownOpen] = useState(false) // Narrow mode dropdown for left team delays/sanctions buttons
  const [rightDelaysDropdownOpen, setRightDelaysDropdownOpen] = useState(false) // Narrow mode dropdown for right team delays/sanctions buttons
  const [replayRallyConfirm, setReplayRallyConfirm] = useState(null) // { event: Event, description: string, selectedOption: 'swap'|'replay' } | null
  const [replayConfirm, setReplayConfirm] = useState(false) // "Replay rally" during a rally waits for this confirmation
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
  const [alwaysDownloadAtSetEnd, setAlwaysDownloadAtSetEnd] = useState(false)
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
  // Display mode (the options' Screen mode): 'auto' | 'desktop' | 'tablet' |
  // 'phone', kept in localStorage as the home options keep it
  const [displayMode, setDisplayModeState] = useState(() => readStoredDisplayMode())
  const setDisplayMode = useCallback((mode) => {
    const next = normaliseDisplayMode(mode)
    setDisplayModeState(next)
    try { localStorage.setItem('displayMode', next) } catch { /* private mode: this visit only */ }
  }, [])
  // Tablet mode: fullscreen, as the home options enter it
  const enterDisplayMode = useCallback((mode) => {
    if (mode === 'tablet' && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
    setDisplayMode(mode)
  }, [setDisplayMode])
  const exitDisplayMode = useCallback(() => {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    setDisplayMode('desktop')
  }, [setDisplayMode])
  const detectedDisplayMode = detectDisplayMode({ width: viewportWidth, height: viewportHeight })
  // The phone layout (PhoneScoreboard_beach) replaces the scoring body: the
  // Phone mode, or the automatic mode on a phone held upright. A phone in the
  // automatic mode keeps it when turned sideways (the screen stays mounted,
  // dialogs and countdowns included), under a notice to hold it upright,
  // rather than falling back to the landscape layout.
  const isPhoneSideways = phoneHeldSideways(displayMode, { width: viewportWidth, height: viewportHeight })
  const isPhoneView = phoneLayoutActive(displayMode, { width: viewportWidth, height: viewportHeight }) || isPhoneSideways
  // A phone in the automatic mode, or the Phone mode, is not locked to
  // landscape; tablets and computers are locked as before
  const keepOrientationFree = displayMode === 'phone' || (displayMode === 'auto' && isPhoneScreen())
  const relayKeyRef = useRef(null) // The match's relay room key (seed key), set by the relay sync
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

  // Auto-lock orientation to landscape for scoreboard on mount. The Android
  // app locks the activity natively (its WebView ignores
  // screen.orientation.lock()); a browser tries the web API.
  useEffect(() => {
    if (keepOrientationFree) {
      if (isNativeApp()) unlockNativeOrientation().catch(() => {})
      return
    }
    if (isNativeApp()) {
      lockNativeLandscape().catch(() => {})
      return () => { unlockNativeOrientation().catch(() => {}) }
    }
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
  }, [keepOrientationFree])

  // Calculate scale factor for proportional viewport scaling (no cap - scales to fill available space)
  const scaleFactor = Math.min(
    viewportWidth / DESIGN_WIDTH,
    viewportHeight / DESIGN_HEIGHT
  )

  // App's read when it opened the scoreboard (preloadScoreboard): the first
  // paint shows the match, not 'Loading...' first
  const preloaded = usePreloaded(matchId != null ? scoreboardKey(matchId) : null)
  const [data, commits] = useActionLiveQuery(() => readScoreboard(matchId), [matchId], preloaded)

  // --- Live connection health monitoring ---
  const handleDeviceDisconnected = useCallback(({ label }) => {
    showAlert(t('scoreboard.deviceDisconnected', { defaultValue: '{{device}} disconnected', device: label }), 'warning')
  }, [showAlert, t])

  useConnectionHealthMonitor(data?.match, handleDeviceDisconnected, {
    enabled: !!(data?.match && (data.match.refereeConnectionEnabled || data.match.team1TeamConnectionEnabled || data.match.team2TeamConnectionEnabled))
  })

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
      team1Score: data.set?.team1Points,
      team2Score: data.set?.team2Points,
      currentServe: data.set?.currentServe,
      team1Rotation: data.set?.team1Rotation,
      team2Rotation: data.set?.team2Rotation,
      team1OnCourt: data.set?.team1OnCourt,
      team2OnCourt: data.set?.team2OnCourt,

      team1Timeouts: data.set?.team1Timeouts,
      team2Timeouts: data.set?.team2Timeouts,
      rallyInProgress: data.set?.rallyInProgress,
      team1SetsWon: setsWonBy(data.sets, 'team1'),
      team2SetsWon: setsWonBy(data.sets, 'team2'),
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
  const captureFullStateSnapshot = useCallback(() => captureStateSnapshot(db, matchId), [matchId])

  // A scorer action is ONE Dexie transaction and ONE screen change
  // (useScorerActions_beach): the score, the point event, the technical
  // time-out and the dialog the point opens (change of courts, set end) show
  // together, not one after the other. Ported from OpenVolley beb40826.
  const { runAction, deferUi, deferEffect, inAction } = useScorerActions({
    db,
    commits,
    mutexRef: eventInProgressRef,
    captureFinalSnapshot: captureFullStateSnapshot,
    onError: onConfirmFailed
  })

  // The event history (db_beach/eventHistory_beach) queues the void / edit job
  // of an undone or changed event INSIDE the action's transaction only when it
  // knows the match's seed_key (after a reload it does not): told here
  useEffect(() => {
    if (matchId != null && data?.match) rememberSeedKey(matchId, data.match.seed_key ?? null, data.match.test === true)
  }, [matchId, data?.match?.seed_key, data?.match?.test]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // Restore court switch state and match-level sanctions
      if (match) {
        const matchUpdate = {}
        // Restore setLeftTeamOverrides (court side assignments for all sets)
        if (snapshot.setLeftTeamOverrides !== undefined) {
          matchUpdate.setLeftTeamOverrides = snapshot.setLeftTeamOverrides
        }
        // Restore set3 (tie break) court switch flag
        if (snapshot.currentSetIndex === 3) {
          matchUpdate.set3CourtSwitched = snapshot.set3CourtSwitched || false
        }
        // Restore match-level sanctions (improper request, delay warning flags)
        if (snapshot.matchSanctions !== undefined) {
          matchUpdate.sanctions = snapshot.matchSanctions
        }
        // Restore serve configuration
        if (snapshot.firstServe !== undefined) {
          matchUpdate.firstServe = snapshot.firstServe
        }
        if (snapshot.set2FirstServe !== undefined) {
          matchUpdate.set2FirstServe = snapshot.set2FirstServe
        }
        if (snapshot.set3FirstServe !== undefined) {
          matchUpdate.set3FirstServe = snapshot.set3FirstServe
        }
        if (snapshot.team1FirstServe !== undefined) {
          matchUpdate.team1FirstServe = snapshot.team1FirstServe
        }
        if (snapshot.team2FirstServe !== undefined) {
          matchUpdate.team2FirstServe = snapshot.team2FirstServe
        }
        if (snapshot.set3CoinTossWinner !== undefined) {
          matchUpdate.set3CoinTossWinner = snapshot.set3CoinTossWinner
        }
        // Restore set3LeftTeam
        if (snapshot.set3LeftTeam !== undefined) {
          matchUpdate.set3LeftTeam = snapshot.set3LeftTeam
        }
        if (Object.keys(matchUpdate).length > 0) {
          // A/B labels as the teams are named now: a "Swap team A ↔ B" since
          // the snapshot (not an event, so not undone) keeps its designation
          // (coinToss_beach labelsInDesignation)
          await db.matches.update(matchId, labelsInDesignation(matchUpdate, snapshot.teamAKey, match.coinTossTeamA || 'team1'))
        }
      }
    } catch (err) {
      console.error('[restoreStateFromSnapshot] Error:', err)
    }
  }, [matchId])

  // The match on the relay, where the referee, the livescore and the LedBox
  // bridge follow it: this screen's share of the scorer's one relay
  // connection (utils_beach/relayPublisher_beach, shared with App_beach).
  // Every (re)connect syncs the match; the scoring actions sync through
  // syncFunctionRef. The relay holds every court's match, so nothing here
  // ever clears it (clear-all-matches is gone).
  const hasMatchData = !!data?.match
  useEffect(() => {
    if (!matchId || !hasMatchData) return undefined
    let active = true

    // Fresh from IndexedDB (React state may be stale in these closures)
    const syncMatchData = async () => {
      if (!scorerRelay.isOpen()) return
      try {
        const bundle = await readRelayBundle(db, matchId)
        if (!active || !bundle) return
        relayKeyRef.current = bundle.key
        scorerPublisher.sync(bundle.key, bundle.local)
      } catch (err) {
        console.warn('[Relay] sync failed:', err?.message)
      }
    }
    syncFunctionRef.current = syncMatchData

    const detach = scorerRelay.attach(scorerRelayUrl({ wsPort: serverStatus?.wsPort }), {
      onOpen: () => { syncMatchData() },
      onMessage: async (message) => {
        // A desktop relay asks the scoreboard for a match it does not hold
        if (message.type !== 'match-data-request' && message.type !== 'game-number-request') return
        try {
          const bundle = await readRelayBundle(db, matchId)
          if (active && bundle) scorerPublisher.answer(message, bundle.key, bundle.local)
        } catch { /* the relay times the request out */ }
      }
    })

    return () => {
      active = false
      if (syncFunctionRef.current === syncMatchData) syncFunctionRef.current = null
      detach()
    }
  }, [matchId, hasMatchData, serverStatus?.wsPort])

  // Sync when connection settings change (e.g., referee dashboard enabled/disabled)
  useEffect(() => {
    if (syncFunctionRef.current && data?.match) {
      syncFunctionRef.current()
    }
  }, [data?.match?.refereeConnectionEnabled, data?.match?.team1TeamConnectionEnabled, data?.match?.team2TeamConnectionEnabled])

  // Sync data to referee - call this after any action that changes match data
  // If the relay socket isn't ready, retry after a short delay
  const syncToReferee = useCallback(() => {
    if (syncFunctionRef.current) {
      syncFunctionRef.current()
    }
    // Not connected: try again shortly (a lineup saved while the socket is
    // reconnecting); every reconnect syncs anyway
    if (!scorerRelay.isOpen()) {
      setTimeout(() => {
        if (syncFunctionRef.current) {
          syncFunctionRef.current()
        }
      }, 1000)
    }
  }, [])

  // Send action to referee for showing modals/countdowns
  const sendActionToReferee = useCallback((actionType, actionData) => {
    // The match's relay room (its seed key, known after the first sync)
    const key = relayKeyRef.current
    if (!key || !scorerRelay.isOpen()) return

    const sendTimestamp = Date.now()
    scorerRelay.send({
      type: 'match-action',
      matchId: key,
      action: actionType,
      data: actionData,
      timestamp: sendTimestamp,
      _timestamp: sendTimestamp // For latency tracking
    })
  }, [])

  // Broadcast match state to local scoreboard windows via BroadcastChannel (works offline, no Supabase)
  const broadcastToScoreboard = useCallback(async (cachedSnapshot = null) => {
    if (!matchId) return
    try {
      const snapshot = cachedSnapshot || await captureFullStateSnapshot()
      if (!snapshot) return

      const match = await db.matches.get(matchId)
      if (!match) return

      const sideA = snapshot.sideA || 'left'
      const servingTeam = snapshot.servingTeam === snapshot.teamAKey ? sideA : (sideA === 'left' ? 'right' : 'left')

      const broadcastData = {
        match_id: matchId,
        current_set: snapshot.currentSetIndex,
        team_a_name: snapshot.teamAName,
        team_a_short: snapshot.teamAShort,
        team_a_color: snapshot.teamAColor,
        team_b_name: snapshot.teamBName,
        team_b_short: snapshot.teamBShort,
        team_b_color: snapshot.teamBColor,
        sets_won_a: snapshot.setScoreA,
        sets_won_b: snapshot.setScoreB,
        points_a: snapshot.pointsA,
        points_b: snapshot.pointsB,
        side_a: sideA,
        serving_team: servingTeam,
        server_number: snapshot.serverNumber || null,
        rally_in_progress: snapshot.rallyInProgress || false,
        challenges_used_a: snapshot.challengesUsedA || 0,
        challenges_used_b: snapshot.challengesUsedB || 0,
        timeouts_a: snapshot.timeoutsA,
        timeouts_b: snapshot.timeoutsB,
        timeout_active: !!timeoutModal,
        set_interval_active: false,
        match_status: snapshot.matchStatus || 'live',
        game_n: match.gameN || match.game_n || null,
        league: match.league || null,
        gender: match.match_type_2 || null,
        updated_at: new Date().toISOString()
      }

      console.log('[Broadcast] server_number debug:', {
        snapshotServerNumber: snapshot.serverNumber,
        snapshotServingTeam: snapshot.servingTeam,
        snapshotTeamAKey: snapshot.teamAKey,
        sideA,
        servingTeam,
        broadcastServerNumber: broadcastData.server_number,
        broadcastServingTeam: broadcastData.serving_team,
        rallyInProgress: broadcastData.rally_in_progress
      })

      // The relay (referee, livescore, LedBox on the venue network): the
      // same state with serve_player, under the match's room key. Sent again
      // after every sync (relayPublisher_beach), works without the cloud.
      const relayKey = relayMatchKey(match)
      if (relayKey) scorerPublisher.liveState(relayKey, { ...broadcastData, match_id: relayKey })

      const ch = new BroadcastChannel('openbeach-scoreboard')
      ch.postMessage({ type: 'LIVE_STATE_UPDATE', data: broadcastData })
      ch.close()
    } catch (e) { console.error('[Broadcast] error:', e) }
  }, [matchId, captureFullStateSnapshot, timeoutModal])

  // Listen for scoreboard state requests (when scoreboard opens mid-match)
  useEffect(() => {
    if (!matchId) return
    let channel
    try {
      channel = new BroadcastChannel('openbeach-scoreboard')
      channel.onmessage = (event) => {
        if (event.data?.type === 'REQUEST_STATE') {
          broadcastToScoreboard()
        }
      }
    } catch (e) { return }
    return () => { try { channel.close() } catch (e) {} }
  }, [matchId, broadcastToScoreboard])

  // Sync live state to Supabase for referee.openvolley.app
  // SIMPLIFIED: Uses stateSnapshot from events instead of recomputing everything
  // cachedSnapshot: Optional snapshot passed from logEvent to avoid re-fetching/re-computing
  const syncLiveStateToSupabase = useCallback(async (eventType, eventTeam, eventData, cachedSnapshot = null) => {
    const _tl = performance.now()
    // The time-out, TTO and attention trigger of the call (read before any
    // await: a TTO ending right after this call is already null by then)
    const timeoutModal = timeoutModalRef.current
    const ttoModal = ttoModalRef.current
    const scorerAttentionTrigger = scorerAttentionTriggerRef.current
    // The break between sets goes on after the set end's own push (as
    // OpenVolley's keepInterval): a push in it (an undo, the set 3 toss, a
    // sanction) keeps it. It needed the match status 'interval', which this
    // screen never writes, so every later push ended the break on the
    // referee and the livescore. Not the pushes that end it.
    const keepInterval = breakRunningRef.current && !['set_end', 'end_interval', 'set_start'].includes(eventType)

    // Always broadcast locally (works offline, no Supabase needed)
    broadcastToScoreboard(cachedSnapshot)

    if (!isBackendAvailable() || !matchId) return

    try {
      // Get match to check if it's a test match
      const match = await db.matches.get(matchId)
      if (!match || match.test) return

      // The cloud sets row follows the score during the set (as OpenVolley):
      // queued, so it reaches the cloud offline-first
      if (changesSetScore(eventType)) void queueSetScoreSync(db, { matchId })

      // Get the Supabase match UUID
      let supabaseMatchId = null
      const externalId = match.externalId
      if (externalId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId)) {
        supabaseMatchId = externalId
      } else {
        const seedKey = match.seed_key || String(matchId)
        const { data: matchData, error } = await apiFrom('matches')
          .select('id')
          .eq('external_id', seedKey)
          .eq('sport_type', SPORT_TYPE)
          .maybeSingle()
        if (error || !matchData) return
        supabaseMatchId = matchData.id
      }
      if (!supabaseMatchId) return

      // Use cached snapshot if provided, otherwise fetch/compute. In the
      // break: fresh, the coming set's (the set end created it; the last
      // event's snapshot can be of the set that ended)
      let snapshot = keepInterval ? await captureFullStateSnapshot() : cachedSnapshot
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
      // Was the set the snapshot shows finished already (then it counts it)?
      const snapshotSet = match?.status === 'interval'
        ? await db.sets.where('matchId').equals(matchId).and(s => s.index === snapshot.currentSetIndex).first()
        : null
      const isSetInterval = !keepInterval && isLiveSetInterval({
        eventType,
        matchStatus: match?.status,
        snapshotSetFinished: snapshotSet?.finished === true
      })
      // The break's start: the set end's confirmation (its set_end event, as
      // the screen's countdown; else the set's end time), so the referee's
      // countdown runs on instead of starting again
      let keptIntervalStartedAt = null
      if (keepInterval) {
        const previousSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === snapshot.currentSetIndex - 1).first()
        const setEndEvent = previousSet && (await db.events.where('matchId').equals(matchId).toArray())
          .filter(e => e.type === 'set_end' && e.setIndex === previousSet.index)
          .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
        keptIntervalStartedAt = setEndEvent?.ts || previousSet?.endTime || null
      }
      const isTimeout = eventType === 'timeout' || (eventType !== 'end_timeout' && timeoutModal !== null)
      const isTto = eventType !== 'end_tto' && (eventType === 'technical_to' || eventType === 'tto_start' || (ttoModal !== null && ttoModal.started))

      console.debug('[Scoreboard TTO DEBUG] syncLiveState called:', {
        eventType,
        isTto,
        ttoModalInClosure: ttoModal ? { started: ttoModal.started, startedAt: ttoModal.startedAt, countdown: ttoModal.countdown } : null,
        isTimeout,
        isSetInterval
      })

      // If it's a timeout, we need a stable start time
      const timeoutStartedAt = eventType === 'timeout'
        ? new Date().toISOString()
        : (timeoutModal?.startedAt || new Date().toISOString())

      // If it's a TTO, we need a stable start time
      const ttoStartedAt = (eventType === 'technical_to' || eventType === 'tto_start')
        ? new Date().toISOString()
        : (ttoModal?.startedAt || new Date().toISOString())

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
      else if (isSetInterval || keepInterval) matchStatus = 'interval'

      // The side team A plays the next set on (the match's end: the last
      // set's), by the scorer's own rule (courtSides_beach): the teams stay
      // where they finished the set, its changes of courts and the TTO's
      // included, unless "Switch sides" is asked (FIVB beach rule 18.1.1);
      // set 3 starts on its toss's side. Not alternated by the set's number.
      const nextSideA = isSetInterval
        ? (leftTeamInSet(finalSetIndex, match) === 'A' ? 'left' : 'right')
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
        // The live-state table is shared with indoor: livescore and the
        // display lists filter on sport_type
        sport_type: SPORT_TYPE,
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
        // Serving player number and BMP challenges used (for scoreboard/livescore display)
        ...(snapshot.serverNumber ? { server_number: snapshot.serverNumber } : {}),
        challenges_used_a: snapshot.challengesUsedA || 0,
        challenges_used_b: snapshot.challengesUsedB || 0,
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
        tto_active: isTto,
        tto_started_at: isTto ? ttoStartedAt : null,
        set_interval_active: isSetInterval || (keepInterval && !isMatchFinished),
        set_interval_started_at: isSetInterval
          ? (match?.intervalStartedAt || intervalStartedAt)
          : (keepInterval && !isMatchFinished ? keptIntervalStartedAt : null),
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
      // matches.current_set is queued on every set change (queueCurrentSet).
      const liveStateResult = await apiFrom('match_live_state').upsert(liveStateData, { onConflict: 'match_id' })

      if (liveStateResult.error) {
        console.error('[LiveState] Sync error:', liveStateResult.error)
        // Not signed in / not this account's match / offline / rate limited:
        // the sync queue's banner explains that; no modal. Any other refusal
        // (4xx: a column the server lacks, a bad value) gets the modal once
        // per session, not on every point; a 5xx too, once.
        const st = liveStateResult.error.status
        if (st === 401 || st === 403 || st === 426 || st === 429 || st === 0 || liveStateResult.error.network) return
        const kind = st >= 400 && st < 500 ? '4xx' : 'other'
        if (liveStateErrorShown.has(kind)) return
        liveStateErrorShown.add(kind)
        setScoresheetErrorModal({
          error: t('errors.syncFailed'),
          details: liveStateResult.error.message || t('errors.databaseWriteError')
        })
      }
    } catch (err) {
      console.error('[LiveState] Exception:', err)
    }
  }, [matchId, captureFullStateSnapshot, broadcastToScoreboard])



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

    // The relay the match goes to (backendConfig: the venue relay, or the
    // cloud): its match list answers
    const listUrl = getApiUrl('/api/match/list')

    if (!listUrl) {
      statuses.api = 'n/a'
      statuses.server = 'n/a'
      statuses.websocket = 'n/a'
      debugInfo.api = { status: 'n/a', message: 'No relay for this page' }
      debugInfo.server = { status: 'n/a', message: 'No relay for this page' }
      debugInfo.websocket = { status: 'n/a', message: 'No relay for this page' }
    } else try {
      const response = await fetch(listUrl)
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

    // The scorer's own relay socket (shared with App_beach); no probe socket
    if (statuses.websocket !== 'n/a') {
      const relaySocket = scorerRelay.socket
      if (relaySocket && relaySocket.readyState === 1) {
        statuses.websocket = 'connected'
      } else if (relaySocket && relaySocket.readyState === 0) {
        statuses.websocket = 'connecting'
      } else {
        statuses.websocket = scorerRelayUrl() ? 'disconnected' : 'n/a'
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

    // Only sync official matches (not test matches) that have a seed_key
    // (the cloud key; a bare Dexie id is not unique across devices)
    if (!isTest && match?.seed_key) {
      await db.sync_queue.add({
        resource: 'set',
        action: 'insert',
        payload: {
          external_id: setExtId(match.seed_key, setId),
          match_id: match.seed_key,
          index: nextIndex,
          team1_points: 0,
          team2_points: 0,
          finished: false,
          start_time: roundToMinute(new Date().toISOString())
        },
        ts: roundToMinute(new Date().toISOString()),
        status: 'queued'
      })
      await queueCurrentSet(match.seed_key, nextIndex)
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
      // If stop-match forfeit flow pre-populated the text, don't override it
      if (!stopMatchRemarksStep) {
        const currentRemarks = data?.match?.remarks || ''
        // If there are existing remarks, add a newline at the end for new input
        setRemarksText(currentRemarks ? `${currentRemarks}\n` : '')
      }
      // Focus textarea after modal opens
      setTimeout(() => {
        if (remarksTextareaRef.current) {
          remarksTextareaRef.current.focus()
          const len = remarksTextareaRef.current.value.length
          remarksTextareaRef.current.setSelectionRange(len, len)
        }
      }, 100)
    }
  }, [showRemarks, data?.match?.remarks, stopMatchRemarksStep])

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
    // One rule for the court, the interval preview and the started set
    // (courtSides_beach): the interval shows the side the next set starts on
    return isTeam1LeftInSet(data.set.index, data.match)
  }, [data?.set, data?.match])

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

  // In play when the set's last event is a rally_start (rally_beach: the
  // point and rally-start taps check the same rule against the database)
  const rallyStatus = useMemo(
    () => (data?.set ? rallyStatusOf(data.events, data.set.index) : 'idle'),
    [data?.events, data?.set]
  )

  // The rally of the set being played, read from the database (inside an
  // action: its transaction). A tap is checked against it, not against the
  // screen, which on a slow tablet can be seconds behind
  const readRallyStatus = useCallback(async () => {
    const set = currentSetOf(await db.sets.where('matchId').equals(matchId).toArray())
    if (!set) return 'idle'
    const events = await db.events.where('matchId').equals(matchId).toArray()
    return rallyStatusOf(events, set.index)
  }, [matchId])

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

  // The break runs while the screen is between sets with its countdown on
  // (at 0 it waits for "End set interval"; ended or run out: null)
  useEffect(() => {
    breakRunningRef.current = isBetweenSets && betweenSetsCountdown !== null
  }, [isBetweenSets, betweenSetsCountdown])

  // Start between-sets countdown when we detect we're between sets
  useEffect(() => {
    // Only start countdown if between sets AND countdown is null (not started yet)
    // Don't restart if countdown exists (even if finished) or was dismissed
    if (isBetweenSets && betweenSetsCountdown === null && !countdownDismissedRef.current) {
      // Calculate remaining time based on previous set's endTime
      const currentSetIndex = data?.set?.index || 1
      const previousSet = data?.sets?.find(s => s.index === currentSetIndex - 1)
      let remainingTime = setIntervalDuration

      // The interval runs from the set end's confirmation: its set_end event
      // (the set's endTime is rounded down to the minute, up to 59 s early)
      const setEndEvent = previousSet && [...(data?.events || [])].reverse().find(e => e.type === 'set_end' && e.setIndex === previousSet.index)
      const intervalStart = setEndEvent?.ts || previousSet?.endTime
      if (intervalStart) {
        const endTime = new Date(intervalStart).getTime()
        const now = Date.now()
        const elapsedSeconds = Math.floor((now - endTime) / 1000)
        remainingTime = Math.max(0, setIntervalDuration - elapsedSeconds)
      }

      // If time has already elapsed, mark as dismissed
      if (remainingTime <= 0) {
        countdownDismissedRef.current = true
      } else {
        setBetweenSetsCountdown({ countdown: remainingTime, started: true, firstRender: true })
      }
    } else if (!isBetweenSets) {
      // Reset to null only when no longer between sets (new set started)
      setBetweenSetsCountdown(null)
      setBetweenSetsSetupConfirmed(false) // Reset for next interval
      countdownDismissedRef.current = false // Reset for next time
    }
  }, [isBetweenSets, data?.set?.index, data?.sets]) // Removed betweenSetsCountdown from deps to prevent restart loop

  // Handle between-sets countdown timer
  useEffect(() => {
    // No interval running (ran out, cut short by the set start, or never
    // started): the next interval starts its own clock, not this one's
    if (!betweenSetsCountdown) {
      betweenSetsStartTimestampRef.current = null
      return
    }
    if (!betweenSetsCountdown.started) return

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
          return { ...prev, countdown: remaining, firstRender: false }
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
    // The next interval starts its own clock, not this one's
    betweenSetsStartTimestampRef.current = null
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
        // ERROR: firstServeNumber is missing — coin toss data not carried over correctly
        console.error(`[Scoreboard] buildOnCourt: firstServeNumber is undefined for ${teamKey}. match.team1FirstServe=${data?.match?.team1FirstServe}, match.team2FirstServe=${data?.match?.team2FirstServe}, match.team1FirstServePlayer=${data?.match?.team1FirstServePlayer}, match.team2FirstServePlayer=${data?.match?.team2FirstServePlayer}`)
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
    const toTitleCase = (str) => str ? str.replace(/(^|[\s-])(\S)/g, (m, pre, c) => pre + c.toUpperCase()) : ''
    // For beach volleyball, build name from player last names if available
    if (players && players.length >= 1) {
      const sortedPlayers = [...players].sort((a, b) => (a.number || 0) - (b.number || 0))
      const lastNames = sortedPlayers
        .slice(0, 2)
        .map(p => {
          // Try lastName first, then extract from name, then use first name
          if (p.lastName) return toTitleCase(p.lastName)
          if (p.name && p.name.includes(' ')) return toTitleCase(p.name.split(' ').pop())
          if (p.name) return toTitleCase(p.name)
          if (p.firstName) return toTitleCase(p.firstName)
          // Last resort: use player number
          if (p.number !== undefined && p.number !== null) return `#${p.number}`
          return null
        })
        .filter(n => n)
      if (lastNames.length >= 1) {
        return lastNames.join(' / ')
      }
    }
    // Fallback to team name (accept any team name, even generic ones)
    if (teamName) {
      return teamName
    }
    // Final fallback
    return null
  }, [])

  const leftTeam = useMemo(() => {
    if (!data) return { name: 'Team A', color: '#ef4444', players: [] }
    const players = leftisTeam1 ? data.team1Players : data.team2Players
    const team = leftisTeam1 ? data.team1Team : data.team2Team
    const teamKey = leftisTeam1 ? 'team1' : 'team2'
    const isTeamA = teamKey === teamAKey
    const country = leftisTeam1 ? data.match?.team1Country : data.match?.team2Country
    // Priority: match-level edited name → teams table name (same as PDF) → auto-generated from player last names
    const matchTeamName = leftisTeam1 ? data.match?.team1Name : data.match?.team2Name
    const teamTableName = team?.name
    const beachName = buildBeachTeamName(players, team?.name, country)
    return {
      name: matchTeamName || teamTableName || beachName || (leftisTeam1 ? 'team1' : 'team2'),
      color: effectiveTeamColour(teamKey, team, data.match),
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
    // Priority: match-level edited name → teams table name (same as PDF) → auto-generated from player last names
    const matchTeamName = leftisTeam1 ? data.match?.team2Name : data.match?.team1Name
    const teamTableName = team?.name
    const beachName = buildBeachTeamName(players, team?.name, country)
    return {
      name: matchTeamName || teamTableName || beachName || (leftisTeam1 ? 'team2' : 'team1'),
      color: effectiveTeamColour(teamKey, team, data.match),
      playersOnCourt: buildOnCourt(players, false, teamKey),
      isTeamA
    }
  }, [buildOnCourt, buildBeachTeamName, data, leftisTeam1, teamAKey])

  // Both players' discs wear the team's shirt colour; the number is near-black
  // or white, whichever reads better (outlined on mid-tone shirts), and a disc
  // that would melt into the sand gets a ring of its own colour
  // (utils_beach/teamColours_beach.js). null: a colour we can't read, the disc
  // keeps its plain look.
  const discPaintBySide = useMemo(() => ({
    left: discPaint(leftTeam.color),
    right: discPaint(rightTeam.color)
  }), [leftTeam.color, rightTeam.color])

  // Get players for each team

  // The Zürich clock, 24-hour, day first: the same on every device on a court
  const formatTimestamp = useCallback(date => `${dayLabel(date, { year: true })} ${timeSecondsLabel(date)}`, [])

  // Helper function to get next sequence number for events (returns integer only)
  const getNextSeq = useCallback(async () => {
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const coinTossEvent = allEvents.find(e => e.type === 'coin_toss')

    // Get the maximum base ID (integer part only, ignoring decimals)
    // An undone event's seq is never given out again (event history high-water mark)
    const maxBaseSeq = allEvents.reduce((max, e) => {
      const seq = e.seq || 0
      const baseSeq = Math.floor(seq) // Get integer part only
      return Math.max(max, baseSeq)
    }, Math.floor(await maxVoidedSeq(db, matchId)))

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

    // Find the highest sub-sequence number for this base ID (an undone one included)
    const voidedSub = await maxVoidedSeq(db, matchId, { from: baseSeq, to: baseSeq + 0.99 })
    const maxSubSeq = [...relatedEvents, { seq: voidedSub }].reduce((max, e) => {
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
        if (window.debugCheckGamesInProgress) delete window.debugCheckGamesInProgress
      }
    }
  }, [matchId, data?.match, data?.team1Team, data?.team2Team, data?.team1Players, data?.team2Players])

  // Manual edits reach the cloud through the sync queue (kept while offline,
  // retried). They went straight to the cloud before and were lost offline;
  // the set ones also used a bare id, which the backend refuses. Test
  // matches are never queued. Ported from OpenVolley 38509c25.
  const queueManualCloudUpdate = useCallback(async (resource, fields, setId = null) => {
    try {
      const match = await db.matches.get(matchId)
      if (!match || match.test || !match.seed_key) return
      await db.sync_queue.add({
        resource,
        action: 'update',
        payload: resource === 'set'
          ? { external_id: setExtId(match.seed_key, setId), ...fields }
          : { id: match.seed_key, ...fields },
        ts: new Date().toISOString(),
        status: 'queued'
      })
    } catch (err) {
      console.warn('[ManualChange] Could not queue the cloud update:', err?.message)
    }
  }, [matchId])

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

      // To the cloud through the sync queue (kept while offline, retried)
      void queueManualCloudUpdate('match', { manual_changes: updatedChanges })
    }

    return change
  }, [matchId, data?.match, queueManualCloudUpdate])

  // Refresh the eScoresheet window with latest data
  const refreshScoresheet = useCallback(async () => {
    console.log('[Scoreboard] refreshScoresheet called, window exists:', !!scoresheetWindowRef.current, 'closed:', scoresheetWindowRef.current?.closed)
    // Check if scoresheet window is still open
    if (!scoresheetWindowRef.current || scoresheetWindowRef.current.closed) {
      console.log('[Scoreboard] Scoresheet window not available, skipping refresh')
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

      // Format data the same way as the original scoresheet opening code
      const team1WithCountry = team1Team ? { ...team1Team, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
      const team2WithCountry = team2Team ? { ...team2Team, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

      const scoresheetData = {
        match: {
          ...match,
          team_1Country: match?.team1Country || '',
          team_2Country: match?.team2Country || ''
        },
        team1Team: team1WithCountry,
        team2Team: team2WithCountry,
        team_1Team: team1WithCountry,
        team_2Team: team2WithCountry,
        team1Players,
        team2Players,
        team_1Players: team1Players,
        team_2Players: team2Players,
        sets,
        events,
        sanctions: []
      }

      console.log('[Scoreboard] Sending refresh with events count:', events?.length)
      // Send data directly in the message (sessionStorage is per-window, not shared)
      scoresheetWindowRef.current.postMessage({ type: 'REFRESH_SCORESHEET', data: scoresheetData }, '*')
      console.log('[Scoreboard] Message sent with data')
    } catch (err) {
      console.error('[refreshScoresheet] Error:', err)
    }
  }, [matchId])

  // Listen for refresh requests from the PDF scoresheet window (auto-refresh every 3s + manual button)
  useEffect(() => {
    const handleRefreshRequest = (event) => {
      if (event.data?.type === 'REQUEST_SCORESHEET_REFRESH') {
        refreshScoresheet()
      }
    }
    window.addEventListener('message', handleRefreshRequest)
    return () => window.removeEventListener('message', handleRefreshRequest)
  }, [refreshScoresheet])

  // Side effects of a write (tablets, live state, backup, scoresheet window):
  // inside an action they run once after its commit (they read the database,
  // which they must not do inside the transaction, and the live state then
  // goes out once with the action's final state); outside, at once.
  const runOrDefer = useCallback((effect) => {
    if (!deferEffect(effect)) effect.run(null)
  }, [deferEffect])
  const afterRefereeSync = useCallback(() => {
    runOrDefer({ once: 'referee', run: () => syncToReferee() })
  }, [runOrDefer, syncToReferee])
  const afterLiveState = useCallback((eventType, eventTeam = null, eventData = null, cachedSnapshot = null) => {
    runOrDefer({
      wantsSnapshot: true,
      liveState: { cachedSnapshot, eventType },
      run: (finalSnapshot) => syncLiveStateToSupabase(eventType, eventTeam, eventData,
        finalSnapshot ? pickLiveStateSnapshot(cachedSnapshot, finalSnapshot) : cachedSnapshot)
    })
  }, [runOrDefer, syncLiveStateToSupabase])
  const afterScoresheetRefresh = useCallback(() => {
    runOrDefer({ once: 'scoresheet', run: () => refreshScoresheet() })
  }, [runOrDefer, refreshScoresheet])

  const logEvent = useCallback(
    async (type, payload = {}, options = {}) => {
      const _t0 = performance.now()

      if (!data?.set) return null

      // skipMutex: true if caller already holds the mutex (e.g., confirmSubstitution);
      // inside an action, runAction holds it for the whole transaction (waiting
      // on a timer there would commit the transaction early)
      const shouldAcquireMutex = !options.skipMutex && !inAction()

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

        // DEBUG BMP events
        if (type === 'challenge' || type === 'challenge_outcome' || type === 'referee_bmp_request' || type === 'referee_bmp_outcome' || (type === 'point' && payload?.fromBMP)) {
          console.log(`[BMP-LIVE] logEvent: type=${type}, seq=${nextSeq}, parentSeq=${options.parentSeq}, payload=`, JSON.stringify(payload))
        }

        // Get match to check if it's a test match
        const match = await db.matches.get(matchId)
        const isTest = match?.test || false

        // Only sync official matches to the cloud, not test matches, and only
        // with a seed_key (the event id is scoped to it)
        if (!isTest && match?.seed_key) {
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
          // Determine which side Team A is on this set
          // (courtSides_beach: the same rule as the scorer's court)
          const sideA = leftTeamInSet(setIndex, match) === 'A' ? 'left' : 'right'

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

          // Determine which player on serving team is currently serving
          // Count service changes to determine first vs second server
          const pointEventsAscSync = [...pointEventsForSync].reverse()
          let trackingServeSync = currentSetFirstServe
          let serviceChangeCountSync = trackingServeSync === servingTeam ? 1 : 0
          for (const pe of pointEventsAscSync) {
            const scorer = pe.payload?.team
            if (scorer && scorer !== trackingServeSync) {
              trackingServeSync = scorer
              if (scorer === servingTeam) serviceChangeCountSync++
            }
          }
          const isFirstServerSync = serviceChangeCountSync % 2 === 1
          // Get player numbers from match data
          const syncFirstServeNum = servingTeam === 'team1' ? match?.team1FirstServe : match?.team2FirstServe
          const syncTeamId = servingTeam === 'team1' ? (match?.team1Id || match?.team1TeamId) : (match?.team2Id || match?.team2TeamId)
          const syncPlayers = syncTeamId ? await db.players.where('teamId').equals(syncTeamId).toArray() : []
          const syncOtherPlayer = syncPlayers.find(p => String(p.number) !== String(syncFirstServeNum))
          const serverNumber = isFirstServerSync
            ? (syncFirstServeNum ? Number(syncFirstServeNum) : null)
            : (syncOtherPlayer ? Number(syncOtherPlayer.number) : null)

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
              external_id: eventExtId(match.seed_key, eventId),
              match_id: match.seed_key, // Use seed_key (external_id) for Supabase lookup
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
        afterRefereeSync()

        // Broadcast to local scoreboard (works offline, every event)
        runOrDefer({ wantsSnapshot: true, run: (finalSnapshot) => broadcastToScoreboard(finalSnapshot ? pickLiveStateSnapshot(stateSnapshot, finalSnapshot) : stateSnapshot) })

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
          afterLiveState(type, eventTeam, eventData, useSnapshot)
        }

        // Continuous cloud backup after every event (non-blocking, throttled)
        if (!isTest) {
          const gameNum = data?.match?.gameNumber || data?.match?.game_n || null
          runOrDefer({ once: 'backup', run: () => triggerContinuousBackup(matchId, () => exportMatchData(matchId), gameNum) })
        }

        // Refresh eScoresheet if open
        afterScoresheetRefresh()

        // Return the sequence number so it can be used for related events
        return nextSeq
      } finally {
        // MUTEX: Only release the lock if we acquired it
        if (shouldAcquireMutex) {
          eventInProgressRef.current = false
        }
      }
    },
    [data?.set, matchId, getNextSeq, getNextSubSeq, captureFullStateSnapshot, broadcastToScoreboard, inAction, runOrDefer, afterRefereeSync, afterLiveState, afterScoresheetRefresh]
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
      deferUi(() => setSetEndTimeModal({ setIndex: set.index, winner: 'team1', team1Points, team2Points, defaultTime, isMatchEnd }))
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
      deferUi(() => setSetEndTimeModal({ setIndex: set.index, winner: 'team2', team1Points, team2Points, defaultTime, isMatchEnd }))
      return true
    }
    return false
  }, [matchId, setEndTimeModal, deferUi])

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


  // The interval's choice (IntervalChoice_beach): who chooses before set 2
  // (the loser of the first toss) or set 3 (the winner of its toss), what
  // they took, and the names its rows give the teams
  const intervalChooserInfo = isBetweenSets ? intervalChooser(data?.set?.index, data?.match) : null
  const intervalChoiceKey = intervalChooserInfo ? `${data?.set?.index}:${intervalChooserInfo.teamKey}` : null
  const intervalChoice = intervalChoiceKey ? (intervalChoices[intervalChoiceKey] || null) : null
  const chooseInInterval = useCallback((choice) => {
    if (!intervalChoiceKey) return
    setIntervalChoices(prev => ({ ...prev, [intervalChoiceKey]: choice }))
  }, [intervalChoiceKey])
  const intervalTeamNames = {
    team1: `${teamAKey === 'team1' ? 'A' : 'B'} · ${data?.team1Team?.name || data?.team1Team?.shortName || 'Team 1'}`,
    team2: `${teamAKey === 'team2' ? 'A' : 'B'} · ${data?.team2Team?.name || data?.team2Team?.shortName || 'Team 2'}`
  }

  // Before coin toss or before set starts, show serve on left (team1) as placeholder
  const isBeforeCoinToss = !data?.match?.coinTossTeamA || !data?.match?.coinTossTeamB
  const hasNoSet = !data?.set

  const currentServeTeam = data?.set ? getCurrentServe() : null

  // Show serve on left as placeholder before coin toss or before set starts
  // Set 3 before its toss: nobody serves yet (no SERVE, no Start set)
  const set3TossPending = isBetweenSets && data?.set?.index === 3 && !data?.match?.set3CoinTossWinner
  const leftServing = (isBeforeCoinToss || hasNoSet)
    ? true // Placeholder: serve on left (team1) before coin toss
    : (data?.set && !set3TossPending ? currentServeTeam === leftServeTeamKey : false)
  const rightServing = (isBeforeCoinToss || hasNoSet)
    ? false
    : (data?.set && !set3TossPending ? currentServeTeam === rightServeTeamKey : false)

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

  // The courts follow the score (owner's decision, 2026-10-08, as in
  // OpenVolley's deciding set): a change of courts made at a total the score
  // no longer reaches (a replay after the change at 7 takes 7 back to 6; after
  // the TTO's change at 21, back to 20) asks to change the courts back, with
  // the change-of-courts dialog (`back`). Confirmed, the teams go back and
  // that change's event goes (with a TTO's change, the TTO), so the change
  // (and the TTO) is asked again when the score reaches that total again.
  // True when it asked. Inside the caller's action: Dexie reads only.
  const askCourtSwitchBackIfDue = useCallback(async (setIndex) => {
    const set = await db.sets.where({ matchId }).and(s => s.index === setIndex).first()
    if (!set || set.finished) return false
    const team1Points = set.team1Points || 0
    const team2Points = set.team2Points || 0
    const events = await db.events.where('matchId').equals(matchId).toArray()
    const match = await db.matches.get(matchId)
    if (staleCourtSwitches(events, setIndex, team1Points + team2Points, match).length === 0) return false
    deferUi(() => setCourtSwitchModal({ set, team1Points, team2Points, teamThatScored: null, back: true }))
    return true
  }, [matchId, deferUi])

  // What a point on the score opens, whatever gave it: the Point buttons, a
  // penalty (delay or misconduct), a referee BMP, a successful team BMP and a
  // decision change all come here (a referee BMP's point reached 7 or 21
  // without a change of courts or a TTO). In order: the change of courts
  // every 7 points (every 5 in set 3), the technical time-out at 21 in sets
  // 1-2 (its change of courts made when it ends), else the set end. Each one
  // once for its total: a successful team BMP or a decision change moves the
  // point to the other team without changing the total, so a change of
  // courts already made (its court_switch event) or a TTO already logged is
  // not made again, and one whose dialog is open shows the new score. That
  // also opens what a set-ending point skipped when the point is moved
  // (21:0 taken back to 20:1 is 21 points: the TTO). `newRally`: false when
  // the total did not change (no "One point to ..." notice again).
  // Called inside the point's action: only Dexie reads and writes.
  const afterPointScored = useCallback(async ({ set, team1Points, team2Points, teamKey, newRally = true }) => {
    if (!set) return
    const totalScore = team1Points + team2Points
    const setIndex = set.index
    const is3rdSet = setIndex === 3
    // The set's rhythm (courtRhythm_beach): changes of courts every 7 / 5
    // points, the TTO at 21 in sets 1-2
    const courtChangeInterval = courtChangeEvery(setIndex)
    const pointsToWin = is3rdSet ? 15 : 21
    const ttoSet = hasTechnicalTimeout(setIndex)

    // A set-ending point opens the set end, not a change of courts or a TTO
    const setIsEnding = (team1Points >= pointsToWin && team1Points - team2Points >= 2) ||
                        (team2Points >= pointsToWin && team2Points - team1Points >= 2)

    // The point was moved onto a set-ending score while the change-of-courts
    // dialog of its total is open (a successful BMP asked from it: 11:14 in
    // set 3 taken back to 10:15): the set is over, no change of courts is
    // made, and that dialog goes (confirming it switched the courts at the
    // end of the set, its dialog over the set-end one)
    if (setIsEnding && !newRally) {
      deferUi(() => setCourtSwitchModal(prev => (prev && prev.set?.index === setIndex ? null : prev)))
    }

    if (!setIsEnding) {
      // The total did not change (a decision change or a BMP asked from the
      // dialog of the change back, or cancelled): a change of courts made at
      // a total the score no longer reaches asks again to change back
      if (!newRally && await askCourtSwitchBackIfDue(setIndex)) return

      // The point was moved off a set-ending score: a set-end dialog of this
      // set is out of date (it came back under the BMP dialog asked from it,
      // and confirming it ended the set at 20:1)
      if (!newRally) {
        deferUi(() => setSetEndTimeModal(prev => (prev && prev.setIndex === setIndex ? null : prev)))
      }

      if (newRally) {
        const pointsUntilSwitch = courtChangeInterval - (totalScore % courtChangeInterval)
        // One point to TTO: at 20 in sets 1-2 only
        if (totalScore === TTO_TOTAL - 1 && ttoSet) {
          deferUi(() => setPreEventPopup({ message: 'One point to TTO' }))
        }
        // One point to switch (but not at 20 since that shows TTO message)
        else if (pointsUntilSwitch === 1 && totalScore > 0) {
          deferUi(() => setPreEventPopup({ message: 'One point to switch' }))
        }
      }

      const atTto = totalScore === TTO_TOTAL && ttoSet
      const atSwitch = totalScore > 0 && totalScore % courtChangeInterval === 0
      if (atTto || atSwitch) {
        const setEvents = (await db.events.where('matchId').equals(matchId).toArray())
          .filter(e => (e.setIndex ?? 1) === setIndex)

        // At 21 points in Sets 1-2: TTO modal that triggers court switch when dismissed
        if (atTto) {
          if (setEvents.some(e => e.type === 'technical_to')) {
            // Logged already (by the point the BMP or the decision moved): an
            // open TTO dialog shows the new score. One whose change of courts
            // is not made has its dialog pending: it opens (the screen was
            // reloaded with it open)
            const match = await db.matches.get(matchId)
            const pending = !!pendingTto(setEvents, setIndex, match)
            deferUi(() => setTtoModal(prev => prev
              ? { ...prev, team1Points, team2Points, teamThatScored: teamKey }
              : (pending ? { set, team1Points, team2Points, countdown: TTO_SECONDS, started: false, triggerCourtSwitchAfter: true, teamThatScored: teamKey } : prev)))
            return
          }
          // Log technical_to event for PDF scoresheet
          // Store pre-court-switch overrides so undo can restore them
          const match = await db.matches.get(matchId)
          const preSwitchOverrides = match?.setLeftTeamOverrides ? { ...match.setLeftTeamOverrides } : {}
          const ttoSeq = await getNextSeq()
          const ttoEventId = await db.events.add({
            matchId,
            setIndex,
            type: 'technical_to',
            // courtSwitched: its change of courts, made when it ends;
            // teamA: the designation of its A/B sides (eventTeamA)
            payload: { preSwitchOverrides, courtSwitched: false, teamA: match?.coinTossTeamA || 'team1' },
            ts: new Date().toISOString(),
            seq: ttoSeq
          })

          // Capture state snapshot for undo system
          const ttoSnapshot = await captureFullStateSnapshot()
          if (ttoSnapshot) {
            await db.events.update(ttoEventId, { stateSnapshot: ttoSnapshot })
          }

          // Show TTO modal directly - court switch will happen when TTO ends
          deferUi(() => setTtoModal({
            set,
            team1Points,
            team2Points,
            countdown: TTO_SECONDS,
            started: false,
            triggerCourtSwitchAfter: true,  // Flag to trigger court switch when TTO ends
            teamThatScored: teamKey  // Track which team scored to allow BMP for losing team
          }))
          return // Don't check for set end yet, wait for TTO + court switch
        }

        // Regular court change: every 7 pts in S1/S2, every 5 pts in S3,
        // unless made already at this total
        const switched = setEvents.some(e => e.type === 'court_switch' &&
          ((e.payload?.score?.team1 || 0) + (e.payload?.score?.team2 || 0)) === totalScore)
        if (!switched) {
          deferUi(() => setCourtSwitchModal({
            set,
            team1Points,
            team2Points,
            teamThatScored: teamKey
          }))
        }
        return // Don't check for set end yet, wait for court switch confirmation
      }
    }

    // If the set ended, checkSetEnd shows the confirmation modal
    await checkSetEnd(set, team1Points, team2Points)
  }, [matchId, checkSetEnd, getNextSeq, captureFullStateSnapshot, deferUi, askCourtSwitchBackIfDue])

  const awardPoint = useCallback(
    async (side, skipConfirmation = false, fromPenalty = false) => {
      // A tap (any point but a penalty's) is written only while the rally is
      // in play in the database: the second tap of a double tap on a screen
      // that has not caught up (the 'point' key lets go once the live query
      // has been waited for long enough, the old buttons still showing) gave
      // a second point for the same rally
      if (!fromPenalty && await readRallyStatus() !== 'in_play') {
        console.warn('[Scoreboard] Point tap without a rally in play (the screen was behind): ignored')
        return
      }
      const teamKey = mapSideToTeamKey(side)

      // Check for accidental point award (if enabled and rally just started)
      if (checkAccidentalPointAward && !skipConfirmation && rallyStartTimeRef.current) {
        const timeSinceRallyStart = (Date.now() - rallyStartTimeRef.current) / 1000
        if (timeSinceRallyStart < accidentalPointAwardDuration) {
          deferUi(() => setAccidentalPointConfirmModal({
            team: teamKey,
            onConfirm: () => {
              setAccidentalPointConfirmModal(null)
              handlePoint(side, true, fromPenalty) // Call with skipConfirmation = true, preserve fromPenalty
            }
          }))
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
      const pointPayload = { team: teamKey, score: { team1: team1Points, team2: team2Points } }
      if (fromPenalty) {
        pointPayload.fromPenalty = true
      }
      const pointSeq = await logEvent('point', pointPayload, { setIndexOverride: setIndex })

      // Debug log: point awarded
      debugLogger.log('POINT_AWARDED', {
        team: teamKey,
        side,
        newScore: { team1: team1Points, team2: team2Points },
        serveBeforePoint,
        scoringTeamHadServe,
        setIndex: setIndex,
        pointSeq,
        fromPenalty
      }, getStateSnapshot())

      // Track when point was awarded (for accidental rally start check)
      lastPointAwardedTimeRef.current = Date.now()
      // Reset rally start time since rally ended
      rallyStartTimeRef.current = null

      // The change of courts, the TTO or the set end this point reaches.
      // Awaited: inside the point's transaction (its dialog opens with the score)
      await afterPointScored({ set: freshCurrentSet, team1Points, team2Points, teamKey })
    },
    [data?.set, data?.events, logEvent, mapSideToTeamKey, afterPointScored, getCurrentServe, matchId, deferUi, readRallyStatus]
  )

  const handlePoint = useCallback(
    async (side, skipConfirmation = false, fromPenalty = false) => {
      cLogger.logHandler('handlePoint', { side, skipConfirmation, fromPenalty })
      if (!data?.set) return
      // ONE action (one transaction, one screen change): the score, the point
      // event, the technical time-out and the dialog the point opens. A double
      // tap on a point button (or a tap on both) while the first point is
      // written or not on screen yet is dropped (key 'point'). A penalty point
      // joins its sanction's action (or runs unkeyed: its confirm is guarded).
      try {
        await runAction(fromPenalty ? null : 'point', () => awardPoint(side, skipConfirmation, fromPenalty))
      } catch (err) {
        // A failed point wrote nothing and was reported (onConfirmFailed)
        if (!isReportedActionError(err)) throw err
      }
    },
    [data?.set, awardPoint, runAction]
  )

  // A dialog of the courts the set's score is owed and that is not open
  // (pendingCourtDialog): the change back, else what a point at that total
  // opens (the change of courts; at 21 in sets 1-2 the TTO, logged again
  // when it was undone). Asked when the screen is first shown on a set (a
  // reload) and before a rally starts: Undo takes the change of courts (or
  // the ended TTO) back before its point, and a rally started then and
  // played on past that total lost the change for good. True when it asked.
  const askPendingCourtDialog = useCallback((set, events, match) => {
    if (!set || !events || !match) return false
    const pending = pendingCourtDialog(events, set, match)
    if (!pending) return false
    const team1Points = set.team1Points || 0
    const team2Points = set.team2Points || 0
    if (pending === 'back') {
      setCourtSwitchModal(prev => prev || { set, team1Points, team2Points, teamThatScored: null, back: true })
      return true
    }
    const lastPoint = events
      .filter(e => e.type === 'point' && (e.setIndex ?? 1) === set.index)
      .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
    runAction('courtSwitchPending', () => afterPointScored({ set, team1Points, team2Points, teamKey: lastPoint?.payload?.team || null, newRally: false }))
      .catch(err => console.error('[Scoreboard] Could not ask for the pending change of courts:', err))
    return true
  }, [runAction, afterPointScored])

  // Only the literal true skips the accidental rally start check (its own
  // "Yes, start rally"): a button handing its click event in must not, or a
  // tap on Start rally never asks (it did not, until 2026-10)
  // ONE action (key 'rally', as OpenVolley): a second tap while it is written
  // is dropped, and a rally already in play in the database (the screen has
  // not caught up yet) is not started again: one rally_start per rally. Two
  // quick taps on Start rally logged two.
  const handleStartRally = useCallback((skipConfirmation = false) => runAction('rally', async () => {
    const skipCheck = skipConfirmation === true
    cLogger.logHandler('handleStartRally', { skipConfirmation: skipCheck })
    if (await readRallyStatus() === 'in_play') {
      console.warn('[Scoreboard] Start rally with a rally in play (the screen was behind): ignored')
      return
    }
    // Check for accidental rally start (if enabled and point was just awarded)
    if (checkAccidentalRallyStart && !skipCheck && lastPointAwardedTimeRef.current) {
      const timeSinceLastPoint = (Date.now() - lastPointAwardedTimeRef.current) / 1000
      if (timeSinceLastPoint < accidentalRallyStartDuration) {
        deferUi(() => setAccidentalRallyConfirmModal({
          onConfirm: () => {
            setAccidentalRallyConfirmModal(null)
            handleStartRally(true) // Call with skipConfirmation = true
          }
        }))
        return
      }
    }

    // If this is the first rally, show set start time confirmation
    if (isFirstRally) {
      // Show set start time confirmation: set 1 proposes the scheduled time
      // of day (today), later sets start now (their first rally), never
      // before the end of a set already played
      const allSets = await db.sets.where('matchId').equals(matchId).toArray()
      const setIndex = data?.set?.index || 1
      const scheduledAt = startScheduleOf(data?.match)
      const defaultTime = defaultSetStartTime({ setIndex, sets: allSets, scheduledAt })

      deferUi(() => setSetStartTimeModal({ setIndex: data?.set?.index, defaultTime, scheduledTime: setIndex === 1 ? scheduledClock(scheduledAt) : null }))
      return
    }

    // A change of courts (or the TTO) owed and not made, its dialog not
    // open (its event undone): asked instead of the rally, once this action
    // is done (its own action then, not one joined to this one, unawaited)
    if (!courtSwitchModal && !ttoModal && data?.set && data?.events && data?.match &&
      pendingCourtDialog(data.events, data.set, data.match)) {
      const { set, events, match } = data
      deferUi(() => askPendingCourtDialog(set, events, match))
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
  }), [runAction, deferUi, readRallyStatus, logEvent, isFirstRally, data?.team1Players, data?.team2Players, data?.events, data?.set, data?.match, matchId, getNextSubSeq, syncToReferee, checkAccidentalRallyStart, accidentalRallyStartDuration, getCurrentServe, getServingPlayer, leftisTeam1, leftTeam, rightTeam, courtSwitchModal, ttoModal, askPendingCourtDialog])

  const handleReplay = useCallback(async () => {
    // During rally: ask first, confirmReplay logs the replay event (no point to undo)
    if (rallyStatus === 'in_play') {
      setReplayConfirm(true)
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
  }, [rallyStatus, canReplayRally, data?.events, data?.team1Team?.name, data?.team2Team?.name])

  // Confirmed "Replay rally": only while the rally is still in play. Closes
  // first, and a double tap logs one replay (useConfirmAction)
  const runReplayConfirm = useConfirmAction(onConfirmFailed)
  const confirmReplay = useCallback(() => runReplayConfirm(async () => {
    setReplayConfirm(false)
    if (rallyStatus !== 'in_play') return
    await logEvent('replay')
  }), [runReplayConfirm, logEvent, rallyStatus])

  const cancelReplay = useCallback(() => {
    setReplayConfirm(false)
  }, [])

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

  // Handle team sanction (for smartphone mode) - takes team key instead of side.
  // Refused while the rally is in play, so the team panel's Improper request,
  // Delay warning and Delay penalty are disabled then, as in the other layout
  // (OpenBeach 2026-10-08: they looked tappable during the rally, and a tap
  // made right after a point, before a slow screen showed it, did nothing)
  const handleTeamSanction = useCallback((teamKey, sanctionType) => {
    cLogger.logHandler('handleTeamSanction', { teamKey, sanctionType })
    if (!data?.match || rallyStatus !== 'idle') return
    // Convert team key to side
    const side = (teamKey === 'team1' && leftisTeam1) || (teamKey === 'team2' && !leftisTeam1) ? 'left' : 'right'
    setSanctionConfirm({ side, type: sanctionType })
  }, [data?.match, rallyStatus, leftisTeam1])

  // Confirm sanction (useConfirmAction: a double tap logged a delay penalty
  // twice and gave two points). ONE action: the sanction, its flag, a delay
  // penalty's point (which joins it) and the dialog closing (deferUi) commit
  // and show together; closed first, the dialog went one render before them.
  const runSanctionConfirm = useConfirmAction(onConfirmFailed)
  const confirmSanction = useCallback(() => runSanctionConfirm(() => runAction('sanction', async () => {
    if (!sanctionConfirm || !data?.match || !data?.set) return

    const { side, type } = sanctionConfirm
    deferUi(() => setSanctionConfirm(null))
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

    // If delay penalty, award point to the other team immediately
    // Beach volleyball has no lineups - always 2 players per team
    if (type === 'delay_penalty') {
      const otherSide = side === 'left' ? 'right' : 'left'
      await handlePoint(otherSide, false, true)
    }
  })), [runSanctionConfirm, runAction, deferUi, sanctionConfirm, data?.match, data?.set, data?.events, mapSideToTeamKey, matchId, logEvent, handlePoint])

  // Confirm set start time
  // One action: the start time, the set start, the rally start and the closed
  // dialog appear together (the dialog closed a frame before the set started)
  const confirmSetStartTime = useCallback((time) => runAction('setStart', async () => {
    if (!setStartTimeModal || !data?.set) return

    // Check if the confirmed time differs from the expected time
    // Compare rounded-to-minute epoch timestamps (safe across midnight)
    const expectedMs = new Date(roundToMinute(setStartTimeModal.defaultTime)).getTime()
    const confirmedMs = new Date(roundToMinute(time)).getTime()
    const timeDifferent = expectedMs !== confirmedMs

    // Update set with start time (absolute timestamp)
    await db.sets.update(data.set.id, { startTime: roundToMinute(time) })

    // Set 1 at another time than scheduled: "Actual start time: HH:MM" in
    // the remarks (replaced when confirmed again, removed at the scheduled
    // time); the set_start event records the line (autoRemark) so undo of the
    // set start takes it out (discardEvents), as in OpenVolley
    const matchNow = await db.matches.get(matchId)
    const scheduledAt = startScheduleOf(matchNow)
    const actualStartRemarked = setStartTimeModal.setIndex === 1 && !!scheduledClock(scheduledAt)
    const autoRemark = actualStartRemarked
      ? actualStartTimeLine({ setIndex: 1, startTime: roundToMinute(time), scheduledAt })
      : null
    if (actualStartRemarked) {
      const remarks = withActualStartTimeRemark(matchNow?.remarks, {
        setIndex: 1, startTime: roundToMinute(time), scheduledAt
      })
      if (remarks !== (matchNow?.remarks || '')) await db.matches.update(matchId, { remarks })
    }

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
        startTime: roundToMinute(time),
        ...(autoRemark ? { autoRemark } : {})
      },
      ts: roundToMinute(time),
      seq: nextSeq1,
      stateBefore: setStartStateBefore
    })

    // Capture state snapshot for undo system
    const setStartSnapshot = await captureFullStateSnapshot()
    if (setStartSnapshot) {
      await db.events.update(setStartEventId, { stateSnapshot: setStartSnapshot })
    }

    // Debug log: set start
    debugLogger.log('SET_START', {
      setIndex: setStartTimeModal.setIndex,
      startTime: time,
      seq: nextSeq1
    }, setStartStateBefore)

    deferUi(() => setSetStartTimeModal(null))

    // Trigger event backup for Safari/Firefox (after the commit)
    runOrDefer({ run: () => onTriggerEventBackup?.('set_start') })

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
    const rallyStartEventId = await db.events.add({
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

    // Capture state snapshot for undo system
    const rallyStartSnapshot = await captureFullStateSnapshot()
    if (rallyStartSnapshot) {
      await db.events.update(rallyStartEventId, { stateSnapshot: rallyStartSnapshot })
    }

    // Sync to referee immediately after set start (after the commit)
    afterRefereeSync()

    // If the start time differs from expected, automatically open remarks
    // (set 1 of a scheduled match already has its remark line)
    if (timeDifferent && !actualStartRemarked) {
      deferUi(() => setShowRemarks(true))
    }
  }), [runAction, deferUi, runOrDefer, afterRefereeSync, setStartTimeModal, data?.set, matchId, onTriggerEventBackup, getCurrentServe, getServingPlayer, leftisTeam1, leftTeam, rightTeam])

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
    setSetTransitionLoading({ step: t('scoreboard.transitionFinishing', 'Finishing the set…') })

    // Show sync progress modal, only when a cloud sync can finish now: signed
    // out, offline or with the cloud off the set is saved locally and the
    // background queue sends it (the scorer was held up by a modal of
    // "warning" steps at every set end)
    const waitForCloudSync = cloudSyncWaitNow()
    if (waitForCloudSync) setSyncModalOpen(true)

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

      setSetTransitionLoading({ step: t('scoreboard.transitionSaving', 'Saving the set…') })
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
        // only say so when a sync can finish now (signed in, online, cloud on);
        // otherwise the set is saved locally and synced in the background
        if (cloudSyncWaitNow()) setSetTransitionLoading({ step: t('scoreboard.transitionSyncing', 'Syncing to the cloud…') })

        // Prepare set update payload
        const setPayload = {
          external_id: setExtId(matchRecord.seed_key, setIdToUpdate),
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
          // Error - wait for modal callback or timeout (the modal shows the error)
          setSyncModalOpen(true)
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
          if (waitForCloudSync) {
            const delay = syncResult.hasWarning ? 1500 : 1000
            await new Promise(resolve => setTimeout(resolve, delay))
          }
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

        // The final result stays on the relay: the referee, the livescore and
        // the LedBox keep showing it (as OpenVolley does). The relay drops the
        // room once no scoreboard holds it any more.
        syncFunctionRef.current?.()

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
        // (Scoreboard now handles set creation internally).
        // The set-end screen stays until Match End replaces it (App opens it
        // once it has read the match): cleared first, it showed 'Loading...'
        // and then an empty page (as OpenVolley's OV-14, laptop run
        // 2026-10-08). Cleared only when App could not open Match End.
        let matchEndOpened = true
        if (onFinishSet) {
          try {
            await onFinishSet(data.set)
          } catch (err) {
            matchEndOpened = false
            console.error('[SET_END] Opening Match End failed:', err)
          }
        }

        // Release lock for match end path (no new set to create)
        setCreationInProgressRef.current = false
        if (!matchEndOpened) setSetTransitionLoading(null)

        return // Exit early for match end - don't fall through to new set creation
      } else {
        // Trigger event backup for Safari/Firefox (set end)
        onTriggerEventBackup?.('set_end')

        // Cloud backup at set end (non-blocking)
        if (matchRecord?.test !== true) {
          if (cloudSyncWaitNow()) setSetTransitionLoading({ step: t('scoreboard.transitionUploading', 'Uploading the backup…') })
          const gameNum = matchRecord?.gameNumber || matchRecord?.game_n || null
          exportMatchData(matchId).then(backupData => {
            uploadBackupToCloud(matchId, backupData)
            uploadLogsToCloud(matchId, gameNum)
          }).catch(() => { })
        }

        // Auto-download game data at set end if enabled
        const syncSucceeded = syncResult?.success && !syncResult?.hasWarning
        const isOffline = !navigator.onLine
        const shouldDownload = autoDownloadAtSetEnd && (alwaysDownloadAtSetEnd || !syncSucceeded || isOffline)

        if (shouldDownload) {
          setSetTransitionLoading({ step: t('scoreboard.transitionDownloading', 'Saving a backup file…') })
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

            // The side the teams finished set 2 on (its court switches included)
            const set2LeftTeamLabel = leftTeamInSet(2, await db.matches.get(matchId))

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

          // Set 2 starts on the side set 1 finished on (rule 18.1.1: the
          // courts change in the interval only if requested). Written now, so
          // the interval's preview and "Switch sides" act on the same value.
          if (newSetIndex === 2) {
            const sidesMatch = await db.matches.get(matchId)
            const sides = nextSetStartSides(2, sidesMatch)
            await db.matches.update(matchId, sides)
            if (sidesMatch?.seed_key && !sidesMatch?.test) {
              await db.sync_queue.add({
                resource: 'match',
                action: 'update',
                payload: { id: sidesMatch.seed_key, ...sides },
                ts: new Date().toISOString(),
                status: 'queued'
              })
            }
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
          if (!isTest && !existingSet && matchRecordForNewSet?.seed_key) {
            await db.sync_queue.add({
              resource: 'set',
              action: 'insert',
              payload: {
                external_id: setExtId(matchRecordForNewSet.seed_key, newSetId),
                match_id: matchRecordForNewSet.seed_key,
                index: newSetIndex,
                team1_points: 0,
                team2_points: 0,
                finished: false,
                start_time: new Date().toISOString()
              },
              ts: new Date().toISOString(),
              status: 'queued'
            })
          }
          if (!isTest && matchRecordForNewSet?.seed_key) await queueCurrentSet(matchRecordForNewSet.seed_key, newSetIndex)

          // Refresh eScoresheet to show the new set
          refreshScoresheet()

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
  }, [setEndTimeModal, data?.match, data?.set, matchId, logEvent, onFinishSet, getCurrentServe, teamAKey, onTriggerEventBackup, syncSetEnd, resetSyncState, showAlert, t, refreshScoresheet])

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
      if (!existingSet3 && !isTest && match?.seed_key) {
        await db.sync_queue.add({
          resource: 'set',
          action: 'insert',
          payload: {
            external_id: setExtId(match.seed_key, newSetId),
            match_id: match.seed_key,
            index: setIndex,
            team1_points: 0,
            team2_points: 0,
            finished: false,
            start_time: new Date().toISOString()
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
      if (!isTest && match?.seed_key) await queueCurrentSet(match.seed_key, setIndex)
    }

    // Log the set 3 coin toss event so it can be undone
    const nextSeq = await getNextSeq()
    const set3CoinTossStateBefore = getStateSnapshot()
    const set3CoinTossEventId = await db.events.add({
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

    // Capture state snapshot for undo system
    const set3CoinTossSnapshot = await captureFullStateSnapshot()
    if (set3CoinTossSnapshot) {
      await db.events.update(set3CoinTossEventId, { stateSnapshot: set3CoinTossSnapshot })
    }

    // Close modal or confirm inline setup
    if (inlineMode) {
      setSet3SetupConfirmed(true)
    } else {
      setSet3SideServiceModal(null)
    }
  }, [set3SideServiceModal, data?.match, matchId, getNextSeq, getStateSnapshot])

  // Handle Set 3 coin toss (before Set 3 starts). One action: the toss, its
  // event and snapshot show together (the toss buttons went 6 frames before
  // LAST ACTION named the winner)
  const handleSet3CoinToss = useCallback((winner) => runAction('set3CoinToss', async () => {
    if (!data?.match) return

    // The match as it is before the toss (read in the action, not the
    // rendered match): what undoing the toss writes back (set3Toss_beach)
    const matchBefore = await db.matches.get(matchId)
    if (!matchBefore || matchBefore.set3CoinTossWinner) return
    const before = set3TossBefore(matchBefore)

    await db.matches.update(matchId, { set3CoinTossWinner: winner })

    // Logged like every event (as OpenVolley's set 5 setup reaches the
    // tablets): its snapshot for the undo, its sync job (the server never
    // had the toss), the referee's match data; it was a bare db.events.add.
    // `team`: Last action's team line names the winner. `before`: the match
    // before the toss, for its undo; `teamA`: the designation its A/B labels
    // are in (the undo follows a swap made since)
    await logEvent('set3_coin_toss_winner', { winner, team: winner, before, teamA: matchBefore.coinTossTeamA || 'team1' })
    // The referee and the livescore: set 3's toss now, in the break
    afterLiveState('set3_coin_toss_winner', winner, { winner })
  }), [runAction, matchId, data?.match, logEvent, afterLiveState])

  // The interval's taps (sides, serve, service order) log no event: the
  // snapshots of the events of this interval take them, in the tap's
  // transaction, so an undo of one of those events keeps them
  // (stateSnapshot_beach refreshIntervalSnapshots). Not an edit of the
  // events: no event history, no revision for the server.
  // After it, the referee's match data and the live state (side, serve, in
  // the break) follow at once, as OpenVolley's set 5 setup (syncSet5Setup):
  // they learnt of it only with the next action.
  const intervalTap = useCallback(async (setIndex, write) => {
    await db.transaction(
      'rw', [db.matches, db.sync_queue, db.events, db.sets, db.players, db.teams],
      async () => {
        if (await write() === false) return
        await withoutEventHistory(matchId, () => refreshIntervalSnapshots(
          db, matchId, setIndex, (id, stateSnapshot) => db.events.update(id, { stateSnapshot })))
      }
    )
    syncToReferee()
    syncLiveStateToSupabase('manual_interval_setup')
  }, [matchId, syncToReferee, syncLiveStateToSupabase])

  // Switch which team starts on which side for the next set: toggles the
  // side the interval shows, which is the side the set starts on
  const handleBetweenSetsSwitchSides = useCallback(async () => {
    if (!data?.match || !data?.set) return
    const setIndex = data.set.index

    // Toggle the stored side, read in the same transaction: a double tap is
    // two switches (with the rendered match both taps wrote the same side)
    await intervalTap(setIndex, async () => {
      const match = await db.matches.get(matchId)
      if (!match) return false
      const update = switchSidesUpdate(setIndex, match, { beforeSetStart: true })
      await db.matches.update(matchId, update)
      if (match.seed_key && !match.test) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: { id: match.seed_key, ...update },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    })
  }, [data?.match, data?.set, matchId, intervalTap])

  // Switch which team serves first for the next set (Set 2 or Set 3 interval)
  const handleBetweenSetsSwitchServe = useCallback(async () => {
    if (!data?.match || !data?.set) return

    const setIndex = data.set.index
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const set1FirstServe = data.match.firstServe || 'team1'

    if (setIndex === 3) {
      // Set 3: toggle set3FirstServe between 'A' and 'B', from the server
      // shown (none stored: the other team than set 2's, not always A)
      const currentFirstServe = setFirstServer(data.match, 3) === teamAKey ? 'A' : 'B'
      const newFirstServe = currentFirstServe === 'A' ? 'B' : 'A'
      console.log('[BetweenSets] Switch serve (Set 3):', { currentFirstServe, newFirstServe })
      await intervalTap(setIndex, () => db.matches.update(matchId, { set3FirstServe: newFirstServe }))
    } else if (setIndex === 2) {
      // Set 2: toggle set2FirstServe between team1 and team2
      // Default is opposite of set 1 (who served last in set 1)
      const defaultSet2First = set1FirstServe === 'team1' ? 'team2' : 'team1'
      const currentFirstServe = data.match.set2FirstServe || defaultSet2First
      const newFirstServe = currentFirstServe === 'team1' ? 'team2' : 'team1'
      console.log('[BetweenSets] Switch serve (Set 2):', { currentFirstServe, newFirstServe })
      await intervalTap(setIndex, () => db.matches.update(matchId, { set2FirstServe: newFirstServe }))
    }
  }, [data?.match, data?.set, matchId, intervalTap])

  // The interval's choice rows (IntervalChoice_beach): put a team on a side,
  // or make it serve or receive. A pick of what is already so writes nothing
  // (a double tap on "Right" leaves the team on the right, where a toggle
  // would put it back). Read in the tap's transaction, as the switches.
  const handleIntervalPickSide = useCallback(async (teamKey, side) => {
    if (!data?.set) return
    const setIndex = data.set.index
    await intervalTap(setIndex, async () => {
      const match = await db.matches.get(matchId)
      if (!match) return false
      const leftKey = isTeam1LeftInSet(setIndex, match) ? 'team1' : 'team2'
      const otherKey = teamKey === 'team1' ? 'team2' : 'team1'
      if (leftKey === (side === 'left' ? teamKey : otherKey)) return false
      const update = switchSidesUpdate(setIndex, match, { beforeSetStart: true })
      await db.matches.update(matchId, update)
      if (match.seed_key && !match.test) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: { id: match.seed_key, ...update },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    })
  }, [data?.set, matchId, intervalTap])

  const handleIntervalPickServe = useCallback(async (teamKey, serves) => {
    if (!data?.set) return
    const setIndex = data.set.index
    if (setIndex !== 2 && setIndex !== 3) return
    await intervalTap(setIndex, async () => {
      const match = await db.matches.get(matchId)
      if (!match) return false
      const teamA = match.coinTossTeamA || 'team1'
      const want = serves ? teamKey : (teamKey === 'team1' ? 'team2' : 'team1')
      // the server the screen shows: with no set3FirstServe stored (as set
      // 2's end leaves it) set 3's is the other team than set 2's, not A
      if (setFirstServer(match, setIndex) === want) return false
      await db.matches.update(matchId, setIndex === 3
        ? { set3FirstServe: want === teamA ? 'A' : 'B' }
        : { set2FirstServe: want })
    })
  }, [data?.set, matchId, intervalTap])

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
    if (data?.set?.index == null) {
      await db.matches.update(matchId, { [field]: otherNumber })
      return
    }
    await intervalTap(data.set.index, () => db.matches.update(matchId, { [field]: otherNumber }))
  }, [data?.match, data?.set?.index, data?.team1Players, data?.team2Players, matchId, intervalTap])

  // Confirm between-sets setup and allow play to begin
  const confirmBetweenSetsSetup = useCallback(async () => {
    if (!data?.set) return

    // Log the setup confirmation event
    const nextSeq = await getNextSeq()
    const betweenSetsEventId = await db.events.add({
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

    // Capture state snapshot for undo system
    const betweenSetsSnapshot = await captureFullStateSnapshot()
    if (betweenSetsSnapshot) {
      await db.events.update(betweenSetsEventId, { stateSnapshot: betweenSetsSnapshot })
    }

    setBetweenSetsSetupConfirmed(true)
    countdownDismissedRef.current = true
    setBetweenSetsCountdown(null)
  }, [matchId, data?.set, getNextSeq])


  // Get action description for an event
  // A dialog's score as on the court: left team's letter chip, "20 : 16", right chip
  const courtScoreChips = (team1Points, team2Points) => {
    const chip = (key) => {
      const color = (key === 'team1' ? data?.team1Team?.color : data?.team2Team?.color) || (key === 'team1' ? '#ef4444' : '#3b82f6')
      return <span style={{ background: color, color: isLightColour(color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{key === teamAKey ? 'A' : 'B'}</span>
    }
    const leftKey = leftisTeam1 ? 'team1' : 'team2'
    const rightKey = leftisTeam1 ? 'team2' : 'team1'
    const pts = { team1: team1Points ?? 0, team2: team2Points ?? 0 }
    return (
      <>
        {chip(leftKey)}
        <strong className="tabular-nums" style={{ fontSize: '20px' }}>{pts[leftKey]} : {pts[rightKey]}</strong>
        {chip(rightKey)}
      </>
    )
  }

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

    // "A 20 : 16 B": the left team first, as on the court
    const scoreText = (t1, t2) => formatCourtScore({ team1: t1, team2: t2 }, { leftisTeam1, teamAKey: data?.match?.coinTossTeamA || 'team1' })

    let eventDescription = ''
    if (event.type === 'coin_toss') {
      // the team names (the short name is the country code, "CHE" for both)
      const teamAName = event.payload?.teamA === 'team1'
        ? (data?.match?.team1Name || data?.team1Team?.name || data?.team1Team?.shortName || 'team1')
        : (data?.match?.team2Name || data?.team2Team?.name || data?.team2Team?.shortName || 'team2')
      const teamBName = event.payload?.teamB === 'team1'
        ? (data?.match?.team1Name || data?.team1Team?.name || data?.team1Team?.shortName || 'team1')
        : (data?.match?.team2Name || data?.team2Team?.name || data?.team2Team?.shortName || 'team2')
      // Determine if first serve is Team A or Team B
      const firstServeLabel = event.payload?.firstServe === event.payload?.teamA ? 'A' : 'B'
      eventDescription = `Coin toss - A: ${teamAName}, B: ${teamBName}, First serve: ${firstServeLabel}`
    } else if (event.type === 'point') {
      eventDescription = `Point — ${teamName} (${scoreText(team1Score, team2Score)})`
    } else if (event.type === 'timeout') {
      eventDescription = `Timeout — ${teamName}`
    } else if (event.type === 'substitution') {
      const playerOut = event.payload?.playerOut || '?'
      const playerIn = event.payload?.playerIn || '?'
      const isExceptional = event.payload?.isExceptional === true
      const substitutionType = isExceptional ? 'Exceptional substitution' : 'Substitution'
      eventDescription = `${substitutionType} — ${teamName} (OUT: ${playerOut} IN: ${playerIn}) (${scoreText(team1Score, team2Score)})`
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
        eventDescription = `${scoreText(oldteam1Points, oldteam2Points)} Rally Replayed, new score ${scoreText(newteam1Points, newteam2Points)}`
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
        const startTimeStr = formatTimeLocal(startTime)
        const endTimeStr = formatTimeLocal(endTime)
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

      eventDescription = `Sanction — ${teamName}${target} (${sanctionLabel}) (${scoreText(team1Score, team2Score)})`
    } else if (event.type === 'remark') {
      const remarkText = event.payload?.text || ''
      // Show first line or first 50 characters
      const preview = remarkText.split('\n')[0].substring(0, 50)
      eventDescription = `Remark added — ${preview}${remarkText.length > 50 ? '...' : ''}`
    } else if (event.type === 'court_captain_designation') {
      const playerNumber = event.payload?.playerNumber || '?'
      eventDescription = `${t('scoreboard.courtCaptainDesignation', 'Court captain designation')} — ${teamName} (#${playerNumber})`
    } else if (event.type === 'challenge') {
      // Team BMP request - look for outcome sub-event to show result
      const challengeSeq = event.seq || 0
      const outcomeEvent = data.events?.find(e =>
        e.type === 'challenge_outcome' &&
        e.setIndex === event.setIndex &&
        Math.floor(e.seq || 0) === Math.floor(challengeSeq)
      )
      if (outcomeEvent) {
        const result = outcomeEvent.payload?.result
        const resultLabel = result === 'successful' ? 'Successful BMP' :
          result === 'unsuccessful' ? 'Unsuccessful BMP' :
            result === 'judgment_impossible' ? 'BMP Unavailable' : 'BMP'
        eventDescription = `${resultLabel} — ${teamName}`
      } else {
        eventDescription = `BMP request — ${teamName}`
      }
    } else if (event.type === 'challenge_outcome') {
      // Team BMP outcome (shown when accessed directly)
      const result = event.payload?.result
      const resultLabel = result === 'successful' ? 'Successful BMP' :
        result === 'unsuccessful' ? 'Unsuccessful BMP' :
          result === 'judgment_impossible' ? 'BMP Unavailable' : 'BMP'
      eventDescription = `${resultLabel} — ${teamName}`
    } else if (event.type === 'referee_bmp_request') {
      // Referee BMP request - look for outcome sub-event to show result
      const requestSeq = event.seq || 0
      const outcomeEvent = data.events?.find(e =>
        (e.type === 'referee_bmp_outcome' || e.type === 'bmp') &&
        e.setIndex === event.setIndex &&
        Math.floor(e.seq || 0) === Math.floor(requestSeq)
      )
      if (outcomeEvent) {
        const result = outcomeEvent.payload?.result
        const resultLabel = result === 'in' ? 'Referee BMP: IN' :
          result === 'out' ? 'Referee BMP: OUT' :
            result === 'judgment_impossible' ? 'Referee BMP: Unavailable' : 'Referee BMP'
        const pointToTeam = outcomeEvent.payload?.pointToTeam
        const pointTeamName = pointToTeam === 'team1'
          ? (data?.team1Team?.name || 'team1')
          : pointToTeam === 'team2'
            ? (data?.team2Team?.name || 'team2')
            : null
        eventDescription = `${resultLabel}${pointTeamName ? ` — ${pointTeamName}` : ''}`
      } else {
        eventDescription = `Referee BMP request`
      }
    } else if (event.type === 'referee_bmp_outcome') {
      // Referee BMP outcome (shown when accessed directly)
      const result = event.payload?.result
      const resultLabel = result === 'in' ? 'Referee BMP: IN' :
        result === 'out' ? 'Referee BMP: OUT' :
          result === 'judgment_impossible' ? 'Referee BMP: Unavailable' : 'Referee BMP'
      eventDescription = `${resultLabel}`
    } else if (event.type === 'court_switch') {
      eventDescription = t('scoreboard.courtSwitch', 'Court switch')
    } else if (event.type === 'mto' || event.type === 'rit' || event.type === 'medical_end') {
      // "MTO – B #2 Weber", "RIT (Toilet) – B #2 Weber",
      // "MTO end – B #2 Weber (3:12, recovered)"
      const mp = event.payload || {}
      const kind = event.type === 'medical_end' ? mp.kind : event.type
      const medTeamLabel = mp.team === (data?.match?.coinTossTeamA || 'team1') ? 'A' : 'B'
      const medWho = `${medTeamLabel} #${mp.playerNumber ?? '?'}${mp.playerName ? ` ${mp.playerName}` : ''}`
      const ritTypeLabel = mp.ritType === 'no_blood' ? t('scoreboard.ritNoBlood', 'No blood') :
        mp.ritType === 'toilet' ? t('scoreboard.ritToilet', 'Toilet') :
          mp.ritType === 'weather' ? t('scoreboard.ritWeather', 'Weather') : ''
      const kindLabel = kind === 'rit' ? `RIT${ritTypeLabel ? ` (${ritTypeLabel})` : ''}` : 'MTO'
      if (event.type === 'medical_end' || mp.outcome) {
        const outcomeLabel = mp.outcome === 'forfeit' ? t('scoreboard.forfeit', 'Forfeit') : t('scoreboard.recovered', 'Recovered')
        const dur = mp.duration !== undefined ? `${formatMedicalDuration(mp.duration)}, ` : ''
        eventDescription = `${kindLabel} ${t('scoreboard.medicalEnd', 'end')} – ${medWho} (${dur}${outcomeLabel.toLowerCase()})`
      } else {
        eventDescription = `${kindLabel} – ${medWho}`
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
      // Never show an internal type name: "some_event" reads "Some event"
      const readable = String(event.type || '').replace(/_/g, ' ')
      eventDescription = readable.charAt(0).toUpperCase() + readable.slice(1)
      if (teamName) {
        eventDescription += ` — ${teamName}`
      }
    }

    return eventDescription
  }, [data, leftisTeam1])

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

  // Remove events from the log: their unsent insert jobs are dropped (the
  // cloud never gets a phantom row) and the event history
  // (db_beach/eventHistory_beach) keeps each one and, for a synced match,
  // voids the server's copy (POST /api/match/event-revisions): the server
  // keeps the row, marked voided, with who undid it, when and why. The reason
  // is the running action's ('undo', 'decision_change'), else `reason`.
  // Undo, Replay, the decision change, cancelling a change of courts and the
  // event editor's deletes all go through here. The remark line a removed
  // event wrote itself (payload.autoRemark: set 1's "Actual start time")
  // goes with it. Ported from OpenVolley discardEvents / reverseEventSideEffects
  // (Scoreboard.jsx).
  const discardEvents = useCallback(async (eventsToRemove, reason = 'delete') => {
    const rows = (eventsToRemove || []).filter(e => e && e.id != null)
    if (rows.length === 0) return
    const ids = rows.map(e => e.id)
    await withActivityContext({ reason: currentActivityContext()?.reason || reason }, () => db.events.bulkDelete(ids))
    const unsent = await db.sync_queue.where('status').anyOf(...UNSENT_STATUSES).toArray()
    const staleJobs = syncJobsForEvents(unsent, ids)
    if (staleJobs.length > 0) await db.sync_queue.bulkDelete(staleJobs.map(j => j.id))
    if (rows.some(e => e.payload?.autoRemark)) {
      const match = await db.matches.get(matchId)
      const remarks = withoutAutoRemarks(match?.remarks, rows)
      if (match && remarks !== (match.remarks || '')) await db.matches.update(matchId, { remarks })
    }
  }, [matchId])

  // The set score after taking points back: what the removed points added is
  // subtracted (a manual score adjustment stays), the set is open again, and
  // the cloud sets row follows through the sync queue (also offline).
  const applyPointRemovalScore = useCallback(async (plan) => {
    if (!plan) return null
    const setRow = await db.sets.where({ matchId }).and(s => s.index === plan.setIndex).first()
    if (!setRow) return null
    const score = scoreAfterRemoval(setRow, plan.delta)
    await db.sets.update(setRow.id, { ...score, finished: false })
    await queueSetScoreSync(db, { matchId, setIndex: plan.setIndex })
    return score
  }, [matchId])

  // The event editor's deletes (Edit match > event history): asked in the
  // app's own dialog (askConfirm: a native confirm() reads as "yes" in the
  // desktop app), then removed like every correction (discardEvents: the
  // cloud row too, it stayed on the server before). A point takes the set
  // score with it, a sanction the team's sanction flag; then the tablets,
  // the livescore and the scoresheet follow. Ported from OpenVolley 07c7bbce,
  // 38509c25.
  const deleteEventByHand = useCallback(async (event, extraEvents = []) => {
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const rows = [event, ...extraEvents].filter(Boolean)
    await discardEvents(rows)
    if (rows.some(e => e.type === 'point')) {
      const delta = scoreDeltaOfRemoval(allEvents, rows.map(e => e.id), event.setIndex)
      await applyPointRemovalScore({ setIndex: event.setIndex, delta })
    }
    if (rows.some(e => e.type === 'sanction')) {
      const match = await db.matches.get(matchId)
      const remaining = allEvents.filter(e => !rows.some(r => r.id === e.id))
      await db.matches.update(matchId, { sanctions: teamSanctionFlags(remaining, match?.sanctions) })
    }
    syncToReferee()
    syncLiveStateToSupabase(rows.some(e => e.type === 'point') ? 'manual_score_update' : 'manual_event_delete', null, null)
    refreshScoresheet()
  }, [matchId, discardEvents, applyPointRemovalScore, syncToReferee, syncLiveStateToSupabase, refreshScoresheet])

  // The "Manual changes" panel's set times (Advanced): written as a correction
  // (correctSetTimes: planSetTimes + applyCorrectionPlan), as the corrections
  // panel's set times form, so set 1's "Actual start time: HH:MM" remark
  // follows a changed start (replaced, or removed at the scheduled time). It
  // wrote the set row directly before. A refused time (an end before the
  // start) is said, and the field shows the stored time again.
  const saveManualSetTime = useCallback(async (setRow, field, input) => {
    const value = input.value ? new Date(input.value).toISOString() : null
    try {
      const res = await correctSetTimes({
        db, matchId, setIndex: setRow.index, [field]: value, t, mode: 'live',
        hooks: { notifyScoresheetUpdate: refreshScoresheet, syncToReferee, syncLiveState: () => syncLiveStateToSupabase('manual_score_update') }
      })
      if (res?.error) {
        input.value = input.defaultValue
        showAlert(correctionErrorText(res, t), 'error')
      }
    } catch (err) {
      console.error('[saveManualSetTime] failed', err)
      input.value = input.defaultValue
      showAlert(t('scoreboard.confirmFailed'), 'error')
    }
  }, [matchId, t, refreshScoresheet, syncToReferee, syncLiveStateToSupabase, showAlert])

  // NEW SNAPSHOT-BASED UNDO SYSTEM
  // Instead of complex per-event-type logic, we simply:
  // 1. Delete all events with the same base seq
  // 2. Restore state from the previous event's snapshot
  const runUndoConfirm = useConfirmAction(onConfirmFailed)
  const handleUndo = useCallback(() => runUndoConfirm(async () => {
    cLogger.logHandler('handleUndo', { hasUndoConfirm: !!undoConfirm, eventType: undoConfirm?.event?.type })
    if (!undoConfirm || !data?.set) {
      setUndoConfirm(null)
      return
    }

    const lastEvent = undoConfirm.event
    // Close first, then undo (useConfirmAction): a second tap must not undo
    // the event before it as well
    setUndoConfirm(null)
    const lastEventSeq = lastEvent.seq || 0
    const baseSeq = Math.floor(lastEventSeq)

    // ONE action (one transaction, one screen change): the removed events,
    // the restored score and state and their sync jobs; a failure writes
    // nothing and says so (useScorerActions_beach)
    await runAction('undo', async () => {
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

        // Their unsent cloud jobs go, and what was already sent is deleted in
        // the cloud too (it stayed on the server before)
        await discardEvents(eventsToDelete)

        // A decision change: the point goes back to the team it was first given
        // to (the point's snapshot restores the score, not the point's team)
        if (lastEvent.type === 'decision_change') {
          const reversal = planDecisionChangeReversal(lastEvent, allEvents)
          if (reversal) {
            await db.events.update(reversal.pointEventId, { payload: reversal.pointPayload })
            const pointRow = await db.events.get(reversal.pointEventId)
            const reversalMatch = await db.matches.get(matchId)
            if (pointRow && reversalMatch && !reversalMatch.test && reversalMatch.seed_key) {
              await db.sync_queue.add(eventUpsertJob(reversalMatch.seed_key, pointRow))
            }
          }
        }

        // 2. Find the previous event's snapshot
        const remainingEvents = allEvents
          .filter(e => Math.floor(e.seq || 0) < baseSeq)
          .sort((a, b) => (b.seq || 0) - (a.seq || 0))

        const previousEvent = remainingEvents[0]

        // 3. Restore state from the previous event's snapshot. Not one of
        // another set: the event before the first one of a set (its start,
        // the set 3 toss) is the previous set's end, and its snapshot
        // reopened that set (set3Toss_beach). The set's score is as it was
        // (nothing was scored in it yet); the team sanction flags follow the
        // events that remain. Not for a set start either: the event before it
        // (the set 3 toss) can be older than the sides and serve the set was
        // started with (undoKeepsMatch).
        if (undoKeepsMatch(previousEvent?.stateSnapshot, lastEvent)) {
          const removedIds = new Set(eventsToDelete.map(e => e.id))
          const remaining = allEvents.filter(e => !removedIds.has(e.id))
          const sanctionMatch = await db.matches.get(matchId)
          await db.matches.update(matchId, { sanctions: teamSanctionFlags(remaining, sanctionMatch?.sanctions) })
        } else if (previousEvent?.stateSnapshot) {
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
            // Handle BMP reversal: subtract from reversed team
            if (pe.payload?.reversedTeam === 'team1') team1Points = Math.max(0, team1Points - 1)
            else if (pe.payload?.reversedTeam === 'team2') team2Points = Math.max(0, team2Points - 1)
            if (pe.payload?.team === 'team1') team1Points++
            else if (pe.payload?.team === 'team2') team2Points++
          }


          // Update set with calculated score
          const currentSet = await db.sets.where({ matchId }).and(s => s.index === currentSetIndex).first()
          if (currentSet) {
            await db.sets.update(currentSet.id, { team1Points, team2Points, finished: false })
          }

          // Recalculate match-level sanctions from remaining events
          const sanctions = {}
          for (const e of remainingAllEvents) {
            if (e.type === 'sanction') {
              const sType = e.payload?.type
              const sTeam = e.payload?.team
              if (sType === 'improper_request' && sTeam) {
                sanctions[`improperRequest${sTeam}`] = true
              } else if (sType === 'delay_warning' && sTeam) {
                sanctions[`delayWarning${sTeam}`] = true
              }
            }
          }

          // Reset match status to live and restore sanctions
          await db.matches.update(matchId, { status: 'live', sanctions })
        }

        // Handle special cases for court switch undo (technical_to and court_switch events)
        // These events write setLeftTeamOverrides directly to the match before the event is created,
        // so we store preSwitchOverrides in the payload to enable reliable restoration
        if (lastEvent.type === 'technical_to' || lastEvent.type === 'court_switch') {
          const preSwitchOverrides = lastEvent.payload?.preSwitchOverrides
          if (preSwitchOverrides !== undefined) {
            // A/B sides as the teams are named now: a "Swap team A ↔ B"
            // since the change keeps each team on its side
            const now = await db.matches.get(matchId)
            await db.matches.update(matchId, labelsInDesignation({ setLeftTeamOverrides: preSwitchOverrides }, eventTeamA(lastEvent), now?.coinTossTeamA || 'team1'))
          }
        }

        // The set 3 toss: the winner, the sides, the serve and the service
        // orders as they were before it (set3Toss_beach), so the toss buttons
        // come back with the sides and serve set 3 had before
        if (lastEvent.type === 'set3_coin_toss_winner') {
          await db.matches.update(matchId, set3TossUndoUpdate(lastEvent, await db.matches.get(matchId)))
        }

        // Handle special cases for set_end undo
        if (lastEvent.type === 'set_end') {
          // Delete the next set if it was created
          const allSets = await db.sets.where({ matchId }).toArray()
          const nextSet = allSets.find(s => s.index === data.set.index + 1)
          if (nextSet) {
            const nextSetEvents = await db.events.where('matchId').equals(matchId).and(e => e.setIndex === nextSet.index).toArray()
            await discardEvents(nextSetEvents)
            await db.sets.delete(nextSet.id)
            // Its set insert (and score updates) not sent yet go too
            const unsent = await db.sync_queue.where('status').anyOf(...UNSENT_STATUSES).toArray()
            const staleSetJobs = syncJobsForSets(unsent, [nextSet.id])
            if (staleSetJobs.length > 0) await db.sync_queue.bulkDelete(staleSetJobs.map(j => j.id))
          }
          // The ended set is open again, in the cloud too
          const undoMatch = await db.matches.get(matchId)
          const endedSetIndex = lastEvent.payload?.setIndex ?? lastEvent.setIndex
          const endedSet = (await db.sets.where({ matchId }).toArray()).find(s => s.index === endedSetIndex)
          if (endedSet) {
            await db.sets.update(endedSet.id, { finished: false, endTime: null })
            if (undoMatch && !undoMatch.test && undoMatch.seed_key) {
              const reopened = await db.sets.get(endedSet.id)
              await db.sync_queue.add(setReopenJob(undoMatch.seed_key, reopened))
            }
          }
        } else {
          // The cloud set row follows the restored score (queued: also offline)
          await queueSetScoreSync(db, { matchId, setIndex: lastEvent.setIndex ?? data.set.index })
        }

        // Sync to Referee and Supabase after undo (after the commit, once)
        afterRefereeSync()
        afterLiveState('undo')
        // Refresh eScoresheet if open
        afterScoresheetRefresh()
      } catch (error) {
        console.error('[handleUndo] Error:', error)
        // Rethrown: the undo rolls back as a whole (a half-done undo, e.g. the
        // events gone and the score not restored, is never committed)
        throw error
      }
    }, { reason: 'undo' })
  }), [runUndoConfirm, runAction, undoConfirm, data?.set, matchId, restoreStateFromSnapshot, discardEvents, afterRefereeSync, afterLiveState, afterScoresheetRefresh])

  // OLD UNDO LOGIC REMOVED - The following complex per-event-type logic has been replaced
  // by the snapshot-based undo system above. Keeping this comment for reference.
  // Previously there were ~600 lines of event-specific undo handlers for:
  // - substitution, timeout, sanction, set_end, rally_start, etc.
  // Now all handled by simply restoring the previous event's stateSnapshot.

  const cancelUndo = useCallback(() => {
    setUndoConfirm(null)
  }, [])

  // Handle replay rally - undo last point (go back to state before the point, no rally restart)
  // A replayed rally scores no point, here or on the server: the point (with
  // its BMP group when a BMP decided it) is taken back through
  // planPointRemoval and discardEvents (its unsent sync job dropped, a cloud
  // delete queued for what was sent: raw db.events.delete calls left the
  // point's job queued and the server kept it), the set score goes to the
  // cloud through the sync queue, the replay event is logged like every
  // event (logEvent: sync job, snapshot, tablets), and the tablets and the
  // livescore are synced as after an undo. Ported from OpenVolley 93359315.
  // ONE action (key 'decision'; reached from handleDecisionChange it joins
  // that action): the removed point, the score, the replay event.
  const handleReplayRally = useCallback(() => runAction('decision', async () => {
    if (!replayRallyConfirm || !data?.set) {
      setReplayRallyConfirm(null)
      return
    }

    const lastEvent = replayRallyConfirm.event
    // Close first, then write: the dialog's score preview is live and redrew
    // from the replayed score otherwise
    setReplayRallyConfirm(null)

    try {
      const allEvents = await db.events.where('matchId').equals(matchId).toArray()
      const plan = planPointRemoval(allEvents, lastEvent)
      if (!plan) return
      const deleteIds = new Set(plan.deleteEventIds)
      await discardEvents(allEvents.filter(e => deleteIds.has(e.id)))

      // The set score loses the replayed point, locally and in the cloud
      const oldteam1Points = data.set.team1Points
      const oldteam2Points = data.set.team2Points
      const newScore = await applyPointRemovalScore(plan)

      // Log the replay event (this is important for match records)
      const undoneTeam = lastEvent.payload?.team
      await logEvent('replay', {
        reason: 'point_replay',
        undonePointTeam: undoneTeam,
        oldteam1Points,
        oldteam2Points,
        newteam1Points: newScore?.team1Points ?? oldteam1Points,
        newteam2Points: newScore?.team2Points ?? oldteam2Points
      }, { setIndexOverride: plan.setIndex })

      // Go back to idle state - user can then click "Start rally" or "Undo"
      // No automatic rally start

      // The replayed point had reached a change of courts that was made (the
      // change at 7, 7 back to 6; the TTO's change at 21): change back
      await askCourtSwitchBackIfDue(plan.setIndex)

      // Tablets, livescore (fresh snapshot: data has changed), scoresheet
      afterRefereeSync()
      afterLiveState('replay', null, { reason: 'point_replay', undoneTeam })
      afterScoresheetRefresh()

    } catch (error) {
      console.error('[handleReplayRally] Error:', error)
      // Rethrown: the replay rolls back as a whole
      throw error
    }
  }, { reason: 'decision_change' }), [runAction, replayRallyConfirm, data?.set, matchId, discardEvents, applyPointRemovalScore, logEvent, askCourtSwitchBackIfDue, afterRefereeSync, afterLiveState, afterScoresheetRefresh])

  // Cancelled: nothing changed. Opened from the change-of-courts or the
  // set-end dialog (which it closed), that dialog comes back: the change of
  // courts is mandatory, and the set end was left without its dialog.
  const cancelReplayRally = useCallback(async () => {
    const pending = replayRallyConfirm
    setReplayRallyConfirm(null)
    if (!pending?.fromDialog || !data?.set) return
    const setRow = (await db.sets.get(data.set.id)) || data.set
    await afterPointScored({
      set: setRow,
      team1Points: setRow.team1Points || 0,
      team2Points: setRow.team2Points || 0,
      teamKey: pending.event?.payload?.team,
      newRally: false
    })
  }, [replayRallyConfirm, data?.set, afterPointScored])

  // Handle decision change - either swap point to other team or replay rally
  // The swap reaches the server and the tablets: the point is written to the
  // cloud again with its new team (the event insert is an upsert), the
  // decision_change event is logged like every event (logEvent: sync job,
  // snapshot), the set score is queued, and the tablets get the swapped point
  // (only the live state was pushed before). The decision_change keeps what
  // Undo needs to give the point back (pointEventId, fromTeam). Ported from
  // OpenVolley fd74b1e9 / 3c4a88c2.
  const runDecisionChange = useConfirmAction(onConfirmFailed)
  const handleDecisionChange = useCallback(() => runDecisionChange(() => runAction('decision', async () => {
    if (!replayRallyConfirm || !data?.set) {
      setReplayRallyConfirm(null)
      return
    }

    const { event: lastEvent } = replayRallyConfirm
    // The dialog pre-selects "Assign to other team"; record what it shows
    const selectedOption = replayRallyConfirm.selectedOption || 'swap'

    if (selectedOption === 'swap') {
      // Close first, then write: the dialog's live score preview never shows
      // the swapped score
      setReplayRallyConfirm(null)
      // Swap the point to the other team
      const oldTeam = lastEvent.payload?.team
      const newTeam = oldTeam === 'team1' ? 'team2' : 'team1'
      const oldField = oldTeam === 'team1' ? 'team1Points' : 'team2Points'
      const newField = newTeam === 'team1' ? 'team1Points' : 'team2Points'

      try {
        // Update scores: decrement old team, increment new team
        const setRow = (await db.sets.get(data.set.id)) || data.set
        const oldScore = { team1Points: setRow.team1Points || 0, team2Points: setRow.team2Points || 0 }
        const newScore = {
          ...oldScore,
          [oldField]: Math.max(0, oldScore[oldField] - 1),
          [newField]: oldScore[newField] + 1
        }
        await db.sets.update(data.set.id, { ...newScore, finished: false })

        // Update the point event's team
        const swappedPayload = {
          ...lastEvent.payload,
          team: newTeam,
          swappedFrom: oldTeam // Track that this was swapped
        }
        await db.events.update(lastEvent.id, { payload: swappedPayload })

        // Older matches logged a rotation line-up after a side-out: the old
        // team's one goes (with its cloud row)
        const lastEventSeq = lastEvent.seq || 0
        const rotationEvents = (await db.events.where('matchId').equals(matchId).toArray()).filter(e =>
          e.type === 'lineup' &&
          e.setIndex === data.set.index &&
          !e.payload?.isInitial &&
          !e.payload?.fromSubstitution &&
          (e.seq || 0) > lastEventSeq &&
          e.payload?.team === oldTeam
        )
        await discardEvents(rotationEvents)

        // Log a decision_change event for the record (snapshot after the swap)
        await logEvent('decision_change', {
          reason: 'point_swap',
          pointEventId: lastEvent.id,
          fromTeam: oldTeam,
          toTeam: newTeam,
          oldteam1Points: oldScore.team1Points,
          oldteam2Points: oldScore.team2Points,
          newteam1Points: newScore.team1Points,
          newteam2Points: newScore.team2Points
        }, { setIndexOverride: data.set.index })

        // The cloud: the point with its new team, and the set score
        const match = await db.matches.get(matchId)
        if (match && !match.test && match.seed_key) {
          await db.sync_queue.add(eventUpsertJob(match.seed_key, { ...lastEvent, payload: swappedPayload }))
        }
        await queueSetScoreSync(db, { matchId, setIndex: data.set.index })

        // What the swapped point reaches, as for a point from the buttons:
        // the set end (19:20 swapped to 19:21), or the change of courts / TTO
        // (the total is the same: one made already is not made again; one a
        // set-ending point skipped opens, 21:0 swapped to 20:1 is the TTO; one
        // whose dialog the decision change closed opens again)
        await afterPointScored({ set: { ...setRow, ...newScore }, team1Points: newScore.team1Points, team2Points: newScore.team2Points, teamKey: newTeam, newRally: false })

        // The tablets get the swapped point (they kept the old team's point:
        // only the live state was pushed), the live state its fresh snapshot
        afterRefereeSync()
        afterLiveState('decision_change', null, { reason: 'point_swap', fromTeam: oldTeam, toTeam: newTeam })
        afterScoresheetRefresh()

      } catch (error) {
        console.error('[handleDecisionChange] Error swapping point:', error)
        // Rethrown: a swallowed failure committed the swapped point without
        // its score; now the decision change rolls back as a whole
        throw error
      }
    } else {
      // Replay rally - use existing logic
      await handleReplayRally()
      return // handleReplayRally already closes the modal and syncs
    }
  }, { reason: 'decision_change' })), [runDecisionChange, runAction, replayRallyConfirm, data?.set, matchId, logEvent, discardEvents, handleReplayRally, afterPointScored, afterRefereeSync, afterLiveState, afterScoresheetRefresh])



  const handleTimeout = useCallback(
    teamKeyOrSide => {
      // Accept both team keys ('team1'/'team2') and sides ('left'/'right')
      const teamKey = (teamKeyOrSide === 'left' || teamKeyOrSide === 'right')
        ? mapSideToTeamKey(teamKeyOrSide)
        : teamKeyOrSide
      cLogger.logHandler('handleTimeout', { teamKey })
      const used = (timeoutsUsed && timeoutsUsed[teamKey]) || 0
      if (used >= 1) return

      setTimeoutModal({ team: teamKey, countdown: TEAM_TIMEOUT_SECONDS, started: false })
    },
    [mapSideToTeamKey, timeoutsUsed]
  )

  // One action: the time-out event and the started countdown appear together
  // (the scoreboard showed the time-out taken under the still-open request)
  const runTimeoutConfirm = useConfirmAction(onConfirmFailed)
  const confirmTimeout = useCallback(() => runTimeoutConfirm(() => runAction('timeout', async () => {
    const request = timeoutModal
    if (!request || request.started) return

    debugLogger.log('TO_CONFIRM', {
      team: request.team,
      staleTimestampRef: timeoutStartTimestampRef.current
    })

    // The countdown starts with the time-out count (deferUi: same render)
    const startTimestamp = Date.now()
    deferUi(() => setTimeoutModal({ ...request, started: true, startedAt: new Date(startTimestamp).toISOString() }))

    // Log the timeout event
    await logEvent('timeout', { team: request.team })

    // Debug log: timeout
    debugLogger.log('TIMEOUT', {
      team: request.team
    }, getStateSnapshot())

    // Send timeout action to referee to show modal
    runOrDefer({
      run: () => sendActionToReferee('timeout', {
        team: request.team,
        countdown: TEAM_TIMEOUT_SECONDS,
        startTimestamp: startTimestamp
      })
    })

    // Trigger event backup for Safari/Firefox
    runOrDefer({ run: () => onTriggerEventBackup?.('timeout') })
  })), [runTimeoutConfirm, runAction, deferUi, runOrDefer, timeoutModal, logEvent, sendActionToReferee, onTriggerEventBackup])

  const cancelTimeout = useCallback(() => {
    // Only cancel if timeout hasn't started yet
    if (!timeoutModal || timeoutModal.started) return
    debugLogger.log('TO_CANCEL', { team: timeoutModal?.team })
    // Reset refs in case they were set (safety measure)
    timeoutStartTimestampRef.current = null
    timeoutInitialCountdownRef.current = TEAM_TIMEOUT_SECONDS
    setTimeoutModal(null)
  }, [timeoutModal])

  const stopTimeout = useCallback(() => {
    // Stop the countdown (close modal) but keep the timeout logged
    // The effect will detect the modal closing and sync timeout_active: false to Supabase/referee
    debugLogger.log('TO_STOP', { wasTimestamp: timeoutStartTimestampRef.current })
    // Reset refs so next timeout starts fresh (fixes intermittent countdown failure)
    timeoutStartTimestampRef.current = null
    timeoutInitialCountdownRef.current = TEAM_TIMEOUT_SECONDS
    setTimeoutModal(null)
  }, [])

  // Ball Mark Protocol (BMP) handlers
  const handleTeamBMP = useCallback(async (teamKey) => {
    if (!data?.set) return

    // Get current score and serving team
    const team1Points = data.set.team1Points || 0
    const team2Points = data.set.team2Points || 0
    const servingTeam = getCurrentServe()

    // The request (a `challenge` event) is logged with its outcome, when the
    // scorer confirms it: Cancel leaves nothing behind (it logged a "BMP
    // request" that nothing undid). Its time is the time it was asked for.
    setBmpSelectedOutcome(null) // Reset any previous selection
    setBmpOutcomeModal({
      type: 'team',
      team: teamKey,
      requestedAt: new Date().toISOString(),
      currentScore: { team1: team1Points, team2: team2Points },
      currentServe: servingTeam
    })
  }, [data?.set, getCurrentServe])

  const handleRefereeBMP = useCallback(async () => {
    if (!data?.set) return

    // Get current score and serving team
    const team1Points = data.set.team1Points || 0
    const team2Points = data.set.team2Points || 0
    const servingTeam = getCurrentServe()

    // Logged with its outcome (as the team BMP): Cancel leaves nothing behind
    setBmpSelectedOutcome(null) // Reset any previous selection
    setBmpOutcomeModal({
      type: 'referee',
      requestedAt: new Date().toISOString(),
      currentScore: { team1: team1Points, team2: team2Points },
      currentServe: servingTeam
    })
  }, [data?.set, getCurrentServe])

  // Close first, then write (useConfirmAction): a double tap on an outcome
  // gave the point twice
  const runBMPOutcome = useConfirmAction(onConfirmFailed)
  const handleBMPOutcome = useCallback((result, pointToTeam = null) => runBMPOutcome(async () => {
    if (!bmpOutcomeModal || !data?.set) return
    const bmpModal = { ...bmpOutcomeModal }
    setBmpSelectedOutcome(null)
    setBmpOutcomeModal(null)

    // The request first, at the score it was asked at; the outcome is its sub-event
    if (bmpModal.requestSeq === undefined) {
      bmpModal.requestSeq = bmpModal.type === 'team'
        ? await logEvent('challenge', {
          team: bmpModal.team,
          score: { ...bmpModal.currentScore },
          servingTeam: bmpModal.currentServe
        }, { timestamp: bmpModal.requestedAt })
        : await logEvent('referee_bmp_request', {
          score: { ...bmpModal.currentScore },
          servingTeam: bmpModal.currentServe
        }, { timestamp: bmpModal.requestedAt })
    }

    const requestingTeam = bmpModal.team
    const isTeamBMP = bmpModal.type === 'team'
    const isRefereeBMP = bmpModal.type === 'referee'
    const currentSetId = data.set.id

    // Get current score
    let team1Points = data.set.team1Points || 0
    let team2Points = data.set.team2Points || 0

    console.log(`[BMP-LIVE] === handleBMPOutcome ===`)
    console.log(`[BMP-LIVE] result=${result}, pointToTeam=${pointToTeam}`)
    console.log(`[BMP-LIVE] requestingTeam=${requestingTeam}, isTeamBMP=${isTeamBMP}, isRefereeBMP=${isRefereeBMP}`)
    console.log(`[BMP-LIVE] Score BEFORE: team1=${team1Points}, team2=${team2Points}`)
    console.log(`[BMP-LIVE] bmpOutcomeModal:`, JSON.stringify(bmpModal))

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
      }, { parentSeq: bmpModal.requestSeq })

      console.log(`[BMP-LIVE] Score AFTER update: team1=${team1Points}, team2=${team2Points}`)

      // Also log a point event so getCurrentServe() picks up the serve change
      // In beach volleyball, the team that wins the point gets the serve
      const bmpPointPayload = {
        team: scoringTeam,
        fromBMP: true  // Mark that this point came from BMP
      }
      // For successful team BMP: mark which team's point was reversed so PDF can subtract it
      if (isTeamBMP && result === 'successful') {
        bmpPointPayload.reversedTeam = requestingTeam === 'team1' ? 'team2' : 'team1'
      }
      console.log(`[BMP-LIVE] Logging BMP point event:`, JSON.stringify(bmpPointPayload), `parentSeq=${bmpModal.requestSeq}`)
      await logEvent('point', bmpPointPayload, { parentSeq: bmpModal.requestSeq })

      // What the point reaches, as for a point from the buttons: the change
      // of courts, the TTO or the set end. A referee BMP decides the rally in
      // play (one point more); a successful team BMP moves the rally's point
      // to the requesting team (the same total: what that total opened is
      // not made twice, an open dialog shows the new score)
      const freshSet = await db.sets.get(currentSetId)
      if (freshSet) {
        await afterPointScored({ set: freshSet, team1Points, team2Points, teamKey: scoringTeam, newRally: isRefereeBMP })
      }
    } else {
      // Unsuccessful, judgment_impossible - no score change
      const eventType = isTeamBMP ? 'challenge_outcome' : 'referee_bmp_outcome'
      await logEvent(eventType, {
        team: requestingTeam,
        result,
        pointAwarded: false,
        newScore: { team1: team1Points, team2: team2Points }
      }, { parentSeq: bmpModal.requestSeq })

      // Re-check set end since modal may have been closed before BMP started
      const freshSet = await db.sets.get(currentSetId)
      if (freshSet) {
        await checkSetEnd(freshSet, team1Points, team2Points)
      }
    }

    // Sync live state
    syncLiveStateToSupabase('bmp_outcome', requestingTeam || pointToTeam, { result })
  }), [runBMPOutcome, bmpOutcomeModal, data?.set, logEvent, checkSetEnd, afterPointScored, syncLiveStateToSupabase])

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

  // The "BMP request" of the court switch / TTO / set-end dialog: the BMPs the
  // team has left, or 0 (no button) when a BMP was already taken on the rally
  // that ended with the dialog's point. One BMP per completed rally
  // (bmpAvailability_beach): the set-end dialog reopens after an unsuccessful
  // BMP and offered a second one on the same rally.
  const dialogBmpRemaining = useCallback((teamKey) => {
    const remaining = Math.max(0, 2 - getUnsuccessfulBMPsUsed(teamKey))
    const block = teamBmpBlockReason({ events: data?.events, setIndex: data?.set?.index, remaining, dialog: true })
    return block ? 0 : remaining
  }, [data?.events, data?.set?.index, getUnsuccessfulBMPsUsed])

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
    const initialCountdown = timeoutInitialCountdownRef.current || TEAM_TIMEOUT_SECONDS

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

  // The TTO's end (handleTtoEnd, below): the countdown running out ends it
  // the same way as the scorer's tap
  const handleTtoEndRef = useRef(null)

  // TTO countdown timer
  useEffect(() => {
    if (!ttoModal || !ttoModal.started) return
    if (ttoModal.countdown <= 0) return
    const timer = setInterval(() => {
      setTtoModal(prev => {
        if (!prev || !prev.started) return null
        const newCountdown = prev.countdown - 1
        if (newCountdown <= 0) {
          return { ...prev, countdown: 0 } // Keep modal open briefly to show "0:00"
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

  // The countdown ran out: the TTO ends as when the scorer taps it (its
  // change of courts AND its undo snapshot), after "0:00" showed briefly
  useEffect(() => {
    if (!ttoModal?.started || ttoModal.countdown !== 0) return
    const timeout = setTimeout(() => { handleTtoEndRef.current?.() }, 500)
    return () => clearTimeout(timeout)
  }, [ttoModal?.started, ttoModal?.countdown]) // eslint-disable-line react-hooks/exhaustive-deps

  const getTimeoutsUsed = useCallback(
    side => {
      const teamKey = mapSideToTeamKey(side)
      return (timeoutsUsed && timeoutsUsed[teamKey]) || 0
    },
    [mapSideToTeamKey, timeoutsUsed]
  )

  

  // Get display name for court player (shows last name by default)
  const getCourtPlayerDisplayName = useCallback((teamKey, playerNumber, firstName, lastName) => {
    return lastName || firstName || ''
  }, [])

  // Format player name for court rectangle: first name capitalized, last name ALL CAPS
  const formatCourtPlayerName = useCallback((firstName, lastName) => {
    const parts = []
    if (firstName) {
      parts.push(firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase())
    }
    if (lastName) {
      parts.push(lastName.toUpperCase())
    }
    return parts.join(' ')
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
    // Only allow when rally is not in play
    if (rallyStatus !== 'idle') return
    if (isRallyReplayed) return // Don't allow actions when rally is replayed
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
  }, [playerActionMenu, leftisTeam1, rallyStatus, isRallyReplayed])

 
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

      // Award points until opponent wins (marked as fromForfait to skip PDF service rotation)
      const pointsNeeded = opponentPoints - currentOpponentPoints
      if (pointsNeeded > 0) {
        for (let i = 0; i < pointsNeeded; i++) {
          await logEvent('point', {
            team: opponentKey,
            fromForfait: true
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

    // Update match status to 'ended' with forfait flags
    await db.matches.update(matchId, { status: 'ended', forfait: true, forfaitTeam: teamKey })

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

  // The player's name for the medical dialogs and events
  const medicalPlayerName = useCallback((team, playerNumber) => {
    const players = team === 'team1' ? data?.team1Players : data?.team2Players
    const p = (players || []).find(pl => String(pl.number) === String(playerNumber))
    if (!p) return ''
    if (p.lastName) return p.lastName
    if (p.name) return String(p.name).trim()
    return p.firstName || ''
  }, [data?.team1Players, data?.team2Players])

  // Start an MTO (medical time-out) or a RIT (recovery interruption time):
  // 5 minutes recovery time (FIVB beach rule 17.1.2). One event, logged with
  // logEvent (synced, undoable), carrying the player, the score and the server
  // (the scoresheet's medical chart and remarks read it: medicalEvents_beach).
  const startMedical = useCallback(async (kind, ritType) => {
    if (!injuryDropdown || !data?.set) return
    const { team, playerNumber } = injuryDropdown
    const startedAt = new Date().toISOString()
    const playerName = medicalPlayerName(team, playerNumber)
    setInjuryDropdown(null)

    const startSeq = await logEvent(kind, medicalStartPayload({
      kind,
      team,
      playerNumber,
      playerName,
      ritType,
      startTime: startedAt,
      team1Points: data.set.team1Points || 0,
      team2Points: data.set.team2Points || 0,
      servingTeam: getCurrentServe()
    }))

    setMedicalModal({
      type: kind,
      ritType: kind === 'rit' ? ritType : undefined,
      team,
      playerNumber,
      playerName,
      countdown: MEDICAL_RECOVERY_SECONDS,
      started: true,
      startedAt,
      startSeq
    })
    sendActionToReferee('medical', { kind, ritType: kind === 'rit' ? ritType : null, team, playerNumber, playerName, startTime: startedAt, durationSec: MEDICAL_RECOVERY_SECONDS })
  }, [injuryDropdown, data?.set, logEvent, getCurrentServe, medicalPlayerName, sendActionToReferee])

  // Handle Start MTO (Medical Timeout) - 5 minute recovery time, unlimited per match
  const handleStartMTO = useCallback(async () => {
    cLogger.logHandler('handleStartMTO', { team: injuryDropdown?.team, player: injuryDropdown?.playerNumber })
    await startMedical('mto')
  }, [injuryDropdown, startMedical])

  // Handle Start RIT (Recovery Interruption Time) - 5 minute, only ONE per match
  const handleStartRIT = useCallback(async (ritType) => {
    cLogger.logHandler('handleStartRIT', { team: injuryDropdown?.team, player: injuryDropdown?.playerNumber, ritType })
    if (!injuryDropdown || !data?.set) return

    // Check if RIT already used this match
    if (ritUsedThisMatch) {
      showAlert(t('scoreboard.ritAlreadyUsed', 'RIT already used this match'), 'error')
      return
    }
    await startMedical('rit', ritType)
  }, [injuryDropdown, data?.set, ritUsedThisMatch, showAlert, t, startMedical])

  // The MTO / RIT ends: the player recovered, or cannot continue (forfeit).
  // A `medical_end` event (logEvent: synced, undoable) refers to the start; no
  // separate remark (the scoresheet writes the remark line from the events).
  const [medicalForfeitConfirm, setMedicalForfeitConfirm] = useState(false)
  const medicalEndingRef = useRef(new Set())
  const runMedicalOutcome = useConfirmAction(onConfirmFailed)
  const handleMedicalOutcome = useCallback((outcome) => runMedicalOutcome(async () => {
    cLogger.logHandler('handleMedicalOutcome', { outcome, medicalModal })
    if (!medicalModal || !data?.set) return
    const modal = medicalModal
    setMedicalModal(null)
    setMedicalForfeitConfirm(false)

    const { type, team, playerNumber } = modal
    const startEvent = (data.events || []).find(e => e.seq === modal.startSeq && e.type === type) || {
      type,
      seq: modal.startSeq,
      payload: { team, playerNumber, playerName: modal.playerName, ritType: modal.ritType, startTime: modal.startedAt }
    }
    if (startEvent.seq !== undefined) medicalEndingRef.current.add(startEvent.seq)
    await logEvent('medical_end', medicalEndPayload(startEvent, { endTime: new Date().toISOString(), outcome }))
    sendActionToReferee('end_medical', { kind: type, team, playerNumber, outcome })

    // If forfeit, generate FIVB remark and trigger forfeit flow
    if (outcome === 'forfeit') {
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const setIdx = data?.set?.index || 1
      const setLabel = setIdx === 1 ? '1st' : setIdx === 2 ? '2nd' : '3rd'
      const t1Pts = data?.set?.team1Points || 0
      const t2Pts = data?.set?.team2Points || 0
      const teamAKey = data?.match?.coinTossTeamA || 'team1'
      const servingLabel = data?.servingTeam === teamAKey ? 'A' : 'B'
      const forfaitTeamName = team === 'team1'
        ? (data?.team1Team?.name || 'team1')
        : (data?.team2Team?.name || 'team2')
      const fivbRemark = `At ${timeStr} time, ${setLabel} set, ${t1Pts}:${t2Pts} score, team ${servingLabel} serving, team ${forfaitTeamName} forfeits the match due to injury (injury as confirmed by the official medical personnel) of player # ${playerNumber}`
      const existingRemarks = data?.match?.remarks || ''
      const updatedRemarks = existingRemarks ? `${existingRemarks}\n${fivbRemark}` : fivbRemark
      await db.matches.update(matchId, { remarks: updatedRemarks, forfait: true, forfaitTeam: team })

      await handleForfait(team, 'medical', 'match')
    }
  }), [runMedicalOutcome, medicalModal, data?.set, data?.events, data?.match?.coinTossTeamA, data?.match?.remarks, data?.servingTeam, data?.team1Team?.name, data?.team2Team?.name, matchId, logEvent, handleForfait, sendActionToReferee])

  // The running MTO / RIT follows the events: a reload (or an undone end)
  // brings its countdown back, an undone start closes it
  const openMedicalEvent = useMemo(() => findOpenMedical(data?.events || []), [data?.events])
  const medicalSeenRef = useRef(null)
  useEffect(() => {
    const events = data?.events || []
    for (const seq of [...medicalEndingRef.current]) {
      if (events.some(e => e.type === 'medical_end' && e.payload?.startSeq === seq)) medicalEndingRef.current.delete(seq)
    }
    if (medicalModal?.started) {
      const inEvents = events.some(e => e.seq === medicalModal.startSeq && e.type === medicalModal.type)
      if (inEvents) medicalSeenRef.current = medicalModal.startSeq
      // seen in the events, now gone: its start was undone
      else if (medicalSeenRef.current === medicalModal.startSeq) {
        medicalSeenRef.current = null
        setMedicalModal(null)
        setMedicalForfeitConfirm(false)
      }
      return
    }
    if (!openMedicalEvent || medicalEndingRef.current.has(openMedicalEvent.seq)) return
    const p = openMedicalEvent.payload || {}
    const startedAt = p.startTime || openMedicalEvent.ts
    setMedicalModal({
      type: openMedicalEvent.type,
      ritType: p.ritType,
      team: p.team,
      playerNumber: p.playerNumber,
      playerName: p.playerName || medicalPlayerName(p.team, p.playerNumber),
      countdown: medicalSecondsLeft(startedAt),
      started: true,
      startedAt,
      startSeq: openMedicalEvent.seq
    })
  }, [openMedicalEvent, data?.events, medicalModal?.started, medicalModal?.startSeq, medicalModal?.type, medicalPlayerName])

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

  // Count penalties for a player in the CURRENT SET only (per FIVB 20.3.1)
  // A player can receive up to 2 penalties in the same set before being expelled
  const getPlayerPenaltyCountInCurrentSet = useCallback((teamKey, playerNumber) => {
    if (!data?.events || !data?.set) return 0

    const currentSetIndex = data.set.index
    return data.events.filter(e => {
      return e.type === 'sanction' &&
             e.setIndex === currentSetIndex &&
             e.payload?.team === teamKey &&
             (e.payload?.playerNumber === playerNumber ||
              String(e.payload?.playerNumber) === String(playerNumber)) &&
             e.payload?.type === 'penalty'
    }).length
  }, [data?.events, data?.set])

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

  // Confirm player sanction (useConfirmAction: a double tap logs it once; the
  // dialog closes before the sanction is written)
  const runPlayerSanctionConfirm = useConfirmAction(onConfirmFailed)
  const confirmPlayerSanction = useCallback(() => runPlayerSanctionConfirm(async () => {
    if (!sanctionConfirmModal || !data?.set) return

    const { team, type, playerNumber, position, role, sanctionType } = sanctionConfirmModal

    // Validate sanction type rules
    if (type === 'coach' || role === 'coach') {
      // Coach sanction validation - use role-based checks
      const coachHasSanction = data?.events?.some(e =>
        e.type === 'sanction' && e.payload?.team === team && e.payload?.role === 'coach' && e.payload?.type === sanctionType
      )
      const teamWarning = teamHasFormalWarning(team)

      if (sanctionType === 'penalty') {
        const coachPenaltiesInSet = data?.events?.filter(e =>
          e.type === 'sanction' && e.setIndex === data?.set?.index && e.payload?.team === team && e.payload?.role === 'coach' && e.payload?.type === 'penalty'
        ).length || 0
        if (coachPenaltiesInSet >= 2) {
          showAlert('Coach already has 2 penalties in this set. Third rude conduct results in expulsion.', 'info')
          setSanctionConfirmModal(null)
          const opponentKey = team === 'team1' ? 'team2' : 'team1'
          const allSets = await db.sets.where({ matchId }).toArray()
          const opponentSetsWon = setsWonBy(allSets, opponentKey)
          setExpulsionConfirmModal({ team, type, role, sanctionType: 'expulsion', endsMatch: opponentSetsWon >= 1 })
          return
        }
      } else if (coachHasSanction) {
        showAlert(`Coach already has a ${sanctionType}. Cannot receive the same sanction type twice.`, 'warning')
        setSanctionConfirmModal(null)
        return
      }

      if (sanctionType === 'warning' && teamWarning) {
        showAlert('Warning cannot be given because the team has already been warned.', 'warning')
        setSanctionConfirmModal(null)
        return
      }
    } else if (playerNumber) {
      const hasThisSanction = playerHasSanctionType(team, playerNumber, sanctionType)
      const teamWarning = teamHasFormalWarning(team)

      // Special handling for penalties per FIVB 20.3.1:
      // A player can receive up to 2 penalties in the same set (rude conduct)
      // On the 3rd rude conduct in the same set, the player is expelled
      if (sanctionType === 'penalty') {
        const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(team, playerNumber)
        if (penaltyCountInSet >= 2) {
          // 3rd rude conduct in same set -> automatic expulsion per FIVB 20.3.1
          showAlert(`Player ${playerNumber} already has 2 penalties in this set. Third rude conduct results in expulsion.`, 'info')
          // Auto-escalate to expulsion
          setSanctionConfirmModal(null)
          const opponentKey = team === 'team1' ? 'team2' : 'team1'
          const allSets = await db.sets.where({ matchId }).toArray()
          const opponentSetsWon = setsWonBy(allSets, opponentKey)
          const endsMatch = opponentSetsWon >= 1
          setExpulsionConfirmModal({
            team,
            type,
            playerNumber,
            position,
            role,
            sanctionType: 'expulsion',
            endsMatch
          })
          return
        }
        // Allow penalty if < 2 in current set (don't block based on match-wide check)
      } else if (hasThisSanction) {
        // For non-penalty sanctions, prevent giving the same sanction type again
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
      // Check if this expulsion would end the match (opponent wins their 2nd set)
      const opponentKey = team === 'team1' ? 'team2' : 'team1'
      const allSets = await db.sets.where({ matchId }).toArray()
      const opponentSetsWon = setsWonBy(allSets, opponentKey)
      const endsMatch = opponentSetsWon >= 1 // If opponent already has 1 set, winning this one ends the match

      // Show secondary confirmation modal
      setSanctionConfirmModal(null)
      setExpulsionConfirmModal({
        team,
        type,
        playerNumber,
        position,
        role,
        sanctionType,
        endsMatch
      })
      return
    } else if (sanctionType === 'disqualification') {
      // Disqualification always ends the match
      setSanctionConfirmModal(null)
      setExpulsionConfirmModal({
        team,
        type,
        playerNumber,
        position,
        role,
        sanctionType,
        endsMatch: true
      })
      return
    }

    // Regular sanction (warning or penalty): ONE action (a penalty's point
    // joins it); the dialog closes in the render that shows it (deferUi)
    await runAction('sanction', async () => {
      deferUi(() => setSanctionConfirmModal(null))
      await logEvent('sanction', {
        team,
        type: sanctionType,
        playerType: type,
        playerNumber,
        position,
        role
      })

      // If penalty, award point to the other team immediately
      // Beach volleyball has no lineups - always 2 players per team
      if (sanctionType === 'penalty') {
        // Award point to the opposing team (marked as fromPenalty for circle display on scoresheet)
        const otherTeam = team === 'team1' ? 'team2' : 'team1'
        const otherSide = mapTeamKeyToSide(otherTeam)
        await handlePoint(otherSide, false, true)
      }
    })
  }), [runPlayerSanctionConfirm, runAction, deferUi, sanctionConfirmModal, data?.set, data?.events, data?.team1Players, data?.team2Players, logEvent, mapTeamKeyToSide, handlePoint, leftisTeam1, getPlayerSanctionLevel, playerHasSanctionType, teamHasFormalWarning, handleForfait, matchId, getPlayerPenaltyCountInCurrentSet])

  // Execute expulsion/disqualification after secondary confirmation. ONE
  // action: the sanction, the points the forfeit awards, the set end and the
  // forfait commit together, and the dialog closes with them (deferUi).
  // Written one by one the score counted up point by point under the open
  // dialog, and the dialog, closed only after the set transition, came back
  // on the next set's scoreboard.
  const executeExpulsionOrDisqualification = useCallback(() => runAction('expulsion', async () => {
    console.log('[executeExpulsionOrDisqualification] Called', { expulsionConfirmModal, hasSet: !!data?.set })
    if (!expulsionConfirmModal || !data?.set) {
      console.log('[executeExpulsionOrDisqualification] Early return - missing data', { expulsionConfirmModal, hasSet: !!data?.set })
      return
    }

    const { team, type, playerNumber, position, role, sanctionType } = expulsionConfirmModal
    deferUi(() => setExpulsionConfirmModal(null))
    console.log('[executeExpulsionOrDisqualification] Logging sanction', { team, sanctionType, playerNumber })

    // Log the sanction event first (for PDF display)
    const eventId = await logEvent('sanction', {
      team,
      type: sanctionType,
      playerType: type,
      playerNumber,
      position,
      role
    })
    console.log('[executeExpulsionOrDisqualification] Sanction logged', { eventId })

    if (sanctionType === 'expulsion') {
      // Expulsion: forfeit current set
      await handleForfait(team, 'expulsion', 'set')

      // Check if this expulsion ends the match (opponent now has 2 sets)
      const allSets = await db.sets.where({ matchId }).toArray()
      const opponentKey = team === 'team1' ? 'team2' : 'team1'
      const opponentSetsWon = allSets.filter(s => s.finished && s[`${opponentKey === 'team1' ? 'team1Points' : 'team2Points'}`] > s[`${opponentKey === 'team1' ? 'team2Points' : 'team1Points'}`]).length
      if (opponentSetsWon >= 2) {
        await db.matches.update(matchId, { status: 'ended' })
        runOrDefer({ run: () => onTriggerEventBackup?.('match_end') })
        deferUi(() => { if (onFinishSet) onFinishSet(data.set) })
        return
      }
    } else if (sanctionType === 'disqualification') {
      // Generate FIVB remark for disqualification forfeit (Case b)
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      const setIdx = data?.set?.index || 1
      const setLabel = setIdx === 1 ? '1st' : setIdx === 2 ? '2nd' : '3rd'
      const t1Pts = data?.set?.team1Points || 0
      const t2Pts = data?.set?.team2Points || 0
      const teamAKey = data?.match?.coinTossTeamA || 'team1'
      const servingLabel = data?.servingTeam === teamAKey ? 'A' : 'B'
      const forfaitTeamName = team === 'team1'
        ? (data?.team1Team?.name || 'team1')
        : (data?.team2Team?.name || 'team2')
      const fivbRemark = `At ${timeStr} time, ${setLabel} set, ${t1Pts}:${t2Pts} score, team ${servingLabel} serving, team ${forfaitTeamName} forfeits the match due to disqualification of player # ${playerNumber}`
      const existingRemarks = data?.match?.remarks || ''
      const updatedRemarks = existingRemarks ? `${existingRemarks}\n${fivbRemark}` : fivbRemark

      // Disqualification: forfeit entire match
      await handleForfait(team, 'disqualification', 'match')
      await db.matches.update(matchId, { status: 'ended', forfait: true, forfaitTeam: team, remarks: updatedRemarks })
      runOrDefer({ run: () => onTriggerEventBackup?.('match_end') })
      deferUi(() => { if (onFinishSet) onFinishSet(data.set) })
    }
  }), [runAction, deferUi, runOrDefer, expulsionConfirmModal, data?.set, logEvent, handleForfait, matchId, onTriggerEventBackup, onFinishSet])

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

      // These modals need a decision: Enter confirms them, Escape does not
      // close them, and the point keys wait. (It was never defined: every
      // key press threw a ReferenceError.)
      // The TTO dialog too: Enter started a rally under it, and the point
      // keys scored past 21 while the TTO (and its change of courts) waited
      const hasDecisionModal = !!(sanctionConfirmModal || sanctionConfirm || accidentalRallyConfirmModal ||
        accidentalPointConfirmModal || undoConfirm || replayConfirm || replayRallyConfirm || courtSwitchModal || ttoModal)

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
        if (replayConfirm) {
          e.preventDefault()
          confirmReplay()
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
      if (hasDecisionModal || timeoutModal || menuModal) return

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
    timeoutModal, menuModal, sanctionConfirmModal, sanctionConfirm, courtSwitchModal, ttoModal, accidentalRallyConfirmModal,
    accidentalPointConfirmModal, undoConfirm, replayConfirm, replayRallyConfirm, confirmReplay, handleReplayRally, handleDecisionChange
  ])

  // Team-column sanctions: scoring actions, so at least 44 px (volleyui §7),
  // on the light screen; the delay ones keep the official card colours
  // (yellow warning, red penalty), each with its word.
  const sanctionButtonStyles = useMemo(() => {
    const base = { flex: 1, minHeight: '48px', fontSize: '13px', lineHeight: 1.15, padding: '6px 8px', fontWeight: 600, borderRadius: 'var(--ov-radius)', borderWidth: '1px', borderStyle: 'solid' }
    return {
      improper: { ...base, background: 'var(--ov-card)', borderColor: 'var(--ov-hairline-strong)', color: 'var(--ov-text-body)' },
      delayWarning: { ...base, background: '#fef9c3', borderColor: '#eab308', color: '#713f12' },
      delayPenalty: { ...base, background: 'var(--ov-danger-soft)', borderColor: '#dc2626', color: 'var(--ov-danger-text)' }
    }
  }, [])

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

  // One action (useConfirmAction refuses a double tap, which switched twice):
  // the sides, the cloud job and the court_switch event commit together and
  // the dialog closes in the same render (deferUi). Written one by one, the
  // serve ball jumped to the other side before the teams did.
  const runCourtSwitchConfirm = useConfirmAction(onConfirmFailed)
  const confirmCourtSwitch = useCallback(() => runCourtSwitchConfirm(() => runAction('courtSwitch', async () => {
    if (!courtSwitchModal || !data?.match || !data?.set) return
    const modal = courtSwitchModal
    deferUi(() => setCourtSwitchModal(null))

    // The change back (askCourtSwitchBackIfDue), one action: the teams go
    // back where they were before the change(s) the score no longer reaches,
    // whose events go (a TTO's change: the TTO too), so the change is asked
    // again at that total; the tablets, the livescore and the scoresheet follow
    if (modal.back) {
      await runAction('courtSwitch', async () => {
        const setIndex = modal.set.index
        const set = await db.sets.where({ matchId }).and(s => s.index === setIndex).first()
        if (!set) return
        const events = await db.events.where('matchId').equals(matchId).toArray()
        const match = await db.matches.get(matchId)
        const stale = staleCourtSwitches(events, setIndex, (set.team1Points || 0) + (set.team2Points || 0), match)
        if (stale.length === 0) return
        const update = switchBackUpdate(stale, setIndex, match)
        if (update) {
          await db.matches.update(matchId, update)
          if (match?.seed_key && !match.test) {
            await db.sync_queue.add({
              resource: 'match',
              action: 'update',
              payload: { id: match.seed_key, ...update },
              ts: new Date().toISOString(),
              status: 'queued'
            })
          }
        }
        await discardEvents(stale)
        // The undo snapshots logged since the change have its courts: Undo of
        // the next event would change them again
        for (const row of snapshotsAfterSwitchBack(events, stale, setIndex, { ...match, ...(update || {}) })) {
          await db.events.update(row.id, { stateSnapshot: row.stateSnapshot })
        }
        afterRefereeSync()
        afterLiveState('court_switch', null, { reason: `set${setIndex}_court_switch_back` })
        afterScoresheetRefresh()
      }, { reason: 'decision_change' })
      return
    }

    const setIndex = modal.set.index
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'

    // Store pre-switch overrides so undo can restore them
    const preSwitchOverrides = data.match.setLeftTeamOverrides ? { ...data.match.setLeftTeamOverrides } : {}

    if (setIndex >= 1 && setIndex <= 3) {
      const update = switchSidesUpdate(setIndex, data.match)
      await db.matches.update(matchId, update)

      // Sync to Supabase
      if (data.match?.seed_key && !data.match.test) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: { id: data.match.seed_key, ...update },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    }

    // Log court_switch event for PDF scoresheet (logEvent: its snapshot for
    // undo, its sync job, the tablets)
    await logEvent('court_switch', {
      score: { team1: modal.team1Points, team2: modal.team2Points },
      preSwitchOverrides,
      // the designation of its A/B sides (coinToss_beach eventTeamA)
      teamA: teamAKey
    }, { setIndexOverride: setIndex })

    // Check if TTO should be triggered after court switch (at 21 points in sets 1-2)
    const shouldTriggerTto = modal?.triggerTtoAfter
    const ttoData = shouldTriggerTto ? {
      set: modal.set,
      team1Points: modal.team1Points,
      team2Points: modal.team2Points,
      countdown: TTO_SECONDS,
      started: false
    } : null

    // Trigger TTO if needed (at 21 points), shown with the switch
    if (shouldTriggerTto && ttoData) {
      deferUi(() => setTtoModal(ttoData))
    }

    // After the commit: side_a and serving_team after the court switch
    const reason = setIndex === 3 ? 'set3_8points' : `set${setIndex}_court_switch`
    afterLiveState('court_switch', null, { reason })
  })), [runCourtSwitchConfirm, runAction, deferUi, courtSwitchModal, matchId, data?.match, data?.set, logEvent, discardEvents, afterRefereeSync, afterLiveState, afterScoresheetRefresh])

  // The changes of courts on page load/refresh (ported from OpenVolley
  // e95516eb): the dialogs lived only in the screen's state, so a screen
  // reloaded (or the app opened again) with the change-of-courts dialog, the
  // TTO dialog, or a decision change asked from one of them, open came back
  // without it, the courts not changed, until the next change total. Asked
  // once per set when it is first shown (pendingCourtDialog): the change
  // back, else what a point at that total opens (the change of courts, the
  // TTO; a TTO already logged opens again, not started). Later every way the
  // score changes asks, and a check on every render would reopen a dialog
  // under the decision change asked from it.
  const courtSwitchLoadCheckedRef = useRef(null)
  useEffect(() => {
    const set = data?.set
    if (!set || !data?.match || !data?.events) return
    if (courtSwitchLoadCheckedRef.current === set.id) return
    courtSwitchLoadCheckedRef.current = set.id
    askPendingCourtDialog(set, data.events, data.match)
  }, [data?.set, data?.match, data?.events, askPendingCourtDialog])

  // Handle TTO end - performs court switch if needed (at 21 points in sets 1-2).
  // The one end of a TTO, tapped by the scorer or run out (the countdown
  // effect above calls it too): a TTO that ran out switched the courts but
  // kept its pre-switch undo snapshot, and Undo of the next event (a rally
  // start, a time-out) put the teams back on their old sides. Once per TTO:
  // a tap while the run-out end is pending does not switch twice.
  // One action: the switch (sides, cloud job, the TTO event's snapshot) and
  // the closed dialog show together, not the sides flipping under it.
  const ttoEndedRef = useRef(null)
  const handleTtoEnd = useCallback(() => runAction('ttoEnd', async () => {
    if (!ttoModal) return
    const ttoKey = ttoModal.startedAt || ttoModal
    if (ttoEndedRef.current === ttoKey) return
    ttoEndedRef.current = ttoKey
    deferUi(() => setTtoModal(null))

    const shouldSwitchCourts = ttoModal.triggerCourtSwitchAfter
    let switchedSetIndex = null

    if (shouldSwitchCourts && data?.match && data?.set) {
      const setIndex = ttoModal.set.index

      if (setIndex >= 1 && setIndex <= 3) {
        const update = switchSidesUpdate(setIndex, data.match)
        await db.matches.update(matchId, update)

        // Sync to Supabase
        if (data.match?.seed_key && !data.match.test) {
          await db.sync_queue.add({
            resource: 'match',
            action: 'update',
            payload: { id: data.match.seed_key, ...update },
            ts: new Date().toISOString(),
            status: 'queued'
          })
        }
        switchedSetIndex = setIndex
      }
    }

    // Update the technical_to event's snapshot to include the court switch
    // Without this, undoing the next point after TTO would incorrectly revert the court switch
    if (shouldSwitchCourts) {
      const allEvents = await db.events.where('matchId').equals(matchId).toArray()
      const ttoEvent = allEvents
        .filter(e => e.type === 'technical_to' && e.setIndex === ttoModal.set?.index)
        .sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
      if (ttoEvent) {
        const updatedSnapshot = await captureFullStateSnapshot()
        if (updatedSnapshot) {
          await db.events.update(ttoEvent.id, { stateSnapshot: updatedSnapshot })
        }
        // Its change of courts is made (a reload no longer asks for it; a
        // replay back below 21 asks to change back)
        if (switchedSetIndex != null) {
          await db.events.update(ttoEvent.id, { payload: { ...(ttoEvent.payload || {}), courtSwitched: true } })
        }
      }
    }

    // Live state after the court switch (after the commit and the snapshot:
    // the live state reads the last event's snapshot)
    if (switchedSetIndex != null) {
      afterLiveState('court_switch', null, { reason: `set${switchedSetIndex}_tto_court_switch` })
    }

    afterLiveState('end_tto')
    runOrDefer({ run: () => sendActionToReferee('end_tto', {}) })
  }), [runAction, deferUi, ttoModal, matchId, data?.match, data?.set, afterLiveState, runOrDefer, captureFullStateSnapshot, sendActionToReferee])
  handleTtoEndRef.current = handleTtoEnd

  // The change of courts (every 7 points, every 5 in set 3) is mandatory; a
  // missed one is made as soon as it is noticed, the score unchanged. So
  // "cancel" never means "do not switch": it can only mean the point that
  // reached the change was recorded in error. It is taken back exactly like
  // Undo of that point: the point (with its BMP group when a BMP decided it),
  // the rally_start of that rally, their unsent cloud jobs (and a cloud delete
  // for what was sent), and the set score without it; then the tablets and the
  // livescore hear about it. Ported from OpenVolley 81dcb210.
  const runCourtSwitchCancel = useConfirmAction(onConfirmFailed)
  const cancelCourtSwitch = useCallback(() => runCourtSwitchCancel(async () => {
    if (!courtSwitchModal) return
    // Close first, then take the point back
    const modal = courtSwitchModal
    setCourtSwitchModal(null)

    try {
      const allEvents = await db.events.where('matchId').equals(matchId).toArray()
      const plan = planPointRemoval(allEvents, null, { setIndex: modal.set.index, includeRallyStart: true })
      if (!plan) return
      const deleteIds = new Set(plan.deleteEventIds)
      await discardEvents(allEvents.filter(e => deleteIds.has(e.id)), 'undo')
      await applyPointRemovalScore(plan)
    } finally {
      syncToReferee()
      syncLiveStateToSupabase('undo', null, null)
      refreshScoresheet()
    }
  }), [runCourtSwitchCancel, courtSwitchModal, matchId, discardEvents, applyPointRemovalScore, syncToReferee, syncLiveStateToSupabase, refreshScoresheet])

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

  // Only the first load is a full-page loader. The set end's steps are a small
  // status over the scoring screen (it was blanked for seconds, saying
  // "Syncing to cloud…" on a device that was not even signed in).
  if (!data?.set) {
    // The match end's last step stays (the finished set leaves no current
    // set) until Match End replaces it: no 'Loading…' between (OV-14)
    const loadingStep = setTransitionLoading?.step || t('common.loading', 'Loading…')
    return (
      <div className="ov-kit fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 px-4" style={{ zIndex: 9999 }}>
        <AppSpinner size={96} label={loadingStep} />
      </div>
    )
  }

  const teamALabel = leftTeam.isTeamA ? 'A' : 'B'
  const teamBLabel = rightTeam.isTeamA ? 'A' : 'B'
  const teamAShortName = leftisTeam1
    ? (data?.match?.team1ShortName || leftTeam.name?.trim().toUpperCase() || 'A')
    : (data?.match?.team2ShortName || leftTeam.name?.trim().toUpperCase() || 'A')
  const teamBShortName = leftisTeam1
    ? (data?.match?.team2ShortName || rightTeam.name?.trim().toUpperCase() || 'B')
    : (data?.match?.team1ShortName || rightTeam.name?.trim().toUpperCase() || 'B')

  // Show duplicate tab error if scoresheet is already open in another tab
  if (duplicateTabError) {
    return (
      <div className="ov-kit flex h-screen flex-col items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-stone-200/70 bg-white p-6 text-center shadow-card-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <TriangleAlert size={24} />
          </div>
          <h1 className="text-lg font-bold text-stone-900">
            {t('scoreboard.modals.scoresheetAlreadyOpen', 'Scoresheet already open')}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {t('scoreboard.duplicateTab.body', 'This match is already open in another tab or window. Close this tab and keep scoring in the other one, so the two do not overwrite each other.')}
          </p>
          <button
            type="button"
            onClick={() => window.close()}
            className={cn('mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 transition-colors', FOCUS_RING)}
          >
            {t('scoreboard.duplicateTab.close', 'Close this tab')}
          </button>
        </div>
      </div>
    )
  }

  // Preview or save the scoresheet in its own window (the toolbar's
  // Scoresheet menu, and the Scoresheet button of the phone layout). The
  // preview is kept for live updates.
  const openScoresheet = (action = null) => {
    const failure = action === 'save'
      ? ['saving', 'Failed to save scoresheet']
      : ['opening', 'Failed to open scoresheet']
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
      const opened = openAppWindow(`/scoresheet_beach.html${action ? `?action=${action}` : ''}`, { features: 'width=1200,height=900' })

      if (!opened.ok) {
        showAlert(t('header.allowPopups'), 'warning')
        return
      }

      // Store reference for live updates
      if (!action) scoresheetWindowRef.current = opened.window

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
      console.error(`Error ${failure[0]} scoresheet:`, error)
      setScoresheetErrorModal({ error: failure[1], details: error.message || '' })
    }
  }

  // The match's menu, grouped (the toolbar's Menu and the phone layout's sheet)
  const matchMenu = matchMenuSections(t, {
    showRosters: () => {
      setShowRosters(true)
    },
    showSanctions: () => {
      setShowSanctions(true)
    },
    showActionLog: () => {
      setShowLogs(true)
    },
    openRemarks: () => {
      setShowRemarks(true)
    },
    openMatchSetup: onOpenMatchSetup ? () => { onOpenMatchSetup() } : undefined,
    manualChanges: () => {
      setShowManualPanel(true)
    },
    openScoreboard: () => {
      const opened = openAppWindow('/scoreboard_beach.html?mode=local', { features: 'width=1280,height=720' })
      if (!opened.ok) {
        showAlert(t('header.allowPopups'), 'warning')
      }
    },
    showPins: () => {
      setShowPinsModal(true)
    },
    downloadGameData: async () => {
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
    },
    options: () => {
      setShowOptionsInMenu(true)
    },
    stopMatch: () => {
      setStopMatchModal('select')
    },
    className: 'text-red-600 hover:bg-red-50'

  })

  // The phone layout's props (PhoneScoreboard_beach): what this screen
  // already computes, per court side, and its own handlers. Built only when
  // shown.
  const buildPhoneView = () => {
    const setIndex = data?.set?.index || 1
    const status = data?.match?.status
    const anchorOf = (e) => {
      const el = e?.currentTarget
      const rect = el?.getBoundingClientRect?.()
      return rect ? { element: el, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { element: el }
    }
    // The next set's service order, as the interval's team boxes show it
    const serviceOrder = (teamKey) => {
      const players = (teamKey === 'team1' ? data?.team1Players : data?.team2Players) || []
      const numbers = players.map(p => p.number).sort((a, b) => a - b)
      const raw = teamKey === 'team1' ? data?.match?.team1FirstServe : data?.match?.team2FirstServe
      const first = raw ?? numbers[0]
      const second = numbers.find(n => String(n) !== String(first)) ?? numbers[1]
      return { firstServer: first ?? null, secondServer: second ?? null, serveOrderPlayers: players, firstServe: raw ?? null }
    }
    const phoneTeam = (side) => {
      const isLeft = side === 'left'
      const teamKey = mapSideToTeamKey(side)
      const team = isLeft ? leftTeam : rightTeam
      const servingPlayer = getServingPlayer(teamKey, team)
      const bmpRemaining = 2 - getUnsuccessfulBMPsUsed(teamKey)
      // only between the point and the next rally, once per completed rally (bmpAvailability_beach)
      const bmpBlock = teamBmpBlockReason({ events: data?.events, setIndex: data?.set?.index, setFinished: !data?.set || data.set.finished, rallyStatus, remaining: bmpRemaining })
      return {
        side,
        teamKey,
        label: teamKey === teamAKey ? 'A' : 'B',
        name: (team.name || teamKey).replace(/\s*\([A-Z]{2,3}\)\s*$/, ''),
        color: team.color,
        setsWon: setsWon?.[side] || 0,
        points: pointsBySide[side] || 0,
        timeouts: timeoutsUsed?.[teamKey] || 0,
        bmp: {
          remaining: bmpRemaining,
          available: !bmpBlock,
          title: bmpBlock === 'bmp_taken' ? t('scoreboard.bmpOncePerRally', 'BMP: once per rally, again after the next completed rally') : bmpBlock === 'rally' || bmpBlock === 'moved_on' || bmpBlock === 'no_point' ? t('scoreboard.bmpOnlyAfterPoint', 'BMP: only after a point, before the next rally') : t('scoreboard.bmpRemaining', { count: bmpRemaining, defaultValue: 'Ball mark protocol ({{count}} left)' })
        },
        players: (team.playersOnCourt || [])
          .filter(pl => pl && pl.number !== undefined && pl.number !== null && pl.number !== '')
          .map(pl => ({ number: pl.number, position: pl.position, serves: !!(servingPlayer && servingPlayer.number === pl.number) && (isLeft ? leftServing : rightServing) })),
        ...serviceOrder(teamKey),
        improperRequestDone: !!data?.match?.sanctions?.[teamKey === 'team1' ? 'improperRequestteam1' : 'improperRequestteam2'],
        delayWarned: !!data?.match?.sanctions?.[teamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2'],
        hasCoach: !!data?.match?.hasCoach
      }
    }

    // The start button, as the desktop's centre column words it
    const setupConfirmed = betweenSetsSetupConfirmed || (setIndex === 3 && set3SetupConfirmed)
    const intervalEnded = !betweenSetsCountdown || betweenSetsCountdown.countdown <= 0
    let startLabel
    let startDisabled = false
    if (intervalEnded && setupConfirmed && (status === 'between_sets' || status === 'set_complete')) {
      startLabel = `${t('scoreboard.buttons.startSet', 'Start set')} ${setIndex}`
    } else {
      startDisabled = status === 'complete' || set3TossPending
      startLabel = status === 'not_started'
        ? t('scoreboard.buttons.startMatch', 'Start match')
        : status === 'complete'
          ? t('scoreboard.buttons.matchComplete', 'Match complete')
          : isFirstRally
            ? t('scoreboard.buttons.startSet', 'Start set')
            : t('scoreboard.buttons.startRally', 'Start rally')
    }

    const intervalCountdown = betweenSetsCountdown ? {
      countdown: betweenSetsCountdown.countdown,
      countdownText: betweenSetsCountdown.countdown <= 0 ? '0' : formatCountdown(betweenSetsCountdown.countdown),
      total: setIntervalDuration
    } : {}
    // As the desktop: the interval's setup takes the court's place until the set starts
    const betweenOpen = isBetweenSets && (setIndex === 3 ? !set3SetupConfirmed : !betweenSetsSetupConfirmed)
    const between = betweenOpen ? {
      kind: setIndex === 3 && !data?.match?.set3CoinTossWinner ? 'toss' : 'setup',
      // the choice (IntervalChoice_beach): who chooses, what they took, the rows
      choice: {
        chooser: intervalChooserInfo,
        choice: intervalChoice,
        names: intervalTeamNames,
        leftTeamKey: leftisTeam1 ? 'team1' : 'team2',
        servingTeamKey: getCurrentServe()
      },
      ...intervalCountdown
    } : null

    const centre = timeoutModal && timeoutModal.started ? {
      kind: 'timeout',
      teamName: timeoutModal.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2'),
      countdown: timeoutModal.countdown,
      countdownText: formatTimeout(timeoutModal.countdown),
      total: TEAM_TIMEOUT_SECONDS
    } : null

    const total = (data?.set?.team1Points || 0) + (data?.set?.team2Points || 0)
    return {
      setNumber: setIndex,
      pointsToWin: setPointsToWin(setIndex),
      teams: { left: phoneTeam('left'), right: phoneTeam('right') },
      serving: leftServing ? 'left' : rightServing ? 'right' : null,
      rhythm: { ...nextCourtEvents(setIndex, total), ttoTotal: TTO_TOTAL, setIndex },
      rally: {
        status: rallyStatus,
        startLabel,
        startDisabled,
        startTitle: set3TossPending ? t('scoreboard.set3TossFirst', 'Record the set 3 coin toss first') : undefined,
        canReplayRally,
        isRallyReplayed
      },
      centre,
      between,
      recent: recentActions(data?.events, data?.set?.index, getActionDescription, 3),
      canUndo,
      scoreFont: getScoreFont(),
      actions: {
        undo: showUndoConfirm,
        menu: () => setPhoneMenuOpen(true),
        point: (side) => handlePoint(side),
        // The desktop button hands its click event over too
        startRally: () => handleStartRally(),
        timeout: (teamKey) => handleTimeout(teamKey),
        teamBmp: (teamKey) => handleTeamBMP(teamKey),
        refereeBmp: handleRefereeBMP,
        playerClick: handlePlayerClick,
        teamSanction: handleTeamSanction,
        // The court's sanction menu (a player) or the coach button's
        sanctionPerson: ({ team, side, type, playerNumber, position, role }, e) => {
          if (rallyStatus !== 'idle' || isRallyReplayed) return
          setSanctionConfirmModal(null)
          setSanctionDropdown({ team, type, playerNumber, position, role, side, ...anchorOf(e) })
        },
        // The court's medical menu (MTO / RIT) of that player
        medical: (teamKey, playerNumber, side, e) => {
          if (rallyStatus !== 'idle' || isRallyReplayed || !data?.set) return
          setInjuryDropdown({ team: teamKey, playerNumber, side, ...anchorOf(e) })
        },
        replay: handleReplay,
        rosters: () => setShowRosters(true),
        scoresheet: () => openScoresheet(),
        remarks: () => setShowRemarks(true),
        stopTimeout,
        set3CoinToss: handleSet3CoinToss,
        switchServiceOrder: handleBetweenSetsSwitchServiceOrder,
        switchSides: handleBetweenSetsSwitchSides,
        switchServe: handleBetweenSetsSwitchServe,
        chooseInInterval,
        pickSide: handleIntervalPickSide,
        pickServe: handleIntervalPickServe
      }
    }
  }

  return (
    <div className={isPhoneView ? 'match-record phone-layout' : 'match-record'}>
      {setTransitionLoading && (
        // Taps wait while the set is being finished (the court still shows
        // the old set); the screen stays visible
        <div data-testid="set-transition-status" style={{ position: 'fixed', inset: 0, zIndex: 9000, cursor: 'progress' }}>
          <div role="status" aria-live="polite" className="ov-kit" style={{
            position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px',
            background: 'var(--ov-card)', border: '1px solid var(--ov-hairline-strong)', borderRadius: '999px',
            boxShadow: 'var(--ov-shadow-card)', fontSize: '15px', fontWeight: 600, color: 'var(--ov-text)'
          }}>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" aria-hidden="true" />
            {setTransitionLoading.step}
          </div>
        </div>
      )}
      {/* Portrait mode warning overlay for devices that don't support orientation lock (iOS).
          Not over the phone layout, which is made for portrait. */}
      {!isLandscape && !isPhoneView && (
        <div className="ov-kit fixed inset-0 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 px-4 py-6" style={{ zIndex: 99999 }}>
          <div className="w-full max-w-sm rounded-2xl border border-stone-200/70 bg-white p-6 text-center shadow-card-lg">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-600">
              <Smartphone size={28} style={{ animation: 'rotate90 1.5s ease-in-out infinite' }} />
            </div>
            <style>{`
              @keyframes rotate90 {
                0%, 100% { transform: rotate(0deg); }
                50% { transform: rotate(-90deg); }
              }
              @media (prefers-reduced-motion: reduce) {
                [style*="rotate90"] { animation: none !important; }
              }
            `}</style>
            <h2 className="text-lg font-bold text-stone-900">
              {t('scoreboard.rotate.title', 'Rotate your device')}
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              {t('scoreboard.rotate.body', 'The scoring screen works in landscape. Turn your device sideways to continue.')}
            </p>
            <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-800">
              {t('scoreboard.rotate.tip', 'For the automatic backups, use Chrome or Edge on a laptop or desktop computer.')}
            </p>
            <button
              type="button"
              onClick={() => {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(err => {
                    // Fullscreen not supported
                  })
                }
              }}
              className={cn('mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors', FOCUS_RING)}
            >
              <Expand size={16} aria-hidden="true" />
              {t('scoreboard.buttons.enterFullscreen', 'Enter fullscreen')}
            </button>
            <p className="mt-2 text-xs text-stone-500">
              {t('scoreboard.buttons.fullscreenHint', 'Fullscreen removes the browser bars to make the most of the screen.')}
            </p>
          </div>
        </div>
      )}
      {/* A phone turned sideways: the phone layout stays underneath (its
          dialogs and countdowns keep going), this asks to turn it back */}
      {isPhoneSideways && (
        <div
          role="alert"
          data-testid="phone-sideways-notice"
          className="ov-kit fixed inset-0 flex flex-col items-center justify-center px-6 text-center"
          style={{ zIndex: 99999, backgroundColor: 'rgb(28 25 23 / 0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div className="mb-4 text-white">
            <Smartphone size={56} aria-hidden="true" />
          </div>
          <h2 className="m-0 mb-2 text-[22px] font-bold text-white">
            {t('scoreboard.phone.sidewaysTitle')}
          </h2>
          <p className="m-0 max-w-[420px] text-[15px] leading-normal text-stone-200">
            {t('scoreboard.phone.sidewaysBody')}
          </p>
        </div>
      )}
      {/* The phone layout has its own header (undo, match menu) */}
      {!isPhoneView && <ScoreboardToolbar collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed(!headerCollapsed)}>
        {/* Column 1: Date/Time */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <span className="toolbar-clock tabular-nums" style={{ fontSize: isCompactMode ? '12px' : '14px' }}>{formatTimestamp(now)}</span>
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
            <span className="text-stone-900 tracking-normal" style={{
              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {(leftTeam.name || (leftisTeam1 ? 'team1' : 'team2')).replace(/\s*\([A-Z]{2,3}\)\s*$/, '')}
            </span>
            <div style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: isCompactMode ? '10px' : '11px',
              fontWeight: 700,
              background: leftTeam.color || '#ef4444',
              color: isLightColour(leftTeam.color || '#ef4444') ? '#000' : '#fff',
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
          <span className="tabular-nums" style={{
            padding: isCompactMode ? '2px 6px' : '4px 10px',
            borderRadius: '4px',
            fontSize: isCompactMode ? '12px' : '16px',
            fontWeight: 700,
            background: leftTeam?.color || '#ef4444',
            color: isLightColour(leftTeam?.color || '#ef4444') ? '#000' : '#fff'
          }}>
            {setsWon?.left || 0}
          </span>
          <div className="flex flex-col items-center leading-tight">
            <span className={SB_EYEBROW}>{t('scoreboard.set', 'Set')}</span>
            <span className="text-base font-bold tabular-nums text-stone-900">{data?.set?.index || 1}</span>
          </div>
          <span className="tabular-nums" style={{
            padding: isCompactMode ? '2px 6px' : '4px 10px',
            borderRadius: '4px',
            fontSize: isCompactMode ? '12px' : '16px',
            fontWeight: 700,
            background: rightTeam?.color || '#3b82f6',
            color: isLightColour(rightTeam?.color || '#3b82f6') ? '#000' : '#fff'
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
              color: isLightColour(rightTeam.color || '#3b82f6') ? '#000' : '#fff',
              flexShrink: 0
            }}>
              {teamBLabel}
            </div>
            <span className="text-stone-900 tracking-normal" style={{
              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {(rightTeam.name || (leftisTeam1 ? 'team2' : 'team1')).replace(/\s*\([A-Z]{2,3}\)\s*$/, '')}
            </span>
          </div>
        </div>

        {/* Right: Scoresheet, Menu */}
        <div className="toolbar-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isCompactMode ? '4px' : '12px' }}>
          {/* Scoresheet dropdown menu */}
          <MenuList
            tone="light"
            buttonLabel={<FileText size={18} />}
            buttonTitle={t('header.scoresheet')}
            menuTitle={t('header.scoresheet')}
            buttonClassName={SB_TOOLBAR_BTN}
            showArrow={true}
            position="right"
            items={[
              { key: 'scoresheet-preview', icon: <Search size={18} />, label: t('header.preview'), onClick: () => openScoresheet() },
              { key: 'scoresheet-save', icon: <Save size={18} />, label: t('header.savePdf'), onClick: () => openScoresheet('save') }
            ]}
          />
          <MenuList
            tone="light"
            buttonLabel={<MenuIcon size={18} aria-hidden="true" />}
            buttonTitle={t('scoreboard.menu.menu', 'Menu')}
            menuTitle={t('scoreboard.menu.menu', 'Menu')}
            buttonClassName={SB_TOOLBAR_BTN}
            showArrow={false}
            position="right"
            items={toMenuListItems(matchMenu)}
          />
        </div>
      </ScoreboardToolbar>}

      {/* Scoresheet Error Modal */}
      {scoresheetErrorModal && (
        <Modal
          title={t('scoreboard.modals.scoresheetError')}
          open={!!scoresheetErrorModal}
          onClose={() => setScoresheetErrorModal(null)}
        >
          <div style={{ padding: '20px' }}>
            <div style={{
              color: 'var(--ov-danger-text)',
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
                background: 'var(--ov-card)',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--ov-text-secondary)',
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
                  background: 'var(--ov-success)',
                  color: '#fff',
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
                          {manageDob && <th>{t('roster.dob')}</th>}
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
                                {manageDob && <td className="roster-dob">{player.dob || '—'}</td>}
                              </>
                            ) : (
                              <td colSpan={manageDob ? 3 : 2} style={{ height: '40px' }}></td>
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
                          {manageDob && <th>{t('roster.dob')}</th>}
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
                                {manageDob && <td className="roster-dob">{player.dob || '—'}</td>}
                              </>
                            ) : (
                              <td colSpan={manageDob ? 3 : 2} style={{ height: '40px' }}></td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {(data?.match?.officials && data.match.officials.length > 0) && (
                  <div className="officials-section" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--ov-hairline)' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Match Officials</h3>
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Name</th>
                          <th>Country</th>
                          {manageDob && <th>DOB</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.match.officials.map((official, idx) => (
                          <tr key={idx}>
                            <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{official.role || '—'}</td>
                            <td>{official.lastName || ''} {official.firstName || ''}</td>
                            <td>{official.country || '—'}</td>
                            {manageDob && <td>{official.dob || '—'}</td>}
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


      {/* The phone layout (PhoneScoreboard_beach) in place of the scoring body.
          Main Scoreboard Layout - Scaled proportionally to viewport. Top-aligned:
          centred, the spare height became an empty band above the score */}
      {isPhoneView ? (
        <PhoneScoreboard {...buildPhoneView()} />
      ) : (
      <div data-testid="scoring-layout" style={{
        width: '100%',
        flex: 1,
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
            boxSizing: 'border-box',
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
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
                  color: isLightColour(leftTeam.color || '#ef4444') ? '#000' : '#fff',
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
                  const canCallTimeout = getTimeoutsUsed('left') < 1 && rallyStatus !== 'in_play' && !isRallyReplayed
                  if (canCallTimeout) {
                    handleTimeout('left')
                  }
                }}
                className="to-sub-counter"
                style={{
                  flex: 1,
                  background: getTimeoutsUsed('left') >= 1
                    ? 'rgba(239, 68, 68, 0.2)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(34, 197, 94, 0.2)'),
                  borderRadius: (isCompactMode || isShortHeight) ? '4px' : '8px',
                  padding: (isCompactMode || isShortHeight) ? '4px' : '12px',
                  textAlign: 'center',
                  border: getTimeoutsUsed('left') >= 1
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(34, 197, 94, 0.4)'),
                  cursor: getTimeoutsUsed('left') >= 1 || rallyStatus === 'in_play' || isRallyReplayed ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="to-sub-label" style={{ fontSize: (isCompactMode || isShortHeight) ? '8px' : '11px', color: 'var(--muted)', marginBottom: (isCompactMode || isShortHeight) ? '1px' : '4px' }}>{t('scoreboard.labels.to')}</div>
                <div className="to-sub-value" style={{
                  fontSize: (isCompactMode || isShortHeight) ? '14px' : '24px',
                  fontWeight: 700,
                  color: getTimeoutsUsed('left') >= 1 ? '#ef4444' : (!(rallyStatus === 'in_play' || isRallyReplayed) ? '#22c55e' : 'inherit')
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
                  {t('scoreboard.sanctions.irAndDelays')} <ChevronDown size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', transform: leftDelaysDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
                  background: '#fffbeb', // amber-50
                  border: '1px solid #fcd34d', // amber-300
                  borderRadius: '4px',
                  color: '#92400e', // amber-800 (pale yellow text was unreadable on the light screen)
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5em'
                }}>
                  {/* A real yellow card, in line with the text (OpenVolley a2d056c6) */}
                  <span
                    className="sanction-card yellow"
                    aria-hidden="true"
                    style={{ width: '0.75em', height: '1.05em', borderRadius: '0.15em', flexShrink: 0, boxShadow: '0 0 0 1px rgba(146, 64, 14, 0.25)' }}
                  />
                  <span>{t('scoreboard.sanctions.sanctionedFormalWarning')}</span>
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
              {/* Rally Status - 17% (and the "One point to switch / TTO" chip
                  under it, out of the flow: nothing moves) */}
              <div style={{ flex: '0 0 17%', textAlign: 'center', padding: `0 ${4 * scaleFactor}px`, position: 'relative' }}>
                {preEventPopup && (
                  <div data-testid="pre-event-chip" role="status" style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: `${2 * scaleFactor}px`,
                    width: 'max-content',
                    maxWidth: '100%',
                    lineHeight: 1.2,
                    background: 'var(--ov-success)',
                    color: '#fff',
                    padding: `${Math.max(4, 6 * scaleFactor)}px ${Math.max(10, 14 * scaleFactor)}px`,
                    borderRadius: '999px',
                    fontSize: `max(14px, ${DESIGN_VMIN * 0.02 * scaleFactor}px)`,
                    fontWeight: 700,
                    zIndex: 5,
                    pointerEvents: 'none'
                  }}>
                    {preEventPopup.message === 'One point to TTO'
                      ? t('scoreboard.onePointToTto', 'One point to TTO')
                      : t('scoreboard.onePointToSwitch', 'One point to switch')}
                  </div>
                )}
                <div className="font-semibold uppercase tracking-[0.12em] text-stone-500" style={{ fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>
                  {t('scoreboard.labels.rallyStatus')}
                </div>
                <div className={rallyStatus === 'in_play' ? 'text-emerald-700' : 'text-amber-700'} style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px` }}>
                  {rallyStatus === 'in_play' ? t('scoreboard.labels.inPlay') : t('scoreboard.labels.notInPlay')}
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
                <span className="text-stone-900" style={{
                  fontFamily: getScoreFont(),
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: `${DESIGN_VMIN * 0.115 * scaleFactor}px`,
                  fontWeight: 500,
                  lineHeight: 1,
                  minWidth: '1.2em',
                  textAlign: 'right',
                  display: 'inline-block'
                }}>{pointsBySide.left}</span>

                {/* Colon */}
                <span style={{
                  fontFamily: getScoreFont(),
                  fontSize: `${DESIGN_VMIN * 0.115 * scaleFactor}px`,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: '#22c55e',
                  transform: 'translateY(-0.06em)',
                  padding: '0 0.3em'
                }}>:</span>

                {/* Right Score */}
                <span className="text-stone-900" style={{
                  fontFamily: getScoreFont(),
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: `${DESIGN_VMIN * 0.115 * scaleFactor}px`,
                  fontWeight: 500,
                  lineHeight: 1,
                  minWidth: '1.2em',
                  textAlign: 'left',
                  display: 'inline-block'
                }}>{pointsBySide.right}</span>
              </div>

              {/* Last Action - 17%. minWidth 0: its one-line texts end in an
                  ellipsis; without it a long team name widened the column past
                  the window's right edge ("LAST ACTIO" cut at 1400 x 853) */}
              <div data-testid="last-action-column" style={{ flex: '0 0 17%', minWidth: 0, textAlign: 'center', padding: `0 ${4 * scaleFactor}px` }}>
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

                  // Extract structured info from the last event
                  const teamName = lastEvent.payload?.team === 'team1'
                    ? (data.team1Team?.name || 'team1')
                    : lastEvent.payload?.team === 'team2'
                      ? (data.team2Team?.name || 'team2')
                      : null

                  const teamALabel = data?.match?.coinTossTeamA === 'team1' ? 'A' : 'B'
                  const teamBLabel = data?.match?.coinTossTeamB === 'team1' ? 'A' : 'B'
                  const team1Label = data?.match?.coinTossTeamA === 'team1' ? 'A' : (data?.match?.coinTossTeamB === 'team1' ? 'B' : 'A')
                  const team2Label = data?.match?.coinTossTeamA === 'team2' ? 'A' : (data?.match?.coinTossTeamB === 'team2' ? 'B' : 'B')

                  // Calculate score at time of event
                  // First check if the event has a stored score in its payload
                  let team1Score = 0
                  let team2Score = 0
                  const storedScore = lastEvent.payload?.score || lastEvent.payload?.newScore
                  if (storedScore && storedScore.team1 !== undefined) {
                    team1Score = storedScore.team1
                    team2Score = storedScore.team2
                  } else {
                    const setIdx = lastEvent.setIndex || 1
                    const setEventsForScore = data.events?.filter(e => (e.setIndex || 1) === setIdx) || []
                    const eventIndex = setEventsForScore.findIndex(e => e.id === lastEvent.id)
                    for (let i = 0; i <= eventIndex; i++) {
                      const e = setEventsForScore[i]
                      if (e.type === 'point') {
                        // Handle BMP reversal
                        if (e.payload?.reversedTeam === 'team1') team1Score = Math.max(0, team1Score - 1)
                        else if (e.payload?.reversedTeam === 'team2') team2Score = Math.max(0, team2Score - 1)
                        if (e.payload?.team === 'team1') team1Score++
                        else if (e.payload?.team === 'team2') team2Score++
                      }
                    }
                  }
                  const scoreStr = formatCourtScore({ team1: team1Score, team2: team2Score }, { leftisTeam1, teamAKey })

                  // Determine action label
                  let actionLabel = getActionDescription(lastEvent)
                  // For structured types, extract just the action part (before the em dash)
                  const dashIdx = actionLabel.indexOf(' — ')
                  if (dashIdx !== -1) actionLabel = actionLabel.substring(0, dashIdx)

                  // Each line is one fixed line (ellipsis, the full text on
                  // hover), and the team line is always there: a description
                  // that wrapped, or a team line that came and went, made the
                  // court shrink, then grow back with the next action
                  const oneLineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25 }
                  return (
                    <div data-testid="last-action" title={[actionLabel, teamName, scoreStr].filter(Boolean).join(' · ')} style={{ minWidth: 0, maxWidth: '100%' }}>
                      <div className="font-semibold uppercase tracking-[0.12em] text-stone-500" style={{ ...oneLineStyle, fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>
                        {t('scoreboard.labels.lastAction', 'Last action')}
                      </div>
                      <div className="text-stone-900" style={{ ...oneLineStyle, fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px` }}>
                        {actionLabel}
                      </div>
                      <div style={{ ...oneLineStyle, fontSize: `${DESIGN_VMIN * 0.015 * scaleFactor}px`, color: 'var(--muted)', marginTop: `${1 * scaleFactor}px` }}>
                        {teamName || '\u00a0'}
                      </div>
                      <div className="tabular-nums" style={{ ...oneLineStyle, fontSize: `${DESIGN_VMIN * 0.015 * scaleFactor}px`, color: 'var(--muted)', marginTop: `${1 * scaleFactor}px` }}>
                        {scoreStr}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* ===== SECTION 2: Main Row (15% Toolbar | 70% Center | 15% Toolbar) - fills remaining vertical space ===== */}
            {(
              <>
                <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', flex: 1, overflow: 'hidden' }}>
                  {/* LEFT TEAM TOOLBOX - 15% */}
                  <div style={{
                    flex: '0 0 15%',
                    minWidth: 0,
                    maxWidth: '15%',
                    // the card ends with its content (it stretched to the
                    // bottom: a tall white card of empty space under the stats)
                    alignSelf: 'flex-start',
                    maxHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${6 * scaleFactor}px`,
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    background: 'var(--ov-card)',
                    border: '1px solid var(--ov-hairline-soft)',
                    boxShadow: 'var(--ov-shadow-card)',
                    borderRadius: 'var(--ov-radius-xl)',
                    padding: `${6 * scaleFactor}px`,
                    overflow: 'auto',
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
                      // Use match-level edited name → teams table name → player last names
                      const matchTeamName = leftisTeam1 ? data?.match?.team1Name : data?.match?.team2Name
                      const playerNames = matchTeamName || leftTeamData?.name || (leftPlayers || [])
                        .filter(p => p?.lastName)
                        .map(p => p.lastName)
                        .join(' / ')
                      return (
                        <div style={{
                          width: '100%',
                          background: leftTeamColor,
                          borderRadius: 'var(--ov-radius-lg)',
                          padding: `${8 * scaleFactor}px ${4 * scaleFactor}px`,
                          textAlign: 'center',
                          color: isLightColour(leftTeamColor) ? '#000' : '#fff'
                        }}>
                          <div style={{ fontSize: `${DESIGN_VMIN * 0.04 * scaleFactor}px`, fontWeight: 700, lineHeight: 1.2 }}>{leftTeamLabel}</div>
                          {playerNames && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px`, lineHeight: 1.2, wordBreak: 'break-word' }}>{playerNames.replace(/\s*\([A-Z]{2,3}\)\s*$/, '')}</div>
                          )}
                          {leftCountry && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 500, marginTop: `${2 * scaleFactor}px`, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                              <CountryFlag countryCode={leftCountry} size="xs" />
                              <span style={{ fontWeight: 700 }}>{leftCountry}</span>
                            </div>
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
                        bg = 'var(--ov-danger-soft)'
                        borderColor = '#f87171'
                        textColor = 'var(--ov-danger-text)'
                      } else if (isRallyOngoing) {
                        // Rally ongoing - gray
                        bg = 'var(--ov-sunken-strong)'
                        borderColor = 'var(--ov-hairline-strong)'
                        textColor = 'var(--ov-text-faint)'
                      } else {
                        // Available - green border/text
                        bg = 'var(--ov-card)'
                        borderColor = '#059669'
                        textColor = 'var(--ov-success)'
                      }
                      return (
                        <div style={{ display: 'flex', gap: `${4 * scaleFactor}px`, width: '100%' }}>
                          <button
                            onClick={() => handleTimeout(leftTeamKey)}
                            disabled={isRallyOngoing || toUsed >= 1}
                            style={{
                              flex: 1,
                              // a scoring action: never under 48 px, whatever the scale (volleyui §7)
                              height: `max(48px, ${DESIGN_VMIN * 0.045 * scaleFactor}px)`,
                              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                              fontWeight: 700,
                              background: bg,
                              color: textColor,
                              border: `${2 * scaleFactor}px solid ${borderColor}`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: (isRallyOngoing || toUsed >= 1) ? 'not-allowed' : 'pointer',
                              padding: `${6 * scaleFactor}px`
                            }}
                            title={t('scoreboard.timeout', 'Time-out')}
                          >{t('scoreboard.labels.to', 'TO')}</button>
                          {(() => {
                            const bmpUsed = getUnsuccessfulBMPsUsed(leftTeamKey)
                            const bmpRemaining = 2 - bmpUsed
                            const bmpExhausted = bmpRemaining <= 0
                            // only between the point and the next rally, once per completed rally (bmpAvailability_beach)
                            const bmpBlock = teamBmpBlockReason({ events: data?.events, setIndex: data?.set?.index, setFinished: !data?.set || data.set.finished, rallyStatus, remaining: bmpRemaining })
                            const bmpAvailable = !bmpBlock
                            return (
                              <button
                                onClick={() => handleTeamBMP(leftTeamKey)}
                                disabled={!bmpAvailable}
                                style={{
                                  flex: 1,
                                  // a scoring action: never under 48 px, whatever the scale (volleyui §7)
                              height: `max(48px, ${DESIGN_VMIN * 0.045 * scaleFactor}px)`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                                  fontWeight: 700,
                                  background: bmpExhausted ? 'var(--ov-danger-soft)' : (bmpAvailable ? 'var(--ov-card)' : 'var(--ov-sunken-strong)'),
                                  color: bmpExhausted ? 'var(--ov-danger-text)' : (bmpAvailable ? '#c2410c' : 'var(--ov-text-faint)'),
                                  border: `${2 * scaleFactor}px solid ${bmpExhausted ? '#f87171' : (bmpAvailable ? '#f97316' : 'var(--ov-hairline-strong)')}`,
                                  borderRadius: 'var(--ov-radius)',
                                  cursor: bmpAvailable ? 'pointer' : 'not-allowed',
                                  padding: `${6 * scaleFactor}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: `${6 * scaleFactor}px`
                                }}
                                title={bmpBlock === 'bmp_taken' ? t('scoreboard.bmpOncePerRally', 'BMP: once per rally, again after the next completed rally') : bmpBlock === 'rally' || bmpBlock === 'moved_on' || bmpBlock === 'no_point' ? t('scoreboard.bmpOnlyAfterPoint', 'BMP: only after a point, before the next rally') : t('scoreboard.bmpRemaining', { count: bmpRemaining, defaultValue: 'Ball mark protocol ({{count}} left)' })}
                              >
                                <span>BMP</span>
                                <span className="tabular-nums" style={{
                                  background: bmpExhausted ? '#b91c1c' : '#f97316',
                                  color: bmpExhausted ? '#fff' : '#1c1917',
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
                        disabled={rallyStatus === 'in_play'}
                        style={{
                          width: '100%',
                          height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                          fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                          fontWeight: 600,
                          background: 'var(--ov-card)',
                          color: 'var(--ov-text-secondary)',
                          border: `${1 * scaleFactor}px solid var(--ov-hairline-strong)`,
                          borderRadius: 'var(--ov-radius)',
                          cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                          padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box'
                        }}
                        title={t('scoreboard.sanctions.improperRequest', 'Improper request')}
                      >{t('scoreboard.sanctions.improperRequest', 'Improper request')}</button>
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
                            disabled={rallyStatus === 'in_play'}
                            style={{
                              width: '100%',
                              height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                              fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                              fontWeight: 600,
                              background: 'var(--ov-danger-soft)',
                              color: 'var(--ov-danger-text)',
                              border: `${1 * scaleFactor}px solid #fecaca`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title={t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}
                          >{t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}</button>
                        )
                      } else {
                        // Delay Warning - yellow
                        return (
                          <button
                            onClick={() => handleTeamSanction(leftTeamKey, 'delay_warning')}
                            disabled={rallyStatus === 'in_play'}
                            style={{
                              width: '100%',
                              height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                              fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                              fontWeight: 600,
                              background: 'var(--ov-warning-soft)',
                              color: 'var(--ov-warning-text)',
                              border: `${1 * scaleFactor}px solid #fcd34d`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title={t('scoreboard.sanctions.delayWarning', 'Delay warning')}
                          >{oneLine(t('scoreboard.sanctions.delayWarning', 'Delay warning'))}</button>
                        )
                      }
                    })()}
                    {/* Coach Sanction Button - only when hasCoach is enabled */}
                    {data?.match?.hasCoach && (() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const coachName = leftTeamKey === 'team1' ? data?.match?.team1CoachName : data?.match?.team2CoachName
                      return (
                        <button
                          onClick={(e) => {
                            const element = e.currentTarget
                            const rect = element.getBoundingClientRect()
                            setSanctionConfirmModal(null)
                            setSanctionDropdown({
                              team: leftTeamKey,
                              type: 'coach',
                              role: 'coach',
                              element,
                              x: rect.right + 10,
                              y: rect.top + rect.height / 2,
                              side: 'left'
                            })
                          }}
                          style={{
                            width: '100%',
                            height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                            fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                            fontWeight: 600,
                            background: '#f5f3ff',
                            color: '#6d28d9',
                            border: `${1 * scaleFactor}px solid #ddd6fe`,
                            borderRadius: 'var(--ov-radius)',
                            cursor: 'pointer',
                            padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box'
                          }}
                          title={`${t('scoreboard.coachSanction', 'Coach sanction')}${coachName ? ` – ${coachName}` : ''}`}
                        >{t('scoreboard.coach', 'Coach')}{coachName ? ` (${coachName})` : ''}</button>
                      )
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
                          <table className="tabular-nums text-stone-900" style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, tableLayout: 'fixed' }}>
                            <thead>
                              <tr className="text-stone-500" style={{ borderBottom: `${1 * scaleFactor}px solid var(--ov-hairline)` }}>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.set', 'Set')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.points', 'Points')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.wins', 'Wins')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.labels.to', 'TO')}</th>
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
                                  rowColor = won === 1 ? 'var(--ov-success)' : 'var(--ov-danger-text)'
                                }
                                return (
                                  <tr key={set.id} style={{ borderBottom: `${1 * scaleFactor}px solid var(--ov-sunken-strong)`, color: rowColor }}>
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
                    {/* Combined Sanctions Section - Title, Team Sanctions, Player Sanctions */}
                    {(() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const hasIR = data?.match?.sanctions?.[leftTeamKey === 'team1' ? 'improperRequestteam1' : 'improperRequestteam2']
                      const hasDW = data?.match?.sanctions?.[leftTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      const delayPenaltyCount = (data?.events || []).filter(e =>
                        e.type === 'sanction' && e.payload?.type === 'delay_penalty' && e.payload?.team === leftTeamKey
                      ).length
                      const playerSanctions = (data?.events || []).filter(e =>
                        e.type === 'sanction' &&
                        e.payload?.team === leftTeamKey &&
                        e.payload?.playerNumber &&
                        ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type)
                      )

                      // Check if any player has a warning (yellow card) for Formal Warning display
                      const hasPlayerWarning = playerSanctions.some(s => s.payload?.type === 'warning')

                      const hasAnySanction = hasIR || hasDW || delayPenaltyCount > 0 || playerSanctions.length > 0
                      if (!hasAnySanction) return null

                      const teamPlayers = leftTeamKey === 'team1' ? data?.team1Players : data?.team2Players
                      const player1 = teamPlayers?.[0]
                      const player2 = teamPlayers?.[1]

                      // Render sanction letter only (for alignment)
                      const renderSanctionLetter = (sanctionType) => {
                        // Official card colours, darkened to read on white
                        if (sanctionType === 'warning') {
                          return <span style={{ color: '#a16207', fontWeight: 700 }}>W</span>
                        } else if (sanctionType === 'penalty') {
                          return <span style={{ color: '#dc2626', fontWeight: 700 }}>P</span>
                        } else if (sanctionType === 'expulsion') {
                          return <span style={{ fontWeight: 700 }}><span style={{ color: '#a16207' }}>E</span><span style={{ color: '#dc2626' }}>x</span></span>
                        } else if (sanctionType === 'disqualification') {
                          return <span style={{ color: '#dc2626', fontWeight: 700 }}>D</span>
                        }
                        return null
                      }

                      const getScoreFromSanction = (sanction, teamKey) => {
                        const snapshot = sanction.stateSnapshot
                        if (!snapshot) return ''
                        // Snapshot uses pointsA/pointsB relative to teamAKey
                        const pointsA = snapshot.pointsA ?? 0
                        const pointsB = snapshot.pointsB ?? 0
                        const teamAKey = snapshot.teamAKey || 'team1'
                        // Convert to team1/team2 scores
                        const t1 = teamAKey === 'team1' ? pointsA : pointsB
                        const t2 = teamAKey === 'team1' ? pointsB : pointsA
                        // Show this team's score first
                        return teamKey === 'team1' ? `${t1}:${t2}` : `${t2}:${t1}`
                      }

                      // The team rows say when: "Delay warning · Set 2 · 3:4" (they had no set or score)
                      const teamSanctionEvents = (type) => (data?.events || [])
                        .filter(e => e.type === 'sanction' && e.payload?.team === leftTeamKey && e.payload?.type === type)
                        .sort((a, b) => (a.seq || 0) - (b.seq || 0))
                      const sanctionWhen = (ev) => ev ? ` · ${t('scoreboard.table.set', 'Set')} ${ev.setIndex} · ${getScoreFromSanction(ev, leftTeamKey)}` : ''
                      const firstWarning = playerSanctions.filter(s => s.payload?.type === 'warning').sort((a, b) => (a.seq || 0) - (b.seq || 0))[0]

                      const borderStyle = `${1 * scaleFactor}px solid var(--ov-hairline)`
                      const tableFontSize = `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                      const headerFontSize = `${DESIGN_VMIN * 0.016 * scaleFactor}px`

                      return (
                        <div style={{ marginTop: `${4 * scaleFactor}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: `${2 * scaleFactor}px` }}>
                          {/* Sanctions Title */}
                          <div className="font-bold uppercase tracking-wider text-stone-800" style={{
                            fontSize: headerFontSize,
                            padding: `${4 * scaleFactor}px 0`,
                            borderBottom: '1.5px solid var(--ov-rule)'
                          }}>
                            {t('scoreboard.sanctions.title', 'Sanctions')}
                          </div>
                          {/* Team Sanctions */}
                          {(hasIR || hasDW || delayPenaltyCount > 0 || hasPlayerWarning) && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: `${6 * scaleFactor}px`,
                              width: '100%',
                              marginTop: `${6 * scaleFactor}px`
                            }}>
                              {hasPlayerWarning && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-warning-text)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-warning-soft)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.formalWarning', 'Formal warning')}{firstWarning ? ` · #${firstWarning.payload?.playerNumber}${sanctionWhen(firstWarning)}` : ''}
                                </div>
                              )}
                              {hasIR && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-text-secondary)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-sunken-strong)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.improperRequest', 'Improper request')}{sanctionWhen(teamSanctionEvents('improper_request')[0])}
                                </div>
                              )}
                              {hasDW && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-warning-text)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-warning-soft)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.delayWarning', 'Delay warning')}{sanctionWhen(teamSanctionEvents('delay_warning')[0])}
                                </div>
                              )}
                              {delayPenaltyCount > 0 && (
                                teamSanctionEvents('delay_penalty').map((ev, i) => (
                                  <div key={i} style={{
                                    fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                    color: 'var(--ov-danger-text)',
                                    textAlign: 'center',
                                    padding: `${2 * scaleFactor}px`,
                                    background: 'var(--ov-danger-soft)',
                                    borderRadius: `${3 * scaleFactor}px`
                                  }}>
                                    {t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}{sanctionWhen(ev)}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                          {/* Player Sanctions Table */}
                          {playerSanctions.length > 0 && (
                            <table className="tabular-nums" style={{
                              width: '100%',
                              fontSize: tableFontSize,
                              borderCollapse: 'collapse',
                              color: 'var(--text)',
                              tableLayout: 'fixed',
                              border: borderStyle,
                              marginTop: `${6 * scaleFactor}px`
                            }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '20%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderRight: borderStyle, borderBottom: borderStyle }}><span className="uppercase">{t('scoreboard.table.set', 'Set')}</span></th>
                                  <th style={{ width: '40%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderRight: borderStyle, borderBottom: borderStyle }}>{player1?.number || '1'}</th>
                                  <th style={{ width: '40%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderBottom: borderStyle }}>{player2?.number || '2'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {playerSanctions.map((sanction, idx) => {
                                  const isPlayer1 = String(sanction.payload?.playerNumber) === String(player1?.number)
                                  const isPlayer2 = String(sanction.payload?.playerNumber) === String(player2?.number)
                                  const score = getScoreFromSanction(sanction, sanction.payload?.team)
                                  const isLast = idx === playerSanctions.length - 1
                                  return (
                                    <tr key={idx}>
                                      <td style={{ padding: `${4 * scaleFactor}px`, textAlign: 'center', borderRight: borderStyle, borderBottom: isLast ? 'none' : borderStyle }}>{sanction.setIndex}</td>
                                      <td style={{ padding: `${4 * scaleFactor}px`, borderRight: borderStyle, borderBottom: isLast ? 'none' : borderStyle }}>
                                        {isPlayer1 && (
                                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: `${6 * scaleFactor}px`, width: '100%' }}>
                                            {renderSanctionLetter(sanction.payload?.type)}
                                            <span>{score}</span>
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: `${4 * scaleFactor}px`, borderBottom: isLast ? 'none' : borderStyle }}>
                                        {isPlayer2 && (
                                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: `${6 * scaleFactor}px`, width: '100%' }}>
                                            {renderSanctionLetter(sanction.payload?.type)}
                                            <span>{score}</span>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* CENTER COLUMN - 70% (Court Row + Rally Controls) */}
                  <div style={{ flex: '0 0 70%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {/* Row 1: Serve Indicators + Court */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {/* LEFT SERVE INDICATOR - 10/70 = ~14.3% of center */}
                      <div style={{ flex: '0 0 14.28%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                    {leftServing && (() => {
                      const leftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                      const servingPlayer = getServingPlayer(leftTeamKey, leftTeam)
                      if (!servingPlayer || !servingPlayer.number) {
                        return (
                          <img
                            src={ballImage} onError={(e) => e.target.src = ballImage}
                            alt="Serving team"
                            style={{ ...serveBallBaseStyle, width: '100%', maxWidth: `${DESIGN_VMIN * SERVE_BOX * scaleFactor}px`, height: 'auto', aspectRatio: '1' }}
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
                            fontSize: `${DESIGN_VMIN * SERVE_LABEL * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--ov-success)',
                            textTransform: 'uppercase',
                            letterSpacing: `${0.5 * scaleFactor}px`,
                            textAlign: 'center'
                          }}>
                            {t('scoreboard.serve', 'Serve')}
                          </div>
                          <div className="tabular-nums" style={{
                            fontSize: `${DESIGN_VMIN * SERVE_NUMBER * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--ov-success)',
                            width: '90%',
                            maxWidth: `${DESIGN_VMIN * SERVE_BOX * scaleFactor}px`,
                            aspectRatio: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#ecfdf5',
                            border: `${Math.max(2, 3 * scaleFactor)}px solid #047857`,
                            borderRadius: 'var(--ov-radius-lg)',
                            boxSizing: 'border-box'
                          }}>
                            {servingPlayer.number}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                      {/* COURT - 50/70 = ~71.4% of center */}
                      <div style={{ flex: '0 0 71.43%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* 1R above court */}
                    {!isCompactMode && !isBetweenSets && (() => {
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
                            {t('scoreboard.firstRefereeShort', '1R')}: {ref1Name}
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
                        marginTop: '24px',
                        marginBottom: `${60 * scaleFactor}px`,
                        gap: '20px'
                      }}>
                        {/* Set 3 needs coin toss first */}
                        {data?.set?.index === 3 && !data?.match?.set3CoinTossWinner ? (
                          <>
                            <div className="text-stone-900 tracking-tight" style={{
                              fontSize: '24px',
                              fontWeight: 700,
                              marginBottom: '24px',
                              textAlign: 'center'
                            }}>
                              {t('scoreboard.set3CoinToss', 'Set 3 coin toss')}
                            </div>
                            {/* the toss buttons in the court's order (the team cards) */}
                            <div style={{ display: 'flex', gap: '16px' }}>
                              {(leftisTeam1 ? ['team1', 'team2'] : ['team2', 'team1']).map(key => {
                                const color = (key === 'team1' ? data?.team1Team?.color : data?.team2Team?.color) || (key === 'team1' ? '#ef4444' : '#3b82f6')
                                const label = key === teamAKey ? 'A' : 'B'
                                const name = (key === 'team1' ? (data?.team1Team?.name || data?.team1Team?.shortName) : (data?.team2Team?.name || data?.team2Team?.shortName)) || (key === 'team1' ? 'Team 1' : 'Team 2')
                                return (
                                  <button
                                    key={key}
                                    data-testid={`set3-toss-${label}`}
                                    onClick={() => handleSet3CoinToss(key)}
                                    style={{
                                      padding: '16px 24px',
                                      fontSize: '16px',
                                      fontWeight: 700,
                                      background: color,
                                      color: isLightColour(color) ? '#000' : '#fff',
                                      border: 'none',
                                      borderRadius: 'var(--ov-radius-lg)',
                                      minHeight: '56px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {label} · {name}
                                    <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px', opacity: 0.85 }}>{t('scoreboard.wonToss', 'Won the toss')}</div>
                                  </button>
                                )
                              })}
                            </div>
                            {/* Countdown and Progress bar during coin toss */}
                            {betweenSetsCountdown && (
                              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                                <div style={{
                                  width: 'min(300px, 80vw)',
                                  height: '14px',
                                  background: 'var(--ov-hairline)',
                                  borderRadius: '7px',
                                  overflow: 'hidden',
                                  margin: '0 auto 8px auto'
                                }}>
                                  <div style={{
                                    width: `${(betweenSetsCountdown.countdown / setIntervalDuration) * 100}%`,
                                    height: '100%',
                                    background: betweenSetsCountdown.countdown <= 30 ? '#dc2626' : '#059669',
                                    borderRadius: '7px',
                                    transition: betweenSetsCountdown.firstRender ? 'none' : 'width 1s linear, background 0.3s',
                                    marginLeft: 'auto'
                                  }} />
                                </div>
                                <div className="tabular-nums" style={{
                                  fontSize: '36px',
                                  fontWeight: 700,
                                  color: betweenSetsCountdown.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--ov-success)',
                                  fontFamily: getScoreFont()
                                }}>
                                  {betweenSetsCountdown.countdown <= 0 ? "0" : formatCountdown(betweenSetsCountdown.countdown)}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {/* Arrow indicator - points towards the team that chooses (set 2: the loser of the first toss; set 3: the winner of its toss) */}
                            {intervalChooserInfo && (
                              <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                marginBottom: '4px'
                              }}>
                                <svg
                                  className={intervalChooserInfo.teamKey === (leftisTeam1 ? 'team1' : 'team2') ? 'between-sets-arrow-left' : 'between-sets-arrow-right'}
                                  width="56" height="40" viewBox="0 0 56 40"
                                  style={{ filter: 'drop-shadow(0 2px 4px rgba(4, 120, 87, 0.25))' }}
                                >
                                  {intervalChooserInfo.teamKey === (leftisTeam1 ? 'team1' : 'team2') ? (
                                    <path d="M48 20H12M12 20L24 8M12 20L24 32" stroke="#059669" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                  ) : (
                                    <path d="M8 20H44M44 20L32 8M44 20L32 32" stroke="#059669" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                  )}
                                </svg>
                              </div>
                            )}

                            {/* Main row: left team's box (its serve order) | the choice | right team's box */}
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', justifyContent: 'center', alignItems: 'stretch', paddingTop: '50px', overflow: 'visible' }}>
                              {['left', 'right'].map((side) => {
                                const teamKey = (side === 'left') === leftisTeam1 ? 'team1' : 'team2'
                                const serves = getCurrentServe() === teamKey
                                const color = teamKey === 'team1' ? (data?.team1Team?.color || '#ef4444') : (data?.team2Team?.color || '#3b82f6')
                                const textColor = isLightColour(color) ? '#000' : '#fff'
                                const name = intervalTeamNames[teamKey]
                                const box = (
                                  <div key={side} data-testid={`interval-team-${side}`} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    {serves && (
                                      <img src={ballImage} onError={(e) => e.target.src = ballImage} alt="" style={{ position: 'absolute', top: '-46px', left: '50%', transform: 'translateX(-50%)', width: 43, height: 43, objectFit: 'contain' }} />
                                    )}
                                    <div style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      padding: '10px 16px',
                                      background: color,
                                      borderRadius: 'var(--ov-radius-lg)',
                                      border: serves ? '3px solid #059669' : `2px solid ${color}`,
                                      minWidth: '150px',
                                      maxWidth: '220px',
                                      height: '100%',
                                      color: textColor
                                    }}>
                                      <div style={{ fontWeight: 700, fontSize: '15px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                      <ServeOrder
                                        teamName={name}
                                        players={teamKey === 'team1' ? data?.team1Players : data?.team2Players}
                                        firstServe={teamKey === 'team1' ? data?.match?.team1FirstServe : data?.match?.team2FirstServe}
                                        onChange={() => handleBetweenSetsSwitchServiceOrder(teamKey)}
                                        textColor={textColor}
                                      />
                                    </div>
                                  </div>
                                )
                                if (side === 'left') return box
                                return [
                                  <div key="choice" style={{ display: 'flex', alignItems: 'center', width: '320px' }}>
                                    <IntervalChoice
                                      chooser={intervalChooserInfo}
                                      choice={intervalChoice}
                                      onChoose={chooseInInterval}
                                      names={intervalTeamNames}
                                      leftTeamKey={leftisTeam1 ? 'team1' : 'team2'}
                                      servingTeamKey={getCurrentServe()}
                                      onSwitchSides={handleBetweenSetsSwitchSides}
                                      onSwitchServe={handleBetweenSetsSwitchServe}
                                      onPickSide={handleIntervalPickSide}
                                      onPickServe={handleIntervalPickServe}
                                    />
                                  </div>,
                                  box
                                ]
                              })}
                            </div>

                            {/* Countdown and Progress bar */}
                            {betweenSetsCountdown && (
                              <div style={{ marginTop: '12px', marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{
                                  width: 'min(300px, 80vw)',
                                  height: '14px',
                                  background: 'var(--ov-hairline)',
                                  borderRadius: '7px',
                                  overflow: 'hidden',
                                  margin: '0 auto 8px auto'
                                }}>
                                  <div style={{
                                    width: `${(betweenSetsCountdown.countdown / setIntervalDuration) * 100}%`,
                                    height: '100%',
                                    background: betweenSetsCountdown.countdown <= 30 ? '#dc2626' : '#059669',
                                    borderRadius: '7px',
                                    transition: betweenSetsCountdown.firstRender ? 'none' : 'width 1s linear, background 0.3s',
                                    marginLeft: 'auto'
                                  }} />
                                </div>
                                <div className="tabular-nums" style={{
                                  fontSize: '36px',
                                  fontWeight: 700,
                                  color: betweenSetsCountdown.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--ov-success)',
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

                          // Get sanctions for this player - show most severe only
                          // Severity order: disqualification > expulsion > penalty > warning
                          const sanctions = getPlayerSanctions(teamKey, player.number)
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          // Count penalties in current set only (FIVB 20.3.1 - penalties reset each set)
                          const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(teamKey, player.number)
                          // Determine most severe sanction to display (penalty only shown if in current set)
                          const mostSevere = hasDisqualification ? 'disqualification' : hasExpulsion ? 'expulsion' : penaltyCountInSet > 0 ? 'penalty' : hasWarning ? 'warning' : null

                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * SERVE_BALL * scaleFactor
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
                                background: discPaintBySide.left?.background ?? leftTeam.color,
                                borderColor: discPaintBySide.left?.ring ?? undefined
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballImage}
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
                              {/* the outline belongs to the number alone: the badges stay crisp */}
                              <span className="court-player-number" style={{ fontSize: `${DESIGN_VMIN * 0.07 * scaleFactor}px`, color: discPaintBySide.left?.color, textShadow: discPaintBySide.left?.textShadow }}>{player.number}</span>
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

                              {/* Sanction cards indicator - shows most severe sanction, or 2 red cards for 2 penalties in set (FIVB 20.3.1) */}
                              {mostSevere && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset * 0.5}px`,
                                  zIndex: 10
                                }}>
                                  {mostSevere === 'penalty' && penaltyCountInSet >= 2 ? (
                                    // Two penalties in current set: first card in same position, second added to its right (FIVB 20.3.1)
                                    <>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ position: 'absolute', top: 0, left: `${positionSize * 0.9}px`, width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </>
                                  ) : mostSevere === 'expulsion' ? (
                                    // Expulsion: yellow + red overlapping
                                    <div style={{ position: 'relative', width: `${positionSize * 1.2}px`, height: `${positionSize}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        left: '0',
                                        top: '0',
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        right: '0',
                                        top: '0',
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : mostSevere === 'disqualification' ? (
                                    // Disqualification: yellow + red separated
                                    <div style={{ display: 'flex', gap: `${positionSize * 0.15}px` }}>
                                      <div className="sanction-card yellow" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </div>
                                  ) : mostSevere === 'penalty' ? (
                                    // Penalty: red only
                                    <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  ) : (
                                    // Warning: yellow only
                                    <div className="sanction-card yellow" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-50 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${17.85 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {formatCourtPlayerName(player.firstName, player.lastName)}
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

                          // Get sanctions for this player - show most severe only
                          // Severity order: disqualification > expulsion > penalty > warning
                          const sanctions = getPlayerSanctions(leftTeamKey, player.number)
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          // Count penalties in current set only (FIVB 20.3.1 - penalties reset each set)
                          const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(leftTeamKey, player.number)
                          // Determine most severe sanction to display (penalty only shown if in current set)
                          const mostSevere = hasDisqualification ? 'disqualification' : hasExpulsion ? 'expulsion' : penaltyCountInSet > 0 ? 'penalty' : hasWarning ? 'warning' : null

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
                                  src={ballImage} onError={(e) => e.target.src = ballImage}
                                  alt="Volleyball"
                                  style={{
                                    position: 'absolute',
                                    left: `${-(DESIGN_VMIN * SERVE_BALL * scaleFactor) - 12 * scaleFactor}px`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: `${DESIGN_VMIN * SERVE_BALL * scaleFactor}px`,
                                    height: `${DESIGN_VMIN * SERVE_BALL * scaleFactor}px`,
                                    zIndex: 5
                                  }}
                                />
                              )}
                              <span className="court-player-position">{player.position}</span>
                              {/* Captain indicator */}
                              {player.isCaptain && (() => {
                                return <span className="court-player-captain">C</span>
                              })()}

                              {/* Sanction cards indicator - shows most severe sanction, or 2 red cards for 2 penalties in set (FIVB 20.3.1) */}
                              {mostSevere && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: '-1.5vmin',
                                  right: '-0.75vmin',
                                  zIndex: 10
                                }}>
                                  {mostSevere === 'penalty' && penaltyCountInSet >= 2 ? (
                                    // Two penalties in current set: first card in same position, second added to its right (FIVB 20.3.1)
                                    <>
                                      <div className="sanction-card red" style={{ width: '2.1vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                      <div className="sanction-card red" style={{ position: 'absolute', top: 0, left: '2.7vmin', width: '2.1vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                    </>
                                  ) : mostSevere === 'expulsion' ? (
                                    // Expulsion: yellow + red overlapping
                                    <div style={{ position: 'relative', width: '3.6vmin', height: '3vmin' }}>
                                      <div className="sanction-card yellow" style={{
                                        width: '2vmin',
                                        height: '3vmin',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        left: '0',
                                        top: '0',
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: '1px'
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: '2vmin',
                                        height: '3vmin',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        right: '0',
                                        top: '0',
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: '1px'
                                      }}></div>
                                    </div>
                                  ) : mostSevere === 'disqualification' ? (
                                    // Disqualification: yellow + red separated
                                    <div style={{ display: 'flex', gap: '0.5vmin' }}>
                                      <div className="sanction-card yellow" style={{ width: '2vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                      <div className="sanction-card red" style={{ width: '2vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                    </div>
                                  ) : mostSevere === 'penalty' ? (
                                    // Single penalty: red only
                                    <div className="sanction-card red" style={{ width: '2.1vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                  ) : (
                                    // Warning: yellow only
                                    <div className="sanction-card yellow" style={{ width: '2.1vmin', height: '3vmin', boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: '1px' }}></div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: '-50px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '3px',
                                    padding: '1px 4px',
                                    fontSize: '15.3px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    letterSpacing: '0.3px',
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {formatCourtPlayerName(player.firstName, player.lastName)}
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

                          // Get sanctions for this player - show most severe only
                          // Severity order: disqualification > expulsion > penalty > warning
                          const sanctions = getPlayerSanctions(teamKey, player.number)
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          // Count penalties in current set only (FIVB 20.3.1 - penalties reset each set)
                          const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(teamKey, player.number)
                          // Determine most severe sanction to display (penalty only shown if in current set)
                          const mostSevere = hasDisqualification ? 'disqualification' : hasExpulsion ? 'expulsion' : penaltyCountInSet > 0 ? 'penalty' : hasWarning ? 'warning' : null

                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * SERVE_BALL * scaleFactor
                          return (
                            <div
                              key={`${teamKey}-court-front-${player.position}-${player.id || player.number || idx}`}
                              ref={player.position === 'II' ? rightCourtPositionIIRef : undefined}
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
                                background: discPaintBySide.right?.background ?? rightTeam.color,
                                borderColor: discPaintBySide.right?.ring ?? undefined
                              }}
                            >
                              {shouldShowBall && (
                                <img
                                  src={ballImage} onError={(e) => e.target.src = ballImage}
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
                              {/* the outline belongs to the number alone: the badges stay crisp */}
                              <span className="court-player-number" style={{ fontSize: `${DESIGN_VMIN * 0.07 * scaleFactor}px`, color: discPaintBySide.right?.color, textShadow: discPaintBySide.right?.textShadow }}>{player.number}</span>
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

                              {/* Sanction cards indicator - shows most severe sanction, or 2 red cards for 2 penalties in set (FIVB 20.3.1) */}
                              {mostSevere && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset * 0.5}px`,
                                  zIndex: 10
                                }}>
                                  {mostSevere === 'penalty' && penaltyCountInSet >= 2 ? (
                                    // Two penalties in current set: first card in same position, second added to its right (FIVB 20.3.1)
                                    <>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ position: 'absolute', top: 0, left: `${positionSize * 0.9}px`, width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </>
                                  ) : mostSevere === 'expulsion' ? (
                                    // Expulsion: yellow + red overlapping
                                    <div style={{ position: 'relative', width: `${positionSize * 1.2}px`, height: `${positionSize}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        left: '0',
                                        top: '0',
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        position: 'absolute',
                                        right: '0',
                                        top: '0',
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : mostSevere === 'disqualification' ? (
                                    // Disqualification: yellow + red separated
                                    <div style={{ display: 'flex', gap: `${positionSize * 0.15}px` }}>
                                      <div className="sanction-card yellow" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </div>
                                  ) : mostSevere === 'penalty' ? (
                                    // Single penalty: red only
                                    <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  ) : (
                                    // Warning: yellow only
                                    <div className="sanction-card yellow" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-50 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${17.85 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {formatCourtPlayerName(player.firstName, player.lastName)}
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

                          // Get sanctions for this player - show most severe only
                          // Severity order: disqualification > expulsion > penalty > warning
                          const sanctions = getPlayerSanctions(rightTeamKey, player.number)
                          const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                          const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                          const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                          // Count penalties in current set only (FIVB 20.3.1 - penalties reset each set)
                          const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(rightTeamKey, player.number)
                          // Determine most severe sanction to display (penalty only shown if in current set)
                          const mostSevere = hasDisqualification ? 'disqualification' : hasExpulsion ? 'expulsion' : penaltyCountInSet > 0 ? 'penalty' : hasWarning ? 'warning' : null

                          const playerSize = DESIGN_VMIN * 0.10 * scaleFactor
                          const positionSize = DESIGN_VMIN * 0.03 * scaleFactor
                          const positionOffset = DESIGN_VMIN * 0.015 * scaleFactor
                          const ballSize = DESIGN_VMIN * SERVE_BALL * scaleFactor
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
                                  src={ballImage} onError={(e) => e.target.src = ballImage}
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

                              {/* Sanction cards indicator - shows most severe sanction, or 2 red cards for 2 penalties in set (FIVB 20.3.1) */}
                              {mostSevere && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${-positionOffset}px`,
                                  right: `${-positionOffset * 0.5}px`,
                                  zIndex: 10
                                }}>
                                  {mostSevere === 'penalty' && penaltyCountInSet >= 2 ? (
                                    // Two penalties in current set: first card in same position, second added to its right (FIVB 20.3.1)
                                    <>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ position: 'absolute', top: 0, left: `${positionSize * 0.9}px`, width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </>
                                  ) : mostSevere === 'expulsion' ? (
                                    // Expulsion: yellow + red overlapping
                                    <div style={{ position: 'relative', width: `${positionSize * 1.2}px`, height: `${positionSize}px` }}>
                                      <div className="sanction-card yellow" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        border: '1px solid #000',
                                        position: 'absolute',
                                        left: '0',
                                        top: '0',
                                        transform: 'rotate(-8deg)',
                                        zIndex: 1,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                      <div className="sanction-card red" style={{
                                        width: `${positionSize * 0.65}px`,
                                        height: `${positionSize}px`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                                        border: '1px solid #000',
                                        position: 'absolute',
                                        right: '0',
                                        top: '0',
                                        transform: 'rotate(8deg)',
                                        zIndex: 2,
                                        borderRadius: `${1 * scaleFactor}px`
                                      }}></div>
                                    </div>
                                  ) : mostSevere === 'disqualification' ? (
                                    // Disqualification: yellow + red separated
                                    <div style={{ display: 'flex', gap: `${positionSize * 0.15}px` }}>
                                      <div className="sanction-card yellow" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                      <div className="sanction-card red" style={{ width: `${positionSize * 0.65}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                    </div>
                                  ) : mostSevere === 'penalty' ? (
                                    // Single penalty: red only
                                    <div className="sanction-card red" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  ) : (
                                    // Warning: yellow only
                                    <div className="sanction-card yellow" style={{ width: `${positionSize * 0.7}px`, height: `${positionSize}px`, boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid #000', borderRadius: `${1 * scaleFactor}px` }}></div>
                                  )}
                                </div>
                              )}
                              {/* Player name rectangle */}
                              {showNamesOnCourt && (player.lastName || player.firstName) && !player.isPlaceholder && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: `${-50 * scaleFactor}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'rgba(0, 0, 0, 0.85)',
                                    border: `${1 * scaleFactor}px solid rgba(255, 255, 255, 0.3)`,
                                    borderRadius: `${3 * scaleFactor}px`,
                                    padding: `${1 * scaleFactor}px ${4 * scaleFactor}px`,
                                    fontSize: `${17.85 * scaleFactor}px`,
                                    fontWeight: 600,
                                    color: '#fff',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    letterSpacing: `${0.3 * scaleFactor}px`,
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                  }}>
                                  {formatCourtPlayerName(player.firstName, player.lastName)}
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
                    {!isCompactMode && !isBetweenSets && (() => {
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
                          {t('scoreboard.secondRefereeShort', '2R')}: {ref2Name}
                        </span>
                      )
                    })()}
                  </div>
                      {/* END COURT */}

                      {/* RIGHT SERVE INDICATOR - 10/70 = ~14.3% of center */}
                      <div style={{ flex: '0 0 14.28%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
                    {rightServing && (() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const servingPlayer = getServingPlayer(rightTeamKey, rightTeam)
                      if (!servingPlayer || !servingPlayer.number) {
                        return (
                          <img
                            src={ballImage} onError={(e) => e.target.src = ballImage}
                            alt="Serving team"
                            style={{ ...serveBallBaseStyle, width: '100%', maxWidth: `${DESIGN_VMIN * SERVE_BOX * scaleFactor}px`, height: 'auto', aspectRatio: '1' }}
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
                            fontSize: `${DESIGN_VMIN * SERVE_LABEL * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--ov-success)',
                            textTransform: 'uppercase',
                            letterSpacing: `${0.5 * scaleFactor}px`,
                            textAlign: 'center'
                          }}>
                            {t('scoreboard.serve', 'Serve')}
                          </div>
                          <div className="tabular-nums" style={{
                            fontSize: `${DESIGN_VMIN * SERVE_NUMBER * scaleFactor}px`,
                            fontWeight: 700,
                            color: 'var(--ov-success)',
                            width: '90%',
                            maxWidth: `${DESIGN_VMIN * SERVE_BOX * scaleFactor}px`,
                            aspectRatio: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#ecfdf5',
                            border: `${Math.max(2, 3 * scaleFactor)}px solid #047857`,
                            borderRadius: 'var(--ov-radius-lg)',
                            boxSizing: 'border-box'
                          }}>
                            {servingPlayer.number}
                          </div>
                        </div>
                      )
                    })()}
                      </div>
                    </div>
                    {/* END Row 1: Serve Indicators + Court */}

                    {/* Row 2: Rally Controls */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      minHeight: `${(isCompactMode ? 80 : 120) * scaleFactor}px`
                    }}>
                      <div className="rally-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${Math.max(scaleFactor, RALLY_MIN_SCALE)})`, transformOrigin: 'center center', gap: '6px', marginTop: '12px' }}>
                        {/* Show timeout countdown if timeout is active */}
                        {timeoutModal && timeoutModal.started ? (
                          <div
                            onClick={stopTimeout}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopTimeout() } }}
                            title={t('scoreboard.buttons.stopTimeout', 'Stop time-out')}
                            className={cn('flex items-center gap-4 rounded-2xl border border-stone-200/70 bg-white px-5 py-4 shadow-card cursor-pointer hover:bg-stone-50 transition-colors', FOCUS_RING)}
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
                                {t('scoreboard.timeoutFor', { team: timeoutModal.team === 'team1' ? (data?.team1Team?.name || 'team1') : (data?.team2Team?.name || 'team2'), defaultValue: 'Time-out – {{team}}' })}
                              </div>
                              <div className="tabular-nums" style={{
                                fontSize: '42px',
                                fontWeight: 700,
                                color: timeoutModal.countdown <= 10 ? 'var(--ov-danger-text)' : 'var(--ov-success)',
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
                                background: 'var(--ov-hairline)',
                                borderRadius: '3px',
                                overflow: 'hidden',
                                marginTop: '8px'
                              }}>
                                <div style={{
                                  width: `${(timeoutModal.countdown / TEAM_TIMEOUT_SECONDS) * 100}%`,
                                  height: '100%',
                                  background: timeoutModal.countdown <= 10 ? '#dc2626' : '#059669',
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

                                // The interval runs (as OpenVolley): End set interval, Start set
                                // once it has ended. The countdown shows here when the setup
                                // panel (sides / serve, set 3 coin toss), which has its own, is gone.
                                if (isBetweenSets && betweenSetsCountdown && betweenSetsCountdown.countdown > 0) {
                                  const setupPanelShown = data?.set?.index === 3 ? !set3SetupConfirmed : !betweenSetsSetupConfirmed
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                      {!setupPanelShown && (<>
                                      {/* Countdown display */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div className="font-semibold uppercase tracking-[0.12em] text-stone-500" style={{
                                          fontSize: '12px'
                                        }}>
                                          {t('scoreboard.setInterval', 'Set interval')}
                                        </div>
                                        <div className="tabular-nums" style={{
                                          fontSize: '28px',
                                          fontWeight: 700,
                                          color: betweenSetsCountdown.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--ov-success)',
                                          fontFamily: getScoreFont()
                                        }}>
                                          {formatTimeout(betweenSetsCountdown.countdown)}
                                        </div>
                                      </div>
                                      {/* Progress bar */}
                                      <div style={{
                                        width: '200px',
                                        height: '6px',
                                        background: 'var(--ov-hairline)',
                                        borderRadius: '3px',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{
                                          width: `${(betweenSetsCountdown.countdown / setIntervalDuration) * 100}%`,
                                          height: '100%',
                                          background: betweenSetsCountdown.countdown <= 30 ? '#dc2626' : '#059669',
                                          borderRadius: '3px',
                                          transition: 'width 1s linear, background 0.3s'
                                        }} />
                                      </div>
                                      </>)}
                                      <button
                                        className={cn('rally-btn start', SB_RALLY_START)}
                                        onClick={endSetInterval}
                                        style={{ padding: '12px 36px', fontSize: '20px', fontWeight: 700, minHeight: 'max(64px, calc(92px * var(--scale-factor, 1)))' }}
                                      >
                                        {t('scoreboard.buttons.endSetInterval', 'End set interval')}
                                      </button>
                                    </div>
                                  )
                                }

                                // Show Start Set button if interval has ended and setup is confirmed
                                if (intervalEnded && setupConfirmed && (data?.match?.status === 'between_sets' || data?.match?.status === 'set_complete')) {
                                  return (
                                    <button
                                      className={cn('rally-btn start', SB_RALLY_START)}
                                      onClick={() => handleStartRally()}
                                      style={{ padding: '12px 36px', fontSize: '20px', fontWeight: 700, minHeight: 'max(64px, calc(92px * var(--scale-factor, 1)))' }}
                                    >
                                      {t('scoreboard.buttons.startSet', 'Start set')} {(data?.set?.index || 1)}
                                    </button>
                                  )
                                }

                                // Normal Start Rally/Set button
                                return (
                                  <button
                                    className={cn('rally-btn start', SB_RALLY_START)}
                                    onClick={() => handleStartRally()}
                                    disabled={data?.match?.status === 'complete' || set3TossPending}
                                    title={set3TossPending ? t('scoreboard.set3TossFirst', 'Record the set 3 coin toss first') : undefined}
                                    style={{ padding: '12px 36px', fontSize: '20px', fontWeight: 700, minHeight: 'max(64px, calc(92px * var(--scale-factor, 1)))' }}
                                  >
                                    {data?.match?.status === 'not_started'
                                      ? t('scoreboard.buttons.startMatch', 'Start match')
                                      : data?.match?.status === 'complete'
                                        ? t('scoreboard.buttons.matchComplete', 'Match complete')
                                        : isFirstRally
                                          ? t('scoreboard.buttons.startSet', 'Start set')
                                          : t('scoreboard.buttons.startRally', 'Start rally')}
                                  </button>
                                )
                              })()
                            ) : (
                              <>
                                {/* Row 1: Replay | Point A | Point B | Referee BMP */}
                                {/* One sizing rule for the row (rallyRowButton): the same height,
                                    text size and one-line labels, even gaps; the side buttons
                                    reserve their width while hidden (no reflow) */}
                                <div className="rally-controls-row" data-testid="rally-row" style={{ gap: '12px', alignItems: 'stretch' }}>
                                  {rallyStatus === 'in_play' ? (
                                    <button
                                      className={cn('secondary', SB_RALLY_OUTLINE)}
                                      onClick={handleReplay}
                                      style={rallyRowButton(scaleFactor, 'side')}
                                    >
                                      {t('scoreboard.buttons.replayShort', 'Replay')}
                                    </button>
                                  ) : (
                                    <div aria-hidden="true" style={{ minWidth: rallyRowButton(scaleFactor, 'side').minWidth }} />
                                  )}
                                  <button
                                    className={cn('rally-point-button tabular-nums', SB_RALLY_POINT)}
                                    onClick={() => handlePoint('left')}
                                    style={rallyRowButton(scaleFactor, 'point')}
                                  >
                                    {t('scoreboard.buttons.pointTeam', { team: teamALabel || teamAShortName })}
                                  </button>
                                  <button
                                    className={cn('rally-point-button tabular-nums', SB_RALLY_POINT)}
                                    onClick={() => handlePoint('right')}
                                    style={rallyRowButton(scaleFactor, 'point')}
                                  >
                                    {t('scoreboard.buttons.pointTeam', { team: teamBLabel || teamBShortName })}
                                  </button>
                                  <button
                                    className={SB_RALLY_BMP}
                                    onClick={handleRefereeBMP}
                                    style={rallyRowButton(scaleFactor, 'side')}
                                  >
                                    {t('scoreboard.buttons.refereeBmp', 'Referee BMP')}
                                  </button>
                                </div>
                              </>
                            )}
                            {/* Undo + Decision Change - always visible below */}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              {rallyStatus === 'idle' && canReplayRally && (
                                <button
                                  className={SB_RALLY_DECISION}
                                  onClick={handleReplay}
                                  style={{
                                    padding: '8px 15px',
                                    fontSize: '17px',
                                    minWidth: '105px'
                                  }}
                                >
                                  {t('scoreboard.buttons.decisionChange', 'Decision change')}
                                </button>
                              )}
                              <button
                                className={cn('danger', SB_RALLY_UNDO)}
                                onClick={showUndoConfirm}
                                disabled={!canUndo}
                                style={{
                                  padding: '8px 36px',
                                  fontSize: '20px',
                                  minHeight: 'max(52px, calc(60px * var(--scale-factor, 1)))',
                                  minWidth: '160px'
                                }}
                              >
                                {t('scoreboard.buttons.undo', 'Undo')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {/* END Row 2: Rally Controls */}
                  </div>
                  {/* END CENTER COLUMN (70%) */}

                  {/* RIGHT TEAM TOOLBOX - 15% */}
                  <div style={{
                    flex: '0 0 15%',
                    minWidth: 0,
                    maxWidth: '15%',
                    // the card ends with its content (it stretched to the
                    // bottom: a tall white card of empty space under the stats)
                    alignSelf: 'flex-start',
                    maxHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${6 * scaleFactor}px`,
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    background: 'var(--ov-card)',
                    border: '1px solid var(--ov-hairline-soft)',
                    boxShadow: 'var(--ov-shadow-card)',
                    borderRadius: 'var(--ov-radius-xl)',
                    padding: `${6 * scaleFactor}px`,
                    overflow: 'auto',
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
                      // Use match-level edited name → teams table name → player last names
                      const matchTeamName = leftisTeam1 ? data?.match?.team2Name : data?.match?.team1Name
                      const playerNames = matchTeamName || rightTeamData?.name || (rightPlayers || [])
                        .filter(p => p?.lastName)
                        .map(p => p.lastName)
                        .join(' / ')
                      return (
                        <div style={{
                          width: '100%',
                          background: rightTeamColor,
                          borderRadius: 'var(--ov-radius-lg)',
                          padding: `${8 * scaleFactor}px ${4 * scaleFactor}px`,
                          textAlign: 'center',
                          color: isLightColour(rightTeamColor) ? '#000' : '#fff'
                        }}>
                          <div style={{ fontSize: `${DESIGN_VMIN * 0.04 * scaleFactor}px`, fontWeight: 700, lineHeight: 1.2 }}>{rightTeamLabel}</div>
                          {playerNames && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 600, marginTop: `${2 * scaleFactor}px`, lineHeight: 1.2, wordBreak: 'break-word' }}>{playerNames.replace(/\s*\([A-Z]{2,3}\)\s*$/, '')}</div>
                          )}
                          {rightCountry && (
                            <div style={{ fontSize: `${DESIGN_VMIN * 0.02 * scaleFactor}px`, fontWeight: 500, marginTop: `${2 * scaleFactor}px`, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                              <CountryFlag countryCode={rightCountry} size="xs" />
                              <span style={{ fontWeight: 700 }}>{rightCountry}</span>
                            </div>
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
                        bg = 'var(--ov-danger-soft)'
                        borderColor = '#f87171'
                        textColor = 'var(--ov-danger-text)'
                      } else if (isRallyOngoing) {
                        // Rally ongoing - gray
                        bg = 'var(--ov-sunken-strong)'
                        borderColor = 'var(--ov-hairline-strong)'
                        textColor = 'var(--ov-text-faint)'
                      } else {
                        // Available - green border/text
                        bg = 'var(--ov-card)'
                        borderColor = '#059669'
                        textColor = 'var(--ov-success)'
                      }
                      return (
                        <div style={{ display: 'flex', gap: `${4 * scaleFactor}px`, width: '100%' }}>
                          <button
                            onClick={() => handleTimeout(rightTeamKey)}
                            disabled={isRallyOngoing || toUsed >= 1}
                            style={{
                              flex: 1,
                              // a scoring action: never under 48 px, whatever the scale (volleyui §7)
                              height: `max(48px, ${DESIGN_VMIN * 0.045 * scaleFactor}px)`,
                              fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                              fontWeight: 700,
                              background: bg,
                              color: textColor,
                              border: `${2 * scaleFactor}px solid ${borderColor}`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: (isRallyOngoing || toUsed >= 1) ? 'not-allowed' : 'pointer',
                              padding: `${6 * scaleFactor}px`
                            }}
                            title={t('scoreboard.timeout', 'Time-out')}
                          >{t('scoreboard.labels.to', 'TO')}</button>
                          {(() => {
                            const bmpUsed = getUnsuccessfulBMPsUsed(rightTeamKey)
                            const bmpRemaining = 2 - bmpUsed
                            const bmpExhausted = bmpRemaining <= 0
                            // only between the point and the next rally, once per completed rally (bmpAvailability_beach)
                            const bmpBlock = teamBmpBlockReason({ events: data?.events, setIndex: data?.set?.index, setFinished: !data?.set || data.set.finished, rallyStatus, remaining: bmpRemaining })
                            const bmpAvailable = !bmpBlock
                            return (
                              <button
                                onClick={() => handleTeamBMP(rightTeamKey)}
                                disabled={!bmpAvailable}
                                style={{
                                  flex: 1,
                                  // a scoring action: never under 48 px, whatever the scale (volleyui §7)
                              height: `max(48px, ${DESIGN_VMIN * 0.045 * scaleFactor}px)`,
                                  fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`,
                                  fontWeight: 700,
                                  background: bmpExhausted ? 'var(--ov-danger-soft)' : (bmpAvailable ? 'var(--ov-card)' : 'var(--ov-sunken-strong)'),
                                  color: bmpExhausted ? 'var(--ov-danger-text)' : (bmpAvailable ? '#c2410c' : 'var(--ov-text-faint)'),
                                  border: `${2 * scaleFactor}px solid ${bmpExhausted ? '#f87171' : (bmpAvailable ? '#f97316' : 'var(--ov-hairline-strong)')}`,
                                  borderRadius: 'var(--ov-radius)',
                                  cursor: bmpAvailable ? 'pointer' : 'not-allowed',
                                  padding: `${6 * scaleFactor}px`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: `${6 * scaleFactor}px`
                                }}
                                title={bmpBlock === 'bmp_taken' ? t('scoreboard.bmpOncePerRally', 'BMP: once per rally, again after the next completed rally') : bmpBlock === 'rally' || bmpBlock === 'moved_on' || bmpBlock === 'no_point' ? t('scoreboard.bmpOnlyAfterPoint', 'BMP: only after a point, before the next rally') : t('scoreboard.bmpRemaining', { count: bmpRemaining, defaultValue: 'Ball mark protocol ({{count}} left)' })}
                              >
                                <span>BMP</span>
                                <span className="tabular-nums" style={{
                                  background: bmpExhausted ? '#b91c1c' : '#f97316',
                                  color: bmpExhausted ? '#fff' : '#1c1917',
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
                        disabled={rallyStatus === 'in_play'}
                        style={{
                          width: '100%',
                          height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                          fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                          fontWeight: 600,
                          background: 'var(--ov-card)',
                          color: 'var(--ov-text-secondary)',
                          border: `${1 * scaleFactor}px solid var(--ov-hairline-strong)`,
                          borderRadius: 'var(--ov-radius)',
                          cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                          padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box'
                        }}
                        title={t('scoreboard.sanctions.improperRequest', 'Improper request')}
                      >{t('scoreboard.sanctions.improperRequest', 'Improper request')}</button>
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
                            disabled={rallyStatus === 'in_play'}
                            style={{
                              width: '100%',
                              height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                              fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                              fontWeight: 600,
                              background: 'var(--ov-danger-soft)',
                              color: 'var(--ov-danger-text)',
                              border: `${1 * scaleFactor}px solid #fecaca`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title={t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}
                          >{t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}</button>
                        )
                      } else {
                        // Delay Warning - yellow
                        return (
                          <button
                            onClick={() => handleTeamSanction(rightTeamKey, 'delay_warning')}
                            disabled={rallyStatus === 'in_play'}
                            style={{
                              width: '100%',
                              height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                              fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                              fontWeight: 600,
                              background: 'var(--ov-warning-soft)',
                              color: 'var(--ov-warning-text)',
                              border: `${1 * scaleFactor}px solid #fcd34d`,
                              borderRadius: 'var(--ov-radius)',
                              cursor: rallyStatus === 'in_play' ? 'not-allowed' : 'pointer',
                              padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box'
                            }}
                            title={t('scoreboard.sanctions.delayWarning', 'Delay warning')}
                          >{oneLine(t('scoreboard.sanctions.delayWarning', 'Delay warning'))}</button>
                        )
                      }
                    })()}
                    {/* Coach Sanction Button - only when hasCoach is enabled (right team) */}
                    {data?.match?.hasCoach && (() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const coachName = rightTeamKey === 'team1' ? data?.match?.team1CoachName : data?.match?.team2CoachName
                      return (
                        <button
                          onClick={(e) => {
                            const element = e.currentTarget
                            const rect = element.getBoundingClientRect()
                            setSanctionConfirmModal(null)
                            setSanctionDropdown({
                              team: rightTeamKey,
                              type: 'coach',
                              role: 'coach',
                              element,
                              x: rect.left - 10,
                              y: rect.top + rect.height / 2,
                              side: 'right'
                            })
                          }}
                          style={{
                            width: '100%',
                            height: `max(44px, ${DESIGN_VMIN * 0.028 * scaleFactor}px)`,
                            fontSize: `max(12px, ${DESIGN_VMIN * 0.016 * scaleFactor}px)`,
                            fontWeight: 600,
                            background: '#f5f3ff',
                            color: '#6d28d9',
                            border: `${1 * scaleFactor}px solid #ddd6fe`,
                            borderRadius: 'var(--ov-radius)',
                            cursor: 'pointer',
                            padding: `${2 * scaleFactor}px ${4 * scaleFactor}px`,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box'
                          }}
                          title={`${t('scoreboard.coachSanction', 'Coach sanction')}${coachName ? ` – ${coachName}` : ''}`}
                        >{t('scoreboard.coach', 'Coach')}{coachName ? ` (${coachName})` : ''}</button>
                      )
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
                          <table className="tabular-nums text-stone-900" style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${DESIGN_VMIN * 0.018 * scaleFactor}px`, tableLayout: 'fixed' }}>
                            <thead>
                              <tr className="text-stone-500" style={{ borderBottom: `${1 * scaleFactor}px solid var(--ov-hairline)` }}>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.set', 'Set')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.points', 'Points')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.table.wins', 'Wins')}</th>
                                <th className="font-bold uppercase tracking-wide" style={{ padding: `${1 * scaleFactor}px`, textAlign: 'center', fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px` }}>{t('scoreboard.labels.to', 'TO')}</th>
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
                                  rowColor = won === 1 ? 'var(--ov-success)' : 'var(--ov-danger-text)'
                                }
                                return (
                                  <tr key={set.id} style={{ borderBottom: `${1 * scaleFactor}px solid var(--ov-sunken-strong)`, color: rowColor }}>
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
                    {/* Combined Sanctions Section - Title, Team Sanctions, Player Sanctions */}
                    {(() => {
                      const rightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                      const hasIR = data?.match?.sanctions?.[rightTeamKey === 'team1' ? 'improperRequestteam1' : 'improperRequestteam2']
                      const hasDW = data?.match?.sanctions?.[rightTeamKey === 'team1' ? 'delayWarningteam1' : 'delayWarningteam2']
                      const delayPenaltyCount = (data?.events || []).filter(e =>
                        e.type === 'sanction' && e.payload?.type === 'delay_penalty' && e.payload?.team === rightTeamKey
                      ).length
                      const playerSanctions = (data?.events || []).filter(e =>
                        e.type === 'sanction' &&
                        e.payload?.team === rightTeamKey &&
                        e.payload?.playerNumber &&
                        ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type)
                      )

                      // Check if any player has a warning (yellow card) for Formal Warning display
                      const hasPlayerWarning = playerSanctions.some(s => s.payload?.type === 'warning')

                      const hasAnySanction = hasIR || hasDW || delayPenaltyCount > 0 || playerSanctions.length > 0
                      if (!hasAnySanction) return null

                      const teamPlayers = rightTeamKey === 'team1' ? data?.team1Players : data?.team2Players
                      const player1 = teamPlayers?.[0]
                      const player2 = teamPlayers?.[1]

                      // Render sanction letter only (for alignment)
                      const renderSanctionLetter = (sanctionType) => {
                        // Official card colours, darkened to read on white
                        if (sanctionType === 'warning') {
                          return <span style={{ color: '#a16207', fontWeight: 700 }}>W</span>
                        } else if (sanctionType === 'penalty') {
                          return <span style={{ color: '#dc2626', fontWeight: 700 }}>P</span>
                        } else if (sanctionType === 'expulsion') {
                          return <span style={{ fontWeight: 700 }}><span style={{ color: '#a16207' }}>E</span><span style={{ color: '#dc2626' }}>x</span></span>
                        } else if (sanctionType === 'disqualification') {
                          return <span style={{ color: '#dc2626', fontWeight: 700 }}>D</span>
                        }
                        return null
                      }

                      const getScoreFromSanction = (sanction, teamKey) => {
                        const snapshot = sanction.stateSnapshot
                        if (!snapshot) return ''
                        // Snapshot uses pointsA/pointsB relative to teamAKey
                        const pointsA = snapshot.pointsA ?? 0
                        const pointsB = snapshot.pointsB ?? 0
                        const teamAKey = snapshot.teamAKey || 'team1'
                        // Convert to team1/team2 scores
                        const t1 = teamAKey === 'team1' ? pointsA : pointsB
                        const t2 = teamAKey === 'team1' ? pointsB : pointsA
                        // Show this team's score first
                        return teamKey === 'team1' ? `${t1}:${t2}` : `${t2}:${t1}`
                      }

                      // The team rows say when: "Delay warning · Set 2 · 3:4" (they had no set or score)
                      const teamSanctionEvents = (type) => (data?.events || [])
                        .filter(e => e.type === 'sanction' && e.payload?.team === rightTeamKey && e.payload?.type === type)
                        .sort((a, b) => (a.seq || 0) - (b.seq || 0))
                      const sanctionWhen = (ev) => ev ? ` · ${t('scoreboard.table.set', 'Set')} ${ev.setIndex} · ${getScoreFromSanction(ev, rightTeamKey)}` : ''
                      const firstWarning = playerSanctions.filter(s => s.payload?.type === 'warning').sort((a, b) => (a.seq || 0) - (b.seq || 0))[0]

                      const borderStyle = `${1 * scaleFactor}px solid var(--ov-hairline)`
                      const tableFontSize = `${DESIGN_VMIN * 0.018 * scaleFactor}px`
                      const headerFontSize = `${DESIGN_VMIN * 0.016 * scaleFactor}px`

                      return (
                        <div style={{ marginTop: `${4 * scaleFactor}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: `${2 * scaleFactor}px` }}>
                          {/* Sanctions Title */}
                          <div className="font-bold uppercase tracking-wider text-stone-800" style={{
                            fontSize: headerFontSize,
                            padding: `${4 * scaleFactor}px 0`,
                            borderBottom: '1.5px solid var(--ov-rule)'
                          }}>
                            {t('scoreboard.sanctions.title', 'Sanctions')}
                          </div>
                          {/* Team Sanctions */}
                          {(hasIR || hasDW || delayPenaltyCount > 0 || hasPlayerWarning) && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: `${6 * scaleFactor}px`,
                              width: '100%',
                              marginTop: `${6 * scaleFactor}px`
                            }}>
                              {hasPlayerWarning && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-warning-text)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-warning-soft)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.formalWarning', 'Formal warning')}{firstWarning ? ` · #${firstWarning.payload?.playerNumber}${sanctionWhen(firstWarning)}` : ''}
                                </div>
                              )}
                              {hasIR && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-text-secondary)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-sunken-strong)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.improperRequest', 'Improper request')}{sanctionWhen(teamSanctionEvents('improper_request')[0])}
                                </div>
                              )}
                              {hasDW && (
                                <div style={{
                                  fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                  color: 'var(--ov-warning-text)',
                                  textAlign: 'center',
                                  padding: `${2 * scaleFactor}px`,
                                  background: 'var(--ov-warning-soft)',
                                  borderRadius: `${3 * scaleFactor}px`
                                }}>
                                  {t('scoreboard.sanctions.delayWarning', 'Delay warning')}{sanctionWhen(teamSanctionEvents('delay_warning')[0])}
                                </div>
                              )}
                              {delayPenaltyCount > 0 && (
                                teamSanctionEvents('delay_penalty').map((ev, i) => (
                                  <div key={i} style={{
                                    fontSize: `${DESIGN_VMIN * 0.014 * scaleFactor}px`,
                                    color: 'var(--ov-danger-text)',
                                    textAlign: 'center',
                                    padding: `${2 * scaleFactor}px`,
                                    background: 'var(--ov-danger-soft)',
                                    borderRadius: `${3 * scaleFactor}px`
                                  }}>
                                    {t('scoreboard.sanctions.delayPenalty', 'Delay penalty')}{sanctionWhen(ev)}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                          {/* Player Sanctions Table - 3 columns: SET, Player 1, Player 2 with flex layout */}
                          {playerSanctions.length > 0 && (
                            <table className="tabular-nums" style={{
                              width: '100%',
                              fontSize: tableFontSize,
                              borderCollapse: 'collapse',
                              color: 'var(--text)',
                              tableLayout: 'fixed',
                              border: borderStyle,
                              marginTop: `${6 * scaleFactor}px`
                            }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '20%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderRight: borderStyle, borderBottom: borderStyle }}><span className="uppercase">{t('scoreboard.table.set', 'Set')}</span></th>
                                  <th style={{ width: '40%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderRight: borderStyle, borderBottom: borderStyle }}>{player1?.number || '1'}</th>
                                  <th style={{ width: '40%', padding: `${4 * scaleFactor}px`, textAlign: 'center', fontWeight: 600, fontSize: headerFontSize, borderBottom: borderStyle }}>{player2?.number || '2'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {playerSanctions.map((sanction, idx) => {
                                  const isPlayer1 = String(sanction.payload?.playerNumber) === String(player1?.number)
                                  const isPlayer2 = String(sanction.payload?.playerNumber) === String(player2?.number)
                                  const score = getScoreFromSanction(sanction, sanction.payload?.team)
                                  const isLast = idx === playerSanctions.length - 1
                                  return (
                                    <tr key={idx}>
                                      <td style={{ padding: `${4 * scaleFactor}px`, textAlign: 'center', borderRight: borderStyle, borderBottom: isLast ? 'none' : borderStyle }}>{sanction.setIndex}</td>
                                      <td style={{ padding: `${4 * scaleFactor}px`, borderRight: borderStyle, borderBottom: isLast ? 'none' : borderStyle }}>
                                        {isPlayer1 && (
                                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: `${6 * scaleFactor}px`, width: '100%' }}>
                                            {renderSanctionLetter(sanction.payload?.type)}
                                            <span>{score}</span>
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: `${4 * scaleFactor}px`, borderBottom: isLast ? 'none' : borderStyle }}>
                                        {isPlayer2 && (
                                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: `${6 * scaleFactor}px`, width: '100%' }}>
                                            {renderSanctionLetter(sanction.payload?.type)}
                                            <span>{score}</span>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
                {/* END SECTION 2 - Main Row with Toolbars and Center */}
              </>
            )}
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
                  color: isLightColour(rightTeam.color || '#3b82f6') ? '#000' : '#fff',
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
                  const canCallTimeout = getTimeoutsUsed('right') < 1 && rallyStatus !== 'in_play' && !isRallyReplayed
                  if (canCallTimeout) {
                    handleTimeout('right')
                  }
                }}
                className="to-sub-counter"
                style={{
                  flex: 1,
                  background: getTimeoutsUsed('right') >= 1
                    ? 'rgba(239, 68, 68, 0.2)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(34, 197, 94, 0.2)'),
                  borderRadius: (isCompactMode || isShortHeight) ? '4px' : '8px',
                  padding: (isCompactMode || isShortHeight) ? '4px' : '12px',
                  textAlign: 'center',
                  border: getTimeoutsUsed('right') >= 1
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : (rallyStatus === 'in_play' || isRallyReplayed
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(34, 197, 94, 0.4)'),
                  cursor: getTimeoutsUsed('right') >= 1 || rallyStatus === 'in_play' || isRallyReplayed ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="to-sub-label" style={{ fontSize: (isCompactMode || isShortHeight) ? '8px' : '11px', color: 'var(--muted)', marginBottom: (isCompactMode || isShortHeight) ? '1px' : '4px' }}>{t('scoreboard.labels.to')}</div>
                <div className="to-sub-value" style={{
                  fontSize: (isCompactMode || isShortHeight) ? '14px' : '24px',
                  fontWeight: 700,
                  color: getTimeoutsUsed('right') >= 1 ? '#ef4444' : (!(rallyStatus === 'in_play' || isRallyReplayed) ? '#22c55e' : 'inherit')
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
                  {t('scoreboard.sanctions.irAndDelays')} <ChevronDown size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', transform: rightDelaysDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
                  background: '#fffbeb', // amber-50
                  border: '1px solid #fcd34d', // amber-300
                  borderRadius: '4px',
                  color: '#92400e', // amber-800 (pale yellow text was unreadable on the light screen)
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5em'
                }}>
                  {/* A real yellow card, in line with the text (OpenVolley a2d056c6) */}
                  <span
                    className="sanction-card yellow"
                    aria-hidden="true"
                    style={{ width: '0.75em', height: '1.05em', borderRadius: '0.15em', flexShrink: 0, boxShadow: '0 0 0 1px rgba(146, 64, 14, 0.25)' }}
                  />
                  <span>{t('scoreboard.sanctions.sanctionedFormalWarning')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* The phone layout's match menu: the toolbar's Menu, as a sheet */}
      {phoneMenuOpen && (
        <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
          <ActionSheet open onClose={() => setPhoneMenuOpen(false)} title={t('scoreboard.menu.menu', 'Menu')} closeLabel={t('common.close', 'Close')} railOffset={false}>
            {matchMenu.map(section => (
              <div key={section.key} role="group" aria-label={section.title} className={section.danger ? 'mt-1 border-t border-stone-100 pt-1' : undefined}>
                <p className={cn('m-0 px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]', section.danger ? 'text-red-600' : 'text-stone-500')}>
                  {section.title}
                </p>
                {section.items.map(item => (
                  <ActionSheetItem
                    key={item.key}
                    icon={item.Icon}
                    className={item.danger ? 'text-red-600 hover:bg-red-50' : undefined}
                    onClick={() => {
                      setPhoneMenuOpen(false)
                      item.onClick()
                    }}
                  >
                    {item.label}
                  </ActionSheetItem>
                ))}
              </div>
            ))}
          </ActionSheet>
        </div>
      )}

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
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowLogs(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showActionLog', 'Show Action Log')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowSanctions(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showSanctionsResults', 'Show Sanctions and Results')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowManualPanel(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.manualChanges', 'Manual Changes')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowRemarks(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.openRemarksRecording', 'Open Remarks Recording')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowRosters(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.showRosters')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowPinsModal(true)
                  setMenuModal(false)
                }}>
                {t('scoreboard.menu.showPins', 'Show PINs')}
              </div>
              {onOpenMatchSetup && (
                <div style={{
                  background: 'var(--ov-sunken)',
                  border: '1px solid var(--ov-hairline)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                    e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--ov-sunken)'
                    e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                  }}
                  onClick={() => {
                    onOpenMatchSetup()
                    setMenuModal(false)
                  }}>
                  {t('scoreboard.menu.showMatchSetup', 'Show Match Setup')}
                </div>
              )}

              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px',
                borderTop: '1px solid var(--ov-hairline)'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
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
                <Download /> {t('scoreboard.menu.downloadGameData', 'Download Game Data (JSON)')}
              </div>
              <div style={{
                background: 'var(--ov-sunken)',
                border: '1px solid var(--ov-hairline)',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px',
                borderTop: '1px solid var(--ov-hairline)'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--ov-sunken)'
                  e.currentTarget.style.borderColor = 'var(--ov-hairline)'
                }}
                onClick={() => {
                  setShowOptionsInMenu(true)
                }}>
                <Settings /> {t('scoreboard.menu.options', 'Options')}
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
              {/* None to show (always so for a test match): say why, not a blank card */}
              {!(
                (data?.match?.refereePin && data?.match?.refereeConnectionEnabled === true) ||
                data?.match?.gamePin ||
                ((data?.match?.team1Pin ?? data?.match?.team1TeamPin) && data?.match?.team1TeamConnectionEnabled === true) ||
                ((data?.match?.team2Pin ?? data?.match?.team2TeamPin) && data?.match?.team2TeamConnectionEnabled === true)
              ) && (
                <p className="ov-kit m-0 py-6 text-center text-sm text-stone-500" data-testid="pins-empty">
                  {data?.match?.test
                    ? t('scoreboard.pinsEmptyTest', 'No PINs: a test match has no referee or team connection.')
                    : t('scoreboard.pinsEmpty', 'No PINs yet: switch on the referee or a team connection in the connection setup.')}
                </p>
              )}
              {/* Referee PIN */}
              {data?.match?.refereePin && data?.match?.refereeConnectionEnabled === true && (
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  width: '100%'
                }}>
                  <div style={{
                    background: 'var(--ov-sunken)',
                    border: '1px solid var(--ov-hairline)',
                    borderRadius: '8px',
                    padding: '16px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    minWidth: 0
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{t('scoreboard.refereePin', 'Referee PIN')}</div>
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
                    background: 'var(--ov-sunken)',
                    border: '1px solid var(--ov-hairline)',
                    borderRadius: '8px',
                    padding: '16px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    minWidth: 0
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{t('scoreboard.gamePin', 'Game PIN')}</div>
                    <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                      {String(data.match.gamePin).padStart(6, '0')}
                    </div>
                  </div>
                </div>
              )}

              {/* Team Dashboard PINs - Same row (50/50) */}
              {(((data?.match?.team1Pin ?? data?.match?.team1TeamPin) && data?.match?.team1TeamConnectionEnabled === true) ||
                ((data?.match?.team2Pin ?? data?.match?.team2TeamPin) && data?.match?.team2TeamConnectionEnabled === true)) && (
                  <div style={{
                    display: 'flex',
                    gap: '16px',
                    width: '100%'
                  }}>
                    {(data?.match?.team1Pin ?? data?.match?.team1TeamPin) && data?.match?.team1TeamConnectionEnabled === true && (
                      <div style={{
                        background: 'var(--ov-sunken)',
                        border: '1px solid var(--ov-hairline)',
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
                          {t('scoreboard.teamPin', { team: data?.team1Team?.name || t('common.team1', 'Team 1'), defaultValue: '{{team}} PIN' })}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                          {String(data.match.team1Pin ?? data.match.team1TeamPin).padStart(6, '0')}
                        </div>
                      </div>
                    )}

                    {(data?.match?.team2Pin ?? data?.match?.team2TeamPin) && data?.match?.team2TeamConnectionEnabled === true && (
                      <div style={{
                        background: 'var(--ov-sunken)',
                        border: '1px solid var(--ov-hairline)',
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
                          {t('scoreboard.teamPin', { team: data?.team2Team?.name || t('common.team2', 'Team 2'), defaultValue: '{{team}} PIN' })}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '2px', wordBreak: 'break-all' }}>
                          {String(data.match.team2Pin ?? data.match.team2TeamPin).padStart(6, '0')}
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
          scoreFont,
          setScoreFont,
          keybindingsEnabled,
          setKeybindingsEnabled
        }}
        displayOptions={{
          displayMode,
          setDisplayMode,
          detectedDisplayMode,
          enterDisplayMode,
          exitDisplayMode,
          showNamesOnCourt,
          setShowNamesOnCourt,
          autoDownloadAtSetEnd,
          setAutoDownloadAtSetEnd,
          alwaysDownloadAtSetEnd,
          setAlwaysDownloadAtSetEnd
        }}
        matchId={matchId}
      />

      {/* Scoreboard Guide Modal */}


      {/* Connection Setup Modal */}
      <ConnectionSetupModal
        open={connectionSetupModal}
        onClose={() => setConnectionSetupModal(false)}
        matchId={matchId}
        matchSeedKey={data?.match?.seed_key}
        match={data?.match}
        refereePin={data?.match?.refereePin}
        team1Pin={(data?.match?.team1Pin ?? data?.match?.team1TeamPin)}
        team2Pin={(data?.match?.team2Pin ?? data?.match?.team2TeamPin)}
        gameNumber={data?.match?.gameNumber}
      />


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
                placeholder={t('scoreboard.menu.searchEvents')}
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  background: 'var(--ov-sunken-strong)',
                  border: '1px solid var(--ov-hairline-strong)',
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
                        borderBottom: '2px solid var(--ov-hairline-strong)',
                        background: 'var(--ov-sunken)'
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
                                  borderBottom: '1px solid var(--ov-hairline)',
                                  transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--ov-sunken)'
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
            <div style={{ marginBottom: '16px' }}><CorrectionsPanel mode="live" matchId={matchId} events={data?.events} match={data?.match} sets={data?.sets} team1Team={data?.team1Team} team2Team={data?.team2Team} team1Players={data?.team1Players} team2Players={data?.team2Players} liveSetIndex={data?.set?.index ?? null} hooks={{ notifyScoresheetUpdate: refreshScoresheet, syncToReferee, syncLiveState: () => syncLiveStateToSupabase('manual_score_update') }} /></div>
            {/* Collapsible Section: Current Set */}
            <div style={{
              marginBottom: '12px',
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px', display: 'inline-flex' }}><Zap size={18} aria-hidden="true" /></span>
                  {t('scoreboard.manual.currentSet')}
                </span>
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.currentSet ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {manualPanelExpandedSections.currentSet && (
                <div style={{ padding: '0 16px 16px 16px' }}>
                  {data?.match && (() => {
                    // Calculate which team is on which side based on set index and overrides
                    const currentSetIndex = data.set?.index || 1
                    const sideA = leftTeamInSet(currentSetIndex, data.match) === 'A' ? 'left' : 'right'

                    // If Team A is on left, and Team A is team1, then team1 is on left
                    const leftisTeam1 = sideA === 'left' ? (teamAKey === 'team1') : (teamAKey !== 'team1')
                    const rightIsTeam1 = !leftisTeam1

                    // Who serves first in this set (set 3: its own toss)
                    const servingTeam = setFirstServer(data.match, currentSetIndex)
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
                            borderBottom: '1px solid var(--ov-hairline)'
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{t('scoreboard.manual.teamsSetup')}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                            {t('scoreboard.manual.teamsSetupHint')}
                          </div>

                          {/* Visual Court Representation */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '16px',
                            background: 'var(--ov-sunken)',
                            borderRadius: '12px',
                            border: '1px solid var(--ov-hairline)'
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
                              color: isLightColour(leftTeamColor) ? '#000' : '#fff'
                            }}>
                              {leftIsServing && <span style={{ fontSize: '20px' }}><Volleyball /></span>}
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{leftTeamName}</div>
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>{leftisTeam1 ? 'Team 1' : 'Team 2'}</div>
                              </div>
                            </div>

                            {/* Net divider */}
                            <div style={{
                              width: '4px',
                              height: '60px',
                              background: 'var(--ov-hairline)',
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
                              color: isLightColour(rightTeamColor) ? '#000' : '#fff'
                            }}>
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{rightTeamName}</div>
                                <div style={{ fontSize: '10px', opacity: 0.8 }}>{rightIsTeam1 ? 'TEAM 1' : 'TEAM 2'}</div>
                              </div>
                              {rightIsServing && <span style={{ fontSize: '20px' }}><Volleyball /></span>}
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

                                const currentLeftAB = leftTeamInSet(setIdx, data.match)
                                const newLeftAB = currentLeftAB === 'A' ? 'B' : 'A'
                                const update = switchSidesUpdate(setIdx, data.match, { beforeSetStart: true })
                                const oldLeft = getTeamLabel(currentLeftAB)
                                const newLeft = getTeamLabel(newLeftAB)
                                await db.matches.update(matchId, update)
                                if (data.match?.seed_key && !data.match.test) {
                                  db.sync_queue.add({
                                    resource: 'match',
                                    action: 'update',
                                    payload: { id: data.match.seed_key, ...update },
                                    ts: new Date().toISOString(),
                                    status: 'queued'
                                  })
                                }
                                logManualChange('Teams Setup', 'Court Sides', `${oldLeft} on left`, `${newLeft} on left`, `Switched court sides (Set ${setIdx})`)
                                syncLiveStateToSupabase('manual_side_change', null, { oldSide: oldLeft, newSide: newLeft })
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              <ArrowLeftRight /> {t('scoreboard.manual.switchSides')}
                            </button>
                            <button
                              className="secondary"
                              onClick={async () => {
                                // Swap Team A and Team B identity (coinTossTeamA). Only the
                                // labels change: nothing moves on the court, the same team
                                // serves first, here and in the cloud coin toss; the A/B
                                // sides follow the labels (coinToss_beach)
                                const currentTeamA = data.match.coinTossTeamA || 'team1'
                                const patch = swapTeamDesignation(data.match)
                                const newTeamA = patch.coinTossTeamA

                                await db.matches.update(matchId, patch)

                                if (data.match?.seed_key && !data.match.test) {
                                  await db.sync_queue.add({
                                    resource: 'match',
                                    action: 'update',
                                    payload: {
                                      id: data.match.seed_key,
                                      coin_toss: coinTossCloud({ ...data.match, ...patch })
                                    },
                                    ts: new Date().toISOString(),
                                    status: 'queued'
                                  })
                                }

                                const oldA = currentTeamA === 'team1' ? (data.team1Team?.shortName || 'Team 1') : (data.team2Team?.shortName || 'Team 2')
                                const newA = newTeamA === 'team1' ? (data.team1Team?.shortName || 'Team 1') : (data.team2Team?.shortName || 'Team 2')
                                logManualChange('Teams Setup', 'Team A/B', `A=${oldA}`, `A=${newA}`, `Swapped Team A and Team B`)
                                syncLiveStateToSupabase('manual_team_swap', null, { oldTeamA: currentTeamA, newTeamA })
                                // the tablets read side_a for the match's Team A: the
                                // match goes out with its new Team A and sides too
                                syncToReferee()
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              <RefreshCw /> {t('scoreboard.manual.switchAB')}
                            </button>
                            <button
                              className="secondary"
                              onClick={async () => {
                                // Set 3: its own toss's first server; sets 1-2:
                                // the match's, with both A/B serve flags
                                // (coinToss_beach switchFirstServeUpdate)
                                const { update, cloud, before, after } = switchFirstServeUpdate(data.match, currentSetIndex)
                                await db.matches.update(matchId, update)
                                if (data.match?.seed_key && !data.match.test) {
                                  await db.sync_queue.add({
                                    resource: 'match',
                                    action: 'update',
                                    payload: { id: data.match.seed_key, ...cloud },
                                    ts: new Date().toISOString(),
                                    status: 'queued'
                                  })
                                }
                                logManualChange('Teams Setup', 'First Serve', before, after, `Changed first serve from ${before} to ${after}${currentSetIndex === 3 ? ' (set 3)' : ''}`)
                                // Sync updated serve to Supabase live state
                                syncLiveStateToSupabase('manual_serve_change', null, { oldServe: before, newServe: after })
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                fontWeight: 600
                              }}
                            >
                              <Volleyball /> {t('scoreboard.manual.switchServe')}
                            </button>
                          </div>

                          {/* Switch Serving Player within each team */}
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px', marginBottom: '8px' }}>
                            {t('scoreboard.manual.firstServerHint')}
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

                                  if (data.match?.seed_key && !data.match.test) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, team1FirstServe: newFirstServe },
                                      ts: new Date().toISOString(),
                                      status: 'queued'
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
                              <RefreshCw /> {data?.team1Team?.shortName || data?.team1Team?.name || 'team1'} Server: #{data?.match?.team1FirstServe || '?'}
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

                                  if (data.match?.seed_key && !data.match.test) {
                                    db.sync_queue.add({
                                      resource: 'match',
                                      action: 'update',
                                      payload: { id: data.match.seed_key, team2FirstServe: newFirstServe },
                                      ts: new Date().toISOString(),
                                      status: 'queued'
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
                              <RefreshCw /> {data?.team2Team?.shortName || data?.team2Team?.name || 'team2'} Server: #{data?.match?.team2FirstServe || '?'}
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
                              borderTop: '1px solid var(--ov-hairline)'
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

                                    // To the cloud through the sync queue (also offline)
                                    await queueSetScoreSync(db, { matchId, setIndex: data.set.index })

                                    // Update Live State immediately
                                    syncLiveStateToSupabase('manual_score_update')
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '6px 8px',
                                    fontSize: '14px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              {/* RIGHT TEAM Score */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', minWidth: '60px' }}>
                                  {rightIsTeam1 ? t('common.team1') : t('common.team2')}:
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={(rightIsTeam1 ? data.set.team1Points : data.set.team2Points) || 0}
                                  onChange={async (e) => {
                                    const newPoints = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                                    const update = rightIsTeam1 ? { team1Points: newPoints } : { team2Points: newPoints }
                                    await db.sets.update(data.set.id, update)

                                    // To the cloud through the sync queue (also offline)
                                    await queueSetScoreSync(db, { matchId, setIndex: data.set.index })

                                    // Update Live State immediately
                                    syncLiveStateToSupabase('manual_score_update')
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '6px 8px',
                                    fontSize: '14px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px' }}><ChartColumn /></span>
                  {t('scoreboard.manual.scoresSets')}
                </span>
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.scores ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                          borderTop: '1px solid var(--ov-hairline)'
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
                              background: 'var(--ov-sunken)',
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
                                    // To the cloud through the sync queue (also offline)
                                    await queueSetScoreSync(db, { matchId, setIndex: set.index })
                                  }}
                                  style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    fontSize: '12px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                                    // To the cloud through the sync queue (also offline)
                                    await queueSetScoreSync(db, { matchId, setIndex: set.index })
                                  }}
                                  style={{
                                    width: '50px',
                                    padding: '4px 6px',
                                    fontSize: '12px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                                    // To the cloud through the sync queue (also offline)
                                    await queueManualCloudUpdate('set', { finished: e.target.checked }, set.id)
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
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px' }}><Settings /></span>
                  {t('scoreboard.manual.matchSettings')}
                </span>
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.matchSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                        borderTop: '1px solid var(--ov-hairline)'
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

                              // To the cloud through the sync queue (also offline)
                              await queueManualCloudUpdate('match', { status: newStatus })
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              fontSize: '12px',
                              background: 'var(--ov-card)',
                              border: '1px solid var(--ov-hairline-strong)',
                              borderRadius: '4px',
                              color: 'var(--text)'
                            }}
                          >
                            <option value="setup" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.setup')}</option>
                            <option value="live" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.live')}</option>
                            <option value="final" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.final')}</option>
                            <option value="paused" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.paused')}</option>
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
                                background: 'var(--ov-card)',
                                border: '1px solid var(--ov-hairline-strong)',
                                borderRadius: '4px',
                                color: 'var(--text)'
                              }}
                            >
                              <option value="A" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.teamA')}</option>
                              <option value="B" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.edit.teamB')}</option>
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
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px' }}><NotebookPen /></span>
                  {t('scoreboard.manual.eventHistory')}
                </span>
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.events ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                          borderBottom: '1px solid var(--ov-hairline)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Points ({pointEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          {t('scoreboard.manual.pointsHint')}
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
                                background: 'var(--ov-sunken)',
                                borderRadius: '4px',
                                fontSize: '11px'
                              }}>
                                <span style={{ minWidth: '60px' }}>{t('scoreboard.manual.setN', { n: setIndex })}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '80px'
                                  }}
                                >
                                  <option value="team1" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>Team 1</option>
                                  <option value="team2" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>Team 2</option>
                                </select>
                                <span style={{ minWidth: '50px' }}>Score: {team1Score}-{team2Score}</span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (!(await askConfirm({ title: t('scoreboard.confirm.deletePointEvent'), confirmLabel: t('common.delete'), tone: 'danger' }))) return
                                    await deleteEventByHand(event)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  {t('common.delete')}
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
                          borderTop: '1px solid var(--ov-hairline)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Timeouts ({timeoutEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          {t('scoreboard.manual.timeoutsHint')}
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
                                background: 'var(--ov-sunken)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>{t('scoreboard.manual.setN', { n: setIndex })}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 1</option>
                                  <option value="team2" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 2</option>
                                </select>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{team1Score}-{team2Score}</span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (!(await askConfirm({ title: t('scoreboard.confirm.deleteTimeoutEvent'), confirmLabel: t('common.delete'), tone: 'danger' }))) return
                                    await deleteEventByHand(event)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  {t('common.delete')}
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
                          borderTop: '1px solid var(--ov-hairline)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Substitutions ({substitutionEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          {t('scoreboard.manual.subsHint')}
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
                                background: 'var(--ov-sunken)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>{t('scoreboard.manual.setN', { n: setIndex })}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 1</option>
                                  <option value="team2" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 2</option>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    width: '45px'
                                  }}
                                >
                                  {['I', 'II', 'III', 'IV', 'V', 'VI'].map(pos => (
                                    <option key={pos} value={pos} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{pos}</option>
                                  ))}
                                </select>
                                <span style={{ fontSize: '10px' }}>{t('scoreboard.manual.out')}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                                <span style={{ fontSize: '10px' }}>{t('scoreboard.manual.in')}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                                    if (await askConfirm({ title: t('scoreboard.confirm.deleteSubstitutionEvent'), confirmLabel: t('common.delete'), tone: 'danger' })) {
                                      const subTeam = event.payload?.team
                                      const subPosition = event.payload?.position
                                      const subPlayerOut = event.payload?.playerOut
                                      const subSetIndex = event.setIndex

                                      // Delete the substitution event (its cloud row too)
                                      await discardEvents([event])

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
                                          await discardEvents([mostRecentLineup])

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
                                  {t('common.delete')}
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
                          borderTop: '1px solid var(--ov-hairline)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Edit Sanctions ({sanctionEvents.length} most recent)</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                          {t('scoreboard.manual.sanctionsHint')}
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
                                background: 'var(--ov-sunken)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                flexWrap: 'wrap'
                              }}>
                                <span style={{ minWidth: '40px' }}>{t('scoreboard.manual.setN', { n: setIndex })}</span>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option value="team1" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 1</option>
                                  <option value="team2" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>Team 2</option>
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
                                    background: 'var(--ov-card)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)',
                                    minWidth: '90px'
                                  }}
                                >
                                  <option value="warning" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.warning')}</option>
                                  <option value="penalty" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.penalty')}</option>
                                  <option value="expulsion" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.expulsion')}</option>
                                  <option value="disqualification" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.disqualification')}</option>
                                  <option value="improper_request" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.improperRequest')}</option>
                                  <option value="delay_warning" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.delayWarning')}</option>
                                  <option value="delay_penalty" style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{t('scoreboard.sanctions.delayPenalty')}</option>
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
                                        background: 'var(--ov-card)',
                                        border: '1px solid var(--ov-hairline-strong)',
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
                                      background: 'var(--ov-card)',
                                      border: '1px solid var(--ov-hairline-strong)',
                                      borderRadius: '4px',
                                      color: 'var(--text)',
                                      width: '45px'
                                    }}
                                  >
                                    {['I', 'II', 'III', 'IV', 'V', 'VI'].map(pos => (
                                      <option key={pos} value={pos} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>{pos}</option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (!(await askConfirm({ title: t('scoreboard.confirm.deleteSanctionEvent'), confirmLabel: t('common.delete'), tone: 'danger' }))) return
                                    await deleteEventByHand(event)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  {t('common.delete')}
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
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px' }}><Wrench /></span>
                  {t('scoreboard.manual.advanced')}
                </span>
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.advanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                        borderBottom: '1px solid var(--ov-hairline)'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.manual.setTimes')}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        {t('scoreboard.manual.setTimesHint')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.sets.sort((a, b) => a.index - b.index).map(set => (
                          <div key={set.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            padding: '8px',
                            background: 'var(--ov-sunken)',
                            borderRadius: '6px'
                          }}>
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>{t('scoreboard.manual.setN', { n: set.index })}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '11px', minWidth: '80px' }}>{t('scoreboard.manual.startTime')}</label>
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
                                  onBlur={(e) => saveManualSetTime(set, 'startTime', e.target)}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
                                    borderRadius: '4px',
                                    color: 'var(--text)'
                                  }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '11px', minWidth: '80px' }}>{t('scoreboard.manual.endTime')}</label>
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
                                  onBlur={(e) => saveManualSetTime(set, 'endTime', e.target)}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                      borderTop: '1px solid var(--ov-hairline)'
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.manual.addEventTitle')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                      {t('scoreboard.manual.addEventHint')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>{t('scoreboard.manual.eventType')}</label>
                        <select
                          id="newEventType"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: 'var(--ov-card)',
                            border: '1px solid var(--ov-hairline-strong)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          <option value="point" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typePoint')}</option>
                          <option value="timeout" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeTimeout')}</option>
                          <option value="substitution" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeSubstitution')}</option>
                          <option value="sanction" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeSanction')}</option>
                          <option value="lineup" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeLineup')}</option>
                          <option value="replay" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeReplay')}</option>
                          <option value="rally_start" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeRallyStart')}</option>
                          <option value="set_start" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeSetStart')}</option>
                          <option value="set_end" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.typeSetEnd')}</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>{t('scoreboard.manual.set')}</label>
                        <select
                          id="newEventSet"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: 'var(--ov-card)',
                            border: '1px solid var(--ov-hairline-strong)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          {data?.sets?.sort((a, b) => a.index - b.index).map(set => (
                            <option key={set.id} value={set.index} style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>{t('scoreboard.manual.setN', { n: set.index })}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '12px', minWidth: '100px' }}>{t('scoreboard.manual.team')}</label>
                        <select
                          id="newEventTeam"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '12px',
                            background: 'var(--ov-card)',
                            border: '1px solid var(--ov-hairline-strong)',
                            borderRadius: '4px',
                            color: 'var(--text)'
                          }}
                        >
                          <option value="team1" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>Team 1</option>
                          <option value="team2" style={{ background: 'var(--ov-card)', color: 'var(--text)' }}>Team 2</option>
                        </select>
                      </div>
                      <button
                        className="secondary"
                        onClick={async () => {
                          const eventType = document.getElementById('newEventType')?.value
                          const setIndex = parseInt(document.getElementById('newEventSet')?.value || '1')
                          const team = document.getElementById('newEventTeam')?.value

                          if (!eventType || !setIndex || !team) {
                            showAlert(t('scoreboard.manual.fillAll'), 'warning')
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
                        {t('scoreboard.manual.addEvent')}
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
                        borderTop: '1px solid var(--ov-hairline)'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>{t('scoreboard.confirm.deleteEventsQuick')}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        {t('scoreboard.confirm.deleteEventsQuickDesc')}
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
                                background: 'var(--ov-sunken)',
                                borderRadius: '4px',
                                fontSize: '11px'
                              }}>
                                <span>
                                  Set {setIndex} - {description}
                                </span>
                                <button
                                  className="danger"
                                  onClick={async () => {
                                    if (!(await askConfirm({ title: t('scoreboard.confirm.deleteEventGeneric', { type: eventType }), confirmLabel: t('common.delete'), tone: 'danger' }))) return
                                    await deleteEventByHand(event)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px'
                                  }}
                                >
                                  {t('common.delete')}
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
              background: 'var(--ov-sunken)',
              borderRadius: '12px',
              border: '1px solid var(--ov-hairline)',
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
                  <span style={{ fontSize: '18px' }}><ClipboardList /></span>
                  {t('scoreboard.manual.summary')}
                  {manualChangesLog.length > 0 && (
                    <span style={{
                      background: 'var(--ov-selected)',
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
                <ChevronDown size={16} aria-hidden="true" style={{ transform: manualPanelExpandedSections.summary ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                      {t('scoreboard.manual.summaryEmpty')}
                      <br />
                      <span style={{ fontSize: '11px' }}>
                        {t('scoreboard.manual.summaryEmptyHint')}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                        {t('scoreboard.manual.summaryIntro')}
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
                              background: 'var(--ov-sunken)',
                              borderRadius: '6px',
                              border: '1px solid var(--ov-hairline)',
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
                                  <strong>{t('scoreboard.manual.before')}</strong> {String(change.before)}
                                </span>
                                <span>→</span>
                                <span>
                                  <strong>{t('scoreboard.manual.after')}</strong> {String(change.after)}
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
                        borderTop: '1px solid var(--ov-hairline)'
                      }}>
                        <button
                          className="secondary"
                          onClick={() => {
                            const logText = manualChangesLog.map(c => {
                              const time = timeSecondsLabel(c.ts)
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
                          <Copy /> {t('scoreboard.manual.copyLog')}
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
              <h3>{t('scoreboard.remarks.heading')}</h3>
              <textarea
                ref={remarksTextareaRef}
                className="remarks-area"
                placeholder={t('scoreboard.remarks.placeholder')}
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
                  border: '1px solid var(--ov-hairline-strong)',
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
                  // Pre-populate FIVB remark template for during-match forfeit (Case b)
                  if (stopMatchConfirm.type === 'forfeit' && stopMatchConfirm.team) {
                    const now = new Date()
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
                    const setIdx = data?.set?.index || 1
                    const setLabel = setIdx === 1 ? '1st' : setIdx === 2 ? '2nd' : '3rd'
                    const t1Pts = data?.set?.team1Points || 0
                    const t2Pts = data?.set?.team2Points || 0
                    const teamAKey = data?.match?.coinTossTeamA || 'team1'
                    const servingLabel = data?.servingTeam === teamAKey ? 'A' : 'B'
                    const forfaitTeamName = stopMatchConfirm.team === 'team1'
                      ? (data?.team1Team?.name || 'team1')
                      : (data?.team2Team?.name || 'team2')
                    const template = `At ${timeStr} time, ${setLabel} set, ${t1Pts}:${t2Pts} score, team ${servingLabel} serving, team ${forfaitTeamName} forfeits the match due to ... of player # ....`
                    const existing = data?.match?.remarks || ''
                    setRemarksText(existing ? `${existing}\n${template}` : template)
                  }
                  // Move to remarks step
                  setStopMatchRemarksStep({
                    type: stopMatchConfirm.type,
                    team: stopMatchConfirm.team
                  })
                  setStopMatchConfirm(null)
                  setShowRemarks(true) // Open the existing remarks modal
                }}
                style={{ background: 'var(--ov-danger)', color: '#fff', border: 'none' }}
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
                style={{ background: 'var(--ov-danger)', color: '#fff', border: 'none' }}
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
              {/* Sanctions and results side by side while each keeps ~22rem, stacked
                  below that; both columns may shrink (min-width 0): long team
                  names (two players each) wrap instead of pushing the results
                  table out of the dialog. As OpenVolley 190ae045. */}
              <div data-testid="sanctions-results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', gap: '32px' }}>
                {/* Left half: Sanctions */}
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>{t('scoreboard.sanctions.title')}</h4>
                  {/* Improper Request Row */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', minWidth: '100px' }}>{t('scoreboard.sanctions.improperRequest')}:</div>
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
                            border: '2px solid var(--ov-hairline-strong)',
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
                                color: 'var(--ov-danger-text)',
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
                      <tr style={{ borderBottom: '2px solid var(--ov-hairline-strong)' }}>
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
                            <tr key={event.id || idx} style={{ borderBottom: '1px solid var(--ov-hairline)' }}>
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
                <div style={{ minWidth: 0 }}>
                  <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Results</h4>
                  {(() => {
                    // Get current left and right teams
                    const currentLeftTeamKey = leftisTeam1 ? 'team1' : 'team2'
                    const currentRightTeamKey = leftisTeam1 ? 'team2' : 'team1'
                    const leftTeamData = currentLeftTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                    const rightTeamData = currentRightTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                    const leftTeamColor = leftTeamData?.color || (currentLeftTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                    const rightTeamColor = rightTeamData?.color || (currentRightTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                    const leftTeamName = (leftisTeam1 ? data?.match?.team1Name : data?.match?.team2Name) || leftTeamData?.name || 'Left Team'
                    const rightTeamName = (leftisTeam1 ? data?.match?.team2Name : data?.match?.team1Name) || rightTeamData?.name || 'Right Team'
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

                      // The score sheet's times (matchTimes_beach, as OpenVolley's
                      // SanctionsResultsModal): a set starts at its first rally, not
                      // at the confirmed (possibly scheduled) set 1 start time
                      const timedEvents = data?.events || []
                      const totalDurationMin = finishedSets.reduce((sum, set) => sum + (setDurationMinutes(set, timedEvents) ?? 0), 0)
                      const times = matchTimes(allSets, timedEvents)
                      const matchStartTime = times.startMs !== null ? new Date(times.startMs) : null
                      const matchEndTime = times.endMs !== null ? new Date(times.endMs) : null
                      const matchDurationMin = times.durationMinutes ?? 0

                      // Determine winner
                      const winnerTeamKey = leftTotalWins > rightTotalWins ? currentLeftTeamKey : currentRightTeamKey
                      const winnerTeamData = winnerTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                      const winnerTeamName = winnerTeamData?.name || (winnerTeamKey === 'team1' ? 'team1' : 'team2')
                      const winnerScore = `${leftTotalWins}-${rightTotalWins}`

                      // Get captain signatures
                      const team1CaptainSignature = data?.match?.team1PostGameCaptainSignature || null
                      const team2CaptainSignature = data?.match?.team2PostGameCaptainSignature || null
                      const team1CaptainPlayer = data?.team1Players?.find(p => p.isCaptain || p.captain)
                      const team2CaptainPlayer = data?.team2Players?.find(p => p.isCaptain || p.captain)

                      return (
                        <div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
                            <thead>
                              <tr>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline-strong)', width: '42%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, overflowWrap: 'anywhere', minWidth: 0 }}>{leftTeamName}</span>
                                    <span style={{
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      background: leftTeamColor,
                                      color: isLightColour(leftTeamColor) ? '#000' : '#fff'
                                    }}>{leftTeamLabel}</span>
                                  </div>
                                </th>
                                <th style={{ padding: '4px', fontSize: '8px', width: '16%' }}>Dur</th>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline-strong)', width: '42%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, overflowWrap: 'anywhere', minWidth: 0 }}>{rightTeamName}</span>
                                    <span style={{
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      background: rightTeamColor,
                                      color: isLightColour(rightTeamColor) ? '#000' : '#fff'
                                    }}>{rightTeamLabel}</span>
                                  </div>
                                </th>
                              </tr>
                              <tr style={{ borderBottom: '2px solid var(--ov-hairline-strong)' }}>
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
                              <tr style={{ borderBottom: '1px solid var(--ov-hairline)' }}>
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
                              <tr style={{ borderBottom: '1px solid var(--ov-hairline)' }}>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match start time:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchStartTime ? `${String(matchStartTime.getHours()).padStart(2, '0')}:${String(matchStartTime.getMinutes()).padStart(2, '0')}:${String(matchStartTime.getSeconds()).padStart(2, '0')}` : '—'}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match end time:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchEndTime ? `${String(matchEndTime.getHours()).padStart(2, '0')}:${String(matchEndTime.getMinutes()).padStart(2, '0')}:${String(matchEndTime.getSeconds()).padStart(2, '0')}` : '—'}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match duration:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchDurationMin > 0 ? `${matchDurationMin} min` : '—'}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Winner:</td>
                                <td colSpan="5" style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px', overflowWrap: 'anywhere' }}>
                                  {winnerTeamName} ({winnerScore})
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* Post-match signatures */}
                          <div style={{ marginTop: '16px', display: 'flex', gap: '16px', justifyContent: 'space-around' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '9px', fontWeight: 600, marginBottom: '4px' }}>
                                Captain - {team1CaptainPlayer?.name || data?.team1Team?.name || 'team1'}{team1CaptainPlayer ? ` (#${team1CaptainPlayer.number})` : ''}
                              </div>
                              {team1CaptainSignature ? (
                                <div style={{ border: '1px solid var(--ov-hairline-strong)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'var(--ov-sunken)' }}>
                                  <img src={team1CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team1-captain')}
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    fontSize: '9px',
                                    background: 'var(--ov-sunken-strong)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                                Captain - {team2CaptainPlayer?.name || data?.team2Team?.name || 'team2'}{team2CaptainPlayer ? ` (#${team2CaptainPlayer.number})` : ''}
                              </div>
                              {team2CaptainSignature ? (
                                <div style={{ border: '1px solid var(--ov-hairline-strong)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'var(--ov-sunken)' }}>
                                  <img src={team2CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team2-captain')}
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    fontSize: '9px',
                                    background: 'var(--ov-sunken-strong)',
                                    border: '1px solid var(--ov-hairline-strong)',
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
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '4px 2px', textAlign: 'center', width: '8%' }}></th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline-strong)', width: '38%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, overflowWrap: 'anywhere', minWidth: 0 }}>{leftTeamName}</span>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  background: leftTeamColor,
                                  color: isLightColour(leftTeamColor) ? '#000' : '#fff'
                                }}>{leftTeamLabel}</span>
                              </div>
                            </th>
                            <th style={{ padding: '4px 2px', fontSize: '8px', width: '8%' }}>Dur</th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline-strong)', width: '38%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, overflowWrap: 'anywhere', minWidth: 0 }}>{rightTeamName}</span>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  background: rightTeamColor,
                                  color: isLightColour(rightTeamColor) ? '#000' : '#fff'
                                }}>{rightTeamLabel}</span>
                              </div>
                            </th>
                          </tr>
                          <tr style={{ borderBottom: '2px solid var(--ov-hairline-strong)' }}>
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

                            // Set duration from its first rally (matchTimes_beach)
                            const durationMin = setDurationMinutes(set, data?.events || [])
                            const duration = durationMin !== null ? `${durationMin}'` : ''

                            return (
                              <tr key={set.id} style={{ borderBottom: '1px solid var(--ov-hairline)' }}>
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
                    background: 'var(--ov-sunken)',
                    border: '1px solid var(--ov-hairline-strong)',
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
          title={t('scoreboard.timeoutFor', { team: timeoutModal.team === teamAKey ? 'A' : 'B' })}
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
              const isRequestingBright = isLightColour(requestingTeamColor)
              const isOtherBright = isLightColour(otherTeamColor)
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
              Confirm time-out request?
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

      {playerActionMenu && (() => {
        // Get element position - use stored coordinates if available
        // For left side teams, menu opens to the right (use left CSS)
        // For right side teams, menu opens to the left (use right CSS)
        const isRightSide = playerActionMenu.side === 'right'
        // Anchored by its top, next to the player, and kept on screen with
        // room for the open Sanction list: centred (translateY(-50%)) the menu
        // jumped up by half the list when Sanction opened, away from the pointer
        const menuTop = (centerY) => Math.max(8, Math.min(centerY - 56, window.innerHeight - PLAYER_MENU_OPEN_HEIGHT - 8))
        let menuStyle
        if (playerActionMenu.x !== undefined && playerActionMenu.y !== undefined) {
          menuStyle = {
            position: 'fixed',
            left: isRightSide ? undefined : `${playerActionMenu.x}px`,
            right: isRightSide ? `${window.innerWidth - playerActionMenu.x}px` : undefined,
            top: `${menuTop(playerActionMenu.y)}px`,
            zIndex: 1000
          }
        } else {
          const rect = playerActionMenu.element?.getBoundingClientRect?.()
          menuStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${menuTop(rect.top + rect.height / 2)}px`,
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
        const hasExpulsion = playerHasSanctionType(team, playerNumber, 'expulsion')
        // Per FIVB 20.3.1: player can receive up to 2 penalties per set
        const penaltyCountInSet = getPlayerPenaltyCountInCurrentSet(team, playerNumber)
        const canGetWarning = !hasWarning && !teamWarning
        const canGetPenalty = penaltyCountInSet < 2
        const canGetExpulsion = !hasExpulsion

        const showSanctionConfirmFromMenu = (sanctionType) => {
          setPlayerActionMenu(null)
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
                className="sb-popover"
                style={{
                  background: 'var(--ov-card)',
                  border: '2px solid var(--ov-hairline-strong)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '140px',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
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
                      background: 'var(--ov-card)',
                      color: 'var(--ov-text)',
                      border: '1px solid var(--ov-hairline-strong)',
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ov-sunken)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ov-card)' }}
                  >
                    <span>Sanction</span>
                    <ChevronDown size={16} aria-hidden="true" style={{ transform: courtSanctionExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                          background: canGetWarning ? 'var(--ov-card)' : 'var(--ov-sunken)',
                          color: canGetWarning ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid var(--ov-hairline)',
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
                          background: canGetPenalty ? 'var(--ov-card)' : 'var(--ov-sunken)',
                          color: canGetPenalty ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid var(--ov-hairline)',
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
                          background: canGetExpulsion ? 'var(--ov-card)' : 'var(--ov-sunken)',
                          color: canGetExpulsion ? 'var(--text)' : 'var(--muted)',
                          border: '1px solid var(--ov-hairline)',
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
                          background: 'var(--ov-sunken)',
                          color: 'var(--text)',
                          border: '1px solid var(--ov-hairline)',
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
                    background: 'var(--ov-danger)',
                    color: '#fff',
                    border: '1px solid var(--ov-hairline-strong)',
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
            // centred on the player but kept on screen (it ran off the top)
            top: `${clampedMenuTop(sanctionDropdown.y, 300)}px`,
            zIndex: 1000
          }
        } else {
          const rect = sanctionDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${clampedMenuTop(rect.top + rect.height / 2, 300)}px`,
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
                className="sb-popover"
                style={{
                  background: 'var(--ov-card)',
                  border: '2px solid var(--ov-hairline-strong)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '160px',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline)', paddingBottom: '6px' }}>
                  {sanctionDropdown.role === 'coach' ? 'Sanction for Coach' : sanctionDropdown.playerNumber ? `Sanction for ${sanctionDropdown.playerNumber}` : 'Sanction'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(() => {
                    const teamKey = sanctionDropdown.team
                    const playerNumber = sanctionDropdown.playerNumber
                    const isCoach = sanctionDropdown.role === 'coach'
                    const teamWarning = teamHasFormalWarning(teamKey)

                    // Check if player/coach has each specific sanction type
                    let hasWarning, hasExpulsion, hasDisqualification, penaltyCountInSet
                    if (isCoach) {
                      const coachSanctions = (data?.events || []).filter(e =>
                        e.type === 'sanction' && e.payload?.team === teamKey && e.payload?.role === 'coach'
                      )
                      hasWarning = coachSanctions.some(e => e.payload?.type === 'warning')
                      hasExpulsion = coachSanctions.some(e => e.payload?.type === 'expulsion')
                      hasDisqualification = coachSanctions.some(e => e.payload?.type === 'disqualification')
                      penaltyCountInSet = coachSanctions.filter(e => e.payload?.type === 'penalty' && e.setIndex === data?.set?.index).length
                    } else {
                      hasWarning = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'warning') : false
                      hasExpulsion = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'expulsion') : false
                      hasDisqualification = playerNumber ? playerHasSanctionType(teamKey, playerNumber, 'disqualification') : false
                      // Per FIVB 20.3.1: player can receive up to 2 penalties per set
                      penaltyCountInSet = playerNumber ? getPlayerPenaltyCountInCurrentSet(teamKey, playerNumber) : 0
                    }

                    // Determine which sanctions are available
                    // Rule: A player cannot get the same sanction type twice
                    // Exception: Warning can only be given if team hasn't been warned (player can have other sanctions)
                    const canGetWarning = !hasWarning && !teamWarning
                    // Penalty: can be given if player has < 2 penalties in current set (FIVB 20.3.1)
                    const canGetPenalty = penaltyCountInSet < 2
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
                            background: canGetWarning ? 'var(--ov-card)' : 'var(--ov-sunken)',
                            color: canGetWarning ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid var(--ov-hairline)',
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
                              e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetWarning) {
                              e.currentTarget.style.background = 'var(--ov-sunken)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline)'
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
                            background: canGetPenalty ? 'var(--ov-card)' : 'var(--ov-sunken)',
                            color: canGetPenalty ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid var(--ov-hairline)',
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
                              e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetPenalty) {
                              e.currentTarget.style.background = 'var(--ov-sunken)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline)'
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
                            background: canGetExpulsion ? 'var(--ov-card)' : 'var(--ov-sunken)',
                            color: canGetExpulsion ? 'var(--text)' : 'var(--muted)',
                            border: '1px solid var(--ov-hairline)',
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
                              e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canGetExpulsion) {
                              e.currentTarget.style.background = 'var(--ov-sunken)'
                              e.currentTarget.style.borderColor = 'var(--ov-hairline)'
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
                            background: 'var(--ov-sunken)',
                            color: 'var(--text)',
                            border: '1px solid var(--ov-hairline)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                            e.currentTarget.style.borderColor = 'var(--ov-hairline-strong)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--ov-sunken)'
                            e.currentTarget.style.borderColor = 'var(--ov-hairline)'
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
            // centred on the player but kept on screen (it ran off the top)
            top: `${clampedMenuTop(injuryDropdown.y, 380)}px`,
            zIndex: 1000
          }
        } else {
          const rect = injuryDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: isRightSide ? undefined : `${rect.right + 30}px`,
            right: isRightSide ? `${window.innerWidth - rect.left + 30}px` : undefined,
            top: `${clampedMenuTop(rect.top + rect.height / 2, 380)}px`,
            zIndex: 1000
          } : {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000
          }
        }

        const teamLabel = injuryDropdown.team === (data?.match?.coinTossTeamA || 'team1') ? 'A' : 'B'
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
                data-medical-dropdown
                className="sb-popover"
                style={{
                  background: 'var(--ov-card)',
                  border: '2px solid rgba(220, 38, 38, 0.5)',
                  borderRadius: '8px',
                  padding: '8px',
                  minWidth: '220px',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                }}
              >
                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid var(--ov-hairline)', paddingBottom: '6px' }}>
                  {t('scoreboard.medical', 'Medical')} – {t('scoreboard.team', 'Team')} {teamLabel} #{playerNumber}{medicalPlayerName(injuryDropdown.team, playerNumber) ? ` ${medicalPlayerName(injuryDropdown.team, playerNumber)}` : ''}
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
                      color: 'var(--ov-text)',
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
                    <span style={{ fontSize: '10px', color: 'var(--ov-text-muted)' }}>
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
                      <span style={{ fontSize: '9px', color: 'var(--ov-danger-text)' }}>
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
                      color: ritUsedThisMatch ? 'var(--muted)' : 'var(--ov-text)',
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
                      color: ritUsedThisMatch ? 'var(--muted)' : 'var(--ov-text)',
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
                      color: ritUsedThisMatch ? 'var(--muted)' : 'var(--ov-text)',
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
                      background: 'var(--ov-sunken)',
                      color: 'var(--muted)',
                      border: '1px solid var(--ov-hairline)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      marginTop: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--ov-sunken-strong)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--ov-sunken)'
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
            <div data-testid="medical-player" style={{ marginBottom: '16px', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
              {t('scoreboard.team', 'Team')} {medicalModal.team === (data?.match?.coinTossTeamA || 'team1') ? 'A' : 'B'} #{medicalModal.playerNumber}{medicalModal.playerName ? ` ${medicalModal.playerName}` : ''}
            </div>

            {/* Countdown Display */}
            <div className="tabular-nums" style={{
              fontSize: '72px',
              fontWeight: 700,
              fontFamily: scoreFont === 'orbitron' ? "'Orbitron', monospace" : 'inherit',
              color: medicalModal.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--text)',
              marginBottom: '8px',
              lineHeight: 1
            }}>
              {formatMedicalDuration(medicalModal.countdown)}
            </div>

            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: '8px',
              background: 'var(--ov-sunken-strong)',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '24px'
            }}>
              <div style={{
                width: `${(medicalModal.countdown / MEDICAL_RECOVERY_SECONDS) * 100}%`,
                height: '100%',
                background: medicalModal.countdown <= 30 ? 'var(--ov-danger)' : medicalModal.type === 'mto' ? '#0284c7' : '#f97316',
                transition: 'width 0.1s linear'
              }} />
            </div>

            {/* Player recovered: the main action. The forfeit sits apart, small,
                and asks first (it ends the match). */}
            {!medicalForfeitConfirm ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                <button
                  data-testid="medical-recovered"
                  onClick={() => handleMedicalOutcome('recovered')}
                  style={{
                    padding: '14px 24px',
                    minHeight: '56px',
                    fontSize: '18px',
                    fontWeight: 700,
                    background: 'var(--ov-success)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {t('scoreboard.playerRecovered', 'Player Recovered')}
                </button>
                <button
                  data-testid="medical-forfeit"
                  className="secondary"
                  onClick={() => setMedicalForfeitConfirm(true)}
                  style={{
                    alignSelf: 'center',
                    padding: '10px 16px',
                    minHeight: '44px',
                    fontSize: '15px',
                    fontWeight: 600,
                    background: 'transparent',
                    color: 'var(--ov-danger-text)',
                    border: '1px solid var(--ov-hairline-strong)',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {t('scoreboard.medicalCannotContinue', 'Player cannot continue (forfeit)…')}
                </button>
              </div>
            ) : (
              <div data-testid="medical-forfeit-confirm" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '16px', color: 'var(--text)', margin: 0 }}>
                  {t('scoreboard.medicalForfeitQuestion', 'The team is incomplete and forfeits the match. Confirm?')}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    className="secondary"
                    onClick={() => setMedicalForfeitConfirm(false)}
                    style={{ padding: '12px 20px', minHeight: '48px', fontSize: '16px', fontWeight: 600 }}
                  >
                    {t('common.back', 'Back')}
                  </button>
                  <button
                    onClick={() => handleMedicalOutcome('forfeit')}
                    style={{ padding: '12px 20px', minHeight: '48px', fontSize: '16px', fontWeight: 700, background: 'var(--ov-danger)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    {t('scoreboard.medicalConfirmForfeit', 'Confirm forfeit')}
                  </button>
                </div>
              </div>
            )}
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
            <p style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--ov-text-muted)' }}>
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
                  background: editingKey === key ? 'rgba(59, 130, 246, 0.2)' : 'var(--ov-sunken)',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: editingKey === key ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid transparent'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{t(labelKey, label)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ov-text-muted)' }}>{t(descKey, description)}</div>
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
                    background: editingKey === key ? '#0284c7' : 'var(--ov-sunken-strong)',
                    color: editingKey === key ? 'var(--ov-text)' : 'var(--text)',
                    border: '1px solid var(--ov-hairline-strong)',
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
                  background: 'var(--ov-sunken-strong)',
                  color: 'var(--text)',
                  border: '1px solid var(--ov-hairline-strong)',
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
                  background: 'var(--ov-success)',
                  color: '#fff',
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
            <div style={{ marginBottom: '16px', fontSize: '48px' }}><TriangleAlert /></div>
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
                  background: 'var(--ov-success)',
                  color: '#fff',
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
                  background: 'var(--ov-sunken-strong)',
                  color: 'var(--text)',
                  border: '1px solid var(--ov-hairline-strong)',
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
            <div style={{ marginBottom: '16px', fontSize: '48px' }}><TriangleAlert /></div>
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
                  background: 'var(--ov-success)',
                  color: '#fff',
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
                  background: 'var(--ov-sunken-strong)',
                  color: 'var(--text)',
                  border: '1px solid var(--ov-hairline-strong)',
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
        const teamPlayers = sanctionConfirmModal.team === 'team1' ? data?.team1Players : data?.team2Players
        const teamColor = teamData?.color || (sanctionConfirmModal.team === 'team1' ? '#ef4444' : '#3b82f6')
        const teamLabel = sanctionConfirmModal.team === teamAKey ? 'A' : 'B'
        // Get team name without country (remove parentheses and content)
        const fullTeamName = teamData?.name || (sanctionConfirmModal.team === 'team1' ? 'Team 1' : 'Team 2')
        const teamName = fullTeamName.replace(/\s*\([^)]*\)\s*$/, '')
        const isBright = isLightColour(teamColor)
        // Find player name
        const player = sanctionConfirmModal.type === 'player' && sanctionConfirmModal.playerNumber
          ? teamPlayers?.find(p => p.number === sanctionConfirmModal.playerNumber || String(p.number) === String(sanctionConfirmModal.playerNumber))
          : null
        const playerName = player ? `${player.firstName || ''} ${player.lastName || ''}`.trim() : ''

        return (
          <Modal
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '20px' }}>{teamName}</span>
                <span style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 700,
                  background: teamColor,
                  color: isBright ? '#000' : '#fff'
                }}>{teamLabel}</span>
              </div>
            }
            open={true}
            onClose={cancelSanctionConfirm}
            width={300}
            hideCloseButton={true}
          >
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ marginBottom: '6px', fontSize: '18px', color: 'var(--muted)' }}>
                {sanctionConfirmModal.type === 'player' && `#${sanctionConfirmModal.playerNumber}`}
                {sanctionConfirmModal.type === 'official' && `${sanctionConfirmModal.role}`}
              </p>
              {playerName && (
                <p style={{ marginBottom: '14px', fontSize: '15px', color: 'var(--muted)' }}>{playerName}</p>
              )}
              {!playerName && <div style={{ marginBottom: '14px' }} />}
              <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                {sanctionConfirmModal.sanctionType === 'warning' && <div className="sanction-card yellow" style={{ width: '36px', height: '48px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'penalty' && <div className="sanction-card red" style={{ width: '36px', height: '48px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'expulsion' && <div className="sanction-card combo" style={{ width: '40px', height: '48px' }}></div>}
                {sanctionConfirmModal.sanctionType === 'disqualification' && (
                  <div className="sanction-cards-separate">
                    <div className="sanction-card yellow" style={{ width: '30px', height: '40px' }}></div>
                    <div className="sanction-card red" style={{ width: '30px', height: '40px' }}></div>
                  </div>
                )}
              </div>
              <p style={{ marginBottom: '18px', fontSize: '16px', fontWeight: 600 }}>
                {sanctionConfirmModal.sanctionType === 'warning' && 'Warning'}
                {sanctionConfirmModal.sanctionType === 'penalty' && 'Penalty'}
                {sanctionConfirmModal.sanctionType === 'expulsion' && 'Expulsion'}
                {sanctionConfirmModal.sanctionType === 'disqualification' && 'Disqualification'}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={confirmPlayerSanction}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--ov-success)',
                    color: '#fff',
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
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--ov-sunken-strong)',
                    color: 'var(--text)',
                    border: '1px solid var(--ov-hairline-strong)',
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

      {/* Expulsion/Disqualification Secondary Confirmation Modal */}
      {expulsionConfirmModal && (() => {
        const teamData = expulsionConfirmModal.team === 'team1' ? data?.team1Team : data?.team2Team
        const teamPlayers = expulsionConfirmModal.team === 'team1' ? data?.team1Players : data?.team2Players
        const teamColor = teamData?.color || (expulsionConfirmModal.team === 'team1' ? '#ef4444' : '#3b82f6')
        const teamLabel = expulsionConfirmModal.team === teamAKey ? 'A' : 'B'
        const fullTeamName = teamData?.name || (expulsionConfirmModal.team === 'team1' ? 'Team 1' : 'Team 2')
        const teamName = fullTeamName.replace(/\s*\([^)]*\)\s*$/, '')
        const isBright = isLightColour(teamColor)
        const player = expulsionConfirmModal.type === 'player' && expulsionConfirmModal.playerNumber
          ? teamPlayers?.find(p => p.number === expulsionConfirmModal.playerNumber || String(p.number) === String(expulsionConfirmModal.playerNumber))
          : null
        const playerName = player ? `${player.firstName || ''} ${player.lastName || ''}`.trim() : ''
        const opponentTeamData = expulsionConfirmModal.team === 'team1' ? data?.team2Team : data?.team1Team
        const opponentName = opponentTeamData?.name?.replace(/\s*\([^)]*\)\s*$/, '') || (expulsionConfirmModal.team === 'team1' ? 'Team 2' : 'Team 1')

        const isExpulsion = expulsionConfirmModal.sanctionType === 'expulsion'
        const endsMatch = expulsionConfirmModal.endsMatch

        return (
          <Modal
            title={endsMatch ? t('scoreboard.modals.confirmMatchEnd', 'Confirm match end') : t('scoreboard.modals.confirmSetEnd', 'Confirm set end')}
            open={true}
            onClose={() => setExpulsionConfirmModal(null)}
            width={420}
            hideCloseButton={true}
          >
            <div style={{ padding: '20px', textAlign: 'center' }}>
              {/* Player info */}
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: teamColor,
                  color: isBright ? '#000' : '#fff'
                }}>{teamLabel}</span>
                <span style={{ fontSize: '16px', color: 'var(--text)' }}>{teamName}</span>
                {expulsionConfirmModal.type === 'player' && (
                  <span style={{ fontSize: '14px', color: 'var(--muted)' }}>#{expulsionConfirmModal.playerNumber}</span>
                )}
              </div>
              {playerName && (
                <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)' }}>{playerName}</p>
              )}

              {/* Sanction card display */}
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                {isExpulsion && <div className="sanction-card combo" style={{ width: '40px', height: '48px' }}></div>}
                {!isExpulsion && (
                  <div className="sanction-cards-separate">
                    <div className="sanction-card yellow" style={{ width: '30px', height: '40px' }}></div>
                    <div className="sanction-card red" style={{ width: '30px', height: '40px' }}></div>
                  </div>
                )}
                <span style={{ fontSize: '16px', fontWeight: 600 }}>
                  {isExpulsion ? 'Expulsion' : 'Disqualification'}
                </span>
              </div>

              {/* Warning message */}
              <div style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.15)',
                borderRadius: '8px',
                marginBottom: '20px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                {isExpulsion && !endsMatch && (
                  <p style={{ fontSize: '15px', color: 'var(--text)', margin: 0 }}>
                    This will <strong>end the current set</strong> and award it to <strong>{opponentName}</strong>.
                  </p>
                )}
                {isExpulsion && endsMatch && (
                  <p style={{ fontSize: '15px', color: 'var(--text)', margin: 0 }}>
                    This will <strong>end the current set</strong> and <strong>end the match</strong>. <strong>{opponentName}</strong> wins.
                  </p>
                )}
                {!isExpulsion && (
                  <p style={{ fontSize: '15px', color: 'var(--text)', margin: 0 }}>
                    This will <strong>end the match</strong>. <strong>{opponentName}</strong> wins all remaining sets.
                  </p>
                )}
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={executeExpulsionOrDisqualification}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--ov-danger)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  {endsMatch ? 'End Match' : 'End Set'}
                </button>
                <button
                  onClick={() => setExpulsionConfirmModal(null)}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--ov-sunken-strong)',
                    color: 'var(--text)',
                    border: '1px solid var(--ov-hairline-strong)',
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
                  background: 'var(--ov-success)',
                  color: '#fff',
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
                  background: 'var(--ov-sunken-strong)',
                  color: 'var(--text)',
                  border: '1px solid var(--ov-hairline-strong)',
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
          scheduledTime={setStartTimeModal.scheduledTime}
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
          losingTeamBmpRemaining={dialogBmpRemaining(setEndTimeModal.winner === 'team1' ? 'team2' : 'team1')}
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
                setReplayRallyConfirm({ event: pointEvent, description: 'Decision Change', selectedOption: null, fromDialog: true })
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

      {sanctionConfirm && (() => {
        const sideTeamKey = sanctionConfirm.side === 'left' ? (leftisTeam1 ? 'team1' : 'team2') : (leftisTeam1 ? 'team2' : 'team1')
        const team = sideTeamKey === teamAKey ? 'A' : 'B'
        const kind = sanctionConfirm.type === 'improper_request' ? 'improper' : sanctionConfirm.type === 'delay_warning' ? 'warning' : 'penalty'
        return (
          <Modal
            title={t(`scoreboard.sanctionConfirm.${kind}Title`, { team })}
            open={true}
            onClose={() => setSanctionConfirm(null)}
            width={420}
            hideCloseButton={true}
          >
            <div className="ov-kit" data-testid="sanction-confirm">
              <p className="m-0 text-sm text-stone-600">
                {t(`scoreboard.sanctionConfirm.${kind}Body`)}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setSanctionConfirm(null)} className={cn(modalCancelClass, 'h-12 px-5')}>
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={confirmSanction} className={cn(modalPrimaryClass, 'h-12 px-5')}>
                  {t(`scoreboard.sanctionConfirm.${kind}Confirm`)}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* TTO (Technical Timeout) Modal - at 21 points in Sets 1-2 with 45s countdown */}
      {ttoModal && (
        <Modal
          title={t('scoreboard.tto.title')}
          open={true}
          onClose={() => { }}
          width={450}
          hideCloseButton={true}
          zIndex={2000}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--ov-success)' }}>
              {t('scoreboard.tto.at21')}
            </p>
            <div style={{ marginBottom: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {courtScoreChips(ttoModal.team1Points, ttoModal.team2Points)}
            </div>
            {ttoModal.triggerCourtSwitchAfter && (
              <p style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--ov-warning-text)', fontWeight: 500 }}>
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
                  background: 'var(--ov-sunken)',
                  border: '1px solid var(--ov-hairline)',
                  cursor: 'pointer',
                  margin: '0 auto'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ov-sunken-strong)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--ov-sunken)'}
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
                    color: ttoModal.countdown <= 10 ? 'var(--ov-danger-text)' : 'var(--ov-success)',
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
                    background: 'var(--ov-sunken-strong)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div style={{
                      width: `${(ttoModal.countdown / TTO_SECONDS) * 100}%`,
                      height: '100%',
                      background: ttoModal.countdown <= 10 ? 'var(--ov-danger)' : 'var(--ov-success)',
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
                  onClick={() => {
                    console.debug('[Scoreboard TTO DEBUG] Start TTO button clicked')
                    const startTimestamp = Date.now()
                    setTtoModal(prev => ({ ...prev, started: true, startedAt: new Date(startTimestamp).toISOString() }))
                    syncLiveStateToSupabase('tto_start', null, { duration: TTO_SECONDS })
                    sendActionToReferee('tto', { countdown: TTO_SECONDS, startTimestamp })
                  }}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: 'var(--ov-success)',
                    color: '#fff',
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
                  // once per completed rally (bmpAvailability_beach)
                  const bmpRemaining = dialogBmpRemaining(losingTeamKey)
                  const bmpAvailable = bmpRemaining > 0

                  if (!bmpAvailable) return null

                  const losingTeamData = losingTeamKey === 'team1' ? data?.team1Team : data?.team2Team
                  const losingTeamColor = losingTeamData?.color || (losingTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
                  const losingTeamLabel = losingTeamKey === teamAKey ? 'A' : 'B'

                  return (
                    <div style={{ borderTop: '1px solid var(--ov-hairline)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleTeamBMP(losingTeamKey)}
                        style={{
                          padding: '10px 20px',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: 'transparent',
                          color: '#c2410c',
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
                          color: isLightColour(losingTeamColor) ? '#000' : '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700
                        }}>
                          {losingTeamLabel}
                        </span>
                        {t('scoreboard.bmpRequest', 'BMP request')}
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


      {/* BMP Outcome Modal */}
      {bmpOutcomeModal && (() => {
        const currentScore = bmpOutcomeModal.currentScore || { team1: 0, team2: 0 }
        const currentServe = bmpOutcomeModal.currentServe
        const requestingTeam = bmpOutcomeModal.team
        const isReferee = bmpOutcomeModal.type === 'referee'

        // Get team colors and labels (team1 = team1Team, team2 = team2Team)
        const team1Color = leftisTeam1 ? leftTeam?.color : rightTeam?.color
        const team2Color = leftisTeam1 ? rightTeam?.color : leftTeam?.color
        const team1Label = teamAKey === 'team1' ? 'A' : 'B'
        const team2Label = teamAKey === 'team1' ? 'B' : 'A'
        // "A 20 : 16 B": the left team first, as on the court
        const courtScore = (sc) => formatCourtScore(sc, { leftisTeam1, teamAKey })
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
            title={isReferee ? t('scoreboard.modals.refereeBallMarkProtocol', 'Referee ball mark protocol') : t('scoreboard.modals.ballMarkProtocol', 'Ball mark protocol')}
            open={true}
            onClose={() => setBmpOutcomeModal(null)}
            width={500}
            zIndex={2100}
          >
            <div className="bmp-outcome-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--muted)', textAlign: 'center' }}>
                {isReferee ? (
                  'Referee ball mark check'
                ) : (
                  <span>BMP requested by <strong><span style={{ background: requestingTeam === 'team1' ? team1Color : team2Color, color: isLightColour(requestingTeam === 'team1' ? team1Color : team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '14px', fontWeight: 700, marginRight: '4px' }}>{requestingTeam === 'team1' ? team1Label : team2Label}</span>{requestingTeam === 'team1' ? team1Name : team2Name}</strong></span>
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
                          {/* Button row: Point Left | Mark Unavailable | Point Right:
                              three equal columns that shrink inside the dialog */}
                          <div data-testid="referee-bmp-row" style={{ display: 'flex', flexDirection: 'row', gap: '8px', minWidth: 0 }}>
                            {/* Point Left Button */}
                            <button
                              data-testid="referee-bmp-left"
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'left' ? null : 'left')}
                              title={`${leftLabel} ${leftTeamName || ''}`}
                              style={{
                                ...bmpChoiceButton,
                                background: leftTeamColor,
                                color: isLightColour(leftTeamColor) ? '#000' : '#fff',
                                border: `2px solid ${leftTeamColor}`,
                                boxShadow: selectedTeam === 'left' ? '0 0 0 3px var(--ov-card), 0 0 0 6px #eab308' : 'none'
                              }}
                            >
                              <span style={{ fontWeight: 700, flexShrink: 0 }}>{leftLabel}</span>
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leftTeamName}</span>
                            </button>
                            {/* Mark Unavailable Button */}
                            <button
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'judgment_impossible' ? null : 'judgment_impossible')}
                              style={{
                                ...bmpChoiceButton,
                                background: selectedTeam === 'unavailable' ? '#78716c' : '#a8a29e',
                                color: '#fff',
                                border: '2px solid transparent',
                                boxShadow: selectedTeam === 'unavailable' ? '0 0 0 3px var(--ov-card), 0 0 0 6px #78716c' : 'none'
                              }}
                            >
                              Unavailable
                            </button>
                            {/* Point Right Button */}
                            <button
                              data-testid="referee-bmp-right"
                              onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'right' ? null : 'right')}
                              title={`${rightLabel} ${rightTeamName || ''}`}
                              style={{
                                ...bmpChoiceButton,
                                background: rightTeamColor,
                                color: isLightColour(rightTeamColor) ? '#000' : '#fff',
                                border: `2px solid ${rightTeamColor}`,
                                boxShadow: selectedTeam === 'right' ? '0 0 0 3px var(--ov-card), 0 0 0 6px #eab308' : 'none'
                              }}
                            >
                              <span style={{ fontWeight: 700, flexShrink: 0 }}>{rightLabel}</span>
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rightTeamName}</span>
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
                              <div style={{ fontSize: '15px', color: 'var(--muted)', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', padding: '6px 10px', background: 'var(--ov-sunken)', borderRadius: '6px' }}>
                                  <span>Current:</span>
                                  <span><strong className="tabular-nums">{courtScore(currentScore)}</strong> · <Volleyball /> {currentServe === 'team1' ? team1Name : team2Name}</span>
                                </div>
                                {selectedTeam === 'unavailable' ? (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(156, 163, 175, 0.15)', borderRadius: '6px', border: '1px solid rgba(156, 163, 175, 0.3)' }}>
                                    <span style={{ color: 'var(--ov-text-muted)' }}>No change:</span>
                                    <span><strong className="tabular-nums">{courtScore(currentScore)}</strong> · <Volleyball /> {currentServe === 'team1' ? team1Name : team2Name}</span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(234, 179, 8, 0.15)', borderRadius: '6px', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                                    <span style={{ color: 'var(--ov-warning-text)' }}>New:</span>
                                    <span><strong style={{ color: 'var(--ov-warning-text)' }}>
                                      {courtScore(selectedTeam === 'left' ? leftTeamScore : rightTeamScore)}
                                    </strong> · <Volleyball /> {(selectedTeam === 'left' ? leftTeamScore.serve : rightTeamScore.serve) === 'team1' ? team1Name : team2Name}</span>
                                  </div>
                                )}
                              </div>
                              {selectedTeam === 'unavailable' ? (
                                <button
                                  onClick={() => handleBMPOutcome('judgment_impossible')}
                                  style={{
                                    width: '100%',
                                    padding: '12px 20px',
                                    fontSize: '17px',
                                    fontWeight: 600,
                                    background: 'var(--ov-success)',
                                    color: '#fff',
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
                                      padding: '12px 16px',
                                      fontSize: '17px',
                                      fontWeight: 600,
                                      background: 'var(--ov-sunken-strong)',
                                      color: 'var(--ov-text)',
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
                                      padding: '12px 16px',
                                      fontSize: '17px',
                                      fontWeight: 600,
                                      background: 'var(--ov-sunken-strong)',
                                      color: 'var(--ov-text)',
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
                    <div className="bmp-outcome-row" style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
                      <button
                        onClick={() => setBmpSelectedOutcome(bmpSelectedOutcome === 'successful' ? null : 'successful')}
                        style={{
                          flex: 1,
                          padding: '14px 10px',
                          fontSize: '16px',
                          fontWeight: 600,
                          background: 'var(--ov-success)',
                          color: '#fff',
                          border: '2px solid transparent',
                          boxShadow: bmpSelectedOutcome === 'successful' ? '0 0 0 3px var(--ov-card), 0 0 0 5px var(--ov-selected)' : 'none',
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
                          padding: '14px 10px',
                          fontSize: '16px',
                          fontWeight: 600,
                          background: 'var(--ov-danger)',
                          color: '#fff',
                          border: '2px solid transparent',
                          boxShadow: bmpSelectedOutcome === 'unsuccessful' ? '0 0 0 3px var(--ov-card), 0 0 0 5px var(--ov-selected)' : 'none',
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
                          padding: '14px 10px',
                          fontSize: '16px',
                          fontWeight: 600,
                          background: '#78716c',
                          color: '#fff',
                          border: '2px solid transparent',
                          boxShadow: bmpSelectedOutcome === 'judgment_impossible' ? '0 0 0 3px var(--ov-card), 0 0 0 5px var(--ov-selected)' : 'none',
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
                        border: bmpSelectedOutcome === 'successful' ? '2px solid #10b981'
                          : bmpSelectedOutcome === 'unsuccessful' ? '2px solid #f87171'
                          : '2px solid #a8a29e',
                        borderRadius: '10px',
                        padding: '12px',
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontSize: '15px', color: 'var(--muted)', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', padding: '6px 10px', background: 'var(--ov-sunken)', borderRadius: '6px' }}>
                            <span>Current:</span>
                            <span><strong className="tabular-nums">{courtScore(currentScore)}</strong> · <Volleyball /> {currentServe === 'team1' ? team1Name : team2Name}</span>
                          </div>
                          {bmpSelectedOutcome === 'successful' ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(34, 197, 94, 0.15)', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                              <span style={{ color: 'var(--ov-success)' }}>New:</span>
                              <span><strong className="tabular-nums" style={{ color: 'var(--ov-success)' }}>{courtScore(successScore)}</strong> · <Volleyball /> {successServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          ) : bmpSelectedOutcome === 'unsuccessful' ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                              <span style={{ color: 'var(--ov-danger-text)' }}>No change:</span>
                              <span><strong className="tabular-nums">{courtScore(currentScore)}</strong> · <Volleyball /> {currentServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(156, 163, 175, 0.15)', borderRadius: '6px', border: '1px solid rgba(156, 163, 175, 0.3)' }}>
                              <span style={{ color: 'var(--ov-text-muted)' }}>No change:</span>
                              <span><strong className="tabular-nums">{courtScore(currentScore)}</strong> · <Volleyball /> {currentServe === 'team1' ? team1Name : team2Name}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleBMPOutcome(bmpSelectedOutcome)}
                          style={{
                            width: '100%',
                            padding: '12px 20px',
                            fontSize: '17px',
                            fontWeight: 600,
                            background: 'var(--ov-success)',
                            color: '#fff',
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
                    padding: '14px 24px',
                    fontSize: '18px',
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

      {/* Court Switch Modal (every 7 points, every 5 in set 3; or the change
          back when the score no longer reaches a change made) - highest
          priority, blocks everything */}
      {courtSwitchModal && (
        <Modal
          title={t(courtSwitchModal.back ? 'scoreboard.modals.courtSwitchBackRequired' : 'scoreboard.modals.courtSwitchRequired')}
          open={true}
          onClose={() => { }}
          width={450}
          hideCloseButton={true}
          zIndex={2000}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--ov-success)' }}>
              {t(courtSwitchModal.back ? 'scoreboard.modals.teamsMustSwitchCourtsBack' : 'scoreboard.modals.teamsMustSwitchCourts')}
            </p>
            <div style={{ marginBottom: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {courtScoreChips(courtSwitchModal.team1Points, courtSwitchModal.team2Points)}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmCourtSwitch}
                style={{
                  flex: '1 1 0',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: 'var(--ov-success)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {t(courtSwitchModal.back ? 'scoreboard.buttons.switchCourtsBack' : 'scoreboard.buttons.switchCourts')}
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
                      setReplayRallyConfirm({ event: pointEvent, description: 'Decision Change', selectedOption: null, fromDialog: true })
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
                  background: '#fcd34d',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                {t('scoreboard.buttons.decisionChange')}
              </button>
            </div>
            {/* BMP Request for losing team (none for the change back: no point
                reached it, a point was replayed) */}
            {!courtSwitchModal.back && (() => {
              const losingTeamKey = courtSwitchModal.teamThatScored === 'team1' ? 'team2' : 'team1'
              // once per completed rally (bmpAvailability_beach)
              const bmpRemaining = dialogBmpRemaining(losingTeamKey)
              const bmpAvailable = bmpRemaining > 0

              if (!bmpAvailable) return null

              const losingTeamData = losingTeamKey === 'team1' ? data?.team1Team : data?.team2Team
              const losingTeamName = losingTeamData?.shortName || losingTeamData?.name || (losingTeamKey === 'team1' ? 'Team 1' : 'Team 2')
              const losingTeamColor = losingTeamData?.color || (losingTeamKey === 'team1' ? '#ef4444' : '#3b82f6')
              const losingTeamLabel = losingTeamKey === teamAKey ? 'A' : 'B'

              return (
                <div style={{ borderTop: '1px solid var(--ov-hairline)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleTeamBMP(losingTeamKey)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: 'transparent',
                      color: '#c2410c',
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
                      color: isLightColour(losingTeamColor) ? '#000' : '#fff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700
                    }}>
                      {losingTeamLabel}
                    </span>
                    {t('scoreboard.bmpRequest', 'BMP request')}
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
                  background: 'var(--ov-sunken)',
                  borderRadius: '8px',
                  border: '1px solid var(--ov-hairline)'
                }}>
                  {/* Team A Box */}
                  <div style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '16px',
                    background: leftTeamColor,
                    borderRadius: '8px',
                    border: '2px solid var(--ov-hairline-strong)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ov-text)', marginBottom: '4px' }}>
                      Team {leftTeamLabel}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--ov-text-secondary)', marginBottom: '8px' }}>
                      {leftTeamName}
                    </div>
                    {/* Serve ball underneath if serving */}
                    {leftIsServing && (
                      <img
                        src={ballImage} onError={(e) => e.target.src = ballImage}
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
                    border: '2px solid var(--ov-hairline-strong)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ov-text)', marginBottom: '4px' }}>
                      Team {rightTeamLabel}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--ov-text-secondary)', marginBottom: '8px' }}>
                      {rightTeamName}
                    </div>
                    {/* Serve ball underneath if serving */}
                    {rightIsServing && (
                      <img
                        src={ballImage} onError={(e) => e.target.src = ballImage}
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
                      background: 'var(--ov-sunken-strong)',
                      color: 'var(--text)',
                      border: '1px solid var(--ov-hairline-strong)',
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
                      background: 'var(--ov-sunken-strong)',
                      color: 'var(--text)',
                      border: '1px solid var(--ov-hairline-strong)',
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
                    background: 'var(--ov-success)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {t('common.confirm')}
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
          width={420}
        >
          <div className="ov-kit" data-testid="undo-confirm">
            <p className="m-0 text-sm text-stone-600">{undoConfirm.description}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={cancelUndo} className={cn(modalCancelClass, 'h-12 px-5')}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={handleUndo} className={cn(modalPrimaryClass, 'h-12 px-5')}>
                {t('scoreboard.undoConfirm.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {replayConfirm && (
        <Modal
          title={t('scoreboard.modals.confirmReplay')}
          open={true}
          onClose={cancelReplay}
          width={420}
        >
          <div className="ov-kit" data-testid="replay-confirm">
            <p className="m-0 text-sm text-stone-600">{t('scoreboard.modals.confirmReplayBody')}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={cancelReplay} className={cn(modalCancelClass, 'h-12 px-5')}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={confirmReplay} className={cn(modalPrimaryClass, 'h-12 px-5')}>
                {t('scoreboard.buttons.replay')}
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
              background: 'var(--ov-success)',
              color: '#fff',
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
                Last point was assigned to <strong><span style={{ background: oldTeamColor, color: isLightColour(oldTeamColor) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginRight: '4px' }}>{oldTeamLabel}</span>{oldTeamName}</strong>
              </p>

              {/* Horizontal radio buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {/* Option 1: Swap */}
                <div
                  onClick={() => setReplayRallyConfirm({ ...replayRallyConfirm, selectedOption: 'swap' })}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: selectedOption === 'swap' ? 'rgba(234, 179, 8, 0.2)' : 'var(--ov-sunken)',
                    border: selectedOption === 'swap' ? '2px solid #eab308' : '1px solid var(--ov-hairline)',
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
                    border: selectedOption === 'swap' ? '5px solid #eab308' : '2px solid var(--ov-hairline-strong)',
                    background: selectedOption === 'swap' ? '#fcd34d' : 'transparent',
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
                    background: selectedOption === 'replay' ? 'rgba(234, 179, 8, 0.2)' : 'var(--ov-sunken)',
                    border: selectedOption === 'replay' ? '2px solid #eab308' : '1px solid var(--ov-hairline)',
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
                    border: selectedOption === 'replay' ? '5px solid #eab308' : '2px solid var(--ov-hairline-strong)',
                    background: selectedOption === 'replay' ? '#fcd34d' : 'transparent',
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
                    <div style={{ background: 'var(--ov-sunken-strong)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--ov-hairline-strong)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: team1Color, color: isLightColour(team1Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team1Label}</span>
                      <strong>{team1TeamName} {currentteam1Points} : {currentteam2Points} {team2TeamName}</strong>
                      <span style={{ background: team2Color, color: isLightColour(team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team2Label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '55px', textAlign: 'right' }}>New:</span>
                    <div style={{ background: 'rgba(34, 197, 94, 0.15)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: team1Color, color: isLightColour(team1Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team1Label}</span>
                      <strong style={{ color: 'var(--ov-success)' }}>
                        {team1TeamName} {selectedOption === 'swap' ? swapteam1Points : replayteam1Points} : {selectedOption === 'swap' ? swapteam2Points : replayteam2Points} {team2TeamName}
                      </strong>
                      <span style={{ background: team2Color, color: isLightColour(team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{team2Label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '55px', textAlign: 'right' }}>Serve:</span>
                    <span style={{ fontSize: '16px' }}><Volleyball /></span>
                    <span style={{ background: (selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1Color : team2Color, color: isLightColour((selectedOption === 'swap' ? swapServeTeam : replayServeTeam) === 'team1' ? team1Color : team2Color) ? '#000' : '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
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
                    background: '#fcd34d',
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
                    background: 'var(--ov-sunken-strong)',
                    color: 'var(--text)',
                    border: '1px solid var(--ov-hairline-strong)',
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
        <SignaturePad
          open={true}
          title={`Captain Signature - ${postMatchSignature === 'team1-captain' ? (data?.team1Players?.find(p => p.isCaptain || p.captain)?.name || data?.team1Team?.name || 'team1') : (data?.team2Players?.find(p => p.isCaptain || p.captain)?.name || data?.team2Team?.name || 'team2')}`}
          onSave={async (signatureDataUrl, meta) => {
            const fieldName = postMatchSignature === 'team1-captain' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature'
            // saved and queued for the cloud at once, with its source, as
            // MatchEnd saves one (OpenVolley's scoring screen does the same)
            await saveMatchSignature(db, matchId, fieldName, signatureDataUrl, signatureSourceUpdate(fieldName, signatureDataUrl, meta))
            setPostMatchSignature(null)
          }}
          onClose={() => setPostMatchSignature(null)}
        />
      )}

    </div>
  )
}

function ScoreboardToolbar({ children, collapsed, onToggle }) {
  const { t } = useTranslation()
  const label = collapsed
    ? t('scoreboard.showHeader', 'Show the header')
    : t('scoreboard.hideHeader', 'Hide the header')
  const Chevron = collapsed ? ChevronDown : ChevronUp
  return (
    <div style={{ position: 'relative', zIndex: 101 }}>
      <div
        className="match-toolbar"
        style={{
          display: collapsed ? 'none' : 'grid',
          transition: 'all 0.2s ease'
        }}
      >
        {children}
      </div>
      {/* Thin collapse/expand tab at bottom center, over the page (no row of its own) */}
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        aria-expanded={!collapsed}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        data-testid="header-toggle"
        // a small tab hanging under the toolbar: it took a 16 px row of its own
        // above the score
        style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)' }}
        className={cn('flex w-12 h-4 items-center justify-center rounded-b-md cursor-pointer text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors', FOCUS_RING)}
      >
        <Chevron size={14} strokeWidth={2.5} aria-hidden="true" />
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

function SetStartTimeModal({ setIndex, defaultTime, scheduledTime = null, onConfirm, onCancel }) {
  const { t } = useTranslation()
  const [time, setTime] = useState(() => {
    // Extract local time from UTC ISO string
    const { time: localTime } = splitLocalDateTime(defaultTime)
    return localTime
  })

  const handleConfirm = () => {
    // Validate time format (HH:MM, 24-hour)
    const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      toast.error(t('scoreboard.confirm.invalidTimeFormat'))
      return
    }
    // The entered time on the day nearest to the proposed time (a 00:12
    // typed under a proposed 23:30 of the day before is today)
    const { date } = splitLocalDateTime(defaultTime)
    const isoString = typedStartNear(defaultTime, time) ?? parseLocalDateTimeToISO(date, time)
    onConfirm(isoString)
  }

  return (
    <Modal
      title={t('scoreboard.modals.setStartTime', { set: setIndex, defaultValue: 'Set {{set}} start time' })}
      open={true}
      onClose={onCancel}
      width={400}
      hideCloseButton={true}
    >
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ marginBottom: '24px', fontSize: '16px' }}>
          Confirm the start time for Set {setIndex}:
        </p>
        <TimeInput24
          value={time}
          onChange={setTime}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
            marginBottom: '8px',
            width: '150px',
            fontFamily: 'monospace',
            letterSpacing: '2px'
          }}
        />
        {/* Set 1: a time other than the scheduled one goes to the remarks */}
        {scheduledTime && time !== scheduledTime && (
          <p data-testid="actual-start-time-note" style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text)' }}>
              {t('scoreboard.modals.actualStartTime', 'Actual start time')}: {time}
            </strong>
            <br />
            {t('scoreboard.modals.actualStartTimeNote', { time: scheduledTime, defaultValue: 'A time other than the scheduled {{time}} goes to the remarks.' })}
          </p>
        )}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={handleConfirm}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              background: 'var(--ov-success)',
              color: '#fff',
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
              background: 'var(--ov-sunken-strong)',
              color: 'var(--text)',
              border: '1px solid var(--ov-hairline-strong)',
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

function SetEndTimeModal({ setIndex, winner, team1Points, team2Points, defaultTime, teamAKey, leftisTeam1, isMatchEnd, team1TeamName, team2TeamName, team1TeamColor, team2TeamColor, losingTeamBmpRemaining, onBmpRequest, onConfirm, onDecisionChange }) {
  const { t } = useTranslation()
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
  // A / B from the coin toss (it was taken from the side: "B" in team A's colour)
  const loserTeamLabel = loserTeam === (teamAKey || 'team1') ? 'A' : 'B'

  // Calculate left and right team names and scores
  const leftTeamName = leftisTeam1 ? team1TeamName : team2TeamName
  const rightTeamName = leftisTeam1 ? team2TeamName : team1TeamName
  const leftScore = leftisTeam1 ? team1Points : team2Points
  const rightScore = leftisTeam1 ? team2Points : team1Points

  const handleConfirm = () => {
    if (isConfirming) return // Prevent double-clicks
    // Validate time format (HH:MM, 24-hour)
    const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      toast.error(t('scoreboard.confirm.invalidTimeFormat'))
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
      title={isMatchEnd ? t('scoreboard.modals.matchEnd', 'Match end') : t('scoreboard.modals.setEnd', { set: setIndex, defaultValue: 'Set {{set}} end' })}
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
            color: isLightColour(leftisTeam1 ? team1TeamColor : team2TeamColor) ? '#000' : '#fff'
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
            color: isLightColour(leftisTeam1 ? team2TeamColor : team1TeamColor) ? '#000' : '#fff'
          }}>
            {leftisTeam1 ? (teamAKey === 'team2' ? 'A' : 'B') : (teamAKey === 'team1' ? 'A' : 'B')}
          </span>
        </div>
        <p style={{ marginBottom: '24px', fontSize: '16px', fontWeight: 600, color: 'var(--ov-success)' }}>
          {isMatchEnd ? `${winnerTeamName} won the Match!` : `${winnerTeamName} wins!`}
        </p>
        <p style={{ marginBottom: '16px', fontSize: '16px' }}>
          Confirm the end time:
        </p>
        <TimeInput24
          value={time}
          onChange={setTime}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
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
              background: isConfirming ? 'var(--muted)' : 'var(--ov-success)',
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
              background: '#fcd34d',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: isConfirming ? 'not-allowed' : 'pointer',
              opacity: isConfirming ? 0.7 : 1
            }}
          >
            {t('scoreboard.buttons.decisionChange', 'Decision change')}
          </button>
        </div>
        {/* BMP Request button for losing team */}
        {losingTeamBmpRemaining > 0 && (
          <div style={{ borderTop: '1px solid var(--ov-hairline)', paddingTop: '16px' }}>
            <button
              onClick={() => onBmpRequest(loserTeam)}
              disabled={isConfirming}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                background: 'var(--ov-card)',
                color: '#c2410c',
                border: '2px solid #f97316',
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
                color: isLightColour(loserTeamColor) ? '#000' : '#fff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700
              }}>
                {loserTeamLabel}
              </span>
              {t('scoreboard.bmpRequest', 'BMP request')}
              <span style={{
                background: '#f97316',
                color: '#000',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700
              }}>{losingTeamBmpRemaining}</span>
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
