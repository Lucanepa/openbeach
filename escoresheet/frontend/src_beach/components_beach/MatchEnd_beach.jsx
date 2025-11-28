import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import SignaturePad from './SignaturePad_beach'
import mikasaVolleyball from '../mikasa_BV550C_beach.png'
import { Results, Sanctions, Remarks } from '../../scoresheet_pdf_beach/components_beach/FooterSection_beach'

export default function MatchEnd({ matchId, onShowScoresheet, onGoHome }) {
  const [openSignature, setOpenSignature] = useState(null) // 'team_1-captain', 'team_2-captain', 'ref1', 'ref2', 'scorer', 'asst-scorer'

  const data = useLiveQuery(async () => {
    const match = await db.matches.get(matchId)
    if (!match) return null

    const [team_1Team, team_2Team] = await Promise.all([
      match?.team_1Id ? db.teams.get(match.team_1Id) : null,
      match?.team_2Id ? db.teams.get(match.team_2Id) : null
    ])

    const [team_1Players, team_2Players] = await Promise.all([
      match?.team_1Id
        ? db.players.where('teamId').equals(match.team_1Id).sortBy('number')
        : [],
      match?.team_2Id
        ? db.players.where('teamId').equals(match.team_2Id).sortBy('number')
        : []
    ])

    const sets = await db.sets
      .where('matchId')
      .equals(matchId)
      .sortBy('index')

    const events = await db.events
      .where('matchId')
      .equals(matchId)
      .sortBy('seq')

    return {
      match,
      team_1Team,
      team_2Team,
      team_1Players,
      team_2Players,
      sets,
      events
    }
  }, [matchId])

  if (!data) return null

  const { match, team_1Team, team_2Team, team_1Players, team_2Players, sets, events } = data

  // Calculate set scores
  const finishedSets = sets.filter(s => s.finished)
  const team_1SetsWon = finishedSets.filter(s => s.team_1Points > s.team_2Points).length
  const team_2SetsWon = finishedSets.filter(s => s.team_2Points > s.team_1Points).length

  // Find captains
  const team_1Captain = team_1Players.find(p => p.captain)
  const team_2Captain = team_2Players.find(p => p.captain)

  // Determine team labels (A or B)
  const teamAKey = match.coinTossTeamA || 'team_1'
  const teamBKey = teamAKey === 'team_1' ? 'team_2' : 'team_1'
  const teamALabel = teamAKey === 'team_1' ? 'A' : 'B'
  const teamBLabel = teamAKey === 'team_2' ? 'A' : 'B'

  // Calculate set results for Results component
  const calculateSetResults = useMemo(() => {
    const results = []
    for (let setNum = 1; setNum <= 5; setNum++) {
      const setInfo = sets.find(s => s.index === setNum)
      const setEvents = events?.filter(e => e.setIndex === setNum) || []
      
      const isSetFinished = setInfo?.finished === true
      
      const teamAPoints = isSetFinished
        ? (teamAKey === 'team_1' ? (setInfo?.team_1Points || 0) : (setInfo?.team_2Points || 0))
        : null
      const teamBPoints = isSetFinished
        ? (teamBKey === 'team_1' ? (setInfo?.team_1Points || 0) : (setInfo?.team_2Points || 0))
        : null
      
      const teamATimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === teamAKey).length
        : null
      const teamBTimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === teamBKey).length
        : null
      
      const teamASubstitutions = isSetFinished
        ? setEvents.filter(e => e.type === 'substitution' && e.payload?.team === teamAKey).length
        : null
      const teamBSubstitutions = isSetFinished
        ? setEvents.filter(e => e.type === 'substitution' && e.payload?.team === teamBKey).length
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
        teamASubstitutions,
        teamAWon,
        teamAPoints,
        teamBTimeouts,
        teamBSubstitutions,
        teamBWon,
        teamBPoints,
        duration
      })
    }
    return results
  }, [sets, events, teamAKey, teamBKey, match])

  // Calculate match-level results
  const isMatchFinished = team_1SetsWon === 3 || team_2SetsWon === 3
  const matchStart = match?.scheduledAt 
    ? new Date(match.scheduledAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
    : ''
  const matchEndFinal = isMatchFinished && finishedSets.length > 0
    ? new Date(finishedSets[finishedSets.length - 1].endTime).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
    : ''
  const matchDuration = isMatchFinished
    ? (() => {
        const totalMinutes = calculateSetResults.reduce((sum, r) => {
          if (!r.duration) return sum
          const match = r.duration.match(/(\d+)'/)
          return sum + (match ? parseInt(match[1], 10) : 0)
        }, 0)
        return totalMinutes > 0 ? `${totalMinutes}'` : ''
      })()
    : ''
  const winner = isMatchFinished
    ? (team_1SetsWon > team_2SetsWon ? (team_1Team?.name || 'Team 1') : (team_2Team?.name || 'Team 2'))
    : ''
  const result = isMatchFinished
    ? `3:${Math.min(team_1SetsWon, team_2SetsWon)}`
    : ''

  // Process sanctions
  const { sanctions: processedSanctions, improperRequests } = useMemo(() => {
    const sanctionRecords = []
    const improperRequests = { teamA: false, teamB: false }
    
    if (!events) return { sanctions: sanctionRecords, improperRequests }
    
    const sanctionEvents = events
      .filter(e => e.type === 'sanction')
      .sort((a, b) => {
        const aSeq = a.seq || 0
        const bSeq = b.seq || 0
        if (aSeq !== 0 || bSeq !== 0) return aSeq - bSeq
        return new Date(a.ts).getTime() - new Date(b.ts).getTime()
      })
    
    const getScoreAtEvent = (eventTimestamp, setIndex) => {
      const pointEvents = events
        .filter(e => 
          e.setIndex === setIndex && 
          e.type === 'point' &&
          new Date(e.ts).getTime() <= eventTimestamp.getTime()
        )
        .sort((a, b) => {
          const aSeq = a.seq || 0
          const bSeq = b.seq || 0
          if (aSeq !== 0 || bSeq !== 0) return aSeq - bSeq
          return new Date(a.ts).getTime() - new Date(b.ts).getTime()
        })
      
      let team_1Score = 0
      let team_2Score = 0
      
      for (const e of pointEvents) {
        if (e.payload?.team === 'team_1') team_1Score++
        else if (e.payload?.team === 'team_2') team_2Score++
      }
      
      const teamAScore = teamAKey === 'team_1' ? team_1Score : team_2Score
      const teamBScore = teamBKey === 'team_1' ? team_1Score : team_2Score
      
      return `${teamAScore}:${teamBScore}`
    }
    
    for (const event of sanctionEvents) {
      const payload = event.payload || {}
      const sanctionType = payload.type
      const eventTeam = payload.team
      const setIndex = event.setIndex
      
      const teamLabel = (eventTeam === teamAKey) ? 'A' : 'B'
      
      const eventTimestamp = new Date(event.ts)
      const rawScore = getScoreAtEvent(eventTimestamp, setIndex)
      
      const [teamAScoreStr, teamBScoreStr] = rawScore.split(':')
      const sanctionedTeamScore = teamLabel === 'A' ? teamAScoreStr : teamBScoreStr
      const otherTeamScore = teamLabel === 'A' ? teamBScoreStr : teamAScoreStr
      const score = `${sanctionedTeamScore}:${otherTeamScore}`
      
      if (sanctionType === 'improper_request') {
        if (teamLabel === 'A') improperRequests.teamA = true
        else improperRequests.teamB = true
        continue
      }
      
      if (sanctionType === 'delay_warning' || sanctionType === 'delay_penalty') {
        sanctionRecords.push({
          team: teamLabel,
          playerNr: 'D',
          type: sanctionType === 'delay_warning' ? 'warning' : 'penalty',
          set: setIndex,
          score: score
        })
        continue
      }
      
      if (['warning', 'penalty', 'expulsion', 'disqualification'].includes(sanctionType)) {
        let playerNr = ''
        
        if (payload.playerNumber) {
          playerNr = String(payload.playerNumber)
        } else if (payload.role) {
          const roleMap = {
            'Coach': 'C',
            'Assistant Coach 1': 'AC1',
            'Assistant Coach 2': 'AC2',
            'Physiotherapist': 'P',
            'Medic': 'M'
          }
          playerNr = roleMap[payload.role] || payload.role.charAt(0).toUpperCase()
        } else if (payload.playerType === 'official') {
          playerNr = 'C'
        }
        
        if (playerNr) {
          sanctionRecords.push({
            team: teamLabel,
            playerNr: playerNr,
            type: sanctionType,
            set: setIndex,
            score: score
          })
        }
      }
    }
    
    return { sanctions: sanctionRecords, improperRequests }
  }, [events, teamAKey, teamBKey])

  // Split sanctions into those that fit in the box (first 10) and overflow
  const sanctionsInBox = processedSanctions.slice(0, 10)
  const overflowSanctions = processedSanctions.slice(10)

  const handleSaveSignature = async (role, signatureData) => {
    if (role === 'home-captain') {
      await db.matches.update(matchId, { team_1CaptainSignature: signatureData })
    } else if (role === 'team_2-captain') {
      await db.matches.update(matchId, { team_2CaptainSignature: signatureData })
    } else if (role === 'ref1') {
      await db.matches.update(matchId, { ref1Signature: signatureData })
    } else if (role === 'ref2') {
      await db.matches.update(matchId, { ref2Signature: signatureData })
    } else if (role === 'scorer') {
      await db.matches.update(matchId, { scorerSignature: signatureData })
    } else if (role === 'asst-scorer') {
      await db.matches.update(matchId, { asstScorerSignature: signatureData })
    }
    setOpenSignature(null)
  }

  const getSignatureDisplayName = (role) => {
    if (role === 'home-captain') {
      return `${team_1Team?.name || 'Team 1'} Captain ${team_1Captain ? `(#${team_1Captain.number})` : ''}`
    } else if (role === 'team_2-captain') {
      return `${team_2Team?.name || 'Team 2'} Captain ${team_2Captain ? `(#${team_2Captain.number})` : ''}`
    } else if (role === 'ref1') {
      return '1st Referee'
    } else if (role === 'ref2') {
      return '2nd Referee'
    } else if (role === 'scorer') {
      return 'Scorer'
    } else if (role === 'asst-scorer') {
      return 'Assistant Scorer'
    }
    return ''
  }

  const getSignatureData = (role) => {
      if (role === 'team_1-captain') return match.team_1CaptainSignature
      if (role === 'team_2-captain') return match.team_2CaptainSignature
    if (role === 'ref1') return match.ref1Signature
    if (role === 'ref2') return match.ref2Signature
    if (role === 'scorer') return match.scorerSignature
    if (role === 'asst-scorer') return match.asstScorerSignature
    return null
  }

  const SignatureBox = ({ role, label }) => {
    const signatureData = getSignatureData(role)
    
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '8px',
        flex: 1
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
          {label}
        </div>
        <div 
          onClick={() => setOpenSignature(role)}
          style={{
            border: '2px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            minHeight: '80px',
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
                maxHeight: '100%',
                objectFit: 'contain'
              }} 
            />
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '14px' }}>
              Tap to sign
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={mikasaVolleyball} alt="Volleyball" style={{ width: '40px', height: '40px' }} />
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Match Complete</h1>
        </div>
        <button
          onClick={onGoHome}
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
          Home
        </button>
      </div>

      {/* Match Result */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: 700, 
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Final Result
        </h2>
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-around', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          {/* Team 1 */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Team {teamALabel}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '12px' }}>
              {team_1Team?.name || 'Home'}
            </div>
            <div style={{ 
              fontSize: '48px', 
              fontWeight: 700,
              color: team_1SetsWon > team_2SetsWon ? 'var(--accent)' : 'var(--text)'
            }}>
              {team_1SetsWon}
            </div>
          </div>

          {/* VS */}
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'var(--muted)',
            padding: '0 20px'
          }}>
            -
          </div>

          {/* Team 2 */}
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Team {teamBLabel}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '12px' }}>
              {team_2Team?.name || 'Team 2'}
            </div>
            <div style={{ 
              fontSize: '48px', 
              fontWeight: 700,
              color: team_2SetsWon > team_1SetsWon ? 'var(--accent)' : 'var(--text)'
            }}>
              {team_2SetsWon}
            </div>
          </div>
        </div>

        {/* Set-by-Set Breakdown */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            Results
          </div>
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.2)',
            minHeight: '300px'
          }}>
            <Results
              teamAShortName={teamALabel === 'A' ? (team_1Team?.shortName || team_1Team?.name || '') : (team_2Team?.shortName || team_2Team?.name || '')}
              teamBShortName={teamBLabel === 'B' ? (team_2Team?.shortName || team_2Team?.name || '') : (team_1Team?.shortName || team_1Team?.name || '')}
              setResults={calculateSetResults}
              matchStart={matchStart}
              matchEnd={matchEndFinal}
              matchDuration={matchDuration}
              winner={winner}
              result={result}
            />
          </div>

          <div style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 12px 0' }}>
            Sanctions
          </div>
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.2)',
            minHeight: '200px'
          }}>
            <Sanctions
              items={sanctionsInBox}
              improperRequests={improperRequests}
            />
          </div>

          <div style={{ fontSize: '16px', fontWeight: 600, margin: '24px 0 12px 0' }}>
            Remarks
          </div>
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.2)',
            minHeight: '150px'
          }}>
            <Remarks overflowSanctions={overflowSanctions} />
          </div>
        </div>
      </div>
      {/* Action Button */}
      <button
        onClick={async () => {
          try {
            // Gather all match data needed for the scoresheet
            const allSets = await db.sets.where('matchId').equals(matchId).sortBy('index');
            const allEvents = await db.events.where('matchId').equals(matchId).sortBy('seq');
            
            // Create a data package to pass to the scoresheet
            const scoresheetData = {
              match,
              team_1Team,
              team_2Team,
              team_1Players,
              team_2Players,
              sets: allSets,
              events: allEvents,
              sanctions: [] // TODO: Extract sanctions from events
            };
            
            // Store data in sessionStorage to pass to new window
            sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData));
            
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
            );
            
            if (!scoresheetWindow) {
              alert('Please allow popups to view the scoresheet');
              return;
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
          } catch (error) {
            console.error('Error opening scoresheet:', error);
            alert('Error opening scoresheet: ' + error.message);
          }
        }}
        style={{
          width: '100%',
          padding: '16px',
          fontSize: '16px',
          fontWeight: 600,
          background: 'var(--accent)',
          color: '#000',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        Show Scoresheet
      </button>

      {/* Signature Modal */}
      {openSignature && (
        <SignaturePad
          title={getSignatureDisplayName(openSignature)}
          onSave={(signatureData) => handleSaveSignature(openSignature, signatureData)}
          onClose={() => setOpenSignature(null)}
        />
      )}
    </div>
  )
}

