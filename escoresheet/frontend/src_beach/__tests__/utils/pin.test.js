import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomDigits, securePin, PIN_LENGTH } from '../../utils_beach/pin_beach'
import { generateGamePin, ensureGamePin } from '../../utils_beach/relayPublisher_beach'

// OpenVolley audit round 3, SEC-29: OpenBeach made every PIN of a match (game,
// referee, benches, uploads) with Math.random, one sequence per match; a
// referee who knows their own PIN could narrow it down to the game PIN.

afterEach(() => vi.restoreAllMocks())

// A crypto that hands out the given bytes in order (then 0s)
function fakeCrypto(bytes) {
  let i = 0
  return {
    getRandomValues: vi.fn((arr) => {
      for (let k = 0; k < arr.length; k++) arr[k] = i < bytes.length ? bytes[i++] : 0
      return arr
    })
  }
}

describe('pin_beach: the PINs of a match', () => {
  it('takes its digits from crypto.getRandomValues, never Math.random', () => {
    const random = vi.spyOn(Math, 'random')
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    for (let i = 0; i < 50; i++) expect(securePin()).toMatch(/^\d{6}$/)
    expect(generateGamePin()).toMatch(/^\d{6}$/)
    expect(ensureGamePin({}).gamePin).toMatch(/^\d{6}$/)
    expect(spy).toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
  })

  it('draws the bytes 250..255 again: every digit is equally likely', () => {
    // 249 -> 9, 250..255 skipped, 0 -> 0, 13 -> 3, 99 -> 9, 100 -> 0, 7 -> 7
    const c = fakeCrypto([249, 250, 251, 252, 253, 254, 255, 0, 13, 99, 100, 7])
    expect(randomDigits(6, c)).toBe('903907')
    // 0..249: 25 bytes per digit, so a full sweep gives each digit 25 times
    const all = Array.from({ length: 256 }, (_, b) => b)
    const counts = Array(10).fill(0)
    for (const d of randomDigits(250, fakeCrypto(all))) counts[Number(d)]++
    expect(counts).toEqual(Array(10).fill(25))
  })

  it('is about uniform over many PINs', () => {
    const counts = Array(10).fill(0)
    const n = 4000
    for (let i = 0; i < n; i++) for (const d of securePin()) counts[Number(d)]++
    const expected = (n * PIN_LENGTH) / 10
    // 24,000 digits: each count within 8 % of 2,400 (about 5 standard deviations)
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThan(expected * 0.08)
  })

  it('avoids the match\'s other PINs', () => {
    // the first draw repeats an excluded PIN, the second does not
    const c = fakeCrypto([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 5, 4, 3, 2, 1])
    expect(securePin({ exclude: ['123456', null, undefined, 987654], cryptoImpl: c })).toBe('000000')
  })

  it('refuses to make a PIN without a secure random source', () => {
    const random = vi.spyOn(Math, 'random')
    expect(() => securePin({ cryptoImpl: null })).toThrow(/secure random/)
    expect(() => generateGamePin({})).toThrow(/secure random/)
    expect(random).not.toHaveBeenCalled()
  })

  it('no PIN-making code in the app calls Math.random', () => {
    // the files that make a match's PINs (game, referee, benches, uploads)
    const files = [
      'App_beach.jsx',
      'components_beach/MatchSetup_beach.jsx',
      'utils_beach/relayPublisher_beach.js',
      'utils_beach/backupManager_beach.js',
      'utils_beach/pin_beach.js'
    ]
    for (const f of files) {
      const text = readFileSync(resolve(__dirname, '../..', f), 'utf8')
      // a PIN digit made of Math.random: chars.charAt(Math.floor(Math.random() * ...)),
      // Math.floor(random() * 10), Math.random() * 4294967296
      expect(text, f).not.toMatch(/Math\.random\(\)\s*\*\s*(chars\.length|10\b|4294967296)/)
      expect(text, f).not.toMatch(/pin\s*\+=\s*chars\.charAt\(Math\.floor\(Math\.random/)
    }
  })
})
