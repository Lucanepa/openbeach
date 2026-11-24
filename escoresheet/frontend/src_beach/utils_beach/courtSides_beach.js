/**
 * Court sides: which team (A or B) is on the scorer's left in a set.
 *
 * One rule for every place that needs it (the court, the interval preview,
 * "Switch sides", the court switches, the live state):
 * - `match.setLeftTeamOverrides[set]` is the side the set is played on now
 *   (written at the set's start or by a switch);
 * - without it, set 1 starts with A on the left; set 3 starts on the side
 *   chosen at its toss (`match.set3LeftTeam`); otherwise the teams stay where
 *   they finished the previous set: in the interval the courts change only if
 *   requested (FIVB beach rule 18.1.1).
 *
 * The values are 'A' / 'B' (A is the first coin toss's team A).
 */

const other = (ab) => (ab === 'A' ? 'B' : 'A')
const isAB = (v) => v === 'A' || v === 'B'

/** 'A' or 'B': the team on the left in set `setIndex` right now. */
export function leftTeamInSet(setIndex, match) {
  const index = Number(setIndex) || 1
  const overrides = match?.setLeftTeamOverrides || {}
  if (isAB(overrides[index])) return overrides[index]
  if (index <= 1) return 'A'
  if (index === 3 && isAB(match?.set3LeftTeam)) return match.set3LeftTeam
  return leftTeamInSet(index - 1, match)
}

/** true when team1 is on the left in set `setIndex`. */
export function isTeam1LeftInSet(setIndex, match) {
  const teamAKey = match?.coinTossTeamA || 'team1'
  return (leftTeamInSet(setIndex, match) === 'A') === (teamAKey === 'team1')
}

/**
 * The match fields to write to swap the sides of set `setIndex` (a court
 * switch, or "Switch sides" in the interval). Before set 3 starts its side is
 * the toss's `set3LeftTeam`, kept as the one source for the set's start side.
 */
export function switchSidesUpdate(setIndex, match, { beforeSetStart = false } = {}) {
  const index = Number(setIndex) || 1
  const overrides = match?.setLeftTeamOverrides || {}
  const next = other(leftTeamInSet(index, match))
  if (index === 3 && beforeSetStart && !isAB(overrides[3])) {
    return { set3LeftTeam: next }
  }
  return { setLeftTeamOverrides: { ...overrides, [index]: next } }
}

/**
 * The fields that fix the start side of set `nextIndex` when it is created at
 * the end of the previous set: the side the teams finished on.
 */
export function nextSetStartSides(nextIndex, match) {
  const left = leftTeamInSet(nextIndex - 1, match)
  if (nextIndex === 3) return { set3LeftTeam: left }
  return { setLeftTeamOverrides: { ...(match?.setLeftTeamOverrides || {}), [nextIndex]: left } }
}
