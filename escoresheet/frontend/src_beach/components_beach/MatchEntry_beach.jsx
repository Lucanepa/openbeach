import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getMatchData, updateMatchData } from '../utils_beach/serverDataSync_beach'
import { useRealtimeConnection } from '../hooks_beach/useRealtimeConnection_beach'
import { db } from '../db_beach/db_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import { Results } from '../../scoresheet_pdf_beach/components_beach/FooterSection_beach'
import TestModeControls from './TestModeControls_beach'

export default function MatchEntry({ matchId, team, onBack, embedded = false }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Send heartbeat to indicate benc h connection is active (only if connection is enabled)
  useEffect(() => {
    if (!matchId || !team || matchId === -1) return // Skip in test mode

    const checkAndStartHeartbeat = async () => {
      const match = await db.matches.get(matchId)
      if (!match) return null
      const connectionEnabled = team === 'team1'
        ? match.team1ConnectionEnabled === true
        : match.team2ConnectionEnabled === true
      if (connectionEnabled === false) return null
      
      const updateHeartbeat = async () => {
        try {
          const heartbeatField = team === 'team1'
            ? 'lastTeam1Heartbeat'
            : 'lastTeam2Heartbeat'
          await db.matches.update(matchId, {
            [heartbeatField]: new Date().toISOString()
          })
        } catch (error) {
          console.error('Failed to update heartbeat:', error)
        }
      }
      
      // Initial heartbeat
      updateHeartbeat()
      
      // Update heartbeat every 5 seconds
      return setInterval(updateHeartbeat, 5000)
    }
    
    let interval = null
    checkAndStartHeartbeat().then(id => { interval = id })
    
    return () => {
      if (interval) clearInterval(interval)
      // Clear heartbeat on unmount (skip in test mode)
      if (matchId !== -1) {
        const heartbeatField = team === 'team1'
          ? 'lastTeam1Heartbeat'
          : 'lastTeam2Heartbeat'
        db.matches.update(matchId, { [heartbeatField]: null })
          .catch(() => {}) // Silently fail - not critical
      }
    }
  }, [matchId, team])

  // Load match data from server
  const [data, setData] = useState(null)

  // Helper to update state from match data result
  const updateFromMatchData = useCallback((result) => {
    if (!result || !result.success) return

    const allSets = (result.sets || []).sort((a, b) => a.index - b.index)
    const currentSet = allSets.find(s => !s.finished) || null
    const events = (result.events || []).sort((a, b) => {
      const aTime = typeof a.ts === 'number' ? a.ts : new Date(a.ts).getTime()
      const bTime = typeof b.ts === 'number' ? b.ts : new Date(b.ts).getTime()
      return aTime - bTime
    })

    setData({
      match: result.match,
      team1: result.team1,
      team2: result.team2,
      set: currentSet,
      allSets,
      events,
      team1Players: (result.team1Players || []).sort((a, b) => (a.number || 0) - (b.number || 0)),
      team2Players: (result.team2Players || []).sort((a, b) => (a.number || 0) - (b.number || 0))
    })
  }, [])

  // Handle match deletion - navigate back
  const handleMatchDeleted = useCallback(() => {
    if (onBack) {
      onBack()
    }
  }, [onBack])

  // Use Supabase Realtime as primary connection, WebSocket as fallback
  useRealtimeConnection({
    matchId: matchId !== -1 ? matchId : null, // Disable for test mode
    onData: updateFromMatchData,
    onDeleted: handleMatchDeleted,
    enabled: matchId && matchId !== -1
  })

  // Load initial data and handle test mode
  useEffect(() => {
    if (!matchId) {
      setData(null)
      return
    }

    // Fetch initial match data
    const fetchData = async () => {
      try {
        const result = await getMatchData(matchId)
        updateFromMatchData(result)
      } catch (err) {
        console.error('Error fetching match data:', err)
      }
    }

    fetchData()
  }, [matchId, updateFromMatchData])

  // Determine which side the team is on (same logic as Scoreboard)
  const teamSide = useMemo(() => {
    if (!data?.set || !data?.match) return 'left'
    
    // Get Team A and Team B from coin toss
    const teamAKey = data.match.coinTossTeamA || 'team1'
    const teamBKey = data.match.coinTossTeamB || 'team2'
    
    // Set 1: Team A on left
    if (data.set.index === 1) {
      return team === teamAKey ? 'left' : 'right'
    }
    
    // Set 3 (tie break): Special case with court switch at 8 points
    // Beach volleyball is best-of-3
    if (data.set.index === 3) {
      // Use set3LeftTeam if specified
      if (data.match.set3LeftTeam) {
        const leftTeamKey = data.match.set3LeftTeam === 'A' ? teamAKey : teamBKey
        let isLeft = team === leftTeamKey

        // If court switch has happened at 8 points, switch again
        if (data.match.set3CourtSwitched) {
          isLeft = !isLeft
        }

        return isLeft ? 'left' : 'right'
      }

      // Fallback: Set 3 starts with teams switched (like set 2)
      let isLeft = team !== teamAKey

      // If court switch has happened at 8 points, switch again
      if (data.match.set3CourtSwitched) {
        isLeft = !isLeft
      }

      return isLeft ? 'left' : 'right'
    }

    // Set 2: Teams switch sides (Team A goes right, Team B goes left)
    return team === teamAKey ? 'right' : 'left'
  }, [data?.set, data?.match, team])

  // Get team info
  const teamInfo = useMemo(() => {
    if (!data) return null
    const isTeam1 = team === 'team1'
    return {
      name: isTeam1 ? data.team1?.name : data.team2?.name,
      color: isTeam1 ? data.team1?.color : data.team2?.color,
      players: isTeam1 ? data.team1Players : data.team2Players,
    }
  }, [data, team])

  // Get opponent team info
  const opponentInfo = useMemo(() => {
    if (!data) return null
    const isTeam1 = team === 'team1'
    return {
      name: isTeam1 ? data.team2?.name : data.team1?.name,
      color: isTeam1 ? data.team2?.color : data.team1?.color,
      players: isTeam1 ? data.team2Players : data.team1Players,
    }
  }, [data, team])

  // Get current set points
  const points = useMemo(() => {
    if (!data?.set) return { team: 0, opponent: 0 }
    if (team === 'team1') {
      return { team: data.set.team1Points, opponent: data.set.team2Points }
    } else {
      return { team: data.set.team2Points, opponent: data.set.team1Points }
    }
  }, [data?.set, team])

  // Get sets won by each team
  const setsWon = useMemo(() => {
    if (!data?.allSets) return { team: 0, opponent: 0 }
    let teamWins = 0
    let opponentWins = 0
    for (const set of data.allSets) {
      if (set.finished) {
        if (team === 'team1') {
          if (set.team1Points > set.team2Points) teamWins++
          else if (set.team2Points > set.team1Points) opponentWins++
        } else {
          if (set.team2Points > set.team1Points) teamWins++
          else if (set.team1Points > set.team2Points) opponentWins++
        }
      }
    }
    return { team: teamWins, opponent: opponentWins }
  }, [data?.allSets, team])

  // Check if match is finished
  const isMatchFinished = useMemo(() => {
    return setsWon.team === 3 || setsWon.opponent === 3
  }, [setsWon])

  // Calculate set results for Results component
  const calculateSetResults = useMemo(() => {
    if (!data) return []

    const { match, allSets, events } = data
    const localTeamAKey = match?.coinTossTeamA || 'team1'
    const localTeamBKey = localTeamAKey === 'team1' ? 'team2' : 'team1'

    const results = []
    for (let setNum = 1; setNum <= 5; setNum++) {
      const setInfo = allSets?.find(s => s.index === setNum)
      const setEvents = events?.filter(e => e.setIndex === setNum) || []

      const isSetFinished = setInfo?.finished === true

      const teamAPoints = isSetFinished
        ? (localTeamAKey === 'team1' ? (setInfo?.team1Points || 0) : (setInfo?.team2Points || 0))
        : null
      const teamBPoints = isSetFinished
        ? (localTeamBKey === 'team1' ? (setInfo?.team1Points || 0) : (setInfo?.team2Points || 0))
        : null

      const teamATimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === localTeamAKey).length
        : null
      const teamBTimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === localTeamBKey).length
        : null

      const teamAWon = isSetFinished && teamAPoints !== null && teamBPoints !== null
        ? (teamAPoints > teamBPoints ? 1 : 0)
        : null
      const teamBWon = isSetFinished && teamAPoints !== null && teamBPoints !== null
        ? (teamBPoints > teamAPoints ? 1 : 0)
        : null

      let duration = ''
      if (isSetFinished && setInfo?.endTime) {
        let start
        if (setNum === 1 && match?.scheduledAt) {
          start = new Date(match.scheduledAt)
        } else if (setInfo?.startTime) {
          start = new Date(setInfo.startTime)
        } else {
          start = new Date()
        }
        const end = new Date(setInfo.endTime)
        const durationMs = end.getTime() - start.getTime()
        const minutes = Math.floor(durationMs / 60000)
        duration = minutes > 0 ? `${minutes}'` : ''
      }

      results.push({
        setNumber: setNum,
        teamATimeouts,
        teamAWon,
        teamAPoints,
        teamBTimeouts,
        teamBWon,
        teamBPoints,
        duration
      })
    }
    return results
  }, [data])

  // Match finished info
  const matchWinner = useMemo(() => {
    if (!isMatchFinished || !data) return ''
    const teamWon = setsWon.team > setsWon.opponent
    return teamWon ? teamInfo.name : opponentInfo.name
  }, [isMatchFinished, data, setsWon, teamInfo, opponentInfo])

  const matchResult = useMemo(() => {
    if (!isMatchFinished) return ''
    return `3:${Math.min(setsWon.team, setsWon.opponent)}`
  }, [isMatchFinished, setsWon])

  // Get timeouts used in current set
  const timeoutsUsed = useMemo(() => {
    if (!data?.events || !data?.set) return 0
    return data.events.filter(
      event => event.type === 'timeout' && 
      event.setIndex === data.set.index && 
      event.payload?.team === team
    ).length
  }, [data?.events, data?.set, team])

  // Get who is serving
  const isServing = useMemo(() => {
    if (!data?.events || !data?.set) return false
    // Find the last serve event in current set
    const serveEvents = data.events
      .filter(e => e.type === 'point' && e.setIndex === data.set.index)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    
    if (serveEvents.length === 0) {
      // Check first serve from match
      const firstServe = data.match?.firstServe
      return firstServe === team
    }
    
    const lastPoint = serveEvents[0]
    return lastPoint.payload?.team === team
  }, [data?.events, data?.set, data?.match, team])

  // Get players on court
  const playersOnCourt = useMemo(() => {
    if (!data?.events || !data?.set) {
      // Return empty placeholders if no set data
      return ['I', 'II', 'III', 'IV', 'V', 'VI'].map(pos => ({
        number: null,
        position: pos,
        isCaptain: false,
      }))
    }
    
    // Get lineup events for current set
    const lineupEvents = data.events
      .filter(e => e.type === 'lineup' && e.setIndex === data.set.index && e.payload?.team === team)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    
    const positions = ['I', 'II', 'III', 'IV', 'V', 'VI']
    
    // If no lineup events, return empty placeholders
    if (lineupEvents.length === 0) {
      return positions.map(pos => ({
        number: null,
        position: pos,
        isCaptain: false,
      }))
    }
    
    const latestLineupEvent = lineupEvents[0]
    const latestLineup = latestLineupEvent?.payload?.lineup
    
    // Lineup is stored as an object { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }
    // Convert to array in correct order: I, II, III (front), IV, V, VI (back)
    if (!latestLineup || typeof latestLineup !== 'object') {
      return positions.map(pos => ({
        number: null,
        position: pos,
        isCaptain: false
      }))
    }
    
    const players = positions.map((pos) => {
      const posData = latestLineup[pos]
      // Handle both rich format (posData is object with number) and legacy format (posData is number)
      const playerNum = posData && typeof posData === 'object' && posData.number !== undefined
        ? posData.number
        : posData
      if (!playerNum) {
        return {
          number: null,
          position: pos,
          isCaptain: false,
        }
      }

      const player = teamInfo?.players?.find(p => String(p.number) === String(playerNum))

      return {
        number: playerNum,
        position: pos,
        isCaptain: player?.isCaptain || false,
      }
    })
    
    return players
  }, [data?.events, data?.set, team, teamInfo])

  // Get player sanctions
  const getPlayerSanctions = useCallback((playerNumber) => {
    if (!data?.events) return []
    return data.events.filter(
      e => e.type === 'sanction' && 
      e.payload?.team === team && 
      e.payload?.playerNumber === playerNumber
    )
  }, [data?.events, team])

  // Get official sanctions (by role)
  const getOfficialSanctions = useCallback((role) => {
    if (!data?.events) return []
    return data.events.filter(
      e => e.type === 'sanction' && 
      e.payload?.team === team && 
      e.payload?.role === role &&
      !e.payload?.playerNumber // Only team/official sanctions, not player sanctions
    )
  }, [data?.events, team])

  // Get overall team sanctions
  const overallSanctions = useMemo(() => {
    if (!data?.events) return []
    return data.events.filter(
      e => e.type === 'sanction' &&
      e.payload?.team === team &&
      (!e.payload?.playerNumber || e.payload?.role)
    )
  }, [data?.events, team])

  // Collect all sanctions for display - MUST be before any early returns to maintain consistent hook order
  const allSanctionsForDisplay = useMemo(() => {
    const sanctions = []

    // Player sanctions (on court)
    playersOnCourt.forEach(player => {
      if (player.number) {
        const playerSanctions = getPlayerSanctions(player.number)
        playerSanctions.forEach(s => {
          sanctions.push({
            type: 'player',
            number: player.number,
            sanctionType: s.payload?.type || 'warning'
          })
        })
      }
    })

  


    // Overall team sanctions
    overallSanctions.forEach(s => {
      sanctions.push({
        type: 'team',
        role: s.payload?.role || 'Team',
        sanctionType: s.payload?.type || 'warning'
      })
    })

    return sanctions
  }, [playersOnCourt, overallSanctions, getPlayerSanctions])

  if (!data || !teamInfo) {
    if (embedded) {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div>{t('matchEntry.loading')}</div>
        </div>
      )
    }
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div>{t('matchEntry.loading')}</div>
      </div>
    )
  }

  // Reorder players based on team side
  // Left team: Front row (IV, III, II), Back row (V, VI, I)
  // Right team: Front row (II, III, IV), Back row (I, VI, V) - mirrored
  const frontRow = playersOnCourt.filter(p => ['II', 'III', 'IV'].includes(p.position))
    .sort((a, b) => {
      if (teamSide === 'right') {
        // Right team: II, III, IV
        const order = { 'II': 0, 'III': 1, 'IV': 2 }
        return (order[a.position] || 0) - (order[b.position] || 0)
      } else {
        // Left team: IV, III, II
        const order = { 'IV': 0, 'III': 1, 'II': 2 }
        return (order[a.position] || 0) - (order[b.position] || 0)
      }
    })
  const backRow = playersOnCourt.filter(p => ['I', 'VI', 'V'].includes(p.position))
    .sort((a, b) => {
      if (teamSide === 'right') {
        // Right team: I, VI, V
        const order = { 'I': 0, 'VI': 1, 'V': 2 }
        return (order[a.position] || 0) - (order[b.position] || 0)
      } else {
        // Left team: V, VI, I
        const order = { 'V': 0, 'VI': 1, 'I': 2 }
        return (order[a.position] || 0) - (order[b.position] || 0)
      }
    })
  const position1Player = playersOnCourt.find(p => p.position === 'I')
  const showBall = isServing && position1Player

  // Show results when match is finished
  if (isMatchFinished) {
    const teamAShortName = data?.match?.coinTossTeamA === 'team1'
      ? (data?.match?.team1ShortName || data?.team1?.shortName || data?.team1?.name || 'Team 1')
      : (data?.match?.team2ShortName || data?.team2?.shortName || data?.team2?.name || 'Team 2')
    const teamBShortName = data?.match?.coinTossTeamA === 'team1'
      ? (data?.match?.team2ShortName || data?.team2?.shortName || data?.team2?.name || 'Team 2')
      : (data?.match?.team1ShortName || data?.team1?.shortName || data?.team1?.name || 'Team 1')

    return (
      <div style={{
        minHeight: embedded ? 'auto' : '100vh',
        height: embedded ? '100%' : 'auto',
        background: embedded ? 'transparent' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: '#fff',
        padding: embedded ? '12px' : '20px',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px'
      }}>
        {/* Match Ended Banner */}
        <div style={{
          fontSize: '18px',
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.7)',
          textTransform: 'uppercase',
          letterSpacing: '2px'
        }}>
          The match has ended
        </div>

        {/* Winner and Result */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '8px'
          }}>
            {matchWinner}
          </div>
          <div style={{
            fontSize: '48px',
            fontWeight: 800,
            color: 'var(--accent)'
          }}>
            {matchResult}
          </div>
        </div>

        {/* Results Table */}
        <div style={{
          width: '100%',
          maxWidth: '500px',
          background: 'white',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <Results
            teamAShortName={teamAShortName}
            teamBShortName={teamBShortName}
            setResults={calculateSetResults}
            winner={matchWinner}
            result={matchResult}
          />
        </div>

        {!embedded && (
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              marginTop: '16px'
            }}
          >
            Back
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{
      minHeight: embedded ? 'auto' : '100vh',
      height: embedded ? '100%' : 'auto',
      background: embedded ? 'transparent' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      padding: embedded ? '8px' : '12px',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      flex: embedded ? 1 : 'none',
      gap: '8px'
    }}>
      {/* Header with Back button - only show when not embedded */}
      {!embedded && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px'
        }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
            {teamInfo.name}
          </h1>
          <div style={{ width: '80px' }}></div>
        </div>
      )}

      {/* SECTION 1: TO+SUB | Score & Sets | Sanctions */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: '8px',
        alignItems: 'stretch'
      }}>
        {/* Left: TO + SUB side by side */}
        <div style={{
          display: 'flex',
          gap: '6px'
        }}>
          {/* TO Counter */}
          <div style={{
            background: timeoutsUsed >= 1 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '6px 12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: timeoutsUsed >= 1 ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
            minWidth: '50px'
          }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '2px' }}>TO</div>
            <div style={{
              fontSize: '28px',
              fontWeight: 800,
              color: timeoutsUsed >= 1 ? '#ef4444' : '#fff'
            }}>
              {timeoutsUsed}
            </div>
          </div>
        </div>

        {/* Center: Score and Set Counter */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px'
        }}>
          {/* Score */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px'
          }}>
            <span style={{
              fontSize: '48px',
              fontWeight: 800,
              color: '#22c55e'
            }}>{points.team}</span>
            <span style={{
              fontSize: '24px',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.4)'
            }}>:</span>
            <span style={{
              fontSize: '28px',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)'
            }}>{points.opponent}</span>
          </div>
          {/* Set Score */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}>
            <span style={{ color: 'var(--muted)' }}>Set {data?.set?.index || 1}</span>
            <span style={{
              fontWeight: 700,
              color: '#22c55e',
              fontSize: '18px'
            }}>{setsWon.team}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>-</span>
            <span style={{
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              fontSize: '14px'
            }}>{setsWon.opponent}</span>
          </div>
        </div>

        {/* Right: Sanctions */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          maxHeight: '80px',
          overflow: 'auto',
          minWidth: '100px'
        }}>
          <div style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 600 }}>SANCTIONS</div>
          {allSanctionsForDisplay.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>None</div>
          ) : (
            allSanctionsForDisplay.slice(0, 3).map((s, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}>
                <div style={{
                  width: '8px',
                  height: '12px',
                  background: s.sanctionType === 'warning' || s.sanctionType === 'disqualification' ? '#eab308' : '#ef4444',
                  borderRadius: '1px'
                }}></div>
                <span style={{ fontWeight: 600 }}>
                  {s.type === 'player' ? `#${s.number}` : s.role}
                </span>
              </div>  
            ))
          )}
          {allSanctionsForDisplay.length > 3 && (
            <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{`+${allSanctionsForDisplay.length - 3} more`}</div>
          )}
        </div>
      </div>

      {/* SECTION 2: Court (full width, centered) */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        minHeight: 0
      }}>
        {/* Court - centered, max 80% width */}
        <div style={{
          width: '80%',
          maxWidth: '400px',
          aspectRatio: '1 / 1',
          position: 'relative'
        }}>
          <div className="court" style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}>
            {/* 3m line */}
            <div className="court-attack-line" style={{
              left: teamSide === 'left' ? 'calc(100% - 40.33%)' : '40.33%',
              right: teamSide === 'left' ? '0' : 'auto'
            }} />

            {/* Net */}
            <div className="court-net" style={{
              left: teamSide === 'left' ? 'auto' : '0',
              right: teamSide === 'left' ? '0' : 'auto',
              transform: 'none',
              width: '6px'
            }} />

            {/* Single side court */}
            <div className={`court-side court-side-${teamSide}`} style={{ width: '100%' }}>
              <div className={`court-team court-team-${teamSide}`} style={{ width: '100%', height: '100%' }}>
                {/* Front Row */}
                <div className="court-row court-row-front">
                  {frontRow.map((player, idx) => {
                    const sanctions = player.number ? getPlayerSanctions(player.number) : []
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    const shouldShowBall = showBall && player.position === 'I'

                    return (
                      <div
                        key={`front-${player.position}-${idx}`}
                        className="court-player"
                        style={{
                          position: 'relative',
                          aspectRatio: '1 / 1',
                          fontSize: 'clamp(25px, 10vw, 40px)',
                          background: teamInfo?.color
                        }}
                      >
                        {shouldShowBall && (
                          <img src={ballImage} alt="Serve" style={{
                            position: 'absolute',
                            left: teamSide === 'left' ? '-28px' : 'auto',
                            right: teamSide === 'left' ? 'auto' : '-28px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '24px',
                            height: '24px',
                            zIndex: 5,
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                          }} />
                        )}
                        <span className="court-player-position">{player.position}</span>
                        {player.isCaptain && (
                          <span className="court-player-captain">C</span>
                        )}
                        {player.number || '—'}
                        {sanctions.length > 0 && (
                          <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', zIndex: 10 }}>
                            {hasExpulsion ? (
                              <div style={{ position: 'relative', width: '10px', height: '10px' }}>
                                <div className="sanction-card yellow" style={{ width: '5px', height: '8px', position: 'absolute', left: 0, top: '1px', transform: 'rotate(-8deg)', borderRadius: '1px' }}></div>
                                <div className="sanction-card red" style={{ width: '5px', height: '8px', position: 'absolute', right: 0, top: '1px', transform: 'rotate(8deg)', borderRadius: '1px' }}></div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '1px' }}>
                                {(hasWarning || hasDisqualification) && <div className="sanction-card yellow" style={{ width: '6px', height: '9px', borderRadius: '1px' }}></div>}
                                {(hasPenalty || hasDisqualification) && <div className="sanction-card red" style={{ width: '6px', height: '9px', borderRadius: '1px' }}></div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Back Row */}
                <div className="court-row court-row-back">
                  {backRow.map((player, idx) => {
                    const sanctions = player.number ? getPlayerSanctions(player.number) : []
                    const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                    const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                    const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                    const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                    const shouldShowBall = showBall && player.position === 'I'

                    return (
                      <div
                        key={`back-${player.position}-${idx}`}
                        className="court-player"
                        style={{
                          position: 'relative',
                          width: 'clamp(44px, 10vw, 72px)',
                          height: 'clamp(44px, 10vw, 72px)',
                          fontSize: 'clamp(18px, 4vw, 28px)',
                          background: teamInfo?.color
                        }}
                      >
                        {shouldShowBall && (
                          <img src={ballImage} alt="Serve" style={{
                            position: 'absolute',
                            left: teamSide === 'left' ? '-28px' : 'auto',
                            right: teamSide === 'left' ? 'auto' : '-28px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '24px',
                            height: '24px',
                            zIndex: 5,
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                          }} />
                        )}
                        <span className="court-player-position">{player.position}</span>
                        {player.isCaptain && (
                          <span className="court-player-captain">C</span>
                        )}
                        {player.number || '—'}
                        {sanctions.length > 0 && (
                          <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', zIndex: 10 }}>
                            {hasExpulsion ? (
                              <div style={{ position: 'relative', width: '10px', height: '10px' }}>
                                <div className="sanction-card yellow" style={{ width: '5px', height: '8px', position: 'absolute', left: 0, top: '1px', transform: 'rotate(-8deg)', borderRadius: '1px' }}></div>
                                <div className="sanction-card red" style={{ width: '5px', height: '8px', position: 'absolute', right: 0, top: '1px', transform: 'rotate(8deg)', borderRadius: '1px' }}></div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '1px' }}>
                                {(hasWarning || hasDisqualification) && <div className="sanction-card yellow" style={{ width: '6px', height: '9px', borderRadius: '1px' }}></div>}
                                {(hasPenalty || hasDisqualification) && <div className="sanction-card red" style={{ width: '6px', height: '9px', borderRadius: '1px' }}></div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Mode Controls - only shown in test mode */}
      {(matchId === -1 || data?.match?.test === true) && (
        <TestModeControls
          matchId={matchId}
          onRefresh={() => {
            if (matchId && matchId !== -1) {
              getMatchData(matchId).then(result => {
                if (result.success) {
                  setData(result)
                }
              })
            }
          }}
        />
      )}
    </div>
  )
}