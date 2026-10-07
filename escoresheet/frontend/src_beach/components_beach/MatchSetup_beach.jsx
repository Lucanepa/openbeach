import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { useAuth } from '../contexts_beach/AuthContext_beach'
import { db } from '../db_beach/db_beach'
import SignaturePad from './SignaturePad_beach'
import RefereeSelector from './RefereeSelector_beach'
import CountrySelect from './CountrySelect_beach'
import CountryFlag from './CountryFlag_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { isBackendAvailable, getCloudApiUrl, BEACH_DESKTOP_HTTP_PORT } from '../utils_beach/backendConfig_beach'
import { scorerPublisher, readRelayBundle } from '../utils_beach/relayPublisher_beach'
import { exportMatchData } from '../utils_beach/backupManager_beach'
import { uploadBackupToCloud, uploadLogsToCloud } from '../utils_beach/logger_beach'
import { apiFrom } from '../lib_beach/apiClient_beach'
import { setExtId } from '../utils_beach/syncIds_beach'
import { buildConnectionPins } from '../utils_beach/connectionPins_beach'
import { cloudSyncWaitNow } from '../utils_beach/cloudStatus_beach'
import { COMPETITIONS_ENABLED } from '../utils_beach/features_beach'
import { generateMatchSeedKey } from '../utils_beach/serverDataSync_beach'
import { TEST_TEAM_SEED_DATA } from '../constants_beach/testSeeds_beach'
import { splitLocalDateTime, parseLocalDateTimeToISO, roundToMinute } from '../utils_beach/timeUtils_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'
import { useSavedTeams as useSavedTeams_beach } from '../hooks_beach/useSavedTeams_beach'
import SavedTeamPickerModal from './SavedTeamPickerModal_beach'
import { savedTeamToBeachRoster, rosterHasNames, findBeachTeamSuggestions } from '../utils_beach/savedTeams_beach'
import { ArrowLeft, Check, ChevronDown, ChevronUp, ClipboardList, Database, FileText, Loader2, RotateCcw, Users } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { Button, FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { Field } from '../ui/volleyui/Field.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import { Select } from '../ui/volleyui/Select.jsx'
import { Switch } from '../ui/volleyui/Switch.jsx'
import { KeyValue } from '../ui/volleyui/KeyValue.jsx'
import { SectionHeader } from '../ui/volleyui/SectionHeader.jsx'
import { Modal as KitModal, modalCancelClass, modalPrimaryClass, modalSaveClass } from '../ui/volleyui/Modal.jsx'

// ---- volleyui class strings for the setup views --------------------------
// A section inside the setup page card (match info, officials, dashboards,
// team panels): the kit Block, sunken stone-50/60 with a hairline and no
// shadow (volleyui: never a card in a card). As OpenVolley's MatchSetup.
const SETUP_BLOCK = 'rounded-xl border border-stone-200/70 bg-stone-50/60'
// Block heading (card heading scale).
const BLOCK_TITLE = 'm-0 text-base font-semibold text-stone-900'
// Summary definition list inside a block: label left, value left-aligned.
const SUMMARY_KV = 'self-start text-sm gap-y-1.5 [&_dt]:whitespace-nowrap [&_dd]:text-left'
const TRUNC = 'block truncate'
// Field wrapper inside the editors: the label sits tight over its control.
const FIELD = 'min-w-0'
// One official box in the officials editor (kit Block + heading strip).
const OFFICIAL_BOX = 'rounded-xl border border-stone-200/70 bg-stone-50/60 overflow-hidden'
const OFFICIAL_HEAD = `flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2 text-left hover:bg-stone-100/70 transition-colors cursor-pointer ${FOCUS_RING}`
// A 44 px courtside control (tablet setup forms).
const TOUCH = 'h-11'
// The setup page's dialogs sit above the legacy header (z-index 1000), like
// the legacy modals they replace.
const DIALOG_LAYER = { position: 'relative', zIndex: 1000 }
// Captain / C toggle: the emerald "done" state when chosen (a domain marker,
// kept from the legacy green), a quiet outline otherwise.
const CAPTAIN_ON = 'border-emerald-600 bg-emerald-50 text-emerald-700'
const CAPTAIN_OFF = 'border-stone-300 bg-white text-stone-400 hover:bg-stone-50'
// One roster row: number toggles, last / first name, (date of birth), C,
// Clear. On a phone the row stacks: numbers, C and Clear on top, one field
// per line under them (the fields carry their names as placeholders).
const ROSTER_GRID = 'grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)_44px_auto]'
const ROSTER_GRID_DOB = 'sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)_170px_44px_auto]'

// Date formatting helpers (outside component to avoid recreation)
function formatDateToDDMMYYYY(dateStr) {
  if (!dateStr) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    return dateStr.replace(/\./g, '/')
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }
  return dateStr
}

function formatDateToISO(dateStr) {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/')
    return `${year}-${month}-${day}`
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('.')
    return `${year}-${month}-${day}`
  }
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return dateStr
}

// Helper to safely parse a date and extract components for input fields
// Uses UTC methods to avoid timezone conversion - time is stored and displayed as-entered
// Parse UTC ISO string to local date and time for display/editing
function safeParseScheduledAt(scheduledAt) {
  return splitLocalDateTime(scheduledAt)
}

// Helper to build officials array, filtering out entries with no name
function buildOfficialsArray(ref1, ref2, scorer, asst, lineJudges = {}, useSnakeCase = false) {
  const officials = []
  const fnKey = useSnakeCase ? 'first_name' : 'firstName'
  const lnKey = useSnakeCase ? 'last_name' : 'lastName'

  // Add main officials only if they have a name
  if (ref1?.firstName || ref1?.lastName || ref1?.first_name || ref1?.last_name) {
    officials.push({ role: '1st referee', [fnKey]: ref1.firstName || ref1.first_name || '', [lnKey]: ref1.lastName || ref1.last_name || '', country: ref1.country || null, dob: ref1.dob || null })
  }
  if (ref2?.firstName || ref2?.lastName || ref2?.first_name || ref2?.last_name) {
    officials.push({ role: '2nd referee', [fnKey]: ref2.firstName || ref2.first_name || '', [lnKey]: ref2.lastName || ref2.last_name || '', country: ref2.country || null, dob: ref2.dob || null })
  }
  if (scorer?.firstName || scorer?.lastName || scorer?.first_name || scorer?.last_name) {
    officials.push({ role: 'scorer', [fnKey]: scorer.firstName || scorer.first_name || '', [lnKey]: scorer.lastName || scorer.last_name || '', country: scorer.country || null, dob: scorer.dob || null })
  }
  if (asst?.firstName || asst?.lastName || asst?.first_name || asst?.last_name) {
    officials.push({ role: 'assistant scorer', [fnKey]: asst.firstName || asst.first_name || '', [lnKey]: asst.lastName || asst.last_name || '', country: asst.country || null, dob: asst.dob || null })
  }

  // Add line judges if present
  if (lineJudges.lj1) officials.push({ role: 'line judge 1', name: lineJudges.lj1 })
  if (lineJudges.lj2) officials.push({ role: 'line judge 2', name: lineJudges.lj2 })
  if (lineJudges.lj3) officials.push({ role: 'line judge 3', name: lineJudges.lj3 })
  if (lineJudges.lj4) officials.push({ role: 'line judge 4', name: lineJudges.lj4 })

  return officials
}

// Helper to validate and create a UTC ISO string from local date and time inputs
// Treats user input as LOCAL time and converts to UTC for storage
// Throws an error if the date/time is invalid (unless allowEmpty is true and both are empty)
function createScheduledAt(date, time, options = {}) {
  const { allowEmpty = false } = options

  // If no date/time and allowEmpty, return null
  if (!date && !time) {
    if (allowEmpty) return null
    throw new Error('Date is required')
  }

  // Date is required if time is set
  if (!date && time) {
    throw new Error('Date is required when time is set')
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: "${date}". Expected YYYY-MM-DD.`)
  }

  // Validate date components are reasonable
  const [year, month, day] = date.split('-').map(Number)
  if (year < 1900 || year > 2100) {
    throw new Error(`Invalid year: ${year}. Must be between 1900 and 2100.`)
  }
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`)
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day}. Must be between 1 and 31.`)
  }

  // Validate time format (HH:MM) if provided
  const timeToUse = time || '00:00'
  if (!/^\d{2}:\d{2}$/.test(timeToUse)) {
    throw new Error(`Invalid time format: "${time}". Expected HH:MM.`)
  }

  // Validate time components
  const [hours, minutes] = timeToUse.split(':').map(Number)
  if (hours < 0 || hours > 23) {
    throw new Error(`Invalid hour: ${hours}. Must be between 0 and 23.`)
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Must be between 0 and 59.`)
  }

  // Parse as LOCAL time and convert to UTC ISO string
  // This ensures user enters 14:00 local → stored as 13:00Z (in UTC+1)
  const isoString = parseLocalDateTimeToISO(date, timeToUse)
  if (!isoString) {
    throw new Error(`Invalid date/time combination: ${date} ${timeToUse}`)
  }

  return isoString
}

// Helper to check if two values are equal (handles objects and arrays)
function isEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

// Helper to check if match info has changed
function hasMatchInfoChanged(original, current) {
  if (!original) return true // No original, consider it changed
  const keys = ['date', 'time', 'hall', 'city', 'type2', 'gameN', 'league', 'team1Name', 'team2Name', 'team1Color', 'team2Color', 'team1ShortName', 'team2ShortName', 'hasCoach']
  for (const key of keys) {
    if (!isEqual(original[key], current[key])) return true
  }
  return false
}

// Helper to check if officials have changed
function hasOfficialsChanged(original, current) {
  if (!original) return true
  const keys = ['ref1First', 'ref1Last', 'ref1Country', 'ref1Dob',
    'ref2First', 'ref2Last', 'ref2Country', 'ref2Dob',
    'scorerFirst', 'scorerLast', 'scorerCountry', 'scorerDob',
    'asstFirst', 'asstLast', 'asstCountry', 'asstDob',
    'lineJudge1', 'lineJudge2', 'lineJudge3', 'lineJudge4']
  for (const key of keys) {
    if (!isEqual(original[key], current[key])) return true
  }
  return false
}

// Helper to check if roster has changed
function hasRosterChanged(originalRoster, currentRoster) {
  if (!originalRoster) return true
  return !isEqual(originalRoster, currentRoster)
}

// Get test team data from testSeeds.js
const TEST_TEAM_1 = TEST_TEAM_SEED_DATA.find(t => t.seedKey === 'test-team-1')
const TEST_TEAM_2 = TEST_TEAM_SEED_DATA.find(t => t.seedKey === 'test-team-2')

