import { useState, useMemo, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import SignaturePad from './SignaturePad_beach'
import MenuList from './MenuList_beach'
import Modal from './Modal_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import JSZip from 'jszip'
import { supabase } from '../lib_beach/supabaseClient_beach'
import { uploadScoresheet } from '../utils_beach/scoresheetUploader_beach'
import { useComponentLogging } from '../contexts_beach/LoggingContext_beach'
import { exportLogsAsNDJSON } from '../utils_beach/comprehensiveLogger_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'

import { sanitizeForFilename } from '../utils_beach/stringUtils_beach'
import { formatTimeLocal } from '../utils_beach/timeUtils_beach'
import CountryFlag from './CountryFlag_beach'

// Helper to determine if a color is bright (for text contrast)
function isBrightColor(color) {
  if (!color) return false
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

// Helper to format duration as hh:mm
const formatDurationHHMM = (durationStr) => {
  if (!durationStr) return ''
  // If already in format like "176'" (minutes), convert to hh:mm
  const match = durationStr.match(/^(\d+)'?$/)
  if (match) {
    const totalMinutes = parseInt(match[1], 10)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}:${String(minutes).padStart(2, '0')}`
  }
  return durationStr
}

// Standard Results component for MatchEnd page
const ResultsTable = ({ teamAName, teamBName, teamACountry, teamBCountry, setResults, matchStart, matchEnd, matchDuration }) => {
  // Calculate winner
  const teamAWins = setResults?.reduce((sum, r) => sum + (r.teamAWon ?? 0), 0) || 0
  const teamBWins = setResults?.reduce((sum, r) => sum + (r.teamBWon ?? 0), 0) || 0
  const winnerName = teamAWins > teamBWins ? teamAName : teamBWins > teamAWins ? teamBName : null

  return (
    <div style={{ padding: '12px', fontSize: '12px', background: '#fff', color: '#000', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Team Labels Row - flex: 1 to fill available vertical space */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '4px', flex: 1, minHeight: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', background: '#f0f0f0', borderRadius: '4px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #000', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#000', flexShrink: 0 }}>A</div>
          {teamACountry && <CountryFlag countryCode={teamACountry} size="sm" />}
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#000' }}>{teamAName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', padding: '8px', background: '#f0f0f0', borderRadius: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#000', textAlign: 'right' }}>{teamBName}</span>
          {teamBCountry && <CountryFlag countryCode={teamBCountry} size="sm" />}
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #000', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#000', flexShrink: 0 }}>B</div>
        </div>
      </div>

      {/* Column Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '4px', marginBottom: '2px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '9px', textAlign: 'center', color: '#333', fontWeight: 600 }}>
          <span>T</span><span>W</span><span>P</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', fontSize: '9px', textAlign: 'center', color: '#333', fontWeight: 600 }}>
          <span>Set</span><span>Time</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '9px', textAlign: 'center', color: '#333', fontWeight: 600 }}>
          <span>P</span><span>W</span><span>T</span>
        </div>
      </div>

      {/* Set Rows */}
      <div>
        {[1, 2, 3, 4, 5].map(setNum => {
          const setData = setResults?.find(r => r.setNumber === setNum)
          const isFinished = setData && setData.teamAPoints !== null
          if (!isFinished) return null
          return (
            <div key={setNum} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '4px', borderBottom: '1px solid #ccc', padding: '2px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '11px', textAlign: 'center', fontWeight: 500, color: '#000' }}>
                <span>{setData.teamATimeouts ?? ''}</span>
                <span>{setData.teamAWon ?? ''}</span>
                <span style={{ fontWeight: 700 }}>{setData.teamAPoints ?? ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', fontSize: '11px', textAlign: 'center', color: '#000' }}>
                <span style={{ fontWeight: 600 }}>{setNum}</span>
                <span>{setData?.duration || ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '11px', textAlign: 'center', fontWeight: 500, color: '#000' }}>
                <span style={{ fontWeight: 700 }}>{setData.teamBPoints ?? ''}</span>
                <span>{setData.teamBWon ?? ''}</span>
                <span>{setData.teamBTimeouts ?? ''}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals Row */}
      {(() => {
        // Sum of set durations (parse "21'" format)
        const totalSetMinutes = setResults?.reduce((sum, r) => {
          if (!r.duration) return sum
          const match = r.duration.match(/^(\d+)'?$/)
          return sum + (match ? parseInt(match[1], 10) : 0)
        }, 0) || 0
        const totalSetDuration = totalSetMinutes > 0 ? `${totalSetMinutes}'` : ''

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: '4px', padding: '4px 0', background: '#e8e8e8', marginTop: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '11px', textAlign: 'center', fontWeight: 600, color: '#000' }}>
              <span>{setResults?.reduce((sum, r) => sum + (r.teamATimeouts ?? 0), 0) || 0}</span>
              <span>{setResults?.reduce((sum, r) => sum + (r.teamAWon ?? 0), 0) || 0}</span>
              <span style={{ fontWeight: 700 }}>{setResults?.reduce((sum, r) => sum + (r.teamAPoints ?? 0), 0) || 0}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', fontSize: '11px', textAlign: 'center', fontWeight: 600, color: '#000' }}>
              <span>Tot</span>
              <span>{totalSetDuration}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: '11px', textAlign: 'center', fontWeight: 600, color: '#000' }}>
              <span style={{ fontWeight: 700 }}>{setResults?.reduce((sum, r) => sum + (r.teamBPoints ?? 0), 0) || 0}</span>
              <span>{setResults?.reduce((sum, r) => sum + (r.teamBWon ?? 0), 0) || 0}</span>
              <span>{setResults?.reduce((sum, r) => sum + (r.teamBTimeouts ?? 0), 0) || 0}</span>
            </div>
          </div>
        )
      })()}

      {/* Winner Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', padding: '6px 8px', background: '#e8e8e8', borderRadius: '0 0 4px 4px', borderTop: '1px solid #ccc' }}>
        <div>
          <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>Winner</span>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#000' }}>{winnerName || '-'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>Result</span>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#000' }}>{Math.max(teamAWins, teamBWins)}:{Math.min(teamAWins, teamBWins)}</div>
        </div>
      </div>

      {/* Match Time Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#000', marginTop: '8px', padding: '6px', background: '#f0f0f0', borderRadius: '4px' }}>
        <span>Start: <strong>{matchStart}</strong></span>
        <span>End: <strong>{matchEnd}</strong></span>
        <span>Duration: <strong>{formatDurationHHMM(matchDuration)}</strong></span>
      </div>
    </div>
  )
}

// Standard Sanctions component for MatchEnd page
const SanctionsTable = ({ items = [], improperRequests = { teamA: false, teamB: false } }) => {
  return (
    <div style={{ padding: '12px', fontSize: '12px', background: '#fff', color: '#000', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Improper Request Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#f0f0f0', borderRadius: '4px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#000' }}>Improper Request</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #000', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, position: 'relative', color: '#000' }}>
            A
            {improperRequests.teamA && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: 'block' }}>
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #000', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, position: 'relative', color: '#000' }}>
            B
            {improperRequests.teamB && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: 'block' }}>
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', fontSize: '10px', fontWeight: 600, textAlign: 'center', color: '#333', padding: '4px 0', borderBottom: '2px solid #000' }}>
        <span>W</span><span>P</span><span>E</span><span>D</span><span>Team</span><span>Set</span><span>Score</span>
      </div>

      {/* Sanction Rows */}
      <div style={{ flex: 1 }}>
        {items.length > 0 ? (
          items.map((item, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', fontSize: '11px', textAlign: 'center', padding: '4px 0', borderBottom: '1px solid #ccc', color: '#000' }}>
              <span style={{ fontWeight: 600 }}>{item.type === 'warning' ? item.playerNr : ''}</span>
              <span style={{ fontWeight: 600 }}>{item.type === 'penalty' ? item.playerNr : ''}</span>
              <span style={{ fontWeight: 600 }}>{item.type === 'expulsion' ? item.playerNr : ''}</span>
              <span style={{ fontWeight: 600 }}>{item.type === 'disqualification' ? item.playerNr : ''}</span>
              <span style={{ fontWeight: 600 }}>{item.team}</span>
              <span>{item.set}</span>
              <span>{item.score}</span>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', color: '#666', padding: '16px', fontSize: '11px' }}>No sanctions</div>
        )}
      </div>
    </div>
  )
}

