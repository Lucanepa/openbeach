/**
 * The PINs of a match: the game PIN, the referee PIN, the team bench and
 * upload PINs. Every one comes from here: from crypto.getRandomValues, each
 * digit unbiased, never from Math.random.
 *
 * Math.random was used before (OpenVolley audit round 3, SEC-29): all PINs of
 * a match came from one Math.random sequence, so a referee who knows their own
 * PIN could narrow the generator's state and guess the game PIN (the scorer's
 * take-over). OpenVolley makes its PINs the same way (generateSecurePin).
 *
 * A byte becomes a digit only when it is below 250 (25 x 10): the six values
 * 250..255 are drawn again, so every digit is 0..9 with the same chance (a
 * plain `byte % 10` makes 0..5 more likely). There is no Math.random
 * fallback: every platform OpenBeach runs on (browsers, the Android and iOS
 * WebViews, the desktop app, Node 19+ for the tests) has Web Crypto, and a
 * match with a guessable PIN is worse than an error.
 */

export const PIN_LENGTH = 6
// The largest multiple of 10 a byte can hold: 0..249 map evenly to 0..9
const BYTE_LIMIT = 250
// Tries for a PIN not in `exclude` (1 in a million is a repeat of one other PIN)
const MAX_TRIES = 100

function randomSource(cryptoImpl) {
  if (cryptoImpl && typeof cryptoImpl.getRandomValues === 'function') return cryptoImpl
  throw new Error('No secure random source (crypto.getRandomValues) for a PIN')
}

/**
 * `length` random digits, each 0..9 with the same chance.
 * @param {number} [length]
 * @param {{ getRandomValues: (a: Uint8Array) => Uint8Array }} [cryptoImpl]
 * @returns {string}
 */
export function randomDigits(length = PIN_LENGTH, cryptoImpl = globalThis.crypto) {
  const source = randomSource(cryptoImpl)
  let out = ''
  // A batch with room for the bytes drawn again (about 2 % of them)
  const bytes = new Uint8Array(Math.max(8, length * 2))
  while (out.length < length) {
    source.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= BYTE_LIMIT) continue
      out += String(b % 10)
      if (out.length === length) break
    }
  }
  return out
}

/**
 * A new PIN of a match (6 digits by default), different from the PINs in
 * `exclude` when it can be (the match's other PINs, so no two roles share
 * one).
 * @param {{ exclude?: Array<string|number|null|undefined>, length?: number, cryptoImpl?: object }} [options]
 * @returns {string}
 */
export function securePin({ exclude = [], length = PIN_LENGTH, cryptoImpl = globalThis.crypto } = {}) {
  const taken = new Set((Array.isArray(exclude) ? exclude : [])
    .filter((p) => p !== undefined && p !== null)
    .map((p) => String(p).trim()))
  let pin = randomDigits(length, cryptoImpl)
  for (let i = 1; i < MAX_TRIES && taken.has(pin); i++) pin = randomDigits(length, cryptoImpl)
  return pin
}
