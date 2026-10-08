import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { db } from '../db_beach/db_beach'
import { apiFrom } from '../lib_beach/apiClient_beach'
import { setExtId, eventExtId } from '../utils_beach/syncIds_beach'
import { isBackendAvailable, getBackendUrl } from '../utils_beach/backendConfig_beach'
import { cloudSyncWaitNow } from '../utils_beach/cloudStatus_beach'
import SignaturePad from './SignaturePad_beach'
import { saveMatchSignature, signatureFieldOfRole } from '../utils_beach/signatures_beach'
import { phoneSignContext, signatureSourceUpdate, SLOT_OF_ROLE } from '../utils_beach/phoneSignature_beach'
import { relayMatchKey } from '../utils_beach/relayPublisher_beach'
import MenuList from './MenuList_beach'
import CountryFlag from './CountryFlag_beach'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { exportMatchData } from '../utils_beach/backupManager_beach'
import { uploadBackupToCloud, uploadLogsToCloud } from '../utils_beach/logger_beach'
import { uploadScoresheetAsync } from '../utils_beach/scoresheetUploader_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'
import { ArrowLeft, ArrowLeftRight, Check, FileText, Loader2, OctagonX, PenLine, Plus, Search, Trash2 } from 'lucide-react'
import { Volleyball } from '@phosphor-icons/react'
import { cn } from '../ui/volleyui/cn.js'
import { Button, FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { DateField } from '../ui/volleyui/DateField.jsx'
import { Modal as KitModal, modalCancelClass, modalPrimaryClass, modalSaveClass, modalDangerClass } from '../ui/volleyui/Modal.jsx'
import { NOTICE } from '../ui/volleyui/tones.js'

// The coin toss page: one kit page card on the stone page (App_beach paints
// it), full width, in the `.ov-kit` scope.
const COIN_TOSS_VIEW = 'ov-kit w-full min-w-0 self-start mx-auto mt-2.5 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card sm:p-6'
// A sunken section inside the page card (kit Block).
const SETUP_BLOCK = 'rounded-xl border border-stone-200/70 bg-stone-50/60'
// Dialogs sit above the legacy header (z-index 1000), like the legacy
// modals they replace.
const DIALOG_LAYER = { position: 'relative', zIndex: 1000 }
// A 44 px kit field.
const FIELD_INPUT = 'h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-800 placeholder:text-stone-400 focus:border-red-700/40 focus:outline-none focus:ring-2 focus:ring-red-700/20'
const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-stone-700'

// Generate a placeholder signature image (wavy line) for test matches
function generatePlaceholderSignature() {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 60
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 2
  ctx.beginPath()
  const startX = 20
  const startY = 35
  ctx.moveTo(startX, startY)
  for (let x = startX; x < 180; x += 5) {
    ctx.lineTo(x, startY + Math.sin((x - startX) * 0.1) * 8 + (Math.random() - 0.5) * 4)
  }
  ctx.stroke()
  return canvas.toDataURL('image/png')
}

// Helper to generate short name from team name — use full name for beach
function generateShortName(name) {
  if (!name) return ''
  return name.trim().toUpperCase()
}

// Hook to detect if we should use compact sizing
function useCompactMode() {
  const [isCompact, setIsCompact] = useState(() => window.innerHeight < 700 || window.innerWidth < 600)

  useEffect(() => {
    const checkSize = () => {
      setIsCompact(window.innerHeight < 700 || window.innerWidth < 600)
    }
    window.addEventListener('resize', checkSize)
    return () => window.removeEventListener('resize', checkSize)
  }, [])

  return isCompact
}

// Helper function to determine if a color is bright/light
function isBrightColor(color) {
  if (!color || color === 'image.png') return false
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

// Date formatting helpers
function formatDateToDDMMYYYY(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [year, month, day] = parts
  return `${day}.${month}.${year}`
}

function formatDateToISO(dateStr) {
  if (!dateStr) return ''
  // Handle both dot and slash separators (dd.mm.yyyy or dd/mm/yyyy)
  const separator = dateStr.includes('/') ? '/' : '.'
  const parts = dateStr.split(separator)
  if (parts.length !== 3) return dateStr
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// Normalize DOB to dd.mm.yyyy format
function normalizeDob(dob) {
  if (!dob) return ''
  // If already in ISO format (yyyy-mm-dd), convert to dd.mm.yyyy
  if (dob.includes('-') && dob.length === 10 && dob.indexOf('-') === 4) {
    const [year, month, day] = dob.split('-')
    return `${day}.${month}.${year}`
  }
  // If using slashes (dd/mm/yyyy), convert to dots
  if (dob.includes('/')) {
    return dob.replace(/\//g, '.')
  }
  return dob
}

export default function CoinToss({ matchId, onConfirm, onBack }) {
  const { t, i18n } = useTranslation()
  const { showAlert } = useAlert()
  const { vmin } = useScaledLayout()

  // Check if compact mode
  const isCompact = useCompactMode()
  const manageDob = localStorage.getItem('manageDob') === 'true'

  // Responsive sizing
  const sizes = isCompact ? {
    headerFont: '20px',
    teamButtonFont: '13px',
    teamButtonPadding: '8px 12px',
    volleyballSize: '48px',
    rosterButtonFont: '12px',
    rosterButtonPadding: '6px 12px',
    signButtonFont: '12px',
    signButtonPadding: '6px 12px',
    confirmButtonFont: '14px',
    confirmButtonPadding: '12px 24px',
    switchButtonFont: '11px',
    switchButtonPadding: '6px 10px',
    gap: 12,
    marginBottom: 24
  } : {
    headerFont: '28px',
    teamButtonFont: '18px',
    teamButtonPadding: '12px 20px',
    volleyballSize: '72px',
    rosterButtonFont: '16px',
    rosterButtonPadding: '10px 20px',
    signButtonFont: '16px',
    signButtonPadding: '10px 20px',
    confirmButtonFont: '18px',
    confirmButtonPadding: '16px 32px',
    switchButtonFont: '14px',
    switchButtonPadding: '10px 16px',
    gap: 20,
    marginBottom: 32
  }

  // Team info state (loaded from DB)
  const [team1Name, setTeam1Name] = useState('Team 1')
  const [team2Name, setTeam2Name] = useState('Team 2')
  const [team1ShortName, setTeam1ShortName] = useState('')
  const [team2ShortName, setTeam2ShortName] = useState('')
  // Colors loaded from team entities
  const [team1ColorState, setTeam1ColorState] = useState(null)
  const [team2ColorState, setTeam2ColorState] = useState(null)

  // Rosters
  const [team1Roster, setTeam1Roster] = useState([])
  const [team2Roster, setTeam2Roster] = useState([])

  // Add player form state
  const [team1Num, setTeam1Num] = useState('')
  const [team1First, setTeam1First] = useState('')
  const [team1Last, setTeam1Last] = useState('')
  const [team1Dob, setTeam1Dob] = useState('')
  const [team1Captain, setTeam1CaptainBool] = useState(false)
  const [team2Num, setTeam2Num] = useState('')
  const [team2First, setTeam2First] = useState('')
  const [team2Last, setTeam2Last] = useState('')
  const [team2Dob, setTeam2Dob] = useState('')
  const [team2Captain, setTeam2CaptainBool] = useState(false)

  // Coin toss state
  const [teamA, setTeamA] = useState('team1')
  const [teamB, setTeamB] = useState('team2')
  const [serveA, setServeA] = useState(true)
  const [serveB, setServeB] = useState(false)
  const [coinTossWinner, setCoinTossWinner] = useState('team1') // Which team won the coin toss

  // First serve player within each team (beach volleyball)
  const [team1FirstServe, setTeam1FirstServe] = useState(null) // player number
  const [team2FirstServe, setTeam2FirstServe] = useState(null) // player number

  // UI state
  const [rosterModal, setRosterModal] = useState(null) // 'teamA' | 'teamB' | null
  const [orderSignatureModal, setOrderSignatureModal] = useState(null) // 'teamA' | 'teamB' | null
  const [addPlayerModal, setAddPlayerModal] = useState(null)
  const [deletePlayerModal, setDeletePlayerModal] = useState(null)
  const [noticeModal, setNoticeModal] = useState(null)
  const [initModal, setInitModal] = useState(null) // { status: 'syncing' | 'verifying' | 'success' | 'error', message: string }
  const [openSignature, setOpenSignature] = useState(null)
  const [birthdateConfirmModal, setBirthdateConfirmModal] = useState(null) // { suspiciousDates: [], onConfirm: fn }
  const [rosterModalSignature, setRosterModalSignature] = useState(null) // 'captain' | null - for signing within roster modal (beach volleyball: captain only)
  const [forfaitModal, setForfaitModal] = useState(false) // show forfait team selection
  const [forfaitConfirmModal, setForfaitConfirmModal] = useState(null) // 'team1' | 'team2' - confirm which team forfeits
  const [forfaitTypeModal, setForfaitTypeModal] = useState(null) // 'team1' | 'team2' - select forfait reason
  const [forfaitType, setForfaitType] = useState('no_show') // 'no_show' | 'injury'
  const [forfaitPlayerNumber, setForfaitPlayerNumber] = useState('')

  // Track original roster data when modal opens for change detection
  const originalRosterDataRef = useRef(null) // { roster: [] }

  // Signatures (beach volleyball: captain only, plus coach when enabled)
  const [team1CaptainSignature, setTeam1CaptainSignature] = useState(null)
  const [team2CaptainSignature, setTeam2CaptainSignature] = useState(null)
  const [team1CoachSignature, setTeam1CoachSignature] = useState(null)
  const [team2CoachSignature, setTeam2CoachSignature] = useState(null)
  const [savedSignatures, setSavedSignatures] = useState({
    team1Captain: null, team2Captain: null, team1Coach: null, team2Coach: null
  })

  // Helper function to compare roster for changes
  const hasRosterChanges = (originalRoster, currentRoster) => {
    if (!originalRoster) return false
    if (originalRoster.length !== currentRoster.length) return true

    // Compare each player
    for (let i = 0; i < originalRoster.length; i++) {
      const orig = originalRoster[i]
      const curr = currentRoster[i]
      if (orig.number !== curr.number || orig.firstName !== curr.firstName ||
        orig.lastName !== curr.lastName || orig.dob !== curr.dob ||
        orig.isCaptain !== curr.isCaptain) {
        return true
      }
    }

    return false
  }

  // Sync roster changes to database
  const syncRosterToDatabase = async (teamType, roster) => {
    if (!match) return

    const teamId = teamType === 'team1' ? match.team1Id : match.team2Id
    if (!teamId) return

    try {
      await db.transaction('rw', db.players, db.matches, db.sync_queue, async () => {
        // Get existing players
        const existingPlayers = await db.players.where('teamId').equals(teamId).toArray()

        // Update or add players
        for (const player of roster) {
          const existingPlayer = existingPlayers.find(ep =>
            ep.number === player.number ||
            (ep.lastName === player.lastName && ep.firstName === player.firstName)
          )

          if (existingPlayer) {
            await db.players.update(existingPlayer.id, {
              number: player.number,
              firstName: player.firstName,
              lastName: player.lastName,
              dob: player.dob,
              isCaptain: player.isCaptain
            })
          } else {
            await db.players.add({
              teamId,
              number: player.number,
              firstName: player.firstName,
              lastName: player.lastName,
              dob: player.dob,
              isCaptain: player.isCaptain || false
            })
          }
        }

        // Delete players that are no longer in roster
        for (const ep of existingPlayers) {
          const stillExists = roster.some(p =>
            p.number === ep.number ||
            (p.lastName === ep.lastName && p.firstName === ep.firstName)
          )
          if (!stillExists) {
            await db.players.delete(ep.id)
          }
        }
      })


      // Also sync to Supabase if match has seed_key
      if (isBackendAvailable() && match.seed_key) {
        try {
          const isTeam1 = teamType === 'team1'
          const teamKey = isTeam1 ? 'team1' : 'team2'
          const playersKey = isTeam1 ? 'players_team1' : 'players_team2'
          const teamName = isTeam1 ? team1Name : team2Name
          const shortName = isTeam1 ? team1ShortName : team2ShortName
          const color = isTeam1 ? team1Color : team2Color

          // Update matches table
          const { data: supabaseMatch } = await apiFrom('matches')
            .update({
              [teamKey]: {
                name: teamName?.trim() || '',
                short_name: shortName || generateShortName(teamName),
                color: color
              },
              [playersKey]: roster.map(p => ({
                number: p.number || null,
                first_name: p.firstName || '',
                last_name: p.lastName || '',
                dob: p.dob || null,
                is_captain: !!p.isCaptain
              }))
            })
            .eq('external_id', match.seed_key)
            .select('id')
            .single()


          // Also update match_live_state if it exists (just team info, not deprecated columns)
          if (supabaseMatch?.id) {
            const coinTossTeamA = match.coinTossTeamA || 'team1'
            const team1IsTeamA = coinTossTeamA === 'team1'
            // Determine if this team is Team A or Team B
            const isTeamA = (isTeam1 && team1IsTeamA) || (!isTeam1 && !team1IsTeamA)
            const colorLiveKey = isTeamA ? 'team_a_color' : 'team_b_color'
            const shortLiveKey = isTeamA ? 'team_a_short' : 'team_b_short'
            const nameLiveKey = isTeamA ? 'team_a_name' : 'team_b_name'

            await apiFrom('match_live_state')
              .update({
                [colorLiveKey]: color,
                [shortLiveKey]: shortName || generateShortName(teamName),
                [nameLiveKey]: teamName?.trim() || '',
                updated_at: new Date().toISOString()
              })
              .eq('match_id', supabaseMatch.id)

          }
        } catch (supabaseErr) {
          console.warn('[CoinToss] Failed to sync roster to Supabase:', supabaseErr)
        }
      }
    } catch (error) {
      console.error('[CoinToss] Failed to sync roster:', error)
    }
  }

  // Load match data
  const match = useLiveQuery(async () => {
    if (!matchId) return null
    try {
      return await db.matches.get(matchId)
    } catch (error) {
      console.error('Unable to load match', error)
      return null
    }
  }, [matchId])

  // Colors are derived from match or team entities (loaded in useEffect)
  // Priority: state (loaded from team) > match.team1Color > default
  const team1Color = team1ColorState || match?.team1Color || '#ef4444'
  const team2Color = team2ColorState || match?.team2Color || '#3b82f6'

  // Check if coin toss was previously confirmed
  // Use the dedicated coinTossConfirmed field instead of signature comparison
  // This prevents false positives when signatures were already set in MatchSetup
  const isCoinTossConfirmed = useMemo(() => {
    return !!match?.coinTossConfirmed
  }, [match?.coinTossConfirmed])

  // Load initial data from DB
  useEffect(() => {
    if (!matchId || !match) return

    async function loadData() {
      try {
        // Load teams
        const [team1Data, team2Data] = await Promise.all([
          match.team1Id ? db.teams.get(match.team1Id) : null,
          match.team2Id ? db.teams.get(match.team2Id) : null
        ])

        // Store shortNames from team data (will be used as fallback)
        const team1StoredShortName = team1Data?.shortName || match.team1ShortName || ''
        const team2StoredShortName = team2Data?.shortName || match.team2ShortName || ''
        setTeam1ShortName(team1StoredShortName)
        setTeam2ShortName(team2StoredShortName)

        // Store colors from team data (to override defaults)
        if (team1Data?.color) setTeam1ColorState(team1Data.color)
        if (team2Data?.color) setTeam2ColorState(team2Data.color)

        // Load rosters
        const [team1Players, team2Players] = await Promise.all([
          match.team1Id ? db.players.where('teamId').equals(match.team1Id).toArray() : [],
          match.team2Id ? db.players.where('teamId').equals(match.team2Id).toArray() : []
        ])

        // Helper to generate beach volleyball team name from players: "LastName1/LastName2 (COUNTRY)"
        const toTitleCase = (str) => str ? str.replace(/(^|[\s-])(\S)/g, (m, pre, c) => pre + c.toUpperCase()) : ''
        const generateBeachTeamName = (players, country) => {
          if (!players || players.length === 0) return null
          const sorted = [...players].sort((a, b) => (a.number || 999) - (b.number || 999))
          const lastNames = sorted.map(p => toTitleCase(p.lastName || '')).filter(n => n)
          if (lastNames.length === 0) return null
          const namesPart = lastNames.join(' / ')
          return country ? `${namesPart} (${country.toUpperCase()})` : namesPart
        }

        if (team1Players.length) {
          const sortedTeam1 = team1Players.map(p => ({
            number: p.number,
            lastName: p.lastName || (p.name ? p.name.split(' ')[0] : ''),
            firstName: p.firstName || (p.name ? p.name.split(' ').slice(1).join(' ') : ''),
            dob: normalizeDob(p.dob) || '',
            isCaptain: p.isCaptain || false
          })).sort((a, b) => (a.number || 999) - (b.number || 999))
          setTeam1Roster(sortedTeam1)
          // Generate team name from player last names
          const generatedName = generateBeachTeamName(sortedTeam1, match.team1Country)
          setTeam1Name(generatedName || team1Data?.name || 'Team 1')
          // Default first serve to player 1 (or first player's number)
          const player1 = sortedTeam1.find(p => p.number === 1) || sortedTeam1[0]
          if (player1) setTeam1FirstServe(player1.number)
        } else {
          setTeam1Name(team1Data?.name || 'Team 1')
        }

        if (team2Players.length) {
          const sortedTeam2 = team2Players.map(p => ({
            number: p.number,
            lastName: p.lastName || (p.name ? p.name.split(' ')[0] : ''),
            firstName: p.firstName || (p.name ? p.name.split(' ').slice(1).join(' ') : ''),
            dob: normalizeDob(p.dob) || '',
            isCaptain: p.isCaptain || false
          })).sort((a, b) => (a.number || 999) - (b.number || 999))
          setTeam2Roster(sortedTeam2)
          // Generate team name from player last names
          const generatedName = generateBeachTeamName(sortedTeam2, match.team2Country)
          setTeam2Name(generatedName || team2Data?.name || 'Team 2')
          // Default first serve to player 1 (or first player's number)
          const player1 = sortedTeam2.find(p => p.number === 1) || sortedTeam2[0]
          if (player1) setTeam2FirstServe(player1.number)
        } else {
          setTeam2Name(team2Data?.name || 'Team 2')
        }

        // Load coin toss data if previously saved
        if (match.coinTossTeamA !== undefined && match.coinTossTeamB !== undefined) {
          setTeamA(match.coinTossTeamA)
          setTeamB(match.coinTossTeamB)
          setServeA(match.coinTossServeA !== undefined ? match.coinTossServeA : true)
          setServeB(match.coinTossServeB !== undefined ? match.coinTossServeB : false)
        }
        // Load coin toss winner if previously saved
        if (match.coinTossWinner) {
          setCoinTossWinner(match.coinTossWinner)
        }

        // Load signatures
        if (match.team1CaptainSignature) {
          setTeam1CaptainSignature(match.team1CaptainSignature)
          setSavedSignatures(prev => ({ ...prev, team1Captain: match.team1CaptainSignature }))
        }
        if (match.team2CaptainSignature) {
          setTeam2CaptainSignature(match.team2CaptainSignature)
          setSavedSignatures(prev => ({ ...prev, team2Captain: match.team2CaptainSignature }))
        }
        // Load coach signatures
        if (match.team1CoachSignature) {
          setTeam1CoachSignature(match.team1CoachSignature)
          setSavedSignatures(prev => ({ ...prev, team1Coach: match.team1CoachSignature }))
        }
        if (match.team2CoachSignature) {
          setTeam2CoachSignature(match.team2CoachSignature)
          setSavedSignatures(prev => ({ ...prev, team2Coach: match.team2CoachSignature }))
        }

        // Pre-fill placeholder signatures for test matches
        if (match.test) {
          if (!match.team1CaptainSignature) {
            const sig = generatePlaceholderSignature()
            setTeam1CaptainSignature(sig)
            setSavedSignatures(prev => ({ ...prev, team1Captain: sig }))
          }
          if (!match.team2CaptainSignature) {
            const sig = generatePlaceholderSignature()
            setTeam2CaptainSignature(sig)
            setSavedSignatures(prev => ({ ...prev, team2Captain: sig }))
          }
          // Placeholder coach signatures for test matches
          if (match.hasCoach) {
            if (!match.team1CoachSignature) {
              const sig = generatePlaceholderSignature()
              setTeam1CoachSignature(sig)
              setSavedSignatures(prev => ({ ...prev, team1Coach: sig }))
            }
            if (!match.team2CoachSignature) {
              const sig = generatePlaceholderSignature()
              setTeam2CoachSignature(sig)
              setSavedSignatures(prev => ({ ...prev, team2Coach: sig }))
            }
          }
        }
      } catch (error) {
        console.error('Error loading coin toss data:', error)
      }
    }

    loadData()
  }, [matchId, match?.id])

  function switchTeams() {
    const temp = teamA
    setTeamA(teamB)
    setTeamB(temp)
  }

  function switchServe() {
    setServeA(!serveA)
    setServeB(!serveB)
  }

  // A coin toss pad (captain or coach of team 1 / 2) and its image's source:
  // drawn here, or signed on a phone (OpenVolley d451686d)
  function saveCoinTossSignature(role, signatureImage, meta) {
    const field = signatureFieldOfRole(role)
    return saveMatchSignature(db, matchId, field, signatureImage, field ? signatureSourceUpdate(field, signatureImage, meta) : null)
  }

  // "Sign on phone" for a coin toss pad: the slot, the relay's key of the
  // match, its game PIN (another device than the relay host proves it) and
  // what the phone page shows
  function phoneSignFor(role) {
    if (!role || !match) return null
    const captainOf = (roster) => roster.find(p => p.isCaptain) || null
    return {
      slot: SLOT_OF_ROLE[role],
      matchKey: relayMatchKey(match),
      gamePin: match.gamePin || null,
      context: phoneSignContext({
        match,
        slot: SLOT_OF_ROLE[role],
        team1: team1Name,
        team2: team2Name,
        team1Captain: captainOf(team1Roster),
        team2Captain: captainOf(team2Roster),
        lang: i18n?.language,
        fallbackTeam1: t('common.team1'),
        fallbackTeam2: t('common.team2')
      })
    }
  }

  function handleSignatureSave(signatureImage, meta) {
    // Saved to the match at once, not on "Confirm coin toss result": a reload
    // no longer loses it (OpenVolley 703cfa9c)
    saveCoinTossSignature(openSignature, signatureImage, meta)
    if (openSignature === 'team1-captain') {
      setTeam1CaptainSignature(signatureImage)
    } else if (openSignature === 'team2-captain') {
      setTeam2CaptainSignature(signatureImage)
    } else if (openSignature === 'team1-coach') {
      setTeam1CoachSignature(signatureImage)
    } else if (openSignature === 'team2-coach') {
      setTeam2CoachSignature(signatureImage)
    }
    setOpenSignature(null)
  }

  // Handle forfait from coin toss (team doesn't show up or injury before match)
  async function handleForfait(forfaitTeam) {
    if (!matchId || !match) return

    const winnerTeam = forfaitTeam === 'team1' ? 'team2' : 'team1'
    const forfaitTeamName = forfaitTeam === 'team1' ? team1Name : team2Name

    // Generate FIVB-format remark based on forfait type
    let remarksText = ''
    if (forfaitType === 'injury') {
      const playerNum = forfaitPlayerNumber || '...'
      remarksText = `Team ${forfaitTeamName} forfeits the match due to injury (injury as confirmed by the official medical personnel) of player # ${playerNum}. Appropriate official medical personnel came to the court. Both teams and players were present`
    } else {
      remarksText = `Team ${forfaitTeamName} forfeits the match due to no show`
    }

    try {
      await db.transaction('rw', db.matches, db.sets, db.events, db.sync_queue, async () => {
        // Create 2 sets awarded to the winner (21-0, 21-0)
        for (let setIndex = 1; setIndex <= 2; setIndex++) {
          const existingSet = await db.sets.where({ matchId }).and(s => s.index === setIndex).first()
          const setData = {
            matchId,
            index: setIndex,
            finished: true,
            team1Points: winnerTeam === 'team1' ? 21 : 0,
            team2Points: winnerTeam === 'team2' ? 21 : 0,
            reason: 'forfait'
          }
          if (existingSet) {
            await db.sets.update(existingSet.id, setData)
          } else {
            await db.sets.add(setData)
          }
        }

        // Log forfait event
        await db.events.add({
          matchId,
          setIndex: 1,
          type: 'forfait',
          payload: {
            team: forfaitTeam,
            reason: forfaitType,
            scope: 'match',
            playerNumber: forfaitType === 'injury' ? forfaitPlayerNumber : undefined
          },
          ts: new Date().toISOString(),
          seq: 0
        })

        // Save coin toss data + forfait flags + remarks
        const firstServeTeam = serveA ? teamA : teamB
        await db.matches.update(matchId, {
          // Coin toss data (so PDF results table renders correctly)
          coinTossTeamA: teamA,
          coinTossTeamB: teamB,
          coinTossServeA: serveA,
          coinTossServeB: serveB,
          coinTossWinner: coinTossWinner,
          coinTossConfirmed: true,
          firstServe: firstServeTeam,
          team1Color,
          team2Color,
          // Forfait flags
          status: 'ended',
          forfait: true,
          forfaitTeam: forfaitTeam,
          forfaitType: forfaitType,
          // FIVB remarks
          remarks: remarksText
        })

        // Sync to Supabase if match has seed_key
        if (match.seed_key) {
          await db.sync_queue.add({
            resource: 'match',
            action: 'update',
            payload: {
              id: match.seed_key,
              status: 'ended',
              forfait: true,
              forfait_team: forfaitTeam
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })
        }
      })

      setForfaitConfirmModal(null)
      setForfaitModal(false)
      setForfaitType('no_show')
      setForfaitPlayerNumber('')
      // Navigate to match end
      onConfirm(matchId)
    } catch (error) {
      console.error('[CoinToss] Forfait error:', error)
      showAlert('Failed to process forfait', 'error')
    }
  }

  // Execute coin toss after all validations pass
  async function proceedWithCoinToss() {

    if (!matchId) {
      console.error('[CoinToss] No match ID available')
      setNoticeModal({ message: t('validation.noMatchId') })
      return
    }

    const matchData = await db.matches.get(matchId)
    if (!matchData) return

    const firstServeTeam = serveA ? teamA : teamB

    await db.transaction('rw', db.matches, db.players, db.sync_queue, db.events, db.teams, async () => {
      // Build update object
      const updateData = {
        firstServe: firstServeTeam,
        team1FirstServePlayer: team1FirstServe,
        team2FirstServePlayer: team2FirstServe,
        team1FirstServe: team1FirstServe,
        team2FirstServe: team2FirstServe,
        coinTossTeamA: teamA,
        coinTossTeamB: teamB,
        coinTossServeA: serveA,
        coinTossServeB: serveB,
        coinTossWinner: coinTossWinner,  // Which team won the coin toss
        coinTossConfirmed: true,  // Mark coin toss as confirmed
        team1Color,
        team2Color
      }

      // Save signatures (use placeholders for test matches)
      if (!match?.test) {
        updateData.team1CaptainSignature = team1CaptainSignature
        updateData.team2CaptainSignature = team2CaptainSignature
        if (match?.hasCoach) {
          updateData.team1CoachSignature = team1CoachSignature
          updateData.team2CoachSignature = team2CoachSignature
        }
      } else {
        updateData.team1CaptainSignature = team1CaptainSignature || generatePlaceholderSignature()
        updateData.team2CaptainSignature = team2CaptainSignature || generatePlaceholderSignature()
        if (match?.hasCoach) {
          updateData.team1CoachSignature = team1CoachSignature || generatePlaceholderSignature()
          updateData.team2CoachSignature = team2CoachSignature || generatePlaceholderSignature()
        }
      }

      await db.matches.update(matchId, updateData)

      // Check if coin toss event already exists
      const existingCoinTossEvent = await db.events
        .where('matchId').equals(matchId)
        .and(e => e.type === 'coin_toss')
        .first()

      // Create coin_toss event if it doesn't exist (its local id names the
      // cloud row: `${seed_key}:e:${id}`)
      let coinTossEventId = existingCoinTossEvent?.id ?? null
      if (!existingCoinTossEvent) {
        coinTossEventId = await db.events.add({
          matchId: matchId,
          setIndex: 1,
          type: 'coin_toss',
          payload: {
            teamA: teamA,
            teamB: teamB,
            serveA: serveA,
            serveB: serveB,
            firstServe: firstServeTeam,
            coinTossWinner: coinTossWinner
          },
          ts: new Date().toISOString(),
          seq: 1
        })
      }

      // Add coin_toss event to sync queue (only if match has seed_key)
      if (match?.seed_key) {
        // We need to re-fetch the event to get the exact TS and payload if needed, 
        // but since we just constructed it or verified it exists, we can reconstruct the payload for sync.
        // Sync payload structure must match what Scoreboard.jsx uses (snake_case generally for properties if needed, 
        // essentially satisfying the 'events' table schema).
        // The events table takes a JSONB payload.

        await db.sync_queue.add({
          resource: 'event',
          action: 'insert',
          payload: {
            // Scoped to the match (the backend refuses ids without the match key
            // as prefix); the old 'coin_toss_<seed>' id is rewritten by db v18
            external_id: coinTossEventId != null ? eventExtId(match.seed_key, coinTossEventId) : `${match.seed_key}:e:coin_toss`,
            match_id: match.seed_key,
            set_index: 1,
            type: 'coin_toss',
            payload: {
              teamA: teamA,
              teamB: teamB,
              serveA: serveA,
              serveB: serveB,
              firstServe: firstServeTeam,
              coinTossWinner: coinTossWinner
            },
            seq: 1,
            test: !!match?.test,
            created_at: new Date().toISOString()
          },
          ts: Date.now(),
          status: 'queued'
        })
      }

      // Add match update to sync queue (only if match has seed_key)
      const updatedMatch = await db.matches.get(matchId)
      if (updatedMatch?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: updatedMatch.seed_key, // Use seed_key (external_id) for Supabase lookup
            status: 'live', // Set status to live after coin toss is confirmed
            current_set: 1, // Match starts at set 1
            // JSONB columns only
            coin_toss: {
              team_a: teamA,
              team_b: teamB,
              serve_a: serveA,
              confirmed: true,
              first_serve: firstServeTeam,
              winner: coinTossWinner,
              team1_first_serve: team1FirstServe || null,
              team2_first_serve: team2FirstServe || null
            },
            team1: { name: team1Name, short_name: team1ShortName || generateShortName(team1Name), color: team1Color },
            team2: { name: team2Name, short_name: team2ShortName || generateShortName(team2Name), color: team2Color },
            players_team1: team1Roster.map(p => ({
              number: p.number,
              first_name: p.firstName,
              last_name: p.lastName,
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            players_team2: team2Roster.map(p => ({
              number: p.number,
              first_name: p.firstName,
              last_name: p.lastName,
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            officials: updatedMatch.officials || []
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      // Update players for team 1
      if (matchData.team1Id && team1Roster.length) {
        const existingPlayers = await db.players.where('teamId').equals(matchData.team1Id).toArray()

        for (const p of team1Roster) {
          const existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          if (existingPlayer) {
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain
            })
          } else {
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

        // Delete removed players
        const rosterNumbers = new Set(team1Roster.map(p => p.number))
        for (const ep of existingPlayers) {
          if (!rosterNumbers.has(ep.number)) {
            await db.players.delete(ep.id)
          }
        }
      }

      // Update players for team 2
      if (matchData.team2Id && team2Roster.length) {
        const existingPlayers = await db.players.where('teamId').equals(matchData.team2Id).toArray()

        for (const p of team2Roster) {
          const existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          if (existingPlayer) {
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              dob: p.dob || null,
              isCaptain: !!p.isCaptain
            })
          } else {
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

        // Delete removed players
        const rosterNumbers = new Set(team2Roster.map(p => p.number))
        for (const ep of existingPlayers) {
          if (!rosterNumbers.has(ep.number)) {
            await db.players.delete(ep.id)
          }
        }
      }
    })

    // Create first set
    const firstSetId = await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false })

    const isTest = match?.test || false

    // Add first set to sync queue (only for official matches)
    if (!isTest && match?.seed_key) {
      await db.sync_queue.add({
        resource: 'set',
        action: 'insert',
        payload: {
          external_id: setExtId(match.seed_key, firstSetId),
          match_id: match.seed_key, // Use seed_key (external_id) for Supabase lookup
          index: 1,
          team1_points: 0,
          team2_points: 0,
          finished: false,
          start_time: new Date().toISOString()
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })
    }

    // Update match status to 'live' and set current_set to 1
    await db.matches.update(matchId, { status: 'live', current_set: 1 })

    // Sync match status to Supabase (including officials, signatures, and referee connection info)
    // Only sync if match has seed_key (for Supabase lookup)
    if (match?.seed_key) {
      await db.sync_queue.add({
        resource: 'match',
        action: 'update',
        payload: {
          id: match.seed_key, // Use seed_key (external_id) for Supabase lookup
          status: 'live',
          current_set: 1, // Match starts at set 1
          // Officials as JSONB
          officials: match?.officials || [],
          // Connections JSONB - include referee settings
          connections: {
            referee_enabled: match?.refereeConnectionEnabled === true
          },
          // Signatures JSONB
          signatures: !match?.test ? {
            team1_captain: team1CaptainSignature || '',
            team2_captain: team2CaptainSignature || '',
            ...(match?.hasCoach ? {
              team1_coach: team1CoachSignature || '',
              team2_coach: team2CoachSignature || ''
            } : {})
          } : {}
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })
    }

    // Create initial match_live_state entry for Referee app (only for official matches with Supabase)
    // A/B Model: Team A = coin toss winner (constant), side_a = which side they're on
    if (!isTest && isBackendAvailable() && match?.seed_key) {
      try {
        // First get the Supabase match UUID from external_id
        const { data: supabaseMatch, error: lookupError } = await apiFrom('matches')
          .select('id')
          .eq('external_id', match.seed_key)
          .maybeSingle()

        if (!lookupError && supabaseMatch?.id) {
          // Team A = coin toss winner, Team B = other team
          const teamAName = teamA === 'team1' ? team1Name : team2Name
          const teamBName = teamA === 'team1' ? team2Name : team1Name
          const teamAShort = teamA === 'team1' ? team1ShortName : team2ShortName
          const teamBShort = teamA === 'team1' ? team2ShortName : team1ShortName
          const teamAColor = teamA === 'team1' ? team1Color : team2Color
          const teamBColor = teamA === 'team1' ? team2Color : team1Color

          // Serving info (same logic as BroadcastChannel below)
          const servingSide = serveA ? 'left' : 'right'
          const firstServeTeam = serveA ? teamA : teamB
          const serverNum = firstServeTeam === 'team1' ? team1FirstServe : team2FirstServe

          // Build initial lineups
          // First-serving team: positions I (first server) and III (second server)
          // Second-serving team: positions II (first server) and IV (second server)
          const teamARoster = teamA === 'team1' ? team1Roster : team2Roster
          const teamBRoster = teamA === 'team1' ? team2Roster : team1Roster
          const teamAFirstServe = teamA === 'team1' ? team1FirstServe : team2FirstServe
          const teamBFirstServe = teamA === 'team1' ? team2FirstServe : team1FirstServe
          const teamAServesFirst = firstServeTeam === teamA
          const teamBServesFirst = firstServeTeam === teamB

          const buildInitialLineup = (roster, firstServeNum, thisTeamServesFirst) => {
            if (!roster || roster.length < 2 || !firstServeNum) return null
            const otherPlayer = roster.find(p => p.number !== firstServeNum)
            if (!otherPlayer) return null
            const pos1 = thisTeamServesFirst ? 'I' : 'II'
            const pos2 = thisTeamServesFirst ? 'III' : 'IV'
            return {
              [pos1]: { number: Number(firstServeNum), isCaptain: !!roster.find(p => p.number === firstServeNum)?.isCaptain, isCourtCaptain: false, hasSanction: false },
              [pos2]: { number: Number(otherPlayer.number), isCaptain: !!otherPlayer.isCaptain, isCourtCaptain: false, hasSanction: false }
            }
          }

          const { error: insertError } = await apiFrom('match_live_state')
            .upsert({
              match_id: supabaseMatch.id,
              current_set: 1,
              // Team info (constant throughout match)
              team_a_name: teamAName,
              team_a_short: teamAShort || teamAName?.substring(0, 3).toUpperCase(),
              team_a_color: teamAColor || '#ef4444',
              team_b_name: teamBName,
              team_b_short: teamBShort || teamBName?.substring(0, 3).toUpperCase(),
              team_b_color: teamBColor || '#3b82f6',
              // Scores
              sets_won_a: 0,
              sets_won_b: 0,
              points_a: 0,
              points_b: 0,
              // Side (Team A always on left in Set 1)
              side_a: 'left',
              // Serving info
              serving_team: servingSide,
              ...(serverNum ? { server_number: Number(serverNum) } : {}),
              // Initial lineups (first-serving team: I/III, second-serving: II/IV)
              lineup_a: buildInitialLineup(teamARoster, teamAFirstServe, teamAServesFirst),
              lineup_b: buildInitialLineup(teamBRoster, teamBFirstServe, teamBServesFirst),
              // Stats
              timeouts_a: 0,
              timeouts_b: 0,
              challenges_used_a: 0,
              challenges_used_b: 0,
              timeout_active: false,
              set_interval_active: false,
              sport_type: 'beach',
              match_status: 'starting',
              // Match metadata
              game_n: match.gameN || match.game_n || null,
              league: match.league || null,
              gender: match.match_type_2 || null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'match_id' })

          if (insertError) {
            console.warn('[CoinToss] Failed to create initial match_live_state:', insertError)
          } else {
          }
        }
      } catch (err) {
        console.warn('[CoinToss] Error creating match_live_state:', err)
      }
    }

    // Broadcast initial state to local scoreboard (works offline, no Supabase needed)
    try {
      const teamAName = teamA === 'team1' ? team1Name : team2Name
      const teamBName = teamA === 'team1' ? team2Name : team1Name
      const teamAShort = teamA === 'team1' ? team1ShortName : team2ShortName
      const teamBShort = teamA === 'team1' ? team2ShortName : team1ShortName
      const teamAColor = teamA === 'team1' ? team1Color : team2Color
      const teamBColor = teamA === 'team1' ? team2Color : team1Color
      const servingSide = serveA ? 'left' : 'right'
      const serverNum = firstServeTeam === 'team1' ? team1FirstServe : team2FirstServe

      const ch = new BroadcastChannel('openbeach-scoreboard')
      ch.postMessage({
        type: 'LIVE_STATE_UPDATE',
        data: {
          match_id: matchId,
          current_set: 1,
          team_a_name: teamAName,
          team_a_short: teamAShort || teamAName?.substring(0, 3).toUpperCase(),
          team_a_color: teamAColor || '#ef4444',
          team_b_name: teamBName,
          team_b_short: teamBShort || teamBName?.substring(0, 3).toUpperCase(),
          team_b_color: teamBColor || '#3b82f6',
          sets_won_a: 0,
          sets_won_b: 0,
          points_a: 0,
          points_b: 0,
          side_a: 'left',
          serving_team: servingSide,
          server_number: serverNum || null,
          challenges_used_a: 0,
          challenges_used_b: 0,
          timeouts_a: 0,
          timeouts_b: 0,
          timeout_active: false,
          set_interval_active: false,
          match_status: 'live',
          game_n: match.gameN || match.game_n || null,
          league: match.league || null,
          gender: match.match_type_2 || null,
          updated_at: new Date().toISOString()
        }
      })
      ch.close()
    } catch (e) { /* BroadcastChannel not supported */ }

    // Cloud backup at coin toss (non-blocking)
    if (!match?.test) {
      const gameNum = match?.gameN || match?.game_n || null
      exportMatchData(matchId).then(backupData => {
        uploadBackupToCloud(matchId, backupData)
        uploadLogsToCloud(matchId, gameNum)
      }).catch(err => console.warn('[CoinToss] Cloud backup failed:', err))
    }

    // Update saved signatures
    setSavedSignatures({
      team1Captain: team1CaptainSignature,
      team2Captain: team2CaptainSignature,
      team1Coach: team1CoachSignature,
      team2Coach: team2CoachSignature
    })

    // Show initialization modal and wait for sync. Only when the cloud sync
    // can finish now: a venue tablet (its server is the relay, no /api/db),
    // offline mode or a device without a session syncs in the background and
    // starts the match at once (it waited 9-13 s for nothing).
    const waitForCloud = !match?.test && cloudSyncWaitNow()
    setInitModal({ status: 'syncing', message: 'Syncing match data...' })

    // Wait for sync queue to process (poll for completion)
    const maxAttempts = waitForCloud ? 30 : 0 // 15 seconds max
    let attempts = 0
    let syncComplete = !waitForCloud

    while (attempts < maxAttempts && !syncComplete) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const queuedCount = await db.sync_queue.where('status').equals('queued').count()
      if (queuedCount === 0) {
        syncComplete = true
      }
      attempts++
    }

    if (!syncComplete) {
      console.warn('[CoinToss] Sync queue still has items after timeout, proceeding anyway')
    }

    // Verify status is 'live' in Supabase (only for official matches with Supabase configured)
    // This is non-blocking - if offline or error, we still proceed (local status is already 'live')
    let verificationSkipped = false

    if (waitForCloud && isBackendAvailable()) {
      setInitModal({ status: 'verifying', message: 'Verifying match status...' })

      try {
        // Get the match's external_id (seed_key) to look up in Supabase
        const localMatch = await db.matches.get(matchId)
        const seedKey = localMatch?.seed_key

        if (seedKey) {
          const { data: supabaseMatch, error } = await apiFrom('matches')
            .select('status')
            .eq('external_id', seedKey)
            .single()

          if (error) {
            // Network error or match not found - proceed anyway (offline mode)
            console.warn('[CoinToss] Could not verify match status in Supabase (offline?):', error.message)
            verificationSkipped = true
          } else if (supabaseMatch?.status !== 'live') {
            // Match exists but status is not 'live' - this is a real problem
            console.error('[CoinToss] Match status not live in Supabase:', supabaseMatch?.status)
            setInitModal({
              status: 'error',
              message: `Match status is not "live" in database. Current status: ${supabaseMatch?.status || 'unknown'}`
            })
            return
          } else {
          }
        } else {
          // No seed key - skip verification
          verificationSkipped = true
        }
      } catch (err) {
        // Network error - proceed anyway (offline mode)
        console.warn('[CoinToss] Error verifying match status (offline?):', err.message)
        verificationSkipped = true
      }
    } else {
      verificationSkipped = true
    }

    if (verificationSkipped) {
    }

    // --- Pre-game connection checks (non-blocking, informational) ---
    if (waitForCloud && isBackendAvailable()) {
      setInitModal({ status: 'checking', message: 'Running connection checks...', checks: {} })

      const localMatchForChecks = await db.matches.get(matchId)
      const seedKeyForChecks = localMatchForChecks?.seed_key
      const backendUrl = getBackendUrl()

      const checks = {
        supabase: { status: 'pending', label: 'Cloud Database' },
        matchData: { status: 'pending', label: 'Match Data in Cloud' },
        devices: { status: 'pending', label: 'Connected Devices' }
      }

      const checkPromises = []

      // Check 1: Cloud Database
      checkPromises.push(
        (async () => {
          try {
            const { error } = await apiFrom('matches').select('id').limit(1)
            checks.supabase = error
              ? { status: 'warn', label: 'Cloud Database', detail: error.message }
              : { status: 'pass', label: 'Cloud Database' }
          } catch (e) {
            checks.supabase = { status: 'fail', label: 'Cloud Database', detail: e.message }
          }
        })()
      )

      // Check 2: Match Data
      if (seedKeyForChecks) {
        checkPromises.push(
          (async () => {
            try {
              const { data: supaMatch, error } = await apiFrom('matches')
                .select('status')
                .eq('external_id', seedKeyForChecks)
                .maybeSingle()
              if (error) {
                checks.matchData = { status: 'warn', label: 'Match Data in Cloud', detail: error.message }
              } else if (!supaMatch) {
                checks.matchData = { status: 'warn', label: 'Match Data in Cloud', detail: 'Not found in cloud' }
              } else if (supaMatch.status !== 'live') {
                checks.matchData = { status: 'warn', label: 'Match Data in Cloud', detail: `Status: ${supaMatch.status}` }
              } else {
                checks.matchData = { status: 'pass', label: 'Match Data in Cloud' }
              }
            } catch (e) {
              checks.matchData = { status: 'fail', label: 'Match Data in Cloud', detail: e.message }
            }
          })()
        )
      } else {
        checks.matchData = { status: 'skip', label: 'Match Data in Cloud', detail: 'No seed key' }
      }

      // Check 3: Connected Devices
      if (backendUrl) {
        checkPromises.push(
          (async () => {
            try {
              const resp = await fetch(`${backendUrl}/api/server/connections`, {
                signal: AbortSignal.timeout(3000)
              })
              if (resp.ok) {
                const connData = await resp.json()
                const matchSubs = connData.matchSubscriptions?.[matchId] || 0
                const expectedRoles = [
                  localMatchForChecks?.refereeConnectionEnabled,
                  localMatchForChecks?.team1TeamConnectionEnabled,
                  localMatchForChecks?.team2TeamConnectionEnabled
                ].filter(Boolean).length

                if (expectedRoles === 0) {
                  checks.devices = { status: 'pass', label: 'Connected Devices', detail: 'No roles enabled' }
                } else if (matchSubs >= expectedRoles) {
                  checks.devices = { status: 'pass', label: 'Connected Devices', detail: `${matchSubs}/${expectedRoles} connected` }
                } else {
                  checks.devices = { status: 'warn', label: 'Connected Devices', detail: `${matchSubs}/${expectedRoles} connected` }
                }
              } else {
                checks.devices = { status: 'warn', label: 'Connected Devices', detail: 'Server not responding' }
              }
            } catch (e) {
              checks.devices = { status: 'fail', label: 'Connected Devices', detail: e.message }
            }
          })()
        )
      } else {
        checks.devices = { status: 'skip', label: 'Connected Devices', detail: 'No backend' }
      }

      // Run all checks with 10s overall timeout
      await Promise.race([
        Promise.allSettled(checkPromises),
        new Promise(resolve => setTimeout(resolve, 10000))
      ])

      const allPassed = Object.values(checks).every(c => c.status === 'pass' || c.status === 'skip')
      const anyFailed = Object.values(checks).some(c => c.status === 'fail')

      if (allPassed) {
        setInitModal({ status: 'check_results', message: 'All checks passed', checks })
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else if (anyFailed) {
        setInitModal({ status: 'check_results', message: 'Some checks failed', checks })
        // Wait for user to click "Proceed Anyway"
        await new Promise(resolve => { window.__coinTossCheckResolve = resolve })
        delete window.__coinTossCheckResolve
      } else {
        // Warnings only - show briefly then proceed
        setInitModal({ status: 'check_results', message: 'Checks complete', checks })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Upload scoresheet to cloud (async, non-blocking)
    const updatedMatchForScoresheet = await db.matches.get(matchId)
    const allSets = await db.sets.where('matchId').equals(matchId).sortBy('index')
    const allEvents = await db.events.where('matchId').equals(matchId).sortBy('seq')
    uploadScoresheetAsync({
      match: updatedMatchForScoresheet,
      team1Data: { name: team1Name, shortName: team1ShortName },
      team2Data: { name: team2Name, shortName: team2ShortName },
      team1Players: team1Roster,
      team2Players: team2Roster,
      sets: allSets,
      events: allEvents
    })

    // Success!
    setInitModal({ status: 'success', message: 'Match initialized!' })

    // Short delay to show success message (none when nothing was waited for)
    if (waitForCloud) await new Promise(resolve => setTimeout(resolve, 1000))

    setInitModal(null)
    // Navigate to scoreboard
    onConfirm(matchId)
  }

  async function confirmCoinToss() {

    // Validation checks (skip for test matches)
    if (!match?.test) {
      const validationErrors = []

      // 1. Check team names are set (not default "Team 1"/"Team 2" or empty)
      if (!team1Name || team1Name === 'Team 1' || team1Name.trim() === '') {
        validationErrors.push(t('validation.team1NotSet'))
      }
      if (!team2Name || team2Name === 'Team 2' || team2Name.trim() === '') {
        validationErrors.push(t('validation.team2NotSet'))
      }

      // 2. Check at least 1 referee and 1 scorer with names
      const ref1 = match?.officials?.find(o => o.role === '1st referee')
      const scorer = match?.officials?.find(o => o.role === 'scorer')
      if (!ref1?.lastName || !ref1?.firstName) {
        validationErrors.push(t('validation.refereeNotSet'))
      }
      if (!scorer?.lastName || !scorer?.firstName) {
        validationErrors.push(t('validation.scorerNotSet'))
      }

      // 3. Check match info (hall, city, league, date)
      if (!match?.hall || match.hall.trim() === '') {
        validationErrors.push(t('validation.hallNotSet'))
      }
      if (!match?.city || match.city.trim() === '') {
        validationErrors.push(t('validation.cityNotSet'))
      }
      if (!match?.league || match.league.trim() === '') {
        validationErrors.push(t('validation.leagueNotSet'))
      }
      if (!match?.scheduledAt) {
        validationErrors.push(t('validation.dateNotSet'))
      }

      // 4. Check exactly 2 players per team with numbers (beach volleyball)
      const team1PlayersWithNumbers = team1Roster.filter(p => p.number != null && p.number !== '')
      const team2PlayersWithNumbers = team2Roster.filter(p => p.number != null && p.number !== '')
      if (team1PlayersWithNumbers.length !== 2) {
        validationErrors.push(t('validation.needMorePlayers', { team: t('common.team1'), count: team1PlayersWithNumbers.length }))
      }
      if (team2PlayersWithNumbers.length !== 2) {
        validationErrors.push(t('validation.needMorePlayers', { team: t('common.team2'), count: team2PlayersWithNumbers.length }))
      }

      // 5. Check captain is set for each team
      const team1CaptainPlayer = team1Roster.find(p => p.isCaptain)
      const team2CaptainPlayer = team2Roster.find(p => p.isCaptain)
      if (!team1CaptainPlayer) {
        validationErrors.push(t('validation.captainNotSet', { team: t('common.team1') }))
      }
      if (!team2CaptainPlayer) {
        validationErrors.push(t('validation.captainNotSet', { team: t('common.team2') }))
      }

      // 7. Check for duplicate jersey numbers
      const team1Numbers = team1Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
      const team1DuplicateNumbers = team1Numbers.filter((num, idx) => team1Numbers.indexOf(num) !== idx)
      if (team1DuplicateNumbers.length > 0) {
        validationErrors.push(`Team 1 has duplicate jersey numbers: ${[...new Set(team1DuplicateNumbers)].join(', ')}`)
      }
      const team2Numbers = team2Roster.filter(p => p.number != null && p.number !== '').map(p => p.number)
      const team2DuplicateNumbers = team2Numbers.filter((num, idx) => team2Numbers.indexOf(num) !== idx)
      if (team2DuplicateNumbers.length > 0) {
        validationErrors.push(`Team 2 has duplicate jersey numbers: ${[...new Set(team2DuplicateNumbers)].join(', ')}`)
      }

      // 8. Check for duplicate players (same last name and first name)
      const team1PlayerNames = team1Roster.map(p => `${(p.lastName || '').toLowerCase()} ${(p.firstName || '').toLowerCase()}`.trim())
      const team1DuplicatePlayers = team1PlayerNames.filter((name, idx) => name && team1PlayerNames.indexOf(name) !== idx)
      if (team1DuplicatePlayers.length > 0) {
        validationErrors.push(`Team 1 has duplicate players: ${[...new Set(team1DuplicatePlayers)].join(', ')}`)
      }
      const team2PlayerNames = team2Roster.map(p => `${(p.lastName || '').toLowerCase()} ${(p.firstName || '').toLowerCase()}`.trim())
      const team2DuplicatePlayers = team2PlayerNames.filter((name, idx) => name && team2PlayerNames.indexOf(name) !== idx)
      if (team2DuplicatePlayers.length > 0) {
        validationErrors.push(`Team 2 has duplicate players: ${[...new Set(team2DuplicatePlayers)].join(', ')}`)
      }

      // 8. Check no birthdate is exactly 01.01.1900 (placeholder/error date)
      const allRosterPlayers = [...team1Roster, ...team2Roster]
      if (manageDob) {
        const playersWithBadDate = allRosterPlayers.filter(p => p.dob === '01.01.1900' || p.dob === '01/01/1900')
        if (playersWithBadDate.length > 0) {
          validationErrors.push('Some players have invalid birthdate (01.01.1900). Please correct these dates.')
        }
      }

      // 9. Check for invalid player numbers (must be 1-99)
      const team1InvalidNumbers = team1Roster.filter(p => p.number != null && (p.number < 1 || p.number > 99))
      const team2InvalidNumbers = team2Roster.filter(p => p.number != null && (p.number < 1 || p.number > 99))
      if (team1InvalidNumbers.length > 0) {
        validationErrors.push(`Team 1 has invalid jersey numbers (must be 1-99): ${team1InvalidNumbers.map(p => p.number).join(', ')}`)
      }
      if (team2InvalidNumbers.length > 0) {
        validationErrors.push(`Team 2 has invalid jersey numbers (must be 1-99): ${team2InvalidNumbers.map(p => p.number).join(', ')}`)
      }

      // 10. Check for players without numbers
      const team1NoNumbers = team1Roster.filter(p => p.number == null || p.number === '')
      const team2NoNumbers = team2Roster.filter(p => p.number == null || p.number === '')
      if (team1NoNumbers.length > 0) {
        validationErrors.push(`Team 1 has ${team1NoNumbers.length} player(s) without jersey numbers`)
      }
      if (team2NoNumbers.length > 0) {
        validationErrors.push(`Team 2 has ${team2NoNumbers.length} player(s) without jersey numbers`)
      }

      // Show validation errors if any
      if (validationErrors.length > 0) {
        setNoticeModal({ message: validationErrors.join('\n') })
        return
      }

      // 11. Check for dates that might be import errors (01.01.yyyy for any year) - ask for confirmation
      if (manageDob) {
        const suspiciousDates = []
        allRosterPlayers.forEach(p => {
          if (p.dob && (p.dob.startsWith('01.01.') || p.dob.startsWith('01/01/'))) {
            suspiciousDates.push(`${p.lastName || ''} ${p.firstName || ''}: ${p.dob}`)
          }
        })
        if (suspiciousDates.length > 0) {
          // Show modal and wait for user confirmation
          setBirthdateConfirmModal({
            suspiciousDates,
            onConfirm: () => {
              setBirthdateConfirmModal(null)
              // Continue with coin toss after confirmation
              proceedWithCoinToss()
            }
          })
          return
        }
      }

      // Check signatures for official matches (beach volleyball: captain + coach if enabled)
      if (!team1CaptainSignature || !team2CaptainSignature) {
        setNoticeModal({ message: t('coinToss.validation.completeSignatures') })
        return
      }
      if (match?.hasCoach && (!team1CoachSignature || !team2CoachSignature)) {
        setNoticeModal({ message: t('coinToss.validation.completeCoachSignatures') })
        return
      }
    }

    // All validations passed, proceed
    proceedWithCoinToss()
  }

  async function handleReturnToMatch() {
    // Save coin toss result when returning
    if (matchId) {
      const firstServeTeam = serveA ? teamA : teamB
      await db.matches.update(matchId, {
        firstServe: firstServeTeam,
        coinTossTeamA: teamA,
        coinTossTeamB: teamB,
        coinTossServeA: serveA,
        coinTossServeB: serveB
      })

      const matchData = await db.matches.get(matchId)
      if (matchData?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: matchData.seed_key, // Use seed_key (external_id) for Supabase lookup
            status: matchData.status || null,
            // JSONB columns only
            team1: { name: team1Name, short_name: team1ShortName || generateShortName(team1Name), color: team1Color },
            team2: { name: team2Name, short_name: team2ShortName || generateShortName(team2Name), color: team2Color },
            players_team1: team1Roster.map(p => ({
              number: p.number,
              first_name: p.firstName,
              last_name: p.lastName,
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            players_team2: team2Roster.map(p => ({
              number: p.number,
              first_name: p.firstName,
              last_name: p.lastName,
              dob: p.dob || null,
              is_captain: !!p.isCaptain
            })),
            officials: matchData.officials || []
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    }
    onConfirm(matchId)
  }

  // Computed values
  const teamAInfo = teamA === 'team1'
    ? { name: team1Name, shortName: team1ShortName, color: team1Color, roster: team1Roster, country: match?.team1Country }
    : { name: team2Name, shortName: team2ShortName, color: team2Color, roster: team2Roster, country: match?.team2Country }
  const teamBInfo = teamB === 'team1'
    ? { name: team1Name, shortName: team1ShortName, color: team1Color, roster: team1Roster, country: match?.team1Country }
    : { name: team2Name, shortName: team2ShortName, color: team2Color, roster: team2Roster, country: match?.team2Country }

  // Get display name - use short name if name is too long
  const getDisplayName = (name) => {
    return name
  }

  const teamACaptainSig = teamA === 'team1' ? team1CaptainSignature : team2CaptainSignature
  const teamBCaptainSig = teamB === 'team1' ? team1CaptainSignature : team2CaptainSignature
  const teamACoachSig = teamA === 'team1' ? team1CoachSignature : team2CoachSignature
  const teamBCoachSig = teamB === 'team1' ? team1CoachSignature : team2CoachSignature
  const hasCoach = match?.hasCoach

  const sortRosterEntries = roster =>
    (roster || [])
      .map((player, index) => ({ player, index }))
      .sort((a, b) => {
        const an = Number(a.player?.number) || 0
        const bn = Number(b.player?.number) || 0
        return an - bn
      })


  // Volleyball images - responsive size (the serve marker: frozen)
  const volleyballImage = (
    <div style={{
      width: '15vmin', height: '15vmin', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <img
        src={ballImage}        alt={t('coinToss.serve', 'Serve')}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  )
  const volleyballPlaceholder = (
    <div style={{
      width: '15vmin', height: '15vmin', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'transparent', flexShrink: 0
    }} />
  )

  if (!match) {
    return (
      <div className={COIN_TOSS_VIEW}>
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {t('common.loading')}
        </p>
      </div>
    )
  }

  // One team column (A or B): label, the team-colour band (frozen), the coin
  // toss winner toggle, the serve ball (frozen) and Order & signature.
  const renderTeamColumn = (side) => {
    const isA = side === 'A'
    const info = isA ? teamAInfo : teamBInfo
    const key = isA ? teamA : teamB
    const serves = isA ? serveA : serveB
    const captainSig = isA ? teamACaptainSig : teamBCaptainSig
    const coachSig = isA ? teamACoachSig : teamBCoachSig
    const won = coinTossWinner === key
    const signedState = captainSig ? (hasCoach && !coachSig ? 'half' : 'full') : 'none'
    return (
      <div className="flex min-w-0 flex-col items-center text-center">
        <h2 className={cn('m-0 font-bold tracking-tight text-stone-900', isCompact ? 'text-lg' : 'text-2xl')}>{isA ? t('coinToss.teamA') : t('coinToss.teamB')}</h2>
        <div className={cn('flex w-full items-center justify-center gap-2', isCompact ? 'mb-3 mt-2 min-h-10' : 'mb-4 mt-3 min-h-20')}>
          {/* Team-colour band: frozen (team colour, contrast text, flag) */}
          <div
            style={{
              background: info.color,
              color: isBrightColor(info.color) ? '#000' : '#fff',
              flex: 1, padding: sizes.teamButtonPadding, fontSize: sizes.teamButtonFont, width: '100%', minWidth: 0,
              fontWeight: 600, border: 'none', borderRadius: '8px',
              overflow: 'hidden',
              cursor: 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
            title={info.name}
          >
            {/* The flag keeps its size; the name is cut with an ellipsis on a phone */}
            {info.country && <CountryFlag countryCode={info.country} size="md" />}
            <span className="min-w-0 truncate">{getDisplayName(info.name)}</span>
          </div>
        </div>
        {/* Coin toss winner: a two-way choice between the teams (slate-900 when chosen) */}
        <button
          type="button"
          aria-pressed={won}
          onClick={() => setCoinTossWinner(key)}
          className={cn(
            'mb-10 inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors sm:px-4',
            won ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50',
            FOCUS_RING
          )}
        >
          {won && <Check size={16} aria-hidden="true" />}
          {t('coinToss.wonCoinToss', 'Won the coin toss')}
        </button>

        <div className={cn('flex items-center justify-center', isCompact ? 'mb-3' : 'mb-4')} style={{ height: sizes.volleyballSize }}>
          {serves ? volleyballImage : volleyballPlaceholder}
        </div>

        {/* Order & signature: outline until signed, then the emerald done state (½ while the coach is missing) */}
        <div className={cn('flex w-full justify-center', isCompact ? 'mt-4' : 'mt-5')}>
          <button
            type="button"
            onClick={() => setOrderSignatureModal(isA ? 'teamA' : 'teamB')}
            className={cn(
              'inline-flex min-h-12 w-full flex-wrap items-center justify-center gap-x-2 rounded-xl border-2 px-3 py-1.5 font-semibold transition-colors sm:px-4',
              isCompact ? 'text-sm' : 'text-base',
              signedState === 'full' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : signedState === 'half' ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
              FOCUS_RING
            )}
          >
            <PenLine size={18} aria-hidden="true" />
            {t('coinToss.orderAndSignature', 'Order & signature')}
            {signedState === 'full' && <Check size={18} aria-label={t('coinToss.signed', 'Signed')} />}
            {signedState === 'half' && <span aria-label={t('coinToss.halfSigned', 'Coach signature missing')}>½</span>}
          </button>
        </div>
      </div>
    )
  }

  // The serve / switch keys between the teams: the dark neutral key action,
  // courtside size.
  const SWITCH_BTN = cn('inline-flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-5 text-base font-semibold text-white transition-colors hover:bg-slate-800', FOCUS_RING)

  return (
    <div className={COIN_TOSS_VIEW}>
      <div className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-3', isCompact ? 'mb-4' : 'mb-6')}>
        <div>
          <Button variant="ghost" size="xl" icon={ArrowLeft} className="bg-white" onClick={onBack}>{t('common.back')}</Button>
        </div>
        <h1 className="m-0 text-center text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{t('coinToss.title')}</h1>
        <div className="flex justify-end">
          <Button variant="danger-outline" size="xl" icon={OctagonX} onClick={() => setForfaitModal(true)}>
            {t('coinToss.forfait.button', 'Forfait')}
          </Button>
        </div>
      </div>

      {/* Team A | switch keys | team B. On a phone the two teams sit side by
          side and the switch keys go under them. */}
      <div className="mb-8 grid grid-cols-2 items-start sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" style={{ gap: sizes.gap }}>
        {renderTeamColumn('A')}

        {/* Middle buttons */}
        <div className={cn('order-last col-span-2 flex flex-row flex-wrap items-center justify-center gap-3 self-stretch px-1 sm:order-none sm:col-span-1 sm:flex-col sm:flex-nowrap', isCompact ? 'sm:gap-3' : 'sm:gap-9')}>
          <div className={cn('flex items-center justify-center', isCompact ? 'sm:mt-6 sm:h-10' : 'sm:mt-[52px] sm:h-14')}>
            <button type="button" className={SWITCH_BTN} onClick={switchTeams}>
              <ArrowLeftRight size={18} aria-hidden="true" />
              {t('coinToss.switchTeamsButton', 'Switch teams')}
            </button>
          </div>
          <div className="flex items-center justify-center sm:h-[var(--ball-h)]" style={{ '--ball-h': sizes.volleyballSize }}>
            <button type="button" className={SWITCH_BTN} onClick={switchServe}>
              <ArrowLeftRight size={18} aria-hidden="true" />
              {t('coinToss.switchServeButton', 'Switch serve')}
            </button>
          </div>
        </div>

        {renderTeamColumn('B')}
      </div>

      {/* Service Order Display */}
      {(() => {
        // Determine which team serves first and their players
        const servingTeam = serveA ? teamA : teamB
        const receivingTeam = serveA ? teamB : teamA
        const servingRoster = servingTeam === 'team1' ? team1Roster : team2Roster
        const receivingRoster = receivingTeam === 'team1' ? team1Roster : team2Roster
        const servingFirstServe = servingTeam === 'team1' ? team1FirstServe : team2FirstServe
        const receivingFirstServe = receivingTeam === 'team1' ? team1FirstServe : team2FirstServe
        const servingTeamLabel = serveA ? 'A' : 'B'
        const receivingTeamLabel = serveA ? 'B' : 'A'

        // Get first serve and second serve players for each team
        const servingFirstPlayer = servingRoster.find(p => p.number === servingFirstServe) || servingRoster[0]
        const servingSecondPlayer = servingRoster.find(p => p.number !== servingFirstServe) || servingRoster[1]
        const receivingFirstPlayer = receivingRoster.find(p => p.number === receivingFirstServe) || receivingRoster[0]
        const receivingSecondPlayer = receivingRoster.find(p => p.number !== receivingFirstServe) || receivingRoster[1]

        // Format player display: A - 2 (circled if captain) - LastName, F.
        const formatPlayer = (teamLabel, player) => {
          if (!player) return `${teamLabel} - ?`
          const num = player.number || '?'
          const lastName = player.lastName || ''
          const firstInitial = player.firstName ? `${player.firstName.charAt(0)}.` : ''
          const nameStr = lastName ? `${lastName}${firstInitial ? ', ' + firstInitial : ''}` : ''
          return { teamLabel, num, isCaptain: player.isCaptain, nameStr }
        }

        // Service order line: the roman position, the team, the number (the
        // captain's number circled, as on the scoresheet) and the name.
        const renderServiceLine = (roman, teamLabel, player) => {
          const data = formatPlayer(teamLabel, player)
          return (
            <>
              <span className="font-bold text-stone-900">{roman}</span>
              <span className="text-center font-semibold text-stone-700">{data.teamLabel}</span>
              <span className="flex justify-center">
                <span
                  className={cn('inline-flex h-6 min-w-6 items-center justify-center font-semibold tabular-nums text-stone-900', data.isCaptain && 'rounded-full border-2 border-emerald-600 text-emerald-800')}
                  title={data.isCaptain ? t('coinToss.captain') : undefined}
                >{data.num}</span>
              </span>
              <span className="text-stone-800">{data.nameStr}</span>
            </>
          )
        }

        return (
          <div className="flex justify-center">
            <div className={cn('w-auto px-6 py-4', SETUP_BLOCK)}>
              <h3 className="mb-3 text-center text-sm font-semibold text-stone-700">{t('coinToss.serviceOrder', 'Service order')}</h3>
              <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-4 gap-y-2 text-sm">
                {renderServiceLine('I', servingTeamLabel, servingFirstPlayer)}
                {renderServiceLine('II', receivingTeamLabel, receivingFirstPlayer)}
                {renderServiceLine('III', servingTeamLabel, servingSecondPlayer)}
                {renderServiceLine('IV', receivingTeamLabel, receivingSecondPlayer)}
              </div>
            </div>
          </div>
        )
      })()}

      <div className="mt-6 flex flex-col items-center gap-4 border-t border-stone-200/70 pt-6">
        <MenuList
          tone="light"
          buttonLabel={isCompact
            ? <FileText size={16} aria-label={t('coinToss.scoresheet')} />
            : <><FileText size={16} aria-hidden="true" /> {t('coinToss.scoresheet')}</>}
          buttonTitle={t('coinToss.scoresheet')}
          buttonClassName={cn('inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50', FOCUS_RING)}
          showArrow={true}
          position="center"
          items={[
            {
              key: 'scoresheet-preview',
              icon: <Search size={16} aria-hidden="true" />,
              label: t('coinToss.preview'),
              onClick: async () => {
                try {
                  if (!match) {
                    showAlert(t('coinToss.noMatchData'), 'error')
                    return
                  }

                  // Fetch teams and players for scoresheet
                  const [team1DataRaw, team2DataRaw, team1PlayersRaw, team2PlayersRaw] = await Promise.all([
                    match.team1Id ? db.teams.get(match.team1Id) : null,
                    match.team2Id ? db.teams.get(match.team2Id) : null,
                    match.team1Id ? db.players.where('teamId').equals(match.team1Id).toArray() : [],
                    match.team2Id ? db.players.where('teamId').equals(match.team2Id).toArray() : []
                  ])

                  // Add country and name to team objects (from match or local state)
                  const team1Data = team1DataRaw ? {
                    ...team1DataRaw,
                    name: team1Name || team1DataRaw.name,
                    country: match.team1Country || ''
                  } : { name: team1Name, country: match.team1Country || '' }

                  const team2Data = team2DataRaw ? {
                    ...team2DataRaw,
                    name: team2Name || team2DataRaw.name,
                    country: match.team2Country || ''
                  } : { name: team2Name, country: match.team2Country || '' }

                  // Use roster from state (includes latest edits) or fallback to DB
                  const team1PlayersData = team1Roster.length > 0 ? team1Roster : team1PlayersRaw || []
                  const team2PlayersData = team2Roster.length > 0 ? team2Roster : team2PlayersRaw || []

                  // Keep team keys as team1/team2 (no normalization needed - scoresheet uses team1/team2)
                  const normalizeTeamKey = (key) => {
                    // Convert team_1/team_2 back to team1/team2 if needed, otherwise keep as is
                    if (!key) return key;
                    if (key === 'team_1') return 'team1';
                    if (key === 'team_2') return 'team2';
                    return key; // Already team1/team2 or other format
                  }
                  const scoresheetData = {
                    match: {
                      ...match,
                      // Add underscore versions for scoresheet compatibility
                      team_1Country: match.team1Country || '',
                      team_2Country: match.team2Country || '',
                      // Normalize coinTossTeamA/B for scoresheet
                      coinTossTeamA: normalizeTeamKey(match.coinTossTeamA || teamA),
                      coinTossTeamB: normalizeTeamKey(match.coinTossTeamB || teamB),
                      // Build coinTossData for scoresheet compatibility
                      coinTossData: {
                        coinTossWinner: normalizeTeamKey(match.coinTossWinner || coinTossWinner),
                        teamA: normalizeTeamKey(match.coinTossTeamA || teamA),
                        teamB: normalizeTeamKey(match.coinTossTeamB || teamB)
                      }
                    },
                    team1Team: team1Data,
                    team2Team: team2Data,
                    team1Players: team1PlayersData,
                    team2Players: team2PlayersData,
                    // Also include underscore versions for backward compatibility
                    team_1Team: team1Data,
                    team_2Team: team2Data,
                    team_1Players: team1PlayersData,
                    team_2Players: team2PlayersData,
                    sets: [],
                    events: [],
                    sanctions: []
                  }

                  sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
                  const opened = openAppWindow('/scoresheet_beach.html', { features: 'width=1200,height=900' })

                  if (!opened.ok) {
                    showAlert(t('coinToss.allowPopups'), 'warning')
                  }
                } catch (error) {
                  console.error('Error opening scoresheet:', error)
                  showAlert(`Failed to open scoresheet: ${error.message || 'Unknown error'}`, 'error')
                }
              }

            }
          ]}
        />
        {isCoinTossConfirmed ? (
          <button type="button" onClick={handleReturnToMatch} className={cn('inline-flex min-h-14 min-w-64 items-center justify-center rounded-xl bg-slate-900 px-8 text-base font-semibold text-white transition-colors hover:bg-slate-800', FOCUS_RING)}>
            {t('coinToss.returnToMatch')}
          </button>
        ) : (
          <button type="button" onClick={confirmCoinToss} className={cn('inline-flex min-h-14 min-w-64 items-center justify-center rounded-xl bg-red-600 px-8 text-base font-semibold text-white transition-colors hover:bg-red-700', FOCUS_RING)}>
            {t('coinToss.confirmResult')}
          </button>
        )}
      </div>

      {/* Roster Modal */}
      {rosterModal && (() => {
        const isTeamA = rosterModal === 'teamA'
        const currentTeam = isTeamA ? teamA : teamB
        const teamInfo = isTeamA ? teamAInfo : teamBInfo
        const roster = currentTeam === 'team1' ? team1Roster : team2Roster
        const setRoster = currentTeam === 'team1' ? setTeam1Roster : setTeam2Roster
        const rosterEntries = sortRosterEntries(roster)

        // Store original data on first render of modal
        if (!originalRosterDataRef.current) {
          originalRosterDataRef.current = {
            roster: JSON.parse(JSON.stringify(roster))
          }
        }

        // Check if there are changes
        const hasChanges = hasRosterChanges(
          originalRosterDataRef.current?.roster,
          roster
        )

        // Get signature state for this team (beach volleyball: captain only)
        const captainSig = currentTeam === 'team1' ? team1CaptainSignature : team2CaptainSignature
        const setCaptainSig = currentTeam === 'team1' ? setTeam1CaptainSignature : setTeam2CaptainSignature

        // Handle close/modify
        const handleCloseOrModify = async () => {
          if (hasChanges) {
            await syncRosterToDatabase(currentTeam, roster)
          }
          originalRosterDataRef.current = null
          setRosterModalSignature(null)
          setRosterModal(null)
        }

        const cellInput = 'h-11 w-full rounded-lg border border-transparent bg-transparent px-2 text-sm text-stone-800 hover:border-stone-200 focus:border-red-700/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-700/20'

        return (
          <div className="ov-kit" style={DIALOG_LAYER}>
            <KitModal
              open
              size="xl"
              layout="sections"
              dismissible={false}
              onClose={handleCloseOrModify}
              closeLabel={t('common.close')}
              title={t('coinToss.rosterTitle', { team: teamInfo.name, defaultValue: 'Roster – {{team}}' })}
              footer={(
                <>
                  {hasChanges && (
                    <button
                      type="button"
                      className={modalCancelClass}
                      onClick={() => {
                        // Revert to original data
                        if (originalRosterDataRef.current) {
                          setRoster(JSON.parse(JSON.stringify(originalRosterDataRef.current.roster)))
                        }
                        originalRosterDataRef.current = null
                        setRosterModalSignature(null)
                        setRosterModal(null)
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                  <button type="button" className={hasChanges ? modalSaveClass : modalPrimaryClass} onClick={handleCloseOrModify}>
                    {hasChanges ? t('roster.modify') : t('common.close')}
                  </button>
                </>
              )}
            >
              {/* Players Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 border-b-[1.5px] border-stone-800 pb-1.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-800">{t('roster.playersCount', { count: roster.length })}</h4>
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => setAddPlayerModal(rosterModal)}>
                    {t('roster.addPlayerButton')}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                      <tr>
                        <th className="px-2 py-2 text-left">{t('roster.number')}</th>
                        <th className="px-2 py-2 text-left">{t('roster.name')}</th>
                        {manageDob && <th className="w-[140px] px-2 py-2 text-left">{t('roster.dob')}</th>}
                        <th className="px-2 py-2 text-center">{t('coinToss.captain')}</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {rosterEntries.map(({ player: p, index: originalIdx }) => {
                        // Check for duplicate jersey number
                        const isDuplicate = p.number != null && p.number !== '' &&
                          roster.some((other, idx) => idx !== originalIdx && other.number === p.number)

                        return (
                          <tr key={`roster-${originalIdx}`}>
                            <td className="w-16 px-2 py-1 align-middle">
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1" max="99"
                                value={p.number ?? ''}
                                aria-label={t('roster.numberLabel')}
                                aria-invalid={isDuplicate || undefined}
                                onChange={e => {
                                  const val = e.target.value ? Number(e.target.value) : null
                                  if (val !== null && (val < 1 || val > 99)) return
                                  const updated = [...roster]
                                  updated[originalIdx] = { ...updated[originalIdx], number: val }
                                  setRoster(updated)
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                                title={isDuplicate ? t('roster.duplicateNumber') : ''}
                                className={cn(
                                  'h-11 w-11 border-2 text-center text-sm font-semibold tabular-nums [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-red-700/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                  isDuplicate ? 'rounded-lg border-red-400 bg-red-50 text-red-700'
                                    : p.isCaptain ? 'rounded-full border-emerald-600 bg-white text-emerald-800'
                                      : 'rounded-lg border-transparent bg-transparent text-stone-900 hover:border-stone-200'
                                )}
                              />
                            </td>
                            <td className="px-2 py-1 align-middle">
                              <input
                                type="text"
                                aria-label={t('roster.name')}
                                value={`${p.lastName || ''} ${p.firstName || ''}`.trim() || ''}
                                onChange={e => {
                                  const parts = e.target.value.split(' ').filter(p => p)
                                  const lastName = parts.length > 0 ? parts[0] : ''
                                  const firstName = parts.length > 1 ? parts.slice(1).join(' ') : ''
                                  const updated = [...roster]
                                  updated[originalIdx] = { ...updated[originalIdx], lastName, firstName }
                                  setRoster(updated)
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                                className={cellInput}
                              />
                            </td>
                            {manageDob && <td className="w-[140px] px-2 py-1 align-middle">
                              <DateField
                                size="bare"
                                // 140px column: typed only (DD.MM.YYYY); the Add player dialog has the calendar
                                calendar={false}
                                aria-label={t('roster.dob')}
                                value={p.dob ? formatDateToISO(p.dob) : ''}
                                onChange={v => {
                                  const value = v ? formatDateToDDMMYYYY(v) : ''
                                  const updated = [...roster]
                                  updated[originalIdx] = { ...updated[originalIdx], dob: value }
                                  setRoster(updated)
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                                className={cn('tabular-nums', cellInput)}
                              />
                            </td>}
                            <td className="px-2 py-1 text-center align-middle">
                              <button
                                type="button"
                                aria-pressed={!!p.isCaptain}
                                aria-label={t('coinToss.captain')}
                                title={t('coinToss.captain')}
                                onClick={() => {
                                  const updated = roster.map((player, idx) => ({
                                    ...player,
                                    isCaptain: idx === originalIdx ? !player.isCaptain : false
                                  }))
                                  setRoster(updated)
                                }}
                                className={cn(
                                  'mx-auto inline-flex h-11 w-11 select-none items-center justify-center rounded-lg border-2 text-sm font-bold transition-colors',
                                  p.isCaptain ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-stone-300 bg-white text-stone-400 hover:bg-stone-50',
                                  FOCUS_RING
                                )}
                              >
                                C
                              </button>
                            </td>
                            <td className="px-1 py-1 align-middle">
                              <button
                                type="button"
                                aria-label={t('common.delete')}
                                title={t('common.delete')}
                                onClick={() => setDeletePlayerModal({ team: rosterModal, index: originalIdx })}
                                className={cn('inline-flex h-11 w-11 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-red-50 hover:text-red-700', FOCUS_RING)}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures Section - Beach volleyball: captain only */}
              <div className="space-y-2">
                <h4 className="border-b-[1.5px] border-stone-800 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-800">{t('matchSetup.captainSignature')}</h4>
                <button
                  type="button"
                  onClick={() => setRosterModalSignature('captain')}
                  className={cn(
                    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-semibold transition-colors',
                    captainSig ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-dashed border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
                    FOCUS_RING
                  )}
                >
                  {t('coinToss.captain')}
                  {captainSig && <Check size={16} aria-label={t('coinToss.signed', 'Signed')} />}
                </button>
              </div>

              {/* Signature Pad Modal */}
              {rosterModalSignature && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-stone-800">
                    {t('coinToss.captainSignatureTeam', { team: teamInfo.name })}
                  </h3>
                  <SignaturePad
                    open
                    onSave={(sig, meta) => {
                      saveCoinTossSignature(`${currentTeam}-captain`, sig, meta)
                      setCaptainSig(sig)
                      setRosterModalSignature(null)
                    }}
                    onClose={() => setRosterModalSignature(null)}
                    title={t('matchSetup.captainSignature')}
                    phone={phoneSignFor(`${currentTeam}-captain`)}
                  />
                </div>
              )}
            </KitModal>
          </div>
        )
      })()}

      {/* Add Player Modal */}
      {addPlayerModal && (() => {
        const isTeamA = addPlayerModal === 'teamA'
        const currentTeam = isTeamA ? teamA : teamB
        const num = currentTeam === 'team1' ? team1Num : team2Num
        const first = currentTeam === 'team1' ? team1First : team2First
        const last = currentTeam === 'team1' ? team1Last : team2Last
        const dob = currentTeam === 'team1' ? team1Dob : team2Dob
        const captain = currentTeam === 'team1' ? team1Captain : team2Captain

        const addPlayer = () => {
          if (!last || !first) {
            showAlert(t('roster.enterNames'), 'warning')
            return
          }
          const newPlayer = { number: num ? Number(num) : null, lastName: last, firstName: first, dob, isCaptain: captain }

          if (currentTeam === 'team1') {
            setTeam1Roster(list => {
              const cleared = captain ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
              return [...cleared, newPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
            })
            setTeam1Num(''); setTeam1First(''); setTeam1Last(''); setTeam1Dob(''); setTeam1CaptainBool(false)
          } else {
            setTeam2Roster(list => {
              const cleared = captain ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
              return [...cleared, newPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
            })
            setTeam2Num(''); setTeam2First(''); setTeam2Last(''); setTeam2Dob(''); setTeam2CaptainBool(false)
          }
          setAddPlayerModal(null)
        }

        return (
          <div className="ov-kit" style={{ position: 'relative', zIndex: 1001 }}>
            <KitModal
              open
              decision
              dismissible={false}
              size="md"
              onClose={() => setAddPlayerModal(null)}
              closeLabel={t('common.close')}
              title={t('roster.addPlayerTitle', { team: isTeamA ? t('coinToss.teamA') : t('coinToss.teamB') })}
              footer={(
                <>
                  <button type="button" className={modalCancelClass} onClick={() => setAddPlayerModal(null)}>{t('common.cancel')}</button>
                  <button type="button" className={modalSaveClass} onClick={addPlayer}>{t('roster.addPlayerButton')}</button>
                </>
              )}
            >
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="ob-ct-add-num" className={FIELD_LABEL}>{t('roster.numberLabel')}</label>
                  <input
                    id="ob-ct-add-num"
                    type="number"
                    inputMode="numeric"
                    value={num}
                    onChange={e => currentTeam === 'team1' ? setTeam1Num(e.target.value) : setTeam2Num(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                    className={cn(FIELD_INPUT, 'tabular-nums')}
                  />
                </div>
                <div>
                  <label htmlFor="ob-ct-add-last" className={FIELD_LABEL}>{t('roster.lastName')}</label>
                  <input
                    id="ob-ct-add-last"
                    type="text"
                    value={last}
                    onChange={e => currentTeam === 'team1' ? setTeam1Last(e.target.value) : setTeam2Last(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                    className={cn(FIELD_INPUT, 'capitalize')}
                  />
                </div>
                <div>
                  <label htmlFor="ob-ct-add-first" className={FIELD_LABEL}>{t('roster.firstName')}</label>
                  <input
                    id="ob-ct-add-first"
                    type="text"
                    value={first}
                    onChange={e => currentTeam === 'team1' ? setTeam1First(e.target.value) : setTeam2First(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                    className={cn(FIELD_INPUT, 'capitalize')}
                  />
                </div>
                {manageDob && <div>
                  <label htmlFor="ob-ct-add-dob" className={FIELD_LABEL}>{t('roster.dateOfBirth')}</label>
                  <DateField
                    id="ob-ct-add-dob"
                    size="lg"
                    value={dob ? formatDateToISO(dob) : ''}
                    onChange={v => {
                      const value = v ? formatDateToDDMMYYYY(v) : ''
                      currentTeam === 'team1' ? setTeam1Dob(value) : setTeam2Dob(value)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  />
                </div>}
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-slate-900"
                    checked={captain}
                    onChange={e => currentTeam === 'team1' ? setTeam1CaptainBool(e.target.checked) : setTeam2CaptainBool(e.target.checked)}
                  />
                  <span>{t('coinToss.captain')}</span>
                </label>
              </div>
            </KitModal>
          </div>
        )
      })()}

      {/* Order & Signature Modal */}
      {orderSignatureModal && (() => {
        const isTeamA = orderSignatureModal === 'teamA'
        const currentTeam = isTeamA ? teamA : teamB
        const teamInfo = isTeamA ? teamAInfo : teamBInfo
        const roster = currentTeam === 'team1' ? team1Roster : team2Roster
        const setRoster = currentTeam === 'team1' ? setTeam1Roster : setTeam2Roster
        const firstServe = currentTeam === 'team1' ? team1FirstServe : team2FirstServe
        const setFirstServe = currentTeam === 'team1' ? setTeam1FirstServe : setTeam2FirstServe
        const captainSig = currentTeam === 'team1' ? team1CaptainSignature : team2CaptainSignature
        const setCaptainSig = currentTeam === 'team1' ? setTeam1CaptainSignature : setTeam2CaptainSignature
        const teamLabel = isTeamA ? 'A' : 'B'
        const coachSig = currentTeam === 'team1' ? team1CoachSignature : team2CoachSignature

        // Get captain
        const captain = roster.find(p => p.isCaptain)

        // Handle player field update
        const handlePlayerUpdate = (index, field, value) => {
          setRoster(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: value }
            return updated
          })
        }

        // Handle number toggle (swap numbers between players)
        const handleNumberToggle = (index, newNumber) => {
          setRoster(prev => {
            const updated = [...prev]
            const otherIndex = index === 0 ? 1 : 0
            const otherNumber = newNumber === 1 ? 2 : 1
            updated[index] = { ...updated[index], number: newNumber }
            if (updated[otherIndex]) {
              updated[otherIndex] = { ...updated[otherIndex], number: otherNumber }
            }
            return updated
          })
        }

        // Handle captain toggle
        const handleCaptainToggle = (index) => {
          if (roster[index]?.isCaptain) return
          setRoster(prev => prev.map((p, i) => ({
            ...p,
            isCaptain: i === index
          })))
          // Clear signature when captain changes (saved at once, like a new signature)
          if (captainSig) saveCoinTossSignature(`${currentTeam}-captain`, null)
          setCaptainSig(null)
        }

        // Handle first serve toggle
        const handleFirstServeToggle = (playerNumber) => {
          setFirstServe(playerNumber)
        }

        // Handle signature
        const handleOpenSignature = () => {
          setOpenSignature(currentTeam === 'team1' ? 'team1-captain' : 'team2-captain')
        }

        // A signature button: dashed "tap to sign" until signed, then the emerald done state.
        const signBtn = (signed) => cn(
          'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-base font-semibold transition-colors',
          signed ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-dashed border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
          FOCUS_RING
        )
        // A two-state toggle in a player card: the chosen state carries its marker colour and a check.
        const toggleBtn = (on, onCls) => cn(
          'inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-semibold transition-colors',
          on ? onCls : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50',
          FOCUS_RING
        )

        return (
          <div className="ov-kit" style={DIALOG_LAYER}>
            <KitModal
              open
              decision
              size="lg"
              dismissible={false}
              onClose={() => setOrderSignatureModal(null)}
              closeLabel={t('common.close')}
              title={t('coinToss.orderAndSignatureTitle', { team: teamLabel, defaultValue: 'Order & signature – team {{team}}' })}
            >
              <div className="space-y-4">
                {/* Team-colour band: frozen */}
                <div style={{
                  padding: '12px',
                  background: teamInfo.color,
                  color: isBrightColor(teamInfo.color) ? '#000' : '#fff',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '16px'
                }}>
                  {teamInfo.name}
                </div>

                {/* Players */}
                <div className="flex flex-col gap-3">
                  {roster.map((p, index) => {
                    const isFirstServe = firstServe === p.number || (!firstServe && index === 0)
                    return (
                      <div key={index} className={cn('rounded-xl border p-3', p.isCaptain ? 'border-2 border-emerald-600 bg-emerald-50/40' : 'border-stone-200/70 bg-stone-50/60')}>
                        {/* Row 1: Number toggle + Names */}
                        <div className="mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                          {/* Number toggle */}
                          <div className="flex gap-1" role="group" aria-label={t('roster.numberLabel')}>
                            {[1, 2].map(num => (
                              <button
                                type="button"
                                key={num}
                                aria-pressed={p.number === num}
                                onClick={() => handleNumberToggle(index, num)}
                                className={cn(
                                  'inline-flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold tabular-nums transition-colors',
                                  p.number === num ? 'border-slate-900 bg-slate-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
                                  FOCUS_RING
                                )}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          {/* Last Name */}
                          <input
                            type="text"
                            placeholder={t('roster.lastName')}
                            aria-label={t('roster.lastName')}
                            value={p.lastName || ''}
                            onChange={e => handlePlayerUpdate(index, 'lastName', e.target.value)}
                            className={cn(FIELD_INPUT, 'min-w-0 flex-1 capitalize')}
                          />
                          {/* First Name */}
                          <input
                            type="text"
                            placeholder={t('roster.firstName')}
                            aria-label={t('roster.firstName')}
                            value={p.firstName || ''}
                            onChange={e => handlePlayerUpdate(index, 'firstName', e.target.value)}
                            className={cn(FIELD_INPUT, 'min-w-0 flex-1 capitalize')}
                          />
                        </div>
                        {/* Row 2: Captain + First Serve toggles */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-pressed={!!p.isCaptain}
                            onClick={() => handleCaptainToggle(index)}
                            className={toggleBtn(p.isCaptain, 'border-emerald-600 bg-emerald-50 text-emerald-800')}
                          >
                            {t('coinToss.captain')}
                            {p.isCaptain && <Check size={16} aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            aria-pressed={isFirstServe}
                            onClick={() => handleFirstServeToggle(p.number)}
                            className={toggleBtn(isFirstServe, 'border-sky-600 bg-sky-50 text-sky-800')}
                          >
                            <Volleyball size={18} aria-hidden="true" />
                            {t('coinToss.firstServe', 'First serve')}
                            {isFirstServe && <Check size={16} aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Captain Signature */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-stone-700">{t('matchSetup.captainSignature')}</h4>
                  {captain ? (
                    <button type="button" onClick={handleOpenSignature} className={signBtn(!!captainSig)}>
                      {captainSig ? (
                        <>
                          <span>{t('coinToss.signedBy', { number: captain.number, defaultValue: 'Signed by #{{number}}' })}</span>
                          <Check size={18} aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          <PenLine size={18} aria-hidden="true" />
                          {t('coinToss.signCaptain', { number: captain.number, defaultValue: 'Sign (captain #{{number}})' })}
                        </>
                      )}
                    </button>
                  ) : (
                    <div role="alert" className={cn(NOTICE.error, 'py-3 text-center text-sm')}>
                      {t('coinToss.selectCaptainFirst', 'Choose a captain first.')}
                    </div>
                  )}
                </div>

                {/* Coach Signature - only when hasCoach is enabled */}
                {hasCoach && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-stone-700">{t('coinToss.coachSignature', 'Coach signature')}</h4>
                    <button
                      type="button"
                      onClick={() => setOpenSignature(currentTeam === 'team1' ? 'team1-coach' : 'team2-coach')}
                      className={signBtn(!!coachSig)}
                    >
                      {coachSig ? (
                        <>
                          <span>{t('coinToss.coachSigned', 'Coach signed')}</span>
                          <Check size={18} aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          <PenLine size={18} aria-hidden="true" />
                          {t('coinToss.signCoach', 'Sign (coach)')}
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-center pt-1">
                  <button type="button" onClick={() => setOrderSignatureModal(null)} className={cn(modalPrimaryClass, 'min-h-12 min-w-40 text-base')}>
                    {t('coinToss.done', 'Done')}
                  </button>
                </div>
              </div>
            </KitModal>
          </div>
        )
      })()}

      {/* Delete Player Modal */}
      {deletePlayerModal && (() => {
        const isTeamA = deletePlayerModal.team === 'teamA'
        const currentTeam = isTeamA ? teamA : teamB

        return (
          <div className="ov-kit" style={{ position: 'relative', zIndex: 1001 }}>
            <KitModal
              open
              decision
              size="sm"
              dismissible={false}
              onClose={() => setDeletePlayerModal(null)}
              closeLabel={t('common.close')}
              title={t('coinToss.deletePlayerTitle', 'Delete the player?')}
              footer={(
                <>
                  <button type="button" className={modalCancelClass} onClick={() => setDeletePlayerModal(null)}>{t('common.cancel')}</button>
                  <button
                    type="button"
                    className={modalDangerClass}
                    onClick={() => {
                      if (currentTeam === 'team1') {
                        setTeam1Roster(list => list.filter((_, idx) => idx !== deletePlayerModal.index))
                      } else {
                        setTeam2Roster(list => list.filter((_, idx) => idx !== deletePlayerModal.index))
                      }
                      setDeletePlayerModal(null)
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </>
              )}
            >
              <p className="text-sm text-stone-600">
                {t('modal.deletePlayerConfirm')}
              </p>
            </KitModal>
          </div>
        )
      })()}

      {/* Notice Modal */}
      {noticeModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="sm"
            onClose={() => setNoticeModal(null)}
            closeLabel={t('common.close')}
          >
            <div className="flex flex-col items-center text-center" role="status">
              <h3 className="text-lg font-bold text-stone-900">{t('matchSetup.modals.notice')}</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-stone-600">
                {noticeModal.message}
              </p>
              <button type="button" onClick={() => setNoticeModal(null)} className={cn(modalPrimaryClass, 'mt-5 min-h-11 min-w-28')}>
                {t('common.ok')}
              </button>
            </div>
          </KitModal>
        </div>
      )}

      {/* Initialization Modal */}
      {initModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="md"
            onClose={() => { if (initModal.status === 'error') setInitModal(null) }}
            closeLabel={t('common.close')}
          >
            <div className="text-center">
              {/* Status Icon */}
              <div className="mb-4 flex justify-center">
                {(initModal.status === 'syncing' || initModal.status === 'checking' || initModal.status === 'verifying') && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                    <Loader2 size={28} className="animate-spin" aria-hidden="true" />
                  </span>
                )}
                {initModal.status === 'success' && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check size={28} aria-hidden="true" />
                  </span>
                )}
                {initModal.status === 'error' && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-bold text-red-600" aria-hidden="true">{'✕'}</span>
                )}
              </div>
              <h3 className="text-lg font-bold text-stone-900">
                {initModal.status === 'success' ? t('coinToss.initialized') :
                  initModal.status === 'error' ? t('coinToss.initError') :
                    initModal.status === 'checking' || initModal.status === 'check_results' ? t('coinToss.connectionChecks', 'Connection checks') :
                      t('coinToss.initializing')}
              </h3>

              {/* Connection checks checklist */}
              {(initModal.status === 'checking' || initModal.status === 'check_results') && initModal.checks && (
                <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200/70 text-left">
                  {Object.entries(initModal.checks).map(([key, check]) => {
                    const icons = { pending: '⏳', pass: '✓', warn: '⚠', fail: '✕', skip: '—' }
                    const tones = {
                      pending: 'bg-stone-100 text-stone-500',
                      pass: 'bg-emerald-100 text-emerald-700',
                      warn: 'bg-amber-100 text-amber-800',
                      fail: 'bg-red-50 text-red-700',
                      skip: 'bg-stone-100 text-stone-500'
                    }
                    return (
                      <li key={key} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', tones[check.status] || tones.pending)} title={check.status}>
                          {icons[check.status] || '⏳'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-stone-800">{check.label}</div>
                          {check.detail && (
                            <div className="text-xs text-stone-500">{check.detail}</div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* Proceed Anyway button for failed checks */}
              {initModal.status === 'check_results' && Object.values(initModal.checks).some(c => c.status === 'fail') && (
                <button
                  type="button"
                  onClick={() => { if (window.__coinTossCheckResolve) window.__coinTossCheckResolve() }}
                  className={cn(modalPrimaryClass, 'mt-4 min-h-11')}
                >
                  {t('coinToss.proceedAnyway', 'Proceed anyway')}
                </button>
              )}

              {/* Message */}
              {initModal.status !== 'checking' && initModal.status !== 'check_results' && (
                <p className={cn('mt-2 text-sm', initModal.status === 'error' ? 'font-medium text-red-700' : initModal.status === 'success' ? 'font-medium text-emerald-800' : 'text-stone-600')}>
                  {initModal.message}
                </p>
              )}

              {/* Error button */}
              {initModal.status === 'error' && (
                <button type="button" onClick={() => setInitModal(null)} className={cn(modalPrimaryClass, 'mt-5 min-h-11 min-w-28')}>
                  {t('common.back')}
                </button>
              )}
            </div>
          </KitModal>
        </div>
      )}

      {/* Birthdate Confirmation Modal */}
      {birthdateConfirmModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="md"
            onClose={() => setBirthdateConfirmModal(null)}
            closeLabel={t('common.close')}
            title={t('coinToss.birthdates.title', 'Are these dates of birth correct?')}
            footer={(
              <>
                <button type="button" onClick={() => setBirthdateConfirmModal(null)} className={modalCancelClass}>
                  {t('coinToss.birthdates.goBack', 'No, go back')}
                </button>
                <button type="button" onClick={birthdateConfirmModal.onConfirm} className={modalSaveClass}>
                  {t('coinToss.birthdates.continue', 'Yes, continue')}
                </button>
              </>
            )}
          >
            <div className={cn(NOTICE.warning, 'text-sm')}>
              {t('coinToss.birthdates.warning', 'These people were born on 1 January, which can mean an import error:')}
            </div>
            <ul className="mt-3 max-h-[200px] divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200/70">
              {birthdateConfirmModal.suspiciousDates.map((date, idx) => (
                <li key={idx} className="px-3 py-2 text-sm tabular-nums text-stone-800">
                  {date}
                </li>
              ))}
            </ul>
          </KitModal>
        </div>
      )}

      {/* Forfait Team Selection Modal */}
      {forfaitModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="sm"
            onClose={() => setForfaitModal(false)}
            closeLabel={t('common.close')}
            title={t('coinToss.forfait.title', 'Forfait')}
          >
            <p className="mb-4 text-sm text-stone-600">
              {t('coinToss.forfait.whichTeam', 'Which team forfeits?')}
            </p>
            <div className="flex flex-col gap-3">
              {/* The team buttons wear the team colours (frozen) */}
              <button
                type="button"
                onClick={() => { setForfaitModal(false); setForfaitTypeModal('team1') }}
                className={cn('min-h-14 rounded-xl px-6 text-base font-semibold', FOCUS_RING)}
                style={{ background: team1Color, color: isBrightColor(team1Color) ? '#000' : '#fff' }}
              >
                {team1Name}
              </button>
              <button
                type="button"
                onClick={() => { setForfaitModal(false); setForfaitTypeModal('team2') }}
                className={cn('min-h-14 rounded-xl px-6 text-base font-semibold', FOCUS_RING)}
                style={{ background: team2Color, color: isBrightColor(team2Color) ? '#000' : '#fff' }}
              >
                {team2Name}
              </button>
            </div>
          </KitModal>
        </div>
      )}

      {/* Forfait Reason Selection Modal */}
      {forfaitTypeModal && (
        <div className="ov-kit" style={DIALOG_LAYER}>
          <KitModal
            open
            decision
            dismissible={false}
            size="sm"
            onClose={() => { setForfaitTypeModal(null); setForfaitType('no_show'); setForfaitPlayerNumber('') }}
            closeLabel={t('common.close')}
            title={t('coinToss.forfait.reasonTitle', 'Forfait reason')}
          >
            <p className="mb-4 text-sm text-stone-600">
              {t('coinToss.forfait.why', { team: forfaitTypeModal === 'team1' ? team1Name : team2Name, defaultValue: 'Why does {{team}} forfeit?' })}
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="secondary"
                size="xl"
                className="min-h-14 text-base"
                onClick={() => {
                  setForfaitType('no_show')
                  setForfaitPlayerNumber('')
                  setForfaitTypeModal(null)
                  setForfaitConfirmModal(forfaitTypeModal)
                }}
              >
                {t('coinToss.forfait.noShow', 'No show')}
              </Button>
              <Button
                variant="secondary"
                size="xl"
                className="min-h-14 text-base"
                onClick={() => {
                  setForfaitType('injury')
                  setForfaitTypeModal(null)
                  setForfaitConfirmModal(forfaitTypeModal)
                }}
              >
                {t('coinToss.forfait.injury', 'Injury')}
              </Button>
            </div>
          </KitModal>
        </div>
      )}

      {/* Forfait Confirmation Modal */}
      {forfaitConfirmModal && (() => {
        const closeForfaitConfirm = () => { setForfaitConfirmModal(null); setForfaitType('no_show'); setForfaitPlayerNumber('') }
        return (
          <div className="ov-kit" style={DIALOG_LAYER}>
            <KitModal
              open
              decision
              dismissible={false}
              size="md"
              onClose={closeForfaitConfirm}
              closeLabel={t('common.close')}
              title={t('coinToss.forfait.confirmTitle', { team: forfaitConfirmModal === 'team1' ? team1Name : team2Name, defaultValue: '{{team}} forfeits?' })}
              footer={(
                <>
                  <button type="button" onClick={closeForfaitConfirm} className={modalCancelClass}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" onClick={() => handleForfait(forfaitConfirmModal)} className={modalDangerClass}>
                    {t('coinToss.forfait.confirm', 'Confirm forfait')}
                  </button>
                </>
              )}
            >
              <p className="text-sm text-stone-600">
                {t('coinToss.forfait.result', { team: forfaitConfirmModal === 'team1' ? team2Name : team1Name, defaultValue: '{{team}} wins 2-0 (21-0, 21-0).' })}
              </p>

              {/* Player number input for injury forfait */}
              {forfaitType === 'injury' && (
                <div className="mt-4">
                  <label htmlFor="ob-forfait-player" className={FIELD_LABEL}>
                    {t('coinToss.forfait.injuredPlayer', 'Injured player number')}
                  </label>
                  <input
                    id="ob-forfait-player"
                    type="text"
                    inputMode="numeric"
                    value={forfaitPlayerNumber}
                    onChange={e => setForfaitPlayerNumber(e.target.value)}
                    placeholder="#"
                    className={cn(FIELD_INPUT, 'max-w-[140px] tabular-nums')}
                  />
                </div>
              )}

              {/* FIVB remark preview (the remark text goes onto the scoresheet as is) */}
              <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs leading-snug text-stone-600">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t('coinToss.forfait.remark', 'Remark')}</div>
                {forfaitType === 'injury'
                  ? `Team ${forfaitConfirmModal === 'team1' ? team1Name : team2Name} forfeits the match due to injury (injury as confirmed by the official medical personnel) of player # ${forfaitPlayerNumber || '...'}. Appropriate official medical personnel came to the court. Both teams and players were present`
                  : `Team ${forfaitConfirmModal === 'team1' ? team1Name : team2Name} forfeits the match due to no show`
                }
              </div>
            </KitModal>
          </div>
        )
      })()}

      {/* Signature Pad */}
      <SignaturePad
        open={openSignature !== null}
        onClose={() => setOpenSignature(null)}
        onSave={handleSignatureSave}
        title={openSignature === 'team1-captain' ? t('coinToss.captainSignatureTeam', { team: t('common.team1') }) :
              openSignature === 'team2-captain' ? t('coinToss.captainSignatureTeam', { team: t('common.team2') }) :
              openSignature === 'team1-coach' ? t('coinToss.coachSignatureTeam', { team: t('common.team1') }) :
              openSignature === 'team2-coach' ? t('coinToss.coachSignatureTeam', { team: t('common.team2') }) : t('signature.title')}
        existingSignature={
          openSignature === 'team1-captain' ? team1CaptainSignature :
          openSignature === 'team2-captain' ? team2CaptainSignature :
          openSignature === 'team1-coach' ? team1CoachSignature :
          openSignature === 'team2-coach' ? team2CoachSignature : null
        }
        phone={phoneSignFor(openSignature)}
        readOnly={
          (openSignature === 'team1-captain' && !!team1CaptainSignature) ||
          (openSignature === 'team2-captain' && !!team2CaptainSignature) ||
          (openSignature === 'team1-coach' && !!team1CoachSignature) ||
          (openSignature === 'team2-coach' && !!team2CoachSignature)
        }
      />
    </div>
  )
}
