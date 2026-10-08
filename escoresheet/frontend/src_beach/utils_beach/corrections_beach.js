/**
 * Planners for the beach scorer's corrections (during the match and at the
 * match end): pure, no React, no Dexie.
 *
 * Every correction is planned here and written by one executor
 * (utils_beach/applyCorrectionPlan_beach.js). A planner returns either a PLAN
 * or `{ error, params, text }` (error is an i18n key under corrections.error.*):
 *
 *   Plan = {
 *     add:    Event[]            full rows (seq, ts, setIndex, payload, stateSnapshot:null)
 *     update: {id, changes}[]    payload edits and seq renumbering
 *     remove: id[]               whole groups, never orphans
 *     affectedSets: number[]     set indexes whose score is re-derived from the points
 *     setUpdates: {setIndex, changes}[]  set row fields (start/end time)
 *     remarkAdd: string[]  remarkRemove: string[]  remarksSet?: string
 *     log: { action, setIndex, team, before, after, text }
 *     notes: {key, params, text}[]   non-blocking warnings for the preview
 *   }
 *
 * WHERE A NEW EVENT GOES. The scoresheet places a time-out or a sanction at
 * the score of the points logged before it (seq order). So "at which score"
 * is chosen from the scores the set actually went through (scoreTimeline) and
 * the event gets an INTEGER seq right after the last event already recorded
 * at that score, every later event shifted by one (fractional part kept,
 * N.1 -> N+1.1). A fractional seq is never used: Undo removes by base seq and
 * would take the new event with the point.
 *
 * Ported from OpenVolley src/domain/manualCorrections.js (cb3f2029, b73f053d)
 * and its describe.js, for beach (FIVB Beach Volleyball Rules):
 * - teams of two, team1 / team2, Team A = match.coinTossTeamA;
 * - sets to 21, the third to 15, two points ahead;
 * - no line-ups, substitutions or libero: nothing to remap or rotate;
 * - one time-out per team per set (15.4); the technical time-out is
 *   automatic and is not corrected here;
 * - delay (16.2): the team's first delay is a delay warning (once per
 *   match), every further delay a delay penalty (a point to the opponent);
 *   an improper request repeated in the match is a delay (16.1);
 * - misconduct (21.3): a misconduct warning once per team per match, a rude
 *   conduct penalty (a point to the opponent) at most twice per player per
 *   set, the third is an expulsion; expulsion (the set is lost) and
 *   disqualification (the match is lost) are given on the scoreboard only:
 *   they forfeit, which a correction cannot rewrite;
 * - a penalty's point is the opponent's point marked `fromPenalty` (circled
 *   on the scoresheet);
 * - the changes of courts (every 7 points, 5 in the third set) are events of
 *   their own: a point added or removed in the middle of a set does not move
 *   them (a note says so).
 */
import { scoreFromPointEvents } from './scorerCorrections_beach'
import { actualStartTimeLine, actualStartTimeLines, scheduledClock, startScheduleOf } from './setStartTime_beach'

export const TEAMS = Object.freeze(['team1', 'team2'])
export const TEAM_SANCTIONS = Object.freeze(['improper_request', 'delay_warning', 'delay_penalty'])
export const MISCONDUCT_SANCTIONS = Object.freeze(['warning', 'penalty', 'expulsion', 'disqualification'])
/** The sanctions a correction can add (expulsion / disqualification forfeit: scoreboard only). */
export const ADDABLE_SANCTIONS = Object.freeze(['improper_request', 'delay_warning', 'delay_penalty', 'warning', 'penalty'])
/** Rude conduct penalties per player per set (FIVB beach 21.3: the third is an expulsion). */
export const MAX_PENALTIES_PER_SET = 2

const baseOf = (e) => Math.floor(e?.seq || 0)
const setOf = (e) => e?.setIndex ?? 1
const hasNumber = (n) => n !== undefined && n !== null && n !== '' && n !== '?'
const sameNumber = (a, b) => hasNumber(a) && hasNumber(b) && String(a) === String(b)

export const otherTeam = (team) => (team === 'team1' ? 'team2' : team === 'team2' ? 'team1' : null)
export const isTeamSanctionType = (type) => TEAM_SANCTIONS.includes(type)
export const awardsPoint = (type) => type === 'delay_penalty' || type === 'penalty'
const isDelay = (type) => type === 'delay_warning' || type === 'delay_penalty'

// ─────────────────────────────── text ───────────────────────────────

const fill = (text, params = {}) =>
  String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])))

/** t(key, default, params), or the default with its placeholders filled (0 included) without i18n. */
export function tr(t, key, def, params = {}) {
  if (typeof t === 'function' && key) {
    try {
      const out = t(key, { defaultValue: def, ...params })
      if (typeof out === 'string' && out && out !== key) return fill(out, params)
    } catch { /* fall back */ }
  }
  return fill(def, params)
}

export const ERROR_DEFAULTS = {
  noSuchScore: 'Set {{set}} never had this score.',
  timeoutLimit: 'This team\'s time-out of set {{set}} is already recorded (one per team per set).',
  chooseTarget: 'Choose who was sanctioned.',
  choosePlayer: 'Choose the player.',
  ladder: 'By the rules this is a {{expected}} (the team\'s earlier sanctions).',
  sameSanctionTwice: 'This player already has this sanction.',
  teamAlreadyWarned: 'The team has already been warned: one misconduct warning per team per match.',
  thirdPenalty: '#{{n}} already has two penalties in set {{set}}: a third is an expulsion, given on the scoreboard.',
  forfeitOnScoreboard: 'An expulsion or a disqualification forfeits the set or the match: give it on the scoreboard.',
  noLaterOpponentPoint: '{{team}} has no later point in set {{set}} to mark as the penalty point. If the point was never recorded, give the penalty on the scoreboard (during the match) or use "Correct final score".',
  winnerWouldChange: 'This would change who won set {{set}}. Use "Reopen last set" or ask the referee.',
  invalidFinalScore: '{{score}} is not a possible final score of set {{set}}.',
  notLastPoint: 'The last point of set {{set}} was not won by {{team}}.',
  setNotFinished: 'Set {{set}} is not finished.',
  notFound: 'This entry no longer exists.',
  useUndo: 'This entry is corrected with Undo or Reopen set, not removed here.',
  subEvent: 'This row belongs to another entry; remove that entry instead.',
  removePointNotLast: 'The penalty point can only be removed while it is the last point of the set being played.',
  noScoreChange: 'Nothing to change.',
  endBeforeStart: 'Set {{set}} cannot end before it starts.'
}

