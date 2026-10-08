import { describe, it, expect } from 'vitest'
import {
  parseColour, normaliseColour, relativeLuminance, contrastRatio, apcaContrast,
  readableTextOn, readableText, discRing, discPaint,
  SAND_SURFACE, TEXT_DARK, TEXT_LIGHT, MIN_TEXT_CONTRAST, MIN_EDGE_CONTRAST, MIN_LARGE_TEXT_CONTRAST
} from '../../utils_beach/teamColours_beach'

// Row 27 of the OpenBeach port (OpenVolley 57d0be0e, 822a3cb3, 92e87df4): the
// player discs wear the team colour with a readable number, and a disc that
// would melt into the sand gets a ring of its own colour. No libero on beach.

// Common beach shirts and the app's defaults (team 1 red, team 2 blue)
const SHIRTS = ['#ef4444', '#3b82f6', '#ffffff', '#1c1917', '#e2001a', '#facc15', '#f97316', '#16a34a', '#38bdf8', '#1d4ed8', '#7c3aed', '#ec4899', '#a8a29e', '#000080', '#808080', '#0ea5e9', '#22c55e', '#7b1e2b', '#ffd700', '#f5f5dc']

describe('parseColour / normaliseColour', () => {
  it('reads hex, rgb() and CSS names', () => {
    expect(normaliseColour('#E2001A')).toBe('#e2001a')
    expect(normaliseColour('#abc')).toBe('#aabbcc')
    expect(normaliseColour('e2001a')).toBe('#e2001a')
    expect(normaliseColour('rgb(226, 0, 26)')).toBe('#e2001a')
    expect(normaliseColour('rgb(226 0 26)')).toBe('#e2001a')
    expect(normaliseColour('rgba(100%, 0%, 0%, 1)')).toBe('#ff0000')
    expect(normaliseColour('Navy')).toBe('#000080')
    expect(parseColour('#ff000080').a).toBeCloseTo(0.5, 2)
  })

  it('lays a translucent colour over the sand', () => {
    expect(normaliseColour('rgba(255, 255, 255, 0)')).toBe(SAND_SURFACE)
  })

  it('returns null for anything that is not a colour', () => {
    for (const v of [null, undefined, '', '  ', 'transparent', 'var(--x)', 'image.png', '#12', 'linear-gradient(red, blue)', 'rgb(1,2)']) {
      expect(normaliseColour(v), String(v)).toBeNull()
    }
  })
})

describe('WCAG luminance and contrast', () => {
  it('matches the reference values', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6)
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(4.0, 2)
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2)
  })

  it('APCA contrast has the expected sign and size', () => {
    expect(apcaContrast('#000000', '#ffffff')).toBeCloseTo(106, 0)
    expect(apcaContrast('#ffffff', '#000000')).toBeCloseTo(-108, 0)
    expect(apcaContrast('#777777', '#777777')).toBe(0)
    expect(apcaContrast('nope', '#fff')).toBeNull()
  })
})

describe('the shirt number', () => {
  it('near-black on light shirts, white on dark ones', () => {
    expect(readableTextOn('#ffffff')).toBe(TEXT_DARK)
    expect(readableTextOn('#facc15')).toBe(TEXT_DARK)
    expect(readableTextOn('#38bdf8')).toBe(TEXT_DARK)
    expect(readableTextOn('#000080')).toBe(TEXT_LIGHT)
    expect(readableTextOn('#1c1917')).toBe(TEXT_LIGHT)
    expect(readableTextOn('#e2001a')).toBe(TEXT_LIGHT)
  })

  it('the default red and blue keep white numbers (APCA), with an outline under 4.5:1', () => {
    for (const bg of ['#ef4444', '#3b82f6', '#16a34a']) {
      expect(contrastRatio(bg, TEXT_DARK), bg).toBeGreaterThan(contrastRatio(bg, TEXT_LIGHT))
      expect(readableTextOn(bg), bg).toBe(TEXT_LIGHT)
      expect(readableText(bg).textShadow, bg).toMatch(/1px/)
    }
  })

  it('every common shirt reaches 3:1, and 4.5:1 or an outline', () => {
    expect(readableTextOn('#f97316')).toBe(TEXT_DARK) // orange: white is under 3:1
    for (const bg of SHIRTS) {
      const t = readableText(bg)
      expect(t.contrast, bg).toBeGreaterThanOrEqual(MIN_LARGE_TEXT_CONTRAST)
      if (t.contrast < MIN_TEXT_CONTRAST) expect(t.textShadow, bg).toMatch(/1px/)
      else expect(t.textShadow, bg).toBeUndefined()
    }
  })
})

describe('discRing on the sand', () => {
  it('leaves dark shirts that stand out from the sand alone', () => {
    for (const c of ['#1c1917', '#000080', '#7b1e2b']) expect(discRing(c), c).toBeNull()
  })

  it('gives every shirt under 3:1 against the sand a darker ring of its own colour', () => {
    for (const c of SHIRTS.filter(s => contrastRatio(s, SAND_SURFACE) < MIN_EDGE_CONTRAST)) {
      const ring = discRing(c)
      expect(ring, c).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrastRatio(ring, SAND_SURFACE), c).toBeGreaterThanOrEqual(MIN_EDGE_CONTRAST)
      expect(relativeLuminance(ring), c).toBeLessThan(relativeLuminance(c))
    }
    // white, yellow and a sand-coloured shirt are among them
    for (const c of ['#ffffff', '#facc15', '#dcb67d']) expect(discRing(c), c).not.toBeNull()
    // a yellow shirt's ring stays yellowish (ochre), not grey
    const ochre = parseColour(discRing('#facc15'))
    expect(ochre.r).toBeGreaterThan(ochre.b + 60)
  })

  it('returns null without a colour', () => {
    expect(discRing(null)).toBeNull()
    expect(discPaint('var(--team)')).toBeNull()
  })
})

describe('discPaint', () => {
  it('gives fill, number colour, outline and ring together', () => {
    expect(discPaint('#FFFFFF')).toEqual({ background: '#ffffff', color: TEXT_DARK, textShadow: undefined, ring: discRing('#ffffff') })
    const red = discPaint('#ef4444')
    expect(red.background).toBe('#ef4444')
    expect(red.color).toBe(TEXT_LIGHT)
    expect(red.textShadow).toMatch(/rgba\(28, 25, 23, 0.85\)/)
    expect(discPaint('#000080')).toMatchObject({ color: TEXT_LIGHT, ring: null })
  })
})
