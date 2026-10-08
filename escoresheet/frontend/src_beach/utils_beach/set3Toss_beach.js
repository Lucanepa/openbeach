/**
 * The set 3 coin toss and its undo.
 *
 * The toss (Scoreboard_beach handleSet3CoinToss) records the winner on the
 * match (`set3CoinTossWinner`) and a `set3_coin_toss_winner` event. Until set
 * 3 starts, the interval's buttons then choose the sides (`set3LeftTeam`, or
 * the set's `setLeftTeamOverrides`), the serve (`set3FirstServe`) and each
 * team's service order (`team1FirstServe` / `team2FirstServe`); they write
 * the match and log no event of their own, so they are undone with the toss.
 *
 * The undo used to restore the snapshot of the event before the toss: set
 * 2's set end. That snapshot is of set 2: it reopened set 2 and cleared the
 * sides and serve set 3 had been given at set 2's end; without a snapshot
 * (an older event) the winner stayed and the toss buttons never came back.
 * The toss now keeps the match's own values from before it (`payload.before`)
 * and its undo writes them back.
 */

/** The match fields the set 3 toss and the interval after it write. */
export const SET3_TOSS_FIELDS = [
  'set3CoinTossWinner',
  'set3LeftTeam',
  'set3FirstServe',
  'set3CourtSwitched',
  'setLeftTeamOverrides',
  'team1FirstServe',
  'team2FirstServe'
]

const copy = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value)

/**
 * The values of SET3_TOSS_FIELDS on the match right before the toss (null
 * for a field the match does not have), stored in the toss event's payload.
 */
export function set3TossBefore(match) {
  const before = {}
  for (const field of SET3_TOSS_FIELDS) before[field] = match?.[field] === undefined ? null : copy(match[field])
  return before
}

/**
 * The match update that undoes the set 3 toss `event`: the values from before
 * it. A toss recorded before `payload.before` existed only takes the winner
 * back (the toss is to be made again; the sides and the serve stay as they are).
 */
export function set3TossUndoUpdate(event) {
  const before = event?.payload?.before
  if (!before || typeof before !== 'object') return { set3CoinTossWinner: null }
  const update = {}
  for (const field of SET3_TOSS_FIELDS) {
    if (field in before) update[field] = copy(before[field])
  }
  update.set3CoinTossWinner = before.set3CoinTossWinner ?? null
  return update
}

/**
 * True when `snapshot` (the stateSnapshot of the event before the one undone)
 * is of another set than the undone event: the first event of a set (its
 * start, the set 3 toss) has the previous set's end before it. Restoring that
 * snapshot writes the previous set's score with `finished: false`, so it
 * reopened the set before, which an undo never does (only "Reopen set").
 */
export function snapshotOfOtherSet(snapshot, undoneEvent) {
  if (!snapshot || snapshot.currentSetIndex == null) return false
  const setIndex = undoneEvent?.setIndex ?? undoneEvent?.payload?.setIndex
  if (setIndex == null) return false
  return Number(snapshot.currentSetIndex) !== Number(setIndex)
}

/**
 * True when an undo of `undoneEvent` keeps the match as it is instead of
 * restoring `snapshot` (the stateSnapshot of the event before it): a snapshot
 * of another set (above), or a set start. A set start writes nothing the
 * snapshot holds (the score is 0:0, the sides and the serve are the ones the
 * set was started with), and the event before it can be older than the
 * interval's choices: the set 3 toss, whose snapshot has the sides and the
 * serve from before the winner switched them (those buttons log no event), so
 * undoing set 3's start put them back to the toss's.
 */
export function undoKeepsMatch(snapshot, undoneEvent) {
  return undoneEvent?.type === 'set_start' || snapshotOfOtherSet(snapshot, undoneEvent)
}
