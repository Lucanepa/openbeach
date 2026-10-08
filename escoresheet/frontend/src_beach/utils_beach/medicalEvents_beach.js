/**
 * Medical time-out (MTO) and recovery interruption time (RIT) events: the
 * contract the scorer writes and the scoresheet, MatchEnd and the referee read.
 *
 * Start: an `mto` or `rit` event (logged with logEvent, so it syncs and can
 * be undone): { team, playerNumber, playerName, ritType (RIT only:
 * 'no_blood'|'toilet'|'weather'), startTime (ISO), team1Points, team2Points,
 * servingTeam }; the event's own setIndex is the set.
 *
 * End: a `medical_end` event (logEvent too): { kind ('mto'|'rit'), startSeq,
 * team, playerNumber, playerName, ritType, startTime, endTime, duration
 * (seconds), outcome ('recovered'|'forfeit') }.
 *
 * FIVB beach rule 17.1.2: at most 5 minutes recovery time; the player who
 * does not recover makes the team incomplete.
 */

export const MEDICAL_RECOVERY_SECONDS = 300

export const isMedicalStart = (e) => e?.type === 'mto' || e?.type === 'rit'

// Shirt numbers come as strings from the court (lineup keys): stored as numbers
const shirtNumber = (n) => (n !== null && n !== undefined && /^\d+$/.test(String(n)) ? Number(n) : n)

export function medicalStartPayload({ kind, team, playerNumber, playerName, ritType, startTime, team1Points, team2Points, servingTeam }) {
  const payload = {
    team,
    playerNumber: shirtNumber(playerNumber),
    playerName: playerName || '',
    startTime,
    team1Points: team1Points ?? 0,
    team2Points: team2Points ?? 0,
    servingTeam: servingTeam || null
  }
  if (kind === 'rit') payload.ritType = ritType
  return payload
}

export function medicalEndPayload(startEvent, { endTime, outcome }) {
  const p = startEvent?.payload || {}
  const startMs = new Date(p.startTime || startEvent?.ts).getTime()
  const endMs = new Date(endTime).getTime()
  const duration = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 1000)) : 0
  return {
    kind: startEvent?.type === 'rit' ? 'rit' : 'mto',
    startSeq: startEvent?.seq,
    team: p.team,
    playerNumber: shirtNumber(p.playerNumber),
    playerName: p.playerName || '',
    ritType: p.ritType || null,
    startTime: p.startTime || startEvent?.ts,
    endTime,
    duration,
    outcome
  }
}

/** The MTO / RIT still running: the latest start with no `medical_end`. */
export function findOpenMedical(events = []) {
  const ended = new Set(events.filter(e => e?.type === 'medical_end').map(e => e.payload?.startSeq))
  const open = events
    .filter(e => isMedicalStart(e) && !ended.has(e.seq) && !e.payload?.outcome)
    .sort((a, b) => (b.seq || 0) - (a.seq || 0))
  return open[0] || null
}

/** "3:12" */
export function formatMedicalDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seconds left of the 5 minutes at `nowMs`. */
export function medicalSecondsLeft(startTime, nowMs = Date.now()) {
  const startMs = new Date(startTime).getTime()
  if (!Number.isFinite(startMs)) return MEDICAL_RECOVERY_SECONDS
  return Math.max(0, MEDICAL_RECOVERY_SECONDS - Math.floor((nowMs - startMs) / 1000))
}
