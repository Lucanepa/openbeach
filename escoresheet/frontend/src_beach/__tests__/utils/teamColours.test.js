import { describe, it, expect } from 'vitest'
import {
  parseColour, normaliseColour, relativeLuminance, contrastRatio,
  readableTextOn, readableText, discRing, discPaint,
  SAND_SURFACE, TEXT_DARK, TEXT_LIGHT, TEXT_BLACK, MIN_TEXT_CONTRAST, MIN_EDGE_CONTRAST, MIN_LARGE_TEXT_CONTRAST
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

  it('takes the higher WCAG ratio on mid tones too, with no lean towards white', () => {
    // white on these is 3.4-4.0:1, too little for the 9-11px chips; dark reads better
    for (const bg of ['#8a8a8a', '#ef4444', '#3b82f6', '#16a34a', '#ec4899']) {
      expect(contrastRatio(bg, TEXT_DARK), bg).toBeGreaterThan(contrastRatio(bg, TEXT_LIGHT))
      expect(readableTextOn(bg), bg).toBe(TEXT_DARK)
    }
    for (const bg of ['#dc2626', '#e2001a', '#065f46', '#1e3a8a', '#7b1e2b']) expect(readableTextOn(bg), bg).toBe(TEXT_LIGHT)
  })

  it('deepens near-black to pure black on the mid tones where neither reaches 4.5:1', () => {
    for (const bg of ['#808080', '#a855f7']) {
      expect(Math.max(contrastRatio(bg, TEXT_DARK), contrastRatio(bg, TEXT_LIGHT)), bg).toBeLessThan(MIN_TEXT_CONTRAST)
      expect(readableTextOn(bg), bg).toBe(TEXT_BLACK)
      expect(contrastRatio(bg, TEXT_BLACK), bg).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    }
  })

  it('every #rrggbb (step 17) gets at least 4.5:1, on the discs and on the bands', async () => {
    const { isLightColour } = await import('../../utils_beach/teamColours_beach')
    const steps = Array.from({ length: 16 }, (_, i) => i * 17)
    let min = Infinity
    for (const r of steps) for (const g of steps) for (const b of steps) {
      const bg = normaliseColour({ r, g, b })
      const ink = readableTextOn(bg)
      const c = contrastRatio(bg, ink)
      min = Math.min(min, c)
      expect(c, bg).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      if (ink !== TEXT_BLACK) expect(c, bg).toBeCloseTo(Math.max(contrastRatio(bg, TEXT_DARK), contrastRatio(bg, TEXT_LIGHT)), 9)
      // the '#000' / '#fff' the bands write
      expect(contrastRatio(bg, isLightColour(bg) ? '#000000' : '#ffffff'), bg).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      expect(readableText(bg).textShadow, bg).toBeUndefined()
    }
    expect(min).toBeLessThan(4.6) // the true minimum sits right at 4.5:1
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
    const red = discPaint('#dc2626')
    expect(red.background).toBe('#dc2626')
    expect(red.color).toBe(TEXT_LIGHT)
    expect(red.textShadow).toBeUndefined()
    expect(discPaint('#000080')).toMatchObject({ color: TEXT_LIGHT, ring: null })
  })
})

