/**
 * The messages between the scoretable (Scoreboard_beach openScoresheet /
 * refreshScoresheet) and the PDF scoresheet window it opens
 * (scoresheet_beach.html: scoresheet_pdf_beach/index.tsx and
 * components_beach/eScoresheet_beach.tsx), after OpenVolley's
 * src/utils/scoresheetErrorMessage.js (audit SEC-43):
 *
 *   sheet -> scoretable  REQUEST_SCORESHEET_REFRESH (every 3 s), SCORESHEET_ERROR
 *   scoretable -> sheet  REFRESH_SCORESHEET { data } (the match, rosters, sets, events)
 *
 * Every message is posted to the app's own origin only, and taken only from
 * that origin and from the window it belongs to: the sheet takes data only
 * from the window that opened it, the scoretable answers and shows errors
 * only for the sheet window it opened. Before, any page could frame the
 * sheet and post invented teams and scores into it, show its own text in the
 * scoretable's error dialog, or ask for the whole match, PINs included, which
 * was posted to '*'. The refresh carries no PIN or session id: the sheet
 * shows none.
 */

import { redactMatch } from './nativeBackup/redact_beach'

export const SCORESHEET_ERROR = 'SCORESHEET_ERROR'
export const REFRESH_SCORESHEET = 'REFRESH_SCORESHEET'
export const REQUEST_SCORESHEET_REFRESH = 'REQUEST_SCORESHEET_REFRESH'

/** At most this many characters of the error text and of its details. */
export const MAX_ERROR_TEXT = 300
export const MAX_ERROR_DETAILS = 4000

/** A value as plain text of at most `max` characters ('' for none). */
export function clipText(value, max) {
  if (value === undefined || value === null) return ''
  let text
  try { text = typeof value === 'string' ? value : String(value) } catch { text = '' }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// A message of this page's origin, from `source` when one is known
function fromOwn(event, win, source) {
  if (!event || event.origin !== win.location.origin) return false
  if (source && event.source !== source) return false
  return true
}

/** The message the scoresheet page posts for `error` (an Error or a text). */
export function scoresheetErrorMessage(error, details) {
  const isError = error instanceof Error
  const stack = isError ? error.stack : undefined
  return {
    type: SCORESHEET_ERROR,
    error: clipText(isError ? error.message : error, MAX_ERROR_TEXT),
    details: clipText(details || stack || '', MAX_ERROR_DETAILS)
  }
}

/** Posts it to the window that opened the scoresheet, on this page's origin only. */
export function postScoresheetError(opener, error, details, win = window) {
  opener.postMessage(scoresheetErrorMessage(error, details), win.location.origin)
}

/**
 * The { error, details } of a scoresheet error message for the scoretable's
 * dialog, or null when `event` is not one from its own scoresheet: another
 * origin, or (when the scoretable knows the window it opened) another window.
 */
export function scoresheetErrorFromEvent(event, { win = window, source = null } = {}) {
  if (!fromOwn(event, win, source)) return null
  const data = event.data
  if (!data || typeof data !== 'object' || data.type !== SCORESHEET_ERROR) return null
  return {
    error: clipText(data.error, MAX_ERROR_TEXT) || 'Unknown error',
    details: clipText(data.details || data.stack, MAX_ERROR_DETAILS)
  }
}

/** The sheet asks the window that opened it for fresh data, on this page's origin only. */
export function requestScoresheetRefresh(opener, win = window) {
  opener.postMessage({ type: REQUEST_SCORESHEET_REFRESH }, win.location.origin)
}

/**
 * Whether `event` is the scoretable's own sheet window asking for fresh data:
 * this origin, from `source` (the window it opened). Without a window of its
 * own open, nothing is answered.
 */
export function isRefreshRequestFrom(event, source, { win = window } = {}) {
  if (!source) return false
  return fromOwn(event, win, source) && event.data?.type === REQUEST_SCORESHEET_REFRESH
}

/** The match row as the sheet window gets it: no PINs, no session ids. */
export function scoresheetMatch(match) {
  return redactMatch(match)
}

/**
 * Posts the fresh data to the sheet window, on this page's origin only, with
 * the match row's PINs and session ids left out.
 */
export function postScoresheetRefresh(target, data, win = window) {
  const payload = data && typeof data === 'object' ? { ...data, match: scoresheetMatch(data.match) } : data
  target.postMessage({ type: REFRESH_SCORESHEET, data: payload }, win.location.origin)
}

/**
 * The data of a REFRESH_SCORESHEET message for the sheet, or null when
 * `event` is not one from the window that opened it (`opener`: the popup's
 * opener, or the app under the Android in-app view): another origin, another
 * window, or no opener at all (the sheet opened by itself or framed by
 * another page takes no data from messages).
 */
export function refreshDataFromEvent(event, { win = window, opener = null } = {}) {
  if (!opener || !fromOwn(event, win, opener)) return null
  const data = event.data
  if (!data || typeof data !== 'object' || data.type !== REFRESH_SCORESHEET) return null
  const payload = data.data
  return payload && typeof payload === 'object' ? payload : null
}
