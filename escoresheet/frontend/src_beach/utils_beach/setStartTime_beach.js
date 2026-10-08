import { roundToMinute } from './timeUtils_beach'

/**
 * Default time offered by the "Set N start time" dialog (ported from
 * OpenVolley utils/setStartTime.js). The dialog opens when the set's first
 * rally starts.
 *
 * Set 1 (owner, 2026-10-08): the match's scheduled time of day, on the day
 * the set is actually played. Only the time of the schedule is used, never
 * its date: a match scored on another day than scheduled (12.03.2025 12:30)
 * got a set 1 of 827890 minutes. A different time confirmed by the scorer
 * goes to the remarks as "Actual start time: HH:MM"
 * (withActualStartTimeRemark). Without a scheduled time, set 1 starts now.
 *
 * Later sets start now (to the minute, rounded down so the start is never
 * after the set's own rallies): "previous set end + 1 min" put a set's start
 * before its first rally, or after it when the interval was ended early. The
 * default is never before the end of a set already played (a device clock
 * behind the stored end time).
 *
 * @param {{ setIndex: number, sets?: Array<{index: number, endTime?: string}>, now?: Date, scheduledAt?: string|null }} args
 * @returns {string} ISO timestamp with zeroed seconds
 */
export function defaultSetStartTime({ setIndex, sets = [], now = new Date(), scheduledAt = null }) {
  if (setIndex === 1) {
    const scheduled = scheduledStartOn(scheduledAt, now)
    if (scheduled) return scheduled
  }
  let start = now.getTime()
  for (const s of sets) {
    if (!s || !(s.index < setIndex) || !s.endTime) continue
    const end = new Date(s.endTime).getTime()
    if (Number.isFinite(end) && end > start) start = end
  }
  return roundToMinute(new Date(start).toISOString())
}

const pad = (n) => String(n).padStart(2, '0')

/** Local HH:MM of a timestamp, or null. */
export function localClock(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The scheduled time of day (local HH:MM) of a match, or null when it has
 * none: no schedule, or a date without a time (a bare "YYYY-MM-DD", or the
 * local midnight the match setup stores for a date entered without a time).
 */
export function scheduledClock(scheduledAt) {
  if (!scheduledAt) return null
  if (typeof scheduledAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(scheduledAt.trim())) return null
  const clock = localClock(scheduledAt)
  return clock && clock !== '00:00' ? clock : null
}

const HOUR = 3600 * 1000

/**
 * The scheduled time of day on the local date of `now` (ISO), or null. When
 * today's occurrence is more than 12 hours ahead (a 23:30 match confirmed at
 * 00:10) it is the day before, as in OpenVolley.
 */
export function scheduledStartOn(scheduledAt, now = new Date()) {
  const clock = scheduledClock(scheduledAt)
  if (!clock) return null
  const [h, m] = clock.split(':').map(Number)
  const d = new Date(now.getTime())
  d.setHours(h, m, 0, 0)
  if (d.getTime() - now.getTime() > 12 * HOUR) d.setDate(d.getDate() - 1)
  return d.toISOString()
}

/**
 * The remark written when set 1 starts at another time than scheduled. In
 * English whatever the app language, as every remark the app writes itself
 * (forfeit, MTO / RIT): the scoresheet is the official record.
 */
export const ACTUAL_START_TIME_LABEL = 'Actual start time'
const ACTUAL_START_LINE = /^\s*Actual start time:\s*\d{1,2}:\d{2}\s*$/

export function actualStartTimeRemark(clock) {
  return `${ACTUAL_START_TIME_LABEL}: ${clock}`
}

/** The "Actual start time: HH:MM" lines of a remarks text. */
export function actualStartTimeLines(remarks) {
  return String(remarks || '').split('\n').filter(l => ACTUAL_START_LINE.test(l))
}

/**
 * The "Actual start time: HH:MM" line set `setIndex` needs for the start
 * `startTime`, or null: set 1 only, when the match has a scheduled time and
 * the start's local HH:MM differs from it.
 */
export function actualStartTimeLine({ setIndex, startTime, scheduledAt } = {}) {
  if (setIndex !== 1) return null
  const scheduled = scheduledClock(scheduledAt)
  const actual = localClock(startTime)
  return scheduled && actual && actual !== scheduled ? actualStartTimeRemark(actual) : null
}

/**
 * The match remarks after set `setIndex` was given the start `startTime`.
 * Set 1 of a match with a scheduled time: any earlier "Actual start time"
 * line is removed, and one is appended when the start differs from the
 * scheduled time of day (so editing again replaces it, and going back to the
 * scheduled time removes it). Later sets, and a match without a scheduled
 * time, leave the remarks as they are.
 *
 * @param {string|null|undefined} remarks
 * @param {{ setIndex: number, startTime: string, scheduledAt?: string|null }} args
 * @returns {string}
 */
export function withActualStartTimeRemark(remarks, { setIndex, startTime, scheduledAt } = {}) {
  const current = String(remarks || '')
  if (setIndex !== 1 || !scheduledClock(scheduledAt)) return current
  const lines = current.split('\n')
  const kept = lines.filter(l => !ACTUAL_START_LINE.test(l))
  let out = kept.length === lines.length ? current : kept.join('\n').replace(/\s+$/, '')
  const line = actualStartTimeLine({ setIndex, startTime, scheduledAt })
  if (line) out = out.trim() ? `${out.replace(/\s+$/, '')}\n${line}` : line
  return out
}