describe('custom team colours (any hex, not only the twelve presets)', () => {
  const ANY = (() => {
    const out = []
    const steps = [0, 32, 64, 96, 128, 160, 192, 224, 255]
    for (const r of steps) for (const g of steps) for (const b of steps) out.push(normaliseColour({ r, g, b }))
    let seed = 7
    for (let i = 0; i < 400; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      out.push('#' + (seed % 0x1000000).toString(16).padStart(6, '0'))
    }
    return out
  })()

  it('parseHexColour takes #rrggbb, rrggbb, #rgb and rgb in any case, nothing else', async () => {
    const { parseHexColour } = await import('../../utils_beach/teamColours_beach')
    expect(parseHexColour('#1A7F5A')).toBe('#1a7f5a')
    expect(parseHexColour('1a7f5a')).toBe('#1a7f5a')
    expect(parseHexColour('#0aF')).toBe('#00aaff')
    expect(parseHexColour(' fff ')).toBe('#ffffff')
    for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', 'blue', 'rgb(1,2,3)', '#ggg', null, undefined, 123]) {
      expect(parseHexColour(bad), String(bad)).toBeNull()
    }
  })

  it('presetColour / isCustomColour tell the twelve presets from any other colour', async () => {
    const { presetColour, isCustomColour, TEAM_COLOUR_PRESETS } = await import('../../utils_beach/teamColours_beach')
    expect(TEAM_COLOUR_PRESETS).toHaveLength(12)
    for (const p of TEAM_COLOUR_PRESETS) {
      expect(presetColour(p.toLowerCase())).toBe(p)
      expect(isCustomColour(p)).toBe(false)
    }
    expect(presetColour('#fff')).toBe('#FFFFFF')
    expect(isCustomColour('#ef4444')).toBe(true) // the default team 1 red is no preset
    expect(isCustomColour('#7b1e2b')).toBe(true)
    expect(isCustomColour('')).toBe(false)
    expect(isCustomColour('image.png')).toBe(false)
  })

  it('coloursTooClose flags near shades and the same colour, never two different presets', async () => {
    const { coloursTooClose, colourDistance, TEAM_COLOUR_PRESETS, CLOSE_COLOUR_DISTANCE } = await import('../../utils_beach/teamColours_beach')
    expect(colourDistance('#000000', '#ffffff')).toBeCloseTo(100, 0)
    expect(coloursTooClose('#dc2626', '#dc2626')).toBe(true)
    expect(coloursTooClose('#dc2626', '#ef4444')).toBe(true)
    expect(coloursTooClose('#1e3a8a', '#1e3a5f')).toBe(true)
    expect(coloursTooClose('#ffffff', '#f8fafc')).toBe(true)
    expect(coloursTooClose('#dc2626', '#3b82f6')).toBe(false)
    expect(coloursTooClose('#22c55e', '#16a34a')).toBe(true) // two greens
    expect(coloursTooClose('#ef4444', '#f97316')).toBe(false) // red next to the orange preset
    expect(coloursTooClose('#ef4444', '#ec4899')).toBe(false) // and the pink one
    for (const a of TEAM_COLOUR_PRESETS) {
      for (const b of TEAM_COLOUR_PRESETS) {
        if (a !== b) expect(coloursTooClose(a, b), `${a} ${b}`).toBe(false)
      }
    }
    expect(coloursTooClose('#dc2626', null)).toBe(false)
    expect(coloursTooClose('image.png', '#dc2626')).toBe(false)
    expect(colourDistance('#dc2626', '#ef4444')).toBeLessThan(CLOSE_COLOUR_DISTANCE)
  })

  it('readableTextOn / isLightColour pick dark or light text for any colour', async () => {
    const { isLightColour } = await import('../../utils_beach/teamColours_beach')
    for (const c of ANY) {
      const ink = readableTextOn(c)
      expect(contrastRatio(c, ink), c).toBeGreaterThanOrEqual(MIN_LARGE_TEXT_CONTRAST)
      expect(isLightColour(c), c).toBe(ink !== TEXT_LIGHT)
      // the '#000' / '#fff' the bands write reads at least as well
      const written = isLightColour(c) ? '#000000' : '#ffffff'
      expect(contrastRatio(c, written), c).toBeGreaterThanOrEqual(MIN_LARGE_TEXT_CONTRAST)
      const disc = discPaint(c)
      expect(contrastRatio(disc.background, disc.color), c).toBeGreaterThanOrEqual(MIN_LARGE_TEXT_CONTRAST)
    }
    expect(isLightColour('#fef9c3')).toBe(true)
    expect(isLightColour('#0b1d3a')).toBe(false)
    expect(isLightColour('#ff0')).toBe(true) // #rgb read as #rrggbb (the old helpers misread it)
    expect(isLightColour(null)).toBe(false)
    expect(isLightColour('image.png')).toBe(false)
  })
})
