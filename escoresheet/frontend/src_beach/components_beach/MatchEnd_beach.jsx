import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
import { isBackendAvailable, getCloudApiUrl } from '../utils_beach/backendConfig_beach'
import { useAuth } from '../contexts_beach/AuthContext_beach'
import { approvalsApi, approvalErrorKey, isApprovalUnavailable, isApprovalUnsupported } from '../lib_beach/approvalsApi_beach'
import {
  ROLE_TO_SLOT, approvalFor, isApprovalValid, slotComplete, approvalLine, approvalsBySlot, approvalSummary,
  resultKey, rememberApprovalEmail, namesDiffer, approvalsCompletingSlots, approvalsStillValid, pinApprovalState,
  callerMayApprove as mayApproveFrom
} from '../utils_beach/accountApproval_beach'
import AccountApprovalDialog from './AccountApprovalDialog_beach'
import { askConfirm } from '../utils_beach/askConfirm_beach'
import { uploadScoresheet, uploadScoresheetPdf } from '../utils_beach/scoresheetUploader_beach'
import { useComponentLogging } from '../contexts_beach/LoggingContext_beach'
import { exportLogsAsNDJSON } from '../utils_beach/comprehensiveLogger_beach'
import { useScaledLayout } from '../hooks_beach/useScaledLayout_beach'

import { sanitizeForFilename } from '../utils_beach/stringUtils_beach'
import { openAppWindow } from '../utils_beach/openAppWindow_beach'
import { formatTimeLocal } from '../utils_beach/timeUtils_beach'
import { saveMatchSignature, signatureEditLocked, signaturesPayload, clearedPostMatchSignatures, POST_MATCH_SIGNATURE_KEYS } from '../utils_beach/signatures_beach'
import { approvalSignatureSources, phoneSignContext, signatureSourceUpdate, signedOnPhone, SLOT_OF_ROLE } from '../utils_beach/phoneSignature_beach'
import { relayMatchKey } from '../utils_beach/relayPublisher_beach'
import CountryFlag from './CountryFlag_beach'
import { ChartColumn, FileText, Save, Search } from './Icons_beach'
import { AlertTriangle, Check, Eraser, Info, Loader2, Maximize2, PenLine, ShieldCheck, Smartphone, X } from 'lucide-react'
import { Button } from '../ui/volleyui/Button.jsx'
import { RowTool } from '../ui/volleyui/Row.jsx'
import { IconButton } from '../ui/volleyui/IconButton.jsx'
import { Textarea } from '../ui/volleyui/Textarea.jsx'
import { confirmDialog, toast } from '../ui/volleyui/uiStore.js'
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

