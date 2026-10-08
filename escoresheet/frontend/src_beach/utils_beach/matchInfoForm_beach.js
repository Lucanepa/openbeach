// The match info form's date and time. The form keeps the date as
// 'DD.MM.YYYY' text and the time as 'HH:MM' (what the match stores); the kit's
// DateField / TimeField work in ISO and accept "12.3.2025", "12032025" or an
// ISO date as typed (the old field turned "12.3.2025" into "Invalid format").

import { isoToDateText, parseDateText, todayIso, nowTime } from '../ui/volleyui/dateTime.js'
import { dayKey } from '../ui/volleyui/format.js'

/** 'DD.MM.YYYY' (or 'D.M.YYYY') -> 'YYYY-MM-DD', '' when not a full date. */
export function dateTextToIso(text) {
  return parseDateText(text).iso || ''
}

/** 'YYYY-MM-DD' -> 'DD.MM.YYYY', '' for ''. */
export function isoToFormDate(iso) {
  return iso ? isoToDateText(iso) : ''
}

/** Is the form's date before today (a typo such as last year's date)? */
export function isPastMatchDate(dateText, today = todayIso()) {
  const iso = dateTextToIso(dateText)
  return !!iso && iso < today
}

/**
 * The date and time a new match starts with: today and now (Zürich clock,
 * rounded down to 5 minutes), the usual case of a match scored as it starts.
 */
export function defaultMatchDateTime(now = new Date()) {
  return { date: isoToFormDate(dayKey(now)), time: nowTime(5, now) }
}