export const NOTE_DEFAULTS = {
  ladder: 'By the rules this would have been a {{expected}}; recorded as the referee decided.',
  sameSanctionTwice: 'This player already has this sanction.',
  teamAlreadyWarned: 'The team had already been warned (one misconduct warning per team per match).',
  thirdPenalty: '#{{n}} already had two penalties in set {{set}} (a third is an expulsion); recorded as the referee decided.',
  circledPoint: '{{team}}\'s point at {{score}} becomes the circled penalty point.',
  pointStays: 'The point stays as a normal rally point (no longer circled).',
  penaltyNotNext: 'The rally after {{score}} was won by {{team}}, not by the opponent: check that the sanction was given at this score.',
  courtSwitches: 'The changes of courts recorded after this point are not moved.',
  afterMatch: 'Entered after the match.'
}

/** A planner failure. `text` is the English sentence (the UI translates `error`). */
export function fail(key, params = {}) {
  return { error: `corrections.error.${key}`, params, text: fill(ERROR_DEFAULTS[key] || key, params) }
}

/** The translated text of a planner error. */
export function errorText(result, t) {
  if (!result?.error) return ''
  const key = result.error.replace(/^corrections\.error\./, '')
  return tr(t, result.error, ERROR_DEFAULTS[key] || key, result.params)
}

function note(key, params = {}, t) {
  return { key: `corrections.note.${key}`, params, text: tr(t, `corrections.note.${key}`, NOTE_DEFAULTS[key] || key, params) }
}

const SANCTION_DEFAULTS = {
  improper_request: 'Improper request',
  delay_warning: 'Delay warning',
  delay_penalty: 'Delay penalty',
  warning: 'Misconduct warning',
  penalty: 'Penalty',
  expulsion: 'Expulsion',
  disqualification: 'Disqualification'
}
// The letters of the beach scoresheet's sanction boxes
const SANCTION_CODES = {
  improper_request: 'IR', delay_warning: 'DW', delay_penalty: 'DP',
  warning: 'W', penalty: 'P', expulsion: 'E', disqualification: 'D'
}

export function sanctionLabel(type, t) {
  return tr(t, `corrections.sanction.${type}`, SANCTION_DEFAULTS[type] || String(type || '?'))
}

// ──────────────────────────── teams, scores ────────────────────────────

export const teamLetter = (team, match) => {
  const a = match?.coinTossTeamA
  if (a !== 'team1' && a !== 'team2') return team === 'team1' ? 'A' : 'B'
  return team === a ? 'A' : 'B'
}

/** { name, color, letter } of a team key. ctx: { match, team1Team, team2Team } */
export function teamLabel(team, ctx = {}) {
  const row = team === 'team1' ? ctx.team1Team : team === 'team2' ? ctx.team2Team : null
  const fallback = team === 'team1' ? 'Team 1' : 'Team 2'
  const name = row?.name || ctx.match?.[`${team}Name`] || fallback
  return { name, color: row?.color || ctx.match?.[`${team}Color`] || null, letter: teamLetter(team, ctx.match) }
}

export const teamNameWithLetter = (team, ctx) => {
  const l = teamLabel(team, ctx)
  return `${l.name} (${l.letter})`
}

/** "A 10:12 B": the given team first, else Team A first. score: {team1, team2} */
export function formatScore(score, team, ctx = {}) {
  const first = TEAMS.includes(team) ? team : (ctx.match?.coinTossTeamA === 'team2' ? 'team2' : 'team1')
  const second = otherTeam(first)
  const pts = (k) => Number(score?.[k] ?? 0)
  return `${teamLetter(first, ctx.match)} ${pts(first)}:${pts(second)} ${teamLetter(second, ctx.match)}`
}

export const setLabel = (setIndex, t) => tr(t, 'corrections.term.set', 'Set {{n}}', { n: setIndex })

export function compareBySeq(a, b) {
  const d = (a?.seq || 0) - (b?.seq || 0)
  if (d !== 0) return d
  return (a?.id ?? 0) - (b?.id ?? 0)
}

export const tsMs = (ts) => {
  if (ts == null) return 0
  const n = typeof ts === 'number' ? ts : Date.parse(ts)
  return Number.isFinite(n) ? n : 0
}

function setEvents(events, setIndex) {
  return (events || []).filter(e => setOf(e) === setIndex).sort(compareBySeq)
}

/** The score of a set just before an event (the points logged before it). */
export function scoreBeforeEvent(events, event) {
  const score = { team1: 0, team2: 0 }
  for (const e of setEvents(events, setOf(event))) {
    if (compareBySeq(e, event) >= 0) break
    if (e.type !== 'point') continue
    if (e.payload?.reversedTeam === 'team1') score.team1 = Math.max(0, score.team1 - 1)
    else if (e.payload?.reversedTeam === 'team2') score.team2 = Math.max(0, score.team2 - 1)
    if (TEAMS.includes(e.payload?.team)) score[e.payload.team]++
  }
  return score
}

/** Points to win a beach set: 21, the third (deciding) set 15. */
export const pointsToWin = (setIndex) => (setIndex >= 3 ? 15 : 21)