// Standard Remarks component for MatchEnd page
const RemarksBox = ({ overflowSanctions = [], remarks = '' }) => {
  const formatSanction = (sanction) => {
    const isDelay = sanction.playerNr === 'D'
    const typeLabel = sanction.type === 'warning'
      ? (isDelay ? 'Delay Warning' : 'Warning')
      : sanction.type === 'penalty'
        ? (isDelay ? 'Delay Penalty' : 'Penalty')
        : sanction.type === 'expulsion'
          ? 'Expulsion'
          : sanction.type === 'disqualification'
            ? 'Disqualification'
            : ''
    const playerInfo = !isDelay && sanction.playerNr ? `, #${sanction.playerNr}` : ''
    return `Team ${sanction.team}, Set ${sanction.set}, ${sanction.score}, ${typeLabel}${playerInfo}`
  }

  const hasContent = remarks?.trim() || overflowSanctions.length > 0

  return (
    <div style={{ padding: '12px', fontSize: '12px', minHeight: '60px', background: '#fff', color: '#000' }}>
      {hasContent ? (
        <>
          {remarks?.trim() && <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap', color: '#000' }}>{remarks.trim()}</div>}
          {overflowSanctions.length > 0 && (
            <>
              <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '11px', color: '#000' }}>Sanctions (overflow):</div>
              {overflowSanctions.map((sanction, idx) => (
                <div key={idx} style={{ fontSize: '11px', color: '#000', marginBottom: '2px' }}>{formatSanction(sanction)}</div>
              ))}
            </>
          )}
        </>
      ) : (
        <div style={{ color: '#666', fontSize: '11px' }}>No remarks</div>
      )}
    </div>
  )
}

// Page wrapper - matches MatchSetup styling, expand width unless compact
const setupViewStyle = {
  maxWidth: '1400px',
  width: '100%',
  alignSelf: 'flex-start',
  marginTop: '10px'
}

function MatchEndPageView({ children }) {
  return <div className="setup" style={setupViewStyle}>{children}</div>
}

