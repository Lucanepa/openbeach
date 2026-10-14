import { describe, it, expect } from 'vitest'
import { smallScreenGate } from '../../utils_beach/screenGate_beach'

// Only the scoring screen needs 800×600 (at 844×390 its score was hidden and
// Undo clipped; a phone gets its phone layout instead). Every other screen
// fits a phone and is never gated, fullscreen or not (emulator audit
// 2026-10-14: the gate had made the app unusable in a phone browser).

describe('small-screen gate', () => {
  it('lets tablets and laptops through, in either orientation', () => {
    expect(smallScreenGate({ width: 1280, height: 800 }, { scoring: true })).toBe(false)
    expect(smallScreenGate({ width: 800, height: 1280 }, { scoring: true })).toBe(false)
    expect(smallScreenGate({ width: 1024, height: 600 }, { scoring: true })).toBe(false)
  })

  it('on a phone it stops only the scoring screen', () => {
    for (const phone of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
      expect(smallScreenGate(phone)).toBe(false)
      expect(smallScreenGate(phone, { scoring: true })).toBe(true)
    }
  })
})