/** The winner of a set at this score, or null (21 / 15, two points ahead). */
export function setWinnerAt(score, setIndex) {
  const a = Number(score.team1 || 0)
  const b = Number(score.team2 || 0)
  const toWin = pointsToWin(setIndex)
  if (a >= toWin && a - b >= 2) return 'team1'
  if (b >= toWin && b - a >= 2) return 'team2'
  return null
}

/** A possible final score: the winner reached 21 / 15 with two ahead, and not one point more than needed. */
export function isValidFinalScore(winnerPts, loserPts, setIndex) {
  const toWin = pointsToWin(setIndex)
  return (winnerPts === toWin && loserPts <= toWin - 2) || (winnerPts > toWin && winnerPts - loserPts === 2)
}

const pointsOf = (events, setIndex) => {
  const s = scoreFromPointEvents(events, setIndex)
  return { team1: s.team1Points, team2: s.team2Points }
}

// ────────────────────────────── describe ──────────────────────────────

/**
 * A row of the panel as a sentence: { title, text, meta, team, code }.
 * text: "Delay penalty · Müller / Weber (A) · Set 2 · A 10:12 B".
 */
export function describeEvent(ev, events, ctx = {}) {
  if (!ev) return null
  const t = ctx.t
  const p = ev.payload || {}
  const team = TEAMS.includes(p.team) ? p.team : null
  const lbl = team ? teamLabel(team, ctx) : null
  const set = setOf(ev)
  const scoreBefore = scoreBeforeEvent(events, ev)
  let title
  let code = null
  let scoreShown = scoreBefore
  switch (ev.type) {
    case 'point': {
      title = tr(t, 'corrections.describe.point', 'Point')
      scoreShown = { ...scoreBefore }
      if (team) scoreShown[team]++
      if (p.fromPenalty) code = '◯'
      break
    }
    case 'timeout':
      title = tr(t, 'corrections.describe.timeout', 'Time-out')
      code = 'T'
      break
    case 'sanction': {
      title = sanctionLabel(p.type, t)
      code = SANCTION_CODES[p.type] || null
      if (hasNumber(p.playerNumber)) title += ` #${p.playerNumber}`
      else if (p.role === 'coach') title += ` · ${tr(t, 'corrections.describe.coach', 'Coach')}`
      break
    }
    case 'court_switch':
      title = tr(t, 'corrections.describe.courtSwitch', 'Change of courts')
      break
    case 'technical_to':
      title = tr(t, 'corrections.describe.technicalTimeout', 'Technical time-out')
      break
    case 'set_start':
      title = tr(t, 'corrections.describe.setStart', 'Set start')
      break
    case 'set_end':
      title = tr(t, 'corrections.describe.setEnd', 'Set end')
      scoreShown = pointsOf(events, set)
      break
    case 'rally_start':
      title = tr(t, 'corrections.describe.rallyStart', 'Rally start')
      break
    case 'replay':
      title = tr(t, 'corrections.describe.replay', 'Replay')
      break
    case 'decision_change':
      title = tr(t, 'corrections.describe.decisionChange', 'Decision change')
      break
    case 'coin_toss':
      title = tr(t, 'corrections.describe.coinToss', 'Coin toss')
      break
    default:
      title = String(ev.type || '?').replace(/_/g, ' ')
  }
  const parts = [title]
  if (lbl) parts.push(`${lbl.name} (${lbl.letter})`)
  parts.push(setLabel(set, t))
  parts.push(formatScore(scoreShown, team, ctx))
  return {
    title,
    text: parts.join(' · '),
    meta: `${setLabel(set, t)} · ${formatScore(scoreShown, team, ctx)}`,
    team: lbl,
    code
  }
}

// ─────────────────────────────── plans ───────────────────────────────

export function emptyPlan() {
  return { add: [], update: [], remove: [], affectedSets: [], setUpdates: [], remarkAdd: [], remarkRemove: [], log: null, notes: [] }
}

/** Merge two plans (b planned on the events after a): b's changes win per field. */
export function mergePlans(a, b) {
  const out = emptyPlan()
  const removed = new Set([...(a.remove || []), ...(b.remove || [])])
  out.remove = [...removed]
  const updates = new Map()
  for (const u of [...(a.update || []), ...(b.update || [])]) {
    if (removed.has(u.id)) continue
    updates.set(u.id, { ...(updates.get(u.id) || {}), ...u.changes })
  }
  out.add = [...(a.add || []), ...(b.add || [])].filter(r => !removed.has(r.tempKey)).map(r => {
    const ch = updates.get(r.tempKey)
    if (!ch) return r
    updates.delete(r.tempKey)
    return { ...r, ...ch }
  })
  out.update = [...updates.entries()].map(([id, changes]) => ({ id, changes }))
  out.affectedSets = [...new Set([...(a.affectedSets || []), ...(b.affectedSets || [])])]
  out.setUpdates = [...(a.setUpdates || []), ...(b.setUpdates || [])]
  out.remarkAdd = [...(a.remarkAdd || []), ...(b.remarkAdd || [])]
  out.remarkRemove = [...(a.remarkRemove || []), ...(b.remarkRemove || [])]
  out.notes = [...(a.notes || []), ...(b.notes || [])]
  out.log = b.log || a.log
  return out
}

/** The event log after a plan (new rows get their temp key as id). Pure. */
export function applyPlanToEvents(events, plan) {
  const removed = new Set(plan?.remove || [])
  const upd = new Map()
  for (const u of plan?.update || []) upd.set(u.id, { ...(upd.get(u.id) || {}), ...u.changes })
  const kept = (events || [])
    .filter(e => !removed.has(e.id))
    .map(e => (upd.has(e.id) ? { ...e, ...upd.get(e.id) } : e))
  const added = (plan?.add || []).map(r => ({ ...r, id: r.id ?? r.tempKey }))
  return kept.concat(added).sort(compareBySeq)
}

