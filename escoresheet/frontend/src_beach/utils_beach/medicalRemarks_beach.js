/**
 * Medical time-outs (MTO) and recovery interruptions (RIT) for the score
 * sheet: the Medical Assistance chart and the remarks lines (FIVB Beach
 * Volleyball Rules 2025-2028, 17.1.2: at most 5 minutes recovery time;
 * 26.2.2.7: the scorer records the recovery time).
 *
 * OpenBeach 2026-10-08 (video 06:20-07:40): the scoreboard wrote `mto` / `rit`
 * events but the sheet only read `mto_rit` / `mto_rit_recovery`, so the chart
 * and the remarks stayed empty and the match end said "No remarks".
 *
 * Read here, in this order of preference (the shared MTO / RIT contract):
 * - start `mto` | `rit` { team, playerNumber, playerName, ritType
 *   ('no_blood' | 'toilet' | 'weather'), startTime, team1Points, team2Points,
 *   servingTeam } (+ the event's setIndex / seq / ts)
 * - end `medical_end` { kind, startSeq, team, playerNumber, playerName,
 *   ritType, startTime, endTime, duration (s), outcome ('recovered' | 'forfeit') }
 * - older data: an `mto` / `rit` whose payload got endTime / duration /
 *   outcome written into it, and `mto_rit` { type: 'mto_blood' |
 *   'rit_no_blood' | 'rit_weather' | 'rit_toilet' } + `mto_rit_recovery`.
 *
 * Pure: no React, no database.
 */

const RIT_TYPES = { no_blood: 'rit_no_blood', toilet: 'rit_toilet', weather: 'rit_weather' }
const LEGACY_TYPES = ['mto_blood', 'rit_no_blood', 'rit_weather', 'rit_toilet']

const seqOf = (e) => (typeof e?.seq === 'number' ? e.seq : null)
const tsOf = (e) => {
  if (e?.ts == null) return 0
  const n = typeof e.ts === 'number' ? e.ts : new Date(e.ts).getTime()
  return Number.isFinite(n) ? n : 0
}
/** Event order: seq first (the app's own order), the time stamp otherwise. */
export function compareEvents(a, b) {
  const sa = seqOf(a)
  const sb = seqOf(b)
  if (sa != null && sb != null && sa !== sb) return sa - sb
  return tsOf(a) - tsOf(b)
}

/** 'mto_blood' | 'rit_no_blood' | 'rit_weather' | 'rit_toilet' for a start event, or null. */
export function medicalChartType(event) {
  if (!event) return null
  if (event.type === 'mto') return 'mto_blood'
  if (event.type === 'rit') return RIT_TYPES[event.payload?.ritType] || 'rit_no_blood'
  if (event.type === 'mto_rit') return LEGACY_TYPES.includes(event.payload?.type) ? event.payload.type : null
  return null
}

const sameNumber = (a, b) => a != null && b != null && String(a) === String(b)

// The score and the serving team just before `start`, from the events of its set
function situationAt(start, events) {
  const p = start.payload || {}
  const setIndex = start.setIndex || 1
  const before = events
    .filter(e => (e.setIndex || 1) === setIndex && compareEvents(e, start) < 0)
    .sort(compareEvents)
  let team1Points = 0
  let team2Points = 0
  let lastPointTeam = null
  let lastServe = null
  for (const e of before) {
    if (e.type === 'point') {
      if (e.payload?.team === 'team1') team1Points++
      else if (e.payload?.team === 'team2') team2Points++
      lastPointTeam = e.payload?.team || lastPointTeam
    } else if (e.type === 'rally_start' && e.payload?.servingTeam) {
      lastServe = e.payload.servingTeam
    }
  }
  return {
    team1Points: Number.isFinite(p.team1Points) ? p.team1Points : team1Points,
    team2Points: Number.isFinite(p.team2Points) ? p.team2Points : team2Points,
    // beach: the team that won the last rally serves the next one
    servingTeam: p.servingTeam || lastPointTeam || lastServe || null
  }
}

