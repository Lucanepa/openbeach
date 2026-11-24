/**
 * The value beside a person's name on a beach sheet: a licence number (the
 * default) or a date of birth. It stays in the person's `dob` field, as in
 * OpenVolley's Swiss sheet, so a match, a backup and an import need no
 * second column. Which one it is shows in the value itself:
 *   - a date has a separator: 14.03.2008, 14/03/2008, 14-03-2008 (a 2 or 4
 *     digit year) or ISO 2008-03-14. Every date is kept as dd.mm.yyyy.
 *   - anything else is a licence: its digits only, at most 10.
 *   - 01.01.1900 is an empty placeholder (older matches started the
 *     referees there): it counts as no value.
 * The same rule as OpenVolley's Swiss sheet (src/domain/idMode.js).
 * Pure: no React, no database.
 */

const DATE_SHAPE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/
const ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})/
export const PLACEHOLDER_DATE = '01.01.1900'
export const LICENCE_MAX_DIGITS = 10
/** An account's licence number (sign-up, profile): 4 to 7 digits. */
export const ACCOUNT_LICENCE = /^[0-9]{4,7}$/

/**
 * Show the value column (players, officials) in Match Setup, the coin toss,
 * the roster editor, manual adjustments and the scoreboard's roster. The
 * device setting kept its first name ("manage date of birth"), so a scorer
 * who had it on keeps the column.
 */
export const LICENCE_OPTION_KEY = 'manageDob'

/**
 * Is the licence column on? On by default (owner 20.11.2026; it was off as
 * the old date-of-birth column). Only the Options switch ever writes the
 * key, so a stored 'false' is a scorer who turned it off and stays off; a
 * device that never touched the switch (no key) gets the column.
 */
export function readManageLicence() {
  try {
    return localStorage.getItem(LICENCE_OPTION_KEY) !== 'false'
  } catch {
    return true
  }
}

const text = (v) => (v == null ? '' : String(v).trim())

/** Is the value a date (has a separator, or is ISO)? */
export function isDateValue(v) {
  const s = text(v)
  return DATE_SHAPE.test(s) || ISO_SHAPE.test(s)
}

function fullYear(y) {
  if (y.length !== 2) return y
  const n = Number(y)
  const now = new Date().getFullYear() % 100
  return String(n <= now ? 2000 + n : 1900 + n)
}

/** A date value as dd.mm.yyyy; '' when the value is not a date. */
export function normalizeDateValue(v) {
  const s = text(v)
  const iso = ISO_SHAPE.exec(s)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const d = DATE_SHAPE.exec(s)
  if (!d) return ''
  return `${d[1].padStart(2, '0')}.${d[2].padStart(2, '0')}.${fullYear(d[3])}`
}

/** Is the value the empty placeholder 01.01.1900 (in any date form)? */
export function isPlaceholderValue(v) {
  return isDateValue(v) && normalizeDateValue(v) === PLACEHOLDER_DATE
}

/** The licence in a value: its digits (at most 10); '' for a date or no digits. */
export function licenceOf(v) {
  if (isDateValue(v)) return ''
  return text(v).replace(/\D/g, '').slice(0, LICENCE_MAX_DIGITS)
}

/**
 * The value as it is kept: a date as dd.mm.yyyy, a licence as its digits,
 * the placeholder and anything without digits as ''.
 */
export function cleanIdValue(v) {
  if (isDateValue(v)) {
    const d = normalizeDateValue(v)
    return d === PLACEHOLDER_DATE ? '' : d
  }
  return licenceOf(v)
}

/**
 * What the sheet and the screens print: a date as dd.mm.yyyy (the
 * placeholder as nothing), anything else verbatim.
 */
export function displayIdValue(v) {
  if (isDateValue(v)) {
    const d = normalizeDateValue(v)
    return d === PLACEHOLDER_DATE ? '' : d
  }
  return text(v)
}

/** What a typed character may be: digits and the date separators, 10 at most. */
export function typedIdValue(raw) {
  return String(raw ?? '').replace(/[^0-9./-]/g, '').slice(0, 10)
}

/** Is the value a date of 1 January (often an import error)? */
export function isJanuaryFirstDate(v) {
  if (!isDateValue(v)) return false
  const d = normalizeDateValue(v)
  return d.startsWith('01.01.') && d !== PLACEHOLDER_DATE
}

/**
 * The value without a date: a licence stays exactly as it is, a date (and
 * the placeholder) becomes ''. The device clean-up and every import use it.
 */
export function withoutDate(v) {
  if (v == null) return v
  return isDateValue(v) ? '' : v
}

/**
 * A value for the cloud copy of a match: a licence verbatim, a date as
 * YYYY-MM-DD (what the backend and older readers expect), null when empty.
 */
export function idValueForSync(v) {
  const clean = cleanIdValue(v)
  if (!clean) return null
  if (!isDateValue(clean)) return clean
  const [dd, mm, yyyy] = clean.split('.')
  return `${yyyy}-${mm}-${dd}`
}