// OfficialCard component - defined outside to prevent focus loss on re-render
const OfficialCard = memo(function OfficialCard({
  title,
  officialKey,
  lastName,
  firstName,
  country,
  dob,
  setLastName,
  setFirstName,
  setCountry,
  setDob,
  hasDatabase = false,
  selectorKey = null,
  isExpanded,
  onToggleExpanded,
  onOpenDatabase,
  manageDob = false,
  t
}) {
  const displayName = lastName || firstName
    ? `${lastName || ''}${firstName ? ', ' + firstName.charAt(0) + '.' : ''}`
    : t('matchSetup.notSet')

  const cardRef = useRef(null)
  useEffect(() => {
    if (isExpanded && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [isExpanded])

  return (
    <div ref={cardRef} className={OFFICIAL_BOX}>
      <div className={cn('flex items-stretch', isExpanded && 'border-b border-stone-200/70')}>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          className={cn(OFFICIAL_HEAD, 'flex-1')}
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="whitespace-nowrap text-sm font-semibold text-stone-700">{title}</span>
            {!isExpanded && (
              <span className="truncate text-sm text-stone-500">{displayName}</span>
            )}
          </span>
          {isExpanded ? <ChevronUp size={16} className="shrink-0 text-stone-400" aria-hidden="true" /> : <ChevronDown size={16} className="shrink-0 text-stone-400" aria-hidden="true" />}
        </button>
        {hasDatabase && isExpanded && (
          <div className="flex items-center pr-3">
            <Button
              variant="ghost"
              size="sm"
              icon={Database}
              className="bg-white"
              onClick={(e) => {
                e.stopPropagation()
                onOpenDatabase(e, selectorKey)
              }}
            >
              {t('matchSetup.database')}
            </Button>
          </div>
        )}
      </div>
      {isExpanded && (
        <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <Field tone="compact" className={FIELD} label={t('matchSetup.lastName')}><Input size="lg" className="capitalize" value={lastName} onChange={e => setLastName(e.target.value)} /></Field>
          <Field tone="compact" className={FIELD} label={t('matchSetup.firstName')}><Input size="lg" className="capitalize" value={firstName} onChange={e => setFirstName(e.target.value)} /></Field>
          <Field tone="compact" className={FIELD} label={t('matchSetup.country')}><Input size="lg" value={country} onChange={e => setCountry(e.target.value)} /></Field>
          {manageDob && <Field tone="compact" className={FIELD} label={t('matchSetup.dateOfBirth')}><Input size="lg" type="date" value={dob ? formatDateToISO(dob) : ''} onChange={e => setDob(e.target.value ? formatDateToDDMMYYYY(e.target.value) : '')} /></Field>}
        </div>
      )}
    </div>
  )
})

// LineJudgesCard component - defined outside to prevent focus loss on re-render
const LineJudgesCard = memo(function LineJudgesCard({
  lineJudge1,
  lineJudge2,
  lineJudge3,
  lineJudge4,
  setLineJudge1,
  setLineJudge2,
  setLineJudge3,
  setLineJudge4,
  isExpanded,
  onToggleExpanded,
  t
}) {
  const filledCount = [lineJudge1, lineJudge2, lineJudge3, lineJudge4].filter(Boolean).length
  const displayText = filledCount > 0 ? t('matchSetup.set', { count: filledCount }) : t('matchSetup.notSet')

  const cardRef = useRef(null)
  useEffect(() => {
    if (isExpanded && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [isExpanded])

  return (
    <div ref={cardRef} className={OFFICIAL_BOX}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={isExpanded}
        className={cn(OFFICIAL_HEAD, isExpanded && 'border-b border-stone-200/70')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-sm font-semibold text-stone-700">{t('matchSetup.lineJudges')}</span>
          {!isExpanded && (
            <span className="truncate text-sm text-stone-500">{displayText}</span>
          )}
        </span>
        {isExpanded ? <ChevronUp size={16} className="shrink-0 text-stone-400" aria-hidden="true" /> : <ChevronDown size={16} className="shrink-0 text-stone-400" aria-hidden="true" />}
      </button>
      {isExpanded && (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field tone="compact" className={FIELD} label={t('matchSetup.lineJudge1')}><Input size="lg" className="capitalize" value={lineJudge1} onChange={e => setLineJudge1(e.target.value)} placeholder={t('matchSetup.name')} /></Field>
          <Field tone="compact" className={FIELD} label={t('matchSetup.lineJudge2')}><Input size="lg" className="capitalize" value={lineJudge2} onChange={e => setLineJudge2(e.target.value)} placeholder={t('matchSetup.name')} /></Field>
          <Field tone="compact" className={FIELD} label={t('matchSetup.lineJudge3')}><Input size="lg" className="capitalize" value={lineJudge3} onChange={e => setLineJudge3(e.target.value)} placeholder={t('matchSetup.name')} /></Field>
          <Field tone="compact" className={FIELD} label={t('matchSetup.lineJudge4')}><Input size="lg" className="capitalize" value={lineJudge4} onChange={e => setLineJudge4(e.target.value)} placeholder={t('matchSetup.name')} /></Field>
        </div>
      )}
    </div>
  )
})

// Helper to capitalize first letter of each word (e.g. "del solar" -> "Del Solar")
function toTitleCase(str) {
  if (!str) return ''
  return str.replace(/(^|[\s-])(\S)/g, (m, pre, c) => pre + c.toUpperCase())
}

// Helper to generate short name from team name — use full name for beach
function generateShortName(name) {
  if (!name) return ''
  return name.trim().toUpperCase()
}

// Helper to convert DOB from DD.MM.YYYY to YYYY-MM-DD for Supabase date columns
function formatDobForSync(dob) {
  if (!dob) return null
  // Already in ISO format (YYYY-MM-DD)?
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob
  // DD.MM.YYYY format?
  const match = dob.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  // DD/MM/YYYY format?
  const match2 = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match2) {
    const [, day, month, year] = match2
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return null // Unknown format, don't sync
}

export default function MatchSetup({ onStart, matchId, onReturn, onOpenOptions, onOpenCoinToss, offlineMode = false, onLoadCompetitionMatch }) {
  const { t } = useTranslation()
  const { scaleFactor: baseScaleFactor } = useScaledLayout()
  const scaleFactor = baseScaleFactor * 1.25
  const s = (px) => Math.round(px * scaleFactor)
  // The kit's Tailwind steps (spacing, text sizes) follow the user's display
  // scale too: Tailwind v4 utilities read --spacing / --text-* at use site
  // (as OpenVolley's MatchSetup).
  const kitScale = useMemo(() => (baseScaleFactor === 1 ? undefined : {
    '--spacing': `${0.25 * baseScaleFactor}rem`,
    '--text-xs': `${0.75 * baseScaleFactor}rem`,
    '--text-sm': `${0.875 * baseScaleFactor}rem`,
    '--text-base': `${1 * baseScaleFactor}rem`,
    '--text-lg': `${1.125 * baseScaleFactor}rem`,
    '--text-xl': `${1.25 * baseScaleFactor}rem`,
    '--text-2xl': `${1.5 * baseScaleFactor}rem`
  }), [baseScaleFactor])
  const { showAlert } = useAlert()
  const { user, profile, getCachedProfile, access } = useAuth()
  const [team1Name, setTeam1Name] = useState('')
  // Match created popup state
  const [matchCreatedModal, setMatchCreatedModal] = useState(null) // { matchId, gamePin, refereePin, team1Pin, team2Pin }
  const [team2Name, setTeam2Name] = useState('')

  // Match info fields - Beach volleyball specific
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [dateError, setDateError] = useState('')
  const [timeError, setTimeError] = useState('')
  const [league, setLeague] = useState('') // Name of competition
  const [gameN, setGameN] = useState('') // Match No.
  const [gameNError, setGameNError] = useState('') // Duplicate game number error
  const [city, setCity] = useState('') // Site
  const [hall, setHall] = useState('') // Beach
  const [court, setCourt] = useState('') // Court
  const [type2, setType2] = useState('men') // Gender: men | women
  const [hasCoach, setHasCoach] = useState(false) // Whether coaches are present
  const manageDob = localStorage.getItem('manageDob') === 'true'
  const [phase, setPhase] = useState('main') // Phase: main (Main Draw) | qualification
  const [round, setRound] = useState('pool') // Round: pool | winner | class | semifinals | finals
  const [team1Color, setTeam1Color] = useState('#ef4444')
  const [team2Color, setTeam2Color] = useState('#3b82f6')
  const [team1Country, setTeam1Country] = useState('') // 3-letter country code
  const [team2Country, setTeam2Country] = useState('') // 3-letter country code
  const [team1ShortName, setTeam1ShortName] = useState('')
  const [team2ShortName, setTeam2ShortName] = useState('')
  const [notificationEmail, setNotificationEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Match info confirmation state - other sections are disabled until confirmed
  const [matchInfoConfirmed, setMatchInfoConfirmed] = useState(false)

  // Check if match info can be confirmed (all required fields filled)
  const requireEmail = import.meta.env.VITE_REQUIRE_EMAIL === 'true'
  const canConfirmMatchInfo = Boolean(
    date?.trim() &&      // Date must be filled
    !dateError &&        // Date must be valid
    time?.trim() &&      // Time must be filled
    !timeError &&        // Time must be valid
    gameN?.trim() &&     // Game # must be filled
    !gameNError &&       // Game # must not be a duplicate
    league?.trim() &&    // League must be filled
    city?.trim() &&      // City must be filled
    (!requireEmail || notificationEmail?.trim())  // Email required if VITE_REQUIRE_EMAIL=true
  )

  // Generate dynamic tooltip showing which fields are missing
  const getMissingFieldsTooltip = () => {
    const missing = []
    if (!date?.trim()) missing.push(t('matchSetup.date') || 'Date')
    else if (dateError) missing.push(t('matchSetup.date') + ' (invalid)')
    if (!time?.trim()) missing.push(t('matchSetup.time') || 'Time')
    else if (timeError) missing.push(t('matchSetup.time') + ' (invalid)')
    if (!gameN?.trim()) missing.push(t('matchSetup.gameNumber') || 'Game #')
    else if (gameNError) missing.push(t('matchSetup.gameNumber') + ' (duplicate)')
    if (!league?.trim()) missing.push(t('matchSetup.league') || 'League')
    if (!city?.trim()) missing.push(t('matchSetup.city') || 'City')
    if (requireEmail && !notificationEmail?.trim()) missing.push(t('matchSetup.notificationEmail') || 'Email')

    if (missing.length === 0) return ''
    return `${t('matchSetup.required') || 'Required'}: ${missing.join(', ')}`
  }

  // Rosters
  const [team1Roster, setTeam1Roster] = useState([])
  const [team2Roster, setTeam2Roster] = useState([])

  // Helper function to get team display name from roster (player1 - player2 last names + country)
  const getTeamDisplayName = (roster, fallbackKey, country = '') => {
    if (roster.length === 2) {
      const p1LastName = roster[0]?.lastName || ''
      const p2LastName = roster[1]?.lastName || ''
      if (p1LastName && p2LastName) {
        return `${toTitleCase(p1LastName)} / ${toTitleCase(p2LastName)}`
      }
    }
    return t(`matchSetup.${fallbackKey}`)
  }

  const rosterLoadedFromDraft = useRef({ team1: false, team2: false })
  const [team1Num, setTeam1Num] = useState('')
  const [team1First, setTeam1First] = useState('')
  const [team1Last, setTeam1Last] = useState('')
  const [team1Dob, setTeam1Dob] = useState('')
  const [team1CaptainForm, setTeam1CaptainForm] = useState(false)

  const [team2Num, setTeam2Num] = useState('')
  const [team2First, setTeam2First] = useState('')
  const [team2Last, setTeam2Last] = useState('')
  const [team2Dob, setTeam2Dob] = useState('')
  const [team2CaptainForm, setTeam2CaptainForm] = useState(false)

  // Officials
  const [ref1First, setRef1First] = useState('')
  const [ref1Last, setRef1Last] = useState('')
  const [ref1Country, setRef1Country] = useState('CHE')
  const [ref1Dob, setRef1Dob] = useState('01.01.1900')

  const [ref2First, setRef2First] = useState('')
  const [ref2Last, setRef2Last] = useState('')
  const [ref2Country, setRef2Country] = useState('CHE')
  const [ref2Dob, setRef2Dob] = useState('01.01.1900')

  const [scorerFirst, setScorerFirst] = useState('')
  const [scorerLast, setScorerLast] = useState('')
  const [scorerCountry, setScorerCountry] = useState('CHE')
  const [scorerDob, setScorerDob] = useState('01.01.1900')

  const [asstFirst, setAsstFirst] = useState('')
  const [asstLast, setAsstLast] = useState('')
  const [asstCountry, setAsstCountry] = useState('CHE')
  const [asstDob, setAsstDob] = useState('01.01.1900')

  // Line Judges (only names needed)
  const [lineJudge1, setLineJudge1] = useState('')
  const [lineJudge2, setLineJudge2] = useState('')
  const [lineJudge3, setLineJudge3] = useState('')
  const [lineJudge4, setLineJudge4] = useState('')

  // Track which official cards are expanded (single accordion)
  const [expandedOfficialId, setExpandedOfficialId] = useState(null)
  const toggleOfficialExpanded = (key) => {
    setExpandedOfficialId(prev => prev === key ? null : key)
  }

  // UI state for views
  const [currentView, setCurrentView] = useState('main') // 'main', 'info', 'officials', 'team1', 'team2'
  const [openSignature, setOpenSignature] = useState(null) // 'team1-captain', 'team2-captain' (beach volleyball only has captain signatures)
  const [showRoster, setShowRoster] = useState({ team1: false, team2: false })
  const [colorPickerModal, setColorPickerModal] = useState(null) // { team: 'team1'|'team2', position: { x, y } } | null
  const [noticeModal, setNoticeModal] = useState(null) // { message: string, type?: 'success' | 'error' } | null
  const [testRosterConfirm, setTestRosterConfirm] = useState(null) // 'team1' | 'team2' | null

  // Saved beach teams (managed in the OpenVolley admin console; read-only
  // here, from the offline cache). Only approved accounts read them.
  const canReadSavedTeams = !!access?.canReadTeams
  const { teams: savedTeams } = useSavedTeams_beach({
    userId: user?.id ?? null,
    access,
    enabled: canReadSavedTeams,
    refreshOnMount: true
  })
  const [savedPicker, setSavedPicker] = useState(null) // null | 'team1' | 'team2'
  const [savedReplace, setSavedReplace] = useState(null) // null | { side, row }
  const [suggestionDismissed, setSuggestionDismissed] = useState({ team1: false, team2: false })

  // Show both rosters in match setup
  const [showBothRosters, setShowBothRosters] = useState(false)

  // Referee connection (read from match object, no local state needed)
  const [editPinModal, setEditPinModal] = useState(false)
  const [editPinType, setEditPinType] = useState(null) // 'referee'
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Remote roster search state
  const [rosterPreview, setRosterPreview] = useState(null) // 'team1' | 'team2' | null

  // Referee selector state
  const [showRefereeSelector, setShowRefereeSelector] = useState(null) // 'ref1' | 'ref2' | null
  const [refereeSelectorPosition, setRefereeSelectorPosition] = useState({})
  const rosterLoadedRef = useRef(false) // Track if roster has been loaded to prevent overwriting user edits
  const team1InputRef = useRef(null)
  const team2InputRef = useRef(null)
  const team1MeasureRef = useRef(null)
  const team2MeasureRef = useRef(null)

  // Refs to store original state for discard on Back button
  const originalMatchInfoRef = useRef(null)
  const originalOfficialsRef = useRef(null)
  const originalTeam1Ref = useRef(null)
  const originalTeam2Ref = useRef(null)

  // Server state
  const [serverRunning, setServerRunning] = useState(false)
  const [serverStatus, setServerStatus] = useState(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [instanceId] = useState(() => `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

  // Sync status tracking for cards
  // 'idle' = no sync needed, 'syncing' = sync in progress, 'synced' = synced successfully, 'error' = sync failed
  const [matchInfoSyncStatus, setMatchInfoSyncStatus] = useState('idle')
  const [officialsSyncStatus, setOfficialsSyncStatus] = useState('idle')
  const [team1SyncStatus, setTeam1SyncStatus] = useState('idle')
  const [team2SyncStatus, setTeam2SyncStatus] = useState('idle')
  const [isSupabaseAvailable, setIsSupabaseAvailable] = useState(false)

  // All 162 municipalities (Gemeinden) of Kanton Zürich
  const citiesZurich = [
    // Bezirk Affoltern
    'Aeugst am Albis', 'Affoltern am Albis', 'Bonstetten', 'Hausen am Albis', 'Hedingen',
    'Kappel am Albis', 'Knonau', 'Maschwanden', 'Mettmenstetten', 'Obfelden', 'Ottenbach',
    'Rifferswil', 'Stallikon', 'Wettswil am Albis',
    // Bezirk Andelfingen
    'Adlikon', 'Andelfingen', 'Benken', 'Berg am Irchel', 'Buch am Irchel', 'Dachsen',
    'Dorf', 'Feuerthalen', 'Flaach', 'Flurlingen', 'Henggart', 'Humlikon', 'Kleinandelfingen',
    'Laufen-Uhwiesen', 'Marthalen', 'Oberstammheim', 'Ossingen', 'Rheinau',
    'Thalheim an der Thur', 'Trüllikon', 'Truttikon', 'Unterstammheim', 'Volken',
    // Bezirk Bülach
    'Bachenbülach', 'Bassersdorf', 'Bülach', 'Dietlikon', 'Eglisau', 'Embrach',
    'Freienstein-Teufen', 'Glattfelden', 'Hochfelden', 'Höri', 'Hüntwangen', 'Kloten',
    'Lufingen', 'Nürensdorf', 'Oberembrach', 'Opfikon', 'Rafz', 'Rorbas', 'Wallisellen',
    'Wasterkingen', 'Wil', 'Winkel',
    // Bezirk Dielsdorf
    'Bachs', 'Buchs', 'Dällikon', 'Dänikon', 'Dielsdorf', 'Hüttikon', 'Neerach',
    'Niederglatt', 'Niederhasli', 'Niederweningen', 'Oberglatt', 'Oberweningen',
    'Otelfingen', 'Regensdorf', 'Rümlang', 'Schleinikon', 'Schöfflisdorf', 'Stadel',
    'Steinmaur', 'Weiach',
    // Bezirk Dietikon
    'Aesch', 'Birmensdorf', 'Dietikon', 'Geroldswil', 'Oberengstringen',
    'Oetwil an der Limmat', 'Schlieren', 'Uitikon', 'Unterengstringen', 'Urdorf', 'Weiningen',
    // Bezirk Hinwil
    'Bäretswil', 'Bubikon', 'Dürnten', 'Fischenthal', 'Gossau', 'Grüningen', 'Hinwil',
    'Rüti', 'Seegräben', 'Wald', 'Wetzikon',
    // Bezirk Horgen
    'Adliswil', 'Hirzel', 'Horgen', 'Hütten', 'Kilchberg', 'Langnau am Albis',
    'Oberrieden', 'Richterswil', 'Rüschlikon', 'Schönenberg', 'Thalwil', 'Wädenswil',
    // Bezirk Meilen
    'Erlenbach', 'Herrliberg', 'Hombrechtikon', 'Küsnacht', 'Männedorf', 'Meilen',
    'Oetwil am See', 'Stäfa', 'Uetikon am See', 'Zollikon', 'Zumikon',
    // Bezirk Pfäffikon
    'Bauma', 'Fehraltorf', 'Hittnau', 'Illnau-Effretikon', 'Kyburg', 'Lindau',
    'Pfäffikon', 'Russikon', 'Weisslingen', 'Wila', 'Wildberg',
    // Bezirk Uster
    'Dübendorf', 'Egg', 'Fällanden', 'Greifensee', 'Maur', 'Mönchaltorf',
    'Schwerzenbach', 'Uster', 'Volketswil',
    // Bezirk Winterthur
    'Altikon', 'Brütten', 'Dättlikon', 'Dinhard', 'Elgg', 'Ellikon an der Thur',
    'Elsau', 'Hagenbuch', 'Hettlingen', 'Hofstetten', 'Neftenbach', 'Pfungen',
    'Rickenbach', 'Schlatt', 'Seuzach', 'Turbenthal', 'Wiesendangen', 'Winterthur', 'Zell',
    // Bezirk Zürich
    'Zürich'
  ].sort()

  // Grouped by color families: whites/grays, reds, oranges, yellows, greens, blues, purples, pinks, teals
  const teamColors = [
    '#FFFFFF', // White
    '#000000', // Black
    '#808080', // Gray
    '#dc2626', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Light Green
    '#065f46', // Dark Green
    '#3b82f6', // Light Blue
    '#1e3a8a', // Dark Blue
    '#a855f7', // Purple
    '#ec4899'  // Pink
  ]

  const team1Counts = {
    players: team1Roster.length
  }
  const team2Counts = {
    players: team2Roster.length
  }

  // Load match data if matchId is provided
  const match = useLiveQuery(async () => {
    if (!matchId) return null
    try {
      return await db.matches.get(matchId)
    } catch (error) {
      console.error('Unable to load match', error)
      return null
    }
  }, [matchId])

  const isMatchOngoing = match?.status === 'live'

  // Capture original state when entering a view (for discard on Back)
  useEffect(() => {
    if (currentView === 'info') {
      originalMatchInfoRef.current = {
        date, time, hall, city, type2, gameN, league, team1Name, team2Name, team1Color, team2Color, team1ShortName, team2ShortName, hasCoach
      }
    } else if (currentView === 'officials') {
      originalOfficialsRef.current = {
        ref1First, ref1Last, ref1Country, ref1Dob,
        ref2First, ref2Last, ref2Country, ref2Dob,
        scorerFirst, scorerLast, scorerCountry, scorerDob,
        asstFirst, asstLast, asstCountry, asstDob,
        lineJudge1, lineJudge2, lineJudge3, lineJudge4
      }
    } else if (currentView === 'team1') {
      originalTeam1Ref.current = {
        team1Roster: JSON.parse(JSON.stringify(team1Roster)),
        team1Name
      }
    } else if (currentView === 'team2') {
      originalTeam2Ref.current = {
        team2Roster: JSON.parse(JSON.stringify(team2Roster)),
        team2Name
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView])

  // Clean up stale error jobs with legacy columns on mount
  useEffect(() => {
    const cleanupLegacyErrorJobs = async () => {
      try {
        const errorJobs = await db.sync_queue
          .where('status')
          .equals('error')
          .toArray()

        for (const job of errorJobs) {
          const payload = job.payload || {}
          const hasLegacyColumn = legacyColumns.some(col => col in payload)

          if (hasLegacyColumn) {
            await db.sync_queue.delete(job.id)
          }
        }
      } catch (err) {
        console.debug('[MatchSetup] Error cleaning up legacy jobs:', err.message)
      }
    }

    cleanupLegacyErrorJobs()
  }, [])

  // Check Supabase availability and sync status periodically
  useEffect(() => {
    const checkSupabaseAndSyncStatus = async () => {
      // Check if Supabase is available
      if (!isBackendAvailable()) {
        setIsSupabaseAvailable(false)
        return
      }

      try {
        const { error } = await apiFrom('matches').select('id').limit(1)
        const available = !error
        setIsSupabaseAvailable(available)

        if (!available || !match?.seed_key) return

        // Check sync queue for pending items related to this match
        const queuedJobs = await db.sync_queue
          .where('status')
          .equals('queued')
          .toArray()

        const errorJobs = await db.sync_queue
          .where('status')
          .equals('error')
          .toArray()

        // Check for match-related sync jobs
        const matchJobs = [...queuedJobs, ...errorJobs].filter(
          j => j.resource === 'match' && (j.payload?.id === match.seed_key || j.payload?.external_id === match.seed_key)
        )

        const hasQueued = matchJobs.some(j => j.status === 'queued')
        const hasError = matchJobs.some(j => j.status === 'error')

        // Update sync statuses based on queue
        if (hasError) {
          setMatchInfoSyncStatus('error')
          setOfficialsSyncStatus('error')
          setTeam1SyncStatus('error')
          setTeam2SyncStatus('error')
        } else if (hasQueued) {
          setMatchInfoSyncStatus('syncing')
          setOfficialsSyncStatus('syncing')
          setTeam1SyncStatus('syncing')
          setTeam2SyncStatus('syncing')
        } else {
          // Check if match exists in Supabase
          const { data: supabaseMatch } = await apiFrom('matches')
            .select('id, status')
            .eq('external_id', match.seed_key)
            .maybeSingle()

          if (supabaseMatch) {
            setMatchInfoSyncStatus('synced')
            setOfficialsSyncStatus('synced')
            setTeam1SyncStatus('synced')
            setTeam2SyncStatus('synced')
          } else {
            setMatchInfoSyncStatus('idle')
            setOfficialsSyncStatus('idle')
            setTeam1SyncStatus('idle')
            setTeam2SyncStatus('idle')
          }
        }
      } catch (err) {
        console.debug('[MatchSetup] Error checking sync status:', err.message)
        setIsSupabaseAvailable(false)
      }
    }

    checkSupabaseAndSyncStatus()
    const interval = setInterval(checkSupabaseAndSyncStatus, 5000)
    return () => clearInterval(interval)
  }, [match?.seed_key])

  // Retry sync for a specific card type
  const retrySyncForCard = async (cardType) => {
    if (!match?.seed_key) return

    try {
      // Find error jobs for this match and reset them to queued
      const errorJobs = await db.sync_queue
        .where('status')
        .equals('error')
        .toArray()

      const matchErrorJobs = errorJobs.filter(
        j => j.resource === 'match' && (j.payload?.id === match.seed_key || j.payload?.external_id === match.seed_key)
      )

      // If there are error jobs, reset them
      if (matchErrorJobs.length > 0) {
        for (const job of matchErrorJobs) {
          await db.sync_queue.update(job.id, { status: 'queued', retry_count: 0 })
        }
      } else if (cardType === 'matchInfo') {
        // No error jobs - check if match exists in Supabase
        // If not, create a new match insert job
        const { data: supabaseMatch } = await apiFrom('matches')
          .select('id')
          .eq('external_id', match.seed_key)
          .maybeSingle()

        if (!supabaseMatch) {
          // Check if a match with the same game_n already exists in the same tournament (prevent duplicates)
          if (match.gameN) {
            let supabaseQuery = apiFrom('matches')
              .select('id, external_id')
              .eq('game_n', parseInt(match.gameN, 10))
            // Scope to same league/tournament via match_info JSONB
            if (match.league) {
              supabaseQuery = supabaseQuery.eq('match_info->>competition_name', match.league)
            }
            const { data: existingByGameN } = await supabaseQuery.maybeSingle()

            if (existingByGameN) {
              console.warn('[MatchSetup] Match with game_n already exists in Supabase:', match.gameN, 'league:', match.league)
              setMatchInfoSyncStatus('error')
              return
            }
          }

          // Match doesn't exist in Supabase - create insert job
          const team1 = await db.teams.get(match.team1Id)
          const team2 = await db.teams.get(match.team2Id)

          await db.sync_queue.add({
            resource: 'match',
            action: 'insert',
            payload: {
              external_id: match.seed_key,
              status: match.status || 'setup',
              scheduled_at: match.scheduledAt || null,
              game_n: match.gameN ? parseInt(match.gameN, 10) : null,
              game_pin: match.gamePin || null,
              test: match.test || false,
              match_info: {
                competition_name: match.league || '',
                match_number: match.game_n || '',
                site: match.site || match.city || '',
                beach: match.beach || match.hall || '',
                court: match.court || '',
                gender: match.gender || match.match_type_2 || 'men',
                phase: match.phase || 'main',
                round: match.round || 'pool',
                has_coach: match.hasCoach || false
              },
              team1_data: {
                name: team1?.name || team1Name || 'Team 1',
                short_name: team1?.shortName || match.team1ShortName || generateShortName(team1?.name || team1Name || 'Team 1'),
                color: team1?.color || team1Color
              },
              team2_data: {
                name: team2?.name || team2Name || 'Team 2',
                short_name: team2?.shortName || match.team2ShortName || generateShortName(team2?.name || team2Name || 'Team 2'),
                color: team2?.color || team2Color
              },
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })
        }
      }

      // Set only the specific card status to syncing
      switch (cardType) {
        case 'matchInfo':
          setMatchInfoSyncStatus('syncing')
          break
        case 'officials':
          setOfficialsSyncStatus('syncing')
          break
        case 'team1':
          setTeam1SyncStatus('syncing')
          break
        case 'team2':
          setTeam2SyncStatus('syncing')
          break
        default:
          // If no specific card, sync all
          setMatchInfoSyncStatus('syncing')
          setOfficialsSyncStatus('syncing')
          setTeam1SyncStatus('syncing')
          setTeam2SyncStatus('syncing')
      }
    } catch (err) {
      console.error('[MatchSetup] Error retrying sync:', err)
    }
  }

  // Restore original state functions (for Back button)
  const restoreMatchInfo = () => {
    const o = originalMatchInfoRef.current
    if (!o) return
    setDate(o.date); setTime(o.time); setHall(o.hall); setCity(o.city)
    setType2(o.type2); setGameN(o.gameN); setLeague(o.league)
    setTeam1Name(o.team1Name); setTeam2Name(o.team2Name); setTeam1Color(o.team1Color); setTeam2Color(o.team2Color)
    setTeam1ShortName(o.team1ShortName); setTeam2ShortName(o.team2ShortName)
    if (o.hasCoach !== undefined) setHasCoach(o.hasCoach)
  }

  const restoreOfficials = () => {
    const o = originalOfficialsRef.current
    if (!o) return
    setRef1First(o.ref1First); setRef1Last(o.ref1Last); setRef1Country(o.ref1Country); setRef1Dob(o.ref1Dob)
    setRef2First(o.ref2First); setRef2Last(o.ref2Last); setRef2Country(o.ref2Country); setRef2Dob(o.ref2Dob)
    setScorerFirst(o.scorerFirst); setScorerLast(o.scorerLast); setScorerCountry(o.scorerCountry); setScorerDob(o.scorerDob)
    setAsstFirst(o.asstFirst); setAsstLast(o.asstLast); setAsstCountry(o.asstCountry); setAsstDob(o.asstDob)
    setLineJudge1(o.lineJudge1); setLineJudge2(o.lineJudge2); setLineJudge3(o.lineJudge3); setLineJudge4(o.lineJudge4)
  }

  const restoreTeam1 = () => {
    const o = originalTeam1Ref.current
    if (!o) return
    setTeam1Roster(o.team1Roster)
    if (o.team1Name !== undefined) setTeam1Name(o.team1Name)
  }

  const restoreTeam2 = () => {
    const o = originalTeam2Ref.current
    if (!o) return
    setTeam2Roster(o.team2Roster)
    if (o.team2Name !== undefined) setTeam2Name(o.team2Name)
  }

  // Load match data if matchId is provided
  // Split into two effects: one for initial load (matchId only), one for updates (match changes)

  // Initial load effect - only runs when matchId changes or when match becomes available
  useEffect(() => {
    if (!matchId) return
    if (!match) return // Wait for match to be loaded from useLiveQuery
    if (rosterLoadedRef.current) return // Already loaded for this matchId - don't reload to preserve user edits

    async function loadInitialData() {
      try {
        // Load teams
        const [team1, team2] = await Promise.all([
          match.team1Id ? db.teams.get(match.team1Id) : null,
          match.team2Id ? db.teams.get(match.team2Id) : null
        ])

        if (team1) {
          setTeam1Name(team1.name)
          setTeam1Color(team1.color || '#ef4444')
        }
        if (team2) {
          setTeam2Name(team2.name)
          setTeam2Color(team2.color || '#3b82f6')
        }

        // Update input widths when teams are loaded - use the actual loaded team names
        setTimeout(() => {
          if (team1MeasureRef.current && team1InputRef.current) {
            const currentValue = team1?.name || team1Name || 'Team 1 team name'
            team1MeasureRef.current.textContent = currentValue
            const measuredWidth = team1MeasureRef.current.offsetWidth
            team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
          }
          if (team2MeasureRef.current && team2InputRef.current) {
            const currentValue = team2?.name || team2Name || 'Team 2 team name'
            team2MeasureRef.current.textContent = currentValue
            const measuredWidth = team2MeasureRef.current.offsetWidth
            team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
          }
        }, 100)

        // Load match info - use safe parser to handle invalid dates
        if (match.scheduledAt) {
          const parsed = safeParseScheduledAt(match.scheduledAt)
          if (parsed.date) {
            // Convert ISO date (YYYY-MM-DD) to dd.mm.yyyy format
            const [year, month, day] = parsed.date.split('-')
            setDate(`${day}.${month}.${year}`)
          }
          if (parsed.time) setTime(parsed.time)
        }
        // Load beach volleyball specific fields
        if (match.site) setCity(match.site)
        else if (match.city) setCity(match.city) // Backwards compatibility
        if (match.beach) setHall(match.beach)
        else if (match.hall) setHall(match.hall) // Backwards compatibility
        if (match.court) setCourt(match.court)
        if (match.league) setLeague(match.league)
        if (match.gender) setType2(match.gender)
        else if (match.match_type_2) setType2(match.match_type_2) // Backwards compatibility
        if (match.phase) setPhase(match.phase)
        if (match.round) setRound(match.round)
        if (match.hasCoach !== undefined) setHasCoach(!!match.hasCoach)
        // The placeholder will show a suggestion, but won't auto-fill a value
        if (match.team1ShortName && match.team1ShortName.trim()) {
          setTeam1ShortName(match.team1ShortName)
        }
        if (match.team2ShortName && match.team2ShortName.trim()) {
          setTeam2ShortName(match.team2ShortName)
        }
        if (match.game_n) setGameN(String(match.game_n))
        else if (match.gameNumber) setGameN(String(match.gameNumber))

        // Load team countries
        if (match.team1Country) setTeam1Country(match.team1Country)
        if (match.team2Country) setTeam2Country(match.team2Country)

        // Generate PINs if they don't exist (for matches created before PIN feature)
        const generatePinCode = (existingPins = []) => {
          const chars = '0123456789'
          let pin = ''
          let attempts = 0
          const maxAttempts = 100

          do {
            pin = ''
            for (let i = 0; i < 6; i++) {
              pin += chars.charAt(Math.floor(Math.random() * chars.length))
            }
            attempts++
            if (attempts >= maxAttempts) {
              // If we can't generate a unique PIN after many attempts, just return this one
              break
            }
          } while (existingPins.includes(pin))

          return pin
        }

        const updates = {}
        const existingPins = []
        if (!match.refereePin) {
          const refPin = generatePinCode(existingPins)
          updates.refereePin = String(refPin).trim() // Ensure string
          existingPins.push(String(refPin).trim())
        } else {
          existingPins.push(String(match.refereePin).trim())
        }
        if (!match.team1Pin) {
          const team1Pin = generatePinCode(existingPins)
          updates.team1Pin = String(team1Pin).trim() // Ensure string
          existingPins.push(String(team1Pin).trim())
        } else {
          existingPins.push(String(match.team1Pin).trim())
        }
        if (!match.team2Pin) {
          const team2Pin = generatePinCode(existingPins)
          updates.team2Pin = String(team2Pin).trim() // Ensure string
          existingPins.push(String(team2Pin).trim())
        } else {
          existingPins.push(String(match.team2Pin).trim())
        }
        if (!match.team1UploadPin) {
          const team1UploadPin = generatePinCode(existingPins)
          updates.team1UploadPin = team1UploadPin
          existingPins.push(team1UploadPin)
        } else {
          existingPins.push(match.team1UploadPin)
        }
        if (!match.team2UploadPin) {
          const team2UploadPin = generatePinCode(existingPins)
          updates.team2UploadPin = team2UploadPin
        }
        if (Object.keys(updates).length > 0) {
          await db.matches.update(matchId, updates)
        }

        // Newly generated PINs go to the cloud through the sync queue. The
        // backend never returns connection_pins (no read-merge), so the queue
        // sends the whole object built from the local match
        // (connectionPins_beach.js); it needs a session like every write.
        if (Object.keys(updates).length > 0 && match.seed_key && !match.test) {
          try {
            await db.sync_queue.add({
              resource: 'match',
              action: 'update',
              payload: { id: match.seed_key, connection_pins: buildConnectionPins({ ...match, ...updates }) },
              ts: new Date().toISOString(),
              status: 'queued'
            })
          } catch (err) {
            console.warn('[MatchSetup] Failed to queue the PIN sync:', err)
          }
        }

        // Load players only on initial load (when matchId changes, not when match updates)
        // Skip if roster was already loaded from draft (to preserve user edits like number/captain changes)
        if (match.team1Id && !rosterLoadedFromDraft.current.team1) {
          const team1Players = await db.players.where('teamId').equals(match.team1Id).sortBy('number')
          setTeam1Roster(team1Players.map(p => ({
            id: p.id, // Store player ID for updates
            number: p.number,
            firstName: p.firstName || '',
            lastName: p.lastName || p.name || '',
            dob: p.dob || '',
            isCaptain: p.isCaptain || false
          })))
        }
        if (match.team2Id && !rosterLoadedFromDraft.current.team2) {
          const team2Players = await db.players.where('teamId').equals(match.team2Id).sortBy('number')
          setTeam2Roster(team2Players.map(p => ({
            id: p.id, // Store player ID for updates
            number: p.number,
            firstName: p.firstName || '',
            lastName: p.lastName || p.name || '',
            dob: p.dob || '',
            isCaptain: p.isCaptain || false
          })))
        }

        // Migrate old matches: ensure connection fields are explicitly set to false if undefined
        const connectionUpdates = {}
        if (match.refereeConnectionEnabled === undefined) connectionUpdates.refereeConnectionEnabled = false
        if (match.team1TeamConnectionEnabled === undefined) connectionUpdates.team1TeamConnectionEnabled = false
        if (match.team2TeamConnectionEnabled === undefined) connectionUpdates.team2TeamConnectionEnabled = false
        if (Object.keys(connectionUpdates).length > 0) {
          await db.matches.update(matchId, connectionUpdates)
        }

        // Mark roster as loaded
        rosterLoadedRef.current = true

        // Load match officials
        if (match.officials && match.officials.length > 0) {
          const ref1 = match.officials.find(o => o.role === '1st referee')
          if (ref1) {
            setRef1First(ref1.firstName || '')
            setRef1Last(ref1.lastName || '')
            setRef1Country(ref1.country || 'CHE')
            setRef1Dob(ref1.dob || '01.01.1900')
          }
          const ref2 = match.officials.find(o => o.role === '2nd referee')
          if (ref2) {
            setRef2First(ref2.firstName || '')
            setRef2Last(ref2.lastName || '')
            setRef2Country(ref2.country || 'CHE')
            setRef2Dob(ref2.dob || '01.01.1900')
          }
          const scorer = match.officials.find(o => o.role === 'scorer')
          if (scorer) {
            setScorerFirst(scorer.firstName || '')
            setScorerLast(scorer.lastName || '')
            setScorerCountry(scorer.country || 'CHE')
            setScorerDob(scorer.dob || '01.01.1900')
          }
          const asst = match.officials.find(o => o.role === 'assistant scorer')
          if (asst) {
            setAsstFirst(asst.firstName || '')
            setAsstLast(asst.lastName || '')
            setAsstCountry(asst.country || 'CHE')
            setAsstDob(asst.dob || '01.01.1900')
          }
          // Load line judges
          const lj1 = match.officials.find(o => o.role === 'line judge 1')
          if (lj1) setLineJudge1(lj1.name || '')
          const lj2 = match.officials.find(o => o.role === 'line judge 2')
          if (lj2) setLineJudge2(lj2.name || '')
          const lj3 = match.officials.find(o => o.role === 'line judge 3')
          if (lj3) setLineJudge3(lj3.name || '')
          const lj4 = match.officials.find(o => o.role === 'line judge 4')
          if (lj4) setLineJudge4(lj4.name || '')
        }

        // Note: Coin toss data is loaded and managed by CoinToss.jsx component
        // Captain signatures are collected at coin toss, not in roster setup

        // If match was explicitly confirmed (user clicked "Create Match"), restore that state
        // This flag is set in confirmMatchInfo and persisted in the database
        // We check matchInfoConfirmedAt instead of just team IDs to prevent auto-confirm
        // when auto-save creates teams before user explicitly confirms
        if (match.matchInfoConfirmedAt && team1 && team2) {
          setMatchInfoConfirmed(true)
        }

        // Auto-navigate to info view for competition matches that aren't confirmed yet
        if (match.competitionMatchId && !match.matchInfoConfirmedAt) {
          setCurrentView('info')
        }
      } catch (error) {
        console.error('Error loading initial match data:', error)
      }
    }

    loadInitialData()
  }, [matchId, match]) // Depend on both matchId and match - but only load once per matchId due to rosterLoadedRef check

  // Reset roster loaded flag when matchId changes
  useEffect(() => {
    rosterLoadedRef.current = false
  }, [matchId])

  // Auto-fill scorer fields from logged-in user profile
  // Only applies when scorer fields are empty (new match or scorer not yet set)
  useEffect(() => {
    // Get profile from context or fall back to cached profile for offline use
    const userProfile = profile || getCachedProfile()
    if (!userProfile) return

    // Only auto-fill if scorer fields are currently empty
    // This ensures we don't overwrite data loaded from an existing match
    if (scorerFirst || scorerLast) return

    // Auto-fill scorer info from user profile
    if (userProfile.first_name) setScorerFirst(userProfile.first_name)
    if (userProfile.last_name) setScorerLast(userProfile.last_name)
    if (userProfile.country) setScorerCountry(userProfile.country)
    if (userProfile.dob) {
      // Convert ISO date (YYYY-MM-DD) to DD.MM.YYYY format used by the app
      const dobParts = userProfile.dob.split('-')
      if (dobParts.length === 3) {
        setScorerDob(`${dobParts[2]}.${dobParts[1]}.${dobParts[0]}`)
      }
    }
  }, [profile, scorerFirst, scorerLast])

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
      // In browser/PWA - show instructions via copy button
      try {
        const command = 'npm run start:prod'
        await navigator.clipboard.writeText(command)
        setNoticeModal({ message: 'Command copied to clipboard! Run "npm run start:prod" in the frontend directory terminal.' })
      } catch (err) {
        // Fallback if clipboard API not available
        const textArea = document.createElement('textarea')
        textArea.value = 'npm run start:prod'
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          setNoticeModal({ message: 'Command copied to clipboard! Run "npm run start:prod" in the frontend directory terminal.' })
        } catch (e) {
          setNoticeModal({ message: 'Please run manually in terminal: npm run start:prod' })
        }
        document.body.removeChild(textArea)
      }
      return
    }

    setServerLoading(true)
    try {
      const result = await window.electronAPI.server.start({ https: true })
      if (result.success) {
        setServerStatus(result.status)
        setServerRunning(true)
        // Register as main instance
        await registerAsMainInstance()
      } else {
        setNoticeModal({ message: `Failed to start server: ${result.error}` })
      }
    } catch (error) {
      setNoticeModal({ message: `Error starting server: ${error.message}` })
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
      setNoticeModal({ message: `Error stopping server: ${error.message}` })
    } finally {
      setServerLoading(false)
    }
  }

  const registerAsMainInstance = async () => {
    if (!serverStatus) return

    try {
      const protocol = serverStatus.protocol || 'https'
      const host = serverStatus.localIP || serverStatus.hostname || 'escoresheet.local'
      const port = serverStatus.port || BEACH_DESKTOP_HTTP_PORT
      const url = `${protocol}://${host}:${port}/api/server/register-main`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Instance-ID': instanceId,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        if (!result.success) {
          console.warn('Failed to register as main instance:', result.error)
        } else {
        }
      } else {
        console.warn('Failed to register as main instance: HTTP', response.status)
      }
    } catch (error) {
      console.error('Error registering as main instance:', error)
    }
  }

  // Register as main instance when match starts
  useEffect(() => {
    if (serverRunning && serverStatus && matchId) {
      registerAsMainInstance()
    }
  }, [serverRunning, serverStatus, matchId, instanceId])

  // Load saved draft data on mount (only if no matchId)
  useEffect(() => {
    if (matchId) return // Skip draft loading if matchId is provided

    async function loadDraft() {
      try {
        const draft = await db.match_setup.orderBy('updatedAt').last()
        if (draft) {
          if (draft.team1 !== undefined) setTeam1Name(draft.team1)
          if (draft.team2 !== undefined) setTeam2Name(draft.team2)
          if (draft.date !== undefined) setDate(draft.date)
          if (draft.time !== undefined) setTime(draft.time)
          if (draft.hall !== undefined) setHall(draft.hall)
          if (draft.city !== undefined) setCity(draft.city)
          if (draft.type2 !== undefined) setType2(draft.type2)
          if (draft.hasCoach !== undefined) setHasCoach(draft.hasCoach)
          if (draft.team1ShortName !== undefined) setTeam1ShortName(draft.team1ShortName)
          if (draft.team2ShortName !== undefined) setTeam2ShortName(draft.team2ShortName)
          if (draft.gameN !== undefined) setGameN(draft.gameN)
          if (draft.league !== undefined) setLeague(draft.league)
          if (draft.team1Color !== undefined) setTeam1Color(draft.team1Color)
          if (draft.team2Color !== undefined) setTeam2Color(draft.team2Color)
          if (draft.team1Country !== undefined) setTeam1Country(draft.team1Country)
          if (draft.team2Country !== undefined) setTeam2Country(draft.team2Country)
          if (draft.team1Roster !== undefined && draft.team1Roster.length > 0) {
            setTeam1Roster(draft.team1Roster)
            rosterLoadedFromDraft.current.team1 = true
          }
          if (draft.team2Roster !== undefined && draft.team2Roster.length > 0) {
            setTeam2Roster(draft.team2Roster)
            rosterLoadedFromDraft.current.team2 = true
          }
          if (draft.ref1First !== undefined) setRef1First(draft.ref1First)
          if (draft.ref1Last !== undefined) setRef1Last(draft.ref1Last)
          if (draft.ref1Country !== undefined) setRef1Country(draft.ref1Country)
          if (draft.ref1Dob !== undefined) setRef1Dob(draft.ref1Dob)
          if (draft.ref2First !== undefined) setRef2First(draft.ref2First)
          if (draft.ref2Last !== undefined) setRef2Last(draft.ref2Last)
          if (draft.ref2Country !== undefined) setRef2Country(draft.ref2Country)
          if (draft.ref2Dob !== undefined) setRef2Dob(draft.ref2Dob)
          if (draft.scorerFirst !== undefined) setScorerFirst(draft.scorerFirst)
          if (draft.scorerLast !== undefined) setScorerLast(draft.scorerLast)
          if (draft.scorerCountry !== undefined) setScorerCountry(draft.scorerCountry)
          if (draft.scorerDob !== undefined) setScorerDob(draft.scorerDob)
          if (draft.asstFirst !== undefined) setAsstFirst(draft.asstFirst)
          if (draft.asstLast !== undefined) setAsstLast(draft.asstLast)
          if (draft.asstCountry !== undefined) setAsstCountry(draft.asstCountry)
          if (draft.asstDob !== undefined) setAsstDob(draft.asstDob)
        }
      } catch (error) {
        console.error('Error loading draft:', error)
      }
    }
    loadDraft()
  }, [matchId])

  // Save draft data to database
  async function saveDraft(silent = false) {
    try {
      const draft = {
        team1: team1Name,
        team2: team2Name,
        date,
        time,
        hall,
        city,
        type2,
        hasCoach,
        gameN,
        league,
        team1Color,
        team2Color,
        team1Country,
        team2Country,
        team1ShortName,
        team2ShortName,
        team1Roster,
        team2Roster,
        ref1First,
        ref1Last,
        ref1Country,
        ref1Dob,
        ref2First,
        ref2Last,
        ref2Country,
        ref2Dob,
        scorerFirst,
        scorerLast,
        scorerCountry,
        scorerDob,
        asstFirst,
        asstLast,
        asstCountry,
        asstDob,
        updatedAt: new Date().toISOString()
      }
      // Get existing draft or create new one
      const existing = await db.match_setup.orderBy('updatedAt').last()
      if (existing) {
        await db.match_setup.update(existing.id, draft)
      } else {
        await db.match_setup.add(draft)
      }

      // Also update the actual match record if matchId exists
      if (matchId) {
        let scheduledAt = match?.scheduledAt // Default to existing value

        // Only validate date/time if at least one is set
        if (date || time) {
          try {
            // Convert dd.mm.yyyy to YYYY-MM-DD for createScheduledAt
            let dateForCreate = date
            if (date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
              const [day, month, year] = date.split('.')
              dateForCreate = `${year}-${month}-${day}`
            }
            scheduledAt = createScheduledAt(dateForCreate, time, { allowEmpty: true })
          } catch (err) {
            // For silent saves, just log and use existing value
            // For explicit saves, show error to user
            if (!silent) {
              console.error('[MatchSetup] Date/time validation error:', err.message)
              setNoticeModal({ message: t('matchSetup.validation.invalidDateTime', { error: err.message }) })
              return // Don't save with invalid data
            }
            console.warn('[MatchSetup] Auto-save skipping invalid date/time:', err.message)
          }
        }

        // Build update object - only include match type fields if match info is confirmed
        // This prevents auto-save from writing default values before user has explicitly confirmed
        const matchUpdate = {
          hall,
          city,
          site: city,
          beach: hall,
          court,
          team1ShortName: team1ShortName || team1Name.trim().toUpperCase(),
          team2ShortName: team2ShortName || team2Name.trim().toUpperCase(),
          game_n: gameN ? Number(gameN) : null,
          gameNumber: gameN ? gameN : null,
          league,
          gamePin: match && !match.test ? (match.gamePin || (() => {
            // Auto-generate gamePin if it doesn't exist
            const chars = '0123456789'
            let pin = ''
            for (let i = 0; i < 6; i++) {
              pin += chars.charAt(Math.floor(Math.random() * chars.length))
            }
            return pin
          })()) : null,
          scheduledAt,
          officials: buildOfficialsArray(
            { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: ref1Dob },
            { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: ref2Dob },
            { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: scorerDob },
            { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: asstDob },
            { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 }
          )
        }

        // Only save match type fields if explicitly saving OR match was previously confirmed
        // This prevents scoresheet from showing default Xs before user confirms match info
        if (!silent || match?.matchInfoConfirmedAt) {
          matchUpdate.match_type_2 = type2
          matchUpdate.gender = type2
          matchUpdate.phase = phase
          matchUpdate.round = round
          matchUpdate.hasCoach = hasCoach
        }

        await db.matches.update(matchId, matchUpdate)

        // Update or create teams
        let team1Id = match?.team1Id
        let team2Id = match?.team2Id

        if (team1Name && team1Name.trim()) {
          if (team1Id) {
            // Update existing team
            await db.teams.update(team1Id, {
              name: team1Name.trim(),
              color: team1Color,
              shortName: team1ShortName || generateShortName(team1Name.trim()),
            })
          } else {
            // Create new team if it doesn't exist
            team1Id = await db.teams.add({
              name: team1Name.trim(),
              color: team1Color,
              shortName: team1ShortName || generateShortName(team1Name.trim()),
              createdAt: new Date().toISOString()
            })
            // Update match with new team ID
            await db.matches.update(matchId, { team1Id })
          }
        }

        if (team2Name && team2Name.trim()) {
          if (team2Id) {
            // Update existing team
            await db.teams.update(team2Id, {
              name: team2Name.trim(),
              color: team2Color,
              shortName: team2ShortName || generateShortName(team2Name.trim())
            })
          } else {
            // Create new team if it doesn't exist
            team2Id = await db.teams.add({
              name: team2Name.trim(),
              color: team2Color,
              shortName: team2ShortName || generateShortName(team2Name.trim()),
              createdAt: new Date().toISOString()
            })
            // Update match with new team ID
            await db.matches.update(matchId, { team2Id })
          }
        }
      }

      return true
    } catch (error) {
      console.error('Error saving draft:', error)
      if (!silent) {
        setNoticeModal({ message: t('matchSetup.validation.errorSavingData') })
      }
      return false
    }
  }

  // Auto-save when data changes (debounced)
  useEffect(() => {
    if (currentView === 'main' || currentView === 'info' || currentView === 'officials' || currentView === 'team1' || currentView === 'team2') {
      const timeoutId = setTimeout(() => {
        saveDraft(true) // Silent auto-save
      }, 500) // Debounce 500ms

      return () => clearTimeout(timeoutId)
    }
  }, [date, time, hall, city, type2, hasCoach, gameN, league, team1Name, team2Name, team1Color, team2Color, team1Country, team2Country, team1ShortName, team2ShortName, team1Roster, team2Roster, ref1First, ref1Last, ref1Country, ref1Dob, ref2First, ref2Last, ref2Country, ref2Dob, scorerFirst, scorerLast, scorerCountry, scorerDob, asstFirst, asstLast, asstCountry, asstDob, currentView])

  // Update input widths when team1/team2 values change - set default width based on content
  useEffect(() => {
    if (team1MeasureRef.current && team1InputRef.current) {
      const currentValue = team1Name || 'Team 1 name'
      team1MeasureRef.current.textContent = currentValue
      const measuredWidth = team1MeasureRef.current.offsetWidth
      // Always set width based on content, not just on focus
      team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
    }
  }, [team1Name, currentView]) // Also update when view changes (e.g., going back)

  useEffect(() => {
    if (team2MeasureRef.current && team2InputRef.current) {
      const currentValue = team2Name || 'team2 team name'
      team2MeasureRef.current.textContent = currentValue
      const measuredWidth = team2MeasureRef.current.offsetWidth
      // Always set width based on content, not just on focus
      team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
    }
  }, [team2Name, currentView]) // Also update when view changes (e.g., going back)

  // Set initial width when returning to main view to ensure width is correct
  useEffect(() => {
    if (currentView === 'main') {
      // Small delay to ensure refs are available after view change
      const timeoutId = setTimeout(() => {
        if (team1MeasureRef.current && team1InputRef.current) {
          const currentValue = team1Name || 'Team 1 team name'
          team1MeasureRef.current.textContent = currentValue
          const measuredWidth = team1MeasureRef.current.offsetWidth
          team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
        if (team2MeasureRef.current && team2InputRef.current) {
          const currentValue = team2Name || 'Team 2 team name'
          team2MeasureRef.current.textContent = currentValue
          const measuredWidth = team2MeasureRef.current.offsetWidth
          team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
      }, 50)
      return () => clearTimeout(timeoutId)
    }
  }, [currentView, team1Name, team2Name])

  // Update input widths when team1/team2 values change (e.g., when loaded from match)
  useEffect(() => {
    if (currentView === 'main') {
      const timeoutId = setTimeout(() => {
        if (team1MeasureRef.current && team1InputRef.current && team1Name) {
          team1MeasureRef.current.textContent = team1Name
          const measuredWidth = team1MeasureRef.current.offsetWidth
          team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
        if (team2MeasureRef.current && team2InputRef.current && team2Name) {
          team2MeasureRef.current.textContent = team2Name
          const measuredWidth = team2MeasureRef.current.offsetWidth
          team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [team1Name, team2Name, currentView])

  // Helper function to determine if a color is bright/light
  function isBrightColor(color) {
    if (!color || color === 'image.png') return false
    // Convert hex to RGB
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5
  }

  // Helper function to get contrasting color (white or black)
  function getContrastColor(color) {
    return isBrightColor(color) ? '#000000' : '#ffffff'
  }

  // Validate and set date with immediate feedback (dd.mm.yyyy format)
  function handleDateChange(value) {
    setDate(value)
    if (!value) {
      setDateError('')
      return
    }
    // Validate format dd.mm.yyyy
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
      // Don't show error while typing (incomplete format)
      if (value.length < 10) {
        setDateError('')
        return
      }
      setDateError(t('matchSetup.validation.invalidFormat'))
      return
    }
    const [day, month, year] = value.split('.').map(Number)
    if (year < 1900 || year > 2100) {
      setDateError(t('matchSetup.validation.invalidYear', { year }))
      return
    }
    if (month < 1 || month > 12) {
      setDateError(t('matchSetup.validation.invalidMonth', { month }))
      return
    }
    if (day < 1 || day > 31) {
      setDateError(t('matchSetup.validation.invalidDay', { day }))
      return
    }
    // Check if date is valid (e.g., Feb 30 is invalid)
    const dateObj = new Date(year, month - 1, day)
    if (isNaN(dateObj.getTime()) || dateObj.getDate() !== day || dateObj.getMonth() + 1 !== month) {
      setDateError(t('matchSetup.validation.invalidDate'))
      return
    }
    setDateError('')
  }

  // Validate and set time with immediate feedback
  function handleTimeChange(value) {
    setTime(value)
    if (!value) {
      setTimeError('')
      return
    }
    // Validate format HH:MM
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setTimeError(t('matchSetup.validation.invalidFormat'))
      return
    }
    const [hours, minutes] = value.split(':').map(Number)
    if (hours < 0 || hours > 23) {
      setTimeError(t('matchSetup.validation.invalidHour', { hour: hours }))
      return
    }
    if (minutes < 0 || minutes > 59) {
      setTimeError(t('matchSetup.validation.invalidMinutes', { minutes }))
      return
    }
    setTimeError('')
  }

  // Confirm match info - validates all required fields and creates/updates match
  async function confirmMatchInfo() {
    // Track if this is a create or update operation
    const isCreating = !matchInfoConfirmed

    // Validate required fields
    if (dateError) {
      setNoticeModal({ message: t('matchSetup.validation.invalidDatePrefix', { error: dateError }) })
      return
    }
    if (timeError) {
      setNoticeModal({ message: t('matchSetup.validation.invalidTimePrefix', { error: timeError }) })
      return
    }

    // Check for duplicate game number locally (scoped to same league/tournament)
    if (gameN?.trim()) {
      const gameNValue = parseInt(gameN, 10)
      if (!isNaN(gameNValue)) {
        const currentLeague = (league || '').trim().toLowerCase()
        const allMatches = await db.matches.toArray()
        const duplicate = allMatches.find(m =>
          m.id !== matchId &&
          m.game_n === gameNValue &&
          (m.league || '').trim().toLowerCase() === currentLeague
        )
        if (duplicate) {
          setGameNError(t('matchSetup.validation.duplicateGameNumber', { number: gameNValue }))
          setNoticeModal({ message: t('matchSetup.validation.duplicateGameNumber', { number: gameNValue }) })
          return
        }
      }
    }
    setGameNError('')

    // Check if any changes were made (skip sync if no changes)
    const currentMatchInfo = {
      date, time, hall, city, type2, hasCoach, gameN, league, team1Name, team2Name, team1Color, team2Color, team1ShortName, team2ShortName
    }
    const hasChanges = isCreating || hasMatchInfoChanged(originalMatchInfoRef.current, currentMatchInfo)

    // If no changes, just go back to main view
    if (!hasChanges) {
      setCurrentView('main')
      return
    }

    try {
      // Create teams if they don't exist
      let team1Id = match?.team1Id
      let team2Id = match?.team2Id

      if (!team1Id) {
        team1Id = await db.teams.add({
          name: team1Name.trim(),
          color: team1Color,
          shortName: team1ShortName || generateShortName(team1Name.trim()),
          createdAt: new Date().toISOString()
        })
      } else {
        // Update existing team
        await db.teams.update(team1Id, {
          name: team1Name.trim(),
          color: team1Color,
          shortName: team1ShortName || generateShortName(team1Name.trim()),
        })
      }

      if (!team2Id) {
        team2Id = await db.teams.add({
          name: team2Name.trim(),
          color: team2Color,
          shortName: team2ShortName || generateShortName(team2Name.trim()),
          createdAt: new Date().toISOString()
        })
      } else {
        // Update existing team
        await db.teams.update(team2Id, {
          name: team2Name.trim(),
          color: team2Color,
          shortName: team2ShortName || generateShortName(team2Name.trim())
        })
      }

      // Build scheduledAt if date is set
      let scheduledAt = null
      if (date) {
        // Convert dd.mm.yyyy to YYYY-MM-DD for createScheduledAt
        let dateForCreate = date
        if (date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
          const [day, month, year] = date.split('.')
          dateForCreate = `${year}-${month}-${day}`
        }
        scheduledAt = createScheduledAt(dateForCreate, time, { allowEmpty: true })
      }

      // Generate seed_key if match doesn't have one (for older matches or matches created via other flows)
      // seed_key is the stable unique identifier used for Supabase sync (stored as external_id)
      // It never includes modifiable fields like gameN or scheduled_at
      let matchSeedKey = match?.seed_key
      if (!matchSeedKey) {
        matchSeedKey = generateMatchSeedKey()
      }

      // Update match with team IDs and match info
      // matchInfoConfirmedAt flag indicates user explicitly clicked "Create Match"
      await db.matches.update(matchId, {
        team1Id,
        team2Id,
        team1Name: team1Name.trim(),
        team2Name: team2Name.trim(),
        team1ShortName: team1ShortName || generateShortName(team1Name.trim()),
        team2ShortName: team2ShortName || generateShortName(team2Name.trim()),
        team1Color,
        team2Color,
        scheduledAt,
        hall: hall || null,
        city: city || null,
        site: city || null,
        beach: hall || null,
        court: court || null,
        league: league || null,
        match_type_2: type2 || null,
        gender: type2 || null,
        phase: phase || null,
        round: round || null,
        hasCoach: hasCoach,
        game_n: gameN ? parseInt(gameN, 10) : null,
        seed_key: matchSeedKey, // Ensure seed_key is set
        matchInfoConfirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      // Link competition match template to this scored match via seed_key
      if (COMPETITIONS_ENABLED && isBackendAvailable() && match?.competitionMatchId) {
        try {
          await apiFrom('beach_competition_matches')
            .update({ claimed_match_external_id: matchSeedKey })
            .eq('id', match.competitionMatchId)
        } catch (err) {
          console.warn('[MatchSetup] Failed to link competition match:', err)
        }
      }

      // Queue match for Supabase sync - all data stored as JSONB
      // Only set status to 'setup' when creating a new match, not when updating existing match
      // to avoid resetting 'live' status back to 'setup'
      const syncPayload = {
        external_id: matchSeedKey,
        scheduled_at: scheduledAt || null,
        game_n: gameN ? parseInt(gameN, 10) : null,
        game_pin: match?.gamePin || null,
        test: false,
        // JSONB columns
        match_info: {
          hall: hall || '',
          city: city || '',
          league: league || '',
          match_type_2: type2 || '',
          has_coach: hasCoach
        },
        team1_data: { name: team1Name.trim(), short_name: team1ShortName || generateShortName(team1Name.trim()), color: team1Color, country: team1Country || '' },
        team2_data: { name: team2Name.trim(), short_name: team2ShortName || generateShortName(team2Name.trim()), color: team2Color, country: team2Country || '' },
      }

      // Only set status to 'setup' when creating a new match
      // When updating, don't overwrite the status (might be 'live')
      if (isCreating) {
        syncPayload.status = 'setup'
      }

      const syncJobId = await db.sync_queue.add({
        resource: 'match',
        action: 'insert',
        payload: syncPayload,
        ts: new Date().toISOString(),
        status: 'queued'
      })

      setMatchInfoConfirmed(true)
      setCurrentView('main')
      // Wait for the cloud only when the sync can finish now; a venue tablet
      // (its server is the relay) or offline mode syncs in the background
      const waitForCloud = cloudSyncWaitNow()
      setNoticeModal(waitForCloud
        ? { message: isCreating ? t('matchSetup.modals.matchCreatedSyncing') : t('matchSetup.modals.matchUpdatedSyncing'), type: 'success', syncing: true }
        : { message: t('matchSetup.modals.matchSavedLocalSyncPending'), type: 'success' })

      // Send match info email if provided (non-blocking)
      if (notificationEmail && notificationEmail.trim() && match?.gamePin) {
        const emailData = {
          email: notificationEmail.trim(),
          gameN: gameN || 'N/A',
          gamePin: match.gamePin,
          team1: team1Name.trim(),
          team2: team2Name.trim(),
          team1ShortName: team1ShortName || '',
          team2ShortName: team2ShortName || '',
          date: date || '',
          time: time || '',
          hall: hall || '',
          city: city || '',
          league: league || ''
        }

        // The e-mail goes out from the cloud backend (a venue relay has none)
        const sendInfoUrl = getCloudApiUrl('/api/match/send-info')

        if (sendInfoUrl) fetch(sendInfoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
            } else {
              console.warn('[MatchSetup] Failed to send match info email:', data.error)
            }
          })
          .catch(err => console.warn('[MatchSetup] Match info email failed:', err))
      }

      // Cloud backup at match setup (non-blocking)
      exportMatchData(matchId).then(backupData => {
        uploadBackupToCloud(matchId, backupData)
        uploadLogsToCloud(matchId, gameN || null)
      }).catch(err => console.warn('[MatchSetup] Cloud backup failed:', err))

      // Poll to check when sync completes
      const checkSyncStatus = async () => {
        let attempts = 0
        const maxAttempts = 20 // 10 seconds max
        const interval = setInterval(async () => {
          attempts++
          try {
            const job = await db.sync_queue.get(syncJobId)
            if (!job || job.status === 'sent') {
              clearInterval(interval)
              setNoticeModal({ message: t('matchSetup.modals.matchSynced'), type: 'success' })
            } else if (job.status === 'error') {
              clearInterval(interval)
              setNoticeModal({ message: t('matchSetup.modals.matchSavedLocalSyncFailed'), type: 'error' })
            } else if (attempts >= maxAttempts) {
              clearInterval(interval)
              setNoticeModal({ message: t('matchSetup.modals.matchSavedLocalSyncPending'), type: 'success' })
            }
          } catch (err) {
            clearInterval(interval)
          }
        }, 500)
      }
      if (waitForCloud) checkSyncStatus()
    } catch (error) {
      console.error('Error confirming match info:', error)
      setNoticeModal({ message: `Error: ${error.message}`, type: 'error' })
    }
  }

  function handleSignatureSave(signatureImage) {
    // Captain signatures are handled in CoinToss component
    setOpenSignature(null)
  }


  function formatRoster(roster) {
    // All players sorted by number (ascending)
    const players = [...roster].sort((a, b) => {
      const an = a.number ?? 999
      const bn = b.number ?? 999
      return an - bn
    })

    return { players }
  }

  async function createMatch() {
    // Check for existing validation errors
    if (dateError) {
      setNoticeModal({ message: t('matchSetup.validation.invalidDatePrefix', { error: dateError }) })
      return
    }
    if (timeError) {
      setNoticeModal({ message: t('matchSetup.validation.invalidTimePrefix', { error: timeError }) })
      return
    }

    // Validate date/time first
    let scheduledAt
    try {
      // Convert dd.mm.yyyy to YYYY-MM-DD for createScheduledAt
      let dateForCreate = date
      if (date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        const [day, month, year] = date.split('.')
        dateForCreate = `${year}-${month}-${day}`
      }
      scheduledAt = createScheduledAt(dateForCreate, time, { allowEmpty: false })
    } catch (err) {
      setNoticeModal({ message: t('matchSetup.validation.invalidDateTime', { error: err.message }) })
      return
    }

    // Validate at least one captain per team
    const team1HasCaptain = team1Roster.some(p => p.isCaptain)
    const team2HasCaptain = team2Roster.some(p => p.isCaptain)

    if (!team1HasCaptain) {
      setNoticeModal({ message: t('matchSetup.validation.team1NeedsCaptain') })
      return
    }

    if (!team2HasCaptain) {
      setNoticeModal({ message: t('matchSetup.validation.team2NeedsCaptain') })
      return
    }

    // Validate no duplicate player numbers within each team
    const team1Duplicates = team1Roster.filter((p, i) =>
      p.number && team1Roster.findIndex(other => other.number === p.number) !== i
    )
    if (team1Duplicates.length > 0) {
      const dupNumbers = [...new Set(team1Duplicates.map(p => p.number))].join(', ')
      setNoticeModal({
        message: t('matchSetup.validation.duplicatePlayerNumbers', { team: team1Name || t('common.team1'), numbers: dupNumbers })
      })
      return
    }

    const team2Duplicates = team2Roster.filter((p, i) =>
      p.number && team2Roster.findIndex(other => other.number === p.number) !== i
    )
    if (team2Duplicates.length > 0) {
      const dupNumbers = [...new Set(team2Duplicates.map(p => p.number))].join(', ')
      setNoticeModal({
        message: t('matchSetup.validation.duplicatePlayerNumbers', { team: team2Name || t('common.team2'), numbers: dupNumbers })
      })
      return
    }

    // Validate birthdates - check for suspicious dates (only when DOB management is enabled)
    if (manageDob) {
      const allPlayers = [...team1Roster, ...team2Roster]
      const playersWithBadDate = allPlayers.filter(p =>
        p.dob === '01.01.1900' || p.dob === '01/01/1900' || p.dob === '1900-01-01'
      )
      if (playersWithBadDate.length > 0) {
        const badNames = playersWithBadDate.map(p => `${p.lastName || ''} ${p.firstName || ''} (#${p.number})`).join('\n')
        setNoticeModal({
          message: `Some players have invalid birthdate (01.01.1900):\n\n${badNames}\n\nPlease correct these dates before proceeding.`
        })
        return
      }

      // Check for missing birthdates (warning, not blocking)
      const playersWithoutDob = allPlayers.filter(p => !p.dob && (p.firstName || p.lastName))
      if (playersWithoutDob.length > 0) {
        const missingNames = playersWithoutDob.slice(0, 5).map(p => `${p.lastName || ''} ${p.firstName || ''} (#${p.number})`).join('\n')
        const moreCount = playersWithoutDob.length > 5 ? `\n...and ${playersWithoutDob.length - 5} more` : ''
        // This is just a warning - show it but continue
        console.warn(`[MatchSetup] Players missing birthdate:\n${missingNames}${moreCount}`)
      }
    }

    await db.transaction('rw', db.matches, db.teams, db.players, db.sync_queue, async () => {
      const team1DbId = await db.teams.add({ name: team1Name, color: team1Color, shortName: team1ShortName || team1Name.trim().toUpperCase(), createdAt: new Date().toISOString() })
      const team2DbId = await db.teams.add({ name: team2Name, color: team2Color, shortName: team2ShortName || team2Name.trim().toUpperCase(), createdAt: new Date().toISOString() })

      // Generate 6-digit PIN code for referee authentication
      const generatePinCode = (existingPins = []) => {
        const chars = '0123456789'
        let pin = ''
        let attempts = 0
        const maxAttempts = 100

        do {
          pin = ''
          for (let i = 0; i < 6; i++) {
            pin += chars.charAt(Math.floor(Math.random() * chars.length))
          }
          attempts++
          if (attempts >= maxAttempts) {
            // If we can't generate a unique PIN after many attempts, just return this one
            break
          }
        } while (existingPins.includes(pin))

        return pin
      }

      // Generate match PIN code (for opening/continuing match)
      const matchPin = prompt('Enter a PIN code to protect this match (required):')
      if (!matchPin || matchPin.trim() === '') {
        setNoticeModal({ message: t('matchSetup.validation.matchPinRequired') })
        return
      }

      // Auto-generate gamePin for official matches
      const generatedGamePin = (() => {
        const chars = '0123456789'
        let pin = ''
        for (let i = 0; i < 6; i++) {
          pin += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return pin
      })()

      // Generate all PINs upfront so we can display them in the modal
      const generatedRefereePin = generatePinCode([])
      const generatedTeam1Pin = generatePinCode([generatedRefereePin])
      const generatedTeam2Pin = generatePinCode([generatedRefereePin, generatedTeam1Pin])

      // Generate a unique seed_key for Supabase sync (stored as external_id)
      // This is the stable unique identifier - never includes modifiable fields like gameN
      const seedKey = generateMatchSeedKey()

      const createdMatchId = await db.matches.add({
        team1Id: team1DbId,
        team2Id: team2DbId,
        status: 'live',
        scheduledAt,
        // Beach volleyball location fields
        site: city, // Site
        beach: hall, // Beach name
        court, // Court number/name
        // Beach volleyball category fields
        gender: type2, // men | women
        phase, // main | qualification
        round, // pool | winner | class | semifinals | finals
        hasCoach, // Whether coaches are present
        // Team names and colors for local access
        team1Name: team1Name.trim(),
        team2Name: team2Name.trim(),
        team1ShortName: team1ShortName || team1Name.trim().toUpperCase(),
        team2ShortName: team2ShortName || team2Name.trim().toUpperCase(),
        team1Color: team1Color || '#ef4444',
        team2Color: team2Color || '#3b82f6',
        team1Country: team1Country || '',
        team2Country: team2Country || '',
        game_n: gameN ? Number(gameN) : null,
        seed_key: seedKey, // Unique key for Supabase sync
        league,
        gamePin: generatedGamePin, // Game PIN for official matches (not test matches)
        refereePin: String(generatedRefereePin).trim(),
        team1Pin: String(generatedTeam1Pin).trim(),
        team2Pin: String(generatedTeam2Pin).trim(),
        matchPin: matchPin.trim(),
        refereeConnectionEnabled: false,
        team1TeamConnectionEnabled: false,
        team2TeamConnectionEnabled: false,
        officials: buildOfficialsArray(
          { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: ref1Dob },
          { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: ref2Dob },
          { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: scorerDob },
          { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: asstDob },
          { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 }
        ),
        coinTossConfirmed: false,  // Set to true when coin toss is confirmed
        createdAt: new Date().toISOString()
      })

      // Add match to sync queue - all data stored as JSONB
      await db.sync_queue.add({
        resource: 'match',
        action: 'insert',
        payload: {
          external_id: seedKey,
          status: 'live',
          scheduled_at: scheduledAt || null,
          test: false,
          created_at: new Date().toISOString(),
          // JSONB columns - Beach volleyball specific
          match_info: {
            competition_name: league || '',
            match_number: gameN || '',
            site: city || '',
            beach: hall || '',
            court: court || '',
            gender: type2 || 'men',
            phase: phase || 'main',
            round: round || 'pool',
            has_coach: hasCoach
          },
          team1_data: { name: team1Name.trim(), short_name: team1ShortName || generateShortName(team1Name.trim()), color: team1Color || '#ef4444', country: team1Country || '' },
          team2_data: { name: team2Name.trim(), short_name: team2ShortName || generateShortName(team2Name.trim()), color: team2Color || '#3b82f6', country: team2Country || '' },
          players_team1: team1Roster.map(p => ({
            number: p.number,
            first_name: p.firstName,
            last_name: p.lastName,
            dob: formatDobForSync(p.dob),
            is_captain: !!p.isCaptain
          })),
          players_team2: team2Roster.map(p => ({
            number: p.number,
            first_name: p.firstName,
            last_name: p.lastName,
            dob: formatDobForSync(p.dob),
            is_captain: !!p.isCaptain
          })),
          officials: buildOfficialsArray(
            { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: ref1Dob },
            { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: ref2Dob },
            { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: scorerDob },
            { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: asstDob },
            { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 },
            true // useSnakeCase for Supabase
          ),
          // PINs for dashboard connections
          game_pin: generatedGamePin,
          game_n: gameN ? Number(gameN) : null,
          // Beach keys of the backend's validate-connection-pin (sport 'beach')
          connection_pins: buildConnectionPins({
            refereePin: generatedRefereePin,
            team1Pin: generatedTeam1Pin,
            team2Pin: generatedTeam2Pin
          })
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })

      // Associate user with this match if logged in
      if (user && isBackendAvailable()) {
        try {
          await apiFrom('user_matches').upsert({
            user_id: user.id,
            match_external_id: seedKey,
            role: 'scorer'
          }, { onConflict: 'user_id,match_external_id,role' })
        } catch (err) {
          // Don't fail match creation if user_matches insert fails
          console.warn('[MatchSetup] Failed to associate user with match:', err)
        }
      }

      // Add players to local Dexie (still needed for local functionality)
      if (team1Roster.length) {
        await db.players.bulkAdd(
          team1Roster.map(p => ({
            teamId: team1DbId,
            number: p.number,
            name: `${p.lastName} ${p.firstName}`,
            lastName: p.lastName,
            firstName: p.firstName,
            dob: p.dob || null,
            isCaptain: !!p.isCaptain,
            role: null,
            createdAt: new Date().toISOString()
          }))
        )
      }
      if (team2Roster.length) {
        await db.players.bulkAdd(
          team2Roster.map(p => ({
            teamId: team2DbId,
            number: p.number,
            name: `${p.lastName} ${p.firstName}`,
            lastName: p.lastName,
            firstName: p.firstName,
            dob: p.dob || null,
            isCaptain: !!p.isCaptain,
            role: null,
            createdAt: new Date().toISOString()
          }))
        )
      }

      // Don't start match yet - go to coin toss first
      // Check if team names and countries are set
      if (!team1Name || team1Name.trim() === '' || !team2Name || team2Name.trim() === '') {
        setNoticeModal({ message: t('matchSetup.validation.setBothTeamNames') })
        return
      }

      if (!team1Country || team1Country.trim() === '' || !team2Country || team2Country.trim() === '') {
        setNoticeModal({ message: t('matchSetup.validation.setBothTeamCountries') })
        return
      }

      // Show match created popup if online (has gamePin)
      if (!offlineMode && generatedGamePin) {
        setMatchCreatedModal({
          matchId: createdMatchId,
          gamePin: generatedGamePin,
          refereePin: generatedRefereePin,
          team1Pin: generatedTeam1Pin,
          team2Pin: generatedTeam2Pin
        })
      } else {
        onOpenCoinToss()
      }
    })
  }

  function switchTeams() {
    const temp = teamA
    setTeamA(teamB)
    setTeamB(temp)
  }

  function switchServe() {
    setServeA(!serveA)
    setServeB(!serveB)
  }

  // Open scoresheet in a new window
  async function openScoresheet() {
    if (!matchId) {
      setNoticeModal({ message: t('matchSetup.validation.noMatchDataAvailable') })
      return
    }

    const matchData = await db.matches.get(matchId)
    if (!matchData) {
      setNoticeModal({ message: t('matchSetup.validation.matchNotFound') })
      return
    }

    // Get teams
    const team1Data = matchData.team1Id ? await db.teams.get(matchData.team1Id) : null
    const team2Data = matchData.team2Id ? await db.teams.get(matchData.team2Id) : null

    // Get players
    const team1PlayersData = matchData.team1Id
      ? await db.players.where('teamId').equals(matchData.team1Id).toArray()
      : []
    const team2PlayersData = matchData.team2Id
      ? await db.players.where('teamId').equals(matchData.team2Id).toArray()
      : []

    // Get sets and events
    const allSets = await db.sets.where('matchId').equals(matchId).sortBy('index')
    const allEvents = await db.events.where('matchId').equals(matchId).sortBy('seq')

    // Add country data to team objects
    const team1WithCountry = team1Data ? { ...team1Data, country: matchData.team1Country || team1Country || '' } : { name: team1Name, country: matchData.team1Country || team1Country || '' }
    const team2WithCountry = team2Data ? { ...team2Data, country: matchData.team2Country || team2Country || '' } : { name: team2Name, country: matchData.team2Country || team2Country || '' }

    // Keep team keys as team1/team2 (scoresheet uses team1/team2 format)
    const normalizeTeamKey = (key) => {
      // Convert team_1/team_2 back to team1/team2 if needed, otherwise keep as is
      if (!key) return key;
      if (key === 'team_1') return 'team1';
      if (key === 'team_2') return 'team2';
      return key; // Already team1/team2 or other format
    }
    const scoresheetData = {
      match: {
        ...matchData,
        team_1Country: matchData.team1Country || team1Country || '',
        team_2Country: matchData.team2Country || team2Country || '',
        // Normalize coinTossTeamA/B for scoresheet
        coinTossTeamA: normalizeTeamKey(matchData.coinTossTeamA),
        coinTossTeamB: normalizeTeamKey(matchData.coinTossTeamB),
        // Build coinTossData for scoresheet compatibility
        coinTossData: {
          coinTossWinner: normalizeTeamKey(matchData.coinTossWinner),
          teamA: normalizeTeamKey(matchData.coinTossTeamA),
          teamB: normalizeTeamKey(matchData.coinTossTeamB)
        }
      },
      team1Team: team1WithCountry,
      team2Team: team2WithCountry,
      team1Players: team1PlayersData,
      team2Players: team2PlayersData,
      // Also include underscore versions for backward compatibility
      team_1Team: team1WithCountry,
      team_2Team: team2WithCountry,
      team_1Players: team1PlayersData,
      team_2Players: team2PlayersData,
      sets: allSets,
      events: allEvents,
      sanctions: []
    }

    // Store data in sessionStorage to pass to new window
    sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))

    // Open scoresheet in new window
    const opened = openAppWindow('/scoresheet_beach.html', { features: 'width=1200,height=900' })

    if (!opened.ok) {
      setNoticeModal({ message: t('matchSetup.validation.allowPopups') })
    }
  }

  async function confirmCoinToss() {

    // Captain signatures are collected in the CoinToss component for beach volleyball

    if (!matchId) {
      console.error('[COIN TOSS] No match ID available')
      setNoticeModal({ message: t('matchSetup.modals.errorNoMatchId') })
      return
    }

    const matchData = await db.matches.get(matchId)
    if (!matchData) {
      return
    }

    // Determine which team serves first
    const firstServeTeam = serveA ? teamA : teamB

    // Update match with signatures (only for official matches) and coin toss result
    await db.transaction('rw', db.matches, db.players, db.sync_queue, db.events, async () => {
      // Build update object
      const updateData = {
        firstServe: firstServeTeam, // 'team1' or 'team2'
        coinTossTeamA: teamA, // 'team1' or 'team2'
        coinTossTeamB: teamB, // 'team1' or 'team2'
        coinTossServeA: serveA, // true or false
        coinTossServeB: serveB, // true or false
        coinTossConfirmed: true  // Mark coin toss as confirmed
      }
      // Captain signatures are collected in CoinToss component

      const updateResult = await db.matches.update(matchId, updateData)

      // Check if coin toss event already exists
      const existingCoinTossEvent = await db.events
        .where('matchId').equals(matchId)
        .and(e => e.type === 'coin_toss')
        .first()

      // Create coin_toss event with seq=1 if it doesn't exist
      if (!existingCoinTossEvent) {
        await db.events.add({
          matchId: matchId,
          setIndex: 1, // Coin toss is before set 1
          type: 'coin_toss',
          payload: {
            teamA: teamA,
            teamB: teamB,
            serveA: serveA,
            serveB: serveB,
            firstServe: firstServeTeam
          },
          ts: new Date().toISOString(),
          seq: 1 // Coin toss always gets seq=1
        })
      }

      // Add match update to sync queue (only sync if match has seed_key)
      const updatedMatch = await db.matches.get(matchId)
      if (updatedMatch?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: updatedMatch.seed_key,
            status: 'live', // Status will be 'live' after match setup is confirmed
            scheduled_at: updatedMatch.scheduledAt || null,
            // JSONB columns
            match_info: {
              hall: updatedMatch.hall || '',
              city: updatedMatch.city || '',
              league: updatedMatch.league || ''
            },
            coin_toss: {
              team_a: teamA,
              team_b: teamB,
              confirmed: true,
              first_serve: firstServeTeam
            },
            // Captain signatures synced from CoinToss component
            team1_data: { name: team1Name?.trim() || '', short_name: team1ShortName || '', color: team1Color, country: team1Country || '' },
            team2_data: { name: team2Name?.trim() || '', short_name: team2ShortName || '', color: team2Color, country: team2Country || '' },
            players_team1: team1Roster.filter(p => p.firstName || p.lastName).map(p => ({
              number: p.number || null,
              first_name: p.firstName || '',
              last_name: p.lastName || '',
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            players_team2: team2Roster.filter(p => p.firstName || p.lastName).map(p => ({
              number: p.number || null,
              first_name: p.firstName || '',
              last_name: p.lastName || '',
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            officials: updatedMatch.officials || []
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      // Update players for both teams
      if (matchData.team1Id && team1Roster.length) {
        // Get existing players
        const existingPlayers = await db.players.where('teamId').equals(matchData.team1Id).toArray()

        // Update or add players
        for (const p of team1Roster) {
          const existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          if (existingPlayer) {
            // Update existing player
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain
            })
          } else {
            // Add new player
            await db.players.add({
              teamId: matchData.team1Id,
              number: p.number,
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain,
              role: null,
              createdAt: new Date().toISOString()
            })
          }
        }

        // Delete players that are no longer in the roster
        const rosterNumbers = new Set(team1Roster.map(p => p.number))
        for (const ep of existingPlayers) {
          if (!rosterNumbers.has(ep.number)) {
            await db.players.delete(ep.id)
          }
        }
      }

      if (matchData.team2Id && team2Roster.length) {
        // Get existing players
        const existingPlayers = await db.players.where('teamId').equals(matchData.team2Id).toArray()

        // Update or add players
        for (const p of team2Roster) {
          const existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          if (existingPlayer) {
            // Update existing player
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain
            })
          } else {
            // Add new player
            await db.players.add({
              teamId: matchData.team2Id,
              number: p.number,
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain,
              role: null,
              createdAt: new Date().toISOString()
            })
          }
        }

        // Delete players that are no longer in the roster
        const rosterNumbers = new Set(team2Roster.map(p => p.number))
        for (const ep of existingPlayers) {
          if (!rosterNumbers.has(ep.number)) {
            await db.players.delete(ep.id)
          }
        }
      }
    })

    // Create first set
    const firstSetId = await db.sets.add({ matchId: matchId, index: 1, team1Points: 0, team2Points: 0, finished: false })

    // Get match to check if it's a test match
    const matchForSet = await db.matches.get(matchId)
    const isTest = matchForSet?.test || false

    // Only sync official matches (not test matches) with seed_key
    if (!isTest && matchForSet?.seed_key) {
      await db.sync_queue.add({
        resource: 'set',
        action: 'insert',
        payload: {
          external_id: setExtId(matchForSet.seed_key, firstSetId),
          match_id: matchForSet.seed_key, // Use seed_key (external_id) for Supabase lookup
          index: 1,
          team1_points: 0,
          team2_points: 0,
          finished: false,
          start_time: roundToMinute(new Date().toISOString())
        },
        ts: roundToMinute(new Date().toISOString()),
        status: 'queued'
      })
    }

    // Update match status to 'live' to indicate match has started
    await db.matches.update(matchId, { status: 'live' })

    // Ensure all roster updates are committed before navigating
    // Force a small delay to ensure database updates are fully committed
    await new Promise(resolve => setTimeout(resolve, 100))

    // Sync to server immediately so referee dashboards receive data before Scoreboard mounts
    const finalMatchData = await db.matches.get(matchId)
    if (finalMatchData) {
      await syncMatchToServer(finalMatchData, true) // Full sync with teams, players, sets, events
    }

    // Start the match - directly navigate to scoreboard
    // onStart (continueMatch) will now allow test matches when status is 'live' and coin toss is confirmed
    onStart(matchId)
  }

  // (The "search uploaded roster" handlers are gone: nothing called them, they
  // read pending_team1_roster / pending_team2_roster, columns the backend
  // does not have, unscoped by sport. A roster upload for beach needs the
  // backend's upload-roster, which is indoor only today; plan, later phase.)

  // Callback for opening database selector - MUST be before any early returns to satisfy React hooks rules
  const handleOpenDatabase = useCallback((e, selectorKey) => {
    setRefereeSelectorPosition({ element: e.currentTarget })
    setShowRefereeSelector(selectorKey)
  }, [])

  // ── Saved beach teams: load, confirm before replacing, suggestions ──
  const savedSuggestion = (() => {
    if (!canReadSavedTeams || !savedTeams.length) return { team1: null, team2: null }
    const found = findBeachTeamSuggestions(savedTeams, { team1Name, team2Name, league, gender: type2, date })
    return {
      team1: found.team1 && !rosterHasNames(team1Roster) && !suggestionDismissed.team1 ? found.team1 : null,
      team2: found.team2 && !rosterHasNames(team2Roster) && !suggestionDismissed.team2 ? found.team2 : null
    }
  })()

  const applySavedTeam = (side, row) => {
    const r = savedTeamToBeachRoster(row)
    if (side === 'team1') {
      setTeam1Roster(r.roster)
      if (!team1Name.trim()) setTeam1Name(r.meta.name)
      if (!team1ShortName && r.meta.shortName) setTeam1ShortName(r.meta.shortName)
      if (r.meta.color && team1Color === '#ef4444') setTeam1Color(r.meta.color)
      if (r.country) setTeam1Country(r.country)
    } else {
      setTeam2Roster(r.roster)
      if (!team2Name.trim()) setTeam2Name(r.meta.name)
      if (!team2ShortName && r.meta.shortName) setTeam2ShortName(r.meta.shortName)
      if (r.meta.color && team2Color === '#3b82f6') setTeam2Color(r.meta.color)
      if (r.country) setTeam2Country(r.country)
    }
    // hasCoach is match-wide and stays as it is; captains stay unset (the
    // roster error box asks the scorer to choose one).
    showAlert(t('savedTeams.loaded', { name: row.name }), 'success')
    for (const w of r.warnings) showAlert(t(w.key, w.params), 'info')
  }

  const pickSavedTeam = (side, row) => {
    setSavedPicker(null)
    const roster = side === 'team1' ? team1Roster : team2Roster
    if (rosterHasNames(roster)) setSavedReplace({ side, row })
    else applySavedTeam(side, row)
  }

  // "Load saved team" for the roster header (secondary, beside the roster
  // tools), or a short note when this device cannot read saved teams
  // (signed out, pending, no scorer role).
  const renderSavedTeamControl = (side) => {
    if (canReadSavedTeams) {
      return (
        <Button variant="secondary" size="xl" icon={Database} onClick={() => setSavedPicker(side)}>
          {t('savedTeams.load')}
        </Button>
      )
    }
    if (!isBackendAvailable()) return null
    // Signed in but the profile (roles) is not known yet: say nothing rather
    // than tell an approved scorer to ask for approval
    if (user && !access?.known) return null
    return (
      <span data-testid="saved-teams-note" className="max-w-[220px] self-center text-xs text-stone-500">
        {user ? t('savedTeams.noAccessNote') : t('savedTeams.signInNote')}
      </span>
    )
  }

  // A saved team matches what was typed: the sky info strip (volleyui: sky =
  // pending / info), white mini-buttons in the same hue.
  const SUGGESTION_BOX = 'rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sky-900'
  const SUGGESTION_BTN = `inline-flex min-h-11 items-center rounded-lg border border-sky-300 bg-white px-3 text-sm font-medium text-sky-800 hover:bg-sky-100 transition-colors ${FOCUS_RING}`

  // One side's suggestion, under the roster title of the team view
  const renderSuggestionStrip = (side) => {
    const row = savedSuggestion[side]
    if (!row) return null
    return (
      <div data-testid={`saved-team-suggestion-${side}`} role="status" className={cn(SUGGESTION_BOX, 'flex flex-wrap items-center gap-2')}>
        <span className="min-w-[200px] flex-1 text-sm">
          <strong className="font-semibold">{t('savedTeams.suggestionTitle')}</strong>{' · '}
          {t(side === 'team1' ? 'savedTeams.suggestionTeam1' : 'savedTeams.suggestionTeam2', { name: row.name })}
        </span>
        <button type="button" className={SUGGESTION_BTN} onClick={() => applySavedTeam(side, row)}>
          {t(side === 'team1' ? 'savedTeams.loadTeam1' : 'savedTeams.loadTeam2')}
        </button>
        <button type="button" className={SUGGESTION_BTN} onClick={() => setSuggestionDismissed(d => ({ ...d, [side]: true }))}>
          {t('savedTeams.dismiss')}
        </button>
      </div>
    )
  }

  // Both sides, above the team cards of the main view
  const renderSuggestionBanner = () => {
    const { team1: s1, team2: s2 } = savedSuggestion
    if (!s1 && !s2) return null
    return (
      <div data-testid="saved-team-suggestions" role="status" className={SUGGESTION_BOX}>
        <p className="text-sm font-semibold">{t('savedTeams.suggestionTitle')}</p>
        <div className="mt-0.5 flex flex-col gap-0.5 text-xs">
          {s1 && <span>{t('savedTeams.suggestionTeam1', { name: s1.name })}</span>}
          {s2 && <span>{t('savedTeams.suggestionTeam2', { name: s2.name })}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {s1 && (
            <button type="button" className={SUGGESTION_BTN} onClick={() => applySavedTeam('team1', s1)}>
              {t('savedTeams.loadTeam1')}
            </button>
          )}
          {s2 && (
            <button type="button" className={SUGGESTION_BTN} onClick={() => applySavedTeam('team2', s2)}>
              {t('savedTeams.loadTeam2')}
            </button>
          )}
          <button type="button" className={SUGGESTION_BTN} onClick={() => setSuggestionDismissed({ team1: true, team2: true })}>
            {t('savedTeams.dismiss')}
          </button>
        </div>
      </div>
    )
  }

  // The notice / syncing dialog (one copy for the main and roster views): a
  // kit decision dialog with the state icon, the message and one dark OK.
  // While syncing it has no button and cannot be closed, as before.
  const renderNoticeModal = () => noticeModal && (
    <div className="ov-kit" style={DIALOG_LAYER}>
      <KitModal
        open
        decision
        dismissible={false}
        size="sm"
        onClose={() => !noticeModal.syncing && setNoticeModal(null)}
        closeLabel={t('common.close')}
      >
        <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
          {noticeModal.syncing && (
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
              <Loader2 size={24} className="animate-spin" aria-hidden="true" />
            </span>
          )}
          {!noticeModal.syncing && noticeModal.type === 'success' && (
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check size={24} aria-hidden="true" />
            </span>
          )}
          {!noticeModal.syncing && noticeModal.type === 'error' && (
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl font-bold text-red-600" aria-hidden="true">×</span>
          )}
          <h3 className="text-lg font-bold text-stone-900">
            {noticeModal.syncing ? t('matchSetup.modals.syncing') : noticeModal.type === 'success' ? t('matchSetup.modals.success') : t('matchSetup.modals.notice')}
          </h3>
          <p className="mt-2 whitespace-pre-line text-sm text-stone-600">
            {noticeModal.message}
          </p>
          {!noticeModal.syncing && (
            <button type="button" onClick={() => setNoticeModal(null)} className={cn(modalPrimaryClass, 'mt-5 min-h-11 min-w-28')}>
              {t('common.ok')}
            </button>
          )}
        </div>
      </KitModal>
    </div>
  )

  // Roster preview of an uploaded roster (kit content dialog, svrz table).
  const renderRosterPreview = () => rosterPreview && (
    <div className="ov-kit" style={DIALOG_LAYER}>
      <KitModal
        open
        size="lg"
        layout="sections"
        dismissible={false}
        onClose={() => setRosterPreview(null)}
        closeLabel={t('common.close')}
        title={t('matchSetup.rosterPreviewTitle')}
        footer={(
          <button type="button" onClick={() => setRosterPreview(null)} className={modalPrimaryClass}>
            {t('common.close')}
          </button>
        )}
      >
        {(() => {
          const roster = rosterPreview === 'team1' ? match?.pendingTeam1Roster : match?.pendingTeam2Roster
          if (!roster) return <p className="text-sm text-stone-500">{t('matchSetup.noRosterFound')}</p>
          return (
            <>
              <SectionHeader title={t('matchSetup.playersCount')} count={roster.players?.length || 0} />
              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">{t('rosterSetup.lastName')}</th>
                      <th className="px-3 py-2 text-left">{t('rosterSetup.firstName')}</th>
                      <th className="px-3 py-2 text-center">C</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800">
                    {(roster.players || []).map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 tabular-nums">{p.number}</td>
                        <td className="px-3 py-1.5">{p.lastName || ''}</td>
                        <td className="px-3 py-1.5">{p.firstName || ''}</td>
                        <td className="px-3 py-1.5 text-center">{p.isCaptain ? 'C' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}
      </KitModal>
    </div>
  )

  // "Load test roster?" (kit decision dialog: Cancel left, dark Load right).
  const renderTestRosterConfirm = (teamName, onLoad) => (
    <div className="ov-kit" style={DIALOG_LAYER}>
      <KitModal
        open
        decision
        size="sm"
        dismissible={false}
        onClose={() => setTestRosterConfirm(null)}
        closeLabel={t('common.close')}
        title={t('roster.confirmLoadTestRoster')}
        footer={(
          <>
            <button type="button" onClick={() => setTestRosterConfirm(null)} className={modalCancelClass}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onLoad} className={modalPrimaryClass}>
              {t('roster.loadTestRoster')}
            </button>
          </>
        )}
      >
        <p className="text-sm text-stone-600">
          {t('roster.confirmLoadTestRosterMessage', { team: teamName })}
        </p>
      </KitModal>
    </div>
  )

  const savedTeamsModals = (
    <>
      <SavedTeamPickerModal
        open={savedPicker !== null}
        side={savedPicker}
        onClose={() => setSavedPicker(null)}
        onPick={(row) => pickSavedTeam(savedPicker, row)}
        userId={user?.id ?? null}
        access={access}
      />
      {savedReplace && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            size="sm"
            dismissible={false}
            onClose={() => setSavedReplace(null)}
            closeLabel={t('common.close')}
            title={t('savedTeams.replaceConfirmTitle')}
            footer={(
              <>
                <button type="button" onClick={() => setSavedReplace(null)} className={modalCancelClass}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { side, row } = savedReplace
                    setSavedReplace(null)
                    applySavedTeam(side, row)
                  }}
                  className={modalPrimaryClass}
                >
                  {t('savedTeams.replace')}
                </button>
              </>
            )}
          >
            <p className="text-sm text-stone-600">
              {t('savedTeams.replaceConfirmBody', {
                team: (savedReplace.side === 'team1' ? team1Name : team2Name) || t(savedReplace.side === 'team1' ? 'matchSetup.team1' : 'matchSetup.team2')
              })}
            </p>
          </KitModal>
        </div>
      )}
    </>
  )

  if (currentView === 'info') {
    return (
      <MatchSetupInfoView kitScale={kitScale}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div>
            <Button variant="ghost" size="xl" icon={ArrowLeft} className="bg-white" onClick={() => { restoreMatchInfo(); setCurrentView('main') }}>{t('common.back')}</Button>
          </div>
          <h1 className="m-0 text-center text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('matchSetup.matchInfo')}</h1>
          <div />
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          <div className={cn('flex flex-col p-4', SETUP_BLOCK)}>
            <h3 className="mb-3 text-sm font-semibold text-stone-700">{t('matchSetup.competitionName')}</h3>
            <div className="flex flex-1 flex-col gap-3">
              <Field className={FIELD} label={t('matchSetup.competitionName')}>
                <Input size="lg" className="capitalize" value={league} onChange={async e => {
                  const newLeague = e.target.value
                  setLeague(newLeague)
                  // Re-check game number duplicate with new league
                  const parsed = parseInt(gameN, 10)
                  if (gameN?.trim() && !isNaN(parsed)) {
                    const newLeagueLower = (newLeague || '').trim().toLowerCase()
                    const allMatches = await db.matches.toArray()
                    const dup = allMatches.find(m => m.id !== matchId && m.game_n === parsed && (m.league || '').trim().toLowerCase() === newLeagueLower)
                    setGameNError(dup ? t('matchSetup.validation.duplicateGameNumber', { number: parsed }) : '')
                  } else {
                    setGameNError('')
                  }
                }} placeholder={t('matchSetup.enterCompetitionName')} />
              </Field>
              <Field className={FIELD} label={t('matchSetup.matchNumber')} error={gameNError || undefined}>
                <Input
                  size="lg"
                  className="tabular-nums"
                  value={gameN}
                  onChange={async e => {
                    const val = e.target.value
                    setGameN(val)
                    // Check for local duplicates (scoped to same league/tournament)
                    const parsed = parseInt(val, 10)
                    if (val?.trim() && !isNaN(parsed)) {
                      const currentLeague = (league || '').trim().toLowerCase()
                      const allMatches = await db.matches.toArray()
                      const dup = allMatches.find(m => m.id !== matchId && m.game_n === parsed && (m.league || '').trim().toLowerCase() === currentLeague)
                      setGameNError(dup ? t('matchSetup.validation.duplicateGameNumber', { number: parsed }) : '')
                    } else {
                      setGameNError('')
                    }
                  }}
                  placeholder="e.g. M01"
                />
              </Field>
              <Field className={FIELD} label={t('matchSetup.date')} error={dateError || undefined}>
                <Input
                  size="lg"
                  type="text"
                  inputMode="numeric"
                  className="max-w-[180px] tabular-nums"
                  value={date}
                  onChange={e => {
                    let val = e.target.value
                    // Auto-format as user types: dd.mm.yyyy
                    val = val.replace(/[^\d.]/g, '') // Remove non-digits and dots
                    if (val.length > 2 && val[2] !== '.') val = val.slice(0, 2) + '.' + val.slice(2)
                    if (val.length > 5 && val[5] !== '.') val = val.slice(0, 5) + '.' + val.slice(5)
                    if (val.length > 10) val = val.slice(0, 10)
                    handleDateChange(val)
                  }}
                  placeholder="dd.mm.yyyy"
                />
              </Field>
              <Field className={FIELD} label={t('matchSetup.time')} error={timeError || undefined}>
                <Input
                  size="lg"
                  type="text"
                  inputMode="numeric"
                  className="max-w-[120px] tabular-nums"
                  value={time}
                  onChange={e => {
                    let val = e.target.value
                    // Only allow digits and colon, format as HH:MM
                    val = val.replace(/[^\d:]/g, '')
                    if (val.length > 2 && val[2] !== ':') val = val.slice(0, 2) + ':' + val.slice(2)
                    if (val.length > 5) val = val.slice(0, 5)
                    handleTimeChange(val)
                  }}
                  placeholder="HH:MM"
                />
              </Field>
            </div>
          </div>

          <div className={cn('flex flex-col p-4', SETUP_BLOCK)}>
            <h3 className="mb-3 text-sm font-semibold text-stone-700">{t('matchSetup.location')}</h3>
            <div className="flex flex-1 flex-col gap-3">
              <Field className={FIELD} label={t('matchSetup.site')}>
                <Input size="lg" className="capitalize" value={city} onChange={e => setCity(e.target.value)} placeholder={t('matchSetup.enterSite')} />
              </Field>
              <Field className={FIELD} label={t('matchSetup.beach')}>
                <Input size="lg" className="capitalize" value={hall} onChange={e => setHall(e.target.value)} placeholder={t('matchSetup.enterBeach')} />
              </Field>
              <Field className={FIELD} label={t('matchSetup.court')}>
                <Input size="lg" value={court} onChange={e => setCourt(e.target.value)} placeholder="e.g. 1, Center" />
              </Field>
            </div>
          </div>

          <div className={cn('flex flex-col p-4', SETUP_BLOCK)}>
            <h3 className="mb-3 text-sm font-semibold text-stone-700">{t('matchSetup.category', 'Category')}</h3>
            <div className="flex flex-1 flex-col gap-3">
              <Field className={FIELD} label={t('matchSetup.gender')}>
                <Select size="lg" block value={type2} onChange={e => setType2(e.target.value)}>
                  <option value="men">{t('matchSetup.men')}</option>
                  <option value="women">{t('matchSetup.women')}</option>
                </Select>
              </Field>
              <Field className={FIELD} label={t('matchSetup.phase')}>
                <Select size="lg" block value={phase} onChange={e => setPhase(e.target.value)}>
                  <option value="main">{t('matchSetup.mainDraw')}</option>
                  <option value="qualification">{t('matchSetup.qualification')}</option>
                </Select>
              </Field>
              <Field className={FIELD} label={t('matchSetup.round')}>
                <Select size="lg" block value={round} onChange={e => setRound(e.target.value)}>
                  <option value="pool">{t('matchSetup.poolPlay')}</option>
                  <option value="winner">{t('matchSetup.winnerBracket')}</option>
                  <option value="class">{t('matchSetup.classificationRound')}</option>
                  <option value="semifinals">{t('matchSetup.semifinals')}</option>
                  <option value="finals">{t('matchSetup.finals')}</option>
                </Select>
              </Field>
              <Field className={FIELD} label={t('matchSetup.coach')}>
                <Select size="lg" block value={hasCoach ? 'yes' : 'no'} onChange={e => setHasCoach(e.target.value === 'yes')}>
                  <option value="no">{t('common.no')}</option>
                  <option value="yes">{t('common.yes')}</option>
                </Select>
              </Field>
            </div>
          </div>
        </div>
        {match && !match.test && match.gamePin && (
          <div className={cn('mx-auto w-full max-w-md p-4 text-center', SETUP_BLOCK)}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t('matchSetup.gamePin')}</div>
            <div className="mt-1 cursor-text select-text font-mono text-2xl font-bold tracking-[0.3em] text-stone-900 tabular-nums">{match.gamePin}</div>
            <div className="mt-1 text-xs text-stone-500">
              {t('matchSetup.gamePinDescription')}
            </div>
            <div className="mt-4 text-left">
              <label htmlFor="ob-notification-email" className="mb-1.5 block text-sm font-medium text-stone-700">
                {t('matchSetup.notificationEmail')}
              </label>
              <div className="flex gap-2">
                <Input
                  id="ob-notification-email"
                  size="lg"
                  type="email"
                  className="min-w-0 flex-1"
                  placeholder={t('matchSetup.notificationEmailPlaceholder')}
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                />
                <Button
                  variant="dark"
                  size="xl"
                  loading={sendingEmail}
                  onClick={async () => {
                    if (!notificationEmail || !notificationEmail.includes('@')) {
                      showAlert(t('matchSetup.invalidEmail') || 'Please enter a valid email address', 'warning')
                      return
                    }
                    setSendingEmail(true)
                    try {
                      const sendInfoUrl = getCloudApiUrl('/api/match/send-info')
                      if (!sendInfoUrl) throw new Error('No cloud backend')
                      const res = await fetch(sendInfoUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          email: notificationEmail,
                          gameN: gameN,
                          gamePin: match.gamePin,
                          team1: team1Name,
                          team1ShortName: team1ShortName,
                          team2: team2Name,
                          team2ShortName: team2ShortName,
                          date: date,
                          time: time,
                          hall: hall,
                          city: city,
                          league: league
                        })
                      })
                      const data = await res.json()
                      if (data.success) {
                        showAlert(t('matchSetup.emailSent') || 'Email sent successfully!', 'success')
                      } else {
                        showAlert(data.error || t('matchSetup.emailFailed') || 'Failed to send email', 'error')
                      }
                    } catch (err) {
                      console.error('Failed to send email:', err)
                      showAlert(t('matchSetup.emailFailed') || 'Failed to send email. Check server connection.', 'error')
                    } finally {
                      setSendingEmail(false)
                    }
                  }}
                >
                  {sendingEmail ? (t('matchSetup.sending') || 'Sending...') : (t('matchSetup.send') || 'Send')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-stone-200/70 pt-4">
          <Button
            variant="primary"
            size="xl"
            className="min-w-40"
            onClick={(e) => {
              if (!canConfirmMatchInfo) {
                e.preventDefault()
                const tooltip = getMissingFieldsTooltip()
                if (tooltip) {
                  showAlert(tooltip, 'info')
                }
              } else {
                confirmMatchInfo()
              }
            }}
            disabled={!canConfirmMatchInfo}
            title={!canConfirmMatchInfo ? getMissingFieldsTooltip() : ''}
          >
            {matchInfoConfirmed ? t('matchSetup.save') : t('matchSetup.createMatch')}
          </Button>
        </div>

        {/* Color Picker Modal for Match Info view (kit dialog, frozen shirts) */}
        {colorPickerModal && (
          <div className="ov-kit" style={DIALOG_LAYER}>
            <KitModal
              open
              size="sm"
              onClose={() => setColorPickerModal(null)}
              closeLabel={t('common.close')}
              title={t('matchSetup.chooseTeamColour', { team: colorPickerModal.team === 'team1' ? t('common.team1') : t('common.team2') })}
            >
              <div className="grid grid-cols-4 gap-2">
                {teamColors.map((color) => {
                  const isSelected = (colorPickerModal.team === 'team1' ? team1Color : team2Color) === color
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        if (colorPickerModal.team === 'team1') {
                          setTeam1Color(color)
                        } else {
                          setTeam2Color(color)
                        }
                        setColorPickerModal(null)
                      }}
                      aria-pressed={isSelected}
                      aria-label={color}
                      title={color}
                      className={cn(
                        'flex min-h-16 min-w-[60px] items-center justify-center rounded-lg border px-2 py-3 transition-colors',
                        isSelected ? 'border-slate-900 ring-2 ring-slate-900' : 'border-stone-200 bg-white hover:bg-stone-50',
                        FOCUS_RING
                      )}
                    >
                      <div className="shirt" style={{ background: color, transform: 'scale(0.8)' }}>
                        <div className="collar" style={{ background: color }} />
                        <div className="number" style={{ color: getContrastColor(color) }}>1</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </KitModal>
          </div>
        )}

      </MatchSetupInfoView>
    )
  }

  if (currentView === 'officials') {
    return (
      <MatchSetupOfficialsView kitScale={kitScale}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div>
            <Button variant="ghost" size="xl" icon={ArrowLeft} className="bg-white" onClick={() => { restoreOfficials(); setCurrentView('main') }}>{t('common.back')}</Button>
          </div>
          <h1 className="m-0 text-center text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('matchSetup.matchOfficials')}</h1>
          <div />
        </div>

        <div className="flex flex-col gap-3">
          <OfficialCard
            title={t('matchSetup.referee1')}
            officialKey="ref1"
            lastName={ref1Last}
            firstName={ref1First}
            country={ref1Country}
            dob={ref1Dob}
            setLastName={setRef1Last}
            setFirstName={setRef1First}
            setCountry={setRef1Country}
            setDob={setRef1Dob}
            hasDatabase={true}
            selectorKey="ref1"
            isExpanded={expandedOfficialId === 'ref1'}
            onToggleExpanded={() => toggleOfficialExpanded('ref1')}
            onOpenDatabase={handleOpenDatabase}
            manageDob={manageDob}
            t={t}
          />
          <OfficialCard
            title={t('matchSetup.referee2')}
            officialKey="ref2"
            lastName={ref2Last}
            firstName={ref2First}
            country={ref2Country}
            dob={ref2Dob}
            setLastName={setRef2Last}
            setFirstName={setRef2First}
            setCountry={setRef2Country}
            setDob={setRef2Dob}
            hasDatabase={true}
            selectorKey="ref2"
            isExpanded={expandedOfficialId === 'ref2'}
            onToggleExpanded={() => toggleOfficialExpanded('ref2')}
            onOpenDatabase={handleOpenDatabase}
            manageDob={manageDob}
            t={t}
          />
          <OfficialCard
            title={t('matchSetup.scorer')}
            officialKey="scorer"
            lastName={scorerLast}
            firstName={scorerFirst}
            country={scorerCountry}
            dob={scorerDob}
            setLastName={setScorerLast}
            setFirstName={setScorerFirst}
            setCountry={setScorerCountry}
            setDob={setScorerDob}
            hasDatabase={false}
            selectorKey="scorer"
            isExpanded={expandedOfficialId === 'scorer'}
            onToggleExpanded={() => toggleOfficialExpanded('scorer')}
            onOpenDatabase={handleOpenDatabase}
            manageDob={manageDob}
            t={t}
          />
          <OfficialCard
            title={t('matchSetup.assistantScorer')}
            officialKey="asst"
            lastName={asstLast}
            firstName={asstFirst}
            country={asstCountry}
            dob={asstDob}
            setLastName={setAsstLast}
            setFirstName={setAsstFirst}
            setCountry={setAsstCountry}
            setDob={setAsstDob}
            isExpanded={expandedOfficialId === 'asst'}
            onToggleExpanded={() => toggleOfficialExpanded('asst')}
            onOpenDatabase={handleOpenDatabase}
            manageDob={manageDob}
            t={t}
          />
          <LineJudgesCard
            lineJudge1={lineJudge1}
            lineJudge2={lineJudge2}
            lineJudge3={lineJudge3}
            lineJudge4={lineJudge4}
            setLineJudge1={setLineJudge1}
            setLineJudge2={setLineJudge2}
            setLineJudge3={setLineJudge3}
            setLineJudge4={setLineJudge4}
            isExpanded={expandedOfficialId === 'lineJudges'}
            onToggleExpanded={() => toggleOfficialExpanded('lineJudges')}
            t={t}
          />
        </div>
        {/* Referee Selector */}
        <RefereeSelector
          open={showRefereeSelector !== null}
          onClose={() => setShowRefereeSelector(null)}
          onSelect={(referee) => {
            if (showRefereeSelector === 'ref1') {
              setRef1First(referee.firstName || '')
              setRef1Last(referee.lastName || '')
              setRef1Country(referee.country || 'CHE')
              setRef1Dob(referee.dob || '01.01.1900')
            } else if (showRefereeSelector === 'ref2') {
              setRef2First(referee.firstName || '')
              setRef2Last(referee.lastName || '')
              setRef2Country(referee.country || 'CHE')
              setRef2Dob(referee.dob || '01.01.1900')
            } else if (showRefereeSelector === 'scorer') {
              setScorerFirst(referee.firstName || '')
              setScorerLast(referee.lastName || '')
              setScorerCountry(referee.country || 'CHE')
              setScorerDob(referee.dob || '01.01.1900')
            }
          }}
          position={refereeSelectorPosition}
        />

        <div className="flex justify-end border-t border-stone-200/70 pt-4">
          <Button variant="primary" size="xl" className="min-w-40" onClick={async () => {
            // Check if any changes were made (skip sync if no changes)
            const currentOfficials = {
              ref1First, ref1Last, ref1Country, ref1Dob,
              ref2First, ref2Last, ref2Country, ref2Dob,
              scorerFirst, scorerLast, scorerCountry, scorerDob,
              asstFirst, asstLast, asstCountry, asstDob,
              lineJudge1, lineJudge2, lineJudge3, lineJudge4
            }
            const hasChanges = hasOfficialsChanged(originalOfficialsRef.current, currentOfficials)

            // If no changes, just go back to main view
            if (!hasChanges) {
              setCurrentView('main')
              return
            }

            // Save officials to database if matchId exists
            if (matchId) {
              await db.matches.update(matchId, {
                officials: buildOfficialsArray(
                  { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: ref1Dob },
                  { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: ref2Dob },
                  { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: scorerDob },
                  { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: asstDob },
                  { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 }
                )
              })

              // Sync officials to Supabase as JSONB
              const matchForOfficials = await db.matches.get(matchId)
              if (matchForOfficials?.seed_key) {
                await db.sync_queue.add({
                  resource: 'match',
                  action: 'update',
                  payload: {
                    id: matchForOfficials.seed_key,
                    officials: buildOfficialsArray(
                      { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: formatDobForSync(ref1Dob) },
                      { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: formatDobForSync(ref2Dob) },
                      { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: formatDobForSync(scorerDob) },
                      { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: formatDobForSync(asstDob) },
                      { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 },
                      true // useSnakeCase for Supabase
                    )
                  },
                  ts: new Date().toISOString(),
                  status: 'queued'
                })
              }

              const waitForCloud = cloudSyncWaitNow()
              setNoticeModal(waitForCloud
                ? { message: t('matchSetup.officialsSaved'), type: 'success', syncing: true }
                : { message: t('matchSetup.officialsSavedLocal'), type: 'success' })

              // Poll to check when sync completes
              const checkSyncStatus = async () => {
                let attempts = 0
                const maxAttempts = 20
                const interval = setInterval(async () => {
                  attempts++
                  try {
                    const queued = await db.sync_queue.where('status').equals('queued').count()
                    if (queued === 0) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.officialsSynced'), type: 'success' })
                    } else if (attempts >= maxAttempts) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.officialsSavedLocal'), type: 'success' })
                    }
                  } catch (err) {
                    clearInterval(interval)
                  }
                }, 500)
              }
              if (waitForCloud) checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</Button>
        </div>
      </MatchSetupOfficialsView>
    )
  }

  if (currentView === 'team1') {
    return (
      <MatchSetupTeam1View kitScale={kitScale}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div>
            <Button variant="ghost" size="xl" icon={ArrowLeft} className="bg-white" onClick={() => { restoreTeam1(); setCurrentView('main') }}>{t('common.back')}</Button>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <input
              type="text"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label={t('matchSetup.teamName')}
              value={team1Name || getTeamDisplayName(team1Roster, 'team1', team1Country)}
              onChange={e => setTeam1Name(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
              className="h-12 w-auto min-w-[100px] max-w-full rounded-xl border border-stone-200 bg-white px-3 text-center text-xl font-bold tracking-tight text-stone-900 sm:max-w-[500px] focus:border-red-700/40 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              size={Math.max(10, (team1Name || getTeamDisplayName(team1Roster, 'team1', team1Country)).length)}
            />
            {team1Name && team1Name !== getTeamDisplayName(team1Roster, 'team1', team1Country) && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                className="bg-white"
                onClick={() => setTeam1Name(getTeamDisplayName(team1Roster, 'team1', team1Country))}
              >
                {t('roster.autoName', 'Auto')}
              </Button>
            )}
          </div>
          <div />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('roster.title')}</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {renderSavedTeamControl('team1')}
            <Button
              variant="danger-soft"
              size="xl"
              onClick={() => {
                setTeam1Roster([
                  { number: 1, firstName: '', lastName: '', dob: '', isCaptain: false },
                  { number: 2, firstName: '', lastName: '', dob: '', isCaptain: false }
                ])
              }}
            >
              {t('roster.deleteRoster')}
            </Button>
            <Button variant="dark" size="xl" onClick={() => setTestRosterConfirm('team1')}>
              {t('roster.loadTestRoster')}
            </Button>
          </div>
        </div>
        {renderSuggestionStrip('team1')}
        {/* Captain and country of the team (red notice while one is missing) */}
        {(() => {
          const team1CaptainForm = team1Roster.find(p => p.isCaptain)
          const team1HasError = !team1CaptainForm || team1Roster.length !== 2 || !team1Country
          return (
            <div className={cn(
              'flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-xl border p-3',
              team1HasError ? 'border-red-100 bg-red-50' : 'border-stone-200/70 bg-stone-50/60'
            )}>
              <div className="flex items-center gap-2">
                <span className={cn('text-base font-semibold', !team1CaptainForm ? 'text-red-700' : 'text-stone-700')}>{t('matchSetup.captain')}</span>
                {team1CaptainForm ? (
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-xl font-bold tabular-nums text-emerald-700">
                    {team1CaptainForm.number || '?'}
                  </span>
                ) : (
                  <span className="text-xl font-semibold text-red-700" aria-label={t('matchSetup.notSet')}>—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-base font-semibold', !team1Country ? 'text-red-700' : 'text-stone-700')}>{t('matchSetup.country')}</span>
                <CountrySelect
                  value={team1Country}
                  onChange={setTeam1Country}
                  placeholder={t('matchSetup.selectCountry')}
                  fontSize="18px"
                />
              </div>
            </div>
          )
        })()}

        <div className="rounded-lg border border-stone-200 bg-white">
          {/* Roster Header Row (landscape; on a phone each row stacks and the fields carry placeholders) */}
          <div className={cn(ROSTER_GRID, manageDob && ROSTER_GRID_DOB, 'hidden rounded-t-[7px] border-b border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:grid')}>
            <div className="text-center">#</div>
            <div>{t('matchSetup.lastName')}</div>
            <div>{t('matchSetup.firstName')}</div>
            {manageDob && <div>{t('matchSetup.dateOfBirth')}</div>}
            <div className="text-center" title={t('matchSetup.captain')}>C</div>
            <div />
          </div>
          <div className="divide-y divide-stone-100">
          {team1Roster.map((p, i) => {
            // Captain row: the emerald outline (the captain marker)
            const isCaptain = p.isCaptain || false

            return (
              <div key={`h-${i}`} className={cn(ROSTER_GRID, manageDob && ROSTER_GRID_DOB, 'px-3 py-2.5', isCaptain && 'bg-emerald-50/60 ring-2 ring-inset ring-emerald-600', i === team1Roster.length - 1 && 'rounded-b-[7px]')}>
                {/* Shirt number: 1 or 2 (the other player takes the other number) */}
                <div className="order-1 flex gap-1 sm:order-none" role="group" aria-label={t('roster.numberLabel')}>
                  {[1, 2].map(num => {
                    const isSelected = p.number === num
                    return (
                      <button
                        key={num}
                        type="button"
                        aria-pressed={isSelected}
                        className={cn(
                          'toggle-num inline-flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold tabular-nums transition-colors',
                          isSelected ? 'selected border-slate-900 bg-slate-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
                          FOCUS_RING
                        )}
                        onClick={() => {
                          setTeam1Roster(prev => {
                            const newRoster = [...prev]
                            // Set this player to num
                            newRoster[i] = { ...newRoster[i], number: num }

                            // Find other player (if any) and set to opposite number
                            const otherIdx = newRoster.findIndex((_, idx) => idx !== i)
                            if (otherIdx !== -1) {
                              newRoster[otherIdx] = { ...newRoster[otherIdx], number: num === 1 ? 2 : 1 }
                            }

                            return newRoster
                          })
                        }}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
                <Input
                  size="lg"
                  className="order-4 col-span-full capitalize sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.lastName')}
                  placeholder={t('matchSetup.lastName')}
                  value={p.lastName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], lastName: e.target.value }
                    setTeam1Roster(updated)
                  }}
                />
                <Input
                  size="lg"
                  className="order-5 col-span-full capitalize sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.firstName')}
                  placeholder={t('matchSetup.firstName')}
                  value={p.firstName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], firstName: e.target.value }
                    setTeam1Roster(updated)
                  }}
                />
                {manageDob && <Input
                  size="lg"
                  className="order-6 col-span-full sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.dateOfBirth')}
                  placeholder={t('matchSetup.dateOfBirthPlaceholder')}
                  type="date"
                  value={p.dob ? formatDateToISO(p.dob) : ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], dob: e.target.value ? formatDateToDDMMYYYY(e.target.value) : '' }
                    setTeam1Roster(updated)
                  }}
                />}
                <div className="order-2 flex justify-end sm:order-none sm:justify-center">
                  <button
                    type="button"
                    data-captain-toggle
                    aria-pressed={isCaptain}
                    aria-label={t('matchSetup.captain')}
                    title={t('matchSetup.captain')}
                    onClick={() => {
                      const updated = team1Roster.map((player, idx) => ({
                        ...player,
                        isCaptain: idx === i ? !player.isCaptain : false
                      }))
                      setTeam1Roster(updated)
                    }}
                    className={cn('inline-flex h-11 w-11 select-none items-center justify-center rounded-lg border-2 text-base font-bold transition-colors', isCaptain ? CAPTAIN_ON : CAPTAIN_OFF, FOCUS_RING)}
                  >C</button>
                </div>
                <div className="order-3 sm:order-none">
                  <Button
                    variant="ghost"
                    size="xl"
                    className="bg-white"
                    onClick={() => setTeam1Roster(list => {
                      const updated = [...list]
                      updated[i] = { number: p.number, firstName: '', lastName: '', dob: '', isCaptain: false }
                      return updated
                    })}
                  >
                    {t('common.clear', 'Clear')}
                  </Button>
                </div>
              </div>
            )
          })}
          </div>
        </div>
        <div className="flex justify-end border-t border-stone-200/70 pt-4">
          <Button variant="primary" size="xl" className="min-w-40" onClick={async () => {

            // Check if any changes were made (skip sync if no changes)
            const hasChanges = hasRosterChanged(
              originalTeam1Ref.current?.team1Roster,
              team1Roster,
            ) || team1Name !== (originalTeam1Ref.current?.team1Name || '')

            // If no changes, just go back to main view
            if (!hasChanges) {
              setCurrentView('main')
              return
            }

            // Validate roster before saving (beach volleyball: 2 players per team)
            const validationErrors = []

            // 1. Check exactly 2 players for beach volleyball (numbers are optional)
            if (team1Roster.length !== 2) {
              validationErrors.push(`Beach volleyball requires exactly 2 players. Currently: ${team1Roster.length}`)
            }

            // 2. Check captain is set
            const hasCaptain = team1Roster.some(p => p.isCaptain)
            if (!hasCaptain) {
              validationErrors.push(t('matchSetup.validation.noCaptain'))
            }

            // 3. Check for duplicate numbers (only among players that have numbers)
            const numbers = team1Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
            const duplicateNumbers = numbers.filter((num, idx) => numbers.indexOf(num) !== idx)
            if (duplicateNumbers.length > 0) {
              validationErrors.push(t('matchSetup.validation.duplicateNumbers', { numbers: [...new Set(duplicateNumbers)].join(', ') }))
            }

            // 4. Check for invalid numbers (must be 1-99 if provided)
            const invalidNumbers = team1Roster.filter(p => p.number != null && p.number !== '' && (p.number < 1 || p.number > 99))
            if (invalidNumbers.length > 0) {
              validationErrors.push(t('matchSetup.validation.invalidNumbers', { numbers: invalidNumbers.map(p => p.number).join(', ') }))
            }

            // Player numbers are now optional - removed validation for players without numbers

            // Show validation errors if any
            if (validationErrors.length > 0) {
              setNoticeModal({ message: t('matchSetup.validation.fixIssues', { issues: validationErrors.join('\n• ') }) })
              return
            }


            // Use user-edited team name if set, otherwise auto-generate from last names
            if (!team1Name && team1Roster.length === 2 && team1Roster[0]?.lastName && team1Roster[1]?.lastName) {
              const newTeamName = getTeamDisplayName(team1Roster, 'team1', team1Country)
              setTeam1Name(newTeamName)
            }

            // Save Team 1 team data to database if matchId exists
            if (matchId && match?.team1Id) {
              const finalTeam1Name = team1Name
                || (team1Roster.length === 2 && team1Roster[0]?.lastName && team1Roster[1]?.lastName
                  ? getTeamDisplayName(team1Roster, 'team1', team1Country)
                  : '')
              await db.teams.update(match.team1Id, {
                name: finalTeam1Name,
                color: team1Color
              })

              // Update players with captain status
              if (team1Roster.length) {
                const existingPlayers = await db.players.where('teamId').equals(match.team1Id).toArray()
                const rosterNumbers = new Set(team1Roster.map(p => p.number).filter(n => n != null))

                for (const rosterPlayer of team1Roster) {
                  if (!rosterPlayer.number) continue // Skip players without numbers

                  const existingPlayer = existingPlayers.find(ep => ep.number === rosterPlayer.number)
                  if (existingPlayer) {
                    // Update existing player
                    await db.players.update(existingPlayer.id, {
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      dob: rosterPlayer.dob || null,
                      isCaptain: !!rosterPlayer.isCaptain
                    })
                  } else {
                    // Add new player (including newly added players after unlock)
                    await db.players.add({
                      teamId: match.team1Id,
                      number: rosterPlayer.number,
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      dob: rosterPlayer.dob || null,
                      isCaptain: !!rosterPlayer.isCaptain,
                      role: null,
                      createdAt: new Date().toISOString()
                    })
                  }
                }

                // Remove players that are no longer in the roster
                for (const ep of existingPlayers) {
                  if (!rosterNumbers.has(ep.number)) {
                    await db.players.delete(ep.id)
                  }
                }
              }

              // Update match with team name, short name and country
              const updateData = {
                team1Name: finalTeam1Name,
                team1ShortName: team1ShortName || team1Name.trim().toUpperCase(),
                team1Country: team1Country || '',
              }

              // Captain signatures are collected at coin toss

              await db.matches.update(matchId, updateData)

              // Sync Team 1 team data to Supabase as JSONB
              if (match?.seed_key) {
                await db.sync_queue.add({
                  resource: 'match',
                  action: 'update',
                  payload: {
                    id: match.seed_key,
                    // JSONB columns
                    team1_data: { name: finalTeam1Name?.trim() || '', short_name: team1ShortName || generateShortName(finalTeam1Name), color: team1Color, country: team1Country || '' },
                    // Captain signatures synced from CoinToss component
                    players_team1: team1Roster.filter(p => p.firstName || p.lastName).map(p => ({
                      number: p.number || null,
                      first_name: p.firstName || '',
                      last_name: p.lastName || '',
                      dob: formatDobForSync(p.dob),
                      is_captain: !!p.isCaptain
                    })),
                  },
                  ts: new Date().toISOString(),
                  status: 'queued'
                })

                // Also sync to match_live_state if it exists (for Referee app)
                try {
                  const { data: supabaseMatch } = await apiFrom('matches')
                    .select('id')
                    .eq('external_id', match.seed_key)
                    .maybeSingle()

                  if (supabaseMatch?.id) {
                    const coinTossTeamA = match.coinTossTeamA || 'team1'
                    const team1IsTeamA = coinTossTeamA === 'team1'
                    const colorKey = team1IsTeamA ? 'team_a_color' : 'team_b_color'
                    const shortKey = team1IsTeamA ? 'team_a_short' : 'team_b_short'
                    const nameKey = team1IsTeamA ? 'team_a_name' : 'team_b_name'

                    await apiFrom('match_live_state')
                      .update({
                        [colorKey]: team1Color,
                        [shortKey]: team1ShortName || generateShortName(finalTeam1Name),
                        [nameKey]: finalTeam1Name?.trim() || '',
                        updated_at: new Date().toISOString()
                      })
                      .eq('match_id', supabaseMatch.id)
                  }
                } catch (err) {
                  console.debug('[MatchSetup] Could not sync Team 1 to Live Match:', err.message)
                }
              }

              const waitForCloud = cloudSyncWaitNow()
              setNoticeModal(waitForCloud
                ? { message: t('matchSetup.team1Saved'), type: 'success', syncing: true }
                : { message: t('matchSetup.team1SavedLocal'), type: 'success' })

              // Poll to check when sync completes
              const checkSyncStatus = async () => {
                let attempts = 0
                const maxAttempts = 20
                const interval = setInterval(async () => {
                  attempts++
                  try {
                    const queued = await db.sync_queue.where('status').equals('queued').count()
                    if (queued === 0) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.team1Synced'), type: 'success' })
                    } else if (attempts >= maxAttempts) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.team1SavedLocal'), type: 'success' })
                    }
                  } catch (err) {
                    clearInterval(interval)
                  }
                }, 500)
              }
              if (waitForCloud) checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</Button>
        </div>
        {renderNoticeModal()}

        {renderRosterPreview()}

        {/* Test Roster Confirmation Modal */}
        {testRosterConfirm === 'team1' && renderTestRosterConfirm(TEST_TEAM_1.name, () => {
          if (!TEST_TEAM_1) return
          setTeam1Roster([...TEST_TEAM_1.players])
          if (!team1Name || team1Name === 'Team 1') setTeam1Name(TEST_TEAM_1.name)
          if (!team1ShortName) setTeam1ShortName(TEST_TEAM_1.shortName)
          setTeam1Country(TEST_TEAM_1.country || '')
          setTestRosterConfirm(null)
        })}

        {savedTeamsModals}

        {/* SignaturePad for Team 1 team view */}
        <SignaturePad
          open={openSignature !== null}
          onClose={() => setOpenSignature(null)}
          onSave={handleSignatureSave}
          title={openSignature === 'team1-captain' ? 'Team 1 Captain Signature' :
            openSignature === 'team2-captain' ? 'Team 2 Captain Signature' : 'Sign'}
        />
      </MatchSetupTeam1View >
    )
  }

  if (currentView === 'team2') {
    return (
      <MatchSetupTeam2View kitScale={kitScale}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div>
            <Button variant="ghost" size="xl" icon={ArrowLeft} className="bg-white" onClick={() => { restoreTeam2(); setCurrentView('main') }}>{t('common.back')}</Button>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <input
              type="text"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label={t('matchSetup.teamName')}
              value={team2Name || getTeamDisplayName(team2Roster, 'team2', team2Country)}
              onChange={e => setTeam2Name(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
              className="h-12 w-auto min-w-[100px] max-w-full rounded-xl border border-stone-200 bg-white px-3 text-center text-xl font-bold tracking-tight text-stone-900 sm:max-w-[500px] focus:border-red-700/40 focus:outline-none focus:ring-2 focus:ring-red-700/20"
              size={Math.max(10, (team2Name || getTeamDisplayName(team2Roster, 'team2', team2Country)).length)}
            />
            {team2Name && team2Name !== getTeamDisplayName(team2Roster, 'team2', team2Country) && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                className="bg-white"
                onClick={() => setTeam2Name(getTeamDisplayName(team2Roster, 'team2', team2Country))}
              >
                {t('roster.autoName', 'Auto')}
              </Button>
            )}
          </div>
          <div />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('roster.title')}</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {renderSavedTeamControl('team2')}
            <Button
              variant="danger-soft"
              size="xl"
              onClick={() => {
                setTeam2Roster([
                  { number: 1, firstName: '', lastName: '', dob: '', isCaptain: false },
                  { number: 2, firstName: '', lastName: '', dob: '', isCaptain: false }
                ])
              }}
            >
              {t('roster.deleteRoster')}
            </Button>
            <Button variant="dark" size="xl" onClick={() => setTestRosterConfirm('team2')}>
              {t('roster.loadTestRoster')}
            </Button>
          </div>
        </div>
        {renderSuggestionStrip('team2')}
        {/* Captain and country of the team (red notice while one is missing) */}
        {(() => {
          const team2CaptainForm = team2Roster.find(p => p.isCaptain)
          const team2HasError = !team2CaptainForm || team2Roster.length !== 2 || !team2Country
          return (
            <div className={cn(
              'flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-xl border p-3',
              team2HasError ? 'border-red-100 bg-red-50' : 'border-stone-200/70 bg-stone-50/60'
            )}>
              <div className="flex items-center gap-2">
                <span className={cn('text-base font-semibold', !team2CaptainForm ? 'text-red-700' : 'text-stone-700')}>{t('matchSetup.captain')}</span>
                {team2CaptainForm ? (
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-xl font-bold tabular-nums text-emerald-700">
                    {team2CaptainForm.number || '?'}
                  </span>
                ) : (
                  <span className="text-xl font-semibold text-red-700" aria-label={t('matchSetup.notSet')}>—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-base font-semibold', !team2Country ? 'text-red-700' : 'text-stone-700')}>{t('matchSetup.country')}</span>
                <CountrySelect
                  value={team2Country}
                  onChange={setTeam2Country}
                  placeholder={t('matchSetup.selectCountry')}
                  fontSize="18px"
                />
              </div>
            </div>
          )
        })()}

        <div className="rounded-lg border border-stone-200 bg-white">
          {/* Roster Header Row (landscape; on a phone each row stacks and the fields carry placeholders) */}
          <div className={cn(ROSTER_GRID, manageDob && ROSTER_GRID_DOB, 'hidden rounded-t-[7px] border-b border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:grid')}>
            <div className="text-center">#</div>
            <div>{t('matchSetup.lastName')}</div>
            <div>{t('matchSetup.firstName')}</div>
            {manageDob && <div>{t('matchSetup.dateOfBirth')}</div>}
            <div className="text-center" title={t('matchSetup.captain')}>C</div>
            <div />
          </div>
          <div className="divide-y divide-stone-100">
          {team2Roster.map((p, i) => {
            // Captain row: the emerald outline (the captain marker)
            const isCaptain = p.isCaptain || false

            return (
              <div key={`a-${i}`} className={cn(ROSTER_GRID, manageDob && ROSTER_GRID_DOB, 'px-3 py-2.5', isCaptain && 'bg-emerald-50/60 ring-2 ring-inset ring-emerald-600', i === team2Roster.length - 1 && 'rounded-b-[7px]')}>
                {/* Shirt number: 1 or 2 (the other player takes the other number) */}
                <div className="order-1 flex gap-1 sm:order-none" role="group" aria-label={t('roster.numberLabel')}>
                  {[1, 2].map(num => {
                    const isSelected = p.number === num
                    return (
                      <button
                        key={num}
                        type="button"
                        aria-pressed={isSelected}
                        className={cn(
                          'toggle-num inline-flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold tabular-nums transition-colors',
                          isSelected ? 'selected border-slate-900 bg-slate-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
                          FOCUS_RING
                        )}
                        onClick={() => {
                          setTeam2Roster(prev => {
                            const newRoster = [...prev]
                            // Set this player to num
                            newRoster[i] = { ...newRoster[i], number: num }

                            // Find other player (if any) and set to opposite number
                            const otherIdx = newRoster.findIndex((_, idx) => idx !== i)
                            if (otherIdx !== -1) {
                              newRoster[otherIdx] = { ...newRoster[otherIdx], number: num === 1 ? 2 : 1 }
                            }

                            return newRoster
                          })
                        }}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
                <Input
                  size="lg"
                  className="order-4 col-span-full capitalize sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.lastName')}
                  placeholder={t('matchSetup.lastName')}
                  value={p.lastName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], lastName: e.target.value }
                    setTeam2Roster(updated)
                  }}
                />
                <Input
                  size="lg"
                  className="order-5 col-span-full capitalize sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.firstName')}
                  placeholder={t('matchSetup.firstName')}
                  value={p.firstName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], firstName: e.target.value }
                    setTeam2Roster(updated)
                  }}
                />
                {manageDob && <Input
                  size="lg"
                  className="order-6 col-span-full sm:order-none sm:col-span-1"
                  aria-label={t('matchSetup.dateOfBirth')}
                  placeholder={t('matchSetup.dateOfBirthPlaceholder')}
                  type="date"
                  value={p.dob ? formatDateToISO(p.dob) : ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], dob: e.target.value ? formatDateToDDMMYYYY(e.target.value) : '' }
                    setTeam2Roster(updated)
                  }}
                />}
                <div className="order-2 flex justify-end sm:order-none sm:justify-center">
                  <button
                    type="button"
                    data-captain-toggle
                    aria-pressed={isCaptain}
                    aria-label={t('matchSetup.captain')}
                    title={t('matchSetup.captain')}
                    onClick={() => {
                      const updated = team2Roster.map((player, idx) => ({
                        ...player,
                        isCaptain: idx === i ? !player.isCaptain : false
                      }))
                      setTeam2Roster(updated)
                    }}
                    className={cn('inline-flex h-11 w-11 select-none items-center justify-center rounded-lg border-2 text-base font-bold transition-colors', isCaptain ? CAPTAIN_ON : CAPTAIN_OFF, FOCUS_RING)}
                  >C</button>
                </div>
                <div className="order-3 sm:order-none">
                  <Button
                    variant="ghost"
                    size="xl"
                    className="bg-white"
                    onClick={() => setTeam2Roster(list => {
                      const updated = [...list]
                      updated[i] = { number: p.number, firstName: '', lastName: '', dob: '', isCaptain: false }
                      return updated
                    })}
                  >
                    {t('common.clear', 'Clear')}
                  </Button>
                </div>
              </div>
            )
          })}
          </div>
        </div>
        <div className="flex justify-end border-t border-stone-200/70 pt-4">
          <Button variant="primary" size="xl" className="min-w-40" onClick={async () => {

            // Check if any changes were made (skip sync if no changes)
            const hasChanges = hasRosterChanged(
              originalTeam2Ref.current?.team2Roster,
              team2Roster,
            ) || team2Name !== (originalTeam2Ref.current?.team2Name || '')

            // If no changes, just go back to main view
            if (!hasChanges) {
              setCurrentView('main')
              return
            }

            // Validate roster before saving (beach volleyball: 2 players per team)
            const validationErrors = []

            // 1. Check exactly 2 players for beach volleyball (numbers are optional)
            if (team2Roster.length !== 2) {
              validationErrors.push(`Beach volleyball requires exactly 2 players. Currently: ${team2Roster.length}`)
            }

            // 2. Check captain is set
            const hasCaptain = team2Roster.some(p => p.isCaptain)
            if (!hasCaptain) {
              validationErrors.push(t('matchSetup.validation.noCaptain'))
            }

            // 3. Check for duplicate numbers (only among players that have numbers)
            const numbers = team2Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
            const duplicateNumbers = numbers.filter((num, idx) => numbers.indexOf(num) !== idx)
            if (duplicateNumbers.length > 0) {
              validationErrors.push(t('matchSetup.validation.duplicateNumbers', { numbers: [...new Set(duplicateNumbers)].join(', ') }))
            }

            // 4. Check for invalid numbers (must be 1-99 if provided)
            const invalidNumbers = team2Roster.filter(p => p.number != null && p.number !== '' && (p.number < 1 || p.number > 99))
            if (invalidNumbers.length > 0) {
              validationErrors.push(t('matchSetup.validation.invalidNumbers', { numbers: invalidNumbers.map(p => p.number).join(', ') }))
            }

            // Player numbers are now optional - removed validation for players without numbers

            // Show validation errors if any
            if (validationErrors.length > 0) {
              setNoticeModal({ message: t('matchSetup.validation.fixIssues', { issues: validationErrors.join('\n• ') }) })
              return
            }


            // Use user-edited team name if set, otherwise auto-generate from last names
            if (!team2Name && team2Roster.length === 2 && team2Roster[0]?.lastName && team2Roster[1]?.lastName) {
              const newTeamName = getTeamDisplayName(team2Roster, 'team2', team2Country)
              setTeam2Name(newTeamName)
            }

            // Save team2 team data to database if matchId exists
            if (matchId && match?.team2Id) {
              const finalTeam2Name = team2Name
                || (team2Roster.length === 2 && team2Roster[0]?.lastName && team2Roster[1]?.lastName
                  ? getTeamDisplayName(team2Roster, 'team2', team2Country)
                  : '')
              await db.teams.update(match.team2Id, {
                name: finalTeam2Name,
                color: team2Color
              })

              // Update players with captain status
              if (team2Roster.length) {
                const existingPlayers = await db.players.where('teamId').equals(match.team2Id).toArray()
                const rosterNumbers = new Set(team2Roster.map(p => p.number).filter(n => n != null))

                for (const rosterPlayer of team2Roster) {
                  if (!rosterPlayer.number) continue // Skip players without numbers

                  const existingPlayer = existingPlayers.find(ep => ep.number === rosterPlayer.number)
                  if (existingPlayer) {
                    // Update existing player
                    await db.players.update(existingPlayer.id, {
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      dob: rosterPlayer.dob || null,
                      isCaptain: !!rosterPlayer.isCaptain
                    })
                  } else {
                    // Add new player (including newly added players after unlock)
                    await db.players.add({
                      teamId: match.team2Id,
                      number: rosterPlayer.number,
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      dob: rosterPlayer.dob || null,
                      isCaptain: !!rosterPlayer.isCaptain,
                      role: null,
                      createdAt: new Date().toISOString()
                    })
                  }
                }

                // Remove players that are no longer in the roster
                for (const ep of existingPlayers) {
                  if (!rosterNumbers.has(ep.number)) {
                    await db.players.delete(ep.id)
                  }
                }
              }

              // Update match with team name, short name and country
              const updateData = {
                team2Name: finalTeam2Name,
                team2ShortName: team2ShortName || team2Name.trim().toUpperCase(),
                team2Country: team2Country || ''
              }

              // Captain signatures are collected at coin toss

              await db.matches.update(matchId, updateData)

              // Sync team2 team data to Supabase as JSONB
              if (match?.seed_key) {
                await db.sync_queue.add({
                  resource: 'match',
                  action: 'update',
                  payload: {
                    id: match.seed_key,
                    // JSONB columns
                    team2_data: { name: finalTeam2Name?.trim() || '', short_name: team2ShortName || generateShortName(finalTeam2Name), color: team2Color, country: team2Country || '' },
                    // Captain signatures synced from CoinToss component
                    players_team2: team2Roster.filter(p => p.firstName || p.lastName).map(p => ({
                      number: p.number || null,
                      first_name: p.firstName || '',
                      last_name: p.lastName || '',
                      dob: formatDobForSync(p.dob),
                      is_captain: !!p.isCaptain
                    }))
                  },
                  ts: new Date().toISOString(),
                  status: 'queued'
                })

                // Also sync to match_live_state if it exists (for Referee app)
                try {
                  const { data: supabaseMatch } = await apiFrom('matches')
                    .select('id')
                    .eq('external_id', match.seed_key)
                    .maybeSingle()

                  if (supabaseMatch?.id) {
                    const coinTossTeamA = match.coinTossTeamA || 'team1'
                    const team1IsTeamA = coinTossTeamA === 'team1'
                    // team2 is Team B if Team 1 is Team A, and vice versa
                    const colorKey = team1IsTeamA ? 'team_b_color' : 'team_a_color'
                    const shortKey = team1IsTeamA ? 'team_b_short' : 'team_a_short'
                    const nameKey = team1IsTeamA ? 'team_b_name' : 'team_a_name'

                    await apiFrom('match_live_state')
                      .update({
                        [colorKey]: team2Color,
                        [shortKey]: team2ShortName || generateShortName(finalTeam2Name),
                        [nameKey]: finalTeam2Name?.trim() || '',
                        updated_at: new Date().toISOString()
                      })
                      .eq('match_id', supabaseMatch.id)
                  }
                } catch (err) {
                  console.debug('[MatchSetup] Could not sync team2 team to match_live_state:', err.message)
                }
              }

              const waitForCloud = cloudSyncWaitNow()
              setNoticeModal(waitForCloud
                ? { message: t('matchSetup.team2Saved'), type: 'success', syncing: true }
                : { message: t('matchSetup.team2SavedLocal'), type: 'success' })

              // Poll to check when sync completes
              const checkSyncStatus = async () => {
                let attempts = 0
                const maxAttempts = 20
                const interval = setInterval(async () => {
                  attempts++
                  try {
                    const queued = await db.sync_queue.where('status').equals('queued').count()
                    if (queued === 0) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.team2Synced'), type: 'success' })
                    } else if (attempts >= maxAttempts) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.team2SavedLocal'), type: 'success' })
                    }
                  } catch (err) {
                    clearInterval(interval)
                  }
                }, 500)
              }
              if (waitForCloud) checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</Button>
        </div>
        {renderNoticeModal()}

        {renderRosterPreview()}

        {/* Test Roster Confirmation Modal */}
        {testRosterConfirm === 'team2' && renderTestRosterConfirm(TEST_TEAM_2.name, () => {
          if (!TEST_TEAM_2) return
          setTeam2Roster([...TEST_TEAM_2.players])
        })}

        {savedTeamsModals}

        {/* SignaturePad for team2 team view */}
        <SignaturePad
          open={openSignature !== null}
          onClose={() => setOpenSignature(null)}
          onSave={handleSignatureSave}
          title={openSignature === 'team1-captain' ? 'Team 1 Captain Signature' :
            openSignature === 'team2-captain' ? 'Team 2 Captain Signature' : 'Sign'}
        />
      </MatchSetupTeam2View>
    )
  }

  // Card state mark: emerald done, sky ready to confirm, amber to do; each
  // also says it in its title / label (volleyui: every colour has a word).
  const StatusBadge = ({ ready, pending }) => (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none',
        ready ? 'bg-emerald-700 text-white' : pending ? 'bg-sky-600 text-white' : 'border border-amber-300 bg-amber-100 text-amber-800'
      )}
      aria-label={ready ? t('matchSetup.status.complete', 'Complete') : pending ? t('matchSetup.status.readyToConfirm', 'Ready to confirm') : t('matchSetup.status.incomplete', 'Incomplete')}
      title={ready ? t('matchSetup.status.complete', 'Complete') : pending ? t('matchSetup.status.readyToConfirm', 'Ready to confirm') : t('matchSetup.status.incomplete', 'Incomplete')}
    >
      {ready ? '✓' : pending ? '●' : '!'}
    </span>
  )

  // Sync status of a card: a kit status pill (tinted round pill, dot + word),
  // tap to retry when not synced. Hidden in offline mode.
  const SyncStatusIndicator = ({ status, onRetry }) => {
    if (offlineMode) return null

    const tones = {
      synced: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
      syncing: { pill: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500 animate-pulse' },
      error: { pill: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
      idle: { pill: 'border-stone-200 bg-stone-100 text-stone-600', dot: 'bg-stone-400' }
    }
    const labels = {
      synced: t('matchSetup.syncStatus.synced', 'Synced'),
      syncing: t('matchSetup.syncStatus.syncing', 'Syncing...'),
      error: t('matchSetup.syncStatus.error', 'Sync error'),
      idle: isSupabaseAvailable ? t('matchSetup.syncStatus.notSynced') : t('matchSetup.syncStatus.offline', 'Offline')
    }
    const c = tones[status] || tones.synced
    const retry = status !== 'synced' && onRetry

    return (
      <div
        onClick={retry ? onRetry : undefined}
        className={cn(
          'relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors',
          retry && "before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
          c.pill,
          retry ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
        )}
        title={retry ? t('matchSetup.syncStatus.clickToRetry', 'Click to retry sync') : ''}
      >
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', c.dot)} />
        <span>{labels[status]}</span>
      </div>
    )
  }
  // Officials are complete if at least 1st referee and scorer are filled
  // 2nd referee and assistant scorer are optional
  const officialsConfigured =
    !!(ref1Last && ref1First && scorerLast && scorerFirst)
  const matchInfoConfigured = !!(date || time || hall || city || league)
  const team1Configured = !!(team1Name && team1Roster.length === 2)
  const team2Configured = !!(team2Name && team2Roster.length === 2)

  // All 4 cards must be complete before proceeding to coin toss
  const canProceedToCoinToss = matchInfoConfirmed && officialsConfigured && team1Configured && team2Configured

  const formatOfficial = (lastName, firstName) => {
    if (!lastName && !firstName) return t('common.notSet')
    if (!lastName) return firstName
    if (!firstName) return lastName
    return `${lastName}, ${firstName.charAt(0)}.`
  }

  // Format line judge full name (e.g., "John Smith") to "Smith, J."
  const formatLineJudge = (fullName) => {
    if (!fullName) return null
    const parts = fullName.trim().split(/\s+/)
    if (parts.length === 1) return parts[0] // Only one name
    const firstName = parts[0]
    const lastName = parts.slice(1).join(' ')
    return `${lastName}, ${firstName.charAt(0)}.`
  }

  const formatDisplayDate = value => {
    if (!value) return null
    const parts = value.split('-')
    if (parts.length !== 3) return value
    const [year, month, day] = parts
    if (!year || !month || !day) return value
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
  }

  const formatDisplayTime = value => {
    if (!value) return null
    const parts = value.split(':')
    if (parts.length < 2) return value
    const [hours, minutes] = parts
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // Helper function to generate unique PIN
  const generateUniquePin = async () => {
    const generatePinCode = (existingPins = []) => {
      const chars = '0123456789'
      let pin = ''
      let attempts = 0
      const maxAttempts = 100

      do {
        pin = ''
        for (let i = 0; i < 6; i++) {
          pin += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        attempts++
        if (attempts >= maxAttempts) break
      } while (existingPins.includes(pin))

      return pin
    }

    // Get all existing PINs to ensure uniqueness
    const allMatches = await db.matches.toArray()
    const existingPins = allMatches
      .map(m => [m.refereePin, m.team1Pin, m.team2Pin, m.team1UploadPin, m.team2UploadPin])
      .flat()
      .filter(Boolean)

    return generatePinCode(existingPins)
  }

  // Sync the match to the relay (when the Scoreboard is not mounted), on the
  // scorer's one relay connection (relayPublisher_beach): the whole match
  // fresh from IndexedDB, in the relay's home/away shape. Without an open
  // socket nothing is sent; App_beach syncs on the next (re)connect.
  const syncMatchToServer = async (matchData) => {
    if (!matchData?.id) return
    try {
      const bundle = await readRelayBundle(db, matchData.id)
      if (bundle?.key) scorerPublisher.sync(bundle.key, bundle.local)
    } catch (error) {
      console.error('[MatchSetup] Failed to sync to the relay:', error)
    }
  }

  const handleRefereeConnectionToggle = async (enabled) => {
    if (!matchId) return
    try {
      const match = await db.matches.get(matchId)
      if (!match) return

      const updates = { refereeConnectionEnabled: enabled }

      // If enabling connection and PIN doesn't exist, generate one
      if (enabled && !match.refereePin) {
        const newPin = await generateUniquePin()
        updates.refereePin = String(newPin).trim() // Ensure it's a string
      }

      await db.matches.update(matchId, updates)

      // Sync to server since Scoreboard is not mounted when MatchSetup is shown
      const updatedMatch = await db.matches.get(matchId)
      if (updatedMatch) {
        await syncMatchToServer(updatedMatch)
        // Also sync to Supabase (use seed_key as external_id)
        if (updatedMatch.seed_key) {
          await db.sync_queue.add({
            resource: 'match',
            action: 'update',
            payload: {
              id: updatedMatch.seed_key,
              // JSONB columns
              connections: {
                referee_enabled: enabled
              },
              // Whole object: a partial one would erase the bench PINs
              connection_pins: buildConnectionPins(updatedMatch)
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })

          // Show syncing modal and poll for completion (only when the sync
          // can finish now: never on a venue tablet or offline)
          if (!cloudSyncWaitNow()) return
          setNoticeModal({ message: t('matchSetup.modals.syncingToDatabase'), type: 'success', syncing: true })
          let attempts = 0
          const maxAttempts = 20
          const interval = setInterval(async () => {
            attempts++
            try {
              const queued = await db.sync_queue.where('status').equals('queued').count()
              if (queued === 0) {
                clearInterval(interval)
                setNoticeModal({ message: t('matchSetup.modals.syncedToDatabase'), type: 'success' })
              } else if (attempts >= maxAttempts) {
                clearInterval(interval)
                setNoticeModal({ message: t('matchSetup.modals.matchSavedLocalSyncPending'), type: 'success' })
              }
            } catch (err) {
              clearInterval(interval)
            }
          }, 500)
        }
      }
    } catch (error) {
      console.error('Failed to update referee connection setting:', error)
    }
  }

  // Dashboard toggle: a white row with the label and a kit switch (applies
  // immediately), the connection PIN under it when on.
  const DashboardToggle = ({ label, enabled, onToggle, pin }) => {
    return (
      <div className="flex min-w-[100px] flex-1 flex-col gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2">
        <div className="flex min-h-8 items-center gap-2">
          <span className="flex-1 text-sm font-medium text-stone-700">{label}</span>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => onToggle(next)}
            size="lg"
            aria-label={label}
            title={label}
            className="after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
          />
        </div>
        {enabled && pin && (
          <div className="text-center">
            <span className="font-mono text-base font-semibold tracking-[0.3em] text-stone-900 tabular-nums">
              {pin}
            </span>
          </div>
        )}
      </div>
    )
  }
  // Connection Banner Component (kept for backwards compatibility)
  const ConnectionBanner = ({ team, enabled, onToggle, pin }) => {
    const label = team === 'referee' ? t('matchSetup.referee') : team === 'team1' ? t('matchSetup.team1') : t('matchSetup.team2')
    return (
      <DashboardToggle
        label={label}
        enabled={enabled}
        onToggle={onToggle}
        pin={pin}
      />
    )
  }

  const handleEditPin = (type) => {
    let currentPin = ''
    if (type === 'referee') {
      currentPin = String(match?.refereePin || '').trim()
    }
    setNewPin(currentPin)
    setPinError('')
    setEditPinType(type)
    setEditPinModal(true)
  }

  const handleSavePin = async () => {
    if (!matchId || !editPinType) return

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
      // Ensure PIN is saved as a string (trimmed)
      const pinValue = String(newPin).trim()
      let updateField = {}
      if (editPinType === 'referee') {
        updateField = { refereePin: pinValue }
      }
      await db.matches.update(matchId, updateField)
      setEditPinModal(false)
      setPinError('')
      setEditPinType(null)
    } catch (error) {
      console.error('Failed to update PIN:', error)
      setPinError('Failed to save PIN')
    }
  }

  return (
    <MatchSetupMainView kitScale={kitScale}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('matchSetup.title')}</h2>
          <Button variant="secondary" size="xl" onClick={openScoresheet} icon={FileText}>
            {t('matchSetup.scoresheet')}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {onOpenOptions && (
            <Button variant="secondary" size="xl" onClick={onOpenOptions}>
              {t('matchSetup.options')}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Match Info Card */}
        <div
          className={cn(
            'flex flex-col justify-between gap-4 rounded-xl bg-stone-50/60 p-4 sm:p-5',
            matchInfoConfirmed ? 'border border-stone-200/70' : canConfirmMatchInfo ? 'border-2 border-sky-300' : 'border-2 border-amber-300'
          )}
        >
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge ready={matchInfoConfirmed} pending={!matchInfoConfirmed && canConfirmMatchInfo} />
                <h3 className={BLOCK_TITLE}>{t('matchSetup.matchInfo')}</h3>
              </div>
              <SyncStatusIndicator status={matchInfoSyncStatus} onRetry={() => retrySyncForCard('matchInfo')} />
            </div>
            <KeyValue variant="detail" className={SUMMARY_KV} items={[
              { label: t('matchSetup.competitionName'), value: <span className={TRUNC} title={league}>{league || t('common.notSet')}</span> },
              { label: t('matchSetup.matchNumber'), value: <span className={cn(TRUNC, 'tabular-nums')}>{gameN || t('common.notSet')}</span> },
              { label: t('matchSetup.date'), value: <span className={cn(TRUNC, 'tabular-nums')}>{formatDisplayDate(date) || t('common.notSet')}</span> },
              { label: t('matchSetup.time'), value: <span className={cn(TRUNC, 'tabular-nums')}>{formatDisplayTime(time) || t('common.notSet')}</span> },
              { label: t('matchSetup.site'), value: <span className={TRUNC} title={city}>{city || t('common.notSet')}</span> },
              { label: t('matchSetup.court'), value: <span className={TRUNC}>{court || t('common.notSet')}</span> },
              { label: t('matchSetup.gender'), value: <span className={TRUNC}>{type2 === 'men' ? t('matchSetup.men') : t('matchSetup.women')}</span> },
              { label: t('matchSetup.coach'), value: <span className={TRUNC}>{hasCoach ? t('common.yes') : t('common.no')}</span> },
              { label: t('matchSetup.phase'), value: <span className={TRUNC}>{phase === 'main' ? t('matchSetup.mainDraw') : t('matchSetup.qualification')}</span> },
              {
                label: t('matchSetup.round'),
                value: (
                  <span className={TRUNC}>
                    {round === 'pool' ? t('matchSetup.poolPlay') :
                      round === 'winner' ? t('matchSetup.winnerBracket') :
                        round === 'class' ? t('matchSetup.classificationRound') :
                          round === 'semifinals' ? t('matchSetup.semifinals') :
                            t('matchSetup.finals')}
                  </span>
                )
              }
            ]} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {matchInfoConfirmed ? (
              <Button variant="secondary" size="xl" onClick={() => setCurrentView('info')}>{t('common.edit')}</Button>
            ) : (
              <>
                {onLoadCompetitionMatch && (
                  <Button variant="secondary" size="xl" onClick={onLoadCompetitionMatch}>
                    {t('home.loadCompetitionMatch', 'Load competition match')}
                  </Button>
                )}
                <Button variant="primary" size="xl" onClick={() => setCurrentView('info')}>
                  {t('matchSetup.createMatch')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Match Officials Card */}
        <div className={cn('flex flex-col justify-between gap-4 p-4 sm:p-5', SETUP_BLOCK, !matchInfoConfirmed && 'pointer-events-none opacity-50')}>
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge ready={officialsConfigured} />
                <h3 className={BLOCK_TITLE}>{t('matchSetup.matchOfficials')}</h3>
              </div>
              <SyncStatusIndicator status={officialsSyncStatus} onRetry={() => retrySyncForCard('officials')} />
            </div>
            <KeyValue variant="detail" className={SUMMARY_KV} items={[
              { label: t('matchSetup.referee1'), value: <span className={TRUNC} title={formatOfficial(ref1Last, ref1First)}>{formatOfficial(ref1Last, ref1First)}</span> },
              { label: t('matchSetup.referee2'), value: <span className={TRUNC} title={formatOfficial(ref2Last, ref2First)}>{formatOfficial(ref2Last, ref2First)}</span> },
              { label: t('matchSetup.scorer'), value: <span className={TRUNC} title={formatOfficial(scorerLast, scorerFirst)}>{formatOfficial(scorerLast, scorerFirst)}</span> },
              { label: t('matchSetup.assistantScorer'), value: <span className={TRUNC} title={formatOfficial(asstLast, asstFirst)}>{formatOfficial(asstLast, asstFirst)}</span> },
              ...((lineJudge1 || lineJudge2 || lineJudge3 || lineJudge4) ? [{
                label: t('matchSetup.lineJudges'),
                value: (
                  <span className={TRUNC} title={[lineJudge1, lineJudge2, lineJudge3, lineJudge4].filter(Boolean).map(formatLineJudge).join(', ')}>
                    {[lineJudge1, lineJudge2, lineJudge3, lineJudge4].filter(Boolean).map(formatLineJudge).join(', ') || t('common.notSet')}
                  </span>
                )
              }] : [])
            ]} />
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" size="xl" onClick={() => setCurrentView('officials')} disabled={!matchInfoConfirmed}>{t('common.edit')}</Button>
          </div>
        </div>
      </div>
      {/* Dashboard Connections Row */}
      <div className={cn('p-4', SETUP_BLOCK, !matchInfoConfirmed && 'pointer-events-none opacity-50')}>
        <h3 className="mb-2 text-sm font-semibold text-stone-700">{t('matchSetup.dashboards')}</h3>
        <div className="flex flex-wrap gap-2.5">
          <ConnectionBanner
            team="referee"
            enabled={match?.refereeConnectionEnabled === true}
            onToggle={handleRefereeConnectionToggle}
            pin={match?.refereePin}
          />
        </div>
      </div>

      {matchInfoConfirmed && renderSuggestionBanner()}

      <div className={cn('grid gap-4 sm:grid-cols-2', !matchInfoConfirmed && 'pointer-events-none opacity-50')}>
        {[
          { side: 'team1', ready: team1Configured, syncStatus: team1SyncStatus, color: team1Color, name: team1Name, roster: team1Roster, setRoster: setTeam1Roster, country: team1Country, fallback: t('matchSetup.team1') },
          { side: 'team2', ready: team2Configured, syncStatus: team2SyncStatus, color: team2Color, name: team2Name, roster: team2Roster, setRoster: setTeam2Roster, country: team2Country, fallback: t('matchSetup.team2') }
        ].map((team, idx) => (
          <div key={team.side} className={cn('flex flex-col gap-4 p-4 sm:p-5', SETUP_BLOCK)} style={{ order: idx + 1 }}>
            {/* Row 0: Status + Sync Indicator */}
            <div className="flex items-center justify-between gap-2">
              <StatusBadge ready={team.ready} />
              <SyncStatusIndicator status={team.syncStatus} onRetry={() => retrySyncForCard(team.side)} />
            </div>
            {/* Row 1: the team-colour band (frozen: team colour, contrast text, names on one line, country below) */}
            <div style={{
              background: team.color,
              color: getContrastColor(team.color),
              padding: '12px 16px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: 'clamp(16px, 4vw, 24px)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {team.name
                  || (team.roster.length === 2 && team.roster[0]?.lastName && team.roster[1]?.lastName
                    ? `${toTitleCase(team.roster[0].lastName)} - ${toTitleCase(team.roster[1].lastName)}`
                    : team.fallback)}
              </div>
              {team.country && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
                  <CountryFlag countryCode={team.country} size="md" />
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>{team.country.toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Row 2: Color selector + Shirt + Roster */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-500">{t('matchSetup.selectColour')}</span>
              <div
                className="shirt"
                style={{ background: team.color, cursor: 'pointer', transform: 'scale(0.85)' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const centerX = rect.left + rect.width / 2
                  setColorPickerModal({
                    team: team.side,
                    position: { x: centerX, y: rect.bottom + 8 }
                  })
                }}
              >
                <div className="collar" style={{ background: team.color }} />
                <div className="number" style={{ color: getContrastColor(team.color) }}>1</div>
              </div>
              <div className="flex-1" />
              <Button variant="secondary" size="xl" icon={Users} onClick={() => {
                if (team.roster.length === 0) {
                  team.setRoster([
                    { number: 1, firstName: '', lastName: '', dob: '', isCaptain: false },
                    { number: 2, firstName: '', lastName: '', dob: '', isCaptain: false }
                  ])
                }
                setCurrentView(team.side)
              }}>{t('matchSetup.editRoster')}</Button>
            </div>
          </div>
        ))}
        {typeof window !== 'undefined' && window.electronAPI?.server && (
          <div className={cn('flex flex-col justify-between gap-4 p-4 sm:p-5', SETUP_BLOCK)} style={{ order: 3 }}>
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge ready={serverRunning} />
                <h3 className={BLOCK_TITLE}>Live server</h3>
              </div>
              {serverRunning && serverStatus ? (
                <div className="mt-3 space-y-3">
                  <KeyValue variant="detail" className={SUMMARY_KV} items={[
                    { label: 'Status', value: <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Running</span> },
                    { label: 'Hostname', value: <span className="font-mono text-xs">{serverStatus.hostname || 'escoresheet.local'}</span> },
                    { label: 'IP address', value: <span className="font-mono text-xs tabular-nums">{serverStatus.localIP}</span> },
                    { label: 'Protocol', value: <span className="uppercase">{serverStatus.protocol || 'https'}</span> }
                  ]} />
                  <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs">
                    <div className="mb-2 font-semibold text-stone-700">Connection URLs</div>
                    <div className="flex flex-col gap-1.5 font-mono text-[11px] text-stone-800">
                      <div>
                        <div className="text-stone-500">Main</div>
                        <div className="break-all">{serverStatus.urls?.mainIP || `${serverStatus.protocol}://${serverStatus.localIP}:${serverStatus.port}/`}</div>
                      </div>
                      <div>
                        <div className="text-stone-500">Referee</div>
                        <div className="break-all">{serverStatus.urls?.refereeIP || `${serverStatus.protocol}://${serverStatus.localIP}:${serverStatus.port}/referee`}</div>
                      </div>
                      <div>
                        <div className="text-stone-500">WebSocket</div>
                        <div className="break-all">{serverStatus.urls?.websocketIP || `${serverStatus.wsProtocol}://${serverStatus.localIP}:${serverStatus.wsPort}`}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-stone-600">
                    Start the live server to allow referee and livescore apps to connect.
                  </p>
                  {typeof window !== 'undefined' && !window.electronAPI?.server && (
                    <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600">
                      <div className="mb-2 font-semibold text-stone-700">To start from browser/PWA:</div>
                      <div className="font-mono text-[11px] leading-relaxed">
                        Run: <span className="font-semibold text-stone-900">npm run start:prod</span> in terminal
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              {serverRunning ? (
                typeof window !== 'undefined' && window.electronAPI?.server ? (
                  <Button variant="secondary" size="xl" onClick={handleStopServer} loading={serverLoading}>
                    {serverLoading ? 'Stopping...' : 'Stop server'}
                  </Button>
                ) : null
              ) : (
                <Button variant="dark" size="xl" onClick={handleStartServer} loading={serverLoading} icon={typeof window !== 'undefined' && window.electronAPI?.server ? undefined : ClipboardList}>
                  {typeof window !== 'undefined' && window.electronAPI?.server
                    ? (serverLoading ? 'Starting...' : 'Start server')
                    : 'Copy start command'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/70 pt-4', !matchInfoConfirmed && 'pointer-events-none opacity-50')}>
        <Button
          variant="secondary"
          size="xl"
          icon={Users}
          aria-pressed={showBothRosters}
          onClick={() => setShowBothRosters(!showBothRosters)}
          disabled={!matchInfoConfirmed}
        >
          {showBothRosters ? t('scoreboard.hideRosters') : t('scoreboard.showRosters')}
        </Button>
        {isMatchOngoing && onReturn ? (
          <Button variant="dark" size="xl" className="min-w-40" onClick={onReturn}>{t('scoreboard.returnToMatch')}</Button>
        ) : (
          <Button
            variant="primary"
            size="xl"
            className="min-w-40 disabled:cursor-not-allowed"
            disabled={!canProceedToCoinToss}
            onClick={async () => {
              // Check if match has no data (no sets, no signatures)
              if (matchId && match) {
                const sets = await db.sets.where('matchId').equals(matchId).toArray()
                const hasNoData = sets.length === 0

                if (hasNoData) {
                  // Check for existing validation errors
                  if (dateError) {
                    setNoticeModal({ message: t('matchSetup.validation.invalidDatePrefix', { error: dateError }) })
                    return
                  }
                  if (timeError) {
                    setNoticeModal({ message: t('matchSetup.validation.invalidTimePrefix', { error: timeError }) })
                    return
                  }

                  // Validate date/time before going to coin toss
                  let scheduledAt
                  try {
                    // Convert dd.mm.yyyy to YYYY-MM-DD for createScheduledAt
      let dateForCreate = date
      if (date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        const [day, month, year] = date.split('.')
        dateForCreate = `${year}-${month}-${day}`
      }
      scheduledAt = createScheduledAt(dateForCreate, time, { allowEmpty: false })
                  } catch (err) {
                    setNoticeModal({ message: t('matchSetup.validation.invalidDateTime', { error: err.message }) })
                    return
                  }

                  // Update match with current data before going to coin toss
                  await db.matches.update(matchId, {
                    hall,
                    city,
                    match_type_2: type2,
                    hasCoach,
                    team1Name: team1Name.trim(),
                    team2Name: team2Name.trim(),
                    team1ShortName: team1ShortName || team1Name.trim().toUpperCase(),
                    team2ShortName: team2ShortName || team2Name.trim().toUpperCase(),
                    team1Country: team1Country || '',
                    team2Country: team2Country || '',
                    game_n: gameN ? Number(gameN) : null,
                    gameNumber: gameN ? gameN : null,
                    league,
                    scheduledAt,
                    officials: buildOfficialsArray(
                      { firstName: ref1First, lastName: ref1Last, country: ref1Country, dob: ref1Dob },
                      { firstName: ref2First, lastName: ref2Last, country: ref2Country, dob: ref2Dob },
                      { firstName: scorerFirst, lastName: scorerLast, country: scorerCountry, dob: scorerDob },
                      { firstName: asstFirst, lastName: asstLast, country: asstCountry, dob: asstDob },
                      { lj1: lineJudge1, lj2: lineJudge2, lj3: lineJudge3, lj4: lineJudge4 }
                    ),
                  })

                  // Update teams if needed
                  if (match.team1Id) {
                    await db.teams.update(match.team1Id, { name: team1Name, color: team1Color })
                  }
                  if (match.team2Id) {
                    await db.teams.update(match.team2Id, { name: team2Name, color: team2Color })
                  }

                  // Update players
                  if (match.team1Id && team1Roster.length) {
                    // Delete existing players and add new ones
                    await db.players.where('teamId').equals(match.team1Id).delete()
                    await db.players.bulkAdd(
                      team1Roster.map(p => ({
                        teamId: match.team1Id,
                        number: p.number,
                        name: `${p.lastName} ${p.firstName}`,
                        lastName: p.lastName,
                        firstName: p.firstName,
                        dob: p.dob || null,
                        isCaptain: !!p.isCaptain,
                        role: null,
                        createdAt: new Date().toISOString()
                      }))
                    )
                  }
                  if (match.team2Id && team2Roster.length) {
                    // Delete existing players and add new ones
                    await db.players.where('teamId').equals(match.team2Id).delete()
                    await db.players.bulkAdd(
                      team2Roster.map(p => ({
                        teamId: match.team2Id,
                        number: p.number,
                        name: `${p.lastName} ${p.firstName}`,
                        lastName: p.lastName,
                        firstName: p.firstName,
                        dob: p.dob || null,
                        isCaptain: !!p.isCaptain,
                        role: null,
                        createdAt: new Date().toISOString()
                      }))
                    )
                  }

                  // Check if all 4 setup cards are ready before going to coin toss
                  const setupIssues = []

                  // Check Match Info
                  if (!(date || time || hall || city || league)) {
                    setupIssues.push('Match Info (date, time, venue, etc.)')
                  }

                  // Check Officials - at least 1R should be set
                  if (!ref1First && !ref1Last) {
                    setupIssues.push('Match Officials (1st Referee)')
                  }

                  // Check Team 1
                  if (!team1Name || team1Name.trim() === '') {
                    setupIssues.push('Team 1 name')
                  } else if (team1Roster.length !== 2) {
                    setupIssues.push('Team 1 roster (exactly 2 players required)')
                  }
                  if (!team1Country || team1Country.trim() === '') {
                    setupIssues.push('Team 1 country')
                  }

                  // Check Team 2
                  if (!team2Name || team2Name.trim() === '') {
                    setupIssues.push('Team 2 name')
                  } else if (team2Roster.length !== 2) {
                    setupIssues.push('Team 2 roster (exactly 2 players required)')
                  }
                  if (!team2Country || team2Country.trim() === '') {
                    setupIssues.push('Team 2 country')
                  }

                  if (setupIssues.length > 0) {
                    setNoticeModal({
                      message: t('matchSetup.validation.completeBeforeCoinToss', { issues: setupIssues.join('\n• ') })
                    })
                    return
                  }

                  // Go to coin toss
                  onOpenCoinToss()
                } else {
                  // Match has data already - just go to coin toss (don't create new match)
                  // The match already exists with data, so just navigate
                  onOpenCoinToss()
                }
              } else {
                // No match exists - create new match
                await createMatch()
              }
            }}>{t('matchSetup.coinToss')}</Button>
        )}
      </div>

      {showBothRosters && (() => {
        // Keep original order - no sorting
        const team1Players = (team1Roster || [])
        const team2Players = (team2Roster || [])

        // Pad arrays to same length for alignment
        const maxPlayers = Math.max(team1Players.length, team2Players.length)

        const paddedteam1Players = [...team1Players, ...Array(maxPlayers - team1Players.length).fill(null)]
        const paddedteam2Players = [...team2Players, ...Array(maxPlayers - team2Players.length).fill(null)]

        // Both rosters as svrz tables: one bordered box, the 11px uppercase
        // head strip, hairline rows; the captain keeps its C mark.
        const rosterTable = (players) => (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-16 px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">{t('roster.name')}</th>
                  {manageDob && <th className="px-3 py-2 text-left">{t('roster.dob')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {players.map((player, idx) => (
                  <tr key={player ? `p-${idx}` : `empty-${idx}`} className="h-11">
                    {player ? (
                      <>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="min-w-6 text-right font-semibold tabular-nums text-stone-900">{player.number ?? '—'}</span>
                            {player.isCaptain && (
                              <span className="inline-flex h-5 items-center rounded border border-amber-300 bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800" title={t('matchSetup.captain')}>C</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-stone-800">
                          {player.lastName || ''} {player.firstName || ''}
                        </td>
                        {manageDob && <td className="px-3 py-2 text-stone-500 tabular-nums">{player.dob || '—'}</td>}
                      </>
                    ) : (
                      <td colSpan={manageDob ? 3 : 2}>&nbsp;</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <SectionHeader title={t('roster.titleWithTeam', { team: team1Name || t('common.team1') })} count={team1Players.length} />
              {rosterTable(paddedteam1Players)}
            </div>
            <div className="min-w-0 space-y-2">
              <SectionHeader title={t('roster.titleWithTeam', { team: team2Name || t('common.team2') })} count={team2Players.length} />
              {rosterTable(paddedteam2Players)}
            </div>
          </div>
        )
      })()}

      {/* Color Picker Modal: the swatches (frozen shirts) in a kit dialog */}
      {colorPickerModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            size="sm"
            onClose={() => setColorPickerModal(null)}
            closeLabel={t('common.close')}
            title={t('matchSetup.chooseTeamColor', { team: colorPickerModal.team === 'team1' ? t('common.team1') : t('common.team2') })}
          >
            <div className="grid grid-cols-4 gap-2">
              {teamColors.map((color) => {
                const isSelected = (colorPickerModal.team === 'team1' ? team1Color : team2Color) === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={async () => {
                      const isTeam1 = colorPickerModal.team === 'team1'
                      if (isTeam1) {
                        setTeam1Color(color)
                      } else {
                        setTeam2Color(color)
                      }
                      setColorPickerModal(null)

                      // Sync color to local DB and Supabase
                      try {
                        // Update local team in IndexedDB
                        const teamId = isTeam1 ? match?.team1Id : match?.team2Id
                        if (teamId) {
                          await db.teams.update(teamId, { color })
                        }

                        // Update local match record in IndexedDB
                        if (match?.id) {
                          const colorField = isTeam1 ? 'team1Color' : 'team2Color'
                          await db.matches.update(match.id, { [colorField]: color })
                        }

                        // Sync to Supabase if match exists
                        if (isBackendAvailable() && match?.seed_key) {
                          const teamKey = isTeam1 ? 'team1_data' : 'team2_data'
                          const teamName = isTeam1 ? team1Name : team2Name
                          const shortName = isTeam1 ? team1ShortName : team2ShortName

                          // Update matches table
                          const { data: supabaseMatch } = await apiFrom('matches')
                            .update({
                              [teamKey]: {
                                name: teamName?.trim() || '',
                                short_name: shortName || generateShortName(teamName),
                                color: color
                              }
                            })
                            .eq('external_id', match.seed_key)
                            .select('id')
                            .maybeSingle()

                          if (supabaseMatch) {
                          }

                          // Also update match_live_state if it exists (for Referee app)
                          if (supabaseMatch?.id) {
                            // Team A = coin toss winner, determine if Team 1 is Team A
                            const coinTossTeamA = match.coinTossTeamA || 'team1'
                            const team1IsTeamA = coinTossTeamA === 'team1'
                            // If changing Team 1 color and Team 1 is Team A -> update team_a_color
                            // If changing Team 1 color and Team 1 is Team B -> update team_b_color
                            const liveStateColorKey = (isTeam1 === team1IsTeamA) ? 'team_a_color' : 'team_b_color'

                            await apiFrom('match_live_state')
                              .update({ [liveStateColorKey]: color, updated_at: new Date().toISOString() })
                              .eq('match_id', supabaseMatch.id)
                          }
                        }
                      } catch (err) {
                        console.warn('[MatchSetup] Failed to sync team color:', err)
                      }
                    }}
                    aria-pressed={isSelected}
                    aria-label={color}
                    title={color}
                    className={cn(
                      'flex min-h-16 min-w-[60px] items-center justify-center rounded-lg border px-2 py-3 transition-colors',
                      isSelected ? 'border-slate-900 ring-2 ring-slate-900' : 'border-stone-200 bg-white hover:bg-stone-50',
                      FOCUS_RING
                    )}
                  >
                    <div className="shirt" style={{ background: color, transform: 'scale(0.8)' }}>
                      <div className="collar" style={{ background: color }} />
                      <div className="number" style={{ color: getContrastColor(color) }}>1</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </KitModal>
        </div>
      )}

      {renderNoticeModal()}

      {/* Match Created Modal - shows Match ID and all PINs for recovery */}
      {matchCreatedModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="md"
            onClose={() => {
              setMatchCreatedModal(null)
              onOpenCoinToss()
            }}
            closeLabel={t('common.close')}
          >
            <div className="text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={24} aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-stone-900">{t('matchSetup.modals.matchCreated')}</h3>

              {/* Match ID and Game PIN */}
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-4">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t('matchSetup.modals.matchId')}</dt>
                  <dd className="mt-1 font-mono text-xl font-bold tracking-[0.15em] text-stone-900 tabular-nums select-text">{matchCreatedModal.matchId}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t('matchSetup.gamePin')}</dt>
                  <dd className="mt-1 font-mono text-xl font-bold tracking-[0.3em] text-stone-900 tabular-nums select-text">{matchCreatedModal.gamePin}</dd>
                </div>
              </dl>

              {/* Connection PINs */}
              <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-stone-700">{t('matchSetup.modals.connectionPins')}</h4>
                <dl className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2">
                  <div>
                    <dt className="text-[11px] text-stone-500">{t('matchSetup.refereePinLabel')}</dt>
                    <dd className="font-mono text-base font-semibold tracking-[0.3em] text-stone-900 tabular-nums">{matchCreatedModal.refereePin}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone-500">{t('matchSetup.team1PinLabel')}</dt>
                    <dd className="font-mono text-base font-semibold tracking-[0.3em] text-stone-900 tabular-nums">{matchCreatedModal.team1Pin}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone-500">{t('matchSetup.team2PinLabel')}</dt>
                    <dd className="font-mono text-base font-semibold tracking-[0.3em] text-stone-900 tabular-nums">{matchCreatedModal.team2Pin}</dd>
                  </div>
                </dl>
              </div>

              <p className="mt-4 text-sm text-stone-600">
                {t('matchSetup.modals.saveInfoToRecover')}
              </p>
              <Button
                variant="primary"
                size="xl"
                block
                className="mt-4"
                onClick={() => {
                  setMatchCreatedModal(null)
                  onOpenCoinToss()
                }}
              >
                {t('matchSetup.modals.continueToCoinToss')}
              </Button>
            </div>
          </KitModal>
        </div>
      )}

      {/* Edit PIN Modal */}
      {editPinModal && (() => {
        const closeEditPin = () => {
          setEditPinModal(false)
          setPinError('')
          setEditPinType(null)
        }
        return (
          <div className="ov-kit" style={DIALOG_LAYER}>
            <KitModal
              open
              decision
              size="sm"
              onClose={closeEditPin}
              closeLabel={t('common.close')}
              title={editPinType === 'referee' ? t('matchSetup.modals.editRefereePin') : editPinType === 'team1' ? t('matchSetup.modals.editTeam1Pin') : t('matchSetup.modals.editTeam2Pin')}
              footer={(
                <>
                  <button type="button" onClick={closeEditPin} className={modalCancelClass}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" onClick={handleSavePin} className={modalSaveClass}>
                    {t('matchSetup.modals.savePin', 'Save PIN')}
                  </button>
                </>
              )}
            >
              <label htmlFor="ob-edit-pin" className="mb-1.5 block text-sm font-medium text-stone-700">
                {t('matchSetup.modals.enterNew6DigitPin')}
              </label>
              <input
                id="ob-edit-pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                data-autofocus
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
                aria-invalid={pinError ? true : undefined}
                aria-describedby={pinError ? 'ob-edit-pin-error' : undefined}
                className={cn(
                  'h-11 w-full rounded-lg border bg-white px-3 text-center font-mono text-lg font-semibold tracking-[0.3em] text-stone-900 outline-none focus:ring-2 focus:ring-red-500',
                  pinError ? 'border-red-400 bg-red-50' : 'border-stone-300'
                )}
              />
              {pinError && (
                <p id="ob-edit-pin-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                  {pinError}
                </p>
              )}
            </KitModal>
          </div>
        )
      })()}
      <SignaturePad
        open={openSignature !== null}
        onClose={() => setOpenSignature(null)}
        onSave={handleSignatureSave}
        title={openSignature === 'team1-captain' ? 'Team 1 Captain Signature' :
              openSignature === 'team2-captain' ? 'Team 2 Captain Signature' : 'Sign'}
      />
      {savedTeamsModals}
    </MatchSetupMainView>
  )
}

// The setup page card (volleyui Card on the stone page; App_beach paints the
// page). It is the kit scope (`.ov-kit`): the kit preflight beats the legacy
// element rules of styles_beach.css for everything inside. Full width up to
// 1200 px, at the top of the panel; sections stack with space-y-4.
// `kitScale` carries the user's display scale into the kit steps.
const SETUP_VIEW = 'ov-kit w-full max-w-[1200px] flex-1 basis-0 min-w-0 self-start mx-auto mt-2.5 rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-card space-y-4'

function MatchSetupMainView({ children, kitScale }) {
  return <div className={SETUP_VIEW} style={kitScale}>{children}</div>
}

function MatchSetupInfoView({ children, kitScale }) {
  return <div className={SETUP_VIEW} style={kitScale}>{children}</div>
}

function MatchSetupOfficialsView({ children, kitScale }) {
  return <div className={SETUP_VIEW} style={kitScale}>{children}</div>
}

function MatchSetupTeam1View({ children, kitScale }) {
  return <div className={cn(SETUP_VIEW, 'min-h-[75vh]')} style={kitScale}>{children}</div>
}

function MatchSetupTeam2View({ children, kitScale }) {
  return <div className={cn(SETUP_VIEW, 'min-h-[75vh]')} style={kitScale}>{children}</div>
}