let tempCounter = 0
function newRow(ctx, fields) {
  tempCounter += 1
  return { matchId: ctx?.matchId, stateSnapshot: null, manual: true, tempKey: `new:${tempCounter}`, ...fields }
}

/**
 * The scores a set went through, in order, each with where an event "at that
 * score" goes: after the point that made it (and its N.x rows) and after any
 * event already recorded at that score, before the next rally start / point /
 * set end.
 * @returns {Array<{index:number, team1:number, team2:number, anchorId:any, anchorSeq:number|null, closerId:any, closerSeq:number|null, kinds:string[]}>}
 */
export function scoreTimeline(events, setIndex) {
  const list = setEvents(events, setIndex)
  const out = []
  const score = { team1: 0, team2: 0 }
  let win = []
  let open = true
  const close = (closer) => {
    if (!open) return
    const anchor = win.length ? win[win.length - 1] : null
    out.push({
      team1: score.team1,
      team2: score.team2,
      anchorId: anchor ? anchor.id : null,
      anchorSeq: anchor ? (anchor.seq || 0) : null,
      closerId: closer ? closer.id : null,
      closerSeq: closer ? (closer.seq || 0) : null,
      kinds: win.filter(e => e.type !== 'point').map(e => e.type)
    })
    open = false
  }
  for (const e of list) {
    if (e.type === 'point') {
      close(e)
      if (e.payload?.reversedTeam === 'team1') score.team1 = Math.max(0, score.team1 - 1)
      else if (e.payload?.reversedTeam === 'team2') score.team2 = Math.max(0, score.team2 - 1)
      if (TEAMS.includes(e.payload?.team)) score[e.payload.team]++
      win = [e]
      open = true
    } else if (e.type === 'rally_start' || e.type === 'set_end') {
      close(e)
    } else if (open) {
      win.push(e)
    }
  }
  if (open && list.length > 0) close(null)
  return out.map((x, index) => ({ ...x, index }))
}

/**
 * Where a new event at timeline entry `idx` goes: its seq, its ts and the
 * renumbering of every later event.
 */
export function insertionAt(events, setIndex, idx, timeline = null) {
  const tl = timeline || scoreTimeline(events, setIndex)
  const entry = tl[idx]
  if (!entry) return null
  const all = [...(events || [])].sort(compareBySeq)
  let prev = null
  if (entry.anchorId != null || entry.anchorSeq != null) {
    prev = all.find(e => e.id === entry.anchorId) || all.filter(e => (e.seq || 0) <= entry.anchorSeq).pop() || null
  } else if (entry.closerSeq != null) {
    prev = all.filter(e => (e.seq || 0) < entry.closerSeq).pop() || null
  }
  const seq = (prev ? baseOf(prev) : 0) + 1
  const next = all.find(e => baseOf(e) >= seq) || null
  const renumber = all.some(e => baseOf(e) === seq)
    ? all.filter(e => baseOf(e) >= seq).map(e => ({ id: e.id, seq: Math.round(((e.seq || 0) + 1) * 1000) / 1000 }))
    : []
  const a = prev ? tsMs(prev.ts) : 0
  const b = next ? tsMs(next.ts) : 0
  let ms
  if (a && b && b > a) ms = Math.floor((a + b) / 2)
  else if (a && !next) ms = Math.max(a + 1, Date.now())
  else if (a) ms = a + 1
  else if (b) ms = b - 1
  else ms = Date.now()
  return { seq, ts: new Date(ms).toISOString(), renumber, prevSeq: prev ? prev.seq || 0 : 0 }
}

const renumberUpdates = (ins) => (ins?.renumber || []).map(r => ({ id: r.id, changes: { seq: r.seq } }))

function logText(kind, row, eventsAfter, ctx, extra = {}) {
  const what = describeEvent(row, eventsAfter, ctx)?.text || ''
  const defaults = { added: 'Added: {{what}}', removed: 'Removed: {{what}}', changed: 'Changed: {{what}} (was: {{from}})' }
  let text = tr(ctx?.t, `corrections.log.${kind}`, defaults[kind], { what, ...extra })
  if (ctx?.mode === 'review') text += tr(ctx?.t, 'corrections.log.afterMatchSuffix', ' (entered after the match)')
  return text
}

function makeLog(action, row, eventsAfter, ctx, extra = {}) {
  const kind = action.startsWith('add') ? 'added' : action.startsWith('remove') ? 'removed' : 'changed'
  return {
    action,
    setIndex: setOf(row),
    team: row?.payload?.team ?? null,
    before: extra.from ?? null,
    after: describeEvent(row, eventsAfter, ctx)?.text ?? null,
    text: logText(kind, row, eventsAfter, ctx, extra)
  }
}

function finishPlan(plan, events, ctx, action, rowForLog, extra) {
  const after = applyPlanToEvents(events, plan)
  const row = rowForLog?.tempKey
    ? after.find(e => e.id === rowForLog.tempKey) || rowForLog
    : after.find(e => e.id === rowForLog?.id) || rowForLog
  plan.log = makeLog(action, row, action.startsWith('remove') ? events : after, ctx, extra)
  return plan
}

function setIsFinished(events, setIndex) {
  return (events || []).some(e => e.type === 'set_end' && setOf(e) === setIndex)
}

// ───────────────────────────── time-outs ─────────────────────────────

/** + Add time-out: one `timeout {team}` at the chosen score (one per team per set). */
export function planAddTimeout(events, { setIndex, team, at } = {}, ctx = {}) {
  const tl = scoreTimeline(events, setIndex)
  if (!tl[at]) return fail('noSuchScore', { set: setIndex })
  if (!TEAMS.includes(team)) return fail('chooseTarget')
  const used = (events || []).filter(e => e.type === 'timeout' && setOf(e) === setIndex && e.payload?.team === team).length
  if (used >= 1) return fail('timeoutLimit', { set: setIndex })
  const ins = insertionAt(events, setIndex, at, tl)
  const row = newRow(ctx, { type: 'timeout', setIndex, payload: { team }, seq: ins.seq, ts: ins.ts })
  const plan = emptyPlan()
  plan.add = [row]
  plan.update = renumberUpdates(ins)
  return finishPlan(plan, events, ctx, 'addTimeout', row)
}

