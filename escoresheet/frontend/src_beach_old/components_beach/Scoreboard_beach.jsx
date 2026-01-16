import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import Modal from './Modal_beach'
import SignaturePad from './SignaturePad_beach'
import mikasaVolleyball from '../mikasa_BV550C_beach.png'
import challengeIcon from '../challenge.png'

export default function Scoreboard({ matchId, onFinishSet, onOpenSetup, onOpenMatchSetup, onOpenCoinToss }) {
  const [now, setNow] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [showLogs, setShowLogs] = useState(false)
  const [logSearchQuery, setLogSearchQuery] = useState('')
  const [showManualPanel, setShowManualPanel] = useState(false)
  const [showRemarks, setShowRemarks] = useState(false)
  const [showSanctions, setShowSanctions] = useState(false)
  const [optionsModal, setOptionsModal] = useState(false)
  const [editPinModal, setEditPinModal] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [editPinType, setEditPinType] = useState(null) // 'referee' | 'teamA' | 'teamB'
  const [connectionModal, setConnectionModal] = useState(null) // 'referee' | 'teamA' | 'teamB' | null
  const [connectionModalPosition, setConnectionModalPosition] = useState({ x: 0, y: 0 })
  const [toSubModal, setToSubModal] = useState(null) // { type: 'to', side: 'left' | 'right' } | null - Beach volleyball: only timeouts
  const [toSubModalPosition, setToSubModalPosition] = useState({ x: 0, y: 0 })
  const [courtSwitchModal, setCourtSwitchModal] = useState(null) // { set, team_1Points, team_2Points, teamThatScored } | null
  const [courtSwitchAlert, setCourtSwitchAlert] = useState(null) // { message: string } | null
  const [manualCourtSwitchConfirm, setManualCourtSwitchConfirm] = useState(false) // boolean - for manual court switch confirmation
  const [technicalTOModal, setTechnicalTOModal] = useState(null) // { set, team_1Points, team_2Points, teamThatScored: 'team_1'|'team_2'|null, countdown: number, started: boolean } | null
  const [timeoutModal, setTimeoutModal] = useState(null) // { team: 'team_1'|'team_2', countdown: number, started: boolean }
  const [setEndModal, setSetEndModal] = useState(null) // { set, team_1Points, team_2Points } | null
  const [scoresheetErrorModal, setScoresheetErrorModal] = useState(null) // { error: string, details?: string } | null
  const [undoConfirm, setUndoConfirm] = useState(null) // { event: Event, description: string } | null
  const [reopenSetConfirm, setReopenSetConfirm] = useState(null) // { setId: number, setIndex: number } | null
  const [setStartTimeModal, setSetStartTimeModal] = useState(null) // { setIndex: number, defaultTime: string } | null
  const [setEndTimeModal, setSetEndTimeModal] = useState(null) // { setIndex: number, winner: string, team_1Points: number, team_2Points: number, defaultTime: string, isMatchEnd: boolean } | null
  const [setTransitionModal, setSetTransitionModal] = useState(null) // { setIndex: number, isSet3: boolean } | null - for after set 1 and before set 3
  const [setTransitionCountdown, setSetTransitionCountdown] = useState(60) // 60 second countdown between sets
  const [setTransitionSelectedLeftTeam, setSetTransitionSelectedLeftTeam] = useState('A')
  const [setTransitionSelectedFirstServe, setSetTransitionSelectedFirstServe] = useState('A')
  const [setTransitionServiceOrder, setSetTransitionServiceOrder] = useState({ teamA: '1_2', teamB: '2_1' }) // '1_2' | '2_1' for each team
  const [set3CoinTossWinner, setSet3CoinTossWinner] = useState(null) // 'teamA' | 'teamB' | null - only for set 3
  const [postMatchSignature, setPostMatchSignature] = useState(null) // 'team_1-captain' | 'team_2-captain' | null
  const [matchEndModal, setMatchEndModal] = useState(false) // boolean - show match end modal with signatures and download
  const [openSignature, setOpenSignature] = useState(null) // 'team_1-captain' | 'team_2-captain' | 'ref1' | 'ref2' | 'scorer' | 'asst-scorer' | null
  const [sanctionConfirm, setSanctionConfirm] = useState(null) // { side: 'left'|'right', type: 'improper_request'|'delay_warning'|'delay_penalty' } | null
  const [sanctionDropdown, setSanctionDropdown] = useState(null) // { team: 'team_1'|'team_2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, element: HTMLElement, x?: number, y?: number } | null
  const [sanctionConfirmModal, setSanctionConfirmModal] = useState(null) // { team: 'team_1'|'team_2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, sanctionType: 'warning'|'penalty'|'expulsion'|'disqualification' } | null
  const [injuryDropdown, setInjuryDropdown] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null
  const [mtoRitConfirmModal, setMtoRitConfirmModal] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, type: 'mto_blood'|'rit_no_blood'|'rit_weather'|'rit_toilet' } | null
  const [mtoRitCountdownModal, setMtoRitCountdownModal] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, type: 'mto_blood'|'rit_no_blood'|'rit_weather'|'rit_toilet', countdown: number, started: boolean, startTime: string, setIndex: number, team_1Points: number, team_2Points: number } | null
  const [specialCasesModal, setSpecialCasesModal] = useState(false) // boolean - opens special cases submenu
  const [forfaitModal, setForfaitModal] = useState(null) // { type: 'injury_before'|'injury_during'|'no_show', team?: string, playerNumber?: string, setIndex?: number, time?: string, score?: string, mtoRitDuration?: string, remarks?: string } | null
  const [protestModal, setProtestModal] = useState(null) // { status?: string, remarks?: string } | null
  const [editRosterModal, setEditRosterModal] = useState(null) // 'team_1' | 'team_2' | null
  const [editScoreModal, setEditScoreModal] = useState(null) // { setIndex: number, setId: number } | null
  const [editScoreTeam_1Points, setEditScoreTeam_1Points] = useState(0)
  const [editScoreTeam_2Points, setEditScoreTeam_2Points] = useState(0)
  const [editSanctionsModal, setEditSanctionsModal] = useState(false)
  const [editMatchInfoModal, setEditMatchInfoModal] = useState(false)
  const [editMatchHall, setEditMatchHall] = useState('')
  const [editMatchCity, setEditMatchCity] = useState('')
  const [editMatchScheduledAt, setEditMatchScheduledAt] = useState('')
  const [editOfficialsModal, setEditOfficialsModal] = useState(false)
  // Manual Changes modals
  const [manualChangesMenuModal, setManualChangesMenuModal] = useState(false)
  const [manualChangeSetCountModal, setManualChangeSetCountModal] = useState(false)
  const [manualChangeCurrentScoreModal, setManualChangeCurrentScoreModal] = useState(false)
  const [manualChangeLastSetPointsModal, setManualChangeLastSetPointsModal] = useState(null) // { setIndex: number, setId: number } | null
  const [manualInterruptMatchModal, setManualInterruptMatchModal] = useState(false)
  const [manualModifyLineupsModal, setManualModifyLineupsModal] = useState(false)
  const [manualModifyTimeoutsModal, setManualModifyTimeoutsModal] = useState(false)
  const [editOfficialsState, setEditOfficialsState] = useState([])
  const [playerActionMenu, setPlayerActionMenu] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null
  const [challengeModal, setChallengeModal] = useState(null) // null | 'request' | 'in_progress' | 'referee_request' - when 'request', contains { team: 'team_1'|'team_2', reason: string } | when 'in_progress', contains { team: 'team_1'|'team_2', reason: string, score: { team_1: number, team_2: number }, set: number, servingTeam: 'team_1'|'team_2', time: string, isRefereeInitiated?: boolean } | when 'referee_request', contains { reason: string }
  const [challengeReason, setChallengeReason] = useState('IN / OUT')
  const [coinTossError, setCoinTossError] = useState(null) // { message: string } | null
  const playerNameDebugLogged = useRef(false)
  const scoresheetWindowRef = useRef(null) // Reference to the scoresheet window

  const data = useLiveQuery(async () => {
    const match = await db.matches.get(matchId)
    if (!match) return null

    const [team_1Team, team_2Team] = await Promise.all([
      match?.team_1Id ? db.teams.get(match.team_1Id) : null,
      match?.team_2Id ? db.teams.get(match.team_2Id) : null
    ])

    const sets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    const currentSet =
      sets.find(s => !s.finished) ??
      null

    const [team_1Players, team_2Players] = await Promise.all([
      match?.team_1Id
        ? db.players.where('teamId').equals(match.team_1Id).toArray()
        : [],
      match?.team_2Id
        ? db.players.where('teamId').equals(match.team_2Id).toArray()
        : []
    ])
    
    // Sort players: those with numbers first (by number), then those without (by insertion order)
    // This maintains Player 1 and Player 2 order when numbers are null
    team_1Players?.sort((a, b) => {
      if (a.number != null && b.number != null) return a.number - b.number
      if (a.number != null) return -1
      if (b.number != null) return 1
      // Both null - maintain insertion order (by id)
      return (a.id || 0) - (b.id || 0)
    })
    team_2Players?.sort((a, b) => {
      if (a.number != null && b.number != null) return a.number - b.number
      if (a.number != null) return -1
      if (b.number != null) return 1
      // Both null - maintain insertion order (by id)
      return (a.id || 0) - (b.id || 0)
    })

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

    const result = {
      set: currentSet,
      match,
      team_1Team,
      team_2Team,
      team_1Players,
      team_2Players,
      events,
      sets
    }
    
    
    return result
  }, [matchId])

  const ensuringSetRef = useRef(false)

  // Helper function to calculate service order for a set
  const calculateServiceOrder = useCallback((match, firstServeTeam) => {
    const coinTossData = match?.coinTossData?.players
    if (!coinTossData) {
      throw new Error('Coin toss data is missing. Please complete the coin toss before starting the match.')
    }
    
    // Determine which team is A and which is B based on coin toss
    const teamAKey = match?.coinTossTeamA || 'team_1'
    const teamBKey = match?.coinTossTeamB || 'team_2'
    
    // Determine which team data to use based on coin toss assignment
    const servingTeamIsA = firstServeTeam === teamAKey
    const servingTeamData = servingTeamIsA ? coinTossData.teamA : coinTossData.teamB
    const receivingTeamData = servingTeamIsA ? coinTossData.teamB : coinTossData.teamA
    const receivingTeamKey = servingTeamIsA ? teamBKey : teamAKey
    
    const serviceOrder = {}
    
    // Serving team: first serve player = 1, other player = 3
    if (servingTeamData?.player1?.firstServe) {
      serviceOrder[`${firstServeTeam}_player1`] = 1
      serviceOrder[`${firstServeTeam}_player2`] = 3
    } else if (servingTeamData?.player2?.firstServe) {
      serviceOrder[`${firstServeTeam}_player1`] = 3
      serviceOrder[`${firstServeTeam}_player2`] = 1
    }
    
    // Receiving team: first serve player = 2, other player = 4
    if (receivingTeamData?.player1?.firstServe) {
      serviceOrder[`${receivingTeamKey}_player1`] = 2
      serviceOrder[`${receivingTeamKey}_player2`] = 4
    } else if (receivingTeamData?.player2?.firstServe) {
      serviceOrder[`${receivingTeamKey}_player1`] = 4
      serviceOrder[`${receivingTeamKey}_player2`] = 2
    }
    
    return serviceOrder
  }, [])

  const ensureActiveSet = useCallback(async () => {
    if (!matchId) return
    const existing = await db.sets
      .where('matchId')
      .equals(matchId)
      .and(s => !s.finished)
      .first()

    if (existing) return

    const allSets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    const nextIndex =
      allSets.length > 0
        ? Math.max(...allSets.map(s => s.index || 0)) + 1
        : 1

    // Get match to calculate service order
    const match = await db.matches.get(matchId)
    const firstServeTeam = match?.firstServe || 'team_1'
    const serviceOrder = calculateServiceOrder(match, firstServeTeam)
    
    // For set 1, Team A (coin toss winner) is on the left
    // Save this to the database
    const teamAKey = match?.coinTossTeamA || 'team_1'
    if (nextIndex === 1) {
      await db.matches.update(matchId, {
        [`set${nextIndex}_leftTeam`]: teamAKey
      })
    }

    const setId = await db.sets.add({
      matchId,
      index: nextIndex,
      team_1Points: 0,
      team_2Points: 0,
      finished: false,
      serviceOrder: serviceOrder
    })
  }, [matchId])

  useEffect(() => {
    if (!matchId || !data || data.set || ensuringSetRef.current) return
    ensuringSetRef.current = true
    ensureActiveSet()
      .catch(err => {
        // Silently handle error
      })
      .finally(() => {
        ensuringSetRef.current = false
      })
  }, [data, ensureActiveSet, matchId])

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Determine which team is A and which is B based on coin toss
  const teamAKey = useMemo(() => {
    if (!data?.match) return 'team_1'
    return data.match.coinTossTeamA || 'team_1'
  }, [data?.match])
  
  const teamBKey = useMemo(() => {
    if (!data?.match) return 'team_2'
    if (data.match.coinTossTeamB) {
      return data.match.coinTossTeamB
    }
    // If coinTossTeamB is not set, make it the opposite of teamAKey
    const teamA = data.match.coinTossTeamA || 'team_1'
    return teamA === 'team_1' ? 'team_2' : 'team_1'
  }, [data?.match])

  const leftIsTeam_1 = useMemo(() => {
    if (!data?.set) return true
    
    // Check if left team is explicitly stored in database (from set transition modal)
    const setLeftTeamKey = `set${data.set.index}_leftTeam`
    const storedLeftTeam = data.match?.[setLeftTeamKey]
    
    if (storedLeftTeam) {
      // Use the stored left team from the database
      return storedLeftTeam === 'team_1'
    }
    
    // Fallback to default logic if not stored:
    // Set 1 starts with Team A on left
    // Sets 2, 3 start with teams switched (Team A on right)
    const baseIsTeam_1 = data.set.index === 1 
      ? (teamAKey === 'team_1')
      : (teamAKey !== 'team_1')
    
    // Get the stored switch count - this is ONLY updated when user confirms the switch
    // We NEVER calculate from points - we only use the stored count that was set after confirmation
    const switchCountKey = `set${data.set.index}_switchCount`
    const storedSwitchCount = data.match?.[switchCountKey] || 0
    
    // Each switch flips the teams
    // If odd number of switches, teams are flipped from base position
    let isTeam_1 = baseIsTeam_1
    if (storedSwitchCount % 2 === 1) {
      isTeam_1 = !isTeam_1
    }
    
    return isTeam_1
  }, [data?.set, data?.match, teamAKey])

  // Calculate set score (number of sets won by each team)
  const setScore = useMemo(() => {
    if (!data) return { team_1: 0, team_2: 0, left: 0, right: 0 }
    
    const allSets = data.sets || []
    const finishedSets = allSets.filter(s => s.finished)
    
    const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
    const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
    
    const leftSetsWon = leftIsTeam_1 ? team_1SetsWon : team_2SetsWon
    const rightSetsWon = leftIsTeam_1 ? team_2SetsWon : team_1SetsWon
    
    return { team_1: team_1SetsWon, team_2: team_2SetsWon, left: leftSetsWon, right: rightSetsWon }
  }, [data, leftIsTeam_1])

  const mapSideToTeamKey = useCallback(
    side => {
      if (!data?.set) return 'team_1'
      if (side === 'left') {
        return leftIsTeam_1 ? 'team_1' : 'team_2'
      }
      return leftIsTeam_1 ? 'team_2' : 'team_1'
    },
    [data?.set, leftIsTeam_1]
  )

  const mapTeamKeyToSide = useCallback(
    teamKey => {
      if (!data?.set) return 'left'
      if (teamKey === 'team_1') {
        return leftIsTeam_1 ? 'left' : 'right'
      }
      return leftIsTeam_1 ? 'right' : 'left'
    },
    [data?.set, leftIsTeam_1]
  )

  const pointsBySide = useMemo(() => {
    if (!data?.set) return { left: 0, right: 0 }
    return leftIsTeam_1
      ? { left: data.set.team_1Points, right: data.set.team_2Points }
      : { left: data.set.team_2Points, right: data.set.team_1Points }
  }, [data?.set, leftIsTeam_1])

  const timeoutsUsed = useMemo(() => {
    if (!data?.events || !data?.set) return { team_1: 0, team_2: 0 }
    // Only count timeouts for the current set
    return data.events
      .filter(event => event.type === 'timeout' && event.setIndex === data.set.index)
      .reduce(
        (acc, event) => {
          const team = event.payload?.team
          if (team === 'team_1' || team === 'team_2') {
            acc[team] = (acc[team] || 0) + 1
          }
          return acc
        },
        { team_1: 0, team_2: 0 }
      )
  }, [data?.events, data?.set])

  

  // Helper function to calculate score at time of event
  const getScoreAtEvent = useCallback((event, allEvents) => {
    const setIdx = event.setIndex || 1
    const setEvents = allEvents?.filter(e => (e.setIndex || 1) === setIdx) || []
    const eventIndex = setEvents.findIndex(e => e.id === event.id)
    
    let team_1Score = 0
    let team_2Score = 0
    for (let i = 0; i <= eventIndex; i++) {
      const e = setEvents[i]
      if (e.type === 'point') {
        if (e.payload?.team === 'team_1') {
          team_1Score++
        } else if (e.payload?.team === 'team_2') {
          team_2Score++
        }
      }
    }
    return { team_1Score, team_2Score }
  }, [])

  // Get timeout events with scores for a team
  const getTimeoutEvents = useCallback((side) => {
    if (!data?.events || !data?.set) return []
    const teamKey = mapSideToTeamKey(side)
    const timeoutEvents = data.events
      .filter(event => 
        event.type === 'timeout' && 
        event.setIndex === data.set.index &&
        event.payload?.team === teamKey
      )
      .map(event => {
        const { team_1Score, team_2Score } = getScoreAtEvent(event, data.events)
        return {
          ...event,
          team_1Score,
          team_2Score
        }
      })
    return timeoutEvents
  }, [data?.events, data?.set, mapSideToTeamKey, getScoreAtEvent])

  

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
    
    // Beach volleyball: No lineup events after points (only initial lineups exist)
    return 'idle'
  }, [data?.events, data?.set])

  const isFirstRally = useMemo(() => {
    if (!data?.events || !data?.set) return true
    // Check if there are any points in the current set
    // This determines if we show "Start set" vs "Start rally"
    const hasPoints = data.events.some(e => e.type === 'point' && e.setIndex === data.set.index)
    return !hasPoints
  }, [data?.events, data?.set])

  const getTeamLineupState = useCallback((teamKey) => {
    // Beach volleyball: Always just the first 2 players from roster
    const teamPlayers = teamKey === 'team_1' ? data?.team_1Players || [] : data?.team_2Players || []
    const playersOnCourt = teamPlayers.slice(0, 2).map(p => Number(p.number)).filter(num => !Number.isNaN(num))
    
      return {
      lineupEvents: [],
        currentLineup: null,
      playersOnCourt
    }
  }, [data?.team_1Players, data?.team_2Players])

  const buildOnCourt = useCallback((players, isLeft, teamKey, coinTossData, isTeamA) => {
    // Beach volleyball: Always show players 1 and 2
    // Coin toss data is required - no fallbacks
    const beachPositions = ['1', '2']
    
    if (!coinTossData) {
      // Return empty players array instead of throwing - let error UI handle it
      return []
    }
    
    const teamData = isTeamA ? coinTossData.teamA : coinTossData.teamB
    if (!teamData) {
      // Return empty players array instead of throwing
      return []
    }
    
    if (!teamData.player1 || !teamData.player2) {
      // Return empty players array instead of throwing
      return []
    }
    
    const coinTossPlayers = [
      {
        id: `coin-toss-${teamKey}-1`,
        number: teamData.player1.number !== undefined && teamData.player1.number !== null ? String(teamData.player1.number) : '',
        firstName: teamData.player1.firstName || '',
        lastName: teamData.player1.lastName || '',
        isCaptain: teamData.player1.isCaptain || false,
        isPlaceholder: false
      },
      {
        id: `coin-toss-${teamKey}-2`,
        number: teamData.player2.number !== undefined && teamData.player2.number !== null ? String(teamData.player2.number) : '',
        firstName: teamData.player2.firstName || '',
        lastName: teamData.player2.lastName || '',
        isCaptain: teamData.player2.isCaptain || false,
        isPlaceholder: false
      }
    ]
    
    return coinTossPlayers.map((player, idx) => ({
      ...player,
      position: beachPositions[idx]
    }))
  }, [])

  const leftTeam = useMemo(() => {
    try {
      if (!data) return { name: 'Team A', color: '#ef4444', playersOnCourt: [] }
      const players = leftIsTeam_1 ? data.team_1Players : data.team_2Players
      const team = leftIsTeam_1 ? data.team_1Team : data.team_2Team
      const teamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
      const isTeamA = teamKey === teamAKey
      const coinTossData = data?.match?.coinTossData?.players
      if (!coinTossData) {
        // Return a safe default - don't set error state here (causes infinite loop)
        return { name: team?.name || (leftIsTeam_1 ? 'Team 1' : 'Team 2'), color: team?.color || (leftIsTeam_1 ? '#ef4444' : '#3b82f6'), playersOnCourt: [], isTeamA }
      }
      const result = {
        name: team?.name || (leftIsTeam_1 ? 'Team 1' : 'Team 2'),
        color: team?.color || (leftIsTeam_1 ? '#ef4444' : '#3b82f6'),
        playersOnCourt: buildOnCourt(players, true, teamKey, coinTossData, isTeamA),
        isTeamA
      }
      return result
    } catch (error) {
      return { name: 'Error', color: '#ef4444', playersOnCourt: [], error: error.message }
    }
  }, [buildOnCourt, data, leftIsTeam_1, teamAKey])

  const rightTeam = useMemo(() => {
    try {
      if (!data) return { name: 'Team B', color: '#3b82f6', playersOnCourt: [] }
      const players = leftIsTeam_1 ? data.team_2Players : data.team_1Players
      const team = leftIsTeam_1 ? data.team_2Team : data.team_1Team
      const teamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
      const isTeamA = teamKey === teamAKey
      const coinTossData = data?.match?.coinTossData?.players
      if (!coinTossData) {
        // Return a safe default - don't set error state here (causes infinite loop)
        return { name: team?.name || (leftIsTeam_1 ? 'Team 2' : 'Team 1'), color: team?.color || (leftIsTeam_1 ? '#3b82f6' : '#ef4444'), playersOnCourt: [], isTeamA }
      }
      const result = {
        name: team?.name || (leftIsTeam_1 ? 'Team 2' : 'Team 1'),
        color: team?.color || (leftIsTeam_1 ? '#3b82f6' : '#ef4444'),
        playersOnCourt: buildOnCourt(players, false, teamKey, coinTossData, isTeamA),
        isTeamA
      }
      return result
    } catch (error) {
      return { name: 'Error', color: '#3b82f6', playersOnCourt: [], error: error.message }
    }
  }, [buildOnCourt, data, leftIsTeam_1, teamAKey])



  const formatTimestamp = useCallback(date => {
    // Format date as dd.mm.yyyy HH:mm:ss
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`
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

  // Helper function to get next sequence number for events
  const getNextSeq = useCallback(async () => {
    const allEvents = await db.events.where('matchId').equals(matchId).toArray()
    const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)
    return maxSeq + 1
  }, [matchId])

  // Debug function for PDF generation (available in console)
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
            team_1Team: data?.team_1Team,
            team_2Team: data?.team_2Team,
            team_1Players: data?.team_1Players || [],
            team_2Players: data?.team_2Players || [],
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
        }
      }

    }
    return () => {
      if (typeof window !== 'undefined') {
        if (window.debugExportMatchData) delete window.debugExportMatchData
      }
    }
  }, [matchId, data?.match, data?.team_1Team, data?.team_2Team, data?.team_1Players, data?.team_2Players])

  const logEvent = useCallback(
    async (type, payload = {}, options = {}) => {
      if (!data?.set) return
      
      // Get next sequence number
      const nextSeq = await getNextSeq()
      
      // Simple timestamp for reference (not used for ordering)
      const timestamp = options.timestamp ? new Date(options.timestamp) : new Date()
      
      await db.events.add({
        matchId,
        setIndex: data.set.index,
        type,
        payload,
        ts: timestamp.toISOString(), // Store as ISO string for reference
        seq: nextSeq // Use sequence for ordering
      })
      
    },
    [data?.set, matchId, getNextSeq]
  )

  const checkSetEnd = useCallback(async (set, team_1Points, team_2Points) => {
    // Beach volleyball: Best of 3 sets, deciding set (3rd) is 15 points
    const isDecidingSet = set.index === 3
    const pointsToWin = isDecidingSet ? 15 : 21
    
    // For set 3: if score reaches 14-14, continue until a team leads by 2 points (no cap at 15)
    // For sets 1-2: standard 21 points with 2-point lead
    let setEnded = false
    
    if (isDecidingSet) {
      // Set 3: Check if either team has reached 15 AND leads by 2, OR if score is 14-14 or higher, continue until 2-point lead
      // First check: if a team reaches 15 and leads by 2, set ends
      if (team_1Points >= 15 && team_1Points - team_2Points >= 2) {
        setEnded = true
      } else if (team_2Points >= 15 && team_2Points - team_1Points >= 2) {
        setEnded = true
      } 
      // Second check: if both teams are at 14 or higher, continue until 2-point lead (no cap at 15)
      else if (team_1Points >= 14 && team_2Points >= 14) {
        // Score is 14-14 or higher, check for 2-point lead
        if (team_1Points - team_2Points >= 2) {
          setEnded = true
        } else if (team_2Points - team_1Points >= 2) {
          setEnded = true
        }
      }
    } else {
      // Sets 1-2: Standard 21 points with 2-point lead
    if (team_1Points >= pointsToWin && team_1Points - team_2Points >= 2) {
        setEnded = true
      } else if (team_2Points >= pointsToWin && team_2Points - team_1Points >= 2) {
        setEnded = true
      }
    }
    
    if (setEnded) {
      // Determine which team won
      const team_1Won = team_1Points > team_2Points
      
      // Calculate current set scores to determine if this is match-ending
      const allSets = await db.sets.where({ matchId }).toArray()
      const finishedSets = allSets.filter(s => s.finished)
      const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
      const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
      
      // Beach volleyball: Best of 3 sets (first to 2 sets wins)
      const isMatchEnd = (team_1Won ? team_1SetsWon + 1 : team_2SetsWon + 1) >= 2
      
      // Show set end time confirmation modal
      const defaultTime = new Date().toISOString()
      setSetEndTimeModal({ 
        setIndex: set.index, 
        winner: team_1Won ? 'team_1' : 'team_2', 
        team_1Points, 
        team_2Points, 
        defaultTime, 
        isMatchEnd 
      })
      return true
    }
    return false
  }, [matchId])

  const confirmSetEnd = useCallback(async () => {
    if (!setEndModal || !data?.match) return
    
    const { set, team_1Points, team_2Points, winner } = setEndModal
    
    // Determine team labels (A or B) based on coin toss
    const teamAKey = data.match.coinTossTeamA || 'team_1'
    const teamBKey = data.match.coinTossTeamB || 'team_2'
    const winnerLabel = winner === 'team_1' 
      ? (teamAKey === 'team_1' ? 'A' : 'B')
      : (teamAKey === 'team_2' ? 'A' : 'B')
    
    // Get current time for end time
    const endTime = new Date().toISOString()
    const startTime = set.startTime
    
    // Log set win with times
    await logEvent('set_end', { 
      team: winner, 
      teamLabel: winnerLabel,
      setIndex: set.index,
      team_1Points,
      team_2Points,
      startTime: startTime,
      endTime: endTime
    })
    
    await db.sets.update(set.id, { finished: true, team_1Points, team_2Points, endTime: endTime })
    const sets = await db.sets.where({ matchId: set.matchId }).toArray()
    const finished = sets.filter(s => s.finished).length
    if (finished >= 5) {
      // IMPORTANT: When match ends, preserve ALL data in database:
      // - All sets remain in db.sets
      // - All events remain in db.events
      // - All players remain in db.players
      // - All teams remain in db.teams
      // - Only update match status to 'final' - DO NOT DELETE ANYTHING
      await db.matches.update(set.matchId, { status: 'final' })
      
      if (onFinishSet) onFinishSet(set)
    } else {
      // Get match to calculate service order for next set
      const matchData = await db.matches.get(set.matchId)
      const firstServeTeam = matchData?.firstServe || 'team_1'
      const serviceOrder = calculateServiceOrder(matchData, firstServeTeam)
      
      const newSetId = await db.sets.add({ 
        matchId: set.matchId, 
        index: set.index + 1, 
        team_1Points: 0, 
        team_2Points: 0, 
        finished: false,
        serviceOrder: serviceOrder
      })
      
      
    }
    
    setSetEndModal(null)
  }, [setEndModal, data?.match, logEvent, onFinishSet])

  const cancelSetEnd = useCallback(async () => {
    if (!setEndModal || !data?.events || data.events.length === 0) {
      setSetEndModal(null)
      return
    }
    
    // Undo the last action (the point that would have ended the set)
    const lastEvent = data.events[data.events.length - 1]
    
    // If it's a point, decrease the score
    if (lastEvent.type === 'point' && lastEvent.payload?.team) {
      const teamKey = lastEvent.payload.team
      const field = teamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
      const currentPoints = data.set[field]
      
      if (currentPoints > 0) {
        await db.sets.update(data.set.id, {
          [field]: currentPoints - 1
        })
      }
    }
    
    // Delete the event
    await db.events.delete(lastEvent.id)
    
    setSetEndModal(null)
  }, [setEndModal, data?.events, data?.set])

  // Determine who has serve based on events
  const getCurrentServe = useCallback(() => {
    if (!data?.set || !data?.match) {
      return data?.match?.firstServe || 'team_1'
    }
    
    if (!data?.events || data.events.length === 0) {
      // First rally: use firstServe from match
      return data.match.firstServe || 'team_1'
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
      // No points yet, use firstServe
      return data.match.firstServe || 'team_1'
    }
    
    // The team that scored the last point now has serve
    const lastPoint = pointEvents[0]
    return lastPoint.payload?.team || data.match.firstServe || 'team_1'
  }, [data?.events, data?.set, data?.match])

  const leftServeTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
  const rightServeTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
  const currentServeTeam = data?.set ? getCurrentServe() : null
  const leftServing = data?.set ? currentServeTeam === leftServeTeamKey : false
  const rightServing = data?.set ? currentServeTeam === rightServeTeamKey : false

  // Calculate which player is currently serving
  // In beach volleyball: serving player only changes when the serving team LOSES a point (serve goes to other team)
  // When a team scores, the SAME player continues serving (no rotation within team)
  const getCurrentServingPlayer = useCallback((teamKey, serviceOrder, events, currentSet, match) => {
    if (!serviceOrder || !teamKey || Object.keys(serviceOrder).length === 0) return null
    if (!events || !currentSet) return null
    
    // Get all point events for the current set, sorted by time (most recent first)
    const pointEvents = events
      .filter(e => e.type === 'point' && e.setIndex === currentSet.index)
      .sort((a, b) => {
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime // Most recent first
      })
    
    if (pointEvents.length === 0) {
      // No points yet - use first serve
      const firstServeTeam = match?.firstServe || 'team_1'
      const isFirstServeTeam = teamKey === firstServeTeam
      const player1Key = `${teamKey}_player1`
      const player2Key = `${teamKey}_player2`
      
      // First serve: order 1 if first serve team, order 2 if receiving team
      const firstOrder = isFirstServeTeam ? 1 : 2
      if (serviceOrder[player1Key] === firstOrder) return 1
      if (serviceOrder[player2Key] === firstOrder) return 2
      return null
    }
    
    // The current serving team is the team that scored the last point
    const currentServingTeam = pointEvents[0].payload?.team || match?.firstServe || 'team_1'
    
    if (currentServingTeam !== teamKey) {
      // This team is not serving
      return null
    }
    
    // Count how many times serve has changed hands (service changes)
    // Service changes when the serving team loses a point
    // We need to iterate from oldest to newest to count correctly
    const pointEventsChronological = [...pointEvents].reverse() // Reverse to get chronological order
    
    let serviceChanges = 0
    let lastServingTeam = match?.firstServe || 'team_1'
    
    for (const event of pointEventsChronological) {
      const scoringTeam = event.payload?.team
      if (scoringTeam !== lastServingTeam) {
        // The serving team lost a point - serve changed hands
        serviceChanges++
        lastServingTeam = scoringTeam
      }
    }
    
    // Service order cycles: 1, 2, 3, 4, 1, 2, 3, 4...
    // Each time serve changes hands, we advance to the next order
    // 0 changes = order 1, 1 change = order 2, 2 changes = order 3, 3 changes = order 4, then cycles
    const servingOrderNumber = (serviceChanges % 4) + 1
    
    const player1Key = `${teamKey}_player1`
    const player2Key = `${teamKey}_player2`
    
    // Find which player (1 or 2) has this service order number for this team
    if (serviceOrder[player1Key] === servingOrderNumber) {
      return 1
    } else if (serviceOrder[player2Key] === servingOrderNumber) {
      return 2
    }
    
    return null
  }, [])

  // Get current serving player numbers
  const totalPoints = data?.set ? (data.set.team_1Points + data.set.team_2Points) : 0
  let serviceOrder = data?.set?.serviceOrder || {}
  
  // Check for missing coin toss data in useEffect to avoid infinite loops
  useEffect(() => {
    if (data?.match) {
      const coinTossData = data.match.coinTossData?.players
      if (!coinTossData) {
        const errorMsg = 'Coin toss data is missing. Please complete the coin toss before starting the match.'
        setCoinTossError({ message: errorMsg })
      } else {
        setCoinTossError(null)
      }
    }
  }, [data?.match])

  // If service order is empty, calculate it from coin toss data and save it to the set
  if (!serviceOrder || Object.keys(serviceOrder).length === 0) {
    const match = data?.match
    // Only calculate service order if we have all required data
    if (match && data?.set && match?.coinTossData?.players) {
      // Use the original firstServe from match, not currentServeTeam (which changes as points are scored)
      const firstServeTeam = match.firstServe || 'team_1'
      serviceOrder = calculateServiceOrder(match, firstServeTeam)
      
      // DEBUG: Log service order calculation
      
      // Save the calculated service order to the set
      if (Object.keys(serviceOrder).length > 0) {
        db.sets.update(data.set.id, { serviceOrder }).catch(() => {})
      }
    }
  }
  
  
  // Try to get serving player from service order
  let leftServingPlayer = leftServing ? getCurrentServingPlayer(leftServeTeamKey, serviceOrder, data?.events || [], data?.set, data?.match) : null
  let rightServingPlayer = rightServing ? getCurrentServingPlayer(rightServeTeamKey, serviceOrder, data?.events || [], data?.set, data?.match) : null
  
  // Store serving player data in set for beach_score.html to read
  useEffect(() => {
    if (data?.set && (leftServingPlayer !== null || rightServingPlayer !== null)) {
      const servingTeam = leftServing ? leftServeTeamKey : (rightServing ? rightServeTeamKey : null)
      const servingPlayer = leftServing ? leftServingPlayer : (rightServing ? rightServingPlayer : null)
      
      // Map to actual player number
      let actualPlayerNumber = servingPlayer
      if (servingPlayer && data?.match?.coinTossData?.players) {
        const coinTossData = data.match.coinTossData.players
        const teamAKey = data.match.coinTossTeamA || 'team_1'
        const isTeamA = servingTeam === teamAKey
        const teamData = isTeamA ? coinTossData.teamA : coinTossData.teamB
        if (teamData) {
          const playerData = servingPlayer === 1 ? teamData.player1 : teamData.player2
          if (playerData && playerData.number !== undefined && playerData.number !== null) {
            actualPlayerNumber = playerData.number
          }
        }
      }
      
      // Update set with serving player info
      const updateData = {
        servingTeam,
        servingPlayer: actualPlayerNumber
      }
      
      // Only update if changed to avoid infinite loops
      if (data.set.servingTeam !== servingTeam || data.set.servingPlayer !== actualPlayerNumber) {
        db.sets.update(data.set.id, updateData).catch(() => {})
      }
    }
  }, [data?.set, leftServing, rightServing, leftServingPlayer, rightServingPlayer, leftServeTeamKey, rightServeTeamKey, data?.match])
  
  
  // If still no player, use coin toss data directly to calculate
  if ((leftServing && !leftServingPlayer) || (rightServing && !rightServingPlayer)) {
    const match = data?.match
    // Only use coin toss data if we have it
    if (match && match?.coinTossData?.players) {
      const coinTossPlayerData = match.coinTossData.players
      const firstServeTeam = match.firstServe || 'team_1' // Original first serve team from coin toss
      const teamAKey = match?.coinTossTeamA || 'team_1'
      
      if (leftServing && !leftServingPlayer) {
        const isTeamA = leftServeTeamKey === teamAKey
        const teamData = isTeamA ? coinTossPlayerData.teamA : coinTossPlayerData.teamB
        if (teamData) {
          // Calculate service changes (serve only changes when serving team loses a point)
          const pointEvents = (data?.events || [])
            .filter(e => e.type === 'point' && e.setIndex === data?.set?.index)
            .sort((a, b) => {
              const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
              const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
              return aTime - bTime // Chronological order (oldest first)
            })
          
          let serviceChanges = 0
          let lastServingTeam = firstServeTeam
          
          for (const event of pointEvents) {
            const scoringTeam = event.payload?.team
            if (scoringTeam !== lastServingTeam) {
              // The serving team lost a point - serve changed hands
              serviceChanges++
              lastServingTeam = scoringTeam
            }
          }
          
          // Service order cycles: 1, 2, 3, 4, 1, 2, 3, 4...
          // 0 changes = order 1, 1 change = order 2, 2 changes = order 3, 3 changes = order 4, then cycles
          const servingOrderNumber = (serviceChanges % 4) + 1
          
          // Determine if this team is the first serve team
          const isFirstServeTeam = leftServeTeamKey === firstServeTeam
          
          
          // Service order mapping:
          // - First serve team: player with firstServe = order 1, other = order 3
          // - Receiving team: player with firstServe = order 2, other = order 4
          if (isFirstServeTeam) {
            // This team is the first serve team
            if (servingOrderNumber === 1) {
              // Order 1 = first serve player of first serve team
              leftServingPlayer = teamData.player1?.firstServe ? 1 : 2
            } else if (servingOrderNumber === 3) {
              // Order 3 = second serve player of first serve team
              leftServingPlayer = teamData.player1?.firstServe ? 2 : 1
            }
          } else {
            // This team is the receiving team
            if (servingOrderNumber === 2) {
              // Order 2 = first serve player of receiving team
              leftServingPlayer = teamData.player1?.firstServe ? 1 : 2
            } else if (servingOrderNumber === 4) {
              // Order 4 = second serve player of receiving team
              leftServingPlayer = teamData.player1?.firstServe ? 2 : 1
            }
          }
          
        }
      }
      
      if (rightServing && !rightServingPlayer) {
        const isTeamA = rightServeTeamKey === teamAKey
        const teamData = isTeamA ? coinTossPlayerData.teamA : coinTossPlayerData.teamB
        if (teamData) {
          // Calculate service changes (serve only changes when serving team loses a point)
          const pointEvents = (data?.events || [])
            .filter(e => e.type === 'point' && e.setIndex === data?.set?.index)
            .sort((a, b) => {
              const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
              const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
              return aTime - bTime // Chronological order (oldest first)
            })
          
          // Count service changes (serve only changes when serving team loses a point)
          let serviceChanges = 0
          let lastServingTeam = firstServeTeam
          
          for (const event of pointEvents) {
            const scoringTeam = event.payload?.team
            if (scoringTeam !== lastServingTeam) {
              // The serving team lost a point - serve changed hands
              serviceChanges++
              lastServingTeam = scoringTeam
            }
          }
          
          // Service order cycles: 1, 2, 3, 4, 1, 2, 3, 4...
          // 0 changes = order 1, 1 change = order 2, 2 changes = order 3, 3 changes = order 4, then cycles
          const servingOrderNumber = (serviceChanges % 4) + 1
          
          // Determine if this team is the first serve team
          const isFirstServeTeam = rightServeTeamKey === firstServeTeam
          
          
          // Service order mapping:
          // - First serve team: player with firstServe = order 1, other = order 3
          // - Receiving team: player with firstServe = order 2, other = order 4
          if (isFirstServeTeam) {
            // This team is the first serve team
            if (servingOrderNumber === 1) {
              // Order 1 = first serve player of first serve team
              rightServingPlayer = teamData.player1?.firstServe ? 1 : 2
            } else if (servingOrderNumber === 3) {
              // Order 3 = second serve player of first serve team
              rightServingPlayer = teamData.player1?.firstServe ? 2 : 1
            }
          } else {
            // This team is the receiving team
            if (servingOrderNumber === 2) {
              // Order 2 = first serve player of receiving team
              rightServingPlayer = teamData.player1?.firstServe ? 1 : 2
            } else if (servingOrderNumber === 4) {
              // Order 4 = second serve player of receiving team
              rightServingPlayer = teamData.player1?.firstServe ? 2 : 1
            }
          }
          
        }
      }
    }
  }
  
  // Map player position (1 or 2) to actual player number from coin toss data
  const getPlayerNumberFromPosition = useCallback((teamKey, playerPosition, coinTossData, teamAKey) => {
    if (!playerPosition || !coinTossData) return playerPosition // Fallback to position if no data
    const isTeamA = teamKey === teamAKey
    const teamData = isTeamA ? coinTossData.teamA : coinTossData.teamB
    if (!teamData) return playerPosition
    
    const playerData = playerPosition === 1 ? teamData.player1 : teamData.player2
    if (!playerData) return playerPosition
    
    // Return the actual player number from coin toss data, or fallback to position
    return playerData.number !== undefined && playerData.number !== null ? playerData.number : playerPosition
  }, [])
  
  // Convert player positions to actual player numbers
  if (leftServing && leftServingPlayer && data?.match?.coinTossData?.players) {
    const coinTossData = data.match.coinTossData.players
    const teamAKey = data.match.coinTossTeamA || 'team_1'
    leftServingPlayer = getPlayerNumberFromPosition(leftServeTeamKey, leftServingPlayer, coinTossData, teamAKey)
  }
  if (rightServing && rightServingPlayer && data?.match?.coinTossData?.players) {
    const coinTossData = data.match.coinTossData.players
    const teamAKey = data.match.coinTossTeamA || 'team_1'
    rightServingPlayer = getPlayerNumberFromPosition(rightServeTeamKey, rightServingPlayer, coinTossData, teamAKey)
  }
  
  // Always show a player number when serving (fallback to 1 if calculation fails)
  if (leftServing && !leftServingPlayer) {
    leftServingPlayer = 1
  }
  if (rightServing && !rightServingPlayer) {
    rightServingPlayer = 1
  }
  

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', ...style }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            width: '100%'
          }}
        >
          {/* Score counter - always centered */}
          <div
            className="set-score-display"
            style={{
              position: 'relative',
              display: 'inline-block',
              padding: '0 44px',
              borderRadius: '14px'
            }}
          >
            {leftServing && (
              <img
                src={mikasaVolleyball}
                alt="Serving team"
                style={{
                  ...serveBallBaseStyle,
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-40%)'
                }}
              />
            )}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ minWidth: 48, textAlign: 'right' }}>{pointsBySide.left}</span>
              <span>:</span>
              <span style={{ minWidth: 48, textAlign: 'left' }}>{pointsBySide.right}</span>
            </div>
            {rightServing && (
              <img
                src={mikasaVolleyball}
                alt="Serving team"
                style={{
                  ...serveBallBaseStyle,
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-40%)'
                }}
              />
            )}
          </div>
        </div>
        {/* Set transition countdown - show in main scoreboard until start rally is pressed */}
        {setTransitionModal && setTransitionCountdown > 0 && (
        <div style={{
            marginTop: '16px',
            padding: '12px 20px',
            background: 'rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            border: '2px solid rgba(59, 130, 246, 0.5)',
          textAlign: 'center'
        }}>
            <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
              {setTransitionCountdown}"
        </div>
          </div>
        )}
      </div>
    ),
    [leftServing, rightServing, leftServingPlayer, rightServingPlayer, pointsBySide.left, pointsBySide.right, serveBallBaseStyle, setScore.left, setScore.right, setTransitionModal, setTransitionCountdown]
  )

  const handlePoint = useCallback(
    async (side, reason = null) => {
      if (!data?.set) return
      const teamKey = mapSideToTeamKey(side)
      const field = teamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
      const newPoints = data.set[field] + 1
      const team_1Points = teamKey === 'team_1' ? newPoints : data.set.team_1Points
      const team_2Points = teamKey === 'team_2' ? newPoints : data.set.team_2Points

      // Check who has serve BEFORE this point by querying database directly
      // The team that scored the last point has serve, so check the last point in DB
      const allEventsBeforePoint = await db.events
        .where('matchId')
        .equals(matchId)
        .toArray()
      const pointEventsBefore = allEventsBeforePoint
        .filter(e => e.type === 'point' && e.setIndex === data.set.index)
        .sort((a, b) => {
          const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
          const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
          return bTime - aTime // Most recent first
        })
      
      let serveBeforePoint = data?.match?.firstServe || 'team_1'
      if (pointEventsBefore.length > 0) {
        // The last point event shows who has serve now (before this new point)
        const lastPoint = pointEventsBefore[0] // Most recent is first after sorting
        serveBeforePoint = lastPoint.payload?.team || serveBeforePoint
      }
      
      const scoringTeamHadServe = serveBeforePoint === teamKey

      // Update score and log point FIRST
      await db.sets.update(data.set.id, {
        [field]: newPoints
      })
      // Include fromPenalty flag if point is from delay_penalty or misconduct penalty
      const pointPayload = { team: teamKey }
      if (reason === 'delay_penalty' || reason === 'misconduct_penalty' || reason === 'penalty') {
        pointPayload.fromPenalty = true
        pointPayload.reason = reason
      }
      await logEvent('point', pointPayload)

      // Beach volleyball: No rotation (only 2 players, no rotation needed)
      
      const totalPoints = team_1Points + team_2Points
      
      // Beach volleyball: Technical TO at 21 points total (NOT in set 3)
      // Check TTO FIRST before court switch, since 21 is also a multiple of 7
      const isSet3 = data.set.index === 3
      if (!isSet3) {
        // Alert at 20th point (one point before TTO) - ONLY for sets 1-2
        if (totalPoints === 20) {
          setCourtSwitchAlert({ message: 'One point to TTO' })
          setTimeout(() => setCourtSwitchAlert(null), 3000) // Auto-dismiss after 3 seconds
        }
        
        // Technical TO at 21st point - check this BEFORE court switch
        if (totalPoints === 21) {
          const match = await db.matches.get(matchId)
          const setTTOKey = `set${data.set.index}_tto`
          const hasTTO = match?.[setTTOKey] || false
          if (!hasTTO) {
            // Show Technical TO modal
            // Find which team scored the 21st point
            const pointEvents = data.events
              .filter(e => e.type === 'point' && e.setIndex === data.set.index)
              .sort((a, b) => {
                const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
                const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
                return bTime - aTime
              })
            const teamThatScored = pointEvents.length > 0 ? pointEvents[0].payload?.team : null
            
            setTechnicalTOModal({
              set: data.set,
              team_1Points,
              team_2Points,
              teamThatScored,
              countdown: 60,
              started: false
            })
            await db.matches.update(matchId, { [setTTOKey]: true })
            return // Don't check for set end yet, wait for TTO completion
          }
        }
      }
      
      // Beach volleyball: Court switch every 7 points (set 1-2) or every 5 points (set 3)
      // Skip court switch at 21 points if TTO should happen (sets 1-2 only)
      
      if (isSet3) {
        // Set 3: switches every 5 points (5, 10, 15, 20, etc.)
        // Alert at one point before switch: 4, 9, 14, 19, 24, etc.
        const set3Remainder = totalPoints % 5
        if (set3Remainder === 4 && totalPoints >= 4) {
          setCourtSwitchAlert({ message: 'One point to switch' })
          setTimeout(() => setCourtSwitchAlert(null), 3000) // Auto-dismiss after 3 seconds
        }
        
        // Switch at 5, 10, 15, 20, etc. (when remainder is 0)
        if (set3Remainder === 0 && totalPoints > 0 && totalPoints >= 5) {
          // Check if set/match is ending - if so, skip court switch and go straight to set/match end
          const setEnded = await checkSetEnd(data.set, team_1Points, team_2Points)
          if (setEnded) {
            // Set/match is ending, skip court switch
            return
          }
          
          // Check if we've already shown the modal for this point total (to prevent duplicate modals)
          const match = await db.matches.get(matchId)
          const set3SwitchKey = `set3_switch_${totalPoints}`
          const set3ModalShown = match?.[set3SwitchKey] || false
          if (!set3ModalShown) {
            // Show court switch modal (DO NOT switch courts yet - wait for confirmation)
            setCourtSwitchModal({
              set: data.set,
              team_1Points,
              team_2Points,
              teamThatScored: teamKey
            })
            await db.matches.update(matchId, { [set3SwitchKey]: true })
            // DO NOT log event or increment switch count yet - wait for confirmation
            return // Don't check for set end yet, wait for court switch confirmation
          }
        }
      } else {
        // Sets 1-2: switches every 7 points (7, 14, 21=TTO, 28, etc.)
        const switchIntervalSet12 = 7
        // Alert at one point before switch: 6, 13, 20 (but skip 20 if TTO is coming at 21)
        const set12Remainder = totalPoints % switchIntervalSet12
        if (set12Remainder === 6 && totalPoints > 0) {
        // Don't show court switch alert at 20 if TTO is coming at 21
          if (totalPoints !== 20) {
          setCourtSwitchAlert({ message: 'One point to switch' })
          setTimeout(() => setCourtSwitchAlert(null), 3000) // Auto-dismiss after 3 seconds
        }
      }
      
        // Switch at 7, 14, 28, etc. (when remainder is 0, but skip 21 for TTO)
        if (set12Remainder === 0 && totalPoints > 0) {
        // Skip court switch at 21 points for sets 1-2 (TTO takes priority)
          if (totalPoints === 21) {
          // TTO already handled above, skip court switch
        } else {
            // Check if set/match is ending - if so, skip court switch and go straight to set/match end
            const setEnded = await checkSetEnd(data.set, team_1Points, team_2Points)
            if (setEnded) {
              // Set/match is ending, skip court switch
              return
            }
            
            // Check if we've already shown the modal for this point total (to prevent duplicate modals)
          const match = await db.matches.get(matchId)
            const set12SwitchKey = `set${data.set.index}_switch_${totalPoints}`
            const set12ModalShown = match?.[set12SwitchKey] || false
            if (!set12ModalShown) {
            // Show court switch modal (DO NOT switch courts yet - wait for confirmation)
            setCourtSwitchModal({
              set: data.set,
              team_1Points,
              team_2Points,
              teamThatScored: teamKey
            })
              await db.matches.update(matchId, { [set12SwitchKey]: true })
            // DO NOT log event or increment switch count yet - wait for confirmation
            return // Don't check for set end yet, wait for court switch confirmation
            }
          }
        }
      }
      
      const setEnded = checkSetEnd(data.set, team_1Points, team_2Points)
      // If set didn't end, we're done. If it did, checkSetEnd will show the confirmation modal
    },
    [data?.set, data?.events, logEvent, mapSideToTeamKey, checkSetEnd, getCurrentServe, matchId]
  )

  const handleStartRally = useCallback(async () => {
    // Clear court switch alert when starting a new rally
    setCourtSwitchAlert(null)
    
    // If this is the first rally, show set start time confirmation
    if (isFirstRally) {
      // Show set start time confirmation
      // For set 1, use scheduled time, for set 2+, use 1 minute after previous set end
      let defaultTime = new Date().toISOString()
      
      if (data?.set?.index === 1) {
        // Use scheduled time from match
        if (data?.match?.scheduledAt) {
          defaultTime = data.match.scheduledAt
        }
      } else {
        // Get previous set's end time
        // Query directly from database to ensure we have the latest data
        const allSets = await db.sets.where('matchId').equals(matchId).toArray()
        const previousSet = allSets.find(s => s.index === (data.set.index - 1))
        if (previousSet?.endTime) {
          // Add 1 minute to previous set end time
          const prevEndTime = new Date(previousSet.endTime)
          prevEndTime.setMinutes(prevEndTime.getMinutes() + 1)
          defaultTime = prevEndTime.toISOString()
          console.log(`Set ${data.set.index} start time: Previous set ${previousSet.index} ended at ${previousSet.endTime}, adding 1 minute = ${defaultTime}`)
        } else {
          // If previous set end time is not available, use current time
          // This shouldn't happen, but fallback to current time
          console.warn(`Previous set ${data.set.index - 1} end time not found, using current time`)
          defaultTime = new Date().toISOString()
        }
      }
      
      setSetStartTimeModal({ setIndex: data?.set?.index, defaultTime })
      return
    }
    
    // Get current serving team and player
    const currentServeTeam = getCurrentServe()
    const serviceOrder = data?.set?.serviceOrder || {}
    const servingPlayer = currentServeTeam ? getCurrentServingPlayer(currentServeTeam, serviceOrder, data?.events || [], data?.set, data?.match) : null
    
    // Determine team label (A or B)
    const teamALabel = data?.match?.coinTossTeamA === currentServeTeam ? 'A' : 'B'
    
    await logEvent('rally_start', {
      servingTeam: currentServeTeam,
      servingPlayer: servingPlayer,
      teamLabel: teamALabel
    })
  }, [logEvent, isFirstRally, data?.team_1Players, data?.team_2Players, data?.events, data?.set, data?.match, matchId, getCurrentServe, getCurrentServingPlayer, setCourtSwitchAlert])

  const handleReplay = useCallback(async () => {
    await logEvent('replay')
  }, [logEvent])

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

  // Confirm sanction
  const confirmSanction = useCallback(async () => {
    if (!sanctionConfirm || !data?.match || !data?.set) return
    
    const { side, type } = sanctionConfirm
    const teamKey = mapSideToTeamKey(side)
    const sideKey = side === 'left' ? 'Left' : 'Right'
    
    // Update match sanctions for improper request and delay warning
    if (type === 'improper_request' || type === 'delay_warning') {
      const currentSanctions = data.match.sanctions || {}
      await db.matches.update(matchId, {
        sanctions: {
          ...currentSanctions,
          [`${type === 'improper_request' ? 'improperRequest' : 'delayWarning'}${sideKey}`]: true
        }
      })
    }
    
    // Log the sanction event
    await logEvent('sanction', {
      team: teamKey,
      type: type
    })
    
    // If delay penalty, award point to the other team immediately
    // Beach volleyball: lineups are always set (2 players, no rotation), so no need to check
    if (type === 'delay_penalty') {
      setSanctionConfirm(null)
      // Award point immediately to the other team
        const otherSide = side === 'left' ? 'right' : 'left'
      await handlePoint(otherSide, 'delay_penalty')
    } else {
      setSanctionConfirm(null)
    }
  }, [sanctionConfirm, data?.match, data?.set, data?.events, mapSideToTeamKey, matchId, logEvent, handlePoint])

  // Confirm set start time
  const confirmSetStartTime = useCallback(async (time) => {
    if (!setStartTimeModal || !data?.set) return
    
    // Stop the countdown when set starts
    setSetTransitionCountdown(0)
    
    // Update set with start time (absolute timestamp)
    await db.sets.update(data.set.id, { startTime: time })
    
    // Get the highest sequence number for this match
    const nextSeq1 = await getNextSeq()
    const nextSeq2 = nextSeq1 + 1
    
    // Log set_start event
    await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'set_start',
      payload: {
        setIndex: setStartTimeModal.setIndex,
        startTime: time
      },
      ts: time,
      seq: nextSeq1
    })
    
    setSetStartTimeModal(null)
    
    // Now actually start the rally
    // Get current serving team and player
    const currentServeTeam = data?.match?.firstServe || 'team_1'
    const serviceOrder = data?.set?.serviceOrder || {}
    const servingPlayer = getCurrentServingPlayer(currentServeTeam, serviceOrder, data?.events || [], data?.set, data?.match)
    
    // Determine team label (A or B)
    const teamALabel = data?.match?.coinTossTeamA === currentServeTeam ? 'A' : 'B'
    
    await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'rally_start',
      payload: {
        servingTeam: currentServeTeam,
        servingPlayer: servingPlayer,
        teamLabel: teamALabel
      },
      ts: new Date().toISOString(),
      seq: nextSeq2
    })
  }, [setStartTimeModal, data?.set, data?.match, data?.events, matchId, getCurrentServingPlayer])

  // Confirm set end time
  const confirmSetEndTime = useCallback(async (time) => {
    if (!setEndTimeModal || !data?.match || !data?.set) return
    
    const { setIndex, winner, team_1Points, team_2Points } = setEndTimeModal
    
    // Determine team labels (A or B) based on coin toss
    const teamAKey = data.match.coinTossTeamA || 'team_1'
    const winnerLabel = winner === 'team_1' 
      ? (teamAKey === 'team_1' ? 'A' : 'B')
      : (teamAKey === 'team_2' ? 'A' : 'B')
    
    // Get start time from current set
    const startTime = data.set.startTime
    
    // Log set win with start and end times
    await logEvent('set_end', { 
      team: winner, 
      teamLabel: winnerLabel,
      setIndex: setIndex,
      team_1Points,
      team_2Points,
      startTime: startTime,
      endTime: time
    })
    
    // Update set with end time and finished status
    await db.sets.update(data.set.id, { finished: true, team_1Points, team_2Points, endTime: time })
    
    // Get all sets and calculate sets won by each team
    const sets = await db.sets.where({ matchId }).toArray()
    const finishedSets = sets.filter(s => s.finished)
    const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
    const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
    
    // Beach volleyball: Best of 3 sets (first to 2 sets wins)
    const isMatchEnd = team_1SetsWon >= 2 || team_2SetsWon >= 2
    
    if (isMatchEnd) {
      // IMPORTANT: When match ends, preserve ALL data in database:
      // - All sets remain in db.sets
      // - All events remain in db.events
      // - All players remain in db.players
      // - All teams remain in db.teams
      // - Only update match status to 'final' - DO NOT DELETE ANYTHING
      await db.matches.update(matchId, { status: 'final' })
      
      // Save match end time
      const matchEndTime = time
      await db.matches.update(matchId, { matchEndTime: matchEndTime })
      
      // Close the set end time modal
      setSetEndTimeModal(null)
      
      // Show match end modal with signatures and download options
      setMatchEndModal(true)
      
      return // Match is over, don't continue to set transition logic - stay on last set
    } else {
      // Double-check match is not over before showing transition modal
      // This prevents race conditions where match might have ended
      const doubleCheckSets = await db.sets.where({ matchId }).toArray()
      const doubleCheckFinishedSets = doubleCheckSets.filter(s => s.finished)
      const doubleCheckTeam_1SetsWon = doubleCheckFinishedSets.filter(s => s.team_1Points > s.team_2Points).length
      const doubleCheckTeam_2SetsWon = doubleCheckFinishedSets.filter(s => s.team_2Points > s.team_1Points).length
      const doubleCheckIsMatchEnd = doubleCheckTeam_1SetsWon >= 2 || doubleCheckTeam_2SetsWon >= 2
      
      if (doubleCheckIsMatchEnd) {
        // Match ended, show match end modal instead of transition
        setSetEndTimeModal(null)
        await db.matches.update(matchId, { status: 'final' })
        setMatchEndModal(true)
        return
      }
      
      // After set 1, show transition modal to switch sides, service, and service order
      if (setIndex === 1) {
        setSetEndTimeModal(null)
        // Get service order from last set (set 1) to use as default
        const lastSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === setIndex).first()
        if (lastSet?.serviceOrder) {
          // Determine service order for each team based on last set
          const teamAKey = data.match.coinTossTeamA || 'team_1'
          const teamBKey = data.match.coinTossTeamB || 'team_2'
          const teamAPlayer1Order = lastSet.serviceOrder[`${teamAKey}_player1`] || 1
          const teamAPlayer2Order = lastSet.serviceOrder[`${teamAKey}_player2`] || 3
          const teamBPlayer1Order = lastSet.serviceOrder[`${teamBKey}_player1`] || 2
          const teamBPlayer2Order = lastSet.serviceOrder[`${teamBKey}_player2`] || 4
          
          // Determine which player serves first for each team (lower order number = serves first)
          const teamAServiceOrder = teamAPlayer1Order < teamAPlayer2Order ? '1_2' : '2_1'
          const teamBServiceOrder = teamBPlayer1Order < teamBPlayer2Order ? '1_2' : '2_1'
          
          setSetTransitionServiceOrder({ teamA: teamAServiceOrder, teamB: teamBServiceOrder })
        }
        setSetTransitionCountdown(60) // Reset countdown to 60 seconds
        setSetTransitionModal({ setIndex: setIndex + 1, isSet3: false })
        return
      }
      
      // After set 2, check if match is over (2-0) or going to set 3 (1-1)
      if (setIndex === 2) {
        if (team_1SetsWon === 2 || team_2SetsWon === 2) {
          // Match is over (2-0) - this should have been caught by isMatchEnd check above
          // But if we reach here, close the modal and finish the match
          setSetEndTimeModal(null)
          await db.matches.update(matchId, { status: 'final' })
          setMatchEndModal(true)
          return
        } else {
          // Going to set 3 (1-1), show transition modal with 3rd set coin toss
          // IMPORTANT: Explicitly set setIndex to 3 to ensure we create set 3, not set 2
          const nextSetIndex = 3
          console.log(`Set 2 ended with 1-1. Creating set ${nextSetIndex} (not ${setIndex + 1})`)
          
          setSetEndTimeModal(null)
          // Reset coin toss winner state for set 3
          setSet3CoinTossWinner(null)
          // Get service order from last set (set 2) to use as default
          const lastSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === setIndex).first()
          if (lastSet?.serviceOrder) {
            // Determine service order for each team based on last set
            const teamAKey = data.match.coinTossTeamA || 'team_1'
            const teamBKey = data.match.coinTossTeamB || 'team_2'
            const teamAPlayer1Order = lastSet.serviceOrder[`${teamAKey}_player1`] || 1
            const teamAPlayer2Order = lastSet.serviceOrder[`${teamAKey}_player2`] || 3
            const teamBPlayer1Order = lastSet.serviceOrder[`${teamBKey}_player1`] || 2
            const teamBPlayer2Order = lastSet.serviceOrder[`${teamBKey}_player2`] || 4
            
            // Determine which player serves first for each team (lower order number = serves first)
            const teamAServiceOrder = teamAPlayer1Order < teamAPlayer2Order ? '1_2' : '2_1'
            const teamBServiceOrder = teamBPlayer1Order < teamBPlayer2Order ? '1_2' : '2_1'
            
            setSetTransitionServiceOrder({ teamA: teamAServiceOrder, teamB: teamBServiceOrder })
          }
          setSetTransitionCountdown(60) // Reset countdown to 60 seconds
          setSetTransitionModal({ setIndex: nextSetIndex, isSet3: true })
          return
        }
      }
      
      // Beach volleyball: Only sets 1, 2, 3 exist (best of 3)
      // If we reach here, something went wrong - match should have ended
      console.warn('Unexpected set index after set 2 handling:', setIndex)
      // Prevent creating set 4 - match should have ended
        setSetEndTimeModal(null)
        return
    }
    
    setSetEndTimeModal(null)
  }, [setEndTimeModal, data?.match, data?.set, matchId, logEvent, onFinishSet, getCurrentServe, teamAKey])

  // Confirm set transition (after set 1 or before set 3)
  const confirmSetTransition = useCallback(async () => {
    if (!setTransitionModal || !data?.match) return
    
    const { setIndex, isSet3 } = setTransitionModal
    
    // Check if match is already over - don't create new set if match is finished
    const sets = await db.sets.where({ matchId }).toArray()
    const finishedSets = sets.filter(s => s.finished)
    const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
    const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
    const isMatchEnd = team_1SetsWon >= 2 || team_2SetsWon >= 2
    
    if (isMatchEnd) {
      console.warn('Match is already over. Cannot create new set.')
      setSetTransitionModal(null)
      // Show match end modal if not already shown
      if (!matchEndModal) {
        setMatchEndModal(true)
      }
      return
    }
    
    // Prevent creating set 4 - beach volleyball only has sets 1, 2, 3
    if (setIndex > 3) {
      console.warn('Cannot create set 4 - beach volleyball only has sets 1, 2, 3')
      setSetTransitionModal(null)
      return
    }
    const teamAKey = data.match.coinTossTeamA || 'team_1'
    const teamBKey = data.match.coinTossTeamB || 'team_2'
    
    // Determine which team (team_1/team_2) is on the left
    const leftTeamKey = setTransitionSelectedLeftTeam === 'A' ? teamAKey : teamBKey
    const rightTeamKey = setTransitionSelectedLeftTeam === 'A' ? teamBKey : teamAKey
    
    // Determine which team (team_1/team_2) serves first
    const firstServeTeamKey = setTransitionSelectedFirstServe === 'A' ? teamAKey : teamBKey
    
    // Update coin toss data if needed (for set 3, update with 3rd set coin toss winner)
    // Store set 3 coin toss winner separately: 'teamA' | 'teamB' | null
    // Preserve all existing coin toss data (including set 1 coinTossWinner)
    if (isSet3 && set3CoinTossWinner) {
      const existingCoinTossData = data.match.coinTossData || {}
      const updatedCoinTossData = {
        ...existingCoinTossData, // Preserve all existing fields (teamA, teamB, serveA, serveB, firstServe, coinTossWinner, players, timestamp, etc.)
        set3CoinTossWinner: set3CoinTossWinner // Add set 3 coin toss winner without overwriting set 1 winner
      }
      await db.matches.update(matchId, { coinTossData: updatedCoinTossData })
    }
    
    // Update match with first serve for the new set
    // Also save which team is on the left for this set
    const setLeftTeamKey = `set${setIndex}_leftTeam`
    await db.matches.update(matchId, { 
      firstServe: firstServeTeamKey,
      [setLeftTeamKey]: leftTeamKey
    })
    
    // Calculate service order based on the selected service order preference
    const matchData = await db.matches.get(matchId)
    const coinTossData = matchData?.coinTossData?.players
    if (!coinTossData) {
      throw new Error('Coin toss data is missing.')
    }
    
    // Build service order based on user selection
    // Map service order from Team A/B to left/right teams
    const leftTeamLabel = setTransitionSelectedLeftTeam // 'A' or 'B'
    const rightTeamLabel = setTransitionSelectedLeftTeam === 'A' ? 'B' : 'A'
    
    // Get service order for left and right teams (based on their Team A/B label)
    const leftTeamServiceOrder = setTransitionServiceOrder[leftTeamLabel === 'A' ? 'teamA' : 'teamB'] // '1_2' or '2_1'
    const rightTeamServiceOrder = setTransitionServiceOrder[rightTeamLabel === 'A' ? 'teamA' : 'teamB'] // '1_2' or '2_1'
    
    // Determine which team serves first (left or right)
    const servingTeamIsLeft = firstServeTeamKey === leftTeamKey
    const servingTeam = servingTeamIsLeft ? leftTeamKey : rightTeamKey
    const receivingTeam = servingTeamIsLeft ? rightTeamKey : leftTeamKey
    const servingTeamOrder = servingTeamIsLeft ? leftTeamServiceOrder : rightTeamServiceOrder
    const receivingTeamOrder = servingTeamIsLeft ? rightTeamServiceOrder : leftTeamServiceOrder
    
    const serviceOrder = {}
    
    // Serving team: first serve player gets order 1, other gets order 3
    if (servingTeamOrder === '1_2') {
      serviceOrder[`${servingTeam}_player1`] = 1
      serviceOrder[`${servingTeam}_player2`] = 3
    } else {
      serviceOrder[`${servingTeam}_player1`] = 3
      serviceOrder[`${servingTeam}_player2`] = 1
    }
    
    // Receiving team: first serve player gets order 2, other gets order 4
    if (receivingTeamOrder === '1_2') {
      serviceOrder[`${receivingTeam}_player1`] = 2
      serviceOrder[`${receivingTeam}_player2`] = 4
    } else {
      serviceOrder[`${receivingTeam}_player1`] = 4
      serviceOrder[`${receivingTeam}_player2`] = 2
    }
    
    // Check if set with this index already exists (prevent duplicates)
    const existingSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === setIndex).first()
    if (existingSet) {
      console.warn(`Set ${setIndex} already exists with ID ${existingSet.id}. Not creating duplicate.`)
      setSetTransitionModal(null)
      return
    }
    
    // Create new set
    const newSetId = await db.sets.add({ 
      matchId, 
      index: setIndex, 
      team_1Points: 0, 
      team_2Points: 0, 
      finished: false,
      serviceOrder: serviceOrder
    })
    
    console.log(`Set ${setIndex} created with ID: ${newSetId}`)
    
    // Close transition modal
    setSetTransitionModal(null)
    
    // Wait a bit for useLiveQuery to refresh, then automatically show set start time modal
    // This ensures the new set is loaded before we try to start it
    setTimeout(async () => {
      // Fetch the newly created set to ensure it exists
      const newSet = await db.sets.get(newSetId)
      if (newSet) {
        // Calculate default start time (previous set end + 1 minute)
        let defaultTime = new Date().toISOString()
        const allSets = await db.sets.where('matchId').equals(matchId).toArray()
        const previousSet = allSets.find(s => s.index === (setIndex - 1))
        if (previousSet?.endTime) {
          const prevEndTime = new Date(previousSet.endTime)
          prevEndTime.setMinutes(prevEndTime.getMinutes() + 1)
          defaultTime = prevEndTime.toISOString()
        }
        
        // Show set start time modal
        setSetStartTimeModal({ setIndex: setIndex, defaultTime })
      } else {
        console.error(`Failed to find newly created set ${newSetId}`)
      }
    }, 100) // Small delay to allow useLiveQuery to refresh
  }, [setTransitionModal, setTransitionSelectedLeftTeam, setTransitionSelectedFirstServe, setTransitionServiceOrder, set3CoinTossWinner, data?.match, matchId, teamAKey, setSetStartTimeModal, setSetTransitionModal, matchEndModal, setMatchEndModal])
  

  // Get action description for an event
  const getActionDescription = useCallback((event) => {
    if (!event || !data) return 'Unknown action'
    
    const teamName = event.payload?.team === 'team_1' 
      ? (data.team_1Team?.name || 'Team 1')
      : event.payload?.team === 'team_2'
      ? (data.team_2Team?.name || 'Team 2')
      : null
    
    // Determine team labels (A or B)
    const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
    const teamBLabel = data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'
    const team_1Label = data?.match?.coinTossTeamA === 'team_1' ? 'A' : (data?.match?.coinTossTeamB === 'team_1' ? 'B' : 'A')
    const team_2Label = data?.match?.coinTossTeamA === 'team_2' ? 'A' : (data?.match?.coinTossTeamB === 'team_2' ? 'B' : 'B')
    
      // Legacy variable names for event descriptions (mapped to team_1/team_2)
      // team_1Label and team_2Label are already defined above
    
    // Calculate score at time of event
    const setIdx = event.setIndex || 1
    const setEvents = data.events?.filter(e => (e.setIndex || 1) === setIdx) || []
    const eventIndex = setEvents.findIndex(e => e.id === event.id)
    
    let team_1Score = 0
    let team_2Score = 0
    for (let i = 0; i <= eventIndex; i++) {
      const e = setEvents[i]
      if (e.type === 'point') {
        if (e.payload?.team === 'team_1') {
          team_1Score++
        } else if (e.payload?.team === 'team_2') {
          team_2Score++
        }
      }
    }
    
    let eventDescription = ''
    if (event.type === 'point') {
      eventDescription = `Point — ${teamName} (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
    } else if (event.type === 'timeout') {
      eventDescription = `Timeout — ${teamName}`
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
      // Show serving team (A/B) and player number (1-2)
      const servingTeam = event.payload?.servingTeam
      const servingPlayer = event.payload?.servingPlayer
      const teamLabel = event.payload?.teamLabel
      
      if (servingTeam && servingPlayer && teamLabel) {
        eventDescription = `Rally started — Team ${teamLabel}, Player ${servingPlayer} serves`
      } else {
      eventDescription = 'Rally started'
      }
    } else if (event.type === 'replay') {
      eventDescription = 'Replay'
    } else if (event.type === 'lineup') {
      // Beach volleyball: No lineup events (lineup is always players 1 and 2, only serving changes)
      return null
    } else if (event.type === 'court_switch') {
      const setIndex = event.payload?.setIndex || event.setIndex || '?'
      // Get team labels for score display
      const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
      const teamBLabel = data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'
      // Calculate which team is on left/right at time of switch
      // At court switch, teams are flipped, so we need to determine the score display
      const team_1Score = event.payload?.team_1Points || 0
      const team_2Score = event.payload?.team_2Points || 0
      // Determine which team is A and which is B
      const teamAKey = data?.match?.coinTossTeamA || 'team_1'
      const teamBKey = data?.match?.coinTossTeamB || 'team_2'
      const teamAScore = teamAKey === 'team_1' ? team_1Score : team_2Score
      const teamBScore = teamAKey === 'team_1' ? team_2Score : team_1Score
      eventDescription = `Court Switch — Set ${setIndex}, ${teamALabel} ${teamAScore}:${teamBScore} ${teamBLabel}`
    } else if (event.type === 'technical_to') {
      const setIndex = event.payload?.setIndex || event.setIndex || '?'
      const totalPoints = event.payload?.totalPoints || 0
      eventDescription = `Technical Timeout — Set ${setIndex} (${totalPoints} points)`
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
        const startTimeStr = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        const endTimeStr = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        timeInfo = ` (${startTimeStr} - ${endTimeStr}, ${durationMin}'${String(durationSec).padStart(2, '0')}")`
      }
      
      eventDescription = `Team ${winnerLabel} won Set ${setIndex}${timeInfo}`
    } else if (event.type === 'sanction') {
      const sanctionType = event.payload?.type || 'unknown'
      const sanctionLabel = sanctionType === 'improper_request' ? 'Improper Request' :
                            sanctionType === 'delay_warning' ? 'Delay Warning' :
                            sanctionType === 'delay_penalty' ? 'Delay Penalty' :
                            sanctionType === 'warning' ? 'Warning (Yellow)' :
                            sanctionType === 'penalty' ? 'Penalty (Red)' :
                            sanctionType === 'rude_conduct' ? 'Penalty (Red)' : // rude_conduct is treated as penalty
                            sanctionType === 'expulsion' ? 'Expulsion (Y+R)' :
                            sanctionType === 'disqualification' ? 'Disqualification (Y|R)' :
                            sanctionType
      
      // Add player/official info if available
      let target = ''
      if (event.payload?.playerNumber) {
        target = ` ${event.payload.playerNumber}`
      } else if (event.payload?.role) {
        const roleAbbr = event.payload.role === 'Physiotherapist' ? 'P' :
                        event.payload.role === 'Medic' ? 'M' : event.payload.role
        target = ` ${roleAbbr}`
      } else {
        target = ' Team'
      }
      
      eventDescription = `Sanction — ${teamName}${target} (${sanctionLabel}) (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
    } else if (event.type === 'challenge_request') {
      const status = event.payload?.status || 'unknown'
      const statusLabel = status === 'accepted' ? 'Accepted' : status === 'refused' ? 'Refused' : status
      const reason = event.payload?.reason || 'Unknown'
      const teamLabel = event.payload?.team === teamAKey ? 'A' : event.payload?.team === teamBKey ? 'B' : '?'
      eventDescription = `BMP Request — Team ${teamLabel} (${statusLabel}) — ${reason} (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
    } else if (event.type === 'challenge_outcome') {
      const result = event.payload?.result || 'unknown'
      const resultLabel = result === 'successful' ? 'Successful' : 
                         result === 'unsuccessful' ? 'Unsuccessful' : 
                         result === 'judgment_impossible' ? 'Judgment Impossible' : 
                         result === 'mark_deliberately_altered' ? 'Mark Deliberately Altered (Rally Replayed)' : 
                         result === 'cancelled' ? 'Cancelled by Team' : result
      const reason = event.payload?.reason || 'Unknown'
      const teamLabel = event.payload?.team === teamAKey ? 'A' : event.payload?.team === teamBKey ? 'B' : '?'
      const originalScore = event.payload?.originalScore || event.payload?.score
      const newScore = event.payload?.newScore
      const replayRally = event.payload?.replayRally
      
      let scoreInfo = ''
      if (originalScore) {
        const origA = teamAKey === 'team_1' ? originalScore.team_1 : originalScore.team_2
        const origB = teamAKey === 'team_1' ? originalScore.team_2 : originalScore.team_1
        scoreInfo = ` (${team_1Label} ${origA}:${origB} ${team_2Label}`
        if (newScore && result === 'successful') {
          const newA = teamAKey === 'team_1' ? newScore.team_1 : newScore.team_2
          const newB = teamAKey === 'team_1' ? newScore.team_2 : newScore.team_1
          scoreInfo += ` → ${team_1Label} ${newA}:${newB} ${team_2Label}`
        } else if (replayRally) {
          scoreInfo += ` — Rally replayed, score unchanged)`
        } else {
          scoreInfo += ')'
        }
      } else {
        scoreInfo = ` (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
      }
      
      eventDescription = `BMP Outcome — Team ${teamLabel} (${resultLabel}) — ${reason}${scoreInfo}`
    } else if (event.type === 'referee_bmp_request') {
      const reason = event.payload?.reason || 'Unknown'
      const servingTeam = event.payload?.servingTeam
      const servingLabel = servingTeam === teamAKey ? 'A' : servingTeam === teamBKey ? 'B' : '?'
      eventDescription = `Referee BMP Request — ${reason} (Serving: Team ${servingLabel}, ${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
    } else if (event.type === 'referee_bmp_outcome') {
      const result = event.payload?.result || 'unknown'
      const resultLabel = result === 'left' ? 'Left (Team A)' : 
                         result === 'right' ? 'Right (Team B)' : 
                         result === 'judgment_impossible' ? 'Judgment Impossible' : 
                         result === 'mark_deliberately_altered' ? 'Mark Deliberately Altered (Rally Replayed)' : 
                         result === 'cancelled' ? 'Cancelled by Team' : result
      const reason = event.payload?.reason || 'Unknown'
      const originalScore = event.payload?.originalScore || event.payload?.score
      const newScore = event.payload?.newScore
      const replayRally = event.payload?.replayRally
      
      let scoreInfo = ''
      if (originalScore) {
        const origA = teamAKey === 'team_1' ? originalScore.team_1 : originalScore.team_2
        const origB = teamAKey === 'team_1' ? originalScore.team_2 : originalScore.team_1
        scoreInfo = ` (${team_1Label} ${origA}:${origB} ${team_2Label}`
        if (newScore && result !== 'judgment_impossible' && result !== 'mark_deliberately_altered') {
          const newA = teamAKey === 'team_1' ? newScore.team_1 : newScore.team_2
          const newB = teamAKey === 'team_1' ? newScore.team_2 : newScore.team_1
          scoreInfo += ` → ${team_1Label} ${newA}:${newB} ${team_2Label}`
        } else if (replayRally) {
          scoreInfo += ` — Rally replayed, score unchanged)`
        } else {
          scoreInfo += ')'
        }
      } else {
        scoreInfo = ` (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
      }
      
      eventDescription = `Referee BMP Outcome — ${resultLabel} — ${reason}${scoreInfo}`
    } else if (event.type === 'bmp') {
      // Legacy bmp event (for backward compatibility)
      const result = event.payload?.result || 'unknown'
      const resultLabel = result === 'left' ? 'Left (Team A)' : 
                         result === 'right' ? 'Right (Team B)' : 
                         result === 'judgment_impossible' ? 'Judgment Impossible' : result
      const reason = event.payload?.reason || 'Unknown'
      const originalScore = event.payload?.originalScore
      const newScore = event.payload?.newScore
      
      let scoreInfo = ''
      if (originalScore) {
        const origA = teamAKey === 'team_1' ? originalScore.team_1 : originalScore.team_2
        const origB = teamAKey === 'team_1' ? originalScore.team_2 : originalScore.team_1
        scoreInfo = ` (${team_1Label} ${origA}:${origB} ${team_2Label}`
        if (newScore && result !== 'judgment_impossible') {
          const newA = teamAKey === 'team_1' ? newScore.team_1 : newScore.team_2
          const newB = teamAKey === 'team_1' ? newScore.team_2 : newScore.team_1
          scoreInfo += ` → ${team_1Label} ${newA}:${newB} ${team_2Label}`
        }
        scoreInfo += ')'
      } else {
        scoreInfo = ` (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
      }
      
      eventDescription = `Referee BMP Outcome — ${resultLabel} — ${reason}${scoreInfo}`
    } else {
      eventDescription = event.type
      if (teamName) {
        eventDescription += ` — ${teamName}`
      }
    }
    
    return eventDescription
  }, [data, teamAKey, teamBKey])

  // Show undo confirmation
  const showUndoConfirm = useCallback(() => {
    if (!data?.events || data.events.length === 0) return
    
    // Find the last event by sequence number (highest seq)
    const allEvents = [...data.events].sort((a, b) => {
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
    const lastEvent = allEvents[0]
    if (!lastEvent) return
    
    // Beach volleyball: No rotation lineups - only initial lineups exist
    // If it's a non-initial lineup event, skip it (shouldn't happen in beach volleyball)
    if (lastEvent.type === 'lineup' && !lastEvent.payload?.isInitial) {
      // Find the next undoable event
      const currentIndex = allEvents.findIndex(e => e.id === lastEvent.id)
      const nextUndoableEvent = allEvents.slice(currentIndex + 1).find(e => {
        // Skip non-initial lineup events
        if (e.type === 'lineup' && !e.payload?.isInitial) {
          return false
        }
        const desc = getActionDescription(e)
        return desc && desc !== 'Unknown action' && desc.trim() !== ''
      })
      if (nextUndoableEvent) {
        const description = getActionDescription(nextUndoableEvent)
        setUndoConfirm({ event: nextUndoableEvent, description })
        return
      }
      // No other events to undo
      setUndoConfirm(null)
      return
    }
    
    const lastUndoableEvent = lastEvent
    
    if (!lastUndoableEvent) return
    
    const description = getActionDescription(lastUndoableEvent)
    // getActionDescription returns null for non-initial lineup events
    // So if it returns null here, try to find the next undoable event
    if (!description || description === 'Unknown action') {
      // Find the next undoable event after this one
      const currentIndex = allEvents.findIndex(e => e.id === lastUndoableEvent.id)
      const nextUndoableEvent = allEvents.slice(currentIndex + 1).find(e => {
          // Beach volleyball: Skip non-initial lineup events (shouldn't exist)
          if (e.type === 'lineup' && !e.payload?.isInitial) {
              return false
          }
        // Allow rally_start, set_start, and replay events to be undone
        const desc = getActionDescription(e)
        return desc && desc !== 'Unknown action'
      })
      
      if (nextUndoableEvent) {
        const nextDesc = getActionDescription(nextUndoableEvent)
        if (nextDesc && nextDesc !== 'Unknown action') {
          setUndoConfirm({ event: nextUndoableEvent, description: nextDesc })
          return
        }
      }
      // No undoable events found
      return
    }
    
    setUndoConfirm({ event: lastUndoableEvent, description })
  }, [data?.events, getActionDescription])

  const handleUndo = useCallback(async () => {
    if (!undoConfirm || !data?.set) {
      setUndoConfirm(null)
      return
    }
    
    const lastEvent = undoConfirm.event
    
    try {
    // Beach volleyball: Skip non-initial lineup events (shouldn't exist, but handle gracefully)
    if (lastEvent.type === 'lineup' && !lastEvent.payload?.isInitial) {
      // Find the next undoable event
        const allEvents = data.events.sort((a, b) => new Date(b.ts) - new Date(a.ts))
        const nextEvent = allEvents.find(e => {
          if (e.id === lastEvent.id) return false
        // Skip non-initial lineup events
        if (e.type === 'lineup' && !e.payload?.isInitial) return false
        const desc = getActionDescription(e)
        if (desc && desc !== 'Unknown action' && desc.trim() !== '') {
          return true
        }
        return false
        })
        
        if (nextEvent) {
          const description = getActionDescription(nextEvent)
          if (description && description !== 'Unknown action' && description.trim() !== '') {
            setUndoConfirm({ event: nextEvent, description })
            return
          }
        }
        // No other events to undo
        setUndoConfirm(null)
        return
    }
    
    // If it's a point, decrease the score (beach volleyball: no rotations, only serving changes)
    if (lastEvent.type === 'point' && lastEvent.payload?.team) {
      const teamKey = lastEvent.payload.team
      const field = teamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
      const currentPoints = data.set[field]
        
        
      const newTeam_1Points = teamKey === 'team_1' ? currentPoints - 1 : data.set.team_1Points
      const newTeam_2Points = teamKey === 'team_2' ? currentPoints - 1 : data.set.team_2Points
        
      if (currentPoints > 0) {
        await db.sets.update(data.set.id, {
          [field]: currentPoints - 1
        })
      }
      
      // Calculate total points BEFORE this point was scored (for court switch flag cleanup)
      const totalPointsBeforeUndo = (data.set.team_1Points || 0) + (data.set.team_2Points || 0)
      const totalPointsAfterUndo = newTeam_1Points + newTeam_2Points
      
      // Check if this point would have triggered a court switch
      // If so, remove the court switch flag and handle any court switch events
      const setIndex = data.set.index
      const isSet3 = setIndex === 3
      const switchInterval = isSet3 ? 5 : 7
      
      // Check if the point that's being undone was at a switch interval
      if (totalPointsBeforeUndo > 0 && totalPointsBeforeUndo % switchInterval === 0) {
        // Remove the court switch flag for this point total
        const setSwitchKey = `set${setIndex}_switch_${totalPointsBeforeUndo}`
        const match = await db.matches.get(matchId)
        if (match?.[setSwitchKey]) {
          await db.matches.update(matchId, { [setSwitchKey]: false })
        }
        
        // Check if there's a court_switch event that was logged after this point
        // If so, we need to undo the court switch (decrease switch count)
        const pointSeq = lastEvent.seq || 0
        const courtSwitchEvents = data.events.filter(e => 
          e.type === 'court_switch' && 
          e.setIndex === setIndex &&
          (e.seq || 0) > pointSeq
        )
        
        if (courtSwitchEvents.length > 0) {
          // There's a court switch event after this point - undo it
          // Get the most recent court switch event
          const latestCourtSwitch = courtSwitchEvents.sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
          
          // Delete the court switch event
          await db.events.delete(latestCourtSwitch.id)
          
          // Decrease the switch count
          const switchCountKey = `set${setIndex}_switchCount`
          const currentSwitchCount = match?.[switchCountKey] || 0
          if (currentSwitchCount > 0) {
            await db.matches.update(matchId, { [switchCountKey]: currentSwitchCount - 1 })
          }
        }
      }
      
      // Check if this point was at 21 points (TTO trigger for sets 1-2)
      const isSet3ForTTO = setIndex === 3
      if (!isSet3ForTTO && totalPointsBeforeUndo === 21) {
        // Clear the TTO flag so it can be triggered again
        const setTTOKey = `set${setIndex}_tto`
        const match = await db.matches.get(matchId)
        if (match?.[setTTOKey]) {
          await db.matches.update(matchId, { [setTTOKey]: false })
        }
        
        // Check if there's a technical_to event that was logged after this point
        // If so, delete it
        const pointSeq = lastEvent.seq || 0
        const ttoEvents = data.events.filter(e => 
          e.type === 'technical_to' && 
          e.setIndex === setIndex &&
          (e.seq || 0) > pointSeq
        )
        
        for (const ttoEvent of ttoEvents) {
          await db.events.delete(ttoEvent.id)
        }
        
        // Check if there's a court_switch event that was logged after TTO (from TTO completion)
        // If so, undo it
        const courtSwitchAfterTTO = data.events.filter(e => 
          e.type === 'court_switch' && 
          e.setIndex === setIndex &&
          e.payload?.afterTTO === true &&
          (e.seq || 0) > pointSeq
        )
        
        if (courtSwitchAfterTTO.length > 0) {
          // Get the most recent court switch event after TTO
          const latestCourtSwitch = courtSwitchAfterTTO.sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
          
          // Delete the court switch event
          await db.events.delete(latestCourtSwitch.id)
          
          // Decrease the switch count
          const switchCountKey = `set${setIndex}_switchCount`
          const currentSwitchCount = match?.[switchCountKey] || 0
          if (currentSwitchCount > 0) {
            await db.matches.update(matchId, { [switchCountKey]: currentSwitchCount - 1 })
          }
        }
      }
      
      // Beach volleyball: No rotations - players stay on court, only serving changes
      // Point event will be deleted at the end of the function
    }
    
    // If it's an initial lineup, delete it
    if (lastEvent.type === 'lineup' && lastEvent.payload?.isInitial === true) {
      // Simply delete the initial lineup event
      await db.events.delete(lastEvent.id)
      eventAlreadyDeleted = true
    }
    
    // Track if we've already deleted the event (to avoid double deletion)
    let eventAlreadyDeleted = false
    
    // If it's a rally_start, delete it and all subsequent rally_start events (duplicates)
    if (lastEvent.type === 'rally_start') {
      const rallyStartTimestamp = new Date(lastEvent.ts)
      
      // Delete this rally_start
      await db.events.delete(lastEvent.id)
      eventAlreadyDeleted = true
      
      // Delete all other rally_start events that came after this one (duplicates)
      const allRallyStarts = data.events.filter(e => 
        e.type === 'rally_start' && 
        e.setIndex === data.set.index &&
        e.id !== lastEvent.id &&
        new Date(e.ts) >= rallyStartTimestamp
      )
      for (const duplicateRallyStart of allRallyStarts) {
        await db.events.delete(duplicateRallyStart.id)
      }
      
      // If this was the first rally_start (oldest), also undo set_start
      const allRallyStartsSorted = data.events
        .filter(e => e.type === 'rally_start' && e.setIndex === data.set.index && e.id !== lastEvent.id)
        .sort((a, b) => new Date(a.ts) - new Date(b.ts)) // Oldest first
      
      // If there are no other rally_start events, this was the first one
      if (allRallyStartsSorted.length === 0 || 
          (allRallyStartsSorted.length > 0 && new Date(allRallyStartsSorted[0].ts) > rallyStartTimestamp)) {
        // Find the set_start event for this set
        const setStartEvent = data.events.find(e => 
          e.type === 'set_start' && 
          e.setIndex === data.set.index
        )
        if (setStartEvent) {
          await db.events.delete(setStartEvent.id)
        }
      }
    }
    
    // If it's a set_start, delete it
    if (lastEvent.type === 'set_start') {
      await db.events.delete(lastEvent.id)
      eventAlreadyDeleted = true
    }
    
    // If it's a replay, delete it
    if (lastEvent.type === 'replay') {
      await db.events.delete(lastEvent.id)
      eventAlreadyDeleted = true
    }
    
    // If it's a set_end, undo the set completion
    if (lastEvent.type === 'set_end') {
      // Mark the set as not finished
      await db.sets.update(data.set.id, { finished: false })
      
      // Delete the next set if it was created
      const allSets = await db.sets.where('matchId').equals(matchId).toArray()
      const nextSet = allSets.find(s => s.index === data.set.index + 1)
      if (nextSet) {
        // Delete all events for the next set
        await db.events.where('matchId').equals(matchId).and(e => e.setIndex === nextSet.index).delete()
        // Delete the next set
        await db.sets.delete(nextSet.id)
      }
      
      // Update match status back to 'live' if it was set to 'final'
      if (data.match?.status === 'final') {
        await db.matches.update(matchId, { status: 'live' })
      }
      
      await db.events.delete(lastEvent.id)
      eventAlreadyDeleted = true
    }
    
    // If it's a sanction, clear the sanction flag from the match
    if (lastEvent.type === 'sanction' && lastEvent.payload?.team && lastEvent.payload?.type) {
      const teamKey = lastEvent.payload.team
      const sanctionType = lastEvent.payload.type
      const side = (teamKey === 'team_1' && leftIsTeam_1) || (teamKey === 'team_2' && !leftIsTeam_1) ? 'left' : 'right'
      const sideKey = side === 'left' ? 'Left' : 'Right'
      
      // Clear the sanction flag for improper_request and delay_warning
      if (sanctionType === 'improper_request' || sanctionType === 'delay_warning') {
        const currentSanctions = data.match?.sanctions || {}
        const updatedSanctions = { ...currentSanctions }
        const flagKey = `${sanctionType === 'improper_request' ? 'improperRequest' : 'delayWarning'}${sideKey}`
        delete updatedSanctions[flagKey]
        
        await db.matches.update(matchId, {
          sanctions: updatedSanctions
        })
      }
      // Sanction event will be deleted at the end of the function
    }
    
    // Delete the event (if not already deleted by specific handlers)
    if (!eventAlreadyDeleted) {
      await db.events.delete(lastEvent.id)
    }
    
    } catch (error) {
      // Silently handle error
    } finally {
      // Always close the modal
    setUndoConfirm(null)
    }
  }, [undoConfirm, data?.events, data?.set, data?.match, matchId, leftIsTeam_1, getActionDescription])

  const cancelUndo = useCallback(() => {
    setUndoConfirm(null)
  }, [])

  const handleTimeout = useCallback(
    side => {
      const teamKey = mapSideToTeamKey(side)
      const used = (timeoutsUsed && timeoutsUsed[teamKey]) || 0
      if (used >= 2) return
      setTimeoutModal({ team: teamKey, countdown: 60, started: false })
    },
    [mapSideToTeamKey, timeoutsUsed]
  )

  const confirmTimeout = useCallback(async () => {
    if (!timeoutModal) return
    // Log the timeout event
    await logEvent('timeout', { team: timeoutModal.team })
    // Start the timeout countdown
    setTimeoutModal({ ...timeoutModal, started: true })
  }, [timeoutModal, logEvent])

  const cancelTimeout = useCallback(() => {
    // Only cancel if timeout hasn't started yet
    if (!timeoutModal || timeoutModal.started) return
    setTimeoutModal(null)
  }, [timeoutModal])

  const stopTimeout = useCallback(() => {
    // Stop the countdown (close modal) but keep the timeout logged
    setTimeoutModal(null)
  }, [])

  useEffect(() => {
    if (!timeoutModal || !timeoutModal.started) return

    if (timeoutModal.countdown <= 0) {
      // When countdown reaches 0, close the modal
      setTimeoutModal(null)
      return
    }

    const timer = setInterval(() => {
      setTimeoutModal(prev => {
        if (!prev || !prev.started) return null
        const newCountdown = prev.countdown - 1
        if (newCountdown <= 0) {
          // When countdown reaches 0, close the modal
          return null
        }
        return { ...prev, countdown: newCountdown }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeoutModal])

  // Get challenge requests used per team per set
  const getChallengesUsed = useCallback((teamKey) => {
    if (!data?.match || !data?.set) return 0
    const challengeRequests = data.match.challengeRequests || {}
    const setChallenges = challengeRequests[data.set.index] || {}
    return setChallenges[teamKey] || 0
  }, [data?.match, data?.set])

  // Check if challenge can be requested (only when team loses a point, not during rally)
  const canRequestChallenge = useCallback((teamKey) => {
    if (!data?.events || !data?.set || rallyStatus !== 'idle') return false
    
    // Check if team has challenges left (2 per set)
    if (getChallengesUsed(teamKey) >= 2) return false
    
    // Check if last event was a point by the opponent
    const currentSetEvents = data.events
      .filter(e => e.setIndex === data.set.index)
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) return bSeq - aSeq
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })
    
    if (currentSetEvents.length === 0) return false
    const lastEvent = currentSetEvents[0]
    
    // Can only challenge if last event was a point by the opponent
    if (lastEvent.type === 'point' && lastEvent.payload?.team && lastEvent.payload.team !== teamKey) {
      return true
    }
    
    return false
  }, [data?.events, data?.set, rallyStatus, getChallengesUsed])

  const getTimeoutsUsed = useCallback(
    side => {
      const teamKey = mapSideToTeamKey(side)
      return (timeoutsUsed && timeoutsUsed[teamKey]) || 0
    },
    [mapSideToTeamKey, timeoutsUsed]
  )

  

  const handlePlaceholder = message => () => {
    alert(`${message} — coming soon.`)
  }

  // Handle referee BMP request (during rally, no point assigned yet)
  const handleRefereeBMPRequest = useCallback(async () => {
    if (!data?.set || !data?.match) return
    
    const currentServeTeam = getCurrentServe()
    const requestTime = new Date().toISOString()
    
    // Log referee BMP request
    await logEvent('referee_bmp_request', {
      reason: challengeReason,
      score: {
        team_1: data.set.team_1Points,
        team_2: data.set.team_2Points
      },
      set: data.set.index,
      servingTeam: currentServeTeam,
      requestTime: requestTime
    })
    
    // Record referee BMP request data (no team assigned yet, will be determined by outcome)
    const bmpData = {
      type: 'in_progress',
      team: null, // Will be determined by outcome
      reason: challengeReason,
      score: {
        team_1: data.set.team_1Points,
        team_2: data.set.team_2Points
      },
      set: data.set.index,
      servingTeam: currentServeTeam,
      time: requestTime,
      isRefereeInitiated: true
    }
    
    setChallengeModal(bmpData)
  }, [challengeReason, data?.set, data?.match, getCurrentServe, logEvent])

  // Handle challenge request confirmation
  const handleConfirmChallengeRequest = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'request' || !data?.set || !data?.match) return
    
    const { team } = challengeModal
    const currentServeTeam = getCurrentServe()
    const teamLabel = team === teamAKey ? 'A' : 'B'
    const servingTeamLabel = currentServeTeam === teamAKey ? 'A' : 'B'
    
    // Log challenge request as accepted
    await logEvent('challenge_request', {
      team,
      reason: challengeReason,
      status: 'accepted',
      score: {
        team_1: data.set.team_1Points,
        team_2: data.set.team_2Points
      },
      set: data.set.index
    })
    
    // Record challenge request data
    const challengeData = {
      type: 'in_progress',
      team,
      reason: challengeReason,
      score: {
        team_1: data.set.team_1Points,
        team_2: data.set.team_2Points
      },
      set: data.set.index,
      servingTeam: currentServeTeam,
      time: new Date().toISOString(),
      isRefereeInitiated: false,
      // Preserve pending court switch/TTO info if it exists
      pendingCourtSwitch: challengeModal?.pendingCourtSwitch,
      pendingTTO: challengeModal?.pendingTTO
    }
    
    setChallengeModal(challengeData)
  }, [challengeModal, challengeReason, data?.set, data?.match, teamAKey, getCurrentServe, logEvent])

  // Handle challenge request rejection (does NOT decrease available challenges)
  const handleRejectChallengeRequest = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'request' || !data?.set || !data?.match) return
    
    const { team } = challengeModal
    
    // Log the rejection as an event (but do NOT increment challenge count)
    await logEvent('challenge_request', {
      team,
      reason: challengeReason,
      status: 'refused',
      score: {
        team_1: data.set.team_1Points,
        team_2: data.set.team_2Points
      },
      set: data.set.index
    })
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, challengeReason, data?.set, data?.match, logEvent])
  
  // Handle challenge request cancel (just closes modal, doesn't prevent further requests)
  const handleCancelChallengeRequest = useCallback(() => {
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [])

  // Helper function to execute pending court switch or TTO after BMP outcome
  const executePendingCourtSwitchOrTTO = useCallback((challengeModal) => {
    if (!challengeModal) return
    
    const pendingCourtSwitch = challengeModal.pendingCourtSwitch
    const pendingTTO = challengeModal.pendingTTO
    
    if (pendingCourtSwitch) {
      setCourtSwitchModal(pendingCourtSwitch)
    } else if (pendingTTO) {
      setTechnicalTOModal({
        ...pendingTTO,
        countdown: 60,
        started: false
      })
    }
  }, [])

  // Handle team cancels BMP - cancels everything, logs cancellation, does NOT use challenge count
  const handleTeamCancelsBMP = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, isRefereeInitiated } = challengeModal
    const confirmationTime = new Date().toISOString()
    
    // Log the cancellation event
    if (isRefereeInitiated) {
      await logEvent('referee_bmp_outcome', {
        type: 'referee_initiated',
        result: 'cancelled',
        reason: challengeModal.reason,
        requestTime: challengeModal.time,
        confirmationTime: confirmationTime,
        score: challengeModal.score,
        set: data.set.index
      })
    } else {
      await logEvent('challenge_outcome', {
        team,
        reason: challengeModal.reason,
        result: 'cancelled',
        score: challengeModal.score
      })
    }
    
    // Do NOT increment challenge count - challenge is not used
    
    // Execute pending court switch or TTO after BMP cancellation
    executePendingCourtSwitchOrTTO(challengeModal)
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, logEvent, executePendingCourtSwitchOrTTO])
  
  // Handle successful challenge/BMP
  const handleSuccessfulChallenge = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, score, isRefereeInitiated } = challengeModal
    
    if (isRefereeInitiated) {
      // Referee-initiated BMP: assign point to left team (Team A)
      const leftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
      const teamField = leftTeamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
      const currentPoints = data.set[teamField]
      const newPoints = currentPoints + 1
      const confirmationTime = new Date().toISOString()
      
      // Update scores
      await db.sets.update(data.set.id, {
        [teamField]: newPoints
      })
      
      // Add point event for left team
      await logEvent('point', { team: leftTeamKey, fromRefereeBMP: true })
      
      // Log referee BMP outcome with timestamps
      await logEvent('referee_bmp_outcome', {
        type: 'referee_initiated',
        result: 'left',
        reason: challengeModal.reason,
        requestTime: challengeModal.time,
        confirmationTime: confirmationTime,
        originalScore: score,
        newScore: {
          team_1: leftTeamKey === 'team_1' ? newPoints : score.team_1,
          team_2: leftTeamKey === 'team_2' ? newPoints : score.team_2
        },
        set: data.set.index
      })
      
      // Also log as bmp for backward compatibility
      await logEvent('bmp', {
        type: 'referee_initiated',
        result: 'left',
        reason: challengeModal.reason,
        originalScore: score,
        newScore: {
          team_1: leftTeamKey === 'team_1' ? newPoints : score.team_1,
          team_2: leftTeamKey === 'team_2' ? newPoints : score.team_2
        }
      })
    } else {
      // Team-initiated challenge: reverse the last point
    const opponentTeam = team === 'team_1' ? 'team_2' : 'team_1'
    
    // Reverse the last point: remove point from opponent, add point to challenging team
    const opponentField = opponentTeam === 'team_1' ? 'team_1Points' : 'team_2Points'
    const teamField = team === 'team_1' ? 'team_1Points' : 'team_2Points'
    
    // Get current scores
    const currentOpponentPoints = data.set[opponentField]
    const currentTeamPoints = data.set[teamField]
    
    // Reverse: opponent loses a point, team gains a point
    const newOpponentPoints = Math.max(0, currentOpponentPoints - 1)
    const newTeamPoints = currentTeamPoints + 1
    
    // Update scores
    await db.sets.update(data.set.id, {
      [opponentField]: newOpponentPoints,
      [teamField]: newTeamPoints
    })
    
    // Remove the last point event (the one being challenged)
    const pointEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === data.set.index)
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) return bSeq - aSeq
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })
    
    if (pointEvents.length > 0) {
      const lastPointEvent = pointEvents[0]
      await db.events.delete(lastPointEvent.id)
    }
    
    // Add point event for the challenging team
    await logEvent('point', { team, fromChallenge: true })
    
      // Log challenge outcome
      await logEvent('challenge_outcome', {
      team,
      reason: challengeModal.reason,
      result: 'successful',
      originalScore: score,
      newScore: {
        team_1: team === 'team_1' ? newTeamPoints : newOpponentPoints,
        team_2: team === 'team_2' ? newTeamPoints : newOpponentPoints
      }
    })
    }
    
    // Challenge/BMP successful - don't decrement challenge count
    // Execute pending court switch or TTO after BMP outcome
    executePendingCourtSwitchOrTTO(challengeModal)
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, data?.events, leftIsTeam_1, logEvent, executePendingCourtSwitchOrTTO])

  // Handle unsuccessful challenge/BMP
  const handleUnsuccessfulChallenge = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, isRefereeInitiated } = challengeModal
    
    if (isRefereeInitiated) {
      // Referee-initiated BMP: assign point to right team (Team B)
      const rightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
      const teamField = rightTeamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
      const currentPoints = data.set[teamField]
      const newPoints = currentPoints + 1
      const confirmationTime = new Date().toISOString()
      
      // Update scores
      await db.sets.update(data.set.id, {
        [teamField]: newPoints
      })
      
      // Add point event for right team
      await logEvent('point', { team: rightTeamKey, fromRefereeBMP: true })
      
      // Log referee BMP outcome with timestamps
      await logEvent('referee_bmp_outcome', {
        type: 'referee_initiated',
        result: 'right',
        reason: challengeModal.reason,
        requestTime: challengeModal.time,
        confirmationTime: confirmationTime,
        originalScore: challengeModal.score,
        newScore: {
          team_1: rightTeamKey === 'team_1' ? newPoints : challengeModal.score.team_1,
          team_2: rightTeamKey === 'team_2' ? newPoints : challengeModal.score.team_2
        },
        set: data.set.index
      })
      
      // Also log as bmp for backward compatibility
      await logEvent('bmp', {
        type: 'referee_initiated',
        result: 'right',
        reason: challengeModal.reason,
        originalScore: challengeModal.score,
        newScore: {
          team_1: rightTeamKey === 'team_1' ? newPoints : challengeModal.score.team_1,
          team_2: rightTeamKey === 'team_2' ? newPoints : challengeModal.score.team_2
        }
      })
    } else {
      // Team-initiated challenge: log failure and increment challenge count
      // Log challenge outcome
      await logEvent('challenge_outcome', {
      team,
      reason: challengeModal.reason,
      result: 'unsuccessful',
      score: challengeModal.score
    })
    
      // Update challenge requests count (increment by 1 - challenge is used)
    const challengeRequests = data.match.challengeRequests || {}
    const setChallenges = challengeRequests[data.set.index] || {}
    const currentCount = setChallenges[team] || 0
    
    const updatedChallengeRequests = {
      ...challengeRequests,
      [data.set.index]: {
        ...setChallenges,
        [team]: currentCount + 1
      }
    }
    
    await db.matches.update(matchId, {
      challengeRequests: updatedChallengeRequests
    })
    }
    
    // Execute pending court switch or TTO after BMP outcome
    executePendingCourtSwitchOrTTO(challengeModal)
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, matchId, leftIsTeam_1, logEvent, executePendingCourtSwitchOrTTO])
  
  // Handle judgment impossible challenge (keeps score, does NOT decrease available challenges)
  const handleJudgmentImpossibleChallenge = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, isRefereeInitiated } = challengeModal
    const confirmationTime = new Date().toISOString()
    
    if (isRefereeInitiated) {
      // Log referee BMP outcome with timestamps
      await logEvent('referee_bmp_outcome', {
        type: 'referee_initiated',
        result: 'judgment_impossible',
        reason: challengeModal.reason,
        requestTime: challengeModal.time,
        confirmationTime: confirmationTime,
        score: challengeModal.score,
        set: data.set.index
      })
    } else {
      // Log challenge outcome
      await logEvent('challenge_outcome', {
        team,
        reason: challengeModal.reason,
        result: 'judgment_impossible',
        score: challengeModal.score
      })
    }
    
    // Do NOT increment challenge count - challenge is not used
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, logEvent])

  // Handle "Mark Deliberately Altered" - undo last point (replay rally), keep score unvaried, does NOT decrease challenge count
  const handleMarkDeliberatelyAltered = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, isRefereeInitiated, score } = challengeModal
    const confirmationTime = new Date().toISOString()
    
    // Find and undo the last point event
    const pointEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === data.set.index)
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) return bSeq - aSeq
        const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
        const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
        return bTime - aTime
      })
    
    if (pointEvents.length > 0) {
      const lastPointEvent = pointEvents[0]
      const teamKey = lastPointEvent.payload?.team
      
      if (teamKey) {
        // Decrease the score (undo the point)
        const field = teamKey === 'team_1' ? 'team_1Points' : 'team_2Points'
        const currentPoints = data.set[field]
        
        if (currentPoints > 0) {
          await db.sets.update(data.set.id, {
            [field]: currentPoints - 1
          })
        }
        
        // Delete the point event
        await db.events.delete(lastPointEvent.id)
      }
    }
    
    // Log the "Mark Deliberately Altered" event
    if (isRefereeInitiated) {
      await logEvent('referee_bmp_outcome', {
        type: 'referee_initiated',
        result: 'mark_deliberately_altered',
        reason: challengeModal.reason,
        requestTime: challengeModal.time,
        confirmationTime: confirmationTime,
        originalScore: score,
        replayRally: true,
        set: data.set.index
      })
    } else {
      await logEvent('challenge_outcome', {
        team,
        reason: challengeModal.reason,
        result: 'mark_deliberately_altered',
        originalScore: score,
        replayRally: true
      })
    }
    
    // Do NOT increment challenge count - challenge is not used
    
    // Execute pending court switch or TTO after BMP outcome
    executePendingCourtSwitchOrTTO(challengeModal)
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, data?.events, logEvent, executePendingCourtSwitchOrTTO])

  // Check if there was a point change between two events
  const hasPointChangeBetween = useCallback((event1Index, event2Index, setIndex) => {
    if (!data?.events) return false
    const setEvents = data.events.filter(e => (e.setIndex || 1) === setIndex).sort((a, b) => new Date(a.ts) - new Date(b.ts))
    
    let pointsBefore = { team_1: 0, team_2: 0 }
    let pointsAfter = { team_1: 0, team_2: 0 }
    
    for (let i = 0; i < setEvents.length; i++) {
      const e = setEvents[i]
      if (e.type === 'point') {
        if (e.payload?.team === 'team_1') pointsAfter.team_1++
        else if (e.payload?.team === 'team_2') pointsAfter.team_2++
      }
      
      if (i === event1Index) {
        pointsBefore = { ...pointsAfter }
      }
      if (i === event2Index) {
        break
      }
    }
    
    return pointsBefore.team_1 !== pointsAfter.team_1 || pointsBefore.team_2 !== pointsAfter.team_2
  }, [data?.events])

  
 

  // Handle player click for sanction (only when rally is not in play)
  const handlePlayerClick = useCallback((teamKey, position, playerNumber, event) => {
    // Prevent event bubbling
    event.stopPropagation()
    event.preventDefault()
    
    // Only allow when rally is not in play
    if (rallyStatus !== 'idle') return
    
    // For beach volleyball, we need at least position to identify the player
      if (!position) return
    
    // Normalize playerNumber - convert to number or null
    const normalizedPlayerNumber = (playerNumber !== null && playerNumber !== undefined && playerNumber !== '') 
      ? (typeof playerNumber === 'string' ? (playerNumber.trim() === '' ? null : Number(playerNumber)) : Number(playerNumber))
      : null
    
    // Get the clicked element position (the circle)
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    
    // Calculate center of the circle
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    // Calculate radius (half the width/height)
    const radius = rect.width / 2
    
    // Offset to move menu from the circle
    const offset = radius + 30 // Add 30px extra spacing
    
    // Close menu if it's already open for this player
    const isSamePlayer = playerActionMenu?.position === position && 
                        playerActionMenu?.team === teamKey &&
                        ((playerActionMenu?.playerNumber === normalizedPlayerNumber) || 
                         (playerActionMenu?.playerNumber === null && normalizedPlayerNumber === null))
    
    if (isSamePlayer) {
      setPlayerActionMenu(null)
      return
    }
    
    // Show action menu (only for sanctions in beach volleyball)
    setPlayerActionMenu({
      team: teamKey,
      position,
      playerNumber: normalizedPlayerNumber,
      element,
      x: centerX + offset,
      y: centerY
    })
  }, [rallyStatus, playerActionMenu])

  

 

  // Handle forfait - award points/sets to opponent
  // For beach volleyball:
  // - Expulsion: team loses current set only
  // - Disqualification: team loses match (all remaining sets)
  const handleForfait = useCallback(async (teamKey, reason) => {
    if (!data?.set || !data?.match) return
    
    const opponentKey = teamKey === 'team_1' ? 'team_2' : 'team_1'
    const allSets = await db.sets.where({ matchId }).sortBy('index')
    const currentSetIndex = data.set.index
    const isDecidingSet = currentSetIndex === 3
    const pointsToWin = isDecidingSet ? 15 : 21
    
    // Determine if this is a match forfait (disqualification) or set forfait (expulsion)
    const isMatchForfait = reason === 'disqualification'
    const isSetForfait = reason === 'expulsion'
    
    // Award current set to opponent
    const currentSet = allSets.find(s => s.index === currentSetIndex)
    if (currentSet && !currentSet.finished) {
      const opponentPoints = pointsToWin
      const teamPoints = currentSet[teamKey === 'team_1' ? 'team_1Points' : 'team_2Points']
      const currentOpponentPoints = currentSet[opponentKey === 'team_1' ? 'team_1Points' : 'team_2Points']
      
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
        [opponentKey === 'team_1' ? 'team_1Points' : 'team_2Points']: opponentPoints,
        [teamKey === 'team_1' ? 'team_1Points' : 'team_2Points']: teamPoints
      })
      
      // Log set end
      await logEvent('set_end', {
        team: opponentKey,
        setIndex: currentSetIndex,
        team_1Points: opponentKey === 'team_1' ? opponentPoints : teamPoints,
        team_2Points: opponentKey === 'team_2' ? opponentPoints : teamPoints,
        reason: 'forfait'
      })
    }
    
    // Only award remaining sets if this is a match forfait (disqualification)
    if (isMatchForfait) {
      // Award all remaining sets to opponent
      const remainingSets = allSets.filter(s => s.index > currentSetIndex && !s.finished)
      for (const set of remainingSets) {
        const setPointsToWin = set.index === 3 ? 15 : 21
        await db.sets.update(set.id, {
          finished: true,
          [opponentKey === 'team_1' ? 'team_1Points' : 'team_2Points']: setPointsToWin,
          [teamKey === 'team_1' ? 'team_1Points' : 'team_2Points']: 0
        })
        
        await logEvent('set_end', {
          team: opponentKey,
          setIndex: set.index,
          team_1Points: opponentKey === 'team_1' ? setPointsToWin : 0,
          team_2Points: opponentKey === 'team_2' ? setPointsToWin : 0,
          reason: 'forfait'
        })
      }
      
      // Mark match as final
      await db.matches.update(matchId, { status: 'final' })
      
    }
    
    // Log forfait event
    await logEvent('forfait', {
      team: teamKey,
      reason: reason,
      setIndex: currentSetIndex,
      isMatchForfait: isMatchForfait,
      isSetForfait: isSetForfait
    })
  }, [data?.set, data?.match, matchId, logEvent])

  // Handle forfait with detailed information
  const handleForfaitWithDetails = useCallback(async (forfaitData) => {
    if (!matchId || !data?.match) return
    
    const { type, team, playerNumber, setIndex, time, score, mtoRitDuration, remarks } = forfaitData
    
    // Build remark text based on type
    let remarkText = ''
    const teamName = team === 'team_1' ? (data.team_1Team?.name || 'Team 1') : (data.team_2Team?.name || 'Team 2')
    
    if (type === 'injury_before') {
      remarkText = `Team ${teamName} forfeits the match due to ${remarks || '(injury as confirmed by the official medical personnel)'} of player #${playerNumber || 'N/A'}. Appropriate official medical personnel came to the court. Both teams and players were present.`
    } else if (type === 'injury_during') {
      const timeStr = time || new Date().toLocaleTimeString()
      const setStr = setIndex ? `set ${setIndex}` : 'current set'
      const scoreStr = score || `${data?.set?.team_1Points || 0}:${data?.set?.team_2Points || 0}`
      const servingTeam = data?.set ? getCurrentServe() : null
      const servingTeamName = servingTeam === 'team_1' ? (data.team_1Team?.name || 'Team 1') : (data.team_2Team?.name || 'Team 2')
      remarkText = `At ${timeStr} time, ${setStr}, ${scoreStr} score, team ${servingTeamName} serving, team ${teamName} forfeits the match due to ${remarks || '(injury as confirmed by the official medical personnel' + (mtoRitDuration ? `; MTO/RIT duration: ${mtoRitDuration}` : '') + ')'} of player #${playerNumber || 'N/A'}.`
    } else if (type === 'no_show') {
      remarkText = `Team ${teamName} forfeits the match due to no show.`
    }
    
    // Append to existing remarks
    const existingRemarks = data.match.remarks || ''
    const newRemarks = existingRemarks ? `${existingRemarks}\n\n${remarkText}` : remarkText
    await db.matches.update(matchId, { remarks: newRemarks })
    
    // If forfait before match start, complete match with defaults
    if (type === 'injury_before' || type === 'no_show') {
      // Set team A as the complete team (default)
      const completeTeamKey = 'team_1' // Default to team_1 as team A
      const forfaitTeamKey = team
      
      // Award all sets to complete team
      const allSets = await db.sets.where({ matchId }).sortBy('index')
      for (const set of allSets) {
        const pointsToWin = set.index === 3 ? 15 : 21
        await db.sets.update(set.id, {
          finished: true,
          [completeTeamKey === 'team_1' ? 'team_1Points' : 'team_2Points']: pointsToWin,
          [forfaitTeamKey === 'team_1' ? 'team_1Points' : 'team_2Points']: 0
        })
        
        await logEvent('set_end', {
          team: completeTeamKey,
          setIndex: set.index,
          team_1Points: completeTeamKey === 'team_1' ? pointsToWin : 0,
          team_2Points: completeTeamKey === 'team_2' ? pointsToWin : 0,
          reason: 'forfait'
        })
      }
      
      // Set coin toss winner to complete team (default)
      const coinTossData = data.match.coinTossData || {}
      const updatedCoinTossData = { ...coinTossData }
      if (!updatedCoinTossData.winner) {
        updatedCoinTossData.winner = completeTeamKey === 'team_1' ? 'teamA' : 'teamB'
      }
      
      // Set service order to 1-2 if not available
      if (!updatedCoinTossData.players) {
        // Initialize with default service order
        updatedCoinTossData.players = {
          teamA: {
            player1: { number: 1, serviceOrder: 1 },
            player2: { number: 2, serviceOrder: 2 }
          },
          teamB: {
            player1: { number: 1, serviceOrder: 1 },
            player2: { number: 2, serviceOrder: 2 }
          }
        }
      }
      
      await db.matches.update(matchId, { coinTossData: updatedCoinTossData })
      
      // Mark match as final
      await db.matches.update(matchId, { status: 'final' })
    } else {
      // Forfait during match - use existing handleForfait logic
      await handleForfait(team, 'injury')
    }
    
    // Log forfait event
    await logEvent('forfait', {
      team,
      type,
      playerNumber,
      setIndex,
      time,
      score,
      mtoRitDuration,
      remarks: remarkText
    })
    
    setForfaitModal(null)
    setShowRemarks(true) // Open remarks to show the added text
  }, [data?.match, data?.set, data?.team_1Team, data?.team_2Team, matchId, logEvent, handleForfait, getCurrentServe])

  // Common modal position - all modals use the same position
  const getCommonModalPosition = useCallback((element, menuX, menuY) => {
    const rect = element?.getBoundingClientRect?.()
    if (rect) {
      return {
        x: rect.right + 30,
        y: rect.top + rect.height / 2
      }
    }
    return {
      x: menuX + 30,
      y: menuY
    }
  }, [])

  

  // Open sanction modal from action menu
  const openSanctionFromMenu = useCallback(() => {
    if (!playerActionMenu) return
    const { team, position, playerNumber, element } = playerActionMenu
    const pos = getCommonModalPosition(element, playerActionMenu.x, playerActionMenu.y)
    setSanctionDropdown({
      team,
      type: 'player',
      playerNumber,
      position,
      element,
      x: pos.x,
      y: pos.y
    })
    setPlayerActionMenu(null)
  }, [playerActionMenu, getCommonModalPosition])

  // Open MTO/RIT submenu from player action menu
  const openMtoRitFromMenu = useCallback(() => {
    if (!playerActionMenu) return
    const { team, position, playerNumber, element } = playerActionMenu
    const pos = getCommonModalPosition(element, playerActionMenu.x, playerActionMenu.y)
    setInjuryDropdown({
      team,
      position,
      playerNumber,
      element,
      x: pos.x,
      y: pos.y
    })
        setPlayerActionMenu(null)
  }, [playerActionMenu, getCommonModalPosition])

  // Check if player has already used RIT (one per player per match)
  const hasPlayerUsedRit = useCallback((teamKey, playerNumber) => {
    if (!data?.events) return false
    return data.events.some(e => 
      e.type === 'mto_rit' && 
      (e.payload?.type === 'rit_no_blood' || e.payload?.type === 'rit_weather' || e.payload?.type === 'rit_toilet') &&
      e.payload?.team === teamKey &&
      e.payload?.playerNumber === playerNumber
    )
  }, [data?.events])

  // Handle MTO/RIT selection
  const handleMtoRitSelection = useCallback((type) => {
    if (!injuryDropdown || !data?.set) return
    
    const { team, position, playerNumber } = injuryDropdown
    
    // Check RIT limit (one per player per match)
    const isRit = type !== 'mto_blood'
    if (isRit && hasPlayerUsedRit(team, playerNumber)) {
      // Show error - RIT already used
      alert(`Player #${playerNumber} has already used their RIT for this match.`)
        setInjuryDropdown(null)
      return
    }
    
    // Show confirmation modal
    setMtoRitConfirmModal({
      team,
      position,
      playerNumber,
      type
    })
    setInjuryDropdown(null)
  }, [injuryDropdown, data?.set, hasPlayerUsedRit])

  // Confirm MTO/RIT and start countdown
  const confirmMtoRit = useCallback(async () => {
    if (!mtoRitConfirmModal || !data?.set || !matchId) return
    
    const { team, position, playerNumber, type } = mtoRitConfirmModal
    const currentTime = new Date().toISOString()
    const setIndex = data.set.index
    const team_1Points = data.set.team_1Points || 0
    const team_2Points = data.set.team_2Points || 0
    
    // Log the MTO/RIT event
    await logEvent('mto_rit', {
      team,
      position,
      playerNumber,
      type,
      setIndex,
      team_1Points,
      team_2Points,
      startTime: currentTime
    })
    
    // Start countdown modal
    setMtoRitCountdownModal({
      team,
      position,
      playerNumber,
      type,
      countdown: 300, // 5 minutes = 300 seconds
      started: true,
      startTime: currentTime,
      setIndex,
      team_1Points,
      team_2Points
    })
    
    setMtoRitConfirmModal(null)
  }, [mtoRitConfirmModal, data?.set, matchId, logEvent])

  // Cancel MTO/RIT confirmation
  const cancelMtoRitConfirm = useCallback(() => {
    setMtoRitConfirmModal(null)
  }, [])

  // Stop MTO/RIT countdown (with confirmation)
  const stopMtoRitCountdown = useCallback(() => {
    if (!mtoRitCountdownModal) return
    if (window.confirm('Stop the countdown? You can still record recovery or forfait.')) {
      setMtoRitCountdownModal(prev => prev ? { ...prev, started: false } : null)
    }
  }, [mtoRitCountdownModal])

  // Handle player recovered
  const handlePlayerRecovered = useCallback(async () => {
    if (!mtoRitCountdownModal || !matchId) return
    
    const { team, position, playerNumber, type, startTime, setIndex, team_1Points, team_2Points } = mtoRitCountdownModal
    const endTime = new Date().toISOString()
    const duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000) // seconds
    
    // Log recovery event
    await logEvent('mto_rit_recovery', {
      team,
      position,
      playerNumber,
      type,
      setIndex,
      team_1Points,
      team_2Points,
      startTime,
      endTime,
      duration
    })
    
    setMtoRitCountdownModal(null)
  }, [mtoRitCountdownModal, matchId, logEvent])

  // Handle player not recovered (forfait)
  const handlePlayerNotRecovered = useCallback(async () => {
    if (!mtoRitCountdownModal || !data?.set) return
    const { team } = mtoRitCountdownModal
    setMtoRitCountdownModal(null)
        await handleForfait(team, 'injury')
  }, [mtoRitCountdownModal, data?.set, handleForfait])

  // Cancel injury dropdown
  const cancelInjury = useCallback(() => {
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

  // Get player's current highest sanction (for beach volleyball: per set, not per match)
  const getPlayerSanctionLevel = useCallback((teamKey, playerNumber) => {
    if (!data?.events || !data?.set) return null
    
    // Get all FORMAL sanctions for this player in THIS SET (beach volleyball: resets each set)
    // NOTE: delay_warning and delay_penalty are SEPARATE from the formal escalation path
    // A player can have delay warnings AND formal warnings independently
    const playerSanctions = data.events.filter(e => 
      e.type === 'sanction' && 
      e.setIndex === data.set.index &&
      e.payload?.team === teamKey &&
      e.payload?.playerNumber === playerNumber &&
      ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type) || e.payload?.type === 'rude_conduct' // rude_conduct is treated as penalty
    )
    
    if (playerSanctions.length === 0) return null
    
    // Return the highest sanction level
    // Note: rude_conduct is treated as penalty (same level)
    const levels = { warning: 1, penalty: 2, rude_conduct: 2, expulsion: 3, disqualification: 4 }
    const highest = playerSanctions.reduce((max, s) => {
      const level = levels[s.payload?.type] || 0
      return level > max ? level : max
    }, 0)
    
    return Object.keys(levels).find(key => levels[key] === highest)
  }, [data?.events, data?.set])
  
  // Get penalty count for a player in current set (beach volleyball: max 2 per set)
  // Includes both 'penalty' and 'rude_conduct' (they are the same penalty)
  const getPlayerPenaltyCount = useCallback((teamKey, playerNumber) => {
    if (!data?.events || !data?.set) return 0
    
    const penalties = data.events.filter(e => 
      e.type === 'sanction' && 
      e.setIndex === data.set.index &&
      e.payload?.team === teamKey &&
      e.payload?.playerNumber === playerNumber &&
      (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
    )
    
    return penalties.length
  }, [data?.events, data?.set])

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

  // Helper to get sanction flags for the team currently on the left side
  const getLeftTeamSanctions = useMemo(() => {
    if (!data?.events) return { improperRequest: false, delayWarning: false }
    const leftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
    // Check events to see if this team has these sanctions
    const leftTeamHasImproperRequest = data.events.some(e => 
      e.type === 'sanction' && 
      e.payload?.team === leftTeamKey &&
      e.payload?.type === 'improper_request'
    ) || false
    const leftTeamHasDelayWarning = data.events.some(e => 
      e.type === 'sanction' && 
      e.payload?.team === leftTeamKey &&
      e.payload?.type === 'delay_warning'
    ) || false
    
    return {
      improperRequest: leftTeamHasImproperRequest,
      delayWarning: leftTeamHasDelayWarning
    }
  }, [data?.events, leftIsTeam_1])

  // Helper to get sanction flags for the team currently on the right side
  const getRightTeamSanctions = useMemo(() => {
    if (!data?.events) return { improperRequest: false, delayWarning: false }
    const rightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
    // Check events to see if this team has these sanctions
    const rightTeamHasImproperRequest = data.events.some(e => 
      e.type === 'sanction' && 
      e.payload?.team === rightTeamKey &&
      e.payload?.type === 'improper_request'
    ) || false
    const rightTeamHasDelayWarning = data.events.some(e => 
      e.type === 'sanction' && 
      e.payload?.team === rightTeamKey &&
      e.payload?.type === 'delay_warning'
    ) || false
    
    return {
      improperRequest: rightTeamHasImproperRequest,
      delayWarning: rightTeamHasDelayWarning
    }
  }, [data?.events, leftIsTeam_1])

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
        const isFormalSanction = ['warning', 'penalty', 'expulsion', 'disqualification'].includes(e.payload?.type) || e.payload?.type === 'rude_conduct' // rude_conduct is treated as penalty
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
    

    if ((sanctionType === 'expulsion' || sanctionType === 'disqualification') && type === 'player' && playerNumber && position) {
      // Log the sanction event first
      await logEvent('sanction', {
        team,
        type: sanctionType,
        playerType: type,
        playerNumber,
        position,
        role
      })
      
     
      
      // Close the confirmation modal
      setSanctionConfirmModal(null)
      
      // Beach volleyball: Expulsion/disqualification results in forfait
          await handleForfait(team, sanctionType === 'expulsion' ? 'expulsion' : 'disqualification')
    } else if (sanctionType === 'expulsion' || sanctionType === 'disqualification') {
      // Expulsion/disqualification - just log the sanction
      await logEvent('sanction', {
        team,
        type: sanctionType,
        playerType: type,
        playerNumber,
        position,
        role
      })
      
      setSanctionConfirmModal(null)
      

    } else {
      // Regular sanction (warning, penalty, expulsion, disqualification)
      // Note: rude_conduct is treated as penalty - convert it to penalty
      const actualSanctionType = sanctionType === 'rude_conduct' ? 'penalty' : sanctionType
      
      // For beach volleyball: Check penalty count per player per SET (max 2 per set)
      // This includes both 'penalty' and 'rude_conduct' (they are the same)
      // IMPORTANT: Penalties reset each set - a player can have up to 2 penalties per set
      if (actualSanctionType === 'penalty' && type === 'player' && playerNumber) {
        // Count penalties for this player in THIS SET ONLY (including rude_conduct)
        const playerPenalties = (data?.events || []).filter(e => 
          e.type === 'sanction' &&
          e.setIndex === data.set.index && // Only count penalties in current set
          e.payload?.team === team &&
          e.payload?.playerNumber === playerNumber &&
          (e.payload?.type === 'penalty' || e.payload?.type === 'rude_conduct')
        )
        
        // If player already has 2 penalties in this set, this should be an expulsion instead
        if (playerPenalties.length >= 2) {
          // Auto-upgrade to expulsion
          await logEvent('sanction', {
            team,
            type: 'expulsion',
            playerType: type,
            playerNumber,
            position,
            role,
            fromPenalty: true // Mark that this expulsion came from 3rd penalty
          })
          
          setSanctionConfirmModal(null)
          
          // Beach volleyball: Expulsion results in forfait
          await handleForfait(team, 'expulsion')
          return
        }
      }
      
      // Log the sanction event (convert rude_conduct to penalty)
      await logEvent('sanction', {
        team,
        type: actualSanctionType,
        playerType: type,
        playerNumber,
        position,
        role
      })
      
      // If penalty (including rude_conduct), award point to the other team and cause loss of service
      if (actualSanctionType === 'penalty') {
        setSanctionConfirmModal(null)
        
        // Award point to the other team (this automatically causes loss of service if serving)
        const otherTeam = team === 'team_1' ? 'team_2' : 'team_1'
        const otherSide = mapTeamKeyToSide(otherTeam)
        await handlePoint(otherSide, 'misconduct_penalty')
        
        // Note: handlePoint already handles service change when the other team scores
        // So if the sanctioned team was serving, service is automatically lost
      } else {
        setSanctionConfirmModal(null)
      }
    }
  }, [sanctionConfirmModal, data?.set, data?.events, logEvent, mapTeamKeyToSide, handlePoint, leftIsTeam_1, getCurrentServe, handleForfait])

 

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
  const refereeConnectionEnabled = data?.match?.refereeConnectionEnabled !== false
  const team_1TeamConnectionEnabled = data?.match?.team_1TeamConnectionEnabled !== false
  const team_2TeamConnectionEnabled = data?.match?.team_2TeamConnectionEnabled !== false

  // Check if teams are connected (heartbeat within last 15 seconds)
  const isTeam_1Connected = useMemo(() => {
    if (!data?.match?.lastTeam_1Heartbeat) return false
    const lastHeartbeat = new Date(data.match.lastTeam_1Heartbeat).getTime()
    const currentTime = new Date().getTime()
    return (currentTime - lastHeartbeat) < 15000 // 15 seconds threshold
  }, [data?.match?.lastTeam_1Heartbeat, now])

  const isTeam_2Connected = useMemo(() => {
    if (!data?.match?.lastTeam_2Heartbeat) return false
    const lastHeartbeat = new Date(data.match.lastTeam_2Heartbeat).getTime()
    const currentTime = new Date().getTime()
    return (currentTime - lastHeartbeat) < 15000 // 15 seconds threshold
  }, [data?.match?.lastTeam_2Heartbeat, now])

  // Helper function to get connection status and color for individual referees
  const getRefereeStatus = useCallback((refereeNumber) => {
    if (!refereeConnectionEnabled) {
      return { status: 'disabled', color: '#6b7280' } // grey
    }
    const isConnected = refereeNumber === 1 ? isReferee1Connected : isReferee2Connected
    if (isConnected) {
      return { status: 'connected', color: '#22c55e' } // green
    }
    // Enabled but not connected
    return { status: 'not_connected', color: '#eab308' } // yellow
  }, [refereeConnectionEnabled, isReferee1Connected, isReferee2Connected])

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
    } else if (type === 'teamA') {
      if (!team_1TeamConnectionEnabled) {
        return { status: 'disabled', color: '#6b7280' } // grey
      }
      const hasPin = !!data?.match?.team_1Pin
      if (!hasPin) {
        return { status: 'error', color: '#ef4444' } // red - no PIN configured
      }
      if (isTeam_1Connected) {
        return { status: 'connected', color: '#22c55e' } // green
      }
      // Enabled, has PIN, but not connected
      return { status: 'not_connected', color: '#eab308' } // yellow
    } else if (type === 'teamB') {
      if (!team_2TeamConnectionEnabled) {
        return { status: 'disabled', color: '#6b7280' } // grey
      }
      const hasPin = !!data?.match?.team_2Pin
      if (!hasPin) {
        return { status: 'error', color: '#ef4444' } // red - no PIN configured
      }
      if (isTeam_2Connected) {
        return { status: 'connected', color: '#22c55e' } // green
      }
      // Enabled, has PIN, but not connected
      return { status: 'not_connected', color: '#eab308' } // yellow
    }
    return { status: 'error', color: '#ef4444' } // red - unknown
  }, [refereeConnectionEnabled, isReferee1Connected, isReferee2Connected, team_1TeamConnectionEnabled, team_2TeamConnectionEnabled, isTeam_1Connected, isTeam_2Connected, data?.match])

  const callReferee = useCallback(async () => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, {
        refereeCallActive: true
      })
    } catch (error) {
      // Silently handle error
    }
  }, [matchId])

  const handleRefereeConnectionToggle = useCallback(async (enabled) => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, { refereeConnectionEnabled: enabled })
    } catch (error) {
      // Silently handle error
    }
  }, [matchId])

  const handleTeam_1ConnectionToggle = useCallback(async (enabled) => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, { team_1TeamConnectionEnabled: enabled })
    } catch (error) {
      // Silently handle error
    }
  }, [matchId])

  const handleTeam_2ConnectionToggle = useCallback(async (enabled) => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, { team_2TeamConnectionEnabled: enabled })
    } catch (error) {
      // Silently handle error
    }
  }, [matchId])

  const handleEditPin = useCallback((type = 'referee') => {
    let currentPin = ''
    if (type === 'referee') {
      currentPin = data?.match?.refereePin || ''
    } else if (type === 'teamA') {
      currentPin = data?.match?.team_1Pin || ''
    } else if (type === 'teamB') {
      currentPin = data?.match?.team_2Pin || ''
    }
    setNewPin(currentPin)
    setPinError('')
    setEditPinType(type)
    setEditPinModal(true)
  }, [data?.match?.refereePin, data?.match?.team_1TeamPin, data?.match?.team_2TeamPin])

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
      let updateField = {}
      if (editPinType === 'referee') {
        updateField = { refereePin: newPin }
      } else if (editPinType === 'teamA') {
        updateField = { team_1TeamPin: newPin }
      } else if (editPinType === 'teamB') {
        updateField = { team_2Pin: newPin }
      }
      await db.matches.update(matchId, updateField)
      setEditPinModal(false)
      setPinError('')
      setEditPinType(null)
    } catch (error) {
      setPinError('Failed to save PIN')
    }
  }, [matchId, newPin, editPinType])

  const confirmCourtSwitch = useCallback(async () => {
    if (!courtSwitchModal || !matchId || !data?.set) return
    
    // Track the court switch in the match
    const match = await db.matches.get(matchId)
    if (!match) return
    
    // Get current set data to ensure we have the latest scores
    const currentSet = await db.sets.get(courtSwitchModal.set.id)
    if (!currentSet) return
    
    // Get current switch count
    const setIndex = courtSwitchModal.set.index
    const totalPoints = (currentSet.team_1Points || 0) + (currentSet.team_2Points || 0)
    const switchCountKey = `set${setIndex}_switchCount`
    const currentSwitchCount = match[switchCountKey] || 0
    
    // Calculate expected switch number based on points
    const isSet3 = setIndex === 3
    const switchInterval = isSet3 ? 5 : 7
    const expectedSwitchCount = Math.floor(totalPoints / switchInterval)
    
    // Only increment if we haven't already switched for this point total
    // This prevents double-switching if the modal is confirmed multiple times
    if (currentSwitchCount < expectedSwitchCount) {
      // Increment the switch count by 1 - this will flip the teams
      // Each increment flips the teams (odd = flipped, even = base)
      const newSwitchCount = currentSwitchCount + 1
      
      // NOW actually switch the courts by updating the switch count
      // This is what causes the visual court switch
    await db.matches.update(matchId, { 
        [switchCountKey]: newSwitchCount 
    })
    
    // Log court switch as an event
    await logEvent('court_switch', {
      setIndex: setIndex,
      totalPoints: totalPoints,
        team_1Points: currentSet.team_1Points || 0,
        team_2Points: currentSet.team_2Points || 0,
        switchNumber: newSwitchCount
      })
    }
    
    // Mark that the switch was confirmed (not just the modal shown)
    const setSwitchConfirmedKey = `set${setIndex}_switch_confirmed_${totalPoints}`
    await db.matches.update(matchId, { 
      [setSwitchConfirmedKey]: true 
    })
    
    // Close the modal
    setCourtSwitchModal(null)
  }, [courtSwitchModal, matchId, data?.set, logEvent])
  
  const confirmTechnicalTO = useCallback(async () => {
    if (!technicalTOModal || !data?.set) return
    
    // Log TTO as an event
    await logEvent('technical_to', {
      setIndex: technicalTOModal.set.index,
      team_1Points: technicalTOModal.team_1Points,
      team_2Points: technicalTOModal.team_2Points,
      totalPoints: technicalTOModal.team_1Points + technicalTOModal.team_2Points
    })
    
    // Start the 60 second countdown
    setTechnicalTOModal({
      ...technicalTOModal,
      countdown: 60,
      started: true
    })
  }, [technicalTOModal, data?.set, logEvent])
  
  // Handle TTO countdown
  useEffect(() => {
    if (technicalTOModal?.started && technicalTOModal.countdown > 0) {
      const timer = setInterval(() => {
        setTechnicalTOModal(prev => {
          if (!prev || prev.countdown <= 1) {
            // Countdown finished, switch courts and close TTO modal
            if (prev && matchId && data?.set) {
              // Perform court switch after TTO (async operation)
              ;(async () => {
                // Get current set data to ensure we have the latest scores
                const currentSet = await db.sets.get(prev.set.id)
                if (currentSet) {
              // Perform court switch after TTO
              const setIndex = prev.set.index
                  const totalPoints = (currentSet.team_1Points || 0) + (currentSet.team_2Points || 0)
                  
                  // Get current switch count
                  const match = await db.matches.get(matchId)
                  const switchCountKey = `set${setIndex}_switchCount`
                  const currentSwitchCount = match?.[switchCountKey] || 0
                  
                  // Calculate expected switch number based on points
              const isSet3 = setIndex === 3
              const switchInterval = isSet3 ? 5 : 7
                  const expectedSwitchCount = Math.floor(totalPoints / switchInterval)
                  
                  // Only increment if we haven't already switched for this point total
                  if (currentSwitchCount < expectedSwitchCount) {
                    // Increment the switch count by 1 - this will flip the teams
                    const newSwitchCount = currentSwitchCount + 1
              
              // Store the number of switches for this set (THIS ACTUALLY SWITCHES THE COURTS VISUALLY)
                    await db.matches.update(matchId, { 
                      [switchCountKey]: newSwitchCount 
                    })
              
              // Log court switch as an event
                    await logEvent('court_switch', {
                setIndex: setIndex,
                totalPoints: totalPoints,
                      team_1Points: currentSet.team_1Points || 0,
                      team_2Points: currentSet.team_2Points || 0,
                      switchNumber: newSwitchCount,
                afterTTO: true
                    })
                  }
                }
              })().catch(() => {})
            }
            return null
          }
          return {
            ...prev,
            countdown: prev.countdown - 1
          }
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [technicalTOModal?.started, technicalTOModal?.countdown, matchId, data?.set, logEvent])
  
  // Handle MTO/RIT countdown
  useEffect(() => {
    if (mtoRitCountdownModal?.started && mtoRitCountdownModal.countdown > 0) {
      const timer = setInterval(() => {
        setMtoRitCountdownModal(prev => {
          if (!prev || !prev.started || prev.countdown <= 0) {
            return prev
          }
          return {
            ...prev,
            countdown: prev.countdown - 1
          }
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [mtoRitCountdownModal?.started, mtoRitCountdownModal?.countdown])
  
  // Handle set transition countdown
  useEffect(() => {
    if (setTransitionModal && setTransitionCountdown > 0) {
      const timer = setInterval(() => {
        setSetTransitionCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [setTransitionModal, setTransitionCountdown])
  
  const stopTechnicalTO = useCallback(async () => {
    if (!technicalTOModal || !matchId || !data?.set) return
    
    // Get current set data to ensure we have the latest scores
    const currentSet = await db.sets.get(technicalTOModal.set.id)
    if (!currentSet) {
      setTechnicalTOModal(null)
      return
    }
    
    // Switch courts after TTO
    const setIndex = technicalTOModal.set.index
    const totalPoints = (currentSet.team_1Points || 0) + (currentSet.team_2Points || 0)
    
    // Get current switch count
    const match = await db.matches.get(matchId)
    const switchCountKey = `set${setIndex}_switchCount`
    const currentSwitchCount = match?.[switchCountKey] || 0
    
    // Calculate expected switch number based on points
    const isSet3 = setIndex === 3
    const switchInterval = isSet3 ? 5 : 7
    const expectedSwitchCount = Math.floor(totalPoints / switchInterval)
    
    // Only increment if we haven't already switched for this point total
    if (currentSwitchCount < expectedSwitchCount) {
      // Increment the switch count by 1 - this will flip the teams
      const newSwitchCount = currentSwitchCount + 1
      
      // Store the number of switches for this set (THIS ACTUALLY SWITCHES THE COURTS VISUALLY)
      await db.matches.update(matchId, { 
        [switchCountKey]: newSwitchCount 
      })
      
      // Log court switch as an event
      await logEvent('court_switch', {
        setIndex: setIndex,
        totalPoints: totalPoints,
        team_1Points: currentSet.team_1Points || 0,
        team_2Points: currentSet.team_2Points || 0,
        switchNumber: newSwitchCount,
        afterTTO: true
      })
    }
    
    // Stop countdown and close TTO modal
    setTechnicalTOModal(null)
  }, [technicalTOModal, matchId, data?.set, logEvent])
  
  const cancelTechnicalTO = useCallback(async () => {
    if (!technicalTOModal || !data?.events || !matchId) return
    
    // Undo the last point that caused the TTO
    const sortedEvents = [...data.events].sort((a, b) => {
      const aSeq = a.seq || 0
      const bSeq = b.seq || 0
      if (aSeq !== 0 || bSeq !== 0) {
        return bSeq - aSeq
      }
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return bTime - aTime
    })
    
    const lastEvent = sortedEvents[0]
    if (lastEvent) {
      // Delete the last event
      await db.events.delete(lastEvent.id)
      
      // Update set points
      const newTeam_1Points = technicalTOModal.teamThatScored === 'team_1' 
        ? technicalTOModal.team_1Points - 1 
        : technicalTOModal.team_1Points
      const newTeam_2Points = technicalTOModal.teamThatScored === 'team_2' 
        ? technicalTOModal.team_2Points - 1 
        : technicalTOModal.team_2Points
      
      await db.sets.update(technicalTOModal.set.id, {
        team_1Points: newTeam_1Points,
        team_2Points: newTeam_2Points
      })
      
      // Undo the TTO flag
      const setTTOKey = `set${technicalTOModal.set.index}_tto`
      await db.matches.update(matchId, { 
        [setTTOKey]: false 
      })
    }
    
    setTechnicalTOModal(null)
  }, [technicalTOModal, data?.events, matchId])

  const cancelCourtSwitch = useCallback(async () => {
    if (!courtSwitchModal || !data?.events || !matchId) return
    
    // Clear the modal flag so the modal can show again if they score another point
    const setIndex = courtSwitchModal.set.index
    const totalPoints = courtSwitchModal.team_1Points + courtSwitchModal.team_2Points
    const setSwitchKey = `set${setIndex}_switch_${totalPoints}`
    await db.matches.update(matchId, { [setSwitchKey]: false })
    
    // Undo the last point that caused the court switch threshold
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
      const newTeam_1Points = courtSwitchModal.teamThatScored === 'team_1' 
        ? courtSwitchModal.team_1Points - 1 
        : courtSwitchModal.team_1Points
      const newTeam_2Points = courtSwitchModal.teamThatScored === 'team_2' 
        ? courtSwitchModal.team_2Points - 1 
        : courtSwitchModal.team_2Points
      
      await db.sets.update(courtSwitchModal.set.id, {
        team_1Points: newTeam_1Points,
        team_2Points: newTeam_2Points
      })
      
      // Reset court switch tracking for this set
      const setIndex = courtSwitchModal.set.index
      const switchCountKey = `set${setIndex}_switchCount`
        const updateData = {}
        
        // Reset the switch count for this set
        // Calculate what the switch count should be after undoing this point
        const totalPoints = newTeam_1Points + newTeam_2Points
        const isSet3 = setIndex === 3
        const switchInterval = isSet3 ? 5 : 7
        const newSwitchCount = Math.floor(totalPoints / switchInterval)
        updateData[switchCountKey] = newSwitchCount
        
        await db.matches.update(matchId, updateData)
    }
    
    setCourtSwitchModal(null)
  }, [courtSwitchModal, data?.events, matchId])

  if (!data?.set) {
    return <p>Loading…</p>
  }

  const teamALabel = leftTeam.isTeamA ? 'A' : 'B'
  const teamBLabel = rightTeam.isTeamA ? 'A' : 'B'
  const teamAShortName = leftIsTeam_1 
    ? (data?.match?.team_1ShortName || leftTeam.name?.substring(0, 3).toUpperCase() || 'A')
    : (data?.match?.team_2ShortName || leftTeam.name?.substring(0, 3).toUpperCase() || 'A')
  const teamBShortName = leftIsTeam_1 
    ? (data?.match?.team_2ShortName || rightTeam.name?.substring(0, 3).toUpperCase() || 'B')
    : (data?.match?.team_1ShortName || rightTeam.name?.substring(0, 3).toUpperCase() || 'B')

  // Show error modal if coin toss data is missing
  if (coinTossError) {
    return (
      <div className="match-record" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{
          background: '#dc2626',
          color: '#fff',
          padding: '24px',
          borderRadius: '8px',
          maxWidth: '600px',
          margin: '0 auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '24px' }}>⚠️ Coin Toss Data Missing</h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '16px', lineHeight: '1.5' }}>
            {coinTossError.message}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {onOpenCoinToss && (
              <button
                onClick={() => {
                  setCoinTossError(null)
                  onOpenCoinToss()
                }}
                style={{
                  background: '#fff',
                  color: '#dc2626',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '16px'
                }}
              >
                Go to Coin Toss
              </button>
            )}
            {onOpenSetup && (
              <button
                onClick={() => {
                  setCoinTossError(null)
                  onOpenSetup()
                }}
                style={{
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '16px'
                }}
              >
                Go to Setup
              </button>
            )}
            <button
              onClick={() => {
                setCoinTossError(null)
                if (onOpenSetup) onOpenSetup()
              }}
              style={{
                background: '#22c55e',
                color: '#000',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '16px'
              }}
            >
              Start New Match
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="match-record">
      <div className="match-toolbar">
        <div className="toolbar-left">
          <button 
            className="secondary" 
            onClick={() => (onOpenSetup ? onOpenSetup() : null)}
            style={{ background: '#22c55e', color: '#000', fontWeight: 600 }}
          >
            Home
          </button>
          <div className="toolbar-divider" />
          <span className="toolbar-clock">{formatTimestamp(now)}</span>
          
        </div>
        <div className="toolbar-center">
          {/* Set counter and previous set results */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            {/* Set score counter */}
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 600,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>Sets:</span>
              <span style={{ color: 'var(--accent)' }}>{setScore.left}-{setScore.right}</span>
            </div>
            
            {/* Previous set results - show all finished sets */}
            {data?.sets && (() => {
              const finishedSets = data.sets.filter(s => s.finished).sort((a, b) => a.index - b.index)
              const currentLeftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
              const currentRightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
              
              // Helper to convert to Roman numeral
              const toRoman = (num) => {
                const romanNumerals = ['I', 'II', 'III']
                return romanNumerals[num - 1] || num.toString()
              }
              
              if (finishedSets.length === 0) return null
              
              return (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {finishedSets.map(set => {
                    // Always show from current left/right perspective
                    const leftPoints = currentLeftTeamKey === 'team_1' ? set.team_1Points : set.team_2Points
                    const rightPoints = currentRightTeamKey === 'team_1' ? set.team_1Points : set.team_2Points
                    return (
                      <div key={set.id} style={{ 
                        fontSize: '12px', 
                        fontWeight: 600,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{toRoman(set.index)}</span>
                        <span>{leftPoints}:{rightPoints}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
        <div className="toolbar-actions">
          {refereeConnectionEnabled && isAnyRefereeConnected && (
            <button 
              onClick={callReferee}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
              }}
            >
              <span style={{ fontSize: '18px' }}>⚠️</span>
              Call Referee
            </button>
          )}
        </div>
      </div>

      {/* Scoresheet Error Modal */}
      {scoresheetErrorModal && (
        <Modal
          title="Scoresheet Error"
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


      <div className="match-content">
        <aside className="team-controls">
          <div className="team-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: leftTeam.color || '#ef4444',
                color: isBrightColor(leftTeam.color || '#ef4444') ? '#000' : '#fff',
                fontWeight: 600,
                fontSize: '14px'
              }}
            >
              <span>{teamALabel}</span>
              <span>-</span>
              <span>{leftIsTeam_1 ? (data?.match?.team_1Country || 'SUI') : (data?.match?.team_2Country || 'SUI')}</span>
            </div>
            <h3 style={{ margin: 0 }}>{leftTeam.name}</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div 
              style={{ 
                flex: '1 1 50%',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px', 
                padding: '12px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setToSubModalPosition({ x: rect.left, y: rect.bottom + 8 })
                setToSubModal({ type: 'to', side: 'left' })
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>TO</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getTimeoutsUsed('left') >= 1 ? '#ef4444' : 'inherit'
              }}>{getTimeoutsUsed('left')}</div>
            </div>
            {/* Challenges remaining counter */}
            <div
              style={{
                flex: '1 1 50%',
                display: 'flex',
                flexDirection: 'column',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'default'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>BMP remaining</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (2 - getChallengesUsed(leftIsTeam_1 ? 'team_1' : 'team_2')) <= 0 ? '#ef4444' : 'inherit'
              }}>{2 - getChallengesUsed(leftIsTeam_1 ? 'team_1' : 'team_2')}</div>
            </div>
          </div>
          {/* Time-out and BMP request buttons on same row */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            onClick={() => handleTimeout('left')}
            disabled={getTimeoutsUsed('left') >= 1 || rallyStatus === 'in_play'}
              style={{ flex: 1 }}
          >
            Time-out
          </button>
          
          <button
            onClick={() => {
              const teamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
              setChallengeModal({ type: 'request', team: teamKey })
            }}
            disabled={!canRequestChallenge(leftIsTeam_1 ? 'team_1' : 'team_2')}
            style={{ 
                flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#f97316',
              color: '#fff',
              border: '1px solid #ea580c',
              opacity: !canRequestChallenge(leftIsTeam_1 ? 'team_1' : 'team_2') ? 0.5 : 1
            }}
          >
            <img 
              src={challengeIcon} 
                alt="BMP" 
              style={{ width: '20px', height: '20px' }}
            />
              BMP
          </button>
          </div>
          
          {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {!getLeftTeamSanctions.improperRequest && (
              <button
                onClick={() => handleImproperRequest('left')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.improper}
              >
                Improper Request
              </button>
            )}
            {!getLeftTeamSanctions.delayWarning ? (
              <button
                onClick={() => handleDelayWarning('left')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.delayWarning}
              >
                Delay Warning
              </button>
            ) : (
              <button
                onClick={() => handleDelayPenalty('left')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.delayPenalty}
              >
                Delay Penalty
              </button>
            )}
          </div>
          
          {/* Status boxes for team sanctions */}
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {getLeftTeamSanctions.improperRequest && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(156, 163, 175, 0.15)', 
                border: '1px solid rgba(156, 163, 175, 0.3)',
                borderRadius: '4px',
                color: '#d1d5db'
              }}>
                Sanctioned with an improper request
              </div>
            )}
            {getLeftTeamSanctions.delayWarning && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(234, 179, 8, 0.15)', 
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '4px',
                color: '#facc15'
              }}>
                Sanctioned with a delay warning ⏰
              </div>
            )}
            {teamHasFormalWarning(leftIsTeam_1 ? 'team_1' : 'team_2') && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(250, 204, 21, 0.15)', 
                border: '1px solid rgba(250, 204, 21, 0.3)',
                borderRadius: '4px',
                color: '#fde047'
              }}>
                Sanctioned with a formal warning 🟨
              </div>
            )}
          </div>
          
          {/* Player at serve indicator */}
          {leftServing && (
            <div style={{
              marginTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '12px 16px',
              background: 'rgba(34, 197, 94, 0.2)',
              border: '2px solid #22c55e',
              borderRadius: '8px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Player at serve
              </div>
              <div style={{
                fontSize: '120px',
                fontWeight: 800,
                color: '#22c55e',
                lineHeight: 1
              }}>
                {leftServingPlayer}
              </div>
            </div>
          )}
          
        </aside>

        <section className="court-wrapper">
          <div className="set-summary">
            <div className="set-info">
              <h3 className="set-title">Set {data.set.index}</h3>
              {data.set.index === 2 && currentServeTeam && (() => {
                // Show which team is currently at service in set 2
                const isLeftTeamServing = currentServeTeam === leftServeTeamKey;
                const servingTeamLabel = isLeftTeamServing ? teamALabel : teamBLabel;
                return (
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    marginTop: '4px',
                    padding: '4px 8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    Team at service: {servingTeamLabel}
                  </div>
                );
              })()}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                {/* Current score */}
                {renderScoreDisplay({ margin: '0 auto' })}
              </div>
            </div>
            <div>
              <span className="summary-label">Rally status:</span>
              <span className="summary-value" style={{ color: rallyStatus === 'in_play' ? '#4ade80' : '#fb923c' }}>
                {rallyStatus === 'in_play' ? 'In play' : 'Not in play'}
              </span>
            </div>
            {/* Last action */}
            {data?.events && data.events.length > 0 && (() => {
              // Find the last undoable event by sequence number
              const allEvents = [...data.events].sort((a, b) => {
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
              
              // Find events with valid descriptions
              let lastEvent = null
              for (const e of allEvents) {
                // Skip rally_start, replay, and lineup events from display
                // Beach volleyball: Lineup is always players 1 and 2, only serving changes
                if (e.type === 'rally_start' || e.type === 'replay' || e.type === 'lineup') continue
                
                // Try to get description
                const desc = getActionDescription(e)
                if (desc && desc !== 'Unknown action') {
                  lastEvent = e
                  break
                }
              }
              
              if (!lastEvent) return null
              
              const description = getActionDescription(lastEvent)
              
              return (
                <div>
                  <span className="summary-label">Last action:</span>
                  <span className="summary-value" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {description}
                  </span>
                </div>
              )
            })()}
          </div>

          <div className="court">
            {/* Beach volleyball: No 3m line */}
            <div className="court-side court-side-left">
              <div className="court-team court-team-left">
                {/* Beach volleyball: Single row with 2 players */}
                <div className="court-row" style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  width: '100%',
                  gap: '80px'
                }}>
                  {(leftTeam.playersOnCourt || []).slice(0, 2).map((player, idx) => {
                    const teamKey = leftIsTeam_1 ? 'team_1' : 'team_2'

                    
                    // Get player number from coin toss data - required, no fallback
                    const coinTossData = data?.match?.coinTossData?.players
                    if (!coinTossData) {
                      throw new Error(`Coin toss data is missing for ${teamKey}. Please complete the coin toss.`)
                    }
                    const isTeamA = teamKey === teamAKey
                    const teamData = isTeamA ? coinTossData.teamA : coinTossData.teamB
                    if (!teamData) {
                      throw new Error(`Team data is missing in coin toss for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    const playerCoinTossData = idx === 0 ? teamData.player1 : teamData.player2
                    if (!playerCoinTossData) {
                      throw new Error(`Player ${idx + 1} data is missing in coin toss for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    const displayNumber = playerCoinTossData.number !== undefined && playerCoinTossData.number !== null ? String(playerCoinTossData.number) : ''
                    const isCaptain = playerCoinTossData.isCaptain || false
                    const isFirstServe = playerCoinTossData.firstServe || false
                    
                    // Format player name: "Lastname, F." - from coin toss data only
                    const playerLastName = playerCoinTossData.lastName || ''
                    const playerFirstName = playerCoinTossData.firstName || ''
                    
                    if (!playerLastName && !playerFirstName) {
                      throw new Error(`Player ${idx + 1} name is missing in coin toss data for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    
                    const formattedName = playerLastName && playerFirstName
                      ? `${playerLastName}, ${playerFirstName.charAt(0).toUpperCase()}.`
                      : playerLastName || playerFirstName || 'Player'
                    
                    // DEBUG: Log player name issue only once
                    if (!playerNameDebugLogged.current && formattedName === 'Player') {
                      playerNameDebugLogged.current = true
                    }
                    
                    // Check if this player is currently serving
                    // Compare the player's number with the actual serving player number
                    const currentServeTeam = data?.set ? getCurrentServe() : null
                    const servingPlayerNumber = currentServeTeam === teamKey ? (leftServing ? leftServingPlayer : rightServingPlayer) : null
                    // Check if this player's number matches the serving player number
                    const playerNumber = parseInt(displayNumber) || (idx === 0 ? 1 : 2) // Fallback to position if no number
                    const isServing = currentServeTeam === teamKey && servingPlayerNumber !== null && playerNumber === servingPlayerNumber
                    
                    // Get sanctions for this player - use playerNumber from coin toss data, not player.number
                    const sanctions = getPlayerSanctions(teamKey, playerNumber)
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    const penaltyCount = getPlayerPenaltyCount(teamKey, playerNumber)
                    
                    return (
                      <div 
                        key={`${teamKey}-court-front-${player.position}-${player.id || player.number || idx}`}
                        style={{ 
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {/* Player name label at top */}
                        <div style={{
                          position: 'absolute',
                          top: '-15px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          zIndex: 10
                        }}>
                          {formattedName}
                        </div>
                        {/* Serving ball indicator - left side for left team */}
                        {isServing && (
                          <img
                            src={mikasaVolleyball}
                            alt="Serving"
                            style={{
                              width: '34px',
                              height: '34px',
                              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                              position: 'absolute',
                              left: '-42px', 
                              top: '50%',
                              transform: 'translateY(-50%)',
                              pointerEvents: 'none',
                              zIndex: 0
                            }}
                          />
                        )}
                        <div 
                          className="court-player"
                          onClick={(e) => {
                            e.stopPropagation()
                            const playerNum = displayNumber ? (isNaN(Number(displayNumber)) ? null : Number(displayNumber)) : (player.number !== null && player.number !== undefined ? Number(player.number) : null)
                            handlePlayerClick(teamKey, player.position, playerNum, e)
                          }}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            position: 'relative',
                            zIndex: 1
                          }}
                          onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,255,255,0.2)'
                          }}
                          onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          {/* Player number display (1 or 2) */}
                          {displayNumber && (
                            <span style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: '24px',
                              fontWeight: 700,
                              color: '#fff',
                              zIndex: 2
                            }}>
                              {displayNumber}
                            </span>
                          )}
                          {/* Bottom-left indicators: Captain C */}
                          {isCaptain && (
                            <span style={{
                              position: 'absolute',
                              bottom: '-8px',
                              left: '-8px',
                              width: '18px',
                              height: '18px',
                              background: '#000',
                              border: '2px solid #22c55e',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              fontWeight: 700,
                              color: '#22c55e',
                              zIndex: 5
                            }}>
                                C
                            </span>
                          )}
                          
                          {/* Sanction cards indicator - bottom right */}
                          {sanctions.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              bottom: '-6px',
                              right: '-6px',
                              zIndex: 10
                            }}>
                              {hasExpulsion ? (
                                // Expulsion: overlapping rotated cards
                                <div style={{ position: 'relative', width: '12px', height: '12px' }}>
                                  <div className="sanction-card yellow" style={{ 
                                    width: '6px', 
                                    height: '9px', 
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                    position: 'absolute',
                                    left: '0',
                                    top: '1px',
                                    transform: 'rotate(-8deg)',
                                    zIndex: 1,
                                    borderRadius: '1px'
                                  }}></div>
                                  <div className="sanction-card red" style={{ 
                                    width: '6px', 
                                    height: '9px', 
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                    position: 'absolute',
                                    right: '0',
                                    top: '1px',
                                    transform: 'rotate(8deg)',
                                    zIndex: 2,
                                    borderRadius: '1px'
                                  }}></div>
                                </div>
                              ) : (
                                // Other sanctions: separate cards stacked vertically
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
                                  {(hasWarning || hasDisqualification) && (
                                    <div className="sanction-card yellow" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                  {/* Show 2 red cards if player has 2 penalties, otherwise show 1 */}
                                  {penaltyCount >= 2 && (
                                    <>
                                      <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                      <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                    </>
                                  )}
                                  {(hasPenalty || hasDisqualification) && penaltyCount < 2 && (
                                    <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="court-net">
              {/* 1st Referee Connection Indicator - Top of net */}
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setConnectionModalPosition({ x: rect.left, y: rect.bottom + 8 })
                  setConnectionModal('referee')
                }}
                style={{
                  position: 'absolute',
                  top: '0px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'}
              >
                {(() => {
                  const status = getRefereeStatus(1)
                  const ref1 = data?.match?.officials?.find(o => o.role === '1st referee')
                  const ref1Name = ref1 ? `${ref1.lastName || ''}, ${ref1.firstName || '' }`.trim() : null
                  return (
                    <>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: status.color,
                        boxShadow: status.status === 'connected'
                          ? `0 0 6px ${status.color}80` 
                          : 'none'
                      }} />
                      <span style={{ 
                        color: status.status === 'disabled' ? 'var(--muted)' : '#fff',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        1<sup style={{ fontSize: '8px' }}>st</sup> Ref
                      </span>
                      {/* Always show name if it exists, regardless of connection status */}
                      {ref1Name && (
                        <span style={{ 
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: '10px',
                          marginLeft: '4px'
                        }}>
                          {ref1Name}
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Referee BMP Request button - right below 1st referee icon, only visible when rally is in play */}
              {rallyStatus === 'in_play' && (
                <button
                  onClick={handleRefereeBMPRequest}
                  style={{
                    position: 'absolute',
                    top: '40px', // Position below the 1st referee icon
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#8b5cf6',
                    color: '#fff',
                    border: '1px solid #7c3aed',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#7c3aed'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#8b5cf6'}
                >
                  Referee BMP
                </button>
              )}

              {/* 2nd Referee Connection Indicator - Bottom of net */}
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  setConnectionModalPosition({ x: rect.left, y: rect.top - 8 })
                  setConnectionModal('referee')
                }}
                style={{
                  position: 'absolute',
                  bottom: '0px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(0, 0, 0, 0.85)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'}
              >
                {(() => {
                  const status = getRefereeStatus(2)
                  const ref2 = data?.match?.officials?.find(o => o.role === '2nd referee')
                  const ref2Name = ref2 ? `${ref2.lastName || ''}, ${ref2.firstName}`.trim() : null
                  return (
                    <>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: status.color,
                        boxShadow: status.status === 'connected'
                          ? `0 0 6px ${status.color}80` 
                          : 'none'
                      }} />
                      <span style={{ 
                        color: status.status === 'disabled' ? 'var(--muted)' : '#fff',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        2<sup style={{ fontSize: '8px' }}>nd</sup> Ref
                      </span>
                      {/* Always show name if it exists, regardless of connection status */}
                      {ref2Name && (
                        <span style={{ 
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: '10px',
                          marginLeft: '4px'
                        }}>
                          {ref2Name}
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
            <div className="court-side court-side-right">
              <div className="court-team court-team-right">
                {/* Beach volleyball: Single row with 2 players */}
                <div className="court-row" style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  width: '100%',
                  gap: '80px'
                }}>
                  {(rightTeam.playersOnCourt || []).slice(0, 2).map((player, idx) => {
                    const teamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
                    
                    // Get player number from coin toss data - required, no fallback
                    const coinTossData = data?.match?.coinTossData?.players
                    if (!coinTossData) {
                      throw new Error(`Coin toss data is missing for ${teamKey}. Please complete the coin toss.`)
                    }
                    const isTeamA = teamKey === teamAKey
                    const teamData = isTeamA ? coinTossData.teamA : coinTossData.teamB
                    if (!teamData) {
                      throw new Error(`Team data is missing in coin toss for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    const playerCoinTossData = idx === 0 ? teamData.player1 : teamData.player2
                    if (!playerCoinTossData) {
                      throw new Error(`Player ${idx + 1} data is missing in coin toss for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    const displayNumber = playerCoinTossData.number !== undefined && playerCoinTossData.number !== null ? String(playerCoinTossData.number) : ''
                    const isCaptain = playerCoinTossData.isCaptain || false
                    const isFirstServe = playerCoinTossData.firstServe || false
                    
                    // Format player name: "Lastname, F." - from coin toss data only
                    const playerLastName = playerCoinTossData.lastName || ''
                    const playerFirstName = playerCoinTossData.firstName || ''
                    
                    if (!playerLastName && !playerFirstName) {
                      throw new Error(`Player ${idx + 1} name is missing in coin toss data for ${isTeamA ? 'Team A' : 'Team B'}.`)
                    }
                    
                    const formattedName = playerLastName && playerFirstName
                      ? `${playerLastName}, ${playerFirstName.charAt(0).toUpperCase()}.`
                      : playerLastName || playerFirstName || 'Player'
                    
                    // DEBUG: Log player name issue only once
                    if (!playerNameDebugLogged.current && formattedName === 'Player') {
                      playerNameDebugLogged.current = true
                    }
                    
                    // Check if this player is currently serving
                    // Compare the player's number with the actual serving player number
                    const currentServeTeam = data?.set ? getCurrentServe() : null
                    const servingPlayerNumber = currentServeTeam === teamKey ? (rightServing ? rightServingPlayer : leftServingPlayer) : null
                    // Check if this player's number matches the serving player number
                    const playerNumber = parseInt(displayNumber) || (idx === 0 ? 1 : 2) // Fallback to position if no number
                    const isServing = currentServeTeam === teamKey && servingPlayerNumber !== null && playerNumber === servingPlayerNumber
                    
                    // Get sanctions for this player - use playerNumber from coin toss data, not player.number
                    const sanctions = getPlayerSanctions(teamKey, playerNumber)
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    // Count penalties (including rude_conduct which is treated as penalty)
                    const penaltyCount = getPlayerPenaltyCount(teamKey, playerNumber)
                    
                    return (
                      <div 
                        key={`${teamKey}-court-front-${player.position}-${player.id || player.number || idx}`}
                        style={{ 
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {/* Player name label at top */}
                        <div style={{
                          position: 'absolute',
                          top: '-15px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          zIndex: 10
                        }}>
                          {formattedName}
                        </div>
                        {/* Serving ball indicator - right side for right team */}
                        {isServing && (
                          <img
                            src={mikasaVolleyball}
                            alt="Serving"
                            style={{
                              width: '34px',
                              height: '34px',
                              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                              position: 'absolute',
                              right: '-42px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              pointerEvents: 'none',
                              zIndex: 0
                            }}
                          />
                        )}
                        <div 
                          className="court-player"
                          onClick={(e) => {
                            e.stopPropagation()
                            const playerNum = displayNumber ? (isNaN(Number(displayNumber)) ? null : Number(displayNumber)) : (player.number !== null && player.number !== undefined ? Number(player.number) : null)
                            handlePlayerClick(teamKey, player.position, playerNum, e)
                          }}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            position: 'relative',
                            zIndex: 1
                          }}
                          onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,255,255,0.2)'
                          }}
                          onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.boxShadow = 'none'
                          }}
                        >
                          {/* Player number display (1 or 2) */}
                          {displayNumber && (
                            <span style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: '24px',
                              fontWeight: 700,
                              color: '#fff',
                              zIndex: 2
                            }}>
                              {displayNumber}
                            </span>
                          )}
                          {/* Bottom-left indicators: Captain C */}
                          {isCaptain && (
                            <span style={{
                              position: 'absolute',
                              bottom: '-8px',
                              left: '-8px',
                              width: '18px',
                              height: '18px',
                              background: '#000',
                              border: '2px solid #22c55e',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              fontWeight: 700,
                              color: '#22c55e',
                              zIndex: 5
                            }}>
                                C
                            </span>
                          )}
                          
                          {/* Sanction cards indicator - bottom right */}
                          {sanctions.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              bottom: '-6px',
                              right: '-6px',
                              zIndex: 10
                            }}>
                              {hasExpulsion ? (
                                // Expulsion: overlapping rotated cards
                                <div style={{ position: 'relative', width: '12px', height: '12px' }}>
                                  <div className="sanction-card yellow" style={{ 
                                    width: '6px', 
                                    height: '9px', 
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                    position: 'absolute',
                                    left: '0',
                                    top: '1px',
                                    transform: 'rotate(-8deg)',
                                    zIndex: 1,
                                    borderRadius: '1px'
                                  }}></div>
                                  <div className="sanction-card red" style={{ 
                                    width: '6px', 
                                    height: '9px', 
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                    position: 'absolute',
                                    right: '0',
                                    top: '1px',
                                    transform: 'rotate(8deg)',
                                    zIndex: 2,
                                    borderRadius: '1px'
                                  }}></div>
                                </div>
                              ) : (
                                // Other sanctions: separate cards stacked vertically
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {(hasWarning || hasDisqualification) && (
                                    <div className="sanction-card yellow" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                  {/* Show 2 red cards if player has 2 penalties, otherwise show 1 */}
                                  {penaltyCount >= 2 && (
                                    <>
                                      <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                      <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                    </>
                                  )}
                                  {(hasPenalty || hasDisqualification) && penaltyCount < 2 && (
                                    <div className="sanction-card red" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rally-controls">
            {rallyStatus === 'idle' ? (
              <button 
                className="secondary" 
                onClick={handleStartRally}
                disabled={false}
              >
                {isFirstRally ? 'Start set' : 'Start rally'}
              </button>
            ) : (
              <>
                <div className="rally-controls-row">
                  <button className="secondary" onClick={handleReplay}>
                    Replay rally
                  </button>
                </div>
                <div className="rally-controls-row">
                  <button className="rally-point-button" onClick={() => handlePoint('left')}>
                    Point A
                  </button>
                  <button className="rally-point-button" onClick={() => handlePoint('right')}>
                    Point B
                  </button>
                </div>
              </>
            )}
            <button
              className="danger"
              onClick={showUndoConfirm}
              disabled={!data?.events || data.events.length === 0}
            >
              Undo
            </button>
          </div>
        </section>

        <aside className="team-controls">
          <div className="team-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: rightTeam.color || '#3b82f6',
                color: isBrightColor(rightTeam.color || '#3b82f6') ? '#000' : '#fff',
                fontWeight: 600,
                fontSize: '14px'
              }}
            >
              <span>{teamBLabel}</span>
              <span>-</span>
              <span>{leftIsTeam_1 ? (data?.match?.team_2Country || 'SUI') : (data?.match?.team_1Country || 'SUI')}</span>
            </div>
            <h3 style={{ margin: 0 }}>{rightTeam.name}</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div 
              style={{ 
                flex: '1 1 50%',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px', 
                padding: '12px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setToSubModalPosition({ x: rect.left, y: rect.bottom + 8 })
                setToSubModal({ type: 'to', side: 'right' })
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>TO</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getTimeoutsUsed('right') >= 1 ? '#ef4444' : 'inherit'
              }}>{getTimeoutsUsed('right')}</div>
            </div>
            {/* Challenges remaining counter */}
            <div
              style={{
                flex: '1 1 50%',
                display: 'flex',
                flexDirection: 'column',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'default'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>BMP remaining</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (2 - getChallengesUsed(leftIsTeam_1 ? 'team_2' : 'team_1')) <= 0 ? '#ef4444' : 'inherit'
              }}>{2 - getChallengesUsed(leftIsTeam_1 ? 'team_2' : 'team_1')}</div>
            </div>
          </div>
          {/* Time-out and BMP request buttons on same row */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            onClick={() => handleTimeout('right')}
            disabled={getTimeoutsUsed('right') >= 1 || rallyStatus === 'in_play'}
              style={{ flex: 1 }}
          >
            Time-out
          </button>
          
          <button
            onClick={() => {
              const teamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
              setChallengeModal({ type: 'request', team: teamKey })
            }}
            disabled={!canRequestChallenge(leftIsTeam_1 ? 'team_2' : 'team_1')}
            style={{ 
                flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#f97316',
              color: '#fff',
              border: '1px solid #ea580c',
              opacity: !canRequestChallenge(leftIsTeam_1 ? 'team_2' : 'team_1') ? 0.5 : 1
            }}
          >
            <img 
              src={challengeIcon} 
                alt="BMP" 
              style={{ width: '20px', height: '20px' }}
            />
              BMP
          </button>
          </div>
          
          {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {!getRightTeamSanctions.improperRequest && (
              <button
                onClick={() => handleImproperRequest('right')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.improper}
              >
                Improper Request
              </button>
            )}
            {!getRightTeamSanctions.delayWarning ? (
              <button
                onClick={() => handleDelayWarning('right')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.delayWarning}
              >
                Delay Warning
              </button>
            ) : (
              <button
                onClick={() => handleDelayPenalty('right')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.delayPenalty}
              >
                Delay Penalty
              </button>
            )}
          </div>
          
          {/* Status boxes for team sanctions */}
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {getRightTeamSanctions.improperRequest && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(156, 163, 175, 0.15)', 
                border: '1px solid rgba(156, 163, 175, 0.3)',
                borderRadius: '4px',
                color: '#d1d5db'
              }}>
                Sanctioned with an improper request
              </div>
            )}
            {getRightTeamSanctions.delayWarning && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(234, 179, 8, 0.15)', 
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '4px',
                color: '#facc15'
              }}>
                Sanctioned with a delay warning ⏰
              </div>
            )}
            {teamHasFormalWarning(leftIsTeam_1 ? 'team_2' : 'team_1') && (
              <div style={{ 
                padding: '4px 8px', 
                fontSize: '10px', 
                background: 'rgba(250, 204, 21, 0.15)', 
                border: '1px solid rgba(250, 204, 21, 0.3)',
                borderRadius: '4px',
                color: '#fde047'
              }}>
                Sanctioned with a formal warning 🟨
              </div>
            )}
          </div>
          
          {/* Player at serve indicator */}
          {rightServing && (
            <div style={{
              marginTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '12px 16px',
              background: 'rgba(34, 197, 94, 0.2)',
              border: '2px solid #22c55e',
              borderRadius: '8px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <div style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Player at serve
              </div>
              <div style={{
                fontSize: '120px',
                fontWeight: 800,
                color: '#22c55e',
                lineHeight: 1
              }}>
                {rightServingPlayer}
              </div>
            </div>
          )}
          
        </aside>
      </div>

      {/* Bottom Action Buttons */}
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: '16px', 
        background: 'rgba(17, 24, 39, 0.95)', 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 1000,
        backdropFilter: 'blur(10px)'
      }}>
        <button 
          className="secondary" 
          onClick={() => setOptionsModal(true)}
          style={{ background: '#22c55e', color: '#000', fontWeight: 600, padding: '10px 20px' }}
        >
          Menu
        </button>
        <button 
          className="secondary" 
          onClick={() => {
            setManualCourtSwitchConfirm(true)
          }}
          style={{ background: '#22c55e', color: '#000', fontWeight: 600, padding: '10px 20px' }}
        >
          Manual Court Switch
        </button>
        <button 
          className="secondary" 
          onClick={() => setSpecialCasesModal(true)}
          style={{ background: '#22c55e', color: '#000', fontWeight: 600, padding: '10px 20px' }}
        >
          Forfait/Protest
        </button>
        <button 
          className="secondary" 
          onClick={() => {
            try {
              const match = data?.match
              if (!match) {
                alert('No match data available')
                return
              }
              
              // Gather all match data for the scoresheet (always refresh data)
              const allSets = data?.sets || []
              const allEvents = data?.events || []
              
              const scoresheetData = {
                match,
                team_1Team: data?.team_1Team,
                team_2Team: data?.team_2Team,
                team_1Players: data?.team_1Players || [],
                team_2Players: data?.team_2Players || [],
                sets: allSets,
                events: allEvents,
                sanctions: [] // TODO: Extract sanctions from events
              }
              
              // Store data in sessionStorage
              sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
              
              // Check if scoresheet window is already open
              if (scoresheetWindowRef.current && !scoresheetWindowRef.current.closed) {
                // Window is open - send refresh message
                try {
                  scoresheetWindowRef.current.postMessage({ type: 'REFRESH_SCORESHEET' }, '*')
                  // Also update sessionStorage (in case message doesn't work)
                  scoresheetWindowRef.current.location.reload()
                } catch (e) {
                  // If postMessage fails, just reload
                  scoresheetWindowRef.current.location.reload()
                }
              } else {
                // Window is not open - open a new one
                const newWindow = window.open('/scoresheet_beach.html', '_blank')
                if (newWindow) {
                  scoresheetWindowRef.current = newWindow
                }
              }
            } catch (error) {
              console.error('Error opening scoresheet:', error)
              alert('Error opening scoresheet: ' + error.message)
            }
          }}
          style={{ background: '#22c55e', color: '#000', fontWeight: 600, padding: '10px 20px' }}
        >
          🔍 Scoresheet
        </button>
      </div>

      {/* Menu Modal */}
      {optionsModal && (
        <Modal
          title="Menu"
          open={true}
          onClose={() => setOptionsModal(false)}
          width={500}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Top Section: Action Log and Manual Changes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                onClick={() => {
                  setShowLogs(true)
                  setOptionsModal(false)
                }}
                  style={{
                    padding: '16px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Action Log</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>View game history</div>
                </div>
                <div
                onClick={() => {
                    setManualChangesMenuModal(true)
                  setOptionsModal(false)
                }}
                  style={{
                    padding: '16px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Manual Changes</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Edit scores & data</div>
                </div>
              </div>

              {/* Middle Section: Show Sanctions, Results, and Remarks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                onClick={() => {
                    setShowSanctions(true)
                  setOptionsModal(false)
                }}
                  style={{
                    padding: '16px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Sanctions & Results</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>View sanctions</div>
                </div>
                <div
                onClick={() => {
                  setShowRemarks(true)
                  setOptionsModal(false)
                }}
                  style={{
                    padding: '16px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Remarks</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Record remarks</div>
                </div>
              </div>

              {/* Show Match Setup and Coin Toss */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {onOpenMatchSetup && (
                  <div
                  onClick={() => {
                    onOpenMatchSetup()
                    setOptionsModal(false)
                  }}
                    style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Match Setup</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>View match details</div>
                  </div>
              )}
              {onOpenCoinToss && (
                  <div
                  onClick={() => {
                    onOpenCoinToss()
                    setOptionsModal(false)
                  }}
                    style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Coin Toss</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>View coin toss</div>
                  </div>
                )}
              </div>

              {/* Downloads Section */}
              <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--muted)' }}>Downloads</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="secondary"
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
                    
                    setOptionsModal(false)
                  } catch (error) {
                    alert('Error exporting database data. Please try again.')
                  }
                }}
                    style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                📥 Download Full Database (JSON)
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    // Export game history as list of actions
                    if (!data?.events || data.events.length === 0) {
                      alert('No game history to download')
                      return
                    }
                    
                    // Get all events for this match, sorted by sequence
                    const allEvents = await db.events
                      .where('matchId')
                      .equals(matchId)
                      .sortBy('seq')
                    
                    // Format events as action list
                    const actions = allEvents.map(event => {
                      const description = getActionDescription(event)
                      const teamKey = event.payload?.team
                      
                      // Determine which team this action belongs to
                      let team = 'Both'
                      if (teamKey === 'team_1') {
                        const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
                        team = teamALabel === 'A' ? 'A' : 'B'
                      } else if (teamKey === 'team_2') {
                        const teamBLabel = data?.match?.coinTossTeamB === 'team_2' ? 'B' : 'A'
                        team = teamBLabel === 'B' ? 'B' : 'A'
                      } else {
                        // Events like court_switch, technical_to, set_start, set_end are "Both"
                        team = 'Both'
                      }
                      
                      return {
                        id: event.id,
                        seq: event.seq || 0,
                        timestamp: event.ts,
                        set: event.setIndex || 1,
                        team: team,
                        type: event.type,
                        description: description || event.type,
                        payload: event.payload
                      }
                    })
                    
                    // Create JSON export
                    const exportData = {
                      matchId: matchId,
                      matchName: data?.match?.eventName || 'Match',
                      team_1Team: data?.team_1Team?.name || 'Team 1',
                      team_2Team: data?.team_2Team?.name || 'Team 2',
                      exportDate: new Date().toISOString(),
                      totalActions: actions.length,
                      actions: actions
                    }
                    
                    const jsonStr = JSON.stringify(exportData, null, 2)
                    const blob = new Blob([jsonStr], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    const matchName = (data?.match?.eventName || 'Match').replace(/[^a-z0-9]/gi, '_').toLowerCase()
                    a.download = `game-history-${matchName}-${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    
                    setOptionsModal(false)
                  } catch (error) {
                    console.error('Error exporting game history:', error)
                    alert('Error exporting game history. Please try again.')
                  }
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                📥 Download Game History (Actions List)
              </button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Action Log Modal - Table format with Team A, B, and Both */}
      {showLogs && (
        <Modal
          title="Check Logs - Game History"
          open={true}
          onClose={() => setShowLogs(false)}
          width={1200}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search actions..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  flex: 1
                }}
              />
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    if (!data?.events || data.events.length === 0) {
                      alert('No game history to download')
                      return
                    }
                    
                    const allEvents = await db.events
                      .where('matchId')
                      .equals(matchId)
                      .sortBy('seq')
                    
                    const actions = allEvents.map(event => {
                      const description = getActionDescription(event)
                      const teamKey = event.payload?.team
                      
                      let team = 'Both'
                      if (teamKey === 'team_1') {
                        const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
                        team = teamALabel === 'A' ? 'A' : 'B'
                      } else if (teamKey === 'team_2') {
                        const teamBLabel = data?.match?.coinTossTeamB === 'team_2' ? 'B' : 'A'
                        team = teamBLabel === 'B' ? 'B' : 'A'
                      } else {
                        team = 'Both'
                      }
                      
                      return {
                        id: event.id,
                        seq: event.seq || 0,
                        timestamp: event.ts,
                        set: event.setIndex || 1,
                        team: team,
                        type: event.type,
                        description: description || event.type,
                        payload: event.payload
                      }
                    })
                    
                    const exportData = {
                      matchId: matchId,
                      matchName: data?.match?.eventName || 'Match',
                      team_1Team: data?.team_1Team?.name || 'Team 1',
                      team_2Team: data?.team_2Team?.name || 'Team 2',
                      exportDate: new Date().toISOString(),
                      totalActions: actions.length,
                      actions: actions
                    }
                    
                    const jsonStr = JSON.stringify(exportData, null, 2)
                    const blob = new Blob([jsonStr], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    const matchName = (data?.match?.eventName || 'Match').replace(/[^a-z0-9]/gi, '_').toLowerCase()
                    a.download = `game-history-${matchName}-${new Date().toISOString().split('T')[0]}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  } catch (error) {
                    console.error('Error downloading game history:', error)
                    alert('Error downloading game history. Please try again.')
                  }
                }}
                style={{ padding: '8px 16px', fontSize: '14px' }}
              >
                📥 Download
              </button>
            </div>
            {(() => {
              if (!data?.events || data.events.length === 0) {
                return <p>No actions recorded yet.</p>
              }
              
              // Process all events and determine team assignment (A, B, or Both)
              const processedEvents = [...data.events]
                .map(event => {
                  const eventDescription = getActionDescription(event)
                  if (!eventDescription) return null
                  
                  const teamKey = event.payload?.team
                  
                  // Determine which team this action belongs to
                  let team = 'Both'
                  if (teamKey === 'team_1') {
                    const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
                    team = teamALabel === 'A' ? 'A' : 'B'
                  } else if (teamKey === 'team_2') {
                    const teamBLabel = data?.match?.coinTossTeamB === 'team_2' ? 'B' : 'A'
                    team = teamBLabel === 'B' ? 'B' : 'A'
                  } else {
                    // Events like court_switch, technical_to, set_start, set_end are "Both"
                    team = 'Both'
                  }
                  
                  return {
                    event,
                    eventDescription,
                    team,
                    teamKey,
                    seq: event.seq || 0,
                    timestamp: event.ts,
                    setIndex: event.setIndex || 1,
                    id: event.id
                  }
                })
                .filter(item => {
                  if (!item) return false
                  if (logSearchQuery.trim() === '') return true
                  const searchLower = logSearchQuery.toLowerCase()
                  const descriptionLower = item.eventDescription.toLowerCase()
                  const setIndex = String(item.setIndex || '')
                  const actionId = String(item.id || '')
                  const teamStr = item.team.toLowerCase()
                  return descriptionLower.includes(searchLower) || 
                         setIndex.includes(searchLower) ||
                         actionId.includes(searchLower) ||
                         teamStr.includes(searchLower)
                })
                // Sort by sequence descending (latest first)
                .sort((a, b) => {
                  const aSeq = a.seq || 0
                  const bSeq = b.seq || 0
                  if (aSeq !== 0 || bSeq !== 0) {
                    return bSeq - aSeq // Descending (latest first)
                  }
                  const aTime = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime()
                  const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime()
                  return bTime - aTime
                })
              
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    fontSize: '13px'
                  }}>
                    <thead>
                      <tr style={{ 
                        borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
                        background: 'rgba(255, 255, 255, 0.05)'
                      }}>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'left', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>Seq</th>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'left', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>ID</th>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'center', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>Team</th>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'center', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>Set</th>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'left', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>Action</th>
                        <th style={{ 
                          padding: '12px 8px', 
                          textAlign: 'left', 
                          fontWeight: 700,
                          fontSize: '12px',
                          textTransform: 'uppercase',
                          color: 'var(--muted)'
                        }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedEvents.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                            No actions found
                          </td>
                        </tr>
                      ) : (
                        processedEvents.map((item, index) => {
                          // Determine team color
                          let teamColor = 'var(--accent)'
                          if (item.team === 'A') {
                            teamColor = leftTeam.color || '#ef4444'
                          } else if (item.team === 'B') {
                            teamColor = rightTeam.color || '#3b82f6'
                          }
                          
                          return (
                            <tr 
                              key={item.id} 
                              style={{ 
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent'
                              }}
                            >
                              <td style={{ 
                                padding: '10px 8px',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                color: 'var(--muted)'
                              }}>
                                {item.seq}
                              </td>
                              <td style={{ 
                                padding: '10px 8px',
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                color: 'var(--muted)'
                              }}>
                                {item.id}
                              </td>
                              <td style={{ 
                                padding: '10px 8px',
                                textAlign: 'center'
                              }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: item.team === 'Both' 
                                    ? 'rgba(34, 197, 94, 0.2)' 
                                    : `${teamColor}40`,
                                  color: item.team === 'Both'
                                    ? 'var(--accent)'
                                    : teamColor,
                                  border: `1px solid ${item.team === 'Both' ? 'var(--accent)' : teamColor}60`
                                }}>
                                  {item.team}
                                </span>
                              </td>
                              <td style={{ 
                                padding: '10px 8px',
                                textAlign: 'center',
                                fontSize: '12px',
                                color: 'var(--text)'
                              }}>
                                {item.setIndex}
                              </td>
                              <td style={{ 
                                padding: '10px 8px',
                                fontWeight: 500,
                                color: 'var(--text)'
                              }}>
                                {item.eventDescription}
                              </td>
                              <td style={{ 
                                padding: '10px 8px',
                                fontSize: '11px',
                                color: 'var(--muted)',
                                fontFamily: 'monospace'
                              }}>
                                {new Date(item.timestamp).toLocaleTimeString(undefined, { 
                                  hour: '2-digit', 
                                  minute: '2-digit', 
                                  second: '2-digit', 
                                  hour12: false 
                                })}
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

      {/* Manual Court Switch Confirmation Modal */}
      {manualCourtSwitchConfirm && (
        <Modal
          title="Manual Court Switch"
          open={true}
          onClose={() => setManualCourtSwitchConfirm(false)}
          width={450}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px' }}>
              Are you sure you want to switch courts manually?
            </p>
            <p style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--muted)' }}>
              This will switch the teams' positions on the court.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  if (!matchId || !data?.set) {
                    setManualCourtSwitchConfirm(false)
                    return
                  }
                  
                  const setIndex = data.set.index
                  const totalPoints = (data.set.team_1Points || 0) + (data.set.team_2Points || 0)
                  
                  // Get current switch count
                  const match = await db.matches.get(matchId)
                  const switchCountKey = `set${setIndex}_switchCount`
                  const currentSwitchCount = match?.[switchCountKey] || 0
                  
                  // Increment switch count to trigger visual switch
                  await db.matches.update(matchId, { 
                    [switchCountKey]: currentSwitchCount + 1
                  })
                  
                  // Log manual court switch as an event
                  await logEvent('court_switch', {
                    setIndex: setIndex,
                    totalPoints: totalPoints,
                    team_1Points: data.set.team_1Points || 0,
                    team_2Points: data.set.team_2Points || 0,
                    switchNumber: currentSwitchCount + 1,
                    manual: true
                  })
                  
                  setManualCourtSwitchConfirm(false)
                }}
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
                Confirm Switch
              </button>
              <button
                onClick={() => setManualCourtSwitchConfirm(false)}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
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

      {/* Manual Changes Modal */}
      {showManualPanel && (
        <Modal
          title="Manual Changes"
          open={true}
          onClose={() => setShowManualPanel(false)}
          width={600}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <section className="panel">
              <h3>Manual changes</h3>
              <div className="manual-list">
                {/* Edit Roster */}
                <div
                  className="manual-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Roster</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Edit player information (name, number, DOB, captain).
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="secondary"
                        onClick={() => setEditRosterModal('team_1')}
                        style={{
                          background: leftTeam.color || '#ef4444',
                          color: isBrightColor(leftTeam.color || '#ef4444') ? '#000' : '#fff'
                        }}
                      >
                        Edit {leftTeam.name || 'Team A'} Roster
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setEditRosterModal('team_2')}
                        style={{
                          background: rightTeam.color || '#3b82f6',
                          color: isBrightColor(rightTeam.color || '#3b82f6') ? '#000' : '#fff'
                        }}
                      >
                        Edit {rightTeam.name || 'Team B'} Roster
                      </button>
                    </div>
                  </div>
                </div>

                {/* Edit Score */}
                <div
                  className="manual-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Set Scores</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Manually adjust set scores.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {data?.sets && data.sets.sort((a, b) => a.index - b.index).map(set => (
                        <button
                          key={set.id}
                          className="secondary"
                          onClick={() => setEditScoreModal({ setIndex: set.index, setId: set.id })}
                          style={{ textAlign: 'left', padding: '8px 12px' }}
                        >
                          Set {set.index + 1}: {set.team_1Points || 0} - {set.team_2Points || 0}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Edit Sanctions */}
                <div
                  className="manual-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Sanctions</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Add, edit, or remove sanctions.
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setEditSanctionsModal(true)}
                      style={{ padding: '8px 16px' }}
                    >
                      Edit Sanctions
                    </button>
                  </div>
                </div>

                {/* Edit Match Info */}
                <div
                  className="manual-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Match Info</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Edit match details (date, time, hall, city, etc.).
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setEditMatchInfoModal(true)}
                      style={{ padding: '8px 16px' }}
                    >
                      Edit Match Info
                    </button>
                  </div>
                </div>

                {/* Edit Officials */}
                <div
                  className="manual-item"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '16px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Edit Officials</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Edit referee and scorer information.
                      </div>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setEditOfficialsModal(true)}
                      style={{ padding: '8px 16px' }}
                    >
                      Edit Officials
                    </button>
                  </div>
                </div>
                
                {/* Reopen completed sets */}
                {data?.sets && (() => {
                  const completedSets = data.sets.filter(s => s.finished).sort((a, b) => b.index - a.index)
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
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>Reopen completed sets</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                        Reopen a completed set to make corrections.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {completedSets.map(set => (
                          <button
                            key={set.id}
                            className="secondary"
                            onClick={() => setReopenSetConfirm({ setId: set.id, setIndex: set.index })}
                            style={{ textAlign: 'left', padding: '10px 16px' }}
                          >
                            Reopen Set {set.index + 1} ({set.team_1Points} - {set.team_2Points})
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </section>
          </div>
        </Modal>
      )}

      {/* Manual Changes Main Menu Modal */}
      {manualChangesMenuModal && (
        <Modal
          title="Manual Changes"
          open={true}
          onClose={() => setManualChangesMenuModal(false)}
          width={700}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Change Set Count */}
              <div
                onClick={() => {
                  setManualChangeSetCountModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Change Set Count</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Modify set scores and winners</div>
              </div>

              {/* Change Current Score */}
              <div
                onClick={() => {
                  setManualChangeCurrentScoreModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Change Current Score</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Modify current set score</div>
              </div>

              {/* Change Last Set Points */}
              <div
                onClick={() => {
                  if (data?.sets && data.sets.length > 0) {
                    const lastSet = data.sets.sort((a, b) => b.index - a.index)[0]
                    setManualChangeLastSetPointsModal({ setIndex: lastSet.index, setId: lastSet.id })
                    setManualChangesMenuModal(false)
                  }
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Change Last Set Points</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Modify points in last completed set</div>
              </div>

              {/* Interrupt Match */}
              <div
                onClick={() => {
                  setManualInterruptMatchModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Interrupt Match</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Pause or interrupt the match</div>
              </div>

              {/* Modify Sanctions */}
              <div
                onClick={() => {
                  setEditSanctionsModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Modify Sanctions</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Add, edit, or remove sanctions</div>
              </div>

              {/* Modify Team Rosters */}
              <div
                onClick={() => {
                  // Show team selection - user can click on the team they want to edit
                  // For now, open team 1 roster, but ideally should show a submenu
                  setEditRosterModal('team_1')
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Modify Team Rosters</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Edit player information</div>
              </div>

              {/* Modify Lineups, Serve, Sides */}
              <div
                onClick={() => {
                  setManualModifyLineupsModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Modify Lineups, Serve, Sides</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Change lineups, serving order, and court sides</div>
              </div>

              {/* Modify Timeouts */}
              <div
                onClick={() => {
                  setManualModifyTimeoutsModal(true)
                  setManualChangesMenuModal(false)
                }}
                style={{
                  padding: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Modify Timeouts</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Edit timeout records</div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Roster Modal */}
      {editRosterModal && (
        <Modal
          title={`Edit ${editRosterModal === 'team_1' ? (data?.team_1Team?.name || 'Team 1') : (data?.team_2Team?.name || 'Team 2')} Roster`}
          open={true}
          onClose={() => setEditRosterModal(null)}
          width={800}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            {(() => {
              const teamPlayers = editRosterModal === 'team_1' ? (data?.team_1Players || []) : (data?.team_2Players || [])
              const teamId = editRosterModal === 'team_1' ? data?.match?.team_1Id : data?.match?.team_2Id
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 120px 100px 80px', gap: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>#</div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>Last Name</div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>First Name</div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>DOB</div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>Captain</div>
                  </div>
                  {teamPlayers.map((player, idx) => (
                    <div key={player.id || idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 120px 100px 80px', gap: '8px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                      <input
                        type="number"
                        value={player.number || ''}
                        onChange={async (e) => {
                          const num = e.target.value ? Number(e.target.value) : null
                          if (player.id) {
                            await db.players.update(player.id, { number: num })
                          }
                        }}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                      />
                      <input
                        type="text"
                        value={player.lastName || ''}
                        onChange={async (e) => {
                          const lastName = e.target.value
                          if (player.id) {
                            await db.players.update(player.id, { 
                              lastName,
                              name: `${lastName} ${player.firstName || ''}`.trim()
                            })
                          }
                        }}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                      />
                      <input
                        type="text"
                        value={player.firstName || ''}
                        onChange={async (e) => {
                          const firstName = e.target.value
                          if (player.id) {
                            await db.players.update(player.id, { 
                              firstName,
                              name: `${player.lastName || ''} ${firstName}`.trim()
                            })
                          }
                        }}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                      />
                      <input
                        type="date"
                        value={player.dob ? new Date(player.dob).toISOString().split('T')[0] : ''}
                        onChange={async (e) => {
                          const dob = e.target.value || null
                          if (player.id) {
                            await db.players.update(player.id, { dob })
                          }
                        }}
                        style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                      />
                      <input
                        type="checkbox"
                        checked={player.isCaptain || false}
                        onChange={async (e) => {
                          if (player.id) {
                            // Unset all other captains first
                            const allPlayers = await db.players.where('teamId').equals(teamId).toArray()
                            for (const p of allPlayers) {
                              if (p.id !== player.id) {
                                await db.players.update(p.id, { isCaptain: false })
                              }
                            }
                            await db.players.update(player.id, { isCaptain: e.target.checked })
                          }
                        }}
                        style={{ width: '20px', height: '20px' }}
                      />
                    </div>
                  ))}
                  <button
                    className="secondary"
                    onClick={async () => {
                      // Add new player
                      const newPlayer = {
                        teamId,
                        number: null,
                        firstName: '',
                        lastName: '',
                        name: '',
                        dob: null,
                        isCaptain: false,
                        role: null,
                        createdAt: new Date().toISOString()
                      }
                      await db.players.add(newPlayer)
                    }}
                    style={{ marginTop: '12px', padding: '10px 16px' }}
                  >
                    + Add New Player
                  </button>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Edit Score Modal */}
      {editScoreModal && (
          <Modal
            title={`Edit Set ${editScoreModal.setIndex + 1} Score`}
            open={true}
            onClose={() => {
              setEditScoreModal(null)
              setEditScoreTeam_1Points(0)
              setEditScoreTeam_2Points(0)
            }}
            width={400}
          >
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ minWidth: '100px', fontWeight: 600 }}>
                    {leftTeam.name || 'Team A'}:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={editScoreTeam_1Points}
                    onChange={(e) => setEditScoreTeam_1Points(Number(e.target.value))}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)', fontSize: '16px', width: '80px' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ minWidth: '100px', fontWeight: 600 }}>
                    {rightTeam.name || 'Team B'}:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={editScoreTeam_2Points}
                    onChange={(e) => setEditScoreTeam_2Points(Number(e.target.value))}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)', fontSize: '16px', width: '80px' }}
                  />
                </div>
                <button
                  onClick={async () => {
                    await db.sets.update(editScoreModal.setId, {
                      team_1Points: editScoreTeam_1Points,
                      team_2Points: editScoreTeam_2Points
                    })
                    setEditScoreModal(null)
                    setEditScoreTeam_1Points(0)
                    setEditScoreTeam_2Points(0)
                    alert('Score updated successfully')
                  }}
                  style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save Score
                </button>
              </div>
            </div>
          </Modal>
      )}

      {/* Edit Sanctions Modal */}
      {editSanctionsModal && (
        <Modal
          title="Edit Sanctions"
          open={true}
          onClose={() => setEditSanctionsModal(false)}
          width={900}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            {(() => {
              const sanctionEvents = (data?.events || []).filter(e => e.type === 'sanction')
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600 }}>Existing Sanctions</div>
                    <button
                      className="secondary"
                      onClick={() => {
                        // Add new sanction - open sanction dropdown
                        setEditSanctionsModal(false)
                        // Trigger sanction flow
                        alert('Click on a player to add a sanction')
                      }}
                      style={{ padding: '8px 16px' }}
                    >
                      + Add Sanction
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sanctionEvents.map((event, idx) => (
                      <div key={event.id || idx} style={{ 
                        padding: '12px', 
                        background: 'rgba(255,255,255,0.05)', 
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            Set {event.setIndex || '?'} | {event.payload?.type || 'Unknown'} | {event.payload?.team === 'team_1' ? (data?.team_1Team?.name || 'Team 1') : (data?.team_2Team?.name || 'Team 2')}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            {event.payload?.playerNumber ? `Player ${event.payload.playerNumber}` : event.payload?.role || ''} | {new Date(event.ts).toLocaleString()}
                          </div>
                        </div>
                        <button
                          className="secondary"
                          onClick={async () => {
                            if (confirm('Delete this sanction?')) {
                              await db.events.delete(event.id)
                            }
                          }}
                          style={{ padding: '6px 12px', background: '#ef4444', color: '#fff' }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    {sanctionEvents.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
                        No sanctions recorded
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Edit Match Info Modal */}
      {editMatchInfoModal && (
          <Modal
            title="Edit Match Info"
            open={true}
            onClose={() => {
              setEditMatchInfoModal(false)
              setEditMatchHall('')
              setEditMatchCity('')
              setEditMatchScheduledAt('')
            }}
            width={600}
          >
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Hall</label>
                  <input
                    type="text"
                    value={editMatchHall}
                    onChange={(e) => setEditMatchHall(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>City</label>
                  <input
                    type="text"
                    value={editMatchCity}
                    onChange={(e) => setEditMatchCity(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editMatchScheduledAt}
                    onChange={(e) => setEditMatchScheduledAt(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                </div>
                <button
                  onClick={async () => {
                    await db.matches.update(matchId, {
                      hall: editMatchHall,
                      city: editMatchCity,
                      scheduledAt: editMatchScheduledAt ? new Date(editMatchScheduledAt).toISOString() : null
                    })
                    setEditMatchInfoModal(false)
                    setEditMatchHall('')
                    setEditMatchCity('')
                    setEditMatchScheduledAt('')
                    alert('Match info updated successfully')
                  }}
                  style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </Modal>
      )}

      {/* Edit Officials Modal */}
      {editOfficialsModal && (
          <Modal
            title="Edit Officials"
            open={true}
            onClose={() => {
              setEditOfficialsModal(false)
              setEditOfficialsState([])
            }}
            width={700}
          >
            <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {['1st referee', '2nd referee', 'scorer', 'assistant scorer'].map(role => {
                  const official = editOfficialsState.find(o => o.role === role) || { role, firstName: '', lastName: '', country: 'CH', dob: '' }
                  const idx = editOfficialsState.findIndex(o => o.role === role)
                  
                  return (
                    <div key={role} style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 600, marginBottom: '12px' }}>{role.charAt(0).toUpperCase() + role.slice(1)}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>First Name</label>
                          <input
                            type="text"
                            value={official.firstName || ''}
                            onChange={(e) => {
                              const updated = [...editOfficialsState]
                              if (idx >= 0) {
                                updated[idx] = { ...updated[idx], firstName: e.target.value }
                              } else {
                                updated.push({ ...official, firstName: e.target.value })
                              }
                              setEditOfficialsState(updated)
                            }}
                            style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Last Name</label>
                          <input
                            type="text"
                            value={official.lastName || ''}
                            onChange={(e) => {
                              const updated = [...editOfficialsState]
                              if (idx >= 0) {
                                updated[idx] = { ...updated[idx], lastName: e.target.value }
                              } else {
                                updated.push({ ...official, lastName: e.target.value })
                              }
                              setEditOfficialsState(updated)
                            }}
                            style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Country</label>
                          <input
                            type="text"
                            value={official.country || 'CH'}
                            onChange={(e) => {
                              const updated = [...editOfficialsState]
                              if (idx >= 0) {
                                updated[idx] = { ...updated[idx], country: e.target.value }
                              } else {
                                updated.push({ ...official, country: e.target.value })
                              }
                              setEditOfficialsState(updated)
                            }}
                            style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Date of Birth</label>
                          <input
                            type="date"
                            value={official.dob ? new Date(official.dob).toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                              const updated = [...editOfficialsState]
                              if (idx >= 0) {
                                updated[idx] = { ...updated[idx], dob: e.target.value || '' }
                              } else {
                                updated.push({ ...official, dob: e.target.value || '' })
                              }
                              setEditOfficialsState(updated)
                            }}
                            style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'var(--text)' }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button
                  onClick={async () => {
                    await db.matches.update(matchId, { officials: editOfficialsState })
                    setEditOfficialsModal(false)
                    setEditOfficialsState([])
                    alert('Officials updated successfully')
                  }}
                  style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save Officials
                </button>
              </div>
            </div>
          </Modal>
      )}

      {/* Manual Change: Set Count Modal */}
      {manualChangeSetCountModal && (
        <Modal
          title="Change Set Count"
          open={true}
          onClose={() => setManualChangeSetCountModal(false)}
          width={600}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data?.sets && data.sets.sort((a, b) => a.index - b.index).map(set => {
                const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
                const teamBLabel = data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'
                const setTeamAKey = data?.match?.coinTossTeamA === 'team_1' ? 'team_1' : 'team_2'
                const setTeamBKey = data?.match?.coinTossTeamB === 'team_1' ? 'team_1' : 'team_2'
                const teamAPoints = set[setTeamAKey === 'team_1' ? 'team_1Points' : 'team_2Points'] || 0
                const teamBPoints = set[setTeamBKey === 'team_1' ? 'team_1Points' : 'team_2Points'] || 0
                
                return (
                  <div key={set.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '12px' }}>Set {set.index}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'center' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {teamALabel} Points</label>
                        <input
                          type="number"
                          min="0"
                          value={teamAPoints}
                          onChange={async (e) => {
                            const points = Math.max(0, parseInt(e.target.value) || 0)
                            const field = setTeamAKey === 'team_1' ? 'team_1Points' : 'team_2Points'
                            await db.sets.update(set.id, { [field]: points })
                            await logEvent('manual_change', {
                              type: 'set_score',
                              setIndex: set.index,
                              team: setTeamAKey,
                              oldValue: teamAPoints,
                              newValue: points
                            })
                          }}
                          style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                        />
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 600 }}>:</div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {teamBLabel} Points</label>
                        <input
                          type="number"
                          min="0"
                          value={teamBPoints}
                          onChange={async (e) => {
                            const points = Math.max(0, parseInt(e.target.value) || 0)
                            const field = setTeamBKey === 'team_1' ? 'team_1Points' : 'team_2Points'
                            await db.sets.update(set.id, { [field]: points })
                            await logEvent('manual_change', {
                              type: 'set_score',
                              setIndex: set.index,
                              team: setTeamBKey,
                              oldValue: teamBPoints,
                              newValue: points
                            })
                          }}
                          style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={set.finished || false}
                          onChange={async (e) => {
                            await db.sets.update(set.id, { finished: e.target.checked })
                            if (e.target.checked) {
                              const winner = teamAPoints > teamBPoints ? setTeamAKey : (teamBPoints > teamAPoints ? setTeamBKey : null)
                              if (winner) {
                                await db.sets.update(set.id, { winner })
                              }
                            }
                            await logEvent('manual_change', {
                              type: 'set_finished',
                              setIndex: set.index,
                              finished: e.target.checked
                            })
                          }}
                        />
                        <span style={{ fontSize: '12px' }}>Set finished</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Change: Current Score Modal */}
      {manualChangeCurrentScoreModal && data?.set && (
        <Modal
          title="Change Current Score"
          open={true}
          onClose={() => setManualChangeCurrentScoreModal(false)}
          width={500}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Set {data.set.index}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {leftIsTeam_1 ? (data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B') : (data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B')} Points</label>
                  <input
                    type="number"
                    min="0"
                    value={leftIsTeam_1 ? (data.set.team_1Points || 0) : (data.set.team_2Points || 0)}
                    onChange={async (e) => {
                      const points = Math.max(0, parseInt(e.target.value) || 0)
                      const field = leftIsTeam_1 ? 'team_1Points' : 'team_2Points'
                      const oldValue = data.set[field] || 0
                      await db.sets.update(data.set.id, { [field]: points })
                      await logEvent('manual_change', {
                        type: 'current_score',
                        setIndex: data.set.index,
                        team: leftIsTeam_1 ? 'team_1' : 'team_2',
                        oldValue,
                        newValue: points
                      })
                    }}
                    style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                </div>
                <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 600 }}>:</div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {leftIsTeam_1 ? (data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B') : (data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B')} Points</label>
                  <input
                    type="number"
                    min="0"
                    value={leftIsTeam_1 ? (data.set.team_2Points || 0) : (data.set.team_1Points || 0)}
                    onChange={async (e) => {
                      const points = Math.max(0, parseInt(e.target.value) || 0)
                      const field = leftIsTeam_1 ? 'team_2Points' : 'team_1Points'
                      const oldValue = data.set[field] || 0
                      await db.sets.update(data.set.id, { [field]: points })
                      await logEvent('manual_change', {
                        type: 'current_score',
                        setIndex: data.set.index,
                        team: leftIsTeam_1 ? 'team_2' : 'team_1',
                        oldValue,
                        newValue: points
                      })
                    }}
                    style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Change: Last Set Points Modal */}
      {manualChangeLastSetPointsModal && (
        <Modal
          title="Change Last Set Points"
          open={true}
          onClose={() => setManualChangeLastSetPointsModal(null)}
          width={500}
        >
          <div style={{ padding: '20px' }}>
            {(() => {
              const set = data?.sets?.find(s => s.id === manualChangeLastSetPointsModal.setId)
              if (!set) return <div>Set not found</div>
              
              const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
              const teamBLabel = data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'
              const setTeamAKey = data?.match?.coinTossTeamA === 'team_1' ? 'team_1' : 'team_2'
              const setTeamBKey = data?.match?.coinTossTeamB === 'team_1' ? 'team_1' : 'team_2'
              const teamAPoints = set[setTeamAKey === 'team_1' ? 'team_1Points' : 'team_2Points'] || 0
              const teamBPoints = set[setTeamBKey === 'team_1' ? 'team_1Points' : 'team_2Points'] || 0
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>Set {set.index}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {teamALabel} Points</label>
                      <input
                        type="number"
                        min="0"
                        value={teamAPoints}
                        onChange={async (e) => {
                          const points = Math.max(0, parseInt(e.target.value) || 0)
                          const field = setTeamAKey === 'team_1' ? 'team_1Points' : 'team_2Points'
                          await db.sets.update(set.id, { [field]: points })
                          await logEvent('manual_change', {
                            type: 'last_set_points',
                            setIndex: set.index,
                            team: setTeamAKey,
                            oldValue: teamAPoints,
                            newValue: points
                          })
                        }}
                        style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 600 }}>:</div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Team {teamBLabel} Points</label>
                      <input
                        type="number"
                        min="0"
                        value={teamBPoints}
                        onChange={async (e) => {
                          const points = Math.max(0, parseInt(e.target.value) || 0)
                          const field = setTeamBKey === 'team_1' ? 'team_1Points' : 'team_2Points'
                          await db.sets.update(set.id, { [field]: points })
                          await logEvent('manual_change', {
                            type: 'last_set_points',
                            setIndex: set.index,
                            team: setTeamBKey,
                            oldValue: teamBPoints,
                            newValue: points
                          })
                        }}
                        style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Manual Change: Interrupt Match Modal */}
      {manualInterruptMatchModal && (
        <Modal
          title="Interrupt Match"
          open={true}
          onClose={() => setManualInterruptMatchModal(false)}
          width={500}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Interruption Type</label>
                <select
                  id="interruptType"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  <option value="pause">Pause Match</option>
                  <option value="interrupt">Interrupt Match</option>
                  <option value="resume">Resume Match</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Reason</label>
                <textarea
                  id="interruptReason"
                  rows={4}
                  placeholder="Enter reason for interruption..."
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)', resize: 'vertical' }}
                />
              </div>
              <button
                onClick={async () => {
                  const type = document.getElementById('interruptType')?.value || 'pause'
                  const reason = document.getElementById('interruptReason')?.value || ''
                  await logEvent('match_interrupt', {
                    type,
                    reason,
                    setIndex: data?.set?.index,
                    score: data?.set ? { team_1: data.set.team_1Points || 0, team_2: data.set.team_2Points || 0 } : null
                  })
                  setManualInterruptMatchModal(false)
                  alert('Match interruption recorded')
                }}
                style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Record Interruption
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Change: Modify Lineups, Serve, Sides Modal */}
      {manualModifyLineupsModal && (
        <Modal
          title="Modify Lineups, Serve, Sides"
          open={true}
          onClose={() => setManualModifyLineupsModal(false)}
          width={700}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Set</label>
                <select
                  id="lineupSetSelect"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  {data?.sets?.sort((a, b) => a.index - b.index).map(set => (
                    <option key={set.id} value={set.id}>Set {set.index}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Switch Court Sides</label>
                <button
                  onClick={async () => {
                    const setId = parseInt(document.getElementById('lineupSetSelect')?.value || '0')
                    const set = data?.sets?.find(s => s.id === setId)
                    if (set) {
                      const setIndex = set.index
                      const switchCountKey = `set${setIndex}_switchCount`
                      const match = await db.matches.get(matchId)
                      const currentSwitchCount = match?.[switchCountKey] || 0
                      await db.matches.update(matchId, { [switchCountKey]: currentSwitchCount + 1 })
                      await logEvent('court_switch', {
                        setIndex,
                        manual: true
                      })
                      alert('Court sides switched')
                    }
                  }}
                  style={{ padding: '8px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Switch Sides
                </button>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Change Serving Team</label>
                <select
                  id="servingTeamSelect"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  <option value="team_1">Team {data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'}</option>
                  <option value="team_2">Team {data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'}</option>
                </select>
                <button
                  onClick={async () => {
                    const setId = parseInt(document.getElementById('lineupSetSelect')?.value || '0')
                    const servingTeam = document.getElementById('servingTeamSelect')?.value || 'team_1'
                    await db.matches.update(matchId, { firstServe: servingTeam })
                    await logEvent('manual_change', {
                      type: 'serving_team',
                      setIndex: data?.sets?.find(s => s.id === setId)?.index || 1,
                      team: servingTeam
                    })
                    alert('Serving team changed')
                  }}
                  style={{ marginTop: '8px', padding: '8px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Update Serving Team
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Change: Modify Timeouts Modal */}
      {manualModifyTimeoutsModal && (
        <Modal
          title="Modify Timeouts"
          open={true}
          onClose={() => setManualModifyTimeoutsModal(false)}
          width={600}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Set</label>
                <select
                  id="timeoutSetSelect"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  {data?.sets?.sort((a, b) => a.index - b.index).map(set => (
                    <option key={set.id} value={set.id}>Set {set.index}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Team</label>
                <select
                  id="timeoutTeamSelect"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  <option value="team_1">Team {data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'}</option>
                  <option value="team_2">Team {data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'}</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Action</label>
                <select
                  id="timeoutActionSelect"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'var(--text)' }}
                >
                  <option value="add">Add Timeout</option>
                  <option value="remove">Remove Timeout</option>
                </select>
              </div>
              <button
                onClick={async () => {
                  const setId = parseInt(document.getElementById('timeoutSetSelect')?.value || '0')
                  const team = document.getElementById('timeoutTeamSelect')?.value || 'team_1'
                  const action = document.getElementById('timeoutActionSelect')?.value || 'add'
                  const set = data?.sets?.find(s => s.id === setId)
                  
                  if (action === 'add') {
                    await logEvent('timeout', { team, setIndex: set?.index || 1, manual: true })
                    alert('Timeout added')
                  } else {
                    // Find and remove the last timeout for this team in this set
                    const timeouts = data?.events?.filter(e => 
                      e.type === 'timeout' && 
                      e.payload?.team === team && 
                      (e.setIndex || 1) === (set?.index || 1)
                    ).sort((a, b) => {
                      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
                      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
                      return bTime - aTime
                    })
                    if (timeouts.length > 0) {
                      await db.events.delete(timeouts[0].id)
                      await logEvent('manual_change', {
                        type: 'timeout_removed',
                        setIndex: set?.index || 1,
                        team
                      })
                      alert('Timeout removed')
                    } else {
                      alert('No timeout found to remove')
                    }
                  }
                  setManualModifyTimeoutsModal(false)
                }}
                style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                {document.getElementById('timeoutActionSelect')?.value === 'add' ? 'Add Timeout' : 'Remove Timeout'}
                </button>
              </div>
            </div>
          </Modal>
      )}

      {/* Remarks Modal */}
      {showRemarks && (
        <Modal
          title="Remarks Recording"
          open={true}
          onClose={() => setShowRemarks(false)}
          width={600}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <section className="panel">
              <h3>Remarks</h3>
              <textarea
                className="remarks-area"
                placeholder="Record match remarks…"
                value={data?.match?.remarks || ''}
                onChange={e => {
                  db.matches.update(matchId, { remarks: e.target.value })
                }}
              />
            </section>
          </div>
        </Modal>
      )}

      {/* Special Cases Modal */}
      {specialCasesModal && (
        <Modal
          title=" Forfait/Protest"
          open={true}
          onClose={() => setSpecialCasesModal(false)}
          width={400}
        >
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => {
                setSpecialCasesModal(false)
                setForfaitModal({ type: null, team: '' })
              }}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 600,
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              Forfait
            </button>
            <button
              onClick={() => {
                setSpecialCasesModal(false)
                setProtestModal({ status: '', remarks: '', requestingTeam: '' })
              }}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 600,
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              Protest
            </button>
          </div>
        </Modal>
      )}

      {/* Forfait Modal */}
      {forfaitModal && (() => {
        // Check if coin toss has been made
        const coinTossData = data?.match?.coinTossData
        const hasCoinToss = coinTossData && coinTossData.players
        const teamAKey = data?.match?.coinTossTeamA || 'team_1'
        const teamBKey = data?.match?.coinTossTeamB || 'team_2'
        const teamAData = teamAKey === 'team_1' ? data?.team_1Team : data?.team_2Team
        const teamBData = teamBKey === 'team_1' ? data?.team_1Team : data?.team_2Team
        const teamAName = teamAData?.name || 'Team A'
        const teamBName = teamBData?.name || 'Team B'
        const teamAColor = teamAData?.color || (teamAKey === 'team_1' ? '#ef4444' : '#3b82f6')
        const teamBColor = teamBData?.color || (teamBKey === 'team_1' ? '#ef4444' : '#3b82f6')
        
        // Helper to determine text color for contrast
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
            title="Forfait Protocol"
            open={true}
            onClose={() => setForfaitModal(null)}
            width={600}
          >
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Team to Forfait:</label>
                {hasCoinToss ? (
                  // Show clickable team cards if coin toss is done
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div
                      onClick={() => setForfaitModal({ ...forfaitModal, team: teamAKey })}
                      style={{
                        flex: 1,
                        padding: '20px',
                        background: teamAColor,
                        borderRadius: '8px',
                        border: forfaitModal.team === teamAKey ? '3px solid #fff' : '2px solid rgba(255, 255, 255, 0.3)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        transform: forfaitModal.team === teamAKey ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: forfaitModal.team === teamAKey ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (forfaitModal.team !== teamAKey) {
                          e.currentTarget.style.transform = 'scale(1.02)'
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (forfaitModal.team !== teamAKey) {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }
                      }}
                    >
                      <div style={{ fontSize: '18px', fontWeight: 700, color: isBrightColor(teamAColor) ? '#000' : '#fff', marginBottom: '4px' }}>
                        Team A
                      </div>
                      <div style={{ fontSize: '14px', color: isBrightColor(teamAColor) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)' }}>
                        {teamAName}
                      </div>
                    </div>
                    <div
                      onClick={() => setForfaitModal({ ...forfaitModal, team: teamBKey })}
                      style={{
                        flex: 1,
                        padding: '20px',
                        background: teamBColor,
                        borderRadius: '8px',
                        border: forfaitModal.team === teamBKey ? '3px solid #fff' : '2px solid rgba(255, 255, 255, 0.3)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        transform: forfaitModal.team === teamBKey ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: forfaitModal.team === teamBKey ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (forfaitModal.team !== teamBKey) {
                          e.currentTarget.style.transform = 'scale(1.02)'
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (forfaitModal.team !== teamBKey) {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }
                      }}
                    >
                      <div style={{ fontSize: '18px', fontWeight: 700, color: isBrightColor(teamBColor) ? '#000' : '#fff', marginBottom: '4px' }}>
                        Team B
                      </div>
                      <div style={{ fontSize: '14px', color: isBrightColor(teamBColor) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)' }}>
                        {teamBName}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Show dropdown if coin toss hasn't been made
                  <select
                    value={forfaitModal.team || ''}
                    onChange={(e) => setForfaitModal({ ...forfaitModal, team: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '14px',
                      borderRadius: '4px',
                      background: '#fff',
                      color: '#000',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <option value="">Select team...</option>
                    <option value="team_1">{data?.team_1Team?.name || 'Team 1'}</option>
                    <option value="team_2">{data?.team_2Team?.name || 'Team 2'}</option>
                  </select>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Forfait Type:</label>
                <select
                  value={forfaitModal.type || ''}
                  onChange={(e) => setForfaitModal({ ...forfaitModal, type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    borderRadius: '4px',
                    background: '#fff',
                    color: '#000',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <option value="">Select type...</option>
                  <option value="injury_before">Team forfaits - Injury before match start</option>
                  <option value="injury_during">Team forfaits - Injury during match</option>
                </select>
              </div>

              {forfaitModal.type && (
                <>

                {(forfaitModal.type === 'injury_before' || forfaitModal.type === 'injury_during') && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Player Number:</label>
                    <input
                      type="number"
                      value={forfaitModal.playerNumber || ''}
                      onChange={(e) => setForfaitModal({ ...forfaitModal, playerNumber: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '14px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                      }}
                    />
                  </div>
                )}

                {forfaitModal.type === 'injury_during' && (
                  <>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Set:</label>
                      <input
                        type="number"
                        min="1"
                        max="3"
                        value={forfaitModal.setIndex || data?.set?.index || ''}
                        onChange={(e) => setForfaitModal({ ...forfaitModal, setIndex: parseInt(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '14px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Time:</label>
                      <input
                        type="time"
                        value={forfaitModal.time || ''}
                        onChange={(e) => setForfaitModal({ ...forfaitModal, time: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '14px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Score (Team 1 - Team 2):</label>
                      <input
                        type="text"
                        placeholder="e.g., 15-10"
                        value={forfaitModal.score || `${data?.set?.team_1Points || 0}-${data?.set?.team_2Points || 0}`}
                        onChange={(e) => setForfaitModal({ ...forfaitModal, score: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '14px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>MTO/RIT Duration (optional):</label>
                      <input
                        type="text"
                        placeholder="e.g., 3:45"
                        value={forfaitModal.mtoRitDuration || ''}
                        onChange={(e) => setForfaitModal({ ...forfaitModal, mtoRitDuration: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '14px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.2)'
                        }}
                      />
                    </div>
                  </>
                )}

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Additional Remarks:</label>
                  <textarea
                    value={forfaitModal.remarks || ''}
                    onChange={(e) => setForfaitModal({ ...forfaitModal, remarks: e.target.value })}
                    placeholder="Enter additional details..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '14px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setForfaitModal(null)}
                    style={{
                      padding: '10px 24px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: '#6b7280',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleForfaitWithDetails(forfaitModal)}
                    disabled={!forfaitModal.type || !forfaitModal.team}
                    style={{
                      padding: '10px 24px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: forfaitModal.type && forfaitModal.team ? '#dc2626' : '#6b7280',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: forfaitModal.type && forfaitModal.team ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Confirm Forfait
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
        )
      })()}

      {/* Protest Modal */}
      {protestModal && (
        <Modal
          title="Protest Protocol"
          open={true}
          onClose={() => setProtestModal(false)}
          width={500}
        >
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Team Requesting:</label>
              <select
                value={protestModal.requestingTeam || ''}
                onChange={(e) => setProtestModal({ ...protestModal, requestingTeam: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  background: '#fff',
                  color: '#000',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <option value="">Select team...</option>
                <option value="team_1">{data?.team_1Team?.name || 'Team 1'}</option>
                <option value="team_2">{data?.team_2Team?.name || 'Team 2'}</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Protest Status:</label>
              <select
                value={protestModal.status || ''}
                onChange={(e) => setProtestModal({ ...protestModal, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  background: '#fff',
                  color: '#000',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <option value="">Select status...</option>
                <option value="REJECTED LEVEL 1">REJECTED LEVEL 1</option>
                <option value="ACCEPTED LEVEL 1">ACCEPTED LEVEL 1</option>
                <option value="REJECTED / PENDING LEVEL 1">REJECTED / PENDING LEVEL 1</option>
                <option value="ACCEPTED / PENDING LEVEL 1">ACCEPTED / PENDING LEVEL 1</option>
                <option value="PENDING LEVEL 1">PENDING LEVEL 1</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Additional Remarks:</label>
              <textarea
                value={protestModal.remarks || ''}
                onChange={(e) => setProtestModal({ ...protestModal, remarks: e.target.value })}
                placeholder="Enter additional protest details..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setProtestModal(false)}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!protestModal.status) return
                  const remarkText = protestModal.status + (protestModal.remarks ? `\n${protestModal.remarks}` : '')
                  const existingRemarks = data?.match?.remarks || ''
                  const newRemarks = existingRemarks ? `${existingRemarks}\n\n${remarkText}` : remarkText
                  await db.matches.update(matchId, { remarks: newRemarks })
                  await logEvent('protest', {
                    status: protestModal.status,
                    remarks: protestModal.remarks
                  })
                  setProtestModal(false)
                  setShowRemarks(true)
                }}
                disabled={!protestModal.status}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: protestModal.status ? '#3b82f6' : '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: protestModal.status ? 'pointer' : 'not-allowed'
                }}
              >
                Record Protest
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sanctions and Results Modal */}
      {showSanctions && (
        <Modal
          title="Sanctions and Results"
          open={true}
          onClose={() => setShowSanctions(false)}
          width={1000}
        >
          <div style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <section className="panel">
              <h3>Sanctions and Results</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', overflowX: 'auto' }}>
                {/* Left half: Sanctions */}
                <div>
                  <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Sanctions</h4>
                  
                  {/* Sanctions Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Warn</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Pen</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Exp</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Disq</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Team</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '12%' }}>Set</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, width: '28%' }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                    {(() => {
                      // Get all sanction events except improper_request (will be shown at bottom)
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
                          const playerType = event.payload?.playerType
                          const playerNumber = event.payload?.playerNumber
                          const role = event.payload?.role
                          
                          // Get the identifier to display (player number or role abbreviation)
                          let identifier = null
                          if (role) {
                            identifier = role === 'Physiotherapist' ? 'P' :
                                         role === 'Medic' ? 'M' : role
                          } else if (playerNumber !== undefined && playerNumber !== null) {
                            identifier = String(playerNumber)
                          }
                          
                          // Calculate score at time of sanction
                          const setEvents = (data?.events || []).filter(e => e.setIndex === setIndex)
                          const eventIndex = setEvents.findIndex(e => e.id === event.id)
                          let team_1Score = 0
                          let team_2Score = 0
                          for (let i = 0; i <= eventIndex; i++) {
                            const e = setEvents[i]
                            if (e.type === 'point') {
                              if (e.payload?.team === 'team_1') team_1Score++
                              else if (e.payload?.team === 'team_2') team_2Score++
                            }
                          }
                          
                          const sanctionedTeamScore = team === 'team_1' ? team_1Score : team_2Score
                          const otherTeamScore = team === 'team_1' ? team_2Score : team_1Score
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
                    <tfoot>
                      {/* Improper Request Row - moved to bottom */}
                      <tr style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                        <td colSpan="4" style={{ padding: '8px 4px', textAlign: 'left', fontWeight: 600, fontSize: '11px' }}>
                          Improper Request:
                        </td>
                        <td colSpan="3" style={{ padding: '8px 4px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {['A', 'B'].map(team => {
                              const teamKey = team === 'A' ? teamAKey : teamBKey
                              const sideKey = (team === 'A' && teamAKey === 'team_1' && leftIsTeam_1) || (team === 'A' && teamAKey === 'team_2' && !leftIsTeam_1) || (team === 'B' && teamBKey === 'team_1' && leftIsTeam_1) || (team === 'B' && teamBKey === 'team_2' && !leftIsTeam_1) ? 'Left' : 'Right'
                              const hasImproperRequest = data?.match?.sanctions?.[`improperRequest${sideKey}`]
                              
                              return (
                                <div key={team} style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  border: '2px solid rgba(255,255,255,0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
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
                                      fontSize: '18px',
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
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                
                {/* Right half: Results */}
                <div>
                  <h4 style={{ marginBottom: '12px', fontSize: '12px', fontWeight: 600 }}>Results</h4>
                  {(() => {
                    // Get current left and right teams
                    const currentLeftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
                    const currentRightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
                    const leftTeamData = currentLeftTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
                    const rightTeamData = currentRightTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
                    const leftTeamColor = leftTeamData?.color || (currentLeftTeamKey === 'team_1' ? '#ef4444' : '#3b82f6')
                    const rightTeamColor = rightTeamData?.color || (currentRightTeamKey === 'team_1' ? '#ef4444' : '#3b82f6')
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
                      
                      
                      const leftTotalWins = finishedSets.filter(s => {
                        const leftPoints = currentLeftTeamKey === 'team_1' ? s.team_1Points : s.team_2Points
                        const rightPoints = currentRightTeamKey === 'team_1' ? s.team_1Points : s.team_2Points
                        return leftPoints > rightPoints
                      }).length
                      const rightTotalWins = finishedSets.filter(s => {
                        const leftPoints = currentLeftTeamKey === 'team_1' ? s.team_1Points : s.team_2Points
                        const rightPoints = currentRightTeamKey === 'team_1' ? s.team_1Points : s.team_2Points
                        return rightPoints > leftPoints
                      }).length
                      
                      const leftTotalPoints = finishedSets.reduce((sum, set) => {
                        return sum + (currentLeftTeamKey === 'team_1' ? set.team_1Points : set.team_2Points)
                      }, 0)
                      const rightTotalPoints = finishedSets.reduce((sum, set) => {
                        return sum + (currentRightTeamKey === 'team_1' ? set.team_1Points : set.team_2Points)
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
                      const winnerTeamData = winnerTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
                      const winnerTeamName = winnerTeamData?.name || (winnerTeamKey === 'team_1' ? 'Team 1' : 'Team 2')
                      const winnerScore = `${leftTotalWins}-${rightTotalWins}`
                      
                      // Get captain signatures
                      const team_1CaptainSignature = data?.match?.postMatchSignatureTeam_1Captain || null
                      const team_2CaptainSignature = data?.match?.postMatchSignatureTeam_2Captain || null
                      
                      return (
                        <div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                            <thead>
                              <tr>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px' }}>{leftTeamName}</span>
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
                                <th style={{ padding: '4px', fontSize: '8px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Dur</th>
                                <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px' }}>{rightTeamName}</span>
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
                                <th style={{ padding: '4px 2px', textAlign: 'center', fontWeight: 600, fontSize: '8px' }}></th>
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
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}></td>
                                <td style={{ padding: '4px 2px', textAlign: 'center', fontSize: '8px', color: 'var(--muted)' }}>{totalDurationMin}'</td>
                                <td style={{ padding: '4px 2px', textAlign: 'center' }}></td>
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
                                  {matchStartTime ? matchStartTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
                                </td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontWeight: 600, fontSize: '8px' }}>Match end time:</td>
                                <td style={{ padding: '4px 2px', textAlign: 'left', fontSize: '8px' }}>
                                  {matchEndTime ? matchEndTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'}
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
                                {leftTeam.name || 'Team A'} Captain
                              </div>
                              {team_1CaptainSignature ? (
                                <div style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'rgba(255,255,255,0.05)' }}>
                                  <img src={team_1CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team_1-captain')}
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
                                {rightTeam.name || 'Team B'} Captain
                              </div>
                              {team_2CaptainSignature ? (
                                <div style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px', minHeight: '40px', background: 'rgba(255,255,255,0.05)' }}>
                                  <img src={team_2CaptainSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPostMatchSignature('team_2-captain')}
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
                    const playedSets = allSets.filter(s => s.team_1Points > 0 || s.team_2Points > 0 || s.finished || s.startTime)
                    
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '4px 2px', textAlign: 'center' }}></th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '10px' }}>{leftTeamName}</span>
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
                            <th style={{ padding: '4px 2px', fontSize: '8px' }}>Dur</th>
                            <th colSpan="4" style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '10px' }}>{rightTeamName}</span>
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
                            const leftPoints = currentLeftTeamKey === 'team_1' ? set.team_1Points : set.team_2Points
                            const rightPoints = currentRightTeamKey === 'team_1' ? set.team_1Points : set.team_2Points
                            
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
            </section>
          </div>
        </Modal>
      )}

      {timeoutModal && (
        <Modal
          title={`Time-out — ${timeoutModal.team === 'team_1' ? (data?.team_1Team?.name || 'Team 1') : (data?.team_2Team?.name || 'Team 2')}`}
          open={true}
          onClose={timeoutModal.started ? stopTimeout : cancelTimeout}
          width={400}
        >
          <div style={{ textAlign: 'center', padding: '24px' }}>
            {timeoutModal.started ? (
              <>
                <div style={{ fontSize: '64px', fontWeight: 800, marginBottom: '16px', color: 'var(--accent)' }}>
                  {timeoutModal.countdown}"
                </div>
                <p style={{ marginBottom: '24px', color: 'var(--muted)' }}>
                  Time-out in progress
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="secondary" onClick={stopTimeout}>
                    Stop time-out
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ marginBottom: '24px', color: 'var(--muted)' }}>
                  Confirm time-out request?
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button onClick={confirmTimeout}>
                    Confirm time-out
                  </button>
                  <button className="secondary" onClick={cancelTimeout}>
                    Cancel
                  </button>
                </div>
              </>
            )}
      </div>
        </Modal>
      )}

      
      {setEndModal && (
        <Modal
          title="Set End Confirmation"
          open={true}
          onClose={() => setSetEndModal(null)}
          width={400}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '24px', fontSize: '16px' }}>
              Do you confirm the set is over?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmSetEnd}
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
                onClick={cancelSetEnd}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Undo last action
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BMP Request Modal (Team-initiated) */}
      {challengeModal && challengeModal.type === 'request' && (
        <Modal
          title="Ball Mark Protocol Request"
          open={true}
          onClose={handleCancelChallengeRequest}
          width={500}
        >
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>
                Reason
              </label>
              <select
                value={challengeReason}
                onChange={(e) => setChallengeReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  background: 'var(--bg-secondary)',
                  border: '2px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              >
                <option value="IN / OUT">IN / OUT</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <button
                onClick={handleConfirmChallengeRequest}
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
                Confirm BMP request
              </button>
              <button
                onClick={handleRejectChallengeRequest}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Reject/Cancel BMP Request
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BMP In Progress Modal */}
      {challengeModal && challengeModal.type === 'in_progress' && (
        <Modal
          title={`${challengeModal.isRefereeInitiated ? 'Referee ' : ''}Ball Mark Protocol${challengeModal.team ? ` - Team ${challengeModal.team === teamAKey ? 'A' : 'B'}` : ''} (Set ${challengeModal.set})`}
          open={true}
          onClose={() => {}}
          width={500}
          hideCloseButton={true}
        >
          <div style={{ padding: '20px', textAlign: 'center' }}>
            {(() => {
              const { team, score, servingTeam, isRefereeInitiated } = challengeModal
              
              // Determine which team is on left and right based on current court position (accounting for switches)
              const leftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
              const rightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
              
              // Determine which team is A and which is B
              const teamAIsTeam_1 = teamAKey === 'team_1'
              
              // Determine if Team A is on the left or right side (accounting for court switches)
              const teamAIsLeft = (teamAKey === leftTeamKey)
              const teamBIsLeft = !teamAIsLeft
              
              // Get team colors based on current positions
              const teamAColor = teamAIsLeft ? (leftTeam.color || '#ef4444') : (rightTeam.color || '#ef4444')
              const teamBColor = teamAIsLeft ? (rightTeam.color || '#3b82f6') : (leftTeam.color || '#3b82f6')
              
              // Get scores for left and right positions (at time of challenge)
              const leftScore = leftTeamKey === 'team_1' ? score.team_1 : score.team_2
              const rightScore = rightTeamKey === 'team_1' ? score.team_1 : score.team_2
              
              // Determine which team label is on left and right
              const leftTeamLabel = teamAIsLeft ? 'A' : 'B'
              const rightTeamLabel = teamAIsLeft ? 'B' : 'A'
              
              // Get colors for left and right teams
              const leftTeamColor = teamAIsLeft ? teamAColor : teamBColor
              const rightTeamColor = teamAIsLeft ? teamBColor : teamAColor
              
              let successfulLeftScore, successfulRightScore, unsuccessfulLeftScore, unsuccessfulRightScore
              let successfulServingTeam, currentServingTeamLabel
              let successfulButtonLabel, unsuccessfulButtonLabel
              
              if (isRefereeInitiated) {
                // Referee-initiated: determine which team gets point based on left/right
                // Left = left team gets point, Right = right team gets point
                
                // Left outcome: left team gets point
                successfulLeftScore = leftScore + 1
                successfulRightScore = rightScore
                successfulServingTeam = leftTeamLabel
                
                // Right outcome: right team gets point
                unsuccessfulLeftScore = leftScore
                unsuccessfulRightScore = rightScore + 1
                currentServingTeamLabel = rightTeamLabel
                
                // Button labels: show A or B instead of Left/Right
                successfulButtonLabel = leftTeamLabel
                unsuccessfulButtonLabel = rightTeamLabel
              } else {
                // Team-initiated challenge: reverse last point
                const challengingTeamKey = team
                const challengingTeamIsLeft = (challengingTeamKey === leftTeamKey)
                const opponentTeamIsLeft = !challengingTeamIsLeft
                
                // Successful: challenging team gets point (reverses last point)
                if (challengingTeamIsLeft) {
                  // Challenging team is on left
                  successfulLeftScore = leftScore + 1
                  successfulRightScore = Math.max(0, rightScore - 1)
                  successfulServingTeam = leftTeamLabel
                } else {
                  // Challenging team is on right
                  successfulLeftScore = Math.max(0, leftScore - 1)
                  successfulRightScore = rightScore + 1
                  successfulServingTeam = rightTeamLabel
                }
                
                // Unsuccessful: score stays the same
                unsuccessfulLeftScore = leftScore
                unsuccessfulRightScore = rightScore
                currentServingTeamLabel = servingTeam === leftTeamKey ? leftTeamLabel : rightTeamLabel
                
                // Button labels: for team-initiated, show SUC and UNSUC instead of A/B
                successfulButtonLabel = 'SUC'
                unsuccessfulButtonLabel = 'UNSUC'
              }
              
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                  {/* Top row: Successful and Unsuccessful side by side */}
                  <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                    {/* Successful card */}
            <div style={{ 
                      flex: 1,
              display: 'flex',
                      flexDirection: 'column', 
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: `linear-gradient(to right, ${leftTeamColor}40, ${rightTeamColor}40)`,
                        border: `2px solid ${leftTeamColor}80`
                      }}>
                <div style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: leftTeamColor,
                          color: isBrightColor(leftTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {leftTeamLabel} {successfulLeftScore}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>-</span>
                  <div style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: rightTeamColor,
                          color: isBrightColor(rightTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {successfulRightScore} {rightTeamLabel}
                </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
                          Serving: {successfulServingTeam}
                        </span>
                      </div>
                      <button
                        onClick={handleSuccessfulChallenge}
                  style={{
                          padding: '12px 20px',
                          fontSize: '14px',
                          fontWeight: 600,
                          background: '#22c55e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          transition: 'transform 0.1s, box-shadow 0.1s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {successfulButtonLabel}
                      </button>
                </div>
                
                    {/* Unsuccessful card */}
                    <div style={{ 
                      flex: 1,
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: `linear-gradient(to right, ${leftTeamColor}40, ${rightTeamColor}40)`,
                        border: `2px solid ${leftTeamColor}80`
                      }}>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: leftTeamColor,
                          color: isBrightColor(leftTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {leftTeamLabel} {unsuccessfulLeftScore}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>-</span>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: rightTeamColor,
                          color: isBrightColor(rightTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {unsuccessfulRightScore} {rightTeamLabel}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
                          Serving: {currentServingTeamLabel}
                        </span>
                      </div>
                      <button
                        onClick={handleUnsuccessfulChallenge}
                  style={{
                          padding: '12px 20px',
                          fontSize: '14px',
                          fontWeight: 600,
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          transition: 'transform 0.1s, box-shadow 0.1s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {unsuccessfulButtonLabel}
                      </button>
              </div>
            </div>
            
                  {/* Bottom row: Judgment impossible and Mark Deliberately Altered */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px',
                    justifyContent: 'center',
                    width: '100%'
                  }}>
                    {/* Judgment impossible */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      flex: 1,
                      maxWidth: '250px'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: `linear-gradient(to right, ${leftTeamColor}40, ${rightTeamColor}40)`,
                        border: `2px solid ${leftTeamColor}80`
                      }}>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: leftTeamColor,
                          color: isBrightColor(leftTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {leftTeamLabel} {leftScore}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>-</span>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: rightTeamColor,
                          color: isBrightColor(rightTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {rightScore} {rightTeamLabel}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
                          Serving: {servingTeam === leftTeamKey ? leftTeamLabel : rightTeamLabel}
                        </span>
                      </div>
              <button
                        onClick={handleJudgmentImpossibleChallenge}
                style={{
                          padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                          background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          transition: 'transform 0.1s, box-shadow 0.1s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {isRefereeInitiated ? 'Judgment impossible' : 'MUNAV'}
              </button>
                    </div>

                    {/* Mark Deliberately Altered */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '8px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '2px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      flex: 1,
                      maxWidth: '250px'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: `linear-gradient(to right, ${leftTeamColor}40, ${rightTeamColor}40)`,
                        border: `2px solid ${leftTeamColor}80`
                      }}>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: leftTeamColor,
                          color: isBrightColor(leftTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {leftTeamLabel} {leftScore}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>-</span>
                        <div style={{ 
                          padding: '4px 10px',
                          borderRadius: '4px',
                          background: rightTeamColor,
                          color: isBrightColor(rightTeamColor) ? '#000' : '#fff',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {rightScore} {rightTeamLabel}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
                          Serving: {servingTeam === leftTeamKey ? leftTeamLabel : rightTeamLabel}
                        </span>
                      </div>
              <button
                        onClick={handleMarkDeliberatelyAltered}
                style={{
                          padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                          background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          transition: 'transform 0.1s, box-shadow 0.1s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        Mark Deliberately Altered
              </button>
            </div>
                  </div>

                  {/* Team cancels BMP button */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center',
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <button
                      onClick={handleTeamCancelsBMP}
                      style={{
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        transition: 'transform 0.1s, box-shadow 0.1s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      Team cancels BMP
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </Modal>
      )}
      
      {playerActionMenu && (() => {
        // Get element position - use stored coordinates if available
        let menuStyle
        if (playerActionMenu.x !== undefined && playerActionMenu.y !== undefined) {
          menuStyle = {
            position: 'fixed',
            left: `${playerActionMenu.x}px`,
            top: `${playerActionMenu.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = playerActionMenu.element?.getBoundingClientRect?.()
          menuStyle = rect ? {
            position: 'fixed',
            left: `${rect.right + 30}px`,
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
              onClick={() => setPlayerActionMenu(null)}
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
                <button
                  onClick={openSanctionFromMenu}
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
                    position: 'relative',
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
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                    <div className="sanction-card yellow" style={{ width: '16px', height: '20px', flexShrink: 0 }}></div>
                    <div className="sanction-card red" style={{ width: '16px', height: '20px', flexShrink: 0 }}></div>
                  </div>
                </button>
                <button
                  onClick={openMtoRitFromMenu}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#dc2626',
                    color: '#fff',
                    border: '2px solid #991b1b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    position: 'relative',
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
                  <span>Injury</span>
                  <span style={{ 
                    fontSize: '18px', 
                    lineHeight: '1',
                    fontWeight: 700,
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                  }}>✚</span>
                </button>
              </div>
            </div>
          </>
        )
      })()}
      
      
      {sanctionDropdown && (() => {
        // Get element position - use stored coordinates if available
        let dropdownStyle
        if (sanctionDropdown.x !== undefined && sanctionDropdown.y !== undefined) {
          dropdownStyle = {
            position: 'fixed',
            left: `${sanctionDropdown.x}px`,
            top: `${sanctionDropdown.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = sanctionDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: `${rect.right + 30}px`,
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
                {(() => {
                  const { type, playerNumber, role } = sanctionDropdown
                  if (type === 'official') {
                    // Map role to abbreviation
                    const roleAbbr = role === 'Physiotherapist' ? 'P' :
                                     role === 'Medic' ? 'M' : role
                    return `Sanction for ${roleAbbr}`
                  } else if (playerNumber) {
                    return `Sanction for ${playerNumber}`
                  } else {
                    return 'Sanction'
                  }
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(() => {
                  const teamKey = sanctionDropdown.team
                  const playerNumber = sanctionDropdown.playerNumber
                  const currentSanction = playerNumber ? getPlayerSanctionLevel(teamKey, playerNumber) : null
                  const teamWarning = teamHasFormalWarning(teamKey)
                  
                  // For beach volleyball: Check penalty count per SET (max 2 per set)
                  // Includes both penalty and rude_conduct (they are the same)
                  // IMPORTANT: Penalties reset each set - a player can have up to 2 penalties per set
                  const penaltyCount = playerNumber ? getPlayerPenaltyCount(teamKey, playerNumber) : 0
                  
                  // Determine which sanctions are available based on escalation
                  const canGetWarning = !currentSanction && !teamWarning
                  // Penalty: can get if has less than 2 penalties in THIS SET
                  // Can get penalty even if already has a penalty (up to 2 per set)
                  // Cannot get penalty if already expelled or disqualified
                  const canGetPenalty = currentSanction !== 'expulsion' && currentSanction !== 'disqualification' && penaltyCount < 2
                  const canGetExpulsion = !currentSanction || currentSanction === 'warning' || currentSanction === 'penalty' || currentSanction === 'rude_conduct' || penaltyCount >= 2
                  const canGetDisqualification = true // Always available
                  
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
                        <span>Penalty{!canGetPenalty && (penaltyCount >= 2 ? ` (Max 2 per set: ${penaltyCount}/2)` : ' (Already sanctioned)')}</span>
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
      
      {injuryDropdown && (() => {
        // Get element position - use stored coordinates if available
        let dropdownStyle
        if (injuryDropdown.x !== undefined && injuryDropdown.y !== undefined) {
          dropdownStyle = {
            position: 'fixed',
            left: `${injuryDropdown.x}px`,
            top: `${injuryDropdown.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 1000
          }
        } else {
          const rect = injuryDropdown.element?.getBoundingClientRect?.()
          dropdownStyle = rect ? {
            position: 'fixed',
            left: `${rect.right + 30}px`,
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
              onClick={() => {
                setSanctionDropdown(null)
                setInjuryDropdown(null)
                setPlayerActionMenu(null)
              }}
            />
            {/* Dropdown */}
            <div style={dropdownStyle} className="modal-wrapper-roll-up">
              <div
                data-injury-dropdown
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
                Player #{injuryDropdown.playerNumber}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button
                  onClick={() => handleMtoRitSelection('mto_blood')}
                style={{
                    padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                    background: '#dc2626',
                    color: '#fff',
                    border: '1px solid #991b1b',
                  borderRadius: '4px',
                  cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ef4444'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#dc2626'
                  }}
                >
                  MTO - Blood
                </button>
                <button
                  onClick={() => handleMtoRitSelection('rit_no_blood')}
                  disabled={hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? '#666' : '#8b5cf6',
                    color: '#fff',
                    border: '1px solid #7c3aed',
                    borderRadius: '4px',
                    cursor: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  width: '100%',
                    opacity: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#7c3aed'
                    }
                }}
                onMouseLeave={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#8b5cf6'
                    }
                  }}
                >
                  RIT - No Blood {hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) && '(Used)'}
                </button>
                <button
                  onClick={() => handleMtoRitSelection('rit_weather')}
                  disabled={hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? '#666' : '#8b5cf6',
                    color: '#fff',
                    border: '1px solid #7c3aed',
                    borderRadius: '4px',
                    cursor: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    width: '100%',
                    opacity: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#7c3aed'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#8b5cf6'
                    }
                  }}
                >
                  RIT - Weather {hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) && '(Used)'}
                </button>
                <button
                  onClick={() => handleMtoRitSelection('rit_toilet')}
                  disabled={hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? '#666' : '#8b5cf6',
                    color: '#fff',
                    border: '1px solid #7c3aed',
                    borderRadius: '4px',
                    cursor: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    width: '100%',
                    opacity: hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#7c3aed'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber)) {
                      e.currentTarget.style.background = '#8b5cf6'
                    }
                  }}
                >
                  RIT - Toilet {hasPlayerUsedRit(injuryDropdown.team, injuryDropdown.playerNumber) && '(Used)'}
              </button>
              </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* MTO/RIT Confirmation Modal */}
      {mtoRitConfirmModal && (
        <Modal
          title="Confirm MTO/RIT"
          open={true}
          onClose={cancelMtoRitConfirm}
          width={450}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {(() => {
              // Get player information
              const players = mtoRitConfirmModal.team === 'team_1' ? (data?.team_1Players || []) : (data?.team_2Players || [])
              const player = players.find(p => p.number === mtoRitConfirmModal.playerNumber)
              const playerName = player ? `${player.lastName || ''}${player.lastName && player.firstName ? ', ' : ''}${player.firstName || ''}`.trim() : ''
              const teamName = mtoRitConfirmModal.team === 'team_1' ? (data?.team_1Team?.name || 'Team 1') : (data?.team_2Team?.name || 'Team 2')
              const teamLabel = mtoRitConfirmModal.team === teamAKey ? 'A' : 'B'
              
              return (
                <>
                  <p style={{ marginBottom: '16px', fontSize: '16px' }}>
                    Confirm {mtoRitConfirmModal.type === 'mto_blood' ? 'MTO - Blood' : 
                            mtoRitConfirmModal.type === 'rit_no_blood' ? 'RIT - No Blood' :
                            mtoRitConfirmModal.type === 'rit_weather' ? 'RIT - Weather' :
                            'RIT - Toilet'} for Player #{mtoRitConfirmModal.playerNumber}
                    {playerName && ` (${playerName})`} - Team {teamLabel} ({teamName})?
                  </p>
                  <p style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--muted)' }}>
                    Set {data?.set?.index || 1} | Score: {data?.set?.team_1Points || 0} - {data?.set?.team_2Points || 0}
                  </p>
                </>
              )
            })()}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmMtoRit}
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
              <button
                onClick={cancelMtoRitConfirm}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
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

      {/* MTO/RIT Countdown Modal */}
      {mtoRitCountdownModal && (
        <Modal
          title={`${mtoRitCountdownModal.type === 'mto_blood' ? 'MTO - Blood' : 
                  mtoRitCountdownModal.type === 'rit_no_blood' ? 'RIT - No Blood' :
                  mtoRitCountdownModal.type === 'rit_weather' ? 'RIT - Weather' :
                  'RIT - Toilet'} - Player #${mtoRitCountdownModal.playerNumber}`}
          open={true}
          onClose={mtoRitCountdownModal.started ? stopMtoRitCountdown : () => setMtoRitCountdownModal(null)}
          width={500}
          hideCloseButton={!mtoRitCountdownModal.started}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {mtoRitCountdownModal.started ? (
              <>
                <div style={{ fontSize: '72px', fontWeight: 800, marginBottom: '16px', color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {Math.floor(mtoRitCountdownModal.countdown / 60)}:{(mtoRitCountdownModal.countdown % 60).toString().padStart(2, '0')}
                </div>
                <p style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--muted)' }}>
                  Set {mtoRitCountdownModal.setIndex} | Score: {mtoRitCountdownModal.team_1Points} - {mtoRitCountdownModal.team_2Points}
                </p>
                <p style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--muted)' }}>
                  Started: {new Date(mtoRitCountdownModal.startTime).toLocaleTimeString()}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={stopMtoRitCountdown}
                      style={{
                        padding: '10px 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        background: '#6b7280',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Stop Countdown
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
                    <button
                      onClick={handlePlayerRecovered}
                      style={{
                        padding: '12px 32px',
                        fontSize: '16px',
                        fontWeight: 600,
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Player Recovered
                    </button>
                    <button
                      onClick={handlePlayerNotRecovered}
                      style={{
                        padding: '12px 32px',
                        fontSize: '16px',
                        fontWeight: 600,
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Player Not Recovered
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <p style={{ marginBottom: '24px', fontSize: '16px' }}>
                  Countdown stopped
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={handlePlayerRecovered}
                    style={{
                      padding: '12px 32px',
                      fontSize: '16px',
                      fontWeight: 600,
                      background: '#22c55e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Player Recovered
                  </button>
                  <button
                    onClick={handlePlayerNotRecovered}
                    style={{
                      padding: '12px 32px',
                      fontSize: '16px',
                      fontWeight: 600,
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Player Not Recovered
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
      
      {sanctionConfirmModal && (() => {
        const teamData = sanctionConfirmModal.team === 'team_1' ? data?.team_1Team : data?.team_2Team
        const teamColor = teamData?.color || (sanctionConfirmModal.team === 'team_1' ? '#ef4444' : '#3b82f6')
        const teamLabel = sanctionConfirmModal.team === teamAKey ? 'A' : 'B'
        const teamName = teamData?.name || (sanctionConfirmModal.team === 'team_1' ? 'Team 1' : 'Team 2')
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
              {sanctionConfirmModal.sanctionType === 'rude_conduct' && <div className="sanction-card red" style={{ width: '28px', height: '38px' }}></div>}
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
              {sanctionConfirmModal.sanctionType === 'rude_conduct' && 'Penalty'} {/* rude_conduct is treated as penalty */}
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
          title="Reopen Set"
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
          team_1Points={setEndTimeModal.team_1Points}
          team_2Points={setEndTimeModal.team_2Points}
          defaultTime={setEndTimeModal.defaultTime}
          teamAKey={teamAKey}
          isMatchEnd={setEndTimeModal.isMatchEnd}
          onConfirm={confirmSetEndTime}
          onCancel={() => setSetEndTimeModal(null)}
          onUndo={async () => {
            // Undo last point/rally
            if (!data?.events || !data?.set) return
            
            const sortedEvents = [...data.events].sort((a, b) => {
              const aSeq = a.seq || 0
              const bSeq = b.seq || 0
              if (aSeq !== 0 || bSeq !== 0) {
                return bSeq - aSeq
              }
              const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
              const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
              return bTime - aTime
            })
            
            const lastEvent = sortedEvents[0]
            if (lastEvent) {
              await db.events.delete(lastEvent.id)
              
              // Update set points
              const newTeam_1Points = lastEvent.payload?.team === 'team_1' 
                ? setEndTimeModal.team_1Points - 1 
                : setEndTimeModal.team_1Points
              const newTeam_2Points = lastEvent.payload?.team === 'team_2' 
                ? setEndTimeModal.team_2Points - 1 
                : setEndTimeModal.team_2Points
              
              await db.sets.update(data.set.id, {
                team_1Points: newTeam_1Points,
                team_2Points: newTeam_2Points
              })
              
              // Close the modal
              setSetEndTimeModal(null)
            }
          }}
          onBMP={(teamKey) => {
            // Request BMP
            setSetEndTimeModal(null)
            setChallengeModal({ type: 'request', team: teamKey })
          }}
          leftTeamKey={leftIsTeam_1 ? 'team_1' : 'team_2'}
          rightTeamKey={leftIsTeam_1 ? 'team_2' : 'team_1'}
        />
      )}
      
      {matchEndModal && data?.match && (
        <MatchEndModal
          matchId={matchId}
          data={data}
          teamAKey={teamAKey}
          openSignature={openSignature}
          setOpenSignature={setOpenSignature}
          onShowScoresheet={async () => {
            try {
              const scoresheetData = {
                match: data.match,
                team_1Team: data.team_1Team,
                team_2Team: data.team_2Team,
                team_1Players: data.team_1Players,
                team_2Players: data.team_2Players,
                sets: data.sets,
                events: data.events,
                sanctions: []
              };
              sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData));
              
              // Check if scoresheet window is already open
              if (scoresheetWindowRef.current && !scoresheetWindowRef.current.closed) {
                // Window is open - send refresh message
                try {
                  scoresheetWindowRef.current.postMessage({ type: 'REFRESH_SCORESHEET' }, '*')
                  // Also update sessionStorage (in case message doesn't work)
                  scoresheetWindowRef.current.location.reload()
                } catch (e) {
                  // If postMessage fails, just reload
                  scoresheetWindowRef.current.location.reload()
                }
              } else {
                // Window is not open - open a new one
                const newWindow = window.open('/scoresheet_beach.html', '_blank')
                if (newWindow) {
                  scoresheetWindowRef.current = newWindow
                }
              }
            } catch (error) {
              console.error('Error opening scoresheet:', error);
              alert('Error opening scoresheet: ' + error.message);
            }
          }}
          onDownloadData={async () => {
            try {
              const allData = {
                match: data.match,
                team_1Team: data.team_1Team,
                team_2Team: data.team_2Team,
                team_1Players: data.team_1Players,
                team_2Players: data.team_2Players,
                sets: data.sets,
                events: data.events
              };
              const dataStr = JSON.stringify(allData, null, 2);
              const dataBlob = new Blob([dataStr], { type: 'application/json' });
              const url = URL.createObjectURL(dataBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `match_${matchId}_data.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (error) {
              console.error('Error downloading data:', error);
              alert('Error downloading data: ' + error.message);
            }
          }}
          onConfirmEnd={async () => {
            // Download PDF from screenshots and data in ZIP
            try {
              // Dynamic imports
              const JSZip = (await import('jszip')).default;
              const html2canvas = (await import('html2canvas')).default;
              const { jsPDF } = await import('jspdf');
              
              const zip = new JSZip();
              
              // Open scoresheet in hidden iframe to capture screenshots
              const iframe = document.createElement('iframe');
              iframe.style.position = 'absolute';
              iframe.style.left = '-9999px';
              iframe.style.width = '297mm';
              iframe.style.height = '210mm';
              document.body.appendChild(iframe);
              
              // Load scoresheet data
              const scoresheetData = {
                match: data.match,
                team_1Team: data.team_1Team,
                team_2Team: data.team_2Team,
                team_1Players: data.team_1Players,
                team_2Players: data.team_2Players,
                sets: data.sets,
                events: data.events,
                sanctions: []
              };
              sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData));
              
              iframe.src = '/scoresheet_beach.html';
              
              await new Promise((resolve) => {
                iframe.onload = async () => {
                  try {
                    // Wait for scoresheet to render
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Create PDF (A4 landscape: 297mm x 210mm)
                    const pdf = new jsPDF({
                      orientation: 'landscape',
                      unit: 'mm',
                      format: [297, 210]
                    });
                    
                    // Capture each page and add to PDF
                    const pages = ['page-1', 'page-2', 'page-3'];
                    const imageDataUrls = [];
                    
                    for (let i = 0; i < pages.length; i++) {
                      const pageElement = iframe.contentDocument?.getElementById(pages[i]);
                      if (pageElement) {
                        const canvas = await html2canvas(pageElement, {
                          scale: 2,
                          useCORS: true,
                          logging: false
                        });
                        const imgData = canvas.toDataURL('image/png');
                        imageDataUrls.push(imgData);
                        
                        // Add page to PDF (except first page which is added automatically)
                        if (i > 0) {
                          pdf.addPage([297, 210], 'landscape');
                        }
                        
                        // Add image to PDF page (full page, landscape A4)
                        pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
                        
                        // Also add to ZIP for backup
                        const base64Data = imgData.split(',')[1];
                        zip.file(`scoresheet_page_${i + 1}.png`, base64Data, { base64: true });
                      }
                    }
                    
                    // Add PDF to ZIP
                    const pdfBlob = pdf.output('blob');
                    zip.file('scoresheet.pdf', pdfBlob);
                    
                    // Add data JSON
                    const allData = {
                      match: data.match,
                      team_1Team: data.team_1Team,
                      team_2Team: data.team_2Team,
                      team_1Players: data.team_1Players,
                      team_2Players: data.team_2Players,
                      sets: data.sets,
                      events: data.events
                    };
                    zip.file('match_data.json', JSON.stringify(allData, null, 2));
                    
                    // Download PDF directly
                    pdf.save(`match_${matchId}_scoresheet.pdf`);
                    
                    // Also generate and download ZIP (with PDF, PNGs, and JSON)
                    const blob = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `match_${matchId}_scoresheet.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    document.body.removeChild(iframe);
                    
                    // Close modal and go home after downloads complete
                    onGoHome();
                    resolve();
                  } catch (error) {
                    console.error('Error capturing screenshots:', error);
                    alert('Error capturing screenshots: ' + error.message);
                    document.body.removeChild(iframe);
                    resolve();
                  }
                };
              });
            } catch (error) {
              console.error('Error creating PDF/ZIP:', error);
              alert('Error creating PDF/ZIP file: ' + error.message);
            }
          }}
          onGoHome={() => {
            setMatchEndModal(false);
            if (onFinishSet) onFinishSet(data.set);
          }}
          onReopenMatch={() => {
            setMatchEndModal(false);
            // Just close the modal, don't call onFinishSet - allows user to continue viewing the match
          }}
        />
      )}
      
      {sanctionConfirm && (
        <Modal
          title="Confirm Sanction"
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
                       const sideTeamKey = sanctionConfirm.side === 'left' ? (leftIsTeam_1 ? 'team_1' : 'team_2') : (leftIsTeam_1 ? 'team_2' : 'team_1')
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
      {connectionModal && (
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
                  Enable Connection
                </span>
                <div style={{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  background: (connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team_1TeamConnectionEnabled : team_2TeamConnectionEnabled) ? '#22c55e' : '#6b7280',
                  borderRadius: '12px',
                  transition: 'background 0.2s',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (connectionModal === 'referee') {
                    handleRefereeConnectionToggle(!refereeConnectionEnabled)
                  } else if (connectionModal === 'teamA') {
                    handleTeam_1ConnectionToggle(!team_1TeamConnectionEnabled)
                  } else if (connectionModal === 'teamB') {
                    handleTeam_2ConnectionToggle(!team_2TeamConnectionEnabled)
                  }
                }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: (connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team_1TeamConnectionEnabled : team_2TeamConnectionEnabled) ? '22px' : '2px',
                    width: '20px',
                    height: '20px',
                    background: '#fff',
                    borderRadius: '50%',
                    transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }} />
                </div>
              </label>
              
              {(connectionModal === 'referee' ? refereeConnectionEnabled : connectionModal === 'teamA' ? team_1TeamConnectionEnabled : team_2TeamConnectionEnabled) && (
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
                        ? (data?.match?.team_1Pin || '—')
                        : (data?.match?.team_2Pin || '—')}
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
              
              {/* Call Referee Button - only show for referee connection modal */}
              {connectionModal === 'referee' && refereeConnectionEnabled && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      callReferee()
                      setConnectionModal(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#b91c1c'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#dc2626'}
                  >
                    Call Referee
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TO/SUB Thought Bubble Popover */}
      {toSubModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setToSubModal(null)
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
              left: `${toSubModalPosition.x}px`,
              top: `${toSubModalPosition.y}px`,
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px',
              padding: '16px',
              minWidth: '200px',
              maxWidth: '300px',
              maxHeight: '400px',
              overflowY: 'auto',
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
                  Timeouts — {toSubModal.side === 'left' ? leftTeam.name : rightTeam.name}
                </span>
                <button
                  onClick={() => setToSubModal(null)}
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
              
              {toSubModal.type === 'to' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {getTimeoutEvents(toSubModal.side).length === 0 ? (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '8px' }}>
                      No timeouts requested
                    </div>
                  ) : (
                    getTimeoutEvents(toSubModal.side).map((event, index) => {
                      const teamALabel = data?.match?.coinTossTeamA === 'team_1' ? 'A' : 'B'
                      const teamBLabel = data?.match?.coinTossTeamB === 'team_1' ? 'A' : 'B'
                      const team_1Label = data?.match?.coinTossTeamA === 'team_1' ? 'A' : (data?.match?.coinTossTeamB === 'team_1' ? 'B' : 'A')
                      const team_2Label = data?.match?.coinTossTeamA === 'team_2' ? 'A' : (data?.match?.coinTossTeamB === 'team_2' ? 'B' : 'B')
                      return (
                        <div key={event.id || index} style={{
                          padding: '8px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: 'var(--text)'
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                            Timeout {index + 1}
                          </div>
                          <div style={{ color: 'var(--muted)' }}>
                            {team_1Label} {event.team_1Score} : {event.team_2Score} {team_2Label}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : null}
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
      
      {/* Court Switch Alert */}
      {courtSwitchAlert && (
        <div style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--accent)',
          color: '#000',
          padding: '16px 32px',
          borderRadius: '8px',
          fontSize: '18px',
          fontWeight: 700,
          zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          {courtSwitchAlert.message}
        </div>
      )}
      
      {/* Court Switch Modal */}
      {courtSwitchModal && (
        <Modal
          title="Court Switch Required"
          open={true}
          onClose={() => {}}
          width={450}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
              Court Switch
            </p>
            <p style={{ marginBottom: '16px', fontSize: '16px' }}>
              Score: Team {teamALabel} {leftIsTeam_1 ? courtSwitchModal.team_1Points : courtSwitchModal.team_2Points} - {leftIsTeam_1 ? courtSwitchModal.team_2Points : courtSwitchModal.team_1Points} Team {teamBLabel}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={confirmCourtSwitch}
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
                  OK - Switch Courts
                </button>
                <button
                  onClick={cancelCourtSwitch}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel - Undo Last Point
                </button>
              </div>
              {courtSwitchModal.teamThatScored && (
                <button
                  onClick={() => {
                    // BMP request should be from the team that LOST the point (opposite of teamThatScored)
                    const teamThatLost = courtSwitchModal.teamThatScored === 'team_1' ? 'team_2' : 'team_1'
                    // Store court switch info to execute after BMP outcome
                    const pendingCourtSwitch = {
                      set: courtSwitchModal.set,
                      team_1Points: courtSwitchModal.team_1Points,
                      team_2Points: courtSwitchModal.team_2Points,
                      teamThatScored: courtSwitchModal.teamThatScored
                    }
                    setCourtSwitchModal(null)
                    setChallengeModal({ type: 'request', team: teamThatLost, pendingCourtSwitch })
                  }}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: '#f97316',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <img 
                    src={challengeIcon} 
                    alt="BMP" 
                    style={{ width: '20px', height: '20px' }}
                  />
                  BMP {(courtSwitchModal.teamThatScored === 'team_1' ? 'team_2' : 'team_1') === teamAKey ? 'Team A' : 'Team B'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      
      {/* Technical TO Modal */}
      {technicalTOModal && (
          <Modal
          title={technicalTOModal.started ? "Technical Time-out" : "Confirm TTO"}
            open={true}
            onClose={technicalTOModal.started ? stopTechnicalTO : () => {}}
          width={450}
            hideCloseButton={!technicalTOModal.started}
          >
            <div style={{ padding: '24px', textAlign: 'center' }}>
              {technicalTOModal.started ? (
                <>
                  <div style={{ fontSize: '64px', fontWeight: 800, marginBottom: '16px', color: 'var(--accent)' }}>
                    {technicalTOModal.countdown}"
                  </div>
                  <p style={{ marginBottom: '24px', color: 'var(--muted)' }}>
                    Technical Time-out in progress
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={stopTechnicalTO}
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
                      Stop TTO
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>
                    Technical Time-out
                  </p>
                  <p style={{ marginBottom: '16px', fontSize: '16px' }}>
                    Score: Team {teamALabel} {leftIsTeam_1 ? technicalTOModal.team_1Points : technicalTOModal.team_2Points} - {leftIsTeam_1 ? technicalTOModal.team_2Points : technicalTOModal.team_1Points} Team {teamBLabel}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                      <button
                        onClick={confirmTechnicalTO}
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
                        Confirm TTO
                      </button>
                      <button
                        onClick={cancelTechnicalTO}
                        style={{
                          padding: '12px 32px',
                          fontSize: '16px',
                          fontWeight: 600,
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel - Undo Last Point
                      </button>
                    </div>
                    {technicalTOModal.teamThatScored && (
                      <button
                        onClick={() => {
                          // BMP request should be from the team that LOST the point (opposite of teamThatScored)
                          const teamThatLost = technicalTOModal.teamThatScored === 'team_1' ? 'team_2' : 'team_1'
                          // Store TTO info to execute after BMP outcome
                          const pendingTTO = {
                            set: technicalTOModal.set,
                            team_1Points: technicalTOModal.team_1Points,
                            team_2Points: technicalTOModal.team_2Points,
                            teamThatScored: technicalTOModal.teamThatScored
                          }
                          setTechnicalTOModal(null)
                          setChallengeModal({ type: 'request', team: teamThatLost, pendingTTO })
                        }}
                        style={{
                          padding: '12px 32px',
                          fontSize: '16px',
                          fontWeight: 600,
                          background: '#f97316',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <img 
                          src={challengeIcon} 
                          alt="BMP" 
                          style={{ width: '20px', height: '20px' }}
                        />
                        Challenge {(technicalTOModal.teamThatScored === 'team_1' ? 'team_2' : 'team_1') === teamAKey ? 'Team A' : 'Team B'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Modal>
      )}
      
      
      {/* Set Transition Modal (after set 1 or before set 3) */}
      {setTransitionModal && (() => {
        const { setIndex, isSet3 } = setTransitionModal
        const teamAKey = data?.match?.coinTossTeamA || 'team_1'
        const teamBKey = data?.match?.coinTossTeamB || 'team_2'
        
        // Get team who lost coin toss (for display at top)
        const coinTossWinner = data?.match?.coinTossData?.coinTossWinner
        const coinTossLoser = coinTossWinner === 'teamA' ? 'teamB' : 'teamA'
        const loserTeamKey = coinTossLoser === 'teamA' ? teamAKey : teamBKey
        const loserTeamData = loserTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
        const loserTeamName = loserTeamData?.name || `Team ${coinTossLoser === 'teamA' ? 'A' : 'B'}`
        const loserTeamLabel = coinTossLoser === 'teamA' ? 'A' : 'B'
        
        // Get team data based on selected left team
        const leftTeamKey = setTransitionSelectedLeftTeam === 'A' ? teamAKey : teamBKey
        const rightTeamKey = setTransitionSelectedLeftTeam === 'A' ? teamBKey : teamAKey
        const leftTeamData = leftTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
        const rightTeamData = rightTeamKey === 'team_1' ? data?.team_1Team : data?.team_2Team
        const leftTeamName = leftTeamData?.name || `Team ${setTransitionSelectedLeftTeam}`
        const rightTeamName = rightTeamData?.name || `Team ${setTransitionSelectedLeftTeam === 'A' ? 'B' : 'A'}`
        const leftTeamColor = leftTeamData?.color || (leftTeamKey === 'team_1' ? '#ef4444' : '#3b82f6')
        const rightTeamColor = rightTeamData?.color || (rightTeamKey === 'team_1' ? '#ef4444' : '#3b82f6')
        
        // Determine which side is serving
        const servingTeamLabel = setTransitionSelectedFirstServe
        const leftTeamLabel = setTransitionSelectedLeftTeam
        const rightTeamLabel = setTransitionSelectedLeftTeam === 'A' ? 'B' : 'A'
        const leftIsServing = servingTeamLabel === leftTeamLabel
        const rightIsServing = servingTeamLabel === rightTeamLabel
        
        // Get players for each team
        const leftTeamPlayers = leftTeamKey === 'team_1' ? data?.team_1Players : data?.team_2Players
        const rightTeamPlayers = rightTeamKey === 'team_1' ? data?.team_1Players : data?.team_2Players
        
        // Get coin toss data for player info (captain status, names)
        const coinTossData = data?.match?.coinTossData?.players || {}
        // Determine which coin toss team (A or B) corresponds to left/right team keys
        const leftTeamCoinTossTeam = leftTeamKey === teamAKey ? 'teamA' : 'teamB'
        const rightTeamCoinTossTeam = rightTeamKey === teamAKey ? 'teamA' : 'teamB'
        const leftTeamCoinTossData = coinTossData[leftTeamCoinTossTeam] || {}
        const rightTeamCoinTossData = coinTossData[rightTeamCoinTossTeam] || {}
        
        // Helper function to get player info for a position
        const getPlayerInfo = (teamPlayers, coinTossTeamData, playerIndex) => {
          if (!teamPlayers || teamPlayers.length < 2) {
            return { number: null, lastName: '', firstName: '', isCaptain: false }
          }
          const player = teamPlayers[playerIndex] || {} // 0 for player 1, 1 for player 2
          const coinTossPlayer = (coinTossTeamData && coinTossTeamData[`player${playerIndex + 1}`]) || {}
          return {
            number: (coinTossPlayer.number !== undefined && coinTossPlayer.number !== null) 
              ? coinTossPlayer.number 
              : ((player.number !== undefined && player.number !== null) ? player.number : null),
            lastName: coinTossPlayer.lastName || player.lastName || '',
            firstName: coinTossPlayer.firstName || player.firstName || '',
            isCaptain: coinTossPlayer.isCaptain || false
          }
        }
        
        // Calculate service order positions
        // I, III = serving team positions
        // II, IV = receiving team positions
        const leftServiceOrder = setTransitionServiceOrder[leftTeamLabel === 'A' ? 'teamA' : 'teamB']
        const rightServiceOrder = setTransitionServiceOrder[rightTeamLabel === 'A' ? 'teamA' : 'teamB']
        
        // For serving team: I and III
        // For receiving team: II and IV
        const leftPlayer1 = getPlayerInfo(leftTeamPlayers, leftTeamCoinTossData, 0)
        const leftPlayer2 = getPlayerInfo(leftTeamPlayers, leftTeamCoinTossData, 1)
        const rightPlayer1 = getPlayerInfo(rightTeamPlayers, rightTeamCoinTossData, 0)
        const rightPlayer2 = getPlayerInfo(rightTeamPlayers, rightTeamCoinTossData, 1)
        
        // Determine positions based on service order and serving status
        // Ensure we have valid player objects (default to empty object if null)
        const safeLeftPlayer1 = leftPlayer1 || { number: null, lastName: '', firstName: '', isCaptain: false }
        const safeLeftPlayer2 = leftPlayer2 || { number: null, lastName: '', firstName: '', isCaptain: false }
        const safeRightPlayer1 = rightPlayer1 || { number: null, lastName: '', firstName: '', isCaptain: false }
        const safeRightPlayer2 = rightPlayer2 || { number: null, lastName: '', firstName: '', isCaptain: false }
        
        const getLeftPositions = () => {
          if (leftIsServing) {
            // Serving: I and III
            if (leftServiceOrder === '1_2') {
              return {
                I: safeLeftPlayer1,
                III: safeLeftPlayer2,
                II: safeRightPlayer1,
                IV: safeRightPlayer2
              }
            } else {
              return {
                I: safeLeftPlayer2,
                III: safeLeftPlayer1,
                II: safeRightPlayer2,
                IV: safeRightPlayer1
              }
            }
          } else {
            // Receiving: II and IV
            if (leftServiceOrder === '1_2') {
              return {
                I: safeRightPlayer1,
                III: safeRightPlayer2,
                II: safeLeftPlayer1,
                IV: safeLeftPlayer2
              }
            } else {
              return {
                I: safeRightPlayer2,
                III: safeRightPlayer1,
                II: safeLeftPlayer2,
                IV: safeLeftPlayer1
              }
            }
          }
        }
        
        const leftPositions = getLeftPositions()
        
        // Calculate right team positions
        const getRightPositions = () => {
          if (rightIsServing) {
            // Serving: I and III
            if (rightServiceOrder === '1_2') {
              return {
                I: safeRightPlayer1,
                III: safeRightPlayer2,
                II: safeLeftPlayer1,
                IV: safeLeftPlayer2
              }
            } else {
              return {
                I: safeRightPlayer2,
                III: safeRightPlayer1,
                II: safeLeftPlayer2,
                IV: safeLeftPlayer1
              }
            }
          } else {
            // Receiving: II and IV
            if (rightServiceOrder === '1_2') {
              return {
                I: safeLeftPlayer1,
                III: safeLeftPlayer2,
                II: safeRightPlayer1,
                IV: safeRightPlayer2
              }
            } else {
              return {
                I: safeLeftPlayer2,
                III: safeLeftPlayer1,
                II: safeRightPlayer2,
                IV: safeRightPlayer1
              }
            }
          }
        }
        
        const rightPositions = getRightPositions()
        
        // Ensure positions objects exist
        if (!leftPositions || !rightPositions) {
          return (
            <Modal
              title={isSet3 ? "Set 3 - Configure Teams and Service" : "Set 2 - Configure Teams and Service"}
              open={true}
              onClose={() => {}}
              width={600}
              hideCloseButton={true}
            >
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <p>Loading player data...</p>
              </div>
            </Modal>
          )
        }
        
        return (
          <Modal
            title={isSet3 ? "Set 3 - Configure Teams and Service" : "Set 2 - Configure Teams and Service"}
            open={true}
            onClose={() => {}}
            width={600}
            hideCloseButton={true}
          >
            <div style={{ padding: '24px' }}>
              {/* 60 Second Countdown Timer - Prominent for Referees */}
              <div style={{ 
                marginBottom: '24px', 
                padding: '16px', 
                background: 'rgba(59, 130, 246, 0.2)', 
                borderRadius: '8px',
                border: '2px solid rgba(59, 130, 246, 0.5)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '48px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {setTransitionCountdown}"
                </div>
              </div>
              
              {/* Show coin toss loser at top (only for after set 1) */}
              {!isSet3 && coinTossLoser && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '12px', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '4px' }}>
                    Coin Toss Loser
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>
                    Team {loserTeamLabel} - {loserTeamName}
                  </div>
                </div>
              )}
              
              {/* 3rd Set Coin Toss Winner (only for set 3) */}
              {isSet3 && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '16px', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 600 }}>3rd Set Coin Toss Winner *</h3>
                  <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="set3CoinTossWinner"
                        value="teamA"
                        checked={set3CoinTossWinner === 'teamA'}
                        onChange={(e) => setSet3CoinTossWinner('teamA')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '16px', fontWeight: 600 }}>Team A</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="set3CoinTossWinner"
                        value="teamB"
                        checked={set3CoinTossWinner === 'teamB'}
                        onChange={(e) => setSet3CoinTossWinner('teamB')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '16px', fontWeight: 600 }}>Team B</span>
                    </label>
                  </div>
                  {!set3CoinTossWinner && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', textAlign: 'center' }}>
                      Please select the coin toss winner for Set 3
                    </div>
                  )}
                </div>
              )}
              
              <p style={{ marginBottom: '24px', fontSize: '16px', textAlign: 'center' }}>
                Configure teams and service for {isSet3 ? 'Set 3' : 'Set 2'}.
              </p>
              
              {/* Teams on Sides */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  alignItems: 'flex-start',
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
                        src={mikasaVolleyball}
                        alt="Serving team"
                        style={{
                          width: '38px',
                          height: '38px',
                          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
                          marginTop: '8px',
                          marginBottom: '12px'
                        }}
                      />
                    )}
                  
                    {/* Service Order underneath box */}
                  <div style={{ 
                      marginTop: '12px', 
                      padding: '8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '6px',
                      textAlign: 'left'
                    }}>
                      <div style={{ fontSize: '13px', color: '#fff', marginBottom: '10px', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Service Rotation
                      </div>
                      {leftPositions && ['I', 'II', 'III', 'IV'].map((position) => {
                        const player = leftPositions[position]
                        if (!player) return null
                        const isServingPosition = position === 'I' || position === 'III'
                        return (
                          <div key={position} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            marginBottom: '6px',
                            fontSize: '12px'
                          }}>
                            <div style={{ 
                              minWidth: '32px',
                              fontWeight: 700,
                              color: '#fff',
                              fontSize: '14px'
                            }}>
                              {position}
                            </div>
                            {player.number !== null && player.number !== undefined ? (
                              <div style={{
                                width: player.isCaptain ? '28px' : '24px',
                                height: player.isCaptain ? '28px' : '24px',
                                borderRadius: '50%',
                                background: player.isCaptain ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)',
                                border: player.isCaptain ? '2px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: player.isCaptain ? '#000' : '#fff'
                              }}>
                                {player.number}
                              </div>
                            ) : (
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.5)'
                              }}>
                                ?
                              </div>
                            )}
                            <div style={{ 
                              fontSize: '10px', 
                              color: isServingPosition ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)',
                              fontStyle: 'italic'
                            }}>
                              {isServingPosition ? 'Serve' : 'Receive'}
                            </div>
                          </div>
                        )
                      })}
                      <button
                        onClick={() => {
                          const teamKey = leftTeamLabel === 'A' ? 'teamA' : 'teamB'
                          setSetTransitionServiceOrder({ 
                            ...setTransitionServiceOrder, 
                            [teamKey]: setTransitionServiceOrder[teamKey] === '1_2' ? '2_1' : '1_2'
                          })
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          width: '100%',
                          marginTop: '8px'
                        }}
                      >
                        Switch Serve Rotation
                      </button>
                  </div>
                </div>
                
                  {/* Switch Teams and Switch Serve Buttons (between boxes) */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '8px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingTop: '60px'
                  }}>
                  <button
                    onClick={() => {
                      setSetTransitionSelectedLeftTeam(setTransitionSelectedLeftTeam === 'A' ? 'B' : 'A')
                    }}
                    style={{
                      padding: '8px 16px',
                        fontSize: '13px',
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
                  <button
                    onClick={() => {
                      setSetTransitionSelectedFirstServe(setTransitionSelectedFirstServe === 'A' ? 'B' : 'A')
                    }}
                    style={{
                      padding: '8px 16px',
                        fontSize: '13px',
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
                        src={mikasaVolleyball}
                        alt="Serving team"
                        style={{
                          width: '38px',
                          height: '38px',
                          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
                          marginTop: '8px',
                          marginBottom: '12px'
                        }}
                      />
                    )}
                  
                    {/* Service Order underneath box */}
                  <div style={{ 
                      marginTop: '12px', 
                      padding: '8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '6px',
                      textAlign: 'left'
                    }}>
                      <div style={{ fontSize: '13px', color: '#fff', marginBottom: '10px', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Service Rotation
                      </div>
                      {rightPositions && ['I', 'II', 'III', 'IV'].map((position) => {
                        const rightPlayer = rightPositions[position]
                        if (!rightPlayer) return null
                        const isServingPosition = position === 'I' || position === 'III'
                        return (
                          <div key={position} style={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '6px',
                            fontSize: '12px'
                          }}>
                            <div style={{ 
                              minWidth: '32px',
                              fontWeight: 700,
                              color: '#fff',
                              fontSize: '14px'
                            }}>
                              {position}
                            </div>
                            {rightPlayer.number !== null && rightPlayer.number !== undefined ? (
                              <div style={{
                                width: rightPlayer.isCaptain ? '28px' : '24px',
                                height: rightPlayer.isCaptain ? '28px' : '24px',
                                borderRadius: '50%',
                                background: rightPlayer.isCaptain ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)',
                                border: rightPlayer.isCaptain ? '2px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: rightPlayer.isCaptain ? '#000' : '#fff'
                              }}>
                                {rightPlayer.number}
                              </div>
                            ) : (
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.5)'
                              }}>
                                ?
                              </div>
                            )}
                            <div style={{ 
                              fontSize: '10px', 
                              color: isServingPosition ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)',
                              fontStyle: 'italic'
                            }}>
                              {isServingPosition ? 'Serve' : 'Receive'}
                            </div>
                          </div>
                        )
                      })}
                  <button
                    onClick={() => {
                          const teamKey = rightTeamLabel === 'A' ? 'teamA' : 'teamB'
                          setSetTransitionServiceOrder({ 
                            ...setTransitionServiceOrder, 
                            [teamKey]: setTransitionServiceOrder[teamKey] === '1_2' ? '2_1' : '1_2'
                          })
                    }}
                    style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                      fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '4px',
                      cursor: 'pointer',
                          width: '100%',
                          marginTop: '8px'
                    }}
                  >
                        Switch Serve Rotation
                  </button>
                </div>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={confirmSetTransition}
                  disabled={isSet3 && !set3CoinTossWinner}
                  style={{
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 600,
                    background: isSet3 && !set3CoinTossWinner ? 'rgba(255, 255, 255, 0.1)' : 'var(--accent)',
                    color: isSet3 && !set3CoinTossWinner ? 'var(--muted)' : '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isSet3 && !set3CoinTossWinner ? 'not-allowed' : 'pointer'
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
          title="Confirm Undo"
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
      
      {postMatchSignature && (
        <Modal
          title={`${postMatchSignature === 'team_1-captain' ? (data?.team_1Team?.name || 'Team 1') : (data?.team_2Team?.name || 'Team 2')} Captain Signature`}
          open={true}
          onClose={() => setPostMatchSignature(null)}
          width={500}
        >
          <div style={{ padding: '24px' }}>
            <SignaturePad
              onSave={async (signatureDataUrl) => {
                const fieldName = postMatchSignature === 'team_1-captain' ? 'postMatchSignatureTeam_1Captain' : 'postMatchSignatureTeam_2Captain'
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

function LineupModal({ team, teamData, players, matchId, setIndex, mode = 'initial', lineup: presetLineup = null, teamAKey, teamBKey, onClose, onSave }) {
  const [lineup, setLineup] = useState(() => {
    if (presetLineup) {
      // Beach volleyball: Only positions I and II
      return [
        presetLineup['I'] !== undefined ? String(presetLineup['I'] ?? '') : '',
        presetLineup['II'] !== undefined ? String(presetLineup['II'] ?? '') : ''
      ]
    }
    return ['', ''] // [I, II]
  })
  const [errors, setErrors] = useState({}) // Use an object for specific error messages
  const [confirmMessage, setConfirmMessage] = useState(null)
  
  // Get all events to check for disqualifications
  const events = useLiveQuery(async () => {
    return await db.events.where('matchId').equals(matchId).toArray()
  }, [matchId])

  const handleInputChange = (index, value) => {
    const numValue = value.replace(/[^0-9]/g, '')
    const newLineup = [...lineup]
    newLineup[index] = numValue
    setLineup(newLineup)

    // Clear error for this specific field when user types
    if (errors[index]) {
      const newErrors = { ...errors }
      delete newErrors[index]
      setErrors(newErrors)
    }
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

      const player = players?.find(p => p.number === num)

      // 3. Not on roster
      if (!player) {
        newErrors[i] = 'Not on roster'
        return
      }

      // 4. Is disqualified - cannot enter the game ever again (check all events, not just current set)
      if (events) {
        const isDisqualified = events.some(e => 
          e.type === 'sanction' && 
          e.payload?.team === team &&
          String(e.payload?.playerNumber) === String(num) &&
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

    // Check if captain is in court
    const captain = players?.find(p => p.isCaptain)
    const captainInCourt = captain && lineupNumbers.includes(captain.number)
    
    // Beach volleyball: Only positions I and II
    const lineupData = {
      I: lineupNumbers[0] || '',
      II: lineupNumbers[1] || ''
    }
    
    // Save lineup as an event (mark as initial lineup or manual override)
    if (matchId && setIndex) {
      // Save lineup with sequence number
      (async () => {
        // Get next sequence number
        const allEvents = await db.events.where('matchId').equals(matchId).toArray()
        const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)
        
        await db.events.add({
          matchId,
          setIndex,
          ts: new Date().toISOString(),
          type: 'lineup',
          payload: {
            team,
            lineup: lineupData,
            isInitial: mode === 'initial'
          },
          seq: maxSeq + 1
        })
        
        setConfirmMessage(captainInCourt ? 'Captain on court' : 'Captain not on court')
        
        // Check if both lineups are now set - if so, award any pending penalty points
        // Reuse allEvents from above to avoid redeclaration
        const team_1LineupSet = allEvents.some(e => 
          e.type === 'lineup' && 
          e.payload?.team === 'team_1' && 
          e.setIndex === setIndex &&
          e.payload?.isInitial
        )
        const team_2LineupSet = allEvents.some(e => 
          e.type === 'lineup' && 
          e.payload?.team === 'team_2' && 
          e.setIndex === setIndex &&
          e.payload?.isInitial
        )
        
        if (team_1LineupSet && team_2LineupSet) {
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
              const otherTeam = sanctionedTeam === 'team_1' ? 'team_2' : 'team_1'
              
              // Award point to the other team
              const currentSet = await db.sets.where('matchId').equals(matchId).and(s => s.index === setIndex).first()
              if (currentSet) {
                const field = otherTeam === 'team_1' ? 'team_1Points' : 'team_2Points'
                const currentPoints = currentSet[field] || 0
                await db.sets.update(currentSet.id, {
                  [field]: currentPoints + 1
                })
                
                // Log point event
                await db.events.add({
                  matchId,
                  setIndex,
                  ts: new Date().toISOString(),
                  type: 'point',
                  payload: { team: otherTeam, fromPenalty: true },
                  seq: maxSeq + 2 + pendingPenalties.indexOf(penalty)
                })
                
              }
            }
          }
        }
      })().catch(err => {
        // Don't auto-close - let user close manually with close button
        setErrors({0: 'Save failed', 1: 'Save failed', 2: 'Save failed', 3: 'Save failed', 4: 'Save failed', 5: 'Save failed'})
      })
    } else {
      setConfirmMessage(captainInCourt ? 'Captain on court' : 'Captain not on court')
      setErrors({})
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
          <span>{teamData?.name || (team === 'team_1' ? 'Team 1' : 'Team 2')}</span>
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
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '24px',
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

          {/* Beach volleyball: Only 2 players - Position I */}
          {[
            { idx: 0, pos: 'I' }
          ].map(({ idx, pos }) => (
            <div key={`top-${idx}`} style={{ position: 'relative' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontSize: '12px', 
                color: 'var(--muted)',
                textAlign: 'center'
              }}>
                {pos}
              </label>
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
                style={{
                  width: '60px',
                  height: '60px',
                  maxWidth: '100%',
                  padding: '0',
                  fontSize: '18px',
                  fontWeight: 700,
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  border: `2px solid ${errors[idx] ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', height: '14px' }}>
                {errors[idx] || ''}
              </div>
            </div>
          ))}

          {/* Beach volleyball: Position II */}
          {[
            { idx: 1, pos: 'II' }
          ].map(({ idx, pos }) => (
            <div 
              key={`bottom-${idx}`} 
              style={{ position: 'relative', marginTop: '24px' }}
            >
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontSize: '12px', 
                color: 'var(--muted)',
                textAlign: 'center'
              }}>
                {pos}
              </label>
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
                style={{
                  width: '60px',
                  height: '60px',
                  maxWidth: '100%',
                  padding: '0',
                  fontSize: '18px',
                  fontWeight: 700,
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  border: `2px solid ${errors[idx] ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', height: '14px' }}>
                {errors[idx] || ''}
              </div>
            </div>
          ))}
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
            Available Players:
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {players?.filter(p => {
              if (events) {
                // Exclude disqualified players (cannot take part ever again)
                const isDisqualified = events.some(e => 
                  e.type === 'sanction' && 
                  e.payload?.team === team &&
                  String(e.payload?.playerNumber) === String(p.number) &&
                  e.payload?.type === 'disqualification'
                )
                if (isDisqualified) {
                  return false
                }
                
                
                
                // Exclude expelled players in the current set (cannot take part in this set)
                // Note: Disqualification is checked above and applies to all sets
                if (setIndex) {
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
              }
              
              return true
            }).sort((a, b) => a.number - b.number).map(p => (
              <div
                key={p.number}
                style={{
                  position: 'relative',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(74, 222, 128, 0.2)',
                  border: '2px solid #4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#4ade80',
                  cursor: 'default'
                }}
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
            Please check: All numbers must exist in roster and not be duplicated.
          </div>
        )}

        {confirmMessage && (
          <div style={{ 
            padding: '12px', 
            background: confirmMessage === 'Captain on court' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 146, 60, 0.1)', 
            border: confirmMessage === 'Captain on court' ? '1px solid #4ade80' : '1px solid #fb923c',
            borderRadius: '8px',
            marginBottom: '16px',
            color: confirmMessage === 'Captain on court' ? '#4ade80' : '#fb923c',
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
              Confirm
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
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SetStartTimeModal({ setIndex, defaultTime, onConfirm, onCancel }) {
  const [time, setTime] = useState(() => {
    const date = new Date(defaultTime)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  })
  
  // Update time when defaultTime prop changes
  useEffect(() => {
    const date = new Date(defaultTime)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    setTime(`${hours}:${minutes}`)
  }, [defaultTime])

  const handleConfirm = () => {
    // Convert time string to ISO string
    const now = new Date()
    const [hours, minutes] = time.split(':')
    now.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    onConfirm(now.toISOString())
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
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: `2px solid rgba(255,255,255,0.2)`,
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '24px',
            width: '150px'
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

function SetEndTimeModal({ setIndex, winner, team_1Points, team_2Points, defaultTime, teamAKey, isMatchEnd, onConfirm, onCancel, onUndo, onBMP, leftTeamKey, rightTeamKey }) {
  const [time, setTime] = useState(() => {
    const date = new Date(defaultTime)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  })

  const winnerLabel = winner === 'team_1' 
    ? (teamAKey === 'team_1' ? 'A' : 'B')
    : (teamAKey === 'team_2' ? 'A' : 'B')

  const handleConfirm = () => {
    // Convert time string to ISO string
    const now = new Date()
    const [hours, minutes] = time.split(':')
    now.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    onConfirm(now.toISOString())
  }

  return (
    <Modal
      title={isMatchEnd ? 'Match End' : `Set ${setIndex} End`}
      open={true}
      onClose={onCancel}
      width={500}
      hideCloseButton={true}
    >
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700 }}>
          {isMatchEnd ? `Team ${winnerLabel} won the Match!` : `Team ${winnerLabel} won Set ${setIndex}!`}
        </p>
        <p style={{ marginBottom: '24px', fontSize: '16px', color: 'var(--muted)' }}>
          Set {setIndex}: {team_1Points} - {team_2Points}
        </p>
        <p style={{ marginBottom: '16px', fontSize: '16px' }}>
          Confirm the end time:
        </p>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          style={{
            padding: '12px 16px',
            fontSize: '18px',
            fontWeight: 600,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: `2px solid rgba(255,255,255,0.2)`,
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '24px',
            width: '150px'
          }}
        />
        
        {/* BMP and Undo options */}
        <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <p style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--muted)' }}>
            Additional Options:
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {onBMP && (
              <>
                <button
                  onClick={() => onBMP(leftTeamKey)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#f97316',
                    color: '#fff',
                    border: '1px solid #ea580c',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  BMP (Left Team)
                </button>
                <button
                  onClick={() => onBMP(rightTeamKey)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#f97316',
                    color: '#fff',
                    border: '1px solid #ea580c',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  BMP (Right Team)
                </button>
              </>
            )}
            {onUndo && (
              <button
                onClick={onUndo}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: '#fff',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Undo Last Point
              </button>
            )}
          </div>
        </div>
        
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
            Confirm End
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

function MatchEndModal({ matchId, data, teamAKey, openSignature, setOpenSignature, onShowScoresheet, onDownloadData, onConfirmEnd, onGoHome, onReopenMatch }) {
  const teamBKey = teamAKey === 'team_1' ? 'team_2' : 'team_1'
  const finishedSets = (data?.sets || []).filter(s => s.finished).sort((a, b) => a.index - b.index)
  const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
  const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
  
  // Get officials
  const officials = data?.match?.officials || []
  const ref1 = officials.find(o => o.role === '1st referee')
  const ref2 = officials.find(o => o.role === '2nd referee')
  const scorer = officials.find(o => o.role === 'scorer')
  const asstScorer = officials.find(o => o.role === 'assistant scorer')
  
  // Get captains
  const team_1Captain = (data?.team_1Players || []).find(p => p.captain)
  const team_2Captain = (data?.team_2Players || []).find(p => p.captain)
  
  // Calculate timeout counts per set
  const timeoutCounts = {}
  finishedSets.forEach(set => {
    const setEvents = (data?.events || []).filter(e => e.setIndex === set.index && e.type === 'timeout')
    const teamATimeouts = setEvents.filter(e => e.payload?.team === teamAKey).length
    const teamBTimeouts = setEvents.filter(e => e.payload?.team === teamBKey).length
    timeoutCounts[set.index] = { teamA: teamATimeouts, teamB: teamBTimeouts }
  })
  
  // Calculate total timeouts
  const totalTimeouts = Object.values(timeoutCounts).reduce((acc, counts) => ({
    teamA: acc.teamA + counts.teamA,
    teamB: acc.teamB + counts.teamB
  }), { teamA: 0, teamB: 0 })
  
  const handleSaveSignature = async (role, signatureData) => {
    const updateData = {}
    if (role === 'team_1-captain') {
      updateData.postMatchSignatureTeam_1Captain = signatureData
    } else if (role === 'team_2-captain') {
      updateData.postMatchSignatureTeam_2Captain = signatureData
    } else if (role === 'ref1') {
      updateData.postMatchSignatureRef1 = signatureData
    } else if (role === 'ref2') {
      updateData.postMatchSignatureRef2 = signatureData
    } else if (role === 'scorer') {
      updateData.postMatchSignatureScorer = signatureData
    } else if (role === 'asst-scorer') {
      updateData.postMatchSignatureAsstScorer = signatureData
    }
    await db.matches.update(matchId, updateData)
    setOpenSignature(null)
  }
  
  const getSignatureData = (role) => {
    if (role === 'team_1-captain') return data?.match?.postMatchSignatureTeam_1Captain
    if (role === 'team_2-captain') return data?.match?.postMatchSignatureTeam_2Captain
    if (role === 'ref1') return data?.match?.postMatchSignatureRef1
    if (role === 'ref2') return data?.match?.postMatchSignatureRef2
    if (role === 'scorer') return data?.match?.postMatchSignatureScorer
    if (role === 'asst-scorer') return data?.match?.postMatchSignatureAsstScorer
    return null
  }
  
  return (
    <>
      <Modal
        title="Match End"
        open={true}
        onClose={() => {}}
        width={1000}
        hideCloseButton={true}
      >
        <div style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
          {/* Results Table - matching scoresheet format */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Results</h3>
            <div style={{ border: '2px solid rgba(255,255,255,0.2)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              {/* Table Header */}
              <div style={{ display: 'flex', fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Time-Outs</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Wins</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Points</div>
                <div style={{ width: '120px', padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Set Duration</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Points</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Wins</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center' }}>Time-Outs</div>
              </div>
              
              {/* Set Rows */}
              {[1, 2, 3].map(setNum => {
                const set = finishedSets.find(s => s.index === setNum)
                if (!set) return null
                
                const teamAPoints = teamAKey === 'team_1' ? set.team_1Points : set.team_2Points
                const teamBPoints = teamBKey === 'team_1' ? set.team_1Points : set.team_2Points
                const teamAWins = teamAPoints > teamBPoints ? 1 : 0
                const teamBWins = teamBPoints > teamAPoints ? 1 : 0
                const timeouts = timeoutCounts[setNum] || { teamA: 0, teamB: 0 }
                
                // Calculate set duration (simplified - would need actual start/end times)
                const duration = set.endTime && set.startTime 
                  ? Math.round((new Date(set.endTime) - new Date(set.startTime)) / 60000)
                  : ''
                
                return (
                  <div key={setNum} style={{ display: 'flex', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{timeouts.teamA}</div>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{teamAWins}</div>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{teamAPoints}</div>
                    <div style={{ width: '120px', padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)', fontSize: '11px' }}>
                      Set {setNum} ({duration} min)
                    </div>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{teamBPoints}</div>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{teamBWins}</div>
                    <div style={{ flex: 1, padding: '8px', textAlign: 'center' }}>{timeouts.teamB}</div>
                  </div>
                )
              })}
              
              {/* Total Row */}
              <div style={{ display: 'flex', fontSize: '13px', fontWeight: 600, background: 'rgba(255,255,255,0.05)', borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{totalTimeouts.teamA}</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{team_1SetsWon}</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {finishedSets.reduce((sum, s) => sum + (teamAKey === 'team_1' ? s.team_1Points : s.team_2Points), 0)}
                </div>
                <div style={{ width: '120px', padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)', fontSize: '11px' }}>
                  Total
                </div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  {finishedSets.reduce((sum, s) => sum + (teamBKey === 'team_1' ? s.team_1Points : s.team_2Points), 0)}
                </div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>{team_2SetsWon}</div>
                <div style={{ flex: 1, padding: '8px', textAlign: 'center' }}>{totalTimeouts.teamB}</div>
              </div>
              
              {/* Winner Row */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>Winning team:</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>
                  {team_1SetsWon > team_2SetsWon 
                    ? (data?.team_1Team?.name || 'Team 1')
                    : (data?.team_2Team?.name || 'Team 2')}
                </span>
                <span style={{ fontWeight: 600, fontSize: '14px', marginLeft: 'auto' }}>
                  2 : {team_1SetsWon > team_2SetsWon ? team_2SetsWon : team_1SetsWon}
                </span>
              </div>
            </div>
          </div>
          
          {/* Signatures - reorganized as requested */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 600 }}>Signatures</h3>
            
            {/* Captains underneath RESULTS table columns */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="team_1-captain"
                  label={`${data?.team_1Team?.name || 'Team 1'} Captain${team_1Captain ? ` (#${team_1Captain.number})` : ''}`}
                  signatureData={getSignatureData('team_1-captain')}
                  onSign={() => setOpenSignature('team_1-captain')}
                />
              </div>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="team_2-captain"
                  label={`${data?.team_2Team?.name || 'Team 2'} Captain${team_2Captain ? ` (#${team_2Captain.number})` : ''}`}
                  signatureData={getSignatureData('team_2-captain')}
                  onSign={() => setOpenSignature('team_2-captain')}
                />
              </div>
            </div>
            
            {/* Assistant Scorer and Scorer on same row */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="asst-scorer"
                  label={`Assistant Scorer${asstScorer ? ` (${asstScorer.firstName || ''} ${asstScorer.lastName || ''})` : ''}`}
                  signatureData={getSignatureData('asst-scorer')}
                  onSign={() => setOpenSignature('asst-scorer')}
                />
              </div>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="scorer"
                  label={`Scorer${scorer ? ` (${scorer.firstName || ''} ${scorer.lastName || ''})` : ''}`}
                  signatureData={getSignatureData('scorer')}
                  onSign={() => setOpenSignature('scorer')}
                />
              </div>
            </div>
            
            {/* 2nd Ref and 1st Ref on same row */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="ref2"
                  label={`2nd Referee${ref2 ? ` (${ref2.firstName || ''} ${ref2.lastName || ''})` : ''}`}
                  signatureData={getSignatureData('ref2')}
                  onSign={() => setOpenSignature('ref2')}
                />
              </div>
              <div style={{ flex: 1 }}>
                <SignatureBox
                  role="ref1"
                  label={`1st Referee${ref1 ? ` (${ref1.firstName || ''} ${ref1.lastName || ''})` : ''}`}
                  signatureData={getSignatureData('ref1')}
                  onSign={() => setOpenSignature('ref1')}
                />
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '32px' }}>
            <button
              onClick={onShowScoresheet}
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
              Scoresheet
            </button>
            <button
              onClick={onDownloadData}
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
              Download Data
            </button>
            <button
              onClick={onConfirmEnd}
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
              Confirm End of Match
            </button>
            <button
              onClick={onReopenMatch}
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
              Reopen Match
            </button>
          </div>
        </div>
      </Modal>
      
      <SignaturePad
        open={!!openSignature}
        title={openSignature === 'team_1-captain' ? `${data?.team_1Team?.name || 'Team 1'} Captain` :
               openSignature === 'team_2-captain' ? `${data?.team_2Team?.name || 'Team 2'} Captain` :
               openSignature === 'ref1' ? '1st Referee' :
               openSignature === 'ref2' ? '2nd Referee' :
               openSignature === 'scorer' ? 'Scorer' :
               'Assistant Scorer'}
        onSave={(signatureData) => handleSaveSignature(openSignature, signatureData)}
        onClose={() => setOpenSignature(null)}
      />
    </>
  )
}

function SignatureBox({ role, label, signatureData, onSign }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
        {label}
      </div>
      <div
        onClick={onSign}
        style={{
          border: '2px solid rgba(255,255,255,0.2)',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          minHeight: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {signatureData ? (
          <img
            src={signatureData}
            alt="Signature"
            style={{
              maxWidth: '100%',
              maxHeight: '60px',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
            Tap to sign
          </div>
        )}
      </div>
    </div>
  )
}


