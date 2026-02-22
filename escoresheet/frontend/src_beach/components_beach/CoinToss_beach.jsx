import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { db } from '../db_beach/db_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import SignaturePad from './SignaturePad_beach'
import Modal from './Modal_beach'
import MenuList from './MenuList_beach'
import CountryFlag from './CountryFlag_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { exportMatchData } from '../utils_beach/backupManager_beach'
import { uploadBackupToCloud, uploadLogsToCloud } from '../utils_beach/logger_beach'
import { uploadScoresheetAsync } from '../utils_beach/scoresheetUploader_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'

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
  const { t } = useTranslation()
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
      if (supabase && match.seed_key) {
        try {
          const isTeam1 = teamType === 'team1'
          const teamKey = isTeam1 ? 'team1' : 'team2'
          const playersKey = isTeam1 ? 'players_team1' : 'players_team2'
          const teamName = isTeam1 ? team1Name : team2Name
          const shortName = isTeam1 ? team1ShortName : team2ShortName
          const color = isTeam1 ? team1Color : team2Color

          // Update matches table
          const { data: supabaseMatch } = await supabase
            .from('matches')
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

            await supabase
              .from('match_live_state')
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

  function handleSignatureSave(signatureImage) {
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

      // Create coin_toss event if it doesn't exist
      if (!existingCoinTossEvent) {
        await db.events.add({
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
            external_id: 'coin_toss_' + match.seed_key, // Unique ID for this event
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
              winner: coinTossWinner
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
          external_id: String(firstSetId),
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
    if (!isTest && supabase && match?.seed_key) {
      try {
        // First get the Supabase match UUID from external_id
        const { data: supabaseMatch, error: lookupError } = await supabase
          .from('matches')
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

          const { error: insertError } = await supabase
            .from('match_live_state')
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
              // Stats
              timeouts_a: 0,
              timeouts_b: 0,
              subs_a: 0,
              subs_b: 0,
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

    // Show initialization modal and wait for sync
    setInitModal({ status: 'syncing', message: 'Syncing match data...' })

    // Wait for sync queue to process (poll for completion)
    const maxAttempts = 30 // 15 seconds max
    let attempts = 0
    let syncComplete = false

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

    if (!match?.test && supabase) {
      setInitModal({ status: 'verifying', message: 'Verifying match status...' })

      try {
        // Get the match's external_id (seed_key) to look up in Supabase
        const localMatch = await db.matches.get(matchId)
        const seedKey = localMatch?.seed_key

        if (seedKey) {
          const { data: supabaseMatch, error } = await supabase
            .from('matches')
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

    // Short delay to show success message
    await new Promise(resolve => setTimeout(resolve, 1000))

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


  // Volleyball images - responsive size
  const volleyballImage = (
    <div style={{
      width: '15vmin', height: '15vmin', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <img
        src={ballImage}        alt="Volleyball"
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
    return <div className="setup"><p>{t('common.loading')}</p></div>
  }

  return (
    <div className="setup" style={{
      width: '95vw',
      maxWidth: '100vw',
      alignSelf: 'flex-start',
      marginTop: '10px',
      padding: isCompact ? '0 12px' : '5px 24px',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCompact ? 16 : 24 }}>
        <button className="secondary" onClick={onBack}>← Back</button>
        <h1 style={{ margin: 0, fontSize: '50px', fontWeight: 700, textAlign: 'center' }}>Coin Toss</h1>
        <button
          onClick={() => setForfaitModal(true)}
          style={{
            background: 'transparent',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          🛑 Forfait
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: sizes.gap, marginBottom: sizes.marginBottom, alignItems: 'start' }}>
        {/* Team A */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 2, fontSize: sizes.headerFont, fontWeight: 700, textAlign: 'center' }}>{t('coinToss.teamA')}</h1>
          <div style={{ marginBottom: isCompact ? 12 : 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: isCompact ? '40px' : '80px', width: '100%' }}>
            <div
              style={{
                background: teamAInfo.color,
                color: isBrightColor(teamAInfo.color) ? '#000' : '#fff',
                flex: 1, padding: sizes.teamButtonPadding, fontSize: sizes.teamButtonFont, width: '100%',
                fontWeight: 600, border: 'none', borderRadius: '8px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
              title={teamAInfo.name}
            >
              {teamAInfo.country && <CountryFlag countryCode={teamAInfo.country} size="md" />}
              {getDisplayName(teamAInfo.name)}
            </div>
          </div>
          {/* Coin Toss Winner Toggle for Team A */}
          <button
            onClick={() => setCoinTossWinner(teamA)}
            style={{
              padding: '6px 12px',
              marginBottom: '40px',
              fontSize: '13px',
              fontWeight: 600,
              background: coinTossWinner === teamA ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: coinTossWinner === teamA ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: coinTossWinner === teamA ? '#22c55e' : 'var(--muted)',
              cursor: 'pointer'
            }}
          >
            {coinTossWinner === teamA ? 'Won Coin Toss ✓' : 'Won Coin Toss'}
          </button>

          <div style={{ marginBottom: isCompact ? 12 : 16, display: 'flex', justifyContent: 'center', height: sizes.volleyballSize, alignItems: 'center' }}>
            {serveA ? volleyballImage : volleyballPlaceholder}
          </div>

          {/* Team A Order & Signature Button */}
          <div style={{ marginTop: isCompact ? 16 : 20, display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setOrderSignatureModal('teamA')}
              className={`sign ${teamACaptainSig ? 'signed' : ''}`}
              style={{ fontSize: sizes.signButtonFont, padding: sizes.signButtonPadding, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Order & Signature {teamACaptainSig ? (hasCoach && !teamACoachSig ? '½' : '✓') : ''}
            </button>
          </div>
        </div>

        {/* Middle buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isCompact ? 12 : 35, alignItems: 'center', alignSelf: 'stretch', padding: '0 4px' }}>
          <div style={{ height: isCompact ? '40px' : '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: isCompact ? '24px' : '52px' }}>
            <button className="secondary" onClick={switchTeams} style={{ padding: sizes.switchButtonPadding, fontSize: '20px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              ⇄ Switch Teams
            </button>
          </div>
          <div style={{ height: sizes.volleyballSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button className="secondary" onClick={switchServe} style={{ padding: sizes.switchButtonPadding, fontSize: '20px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              ⇄ Switch Serve
            </button>
          </div>
        </div>

        {/* Team B */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 2, fontSize: sizes.headerFont, fontWeight: 700, textAlign: 'center' }}>{t('coinToss.teamB')}</h1>
          <div style={{ marginBottom: isCompact ? 12 : 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: isCompact ? '40px' : '80px', width: '100%' }}>
            <div
              style={{
                background: teamBInfo.color,
                color: isBrightColor(teamBInfo.color) ? '#000' : '#fff',
                flex: 1, padding: sizes.teamButtonPadding, fontSize: sizes.teamButtonFont, width: '100%',
                fontWeight: 600, border: 'none', borderRadius: '8px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
              title={teamBInfo.name}
            >
              {teamBInfo.country && <CountryFlag countryCode={teamBInfo.country} size="md" />}
              {getDisplayName(teamBInfo.name)}
            </div>
          </div>
          {/* Coin Toss Winner Toggle for Team B */}
          <button
            onClick={() => setCoinTossWinner(teamB)}
            style={{
              padding: '6px 12px',
              marginBottom: '40px',
              fontSize: '13px',
              fontWeight: 600,
              background: coinTossWinner === teamB ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: coinTossWinner === teamB ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: coinTossWinner === teamB ? '#22c55e' : 'var(--muted)',
              cursor: 'pointer'
            }}
          >
            {coinTossWinner === teamB ? 'Won Coin Toss ✓' : 'Won Coin Toss'}
          </button>

          <div style={{ marginBottom: isCompact ? 12 : 16, display: 'flex', justifyContent: 'center', height: sizes.volleyballSize, alignItems: 'center' }}>
            {serveB ? volleyballImage : volleyballPlaceholder}
          </div>

          {/* Team B Order & Signature Button */}
          <div style={{ marginTop: isCompact ? 16 : 20, display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setOrderSignatureModal('teamB')}
              className={`sign ${teamBCaptainSig ? 'signed' : ''}`}
              style={{ fontSize: sizes.signButtonFont, padding: sizes.signButtonPadding, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Order & Signature {teamBCaptainSig ? (hasCoach && !teamBCoachSig ? '½' : '✓') : ''}
            </button>
          </div>
        </div>
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

        const renderServiceLine = (roman, teamLabel, player) => {
          const data = formatPlayer(teamLabel, player)
          return (
            <>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{roman}:</span>
              <span style={{ textAlign: 'center' }}>{data.teamLabel}</span>
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={data.isCaptain ? {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  border: '2px solid var(--accent)',
                  fontWeight: 700
                } : {}}>{data.num}</span>
              </span>
              <span>{data.nameStr}</span>
            </>
          )
        }

        return (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: sizes.marginBottom }}>
            <div style={{
              padding: '16px 24px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              width: 'auto'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 700, textAlign: 'center' }}>Service Order</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: '8px 16px', fontSize: '14px', alignItems: 'center' }}>
                {renderServiceLine('I', servingTeamLabel, servingFirstPlayer)}
                {renderServiceLine('II', receivingTeamLabel, receivingFirstPlayer)}
                {renderServiceLine('III', servingTeamLabel, servingSecondPlayer)}
                {renderServiceLine('IV', receivingTeamLabel, receivingSecondPlayer)}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirm Button */}

      <div style={{ display: 'flex', justifyContent: 'center', margin: '1px 0' }}>
        <MenuList
          buttonLabel={isCompact ? "📄" : "📄 Scoresheet"}
          buttonClassName="secondary"
          buttonStyle={{
            background: '#22c55e',
            color: '#000',
            fontWeight: 600,
            padding: isCompact ? '4px 8px' : '8px 16px',
            fontSize: isCompact ? '12px' : '14px'
          }}
          showArrow={true}
          position="center"
          items={[
            {
              key: 'scoresheet-preview',
              label: '🔍 Preview',
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
                  const scoresheetWindow = window.open('/scoresheet_beach.html', 'scoresheet_beach', 'width=1200,height=900')

                  if (!scoresheetWindow) {
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
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: sizes.marginBottom }}>
        {isCoinTossConfirmed ? (
          <button onClick={handleReturnToMatch} style={{ padding: sizes.confirmButtonPadding, fontSize: sizes.confirmButtonFont }}>
            Return to Match
          </button>
        ) : (
          <button onClick={confirmCoinToss} style={{ padding: sizes.confirmButtonPadding, fontSize: sizes.confirmButtonFont }}>
            Confirm Result
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

        return (
          <Modal
            title={`Roster - ${teamInfo.name}`}
            open={true}
            onClose={handleCloseOrModify}
            width={800}
            hideCloseButton={true}
          >
            <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 16px' }}>
              {/* Players Section */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Players ({roster.length})</h4>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setAddPlayerModal(rosterModal)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    Add Player
                  </button>
                </div>
                <table className="roster-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>{t('roster.number')}</th>
                      <th>{t('roster.name')}</th>
                      {manageDob && <th style={{ width: '90px' }}>{t('roster.dob')}</th>}
                      <th>{t('coinToss.captain')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterEntries.map(({ player: p, index: originalIdx }) => {
                      // Check for duplicate jersey number
                      const isDuplicate = p.number != null && p.number !== '' &&
                        roster.some((other, idx) => idx !== originalIdx && other.number === p.number)

                      return (
                        <tr key={`roster-${originalIdx}`}>
                          <td style={{ verticalAlign: 'middle', padding: '6px' }}>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1" max="99"
                              value={p.number ?? ''}
                              onChange={e => {
                                const val = e.target.value ? Number(e.target.value) : null
                                if (val !== null && (val < 1 || val > 99)) return
                                const updated = [...roster]
                                updated[originalIdx] = { ...updated[originalIdx], number: val }
                                setRoster(updated)
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                              title={isDuplicate ? t('roster.duplicateNumber') : ''}
                              style={{
                                width: p.isCaptain ? '24px' : '28px',
                                height: p.isCaptain ? '24px' : 'auto',
                                padding: '0', margin: '0',
                                background: isDuplicate ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                                border: isDuplicate ? '2px solid #ef4444' : (p.isCaptain ? '2px solid var(--accent)' : 'none'),
                                borderRadius: p.isCaptain ? '50%' : (isDuplicate ? '4px' : '0'),
                                color: isDuplicate ? '#ef4444' : 'var(--text)',
                                textAlign: 'center', fontSize: '12px'
                              }}
                            />
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '6px' }}>
                            <input
                              type="text"
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
                              style={{ width: '100%', padding: '0', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '12px' }}
                            />
                          </td>
                          {manageDob && <td style={{ verticalAlign: 'middle', padding: '6px', width: '90px' }}>
                            <input
                              type="date"
                              value={p.dob ? formatDateToISO(p.dob) : ''}
                              onChange={e => {
                                const value = e.target.value ? formatDateToDDMMYYYY(e.target.value) : ''
                                const updated = [...roster]
                                updated[originalIdx] = { ...updated[originalIdx], dob: value }
                                setRoster(updated)
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                              className="coin-toss-date-input"
                              style={{ width: '100%', padding: '0', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '12px' }}
                            />
                          </td>}
                          <td style={{ verticalAlign: 'middle', padding: '6px' }}>
                            <div
                              onClick={() => {
                                const updated = roster.map((player, idx) => ({
                                  ...player,
                                  isCaptain: idx === originalIdx ? !player.isCaptain : false
                                }))
                                setRoster(updated)
                              }}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: p.isCaptain ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.3)',
                                background: p.isCaptain ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: p.isCaptain ? '#22c55e' : 'rgba(255,255,255,0.3)',
                                userSelect: 'none',
                                margin: '0 auto'
                              }}
                            >
                              C
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '4px' }}>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setDeletePlayerModal({ team: rosterModal, index: originalIdx })}
                              style={{ padding: '2px', fontSize: '10px', minWidth: 'auto', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Signatures Section - Beach volleyball: captain only */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16, marginTop: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>{t('matchSetup.captainSignature')}</h4>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`sign ${captainSig ? 'signed' : ''}`}
                    onClick={() => setRosterModalSignature('captain')}
                    style={{ padding: '8px 16px', fontSize: '13px', flex: 1, minWidth: '120px' }}
                  >
                    Captain {captainSig ? '✓' : ''}
                  </button>
                </div>
              </div>

              {/* Signature Pad Modal */}
              {rosterModalSignature && (
                <div style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
                }}>
                  <div style={{
                    background: '#111827', padding: 16, borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)', maxWidth: '90vw'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0' }}>
                      {t('coinToss.captainSignatureTeam', { team: teamInfo.name })}
                    </h3>
                    <SignaturePad
                      onSave={(sig) => {
                        setCaptainSig(sig)
                        setRosterModalSignature(null)
                      }}
                      onCancel={() => setRosterModalSignature(null)}
                      title={t('matchSetup.captainSignature')}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Custom Close/Modify Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {hasChanges && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    // Revert to original data
                    if (originalRosterDataRef.current) {
                      setRoster(JSON.parse(JSON.stringify(originalRosterDataRef.current.roster)))
                    }
                    originalRosterDataRef.current = null
                    setRosterModalSignature(null)
                    setRosterModal(null)
                  }}
                  style={{ padding: '8px 20px', fontSize: '14px' }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className={hasChanges ? 'primary' : 'secondary'}
                onClick={handleCloseOrModify}
                style={{ padding: '8px 20px', fontSize: '14px' }}
              >
                {hasChanges ? 'Modify' : 'Close'}
              </button>
            </div>
          </Modal>
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

        return (
          <Modal
            title={`Add Player - ${isTeamA ? 'Team A' : 'Team B'}`}
            open={true}
            onClose={() => setAddPlayerModal(null)}
            width={500}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Jersey Number</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={num}
                  onChange={e => currentTeam === 'team1' ? setTeam1Num(e.target.value) : setTeam2Num(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>{t('roster.lastName')}</label>
                <input
                  type="text"
                  className="capitalize"
                  value={last}
                  onChange={e => currentTeam === 'team1' ? setTeam1Last(e.target.value) : setTeam2Last(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>{t('roster.firstName')}</label>
                <input
                  type="text"
                  className="capitalize"
                  value={first}
                  onChange={e => currentTeam === 'team1' ? setTeam1First(e.target.value) : setTeam2First(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                />
              </div>
              {manageDob && <div>
                <label style={{ display: 'block', marginBottom: 4 }}>{t('roster.dateOfBirth')}</label>
                <input
                  type="date"
                  value={dob ? formatDateToISO(dob) : ''}
                  onChange={e => {
                    const value = e.target.value ? formatDateToDDMMYYYY(e.target.value) : ''
                    currentTeam === 'team1' ? setTeam1Dob(value) : setTeam2Dob(value)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                  style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                />
              </div>}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={captain}
                    onChange={e => currentTeam === 'team1' ? setTeam1CaptainBool(e.target.checked) : setTeam2CaptainBool(e.target.checked)}
                  />
                  <span>{t('coinToss.captain')}</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="secondary" onClick={() => setAddPlayerModal(null)}>{t('common.cancel')}</button>
                <button onClick={() => {
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
                }}>Add Player</button>
              </div>
            </div>
          </Modal>
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
          setRoster(prev => prev.map((p, i) => ({
            ...p,
            isCaptain: i === index
          })))
          // Clear signature when captain changes
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

        return (
          <Modal
            title={`Order & Signature - Team ${teamLabel}`}
            open={true}
            onClose={() => setOrderSignatureModal(null)}
            width={550}
          >
            <div style={{ padding: '16px' }}>
              {/* Team Name */}
              <div style={{
                marginBottom: '20px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                {roster.map((p, index) => {
                  const isFirstServe = firstServe === p.number || (!firstServe && index === 0)
                  return (
                    <div key={index} style={{
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: p.isCaptain ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px'
                    }}>
                      {/* Row 1: Number toggle + Names */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                        {/* Number toggle */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[1, 2].map(num => (
                            <button
                              key={num}
                              onClick={() => handleNumberToggle(index, num)}
                              style={{
                                width: '36px',
                                height: '36px',
                                fontSize: '16px',
                                fontWeight: 700,
                                background: p.number === num ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)',
                                color: p.number === num ? '#000' : 'var(--text)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0
                              }}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                        {/* Last Name */}
                        <input
                          type="text"
                          placeholder="Last Name"
                          value={p.lastName || ''}
                          onChange={e => handlePlayerUpdate(index, 'lastName', e.target.value)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '14px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: 'var(--text)',
                            textTransform: 'capitalize'
                          }}
                        />
                        {/* First Name */}
                        <input
                          type="text"
                          placeholder="First Name"
                          value={p.firstName || ''}
                          onChange={e => handlePlayerUpdate(index, 'firstName', e.target.value)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '14px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: 'var(--text)',
                            textTransform: 'capitalize'
                          }}
                        />
                      </div>
                      {/* Row 2: Captain + First Serve toggles */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => handleCaptainToggle(index)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            background: p.isCaptain ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            border: p.isCaptain ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '8px',
                            color: p.isCaptain ? '#22c55e' : 'var(--text)',
                            cursor: 'pointer'
                          }}
                        >
                          {p.isCaptain ? 'Captain ✓' : 'Captain'}
                        </button>
                        <button
                          onClick={() => handleFirstServeToggle(p.number)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            background: isFirstServe ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            border: isFirstServe ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '8px',
                            color: isFirstServe ? '#3b82f6' : 'var(--text)',
                            cursor: 'pointer'
                          }}
                        >
                          {isFirstServe ? '🏐 First Serve ✓' : '🏐 First Serve'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Captain Signature */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--muted)' }}>{t('matchSetup.captainSignature')}</h4>
                {captain ? (
                  <button
                    onClick={handleOpenSignature}
                    className={`sign ${captainSig ? 'signed' : ''}`}
                    style={{
                      width: '100%',
                      padding: '16px',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {captainSig ? (
                      <>
                        <span>Signed by #{captain.number}</span>
                        <span style={{ color: '#22c55e' }}>✓</span>
                      </>
                    ) : (
                      <>Sign (Captain #{captain.number})</>
                    )}
                  </button>
                ) : (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: '#ef4444',
                    fontSize: '14px'
                  }}>
                    Please select a captain first
                  </div>
                )}
              </div>

              {/* Coach Signature - only when hasCoach is enabled */}
              {hasCoach && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--muted)' }}>Coach Signature</h4>
                  <button
                    onClick={() => setOpenSignature(currentTeam === 'team1' ? 'team1-coach' : 'team2-coach')}
                    className={`sign ${(currentTeam === 'team1' ? team1CoachSignature : team2CoachSignature) ? 'signed' : ''}`}
                    style={{
                      width: '100%',
                      padding: '16px',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {(currentTeam === 'team1' ? team1CoachSignature : team2CoachSignature) ? (
                      <>
                        <span>Coach Signed</span>
                        <span style={{ color: '#22c55e' }}>✓</span>
                      </>
                    ) : (
                      <>Sign (Coach)</>
                    )}
                  </button>
                </div>
              )}

              {/* Close Button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                <button
                  onClick={() => setOrderSignatureModal(null)}
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
                  Done
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Delete Player Modal */}
      {deletePlayerModal && (() => {
        const isTeamA = deletePlayerModal.team === 'teamA'
        const currentTeam = isTeamA ? teamA : teamB
        const roster = currentTeam === 'team1' ? team1Roster : team2Roster
        const player = roster[deletePlayerModal.index]
        const playerName = player ? `${player.lastName || ''} ${player.firstName || ''}`.trim() || `Player #${player.number || '?'}` : 'Player'

        return (
          <Modal
            title="Delete Player"
            open={true}
            onClose={() => setDeletePlayerModal(null)}
            width={400}
          >
            <div style={{ padding: '16px 0' }}>
              <p style={{ marginBottom: 16 }}>
                {t('modal.deletePlayerConfirm')}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="secondary" onClick={() => setDeletePlayerModal(null)}>{t('common.cancel')}</button>
                <button onClick={() => {
                  if (currentTeam === 'team1') {
                    setTeam1Roster(list => list.filter((_, idx) => idx !== deletePlayerModal.index))
                  } else {
                    setTeam2Roster(list => list.filter((_, idx) => idx !== deletePlayerModal.index))
                  }
                  setDeletePlayerModal(null)
                }}>{t('common.delete')}</button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Notice Modal */}
      {noticeModal && (
        <Modal
          title="Notice"
          open={true}
          onClose={() => setNoticeModal(null)}
          width={400}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)', whiteSpace: 'pre-line' }}>
              {noticeModal.message}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setNoticeModal(null)}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                  background: 'var(--accent)', color: '#000',
                  border: 'none', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Initialization Modal */}
      {initModal && (
        <Modal
          title={initModal.status === 'success' ? 'Match Initialized' :
            initModal.status === 'error' ? 'Initialization Error' :
              'Initializing Match'}
          open={true}
          onClose={initModal.status === 'error' ? () => setInitModal(null) : undefined}
          width={450}
          hideCloseButton={initModal.status !== 'error'}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {/* Status Icon */}
            <div style={{ marginBottom: '20px' }}>
              {initModal.status === 'syncing' && (
                <div style={{
                  width: '60px', height: '60px', margin: '0 auto',
                  border: '4px solid rgba(59, 130, 246, 0.3)',
                  borderTop: '4px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {initModal.status === 'verifying' && (
                <div style={{
                  width: '60px', height: '60px', margin: '0 auto',
                  border: '4px solid rgba(234, 179, 8, 0.3)',
                  borderTop: '4px solid #eab308',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {initModal.status === 'success' && (
                <div style={{
                  width: '60px', height: '60px', margin: '0 auto',
                  background: 'rgba(34, 197, 94, 0.2)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '32px', color: '#22c55e' }}>✓</span>
                </div>
              )}
              {initModal.status === 'error' && (
                <div style={{
                  width: '60px', height: '60px', margin: '0 auto',
                  background: 'rgba(239, 68, 68, 0.2)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '32px', color: '#ef4444' }}>✕</span>
                </div>
              )}
            </div>

            {/* Message */}
            <p style={{
              marginBottom: '24px',
              fontSize: '16px',
              color: initModal.status === 'error' ? '#ef4444' :
                initModal.status === 'success' ? '#22c55e' : 'var(--text)'
            }}>
              {initModal.message}
            </p>

            {/* Error button */}
            {initModal.status === 'error' && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setInitModal(null)}
                  style={{
                    padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444',
                    border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer'
                  }}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Birthdate Confirmation Modal */}
      {birthdateConfirmModal && (
        <Modal
          title="Confirm Birthdates"
          open={true}
          onClose={() => setBirthdateConfirmModal(null)}
          width={500}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px' }}>
            <p style={{ marginBottom: '16px', fontSize: '14px', color: '#eab308' }}>
              The following people have birthdates on January 1st, which may indicate import errors:
            </p>
            <div style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {birthdateConfirmModal.suspiciousDates.map((date, idx) => (
                <div key={idx} style={{ fontSize: '13px', color: 'var(--text)', padding: '4px 0' }}>
                  {date}
                </div>
              ))}
            </div>
            <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--text)' }}>
              Are these dates correct?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setBirthdateConfirmModal(null)}
                className="secondary"
                style={{ padding: '12px 24px', fontSize: '14px' }}
              >
                No, go back
              </button>
              <button
                onClick={birthdateConfirmModal.onConfirm}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                  background: 'var(--accent)', color: '#000',
                  border: 'none', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                Yes, continue
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Forfait Team Selection Modal */}
      {forfaitModal && (
        <Modal
          title="Forfait"
          open={true}
          onClose={() => setForfaitModal(false)}
          width={400}
        >
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--muted)' }}>
              Which team forfeits?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => { setForfaitModal(false); setForfaitTypeModal('team1') }}
                style={{
                  padding: '14px 24px', fontSize: '16px', fontWeight: 600,
                  background: team1Color, color: isBrightColor(team1Color) ? '#000' : '#fff',
                  border: 'none', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                {team1Name}
              </button>
              <button
                onClick={() => { setForfaitModal(false); setForfaitTypeModal('team2') }}
                style={{
                  padding: '14px 24px', fontSize: '16px', fontWeight: 600,
                  background: team2Color, color: isBrightColor(team2Color) ? '#000' : '#fff',
                  border: 'none', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                {team2Name}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Forfait Reason Selection Modal */}
      {forfaitTypeModal && (
        <Modal
          title="Forfait Reason"
          open={true}
          onClose={() => { setForfaitTypeModal(null); setForfaitType('no_show'); setForfaitPlayerNumber('') }}
          width={400}
        >
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <p style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--muted)' }}>
              Why is {forfaitTypeModal === 'team1' ? team1Name : team2Name} forfeiting?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => {
                  setForfaitType('no_show')
                  setForfaitPlayerNumber('')
                  setForfaitTypeModal(null)
                  setForfaitConfirmModal(forfaitTypeModal)
                }}
                className="secondary"
                style={{ padding: '14px 24px', fontSize: '16px', fontWeight: 600 }}
              >
                No Show
              </button>
              <button
                onClick={() => {
                  setForfaitType('injury')
                  setForfaitTypeModal(null)
                  setForfaitConfirmModal(forfaitTypeModal)
                }}
                className="secondary"
                style={{ padding: '14px 24px', fontSize: '16px', fontWeight: 600 }}
              >
                Injury
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Forfait Confirmation Modal */}
      {forfaitConfirmModal && (
        <Modal
          title="Confirm Forfait"
          open={true}
          onClose={() => { setForfaitConfirmModal(null); setForfaitType('no_show'); setForfaitPlayerNumber('') }}
          width={450}
        >
          <div style={{ padding: '16px' }}>
            <p style={{ marginBottom: '8px', fontSize: '16px', fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>
              {forfaitConfirmModal === 'team1' ? team1Name : team2Name} forfeits.
            </p>
            <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--muted)', textAlign: 'center' }}>
              {forfaitConfirmModal === 'team1' ? team2Name : team1Name} wins 2-0 (21-0, 21-0).
            </p>

            {/* Player number input for injury forfait */}
            {forfaitType === 'injury' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
                  Injured player number
                </label>
                <input
                  type="text"
                  value={forfaitPlayerNumber}
                  onChange={e => setForfaitPlayerNumber(e.target.value)}
                  placeholder="#"
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: '14px',
                    border: '1px solid var(--muted)', borderRadius: '6px',
                    background: 'var(--panel)', color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {/* FIVB remark preview */}
            <div style={{
              padding: '10px 12px', marginBottom: '16px', fontSize: '12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', color: 'var(--muted)', lineHeight: 1.4
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--text)' }}>Remark:</div>
              {forfaitType === 'injury'
                ? `Team ${forfaitConfirmModal === 'team1' ? team1Name : team2Name} forfeits the match due to injury (injury as confirmed by the official medical personnel) of player # ${forfaitPlayerNumber || '...'}. Appropriate official medical personnel came to the court. Both teams and players were present`
                : `Team ${forfaitConfirmModal === 'team1' ? team1Name : team2Name} forfeits the match due to no show`
              }
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => { setForfaitConfirmModal(null); setForfaitType('no_show'); setForfaitPlayerNumber('') }}
                className="secondary"
                style={{ padding: '12px 24px', fontSize: '14px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleForfait(forfaitConfirmModal)}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: 600,
                  background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                Confirm Forfait
              </button>
            </div>
          </div>
        </Modal>
      )}

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