/** Remove a time-out (nothing else depends on it). */
export function planRemoveTimeout(events, id, ctx = {}) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  const plan = emptyPlan()
  plan.remove = [id]
  return finishPlan(plan, events, ctx, 'removeTimeout', ev)
}

// ───────────────────────────── sanctions ─────────────────────────────

/** The team's first point at or after base seq `seq` in the set, or null. */
function nextPointOf(events, setIndex, team, seq) {
  return setEvents(events, setIndex).find(e => e.type === 'point' && e.payload?.team === team && baseOf(e) >= seq) || null
}

function pointScoreAfter(events, point) {
  const s = scoreBeforeEvent(events, point)
  if (TEAMS.includes(point.payload?.team)) s[point.payload.team]++
  return s
}

/**
 * What the rules expect for a team's delay or improper request, from the
 * team's sanctions before it (16.1, 16.2).
 */
export function expectedTeamSanction(type, prior, team) {
  const teamPrior = (prior || []).filter(e => e.type === 'sanction' && e.payload?.team === team)
  const delays = teamPrior.filter(e => isDelay(e.payload?.type)).length
  const delayStep = delays === 0 ? 'delay_warning' : 'delay_penalty'
  if (type === 'improper_request') {
    const irs = teamPrior.filter(e => e.payload?.type === 'improper_request').length
    return irs === 0 ? 'improper_request' : delayStep
  }
  if (isDelay(type)) return delayStep
  return type
}

/**
 * The checks of a misconduct sanction for one player, from the events
 * before it: { ok } or { key, params } (21.3).
 */
export function checkMisconduct(prior, { team, type, playerNumber, setIndex }) {
  const own = (prior || []).filter(e => e.type === 'sanction' && e.payload?.team === team)
  const player = own.filter(e => sameNumber(e.payload?.playerNumber, playerNumber))
  if (type === 'penalty') {
    const inSet = player.filter(e => e.payload?.type === 'penalty' && setOf(e) === setIndex).length
    if (inSet >= MAX_PENALTIES_PER_SET) return { key: 'thirdPenalty', params: { n: playerNumber, set: setIndex } }
    return { ok: true }
  }
  if (player.some(e => e.payload?.type === type)) return { key: 'sameSanctionTwice', params: {} }
  if (type === 'warning' && own.some(e => e.payload?.type === 'warning')) return { key: 'teamAlreadyWarned', params: {} }
  return { ok: true }
}

/**
 * + Add sanction at a score. Team sanctions follow the delay scale; a
 * misconduct sanction the per-player checks. During the match an
 * inconsistency blocks (as the scoreboard does); at the match end it is a
 * note, because what the referee decided is what is recorded.
 * A penalty's point is the opponent's next point at or after that score,
 * marked as the penalty point (it must already be recorded).
 * target (misconduct): { playerNumber } or { role: 'coach' }
 */
export function planAddSanction(events, { setIndex, team, type, target = {}, at } = {}, ctx = {}) {
  const t = ctx.t
  const tl = scoreTimeline(events, setIndex)
  const entry = tl[at]
  if (!entry) return fail('noSuchScore', { set: setIndex })
  if (!TEAMS.includes(team) || !type) return fail('chooseTarget')
  if (type === 'expulsion' || type === 'disqualification') return fail('forfeitOnScoreboard')
  if (!ADDABLE_SANCTIONS.includes(type)) return fail('chooseTarget')
  const ins = insertionAt(events, setIndex, at, tl)
  const prior = (events || []).filter(e => baseOf(e) < ins.seq)
  const review = ctx.mode === 'review'
  const plan = emptyPlan()
  const issue = (key, params = {}) => {
    if (review) { plan.notes.push(note(key, params, t)); return null }
    return fail(key, params)
  }

  let payload
  if (isTeamSanctionType(type)) {
    const expected = expectedTeamSanction(type, prior, team)
    if (expected !== type) {
      const f = issue('ladder', { expected: sanctionLabel(expected, t).toLowerCase() })
      if (f) return f
    }
    payload = { team, type }
  } else {
    const isCoach = target.role === 'coach'
    if (!isCoach && !hasNumber(target.playerNumber)) return fail('choosePlayer')
    if (!isCoach) {
      const c = checkMisconduct(prior, { team, type, playerNumber: target.playerNumber, setIndex })
      if (!c.ok) {
        const f = issue(c.key, c.params)
        if (f) return f
      }
    }
    payload = isCoach
      ? { team, type, playerType: 'official', role: 'coach' }
      : { team, type, playerType: 'player', playerNumber: Number(target.playerNumber) }
  }

  const opp = otherTeam(team)
  if (awardsPoint(type)) {
    const oppName = teamLabel(opp, ctx).name
    const p = nextPointOf(events, setIndex, opp, ins.seq)
    if (!p) return fail('noLaterOpponentPoint', { team: oppName, set: setIndex })
    plan.notes.push(note('circledPoint', { team: oppName, score: formatScore(pointScoreAfter(events, p), opp, ctx) }, t))
    const firstAfter = setEvents(events, setIndex).find(e => e.type === 'point' && baseOf(e) >= ins.seq)
    if (firstAfter && firstAfter.id !== p.id) {
      plan.notes.push(note('penaltyNotNext', { score: formatScore(entry, team, ctx), team: teamLabel(team, ctx).name }, t))
    }
    if (!p.payload?.fromPenalty) plan.update.push({ id: p.id, changes: { payload: { ...p.payload, fromPenalty: true } } })
  }

  const row = newRow(ctx, { type: 'sanction', setIndex, seq: ins.seq, ts: ins.ts, payload })
  plan.add = [row]
  const renum = new Map(renumberUpdates(ins).map(u => [u.id, u.changes]))
  for (const u of plan.update) renum.set(u.id, { ...(renum.get(u.id) || {}), ...u.changes })
  plan.update = [...renum.entries()].map(([id, changes]) => ({ id, changes }))
  return finishPlan(plan, events, ctx, 'addSanction', row)
}

