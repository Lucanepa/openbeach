import { roundToMinute } from './timeUtils_beach'

/**
 * Default time offered by the "Set N start time" dialog (ported from
 * OpenVolley utils/setStartTime.js). The dialog opens when the set's first
 * rally starts, so the set starts now (to the minute, rounded down so it is
 * never after the set's own rallies).
 *
 * The match's scheduled date and time is not the start of set 1: a match
 * scored on another day than scheduled got a set 1 of 827890 minutes. And
 * "previous set end + 1 min" put a set's start before its first rally, or
 * after it when the interval was ended early. The default is never before the
 * end of a set already played (a device clock behind the stored end time).
 *
 * @param {{ setIndex: number, sets?: Array<{index: number, endTime?: string}>, now?: Date }} args
 * @returns {string} ISO timestamp with zeroed seconds
 */
export function defaultSetStartTime({ setIndex, sets = [], now = new Date() }) {
  let start = now.getTime()
  for (const s of sets) {
    if (!s || !(s.index < setIndex) || !s.endTime) continue
    const end = new Date(s.endTime).getTime()
    if (Number.isFinite(end) && end > start) start = end
  }
  return roundToMinute(new Date(start).toISOString())
}
