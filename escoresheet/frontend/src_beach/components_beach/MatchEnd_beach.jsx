import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import SignaturePad from './SignaturePad_beach'
import MenuList from './MenuList_beach'
import Modal from './Modal_beach'
// Beach volleyball ball image
const ballImage = '/beachball.png'
import JSZip from 'jszip'
import { setExtId } from '../utils_beach/syncIds_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'
import { uploadScoresheet, uploadScoresheetPdf } from '../utils_beach/scoresheetUploader_beach'
import { useComponentLogging } from '../contexts_beach/LoggingContext_beach'
import { exportLogsAsNDJSON } from '../utils_beach/comprehensiveLogger_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'

import { sanitizeForFilename } from '../utils_beach/stringUtils_beach'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
import { waitForScoresheetPdf, PDF_FAIL } from '../utils_beach/scoresheetPdfRequest_beach'
import { formatTimeLocal } from '../utils_beach/timeUtils_beach'
import { saveMatchSignature, signatureEditLocked, signaturesPayload, clearedPostMatchSignatures } from '../utils_beach/signatures_beach'
import CountryFlag from './CountryFlag_beach'
import { ChartColumn, FileText, Save, Search } from './Icons_beach'
import { Check, Eraser, Loader2, Maximize2, PenLine, X } from 'lucide-react'
import { Button } from '../ui/volleyui/Button.jsx'
import { RowTool } from '../ui/volleyui/Row.jsx'
import { IconButton } from '../ui/volleyui/IconButton.jsx'
import { Textarea } from '../ui/volleyui/Textarea.jsx'
import { confirmDialog } from '../ui/volleyui/uiStore.js'
import { modalCancelClass, modalSaveClass } from '../ui/volleyui/Modal.jsx'
import { cn } from '../ui/volleyui/cn.js'