/** A point and everything it wrote (N.x rows), plus the rally start before it. */
export function pointGroupIds(events, point) {
  const base = baseOf(point)
  const ids = (events || []).filter(e => baseOf(e) === base).map(e => e.id)
  const before = setEvents(events, setOf(point)).filter(e => compareBySeq(e, point) < 0)
  for (let i = before.length - 1; i >= 0; i--) {
    const e = before[i]
    if (e.type === 'rally_start') { ids.push(e.id); break }
    if (e.type === 'point') break
  }
  return [...new Set(ids)]
}

/**
 * Remove a sanction. A penalty's point stays (a normal rally point, no longer
 * circled) unless `removePoint` and that point is still the last point of the
 * set being played, in which case its whole group goes, as Undo would.
 * Expulsion and disqualification forfeited: refused (Undo / Reopen set).
 */
export function planRemoveSanction(events, id, { removePoint = false } = {}, ctx = {}) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  const type = ev.payload?.type
  if (type === 'expulsion' || type === 'disqualification') return fail('useUndo')
  const plan = emptyPlan()
  plan.remove = [id]
  const setIndex = setOf(ev)
  if (awardsPoint(type)) {
    const opp = otherTeam(ev.payload?.team)
    const p = setEvents(events, setIndex).find(e => e.type === 'point' && e.payload?.team === opp && compareBySeq(e, ev) > 0) || null
    if (removePoint && p) {
      const points = setEvents(events, setIndex).filter(e => e.type === 'point')
      const isLast = points[points.length - 1]?.id === p.id
      if (ctx.mode !== 'live' || ctx.liveSetIndex !== setIndex || !isLast || setIsFinished(events, setIndex)) {
        return fail('removePointNotLast')
      }
      plan.remove.push(...pointGroupIds(events, p))
      plan.affectedSets = [setIndex]
    } else if (p) {
      if (p.payload?.fromPenalty) {
        // eslint-disable-next-line no-unused-vars
        const { fromPenalty, ...rest } = p.payload
        plan.update = [{ id: p.id, changes: { payload: rest } }]
      }
      plan.notes.push(note('pointStays', {}, ctx.t))
    }
  }
  plan.remove = [...new Set(plan.remove)]
  return finishPlan(plan, events, ctx, 'removeSanction', ev)
}

// ─────────────────────── edit / move (generic) ───────────────────────

function planRemoveAny(events, id, ctx) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  if (ev.type === 'sanction') return planRemoveSanction(events, id, {}, ctx)
  if (ev.type === 'timeout') return planRemoveTimeout(events, id, ctx)
  return fail('useUndo')
}

/**
 * Edit a time-out or a sanction: remove it and add it again with the new
 * values (set, score, team, type, player), validated as a new entry; the
 * original row keeps its id (an in-place update with the new seq / ts / set
 * / payload). values: the fields of the matching planAdd* call.
 */
export function planEditEvent(events, id, values = {}, ctx = {}) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  const removal = planRemoveAny(events, id, ctx)
  if (removal.error) return removal
  const without = applyPlanToEvents(events, removal)
  const v = { setIndex: setOf(ev), team: ev.payload?.team, ...values }
  if (ev.type === 'sanction') {
    if (v.type === undefined) v.type = ev.payload?.type
    if (v.target === undefined) v.target = { playerNumber: ev.payload?.playerNumber, role: ev.payload?.role }
  }
  if (v.at === undefined && v.setIndex === setOf(ev)) {
    // the same score as before (scores of a set only go up: each appears once)
    const was = scoreBeforeEvent(events, ev)
    v.at = scoreTimeline(without, v.setIndex).findIndex(x => x.team1 === was.team1 && x.team2 === was.team2)
  }
  let addition
  if (ev.type === 'timeout') addition = planAddTimeout(without, v, ctx)
  else if (ev.type === 'sanction') addition = planAddSanction(without, v, ctx)
  else return fail('useUndo')
  if (addition.error) return addition

  const merged = mergePlans(removal, addition)
  const replacement = merged.add.find(r => r.type === ev.type)
  merged.add = merged.add.filter(r => r !== replacement)
  merged.remove = merged.remove.filter(x => x !== id)
  merged.update = merged.update.filter(u => u.id !== id)
  merged.update.push({ id, changes: { seq: replacement.seq, ts: replacement.ts, setIndex: replacement.setIndex, payload: replacement.payload } })
  merged.notes = addition.notes
  const after = applyPlanToEvents(events, merged)
  const from = describeEvent(ev, events, ctx)?.text || ''
  merged.log = makeLog(`edit${ev.type[0].toUpperCase()}${ev.type.slice(1)}`, after.find(e => e.id === id), after, ctx, { from })
  return merged
}

/** Move a time-out / sanction to another score (or set). */
export function planMoveEvent(events, id, { setIndex, at } = {}, ctx = {}) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  const p = ev.payload || {}
  const values = { setIndex, at }
  if (ev.type === 'sanction') Object.assign(values, { type: p.type, target: { playerNumber: p.playerNumber, role: p.role } })
  return planEditEvent(events, id, values, ctx)
}

// ──────────────────────── final score (review) ───────────────────────

