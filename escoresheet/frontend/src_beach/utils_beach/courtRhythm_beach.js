/**
 * The rhythm of a beach set: when the teams change courts and when the
 * technical time-out comes (FIVB beach rules 18.1, 19.4). One place for the
 * scoring screen (afterPointScored opens the dialogs) and the phone layout
 * (its "Switch in 3" / "TTO at 21" line).
 *
 * - sets 1 and 2: the teams change courts every 7 points (total), and at a
 *   total of 21 the technical time-out (with the change of courts after it);
 * - set 3: every 5 points, no technical time-out.
 */

/** The total of points at which sets 1 and 2 have their technical time-out. */
export const TTO_TOTAL = 21

/** Every how many points (total) the teams change courts in this set. */
export const courtChangeEvery = (setIndex) => (setIndex === 3 ? 5 : 7)

/** True when the set has a technical time-out (sets 1 and 2). */
export const hasTechnicalTimeout = (setIndex) => setIndex >= 1 && setIndex <= 2

/**
 * What comes next in the set, for display: how many points until the next
 * change of courts, and until the technical time-out (null: none in this set,
 * or reached already).
 * @param {number} setIndex
 * @param {number} total both teams' points
 * @returns {{ switchIn: number, ttoIn: number|null }}
 */
export function nextCourtEvents(setIndex, total) {
  const every = courtChangeEvery(setIndex)
  const points = Math.max(0, Number(total) || 0)
  return {
    switchIn: every - (points % every),
    ttoIn: hasTechnicalTimeout(setIndex) && points < TTO_TOTAL ? TTO_TOTAL - points : null
  }
}