const toIso = (v) => {
  if (v == null || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Every MTO / RIT of the match, in order, with its end when there is one:
 * [{ kind, chartType, team, playerNumber, playerName, setIndex, startTime,
 *    endTime, durationSec, outcome, team1Points, team2Points, servingTeam, seq }]
 */
export function collectMedicalCases(events = []) {
  const list = (Array.isArray(events) ? events : []).filter(Boolean)
  const sorted = [...list].sort(compareEvents)
  const ends = sorted.filter(e => e.type === 'medical_end' || e.type === 'mto_rit_recovery')
  const usedEnds = new Set()
  const cases = []

  for (const start of sorted) {
    const chartType = medicalChartType(start)
    if (!chartType) continue
    const p = start.payload || {}
    if (!p.team) continue
    const kind = chartType === 'mto_blood' ? 'mto' : 'rit'

    // its end: by startSeq, else the next end of the same player (and type)
    let end = ends.find(e => !usedEnds.has(e) && e.type === 'medical_end' && seqOf(start) != null && e.payload?.startSeq === seqOf(start))
    if (!end) {
      end = ends.find(e => !usedEnds.has(e) && compareEvents(e, start) > 0 &&
        e.payload?.team === p.team && sameNumber(e.payload?.playerNumber, p.playerNumber) &&
        (e.type === 'medical_end'
          ? (!e.payload?.kind || e.payload.kind === kind)
          : (!e.payload?.type || e.payload.type === chartType)))
    }
    if (end) usedEnds.add(end)
    const ep = end?.payload || {}

    const startTime = toIso(p.startTime) || toIso(start.ts)
    // older data: the end written into the start event itself
    const endTime = toIso(ep.endTime) || (end ? toIso(end.ts) : null) || toIso(p.endTime)
    let durationSec = Number.isFinite(ep.duration) ? ep.duration : (Number.isFinite(p.duration) ? p.duration : null)
    if (durationSec == null && startTime && endTime) {
      durationSec = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000))
    }
    const situation = situationAt(start, list)

    cases.push({
      kind,
      chartType,
      team: p.team,
      playerNumber: p.playerNumber ?? null,
      playerName: p.playerName || ep.playerName || '',
      setIndex: start.setIndex || 1,
      startTime,
      endTime: endTime || null,
      durationSec,
      outcome: ep.outcome || p.outcome || null,
      ...situation,
      seq: seqOf(start)
    })
  }
  return cases
}

const two = (n) => String(n).padStart(2, '0')
/** HH:MM:SS in local time. */
export function clockTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}
/** H:MM:SS → "00:03:12". */
export function durationText(sec) {
  if (!Number.isFinite(sec) || sec < 0) return ''
  const s = Math.round(sec)
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`
}

const SET_NAMES = { 1: '1st', 2: '2nd', 3: '3rd' }
const TYPE_TEXT = {
  mto_blood: '"Medical Time Out" (Blood)',
  rit_no_blood: '"Recovery Interruption" (Illness, no blood)',
  rit_weather: '"Recovery Interruption" (Severe weather)',
  rit_toilet: '"Recovery Interruption" (Toilet)'
}

/**
 * One remarks line, e.g.
 * `* Start Time: 11:42:10, 3rd Set, Score: 5:7, Team A Serving, Player: #2 Weber, Team B (Schmidt / Fischer), "Medical Time Out" (Blood), End Time: 11:45:22, Duration: 00:03:12, Recovered`
 * The score is the player's team first (as the sanctions).
 * @param {object} c a case of collectMedicalCases
 * @param {{ teamAKey?: string, teamNames?: { team1?: string, team2?: string } }} ctx
 */
export function formatMedicalRemark(c, { teamAKey = 'team1', teamNames = {} } = {}) {
  const label = (key) => (key === teamAKey ? 'A' : 'B')
  const mine = c.team === 'team1' ? c.team1Points : c.team2Points
  const theirs = c.team === 'team1' ? c.team2Points : c.team1Points
  const teamName = (teamNames[c.team] || '').trim()
  const parts = [
    `* Start Time: ${clockTime(c.startTime)}`,
    `${SET_NAMES[c.setIndex] || `${c.setIndex}th`} Set`,
    `Score: ${mine}:${theirs}`
  ]
  if (c.servingTeam) parts.push(`Team ${label(c.servingTeam)} Serving`)
  const player = `Player: #${c.playerNumber ?? '?'}${c.playerName ? ` ${c.playerName}` : ''}`
  parts.push(player)
  parts.push(`Team ${label(c.team)}${teamName ? ` (${teamName})` : ''}`)
  parts.push(TYPE_TEXT[c.chartType] || '"Recovery Interruption"')
  if (c.endTime) parts.push(`End Time: ${clockTime(c.endTime)}`)
  if (c.durationSec != null) parts.push(`Duration: ${durationText(c.durationSec)}`)
  if (c.outcome === 'recovered') parts.push('Recovered')
  else if (c.outcome === 'forfeit') parts.push('Not recovered (team incomplete)')
  return parts.join(', ')
}

/** All MTO / RIT remarks lines of a match, in order. */
export function medicalRemarkLines(events, ctx) {
  return collectMedicalCases(events).map(c => formatMedicalRemark(c, ctx))
}

/**
 * The remarks shown on the match end page and the sheet: the scorer's own
 * remarks, then the MTO / RIT lines (each once).
 */
export function remarksWithMedical(remarks, events, ctx) {
  const own = (remarks || '').trim()
  const lines = medicalRemarkLines(events, ctx).filter(l => !own.includes(l))
  if (!lines.length) return own
  return own ? `${own}\n\n${lines.join('\n')}` : lines.join('\n')
}

/**
 * Per player, what the Medical Assistance chart marks: { mto: boolean,
 * rit: 'rit_no_blood' | 'rit_weather' | 'rit_toilet' | null }, keyed
 * `${team}:${playerNumber}` (both teams may have a #1 and a #2).
 */
export function medicalChartMarks(events) {
  const marks = {}
  for (const c of collectMedicalCases(events)) {
    const key = `${c.team}:${c.playerNumber}`
    const m = marks[key] || (marks[key] = { mto: false, rit: null })
    if (c.chartType === 'mto_blood') m.mto = true
    else if (!m.rit) m.rit = c.chartType // one RIT per player per match
  }
  return marks
}