/**
 * Correct the final score of a finished set by one point, at the END of the
 * set only (missed points in the middle generally cannot be fixed). +1 adds
 * a point: for the loser just before the winning point, else at the end,
 * before the set end; -1 removes the team's last point if it is the set's
 * last point. Refused when the set winner would change or the result is not
 * a possible final score (21 / 15, two points ahead).
 */
export function planAdjustFinalScore(events, sets, { setIndex, team, delta } = {}, ctx = {}) {
  const row = (sets || []).find(s => s.index === setIndex)
  if (!row?.finished && !setIsFinished(events, setIndex)) return fail('setNotFinished', { set: setIndex })
  if (!TEAMS.includes(team)) return fail('chooseTarget')
  if (delta !== 1 && delta !== -1) return fail('noScoreChange')
  const cur = pointsOf(events, setIndex)
  const curWinner = setWinnerAt(cur, setIndex) ||
    (row ? (row.team1Points > row.team2Points ? 'team1' : row.team2Points > row.team1Points ? 'team2' : null) : null)
  const next = { ...cur }
  next[team] += delta
  if (next[team] < 0) return fail('noScoreChange')
  const w = setWinnerAt(next, setIndex)
  if (!w || w !== curWinner) return fail('winnerWouldChange', { set: setIndex })
  if (!isValidFinalScore(next[w], next[otherTeam(w)], setIndex)) {
    return fail('invalidFinalScore', { set: setIndex, score: formatScore(next, null, ctx) })
  }

  const plan = emptyPlan()
  plan.affectedSets = [setIndex]
  const points = setEvents(events, setIndex).filter(e => e.type === 'point')
  const last = points[points.length - 1]
  if (delta === -1) {
    if (!last || last.payload?.team !== team) return fail('notLastPoint', { set: setIndex, team: teamLabel(team, ctx).name })
    plan.remove = pointGroupIds(events, last)
    return finishPlan(plan, events, ctx, 'removePoint', last)
  }

  // The set's last point is the winner's set point. A missed point of the
  // LOSER was played before it: it goes in just before the winning point
  // (21:17 -> 20:17, 20:18, 21:18), never after the set was already won.
  const tl = scoreTimeline(events, setIndex)
  const beforeWinning = team !== w && last && last.payload?.team === w && tl.length >= 2
  const atIdx = beforeWinning ? tl.length - 2 : tl.length - 1
  const ins = insertionAt(events, setIndex, atIdx, tl)
  if (!ins) return fail('noSuchScore', { set: setIndex })
  const at = tl[atIdx]
  const scoreAfter = { team1: at.team1, team2: at.team2 }
  scoreAfter[team]++
  const point = newRow(ctx, { type: 'point', setIndex, seq: ins.seq, ts: ins.ts, payload: { team, score: scoreAfter } })
  plan.add = [point]
  const updates = new Map(renumberUpdates(ins).map(u => [u.id, u.changes]))
  if (beforeWinning) {
    updates.set(last.id, { ...(updates.get(last.id) || {}), payload: { ...last.payload, score: { ...next } } })
  }
  plan.update = [...updates.entries()].map(([id, changes]) => ({ id, changes }))
  return finishPlan(plan, events, ctx, 'addPoint', point)
}

// ────────────────────────────── set times ─────────────────────────────

/** Correct a set's start / end time: the set row and the set_end payload. */
export function planSetTimes(events, sets, { setIndex, startTime, endTime } = {}, ctx = {}) {
  const row = (sets || []).find(s => s.index === setIndex)
  if (!row) return fail('notFound')
  const plan = emptyPlan()
  const changes = {}
  if (startTime !== undefined) changes.startTime = startTime
  if (endTime !== undefined) changes.endTime = endTime
  if (Object.keys(changes).length === 0) return fail('noScoreChange')
  const startAt = tsMs(changes.startTime ?? row.startTime)
  const endAt = tsMs(changes.endTime ?? row.endTime)
  if (startAt && endAt && endAt < startAt) return fail('endBeforeStart', { set: setIndex })
  plan.setUpdates = [{ setIndex, changes }]
  const end = setEvents(events, setIndex).find(e => e.type === 'set_end')
  if (end) plan.update = [{ id: end.id, changes: { payload: { ...end.payload, ...changes } } }]
  // Set 1 started at another time than scheduled: "Actual start time: HH:MM"
  // in the remarks, replaced by the new start, gone at the scheduled time
  const scheduledAt = startScheduleOf(ctx.match)
  if (setIndex === 1 && changes.startTime !== undefined && scheduledClock(scheduledAt)) {
    const old = actualStartTimeLines(ctx.match.remarks)
    const line = actualStartTimeLine({ setIndex, startTime: changes.startTime, scheduledAt })
    if (!(line && old.length === 1 && old[0].trim() === line)) {
      plan.remarkRemove = old
      plan.remarkAdd = line ? [line] : []
    }
  }
  let text = tr(ctx.t, 'corrections.log.setTimes', 'Set {{set}} times corrected', { set: setIndex })
  if (ctx.mode === 'review') text += tr(ctx.t, 'corrections.log.afterMatchSuffix', ' (entered after the match)')
  plan.log = { action: 'setTimes', setIndex, team: null, before: { startTime: row.startTime ?? null, endTime: row.endTime ?? null }, after: changes, text }
  return plan
}

// ───────────────────────────── remarks ─────────────────────────────

export function appendRemark(remarks, line) {
  const text = String(line || '').trim()
  if (!text) return remarks || ''
  const cur = String(remarks || '')
  return cur.trim() ? `${cur.replace(/\s+$/, '')}\n${text}` : text
}

export function removeRemarkLine(remarks, line) {
  const lines = String(remarks || '').split('\n')
  const i = lines.findIndex(l => l.trim() === String(line || '').trim())
  if (i < 0) return remarks || ''
  lines.splice(i, 1)
  return lines.join('\n')
}

