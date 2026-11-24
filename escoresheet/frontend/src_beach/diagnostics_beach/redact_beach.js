/**
 * What a diagnostics line may carry. The same rules as OpenVolley's
 * diagnostics (its activity log's domain/activitySummary and click log's
 * utils/screenText; OpenBeach has neither module, so they live here):
 *   - no key named pin / password / token / secret / signature / image /
 *     data URL / dob / birth / email / phone / licence, at any depth
 *   - no PIN or long number in text: runs of 6+ digits (grouped too,
 *     "771 234"), and 4 to 8 digits next to "pin", "code", "password",
 *     "Passwort" or "mot de passe"
 *   - no data URL or JWT, URLs without their query or fragment (tablet links
 *     carry ?pin=), strings <= 120 characters, depth <= 4, arrays <= 20.
 * No lookbehind (older Safari / WebKit cannot parse it). Never throws.
 */
export const DENIED_KEY = /pin|password|passwd|token|secret|signature|image|dataurl|dob|birth|email|phone|licen[cs]e/i
export const DIAG_STRING_MAX = 120
const REDACTED = '[redacted]'
const MAX_DEPTH = 4
const MAX_ARRAY = 20
const DATA_URL = /^data:/i
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/
const URL_LIKE = /^(?:https?|wss?|file|blob|tauri|capacitor):\/\//i
// a bare query string or path with one (?pin=, ?token=)
const QUERY = /[?#].*$/
const PIN_WORD = '(?:pin|code|passwor[dt]|mot\\s+de\\s+passe)'
const NEAR = '[\\s:=#\'"-]{0,3}'
const PIN_THEN_DIGITS = new RegExp(`(${PIN_WORD}s?${NEAR})\\d{4,8}(?!\\d)`, 'gi')
const DIGITS_THEN_PIN = new RegExp(`(^|\\D)\\d{4,8}(${NEAR}${PIN_WORD})`, 'gi')
const LONG_DIGITS = /\d{6,}/g
// A PIN on screen (Show PINs, the connect dialog) is six digits, possibly
// grouped ("771 234")
const DIGIT_RUN = /\d(?:[\s -]?\d){5,}/g

/** Free text without PINs or long numbers (an error message, a title). */
export function redactFreeText(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(PIN_THEN_DIGITS, `$1${REDACTED}`)
    .replace(DIGITS_THEN_PIN, `$1${REDACTED}$2`)
    .replace(LONG_DIGITS, REDACTED)
    .replace(DIGIT_RUN, '[digits]')
}

/** A string as a diagnostics line may hold it. */
export function redactDiagText(text) {
  if (typeof text !== 'string') return text
  let s = text.trim()
  if (DATA_URL.test(s) || JWT.test(s)) return REDACTED
  if (URL_LIKE.test(s) || (s.startsWith('/') && s.includes('?'))) s = s.replace(QUERY, '')
  s = redactFreeText(s)
  return s.length > DIAG_STRING_MAX ? s.slice(0, DIAG_STRING_MAX) : s
}

/** A deep copy of `value` without secrets (see the module comment). */
export function sanitizeDiagData(value, depth = 0) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return redactDiagText(value)
  if (typeof value === 'bigint') return Number(value)
  if (typeof value !== 'object' || depth >= MAX_DEPTH) return undefined
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map(v => sanitizeDiagData(v, depth + 1)).filter(v => v !== undefined)
  }
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (DENIED_KEY.test(k)) continue
    const c = sanitizeDiagData(v, depth + 1)
    if (c !== undefined) out[k] = c
  }
  return out
}
