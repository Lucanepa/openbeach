/**
 * The changes of courts of a set against its score (FIVB beach rules 18.2:
 * every 7 points in sets 1-2, every 5 in set 3; the technical time-out at 21
 * points in sets 1-2, its change of courts made when it ends).
 *
 * A change is recorded by its event: `court_switch` (payload.score, the score
 * it was made at), or the `technical_to` whose change of courts was made
 * (payload.courtSwitched, written when the TTO ends). The courts follow the
 * score (owner's decision, 2026-10-08, as in OpenVolley's deciding set): a
 * change made at a total the score no longer reaches (a replay after it took
 * the point that reached it back) is to be changed back, and is asked for
 * again when the score reaches that total again.
 */

import { leftTeamInSet, switchSidesUpdate } from './courtSides_beach'
import { labelsInDesignation, eventTeamA } from './coinToss_beach'

const TTO_TOTAL = 21

/** Points between two changes of courts in set `setIndex`. */
export function courtChangeInterval(setIndex) {
  return Number(setIndex) === 3 ? 5 : 7
}

/** Sets 1 and 2 have the technical time-out at 21 points. */
export function hasTto(setIndex) {
  const index = Number(setIndex)
  return index >= 1 && index <= 2
}

const seqOf = (e) => Number(e?.seq) || 0
const inSet = (events, setIndex) => (events || []).filter(e => e && (e.setIndex ?? 1) === setIndex)
const switchTotal = (e) => (Number(e?.payload?.score?.team1) || 0) + (Number(e?.payload?.score?.team2) || 0)
const teamAOf = (match) => match?.coinTossTeamA || 'team1'

/**
 * The sides a change of courts saved before it (payload.preSwitchOverrides,
 * A/B labels of the designation it was logged with) as the match names the
 * teams now: a "Swap team A ↔ B" since flipped the match's labels
 * (coinToss_beach labelsInDesignation), so each team keeps its side.
 */
function savedSidesNow(event, match) {
  const saved = event?.payload?.preSwitchOverrides
  if (saved === undefined) return undefined
  return labelsInDesignation({ setLeftTeamOverrides: saved }, eventTeamA(event), teamAOf(match)).setLeftTeamOverrides
}

/**
 * Whether the change of courts of this technical time-out was made. Written on
 * the event (`courtSwitched`: false when the TTO is logged, true when it ends);
 * a TTO logged before that field: made when a later change of courts follows
 * it, or when the set's side is no longer the one it had before the TTO.
 */
export function ttoCourtSwitchMade(tto, events, match) {
  const p = tto?.payload || {}
  if (typeof p.courtSwitched === 'boolean') return p.courtSwitched
  const setIndex = tto?.setIndex ?? 1
  if (inSet(events, setIndex).some(e => e.type === 'court_switch' && seqOf(e) > seqOf(tto))) return true
  if (p.preSwitchOverrides === undefined) return true
  // The side the set is played on, by the court rule (a side not written is
  // set 1's A on the left, or the set before's): a swap writes set 1's side,
  // so { 1: 'A' } after two swaps is the same side as none
  return leftTeamInSet(setIndex, match) !== leftTeamInSet(setIndex, { ...match, setLeftTeamOverrides: savedSidesNow(tto, match) || {} })
}

/**
 * The changes of courts of set `setIndex` made at a total above `total`,
 * oldest first: `court_switch` events and the `technical_to` whose change was
 * made. Changing them back puts the teams where they were before the oldest.
 */
export function staleCourtSwitches(events, setIndex, total, match) {
  const setEvents = inSet(events, setIndex)
  return setEvents
    .filter(e => (e.type === 'court_switch' && switchTotal(e) > total) ||
      (e.type === 'technical_to' && hasTto(setIndex) && TTO_TOTAL > total && ttoCourtSwitchMade(e, setEvents, match)))
    .sort((a, b) => seqOf(a) - seqOf(b))
}

/**
 * The match fields that put the teams back where they were before the stale
 * changes `stale` (oldest first): the sides saved by the oldest one, or, for
 * one logged without them, the side flipped once per change.
 */
