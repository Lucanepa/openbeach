import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { useAuth } from '../contexts_beach/AuthContext_beach'
import { db } from '../db_beach/db_beach'
import SignaturePad from './SignaturePad'
import Modal from './Modal'
import RefereeSelector from './RefereeSelector'
import CountrySelect from './CountrySelect_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { parseRosterPdf } from '../utils_beach/parseRosterPdf_beach'
import { getWebSocketUrl } from '../utils_beach/backendConfig_beach'
import { exportMatchData } from '../utils_beach/backupManager_beach'
import { uploadBackupToCloud, uploadLogsToCloud } from '../utils_beach/logger_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import { generateMatchSeedKey } from '../utils_beach/serverDataSync_beach'
import { TEST_TEAM_SEED_DATA } from '../constants/testSeeds'
import { splitLocalDateTime, parseLocalDateTimeToISO, roundToMinute } from '../utils_beach/timeUtils_beach'

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
  const keys = ['date', 'time', 'hall', 'city', 'type2', 'gameN', 'league', 'team1Name', 'team2Name', 'team1Color', 'team2Color', 'team1ShortName', 'team2ShortName']
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
function hasRosterChanged(originalRoster, currentRoster, originalBench, currentBench) {
  if (!originalRoster || !originalBench) return true
  return !isEqual(originalRoster, currentRoster) || !isEqual(originalBench, currentBench)
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
    <div ref={cardRef} style={{
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '8px',
      background: 'rgba(15, 23, 42, 0.2)',
      overflow: 'hidden'
    }}>
      <div
        onClick={onToggleExpanded}
        style={{
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{title}</span>
          {!isExpanded && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>{displayName}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasDatabase && isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenDatabase(e, selectorKey)
              }}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 500,
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('matchSetup.database')}
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: '16px' }}>
          <div className="row">
            <div className="field"><label>{t('matchSetup.lastName')}</label><input className="w-name capitalize" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
            <div className="field"><label>{t('matchSetup.firstName')}</label><input className="w-name capitalize" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div className="field"><label>{t('matchSetup.country')}</label><input className="w-90" value={country} onChange={e => setCountry(e.target.value)} /></div>
            <div className="field"><label>{t('matchSetup.dateOfBirth')}</label><input className="w-dob" type="date" value={dob ? formatDateToISO(dob) : ''} onChange={e => setDob(e.target.value ? formatDateToDDMMYYYY(e.target.value) : '')} /></div>
          </div>
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
    <div ref={cardRef} style={{
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '8px',
      background: 'rgba(15, 23, 42, 0.2)',
      overflow: 'hidden'
    }}>
      <div
        onClick={onToggleExpanded}
        style={{
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{t('matchSetup.lineJudges')}</span>
          {!isExpanded && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>{displayText}</span>
          )}
        </div>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{isExpanded ? '▲' : '▼'}</span>
      </div>
      {isExpanded && (
        <div style={{ padding: '16px' }}>
          <div className="row">
            <div className="field"><label>{t('matchSetup.lineJudge1')}</label><input className="w-name capitalize" value={lineJudge1} onChange={e => setLineJudge1(e.target.value)} placeholder={t('matchSetup.name')} /></div>
            <div className="field"><label>{t('matchSetup.lineJudge2')}</label><input className="w-name capitalize" value={lineJudge2} onChange={e => setLineJudge2(e.target.value)} placeholder={t('matchSetup.name')} /></div>
          </div>
          <div className="row">
            <div className="field"><label>{t('matchSetup.lineJudge3')}</label><input className="w-name capitalize" value={lineJudge3} onChange={e => setLineJudge3(e.target.value)} placeholder={t('matchSetup.name')} /></div>
            <div className="field"><label>{t('matchSetup.lineJudge4')}</label><input className="w-name capitalize" value={lineJudge4} onChange={e => setLineJudge4(e.target.value)} placeholder={t('matchSetup.name')} /></div>
          </div>
        </div>
      )}
    </div>
  )
})

