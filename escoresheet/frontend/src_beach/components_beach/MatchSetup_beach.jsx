import { useState, useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import SignaturePad from './SignaturePad_beach'
import Modal from './Modal_beach'
import mikasaVolleyball from '../mikasa_BV550C_beach.png'
// Beach volleyball: No roster import needed

export default function MatchSetup({ onStart, matchId, onReturn, onGoHome, showCoinToss = false, onCoinTossClose }) {
  const [team_1, setTeam_1] = useState('Team 1')
  const [team_2, setTeam_2] = useState('Team 2')

  // Match info fields
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [eventName, setEventName] = useState('')
  const [site, setSite] = useState('')
  const [beach, setBeach] = useState('')
  const [court, setCourt] = useState('')
  const [matchPhase, setMatchPhase] = useState('main_draw') // main_draw | qualification
  const [matchRound, setMatchRound] = useState('pool_play') // pool_play | double_elimination | winner_bracket | class | semi_final | finals
  const [matchNumber, setMatchNumber] = useState('')
  const [matchGender, setMatchGender] = useState('men') // men | women
  const [matchWithCoaches, setMatchWithCoaches] = useState(false) // Toggle for coaches
  const [team_1Color, setTeam_1Color] = useState('#89bdc3') // Light cyan
  const [team_2Color, setTeam_2Color] = useState('#323134') // Dark gray
  const [team_1Country, setTeam_1Country] = useState('SUI')
  const [team_2Country, setTeam_2Country] = useState('SUI')

  // Rosters
  const [team_1Roster, setTeam_1Roster] = useState([])
  const [team_2Roster, setTeam_2Roster] = useState([])
  // Direct player inputs for main view (beach volleyball: exactly 2 players)
  const [team_1Player1, setTeam_1Player1] = useState({ firstName: '', lastName: '' })
  const [team_1Player2, setTeam_1Player2] = useState({ firstName: '', lastName: '' })
  const [team_2Player1, setTeam_2Player1] = useState({ firstName: '', lastName: '' })
  const [team_2Player2, setTeam_2Player2] = useState({ firstName: '', lastName: '' })
  // Coach names
  const [team_1CoachName, setTeam_1CoachName] = useState({ firstName: '', lastName: '' })
  const [team_2CoachName, setTeam_2CoachName] = useState({ firstName: '', lastName: '' })
  // Legacy state (kept for compatibility with existing code)
  const [team_1Num, setTeam_1Num] = useState('')
  const [team_1First, setTeam_1First] = useState('')
  const [team_1Last, setTeam_1Last] = useState('')
  const [team_1Dob, setTeam_1Dob] = useState('')
  const [team_1Captain, setTeam_1Captain] = useState(false)

  const [team_2Num, setTeam_2Num] = useState('')
  const [team_2First, setTeam_2First] = useState('')
  const [team_2Last, setTeam_2Last] = useState('')
  const [team_2Dob, setTeam_2Dob] = useState('')
  const [team_2Captain, setTeam_2Captain] = useState(false)

  // Officials
  const [ref1First, setRef1First] = useState('')
  const [ref1Last, setRef1Last] = useState('')
  const [ref1Country, setRef1Country] = useState('SUI')

  const [ref2First, setRef2First] = useState('')
  const [ref2Last, setRef2Last] = useState('')
  const [ref2Country, setRef2Country] = useState('SUI')

  const [scorerFirst, setScorerFirst] = useState('')
  const [scorerLast, setScorerLast] = useState('')
  const [scorerCountry, setScorerCountry] = useState('SUI')

  const [asstFirst, setAsstFirst] = useState('')
  const [asstLast, setAsstLast] = useState('')
  const [asstCountry, setAsstCountry] = useState('SUI')

  // Line judges (up to 4)
  const [lineJudges, setLineJudges] = useState([
    { firstName: '', lastName: '', country: 'SUI' },
    { firstName: '', lastName: '', country: 'SUI' },
    { firstName: '', lastName: '', country: 'SUI' },
    { firstName: '', lastName: '', country: 'SUI' }
  ])

  // Beach volleyball: No bench staff

  // UI state for views
  const [currentView, setCurrentView] = useState('main') // 'main', 'info', 'officials', 'team_1', 'team_2', 'coin-toss'
  const [openSignature, setOpenSignature] = useState(null) // 'team_1-coach', 'team_1-captain', 'team_2-coach', 'team_2-captain'
  const [colorPickerModal, setColorPickerModal] = useState(null) // { team: 'team_1'|'team_2', position: { x, y } } | null
  const [noticeModal, setNoticeModal] = useState(null) // { message: string } | null
  
  // Coin toss state
  const [teamA, setTeamA] = useState('team_1') // 'team_1' or 'team_2'
  const [teamB, setTeamB] = useState('team_2') // 'team_1' or 'team_2'
  const [serveA, setServeA] = useState(true) // true = serves, false = receives
  const [serveB, setServeB] = useState(false) // true = serves, false = receives
  const [coinTossWinner, setCoinTossWinner] = useState(null) // 'teamA' | 'teamB' | null
  const [pendingMatchId, setPendingMatchId] = useState(null) // Store match ID before coin toss
  // Coin toss player data (numbers, captain, first serve)
  const [coinTossTeamAPlayer1, setCoinTossTeamAPlayer1] = useState({ number: null, isCaptain: false, firstServe: false })
  const [coinTossTeamAPlayer2, setCoinTossTeamAPlayer2] = useState({ number: null, isCaptain: false, firstServe: false })
  const [coinTossTeamBPlayer1, setCoinTossTeamBPlayer1] = useState({ number: null, isCaptain: false, firstServe: false })
  const [coinTossTeamBPlayer2, setCoinTossTeamBPlayer2] = useState({ number: null, isCaptain: false, firstServe: false })
  
  // Coin toss modals
  const [coinTossConfirmModal, setCoinTossConfirmModal] = useState(false) // Show confirmation modal before saving
  
  // Referee connection
  const [refereeConnectionEnabled, setRefereeConnectionEnabled] = useState(false)
  const [editPinModal, setEditPinModal] = useState(false)
  const [editPinType, setEditPinType] = useState(null) // 'referee'
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')
  
  // Beach volleyball: No bench connection
  const [team_1ConnectionEnabled, setTeam_1ConnectionEnabled] = useState(false)
  const [team_2ConnectionEnabled, setTeam_2ConnectionEnabled] = useState(false)

  // Beach volleyball: No PDF roster import
  const rosterLoadedRef = useRef(false) // Track if roster has been loaded to prevent overwriting user edits

  // Grouped by color families: whites/grays, reds, oranges, yellows, greens, blues, purples, pinks, teals
  const teamColors = [
    '#FFFFFF', // White
    '#000000', // Black
    '#808080', // Gray
    '#323134', // Dark Gray
    '#dc2626', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Light Green
    '#065f46', // Dark Green
    '#3b82f6', // Light Blue
    '#89bdc3', // Light Cyan
    '#1e3a8a', // Dark Blue
    '#a855f7', // Purple
    '#ec4899'  // Pink
  ]

  const team_1Counts = {
    players: team_1Roster.length,
    bench: 0 // Beach volleyball: No bench staff
  }
  const team_2Counts = {
    players: team_2Roster.length,
    bench: 0 // Beach volleyball: No bench staff
  }

  // Signatures and lock
  const [homeCoachSignature, setTeam_1CoachSignature] = useState(null)
  const [team_1CaptainSignature, setTeam_1CaptainSignature] = useState(null)
  const [awayCoachSignature, setTeam_2CoachSignature] = useState(null)
  const [team_2CaptainSignature, setTeam_2CaptainSignature] = useState(null)
  const [savedSignatures, setSavedSignatures] = useState({ homeCoach: null, team_1Captain: null, awayCoach: null, team_2Captain: null })
  const isHomeLocked = !!(homeCoachSignature && team_1CaptainSignature)
  const isAwayLocked = !!(awayCoachSignature && team_2CaptainSignature)
  
  // Check if coin toss was previously confirmed (only captain signatures are required)
  const isCoinTossConfirmed = useMemo(() => {
    return team_1CaptainSignature && team_2CaptainSignature &&
           team_1CaptainSignature === savedSignatures.team_1Captain &&
           team_2CaptainSignature === savedSignatures.team_2Captain
  }, [team_1CaptainSignature, team_2CaptainSignature, savedSignatures])

  // Calculate coin toss confirmation modal data
  const coinTossModalData = useMemo(() => {
    if (!coinTossConfirmModal) return null
    
    console.log('[COIN TOSS] useMemo calculating modal data')
    // Calculate serve rotation
    const firstServeTeam = serveA ? teamA : teamB
    
    // Get team info
    const teamAInfo = teamA === 'team_1' ? { name: team_1, roster: team_1Roster } : { name: team_2, roster: team_2Roster }
    const teamBInfo = teamB === 'team_1' ? { name: team_1, roster: team_1Roster } : { name: team_2, roster: team_2Roster }
    
    // Calculate rotations
    const getPlayerRotation = (teamKey, playerIndex, isFirstServeTeam) => {
      const playerData = teamKey === teamA 
        ? (playerIndex === 0 ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2)
        : (playerIndex === 0 ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2)
      
      if (isFirstServeTeam) {
        // Serving team: first serve player = 1, other = 3
        return playerData.firstServe ? 1 : 3
      } else {
        // Receiving team: first serve player = 2, other = 4
        return playerData.firstServe ? 2 : 4
      }
    }
    
    const teamAPlayer1Rotation = getPlayerRotation(teamA, 0, firstServeTeam === teamA)
    const teamAPlayer2Rotation = getPlayerRotation(teamA, 1, firstServeTeam === teamA)
    const teamBPlayer1Rotation = getPlayerRotation(teamB, 0, firstServeTeam === teamB)
    const teamBPlayer2Rotation = getPlayerRotation(teamB, 1, firstServeTeam === teamB)
    
    return {
      teamAInfo,
      teamBInfo,
      teamAPlayer1Rotation,
      teamAPlayer2Rotation,
      teamBPlayer1Rotation,
      teamBPlayer2Rotation
    }
  }, [coinTossConfirmModal, serveA, teamA, teamB, team_1, team_2, team_1Roster, team_2Roster, coinTossTeamAPlayer1, coinTossTeamAPlayer2, coinTossTeamBPlayer1, coinTossTeamBPlayer2])

  async function unlockTeam(side) {
    
    const password = prompt('Enter 1st Referee password to unlock:')
    
    if (password === null) {
      return
    }
    
    
    if (password === '1234') {
      
      if (side === 'team_1') {
        setTeam_1CoachSignature(null)
        setTeam_1CaptainSignature(null)
        // Update database if matchId exists
        if (matchId) {
          await db.matches.update(matchId, {
            homeCoachSignature: null,
            team_1CaptainSignature: null
          })
        }
      } else if (side === 'team_2') { 
        setTeam_2CoachSignature(null)
        setTeam_2CaptainSignature(null)
        // Update database if matchId exists
        if (matchId) {
          await db.matches.update(matchId, {
            awayCoachSignature: null,
            team_2CaptainSignature: null
          })
        }
      }
      alert('Team unlocked successfully!')
    } else {
      alert('Wrong password')
    }
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
        const [team_1Team, team_2Team] = await Promise.all([
          match.homeTeamId ? db.teams.get(match.homeTeamId) : null,
          match.awayTeamId ? db.teams.get(match.awayTeamId) : null
        ])

        if (team_1Team && team_1Team.name && typeof team_1Team.name === 'string') {
          // Normalize team name to ensure spaces around dash
          const normalizedName = team_1Team.name.replace(/(\w)-(\w)/g, '$1 - $2')
          setTeam_1(normalizedName)
          setTeam_1Color(team_1Team.color || '#89bdc3')
        }
        if (team_2Team && team_2Team.name && typeof team_2Team.name === 'string') {
          // Normalize team name to ensure spaces around dash
          const normalizedName = team_2Team.name.replace(/(\w)-(\w)/g, '$1 - $2')
          setTeam_2(normalizedName)
          setTeam_2Color(team_2Team.color || '#323134')
        }
        
        const normalizeBenchMember = member => ({
          role: member?.role || '',
          firstName: member?.firstName || member?.first_name || '',
          lastName: member?.lastName || member?.last_name || '',
          dob: member?.dob || member?.date_of_birth || member?.dateOfBirth || ''
        })

        // Beach volleyball: No bench staff
        
        // Load match info
        if (match.scheduledAt) {
          const scheduledDate = new Date(match.scheduledAt)
          setDate(scheduledDate.toISOString().split('T')[0])
          const hours = String(scheduledDate.getHours()).padStart(2, '0')
          const minutes = String(scheduledDate.getMinutes()).padStart(2, '0')
          setTime(`${hours}:${minutes}`)
        }
        // Load new match info fields
        if (match.eventName) setEventName(match.eventName)
        if (match.site) setSite(match.site)
        if (match.beach) setBeach(match.beach)
        if (match.court) setCourt(match.court)
        if (match.matchPhase) setMatchPhase(match.matchPhase)
        if (match.matchRound) setMatchRound(match.matchRound)
        if (match.matchNumber) setMatchNumber(String(match.matchNumber))
        if (match.matchGender) setMatchGender(match.matchGender)
        // Legacy support for old field names
        if (!match.site && match.city) setSite(match.city)
        if (!match.court && match.hall) setCourt(match.hall)
        if (!match.matchPhase && match.match_type_1) {
          // Map old match_type_1 to matchPhase if needed
          if (match.match_type_1 === 'qualification') setMatchPhase('qualification')
          else setMatchPhase('main_draw')
        }
        if (!match.matchRound && match.championshipType) {
          // Map old championshipType to matchRound if needed
          setMatchRound('pool_play') // Default mapping
        }
        if (!match.matchNumber && match.game_n) setMatchNumber(String(match.game_n))
        else if (!match.matchNumber && match.gameNumber) setMatchNumber(String(match.gameNumber))
        if (match.team_1Country) setTeam_1Country(match.team_1Country)
        else if (match.homeShortName) setTeam_1Country(match.homeShortName) // Legacy support
        if (match.team_2Country) setTeam_2Country(match.team_2Country)
        else if (match.awayShortName) setTeam_2Country(match.awayShortName) // Legacy support
        
        // Generate PINs if they don't exist (for matches created before PIN feature)
        const generatePinCode = () => {
          const chars = '0123456789'
          let pin = ''
          for (let i = 0; i < 6; i++) {
            pin += chars.charAt(Math.floor(Math.random() * chars.length))
          }
          return pin
        }
        
        const updates = {}
        if (!match.refereePin) {
          updates.refereePin = generatePinCode()
        }
        if (!match.homeTeamPin) {
          updates.homeTeamPin = generatePinCode()
        }
        if (!match.awayTeamPin) {
          updates.awayTeamPin = generatePinCode()
        }
        if (Object.keys(updates).length > 0) {
          await db.matches.update(matchId, updates)
        }
        
        // Load players only on initial load (when matchId changes, not when match updates)
        // This prevents overwriting user edits when the match object updates from the database
        if (match.homeTeamId) {
          const team_1Players = await db.players.where('teamId').equals(match.homeTeamId).toArray()
          // DON'T sort by number - maintain insertion order to preserve Player 1 and Player 2
          // Sort by ID to maintain consistent order when numbers are null
          team_1Players.sort((a, b) => {
            // If both have numbers, sort by number
            if (a.number != null && b.number != null) return a.number - b.number
            // Otherwise maintain insertion order (by ID)
            return (a.id || 0) - (b.id || 0)
          })
          const roster = team_1Players.map(p => ({
            id: p.id, // Store player ID for updates
            number: p.number,
            firstName: p.firstName || '',
            lastName: p.lastName || p.name || '',
            // Beach volleyball: No liberos
            isCaptain: p.isCaptain || false
          }))
          
          // DEBUG: Log before setting roster to catch duplicates
          console.log('[MATCH SETUP DEBUG] team_1Players from DB:', team_1Players.map((p, idx) => ({
            index: idx,
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            number: p.number
          })))
          console.log('[MATCH SETUP DEBUG] team_1Roster being set:', roster.map((p, idx) => ({
            index: idx,
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            number: p.number
          })))
          
          setTeam_1Roster(roster)
          // Populate direct player inputs (beach volleyball: exactly 2 players)
          // Use order (first player is Player 1, second is Player 2)
          // IMPORTANT: Ensure we have exactly 2 distinct players
          if (roster.length > 0) {
            setTeam_1Player1({ firstName: roster[0].firstName, lastName: roster[0].lastName })
          } else {
            setTeam_1Player1({ firstName: '', lastName: '' })
          }
          if (roster.length > 1) {
            // Make sure we're using the second player, not duplicating the first
            setTeam_1Player2({ firstName: roster[1].firstName, lastName: roster[1].lastName })
          } else {
            setTeam_1Player2({ firstName: '', lastName: '' })
          }
          
          // DEBUG: Log loaded players to catch duplicates
          console.log('[MATCH SETUP DEBUG] Loaded team_1 players:', {
            rosterLength: roster.length,
            player1: { firstName: roster[0]?.firstName, lastName: roster[0]?.lastName, id: roster[0]?.id },
            player2: { firstName: roster[1]?.firstName, lastName: roster[1]?.lastName, id: roster[1]?.id },
            allPlayers: roster.map((p, idx) => ({ 
              index: idx, 
              id: p.id, 
              firstName: p.firstName, 
              lastName: p.lastName 
            }))
          })
        }
        if (match.awayTeamId) {
          const team_2Players = await db.players.where('teamId').equals(match.awayTeamId).toArray()
          // DON'T sort by number - maintain insertion order to preserve Player 1 and Player 2
          // Sort by ID to maintain consistent order when numbers are null
          team_2Players.sort((a, b) => {
            // If both have numbers, sort by number
            if (a.number != null && b.number != null) return a.number - b.number
            // Otherwise maintain insertion order (by ID)
            return (a.id || 0) - (b.id || 0)
          })
          const roster = team_2Players.map(p => ({
            id: p.id, // Store player ID for updates
            number: p.number,
            firstName: p.firstName || '',
            lastName: p.lastName || p.name || '',
            // Beach volleyball: No liberos
            isCaptain: p.isCaptain || false
          }))
          
          // DEBUG: Log before setting roster to catch duplicates
          console.log('[MATCH SETUP DEBUG] team_2Players from DB:', team_2Players.map((p, idx) => ({
            index: idx,
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            number: p.number
          })))
          console.log('[MATCH SETUP DEBUG] team_2Roster being set:', roster.map((p, idx) => ({
            index: idx,
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            number: p.number
          })))
          
          setTeam_2Roster(roster)
          // Populate direct player inputs (beach volleyball: exactly 2 players)
          // Use order (first player is Player 1, second is Player 2)
          // IMPORTANT: Ensure we have exactly 2 distinct players
          if (roster.length > 0) {
            setTeam_2Player1({ firstName: roster[0].firstName, lastName: roster[0].lastName })
          } else {
            setTeam_2Player1({ firstName: '', lastName: '' })
          }
          if (roster.length > 1) {
            // Make sure we're using the second player, not duplicating the first
            setTeam_2Player2({ firstName: roster[1].firstName, lastName: roster[1].lastName })
          } else {
            setTeam_2Player2({ firstName: '', lastName: '' })
          }
          
          // DEBUG: Log loaded players to catch duplicates
          console.log('[MATCH SETUP DEBUG] Loaded team_2 players:', {
            rosterLength: roster.length,
            player1: { firstName: roster[0]?.firstName, lastName: roster[0]?.lastName, id: roster[0]?.id },
            player2: { firstName: roster[1]?.firstName, lastName: roster[1]?.lastName, id: roster[1]?.id },
            allPlayers: roster.map((p, idx) => ({ 
              index: idx, 
              id: p.id, 
              firstName: p.firstName, 
              lastName: p.lastName 
            }))
          })
        }
        
        // Load referee connection setting (default to enabled if not set)
        setRefereeConnectionEnabled(match.refereeConnectionEnabled !== false)
        
        // Load team connection settings (default to enabled if not set)
        setTeam_1ConnectionEnabled(match.homeTeamConnectionEnabled !== false)
        setTeam_2ConnectionEnabled(match.awayTeamConnectionEnabled !== false)
        
        // Mark roster as loaded
        rosterLoadedRef.current = true
        
        // Beach volleyball: No bench officials
        
        // Load match officials
        if (match.officials && match.officials.length > 0) {
          const ref1 = match.officials.find(o => o.role === '1st referee')
          if (ref1) {
            setRef1First(ref1.firstName || '')
            setRef1Last(ref1.lastName || '')
            setRef1Country(ref1.country || 'SUI')
          }
          const ref2 = match.officials.find(o => o.role === '2nd referee')
          if (ref2) {
            setRef2First(ref2.firstName || '')
            setRef2Last(ref2.lastName || '')
            setRef2Country(ref2.country || 'SUI')
          }
          const scorer = match.officials.find(o => o.role === 'scorer')
          if (scorer) {
            setScorerFirst(scorer.firstName || '')
            setScorerLast(scorer.lastName || '')
            setScorerCountry(scorer.country || 'SUI')
          }
          const asst = match.officials.find(o => o.role === 'assistant scorer')
          if (asst) {
            setAsstFirst(asst.firstName || '')
            setAsstLast(asst.lastName || '')
            setAsstCountry(asst.country || 'SUI')
          }
          // Load line judges
          const lineJudgesList = match.officials
            .filter(o => o.role === 'line judge')
            .sort((a, b) => (a.position || 0) - (b.position || 0))
          const loadedLineJudges = [
            { firstName: '', lastName: '', country: 'SUI' },
            { firstName: '', lastName: '', country: 'SUI' },
            { firstName: '', lastName: '', country: 'SUI' },
            { firstName: '', lastName: '', country: 'SUI' }
          ]
          lineJudgesList.forEach((judge, index) => {
            if (index < 4) {
              loadedLineJudges[index] = {
                firstName: judge.firstName || '',
                lastName: judge.lastName || '',
                country: judge.country || 'SUI'
              }
            }
          })
          setLineJudges(loadedLineJudges)
        }
        
        // Load signatures
        if (match.homeCoachSignature) {
          setTeam_1CoachSignature(match.homeCoachSignature)
          setSavedSignatures(prev => ({ ...prev, homeCoach: match.homeCoachSignature }))
        }
        if (match.team_1CaptainSignature) {
          setTeam_1CaptainSignature(match.team_1CaptainSignature)
          setSavedSignatures(prev => ({ ...prev, team_1Captain: match.team_1CaptainSignature }))
        }
        if (match.awayCoachSignature) {
          setTeam_2CoachSignature(match.awayCoachSignature)
          setSavedSignatures(prev => ({ ...prev, awayCoach: match.awayCoachSignature }))
        }
        if (match.team_2CaptainSignature) {
          setTeam_2CaptainSignature(match.team_2CaptainSignature)
          setSavedSignatures(prev => ({ ...prev, team_2Captain: match.team_2CaptainSignature }))
        }
        
        // Load coach names from match or draft
        if (match.team_1CoachName) {
          setTeam_1CoachName(match.team_1CoachName)
        }
        if (match.team_2CoachName) {
          setTeam_2CoachName(match.team_2CoachName)
        }
        
        // Load coin toss data if available
        if (match.coinTossTeamA && match.coinTossTeamB !== undefined) {
          // Load saved coin toss result
          setTeamA(match.coinTossTeamA)
          setTeamB(match.coinTossTeamB)
          setServeA(match.coinTossServeA !== undefined ? match.coinTossServeA : true)
          setServeB(match.coinTossServeB !== undefined ? match.coinTossServeB : false)
          if (match.coinTossData?.coinTossWinner) {
            setCoinTossWinner(match.coinTossData.coinTossWinner)
          }
          
          // Load coin toss player data if available
          if (match.coinTossPlayerData) {
            if (match.coinTossPlayerData.teamA) {
              setCoinTossTeamAPlayer1(match.coinTossPlayerData.teamA.player1 || { number: null, isCaptain: false, firstServe: false })
              setCoinTossTeamAPlayer2(match.coinTossPlayerData.teamA.player2 || { number: null, isCaptain: false, firstServe: false })
            }
            if (match.coinTossPlayerData.teamB) {
              setCoinTossTeamBPlayer1(match.coinTossPlayerData.teamB.player1 || { number: null, isCaptain: false, firstServe: false })
              setCoinTossTeamBPlayer2(match.coinTossPlayerData.teamB.player2 || { number: null, isCaptain: false, firstServe: false })
            }
          }
        } else if (match.firstServe) {
          // Fallback: use firstServe to determine serve (but not team assignment)
          // Default team assignment
          setTeamA('team_1')
          setTeamB('team_2')
          if (match.firstServe === 'team_1') {
            setServeA(true)
            setServeB(false)
          } else {
            setServeA(false)
            setServeB(true)
          }
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
    setRefereeConnectionEnabled(match.refereeConnectionEnabled !== false)
    setTeam_1ConnectionEnabled(match.homeTeamConnectionEnabled !== false)
    setTeam_2ConnectionEnabled(match.awayTeamConnectionEnabled !== false)
  }, [matchId, match?.refereeConnectionEnabled, match?.homeTeamConnectionEnabled, match?.awayTeamConnectionEnabled])
  
  // Show coin toss view if requested
  useEffect(() => {
    if (showCoinToss && matchId) {
      // Check if team names are set before showing coin toss
      if (!team_1 || team_1.trim() === '' || team_1 === 'Team 1' || !team_2 || team_2.trim() === '' || team_2 === 'Team 2') {
        setNoticeModal({ message: 'Please set both team names before proceeding to coin toss.' })
        return
      }
      setCurrentView('coin-toss')
    }
  }, [showCoinToss, matchId, team_1, team_2])

  // Load saved draft data on mount (only if no matchId)
  useEffect(() => {
    if (matchId) return // Skip draft loading if matchId is provided
    
    async function loadDraft() {
      try {
        const draft = await db.match_setup.orderBy('updatedAt').last()
        if (draft) {
          if (draft.team_1 !== undefined) setTeam_1(draft.team_1)
          if (draft.team_2 !== undefined) setTeam_2(draft.team_2)
          if (draft.date !== undefined) setDate(draft.date)
          if (draft.time !== undefined) setTime(draft.time)
          if (draft.eventName !== undefined) setEventName(draft.eventName)
          if (draft.site !== undefined) setSite(draft.site)
          if (draft.beach !== undefined) setBeach(draft.beach)
          if (draft.court !== undefined) setCourt(draft.court)
          if (draft.matchPhase !== undefined) setMatchPhase(draft.matchPhase)
          if (draft.matchRound !== undefined) setMatchRound(draft.matchRound)
          if (draft.matchNumber !== undefined) setMatchNumber(draft.matchNumber)
          // Legacy support for old field names
          if (draft.site === undefined && draft.city !== undefined) setSite(draft.city)
          if (draft.court === undefined && draft.hall !== undefined) setCourt(draft.hall)
          if (draft.matchPhase === undefined && draft.type1 !== undefined) {
            if (draft.type1 === 'qualification') setMatchPhase('qualification')
            else setMatchPhase('main_draw')
          }
          if (draft.matchRound === undefined && draft.championshipType !== undefined) {
            setMatchRound('pool_play') // Default mapping
          }
          if (draft.matchNumber === undefined && draft.gameN !== undefined) setMatchNumber(draft.gameN)
          if (draft.team_1Country !== undefined) setTeam_1Country(draft.team_1Country)
          else if (draft.homeShortName !== undefined) setTeam_1Country(draft.homeShortName) // Legacy support
          if (draft.team_2Country !== undefined) setTeam_2Country(draft.team_2Country)
          else if (draft.awayShortName !== undefined) setTeam_2Country(draft.awayShortName) // Legacy support
          if (draft.team_1Color !== undefined) setTeam_1Color(draft.team_1Color)
          if (draft.team_2Color !== undefined) setTeam_2Color(draft.team_2Color)
          if (draft.team_1Roster !== undefined) setTeam_1Roster(draft.team_1Roster)
          if (draft.team_2Roster !== undefined) setTeam_2Roster(draft.team_2Roster)
          // Beach volleyball: No bench staff
          if (draft.ref1First !== undefined) setRef1First(draft.ref1First)
          if (draft.ref1Last !== undefined) setRef1Last(draft.ref1Last)
          if (draft.ref1Country !== undefined) setRef1Country(draft.ref1Country)
          if (draft.ref2First !== undefined) setRef2First(draft.ref2First)
          if (draft.ref2Last !== undefined) setRef2Last(draft.ref2Last)
          if (draft.ref2Country !== undefined) setRef2Country(draft.ref2Country)
          if (draft.scorerFirst !== undefined) setScorerFirst(draft.scorerFirst)
          if (draft.scorerLast !== undefined) setScorerLast(draft.scorerLast)
          if (draft.scorerCountry !== undefined) setScorerCountry(draft.scorerCountry)
          if (draft.asstFirst !== undefined) setAsstFirst(draft.asstFirst)
          if (draft.asstLast !== undefined) setAsstLast(draft.asstLast)
          if (draft.asstCountry !== undefined) setAsstCountry(draft.asstCountry)
          if (draft.lineJudges !== undefined) setLineJudges(draft.lineJudges)
          if (draft.homeCoachSignature !== undefined) setTeam_1CoachSignature(draft.homeCoachSignature)
          if (draft.team_1CaptainSignature !== undefined) setTeam_1CaptainSignature(draft.team_1CaptainSignature)
          if (draft.awayCoachSignature !== undefined) setTeam_2CoachSignature(draft.awayCoachSignature)
          if (draft.team_2CaptainSignature !== undefined) setTeam_2CaptainSignature(draft.team_2CaptainSignature)
          // Only load coach names from draft if they're not already loaded from match
          // This prevents overwriting match data with empty draft values
          if (draft.team_1CoachName !== undefined && (!team_1CoachName.firstName && !team_1CoachName.lastName)) {
            setTeam_1CoachName(draft.team_1CoachName)
          }
          if (draft.team_2CoachName !== undefined && (!team_2CoachName.firstName && !team_2CoachName.lastName)) {
            setTeam_2CoachName(draft.team_2CoachName)
          }
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
        team_1,
        team_2,
        date,
        time,
        eventName,
        site,
        beach,
        court,
        matchPhase,
        matchRound,
        matchNumber,
        matchGender,
        team_1Color,
        team_2Color,
        team_1Country,
        team_2Country,
        team_1Roster,
        team_2Roster,
        // Beach volleyball: No bench staff
        ref1First,
        ref1Last,
        ref1Country,
        ref2First,
        ref2Last,
        ref2Country,
        scorerFirst,
        scorerLast,
        scorerCountry,
        asstFirst,
        asstLast,
        asstCountry,
        lineJudges,
        homeCoachSignature,
        team_1CaptainSignature,
        awayCoachSignature,
        team_2CaptainSignature,
        team_1CoachName,
        team_2CoachName,
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
      if (matchId && match) {
        const scheduledAt = (() => {
          if (!date && !time) return match?.scheduledAt || new Date().toISOString()
          const iso = new Date(`${date}T${time || '00:00'}:00`).toISOString()
          return iso
        })()
        
        await db.matches.update(matchId, {
          eventName: eventName || null,
          site: site || null,
          beach: beach || null,
          court: court || null,
          matchPhase: matchPhase || 'main_draw',
          matchRound: matchRound || 'pool_play',
          matchNumber: matchNumber ? Number(matchNumber) : null,
          matchGender: matchGender || 'men',
          team_1Country: team_1Country || 'SUI',
          team_2Country: team_2Country || 'SUI',
          team_1CoachName: team_1CoachName || null,
          team_2CoachName: team_2CoachName || null,
          scheduledAt,
          officials: (() => {
            const officials = [
              { role: '1st referee', firstName: ref1First, lastName: ref1Last, country: ref1Country },
              { role: '2nd referee', firstName: ref2First, lastName: ref2Last, country: ref2Country },
              { role: 'scorer', firstName: scorerFirst, lastName: scorerLast, country: scorerCountry },
              { role: 'assistant scorer', firstName: asstFirst, lastName: asstLast, country: asstCountry }
            ]
            // Add line judges
            lineJudges.forEach((judge, index) => {
              if (judge.firstName || judge.lastName) {
                officials.push({
                  role: 'line judge',
                  firstName: judge.firstName,
                  lastName: judge.lastName,
                  country: judge.country,
                  position: index + 1
                })
              }
            })
            return officials
          })(),
          bench_home: [],
          bench_away: []
        })
        
        // Also update team colors if teams exist
        if (match?.homeTeamId) {
          await db.teams.update(match.homeTeamId, { 
            name: team_1,
            color: team_1Color 
          })
        }
        if (match?.awayTeamId) {
          await db.teams.update(match.awayTeamId, { 
            name: team_2,
            color: team_2Color 
          })
        }
      }
      
      return true
    } catch (error) {
      console.error('Error saving draft:', error)
      if (!silent) {
        alert('Error saving data')
      }
      return false
    }
  }

  // Auto-save when data changes (debounced)
  useEffect(() => {
    if (currentView === 'main' || currentView === 'info' || currentView === 'officials' || currentView === 'team_1' || currentView === 'team_2') {
      const timeoutId = setTimeout(() => {
        saveDraft(true) // Silent auto-save
      }, 500) // Debounce 500ms
      
      return () => clearTimeout(timeoutId)
    }
  }, [date, time, eventName, site, beach, court, matchPhase, matchRound, matchNumber, matchGender, team_1, team_2, team_1Color, team_2Color, team_1Country, team_2Country, team_1Roster, team_2Roster, ref1First, ref1Last, ref1Country, ref2First, ref2Last, ref2Country, scorerFirst, scorerLast, scorerCountry, asstFirst, asstLast, asstCountry, lineJudges, homeCoachSignature, team_1CaptainSignature, awayCoachSignature, team_2CaptainSignature, currentView])

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

  // Helper function to generate team name from player last names
  function generateTeamNameFromPlayers(player1, player2) {
    const lastNames = [player1.lastName, player2.lastName]
      .filter(name => name && name.trim() !== '')
    if (lastNames.length === 0) return ''
    if (lastNames.length === 1) return lastNames[0]
    return `${lastNames[0]} - ${lastNames[1]}`
  }

  // Auto-update team names when player last names change
  useEffect(() => {
    const generatedName = generateTeamNameFromPlayers(team_1Player1, team_1Player2)
    if (generatedName) {
      setTeam_1(generatedName)
    }
  }, [team_1Player1.lastName, team_1Player2.lastName])

  useEffect(() => {
    const generatedName = generateTeamNameFromPlayers(team_2Player1, team_2Player2)
    if (generatedName) {
      setTeam_2(generatedName)
    }
  }, [team_2Player1.lastName, team_2Player2.lastName])

  // Sync direct player inputs with roster (numbers are null initially, will be set later)
  useEffect(() => {
    // Rebuild roster from state variables, but preserve existing player IDs if available
    setTeam_1Roster(prevRoster => {
      const roster = []
      
      // DEBUG: Log what we're building from
      console.log('[MATCH SETUP DEBUG] Building team_1Roster from state:', {
        player1: { firstName: team_1Player1.firstName, lastName: team_1Player1.lastName },
        player2: { firstName: team_1Player2.firstName, lastName: team_1Player2.lastName },
        prevRoster: prevRoster.map((p, idx) => ({ 
          index: idx, 
          id: p.id, 
          firstName: p.firstName, 
          lastName: p.lastName 
        }))
      })
      
      if (team_1Player1.lastName || team_1Player1.firstName) {
        // Try to find existing player by matching name AND position (first player = index 0)
        // If no match by name, use the first player from prevRoster (by index)
        let existingPlayer = prevRoster.find((p, idx) => 
          idx === 0 && // Match by position first
          p.firstName === team_1Player1.firstName && 
          p.lastName === team_1Player1.lastName &&
          p.id != null
        )
        // If no exact match, use first player from prevRoster (by index) to preserve ID
        if (!existingPlayer && prevRoster.length > 0) {
          existingPlayer = prevRoster[0]
        }
        roster.push({ 
          id: existingPlayer?.id || null, // Preserve ID if found
          number: existingPlayer?.number || null, // Preserve number if found
          lastName: team_1Player1.lastName, 
          firstName: team_1Player1.firstName, 
          isCaptain: existingPlayer?.isCaptain || false 
        })
      }
      if (team_1Player2.lastName || team_1Player2.firstName) {
        // Try to find existing player by matching name AND position (second player = index 1)
        // If no match by name, use the second player from prevRoster (by index)
        let existingPlayer = prevRoster.find((p, idx) => 
          idx === 1 && // Match by position first
          p.firstName === team_1Player2.firstName && 
          p.lastName === team_1Player2.lastName &&
          p.id != null &&
          !roster.some(r => r.id === p.id) // Don't reuse the same ID
        )
        // If no exact match, use second player from prevRoster (by index) to preserve ID
        if (!existingPlayer && prevRoster.length > 1) {
          existingPlayer = prevRoster[1]
          // Make sure we're not reusing the same ID as player 1
          if (roster.length > 0 && roster[0].id === existingPlayer.id) {
            existingPlayer = null // Don't reuse ID if it's the same as player 1
          }
        }
        roster.push({ 
          id: existingPlayer?.id || null, // Preserve ID if found
          number: existingPlayer?.number || null, // Preserve number if found
          lastName: team_1Player2.lastName, 
          firstName: team_1Player2.firstName, 
          isCaptain: existingPlayer?.isCaptain || false 
        })
      }
      
      // DEBUG: Log what we're returning
      console.log('[MATCH SETUP DEBUG] Built team_1Roster:', roster.map((p, idx) => ({ 
        index: idx, 
        id: p.id, 
        firstName: p.firstName, 
        lastName: p.lastName 
      })))
      
      return roster
    })
  }, [team_1Player1.lastName, team_1Player1.firstName, team_1Player2.lastName, team_1Player2.firstName])

  useEffect(() => {
    // Rebuild roster from state variables, but preserve existing player IDs if available
    setTeam_2Roster(prevRoster => {
      const roster = []
      
      // DEBUG: Log what we're building from
      console.log('[MATCH SETUP DEBUG] Building team_2Roster from state:', {
        player1: { firstName: team_2Player1.firstName, lastName: team_2Player1.lastName },
        player2: { firstName: team_2Player2.firstName, lastName: team_2Player2.lastName },
        prevRoster: prevRoster.map((p, idx) => ({ 
          index: idx, 
          id: p.id, 
          firstName: p.firstName, 
          lastName: p.lastName 
        }))
      })
      
      if (team_2Player1.lastName || team_2Player1.firstName) {
        // Try to find existing player by matching name AND position (first player = index 0)
        // If no match by name, use the first player from prevRoster (by index)
        let existingPlayer = prevRoster.find((p, idx) => 
          idx === 0 && // Match by position first
          p.firstName === team_2Player1.firstName && 
          p.lastName === team_2Player1.lastName &&
          p.id != null
        )
        // If no exact match, use first player from prevRoster (by index) to preserve ID
        if (!existingPlayer && prevRoster.length > 0) {
          existingPlayer = prevRoster[0]
        }
        roster.push({ 
          id: existingPlayer?.id || null, // Preserve ID if found
          number: existingPlayer?.number || null, // Preserve number if found
          lastName: team_2Player1.lastName, 
          firstName: team_2Player1.firstName, 
          isCaptain: existingPlayer?.isCaptain || false 
        })
      }
      if (team_2Player2.lastName || team_2Player2.firstName) {
        // Try to find existing player by matching name AND position (second player = index 1)
        // If no match by name, use the second player from prevRoster (by index)
        let existingPlayer = prevRoster.find((p, idx) => 
          idx === 1 && // Match by position first
          p.firstName === team_2Player2.firstName && 
          p.lastName === team_2Player2.lastName &&
          p.id != null &&
          !roster.some(r => r.id === p.id) // Don't reuse the same ID
        )
        // If no exact match, use second player from prevRoster (by index) to preserve ID
        if (!existingPlayer && prevRoster.length > 1) {
          existingPlayer = prevRoster[1]
          // Make sure we're not reusing the same ID as player 1
          if (roster.length > 0 && roster[0].id === existingPlayer.id) {
            existingPlayer = null // Don't reuse ID if it's the same as player 1
          }
        }
        roster.push({ 
          id: existingPlayer?.id || null, // Preserve ID if found
          number: existingPlayer?.number || null, // Preserve number if found
          lastName: team_2Player2.lastName, 
          firstName: team_2Player2.firstName, 
          isCaptain: existingPlayer?.isCaptain || false 
        })
      }
      
      // DEBUG: Log what we're returning
      console.log('[MATCH SETUP DEBUG] Built team_2Roster:', roster.map((p, idx) => ({ 
        index: idx, 
        id: p.id, 
        firstName: p.firstName, 
        lastName: p.lastName 
      })))
      
      return roster
    })
  }, [team_2Player1.lastName, team_2Player1.firstName, team_2Player2.lastName, team_2Player2.firstName])

  // Date formatting helpers
  function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return ''
    // If already in DD/MM/YYYY format, return as-is
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr
    // If in ISO format (YYYY-MM-DD), convert to DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-')
      return `${day}/${month}/${year}`
    }
    // Try to parse as date
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
    // If already in ISO format (YYYY-MM-DD), return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
    // If in DD/MM/YYYY format, convert to YYYY-MM-DD
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('/')
      return `${year}-${month}-${day}`
    }
    // Try to parse as date
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return dateStr
  }

  function handleSignatureSave(signatureImage) {
    if (openSignature === 'team_1-coach') {
      setTeam_1CoachSignature(signatureImage)
    } else if (openSignature === 'team_1-captain') {
      setTeam_1CaptainSignature(signatureImage)
    } else if (openSignature === 'team_2-coach') {
      setTeam_2CoachSignature(signatureImage)
    } else if (openSignature === 'team_2-captain') {
      setTeam_2CaptainSignature(signatureImage)
    }
    setOpenSignature(null)
  }

  function formatRoster(roster) {
    // Beach volleyball: All players sorted by number (ascending), no bench
    const players = [...roster].sort((a, b) => {
      const an = a.number ?? 999
      const bn = b.number ?? 999
      return an - bn
    })
    return { players }
  }

  async function createMatch() {
    // Validate at least one captain per team
    const homeHasCaptain = team_1Roster.some(p => p.isCaptain)
    const awayHasCaptain = team_2Roster.some(p => p.isCaptain)
    
    if (!homeHasCaptain) {
      setNoticeModal({ message: 'Home team must have at least one captain.' })
      return
    }
    
    if (!awayHasCaptain) {
      setNoticeModal({ message: 'Away team must have at least one captain.' })
      return
    }

    await db.transaction('rw', db.matches, db.teams, db.players, async () => {
    const team_1Id = await db.teams.add({ name: team_1, color: team_1Color, createdAt: new Date().toISOString() })
    const team_2Id = await db.teams.add({ name: team_2, color: team_2Color, createdAt: new Date().toISOString() })

      // Add teams to sync queue (official match, so test: false)

    const scheduledAt = (() => {
      if (!date && !time) return new Date().toISOString()
      const iso = new Date(`${date}T${time || '00:00'}:00`).toISOString()
      return iso
    })()

    // Generate 6-digit PIN code for referee authentication
    const generatePinCode = () => {
      const chars = '0123456789'
      let pin = ''
      for (let i = 0; i < 6; i++) {
        pin += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return pin
    }

    // Generate match PIN code (for opening/continuing match)
    const matchPin = prompt('Enter a PIN code to protect this match (required):')
    if (!matchPin || matchPin.trim() === '') {
      setNoticeModal({ message: 'Match PIN code is required. Please enter a PIN code to create the match.' })
      return
    }

    const matchId = await db.matches.add({
      homeTeamId: team_1Id,
      awayTeamId: team_2Id,
      status: 'live',
      scheduledAt,
      eventName: eventName || null,
      site: site || null,
      beach: beach || null,
      court: court || null,
      matchPhase: matchPhase || 'main_draw',
      matchRound: matchRound || 'pool_play',
      matchNumber: matchNumber ? Number(matchNumber) : null,
      matchGender: matchGender || 'men',
      team_1Country: team_1Country || 'SUI',
      team_2Country: team_2Country || 'SUI',
      refereePin: generatePinCode(),
      homeTeamPin: generatePinCode(),
      awayTeamPin: generatePinCode(),
      matchPin: matchPin.trim(),
      refereeConnectionEnabled: false,
      homeTeamConnectionEnabled: false,
      awayTeamConnectionEnabled: false,
      officials: (() => {
        const officials = [
          { role: '1st referee', firstName: ref1First, lastName: ref1Last, country: ref1Country },
          { role: '2nd referee', firstName: ref2First, lastName: ref2Last, country: ref2Country },
          { role: 'scorer', firstName: scorerFirst, lastName: scorerLast, country: scorerCountry },
          { role: 'assistant scorer', firstName: asstFirst, lastName: asstLast, country: asstCountry }
        ]
        // Add line judges
        lineJudges.forEach((judge, index) => {
          if (judge.firstName || judge.lastName) {
            officials.push({
              role: 'line judge',
              firstName: judge.firstName,
              lastName: judge.lastName,
              country: judge.country,
              position: index + 1
            })
          }
        })
        return officials
      })(),
      bench_home: [],
      bench_away: [],
      homeCoachSignature: null,
      team_1CaptainSignature: null,
      awayCoachSignature: null,
      team_2CaptainSignature: null,
      createdAt: new Date().toISOString()
    })

    if (team_1Roster.length) {
        const homePlayerIds = await db.players.bulkAdd(
        team_1Roster.map(p => ({
          teamId: team_1Id,
          number: p.number,
          name: `${p.lastName} ${p.firstName}`,
          lastName: p.lastName,
          firstName: p.firstName,
          isCaptain: !!p.isCaptain,
          role: null,
          createdAt: new Date().toISOString()
        }))
      )
        
    }
    if (team_2Roster.length) {
        const awayPlayerIds = await db.players.bulkAdd(
        team_2Roster.map(p => ({
          teamId: team_2Id,
          number: p.number,
          name: `${p.lastName} ${p.firstName}`,
          lastName: p.lastName,
          firstName: p.firstName,
          isCaptain: !!p.isCaptain,
          role: null,
          createdAt: new Date().toISOString()
        }))
      )
        
    }
      
    // Don't start match yet - go to coin toss first
    // Check if team names are set
    if (!team_1 || team_1.trim() === '' || team_1 === 'Team 1' || !team_2 || team_2.trim() === '' || team_2 === 'Team 2') {
      setNoticeModal({ message: 'Please set both team names before proceeding to coin toss.' })
      return
    }
    
    setPendingMatchId(matchId)
    setCurrentView('coin-toss')
    })
  }

  // Function to save coin toss player data to database
  async function saveCoinTossPlayerData() {
    const targetMatchId = pendingMatchId || matchId
    if (!targetMatchId) return
    
    try {
      // Get roster data for both teams to include player names
      const teamARoster = teamA === 'team_1' ? team_1Roster : team_2Roster
      const teamBRoster = teamB === 'team_1' ? team_1Roster : team_2Roster
      
      // Enrich coin toss player data with names from roster
      const enrichPlayerData = (coinTossData, roster, playerIndex) => {
        const rosterPlayer = roster[playerIndex]
        return {
          ...coinTossData,
          firstName: rosterPlayer?.firstName || '',
          lastName: rosterPlayer?.lastName || ''
        }
      }
      
      const enrichedCoinTossPlayerData = {
        teamA: {
          player1: enrichPlayerData(coinTossTeamAPlayer1, teamARoster, 0),
          player2: enrichPlayerData(coinTossTeamAPlayer2, teamARoster, 1)
        },
        teamB: {
          player1: enrichPlayerData(coinTossTeamBPlayer1, teamBRoster, 0),
          player2: enrichPlayerData(coinTossTeamBPlayer2, teamBRoster, 1)
        }
      }
      
      const firstServeTeam = serveA ? teamA : teamB
      
      // Complete coin toss data structure
      const coinTossData = {
        teamA: teamA,
        teamB: teamB,
        serveA: serveA,
        serveB: serveB,
        firstServe: firstServeTeam,
        players: enrichedCoinTossPlayerData,
        timestamp: new Date().toISOString()
      }
      
      // DEBUG: Log coin toss data being saved
      console.log('[COIN TOSS SAVE] Saving coin toss data to match:', targetMatchId)
      console.log('[COIN TOSS SAVE] Coin toss data structure:', JSON.stringify(coinTossData, null, 2))
      
      await db.matches.update(targetMatchId, {
        coinTossPlayerData: enrichedCoinTossPlayerData,
        coinTossData: coinTossData // Store complete structured coin toss data
      })
    } catch (error) {
      console.error('[COIN TOSS] Error saving player data:', error)
    }
  }

  async function switchTeams() {
    // Swap team assignments
    const temp = teamA
    setTeamA(teamB)
    setTeamB(temp)
    
    // Swap player data between Team A and Team B
    const tempPlayer1 = coinTossTeamAPlayer1
    const tempPlayer2 = coinTossTeamAPlayer2
    setCoinTossTeamAPlayer1(coinTossTeamBPlayer1)
    setCoinTossTeamAPlayer2(coinTossTeamBPlayer2)
    setCoinTossTeamBPlayer1(tempPlayer1)
    setCoinTossTeamBPlayer2(tempPlayer2)
    
    // Save the swapped data
    await saveCoinTossPlayerData()
  }

  function switchServe() {
    setServeA(!serveA)
    setServeB(!serveB)
  }

  async function confirmCoinToss() {
    console.log('[COIN TOSS] confirmCoinToss called')
    
    // Only captain signatures are mandatory, coach signatures are optional
    if (!team_1CaptainSignature || !team_2CaptainSignature) {
      console.log('[COIN TOSS] Missing captain signatures')
      setNoticeModal({ message: 'Please complete all captain signatures before confirming the coin toss.' })
      return
    }
    
    // Check that all players have numbers assigned
    if (!coinTossTeamAPlayer1.number || !coinTossTeamAPlayer2.number || 
        !coinTossTeamBPlayer1.number || !coinTossTeamBPlayer2.number) {
      console.log('[COIN TOSS] Missing player numbers', {
        teamAP1: coinTossTeamAPlayer1.number,
        teamAP2: coinTossTeamAPlayer2.number,
        teamBP1: coinTossTeamBPlayer1.number,
        teamBP2: coinTossTeamBPlayer2.number
      })
      setNoticeModal({ message: 'Please assign numbers (1 or 2) to all players before confirming the coin toss.' })
      return
    }
    
    // Check that a captain is set for each team
    const teamACaptainSet = coinTossTeamAPlayer1.isCaptain || coinTossTeamAPlayer2.isCaptain
    const teamBCaptainSet = coinTossTeamBPlayer1.isCaptain || coinTossTeamBPlayer2.isCaptain
    if (!teamACaptainSet || !teamBCaptainSet) {
      console.log('[COIN TOSS] Missing captains')
      setNoticeModal({ message: 'Please select a captain for each team before confirming the coin toss.' })
      return
    }
    
    // Check that a first serve is set for each team
    const teamAFirstServeSet = coinTossTeamAPlayer1.firstServe || coinTossTeamAPlayer2.firstServe
    const teamBFirstServeSet = coinTossTeamBPlayer1.firstServe || coinTossTeamBPlayer2.firstServe
    if (!teamAFirstServeSet || !teamBFirstServeSet) {
      console.log('[COIN TOSS] Missing first serve')
      setNoticeModal({ message: 'Please select a first serve player for each team before confirming the coin toss.' })
      return
    }
    
    // Use matchId if pendingMatchId is not set
    const targetMatchId = pendingMatchId || matchId
    
    if (!targetMatchId) {
      console.error('[COIN TOSS] No match ID available')
      alert('Error: No match ID found')
      return
    }
    
    console.log('[COIN TOSS] All validations passed, navigating to confirmation page')
    // Navigate to confirmation page instead of showing modal
    setCurrentView('confirm-coin-toss')
  }

  async function actuallyConfirmCoinToss() {
    // Use matchId if pendingMatchId is not set
    const targetMatchId = pendingMatchId || matchId
    
    if (!targetMatchId) {
      console.error('[COIN TOSS] No match ID available')
      alert('Error: No match ID found')
      setCurrentView('coin-toss') // Go back to coin toss view if error
      return
    }
    
    const matchData = await db.matches.get(targetMatchId)
    if (!matchData) {
      setCurrentView('coin-toss') // Go back to coin toss view if error
      return
    }
    
    // Determine which team serves first
    const firstServeTeam = serveA ? teamA : teamB
    
    // Get roster data for both teams to include player names
    const teamARoster = teamA === 'team_1' ? team_1Roster : team_2Roster
    const teamBRoster = teamB === 'team_1' ? team_1Roster : team_2Roster
    
    // Enrich coin toss player data with names from roster
    const enrichPlayerData = (coinTossData, roster, playerIndex) => {
      const rosterPlayer = roster[playerIndex]
      return {
        ...coinTossData,
        firstName: rosterPlayer?.firstName || '',
        lastName: rosterPlayer?.lastName || ''
      }
    }
    
    const enrichedCoinTossPlayerData = {
      teamA: {
        player1: enrichPlayerData(coinTossTeamAPlayer1, teamARoster, 0),
        player2: enrichPlayerData(coinTossTeamAPlayer2, teamARoster, 1)
      },
      teamB: {
        player1: enrichPlayerData(coinTossTeamBPlayer1, teamBRoster, 0),
        player2: enrichPlayerData(coinTossTeamBPlayer2, teamBRoster, 1)
      }
    }
    
    // Complete coin toss data structure
    const coinTossData = {
      teamA: teamA, // 'team_1' or 'team_2'
      teamB: teamB, // 'team_1' or 'team_2'
      serveA: serveA, // true or false
      serveB: serveB, // true or false
      firstServe: firstServeTeam, // 'team_1' or 'team_2'
      coinTossWinner: coinTossWinner, // 'teamA' | 'teamB' | null
      players: enrichedCoinTossPlayerData,
      timestamp: new Date().toISOString()
    }
    
    // DEBUG: Log complete coin toss data structure
    console.log('='.repeat(80))
    console.log('[COIN TOSS DATA] Complete coin toss data structure:')
    console.log(JSON.stringify(coinTossData, null, 2))
    console.log('='.repeat(80))
    console.log('[COIN TOSS DATA] Team A:', teamA, '| Team B:', teamB)
    console.log('[COIN TOSS DATA] Serve A:', serveA, '| Serve B:', serveB, '| First Serve:', firstServeTeam)
    console.log('[COIN TOSS DATA] Team A Roster:', teamARoster.map(p => `${p.firstName} ${p.lastName} (${p.number || 'no number'})`))
    console.log('[COIN TOSS DATA] Team B Roster:', teamBRoster.map(p => `${p.firstName} ${p.lastName} (${p.number || 'no number'})`))
    console.log('[COIN TOSS DATA] Team A Players:')
    console.log('  Player 1:', enrichedCoinTossPlayerData.teamA.player1)
    console.log('  Player 2:', enrichedCoinTossPlayerData.teamA.player2)
    console.log('[COIN TOSS DATA] Team B Players:')
    console.log('  Player 1:', enrichedCoinTossPlayerData.teamB.player1)
    console.log('  Player 2:', enrichedCoinTossPlayerData.teamB.player2)
    console.log('='.repeat(80))
    
    // Update match with signatures and rosters
    await db.transaction('rw', db.matches, db.players, async () => {
    // Update match with signatures, first serve, and coin toss result
    // Store coin toss data as a complete structured object
    const updateResult = await db.matches.update(targetMatchId, {
      homeCoachSignature,
      team_1CaptainSignature,
      awayCoachSignature,
      team_2CaptainSignature,
      firstServe: firstServeTeam, // 'team_1' or 'team_2'
      coinTossTeamA: teamA, // 'team_1' or 'team_2'
      coinTossTeamB: teamB, // 'team_1' or 'team_2'
      coinTossServeA: serveA, // true or false
      coinTossServeB: serveB, // true or false
      coinTossPlayerData: enrichedCoinTossPlayerData,
      coinTossData: coinTossData // Store complete structured coin toss data
      })
      
      // Update players for both teams
      // IMPORTANT: Match players by ID first (if available), then by number, then by index
      // This ensures we don't mix up players when numbers are null
      if (matchData.homeTeamId && team_1Roster.length) {
        // Get existing players
        const existingPlayers = await db.players.where('teamId').equals(matchData.homeTeamId).toArray()
        // Sort existing players by ID to maintain order
        existingPlayers.sort((a, b) => (a.id || 0) - (b.id || 0))
        
        // Update or add players - match by ID first, then by number, then by index
        for (let idx = 0; idx < team_1Roster.length; idx++) {
          const p = team_1Roster[idx]
          let existingPlayer = null
          
          // First try to match by ID (if roster player has an ID)
          if (p.id) {
            existingPlayer = existingPlayers.find(ep => ep.id === p.id)
          }
          
          // If no match by ID, try to match by number (if both have numbers)
          if (!existingPlayer && p.number != null) {
            existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          }
          
          // If still no match and numbers are null, match by index (position in roster)
          // This ensures Player 1 matches the first existing player, Player 2 matches the second
          if (!existingPlayer && p.number == null) {
            existingPlayer = existingPlayers[idx] // Match by position
          }
          
          if (existingPlayer) {
            // Update existing player
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              number: p.number, // Update number (might be null initially, set later in coin toss)
              isCaptain: !!p.isCaptain
            })
          } else {
            // Add new player
            await db.players.add({
              teamId: matchData.homeTeamId,
              number: p.number,
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              isCaptain: !!p.isCaptain,
              role: null,
              createdAt: new Date().toISOString()
            })
          }
        }
        
        // Delete players that are no longer in the roster
        // Match by ID if available, otherwise by number
        const rosterIds = new Set(team_1Roster.map(p => p.id).filter(id => id != null))
        const rosterNumbers = new Set(team_1Roster.map(p => p.number).filter(n => n != null))
        for (const ep of existingPlayers) {
          const shouldDelete = (ep.id && !rosterIds.has(ep.id)) || 
                               (!ep.id && ep.number != null && !rosterNumbers.has(ep.number)) ||
                               (!ep.id && ep.number == null && !rosterIds.has(ep.id) && !rosterNumbers.has(ep.number))
          if (shouldDelete) {
            await db.players.delete(ep.id)
          }
        }
      }
      
      if (matchData.awayTeamId && team_2Roster.length) {
        // Get existing players
        const existingPlayers = await db.players.where('teamId').equals(matchData.awayTeamId).toArray()
        // Sort existing players by ID to maintain order
        existingPlayers.sort((a, b) => (a.id || 0) - (b.id || 0))
        
        // Update or add players - match by ID first, then by number, then by index
        for (let idx = 0; idx < team_2Roster.length; idx++) {
          const p = team_2Roster[idx]
          let existingPlayer = null
          
          // First try to match by ID (if roster player has an ID)
          if (p.id) {
            existingPlayer = existingPlayers.find(ep => ep.id === p.id)
          }
          
          // If no match by ID, try to match by number (if both have numbers)
          if (!existingPlayer && p.number != null) {
            existingPlayer = existingPlayers.find(ep => ep.number === p.number)
          }
          
          // If still no match and numbers are null, match by index (position in roster)
          // This ensures Player 1 matches the first existing player, Player 2 matches the second
          if (!existingPlayer && p.number == null) {
            existingPlayer = existingPlayers[idx] // Match by position
          }
          
          if (existingPlayer) {
            // Update existing player
            await db.players.update(existingPlayer.id, {
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              number: p.number, // Update number (might be null initially, set later in coin toss)
              isCaptain: !!p.isCaptain
            })
          } else {
            // Add new player
            await db.players.add({
              teamId: matchData.awayTeamId,
              number: p.number,
              name: `${p.lastName} ${p.firstName}`,
              lastName: p.lastName,
              firstName: p.firstName,
              isCaptain: !!p.isCaptain,
              role: null,
              createdAt: new Date().toISOString()
            })
          }
        }
        
        // Delete players that are no longer in the roster
        // Match by ID if available, otherwise by number
        const rosterIds = new Set(team_2Roster.map(p => p.id).filter(id => id != null))
        const rosterNumbers = new Set(team_2Roster.map(p => p.number).filter(n => n != null))
        for (const ep of existingPlayers) {
          const shouldDelete = (ep.id && !rosterIds.has(ep.id)) || 
                               (!ep.id && ep.number != null && !rosterNumbers.has(ep.number)) ||
                               (!ep.id && ep.number == null && !rosterIds.has(ep.id) && !rosterNumbers.has(ep.number))
          if (shouldDelete) {
            await db.players.delete(ep.id)
          }
        }
      }
    })
    
    // Update saved signatures to match current state
    setSavedSignatures({
      homeCoach: homeCoachSignature,
      team_1Captain: team_1CaptainSignature,
      awayCoach: awayCoachSignature,
      team_2Captain: team_2CaptainSignature
    })
    
    // Create first set
    const firstSetId = await db.sets.add({ matchId: targetMatchId, index: 1, homePoints: 0, awayPoints: 0, finished: false })
    
    // Update match status to 'live' to indicate match has started
    await db.matches.update(targetMatchId, { status: 'live' })
    
    // Start the match - directly navigate to scoreboard
    // onStart (continueMatch) will now allow test matches when status is 'live' and coin toss is confirmed
    onStart(targetMatchId)
  }

  // Beach volleyball: No PDF roster import

  if (currentView === 'info') {
    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={()=>setCurrentView('main')}>← Back</button>
          <h2>Match info</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
          <div style={{ width: 80 }}></div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Basic Info Card */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px 0' }}>Basic Information</h3>
            <div className="row">
              <div className="field"><label>Date</label><input className="w-dob" type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
              <div className="field"><label>Time</label><input className="w-80" type="time" value={time} onChange={e=>setTime(e.target.value)} /></div>
              <div className="field"><label>Event name</label><input className="w-200" value={eventName} onChange={e=>setEventName(e.target.value)} placeholder="Enter event name" /></div>
            </div>
          </div>

          {/* Location Card */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px 0' }}>Location</h3>
            <div className="row">
              <div className="field">
                <label>Site</label>
                <input 
                  className="w-120 capitalize" 
                  value={site} 
                  onChange={e=>setSite(e.target.value)}
                  placeholder="Enter site"
                />
              </div>
              <div className="field"><label>Beach</label><input className="w-200 capitalize" value={beach} onChange={e=>setBeach(e.target.value)} placeholder="Enter beach" /></div>
              <div className="field"><label>Court</label><input className="w-200 capitalize" value={court} onChange={e=>setCourt(e.target.value)} placeholder="Enter court" /></div>
            </div>
          </div>

          {/* Match Details Card */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px 0' }}>Match Details</h3>
            <div className="row">
              <div className="field">
                <label>Match Phase</label>
                <select className="w-140" value={matchPhase} onChange={e=>setMatchPhase(e.target.value)}>
                  <option value="main_draw">Main Draw</option>
                  <option value="qualification">Qualification</option>
                </select>
              </div>
              <div className="field">
                <label>Match Round</label>
                <select className="w-140" value={matchRound} onChange={e=>setMatchRound(e.target.value)}>
                  <option value="pool_play">Pool Play</option>
                  <option value="double_elimination">Double Elimination</option>
                  <option value="winner_bracket">Winner Bracket</option>
                  <option value="class">Class</option>
                  <option value="semi_final">Semi-Final</option>
                  <option value="finals">Finals</option>
                </select>
              </div>
              <div className="field"><label>Match Number</label><input className="w-80" type="number" inputMode="numeric" value={matchNumber} onChange={e=>setMatchNumber(e.target.value)} /></div>
            </div>
          </div>

          {/* Match Gender Card */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px 0' }}>Match Gender</h3>
            <div className="row">
              <div className="field">
                <label>Match Gender</label>
                <select className="w-140" value={matchGender} onChange={e=>setMatchGender(e.target.value)}>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                </select>
              </div>
            </div>
          </div>

          {/* Match with Coaches Toggle */}
          <div className="card">
            <h3 style={{ margin: '0 0 12px 0' }}>Coaches</h3>
            <div className="row">
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={matchWithCoaches} 
                    onChange={e => setMatchWithCoaches(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <span>Match with coaches</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={() => setCurrentView('main')}>Confirm</button>
        </div>
      </div>
    )
  }

  if (currentView === 'officials') {
    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={()=>setCurrentView('main')}>← Back</button>
          <h2>Match officials</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
          <div style={{ width: 80 }}></div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>1<sup style={{ fontSize: '0.7em' }}>st</sup> Referee</h4>
              <input 
                className="w-90" 
                value={ref1Country || 'SUI'} 
                onChange={e=>setRef1Country(e.target.value.toUpperCase())} 
                placeholder="SUI"
                maxLength={3}
                style={{ width: '20px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Last Name</label>
                  <input className="w-name capitalize" value={ref1Last} onChange={e=>setRef1Last(e.target.value)} />
                </div>
                <div className="field">
                  <label>First Name</label>
                  <input className="w-name capitalize" value={ref1First} onChange={e=>setRef1First(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>2<sup style={{ fontSize: '0.7em' }}>nd</sup> Referee</h4>
              <input 
                className="w-90" 
                value={ref2Country || 'SUI'} 
                onChange={e=>setRef2Country(e.target.value.toUpperCase())} 
                placeholder="SUI"
                maxLength={3}
                style={{ width: '20px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Last Name</label>
                  <input className="w-name capitalize" value={ref2Last} onChange={e=>setRef2Last(e.target.value)} />
                </div>
                <div className="field">
                  <label>First Name</label>
                  <input className="w-name capitalize" value={ref2First} onChange={e=>setRef2First(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Scorer</h4>
              <input 
                className="w-90" 
                value={scorerCountry || 'SUI'} 
                onChange={e=>setScorerCountry(e.target.value.toUpperCase())} 
                placeholder="SUI"
                maxLength={3}
                style={{ width: '20px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Last Name</label>
                  <input className="w-name capitalize" value={scorerLast} onChange={e=>setScorerLast(e.target.value)} />
                </div>
                <div className="field">
                  <label>First Name</label>
                  <input className="w-name capitalize" value={scorerFirst} onChange={e=>setScorerFirst(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Assistant Scorer</h4>
              <input 
                className="w-90" 
                value={asstCountry || 'SUI'} 
                onChange={e=>setAsstCountry(e.target.value.toUpperCase())} 
                placeholder="SUI"
                maxLength={3}
                style={{ width: '20px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Last Name</label>
                  <input className="w-name capitalize" value={asstLast} onChange={e=>setAsstLast(e.target.value)} />
                </div>
                <div className="field">
                  <label>First Name</label>
                  <input className="w-name capitalize" value={asstFirst} onChange={e=>setAsstFirst(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {lineJudges.map((judge, index) => (
            <div key={index} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Line Judge {index + 1}</h4>
                <input 
                  className="w-90" 
                  value={judge.country || 'SUI'} 
                  onChange={e=>{
                    const updated = [...lineJudges]
                    updated[index] = { ...updated[index], country: e.target.value.toUpperCase() }
                    setLineJudges(updated)
                  }} 
                  placeholder="SUI"
                  maxLength={3}
                  style={{ width: '20px', padding: '4px 8px', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Last Name</label>
                    <input className="w-name capitalize" value={judge.lastName} onChange={e=>{
                      const updated = [...lineJudges]
                      updated[index] = { ...updated[index], lastName: e.target.value }
                      setLineJudges(updated)
                    }} />
                  </div>
                  <div className="field">
                    <label>First Name</label>
                    <input className="w-name capitalize" value={judge.firstName} onChange={e=>{
                      const updated = [...lineJudges]
                      updated[index] = { ...updated[index], firstName: e.target.value }
                      setLineJudges(updated)
                    }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={async () => {
            // Save officials to database if matchId exists
            if (matchId) {
              const officials = [
                { role: '1st referee', firstName: ref1First, lastName: ref1Last, country: ref1Country },
                { role: '2nd referee', firstName: ref2First, lastName: ref2Last, country: ref2Country },
                { role: 'scorer', firstName: scorerFirst, lastName: scorerLast, country: scorerCountry },
                { role: 'assistant scorer', firstName: asstFirst, lastName: asstLast, country: asstCountry }
              ]
              // Add line judges (only those with at least a first or last name)
              lineJudges.forEach((judge, index) => {
                if (judge.firstName || judge.lastName) {
                  officials.push({
                    role: 'line judge',
                    firstName: judge.firstName,
                    lastName: judge.lastName,
                    country: judge.country,
                    position: index + 1
                  })
                }
              })
              await db.matches.update(matchId, { officials })
            }
            setCurrentView('main')
          }}>Confirm</button>
        </div>
      </div>
    )
  }

  if (currentView === 'team_1') {
    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={()=>setCurrentView('main')}>← Back</button>
          <h2>Team 1</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
          <div style={{ width: 80 }}></div>
          )}
        </div>
        <div className="row" style={{ alignItems:'center', gap: '12px' }}>
          <label className="inline"><span>Name</span><input className="w-180 capitalize" value={team_1} onChange={e=>setTeam_1(e.target.value)} /></label>
          <label className="inline"><span>Team Country</span><input className="w-80" value={team_1Country} onChange={e=>setTeam_1Country(e.target.value.toUpperCase())} placeholder="SUI" maxLength={3} /></label>
        </div>
        {isHomeLocked && (
          <div className="panel" style={{ marginTop:8 }}>
            <p className="text-sm">Locked (signed by Coach and Captain). <button className="secondary" onClick={()=>{
              unlockTeam('team_1')
            }}>Unlock</button></p>
          </div>
        )}
        <h4>Roster</h4>
        <div style={{ 
          border: '1px solid rgba(255, 255, 255, 0.2)', 
          borderRadius: '8px', 
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.2)',
          marginBottom: '8px'
        }}>
          <div className="row" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <input disabled={isHomeLocked} className="w-num" placeholder="#" type="number" inputMode="numeric" value={team_1Num} onChange={e=>setTeam_1Num(e.target.value)} />
            <input disabled={isHomeLocked} className="w-name capitalize" placeholder="Last Name" value={team_1Last} onChange={e=>setTeam_1Last(e.target.value)} />
            <input disabled={isHomeLocked} className="w-name capitalize" placeholder="First Name" value={team_1First} onChange={e=>setTeam_1First(e.target.value)} />
            {/* Beach volleyball: No liberos */}
            <label className="inline"><input disabled={isHomeLocked} type="radio" name="team_1Captain" checked={team_1Captain} onChange={()=>setTeam_1Captain(true)} /> Captain</label>
            <button disabled={isHomeLocked} type="button" className="secondary" onClick={() => {
              if (!team_1Last || !team_1First) return
              const newPlayer = { number: team_1Num ? Number(team_1Num) : null, lastName: team_1Last, firstName: team_1First, isCaptain: team_1Captain }
              setTeam_1Roster(list => {
                const cleared = team_1Captain ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
                const next = [...cleared, newPlayer].sort((a,b) => {
                  const an = a.number ?? 999
                  const bn = b.number ?? 999
                  return an - bn
                })
                return next
              })
              setTeam_1Num(''); setTeam_1First(''); setTeam_1Last(''); setTeam_1Dob(''); setTeam_1Captain(false)
            }}>Add</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {team_1Roster.map((p, i) => (
            <div key={`h-${i}`} className="row" style={{ alignItems: 'center' }}>
              <input 
                disabled={isHomeLocked} 
                className="w-num" 
                placeholder="#" 
                type="number" 
                inputMode="numeric" 
                value={p.number ?? ''} 
                onChange={e => {
                  const updated = [...team_1Roster]
                  updated[i] = { ...updated[i], number: e.target.value ? Number(e.target.value) : null }
                  setTeam_1Roster(updated)
                }} 
              />
              <input 
                disabled={isHomeLocked} 
                className="w-name capitalize" 
                placeholder="Last Name" 
                value={p.lastName || ''} 
                onChange={e => {
                  const updated = [...team_1Roster]
                  updated[i] = { ...updated[i], lastName: e.target.value }
                  setTeam_1Roster(updated)
                }} 
              />
              <input 
                disabled={isHomeLocked} 
                className="w-name capitalize" 
                placeholder="First Name" 
                value={p.firstName || ''} 
                onChange={e => {
                  const updated = [...team_1Roster]
                  updated[i] = { ...updated[i], firstName: e.target.value }
                  setTeam_1Roster(updated)
                }} 
              />
              {/* Beach volleyball: No liberos */}
              <label className="inline">
                <input 
                  disabled={isHomeLocked} 
                  type="radio" 
                  name="team_1Captain" 
                  checked={p.isCaptain || false} 
                  onChange={() => {
                    const updated = team_1Roster.map((player, idx) => ({
                      ...player,
                      isCaptain: idx === i
                    }))
                    setTeam_1Roster(updated)
                  }} 
                /> 
                Captain
              </label>
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setTeam_1Roster(list => list.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          </div>
        {/* Beach volleyball: No bench staff */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={async () => {
            // Save home team data to database if matchId exists
            if (matchId && match?.homeTeamId) {
              await db.teams.update(match.homeTeamId, {
                name: team_1,
                color: team_1Color
              })
              
              // Update players with captain status
              if (team_1Roster.length) {
                const existingPlayers = await db.players.where('teamId').equals(match.homeTeamId).toArray()
                const rosterNumbers = new Set(team_1Roster.map(p => p.number).filter(n => n != null))
                
                for (const rosterPlayer of team_1Roster) {
                  if (!rosterPlayer.number) continue // Skip players without numbers
                  
                  const existingPlayer = existingPlayers.find(ep => ep.number === rosterPlayer.number)
                  if (existingPlayer) {
                    // Update existing player
                    await db.players.update(existingPlayer.id, {
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      // Beach volleyball: No liberos
                      isCaptain: !!rosterPlayer.isCaptain
                    })
                  } else {
                    // Add new player (including newly added players after unlock)
                    await db.players.add({
                      teamId: match.homeTeamId,
                      number: rosterPlayer.number,
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      // Beach volleyball: No liberos
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
              
              // Update match with short name and restore signatures (re-lock)
              const updateData = {
                team_1Country: team_1Country || 'SUI'
              }
              
              // Restore signatures if they were previously saved (re-lock the team)
              if (!homeCoachSignature && savedSignatures.homeCoach) {
                updateData.homeCoachSignature = savedSignatures.homeCoach
                setTeam_1CoachSignature(savedSignatures.homeCoach)
              }
              if (!team_1CaptainSignature && savedSignatures.team_1Captain) {
                updateData.team_1CaptainSignature = savedSignatures.team_1Captain
                setTeam_1CaptainSignature(savedSignatures.team_1Captain)
              }
              
              await db.matches.update(matchId, updateData)
            }
            setCurrentView('main')
          }}>Confirm</button>
        </div>
      </div>
    )
  }

  if (currentView === 'team_2') {
    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={()=>setCurrentView('main')}>← Back</button>
          <h2>Team 2</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
          <div style={{ width: 80 }}></div>
          )}
        </div>
        <div className="row" style={{ alignItems:'center', gap: '12px' }}>
          <label className="inline"><span>Name</span><input className="w-180 capitalize" value={team_2} onChange={e=>setTeam_2(e.target.value)} /></label>
          <label className="inline"><span>Team Country</span><input className="w-80" value={team_2Country} onChange={e=>setTeam_2Country(e.target.value.toUpperCase())} placeholder="SUI" maxLength={3} /></label>
        </div>
        {isAwayLocked && (
          <div className="panel" style={{ marginTop:8 }}>
            <p className="text-sm">Locked (signed by Coach and Captain). <button className="secondary" onClick={()=>{
              unlockTeam('team_2')
            }}>Unlock</button></p>
          </div>
        )}
        <h4>Roster</h4>
        
        {/* Beach volleyball: No PDF roster import */}
        
        <div style={{ 
          border: '1px solid rgba(255, 255, 255, 0.2)', 
          borderRadius: '8px', 
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.2)',
          marginBottom: '8px'
        }}>
          <div className="row" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <input disabled={isAwayLocked} className="w-num" placeholder="#" type="number" inputMode="numeric" value={team_2Num} onChange={e=>setTeam_2Num(e.target.value)} />
            <input disabled={isAwayLocked} className="w-name capitalize" placeholder="Last Name" value={team_2Last} onChange={e=>setTeam_2Last(e.target.value)} />
            <input disabled={isAwayLocked} className="w-name capitalize" placeholder="First Name" value={team_2First} onChange={e=>setTeam_2First(e.target.value)} />
            {/* Beach volleyball: No liberos */}
            <label className="inline"><input disabled={isAwayLocked} type="radio" name="team_2Captain" checked={team_2Captain} onChange={()=>setTeam_2Captain(true)} /> Captain</label>
            <button disabled={isAwayLocked} type="button" className="secondary" onClick={() => {
              if (!team_2Last || !team_2First) return
              const newPlayer = { number: team_2Num ? Number(team_2Num) : null, lastName: team_2Last, firstName: team_2First, isCaptain: team_2Captain }
              setTeam_2Roster(list => {
                const cleared = team_2Captain ? list.map(p => ({ ...p, isCaptain: false })) : [...list]
                const next = [...cleared, newPlayer].sort((a,b) => {
                  const an = a.number ?? 999
                  const bn = b.number ?? 999
                  return an - bn
                })
                return next
              })
              setTeam_2Num(''); setTeam_2First(''); setTeam_2Last(''); setTeam_2Dob(''); setTeam_2Captain(false)
            }}>Add</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {team_2Roster.map((p, i) => (
            <div key={`a-${i}`} className="row" style={{ alignItems: 'center' }}>
              <input 
                disabled={isAwayLocked} 
                className="w-num" 
                placeholder="#" 
                type="number" 
                inputMode="numeric" 
                value={p.number ?? ''} 
                onChange={e => {
                  const updated = [...team_2Roster]
                  updated[i] = { ...updated[i], number: e.target.value ? Number(e.target.value) : null }
                  setTeam_2Roster(updated)
                }} 
              />
              <input 
                disabled={isAwayLocked} 
                className="w-name capitalize" 
                placeholder="Last Name" 
                value={p.lastName || ''} 
                onChange={e => {
                  const updated = [...team_2Roster]
                  updated[i] = { ...updated[i], lastName: e.target.value }
                  setTeam_2Roster(updated)
                }} 
              />
              <input 
                disabled={isAwayLocked} 
                className="w-name capitalize" 
                placeholder="First Name" 
                value={p.firstName || ''} 
                onChange={e => {
                  const updated = [...team_2Roster]
                  updated[i] = { ...updated[i], firstName: e.target.value }
                  setTeam_2Roster(updated)
                }} 
              />
              {/* Beach volleyball: No liberos */}
              <label className="inline">
                <input 
                  disabled={isAwayLocked} 
                  type="radio" 
                  name="team_2Captain" 
                  checked={p.isCaptain || false} 
                  onChange={() => {
                    const updated = team_2Roster.map((player, idx) => ({
                      ...player,
                      isCaptain: idx === i
                    }))
                    setTeam_2Roster(updated)
                  }} 
                /> 
                Captain
              </label>
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setTeam_2Roster(list => list.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          </div>
        {/* Beach volleyball: No bench staff */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={async () => {
            // Save away team data to database if matchId exists
            if (matchId && match?.awayTeamId) {
              await db.teams.update(match.awayTeamId, {
                name: team_2,
                color: team_2Color
              })
              
              // Update players with captain status
              if (team_2Roster.length) {
                const existingPlayers = await db.players.where('teamId').equals(match.awayTeamId).toArray()
                const rosterNumbers = new Set(team_2Roster.map(p => p.number).filter(n => n != null))
                
                for (const rosterPlayer of team_2Roster) {
                  if (!rosterPlayer.number) continue // Skip players without numbers
                  
                  const existingPlayer = existingPlayers.find(ep => ep.number === rosterPlayer.number)
                  if (existingPlayer) {
                    // Update existing player
                    await db.players.update(existingPlayer.id, {
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      // Beach volleyball: No liberos
                      isCaptain: !!rosterPlayer.isCaptain
                    })
                  } else {
                    // Add new player (including newly added players after unlock)
                    await db.players.add({
                      teamId: match.awayTeamId,
                      number: rosterPlayer.number,
                      name: `${rosterPlayer.lastName} ${rosterPlayer.firstName}`,
                      lastName: rosterPlayer.lastName,
                      firstName: rosterPlayer.firstName,
                      // Beach volleyball: No liberos
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
              
              // Update match with short name and restore signatures (re-lock)
              const updateData = {
                team_2Country: team_2Country || 'SUI'
              }
              
              // Restore signatures if they were previously saved (re-lock the team)
              if (!awayCoachSignature && savedSignatures.awayCoach) {
                updateData.awayCoachSignature = savedSignatures.awayCoach
                setTeam_2CoachSignature(savedSignatures.awayCoach)
              }
              if (!team_2CaptainSignature && savedSignatures.team_2Captain) {
                updateData.team_2CaptainSignature = savedSignatures.team_2Captain
                setTeam_2CaptainSignature(savedSignatures.team_2Captain)
              }
              
              await db.matches.update(matchId, updateData)
            }
            setCurrentView('main')
          }}>Confirm</button>
        </div>
      </div>
    )
  }

  if (currentView === 'coin-toss') {
    const teamAInfo = teamA === 'team_1' ? { name: team_1, color: team_1Color, roster: team_1Roster } : { name: team_2, color: team_2Color, roster: team_2Roster }
    const teamBInfo = teamB === 'team_1' ? { name: team_1, color: team_1Color, roster: team_1Roster } : { name: team_2, color: team_2Color, roster: team_2Roster }
    
    const teamACoachSig = teamA === 'team_1' ? homeCoachSignature : awayCoachSignature
    const teamACaptainSig = teamA === 'team_1' ? team_1CaptainSignature : team_2CaptainSignature
    const teamBCoachSig = teamB === 'team_1' ? homeCoachSignature : awayCoachSignature
    const teamBCaptainSig = teamB === 'team_1' ? team_1CaptainSignature : team_2CaptainSignature
    // Check if coach names are set
    const teamACoachName = teamA === 'team_1' ? team_1CoachName : team_2CoachName
    const teamBCoachName = teamB === 'team_1' ? team_1CoachName : team_2CoachName
    const teamAHasCoach = teamACoachName?.firstName || teamACoachName?.lastName
    const teamBHasCoach = teamBCoachName?.firstName || teamBCoachName?.lastName
    // Use roster in original order (not sorted by number) to maintain player 1 and player 2 order
    const teamARosterEntries = (teamAInfo.roster || [])
      .slice(0, 2)
      .map((player, index) => ({ player, index }))
    const teamBRosterEntries = (teamBInfo.roster || [])
      .slice(0, 2)
      .map((player, index) => ({ player, index }))

    // Volleyball images - fixed size and responsive
    const imageSize = '64px'
    const volleyballImage = (
      <div style={{ 
        width: imageSize, 
        height: imageSize, 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <img 
          src={mikasaVolleyball} 
          alt="Mikasa V200W Volleyball" 
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%', 
            width: 'auto',
            height: 'auto',
            objectFit: 'contain' 
          }}
        />
      </div>
    )
    const volleyballPlaceholder = (
      <div style={{ 
        width: imageSize, 
        height: imageSize, 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:'transparent',
        flexShrink: 0
      }}>
        <div style={{ 
          width: '32px', 
          height: '32px', 
          background: 'transparent'
        }} />
      </div>
    )

    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={() => {
            setCurrentView('main')
            if (onCoinTossClose) onCoinTossClose()
          }}>← Back</button>
          <h2>Coin Toss</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
          <div style={{ width: 80 }}></div>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>
          {/* Team A */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
              <h3 style={{ textAlign: 'center', fontSize: '30px', margin: 0 }}>Team A</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="coinTossWinner"
                  value="teamA"
                  checked={coinTossWinner === 'teamA'}
                  onChange={(e) => setCoinTossWinner('teamA')}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--muted)' }}>Won coin toss</span>
              </label>
            </div>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, height: '48px' }}>
              <button 
                type="button"
                style={{ 
                  background: teamAInfo.color, 
                  color: isBrightColor(teamAInfo.color) ? '#000' : '#fff', 
                  flex: 1,
                  padding: '12px',
                  fontSize: '30px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '8px'
                }}
              >
                {teamAInfo.name}
              </button>
            </div>
            
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', height: '64px', alignItems: 'center', gap: 12 }}>
              {serveA ? volleyballImage : volleyballPlaceholder}
            </div>
            
            {/* Player table for Team A */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Player</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Number</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Captain</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>First Serve</th>
                  </tr>
                </thead>
                <tbody>
                  {teamARosterEntries.slice(0, 2).map(({ player: p, index: originalIdx }) => {
                    const playerState = originalIdx === 0 ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2
                    const otherPlayerState = originalIdx === 0 ? coinTossTeamAPlayer2 : coinTossTeamAPlayer1
                    const setPlayerState = originalIdx === 0 ? setCoinTossTeamAPlayer1 : setCoinTossTeamAPlayer2
                    const setOtherPlayerState = originalIdx === 0 ? setCoinTossTeamAPlayer2 : setCoinTossTeamAPlayer1
                    return (
                      <tr key={`teamA-player-${originalIdx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px' }}>{`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Player'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={playerState.number === 1} 
                                onChange={async (e) => {
                                  if (e.target.checked) {
                                    setPlayerState({ ...playerState, number: 1 })
                                    setOtherPlayerState({ ...otherPlayerState, number: 2 })
                                  } else {
                                    setPlayerState({ ...playerState, number: null })
                                  }
                                  await saveCoinTossPlayerData()
                                }}
                                style={{ 
                                  width: '16px', 
                                  height: '16px', 
                                  cursor: 'pointer',
                                  accentColor: playerState.number === 1 ? '#4CAF50' : '#999',
                                  opacity: playerState.number === 1 ? 1 : 0.5
                                }}
                              />
                              <span style={{ fontSize: playerState.number === 1 ? '36px' : '12px', fontWeight: playerState.number === 1 ? 700 : 400, transition: 'font-size 0.2s', color: playerState.number === 1 ? '#4CAF50' : '#999' }}>1</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={playerState.number === 2} 
                                onChange={async (e) => {
                                  if (e.target.checked) {
                                    setPlayerState({ ...playerState, number: 2 })
                                    setOtherPlayerState({ ...otherPlayerState, number: 1 })
                                  } else {
                                    setPlayerState({ ...playerState, number: null })
                                  }
                                  await saveCoinTossPlayerData()
                                }}
                                style={{ 
                                  width: '16px', 
                                  height: '16px', 
                                  cursor: 'pointer',
                                  accentColor: playerState.number === 2 ? '#4CAF50' : '#999',
                                  opacity: playerState.number === 2 ? 1 : 0.5
                                }}
                              />
                              <span style={{ fontSize: playerState.number === 2 ? '36px' : '12px', fontWeight: playerState.number === 2 ? 700 : 400, transition: 'font-size 0.2s', color: playerState.number === 2 ? '#4CAF50' : '#999' }}>2</span>
                            </label>
                          </div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={playerState.isCaptain} 
                              onChange={async (e) => {
                                setCoinTossTeamAPlayer1({ ...coinTossTeamAPlayer1, isCaptain: originalIdx === 0 && e.target.checked })
                                setCoinTossTeamAPlayer2({ ...coinTossTeamAPlayer2, isCaptain: originalIdx === 1 && e.target.checked })
                                await saveCoinTossPlayerData()
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </label>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={playerState.firstServe} 
                              onChange={async (e) => {
                                setCoinTossTeamAPlayer1({ ...coinTossTeamAPlayer1, firstServe: originalIdx === 0 && e.target.checked })
                                setCoinTossTeamAPlayer2({ ...coinTossTeamAPlayer2, firstServe: originalIdx === 1 && e.target.checked })
                                await saveCoinTossPlayerData()
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Summary table for Team A */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>No.</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Player's Name</th>
                  </tr>
                </thead>
                <tbody>
                  {teamAInfo.roster.slice(0, 2).map((p, originalIdx) => {
                    const playerState = originalIdx === 0 ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2
                    const numberDisplay = playerState.number || ''
                    const isCaptain = playerState.isCaptain
                    const isFirstServe = playerState.firstServe
                    const formattedName = p.lastName && p.firstName 
                      ? `${p.lastName}, ${p.firstName.charAt(0).toUpperCase()}.`
                      : p.lastName || p.firstName || 'Player'
                    return (
                      <tr key={`teamA-summary-${originalIdx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {numberDisplay && (
                              <>
                                {isCaptain ? (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: '2px solid #4CAF50',
                                    color: '#4CAF50',
                                    fontWeight: 700,
                                    fontSize: '14px'
                                  }}>
                                    {numberDisplay}
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{numberDisplay}</span>
                                )}
                                {isFirstServe && <span style={{ color: '#4CAF50', fontWeight: 700, fontSize: '16px' }}>*</span>}
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>{formattedName}</td>
                      </tr>
                    )
                  })}
                  {((teamA === 'team_1' && (team_1CoachName.firstName || team_1CoachName.lastName)) || 
                    (teamA === 'team_2' && (team_2CoachName.firstName || team_2CoachName.lastName))) && (
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>C</td>
                      <td style={{ padding: '8px' }}>
                        {teamA === 'team_1' 
                          ? `${team_1CoachName.lastName || ''}, ${team_1CoachName.firstName ? team_1CoachName.firstName.charAt(0).toUpperCase() + '.' : ''}`.trim()
                          : `${team_2CoachName.lastName || ''}, ${team_2CoachName.firstName ? team_2CoachName.firstName.charAt(0).toUpperCase() + '.' : ''}`.trim()
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Beach volleyball: No bench officials */}
            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 16, marginTop: 24, paddingTop: 16,  }}>
              {matchWithCoaches && teamAHasCoach && (
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Coach Signature</h4>
                  {teamACoachSig ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <img src={teamACoachSig} alt="Coach signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                      <button onClick={() => {
                        if (teamA === 'team_1') setTeam_1CoachSignature(null)
                        else setTeam_2CoachSignature(null)
                      }}>Remove</button>
                    </div>
                  ) : (
                    <button onClick={() => setOpenSignature(teamA === 'team_1' ? 'team_1-coach' : 'team_2-coach')} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600 }}>Sign Coach</button>
                  )}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Captain Signature</h4>
                {teamACaptainSig ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <img src={teamACaptainSig} alt="Captain signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                    <button onClick={() => {
                      if (teamA === 'team_1') setTeam_1CaptainSignature(null)
                      else setTeam_2CaptainSignature(null)
                    }}>Remove</button>
                  </div>
                ) : (
                  <button onClick={() => setOpenSignature(teamA === 'team_1' ? 'team_1-captain' : 'team_2-captain')} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600 }}>Sign Captain</button>
                )}
              </div>
            </div>
          </div>
          
          {/* Middle buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'flex-start', marginTop: '50px' }}>
            <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button className="secondary" onClick={switchTeams} style={{ padding: '8px 16px' }}>
                Switch Teams
              </button>
            </div>
            <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button className="secondary" onClick={switchServe} style={{ padding: '8px 16px' }}>
                Switch Serve
              </button>
            </div>
          </div>
          
          {/* Team B */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
              <h3 style={{ textAlign: 'center', fontSize: '30px', margin: 0 }}>Team B</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="coinTossWinner"
                  value="teamB"
                  checked={coinTossWinner === 'teamB'}
                  onChange={(e) => setCoinTossWinner('teamB')}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--muted)' }}>Won coin toss</span>
              </label>
            </div>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, height: '48px' }}>
              <button 
                type="button"
                style={{ 
                  background: teamBInfo.color, 
                  color: isBrightColor(teamBInfo.color) ? '#000' : '#fff', 
                  flex: 1,
                  padding: '12px',
                  fontSize: '30px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '8px'
                }}
              >
                {teamBInfo.name}
              </button>
            </div>
            
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', height: '64px', alignItems: 'center', gap: 12 }}>
              {serveB ? volleyballImage : volleyballPlaceholder}
            </div>
            
            {/* Player table for Team B */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Player</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Number</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Captain</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>First Serve</th>
                  </tr>
                </thead>
                <tbody>
                  {teamBRosterEntries.slice(0, 2).map(({ player: p, index: originalIdx }) => {
                    const playerState = originalIdx === 0 ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2
                    const otherPlayerState = originalIdx === 0 ? coinTossTeamBPlayer2 : coinTossTeamBPlayer1
                    const setPlayerState = originalIdx === 0 ? setCoinTossTeamBPlayer1 : setCoinTossTeamBPlayer2
                    const setOtherPlayerState = originalIdx === 0 ? setCoinTossTeamBPlayer2 : setCoinTossTeamBPlayer1
                    return (
                      <tr key={`teamB-player-${originalIdx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px' }}>{`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Player'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={playerState.number === 1} 
                                onChange={async (e) => {
                                  if (e.target.checked) {
                                    setPlayerState({ ...playerState, number: 1 })
                                    setOtherPlayerState({ ...otherPlayerState, number: 2 })
                                  } else {
                                    setPlayerState({ ...playerState, number: null })
                                  }
                                  await saveCoinTossPlayerData()
                                }}
                                style={{ 
                                  width: '16px', 
                                  height: '16px', 
                                  cursor: 'pointer',
                                  accentColor: playerState.number === 1 ? '#4CAF50' : '#999',
                                  opacity: playerState.number === 1 ? 1 : 0.5
                                }}
                              />
                              <span style={{ fontSize: playerState.number === 1 ? '36px' : '12px', fontWeight: playerState.number === 1 ? 700 : 400, transition: 'font-size 0.2s', color: playerState.number === 1 ? '#4CAF50' : '#999' }}>1</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={playerState.number === 2} 
                                onChange={async (e) => {
                                  if (e.target.checked) {
                                    setPlayerState({ ...playerState, number: 2 })
                                    setOtherPlayerState({ ...otherPlayerState, number: 1 })
                                  } else {
                                    setPlayerState({ ...playerState, number: null })
                                  }
                                  await saveCoinTossPlayerData()
                                }}
                                style={{ 
                                  width: '16px', 
                                  height: '16px', 
                                  cursor: 'pointer',
                                  accentColor: playerState.number === 2 ? '#4CAF50' : '#999',
                                  opacity: playerState.number === 2 ? 1 : 0.5
                                }}
                              />
                              <span style={{ fontSize: playerState.number === 2 ? '36px' : '12px', fontWeight: playerState.number === 2 ? 700 : 400, transition: 'font-size 0.2s', color: playerState.number === 2 ? '#4CAF50' : '#999' }}>2</span>
                            </label>
                          </div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={playerState.isCaptain} 
                              onChange={async (e) => {
                                setCoinTossTeamBPlayer1({ ...coinTossTeamBPlayer1, isCaptain: originalIdx === 0 && e.target.checked })
                                setCoinTossTeamBPlayer2({ ...coinTossTeamBPlayer2, isCaptain: originalIdx === 1 && e.target.checked })
                                await saveCoinTossPlayerData()
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </label>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={playerState.firstServe} 
                              onChange={async (e) => {
                                setCoinTossTeamBPlayer1({ ...coinTossTeamBPlayer1, firstServe: originalIdx === 0 && e.target.checked })
                                setCoinTossTeamBPlayer2({ ...coinTossTeamBPlayer2, firstServe: originalIdx === 1 && e.target.checked })
                                await saveCoinTossPlayerData()
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Summary table for Team B */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>No.</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Player's Name</th>
                  </tr>
                </thead>
                <tbody>
                  {teamBInfo.roster.slice(0, 2).map((p, originalIdx) => {
                    const playerState = originalIdx === 0 ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2
                    const numberDisplay = playerState.number || ''
                    const isCaptain = playerState.isCaptain
                    const isFirstServe = playerState.firstServe
                    const formattedName = p.lastName && p.firstName 
                      ? `${p.lastName}, ${p.firstName.charAt(0).toUpperCase()}.`
                      : p.lastName || p.firstName || 'Player'
                    return (
                      <tr key={`teamB-summary-${originalIdx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {numberDisplay && (
                              <>
                                {isCaptain ? (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: '2px solid #4CAF50',
                                    color: '#4CAF50',
                                    fontWeight: 700,
                                    fontSize: '14px'
                                  }}>
                                    {numberDisplay}
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{numberDisplay}</span>
                                )}
                                {isFirstServe && <span style={{ color: '#4CAF50', fontWeight: 700, fontSize: '16px' }}>*</span>}
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>{formattedName}</td>
                      </tr>
                    )
                  })}
                  {matchWithCoaches && ((teamB === 'team_1' && (team_1CoachName.firstName || team_1CoachName.lastName)) || 
                    (teamB === 'team_2' && (team_2CoachName.firstName || team_2CoachName.lastName))) && (
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>C</td>
                      <td style={{ padding: '8px' }}>
                        {teamB === 'team_1' 
                          ? `${team_1CoachName.lastName || ''}, ${team_1CoachName.firstName ? team_1CoachName.firstName.charAt(0).toUpperCase() + '.' : ''}`.trim()
                          : `${team_2CoachName.lastName || ''}, ${team_2CoachName.firstName ? team_2CoachName.firstName.charAt(0).toUpperCase() + '.' : ''}`.trim()
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Beach volleyball: No bench officials */}
            
            <div style={{ display: 'flex', flexDirection: 'row', gap: 16, marginTop: 24, paddingTop: 16,  }}>
              {matchWithCoaches && teamBHasCoach && (
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Coach Signature</h4>
                  {teamBCoachSig ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <img src={teamBCoachSig} alt="Coach signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                      <button onClick={() => {
                        if (teamB === 'team_1') setTeam_1CoachSignature(null)
                        else setTeam_2CoachSignature(null)
                      }}>Remove</button>
                    </div>
                  ) : (
                    <button onClick={() => setOpenSignature(teamB === 'team_1' ? 'team_1-coach' : 'team_2-coach')} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600 }}>Sign Coach</button>
                  )}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Captain Signature</h4>
                {teamBCaptainSig ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <img src={teamBCaptainSig} alt="Captain signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                    <button onClick={() => {
                      if (teamB === 'team_1') setTeam_1CaptainSignature(null)
                      else setTeam_2CaptainSignature(null)
                    }}>Remove</button>
                  </div>
                ) : (
                  <button onClick={() => setOpenSignature(teamB === 'team_1' ? 'team_1-captain' : 'team_2-captain')} style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600 }}>Sign Captain</button>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          {isCoinTossConfirmed ? (
            <button onClick={async () => {
              // Save coin toss result and firstServe when returning to match
              if (matchId) {
                const firstServeTeam = serveA ? teamA : teamB
                await db.matches.update(matchId, {
                  firstServe: firstServeTeam,
                  coinTossTeamA: teamA,
                  coinTossTeamB: teamB,
                  coinTossServeA: serveA,
                  coinTossServeB: serveB
                })
              }
              onReturn()
            }} style={{ padding: '12px 24px', fontSize: '14px' }}>
              Return to match
            </button>
          ) : (
          <button onClick={confirmCoinToss} style={{ padding: '12px 24px', fontSize: '14px' }}>
            Coin Toss Result
          </button>
          )}
        </div>
        
        
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
              <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)' }}>
                {noticeModal.message}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setNoticeModal(null)}
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
        
        <SignaturePad 
          open={openSignature !== null} 
          onClose={() => setOpenSignature(null)} 
          onSave={handleSignatureSave}
          title={openSignature === 'team_1-coach' ? 'Team 1 Coach Signature' : 
                 openSignature === 'team_1-captain' ? 'Team 1 Captain Signature' :
                 openSignature === 'team_2-coach' ? 'Team 2 Coach Signature' :
                 openSignature === 'team_2-captain' ? 'Team 2 Captain Signature' : 'Sign'}
        />
      </div>
    )
  }

  if (currentView === 'confirm-coin-toss') {
    // Calculate serve rotation
    const firstServeTeam = serveA ? teamA : teamB
    
    // Get team info
    const teamAInfo = teamA === 'team_1' ? { name: team_1, roster: team_1Roster } : { name: team_2, roster: team_2Roster }
    const teamBInfo = teamB === 'team_1' ? { name: team_1, roster: team_1Roster } : { name: team_2, roster: team_2Roster }
    
    // Calculate rotations
    const getPlayerRotation = (teamKey, playerIndex, isFirstServeTeam) => {
      const playerData = teamKey === teamA 
        ? (playerIndex === 0 ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2)
        : (playerIndex === 0 ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2)
      
      if (isFirstServeTeam) {
        // Serving team: first serve player = 1, other = 3
        return playerData.firstServe ? 1 : 3
      } else {
        // Receiving team: first serve player = 2, other = 4
        return playerData.firstServe ? 2 : 4
      }
    }
    
    const teamAPlayer1Rotation = getPlayerRotation(teamA, 0, firstServeTeam === teamA)
    const teamAPlayer2Rotation = getPlayerRotation(teamA, 1, firstServeTeam === teamA)
    const teamBPlayer1Rotation = getPlayerRotation(teamB, 0, firstServeTeam === teamB)
    const teamBPlayer2Rotation = getPlayerRotation(teamB, 1, firstServeTeam === teamB)
    
    // Build rotation order array (1, 2, 3, 4)
    const rotationOrder = [
      { rotation: 1, team: firstServeTeam === teamA ? teamA : teamB, playerIndex: firstServeTeam === teamA ? (coinTossTeamAPlayer1.firstServe ? 0 : 1) : (coinTossTeamBPlayer1.firstServe ? 0 : 1), playerData: firstServeTeam === teamA ? (coinTossTeamAPlayer1.firstServe ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2) : (coinTossTeamBPlayer1.firstServe ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2), roster: firstServeTeam === teamA ? teamAInfo.roster : teamBInfo.roster },
      { rotation: 2, team: firstServeTeam === teamA ? teamB : teamA, playerIndex: firstServeTeam === teamA ? (coinTossTeamBPlayer1.firstServe ? 0 : 1) : (coinTossTeamAPlayer1.firstServe ? 0 : 1), playerData: firstServeTeam === teamA ? (coinTossTeamBPlayer1.firstServe ? coinTossTeamBPlayer1 : coinTossTeamBPlayer2) : (coinTossTeamAPlayer1.firstServe ? coinTossTeamAPlayer1 : coinTossTeamAPlayer2), roster: firstServeTeam === teamA ? teamBInfo.roster : teamAInfo.roster },
      { rotation: 3, team: firstServeTeam === teamA ? teamA : teamB, playerIndex: firstServeTeam === teamA ? (coinTossTeamAPlayer1.firstServe ? 1 : 0) : (coinTossTeamBPlayer1.firstServe ? 1 : 0), playerData: firstServeTeam === teamA ? (coinTossTeamAPlayer1.firstServe ? coinTossTeamAPlayer2 : coinTossTeamAPlayer1) : (coinTossTeamBPlayer1.firstServe ? coinTossTeamBPlayer2 : coinTossTeamBPlayer1), roster: firstServeTeam === teamA ? teamAInfo.roster : teamBInfo.roster },
      { rotation: 4, team: firstServeTeam === teamA ? teamB : teamA, playerIndex: firstServeTeam === teamA ? (coinTossTeamBPlayer1.firstServe ? 1 : 0) : (coinTossTeamAPlayer1.firstServe ? 1 : 0), playerData: firstServeTeam === teamA ? (coinTossTeamBPlayer1.firstServe ? coinTossTeamBPlayer2 : coinTossTeamBPlayer1) : (coinTossTeamAPlayer1.firstServe ? coinTossTeamAPlayer2 : coinTossTeamAPlayer1), roster: firstServeTeam === teamA ? teamBInfo.roster : teamAInfo.roster }
    ]
    
    return (
      <div className="setup">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button className="secondary" onClick={() => setCurrentView('coin-toss')}>← Back</button>
          <h2>Confirm Coin Toss Result</h2>
          {onGoHome ? (
            <button className="secondary" onClick={onGoHome}>Home</button>
          ) : (
            <div style={{ width: 80 }}></div>
          )}
        </div>
        
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Team Assignment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '4px' }}>Team A</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{teamAInfo.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '4px' }}>Team B</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{teamBInfo.name}</div>
              </div>
            </div>
          </div>
          
          {coinTossWinner && (
            <div style={{ marginBottom: '32px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Coin Toss Winner</h3>
              <div style={{ fontSize: '16px' }}>
                <strong>{coinTossWinner === 'teamA' ? teamAInfo.name : teamBInfo.name}</strong> won the coin toss
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: '32px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>First Serve</h3>
            <div style={{ fontSize: '16px' }}>
              <strong>{firstServeTeam === teamA ? teamAInfo.name : teamBInfo.name}</strong> serves first
            </div>
          </div>
          
          <div style={{ marginBottom: '32px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Service Rotation Order</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>Rotation</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>Team</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>Player</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>Number</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>Captain</th>
                </tr>
              </thead>
              <tbody>
                {rotationOrder.map((item, idx) => {
                  const player = item.roster[item.playerIndex]
                  const playerName = `${player?.firstName || ''} ${player?.lastName || ''}`.trim() || 'Player'
                  const teamName = item.team === teamA ? teamAInfo.name : teamBInfo.name
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px', fontSize: '16px', fontWeight: 600 }}>{item.rotation}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{teamName}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{playerName}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{item.playerData.number || '-'}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{item.playerData.isCaptain ? 'Yes' : 'No'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                console.log('[COIN TOSS] Back clicked, going back to coin toss')
                setCurrentView('coin-toss')
              }}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'rgba(255,255,255,0.1)',
                color: 'var(--text)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Back to Coin Toss
            </button>
            <button
              onClick={async () => {
                console.log('[COIN TOSS] Confirm clicked on confirmation page')
                await actuallyConfirmCoinToss()
                // actuallyConfirmCoinToss will call onStart() which navigates to scoreboard
                // No need to navigate here, just let it proceed
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
              Confirm Coin Toss & Start Match
            </button>
          </div>
        </div>
      </div>
    )
  }

  const StatusBadge = ({ ready }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: ready ? '#22c55e' : '#f97316',
        color: '#0b1120',
        fontWeight: 700,
        fontSize: 12,
        marginRight: 8
      }}
      aria-label={ready ? 'Complete' : 'Incomplete'}
      title={ready ? 'Complete' : 'Incomplete'}
    >
      {ready ? '✓' : '!'}
    </span>
  )

  const officialsConfigured =
    !!(ref1Last && ref1First && ref2Last && ref2First && scorerLast && scorerFirst && asstLast && asstFirst)
  const matchInfoConfigured = !!(date || time || eventName || site || beach || court || matchPhase || matchRound || matchNumber)
  // Beach volleyball: Exactly 2 players required
  const team_1Configured = !!(team_1 && team_1Roster.length === 2)
  const team_2Configured = !!(team_2 && team_2Roster.length === 2)

  const formatOfficial = (lastName, firstName) => {
    if (!lastName && !firstName) return 'Not set'
    if (!lastName) return firstName
    if (!firstName) return lastName
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

  const handleRefereeConnectionToggle = async (enabled) => {
    if (!matchId) return
    setRefereeConnectionEnabled(enabled)
    try {
      await db.matches.update(matchId, { refereeConnectionEnabled: enabled })
    } catch (error) {
      console.error('Failed to update referee connection setting:', error)
    }
  }

  const handleHomeTeamConnectionToggle = async (enabled) => {
    if (!matchId) return
    setTeam_1ConnectionEnabled(enabled)
    try {
      await db.matches.update(matchId, { homeTeamConnectionEnabled: enabled })
    } catch (error) {
      console.error('Failed to update home team connection setting:', error)
    }
  }

  const handleAwayTeamConnectionToggle = async (enabled) => {
    if (!matchId) return
    setTeam_2ConnectionEnabled(enabled)
    try {
      await db.matches.update(matchId, { awayTeamConnectionEnabled: enabled })
    } catch (error) {
      console.error('Failed to update away team connection setting:', error)
    }
  }

  // Connection Banner Component
  const ConnectionBanner = ({ team, enabled, onToggle, pin, onEditPin }) => {
    return (
      <div style={{
        marginTop: 12,
        padding: '12px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}>
            <span>Enable Connection</span>
            <div style={{
              position: 'relative',
              width: '44px',
              height: '24px',
              background: enabled ? '#22c55e' : '#6b7280',
              borderRadius: '12px',
              transition: 'background 0.2s',
              cursor: 'pointer',
              flexShrink: 0
            }}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(!enabled)
            }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: enabled ? '22px' : '2px',
                width: '20px',
                height: '20px',
                background: '#fff',
                borderRadius: '50%',
                transition: 'left 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }} />
            </div>
          </label>
          {enabled && pin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Bench PIN:</span>
              <span style={{
                fontWeight: 700,
                fontSize: '14px',
                color: 'var(--accent)',
                letterSpacing: '2px',
                fontFamily: 'monospace'
              }}>
                {pin}
              </span>
              <button
                onClick={onEditPin}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
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
          )}
        </div>
      </div>
    )
  }

  const handleEditPin = (type) => {
    let currentPin = ''
    if (type === 'referee') {
      currentPin = match?.refereePin || ''
    }
    // Beach volleyball: No bench PINs
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
      let updateField = {}
      if (editPinType === 'referee') {
        updateField = { refereePin: newPin }
      }
      // Beach volleyball: No bench PINs
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
    <div className="setup">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
        <h2 style={{ margin: 0 }}>Match Setup</h2>
        
        
        {onGoHome && (
          <button className="secondary" onClick={onGoHome}>
            Home
          </button>
        )}
      </div>
      <div className="grid-4">
        <div className="card" style={{ order: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={matchInfoConfigured} />
                <h3 style={{ margin: 0 }}>Match info</h3>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {(date || time) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Date & Time</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {formatDisplayDate(date) || 'Not set'} {formatDisplayTime(time) ? `@ ${formatDisplayTime(time)}` : ''}
                    </div>
                  </div>
                )}
                {eventName && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Event</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{eventName}</div>
                  </div>
                )}
                {(site || beach || court) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Location</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {site && <div>{site}</div>}
                      {beach && <div>Beach: {beach}</div>}
                      {court && <div>Court: {court}</div>}
                    </div>
                  </div>
                )}
                {(matchPhase || matchRound) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Phase & Round</div>
                   
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {matchGender && matchPhase && (
                        <div>
                          {matchGender === 'men' ? 'Men' : matchGender === 'women' ? 'Women' : ''} - {matchPhase === 'main_draw' ? 'Main Draw' : matchPhase === 'qualification' ? 'Qualification' : 'Not set'}
                        </div>
                      )}
                      {matchRound && (
                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>
                          {matchRound === 'pool_play' ? 'Pool Play' : matchRound === 'double_elimination' ? 'Double Elimination' : matchRound === 'winner_bracket' ? 'Winner Bracket' : matchRound === 'class' ? 'Class' : matchRound === 'semi_final' ? 'Semi-Final' : matchRound === 'finals' ? 'Finals' : 'Not set'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(matchNumber || matchGender) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Match No.</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      {matchNumber && <div>Match {matchNumber}</div>}

                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="actions"><button className="secondary" onClick={()=>setCurrentView('info')}>Edit</button></div>
        </div>
        <div className="card" style={{ order: 2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={officialsConfigured} />
                <h3 style={{ margin: 0 }}>Match officials</h3>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {(ref1Last || ref1First) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>1<sup style={{ fontSize: '0.7em' }}>ST</sup> REFEREE</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{formatOfficial(ref1Last, ref1First)}</div>
                    {ref1Country && <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{ref1Country}</div>}
                  </div>
                )}
                {(ref2Last || ref2First) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>2<sup style={{ fontSize: '0.7em' }}>ND</sup> REFEREE</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{formatOfficial(ref2Last, ref2First)}</div>
                    {ref2Country && <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{ref2Country}</div>}
                  </div>
                )}
                {(scorerLast || scorerFirst) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Scorer</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{formatOfficial(scorerLast, scorerFirst)}</div>
                    {scorerCountry && <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{scorerCountry}</div>}
                  </div>
                )}
                {(asstLast || asstFirst) && (
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Ass. Scorer</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{formatOfficial(asstLast, asstFirst)}</div>
                    {asstCountry && <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{asstCountry}</div>}
                  </div>
                )}
                {lineJudges.filter(j => j.firstName || j.lastName).map((judge, index) => (
                  <div key={`lj-${index}`} style={{ 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>Line Judge {index + 1}</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{formatOfficial(judge.lastName, judge.firstName)}</div>
                    {judge.country && <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{judge.country}</div>}
                  </div>
                ))}
              </div>
            </div>
            <ConnectionBanner
              team="referee"
              enabled={refereeConnectionEnabled}
              onToggle={handleRefereeConnectionToggle}
              pin={match?.refereePin}
              onEditPin={() => handleEditPin('referee')}
            />
          </div>
          <div className="actions"><button className="secondary" onClick={()=>setCurrentView('officials')}>Edit</button></div>
        </div>
        <div className="card" style={{ order: 3 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={team_1Configured} />
                <h3 style={{ margin: 0 }}>Team 1</h3>
                {team_1 && (
                  <span style={{ fontSize: '20px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginLeft: 15 }}>
                    {team_1}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div 
                  className="shirt" 
                  style={{ background: team_1Color, cursor: 'pointer', marginRight: '16px' }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const centerX = rect.left + rect.width / 2
                    setColorPickerModal({ 
                      team: 'team_1', 
                      position: { x: centerX, y: rect.bottom + 8 } 
                    })
                  }}
                >
                  <div className="collar" style={{ background: team_1Color }} />
                  <div className="number" style={{ color: getContrastColor(team_1Color) }}>1</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Team Country:</span>
                <input
                  type="text"
                  value={team_1Country}
                  onChange={e => setTeam_1Country(e.target.value.toUpperCase())}
                  placeholder="SUI"
                  maxLength={3}
                  style={{
                    width: '20px',
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'rgba(15, 23, 42, 0.35)',
                    color: 'var(--text)',
                    fontSize: '12px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Player 1</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_1Player1.firstName}
                      onChange={e => setTeam_1Player1({ ...team_1Player1, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_1Player1.lastName}
                      onChange={e => setTeam_1Player1({ ...team_1Player1, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Player 2</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_1Player2.firstName}
                      onChange={e => setTeam_1Player2({ ...team_1Player2, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_1Player2.lastName}
                      onChange={e => setTeam_1Player2({ ...team_1Player2, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                </div>
              </div>
              {matchWithCoaches && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Coach</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_1CoachName.firstName}
                      onChange={e => setTeam_1CoachName({ ...team_1CoachName, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_1CoachName.lastName}
                      onChange={e => setTeam_1CoachName({ ...team_1CoachName, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                  {homeCoachSignature && (team_1CoachName.firstName || team_1CoachName.lastName) && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Coach Signature</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <img src={homeCoachSignature} alt="Coach signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                        <button onClick={() => setTeam_1CoachSignature(null)} style={{ padding: '6px 12px', fontSize: '12px' }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="card" style={{ order: 4 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusBadge ready={team_2Configured} />
                <h3 style={{ margin: 0 }}>Team 2</h3>
                {team_2 && (
                  <span style={{ fontSize: '20px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginLeft: 15 }}>
                    {team_2}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div 
                  className="shirt" 
                  style={{ background: team_2Color, cursor: 'pointer', marginRight: '16px' }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const centerX = rect.left + rect.width / 2
                    setColorPickerModal({ 
                      team: 'team_2', 
                      position: { x: centerX, y: rect.bottom + 8 } 
                    })
                  }}
                >
                  <div className="collar" style={{ background: team_2Color }} />
                  <div className="number" style={{ color: getContrastColor(team_2Color) }}>2</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Team Country:</span>
                <input
                  type="text"
                  value={team_2Country}
                  onChange={e => setTeam_2Country(e.target.value.toUpperCase())}
                  placeholder="SUI"
                  maxLength={3}
                    style={{
                      width: '20px',
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'rgba(15, 23, 42, 0.35)',
                    color: 'var(--text)',
                    fontSize: '12px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Player 1</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_2Player1.firstName}
                      onChange={e => setTeam_2Player1({ ...team_2Player1, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_2Player1.lastName}
                      onChange={e => setTeam_2Player1({ ...team_2Player1, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Player 2</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_2Player2.firstName}
                      onChange={e => setTeam_2Player2({ ...team_2Player2, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_2Player2.lastName}
                      onChange={e => setTeam_2Player2({ ...team_2Player2, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                </div>
              </div>
              {matchWithCoaches && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Coach</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>First name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="First Name"
                      value={team_2CoachName.firstName}
                      onChange={e => setTeam_2CoachName({ ...team_2CoachName, firstName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                    <label style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>Last name:</label>
                    <input
                      className="w-name capitalize"
                      placeholder="Last Name"
                      value={team_2CoachName.lastName}
                      onChange={e => setTeam_2CoachName({ ...team_2CoachName, lastName: e.target.value })}
                      style={{ width: '150px' }}
                    />
                  </div>
                  {awayCoachSignature && (team_2CoachName.firstName || team_2CoachName.lastName) && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: 6 }}>Coach Signature</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <img src={awayCoachSignature} alt="Coach signature" style={{ maxWidth: 200, maxHeight: 60, border: '1px solid rgba(255,255,255,.2)', borderRadius: 4, flexShrink: 0 }} />
                        <button onClick={() => setTeam_2CoachSignature(null)} style={{ padding: '6px 12px', fontSize: '12px' }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, alignItems:'center' }}>
        {isMatchOngoing && onReturn ? (
          <button onClick={onReturn}>Return to match</button>
        ) : (
          <button onClick={async () => {
            // Check if match has no data (no sets, no signatures)
            if (matchId && match) {
              const sets = await db.sets.where('matchId').equals(matchId).toArray()
              const hasNoData = sets.length === 0 && !match.homeCoachSignature && !match.team_1CaptainSignature && !match.awayCoachSignature && !match.team_2CaptainSignature
              
              if (hasNoData) {
                // Update match with current data before going to coin toss
                const scheduledAt = (() => {
                  if (!date && !time) return new Date().toISOString()
                  const iso = new Date(`${date}T${time || '00:00'}:00`).toISOString()
                  return iso
                })()
                
                await db.matches.update(matchId, {
      eventName: eventName || null,
      site: site || null,
      beach: beach || null,
      court: court || null,
      matchPhase: matchPhase || 'main_draw',
      matchRound: matchRound || 'pool_play',
      matchNumber: matchNumber ? Number(matchNumber) : null,
      matchGender: matchGender || 'men',
      team_1Country: team_1Country || 'SUI',
      team_2Country: team_2Country || 'SUI',
                  scheduledAt,
                  officials: [
                    { role: '1st referee', firstName: ref1First, lastName: ref1Last, country: ref1Country},
                    { role: '2nd referee', firstName: ref2First, lastName: ref2Last, country: ref2Country },
                    { role: 'scorer', firstName: scorerFirst, lastName: scorerLast, country: scorerCountry },
                    { role: 'assistant scorer', firstName: asstFirst, lastName: asstLast, country: asstCountry }
                  ]
                })
                
                // Update teams if needed
                if (match.homeTeamId) {
                  await db.teams.update(match.homeTeamId, { name: team_1, color: team_1Color })
                }
                if (match.awayTeamId) {
                  await db.teams.update(match.awayTeamId, { name: team_2, color: team_2Color })
                }
                
                // Update players
                if (match.homeTeamId && team_1Roster.length) {
                  // Delete existing players and add new ones
                  await db.players.where('teamId').equals(match.homeTeamId).delete()
                  await db.players.bulkAdd(
                    team_1Roster.map(p => ({
                      teamId: match.homeTeamId,
                      number: p.number,
                      name: `${p.lastName} ${p.firstName}`,
                      lastName: p.lastName,
                      firstName: p.firstName,
                      // Beach volleyball: No liberos
                      isCaptain: !!p.isCaptain,
                      role: null,
                      createdAt: new Date().toISOString()
                    }))
                  )
                }
                if (match.awayTeamId && team_2Roster.length) {
                  // Delete existing players and add new ones
                  await db.players.where('teamId').equals(match.awayTeamId).delete()
                  await db.players.bulkAdd(
                    team_2Roster.map(p => ({
                      teamId: match.awayTeamId,
                      number: p.number,
                      name: `${p.lastName} ${p.firstName}`,
                      lastName: p.lastName,
                      firstName: p.firstName,
                      // Beach volleyball: No liberos
                      isCaptain: !!p.isCaptain,
                      role: null,
                      createdAt: new Date().toISOString()
                    }))
                  )
                }
                
                // Check if team names are set before going to coin toss
                if (!team_1 || team_1.trim() === '' || team_1 === 'Team 1' || !team_2 || team_2.trim() === '' || team_2 === 'Team 2') {
                  setNoticeModal({ message: 'Please set both team names before proceeding to coin toss.' })
                  return
                }
                
                // Go to coin toss
                setPendingMatchId(matchId)
                setCurrentView('coin-toss')
              } else {
                // Create new match or update existing
                await createMatch()
              }
            } else {
              // Create new match
              await createMatch()
            }
          }}>Coin toss</button>
        )}
      </div>


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
              Choose {colorPickerModal.team === 'team_1' ? 'Home' : 'Away'} Team Color
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px'
              }}
            >
              {teamColors.map((color) => {
                const isSelected = (colorPickerModal.team === 'team_1' ? team_1Color : team_2Color) === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      if (colorPickerModal.team === 'team_1') {
                        setTeam_1Color(color)
                      } else {
                        setTeam_2Color(color)
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
                    <div className="shirt" style={{ background: color, transform: 'scale(1.2)', marginTop: '20px' }}>
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
          title="Notice"
          open={true}
          onClose={() => setNoticeModal(null)}
          width={400}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--text)' }}>
              {noticeModal.message}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setNoticeModal(null)}
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

      {/* Edit PIN Modal */}
      {editPinModal && (
        <Modal
          title={editPinType === 'referee' ? 'Edit Referee PIN' : 'Edit PIN'}
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

      <SignaturePad 
        open={openSignature !== null} 
        onClose={() => setOpenSignature(null)} 
        onSave={handleSignatureSave}
        title={openSignature === 'team_1-coach' ? 'Team 1 Coach Signature' : 
               openSignature === 'team_1-captain' ? 'Team 1 Captain Signature' :
               openSignature === 'team_2-coach' ? 'Team 2 Coach Signature' :
               openSignature === 'team_2-captain' ? 'Team 2 Captain Signature' : 'Sign'}
      />

    </div>
  )
}
  