export function switchBackUpdate(stale, setIndex, match) {
  if (!stale?.length) return null
  const saved = savedSidesNow(stale[0], match)
  if (saved !== undefined) return { setLeftTeamOverrides: { ...(saved || {}) } }
  return stale.length % 2 === 1 ? switchSidesUpdate(setIndex, match) : null
}

/**
 * The undo snapshots to rewrite after the change back: every event of the
 * set logged after the oldest stale change kept the courts it made, and Undo
 * of the event after it restores them (the teams changed courts again). They
 * get the sides of `sidesMatch` (the match with the change back applied),
 * in the snapshot's own designation (its teamAKey: a "Swap team A ↔ B" made
 * since names the teams the other way round, the sides are the same).
 * @returns {{ id: *, stateSnapshot: object }[]}
 */
export function snapshotsAfterSwitchBack(events, stale, setIndex, sidesMatch) {
  if (!stale?.length) return []
  const staleIds = new Set(stale.map(e => e.id))
  const from = seqOf(stale[0])
  const overrides = { ...(sidesMatch?.setLeftTeamOverrides || {}) }
  const sideA = leftTeamInSet(setIndex, sidesMatch) === 'A' ? 'left' : 'right'
  return inSet(events, setIndex)
    .filter(e => !staleIds.has(e.id) && seqOf(e) > from && e.stateSnapshot && typeof e.stateSnapshot === 'object')
    .map(e => {
      const snapA = e.stateSnapshot.teamAKey
      if (!snapA || snapA === teamAOf(sidesMatch)) {
        return { id: e.id, stateSnapshot: { ...e.stateSnapshot, setLeftTeamOverrides: overrides, sideA } }
      }
      const sides = labelsInDesignation({ setLeftTeamOverrides: overrides }, teamAOf(sidesMatch), snapA).setLeftTeamOverrides
      return { id: e.id, stateSnapshot: { ...e.stateSnapshot, setLeftTeamOverrides: sides, sideA: sideA === 'left' ? 'right' : 'left' } }
    })
}

/**
 * The technical time-out of set `setIndex` logged at 21 whose change of
 * courts is not made yet (its dialog is pending), or null.
 */
export function pendingTto(events, setIndex, match) {
  if (!hasTto(setIndex)) return null
  const setEvents = inSet(events, setIndex)
  const tto = setEvents.filter(e => e.type === 'technical_to').sort((a, b) => seqOf(b) - seqOf(a))[0]
  if (!tto || ttoCourtSwitchMade(tto, setEvents, match)) return null
  return tto
}

/**
 * What the screen must ask when it is opened on set `set` (a reload, or the
 * app opened again) with a dialog of the courts pending: 'back' (a change
 * made at a total the score no longer reaches), 'point' (a change total
 * reached with its change of courts not made: the change, or at 21 in sets
 * 1-2 the TTO, logged or not, whose end makes it; what a point at that total
 * opens), else null. A set-ending score is the set end, not a change.
 */
export function pendingCourtDialog(events, set, match) {
  if (!set || set.finished) return null
  const setIndex = set.index
  const team1 = Number(set.team1Points) || 0
  const team2 = Number(set.team2Points) || 0
  const total = team1 + team2
  if (staleCourtSwitches(events, setIndex, total, match).length > 0) return 'back'
  const toWin = setIndex === 3 ? 15 : 21
  const ending = (team1 >= toWin && team1 - team2 >= 2) || (team2 >= toWin && team2 - team1 >= 2)
  if (ending || total === 0 || total % courtChangeInterval(setIndex) !== 0) return null
  const setEvents = inSet(events, setIndex)
  if (setEvents.some(e => e.type === 'court_switch' && switchTotal(e) === total)) return null
  if (hasTto(setIndex) && total === TTO_TOTAL) {
    const tto = setEvents.some(e => e.type === 'technical_to')
    if (tto && !pendingTto(events, setIndex, match)) return null
  }
  return 'point'
}