// volleyui recipes of the match end page (the official result, sanction and
// remarks boxes inside keep the scoresheet's own black-on-white look, §7)
const CARD = 'mb-4 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card sm:p-5'
const CARD_TITLE = 'm-0 text-sm font-semibold text-stone-700'
const SHEET_BOX = 'flex-1 overflow-hidden rounded-lg border-2 border-stone-800 bg-white'

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
  const { t } = useTranslation()
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
          <span>{t('matchEnd.set')}</span><span>{t('matchEnd.time')}</span>
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
              <span>{t('matchEnd.tot')}</span>
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
          <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>{t('matchEnd.winner')}</span>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#000' }}>{winnerName || '-'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>{t('matchEnd.result')}</span>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#000' }}>{Math.max(teamAWins, teamBWins)}:{Math.min(teamAWins, teamBWins)}</div>
        </div>
      </div>

      {/* Match Time Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#000', marginTop: '8px', padding: '6px', background: '#f0f0f0', borderRadius: '4px' }}>
        <span>{t('matchEnd.start')}: <strong>{matchStart}</strong></span>
        <span>{t('matchEnd.end')}: <strong>{matchEnd}</strong></span>
        <span>{t('matchEnd.duration')}: <strong>{formatDurationHHMM(matchDuration)}</strong></span>
      </div>
    </div>
  )
}

// Standard Sanctions component for MatchEnd page
const SanctionsTable = ({ items = [], improperRequests = { teamA: false, teamB: false } }) => {
  const { t } = useTranslation()
  return (
    <div style={{ padding: '12px', fontSize: '12px', background: '#fff', color: '#000', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Improper Request Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: '#f0f0f0', borderRadius: '4px', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#000' }}>{t('matchEnd.improperRequest')}</span>
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
          <div style={{ textAlign: 'center', color: '#666', padding: '16px', fontSize: '11px' }}>{t('matchEnd.noSanctions')}</div>
        )}
      </div>
    </div>
  )
}

// Standard Remarks component for MatchEnd page
const RemarksBox = ({ overflowSanctions = [], remarks = '' }) => {
  const { t } = useTranslation()
  const formatSanction = (sanction) => {
    const isDelay = sanction.playerNr === 'D'
    const typeKey = sanction.type === 'warning'
      ? (isDelay ? 'delayWarning' : 'warning')
      : sanction.type === 'penalty'
        ? (isDelay ? 'delayPenalty' : 'penalty')
        : sanction.type === 'expulsion' || sanction.type === 'disqualification'
          ? sanction.type
          : null
    const typeLabel = typeKey ? t(`matchEnd.sanctionTypes.${typeKey}`) : ''
    const playerInfo = !isDelay && sanction.playerNr ? `, #${sanction.playerNr}` : ''
    return `${t('matchEnd.teamSetLine', { team: sanction.team, set: sanction.set })}, ${sanction.score}, ${typeLabel}${playerInfo}`
  }

  const hasContent = remarks?.trim() || overflowSanctions.length > 0

  return (
    <div style={{ padding: '12px', fontSize: '12px', minHeight: '60px', background: '#fff', color: '#000' }}>
      {hasContent ? (
        <>
          {remarks?.trim() && <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap', color: '#000' }}>{remarks.trim()}</div>}
          {overflowSanctions.length > 0 && (
            <>
              <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '11px', color: '#000' }}>{t('matchEnd.sanctionsOverflow')}</div>
              {overflowSanctions.map((sanction, idx) => (
                <div key={idx} style={{ fontSize: '11px', color: '#000', marginBottom: '2px' }}>{formatSanction(sanction)}</div>
              ))}
            </>
          )}
        </>
      ) : (
        <div style={{ color: '#666', fontSize: '11px' }}>{t('matchEnd.noRemarks')}</div>
      )}
    </div>
  )
}

// Page wrapper: the volleyui working page (light, stone), full width up to 1400px
function MatchEndPageView({ children }) {
  return (
    <div className="ov-kit mx-auto w-full max-w-[1400px] self-start px-4 py-6 text-stone-800 sm:py-8" data-testid="match-end">
      {children}
    </div>
  )
}

export default function MatchEnd({ matchId, onGoHome, onReopenLastSet, onManualAdjustments }) {
  const { t } = useTranslation()
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
  const [downloadProgress, setDownloadProgress] = useState(null) // { json: boolean, pdf: boolean }
  const [zoomedSection, setZoomedSection] = useState(null) // 'results' | 'sanctions' | null
  const [showRemarksModal, setShowRemarksModal] = useState(false)
  const [remarksText, setRemarksText] = useState('')
  const remarksTextareaRef = useRef(null)
  // The approval's PDF: Cancel during the wait, the scorer's choice when no
  // PDF came (Retry / Approve without PDF / Cancel), the page n of m
  const exportAbortRef = useRef(null)
  const pdfChoiceRef = useRef(null)
  const [pdfFailure, setPdfFailure] = useState(null) // { reason, message }
  const [exportPdfProgress, setExportPdfProgress] = useState(null) // { page, pages }
  const [isClosing, setIsClosing] = useState(false)
  const askPdfFailure = (err) => new Promise((resolve) => {
    pdfChoiceRef.current = resolve
    setPdfFailure({ reason: err?.reason || PDF_FAIL.FAILED, message: err?.message || '' })
  })
  const choosePdfFailure = (choice) => {
    const resolve = pdfChoiceRef.current
    pdfChoiceRef.current = null
    setPdfFailure(null)
    resolve?.(choice)
  }

  // The approval is in the match row: a remount of this page (or a reload)
  // keeps the approved view instead of falling back to "Confirm and approve"
  useEffect(() => {
    if (data?.match?.approved) setIsApproved(true)
  }, [data?.match?.approved])

  // Auto-populate FIVB remarks for forfait matches if remarks are empty
  useEffect(() => {
    if (!data?.match) return
    const match = data.match
    if (!match.forfait || match.remarks) return

    const forfaitTeamName = match.forfaitTeam === 'team1'
      ? (data.team1?.name || 'Team 1')
      : (data.team2?.name || 'Team 2')

    const forfaitEvent = data.events?.find(e => e.type === 'forfait')
    const reason = forfaitEvent?.payload?.reason || match.forfaitType || 'no_show'

    let defaultRemark = ''
    if (reason === 'no_show') {
      defaultRemark = `Team ${forfaitTeamName} forfeits the match due to no show`
    } else if (reason === 'injury' || reason === 'medical') {
      const playerNum = forfaitEvent?.payload?.playerNumber || '...'
      defaultRemark = `Team ${forfaitTeamName} forfeits the match due to injury (injury as confirmed by the official medical personnel) of player # ${playerNum}. Appropriate official medical personnel came to the court. Both teams and players were present`
    } else {
      defaultRemark = `Team ${forfaitTeamName} forfeits the match`
    }

    db.matches.update(matchId, { remarks: defaultRemark })
  }, [data?.match?.id, data?.match?.forfait, data?.match?.remarks, matchId])

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
  const winnerColor = winnerTeamKey === 'team1' ? (match?.team1Color || '#3b82f6') : (match?.team2Color || '#3b82f6')
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
  // For forfait matches, skip captain signatures (forfeiting team captain may not be present)
  const isForfait = !!match.forfait
  const captainASigned = isForfait || (team1Label === 'A' ? !!match.team1PostGameCaptainSignature : !!match.team2PostGameCaptainSignature)
  const captainBSigned = isForfait || (team1Label === 'B' ? !!match.team1PostGameCaptainSignature : !!match.team2PostGameCaptainSignature)
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

  // Re-sign and Clear close once the match is approved or closed
  const signaturesLocked = signatureEditLocked(match, { isApproved })

  const signatureFieldMap = {
    'captain-a': team1Label === 'A' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
    'captain-b': team1Label === 'B' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
    'asst-scorer': 'asstScorerSignature',
    'scorer': 'scorerSignature',
    'ref2': 'ref2Signature',
    'ref1': 'ref1Signature'
  }

  // Every signature change is written at once and queued for the cloud: the
  // match's whole `signatures` object (utils_beach/signatures_beach.js)
  const writeSignature = async (role, signatureData) => {
    const saved = await saveMatchSignature(db, matchId, signatureFieldMap[role], signatureData)
    if (!saved && signatureFieldMap[role]) showAlert(t('matchEnd.signatureSaveFailed'), 'error')
    return saved
  }

  const handleSaveSignature = async (role, signatureData) => {
    cLogger.logHandler('handleSaveSignature', { role })
    if (signaturesLocked) return
    await writeSignature(role, signatureData)
    setOpenSignature(null)
  }

  // "Clear": the signature goes at once (saved and synced), then the pad opens
  // empty. "Re-sign" only opens the pad: Cancel keeps the old signature.
  const handleClearSignature = async (role) => {
    cLogger.logHandler('handleClearSignature', { role })
    if (signaturesLocked) return
    if (await writeSignature(role, null)) setOpenSignature(role)
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
      return `${t('matchEnd.captainA', { team: captain?.name || team?.shortName || team?.name || 'A' })}${captain ? ` (#${captain.number})` : ''}`
    }
    if (role === 'captain-b') {
      const team = team1Label === 'B' ? team1 : team2
      const captain = team1Label === 'B' ? team1Captain : team2Captain
      return `${t('matchEnd.captainB', { team: captain?.name || team?.shortName || team?.name || 'B' })}${captain ? ` (#${captain.number})` : ''}`
    }
    if (role === 'asst-scorer') return t('matchEnd.assistantScorer')
    if (role === 'scorer') return t('matchEnd.scorer')
    if (role === 'ref2') return t('matchEnd.referee2')
    if (role === 'ref1') return t('matchEnd.referee1')
    return ''
  }

  const SignatureBox = ({ role, disabled = false }) => {
    const signatureData = getSignatureData(role)
    const isSigned = !!signatureData
    const label = getSignatureLabel(role)

    return (
      <div className={cn('flex min-w-[140px] flex-1 flex-col gap-1.5', disabled && 'opacity-50')}>
        <div className="text-xs font-semibold text-stone-700">{label}</div>
        <button
          type="button"
          onClick={() => !disabled && !isSigned && !signaturesLocked && setOpenSignature(role)}
          disabled={disabled || isSigned || signaturesLocked}
          aria-label={isSigned ? `${label} · ${t('matchEnd.signed', 'Signed')}` : `${label} · ${t('matchEnd.tapToSign')}`}
          className={cn(
            'relative flex h-16 items-center justify-center overflow-hidden rounded-xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1',
            isSigned ? 'cursor-default border-emerald-300 bg-emerald-50' : 'border-dashed border-stone-300 bg-white',
            !disabled && !isSigned && 'cursor-pointer hover:border-stone-400 hover:bg-stone-50',
            disabled && 'cursor-not-allowed'
          )}
        >
          {signatureData ? (
            <>
              <img src={signatureData} alt="" className="max-h-14 max-w-full object-contain" />
              <Check size={16} aria-hidden="true" className="absolute right-2 top-2 text-emerald-600" />
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-stone-500">
              {!disabled && <PenLine size={15} aria-hidden="true" />}
              {disabled ? t('matchEnd.waiting') : t('matchEnd.tapToSign')}
            </span>
          )}
        </button>
        {isSigned && (
          // Change a collected signature (OpenVolley b1b15d8f)
          <div className="flex gap-2" data-testid={`signature-actions-${role}`}>
            <RowTool
              className="h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:flex-1"
              disabled={signaturesLocked}
              title={signaturesLocked ? t('matchEnd.signatureLocked') : undefined}
              aria-label={`${label} · ${t('matchEnd.resign')}`}
              onClick={() => setOpenSignature(role)}
              data-testid={`signature-resign-${role}`}
            >
              <PenLine size={14} aria-hidden="true" />
              {t('matchEnd.resign')}
            </RowTool>
            <RowTool
              className="h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:flex-1"
              disabled={signaturesLocked}
              title={signaturesLocked ? t('matchEnd.signatureLocked') : undefined}
              aria-label={`${label} · ${t('matchEnd.clearSignature')}`}
              onClick={() => handleClearSignature(role)}
              data-testid={`signature-clear-${role}`}
            >
              <Eraser size={14} aria-hidden="true" />
              {t('matchEnd.clearSignature')}
            </RowTool>
          </div>
        )}
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
    const url = action === 'preview' ? '/scoresheet_beach.html'
      : `/scoresheet_beach.html?action=${action}`
    // a popup, a desktop app window, or the Android app's in-app view
    openAppWindow(url, { features: 'width=1600,height=1200', title: t('matchEnd.scoresheet') })
  }

  // Handle downloading comprehensive interaction logs
  const handleDownloadLogs = async () => {
    cLogger.logHandler('handleDownloadLogs', { matchId })
    try {
      const gameN = match?.gameNumber || match?.game_n || null
      const { downloadLogs } = await import('../utils_beach/comprehensiveLogger_beach')
      await downloadLogs(gameN, 'ndjson')
      showAlert(t('matchEnd.logsDownloaded'), 'success')
    } catch (err) {
      console.error('[MatchEnd] Failed to download logs:', err)
      showAlert(t('matchEnd.logsDownloadFailed'), 'error')
    }
  }

  const handleApprove = async () => {
    cLogger.logHandler('handleApprove', { matchId, allSignaturesDone })
    setIsSaving(true)
    try {
      // Only check signatures for official matches
      if (!match.test && !allSignaturesDone) {
        showAlert(t('matchEnd.pleaseCompleteSignatures'), 'warning')
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

      // The PDF comes from the scoresheet window (scoresheetPdfRequest_beach).
      // The wait ends at once when that window is closed, stops answering or
      // the scorer presses Cancel; the scorer then chooses: Retry, Approve
      // without PDF (the JSON, the approval and the ZIP go ahead and the PDF
      // is saved from the scoresheet later) or Cancel (nothing is approved).
      // OpenBeach 2026-10-08: closing the window hung the approval.
      let pdfResult = null
      let pdfError = null
      for (;;) {
        const abort = new AbortController()
        exportAbortRef.current = abort
        setExportPdfProgress(null)
        try {
          pdfResult = await waitForScoresheetPdf(
            // a popup, a desktop app window or the Android in-app view
            () => openAppWindow('/scoresheet_beach.html?action=getBlob', { features: 'width=1600,height=1200', title: t('matchEnd.scoresheet') }),
            { signal: abort.signal, onProgress: setExportPdfProgress }
          )
          break
        } catch (err) {
          console.warn('[MatchEnd] No PDF:', err)
          // Cancel during the wait: stop here, nothing approved
          const choice = err?.reason === PDF_FAIL.CANCELLED ? 'cancel' : await askPdfFailure(err)
          if (choice === 'retry') continue
          if (choice === 'skip') { pdfError = err; break }
          exportAbortRef.current = null
          setDownloadProgress(null)
          setIsSaving(false)
          return
        } finally {
          exportAbortRef.current = null
        }
      }
      setDownloadProgress(prev => ({ ...prev, pdf: true }))

      // Create ZIP with both files
      const zip = new JSZip()
      zip.file(jsonFilename, dataStr)
      if (pdfResult) zip.file(pdfResult.filename, pdfResult.blob)

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
      if (isBackendAvailable() && !match?.test) {
        try {
          // Upload PDF: beach/{date}/game{n}_{seed}.pdf (scoresheetStoragePath)
          if (pdfResult) {
            const pdfUpload = await uploadScoresheetPdf(match, pdfResult.blob)
            if (!pdfUpload.success) console.warn('Failed to upload PDF to cloud:', pdfUpload.error)
          }

          // Upload final JSON (with _final suffix for approved matches)
          // Use country-enriched team objects so the archive PDF renders correctly
          const jsonResult = await uploadScoresheet({
            match,
            team1: team1WithCountry,
            team2: team2WithCountry,
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

      // The approval and its sync entry in one transaction: approved and
      // queued, or neither
      await db.transaction('rw', db.sync_queue, db.matches, async () => {
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
      })

      // Update UI state to show post-approval buttons
      setDownloadProgress(null)
      setIsSaving(false)
      setIsApproved(true)
      if (pdfError) {
        showAlert(t('matchEnd.pdfFailedAfterApprove', { error: pdfError.message }), 'warning')
      }
    } catch (error) {
      console.error('Error approving match:', error)
      showAlert(t('matchEnd.errorApproving', { error: error.message }), 'error')
      setDownloadProgress(null)
      setIsSaving(false)
    }
  }

  // Handle closing match after approval - deletes local data and navigates home
  const handleCloseMatch = async () => {
    cLogger.logHandler('handleCloseMatch', { matchId })
    if (isClosing) return
    setIsClosing(true)

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
      showAlert(t('matchEnd.errorClosing', { error: error.message }), 'error')
      setIsClosing(false)
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
      showAlert(t('matchEnd.errorReopeningMatch', { error: error.message }), 'error')
    }
  }

  // Handle reopening the last set for corrections
  const handleReopenLastSet = async () => {
    cLogger.logHandler('handleReopenLastSet', { matchId })

    try {
      // Find the last (highest index) set
      const allSets = await db.sets.where('matchId').equals(matchId).toArray()
      if (allSets.length === 0) {
        showAlert(t('matchEnd.noSetsReopen'), 'error')
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
        // Clear all post-match signature fields (the ones the boxes write) -
        // they must be re-collected after changes
        ...clearedPostMatchSignatures()
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
            external_id: setExtId(match.seed_key, lastSet.id),
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
            status: 'live',
            // the post-match signatures were synced as they were made: clear them there too
            ...(match.test ? {} : { signatures: signaturesPayload({ ...match, ...clearedPostMatchSignatures() }) })
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }

      showAlert(t('matchEnd.setReopened', { index: lastSet.index }), 'success')

      // Navigate back to Scoreboard
      if (onReopenLastSet) {
        onReopenLastSet()
      } else if (onGoHome) {
        onGoHome()
      }
    } catch (error) {
      console.error('[MatchEnd] Error reopening last set:', error)
      showAlert(t('matchEnd.errorReopening', { error: error.message }), 'error')
    }
  }

  // "Reopen last set?": the kit confirm (Cancel left, the verb right)
  const askReopenLastSet = async () => {
    const ok = await confirmDialog({
      title: t('matchEnd.reopenSetConfirmTitle'),
      message: `${t('matchEnd.reopenSetConfirmBody')}\n\n${t('matchEnd.reopenSetWarning')}`,
      confirmLabel: t('matchEnd.reopenLastSet'),
      cancelLabel: t('common.cancel'),
      tone: 'danger'
    })
    if (ok) await handleReopenLastSet()
  }

  const teamAName = team1Label === 'A' ? (team1?.name || 'A') : (team2?.name || 'A')
  const teamBName = team1Label === 'B' ? (team1?.name || 'B') : (team2?.name || 'B')
  const resultsTable = (
    <ResultsTable
      teamAName={teamAName}
      teamBName={teamBName}
      teamACountry={team1Label === 'A' ? match?.team1Country : match?.team2Country}
      teamBCountry={team1Label === 'B' ? match?.team1Country : match?.team2Country}
      setResults={calculateSetResults}
      matchStart={matchStart}
      matchEnd={matchEndTime}
      matchDuration={matchDuration}
    />
  )
  const sanctionsTable = <SanctionsTable items={sanctionsInBox} improperRequests={improperRequests} />
  const approveBlocked = isSaving || (!match.test && !allSignaturesDone)
  const currentStepLabel = currentStep === 'asst-scorer' ? t('matchEnd.assistantScorer')
    : currentStep === 'scorer' ? t('matchEnd.scorer')
      : currentStep === 'ref2' ? t('matchEnd.referee2')
        : currentStep === 'ref1' ? t('matchEnd.referee1')
          : currentStep === 'complete' ? t('matchEnd.allSignaturesCollected') : ''

  return (
    <MatchEndPageView>
      <h1 className="mb-4 text-center text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{t('matchEnd.title')}</h1>

      {/* Winner: the team colour band, the big set score, the sets */}
      <section className={CARD} aria-labelledby="ob-match-end-winner">
        <h2 id="ob-match-end-winner" className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{t('matchEnd.winner')}</h2>
        <div className="mb-4 flex justify-center">
          <div
            className="inline-flex max-w-full items-center gap-2.5 rounded-xl px-5 py-2.5 text-2xl font-bold"
            style={{ background: winnerColor, color: isBrightColor(winnerColor) ? '#000' : '#fff' }}
          >
            {winnerCountry && <CountryFlag countryCode={winnerCountry} size="lg" />}
            <span className="min-w-0 truncate">{winner}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          <div className="text-6xl font-bold tabular-nums text-stone-900 sm:text-7xl" aria-label={t('matchEnd.setsWon')}>
            {winnerSetsWon}<span className="text-stone-300">:</span>{loserSetsWon}
          </div>
          <table className="border-collapse text-center text-lg tabular-nums">
            <thead>
              <tr>
                <th className="px-1.5 py-1" />
                <th className="px-1.5 py-1" />
                {finishedSets.map((_, idx) => (
                  <th key={idx} className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    {['I', 'II', 'III', 'IV', 'V'][idx]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[['A', teamACountryCode, teamAColor], ['B', teamBCountryCode, teamBColor]].map(([label, country, color]) => (
                <tr key={label}>
                  <td className="px-1 py-1">{country && <CountryFlag countryCode={country} size="sm" />}</td>
                  <td className="px-1.5 py-1">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold" style={{ background: color, color: isBrightColor(color) ? '#000' : '#fff' }}>
                      {label}
                    </span>
                  </td>
                  {finishedSets.map((set, idx) => {
                    const aPoints = teamAKey === 'team1' ? set.team1Points : set.team2Points
                    const bPoints = teamAKey === 'team1' ? set.team2Points : set.team1Points
                    const mine = label === 'A' ? aPoints : bPoints
                    const won = label === 'A' ? aPoints > bPoints : bPoints > aPoints
                    return (
                      <td key={idx} className={cn('px-2 py-1', won ? 'font-bold text-stone-900' : 'text-stone-500')}>{mine}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Captain signatures, right after the winner */}
      {!isApproved && (
        <section className={CARD}>
          <h2 className={cn(CARD_TITLE, 'mb-3')}>{t('matchEnd.teamCaptains')}</h2>
          <div className="flex flex-wrap gap-3">
            <SignatureBox role="captain-a" />
            <SignatureBox role="captain-b" />
          </div>
        </section>
      )}

      {/* Results and sanctions: the official boxes, tap to see them larger */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {[['results', t('matchEnd.results'), resultsTable], ['sanctions', t('matchEnd.sanctions'), sanctionsTable]].map(([key, title, body]) => (
          <section key={key} className={cn(CARD, 'mb-0 flex flex-col')}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={CARD_TITLE}>{title}</h2>
              <IconButton variant="outline" icon={Maximize2} label={`${title} · ${t('matchEnd.showLarger')}`} onClick={() => setZoomedSection(key)} />
            </div>
            <div className={SHEET_BOX}>{body}</div>
          </section>
        ))}
      </div>

      {/* Remarks */}
      <section className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={CARD_TITLE}>{t('matchEnd.remarks')}</h2>
          {!isApproved && (
            <Button
              variant="secondary"
              size="md"
              icon={PenLine}
              onClick={() => {
                setRemarksText(match?.remarks || '')
                setShowRemarksModal(true)
              }}
            >
              {t('matchEnd.editRemarks')}
            </Button>
          )}
        </div>
        <div className={cn(SHEET_BOX, 'min-h-[60px]')}>
          <RemarksBox overflowSanctions={overflowSanctions} remarks={match?.remarks || ''} />
        </div>
      </section>

      {/* Official signatures, at the bottom */}
      {!isApproved && captainsDone && (
        <section className={CARD}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className={CARD_TITLE}>{t('matchEnd.officialSignatures')}</h2>
            {currentStepLabel && <span className="text-xs text-stone-500">{currentStepLabel}</span>}
          </div>
          <div className="flex flex-wrap gap-3">
            {hasAsstScorer && <SignatureBox role="asst-scorer" disabled={false} />}
            <SignatureBox role="scorer" disabled={hasAsstScorer && !asstScorerSigned} />
            {hasRef2 && <SignatureBox role="ref2" disabled={!scorerSigned} />}
            <SignatureBox role="ref1" disabled={(hasRef2 && !ref2Signed) || !scorerSigned} />
          </div>
        </section>
      )}

      {/* Actions: the one red primary, the rest outline */}
      <div className="flex flex-wrap gap-2">
        {isApproved ? (
          <>
            <Button variant="dark" size="xl" className="min-w-[150px] flex-1" onClick={handleCloseMatch} disabled={isClosing} loading={isClosing}>
              {t('matchEnd.closeMatch')}
            </Button>
            <Button variant="danger-outline" size="xl" onClick={handleReopenMatch} disabled={isClosing}>
              {t('matchEnd.reopenMatch')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="xl" className="min-w-[150px] flex-1" onClick={handleApprove} disabled={approveBlocked} loading={isSaving}>
              {isSaving ? t('matchEnd.downloading') : t('matchEnd.approveParams')}
            </Button>
            <Button variant="danger-outline" size="xl" onClick={askReopenLastSet}>
              {t('matchEnd.reopenLastSet')}
            </Button>
            <Button variant="secondary" size="xl" onClick={onManualAdjustments}>
              {t('matchEnd.manualAdjustments')}
            </Button>
            <MenuList
              tone="light"
              buttonLabel={<span className="inline-flex items-center gap-1.5"><FileText /> {t('matchEnd.scoresheet')}</span>}
              buttonClassName="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1"
              showArrow={true}
              position="right"
              vertical="top"
              items={[
                { key: 'preview', icon: <Search />, label: t('matchEnd.preview'), onClick: () => handleShowScoresheet('preview') },
                { key: 'save', icon: <Save />, label: t('matchEnd.savePdf'), onClick: () => handleShowScoresheet('save') },
                { key: 'logs', icon: <ChartColumn />, label: t('matchEnd.downloadLogs'), onClick: handleDownloadLogs }
              ]}
            />
          </>
        )}
      </div>

      {/* Export progress (light, labelled spinner). Above the header menu
          (data-ob-export-modal): nothing behind it can be pressed. Cancel
          while the PDF is made; when no PDF came, the scorer chooses. */}
      {downloadProgress && (
        <div data-ob-export-modal="" className="no-print fixed inset-0 z-[10000] flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          {pdfFailure ? (
            <div role="alertdialog" aria-modal="true" aria-labelledby="ob-export-failed-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" data-testid="export-pdf-failed">
              <h2 id="ob-export-failed-title" className="mb-2 text-lg font-bold text-stone-900">{t('matchEnd.export.noPdfTitle')}</h2>
              <p className="mb-1 text-sm text-stone-700">
                {t(`matchEnd.export.reason.${['closed', 'stalled', 'timeout', 'blocked'].includes(pdfFailure.reason) ? pdfFailure.reason : 'failed'}`, { error: pdfFailure.message })}
              </p>
              <p className="mb-5 text-xs text-stone-500">{t('matchEnd.export.cancelKeepsUnapproved')}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="md" onClick={() => choosePdfFailure('cancel')}>{t('matchEnd.export.cancel')}</Button>
                <Button variant="secondary" size="md" onClick={() => choosePdfFailure('skip')}>{t('matchEnd.export.approveWithoutPdf')}</Button>
                <Button variant="primary" size="md" onClick={() => choosePdfFailure('retry')} autoFocus>{t('matchEnd.export.retry')}</Button>
              </div>
            </div>
          ) : (
            <div role="status" aria-live="polite" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
              <h2 className="mb-4 text-lg font-bold text-stone-900">{t('matchEnd.preparingExport')}</h2>
              <ul className="mb-4 space-y-2 text-sm">
                {[[downloadProgress.json, t('matchEnd.matchDataJson', 'Match data (JSON)')], [downloadProgress.pdf, t('matchEnd.generatingPdf')]].map(([done, label]) => (
                  <li key={label} className={cn('flex items-center justify-center gap-2', done ? 'text-emerald-700' : 'text-stone-500')}>
                    {done ? <Check size={16} aria-hidden="true" /> : <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                    {label}
                  </li>
                ))}
              </ul>
              {!downloadProgress.pdf && exportPdfProgress?.page && exportPdfProgress?.pages ? (
                <p className="m-0 mb-1 text-xs tabular-nums text-stone-600">{t('matchEnd.export.page', { page: exportPdfProgress.page, pages: exportPdfProgress.pages })}</p>
              ) : null}
              <p className="m-0 text-xs text-stone-500">
                {downloadProgress.json && downloadProgress.pdf ? t('matchEnd.creatingZip') : t('matchEnd.export.keepWindowOpen')}
              </p>
              {!downloadProgress.pdf && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" size="md" onClick={() => exportAbortRef.current?.abort()} data-testid="export-cancel">{t('matchEnd.export.cancel')}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* The official boxes, larger */}
      {zoomedSection && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
          onClick={() => setZoomedSection(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={zoomedSection === 'results' ? t('matchEnd.results') : t('matchEnd.sanctions')}
            className="relative max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="m-0 text-lg font-bold text-stone-900">{zoomedSection === 'results' ? t('matchEnd.results') : t('matchEnd.sanctions')}</h2>
              <IconButton variant="close" icon={X} label={t('common.close')} onClick={() => setZoomedSection(null)} data-modal-close="" />
            </div>
            <div className="overflow-hidden rounded-lg border-2 border-stone-800 text-[1.2em]">
              {zoomedSection === 'results' ? resultsTable : sanctionsTable}
            </div>
          </div>
        </div>
      )}

      {/* Signature dialog */}
      <SignaturePad
        open={!!openSignature}
        title={openSignature ? getSignatureLabel(openSignature) : ''}
        existingSignature={openSignature ? getSignatureData(openSignature) : null}
        onSave={(signatureData) => handleSaveSignature(openSignature, signatureData)}
        onClose={() => setOpenSignature(null)}
      />

      {/* Remarks dialog (light) */}
      {showRemarksModal && (
        <Modal
          tone="light"
          title={t('matchEnd.editRemarks')}
          open={true}
          onClose={() => {
            setShowRemarksModal(false)
            setRemarksText('')
          }}
          width={600}
        >
          <div className="ov-kit">
            <Textarea
              ref={remarksTextareaRef}
              prose
              rows={8}
              aria-label={t('matchEnd.remarks')}
              placeholder={t('matchEnd.remarksPlaceholder')}
              value={remarksText}
              onChange={e => setRemarksText(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={modalCancelClass}
                onClick={() => {
                  setShowRemarksModal(false)
                  setRemarksText('')
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={modalSaveClass}
                onClick={async () => {
                  await db.matches.update(matchId, { remarks: remarksText.trim() })
                  setShowRemarksModal(false)
                  setRemarksText('')
                }}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </MatchEndPageView>
  )
}
