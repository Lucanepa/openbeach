import { describe, it, expect } from 'vitest'
import { gameNumberValue, isValidGameNumber } from '../../utils_beach/gameNumber_beach'

// The Match No. took any text, and each path converted it its own way:
// "M01" printed NaN on the sheet, "12.5" kept every live-state push out of
// the integer column, "3000000000" overflowed the match insert (stress test
// 2026-10-25). One reading for every path: an integer from 1 to 9999.
describe('the match number', () => {
  it('is a whole number from 1 to 9999', () => {
    expect(gameNumberValue('12')).toBe(12)
    expect(gameNumberValue(' 7 ')).toBe(7)
    expect(gameNumberValue('0012')).toBe(12)
    expect(gameNumberValue('9999')).toBe(9999)
    expect(gameNumberValue(715)).toBe(715)
  })

  it('anything else is no number at all, on every path', () => {
    for (const v of ['M01', '12.5', '3000000000', '10000', '0', '-3', '1e3', '12a', '', '  ', null, undefined, NaN, 12.5, 0, 3e9]) {
      expect(gameNumberValue(v)).toBeNull()
    }
    expect(isValidGameNumber('M01')).toBe(false)
    expect(isValidGameNumber('12')).toBe(true)
  })
})
