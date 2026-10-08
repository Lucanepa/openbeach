// Medical time-out (MTO) and recovery interruption time (RIT) on the
// referee screen. Rule 17.1.2: an injured or ill player has at most
// 5 minutes of recovery time; the 2nd referee has it recorded (26.2.2.7).
//
// The scorer sends two relay actions:
//   medical     {kind, ritType, team, playerNumber, playerName, startTime, durationSec}
//   end_medical {kind, team, playerNumber, outcome}
// and logs the events `mto` / `rit` (start) and `medical_end` (end, with
// `startSeq`). Older scorers updated the start event in place with
// `endTime` / `outcome` instead of logging `medical_end`: that counts as
// ended too.

export const MEDICAL_RECOVERY_SEC = 300

// A recovery older than this is not shown again on reconnect (the scorer
// may have been closed without ending it)
const STALE_AFTER_SEC = MEDICAL_RECOVERY_SEC + 10 * 60

const toMs = (value) => {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** The referee's medical state from the scorer's `medical` action. */
export function medicalFromAction(actionData, now = Date.now()) {
  if (!actionData) return null
  const kind = actionData.kind === 'rit' ? 'rit' : 'mto'
  const durationSec = Number(actionData.durationSec) > 0 ? Number(actionData.durationSec) : MEDICAL_RECOVERY_SEC
  return {
    kind,
    ritType: kind === 'rit' ? (actionData.ritType || null) : null,
    team: actionData.team || null,
    playerNumber: actionData.playerNumber ?? null,
    playerName: actionData.playerName || '',
    startTimestamp: toMs(actionData.startTime) ?? now,
    initialCountdown: durationSec,
    source: 'action'
  }
}

/** Seconds of recovery time left (never below 0). */
export function medicalRemaining(medical, now = Date.now()) {
  if (!medical) return 0
  const elapsed = Math.floor((now - medical.startTimestamp) / 1000)
  return Math.max(0, (medical.initialCountdown || MEDICAL_RECOVERY_SEC) - elapsed)
}

const isStart = (e) => e && (e.type === 'mto' || e.type === 'rit')

/**
 * The recovery still running according to the events (rebuilt on
 * reconnect): the newest `mto` / `rit` with no `medical_end` after it.
 */
export function activeMedicalFromEvents(events, now = Date.now()) {
  if (!Array.isArray(events) || events.length === 0) return null
  const sorted = [...events].sort((a, b) => (a.seq || 0) - (b.seq || 0))
  let open = null
  for (const e of sorted) {
    if (isStart(e)) {
      const p = e.payload || {}
      // The old format: the start event itself carries its end
      open = (p.endTime || p.outcome) ? null : e
    } else if (e.type === 'medical_end' && open) {
      const p = e.payload || {}
      const matches = p.startSeq != null
        ? p.startSeq === open.seq
        : (!p.team || p.team === open.payload?.team)
      if (matches) open = null
    }
  }
  if (!open) return null
  const p = open.payload || {}
  const startTimestamp = toMs(p.startTime) ?? toMs(open.ts) ?? toMs(open.timestamp)
  if (startTimestamp == null) return null
  if ((now - startTimestamp) / 1000 > STALE_AFTER_SEC) return null
  return {
    kind: open.type,
    ritType: open.type === 'rit' ? (p.ritType || null) : null,
    team: p.team || null,
    playerNumber: p.playerNumber ?? null,
    playerName: p.playerName || '',
    startTimestamp,
    initialCountdown: MEDICAL_RECOVERY_SEC,
    startSeq: open.seq ?? null,
    source: 'events'
  }
}

/**
 * The next medical state after the events changed: a recovery the events
 * show as ended goes away; one the events show as running is shown (on
 * reconnect, when the action was missed). A recovery started by an action
 * stays until its end arrives (its start event may not have synced yet).
 */
export function reconcileMedical(current, events, now = Date.now()) {
  const fromEvents = activeMedicalFromEvents(events, now)
  if (fromEvents) {
    if (current && Math.abs(current.startTimestamp - fromEvents.startTimestamp) <= 2000) return current
    return fromEvents
  }
  if (!current) return null
  if (current.source === 'events') return null
  // Started by an action: it ends when the events hold its end
  const ended = Array.isArray(events) && events.some(e => {
    if (e.type === 'medical_end') {
      const p = e.payload || {}
      const startMs = toMs(p.startTime)
      if (startMs != null) return Math.abs(startMs - current.startTimestamp) <= 2000
      return p.team === current.team && String(p.playerNumber) === String(current.playerNumber)
    }
    if (isStart(e)) {
      const p = e.payload || {}
      const startMs = toMs(p.startTime)
      return (p.endTime || p.outcome) && startMs != null && Math.abs(startMs - current.startTimestamp) <= 2000
    }
    return false
  })
  return ended ? null : current
}

/** "MTO" or "RIT (no blood)"; `t` is i18next's. */
export function medicalTypeLabel(kind, ritType, t) {
  const tr = typeof t === 'function' ? t : (_k, d) => d
  if (kind !== 'rit') return tr('referee.medical.mto', 'MTO')
  const typeLabel = ritType === 'toilet'
    ? tr('referee.medical.ritToilet', 'toilet')
    : ritType === 'weather'
      ? tr('referee.medical.ritWeather', 'weather')
      : tr('referee.medical.ritNoBlood', 'no blood')
  return `${tr('referee.medical.rit', 'RIT')} (${typeLabel})`
}

/** "B #2 Weber" */
export function medicalPlayerLabel({ teamLetter, playerNumber, playerName }) {
  return [teamLetter, playerNumber != null && playerNumber !== '' ? `#${playerNumber}` : '', playerName || '']
    .filter(Boolean)
    .join(' ')
}

/** "3:12" */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The last-action text of a medical event:
 *   "MTO – B #2 Weber"
 *   "MTO end – B #2 Weber (3:12, recovered)"
 */
export function medicalEventLabel(type, payload, { teamLetter, t } = {}) {
  const tr = typeof t === 'function' ? t : (_k, d) => d
  const p = payload || {}
  const kind = type === 'medical_end' ? (p.kind === 'rit' ? 'rit' : 'mto') : type
  const typeLabel = medicalTypeLabel(kind, p.ritType, tr)
  const who = medicalPlayerLabel({ teamLetter, playerNumber: p.playerNumber, playerName: p.playerName })
  if (type !== 'medical_end') return `${typeLabel} – ${who}`.trim()
  const outcome = p.outcome === 'forfeit'
    ? tr('referee.medical.forfeit', 'forfeit')
    : p.outcome === 'recovered' ? tr('referee.medical.recovered', 'recovered') : ''
  const details = [p.duration != null ? formatDuration(p.duration) : '', outcome].filter(Boolean).join(', ')
  return `${typeLabel} ${tr('referee.medical.end', 'end')} – ${who}${details ? ` (${details})` : ''}`
}
