/**
 * The match number (Match No.): a whole number from 1 to 9999, as the
 * tournament's beach_tmatches.game_n and the integer columns matches.game_n
 * and match_live_state.game_n hold it.
 *
 * The field took any text ("e.g. M01"), and each path converted it its own
 * way: Number() for the local match and the match insert, parseInt() for the
 * match info update. "M01" printed "NaN" on the official sheet and synced
 * as null; "12.5" synced as 12 while the sheet said 12.5, and every
 * live-state push was refused (integer column), so the match never reached
 * the livescore; "3000000000" overflowed the column, the match insert failed
 * for good and every later job waited behind it (stress test 2026-10-25).
 * Every path now reads the number through gameNumberValue.
 */

export const GAME_NUMBER_MAX = 9999

/**
 * The match number as stored: an integer from 1 to GAME_NUMBER_MAX, from the
 * typed text (digits only, surrounding spaces allowed) or a stored number;
 * null for anything else.
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function gameNumberValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= GAME_NUMBER_MAX ? value : null
  }
  const text = String(value ?? '').trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const n = Number(text)
  return n >= 1 && n <= GAME_NUMBER_MAX ? n : null
}

/** Is the typed Match No. one gameNumberValue takes (empty is not)? */
export function isValidGameNumber(text) {
  return gameNumberValue(text) !== null
}
