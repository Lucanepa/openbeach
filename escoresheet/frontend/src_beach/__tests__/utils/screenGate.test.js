import { describe, it, expect } from 'vitest'
import { smallScreenGate } from '../../utils_beach/screenGate_beach'

// The gate's "Enter fullscreen" let a phone through to the scoring screen,
// where at 844×390 the score was hidden and Undo clipped. Fullscreen still
// lets the other screens through, never the scoring one below 800×600.

describe('small-screen gate', () => {
  it('lets tablets and laptops through, in either orientation', () => {
    expect(smallScreenGate({ width: 1280, height: 800 }, { scoring: true })).toBe(false)
    expect(smallScreenGate({ width: 800, height: 1280 }, { scoring: true })).toBe(false)
    expect(smallScreenGate({ width: 1024, height: 600 }, { scoring: true })).toBe(false)
  })

  it('stops a phone, and fullscreen lets it through except on the scoring screen', () => {
    const phoneLandscape = { width: 844, height: 390 }
    expect(smallScreenGate(phoneLandscape)).toBe(true)
    expect(smallScreenGate(phoneLandscape, { isFullscreen: true })).toBe(false)
    expect(smallScreenGate(phoneLandscape, { isFullscreen: true, scoring: true })).toBe(true)
    expect(smallScreenGate({ width: 390, height: 844 }, { isFullscreen: true, scoring: true })).toBe(true)
  })
})
