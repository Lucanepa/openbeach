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
  const [setTransitionSelectedLeftTeam, setSetTransitionSelectedLeftTeam] = useState('A')
  const [setTransitionSelectedFirstServe, setSetTransitionSelectedFirstServe] = useState('A')
  const [setTransitionServiceOrder, setSetTransitionServiceOrder] = useState({ teamA: '1_2', teamB: '2_1' }) // '1_2' | '2_1' for each team
  const [set3CoinTossWinner, setSet3CoinTossWinner] = useState(null) // 'teamA' | 'teamB' | null - only for set 3
  const [postMatchSignature, setPostMatchSignature] = useState(null) // 'team_1-captain' | 'team_2-captain' | null
  const [sanctionConfirm, setSanctionConfirm] = useState(null) // { side: 'left'|'right', type: 'improper_request'|'delay_warning'|'delay_penalty' } | null
  const [sanctionDropdown, setSanctionDropdown] = useState(null) // { team: 'team_1'|'team_2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, element: HTMLElement, x?: number, y?: number } | null
  const [sanctionConfirmModal, setSanctionConfirmModal] = useState(null) // { team: 'team_1'|'team_2', type: 'player'|'official', playerNumber?: number, position?: string, role?: string, sanctionType: 'warning'|'penalty'|'expulsion'|'disqualification' } | null
  const [injuryDropdown, setInjuryDropdown] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null
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
  const [editOfficialsState, setEditOfficialsState] = useState([])
  const [playerActionMenu, setPlayerActionMenu] = useState(null) // { team: 'team_1'|'team_2', position: 'I'|'II', playerNumber: number, element: HTMLElement, x?: number, y?: number } | null
  const [challengeModal, setChallengeModal] = useState(null) // null | 'request' | 'in_progress' - when 'request', contains { team: 'team_1'|'team_2', reason: string } | when 'in_progress', contains { team: 'team_1'|'team_2', reason: string, score: { team_1: number, team_2: number }, set: number, servingTeam: 'team_1'|'team_2', time: string }
  const [challengeReason, setChallengeReason] = useState('IN / OUT')
  const [coinTossError, setCoinTossError] = useState(null) // { message: string } | null
  const playerNameDebugLogged = useRef(false)

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
    
    // Determine base position: Set 1 starts with Team A on left
    // Sets 2, 3 start with teams switched (Team A on right)
    const baseIsTeam_1 = data.set.index === 1 
      ? (teamAKey === 'team_1')
      : (teamAKey !== 'team_1')
    
    // For sets 1-2: Court switches every 7 points, set 3: every 5 points
    // Count how many court switches have happened in this set
    const totalPoints = (data.set.team_1Points || 0) + (data.set.team_2Points || 0)
    const isSet3 = data.set.index === 3
    const switchInterval = isSet3 ? 5 : 7
    const switchesSoFar = Math.floor(totalPoints / switchInterval)
    
    // Get the stored switch count (in case we're viewing after switches)
    const switchCountKey = `set${data.set.index}_switchCount`
    const storedSwitchCount = data.match?.[switchCountKey] || 0
    
    // Use the stored count if available, otherwise calculate from current points
    const effectiveSwitchCount = storedSwitchCount > 0 ? storedSwitchCount : switchesSoFar
    
    // Each switch flips the teams
    // If odd number of switches, teams are flipped from base position
    let isTeam_1 = baseIsTeam_1
    if (effectiveSwitchCount % 2 === 1) {
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
    
    // Check if this point would end the set
    if (team_1Points >= pointsToWin && team_1Points - team_2Points >= 2) {
      // Calculate current set scores to determine if this is match-ending
      const allSets = await db.sets.where({ matchId }).toArray()
      const finishedSets = allSets.filter(s => s.finished)
      const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
      const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
      
      // Beach volleyball: Best of 3 sets (first to 2 sets wins)
      const isMatchEnd = (team_1SetsWon + 1) >= 2
      
      // Show set end time confirmation modal
      const defaultTime = new Date().toISOString()
      setSetEndTimeModal({ setIndex: set.index, winner: 'team_1', team_1Points, team_2Points, defaultTime, isMatchEnd })
      return true
    }
    if (team_2Points >= pointsToWin && team_2Points - team_1Points >= 2) {
      // Calculate current set scores to determine if this is match-ending
      const allSets = await db.sets.where({ matchId }).toArray()
      const finishedSets = allSets.filter(s => s.finished)
      const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
      const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length
      
      // Beach volleyball: Best of 3 sets (first to 2 sets wins)
      const isMatchEnd = (team_2SetsWon + 1) >= 2
      
      // Show set end time confirmation modal
      const defaultTime = new Date().toISOString()
      setSetEndTimeModal({ setIndex: set.index, winner: 'team_2', team_1Points, team_2Points, defaultTime, isMatchEnd })
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
              <span style={{ minWidth: 28, textAlign: 'right' }}>{pointsBySide.left}</span>
              <span>:</span>
              <span style={{ minWidth: 28, textAlign: 'left' }}>{pointsBySide.right}</span>
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
        {/* Set score display */}
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--muted)',
          textAlign: 'center'
        }}>
          {setScore.left}-{setScore.right}
        </div>
      </div>
    ),
    [leftServing, rightServing, leftServingPlayer, rightServingPlayer, pointsBySide.left, pointsBySide.right, serveBallBaseStyle, setScore.left, setScore.right]
  )


  // Beach volleyball: No rotation (only 2 players)

  const handlePoint = useCallback(
    async side => {
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
      await logEvent('point', { team: teamKey })

      // Beach volleyball: No rotation (only 2 players, no rotation needed)
      
      const totalPoints = team_1Points + team_2Points
      
      // Beach volleyball: Technical TO at 21 points total (not in set 3)
      // Check TTO FIRST before court switch, since 21 is also a multiple of 7
      const isSet3ForTTO = data.set.index === 3
      if (!isSet3ForTTO) {
        // Alert at 20th point (one point before TTO)
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
      // Skip court switch at 21 points if TTO should happen (already handled above)
      const isSet3ForSwitch = data.set.index === 3
      const switchInterval = isSet3ForSwitch ? 5 : 7
      const pointsSinceLastSwitch = totalPoints % switchInterval
      
      // Alert at one point before switch (but not at 20 if TTO is coming)
      if (pointsSinceLastSwitch === (switchInterval - 1) && totalPoints > 0) {
        // Don't show court switch alert at 20 if TTO is coming at 21
        if (!(totalPoints === 20 && !isSet3ForTTO)) {
          setCourtSwitchAlert({ message: 'One point to switch' })
          setTimeout(() => setCourtSwitchAlert(null), 3000) // Auto-dismiss after 3 seconds
        }
      }
      
      // Switch at switchInterval point (every multiple of switchInterval)
      // Skip at 21 points if it's a TTO point (sets 1-2)
      if (pointsSinceLastSwitch === 0 && totalPoints > 0 && totalPoints % switchInterval === 0) {
        // Skip court switch at 21 points for sets 1-2 (TTO takes priority)
        if (totalPoints === 21 && !isSet3ForTTO) {
          // TTO already handled above, skip court switch
        } else {
          // Check if we've already switched courts at this point in this set
          const match = await db.matches.get(matchId)
          const setSwitchKey = `set${data.set.index}_switch_${totalPoints}`
          const hasSwitched = match?.[setSwitchKey] || false
          if (!hasSwitched) {
            // Show court switch modal (DO NOT switch courts yet - wait for confirmation)
            setCourtSwitchModal({
              set: data.set,
              team_1Points,
              team_2Points,
              teamThatScored: teamKey
            })
            await db.matches.update(matchId, { [setSwitchKey]: true })
            // DO NOT log event or increment switch count yet - wait for confirmation
            return // Don't check for set end yet, wait for court switch confirmation
          }
        }
      }
      
      const setEnded = checkSetEnd(data.set, team_1Points, team_2Points)
      // If set didn't end, we're done. If it did, checkSetEnd will show the confirmation modal
    },
    [data?.set, data?.events, logEvent, mapSideToTeamKey, checkSetEnd, getCurrentServe, matchId]
  )

  const handleStartRally = useCallback(async () => {
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
        const allSets = await db.sets.where('matchId').equals(matchId).toArray()
        const previousSet = allSets.find(s => s.index === (data.set.index - 1))
        if (previousSet?.endTime) {
          // Add 1 minute to previous set end time
          const prevEndTime = new Date(previousSet.endTime)
          prevEndTime.setMinutes(prevEndTime.getMinutes() + 1)
          defaultTime = prevEndTime.toISOString()
        }
      }
      
      setSetStartTimeModal({ setIndex: data?.set?.index, defaultTime })
      return
    }
    
    await logEvent('rally_start')
  }, [logEvent, isFirstRally, data?.team_1Players, data?.team_2Players, data?.events, data?.set, data?.match, matchId])

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
    
    // If delay penalty, award point to the other team (but only if lineups are set)
    if (type === 'delay_penalty') {
      // Check if both lineups are set before awarding point
      const team_1LineupSet = data.events?.some(e => 
        e.type === 'lineup' && 
        e.payload?.team === 'team_1' && 
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )
      const team_2LineupSet = data.events?.some(e => 
        e.type === 'lineup' && 
        e.payload?.team === 'team_2' && 
        e.setIndex === data.set.index &&
        e.payload?.isInitial
      )
      
      setSanctionConfirm(null)
      
      if (team_1LineupSet && team_2LineupSet) {
        // Both lineups are set - award point immediately
        const otherSide = side === 'left' ? 'right' : 'left'
        await handlePoint(otherSide)
      } else {
        // Lineups not set - show message
        alert('Delay penalty recorded. Point will be awarded after both teams set their lineups.')
      }
    } else {
      setSanctionConfirm(null)
    }
  }, [sanctionConfirm, data?.match, data?.set, data?.events, mapSideToTeamKey, matchId, logEvent, handlePoint])

  // Confirm set start time
  const confirmSetStartTime = useCallback(async (time) => {
    if (!setStartTimeModal || !data?.set) return
    
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
    await db.events.add({
      matchId,
      setIndex: data.set.index,
      type: 'rally_start',
      payload: {},
      ts: new Date().toISOString(),
      seq: nextSeq2
    })
  }, [setStartTimeModal, data?.set, matchId])

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
      
      
      // Close the set end time modal
      setSetEndTimeModal(null)
      
      if (onFinishSet) onFinishSet(data.set)
      return // Match is over, don't continue to set transition logic
    } else {
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
        setSetTransitionModal({ setIndex: setIndex + 1, isSet3: false })
        return
      }
      
      // After set 2, check if match is over (2-0) or going to set 3 (1-1)
      if (setIndex === 2) {
        if (team_1SetsWon === 2 || team_2SetsWon === 2) {
          // Match is over (2-0) - this should have been caught by isMatchEnd check above
          // But if we reach here, close the modal and finish the match
          setSetEndTimeModal(null)
          // Match should already be marked as final by isMatchEnd check above
          if (onFinishSet) onFinishSet(data.set)
          return
        } else {
          // Going to set 3 (1-1), show transition modal with 3rd set coin toss
          setSetEndTimeModal(null)
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
          setSetTransitionModal({ setIndex: setIndex + 1, isSet3: true })
          return
        }
      }
      
      // Beach volleyball: Only sets 1, 2, 3 exist (best of 3)
      // If we reach here, something went wrong - match should have ended
      console.warn('Unexpected set index after set 2 handling:', setIndex)
    }
    
    setSetEndTimeModal(null)
  }, [setEndTimeModal, data?.match, data?.set, matchId, logEvent, onFinishSet, getCurrentServe, teamAKey])

  // Confirm set transition (after set 1 or before set 3)
  const confirmSetTransition = useCallback(async () => {
    if (!setTransitionModal || !data?.match) return
    
    const { setIndex, isSet3 } = setTransitionModal
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
    await db.matches.update(matchId, { firstServe: firstServeTeamKey })
    
    // Calculate service order based on the selected service order preference
    const matchData = await db.matches.get(matchId)
    const coinTossData = matchData?.coinTossData?.players
    if (!coinTossData) {
      throw new Error('Coin toss data is missing.')
    }
    
    // Build service order based on user selection
    const serviceOrder = {}
    const teamAServiceOrder = setTransitionServiceOrder.teamA // '1_2' or '2_1'
    const teamBServiceOrder = setTransitionServiceOrder.teamB // '1_2' or '2_1'
    
    // Determine which team serves first
    const servingTeamIsA = firstServeTeamKey === teamAKey
    const servingTeam = servingTeamIsA ? teamAKey : teamBKey
    const receivingTeam = servingTeamIsA ? teamBKey : teamAKey
    const servingTeamOrder = servingTeamIsA ? teamAServiceOrder : teamBServiceOrder
    const receivingTeamOrder = servingTeamIsA ? teamBServiceOrder : teamAServiceOrder
    
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
    
    // Create new set
    const newSetId = await db.sets.add({ 
      matchId, 
      index: setIndex, 
      team_1Points: 0, 
      team_2Points: 0, 
      finished: false,
      serviceOrder: serviceOrder
    })
    
    
    setSetTransitionModal(null)
  }, [setTransitionModal, setTransitionSelectedLeftTeam, setTransitionSelectedFirstServe, setTransitionServiceOrder, set3CoinTossWinner, data?.match, matchId, teamAKey])
  

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
      eventDescription = 'Rally started'
    } else if (event.type === 'replay') {
      eventDescription = 'Replay'
    } else if (event.type === 'lineup') {
      // Beach volleyball: No lineup events (lineup is always players 1 and 2, only serving changes)
      return null
    } else if (event.type === 'court_switch') {
      const setIndex = event.payload?.setIndex || event.setIndex || '?'
      const totalPoints = event.payload?.totalPoints || 0
      const switchNumber = event.payload?.switchNumber || 0
      eventDescription = `Court Switch — Set ${setIndex} (${totalPoints} points, switch #${switchNumber})`
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
        const roleAbbr = event.payload.role === 'Coach' ? 'C' : 
                        event.payload.role === 'Assistant Coach 1' ? 'AC1' :
                        event.payload.role === 'Assistant Coach 2' ? 'AC2' :
                        event.payload.role === 'Physiotherapist' ? 'P' :
                        event.payload.role === 'Medic' ? 'M' : event.payload.role
        target = ` ${roleAbbr}`
      } else {
        target = ' Team'
      }
      
      eventDescription = `Sanction — ${teamName}${target} (${sanctionLabel}) (${team_1Label} ${team_1Score}:${team_2Score} ${team_2Label})`
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
        
        
      if (currentPoints > 0) {
        await db.sets.update(data.set.id, {
          [field]: currentPoints - 1
        })
      }
      
      // Check if the scoring team rotated (they didn't have serve before scoring)
      // We need to find the point event BEFORE this one to determine who had serve
      const allPointEvents = data.events
        .filter(e => e.type === 'point' && e.setIndex === data.set.index)
        .sort((a, b) => (b.seq || 0) - (a.seq || 0)) // Most recent first by sequence
      
      const currentPointIndex = allPointEvents.findIndex(e => e.id === lastEvent.id)
      const previousPointEvent = currentPointIndex >= 0 && currentPointIndex < allPointEvents.length - 1
        ? allPointEvents[currentPointIndex + 1]
        : null
      
      // Determine who had serve before this point
      // If there's a previous point, the team that scored it has serve
      // Otherwise, use firstServe from match
      const serveBeforePoint = previousPointEvent 
        ? previousPointEvent.payload?.team 
        : (data?.match?.firstServe || 'team_1')
      
      const scoringTeamHadServe = serveBeforePoint === teamKey
      
      // Beach volleyball: No rotations - players stay on court, only serving changes
      // If the scoring team didn't have serve, the serve just changed hands (no rotation needed)
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

  // Handle challenge request confirmation
  const handleConfirmChallengeRequest = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'request' || !data?.set || !data?.match) return
    
    const { team } = challengeModal
    const currentServeTeam = getCurrentServe()
    const teamLabel = team === teamAKey ? 'A' : 'B'
    const servingTeamLabel = currentServeTeam === teamAKey ? 'A' : 'B'
    
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
      time: new Date().toISOString()
    }
    
    setChallengeModal(challengeData)
  }, [challengeModal, challengeReason, data?.set, data?.match, teamAKey, getCurrentServe])

  // Handle challenge request rejection/cancel
  const handleRejectChallengeRequest = useCallback(() => {
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [])

  // Handle successful challenge
  const handleSuccessfulChallenge = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team, score } = challengeModal
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
    
    // Log challenge success
    await logEvent('challenge', {
      team,
      reason: challengeModal.reason,
      result: 'successful',
      originalScore: score,
      newScore: {
        team_1: team === 'team_1' ? newTeamPoints : newOpponentPoints,
        team_2: team === 'team_2' ? newTeamPoints : newOpponentPoints
      }
    })
    
    // Challenge successful - don't decrement challenge count
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, data?.events, logEvent])

  // Handle unsuccessful challenge
  const handleUnsuccessfulChallenge = useCallback(async () => {
    if (!challengeModal || challengeModal.type !== 'in_progress' || !data?.set || !data?.match) return
    
    const { team } = challengeModal
    
    // Log challenge failure
    await logEvent('challenge', {
      team,
      reason: challengeModal.reason,
      result: 'unsuccessful',
      score: challengeModal.score
    })
    
    // Update challenge requests count (decrement by 1)
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
    
    setChallengeModal(null)
    setChallengeReason('IN / OUT')
  }, [challengeModal, data?.set, data?.match, matchId])

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
    // Only allow when rally is not in play
    if (rallyStatus !== 'idle') return
    // For beach volleyball, allow clicks even if playerNumber is empty (use position instead)
    // playerNumber can be empty string, null, or undefined - check for all
    if (playerNumber === null || playerNumber === undefined || playerNumber === '') {
      // Use position as fallback for beach volleyball
      if (!position) return
    }
    
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
    if (playerActionMenu?.playerNumber === playerNumber && playerActionMenu?.position === position) {
      setPlayerActionMenu(null)
      return
    }
    
    // Show action menu (only for sanctions in beach volleyball)
    setPlayerActionMenu({
      team: teamKey,
      position,
      playerNumber,
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

  // Beach volleyball: Injury results in forfait
  const openInjuryFromMenu = useCallback(async () => {
    if (!playerActionMenu || !data?.set) return
    const { team } = playerActionMenu
        setPlayerActionMenu(null)
        await handleForfait(team, 'injury')
  }, [playerActionMenu, data?.set, handleForfait])

  // Beach volleyball: Injury results in forfait
  const handleInjury = useCallback(async () => {
    if (!injuryDropdown || !data?.set) return
    const { team } = injuryDropdown
        setInjuryDropdown(null)
        await handleForfait(team, 'injury')
  }, [injuryDropdown, data?.set, handleForfait])

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
        await handlePoint(otherSide)
        
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
    
    // Count how many court switches have happened in this set
    const setIndex = courtSwitchModal.set.index
    const totalPoints = courtSwitchModal.team_1Points + courtSwitchModal.team_2Points
    const isSet3 = setIndex === 3
    const switchInterval = isSet3 ? 5 : 7
    const switchesSoFar = Math.floor(totalPoints / switchInterval)
    
    // Store the number of switches for this set (THIS ACTUALLY SWITCHES THE COURTS VISUALLY)
    const switchCountKey = `set${setIndex}_switchCount`
    await db.matches.update(matchId, { 
      [switchCountKey]: switchesSoFar 
    })
    
    // Log court switch as an event
    await logEvent('court_switch', {
      setIndex: setIndex,
      totalPoints: totalPoints,
      team_1Points: courtSwitchModal.team_1Points,
      team_2Points: courtSwitchModal.team_2Points,
      switchNumber: switchesSoFar
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
              // Perform court switch after TTO
              const setIndex = prev.set.index
              const totalPoints = prev.team_1Points + prev.team_2Points
              const isSet3 = setIndex === 3
              const switchInterval = isSet3 ? 5 : 7
              const switchesSoFar = Math.floor(totalPoints / switchInterval)
              
              // Store the number of switches for this set (THIS ACTUALLY SWITCHES THE COURTS VISUALLY)
              const switchCountKey = `set${setIndex}_switchCount`
              db.matches.update(matchId, { 
                [switchCountKey]: switchesSoFar 
              }).catch(() => {})
              
              // Log court switch as an event
              logEvent('court_switch', {
                setIndex: setIndex,
                totalPoints: totalPoints,
                team_1Points: prev.team_1Points,
                team_2Points: prev.team_2Points,
                switchNumber: switchesSoFar,
                afterTTO: true
              }).catch(() => {})
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
  
  const stopTechnicalTO = useCallback(() => {
    if (!technicalTOModal) return
    
    // Stop countdown and close TTO modal
    setTechnicalTOModal(null)
  }, [technicalTOModal])
  
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
          <div style={{ width: '100%' }}></div>
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
          <button 
            className="secondary" 
            onClick={() => setOptionsModal(true)}
            style={{ background: '#22c55e', color: '#000', fontWeight: 600 }}
          >
            Options
          </button>
          <button 
            className="secondary" 
            onClick={async () => {
              try {
                const match = data?.match
                if (!match) {
                  alert('No match data available')
                  return
                }
                
                // Keep test matches completely offline - don't pass data to scoresheet
                // If official match overwrites test match, show no data
                if (match.test === true) {
                  // Test match - store empty/null data (completely offline)
                  sessionStorage.setItem('scoresheetData', JSON.stringify(null))
                } else {
                  // Official match - gather all match data for the scoresheet
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
                  
                  // Store data in sessionStorage to pass to new window
                  sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
                }
                
                // Calculate optimal window size for A3 scoresheet (410mm x 287mm)
                // At 96 DPI: ~1549px x 1084px, but add padding and controls
                const scoresheetWidth = 410; // mm
                const scoresheetHeight = 287; // mm
                const mmToPx = 3.779527559; // 1mm = 3.779527559px at 96 DPI
                const windowWidth = Math.max(1600, Math.min(screen.width - 100, scoresheetWidth * mmToPx + 200));
                const windowHeight = Math.max(1200, Math.min(screen.height - 100, scoresheetHeight * mmToPx + 200));
                
                // Open scoresheet in new window with calculated size
                const scoresheetWindow = window.open(
                  '/scoresheet_beach.html', 
                  '_blank', 
                  `width=${Math.round(windowWidth)},height=${Math.round(windowHeight)},scrollbars=yes,resizable=yes`
                )
                
                if (!scoresheetWindow) {
                  alert('Please allow popups to view the scoresheet')
                  return
                }
                
                // Wait for window to load, then adjust zoom if needed
                const adjustZoom = () => {
                  try {
                    if (scoresheetWindow.closed) return;
                    
                    // Try to set zoom to fit content (if browser supports it)
                    const targetWidth = scoresheetWidth * mmToPx;
                    const availableWidth = windowWidth - 200; // Account for padding/scrollbars
                    const scale = Math.min(1, availableWidth / targetWidth);
                    
                    // Some browsers support document.body.style.zoom
                    if (scoresheetWindow.document && scoresheetWindow.document.body) {
                      scoresheetWindow.document.body.style.zoom = scale;
                    }
                    
                    // Also try using CSS transform as fallback
                    if (scoresheetWindow.document && scoresheetWindow.document.documentElement) {
                      scoresheetWindow.document.documentElement.style.transform = `scale(${scale})`;
                      scoresheetWindow.document.documentElement.style.transformOrigin = 'top left';
                    }
                  } catch (e) {
                    // Cross-origin or other restrictions - that's okay
                    // Will rely on window size and user can manually zoom
                  }
                };
                
                // Try multiple times as the window loads
                setTimeout(adjustZoom, 100);
                setTimeout(adjustZoom, 500);
                setTimeout(adjustZoom, 1000);
                
                // Set up error listener for scoresheet window
                const errorListener = (event) => {
                  // Only accept messages from the scoresheet window
                  if (event.data && event.data.type === 'SCORESHEET_ERROR') {
                    setScoresheetErrorModal({
                      error: event.data.error || 'Unknown error',
                      details: event.data.details || event.data.stack || ''
                    })
                    window.removeEventListener('message', errorListener)
                  }
                }
                
                window.addEventListener('message', errorListener)
                
                // Clean up listener after 30 seconds (scoresheet should load by then)
                setTimeout(() => {
                  window.removeEventListener('message', errorListener)
                }, 60000)
              } catch (error) {
                alert('Error opening scoresheet: ' + error.message)
              }
            }}
            style={{ marginLeft: '8px' }}
          >
            🔍 Scoresheet
          </button>
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
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Challenges remaining</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (2 - getChallengesUsed(leftIsTeam_1 ? 'team_1' : 'team_2')) <= 0 ? '#ef4444' : '#f97316'
              }}>{2 - getChallengesUsed(leftIsTeam_1 ? 'team_1' : 'team_2')}</div>
            </div>
          </div>
          <button
            onClick={() => handleTimeout('left')}
            disabled={getTimeoutsUsed('left') >= 1 || rallyStatus === 'in_play'}
            style={{ width: '100%', marginBottom: '8px' }}
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
              width: '100%', 
              marginBottom: '8px',
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
              alt="Challenge" 
              style={{ width: '20px', height: '20px' }}
            />
            Challenge
          </button>
          
          {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            {!data?.match?.sanctions?.improperRequestLeft && (
              <button
                onClick={() => handleImproperRequest('left')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.improper}
              >
                Improper Request
              </button>
            )}
            {!data?.match?.sanctions?.delayWarningLeft ? (
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
            {data?.match?.sanctions?.improperRequestLeft && (
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
            {data?.match?.sanctions?.delayWarningLeft && (
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                {/* Current score */}
                {renderScoreDisplay({ margin: '0 auto' })}
                
                {/* Previous set scores (only show if set > 1) */}
                {data.set.index > 1 && data.sets && (() => {
                  const previousSets = data.sets.filter(s => s.finished && s.index < data.set.index).sort((a, b) => a.index - b.index)
                  const currentLeftTeamKey = leftIsTeam_1 ? 'team_1' : 'team_2'
                  const currentRightTeamKey = leftIsTeam_1 ? 'team_2' : 'team_1'
                  
                  // Helper to convert to Roman numeral
                  const toRoman = (num) => {
                    const romanNumerals = ['I', 'II', 'III', 'IV', 'V']
                    return romanNumerals[num - 1] || num.toString()
                  }
                  
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '12px', alignItems: 'center', justifyContent: 'center' }}>
                      {previousSets.map(set => {
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
                            gap: '6px'
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
                    
                    // Get sanctions for this player
                    const sanctions = getPlayerSanctions(teamKey, player.number)
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    
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
                              transform: 'translateY(-50%)'
                            }}
                          />
                        )}
                        <div 
                          className="court-player"
                          onClick={(e) => handlePlayerClick(teamKey, player.position, displayNumber || player.number, e)}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            position: 'relative'
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
                                // Other sanctions: separate cards
                                <div style={{ display: 'flex', gap: '1px' }}>
                                  {(hasWarning || hasDisqualification) && (
                                    <div className="sanction-card yellow" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                  {(hasPenalty || hasDisqualification) && (
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
                    
                    // Get sanctions for this player
                    const sanctions = getPlayerSanctions(teamKey, player.number)
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    
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
                              transform: 'translateY(-50%)'
                            }}
                          />
                        )}
                        <div 
                          className="court-player"
                          onClick={(e) => handlePlayerClick(teamKey, player.position, displayNumber || player.number, e)}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            position: 'relative'
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
                                // Other sanctions: separate cards
                                <div style={{ display: 'flex', gap: '1px' }}>
                                  {(hasWarning || hasDisqualification) && (
                                    <div className="sanction-card yellow" style={{ width: '8px', height: '11px', boxShadow: '0 1px 3px rgba(0,0,0,0.8)', borderRadius: '1px' }}></div>
                                  )}
                                  {(hasPenalty || hasDisqualification) && (
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
              <div style={{ fontSize: '11px', color: 'var(--muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Challenges remaining</div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 700,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: (2 - getChallengesUsed(leftIsTeam_1 ? 'team_2' : 'team_1')) <= 0 ? '#ef4444' : '#f97316'
              }}>{2 - getChallengesUsed(leftIsTeam_1 ? 'team_2' : 'team_1')}</div>
            </div>
          </div>
          <button
            onClick={() => handleTimeout('right')}
            disabled={getTimeoutsUsed('right') >= 1 || rallyStatus === 'in_play'}
            style={{ width: '100%', marginBottom: '8px' }}
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
              width: '100%', 
              marginBottom: '8px',
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
              alt="Challenge" 
              style={{ width: '20px', height: '20px' }}
            />
            Challenge
          </button>
          
          {/* Sanctions: Improper Request, Delay Warning, Delay Penalty */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
            {!data?.match?.sanctions?.improperRequestRight && (
              <button
                onClick={() => handleImproperRequest('right')}
                disabled={rallyStatus === 'in_play'}
                style={sanctionButtonStyles.improper}
              >
                Improper Request
              </button>
            )}
            {!data?.match?.sanctions?.delayWarningRight ? (
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
            {data?.match?.sanctions?.improperRequestRight && (
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
            {data?.match?.sanctions?.delayWarningRight && (
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


      {/* Options Modal */}
      {optionsModal && (
        <Modal
          title="Options"
          open={true}
          onClose={() => setOptionsModal(false)}
          width={400}
        >
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                className="secondary"
                onClick={() => {
                  setShowLogs(true)
                  setOptionsModal(false)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                Show Action Log
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setShowSanctions(true)
                  setOptionsModal(false)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                Show Sanctions and Results
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setShowManualPanel(true)
                  setOptionsModal(false)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                Manual Changes
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setShowRemarks(true)
                  setOptionsModal(false)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
              >
                Open Remarks Recording
              </button>
              {onOpenMatchSetup && (
                <button
                  className="secondary"
                  onClick={() => {
                    onOpenMatchSetup()
                    setOptionsModal(false)
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
                >
                  Show Match Setup
                </button>
              )}
              {onOpenCoinToss && (
                <button
                  className="secondary"
                  onClick={() => {
                    onOpenCoinToss()
                    setOptionsModal(false)
                  }}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 16px' }}
                >
                  Show Coin Toss
                </button>
              )}
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
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}
              >
                📥 Download Full Database (JSON)
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setManualCourtSwitchConfirm(true)
                  setOptionsModal(false)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}
              >
                🔄 Manual Court Switch
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
                  {/* Improper Request Row */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', minWidth: '100px' }}>Improper Request:</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['A', 'B'].map(team => {
                        const teamKey = team === 'A' ? teamAKey : teamBKey
                        const sideKey = (team === 'A' && teamAKey === 'team_1' && leftIsTeam_1) || (team === 'A' && teamAKey === 'team_2' && !leftIsTeam_1) || (team === 'B' && teamBKey === 'team_1' && leftIsTeam_1) || (team === 'B' && teamBKey === 'team_2' && !leftIsTeam_1) ? 'Left' : 'Right'
                        const hasImproperRequest = data?.match?.sanctions?.[`improperRequest${sideKey}`]
                        
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
                          const playerType = event.payload?.playerType
                          const playerNumber = event.payload?.playerNumber
                          const role = event.payload?.role
                          
                          // Get the identifier to display (player number or role abbreviation)
                          let identifier = null
                          if (role) {
                            identifier = role === 'Coach' ? 'C' : 
                                         role === 'Assistant Coach 1' ? 'AC1' :
                                         role === 'Assistant Coach 2' ? 'AC2' :
                                         role === 'Physiotherapist' ? 'P' :
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
                                <th style={{ padding: '4px', fontSize: '8px' }}>Dur</th>
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

      {/* Challenge Request Modal */}
      {challengeModal && challengeModal.type === 'request' && (
        <Modal
          title="Challenge request"
          open={true}
          onClose={handleRejectChallengeRequest}
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
                Confirm challenge request
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
                Reject challenge request
              </button>
              <button
                onClick={handleRejectChallengeRequest}
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

      {/* Challenge In Progress Modal */}
      {challengeModal && challengeModal.type === 'in_progress' && (
        <Modal
          title="Challenge in progress"
          open={true}
          onClose={() => {}}
          width={600}
          hideCloseButton={true}
        >
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                <strong>Team:</strong> {challengeModal.team === teamAKey ? 'A' : 'B'}
              </p>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                <strong>Reason:</strong> {challengeModal.reason}
              </p>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                <strong>Score:</strong> {challengeModal.score.team_1} - {challengeModal.score.team_2}
              </p>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                <strong>Set:</strong> {challengeModal.set}
              </p>
              <p style={{ fontSize: '16px', marginBottom: '12px' }}>
                <strong>Team serving:</strong> {challengeModal.servingTeam === teamAKey ? 'A' : 'B'}
              </p>
              <p style={{ fontSize: '16px', marginBottom: '20px' }}>
                <strong>Time of request:</strong> {new Date(challengeModal.time).toLocaleTimeString()}
              </p>
            </div>
            
            {/* Animated volleyball hitting sand court */}
            <div style={{ 
              margin: '30px 0',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '200px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'relative',
                width: '300px',
                height: '200px',
                background: 'linear-gradient(to bottom, #fbbf24 0%, #f59e0b 100%)',
                borderRadius: '8px',
                border: '2px solid #d97706',
                perspective: '500px'
              }}>
                {/* 3D Side line */}
                <div style={{
                  position: 'absolute',
                  left: '30px',
                  top: 0,
                  bottom: 0,
                  width: '6px',
                  background: 'linear-gradient(to right, #fff 0%, #e5e7eb 50%, #fff 100%)',
                  boxShadow: '2px 0 4px rgba(0, 0, 0, 0.2), -2px 0 4px rgba(255, 255, 255, 0.3)',
                  transform: 'rotateY(-15deg)',
                  transformStyle: 'preserve-3d',
                  zIndex: 1
                }}>
                  {/* 3D depth effect */}
                  <div style={{
                    position: 'absolute',
                    right: '-2px',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    transform: 'rotateY(90deg)',
                    transformOrigin: 'left center'
                  }}></div>
                </div>
                
                {/* Animated volleyball bouncing next to line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50px',
                    top: '20px',
                    animation: 'volleyballBounce 1.5s ease-in-out infinite',
                    zIndex: 2
                  }}
                >
                  <img
                    src={mikasaVolleyball}
                    alt="Volleyball"
                    style={{
                      width: '50px',
                      height: '50px',
                      filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
                      transform: 'rotateY(-10deg)'
                    }}
                  />
                </div>
                
                {/* Sand impact effect next to line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50px',
                    bottom: '40px',
                    width: '60px',
                    height: '15px',
                    background: 'radial-gradient(ellipse, rgba(0,0,0,0.3) 0%, transparent 70%)',
                    borderRadius: '50%',
                    animation: 'sandImpact 1.5s ease-in-out infinite',
                    zIndex: 1
                  }}
                ></div>
              </div>
            </div>
            
            <style>{`
              @keyframes volleyballBounce {
                0%, 100% {
                  transform: translateY(0) rotateY(-10deg);
                }
                50% {
                  transform: translateY(120px) rotateY(-10deg);
                }
              }
              @keyframes sandImpact {
                0%, 100% {
                  opacity: 0.3;
                  transform: scale(1);
                }
                50% {
                  opacity: 0.6;
                  transform: scale(1.3);
                }
              }
            `}</style>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <button
                onClick={handleSuccessfulChallenge}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Successful
              </button>
              <button
                onClick={handleUnsuccessfulChallenge}
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
                Unsuccessful
              </button>
            </div>
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
                  onClick={openInjuryFromMenu}
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
                    const roleAbbr = role === 'Coach' ? 'C' : 
                                     role === 'Assistant Coach 1' ? 'AC1' :
                                     role === 'Assistant Coach 2' ? 'AC2' :
                                     role === 'Physiotherapist' ? 'P' :
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
                  minWidth: '120px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                }}
              >
              <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '6px' }}>
                Injury
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                # {injuryDropdown.playerNumber}
              </div>
              <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>
                Action to be determined
              </div>
              </div>
            </div>
          </>
        )
      })()}
      
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
                    const teamKey = courtSwitchModal.teamThatScored
                    setCourtSwitchModal(null)
                    setChallengeModal({ type: 'request', team: teamKey })
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
                    alt="Challenge" 
                    style={{ width: '20px', height: '20px' }}
                  />
                  Challenge {courtSwitchModal.teamThatScored === teamAKey ? 'Team A' : 'Team B'}
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
                          const teamKey = technicalTOModal.teamThatScored
                          setTechnicalTOModal(null)
                          setChallengeModal({ type: 'request', team: teamKey })
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
                          alt="Challenge" 
                          style={{ width: '20px', height: '20px' }}
                        />
                        Challenge {technicalTOModal.teamThatScored === teamAKey ? 'Team A' : 'Team B'}
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
        
        return (
          <Modal
            title={isSet3 ? "Set 3 - Configure Teams and Service" : "Set 2 - Configure Teams and Service"}
            open={true}
            onClose={() => {}}
            width={600}
            hideCloseButton={true}
          >
            <div style={{ padding: '24px' }}>
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
                  <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 600 }}>3rd Set Coin Toss Winner</h3>
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
                </div>
              )}
              
              <p style={{ marginBottom: '24px', fontSize: '16px', textAlign: 'center' }}>
                Configure teams and service for {isSet3 ? 'Set 3' : 'Set 2'}.
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
                        src={mikasaVolleyball}
                        alt="Serving team"
                        style={{
                          width: '38px',
                          height: '38px',
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
                        src={mikasaVolleyball}
                        alt="Serving team"
                        style={{
                          width: '38px',
                          height: '38px',
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
                      setSetTransitionSelectedLeftTeam(setTransitionSelectedLeftTeam === 'A' ? 'B' : 'A')
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
                      setSetTransitionSelectedFirstServe(setTransitionSelectedFirstServe === 'A' ? 'B' : 'A')
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
                
                {/* Service Order Selection */}
                <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Service Order</h4>
                  <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
                    <div>
                      <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Team A</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                        <input
                          type="radio"
                          name="teamAServiceOrder"
                          value="1_2"
                          checked={setTransitionServiceOrder.teamA === '1_2'}
                          onChange={(e) => setSetTransitionServiceOrder({ ...setTransitionServiceOrder, teamA: '1_2' })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px' }}>1 - 2</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="teamAServiceOrder"
                          value="2_1"
                          checked={setTransitionServiceOrder.teamA === '2_1'}
                          onChange={(e) => setSetTransitionServiceOrder({ ...setTransitionServiceOrder, teamA: '2_1' })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px' }}>2 - 1</span>
                      </label>
                    </div>
                    <div>
                      <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Team B</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                        <input
                          type="radio"
                          name="teamBServiceOrder"
                          value="1_2"
                          checked={setTransitionServiceOrder.teamB === '1_2'}
                          onChange={(e) => setSetTransitionServiceOrder({ ...setTransitionServiceOrder, teamB: '1_2' })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px' }}>1 - 2</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="teamBServiceOrder"
                          value="2_1"
                          checked={setTransitionServiceOrder.teamB === '2_1'}
                          onChange={(e) => setSetTransitionServiceOrder({ ...setTransitionServiceOrder, teamB: '2_1' })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px' }}>2 - 1</span>
                      </label>
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

function SetEndTimeModal({ setIndex, winner, team_1Points, team_2Points, defaultTime, teamAKey, isMatchEnd, onConfirm, onCancel }) {
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
      width={400}
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