export default function MatchEnd({ matchId, onGoHome, onReopenLastSet, onManualAdjustments }) {
  const { vmin } = useScaledLayout()
  const cLogger = useComponentLogging('MatchEnd')
  const data = useLiveQuery(async () => {
    const match = await db.matches.get(matchId)
    if (!match) return null

    const [team1, team2] = await Promise.all([
      match?.team1Id ? db.teams.get(match.team1Id) : null,
      match?.team2Id ? db.teams.get(match.team2Id) : null
    ])

    const [team1Players, team2Players] = await Promise.all([
      match?.team1Id
        ? db.players.where('teamId').equals(match.team1Id).sortBy('number')
        : [],
      match?.team2Id
        ? db.players.where('teamId').equals(match.team2Id).sortBy('number')
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
      team1,
      team2,
      team1Players,
      team2Players,
      sets,
      events
    }
  }, [matchId])

  const { showAlert } = useAlert()
  const [openSignature, setOpenSignature] = useState(null)
  const [isApproved, setIsApproved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // showCloseConfirm modal removed - now using direct post-approval buttons
  const [showReopenConfirm, setShowReopenConfirm] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null) // { json: boolean, pdf: boolean }
  const [zoomedSection, setZoomedSection] = useState(null) // 'results' | 'sanctions' | null
  const [showRemarksModal, setShowRemarksModal] = useState(false)
  const [remarksText, setRemarksText] = useState('')
  const remarksTextareaRef = useRef(null)

  // Prevent accidental navigation team2 before approval
  // Skip warning during save process (isSaving) to avoid dialog during PDF generation
  useEffect(() => {
    if (isApproved || isSaving) return // Allow navigation after approval or during save

    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = 'Match data has not been approved. Are you sure you want to leave?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isApproved, isSaving])

  // Calculate set results for Results component - must be before early return to maintain hook order
  const calculateSetResults = useMemo(() => {
    if (!data) return []

    const { match, sets, events } = data
    const teamAKey = match?.coinTossTeamA || 'team1'
    const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'

    const results = []
    for (let setNum = 1; setNum <= 5; setNum++) {
      const setInfo = sets?.find(s => s.index === setNum)
      const setEvents = events?.filter(e => e.setIndex === setNum) || []

      const isSetFinished = setInfo?.finished === true

      const teamAPoints = isSetFinished
        ? (teamAKey === 'team1' ? (setInfo?.team1Points || 0) : (setInfo?.team2Points || 0))
        : null
      const teamBPoints = isSetFinished
        ? (teamBKey === 'team1' ? (setInfo?.team1Points || 0) : (setInfo?.team2Points || 0))
        : null

      const teamATimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === teamAKey).length
        : null
      const teamBTimeouts = isSetFinished
        ? setEvents.filter(e => e.type === 'timeout' && e.payload?.team === teamBKey).length
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

  // Process sanctions - must be before early return
  const { sanctions: processedSanctions, improperRequests } = useMemo(() => {
    if (!data) return { sanctions: [], improperRequests: { teamA: false, teamB: false } }

    const { match, events } = data
    const teamAKey = match?.coinTossTeamA || 'team1'
    const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'

    const sanctionRecords = []
    const improperReqs = { teamA: false, teamB: false }

    if (!events) return { sanctions: sanctionRecords, improperRequests: improperReqs }

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

      let team1Score = 0
      let team2Score = 0

      for (const e of pointEvents) {
        if (e.payload?.team === 'team1') team1Score++
        else if (e.payload?.team === 'team2') team2Score++
      }

      const teamAScore = teamAKey === 'team1' ? team1Score : team2Score
      const teamBScore = teamBKey === 'team1' ? team1Score : team2Score

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
        if (teamLabel === 'A') improperReqs.teamA = true
        else improperReqs.teamB = true
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

    return { sanctions: sanctionRecords, improperRequests: improperReqs }
  }, [data])

  if (!data) return null

  const { match, team1, team2, team1Players, team2Players, sets, events } = data

  // Calculate set scores
  const finishedSets = sets.filter(s => s.finished)
  const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
  const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

  // Find captains
  const team1Captain = team1Players.find(p => p.isCaptain || p.captain)
  const team2Captain = team2Players.find(p => p.isCaptain || p.captain)

  // Determine team labels (A or B)
  const teamAKey = match.coinTossTeamA || 'team1'
  const team1Label = teamAKey === 'team1' ? 'A' : 'B'

  // Winner info
  const winnerTeamKey = team1SetsWon > team2SetsWon ? 'team1' : 'team2'
  const winner = winnerTeamKey === 'team1' ? (team1?.name || 'Team 1') : (team2?.name || 'Team 2')
  const winnerColor = winnerTeamKey === 'team1' ? (match?.team1Color || '#22c55e') : (match?.team2Color || '#22c55e')
  const winnerCountry = winnerTeamKey === 'team1' ? match?.team1Country : match?.team2Country
  const winnerSetsWon = winnerTeamKey === 'team1' ? team1SetsWon : team2SetsWon
  const loserSetsWon = winnerTeamKey === 'team1' ? team2SetsWon : team1SetsWon

  // Team A/B info for set scores table
  const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
  const team2Label = team1Label === 'A' ? 'B' : 'A'
  const teamAColor = teamAKey === 'team1' ? (match?.team1Color || '#888') : (match?.team2Color || '#888')
  const teamBColor = teamBKey === 'team1' ? (match?.team1Color || '#888') : (match?.team2Color || '#888')
  const teamACountryCode = teamAKey === 'team1' ? match?.team1Country : match?.team2Country
  const teamBCountryCode = teamBKey === 'team1' ? match?.team1Country : match?.team2Country

  // Match time info - duration is matchEnd - matchStart
  const matchStartDate = match?.scheduledAt ? new Date(match.scheduledAt) : null
  const matchEndDate = finishedSets.length > 0 && finishedSets[finishedSets.length - 1].endTime
    ? new Date(finishedSets[finishedSets.length - 1].endTime)
    : null

  // Display times in local timezone
  const matchStart = match?.scheduledAt ? formatTimeLocal(match.scheduledAt) : ''
  const matchEndTime = finishedSets.length > 0 && finishedSets[finishedSets.length - 1].endTime
    ? formatTimeLocal(finishedSets[finishedSets.length - 1].endTime)
    : ''

  // Calculate duration as matchEnd - matchStart
  const matchDuration = (() => {
    if (matchStartDate && matchEndDate) {
      const durationMs = matchEndDate.getTime() - matchStartDate.getTime()
      const totalMinutes = Math.floor(durationMs / 60000)
      return totalMinutes > 0 ? `${totalMinutes}'` : ''
    }
    return ''
  })()

  // Split sanctions
  const sanctionsInBox = processedSanctions.slice(0, 10)
  const overflowSanctions = processedSanctions.slice(10)

  // Check if optional fields exist
  // Check if officials array has these roles
  const hasAsstScorer = match.asstScorerSignature !== undefined ||
    (Array.isArray(match.officials) && match.officials.some(o =>
      o.role?.toLowerCase() === 'assistant scorer' || o.role?.toLowerCase() === 'assistant_scorer'
    ))
  const hasRef2 = match.ref2Signature !== undefined ||
    (Array.isArray(match.officials) && match.officials.some(o =>
      o.role?.toLowerCase() === '2nd referee' || o.role?.toLowerCase() === '2nd_referee'
    ))

  // Signature status checks - use POST-GAME captain signatures (not pre-match)
  const captainASigned = team1Label === 'A' ? !!match.team1PostGameCaptainSignature : !!match.team2PostGameCaptainSignature
  const captainBSigned = team1Label === 'B' ? !!match.team1PostGameCaptainSignature : !!match.team2PostGameCaptainSignature
  const captainsDone = captainASigned && captainBSigned

  const asstScorerSigned = !hasAsstScorer || !!match.asstScorerSignature
  const scorerSigned = !!match.scorerSignature
  const ref2Signed = !hasRef2 || !!match.ref2Signature
  const ref1Signed = !!match.ref1Signature

  // Determine current signature step
  const getCurrentStep = () => {
    if (!captainsDone) return 'captains'
    if (hasAsstScorer && !asstScorerSigned) return 'asst-scorer'
    if (!scorerSigned) return 'scorer'
    if (hasRef2 && !ref2Signed) return 'ref2'
    if (!ref1Signed) return 'ref1'
    return 'complete'
  }
  const currentStep = getCurrentStep()
  const allSignaturesDone = currentStep === 'complete'

  const handleSaveSignature = async (role, signatureData) => {
    cLogger.logHandler('handleSaveSignature', { role })
    const fieldMap = {
      'captain-a': team1Label === 'A' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
      'captain-b': team1Label === 'B' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
      'asst-scorer': 'asstScorerSignature',
      'scorer': 'scorerSignature',
      'ref2': 'ref2Signature',
      'ref1': 'ref1Signature'
    }
    const field = fieldMap[role]
    if (field) {
      await db.matches.update(matchId, { [field]: signatureData })
    }
    setOpenSignature(null)
  }

  const getSignatureData = (role) => {
    if (role === 'captain-a') return team1Label === 'A' ? match.team1PostGameCaptainSignature : match.team2PostGameCaptainSignature
    if (role === 'captain-b') return team1Label === 'B' ? match.team1PostGameCaptainSignature : match.team2PostGameCaptainSignature
    if (role === 'asst-scorer') return match.asstScorerSignature
    if (role === 'scorer') return match.scorerSignature
    if (role === 'ref2') return match.ref2Signature
    if (role === 'ref1') return match.ref1Signature
    return null
  }

  const getSignatureLabel = (role) => {
    if (role === 'captain-a') {
      const team = team1Label === 'A' ? team1 : team2
      const captain = team1Label === 'A' ? team1Captain : team2Captain
      return `Captain A - ${captain?.name || team?.shortName || team?.name || 'Team A'}${captain ? ` (#${captain.number})` : ''}`
    }
    if (role === 'captain-b') {
      const team = team1Label === 'B' ? team1 : team2
      const captain = team1Label === 'B' ? team1Captain : team2Captain
      return `Captain B - ${captain?.name || team?.shortName || team?.name || 'Team B'}${captain ? ` (#${captain.number})` : ''}`
    }
    if (role === 'asst-scorer') return 'Assistant Scorer'
    if (role === 'scorer') return 'Scorer'
    if (role === 'ref2') return '2nd Referee'
    if (role === 'ref1') return '1st Referee'
    return ''
  }

  const SignatureBox = ({ role, disabled = false }) => {
    const signatureData = getSignatureData(role)
    const isSigned = !!signatureData

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1,
        minWidth: '140px',
        opacity: disabled ? 0.5 : 1
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600 }}>
          {getSignatureLabel(role)}
        </div>
        <div
          onClick={() => !disabled && !isSigned && setOpenSignature(role)}
          style={{
            border: isSigned ? '2px solid #22c55e' : '2px solid #333',
            borderRadius: '8px',
            background: isSigned ? 'rgba(34, 197, 94, 0.1)' : 'white',
            height: '60px',
            minHeight: '60px',
            maxHeight: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: (disabled || isSigned) ? 'default' : 'pointer',
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
                maxHeight: '56px',
                objectFit: 'contain'
              }}
            />
          ) : (
            <div style={{ color: '#333', fontSize: '14px' }}>
              {disabled ? 'Waiting...' : 'Tap to sign'}
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleShowScoresheet = (action = 'preview') => {
    cLogger.logHandler('handleShowScoresheet', { action })
    // Prepare scoresheet data - add country from match to team objects
    const team1WithCountry = team1 ? { ...team1, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
    const team2WithCountry = team2 ? { ...team2, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

    // Keep team keys as team1/team2 (scoresheet uses team1/team2 format)
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
        team_1Country: match?.team1Country || '',
        team_2Country: match?.team2Country || '',
        // Normalize coinTossTeamA/B for scoresheet
        coinTossTeamA: normalizeTeamKey(match?.coinTossTeamA),
        coinTossTeamB: normalizeTeamKey(match?.coinTossTeamB),
        // Build coinTossData for scoresheet compatibility
        coinTossData: {
          coinTossWinner: normalizeTeamKey(match?.coinTossWinner),
          teamA: normalizeTeamKey(match?.coinTossTeamA),
          teamB: normalizeTeamKey(match?.coinTossTeamB)
        }
      },
      team_1Team: team1WithCountry,
      team_2Team: team2WithCountry,
      team_1Players: team1Players,
      team_2Players: team2Players,
      sets,
      events
    }
    sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))
    const url = action === 'preview' ? '/scoresheet_beach.html' : `/scoresheet_beach.html?action=${action}`
    window.open(url, 'scoresheet_beach', 'width=1600,height=1200')
  }

  // Handle downloading comprehensive interaction logs
  const handleDownloadLogs = async () => {
    cLogger.logHandler('handleDownloadLogs', { matchId })
    try {
      const gameN = match?.gameNumber || match?.game_n || null
      const { downloadLogs } = await import('../utils_beach/comprehensiveLogger_beach')
      await downloadLogs(gameN, 'ndjson')
      showAlert('Interaction logs downloaded successfully', 'success')
    } catch (err) {
      console.error('[MatchEnd] Failed to download logs:', err)
      showAlert('Failed to download logs', 'error')
    }
  }

  const handleApprove = async () => {
    cLogger.logHandler('handleApprove', { matchId, allSignaturesDone })
    setIsSaving(true)
    try {
      // Only check signatures for official matches
      if (!match.test && !allSignaturesDone) {
        showAlert('Please complete all signatures before approving.', 'warning')
        setIsSaving(false)
        return
      }

      // Show download progress
      setDownloadProgress({ json: false, pdf: false })

      // Prepare export data
      const allSets = await db.sets.where('matchId').equals(matchId).sortBy('index')
      const allEvents = await db.events.where('matchId').equals(matchId).sortBy('seq')

      const exportData = {
        match: { ...match, team1, team2 },
        team1Players,
        team2Players,
        sets: allSets,
        events: allEvents,
        exportedAt: new Date().toISOString()
      }

      const dataStr = JSON.stringify(exportData, null, 2)
      const matchDate = match.scheduledAt
        ? new Date(match.scheduledAt).toLocaleDateString('en-GB', { timeZone: 'UTC' }).replace(/\//g, '-')
        : new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
      const jsonFilename = `MatchData_${sanitizeForFilename(team1?.name || 'Team 1')}_vs_${sanitizeForFilename(team2?.name || 'Team 2')}_${matchDate}.json`

      // Mark JSON as ready
      setDownloadProgress(prev => ({ ...prev, json: true }))

      // Generate PDF via scoresheet window with postMessage
      const team1WithCountry = team1 ? { ...team1, country: match?.team1Country || '' } : { name: '', country: match?.team1Country || '' }
      const team2WithCountry = team2 ? { ...team2, country: match?.team2Country || '' } : { name: '', country: match?.team2Country || '' }

      // Keep team keys as team1/team2 (scoresheet uses team1/team2 format)
      const normalizeTeamKey = (key) => {
        if (!key) return key;
        if (key === 'team_1') return 'team1';
        if (key === 'team_2') return 'team2';
        return key;
      }
      const scoresheetData = {
        match: {
          ...match,
          team_1Country: match?.team1Country || '',
          team_2Country: match?.team2Country || '',
          // Normalize coinTossTeamA/B for scoresheet
          coinTossTeamA: normalizeTeamKey(match?.coinTossTeamA),
          coinTossTeamB: normalizeTeamKey(match?.coinTossTeamB),
          // Build coinTossData for scoresheet compatibility
          coinTossData: {
            coinTossWinner: normalizeTeamKey(match?.coinTossWinner),
            teamA: normalizeTeamKey(match?.coinTossTeamA),
            teamB: normalizeTeamKey(match?.coinTossTeamB)
          }
        },
        team_1Team: team1WithCountry,
        team_2Team: team2WithCountry,
        team_1Players: team1Players,
        team_2Players: team2Players,
        sets,
        events
      }
      sessionStorage.setItem('scoresheetData', JSON.stringify(scoresheetData))

      // Create a promise that resolves when we receive the PDF blob
      const pdfPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler)
          reject(new Error('PDF generation timed out'))
        }, 30000) // 30 second timeout

        const handler = (event) => {
          if (event.data?.type === 'pdfBlob') {
            clearTimeout(timeout)
            window.removeEventListener('message', handler)
            const blob = new Blob([event.data.arrayBuffer], { type: 'application/pdf' })
            resolve({ blob, filename: event.data.filename })
          }
        }
        window.addEventListener('message', handler)
      })

      // Open scoresheet window with getBlob action
      window.open('/scoresheet_beach.html?action=getBlob', '_blank', 'width=1600,height=1200')

      // Wait for PDF blob
      const pdfResult = await pdfPromise
      setDownloadProgress(prev => ({ ...prev, pdf: true }))

      // Create ZIP with both files
      const zip = new JSZip()
      zip.file(jsonFilename, dataStr)
      zip.file(pdfResult.filename, pdfResult.blob)

      // Add comprehensive interaction logs to the ZIP
      try {
        const gameN = match.gameNumber || match.game_n || null
        const logsContent = await exportLogsAsNDJSON(gameN)
        if (logsContent && logsContent.length > 0) {
          const logsFilename = `interaction_logs_${matchDate}.ndjson`
          zip.file(logsFilename, logsContent)
        }
      } catch (logsError) {
        console.warn('[MatchEnd] Failed to add interaction logs to ZIP:', logsError)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipFilename = `Match_${sanitizeForFilename(team1?.name || 'Team 1')}_vs_${sanitizeForFilename(team2?.name || 'Team 2')}_${matchDate}.zip`

      // Upload PDF and final JSON to Supabase storage "scoresheets" bucket
      if (supabase && !match?.test) {
        try {
          const scheduledDate = match.scheduledAt
            ? new Date(match.scheduledAt).toISOString().slice(0, 10) // YYYY-MM-DD
            : new Date().toISOString().slice(0, 10)
          const gameNumber = match.gameNumber || match.externalId || match.game_n || 'unknown'

          // Upload PDF
          const pdfStoragePath = `${scheduledDate}/game${gameNumber}.pdf`
          const { error: uploadError } = await supabase.storage
            .from('scoresheets')
            .upload(pdfStoragePath, pdfResult.blob, {
              contentType: 'application/pdf',
              upsert: true
            })
          if (uploadError) {
            console.warn('Failed to upload PDF to cloud:', uploadError)
          } else {
          }

          // Upload final JSON (with _final suffix for approved matches)
          const jsonResult = await uploadScoresheet({
            match,
            team1,
            team2,
            team1Players,
            team2Players,
            sets: allSets,
            events: allEvents,
            final: true
          })
          if (jsonResult.success) {
          } else {
            console.warn('Failed to upload final JSON:', jsonResult.error)
          }
        } catch (uploadErr) {
          console.warn('Error uploading scoresheet:', uploadErr)
        }
      }

      // Download ZIP
      const zipLink = document.createElement('a')
      zipLink.download = zipFilename
      zipLink.href = URL.createObjectURL(zipBlob)
      zipLink.click()

      // Save to sync queue if official match with seed_key
      if (!match.test && match?.seed_key) {
        // Collect all signatures for the approval JSONB field
        const approvalData = {
          approvedAt: new Date().toISOString(),
          signatures: {
            captainA: team1Label === 'A' ? match.team1PostGameCaptainSignature : match.team2PostGameCaptainSignature,
            captainB: team1Label === 'B' ? match.team1PostGameCaptainSignature : match.team2PostGameCaptainSignature,
            scorer: match.scorerSignature || null,
            asstScorer: match.asstScorerSignature || null,
            ref1: match.ref1Signature || null,
            ref2: match.ref2Signature || null
          }
        }

        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: match.seed_key,
            status: 'approved',
            current_set: null,
            approval: approvalData
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      // Mark as approved in local database (status stays 'ended' until Close Match)
      await db.matches.update(matchId, {
        approved: true,
        approvedAt: new Date().toISOString(),
        current_set: null
      })

      // Update UI state to show post-approval buttons
      setDownloadProgress(null)
      setIsSaving(false)
      setIsApproved(true)
    } catch (error) {
      console.error('Error approving match:', error)
      showAlert(`Error approving match: ${error.message}`, 'error')
      setDownloadProgress(null)
      setIsSaving(false)
    }
  }

  // Handle closing match after approval - deletes local data and navigates home
  const handleCloseMatch = async () => {
    cLogger.logHandler('handleCloseMatch', { matchId })

    try {
      // Update match to final status in Supabase first (before deleting local data)
      if (!match.test && match?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: match.seed_key,
            status: 'final'
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      // Delete all local data for this match from IndexedDB
      await db.transaction('rw', db.events, db.sets, db.players, db.teams, db.matches, async () => {
        // Delete events for this match
        await db.events.where('matchId').equals(matchId).delete()

        // Delete sets for this match
        await db.sets.where('matchId').equals(matchId).delete()

        // Get team IDs before deleting match
        const matchData = await db.matches.get(matchId)
        if (matchData) {
          // Delete players for both teams
          if (matchData.team1Id) {
            await db.players.where('teamId').equals(matchData.team1Id).delete()
            await db.teams.delete(matchData.team1Id)
          }
          if (matchData.team2Id) {
            await db.players.where('teamId').equals(matchData.team2Id).delete()
            await db.teams.delete(matchData.team2Id)
          }
        }

        // Delete the match itself
        await db.matches.delete(matchId)
      })

      // Navigate home
      if (onGoHome) onGoHome()
    } catch (error) {
      console.error('[MatchEnd] Error closing match:', error)
      showAlert('Error closing match: ' + error.message, 'error')
    }
  }

  // Handle reopening match after approval - allows re-approval or adjustments
  const handleReopenMatch = async () => {
    cLogger.logHandler('handleReopenMatch', { matchId })

    try {
      // Clear approval state in database
      await db.matches.update(matchId, {
        approved: false,
        approvedAt: null,
        status: 'ended' // Match is finished but not final
      })

      // Update local state
      setIsApproved(false)
    } catch (error) {
      console.error('[MatchEnd] Error reopening match:', error)
      showAlert('Error reopening match: ' + error.message, 'error')
    }
  }

  // Handle reopening the last set for corrections
  const handleReopenLastSet = async () => {
    cLogger.logHandler('handleReopenLastSet', { matchId })
    setShowReopenConfirm(false)

    try {
      // Find the last (highest index) set
      const allSets = await db.sets.where('matchId').equals(matchId).toArray()
      if (allSets.length === 0) {
        showAlert('No sets found to reopen', 'error')
        return
      }
      const lastSet = allSets.reduce((a, b) => (a.index > b.index ? a : b))


      // Mark the last set as not finished
      await db.sets.update(lastSet.id, { finished: false })

      // Set match status back to 'live' and clear all signature fields
      await db.matches.update(matchId, {
        status: 'live',
        approved: false,
        approvedAt: null,
        // Clear all signature fields - they must be re-collected after changes
        team1PostGameCaptainSignature: null,
        team2PostGameCaptainSignature: null,
        assistantScorerSignature: null,
        scorerSignature: null,
        referee2Signature: null,
        referee1Signature: null
      })

      // Delete the set_end event for this set to keep event log clean
      // Find set_end event for this set
      const setEndEvent = await db.events
        .where({ matchId: matchId })
        .filter(e => e.type === 'set_end' && e.setIndex === lastSet.index)
        .first()

      if (setEndEvent) {
        await db.events.delete(setEndEvent.id)

        // Also queue deletion for Supabase
        if (match?.seed_key) {
          await db.sync_queue.add({
            resource: 'event',
            action: 'delete',
            payload: {
              id: setEndEvent.id // Send ID to delete
            },
            ts: new Date().toISOString(),
            status: 'queued'
          })
        }
      }

      // Queue sync to Supabase for the set update
      if (match?.seed_key) {
        await db.sync_queue.add({
          resource: 'set',
          action: 'update',
          payload: {
            external_id: String(lastSet.id),
            finished: false
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })

        // Queue sync for match status update
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: match.seed_key,
            status: 'live'
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      showAlert(`Set ${lastSet.index} reopened successfully`, 'success')

      // Navigate back to Scoreboard
      if (onReopenLastSet) {
        onReopenLastSet()
      } else if (onGoHome) {
        onGoHome()
      }
    } catch (error) {
      console.error('[MatchEnd] Error reopening last set:', error)
      showAlert(`Error reopening set: ${error.message}`, 'error')
    }
  }

  return (
    <MatchEndPageView>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', width: '100%', flexWrap: 'wrap' }}>
          <img src={ballImage} alt="Volleyball" style={{ width: '4vmin', aspectRatio: '1' }} />
          <h1 style={{ margin: 0 }}>Match Complete</h1>
          <img src={ballImage} alt="Volleyball" style={{ width: '4vmin', aspectRatio: '1' }} />
        </div>

      </div>

      {/* Winner Card */}
      <div className="card" style={{ marginBottom: '16px', padding: '20px' }}>
        <h3 style={{ margin: 0, textAlign: 'center' }}>Winner</h3>
        {/* Team Name with background */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{ background: winnerColor, color: isBrightColor(winnerColor) ? '#000' : '#fff', padding: '12px 24px', borderRadius: '8px', textAlign: 'center', fontSize: '26px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            {winnerCountry && <CountryFlag countryCode={winnerCountry} size="lg" />}
            <span>{winner}</span>
            {winnerCountry && <span style={{ fontSize: '14px', fontWeight: 500, opacity: 0.8 }}>({winnerCountry})</span>}
          </div>
        </div>
        {/* Score and Set Results */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
          {/* Main Score - winner always on left */}
          <div style={{ fontSize: '10vmin', fontWeight: 800, color: 'var(--accent)' }}>
            {winnerSetsWon}<span style={{ color: 'var(--muted)' }}>:</span>{loserSetsWon}
          </div>
          {/* Set Scores Table */}
          <table style={{ borderCollapse: 'collapse', fontSize: '2vmin', textAlign: 'center' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 6px' }} />
                <th style={{ padding: '4px 6px' }} />
                {finishedSets.map((_, idx) => (
                  <th key={idx} style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: '1.8vmin' }}>
                    {['I', 'II', 'III', 'IV', 'V'][idx]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Team A Row */}
              <tr>
                <td style={{ padding: '4px 4px' }}>
                  {teamACountryCode && <CountryFlag countryCode={teamACountryCode} size="sm" />}
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '2.4vmin', height: '2.4vmin', borderRadius: '4px', background: teamAColor, color: isBrightColor(teamAColor) ? '#000' : '#fff', fontWeight: 700, fontSize: '1.6vmin', lineHeight: 1 }}>
                    A
                  </span>
                </td>
                {finishedSets.map((set, idx) => {
                  const aPoints = teamAKey === 'team1' ? set.team1Points : set.team2Points
                  const bPoints = teamAKey === 'team1' ? set.team2Points : set.team1Points
                  const aWon = aPoints > bPoints
                  return (
                    <td key={idx} style={{ padding: '4px 8px', fontWeight: aWon ? 700 : 400, color: aWon ? 'var(--accent)' : 'var(--muted)' }}>
                      {aPoints}
                    </td>
                  )
                })}
              </tr>
              {/* Team B Row */}
              <tr>
                <td style={{ padding: '4px 4px' }}>
                  {teamBCountryCode && <CountryFlag countryCode={teamBCountryCode} size="sm" />}
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '2.4vmin', height: '2.4vmin', borderRadius: '4px', background: teamBColor, color: isBrightColor(teamBColor) ? '#000' : '#fff', fontWeight: 700, fontSize: '1.6vmin', lineHeight: 1 }}>
                    B
                  </span>
                </td>
                {finishedSets.map((set, idx) => {
                  const aPoints = teamAKey === 'team1' ? set.team1Points : set.team2Points
                  const bPoints = teamAKey === 'team1' ? set.team2Points : set.team1Points
                  const bWon = bPoints > aPoints
                  return (
                    <td key={idx} style={{ padding: '4px 8px', fontWeight: bWon ? 700 : 400, color: bWon ? 'var(--accent)' : 'var(--muted)' }}>
                      {bPoints}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Captain Signatures - Right after winner */}
      {!isApproved && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Team Captains</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <SignatureBox role="captain-a" />
            <SignatureBox role="captain-b" />
          </div>
        </div>
      )}

      {/* Results and Sanctions - Side by side, clickable to zoom */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Results Card */}
        <div
          className="card"
          style={{ flex: '1 1 300px', minWidth: '280px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
          onClick={() => setZoomedSection('results')}
        >
          <h3 style={{ margin: '0 0 12px 0' }}>Results</h3>
          <div style={{ background: '#fff', borderRadius: '6px', overflow: 'hidden', border: '2px solid #333', flex: 1 }}>
            <ResultsTable
              teamAName={team1Label === 'A' ? (team1?.name || 'Team A') : (team2?.name || 'Team A')}
              teamBName={team1Label === 'B' ? (team1?.name || 'Team B') : (team2?.name || 'Team B')}
              teamACountry={team1Label === 'A' ? match?.team1Country : match?.team2Country}
              teamBCountry={team1Label === 'B' ? match?.team1Country : match?.team2Country}
              setResults={calculateSetResults}
              matchStart={matchStart}
              matchEnd={matchEndTime}
              matchDuration={matchDuration}
            />
          </div>
        </div>

        {/* Sanctions Card */}
        <div
          className="card"
          style={{ flex: '1 1 300px', minWidth: '280px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
          onClick={() => setZoomedSection('sanctions')}
        >
          <h3 style={{ margin: '0 0 12px 0' }}>Sanctions</h3>
          <div style={{ background: '#fff', borderRadius: '6px', overflow: 'hidden', border: '2px solid #333', flex: 1 }}>
            <SanctionsTable
              items={sanctionsInBox}
              improperRequests={improperRequests}
            />
          </div>
        </div>
      </div>

      {/* Remarks Card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Remarks</h3>
          {!isApproved && (
            <button
              onClick={() => {
                setRemarksText(match?.remarks || '')
                setShowRemarksModal(true)
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                background: '#fff',
                cursor: 'pointer'
              }}
            >
              Edit Remarks
            </button>
          )}
        </div>
        <div style={{ background: '#fff', borderRadius: '6px', overflow: 'hidden', border: '2px solid #333', minHeight: '60px' }}>
          <RemarksBox overflowSanctions={overflowSanctions} remarks={match?.remarks || ''} />
        </div>
      </div>

      {/* Other Signatures - At the bottom */}
      {!isApproved && captainsDone && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, display: 'inline' }}>Official Signatures</h3>
              <span className="text-sm" style={{ marginLeft: '12px' }}>
                {currentStep === 'asst-scorer' && 'Assistant Scorer'}
                {currentStep === 'scorer' && 'Scorer'}
                {currentStep === 'ref2' && '2nd Referee'}
                {currentStep === 'ref1' && '1st Referee'}
                {currentStep === 'complete' && 'All signatures collected'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {/* Assistant Scorer (if present) */}
            {hasAsstScorer && (
              <SignatureBox role="asst-scorer" disabled={false} />
            )}

            {/* Scorer */}
            <SignatureBox role="scorer" disabled={hasAsstScorer && !asstScorerSigned} />

            {/* 2nd Referee (if present) - can sign after scorer has signed */}
            {hasRef2 && (
              <SignatureBox role="ref2" disabled={!scorerSigned} />
            )}

            {/* 1st Referee (final) - can sign after ref2 (if present) or after scorer (if no ref2) */}
            <SignatureBox role="ref1" disabled={(hasRef2 && !ref2Signed) || !scorerSigned} />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {isApproved ? (
          // Post-approval buttons: Close Match and Reopen Match
          <>
            <button
              onClick={handleCloseMatch}
              className="primary"
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '14px',
                fontSize: '15px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              }}
            >
              Close Match
            </button>
            <button
              onClick={handleReopenMatch}
              className="secondary"
              style={{
                padding: '14px 20px',
                fontSize: '15px',
                background: '#ea0808ff',
                color: '#000',
              }}
            >
              Reopen Match
            </button>
          </>
        ) : !showReopenConfirm && (
          // Pre-approval buttons: Confirm and Approve, Reopen Last Set, Manual Adjustments, Scoresheet
          <>
            <button
              onClick={handleApprove}
              disabled={isSaving || (!match.test && !allSignaturesDone)}
              className="primary"
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '14px',
                fontSize: '15px',
                opacity: (isSaving || (!match.test && !allSignaturesDone)) ? 0.5 : 1,
                cursor: (isSaving || (!match.test && !allSignaturesDone)) ? 'not-allowed' : 'pointer'
              }}
            >
              {isSaving ? 'Downloading...' : 'Confirm and Approve'}
            </button>
            <button
              onClick={() => setShowReopenConfirm(true)}
              className="secondary"
              style={{
                padding: '14px 20px',
                fontSize: '15px',
                background: '#ea0808ff',
                color: '#000',
              }}
            >
              Reopen Last Set
            </button>
            <button
              onClick={onManualAdjustments}
              className="secondary"
              style={{
                padding: '14px 20px',
                fontSize: '15px',
              }}
            >
              Manual Adjustments
            </button>
            <MenuList
              buttonLabel="📄 Scoresheet"
              buttonClassName="secondary"
              buttonStyle={{ padding: '14px 20px', fontSize: '15px' }}
              showArrow={true}
              position="right"
              vertical="top"
              items={[
                { key: 'preview', label: '🔍 Preview', onClick: () => handleShowScoresheet('preview') },
                { key: 'save', label: '💾 Save PDF', onClick: () => handleShowScoresheet('save') },
                { key: 'logs', label: '📊 Download Logs', onClick: handleDownloadLogs }
              ]}
            />
          </>
        )}
      </div>

      {/* Download Progress Modal */}
      {downloadProgress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#111827',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Preparing Match Export...</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                <span style={{ fontSize: '20px' }}>{downloadProgress.json ? '✓' : '⏳'}</span>
                <span style={{ color: downloadProgress.json ? '#22c55e' : 'var(--muted)' }}>Match Data (JSON)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                <span style={{ fontSize: '20px' }}>{downloadProgress.pdf ? '✓' : '⏳'}</span>
                <span style={{ color: downloadProgress.pdf ? '#22c55e' : 'var(--muted)' }}>Generating Scoresheet (PDF)</span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
              {downloadProgress.json && downloadProgress.pdf
                ? 'Creating ZIP and uploading to cloud...'
                : 'Please wait while files are being prepared...'}
            </p>
          </div>
        </div>
      )}

      {/* Reopen Last Set Confirmation Modal */}
      {showReopenConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Reopen Last Set?</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)' }}>
              This will reopen the last set for corrections and allow you to continue scoring.
            </p>
            <p style={{ margin: '0 0 24px 0', color: 'var(--warning)', fontSize: '14px' }}>
              Warning: All collected signatures will be cleared and must be collected again after approval.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleReopenLastSet}
                className="primary"
                style={{ flex: 1, padding: '12px', fontSize: '15px' }}
              >
                Yes, Reopen Set
              </button>
              <button
                onClick={() => setShowReopenConfirm(false)}
                className="secondary"
                style={{ flex: 1, padding: '12px', fontSize: '15px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal for Results/Sanctions */}
      {zoomedSection && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setZoomedSection(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflow: 'auto',
              transform: 'scale(1.2)',
              transformOrigin: 'center center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {zoomedSection === 'results' && (
              <ResultsTable
                teamAName={team1Label === 'A' ? (team1?.name || 'Team A') : (team2?.name || 'Team A')}
                teamBName={team1Label === 'B' ? (team1?.name || 'Team B') : (team2?.name || 'Team B')}
                teamACountry={team1Label === 'A' ? match?.team1Country : match?.team2Country}
                teamBCountry={team1Label === 'B' ? match?.team1Country : match?.team2Country}
                setResults={calculateSetResults}
                matchStart={matchStart}
                matchEnd={matchEndTime}
                matchDuration={matchDuration}
              />
            )}
            {zoomedSection === 'sanctions' && (
              <SanctionsTable
                items={sanctionsInBox}
                improperRequests={improperRequests}
              />
            )}
          </div>
          <button
            onClick={() => setZoomedSection(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              fontSize: '24px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Signature Modal - Added open prop */}
      <SignaturePad
        open={!!openSignature}
        title={openSignature ? getSignatureLabel(openSignature) : ''}
        existingSignature={openSignature ? getSignatureData(openSignature) : null}
        onSave={(signatureData) => handleSaveSignature(openSignature, signatureData)}
        onClose={() => setOpenSignature(null)}
      />

      {/* Remarks Modal */}
      {showRemarksModal && (
        <Modal
          title="Edit Remarks"
          open={true}
          onClose={() => {
            setShowRemarksModal(false)
            setRemarksText('')
          }}
          width={600}
        >
          <div style={{ padding: '20px' }}>
            <textarea
              ref={remarksTextareaRef}
              placeholder="Record match remarks..."
              value={remarksText}
              onChange={e => setRemarksText(e.target.value)}
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRemarksModal(false)
                  setRemarksText('')
                }}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await db.matches.update(matchId, { remarks: remarksText.trim() })
                  setShowRemarksModal(false)
                  setRemarksText('')
                }}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#007bff',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </MatchEndPageView>
  )
}