// The server answered 409 OV_APPROVAL_UNSUPPORTED (it does not approve beach
// results yet): remembered for this session, so every box says so at once.
// A reload asks again (the server may have been switched on meanwhile).
const BEACH_APPROVAL_OFF_KEY = 'ob.approvalBeachUnsupported'
function beachApprovalOff() {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(BEACH_APPROVAL_OFF_KEY) === '1' } catch { return false }
}
function rememberBeachApprovalOff() {
  try { sessionStorage.setItem(BEACH_APPROVAL_OFF_KEY, '1') } catch { /* storage blocked */ }
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
  const { t, i18n } = useTranslation()
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

  // Approval with an account (scorer, 2nd and 1st referee; OpenVolley
  // 0fc2661a, b1b15d8f). The server row is the truth: the local copy on the
  // match row (accountApprovals) is replaced by the server's on mount and
  // when the connection comes back.
  let authCtx = null
  try { authCtx = useAuth() } catch { authCtx = null }
  const access = authCtx?.access
  const signedIn = !!authCtx?.user
  const [approvalRole, setApprovalRole] = useState(null) // 'scorer' | 'ref2' | 'ref1' | null
  // 'unknown' | 'available' | 'unavailable' (feature off) | 'unsupported' (no beach approvals)
  const [approvalFeature, setApprovalFeature] = useState(() => (beachApprovalOff() ? 'unsupported' : 'unknown'))
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const seedKey = data?.match?.seed_key || null
  const cloudApi = !!getCloudApiUrl('/api/approvals')

  const refreshAccountApprovals = useCallback(async () => {
    if (!seedKey || !signedIn || !cloudApi) return null
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    const res = await approvalsApi.list(seedKey)
    if (res.error) {
      if (isApprovalUnavailable(res.error)) setApprovalFeature('unavailable')
      // 404/403 and network errors: keep the local copy
      return null
    }
    setApprovalFeature(f => (f === 'unsupported' ? f : 'available'))
    const bySlot = approvalsBySlot(res.data?.approvals)
    try {
      await db.matches.update(matchId, { accountApprovals: Object.keys(bySlot).length ? bySlot : null })
    } catch (err) {
      console.warn('[MatchEnd] Could not store the account approvals:', err?.message)
    }
    return { bySlot, server: res.data?.match || null }
  }, [seedKey, signedIn, cloudApi, matchId])

  useEffect(() => {
    if (isApproved) return undefined
    refreshAccountApprovals()
    const on = () => { setOnline(true); refreshAccountApprovals() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [refreshAccountApprovals, isApproved])

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
  const hasRef2 = match.ref2Signature !== undefined || !!approvalFor(match, 'ref2') ||
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
  // The scorer and the referees: a drawn signature OR a valid account
  // approval (one that still matches the finished sets)
  const scorerSigned = slotComplete(match, 'scorer', sets)
  const ref2Signed = !hasRef2 || slotComplete(match, 'ref2', sets)
  const ref1Signed = slotComplete(match, 'ref1', sets)

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
  // The PIN-approval line of an official's box: approved, offered, or why not.
  // Only a beach scorer or referee account (or an admin) may send approvals
  // of a beach match (the server checks the same)
  const pinStateOf = (role) => pinApprovalState({
    role, approval: approvalFor(match, role), sets, locked: signaturesLocked, hasSeedKey: !!match.seed_key,
    cloudApi, feature: approvalFeature, signedIn, callerMayApprove: mayApproveFrom(access), online
  })

  const signatureFieldMap = {
    'captain-a': team1Label === 'A' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
    'captain-b': team1Label === 'B' ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature',
    'asst-scorer': 'asstScorerSignature',
    'scorer': 'scorerSignature',
    'ref2': 'ref2Signature',
    'ref1': 'ref1Signature'
  }

  // Every signature change is written at once and queued for the cloud: the
  // match's whole `signatures` object (utils_beach/signatures_beach.js). The
  // image and its "signed on phone" record go in one update, so a Clear or a
  // signature drawn here sets the record to null and one from a phone sets it
  // (OpenVolley d451686d). meta: { source: 'device' } or { source: 'phone', transport }
  const writeSignature = async (role, signatureData, meta) => {
    const field = signatureFieldMap[role]
    const saved = await saveMatchSignature(db, matchId, field, signatureData, field ? signatureSourceUpdate(field, signatureData, meta) : null)
    if (!saved && field) showAlert(t('matchEnd.signatureSaveFailed'), 'error')
    return saved
  }

  // A signature drawn here or received from a phone (the pad's onSave)
  const handleSaveSignature = async (role, signatureData, meta) => {
    cLogger.logHandler('handleSaveSignature', { role, source: meta?.source || 'device' })
    if (signaturesLocked) return
    await writeSignature(role, signatureData, meta)
    // A new signature (drawn here or from a phone) completes the slot: a stale
    // account approval of it (the result changed since) is dropped from the local copy
    const slot = ROLE_TO_SLOT[role]
    if (slot && signatureData) {
      const stale = approvalFor(match, role)
      if (stale && !isApprovalValid(stale, sets)) await removeLocalApproval(slot, stale.id)
    }
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
    const viaPhone = isSigned && signedOnPhone(match, signatureFieldMap[role])
    const approval = ROLE_TO_SLOT[role] ? approvalFor(match, role) : null
    // The PIN line of an official (null for the captains); a drawn signature does not hide it
    const pin = pinStateOf(role)
    const approved = pin?.state === 'approved'
    // Without a drawn signature, a valid approval fills the box
    const approvalValid = !isSigned && approved
    const approvalStale = !isSigned && !!approval && !approved

    return (
      <div className={cn('flex min-w-[140px] flex-1 flex-col gap-1.5', disabled && 'opacity-50')} data-testid={`signature-slot-${role}`}>
        <div className="text-xs font-semibold text-stone-700">{label}</div>
        {approvalValid ? (
          // Approved with an account: the emerald done state, no image
          <div
            className="flex h-16 items-center gap-2 overflow-hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 text-emerald-800"
            data-testid={`account-approval-${role}`}
          >
            <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{t('approval.done')}</div>
              <div className="truncate text-xs leading-tight tabular-nums text-emerald-700" title={approvalLine(approval)}>{approvalLine(approval)}</div>
            </div>
          </div>
        ) : (
        <button
          type="button"
          onClick={() => !disabled && !isSigned && !signaturesLocked && setOpenSignature(role)}
          disabled={disabled || isSigned || signaturesLocked}
          aria-label={isSigned ? `${label} · ${t('matchEnd.signed', 'Signed')}` : `${label} · ${t('matchEnd.tapToSign')}`}
          className={cn(
            'relative flex h-16 items-center justify-center overflow-hidden rounded-xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1',
            isSigned ? 'cursor-default border-emerald-300 bg-emerald-50'
              : approvalStale ? 'border-dashed border-amber-300 bg-amber-50 text-amber-800'
                : 'border-dashed border-stone-300 bg-white',
            !disabled && !isSigned && (approvalStale ? 'cursor-pointer hover:bg-amber-100' : 'cursor-pointer hover:border-stone-400 hover:bg-stone-50'),
            disabled && 'cursor-not-allowed'
          )}
          data-testid={approvalStale ? `account-approval-stale-${role}` : undefined}
        >
          {signatureData ? (
            <>
              <img src={signatureData} alt="" className="max-h-14 max-w-full object-contain" />
              <Check size={16} aria-hidden="true" className="absolute right-2 top-2 text-emerald-600" />
              {viaPhone && (
                <span
                  className="absolute left-2 top-2 text-emerald-700"
                  title={t('phoneSign.signedOnPhone')}
                  aria-label={t('phoneSign.signedOnPhone')}
                  data-testid={`signed-on-phone-${role}`}
                >
                  <Smartphone size={13} aria-hidden="true" />
                </span>
              )}
            </>
          ) : approvalStale ? (
            <span className="inline-flex items-center gap-1.5 px-2 text-center text-sm font-medium">
              <AlertTriangle size={15} aria-hidden="true" className="shrink-0" />
              {t('approval.stale')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-stone-500">
              {!disabled && <PenLine size={15} aria-hidden="true" />}
              {disabled ? t('matchEnd.waiting') : t('matchEnd.tapToSign')}
            </span>
          )}
        </button>
        )}
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
        {pin && renderPinLine(role, pin, approval, { isSigned, disabled })}
      </div>
    )
  }

  // The PIN-approval line under an official's signature: approved (with
  // Undo), "Approve with PIN", or one line saying why not. Never empty.
  const renderPinLine = (role, pin, approval, { isSigned, disabled }) => {
    if (pin.state === 'approved') {
      return (
        <div className="flex flex-col gap-1.5">
          {isSigned && (
            // Signed by hand AND approved: the approval as a compact line
            <div
              className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-emerald-800"
              data-testid={`account-approval-${role}`}
            >
              <Check size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-emerald-700" />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{t('approval.done')}</div>
                <div className="truncate text-xs leading-tight tabular-nums text-emerald-700" title={approvalLine(approval)}>{approvalLine(approval)}</div>
              </div>
            </div>
          )}
          <RowTool
            className="h-11 w-full flex-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
            disabled={!online || signaturesLocked}
            title={online ? undefined : t('approval.needsInternet')}
            onClick={() => handleUndoAccountApproval(role, approval)}
            data-testid={`account-approval-undo-${role}`}
          >
            {t('approval.undo')}
          </RowTool>
        </div>
      )
    }
    if (pin.state === 'offer') {
      return (
        <Button
          variant="secondary"
          size="xl"
          icon={ShieldCheck}
          className="w-full font-medium"
          disabled={disabled}
          onClick={() => setApprovalRole(role)}
          data-testid={`account-approval-open-${role}`}
        >
          {t('approval.approveWithPin')}
        </Button>
      )
    }
    return (
      <p
        className="m-0 flex min-h-11 items-center gap-1.5 text-xs leading-snug text-stone-500"
        data-testid={`account-approval-why-${role}`}
        data-reason={pin.reason}
      >
        <Info size={14} aria-hidden="true" className="shrink-0" />
        <span>{t(`approval.why.${pin.reason}`)}</span>
      </p>
    )
  }

  // Undo an account approval (the approver, the owner or an editor; online)
  const handleUndoAccountApproval = async (role, approval) => {
    if (!approval?.id) return
    cLogger.logHandler('handleUndoAccountApproval', { role })
    const ok = await askConfirm({
      title: t('approval.undoConfirm'),
      message: t('approval.undoConfirmBody'),
      confirmLabel: t('approval.undo'),
      tone: 'danger'
    })
    if (!ok) return
    const res = await approvalsApi.undo(approval.id)
    if (res.error && res.error.status !== 404) {
      toast.error(t(approvalErrorKey(res.error, { context: 'approval' })))
      return
    }
    await removeLocalApproval(ROLE_TO_SLOT[role], approval.id)
    toast.success(t('approval.undone'))
  }

  // Drop one slot from the local copy (only if it still holds that record)
  async function removeLocalApproval(slot, id) {
    const row = await db.matches.get(matchId)
    const current = { ...(row?.accountApprovals || {}) }
    if (current[slot] && (!id || current[slot].id === id)) delete current[slot]
    await db.matches.update(matchId, { accountApprovals: Object.keys(current).length ? current : null })
  }

  // After a 200 from POST /api/approvals: keep the record on the match row
  const handleAccountApproved = async (record, { email, entered }) => {
    const row = await db.matches.get(matchId)
    const current = { ...(row?.accountApprovals || {}) }
    current[record.slot] = record
    await db.matches.update(matchId, { accountApprovals: current })
    // A convenience for the next match on this device (never in match.officials)
    if (record.slot !== 'scorer' && entered) rememberApprovalEmail(entered, email)
    setApprovalFeature('available')
    setApprovalRole(null)
    toast.success(t('approval.approved'))
    if (entered && namesDiffer(record.name, entered)) {
      toast.info(t('approval.nameDiffers', { account: record.name, entered }), { duration: 8000 })
    }
  }

  // A refusal of the server: 409 OV_APPROVAL_UNSUPPORTED says it does not
  // approve beach results; every box then says so and the dialog closes
  const handleApprovalError = (error) => {
    if (isApprovalUnsupported(error)) {
      rememberBeachApprovalOff()
      setApprovalFeature('unsupported')
      setApprovalRole(null)
      toast.info(t('approval.why.beachOff'))
    } else if (isApprovalUnavailable(error)) {
      setApprovalFeature('unavailable')
    }
  }

  // Reopening the last set voids the approvals on the server once the status
  // change syncs; online and not closed, undo them now as well, and wait for
  // it so no later read brings them back.
  const undoAccountApprovalsBestEffort = async (current) => {
    const records = Object.values(current?.accountApprovals || {}).filter(r => r?.id)
    if (!records.length || current?.closed_at) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    await Promise.allSettled(records.map(r => approvalsApi.undo(r.id)))
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

      // The account approvals that complete a slot (no drawn signature there)
      // are re-checked with the server before the result is approved (one may
      // have been voided, or the sets changed). A stale record in a slot that
      // was signed by hand never blocks: the drawn signature is the fallback.
      // Offline the local copy is trusted: the approvals were made online.
      const currentSets = await db.sets.where('matchId').equals(matchId).toArray()
      const completing = approvalsCompletingSlots(match, currentSets, { hasRef2 })
      if (completing.length && online && match.seed_key) {
        const fresh = await refreshAccountApprovals()
        if (fresh && !approvalsStillValid(completing, fresh.bySlot, resultKey(currentSets))) {
          showAlert(t('approval.revalidateFailed'), 'warning')
          setIsSaving(false)
          return
        }
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

      // The PDF comes from the scoresheet window (postMessage 'pdfBlob', or
      // 'pdfError' when it could not render). A PDF that does not come (popup
      // blocked, render error, 30 s) no longer stops the approval: the final
      // JSON, the approval and the ZIP (without the PDF) go ahead and the
      // scorer is told to save the PDF from the scoresheet.
      let pdfResult = null
      let pdfError = null
      try {
        pdfResult = await new Promise((resolve, reject) => {
          let timeout = null
          const handler = (event) => {
            if (event.origin !== window.location.origin) return // our own scoresheet window only
            if (event.data?.type === 'pdfBlob') {
              clearTimeout(timeout)
              window.removeEventListener('message', handler)
              const blob = new Blob([event.data.arrayBuffer], { type: 'application/pdf' })
              resolve({ blob, filename: event.data.filename })
            } else if (event.data?.type === 'pdfError') {
              clearTimeout(timeout)
              window.removeEventListener('message', handler)
              reject(new Error(event.data.message || 'PDF generation failed'))
            }
          }
          window.addEventListener('message', handler)
          timeout = setTimeout(() => {
            window.removeEventListener('message', handler)
            reject(new Error('PDF generation timed out'))
          }, 30000)
          // Open scoresheet window with getBlob action
          // In the Android app an in-app view (a window.open replaced this page)
          const opened = openAppWindow('/scoresheet_beach.html?action=getBlob', { features: 'width=1600,height=1200', title: t('matchEnd.scoresheet') })
          if (!opened.ok) {
            clearTimeout(timeout)
            window.removeEventListener('message', handler)
            reject(new Error('The scoresheet window was blocked'))
          }
        })
      } catch (err) {
        pdfError = err
        console.warn('[MatchEnd] No PDF:', err)
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
          },
          // Signed on a phone or on this device (OpenVolley d451686d)
          signatureSources: approvalSignatureSources(match),
          // Approved with an account: names and short IDs only (no user ids, no emails)
          accounts: approvalSummary(match, allSets)
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
      // The result changes: account approvals go (server: best-effort undo
      // now, and its trigger voids them when status 'live' syncs)
      await undoAccountApprovalsBestEffort(match)

      await db.sets.update(lastSet.id, { finished: false })

      // Set match status back to 'live' and clear all signature fields
      await db.matches.update(matchId, {
        status: 'live',
        approved: false,
        approvedAt: null,
        // Clear all post-match signature fields (the ones the boxes write) -
        // they must be re-collected after changes - and their "signed on phone" records
        ...clearedPostMatchSignatures(),
        ...Object.fromEntries(Object.keys(POST_MATCH_SIGNATURE_KEYS).map(field => [`signatureSources.${field}`, null]))
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
            <Button variant="dark" size="xl" className="min-w-[150px] flex-1" onClick={handleCloseMatch}>
              {t('matchEnd.closeMatch')}
            </Button>
            <Button variant="danger-outline" size="xl" onClick={handleReopenMatch}>
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

      {/* Export progress (light, labelled spinner) */}
      {downloadProgress && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
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
            <p className="m-0 text-xs text-stone-500">
              {downloadProgress.json && downloadProgress.pdf ? t('matchEnd.creatingZip') : t('matchEnd.waitCheck')}
            </p>
          </div>
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
        onSave={(signatureData, meta) => handleSaveSignature(openSignature, signatureData, meta)}
        onClose={() => setOpenSignature(null)}
        phone={openSignature ? {
          // Approved or closed: no phone session can start
          locked: signaturesLocked,
          lockedReason: t('matchEnd.signatureLocked'),
          slot: SLOT_OF_ROLE[openSignature],
          matchKey: relayMatchKey(match),
          gamePin: match.gamePin || null,
          context: phoneSignContext({
            match,
            slot: SLOT_OF_ROLE[openSignature],
            team1,
            team2,
            team1Captain,
            team2Captain,
            lang: i18n?.language,
            fallbackTeam1: t('common.team1'),
            fallbackTeam2: t('common.team2')
          })
        } : null}
      />

      {/* Approve with an account (scorer, 2nd and 1st referee) */}
      <AccountApprovalDialog
        open={!!approvalRole}
        onClose={() => setApprovalRole(null)}
        match={match}
        role={approvalRole}
        roleLabel={approvalRole ? getSignatureLabel(approvalRole) : ''}
        sets={sets}
        userEmail={authCtx?.user?.email || ''}
        onApproved={handleAccountApproved}
        onError={handleApprovalError}
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
