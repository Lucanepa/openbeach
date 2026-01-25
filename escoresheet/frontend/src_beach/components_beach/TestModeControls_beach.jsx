import { useState } from 'react'
import { db } from '../db_beach/db_beach'

/**
 * TestModeControls - Debug buttons for testing match functionality
 * Only shown when in test mode (match.test === true)
 *
 * Provides random actions for:
 * - Add a point
 * - Switch side
 * - Switch serve
 * - Trigger timeout
 * - Trigger match end
 * - Trigger set end
 * - Call referee
 */
export default function TestModeControls({ matchId, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [lastAction, setLastAction] = useState(null)

  // Get current match state
  const getMatchState = async () => {
    const match = await db.matches.get(matchId)
    const sets = await db.sets.where('matchId').equals(matchId).sortBy('index')
    const currentSet = sets.find(s => !s.finished) || sets[sets.length - 1]
    const events = await db.events.where('matchId').equals(matchId).sortBy('seq')
    const currentSetEvents = events.filter(e => e.setIndex === currentSet?.index)

    // Get max seq for current set
    const maxSeq = currentSetEvents.reduce((max, e) => Math.max(max, e.seq || 0), 0)

    return { match, sets, currentSet, events, currentSetEvents, maxSeq }
  }

  // Add event helper
  const addEvent = async (type, payload, setIndex) => {
    const { maxSeq } = await getMatchState()
    const nextSeq = Math.floor(maxSeq) + 1

    await db.events.add({
      matchId,
      setIndex,
      type,
      payload,
      ts: new Date().toISOString(),
      seq: nextSeq
    })
  }

  // Random team selector
  const randomTeam = () => Math.random() > 0.5 ? 'team1' : 'team2'

  // Action handlers
  const handleAddPoint = async () => {
    try {
      const { currentSet } = await getMatchState()
      if (!currentSet) {
        setLastAction('No active set')
        return
      }

      const team = randomTeam()
      await addEvent('point', { team }, currentSet.index)

      // Update set score
      const field = team === 'team1' ? 'team1Points' : 'team2Points'
      const currentPoints = currentSet[field] || 0
      await db.sets.update(currentSet.id, { [field]: currentPoints + 1 })

      setLastAction(`Point: ${team}`)
      onRefresh?.()
    } catch (err) {
      console.error('[TestModeControls] Error in handleAddPoint:', err)
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleSwitchSide = async () => {
    try {
      const { match } = await getMatchState()

      // Toggle left/right team positions
      const newLeftTeam = match.leftTeam === 'team1' ? 'team2' : 'team1'
      await db.matches.update(matchId, { leftTeam: newLeftTeam })

      setLastAction(`Side: ${newLeftTeam} now left`)
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleSwitchServe = async () => {
    try {
      const { currentSet, currentSetEvents } = await getMatchState()
      if (!currentSet) {
        setLastAction('No active set')
        return
      }

      // Find current serve from lineup events
      const lineupEvents = currentSetEvents.filter(e => e.type === 'lineup')
      const lastteam1Lineup = lineupEvents.filter(e => e.payload?.team === 'team1').pop()
      const lastteam2Lineup = lineupEvents.filter(e => e.payload?.team === 'team2').pop()

      // Rotate serve between teams
      const currentServe = currentSet.firstServe || 'team1'
      const newServe = currentServe === 'team1' ? 'team2' : 'team1'

      await db.sets.update(currentSet.id, { firstServe: newServe })

      setLastAction(`Serve: ${newServe}`)
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleTriggerTimeout = async () => {
    try {
      const { currentSet } = await getMatchState()
      if (!currentSet) {
        setLastAction('No active set')
        return
      }

      const team = randomTeam()
      await addEvent('timeout', { team }, currentSet.index)

      setLastAction(`Timeout: ${team}`)
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleTriggerSetEnd = async () => {
    try {
      const { currentSet } = await getMatchState()
      if (!currentSet) {
        setLastAction('No active set')
        return
      }

      const winner = randomTeam()
      const winnerPoints = 25
      const loserPoints = Math.floor(Math.random() * 23) + 1 // 1-23

      await db.sets.update(currentSet.id, {
        team1Points: winner === 'team1' ? winnerPoints : loserPoints,
        team2Points: winner === 'team2' ? winnerPoints : loserPoints,
        finished: true,
        endTime: new Date().toISOString()
      })

      await addEvent('set_end', {
        team: winner,
        setIndex: currentSet.index,
        team1Points: winner === 'team1' ? winnerPoints : loserPoints,
        team2Points: winner === 'team2' ? winnerPoints : loserPoints
      }, currentSet.index)

      // Create next set if not match end
      const { sets } = await getMatchState()
      const team1SetsWon = sets.filter(s => s.finished && s.team1Points > s.team2Points).length
      const team2SetsWon = sets.filter(s => s.finished && s.team2Points > s.team1Points).length

      if (team1SetsWon < 3 && team2SetsWon < 3) {
        const nextSetIndex = (currentSet.index || 0) + 1
        await db.sets.add({
          matchId,
          index: nextSetIndex,
          team1Points: 0,
          team2Points: 0,
          finished: false,
          startTime: new Date().toISOString()
        })
      }

      setLastAction(`Set ${currentSet.index} end: ${winner} wins`)
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleTriggerMatchEnd = async () => {
    try {
      const { match, sets, currentSet } = await getMatchState()

      // Finish current set if not finished
      if (currentSet && !currentSet.finished) {
        const winner = randomTeam()
        await db.sets.update(currentSet.id, {
          team1Points: winner === 'team1' ? 25 : 20,
          team2Points: winner === 'team2' ? 25 : 20,
          finished: true,
          endTime: new Date().toISOString()
        })
      }

      // Count current wins
      const updatedSets = await db.sets.where('matchId').equals(matchId).toArray()
      let team1SetsWon = updatedSets.filter(s => s.finished && s.team1Points > s.team2Points).length
      let team2SetsWon = updatedSets.filter(s => s.finished && s.team2Points > s.team1Points).length

      // Add sets until one team wins 3
      const matchWinner = Math.random() > 0.5 ? 'team1' : 'team2'
      let setIndex = updatedSets.length

      while (team1SetsWon < 3 && team2SetsWon < 3) {
        setIndex++
        const setWinner = matchWinner === 'team1'
          ? (team1SetsWon < 3 ? 'team1' : 'team2')
          : (team2SetsWon < 3 ? 'team2' : 'team1')

        await db.sets.add({
          matchId,
          index: setIndex,
          team1Points: setWinner === 'team1' ? 25 : Math.floor(Math.random() * 23),
          team2Points: setWinner === 'team2' ? 25 : Math.floor(Math.random() * 23),
          finished: true,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        })

        if (setWinner === 'team1') team1SetsWon++
        else team2SetsWon++
      }

      // Update match status
      await db.matches.update(matchId, { status: 'final' })

      setLastAction(`Match end: ${matchWinner} wins ${team1SetsWon}-${team2SetsWon}`)
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const handleCallReferee = async () => {
    try {
      const { currentSet } = await getMatchState()
      if (!currentSet) {
        setLastAction('No active set')
        return
      }

      // Add a referee call event (remark type)
      await addEvent('remark', {
        type: 'referee_call',
        message: 'Debug: Referee called for consultation',
        team: randomTeam()
      }, currentSet.index)

      setLastAction('Referee called')
      onRefresh?.()
    } catch (err) {
      setLastAction(`Error: ${err.message}`)
    }
  }

  const buttonStyle = {
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 600,
    background: 'rgba(251, 191, 36, 0.2)',
    color: '#fbbf24',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  }

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          background: 'rgba(251, 191, 36, 0.3)',
          color: '#fbbf24',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 9999,
          border: '1px solid rgba(251, 191, 36, 0.5)'
        }}
      >
        TEST MODE
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.9)',
      borderRadius: '12px',
      padding: '12px',
      zIndex: 9999,
      border: '1px solid rgba(251, 191, 36, 0.5)',
      maxWidth: '320px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '12px' }}>
          TEST MODE CONTROLS
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#fbbf24',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px'
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
        marginBottom: '8px'
      }}>
        <button style={buttonStyle} onClick={handleAddPoint}>
          + Point
        </button>
        <button style={buttonStyle} onClick={handleSwitchSide}>
          Side
        </button>
        <button style={buttonStyle} onClick={handleSwitchServe}>
          Serve
        </button>
        <button style={buttonStyle} onClick={handleTriggerTimeout}>
          Timeout
        </button>
        <button style={buttonStyle} onClick={handleTriggerSetEnd}>
          Set End
        </button>
        <button style={buttonStyle} onClick={handleTriggerMatchEnd}>
          Match End
        </button>
        <button style={buttonStyle} onClick={handleCallReferee}>
          Call Ref
        </button>
      </div>

      {lastAction && (
        <div style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center',
          marginTop: '4px'
        }}>
          {lastAction}
        </div>
      )}
    </div>
  )
}
