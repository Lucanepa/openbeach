import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import mikasaVolleyball from '../mikasa_BV550C_beach.png'

export default function MatchEntry({ matchId, team, onBack }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])


  // Load match data
  const data = useLiveQuery(async () => {
    if (!matchId) return null

    const match = await db.matches.get(matchId)
    if (!match) return null

    const [team_1Team, team_2Team] = await Promise.all([
      match.team_1Id ? db.teams.get(match.team_1Id) : null,
      match.team_2Id ? db.teams.get(match.team_2Id) : null
    ])

    const currentSet = await db.sets
      .where('matchId')
      .equals(matchId)
      .filter(s => !s.finished)
      .sortBy('index')
      .then(sets => sets[0] || null)

    const allSets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    const events = await db.events
      .where('matchId')
      .equals(matchId)
      .sortBy('ts')

    const team_1Players = match.team_1Id
      ? await db.players.where('teamId').equals(match.team_1Id).sortBy('number')
      : []
    const team_2Players = match.team_2Id
      ? await db.players.where('teamId').equals(match.team_2Id).sortBy('number')
      : []

    return {
      match,
      team_1Team,
      team_2Team,
      set: currentSet,
      allSets,
      events,
      team_1Players,
      team_2Players
    }
  }, [matchId])

  // Determine which side the team is on (same logic as Scoreboard)
  const teamSide = useMemo(() => {
    if (!data?.set || !data?.match) return 'left'
    
    // Get Team A and Team B from coin toss
      const teamAKey = data.match.coinTossTeamA || 'team_1'
      const teamBKey = data.match.coinTossTeamB || 'team_2'
    
    // Set 1: Team A on left
    if (data.set.index === 1) {
      return team === teamAKey ? 'left' : 'right'
    }
    
    // Set 2, 3: Teams switch sides (Team A goes right, Team B goes left)
    return team === teamAKey ? 'right' : 'left'
  }, [data?.set, data?.match, team])

  // Get team info
  const teamInfo = useMemo(() => {
    if (!data) return null
    const isTeam_1 = team === 'team_1'
    return {
      name: isTeam_1 ? data.team_1Team?.name : data.team_2Team?.name,
      color: isTeam_1 ? data.team_1Team?.color : data.team_2Team?.color,
      players: isTeam_1 ? data.team_1Players : data.team_2Players,

    }
  }, [data, team])

  // Get current set points
  const points = useMemo(() => {
    if (!data?.set) return { team: 0, opponent: 0 }
    if (team === 'team_1') {
      return { team: data.set.team_1Points, opponent: data.set.team_2Points }
    } else {
      return { team: data.set.team_2Points, opponent: data.set.team_1Points }
    }
  }, [data?.set, team])

  // Get set score
  const setScore = useMemo(() => {
    if (!data?.allSets) return { team: 0, opponent: 0 }
    let teamWins = 0
    let opponentWins = 0
    for (const set of data.allSets) {
      if (set.finished) {
        if (team === 'team_1') {
          if (set.team_1Points > set.team_2Points) teamWins++
          else if (set.team_2Points > set.team_1Points) opponentWins++
        } else {
          if (set.team_2Points > set.team_1Points) teamWins++
          else if (set.team_1Points > set.team_2Points) opponentWins++
        }
      }
    }
    return { team: teamWins, opponent: opponentWins }
  }, [data?.allSets, team])

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
      // Beach volleyball: Only positions I and II
      return ['I', 'II'].map(pos => ({
        number: null,
        position: pos,
        isCaptain: false
      }))
    }
    
    // Get lineup events for current set
    const lineupEvents = data.events
      .filter(e => e.type === 'lineup' && e.setIndex === data.set.index && e.payload?.team === team)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    
    // Beach volleyball: Only positions I and II
    const positions = ['I', 'II']
    
    // If no lineup events, return empty placeholders
    if (lineupEvents.length === 0) {
      return positions.map(pos => ({
        number: null,
        position: pos,
        isCaptain: false
      }))
    }
    
    const latestLineupEvent = lineupEvents[0]
    const latestLineup = latestLineupEvent?.payload?.lineup
    
    // Beach volleyball: Lineup is stored as an object { I: 1, II: 2 }
    if (!latestLineup || typeof latestLineup !== 'object') {
      return positions.map(pos => ({
        number: null,
        position: pos,
        isCaptain: false
      }))
    }
    
    const players = positions.map((pos) => {
      const playerNum = latestLineup[pos]
      if (!playerNum) {
        return {
          number: null,
          position: pos,
          isCaptain: false
        }
      }
      
      const player = teamInfo?.players?.find(p => p.number === playerNum)
      
      return {
        number: playerNum,
        position: pos,
        isCaptain: player?.isCaptain || false
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

  if (!data || !teamInfo) {
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
        <div>Loading...</div>
      </div>
    )
  }

  // Beach volleyball: Only 2 players, no positions, no front/back row
  const beachPlayers = playersOnCourt.slice(0, 2) // Only first 2 players
  const showBall = isServing && beachPlayers.length > 0

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header with Back button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={onBack}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
            {teamInfo.name}
          </h1>
          <div style={{ width: '100px' }}></div>
        </div>

        {/* Score Display */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '20px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '48px',
            fontWeight: 700
          }}>
            <span>{points.team}</span>
            <span style={{ fontSize: '32px', opacity: 0.5 }}>:</span>
            <span>{points.opponent}</span>
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--muted)'
          }}>
            Sets: {setScore.team} - {setScore.opponent}
          </div>
        </div>

        {/* Court and Info Section - Side by side for right team */}
        <div style={{
          display: 'flex',
          flexDirection: teamSide === 'right' ? 'row' : 'column',
          gap: '20px',
          alignItems: teamSide === 'right' ? 'flex-start' : 'stretch'
        }}>
          {/* Court Display - Single Side */}
          <div className="court" style={{ 
            aspectRatio: '3 / 3', 
            maxWidth: '600px',
            width: teamSide === 'right' ? '50%' : '100%',
            margin: teamSide === 'right' ? '0' : '0 auto',
            gridTemplateColumns: '1fr',
            position: 'relative',
            flexShrink: 0
          }}>
          {/* Net - positioned on left if right team, on right if left team */}
          <div className="court-net" style={{
            left: teamSide === 'left' ? 'auto' : '0',
            right: teamSide === 'left' ? '0' : 'auto',
            transform: 'none',
            width: '8px'
          }} />
          
          {/* Beach volleyball: Single side court with 2 players */}
          <div className={`court-side court-side-${teamSide}`} style={{ width: '100%' }}>
            <div className={`court-team court-team-${teamSide}`} style={{ width: '100%', height: '100%' }}>
              {/* Beach volleyball: Single row with 2 players */}
              <div className={`court-row`} style={{ 
                display: 'flex', 
                flexDirection: 'row', 
                justifyContent: 'space-around',
                alignItems: 'center',
                height: '100%',
                width: '100%'
              }}>
                {beachPlayers.map((player, idx) => {
                  const sanctions = player.number ? getPlayerSanctions(player.number) : []
                  const hasWarning = sanctions.some(s => s.payload?.type === 'warning')
                  const hasPenalty = sanctions.some(s => s.payload?.type === 'penalty')
                  const hasExpulsion = sanctions.some(s => s.payload?.type === 'expulsion')
                  const hasDisqualification = sanctions.some(s => s.payload?.type === 'disqualification')
                  
                  const shouldShowBall = showBall && idx === 0 // First player serves
                  
                  return (
                    <div
                      key={`beach-${idx}`}
                      className="court-player"
                      style={{
                        position: 'relative',
                        width: 'clamp(56px, 12vw, 96px)',
                        height: 'clamp(56px, 12vw, 96px)',
                        fontSize: 'clamp(20px, 5vw, 36px)'
                      }}
                    >
                      {shouldShowBall && (
                        <img
                          src={mikasaVolleyball}
                          alt="Volleyball"
                          style={{
                            position: 'absolute',
                            left: teamSide === 'left' ? '-40px' : 'auto',
                            right: teamSide === 'left' ? 'auto' : '-40px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '30px',
                            height: '30px',
                            zIndex: 5,
                            filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))'
                          }}
                        />
                      )}
                      {player.isCaptain && (
                        <span className="court-player-captain">C</span>
                      )}
                      {player.number || '—'}
                      {sanctions.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          bottom: '-6px',
                          right: '-6px',
                          zIndex: 10
                        }}>
                          {hasExpulsion ? (
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
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Info Section - Right side for right team, below for left team */}
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            flex: teamSide === 'right' ? '1' : 'none',
            minWidth: teamSide === 'right' ? '300px' : 'auto'
          }}>
            {/* Timeouts */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '12px',
              marginBottom: teamSide === 'right' ? '0' : '20px'
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                  TO
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>
                  {timeoutsUsed} / 2
                </div>
              </div>
            </div>

        </div>

        {/* Overall Sanctions */}
        {overallSanctions.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
              Team Sanctions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overallSanctions.map((sanction, idx) => {
                const type = sanction.payload?.type || 'warning'
                const target = sanction.payload?.role || 'Team'
                const color = type === 'warning' || type === 'disqualification' ? '#eab308' : '#ef4444'
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{
                      width: '16px',
                      height: '22px',
                      background: color,
                      border: '1px solid rgba(0,0,0,0.3)',
                      borderRadius: '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.8)'
                    }}></div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{target}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}