/**
 * The remarks after removing events (undo, the event editor's deletes): the
 * line each removed event wrote itself and recorded as payload.autoRemark
 * (set 1's "Actual start time: HH:MM") goes, newest event first; the other
 * lines stay. As OpenVolley's reverseEventSideEffects.
 */
export function withoutAutoRemarks(remarks, removedEvents) {
  let out = remarks || ''
  const withRemark = (removedEvents || []).filter(e => e?.payload?.autoRemark)
  for (const e of [...withRemark].sort((a, b) => (b.seq || 0) - (a.seq || 0))) {
    out = removeRemarkLine(out, e.payload.autoRemark)
  }
  return out
}

/** + Add remark / edit one line of the remarks. */
export function planRemark(remarks, { text, index = null } = {}, ctx = {}) {
  const line = String(text || '').trim()
  if (!line) return fail('noScoreChange')
  const plan = emptyPlan()
  let action = 'addRemark'
  let before = null
  if (index != null) {
    const lines = String(remarks || '').split('\n')
    if (index < 0 || index >= lines.length) return fail('notFound')
    before = lines[index]
    if (before.trim() === line) return fail('noScoreChange')
    lines[index] = line
    plan.remarksSet = lines.join('\n')
    action = 'editRemark'
  } else {
    plan.remarkAdd = [line]
  }
  let logLine = action === 'editRemark'
    ? tr(ctx.t, 'corrections.log.remarkChanged', 'Remark changed: "{{text}}"', { text: line })
    : tr(ctx.t, 'corrections.log.remarkAdded', 'Remark added: "{{text}}"', { text: line })
  if (ctx.mode === 'review') logLine += tr(ctx.t, 'corrections.log.afterMatchSuffix', ' (entered after the match)')
  plan.log = { action, setIndex: null, team: null, before, after: line, text: logLine }
  return plan
}

/** Remove one line of the remarks. */
export function planRemoveRemark(remarks, index, ctx = {}) {
  const lines = String(remarks || '').split('\n')
  if (index == null || index < 0 || index >= lines.length) return fail('notFound')
  const [line] = lines.splice(index, 1)
  const plan = emptyPlan()
  plan.remarksSet = lines.join('\n')
  let text = tr(ctx.t, 'corrections.log.remarkRemoved', 'Remark removed: "{{text}}"', { text: line })
  if (ctx.mode === 'review') text += tr(ctx.t, 'corrections.log.afterMatchSuffix', ' (entered after the match)')
  plan.log = { action: 'removeRemark', setIndex: null, team: null, before: line, after: null, text }
  return plan
}

// ───────────────────────── advanced: event log ─────────────────────────

const PROTECTED = [
  'set_end', 'set_start', 'coin_toss', 'set3_coin_toss', 'set3_coin_toss_winner',
  'between_sets_setup_confirmed', 'court_switch', 'technical_to', 'decision_change',
  'forfait', 'match_stopped', 'mto', 'rit', 'medical_timeout'
]

/** True when the Advanced log offers Remove for this row. */
export function isRemovableEntry(ev) {
  if (!ev || (ev.seq || 0) !== baseOf(ev)) return false
  if (ev.type === 'timeout') return true
  if (ev.type === 'sanction') return ev.payload?.type !== 'expulsion' && ev.payload?.type !== 'disqualification'
  return !PROTECTED.includes(ev.type)
}

/**
 * Remove one entry of the log with everything that belongs to it (Advanced:
 * event log). Time-outs and sanctions use their own planner; a point takes
 * its N.x rows (a BMP group) and the rally start before it. Set boundaries,
 * changes of courts, the coin tosses and the forfeits are refused (Undo or
 * Reopen set correct those).
 */
export function planRemoveGroup(events, id, ctx = {}) {
  const ev = (events || []).find(e => e.id === id)
  if (!ev) return fail('notFound')
  if (ev.type === 'timeout' || ev.type === 'sanction') return planRemoveAny(events, id, ctx)
  if (PROTECTED.includes(ev.type)) return fail('useUndo')
  if ((ev.seq || 0) !== baseOf(ev)) return fail('subEvent')
  const plan = emptyPlan()
  if (ev.type === 'point') {
    // A finished set keeps a possible final score with the same winner
    const setIndex = setOf(ev)
    if (setIsFinished(events, setIndex)) {
      const cur = pointsOf(events, setIndex)
      const next = { ...cur }
      if (TEAMS.includes(ev.payload?.team)) next[ev.payload.team] -= 1
      const before = setWinnerAt(cur, setIndex)
      const w = setWinnerAt(next, setIndex)
      if (!w || w !== before) return fail('winnerWouldChange', { set: setIndex })
      if (!isValidFinalScore(next[w], next[otherTeam(w)], setIndex)) {
        return fail('invalidFinalScore', { set: setIndex, score: formatScore(next, null, ctx) })
      }
    }
    plan.remove = pointGroupIds(events, ev)
    plan.affectedSets = [setIndex]
    const later = setEvents(events, setIndex).some(e => e.type === 'court_switch' && compareBySeq(e, ev) > 0)
    if (later) plan.notes.push(note('courtSwitches', {}, ctx.t))
  } else {
    plan.remove = (events || []).filter(e => baseOf(e) === baseOf(ev)).map(e => e.id)
  }
  return finishPlan(plan, events, ctx, 'removeEntry', ev)
}

/** What a removal takes with it, as sentences for the confirmation. */
export function describeRemoval(events, plan, ctx = {}) {
  const removed = new Set(plan?.remove || [])
  return (events || [])
    .filter(e => removed.has(e.id))
    .sort(compareBySeq)
    .map(e => describeEvent(e, events, ctx)?.text)
    .filter(Boolean)
}

/** The sets a correction can work on: the set rows with an index, in order. */
export function playedSets(sets) {
  return [...(sets || [])].filter(s => Number.isFinite(Number(s?.index))).sort((a, b) => a.index - b.index)
}