// Helper to generate short name from team name (first 3-4 chars uppercase)
function generateShortName(name) {
  if (!name) return ''
  // Remove common prefixes/suffixes and take first word or first 4 chars
  const cleaned = name.trim().toUpperCase()
  const words = cleaned.split(/\s+/)
  if (words.length > 1 && words[0].length <= 4) {
    return words[0]
  }
  return cleaned.substring(0, 4)
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

export default function MatchSetup({ onStart, matchId, onReturn, onOpenOptions, onOpenCoinToss, offlineMode = false }) {
  const { t } = useTranslation()
  const { showAlert } = useAlert()
  const { user, profile, getCachedProfile } = useAuth()
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
  const [city, setCity] = useState('') // Site
  const [hall, setHall] = useState('') // Beach
  const [court, setCourt] = useState('') // Court
  const [type2, setType2] = useState('men') // Gender: men | women
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
    team1Name?.trim() &&
    team2Name?.trim() &&
    team1Country?.trim() &&  // Home country must be filled
    team2Country?.trim() &&  // Away country must be filled
    date?.trim() &&      // Date must be filled
    !dateError &&        // Date must be valid
    time?.trim() &&      // Time must be filled
    !timeError &&        // Time must be valid
    gameN?.trim() &&     // Game # must be filled
    league?.trim() &&    // League must be filled
    city?.trim() &&      // City must be filled
    (!requireEmail || notificationEmail?.trim())  // Email required if VITE_REQUIRE_EMAIL=true
  )

  // Generate dynamic tooltip showing which fields are missing
  const getMissingFieldsTooltip = () => {
    const missing = []
    if (!team1Name?.trim()) missing.push(t('matchSetup.team1Name') || 'Home team')
    if (!team2Name?.trim()) missing.push(t('matchSetup.team2Name') || 'Away team')
    if (!team1Country?.trim()) missing.push(t('matchSetup.country') || 'Country')
    if (!team2Country?.trim()) missing.push(t('matchSetup.country') || 'Country')
    if (!date?.trim()) missing.push(t('matchSetup.date') || 'Date')
    else if (dateError) missing.push(t('matchSetup.date') + ' (invalid)')
    if (!time?.trim()) missing.push(t('matchSetup.time') || 'Time')
    else if (timeError) missing.push(t('matchSetup.time') + ' (invalid)')
    if (!gameN?.trim()) missing.push(t('matchSetup.gameNumber') || 'Game #')
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
        const countryPart = country ? ` (${country.toUpperCase()})` : ''
        return `${p1LastName} - ${p2LastName}${countryPart}`
      }
    }
    return t(`matchSetup.${fallbackKey}`)
  }

  const [team1Bench, setTeam1Bench] = useState([{ role: 'Coach', firstName: '', lastName: '', dob: '' }])
  const [team2Bench, setTeam2Bench] = useState([{ role: 'Coach', firstName: '', lastName: '', dob: '' }])
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

  // Show both rosters in match setup
  const [showBothRosters, setShowBothRosters] = useState(false)

  // Referee connection
  const [refereeConnectionEnabled, setRefereeConnectionEnabled] = useState(false)
  const [editPinModal, setEditPinModal] = useState(false)
  const [editPinType, setEditPinType] = useState(null) // 'referee'
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')


  // PDF upload state for each team
  const [team1PdfFile, setTeam1PdfFile] = useState(null)
  const [team2PdfFile, setTeam2PdfFile] = useState(null)
  const [team1PdfLoading, setTeam1PdfLoading] = useState(false)
  const [team2PdfLoading, setTeam2PdfLoading] = useState(false)
  const [team1PdfError, setTeam1PdfError] = useState('')
  const [team2PdfError, setTeam2PdfError] = useState('')
  const team1FileInputRef = useRef(null)
  const team2FileInputRef = useRef(null)

  // PDF import summary modal state
  const [importSummaryModal, setImportSummaryModal] = useState(null) // { team: 'team1'|'team2', players: number, errors: string[] }

  // Upload mode toggle state (local or remote)
  const [team1UploadMode, setTeam1UploadMode] = useState('local') // 'local' | 'remote'
  const [team2UploadMode, setTeam2UploadMode] = useState('local') // 'local' | 'remote'

  // Remote roster search state
  const [team1RosterSearching, setTeam1RosterSearching] = useState(false)
  const [team2RosterSearching, setTeam2RosterSearching] = useState(false)
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

  // Coach signatures kept for compatibility but not used in beach volleyball
  const [team1CoachSignature, setTeam1CoachSignature] = useState(null)
  const [team2CoachSignature, setTeam2CoachSignature] = useState(null)
  const [savedSignatures, setSavedSignatures] = useState({ homeCoach: null, awayCoach: null })

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
        date, time, hall, city, type2, gameN, league, team1Name, team2Name, team1Color, team2Color, team1ShortName, team2ShortName
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
        team1Roster: JSON.parse(JSON.stringify(team1Roster))
      }
    } else if (currentView === 'team2') {
      originalTeam2Ref.current = {
        team2Roster: JSON.parse(JSON.stringify(team2Roster))
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

        // Legacy columns that no longer exist in Supabase
        const legacyColumns = [
          'team2_data_name', 'team1_data_name', 'team2_data_short_name', 'team1_data_short_name',
          'home_short_name', 'away_short_name', 'coin_toss_confirmed', 'coin_toss_team_a',
          'coin_toss_team_b', 'coin_toss_serve_a', 'first_serve', 'referee_pin',
          'referee_connection_enabled', 'team1_data_connection_enabled', 'team2_data_connection_enabled'
        ]

        for (const job of errorJobs) {
          const payload = job.payload || {}
          const hasLegacyColumn = legacyColumns.some(col => col in payload)

          if (hasLegacyColumn) {
            console.log('[MatchSetup] Removing stale error job with legacy columns:', job.id)
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
      if (!supabase) {
        setIsSupabaseAvailable(false)
        return
      }

      try {
        const { error } = await supabase.from('matches').select('id').limit(1)
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
          const { data: supabaseMatch } = await supabase
            .from('matches')
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
        const { data: supabaseMatch } = await supabase
          .from('matches')
          .select('id')
          .eq('external_id', match.seed_key)
          .maybeSingle()

        if (!supabaseMatch) {
          // Check if a match with the same game_n already exists (prevent duplicates)
          if (match.gameN) {
            const { data: existingByGameN } = await supabase
              .from('matches')
              .select('id, external_id')
              .eq('game_n', parseInt(match.gameN, 10))
              .maybeSingle()

            if (existingByGameN) {
              console.warn('[MatchSetup] Match with game_n already exists in Supabase:', match.gameN)
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
                round: match.round || 'pool'
              },
              team1_data: {
                name: team1?.name || team1Name || 'Home',
                short_name: team1?.shortName || match.team1ShortName || generateShortName(team1?.name || team1Name || 'Home'),
                color: team1?.color || team1Color
              },
              team2_data: {
                name: team2?.name || team2Name || 'Away',
                short_name: team2?.shortName || match.team2ShortName || generateShortName(team2?.name || team2Name || 'Away'),
                color: team2?.color || team2Color
              },
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })
          console.log('[MatchSetup] Created new match insert job for Supabase sync')
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
  }

  const restoreTeam2 = () => {
    const o = originalTeam2Ref.current
    if (!o) return
    setTeam2Roster(o.team2Roster)
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
            const currentValue = team1?.name || team1Name || 'Home team name'
            team1MeasureRef.current.textContent = currentValue
            const measuredWidth = team1MeasureRef.current.offsetWidth
            team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
          }
          if (team2MeasureRef.current && team2InputRef.current) {
            const currentValue = team2?.name || team2Name || 'Away team name'
            team2MeasureRef.current.textContent = currentValue
            const measuredWidth = team2MeasureRef.current.offsetWidth
            team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
          }
        }, 100)

        // Load match info - use safe parser to handle invalid dates
        if (match.scheduledAt) {
          const parsed = safeParseScheduledAt(match.scheduledAt)
          if (parsed.date) setDate(parsed.date)
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

        // Always sync upload PINs to Supabase if connected (whether newly generated or existing)
        // This ensures existing local PINs get pushed to Supabase
        if (supabase && match.seed_key) {
          const team1UploadPin = updates.team1UploadPin || match.team1UploadPin
          const team2UploadPin = updates.team2UploadPin || match.team2UploadPin
          if (team1UploadPin || team2UploadPin) {
            try {
              // Fetch existing connection_pins to merge (use maybeSingle to avoid 406 if match not synced yet)
              const { data: existingMatch } = await supabase
                .from('matches')
                .select('connection_pins')
                .eq('external_id', match.seed_key)
                .maybeSingle()

              // Only update if match exists in Supabase
              if (existingMatch) {
                const connectionPinsUpdate = {
                  ...(existingMatch.connection_pins || {}),
                  ...(team1UploadPin ? { upload_home: team1UploadPin } : {}),
                  ...(team2UploadPin ? { upload_away: team2UploadPin } : {})
                }

                await supabase
                  .from('matches')
                  .update({ connection_pins: connectionPinsUpdate })
                  .eq('external_id', match.seed_key)
                console.log('[MatchSetup] Synced upload PINs to Supabase connection_pins:', connectionPinsUpdate)
              }
            } catch (err) {
              console.warn('[MatchSetup] Failed to sync upload PINs to Supabase:', err)
            }
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

        // Load referee connection setting (default to disabled if not set)
        setRefereeConnectionEnabled(match.refereeConnectionEnabled === true)

        // Migrate old matches: ensure connection fields are explicitly set to false if undefined
        const connectionUpdates = {}
        if (match.refereeConnectionEnabled === undefined) connectionUpdates.refereeConnectionEnabled = false
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

  // Update effect - runs when match changes (for connection settings, etc.)
  useEffect(() => {
    if (!matchId || !match) return

    // Update connection settings (these can change without affecting roster)
    // Default to disabled if not explicitly enabled
    setRefereeConnectionEnabled(match.refereeConnectionEnabled === true)
  }, [matchId, match?.refereeConnectionEnabled])

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
      const port = serverStatus.port || 5173
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
          console.log('Registered as main instance:', instanceId)
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
          if (draft.home !== undefined) setTeam1Name(draft.home)
          if (draft.away !== undefined) setTeam2Name(draft.away)
          if (draft.date !== undefined) setDate(draft.date)
          if (draft.time !== undefined) setTime(draft.time)
          if (draft.hall !== undefined) setHall(draft.hall)
          if (draft.city !== undefined) setCity(draft.city)
          if (draft.type2 !== undefined) setType2(draft.type2)
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
        home: team1Name,
        away: team2Name,
        date,
        time,
        hall,
        city,
        type2,
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
            scheduledAt = createScheduledAt(date, time, { allowEmpty: true })
          } catch (err) {
            // For silent saves, just log and use existing value
            // For explicit saves, show error to user
            if (!silent) {
              console.error('[MatchSetup] Date/time validation error:', err.message)
              setNoticeModal({ message: `Invalid date/time: ${err.message}` })
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
          team1ShortName: team1ShortName || team1Name.substring(0, 8).toUpperCase(),
          team2ShortName: team2ShortName || team2Name.substring(0, 8).toUpperCase(),
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
          ),
          bench_home: team1Bench,
          bench_away: team2Bench
        }

        // Only save match type fields if explicitly saving OR match was previously confirmed
        // This prevents scoresheet from showing default Xs before user confirms match info
        if (!silent || match?.matchInfoConfirmedAt) {
          matchUpdate.match_type_2 = type2
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
              shortName: team1ShortName || team1Name.trim().substring(0, 8).toUpperCase(),
              benchStaff: team1Bench
            })
          } else {
            // Create new team if it doesn't exist
            team1Id = await db.teams.add({
              name: team1Name.trim(),
              color: team1Color,
              shortName: team1ShortName || team1Name.trim().substring(0, 8).toUpperCase(),
              benchStaff: team1Bench,
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
              shortName: team2ShortName || team2Name.trim().substring(0, 8).toUpperCase(),
              benchStaff: team2Bench
            })
          } else {
            // Create new team if it doesn't exist
            team2Id = await db.teams.add({
              name: team2Name.trim(),
              color: team2Color,
              shortName: team2ShortName || team2Name.trim().substring(0, 8).toUpperCase(),
              benchStaff: team2Bench,
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
        setNoticeModal({ message: 'Error saving data. Please try again.' })
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
  }, [date, time, hall, city, type2, gameN, league, team1Name, team2Name, team1Color, team2Color, team1Country, team2Country, team1ShortName, team2ShortName, team1Roster, team2Roster, team1Bench, team2Bench, ref1First, ref1Last, ref1Country, ref1Dob, ref2First, ref2Last, ref2Country, ref2Dob, scorerFirst, scorerLast, scorerCountry, scorerDob, asstFirst, asstLast, asstCountry, asstDob, team1CoachSignature, team2CoachSignature, currentView])

  // Update input widths when home/away values change - set default width based on content
  useEffect(() => {
    if (team1MeasureRef.current && team1InputRef.current) {
      const currentValue = team1Name || 'Home team name'
      team1MeasureRef.current.textContent = currentValue
      const measuredWidth = team1MeasureRef.current.offsetWidth
      // Always set width based on content, not just on focus
      team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
    }
  }, [team1Name, currentView]) // Also update when view changes (e.g., going back)

  useEffect(() => {
    if (team2MeasureRef.current && team2InputRef.current) {
      const currentValue = team2Name || 'Away team name'
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
          const currentValue = team1Name || 'Home team name'
          team1MeasureRef.current.textContent = currentValue
          const measuredWidth = team1MeasureRef.current.offsetWidth
          team1InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
        if (team2MeasureRef.current && team2InputRef.current) {
          const currentValue = team2Name || 'Away team name'
          team2MeasureRef.current.textContent = currentValue
          const measuredWidth = team2MeasureRef.current.offsetWidth
          team2InputRef.current.style.width = `${Math.max(80, measuredWidth + 24)}px`
        }
      }, 50)
      return () => clearTimeout(timeoutId)
    }
  }, [currentView, team1Name, team2Name])

  // Update input widths when home/away values change (e.g., when loaded from match)
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

  // Validate and set date with immediate feedback
  function handleDateChange(value) {
    setDate(value)
    if (!value) {
      setDateError('')
      return
    }
    // Validate format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setDateError(t('matchSetup.validation.invalidFormat'))
      return
    }
    const [year, month, day] = value.split('-').map(Number)
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
    const dateObj = new Date(value)
    if (isNaN(dateObj.getTime()) || dateObj.getMonth() + 1 !== month) {
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
    if (!team1Name || !team1Name.trim()) {
      setNoticeModal({ message: 'Home team name is required' })
      return
    }
    if (!team2Name || !team2Name.trim()) {
      setNoticeModal({ message: 'Away team name is required' })
      return
    }
    if (!team1Country || !team1Country.trim()) {
      setNoticeModal({ message: 'Team 1 country is required' })
      return
    }
    if (!team2Country || !team2Country.trim()) {
      setNoticeModal({ message: 'Team 2 country is required' })
      return
    }

    if (dateError) {
      setNoticeModal({ message: `Invalid date: ${dateError}` })
      return
    }
    if (timeError) {
      setNoticeModal({ message: `Invalid time: ${timeError}` })
      return
    }

    // Check if any changes were made (skip sync if no changes)
    const currentMatchInfo = {
      date, time, hall, city, type2, gameN, league, team1Name, team2Name, team1Color, team2Color, team1ShortName, team2ShortName
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
          shortName: team1ShortName || team1Name.trim().substring(0, 8).toUpperCase(),
          benchStaff: team1Bench,
          createdAt: new Date().toISOString()
        })
      } else {
        // Update existing team
        await db.teams.update(team1Id, {
          name: team1Name.trim(),
          color: team1Color,
          shortName: team1ShortName || team1Name.trim().substring(0, 8).toUpperCase(),
          benchStaff: team1Bench
        })
      }

      if (!team2Id) {
        team2Id = await db.teams.add({
          name: team2Name.trim(),
          color: team2Color,
          shortName: team2ShortName || team2Name.trim().substring(0, 8).toUpperCase(),
          benchStaff: team2Bench,
          createdAt: new Date().toISOString()
        })
      } else {
        // Update existing team
        await db.teams.update(team2Id, {
          name: team2Name.trim(),
          color: team2Color,
          shortName: team2ShortName || team2Name.trim().substring(0, 8).toUpperCase(),
          benchStaff: team2Bench
        })
      }

      // Build scheduledAt if date is set
      let scheduledAt = null
      if (date) {
        scheduledAt = createScheduledAt(date, time, { allowEmpty: true })
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
        homeName: team1Name.trim(),
        awayName: team2Name.trim(),
        team1ShortName: team1ShortName || generateShortName(team1Name.trim()),
        team2ShortName: team2ShortName || generateShortName(team2Name.trim()),
        team1Color,
        team2Color,
        scheduledAt,
        hall: hall || null,
        city: city || null,
        league: league || null,
        match_type_2: type2 || null,
        game_n: gameN ? parseInt(gameN, 10) : null,
        seed_key: matchSeedKey, // Ensure seed_key is set
        bench_home: team1Bench,
        bench_away: team2Bench,
        matchInfoConfirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

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
          match_type_2: type2 || ''
        },
        team1_data: { name: team1Name.trim(), short_name: team1ShortName || generateShortName(team1Name.trim()), color: team1Color, country: team1Country || '' },
        team2_data: { name: team2Name.trim(), short_name: team2ShortName || generateShortName(team2Name.trim()), color: team2Color, country: team2Country || '' },
        bench_home: team1Bench || [],
        bench_away: team2Bench || []
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
      setNoticeModal({
        message: isCreating ? t('matchSetup.modals.matchCreatedSyncing') : t('matchSetup.modals.matchUpdatedSyncing'),
        type: 'success',
        syncing: true
      })

      // Send match info email if provided (non-blocking)
      if (notificationEmail && notificationEmail.trim() && match?.gamePin) {
        const emailData = {
          email: notificationEmail.trim(),
          gameN: gameN || 'N/A',
          gamePin: match.gamePin,
          home: team1Name.trim(),
          away: team2Name.trim(),
          team1ShortName: team1ShortName || '',
          team2ShortName: team2ShortName || '',
          date: date || '',
          time: time || '',
          hall: hall || '',
          city: city || '',
          league: league || ''
        }

        // Get backend URL from environment or use default
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://openvolley-escoresheet-backend-production.up.railway.app'

        fetch(`${backendUrl}/api/match/send-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              console.log('[MatchSetup] Match info email sent successfully')
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
      checkSyncStatus()
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
      setNoticeModal({ message: `Invalid date: ${dateError}` })
      return
    }
    if (timeError) {
      setNoticeModal({ message: `Invalid time: ${timeError}` })
      return
    }

    // Validate date/time first
    let scheduledAt
    try {
      scheduledAt = createScheduledAt(date, time, { allowEmpty: false })
    } catch (err) {
      setNoticeModal({ message: `Invalid date/time: ${err.message}` })
      return
    }

    // Validate at least one captain per team
    const team1HasCaptain = team1Roster.some(p => p.isCaptain)
    const team2HasCaptain = team2Roster.some(p => p.isCaptain)

    if (!team1HasCaptain) {
      setNoticeModal({ message: 'Home team must have at least one captain.' })
      return
    }

    if (!team2HasCaptain) {
      setNoticeModal({ message: 'Away team must have at least one captain.' })
      return
    }

    // Validate no duplicate player numbers within each team
    const team1Duplicates = team1Roster.filter((p, i) =>
      p.number && team1Roster.findIndex(other => other.number === p.number) !== i
    )
    if (team1Duplicates.length > 0) {
      const dupNumbers = [...new Set(team1Duplicates.map(p => p.number))].join(', ')
      setNoticeModal({
        message: `${team1Name || 'Home'} team has duplicate player numbers: #${dupNumbers}\n\nPlease fix duplicate numbers before proceeding.`
      })
      return
    }

    const team2Duplicates = team2Roster.filter((p, i) =>
      p.number && team2Roster.findIndex(other => other.number === p.number) !== i
    )
    if (team2Duplicates.length > 0) {
      const dupNumbers = [...new Set(team2Duplicates.map(p => p.number))].join(', ')
      setNoticeModal({
        message: `${team2Name || 'Away'} team has duplicate player numbers: #${dupNumbers}\n\nPlease fix duplicate numbers before proceeding.`
      })
      return
    }

    // Validate birthdates - check for suspicious dates
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

    await db.transaction('rw', db.matches, db.teams, db.players, db.sync_queue, async () => {
      const team1DbId = await db.teams.add({ name: team1Name, color: team1Color, shortName: team1ShortName || team1Name.substring(0, 8).toUpperCase(), createdAt: new Date().toISOString() })
      const team2DbId = await db.teams.add({ name: team2Name, color: team2Color, shortName: team2ShortName || team2Name.substring(0, 8).toUpperCase(), createdAt: new Date().toISOString() })

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
        setNoticeModal({ message: 'Match PIN code is required. Please enter a PIN code to create the match.' })
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
        // Team names and colors for local access
        homeName: team1Name.trim(),
        awayName: team2Name.trim(),
        team1ShortName: team1ShortName || team1Name.substring(0, 3).toUpperCase(),
        team2ShortName: team2ShortName || team2Name.substring(0, 3).toUpperCase(),
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
        team1ConnectionEnabled: false,
        team2ConnectionEnabled: false,
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
            round: round || 'pool'
          },
          team1_data: { name: team1Name.trim(), short_name: team1ShortName || generateShortName(team1Name.trim()), color: team1Color || '#ef4444', country: team1Country || '' },
          team2_data: { name: team2Name.trim(), short_name: team2ShortName || generateShortName(team2Name.trim()), color: team2Color || '#3b82f6', country: team2Country || '' },
          players_home: team1Roster.map(p => ({
            number: p.number,
            first_name: p.firstName,
            last_name: p.lastName,
            dob: formatDobForSync(p.dob),
            is_captain: !!p.isCaptain
          })),
          players_away: team2Roster.map(p => ({
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
          connection_pins: {
            referee: String(generatedRefereePin).trim(),
            team1_data: String(generatedTeam1Pin).trim(),
            team2_data: String(generatedTeam2Pin).trim()
          }
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })

      // Associate user with this match if logged in
      if (user && supabase) {
        try {
          await supabase.from('user_matches').upsert({
            user_id: user.id,
            match_external_id: seedKey,
            role: 'scorer'
          }, { onConflict: 'user_id,match_external_id,role' })
          console.log('[MatchSetup] Associated user with match:', seedKey)
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
        setNoticeModal({ message: 'Please set both team names before proceeding to coin toss.' })
        return
      }

      if (!team1Country || team1Country.trim() === '' || !team2Country || team2Country.trim() === '') {
        setNoticeModal({ message: 'Please set both team countries before proceeding to coin toss.' })
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
      setNoticeModal({ message: 'No match data available.' })
      return
    }

    const matchData = await db.matches.get(matchId)
    if (!matchData) {
      setNoticeModal({ message: 'Match not found.' })
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

    const scoresheetData = {
      match: {
        ...matchData,
        team_1Country: matchData.team1Country || team1Country || '',
        team_2Country: matchData.team2Country || team2Country || ''
      },
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
    const scoresheetWindow = window.open('/scoresheet_beach.html', '_blank', 'width=1200,height=900')

    if (!scoresheetWindow) {
      setNoticeModal({ message: 'Please allow popups to view the scoresheet.' })
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
            players_home: team1Roster.filter(p => p.firstName || p.lastName).map(p => ({
              number: p.number || null,
              first_name: p.firstName || '',
              last_name: p.lastName || '',
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            players_away: team2Roster.filter(p => p.firstName || p.lastName).map(p => ({
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
          external_id: String(firstSetId),
          match_id: matchForSet.seed_key, // Use seed_key (external_id) for Supabase lookup
          index: 1,
          home_points: 0,
          away_points: 0,
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

    // Sync to server immediately so referee/bench dashboards receive data before Scoreboard mounts
    const finalMatchData = await db.matches.get(matchId)
    if (finalMatchData) {
      await syncMatchToServer(finalMatchData, true) // Full sync with teams, players, sets, events
    }

    // Start the match - directly navigate to scoreboard
    // onStart (continueMatch) will now allow test matches when status is 'live' and coin toss is confirmed
    onStart(matchId)
  }

  // PDF file handlers - must be defined before conditional returns
  const handleTeam1FileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setTeam1PdfFile(file)
      setTeam1PdfError('')
    }
  }

  const handleTeam2FileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setTeam2PdfFile(file)
      setTeam2PdfError('')
    }
  }

  const handleTeam1ImportClick = async () => {
    if (team1PdfFile) {
      await handleTeam1PdfUpload(team1PdfFile)
    } else {
      setTeam1PdfError('Please select a PDF file first')
    }
  }

  const handleTeam2ImportClick = async () => {
    if (team2PdfFile) {
      await handleTeam2PdfUpload(team2PdfFile)
    } else {
      setTeam2PdfError('Please select a PDF file first')
    }
  }

  // Search for pending roster in Supabase
  const handleSearchTeam1Roster = async () => {
    if (!match || !supabase) {
      setNoticeModal({ message: t('matchSetup.noSupabaseConnection') })
      return
    }

    setTeam1RosterSearching(true)
    try {
      const gameNumber = match.game_n || match.gameNumber || gameN
      console.log('[MatchSetup] Searching for home roster, game number:', gameNumber)

      // Search for pending roster in Supabase
      const { data, error } = await supabase
        .from('matches')
        .select('pending_home_roster, external_id')
        .eq('game_n', gameNumber)
        .not('pending_home_roster', 'is', null)
        .limit(1)
        .single()

      if (error || !data?.pending_home_roster) {
        console.log('[MatchSetup] No pending home roster found')
        setNoticeModal({ message: t('matchSetup.noRosterFound') })
        return
      }

      console.log('[MatchSetup] Found pending home roster:', data.pending_home_roster)

      // Store in local match data to trigger the pending roster UI
      await db.matches.update(matchId, { pendingHomeRoster: data.pending_home_roster })
    } catch (err) {
      console.error('[MatchSetup] Error searching for home roster:', err)
      setNoticeModal({ message: t('matchSetup.errorSearchingRoster') })
    } finally {
      setTeam1RosterSearching(false)
    }
  }

  const handleSearchTeam2Roster = async () => {
    if (!match || !supabase) {
      setNoticeModal({ message: t('matchSetup.noSupabaseConnection') })
      return
    }

    setTeam2RosterSearching(true)
    try {
      const gameNumber = match.game_n || match.gameNumber || gameN
      console.log('[MatchSetup] Searching for away roster, game number:', gameNumber)

      // Search for pending roster in Supabase
      const { data, error } = await supabase
        .from('matches')
        .select('pending_away_roster, external_id')
        .eq('game_n', gameNumber)
        .not('pending_away_roster', 'is', null)
        .limit(1)
        .single()

      if (error || !data?.pending_away_roster) {
        console.log('[MatchSetup] No pending away roster found')
        setNoticeModal({ message: t('matchSetup.noRosterFound') })
        return
      }

      console.log('[MatchSetup] Found pending away roster:', data.pending_away_roster)

      // Store in local match data to trigger the pending roster UI
      await db.matches.update(matchId, { pendingAwayRoster: data.pending_away_roster })
    } catch (err) {
      console.error('[MatchSetup] Error searching for away roster:', err)
      setNoticeModal({ message: t('matchSetup.errorSearchingRoster') })
    } finally {
      setTeam2RosterSearching(false)
    }
  }

  // PDF upload handlers - must be defined before conditional returns
  const handleTeam1PdfUpload = async (file) => {
    if (!file) return
    setTeam1PdfLoading(true)
    setTeam1PdfError('')

    try {
      const parsedData = await parseRosterPdf(file)

      // Replace all players with imported ones (overwrite mode)
      const mergedPlayers = parsedData.players.map(parsedPlayer => ({
        id: null,
        number: parsedPlayer.number || null,
        firstName: parsedPlayer.firstName || '',
        lastName: parsedPlayer.lastName || '',
        dob: parsedPlayer.dob || '',
        isCaptain: false
      }))

      setTeam1Roster(mergedPlayers)

      // Save to database if match exists
      if (matchId && match?.team1Id) {
        const existingPlayers = await db.players.where('teamId').equals(match.team1Id).toArray()
        for (const ep of existingPlayers) {
          await db.players.delete(ep.id)
        }

        await db.players.bulkAdd(
          mergedPlayers.map(p => ({
            teamId: match.team1Id,
            number: p.number,
            firstName: p.firstName,
            lastName: p.lastName,
            name: `${p.lastName} ${p.firstName}`,
            dob: p.dob || null,
            isCaptain: !!p.isCaptain,
            role: null,
            createdAt: new Date().toISOString()
          }))
        )
      }

      // Clear file input and state
      if (team1FileInputRef.current) {
        team1FileInputRef.current.value = ''
      }
      setTeam1PdfFile(null)

      // Show import summary modal
      setImportSummaryModal({
        team: 'team1',
        players: mergedPlayers.length,
        errors: []
      })
    } catch (err) {
      console.error('Error parsing PDF:', err)
      setTeam1PdfError(`Failed to parse PDF: ${err.message}`)
      // Clear file state on error too
      setTeam1PdfFile(null)
      if (team1FileInputRef.current) {
        team1FileInputRef.current.value = ''
      }
    } finally {
      setTeam1PdfLoading(false)
    }
  }

  const handleTeam2PdfUpload = async (file) => {
    if (!file) return
    setTeam2PdfLoading(true)
    setTeam2PdfError('')

    try {
      const parsedData = await parseRosterPdf(file)

      // Replace all players with imported ones (overwrite mode)
      const mergedPlayers = parsedData.players.map(parsedPlayer => ({
        id: null,
        number: parsedPlayer.number || null,
        firstName: parsedPlayer.firstName || '',
        lastName: parsedPlayer.lastName || '',
        dob: parsedPlayer.dob || '',
        isCaptain: false
      }))

      setTeam2Roster(mergedPlayers)

      // Save to database if match exists
      if (matchId && match?.team2Id) {
        const existingPlayers = await db.players.where('teamId').equals(match.team2Id).toArray()
        for (const ep of existingPlayers) {
          await db.players.delete(ep.id)
        }

        await db.players.bulkAdd(
          mergedPlayers.map(p => ({
            teamId: match.team2Id,
            number: p.number,
            firstName: p.firstName,
            lastName: p.lastName,
            name: `${p.lastName} ${p.firstName}`,
            dob: p.dob || null,
            isCaptain: !!p.isCaptain,
            role: null,
            createdAt: new Date().toISOString()
          }))
        )
      }

      // Clear file input and state
      if (team2FileInputRef.current) {
        team2FileInputRef.current.value = ''
      }
      setTeam2PdfFile(null)

      // Show import summary modal
      setImportSummaryModal({
        team: 'team2',
        players: mergedPlayers.length,
        errors: []
      })
    } catch (err) {
      console.error('Error parsing PDF:', err)
      setTeam2PdfError(`Failed to parse PDF: ${err.message}`)
      // Clear file state on error too
      setTeam2PdfFile(null)
      if (team2FileInputRef.current) {
        team2FileInputRef.current.value = ''
      }
    } finally {
      setTeam2PdfLoading(false)
    }
  }

  // Callback for opening database selector - MUST be before any early returns to satisfy React hooks rules
  const handleOpenDatabase = useCallback((e, selectorKey) => {
    setRefereeSelectorPosition({ element: e.currentTarget })
    setShowRefereeSelector(selectorKey)
  }, [])

  if (currentView === 'info') {
    return (
      <MatchSetupInfoView>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="secondary" onClick={() => { restoreMatchInfo(); setCurrentView('main') }}>← {t('common.back')}</button>
          <h1 style={{ margin: 8 }}>{t('matchSetup.matchInfo')}</h1>
          <div style={{ width: 80 }}></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {/* Competition & Match Info */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t('matchSetup.competitionInfo')}</h3>
            <div className="field">
              <label>{t('matchSetup.competitionName')}</label>
              <input className="w-200 capitalize" value={league} onChange={e => setLeague(e.target.value)} placeholder={t('matchSetup.enterCompetitionName')} />
            </div>
            <div className="field">
              <label>{t('matchSetup.matchNumber')}</label>
              <input className="w-100" value={gameN} onChange={e => setGameN(e.target.value)} placeholder="e.g. M01" />
            </div>
            <div className="field">
              <label>{t('matchSetup.date')}</label>
              <input
                className="w-120"
                type="date"
                value={date}
                onChange={e => handleDateChange(e.target.value)}
                style={dateError ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
              />
              {dateError && <span style={{ color: '#ef4444', fontSize: '12px', marginLeft: '8px' }}>{dateError}</span>}
            </div>
            <div className="field">
              <label>{t('matchSetup.time')}</label>
              <input
                className="w-100"
                type="time"
                value={time}
                onChange={e => handleTimeChange(e.target.value)}
                style={timeError ? { borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' } : {}}
              />
              {timeError && <span style={{ color: '#ef4444', fontSize: '12px', marginLeft: '8px' }}>{timeError}</span>}
            </div>
          </div>

          {/* Location */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t('matchSetup.location')}</h3>
            <div className="field">
              <label>{t('matchSetup.site')}</label>
              <input className="w-200 capitalize" value={city} onChange={e => setCity(e.target.value)} placeholder={t('matchSetup.enterSite')} />
            </div>
            <div className="field">
              <label>{t('matchSetup.court')}</label>
              <input className="w-100" value={court} onChange={e => setCourt(e.target.value)} placeholder="e.g. 1, Center" />
            </div>
          </div>

          {/* Category */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t('matchSetup.category')}</h3>
            <div className="field">
              <label>{t('matchSetup.gender')}</label>
              <select className="w-120" value={type2} onChange={e => setType2(e.target.value)}>
                <option value="men">{t('matchSetup.men')}</option>
                <option value="women">{t('matchSetup.women')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('matchSetup.phase')}</label>
              <select className="w-140" value={phase} onChange={e => setPhase(e.target.value)}>
                <option value="main">{t('matchSetup.mainDraw')}</option>
                <option value="qualification">{t('matchSetup.qualification')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('matchSetup.round')}</label>
              <select className="w-160" value={round} onChange={e => setRound(e.target.value)}>
                <option value="pool">{t('matchSetup.poolPlay')}</option>
                <option value="winner">{t('matchSetup.winnerBracket')}</option>
                <option value="class">{t('matchSetup.classificationRound')}</option>
                <option value="semifinals">{t('matchSetup.semifinals')}</option>
                <option value="finals">{t('matchSetup.finals')}</option>
              </select>
            </div>
          </div>

        </div>
        {match && !match.test && match.gamePin && (
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                padding: '12px 24px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '2px',
                textAlign: 'center',
                minWidth: '200px',
                transition: 'background 0.2s ease'
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{t('matchSetup.gamePin')}</div>
              <div style={{ userSelect: 'text', cursor: 'text' }}>{match.gamePin}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                {t('matchSetup.gamePinDescription')}
              </div>
              {match && !match.test && match.gamePin && (
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <div className="field" style={{ maxWidth: '400px', width: '100%' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                      {t('matchSetup.notificationEmail')}
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="email"
                        placeholder={t('matchSetup.notificationEmailPlaceholder')}
                        value={notificationEmail}
                        onChange={(e) => setNotificationEmail(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          fontSize: '14px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'inherit'
                        }}
                      />
                      <button
                        type="button"
                        disabled={sendingEmail}
                        onClick={async () => {
                          console.log('[Email] Button clicked, email:', notificationEmail)
                          if (!notificationEmail || !notificationEmail.includes('@')) {
                            showAlert(t('matchSetup.invalidEmail') || 'Please enter a valid email address', 'warning')
                            return
                          }
                          setSendingEmail(true)
                          try {
                            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
                            const res = await fetch(`${backendUrl}/api/match/send-info`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                email: notificationEmail,
                                gameN: gameN,
                                gamePin: match.gamePin,
                                home: team1Name,
                                team1ShortName: team1ShortName,
                                away: team2Name,
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
                        style={{
                          padding: '10px 16px',
                          fontSize: '14px',
                          borderRadius: '6px',
                          border: 'none',
                          background: sendingEmail ? 'var(--muted, #666)' : 'var(--primary, #4a90d9)',
                          color: 'white',
                          cursor: sendingEmail ? 'wait' : 'pointer',
                          fontWeight: 600,
                          opacity: sendingEmail ? 0.7 : 1
                        }}
                      >
                        {sendingEmail ? (t('matchSetup.sending') || 'Sending...') : (t('matchSetup.send') || 'Send')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

        )}



        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
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
          </button>
        </div>

        {/* Color Picker Modal for Match Info view */}
        {colorPickerModal && (
          <>
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 999,
                background: 'rgba(0, 0, 0, 0.6)'
              }}
              onClick={() => setColorPickerModal(null)}
            />
            <div
              style={{
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                background: '#1f2937',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                minWidth: '280px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                {t('matchSetup.chooseTeamColour', { team: colorPickerModal.team === 'team1' ? t('common.team1') : t('common.team2') })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
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
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 8px',
                        background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        minWidth: '60px'
                      }}
                    >
                      <div className="shirt" style={{ background: color, transform: 'scale(0.8)' }}>
                        <div className="collar" style={{ background: color }} />
                        <div className="number" style={{ color: getContrastColor(color) }}>1</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

      </MatchSetupInfoView>
    )
  }

  if (currentView === 'officials') {
    return (
      <MatchSetupOfficialsView>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="secondary" onClick={() => { restoreOfficials(); setCurrentView('main') }}>← {t('common.back')}</button>
          <h2 style={{ marginLeft: 20, marginRight: 20 }}>{t('matchSetup.matchOfficials')}</h2>
          <div style={{ width: 80 }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={async () => {
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

              setNoticeModal({ message: t('matchSetup.officialsSaved'), type: 'success', syncing: true })

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
              checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</button>
        </div>
      </MatchSetupOfficialsView>
    )
  }

  if (currentView === 'team1') {
    return (
      <MatchSetupTeam1View>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="secondary" onClick={() => { restoreTeam1(); setCurrentView('main') }}>← {t('common.back')}</button>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', padding: '10px', border: '0.5px solid white', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.1)' }}>{getTeamDisplayName(team1Roster, 'team1', team1Country)}</h2>
          <div style={{ width: 80 }}></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h1 style={{ margin: 0 }}>{t('roster.title')}</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setTeam1Roster([])
                setTeam1Bench([{ role: 'Coach', firstName: '', lastName: '', dob: '' }])
                setTeam1CoachSignature(null)
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {t('roster.deleteRoster')}
            </button>
            <button
              onClick={() => setTestRosterConfirm('team1')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {t('roster.loadTestRoster')}
            </button>
          </div>
        </div>
        {/* Player Stats for Home Team */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '12px' }}>
          {/* Player Stats */}
          {(() => {
            const team1CaptainForm = team1Roster.find(p => p.isCaptain)
            const homeHasError = !team1CaptainForm || team1Roster.length !== 2
            return (
              <div style={{
                border: homeHasError ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                background: homeHasError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(15, 23, 42, 0.2)',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: team1Roster.length !== 2 ? '#ef4444' : 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.players')}:</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: team1Roster.length !== 2 ? '#ef4444' : 'var(--text)' }}>{team1Roster.length}/2</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: !team1CaptainForm ? '#ef4444' : 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.captain')}:</span>
                  {team1CaptainForm ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: '2px solid #22c55e',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#22c55e'
                    }}>{team1CaptainForm.number || '?'}</span>
                  ) : (
                    <span style={{ fontSize: '14px', fontStyle: 'italic', color: '#ef4444' }}>—</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.country')}:</span>
                  <CountrySelect
                    value={team1Country}
                    onChange={setTeam1Country}
                    placeholder="Select Country"
                  />
                </div>
              </div>
            )
          })()}
        </div>

        {/* Add new player section (beach volleyball: max 2 players) */}
        {team1Roster.length < 2 && (
          <div style={{
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            background: 'rgba(15, 23, 42, 0.2)',
            marginBottom: '8px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>{t('matchSetup.addNewPlayer')}</div>
            <div className="row" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>

              {/* Number Selection for New Player - automatically suggest available number */}
              <div className="w-num" style={{ display: 'flex', gap: '4px' }}>
                {[1, 2].map(num => {
                  // Check if number is taken
                  const isTaken = team1Roster.some(p => p.number === num)
                  // If number is taken or manually selected incorrectly, handle it?
                  // For adding new player, we just let them pick.
                  // Default to '1' if empty, or '2' if '1' is taken.
                  const isSelected = team1Num === String(num)

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTeam1Num(String(num))}
                      disabled={isTaken}
                      style={{
                        padding: '4px',
                        flex: 1,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        border: isSelected ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.2)',
                        background: isSelected ? 'rgba(34, 197, 94, 0.2)' : isTaken ? 'rgba(0,0,0,0.2)' : 'transparent',
                        color: isSelected ? '#22c55e' : isTaken ? 'rgba(255,255,255,0.3)' : 'white',
                        cursor: isTaken ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {num}
                    </button>
                  )
                })}
              </div>

              <input className="w-name capitalize" placeholder={t('matchSetup.lastName')} value={team1Last} onChange={e => setTeam1Last(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <input className="w-name capitalize" placeholder={t('matchSetup.firstName')} value={team1First} onChange={e => setTeam1First(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <input className="w-dob" placeholder={t('matchSetup.dateOfBirthPlaceholder')} type="date" value={team1Dob ? formatDateToISO(team1Dob) : ''} onChange={e => setTeam1Dob(e.target.value ? formatDateToDDMMYYYY(e.target.value) : '')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <label className="inline"><input type="radio" name="team1CaptainForm" checked={team1CaptainForm} onChange={() => setTeam1CaptainForm(true)} /> {t('matchSetup.captain')}</label>
              <button type="button" className="secondary" onClick={() => {
                if (!team1Last || !team1First) return
                // Default number logic if not selected
                let numToUse = team1Num ? Number(team1Num) : null
                if (!numToUse) {
                  if (!team1Roster.some(p => p.number === 1)) numToUse = 1
                  else if (!team1Roster.some(p => p.number === 2)) numToUse = 2
                }

                const newPlayer = { number: numToUse, lastName: team1Last, firstName: team1First, dob: team1Dob, isCaptain: team1CaptainForm }
                setTeam1Roster(list => {
                  const cleared = team1CaptainForm ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
                  const next = [...cleared, newPlayer].sort((a, b) => {
                    const an = a.number ?? 999
                    const bn = b.number ?? 999
                    return an - bn
                  })
                  return next
                })
                setTeam1Num(''); setTeam1First(''); setTeam1Last(''); setTeam1Dob(''); setTeam1CaptainForm(false)
              }}>{t('common.add')}</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Roster Header Row */}
          <div className="row" style={{ alignItems: 'center', fontWeight: 600, fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, padding: '6px 8px', border: '2px solid transparent' }}>
            <div className="w-num" style={{ textAlign: 'center' }}>#</div>
            <div className="w-name">{t('matchSetup.lastName')}</div>
            <div className="w-name">{t('matchSetup.firstName')}</div>
            <div className="w-dob">{t('matchSetup.dateOfBirth')}</div>
            <div style={{ width: '70px', textAlign: 'center' }}>{t('matchSetup.captain')}</div>
            <div style={{ width: '80px' }}></div>
          </div>
          {team1Roster.map((p, i) => {
            // Check if this player's number is a duplicate
            const isDuplicate = p.number != null && p.number !== '' &&
              team1Roster.some((other, idx) => idx !== i && other.number === p.number)

            // Determine border style based on captain status
            const isCaptain = p.isCaptain || false
            // Base style for all rows (transparent border for alignment)
            let borderStyle = {
              borderRadius: '6px',
              padding: '6px 8px',
              border: '2px solid transparent'
            }
            if (isCaptain) {
              // Captain: green border
              borderStyle = {
                border: '2px solid #22c55e',
                borderRadius: '6px',
                padding: '6px 8px',
                background: 'rgba(34, 197, 94, 0.1)'
              }
            }

            return (
              <div key={`h-${i}`} className="row" style={{ alignItems: 'center', ...borderStyle }}>
                {/* Replaced input with Toggle Buttons [1] [2] */}
                <div className="w-num" style={{ display: 'flex', gap: '4px' }}>
                  {[1, 2].map(num => {
                    const isSelected = p.number === num
                    return (
                      <button
                        key={num}
                        type="button"
                        className={isSelected ? 'toggle-num selected' : 'toggle-num'}
                        style={{
                          padding: '0',
                          flex: 1,
                          height: '24px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          borderRadius: '4px',
                          border: isSelected ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.2)',
                          background: isSelected ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                          color: isSelected ? '#22c55e' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
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
                <input
                  className="w-name capitalize"
                  placeholder="Last Name"
                  value={p.lastName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], lastName: e.target.value }
                    setTeam1Roster(updated)
                  }}
                />
                <input
                  className="w-name capitalize"
                  placeholder="First Name"
                  value={p.firstName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], firstName: e.target.value }
                    setTeam1Roster(updated)
                  }}
                />
                <input
                  className="w-dob"
                  placeholder={t('matchSetup.dateOfBirthPlaceholder')}
                  type="date"
                  value={p.dob ? formatDateToISO(p.dob) : ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team1Roster]
                    updated[i] = { ...updated[i], dob: e.target.value ? formatDateToDDMMYYYY(e.target.value) : '' }
                    setTeam1Roster(updated)
                  }}
                />
                <label className="inline">
                  <input
                    type="radio"
                    name="team1CaptainForm"
                    checked={p.isCaptain || false}
                    onChange={() => {
                      const updated = team1Roster.map((player, idx) => ({
                        ...player,
                        isCaptain: idx === i
                      }))
                      setTeam1Roster(updated)
                    }}
                  />
                  {t('matchSetup.captain')}
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTeam1Roster(list => list.filter((_, idx) => idx !== i))}
                >
                  {t('common.delete')}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={async () => {

            // Check if any changes were made (skip sync if no changes)
            const hasChanges = hasRosterChanged(
              originalTeam1Ref.current?.team1Roster,
              team1Roster,
              originalTeam1Ref.current?.team1Bench,
              team1Bench
            )

            // If no changes, just go back to main view
            if (!hasChanges) {
              console.log('[MatchSetup] No home roster changes, skipping sync')
              setCurrentView('main')
              return
            }

            // Validate roster before saving (beach volleyball: 2 players per team)
            const validationErrors = []

            // 1. Check exactly 2 players for beach volleyball (numbers are optional)
            console.log('[MatchSetup] Home players count:', team1Roster.length)
            if (team1Roster.length !== 2) {
              validationErrors.push(`Beach volleyball requires exactly 2 players. Currently: ${team1Roster.length}`)
            }

            // 2. Check captain is set
            const hasCaptain = team1Roster.some(p => p.isCaptain)
            console.log('[MatchSetup] Home has captain:', hasCaptain)
            if (!hasCaptain) {
              validationErrors.push(t('matchSetup.validation.noCaptain'))
            }

            // 3. Check for duplicate numbers (only among players that have numbers)
            const numbers = team1Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
            const duplicateNumbers = numbers.filter((num, idx) => numbers.indexOf(num) !== idx)
            if (duplicateNumbers.length > 0) {
              console.log('[MatchSetup] Home duplicate numbers:', duplicateNumbers)
              validationErrors.push(t('matchSetup.validation.duplicateNumbers', { numbers: [...new Set(duplicateNumbers)].join(', ') }))
            }

            // 4. Check for invalid numbers (must be 1-99 if provided)
            const invalidNumbers = team1Roster.filter(p => p.number != null && p.number !== '' && (p.number < 1 || p.number > 99))
            if (invalidNumbers.length > 0) {
              console.log('[MatchSetup] Home invalid numbers:', invalidNumbers.map(p => p.number))
              validationErrors.push(t('matchSetup.validation.invalidNumbers', { numbers: invalidNumbers.map(p => p.number).join(', ') }))
            }

            // Player numbers are now optional - removed validation for players without numbers

            // Show validation errors if any
            if (validationErrors.length > 0) {
              console.log('[MatchSetup] Home roster validation errors:', validationErrors)
              setNoticeModal({ message: t('matchSetup.validation.fixIssues', { issues: validationErrors.join('\n• ') }) })
              return
            }

            console.log('[MatchSetup] Home roster validation passed, saving...')

            // Auto-set team name from player last names if both players have last names
            if (team1Roster.length === 2 && team1Roster[0]?.lastName && team1Roster[1]?.lastName) {
              const newTeamName = getTeamDisplayName(team1Roster, 'team1', team1Country)
              setTeam1Name(newTeamName)
            }

            // Save home team data to database if matchId exists
            if (matchId && match?.team1Id) {
              const finalTeam1Name = team1Roster.length === 2 && team1Roster[0]?.lastName && team1Roster[1]?.lastName
                ? getTeamDisplayName(team1Roster, 'team1', team1Country)
                : team1Name
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

              // Update match with short name, country, bench officials, and restore signatures (re-lock)
              const updateData = {
                team1ShortName: team1ShortName || team1Name.substring(0, 3).toUpperCase(),
                team1Country: team1Country || '',
                bench_home: team1Bench  // Save bench officials to match record
              }

              // Save current signatures (new or existing) to database
              if (team1CoachSignature) {
                updateData.team1CoachSignature = team1CoachSignature
                setSavedSignatures(prev => ({ ...prev, homeCoach: team1CoachSignature }))
              } else if (savedSignatures.homeCoach) {
                // Restore previously saved signature if current is empty (re-lock the team)
                updateData.team1CoachSignature = savedSignatures.homeCoach
                setTeam1CoachSignature(savedSignatures.homeCoach)
              }
              // Captain signatures are collected at coin toss

              await db.matches.update(matchId, updateData)

              // Sync home team data to Supabase as JSONB
              if (match?.seed_key) {
                const homeCoachSig = team1CoachSignature || savedSignatures.homeCoach || null
                await db.sync_queue.add({
                  resource: 'match',
                  action: 'update',
                  payload: {
                    id: match.seed_key,
                    // JSONB columns
                    team1_data: { name: finalTeam1Name?.trim() || '', short_name: team1ShortName || generateShortName(finalTeam1Name), color: team1Color, country: team1Country || '' },
                    // Captain signatures synced from CoinToss component
                    players_home: team1Roster.filter(p => p.firstName || p.lastName).map(p => ({
                      number: p.number || null,
                      first_name: p.firstName || '',
                      last_name: p.lastName || '',
                      dob: formatDobForSync(p.dob),
                      is_captain: !!p.isCaptain
                    })),
                    bench_home: team1Bench || []
                  },
                  ts: new Date().toISOString(),
                  status: 'queued'
                })

                // Also sync to match_live_state if it exists (for Referee app)
                try {
                  const { data: supabaseMatch } = await supabase
                    .from('matches')
                    .select('id')
                    .eq('external_id', match.seed_key)
                    .maybeSingle()

                  if (supabaseMatch?.id) {
                    const coinTossTeamA = match.coinTossTeamA || 'team1'
                    const homeIsTeamA = coinTossTeamA === 'team1'
                    const colorKey = homeIsTeamA ? 'team_a_color' : 'team_b_color'
                    const shortKey = homeIsTeamA ? 'team_a_short' : 'team_b_short'
                    const nameKey = homeIsTeamA ? 'team_a_name' : 'team_b_name'

                    await supabase
                      .from('match_live_state')
                      .update({
                        [colorKey]: team1Color,
                        [shortKey]: team1ShortName || generateShortName(finalTeam1Name),
                        [nameKey]: finalTeam1Name?.trim() || '',
                        updated_at: new Date().toISOString()
                      })
                      .eq('match_id', supabaseMatch.id)
                    console.log('[MatchSetup] Synced home team to match_live_state')
                  }
                } catch (err) {
                  console.debug('[MatchSetup] Could not sync home team to match_live_state:', err.message)
                }
              }

              setNoticeModal({ message: t('matchSetup.homeSaved'), type: 'success', syncing: true })

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
                      setNoticeModal({ message: t('matchSetup.homeSynced'), type: 'success' })
                    } else if (attempts >= maxAttempts) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.homeSavedLocal'), type: 'success' })
                    }
                  } catch (err) {
                    clearInterval(interval)
                  }
                }, 500)
              }
              checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</button>
        </div>
        {/* PDF Import Summary Modal - shown immediately after import */}
        {
          importSummaryModal && importSummaryModal.team === 'team1' && (
            <Modal
              title={t('matchSetup.modals.team1ImportComplete')}
              open={true}
              onClose={() => setImportSummaryModal(null)}
              width={400}
            >
              <div style={{ padding: '20px' }}>
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>
                    {t('matchSetup.modals.playersCount', { count: importSummaryModal.players })}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                    {t('matchSetup.modals.successfullyImported')}
                  </div>
                  {importSummaryModal.benchOfficials > 0 && (
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                      {importSummaryModal.benchOfficials > 1 ? t('matchSetup.modals.benchOfficialsCountPlural', { count: importSummaryModal.benchOfficials }) : t('matchSetup.modals.benchOfficialsCount', { count: importSummaryModal.benchOfficials })}
                    </div>
                  )}
                </div>
                <div style={{
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '13px', color: '#eab308', fontWeight: 500, marginBottom: '4px' }}>
                    {t('matchSetup.modals.reviewImportedData')}
                  </div>
                  <ul style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: '8px 0 0 0', paddingLeft: '20px', lineHeight: '1.6' }}>
                    <li>{t('matchSetup.modals.reviewVerifyDob')}</li>
                    <li>{t('matchSetup.modals.reviewSetCaptain')}</li>
                  </ul>
                </div>
                <button
                  onClick={() => setImportSummaryModal(null)}
                  style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('common.ok')}
                </button>
              </div>
            </Modal>
          )
        }
        {/* Notice Modal - must be rendered in this view since early return prevents main render */}
        {
          noticeModal && (
            <Modal
              title={noticeModal.syncing ? t('matchSetup.modals.syncing') : noticeModal.type === 'success' ? t('matchSetup.modals.success') : t('matchSetup.modals.notice')}
              open={true}
              onClose={() => !noticeModal.syncing && setNoticeModal(null)}
              width={400}
              hideCloseButton={true}
            >
              <div style={{ padding: '24px', textAlign: 'center' }}>
                {noticeModal.syncing && (
                  <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⟳</div>
                )}
                {!noticeModal.syncing && noticeModal.type === 'success' && (
                  <div style={{ fontSize: '48px', marginBottom: '16px', color: '#22c55e' }}>✓</div>
                )}
                {!noticeModal.syncing && noticeModal.type === 'error' && (
                  <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ef4444' }}>✕</div>
                )}
                <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)', whiteSpace: 'pre-line' }}>
                  {noticeModal.message}
                </p>
                {!noticeModal.syncing && (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setNoticeModal(null)}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: noticeModal.type === 'success' ? '#22c55e' : noticeModal.type === 'error' ? '#ef4444' : 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            </Modal>
          )
        }

        {/* Roster Preview Modal */}
        {
          rosterPreview && (
            <Modal
              title={t('matchSetup.rosterPreviewTitle')}
              open={true}
              onClose={() => setRosterPreview(null)}
              width={600}
            >
              <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                {(() => {
                  const roster = rosterPreview === 'team1' ? match?.pendingHomeRoster : match?.pendingAwayRoster
                  if (!roster) return <p>{t('matchSetup.noRosterFound')}</p>
                  return (
                    <>
                      <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>
                        {t('matchSetup.playersCount')}: {roster.players?.length || 0}
                      </h3>
                      <div style={{ marginBottom: '16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                              <th style={{ padding: '8px', textAlign: 'left' }}>#</th>
                              <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.lastName')}</th>
                              <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.firstName')}</th>
                              <th style={{ padding: '8px', textAlign: 'center' }}>C</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(roster.players || []).map((p, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <td style={{ padding: '6px 8px' }}>{p.number}</td>
                                <td style={{ padding: '6px 8px' }}>{p.lastName || ''}</td>
                                <td style={{ padding: '6px 8px' }}>{p.firstName || ''}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.isCaptain ? 'C' : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {roster.bench && roster.bench.length > 0 && (
                        <>
                          <h3 style={{ marginTop: '16px', marginBottom: '12px', fontSize: '16px' }}>
                            {t('matchSetup.benchOfficialsCount')}: {roster.bench.length}
                          </h3>
                          <div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.role')}</th>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.lastName')}</th>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.firstName')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roster.bench.map((b, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <td style={{ padding: '6px 8px' }}>{b.role || ''}</td>
                                    <td style={{ padding: '6px 8px' }}>{b.lastName || ''}</td>
                                    <td style={{ padding: '6px 8px' }}>{b.firstName || ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )
                })()}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                  <button
                    onClick={() => setRosterPreview(null)}
                    style={{
                      padding: '10px 24px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: 'var(--accent)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </Modal>
          )
        }

        {/* Test Roster Confirmation Modal */}
        {
          testRosterConfirm === 'team1' && (
            <Modal
              title={t('roster.confirmLoadTestRoster')}
              open={true}
              onClose={() => setTestRosterConfirm(null)}
              width={400}
            >
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)' }}>
                  {t('roster.confirmLoadTestRosterMessage', { team: TEST_TEAM_1.name })}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      setTeam1Roster([...TEST_TEAM_1.players])
                      setTeam1Bench([])
                      if (!team1Name || team1Name === 'Home') setTeam1Name(TEST_TEAM_1.name)
                      if (!team1ShortName) setTeam1ShortName(TEST_TEAM_1.shortName)
                      setTestRosterConfirm(null)
                    }}
                    style={{
                      padding: '12px 24px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    {t('roster.loadTestRoster')}
                  </button>
                  <button
                    onClick={() => setTestRosterConfirm(null)}
                    className="secondary"
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: 600 }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </Modal>
          )
        }

        {/* SignaturePad for home team view */}
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
      <MatchSetupTeam2View>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="secondary" onClick={() => { restoreTeam2(); setCurrentView('main') }}>← {t('common.back')}</button>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', padding: '10px', border: '0.5px solid white', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.1)' }}>{getTeamDisplayName(team2Roster, 'team2', team2Country)}</h2>
          <div style={{ width: 80 }}></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h1 style={{ margin: 0 }}>{t('roster.title')}</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setTeam2Roster([])
                setTeam2Bench([{ role: 'Coach', firstName: '', lastName: '', dob: '' }])
                setTeam2CoachSignature(null)
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {t('roster.deleteRoster')}
            </button>
            <button
              onClick={() => setTestRosterConfirm('team2')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {t('roster.loadTestRoster')}
            </button>
          </div>
        </div>
        {/* Player Stats for Away Team */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '12px' }}>
          {/* Player Stats */}
          {(() => {
            const team2CaptainForm = team2Roster.find(p => p.isCaptain)
            const awayHasError = !team2CaptainForm || team2Roster.length !== 2
            return (
              <div style={{
                border: awayHasError ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                background: awayHasError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(15, 23, 42, 0.2)',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: team2Roster.length !== 2 ? '#ef4444' : 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.players')}:</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: team2Roster.length !== 2 ? '#ef4444' : 'var(--text)' }}>{team2Roster.length}/2</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: !team2CaptainForm ? '#ef4444' : 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.captain')}:</span>
                  {team2CaptainForm ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: '2px solid #22c55e',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#22c55e'
                    }}>{team2CaptainForm.number || '?'}</span>
                  ) : (
                    <span style={{ fontSize: '14px', fontStyle: 'italic', color: '#ef4444' }}>—</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.country')}:</span>
                  <CountrySelect
                    value={team2Country}
                    onChange={setTeam2Country}
                    placeholder="Select Country"
                  />
                </div>
              </div>
            )
          })()}
        </div>
        {/* Add new player section (beach volleyball: max 2 players) */}
        {team2Roster.length < 2 && (
          <div style={{
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            background: 'rgba(15, 23, 42, 0.2)',
            marginBottom: '8px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>{t('matchSetup.addNewPlayer')}</div>
            <div className="row" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
              {/* Number Selection for New Player - automatically suggest available number */}
              <div className="w-num" style={{ display: 'flex', gap: '4px' }}>
                {[1, 2].map(num => {
                  // Check if number is taken
                  const isTaken = team2Roster.some(p => p.number === num)
                  const isSelected = team2Num === String(num)

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTeam2Num(String(num))}
                      disabled={isTaken}
                      style={{
                        padding: '4px',
                        flex: 1,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        border: isSelected ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.2)',
                        background: isSelected ? 'rgba(34, 197, 94, 0.2)' : isTaken ? 'rgba(0,0,0,0.2)' : 'transparent',
                        color: isSelected ? '#22c55e' : isTaken ? 'rgba(255,255,255,0.3)' : 'white',
                        cursor: isTaken ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {num}
                    </button>
                  )
                })}
              </div>
              <input className="w-name capitalize" placeholder={t('matchSetup.lastName')} value={team2Last} onChange={e => setTeam2Last(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <input className="w-name capitalize" placeholder={t('matchSetup.firstName')} value={team2First} onChange={e => setTeam2First(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <input className="w-dob" placeholder={t('matchSetup.dateOfBirthPlaceholder')} type="date" value={team2Dob ? formatDateToISO(team2Dob) : ''} onChange={e => setTeam2Dob(e.target.value ? formatDateToDDMMYYYY(e.target.value) : '')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }} />
              <label className="inline"><input type="radio" name="team2CaptainForm" checked={team2CaptainForm} onChange={() => setTeam2CaptainForm(true)} /> {t('matchSetup.captain')}</label>
              <button type="button" className="secondary" onClick={() => {
                if (!team2Last || !team2First) return
                // Default number logic if not selected
                let numToUse = team2Num ? Number(team2Num) : null
                if (!numToUse) {
                  if (!team2Roster.some(p => p.number === 1)) numToUse = 1
                  else if (!team2Roster.some(p => p.number === 2)) numToUse = 2
                }

                const newPlayer = { number: numToUse, lastName: team2Last, firstName: team2First, dob: team2Dob, isCaptain: team2CaptainForm }
                setTeam2Roster(list => {
                  const cleared = team2CaptainForm ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
                  const next = [...cleared, newPlayer].sort((a, b) => {
                    const an = a.number ?? 999
                    const bn = b.number ?? 999
                    return an - bn
                  })
                  return next
                })
                setTeam2Num(''); setTeam2First(''); setTeam2Last(''); setTeam2Dob(''); setTeam2CaptainForm(false)
              }}>{t('common.add')}</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Roster Header Row */}
          <div className="row" style={{ alignItems: 'center', fontWeight: 600, fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, padding: '6px 8px', border: '2px solid transparent' }}>
            <div className="w-num" style={{ textAlign: 'center' }}>#</div>
            <div className="w-name">{t('matchSetup.lastName')}</div>
            <div className="w-name">{t('matchSetup.firstName')}</div>
            <div className="w-dob">{t('matchSetup.dateOfBirth')}</div>
            <div style={{ width: '70px', textAlign: 'center' }}>{t('matchSetup.captain')}</div>
            <div style={{ width: '80px' }}></div>
          </div>
          {team2Roster.map((p, i) => {
            // Check if this player's number is a duplicate
            const isDuplicate = p.number != null && p.number !== '' &&
              team2Roster.some((other, idx) => idx !== i && other.number === p.number)

            // Determine border style based on captain status
            const isCaptain = p.isCaptain || false
            // Base style for all rows (transparent border for alignment)
            let borderStyle = {
              borderRadius: '6px',
              padding: '6px 8px',
              border: '2px solid transparent'
            }
            if (isCaptain) {
              // Captain: green border
              borderStyle = {
                border: '2px solid #22c55e',
                borderRadius: '6px',
                padding: '6px 8px',
                background: 'rgba(34, 197, 94, 0.1)'
              }
            }

            return (
              <div key={`a-${i}`} className="row" style={{ alignItems: 'center', ...borderStyle }}>
                <input
                  className="w-num"
                  placeholder="#"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  value={p.number ?? ''}
                  style={isDuplicate ? {
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '2px solid #ef4444',
                    color: '#ef4444'
                  } : undefined}
                  title={isDuplicate ? 'Duplicate jersey number!' : undefined}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onKeyPress={e => {
                    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Tab') {
                      e.preventDefault()
                    }
                  }}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null
                    if (val !== null && (val < 1 || val > 99)) return
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], number: val }
                    setTeam2Roster(updated)
                  }}
                  onBlur={() => {
                    // No sorting - keep original order
                  }}
                />
                <input
                  className="w-name capitalize"
                  placeholder="Last Name"
                  value={p.lastName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], lastName: e.target.value }
                    setTeam2Roster(updated)
                  }}
                />
                <input
                  className="w-name capitalize"
                  placeholder="First Name"
                  value={p.firstName || ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], firstName: e.target.value }
                    setTeam2Roster(updated)
                  }}
                />
                <input
                  className="w-dob"
                  placeholder={t('matchSetup.dateOfBirthPlaceholder')}
                  type="date"
                  value={p.dob ? formatDateToISO(p.dob) : ''}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  onChange={e => {
                    const updated = [...team2Roster]
                    updated[i] = { ...updated[i], dob: e.target.value ? formatDateToDDMMYYYY(e.target.value) : '' }
                    setTeam2Roster(updated)
                  }}
                />
                <label className="inline">
                  <input
                    type="radio"
                    name="team2CaptainForm"
                    checked={p.isCaptain || false}
                    onChange={() => {
                      const updated = team2Roster.map((player, idx) => ({
                        ...player,
                        isCaptain: idx === i
                      }))
                      setTeam2Roster(updated)
                    }}
                  />
                  {t('matchSetup.captain')}
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTeam2Roster(list => list.filter((_, idx) => idx !== i))}
                >
                  {t('common.delete')}
                </button>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={async () => {

            // Check if any changes were made (skip sync if no changes)
            const hasChanges = hasRosterChanged(
              originalTeam2Ref.current?.team2Roster,
              team2Roster,
              originalTeam2Ref.current?.team2Bench,
              team2Bench
            )

            // If no changes, just go back to main view
            if (!hasChanges) {
              console.log('[MatchSetup] No away roster changes, skipping sync')
              setCurrentView('main')
              return
            }

            // Validate roster before saving (beach volleyball: 2 players per team)
            const validationErrors = []

            // 1. Check exactly 2 players for beach volleyball (numbers are optional)
            console.log('[MatchSetup] Away players count:', team2Roster.length)
            if (team2Roster.length !== 2) {
              validationErrors.push(`Beach volleyball requires exactly 2 players. Currently: ${team2Roster.length}`)
            }

            // 2. Check captain is set
            const hasCaptain = team2Roster.some(p => p.isCaptain)
            console.log('[MatchSetup] Away has captain:', hasCaptain)
            if (!hasCaptain) {
              validationErrors.push(t('matchSetup.validation.noCaptain'))
            }

            // 3. Check for duplicate numbers (only among players that have numbers)
            const numbers = team2Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
            const duplicateNumbers = numbers.filter((num, idx) => numbers.indexOf(num) !== idx)
            if (duplicateNumbers.length > 0) {
              console.log('[MatchSetup] Away duplicate numbers:', duplicateNumbers)
              validationErrors.push(t('matchSetup.validation.duplicateNumbers', { numbers: [...new Set(duplicateNumbers)].join(', ') }))
            }

            // 4. Check for invalid numbers (must be 1-99 if provided)
            const invalidNumbers = team2Roster.filter(p => p.number != null && p.number !== '' && (p.number < 1 || p.number > 99))
            if (invalidNumbers.length > 0) {
              console.log('[MatchSetup] Away invalid numbers:', invalidNumbers.map(p => p.number))
              validationErrors.push(t('matchSetup.validation.invalidNumbers', { numbers: invalidNumbers.map(p => p.number).join(', ') }))
            }

            // Player numbers are now optional - removed validation for players without numbers

            // Show validation errors if any
            if (validationErrors.length > 0) {
              console.log('[MatchSetup] Away roster validation errors:', validationErrors)
              setNoticeModal({ message: t('matchSetup.validation.fixIssues', { issues: validationErrors.join('\n• ') }) })
              return
            }

            console.log('[MatchSetup] Away roster validation passed, saving...')

            // Auto-set team name from player last names if both players have last names
            if (team2Roster.length === 2 && team2Roster[0]?.lastName && team2Roster[1]?.lastName) {
              const newTeamName = getTeamDisplayName(team2Roster, 'team2', team2Country)
              setTeam2Name(newTeamName)
            }

            // Save away team data to database if matchId exists
            if (matchId && match?.team2Id) {
              const finalTeam2Name = team2Roster.length === 2 && team2Roster[0]?.lastName && team2Roster[1]?.lastName
                ? getTeamDisplayName(team2Roster, 'team2', team2Country)
                : team2Name
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

              // Update match with short name, country, bench officials, and restore signatures (re-lock)
              const updateData = {
                team2ShortName: team2ShortName || team2Name.substring(0, 3).toUpperCase(),
                team2Country: team2Country || '',
                bench_away: team2Bench  // Save bench officials to match record
              }

              // Save current signatures (new or existing) to database
              if (team2CoachSignature) {
                updateData.team2CoachSignature = team2CoachSignature
                setSavedSignatures(prev => ({ ...prev, awayCoach: team2CoachSignature }))
              } else if (savedSignatures.awayCoach) {
                // Restore previously saved signature if current is empty (re-lock the team)
                updateData.team2CoachSignature = savedSignatures.awayCoach
                setTeam2CoachSignature(savedSignatures.awayCoach)
              }
              // Captain signatures are collected at coin toss

              await db.matches.update(matchId, updateData)

              // Sync away team data to Supabase as JSONB
              if (match?.seed_key) {
                const awayCoachSig = team2CoachSignature || savedSignatures.awayCoach || null
                await db.sync_queue.add({
                  resource: 'match',
                  action: 'update',
                  payload: {
                    id: match.seed_key,
                    // JSONB columns
                    team2_data: { name: finalTeam2Name?.trim() || '', short_name: team2ShortName || generateShortName(finalTeam2Name), color: team2Color, country: team2Country || '' },
                    // Captain signatures synced from CoinToss component
                    players_away: team2Roster.filter(p => p.firstName || p.lastName).map(p => ({
                      number: p.number || null,
                      first_name: p.firstName || '',
                      last_name: p.lastName || '',
                      dob: formatDobForSync(p.dob),
                      is_captain: !!p.isCaptain
                    })),
                    bench_away: team2Bench || []
                  },
                  ts: new Date().toISOString(),
                  status: 'queued'
                })

                // Also sync to match_live_state if it exists (for Referee app)
                try {
                  const { data: supabaseMatch } = await supabase
                    .from('matches')
                    .select('id')
                    .eq('external_id', match.seed_key)
                    .maybeSingle()

                  if (supabaseMatch?.id) {
                    const coinTossTeamA = match.coinTossTeamA || 'team1'
                    const homeIsTeamA = coinTossTeamA === 'team1'
                    // Away is Team B if home is Team A, and vice versa
                    const colorKey = homeIsTeamA ? 'team_b_color' : 'team_a_color'
                    const shortKey = homeIsTeamA ? 'team_b_short' : 'team_a_short'
                    const nameKey = homeIsTeamA ? 'team_b_name' : 'team_a_name'

                    await supabase
                      .from('match_live_state')
                      .update({
                        [colorKey]: team2Color,
                        [shortKey]: team2ShortName || generateShortName(finalTeam2Name),
                        [nameKey]: finalTeam2Name?.trim() || '',
                        updated_at: new Date().toISOString()
                      })
                      .eq('match_id', supabaseMatch.id)
                    console.log('[MatchSetup] Synced away team to match_live_state')
                  }
                } catch (err) {
                  console.debug('[MatchSetup] Could not sync away team to match_live_state:', err.message)
                }
              }

              setNoticeModal({ message: t('matchSetup.awaySaved'), type: 'success', syncing: true })

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
                      setNoticeModal({ message: t('matchSetup.awaySynced'), type: 'success' })
                    } else if (attempts >= maxAttempts) {
                      clearInterval(interval)
                      setNoticeModal({ message: t('matchSetup.awaySavedLocal'), type: 'success' })
                    }
                  } catch (err) {
                    clearInterval(interval)
                  }
                }, 500)
              }
              checkSyncStatus()
            }
            setCurrentView('main')
          }}>{t('common.confirm')}</button>
        </div>
        {/* PDF Import Summary Modal - shown immediately after import */}
        {importSummaryModal && importSummaryModal.team === 'team2' && (
          <Modal
            title={t('matchSetup.modals.team2ImportComplete')}
            open={true}
            onClose={() => setImportSummaryModal(null)}
            width={400}
          >
            <div style={{ padding: '20px' }}>
              <div style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>
                  {t('matchSetup.modals.playersCount', { count: importSummaryModal.players })}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                  {t('matchSetup.modals.successfullyImported')}
                </div>
                {importSummaryModal.benchOfficials > 0 && (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                    {importSummaryModal.benchOfficials > 1 ? t('matchSetup.modals.benchOfficialsCountPlural', { count: importSummaryModal.benchOfficials }) : t('matchSetup.modals.benchOfficialsCount', { count: importSummaryModal.benchOfficials })}
                  </div>
                )}
              </div>
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '13px', color: '#eab308', fontWeight: 500, marginBottom: '4px' }}>
                  {t('matchSetup.modals.reviewImportedData')}
                </div>
                <ul style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: '8px 0 0 0', paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li>{t('matchSetup.modals.reviewVerifyDob')}</li>
                  <li>{t('matchSetup.modals.reviewSetCaptain')}</li>
                </ul>
              </div>
              <button
                onClick={() => setImportSummaryModal(null)}
                style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: 600, cursor: 'pointer' }}
              >
                {t('common.ok')}
              </button>
            </div>
          </Modal>
        )}
        {/* Notice Modal - must be rendered in this view since early return prevents main render */}
        {noticeModal && (
          <Modal
            title={noticeModal.syncing ? t('matchSetup.modals.syncing') : noticeModal.type === 'success' ? t('matchSetup.modals.success') : t('matchSetup.modals.notice')}
            open={true}
            onClose={() => !noticeModal.syncing && setNoticeModal(null)}
            width={400}
            hideCloseButton={true}
          >
            <div style={{ padding: '24px', textAlign: 'center' }}>
              {noticeModal.syncing && (
                <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⟳</div>
              )}
              {!noticeModal.syncing && noticeModal.type === 'success' && (
                <div style={{ fontSize: '48px', marginBottom: '16px', color: '#22c55e' }}>✓</div>
              )}
              {!noticeModal.syncing && noticeModal.type === 'error' && (
                <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ef4444' }}>✕</div>
              )}
              <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)', whiteSpace: 'pre-line' }}>
                {noticeModal.message}
              </p>
              {!noticeModal.syncing && (
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => setNoticeModal(null)}
                    style={{
                      padding: '12px 24px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: noticeModal.type === 'success' ? '#22c55e' : noticeModal.type === 'error' ? '#ef4444' : 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* Roster Preview Modal */}
        {rosterPreview && (
          <Modal
            title={t('matchSetup.rosterPreviewTitle')}
            open={true}
            onClose={() => setRosterPreview(null)}
            width={600}
          >
            <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
              {(() => {
                const roster = rosterPreview === 'team1' ? match?.pendingHomeRoster : match?.pendingAwayRoster
                if (!roster) return <p>{t('matchSetup.noRosterFound')}</p>
                return (
                  <>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>
                      {t('matchSetup.playersCount')}: {roster.players?.length || 0}
                    </h3>
                    <div style={{ marginBottom: '16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>#</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.lastName')}</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.firstName')}</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>C</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(roster.players || []).map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                              <td style={{ padding: '6px 8px' }}>{p.number}</td>
                              <td style={{ padding: '6px 8px' }}>{p.lastName || ''}</td>
                              <td style={{ padding: '6px 8px' }}>{p.firstName || ''}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.isCaptain ? 'C' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {roster.bench && roster.bench.length > 0 && (
                      <>
                        <h3 style={{ marginTop: '16px', marginBottom: '12px', fontSize: '16px' }}>
                          {t('matchSetup.benchOfficialsCount')}: {roster.bench.length}
                        </h3>
                        <div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                                <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.role')}</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.lastName')}</th>
                                <th style={{ padding: '8px', textAlign: 'left' }}>{t('rosterSetup.firstName')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roster.bench.map((b, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  <td style={{ padding: '6px 8px' }}>{b.role || ''}</td>
                                  <td style={{ padding: '6px 8px' }}>{b.lastName || ''}</td>
                                  <td style={{ padding: '6px 8px' }}>{b.firstName || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )
              })()}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                <button
                  onClick={() => setRosterPreview(null)}
                  style={{
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Test Roster Confirmation Modal */}
        {testRosterConfirm === 'team2' && (
          <Modal
            title={t('roster.confirmLoadTestRoster')}
            open={true}
            onClose={() => setTestRosterConfirm(null)}
            width={400}
          >
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)' }}>
                {t('roster.confirmLoadTestRosterMessage', { team: TEST_TEAM_2.name })}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    setTeam2Roster([...TEST_TEAM_2.players])
                    setTeam2Bench([])
                    if (!team2Name || team2Name === 'Away') setTeam2Name(TEST_TEAM_2.name)
                    if (!team2ShortName) setTeam2ShortName(TEST_TEAM_2.shortName)
                    setTestRosterConfirm(null)
                  }}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {t('roster.loadTestRoster')}
                </button>
                <button
                  onClick={() => setTestRosterConfirm(null)}
                  className="secondary"
                  style={{ padding: '12px 24px', fontSize: '14px', fontWeight: 600 }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* SignaturePad for away team view */}
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

  const StatusBadge = ({ ready, pending }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: ready ? '#22c55e' : pending ? '#3b82f6' : '#f97316',
        color: ready || pending ? '#fff' : '#0b1120',
        fontWeight: 700,
        fontSize: 12,
        marginRight: 8
      }}
      aria-label={ready ? 'Complete' : pending ? 'Ready to confirm' : 'Incomplete'}
      title={ready ? 'Complete' : pending ? 'Ready to confirm' : 'Incomplete'}
    >
      {ready ? '✓' : pending ? '●' : '!'}
    </span>
  )

  // Sync status indicator for cards - green=synced, yellow=syncing, red=error, gray=not synced
  // Hidden if offline mode
  const SyncStatusIndicator = ({ status, onRetry }) => {
    if (offlineMode) return null

    const colors = {
      synced: { bg: 'rgba(34, 197, 94, 0.2)', border: 'rgba(34, 197, 94, 0.5)', dot: '#22c55e' },
      syncing: { bg: 'rgba(234, 179, 8, 0.2)', border: 'rgba(234, 179, 8, 0.5)', dot: '#eab308' },
      error: { bg: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.5)', dot: '#ef4444' },
      idle: { bg: 'rgba(156, 163, 175, 0.2)', border: 'rgba(156, 163, 175, 0.5)', dot: '#9ca3af' }
    }
    const labels = {
      synced: t('matchSetup.syncStatus.synced', 'Synced'),
      syncing: t('matchSetup.syncStatus.syncing', 'Syncing...'),
      error: t('matchSetup.syncStatus.error', 'Sync Error'),
      idle: isSupabaseAvailable ? t('matchSetup.syncStatus.notSynced') : t('matchSetup.syncStatus.offline', 'Offline')
    }
    const c = colors[status] || colors.synced

    return (
      <div
        onClick={status !== 'synced' && onRetry ? onRetry : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: '4px',
          fontSize: '10px',
          cursor: status !== 'synced' && onRetry ? 'pointer' : 'default',
          transition: 'all 0.2s'
        }}
        title={status !== 'synced' ? t('matchSetup.syncStatus.clickToRetry', 'Click to retry sync') : ''}
      >
        <span style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: c.dot,
          boxShadow: status === 'syncing' ? `0 0 4px 2px ${c.dot}` : 'none'
        }} />
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

  // Sync match data to server (for when Scoreboard is not mounted)
  // If fullSync is true, fetches all data (teams, players, sets, events) from IndexedDB
  const syncMatchToServer = async (matchData, fullSync = false) => {
    const wsUrl = getWebSocketUrl()
    if (!wsUrl) return

    try {
      // For full sync, fetch all data from IndexedDB
      let team1 = null, team2 = null, team1Players = [], team2Players = [], sets = [], events = []

      if (fullSync && matchData) {
        const [fetchedTeam1, fetchedTeam2, fetchedSets, fetchedEvents, fetchedTeam1Players, fetchedTeam2Players] = await Promise.all([
          matchData.team1Id ? db.teams.get(matchData.team1Id) : null,
          matchData.team2Id ? db.teams.get(matchData.team2Id) : null,
          db.sets.where('matchId').equals(matchData.id).toArray(),
          db.events.where('matchId').equals(matchData.id).toArray(),
          matchData.team1Id ? db.players.where('teamId').equals(matchData.team1Id).toArray() : [],
          matchData.team2Id ? db.players.where('teamId').equals(matchData.team2Id).toArray() : []
        ])
        team1 = fetchedTeam1
        team2 = fetchedTeam2
        team1Players = fetchedTeam1Players
        team2Players = fetchedTeam2Players
        sets = fetchedSets
        events = fetchedEvents
      }

      // Create a temporary WebSocket connection to sync the data
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        const syncPayload = {
          type: 'sync-match-data',
          matchId: matchData.id,
          match: matchData,
          team1: team1,
          team2: team2,
          team1Players: team1Players,
          team2Players: team2Players,
          sets: sets,
          events: events,
          _timestamp: Date.now()
        }
        ws.send(JSON.stringify(syncPayload))
        // Close after a short delay to ensure message is sent
        setTimeout(() => ws.close(), 500)
      }

      ws.onerror = () => { }
    } catch (error) {
      console.error('[MatchSetup] Failed to sync to server:', error)
    }
  }

  const handleRefereeConnectionToggle = async (enabled) => {
    if (!matchId) return
    setRefereeConnectionEnabled(enabled)
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
              connection_pins: {
                referee: updatedMatch.refereePin || ''
              }
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })

          // Show syncing modal and poll for completion
          setNoticeModal({ message: 'Syncing to database...', type: 'success', syncing: true })
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

  // Dashboard Toggle Component - two rows: label+toggle on top, PIN below
  const DashboardToggle = ({ label, enabled, onToggle, pin }) => {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px 12px',
        background: enabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        border: enabled ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255,255,255,0.1)',
        minWidth: '100px',
        flex: 1
      }}>
        {/* Row 1: Label and Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: enabled ? '#22c55e' : 'var(--muted)', flex: 1 }}>{label}</span>
          <div style={{
            position: 'relative',
            width: '40px',
            height: '22px',
            background: enabled ? '#22c55e' : '#6b7280',
            borderRadius: '11px',
            transition: 'background 0.2s',
            cursor: 'pointer',
            flexShrink: 0
          }}
            onClick={() => onToggle(!enabled)}
          >
            <div style={{
              position: 'absolute',
              top: '2px',
              left: enabled ? '20px' : '2px',
              width: '18px',
              height: '18px',
              background: '#fff',
              borderRadius: '50%',
              transition: 'left 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
          </div>
        </div>
        {/* Row 2: PIN (only when enabled) */}
        {enabled && pin && (
          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontWeight: 700,
              fontSize: '16px',
              color: 'var(--accent)',
              letterSpacing: '3px',
              fontFamily: 'monospace'
            }}>
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
    } else if (type === 'team1Bench') {
      currentPin = String(match?.team1Pin || '').trim()
    } else if (type === 'team2Bench') {
      currentPin = String(match?.team2Pin || '').trim()
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
      } else if (editPinType === 'team1Bench') {
        updateField = { team1Pin: pinValue }
      } else if (editPinType === 'team2Bench') {
        updateField = { team2Pin: pinValue }
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
    <MatchSetupMainView>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{t('matchSetup.title')}</h2>
          <button
            className="secondary"
            onClick={openScoresheet}
            style={{ padding: '6px 12px', fontSize: '13px', background: '#22c55e', color: '#000' }}
          >
            📄 {t('matchSetup.scoresheet')}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onOpenOptions && (
            <button className="secondary" onClick={onOpenOptions}>
              {t('matchSetup.options')}
            </button>
          )}
        </div>
      </div>
      <div className="setup-cards-grid setup-section">
        {/* Match Info Card */}
        <div className="card" style={!matchInfoConfirmed ? { border: `2px solid ${canConfirmMatchInfo ? '#3b82f6' : '#f59e0b'}` } : {}}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={matchInfoConfirmed} pending={!matchInfoConfirmed && canConfirmMatchInfo} />
                <h3 style={{ margin: 0, background: 'rgba(255, 255, 255, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>{t('matchSetup.matchInfo')}</h3>
              </div>
              <SyncStatusIndicator status={matchInfoSyncStatus} onRetry={() => retrySyncForCard('matchInfo')} />
            </div>
            <div
              className="text-sm"
              style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 8, marginTop: 8 }}
            >
              <span>{t('matchSetup.competitionName')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={league}>{league || t('common.notSet')}</span>
              <span>{t('matchSetup.matchNumber')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gameN || t('common.notSet')}</span>
              <span>{t('matchSetup.date')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDisplayDate(date) || t('common.notSet')}</span>
              <span>{t('matchSetup.time')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDisplayTime(time) || t('common.notSet')}</span>
              <span>{t('matchSetup.site')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={city}>{city || t('common.notSet')}</span>
              <span>{t('matchSetup.court')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{court || t('common.notSet')}</span>
              <span>{t('matchSetup.gender')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type2 === 'men' ? t('matchSetup.men') : t('matchSetup.women')}</span>
              <span>{t('matchSetup.phase')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phase === 'main' ? t('matchSetup.mainDraw') : t('matchSetup.qualification')}</span>
              <span>{t('matchSetup.round')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {round === 'pool' ? t('matchSetup.poolPlay') :
                  round === 'winner' ? t('matchSetup.winnerBracket') :
                    round === 'class' ? t('matchSetup.classificationRound') :
                      round === 'semifinals' ? t('matchSetup.semifinals') :
                        t('matchSetup.finals')}
              </span>
            </div>
          </div>
          <div className="actions">
            {matchInfoConfirmed ? (
              <button className="secondary" onClick={() => setCurrentView('info')}>{t('common.edit')}</button>
            ) : (
              <button
                className="primary"
                onClick={() => setCurrentView('info')}
              >
                {t('matchSetup.createMatch')}
              </button>
            )}
          </div>
        </div>

        {/* Match Officials Card */}
        <div className="card" style={!matchInfoConfirmed ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={officialsConfigured} />
                <h3 style={{ margin: 0, background: 'rgba(255, 255, 255, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>{t('matchSetup.matchOfficials')}</h3>
              </div>
              <SyncStatusIndicator status={officialsSyncStatus} onRetry={() => retrySyncForCard('officials')} />
            </div>
            <div className="text-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 4, columnGap: 8, marginTop: 8 }}>
              <span>{t('matchSetup.referee1')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatOfficial(ref1Last, ref1First)}>{formatOfficial(ref1Last, ref1First)}</span>
              <span>{t('matchSetup.referee2')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatOfficial(ref2Last, ref2First)}>{formatOfficial(ref2Last, ref2First)}</span>
              <span>{t('matchSetup.scorer')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatOfficial(scorerLast, scorerFirst)}>{formatOfficial(scorerLast, scorerFirst)}</span>
              <span>{t('matchSetup.assistantScorer')}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatOfficial(asstLast, asstFirst)}>{formatOfficial(asstLast, asstFirst)}</span>
              {(lineJudge1 || lineJudge2 || lineJudge3 || lineJudge4) && (
                <>
                  <span>{t('matchSetup.lineJudges')}:</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[lineJudge1, lineJudge2, lineJudge3, lineJudge4].filter(Boolean).map(formatLineJudge).join(', ')}>
                    {[lineJudge1, lineJudge2, lineJudge3, lineJudge4].filter(Boolean).map(formatLineJudge).join(', ') || t('common.notSet')}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => setCurrentView('officials')} disabled={!matchInfoConfirmed}>{t('common.edit')}</button>
          </div>
        </div>
      </div>
      {/* Dashboard Connections Row */}
      <div className="setup-section" style={{
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        ...(matchInfoConfirmed ? {} : { opacity: 0.5, pointerEvents: 'none' })
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', textAlign: 'center', alignItems: 'center' }}>{t('matchSetup.dashboards')}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <ConnectionBanner
            team="referee"
            enabled={refereeConnectionEnabled}
            onToggle={handleRefereeConnectionToggle}
            pin={match?.refereePin}
          />
        </div>
      </div>

      <div className="grid-4 setup-section" style={!matchInfoConfirmed ? { opacity: 0.5, pointerEvents: 'none' } : {}}>
        <div className="card" style={{ order: 1 }}>
          {/* Row 1: Status + Team Name + Sync Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusBadge ready={team1Configured} />
              <h1 style={{
                margin: 0,
                background: team1Color,
                color: getContrastColor(team1Color),
                padding: '6px 16px',
                borderRadius: '8px'
              }}>
                {getTeamDisplayName(team1Roster, 'team1', team1Country).toUpperCase()}
              </h1>
            </div>
            <SyncStatusIndicator status={team1SyncStatus} onRetry={() => retrySyncForCard('team1')} />
          </div>

          {/* Row 2: Color selector + Shirt + Roster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 }}>
            <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.selectColour')}</span>
            <div
              className="shirt"
              style={{ background: team1Color, cursor: 'pointer', transform: 'scale(0.85)' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const centerX = rect.left + rect.width / 2
                setColorPickerModal({
                  team: 'team1',
                  position: { x: centerX, y: rect.bottom + 8 }
                })
              }}
            >
              <div className="collar" style={{ background: team1Color }} />
              <div className="number" style={{ color: getContrastColor(team1Color) }}>1</div>
            </div>
            <div style={{ flex: 1 }} />
            <button className="secondary" onClick={() => setCurrentView('team1')}>{t('matchSetup.editRoster')}</button>
          </div>
        </div>

        <div className="card" style={{ order: 2 }}>
          {/* Row 1: Status + Team Name + Sync Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusBadge ready={team2Configured} />
              <h1 style={{
                margin: 0,
                background: team2Color,
                color: getContrastColor(team2Color),
                padding: '6px 16px',
                borderRadius: '8px'
              }}>
                {getTeamDisplayName(team2Roster, 'team2', team2Country).toUpperCase()}
              </h1>
            </div>
            <SyncStatusIndicator status={team2SyncStatus} onRetry={() => retrySyncForCard('team2')} />
          </div>

          {/* Row 2: Color selector + Shirt + Roster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 }}>
            <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>{t('matchSetup.selectColour')}</span>
            <div
              className="shirt"
              style={{ background: team2Color, cursor: 'pointer', transform: 'scale(0.85)' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const centerX = rect.left + rect.width / 2
                setColorPickerModal({
                  team: 'team2',
                  position: { x: centerX, y: rect.bottom + 8 }
                })
              }}
            >
              <div className="collar" style={{ background: team2Color }} />
              <div className="number" style={{ color: getContrastColor(team2Color) }}>1</div>
            </div>
            <div style={{ flex: 1 }} />
            <button className="secondary" onClick={() => setCurrentView('team2')}>{t('matchSetup.editRoster')}</button>
          </div>
        </div>
        {typeof window !== 'undefined' && window.electronAPI?.server && (
          <div className="card" style={{ order: 3 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <StatusBadge ready={serverRunning} />
                  <h3 style={{ margin: 0 }}>Live Server</h3>
                </div>
              </div>
              {serverRunning && serverStatus ? (
                <div style={{ marginTop: 12 }}>
                  <div className="text-sm" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: 8, marginBottom: 2 }}>
                    <span>Status:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>● Running</span>
                    <span>Hostname:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{serverStatus.hostname || 'escoresheet.local'}</span>
                    <span>IP Address:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{serverStatus.localIP}</span>
                    <span>Protocol:</span>
                    <span style={{ textTransform: 'uppercase' }}>{serverStatus.protocol || 'https'}</span>
                  </div>
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.5)',
                    padding: '12px',
                    borderRadius: '8px',
                    marginTop: '12px',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Connection URLs:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace', fontSize: '11px' }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Main:</div>
                        <div style={{ wordBreak: 'break-all' }}>{serverStatus.urls?.mainIP || `${serverStatus.protocol}://${serverStatus.localIP}:${serverStatus.port}/`}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Referee:</div>
                        <div style={{ wordBreak: 'break-all' }}>{serverStatus.urls?.refereeIP || `${serverStatus.protocol}://${serverStatus.localIP}:${serverStatus.port}/referee`}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.6)' }}>WebSocket:</div>
                        <div style={{ wordBreak: 'break-all' }}>{serverStatus.urls?.websocketIP || `${serverStatus.wsProtocol}://${serverStatus.localIP}:${serverStatus.wsPort}`}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: 12 }}>
                    Start the live server to allow referee and livescore apps to connect.
                  </p>
                  {typeof window !== 'undefined' && !window.electronAPI?.server && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.7)',
                      marginTop: '12px'
                    }}>
                      <div style={{ marginBottom: '8px', fontWeight: 600 }}>To start from browser/PWA:</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6' }}>
                        Run: <span style={{ color: '#22c55e', fontWeight: 600 }}>npm run start:prod</span> in terminal
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="actions">
              {serverRunning ? (
                typeof window !== 'undefined' && window.electronAPI?.server ? (
                  <button
                    className="secondary"
                    onClick={handleStopServer}
                    disabled={serverLoading}
                  >
                    {serverLoading ? 'Stopping...' : 'Stop Server'}
                  </button>
                ) : null
              ) : (
                <button
                  className="primary"
                  onClick={handleStartServer}
                  disabled={serverLoading}
                >
                  {typeof window !== 'undefined' && window.electronAPI?.server
                    ? (serverLoading ? 'Starting...' : 'Start Server')
                    : '📋 Copy Start Command'
                  }
                </button>
              )}
            </div>
          </div>
        )}


      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1, alignItems: 'center', ...(matchInfoConfirmed ? {} : { opacity: 0.5, pointerEvents: 'none' }) }}>
        <button
          className="secondary"
          style={{
            background: '#ffe066',
            color: '#222',
            border: '1px solid #ffd700',
            fontWeight: 700
          }}
          onClick={() => setShowBothRosters(!showBothRosters)}
          disabled={!matchInfoConfirmed}
        >
          {showBothRosters ? t('scoreboard.hideRosters') : t('scoreboard.showRosters')}
        </button>
        {isMatchOngoing && onReturn ? (
          <button onClick={onReturn}>{t('scoreboard.returnToMatch')}</button>
        ) : (
          <button
            disabled={!canProceedToCoinToss}
            style={{
              opacity: canProceedToCoinToss ? 1 : 0.5,
              cursor: canProceedToCoinToss ? 'pointer' : 'not-allowed'
            }}
            onClick={async () => {
              // Check if match has no data (no sets, no signatures)
              if (matchId && match) {
                const sets = await db.sets.where('matchId').equals(matchId).toArray()
                const hasNoData = sets.length === 0 && !match.team1CoachSignature && !match.team2CoachSignature

                if (hasNoData) {
                  // Check for existing validation errors
                  if (dateError) {
                    setNoticeModal({ message: `Invalid date: ${dateError}` })
                    return
                  }
                  if (timeError) {
                    setNoticeModal({ message: `Invalid time: ${timeError}` })
                    return
                  }

                  // Validate date/time before going to coin toss
                  let scheduledAt
                  try {
                    scheduledAt = createScheduledAt(date, time, { allowEmpty: false })
                  } catch (err) {
                    setNoticeModal({ message: `Invalid date/time: ${err.message}` })
                    return
                  }

                  // Update match with current data before going to coin toss
                  await db.matches.update(matchId, {
                    hall,
                    city,
                    match_type_2: type2,
                    team1ShortName: team1ShortName || team1Name.substring(0, 10).toUpperCase(),
                    team2ShortName: team2ShortName || team2Name.substring(0, 10).toUpperCase(),
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
                    bench_home: team1Bench,
                    bench_away: team2Bench
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
            }}>{t('matchSetup.coinToss')}</button>
        )}
      </div>

      {showBothRosters && (() => {
        // Keep original order - no sorting
        const team1Players = (team1Roster || [])
        const team2Players = (team2Roster || [])

        // Pad arrays to same length for alignment
        const maxPlayers = Math.max(team1Players.length, team2Players.length)

        const paddedHomePlayers = [...team1Players, ...Array(maxPlayers - team1Players.length).fill(null)]
        const paddedAwayPlayers = [...team2Players, ...Array(maxPlayers - team2Players.length).fill(null)]

        // Bench officials
        const homeBench = (team1Bench || []).filter(b => b.firstName || b.lastName || b.dob)
        const awayBench = (team2Bench || []).filter(b => b.firstName || b.lastName || b.dob)
        const maxBench = Math.max(homeBench.length, awayBench.length)
        const paddedHomeBench = [...homeBench, ...Array(maxBench - homeBench.length).fill(null)]
        const paddedAwayBench = [...awayBench, ...Array(maxBench - awayBench.length).fill(null)]

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
            <div className="panel">
              <h3>{t('roster.titleWithTeam', { team: team1Name || t('common.team1') })}</h3>
              {/* Players Section */}
              <div style={{ marginBottom: 16 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>{t('roster.players')}</strong>
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('roster.name')}</th>
                      <th>{t('roster.dob')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddedHomePlayers.map((player, idx) => (
                      <tr key={player ? `p-${idx}` : `empty-${idx}`}>
                        {player ? (
                          <>
                            <td className="roster-number">
                              <span>{player.number ?? '—'}</span>
                              <span className="roster-role">
                                {player.isCaptain && <span className="roster-badge captain">C</span>}
                              </span>
                            </td>
                            <td className="roster-name">
                              {player.lastName || ''} {player.firstName || ''}
                            </td>
                            <td className="roster-dob">{player.dob || '—'}</td>
                          </>
                        ) : (
                          <td colSpan="3" style={{ height: '36px' }}>&nbsp;</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <h3>{t('roster.titleWithTeam', { team: team2Name || t('common.team2') })}</h3>
              {/* Players Section */}
              <div style={{ marginBottom: 16 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>{t('roster.players')}</strong>
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('roster.name')}</th>
                      <th>{t('roster.dob')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddedAwayPlayers.map((player, idx) => (
                      <tr key={player ? `p-${idx}` : `empty-${idx}`}>
                        {player ? (
                          <>
                            <td className="roster-number">
                              <span>{player.number ?? '—'}</span>
                              <span className="roster-role">
                                {player.isCaptain && <span className="roster-badge captain">C</span>}
                              </span>
                            </td>
                            <td className="roster-name">
                              {player.lastName || ''} {player.firstName || ''}
                            </td>
                            <td className="roster-dob">{player.dob || '—'}</td>
                          </>
                        ) : (
                          <td colSpan="3" style={{ height: '36px' }}>&nbsp;</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Color Picker Bubble Modal */}
      {colorPickerModal && (
        <>
          {/* Backdrop to close on click outside */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => setColorPickerModal(null)}
          />
          {/* Bubble modal */}
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              background: '#1f2937',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              minWidth: '280px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {t('matchSetup.chooseTeamColor', { team: colorPickerModal.team === 'team1' ? t('common.team1') : t('common.team2') })}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px'
              }}
            >
              {teamColors.map((color) => {
                const isSelected = (colorPickerModal.team === 'team1' ? team1Color : team2Color) === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={async () => {
                      const isHome = colorPickerModal.team === 'team1'
                      if (isHome) {
                        setTeam1Color(color)
                      } else {
                        setTeam2Color(color)
                      }
                      setColorPickerModal(null)

                      // Sync color to local DB and Supabase
                      try {
                        // Update local team in IndexedDB
                        const teamId = isHome ? match?.team1Id : match?.team2Id
                        if (teamId) {
                          await db.teams.update(teamId, { color })
                        }

                        // Update local match record in IndexedDB
                        if (match?.id) {
                          const colorField = isHome ? 'team1Color' : 'team2Color'
                          await db.matches.update(match.id, { [colorField]: color })
                          console.log(`[MatchSetup] Updated local match ${colorField}:`, color)
                        }

                        // Sync to Supabase if match exists
                        if (supabase && match?.seed_key) {
                          const teamKey = isHome ? 'team1_data' : 'team2_data'
                          const teamName = isHome ? team1Name : team2Name
                          const shortName = isHome ? team1ShortName : team2ShortName

                          // Update matches table
                          const { data: supabaseMatch } = await supabase
                            .from('matches')
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
                            console.log(`[MatchSetup] Synced ${teamKey} color to Supabase:`, color)
                          }

                          // Also update match_live_state if it exists (for Referee app)
                          if (supabaseMatch?.id) {
                            // Team A = coin toss winner, determine if home is Team A
                            const coinTossTeamA = match.coinTossTeamA || 'team1'
                            const homeIsTeamA = coinTossTeamA === 'team1'
                            // If changing home color and home is Team A -> update team_a_color
                            // If changing home color and home is Team B -> update team_b_color
                            const liveStateColorKey = (isHome === homeIsTeamA) ? 'team_a_color' : 'team_b_color'

                            await supabase
                              .from('match_live_state')
                              .update({ [liveStateColorKey]: color, updated_at: new Date().toISOString() })
                              .eq('match_id', supabaseMatch.id)
                            console.log(`[MatchSetup] Synced ${liveStateColorKey} to match_live_state:`, color)
                          }
                        }
                      } catch (err) {
                        console.warn('[MatchSetup] Failed to sync team color:', err)
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 8px',
                      background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                      border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      minWidth: '60px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                  >
                    <div className="shirt" style={{ background: color, transform: 'scale(0.8)' }}>
                      <div className="collar" style={{ background: color }} />
                      <div className="number" style={{ color: getContrastColor(color) }}>1</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {noticeModal && (
        <Modal
          title={noticeModal.syncing ? t('matchSetup.modals.syncing') : noticeModal.type === 'success' ? t('matchSetup.modals.success') : t('matchSetup.modals.notice')}
          open={true}
          onClose={() => !noticeModal.syncing && setNoticeModal(null)}
          width={400}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {noticeModal.syncing && (
              <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⟳</div>
            )}
            {!noticeModal.syncing && noticeModal.type === 'success' && (
              <div style={{ fontSize: '48px', marginBottom: '16px', color: '#22c55e' }}>✓</div>
            )}
            {!noticeModal.syncing && noticeModal.type === 'error' && (
              <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ef4444' }}>✕</div>
            )}
            <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)' }}>
              {noticeModal.message}
            </p>
            {!noticeModal.syncing && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setNoticeModal(null)}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: noticeModal.type === 'success' ? '#22c55e' : noticeModal.type === 'error' ? '#ef4444' : 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* PDF Import Summary Modal */}
      {importSummaryModal && (
        <Modal
          title={importSummaryModal.team === 'team1' ? t('matchSetup.modals.team1ImportComplete') : t('matchSetup.modals.team2ImportComplete')}
          open={true}
          onClose={() => setImportSummaryModal(null)}
          width={400}
        >
          <div style={{ padding: '20px' }}>
            {/* Success summary */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>
                {t('matchSetup.modals.playersCount', { count: importSummaryModal.players })}
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                {t('matchSetup.modals.successfullyImported')}
              </div>
              {importSummaryModal.benchOfficials > 0 && (
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                  {importSummaryModal.benchOfficials > 1 ? t('matchSetup.modals.benchOfficialsCountPlural', { count: importSummaryModal.benchOfficials }) : t('matchSetup.modals.benchOfficialsCount', { count: importSummaryModal.benchOfficials })}
                </div>
              )}
            </div>

            {/* Errors if any */}
            {importSummaryModal.errors && importSummaryModal.errors.length > 0 && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>
                  {importSummaryModal.errors.length} {importSummaryModal.errors.length > 1 ? t('common.error') + 's' : t('common.error')}
                </div>
                {importSummaryModal.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{err}</div>
                ))}
              </div>
            )}

            {/* Warning */}
            <div style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '13px', color: '#eab308', fontWeight: 500, marginBottom: '4px' }}>
                {t('matchSetup.modals.reviewImportedData')}
              </div>
              <ul style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.7)',
                margin: '8px 0 0 0',
                paddingLeft: '20px',
                lineHeight: '1.6'
              }}>
                <li>{t('matchSetup.modals.reviewVerifyDob')}</li>
                <li>{t('matchSetup.modals.reviewSetCaptain')}</li>
              </ul>
            </div>

            <button
              onClick={() => setImportSummaryModal(null)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {t('common.ok')}
            </button>
          </div>
        </Modal>
      )}

      {/* Match Created Modal - shows Match ID and all PINs for recovery */}
      {matchCreatedModal && (
        <Modal
          title={t('matchSetup.modals.matchCreated')}
          open={true}
          onClose={() => {
            setMatchCreatedModal(null)
            onOpenCoinToss()
          }}
          width={500}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {/* Match ID and Game PIN */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '2px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>
                  {t('matchSetup.modals.matchId')}
                </span>
                <span style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: 'var(--accent)',
                  letterSpacing: '2px'
                }}>
                  {matchCreatedModal.matchId}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>
                  {t('matchSetup.gamePin')}
                </span>
                <span style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: '#22c55e',
                  letterSpacing: '4px'
                }}>
                  {matchCreatedModal.gamePin}
                </span>
              </div>
            </div>

            {/* Connection PINs */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'rgba(255,255,255,0.9)' }}>
                {t('matchSetup.modals.connectionPins')}
              </div>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    {t('matchSetup.refereePinLabel')}
                  </span>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: '#f59e0b',
                    letterSpacing: '2px'
                  }}>
                    {matchCreatedModal.refereePin}
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    {t('matchSetup.homeBenchPinLabel')}
                  </span>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: '#3b82f6',
                    letterSpacing: '2px'
                  }}>
                    {matchCreatedModal.team1Pin}
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    {t('matchSetup.awayBenchPinLabel')}
                  </span>
                  <span style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: '#ef4444',
                    letterSpacing: '2px'
                  }}>
                    {matchCreatedModal.team2Pin}
                  </span>
                </div>
              </div>
            </div>

            <p style={{
              fontSize: '13px',
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '20px',
              lineHeight: 1.5
            }}>
              {t('matchSetup.modals.saveInfoToRecover')}
            </p>
            <button
              onClick={() => {
                setMatchCreatedModal(null)
                onOpenCoinToss()
              }}
              style={{
                padding: '14px 32px',
                fontSize: '16px',
                fontWeight: 600,
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              {t('matchSetup.modals.continueToCoinToss')}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit PIN Modal */}
      {editPinModal && (
        <Modal
          title={editPinType === 'referee' ? t('matchSetup.modals.editRefereePin') : editPinType === 'team1Bench' ? t('matchSetup.modals.editHomeBenchPin') : t('matchSetup.modals.editAwayBenchPin')}
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
                {t('matchSetup.modals.enterNew6DigitPin')}
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

      <SignaturePad
        open={openSignature !== null}
        onClose={() => setOpenSignature(null)}
        onSave={handleSignatureSave}
        title={openSignature === 'team1-coach' ? 'Home Coach Signature' :
          openSignature === 'team1-captain' ? 'Home Captain Signature' :
            openSignature === 'team2-coach' ? 'Away Coach Signature' :
              openSignature === 'team2-captain' ? 'Away Captain Signature' : 'Sign'}
      />
    </MatchSetupMainView>
  )
}

// Shared styles for wider layout and sticking to top
const setupViewStyle = {
  maxWidth: '1200px',
  alignSelf: 'flex-start',
  marginTop: '10px'
}

function MatchSetupMainView({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}

function MatchSetupInfoView({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}

function MatchSetupOfficialsView({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}

function MatchSetupTeam1View({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}

function MatchSetupTeam2View({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}
