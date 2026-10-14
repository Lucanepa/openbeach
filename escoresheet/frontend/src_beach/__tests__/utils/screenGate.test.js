import { describe, it, expect } from 'vitest'
import { smallScreenGate, turningSidewaysHelps } from '../../utils_beach/screenGate_beach'

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

describe('turn-sideways hint', () => {
  it('an open foldable held upright fits sideways', () => {
    expect(turningSidewaysHelps({ width: 691, height: 756 }, { width: 701, height: 841 }, 5)).toBe(true)
  })

  it('not when turning does not help or is not possible', () => {
    // already sideways
    expect(turningSidewaysHelps({ width: 756, height: 691 }, { width: 841, height: 701 }, 5)).toBe(false)
    // a screen under 800×600 either way
    expect(turningSidewaysHelps({ width: 600, height: 740 }, { width: 600, height: 780 }, 5)).toBe(false)
    // a tall browser window on a computer (no touch)
    expect(turningSidewaysHelps({ width: 700, height: 760 }, { width: 1920, height: 1080 }, 0)).toBe(false)
  })
})
