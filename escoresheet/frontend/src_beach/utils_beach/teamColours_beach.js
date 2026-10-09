// Team colours on the player discs (scoring court, referee tablet): both
// players of a team wear its shirt colour, and the shirt number is near-black
// or white, whichever has the higher contrast on the fill; a fill that would melt into
// the sand gets a ring of its own colour.
//
// Port of the openvolley repo's src/utils/teamColours.js without the libero
// picks (beach has no libero) and with the sand court as the surface.
// Pure functions, no DOM: WCAG 2.x relative luminance + contrast ratio for
// readability.

export const TEXT_DARK = '#1c1917' // stone-900
export const TEXT_LIGHT = '#ffffff'

// The sand court the discs stand on: the middle of its gradient
// (linear-gradient(90deg, #e6c288, #dcb67d), .court in styles_beach.css and
// the referee court)
export const SAND_SURFACE = '#e1bc82'

// Readable body text (WCAG AA). The shirt number is big and bold, so 3:1
// would pass as large text; we aim for 4.5:1 and outline below it.
export const MIN_TEXT_CONTRAST = 4.5
// WCAG large-text minimum: the shirt number is big and bold
export const MIN_LARGE_TEXT_CONTRAST = 3
// Non-text contrast (WCAG 1.4.11): the disc's edge against the court
export const MIN_EDGE_CONTRAST = 3

// CSS names a colour field may hold (the CSS basic set plus common shirt names)
const NAMED = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', grey: '#808080', gray: '#808080',
  silver: '#c0c0c0', navy: '#000080', maroon: '#800000', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff',
  fuchsia: '#ff00ff', magenta: '#ff00ff', olive: '#808000', gold: '#ffd700', brown: '#a52a2a',
  crimson: '#dc143c', violet: '#ee82ee', indigo: '#4b0082', turquoise: '#40e0d0', skyblue: '#87ceeb',
  royalblue: '#4169e1', darkblue: '#00008b', darkgreen: '#006400', darkred: '#8b0000', lightblue: '#add8e6',
  lightgrey: '#d3d3d3', lightgray: '#d3d3d3', darkgrey: '#a9a9a9', darkgray: '#a9a9a9', beige: '#f5f5dc',
  bordeaux: '#7b1e2b', burgundy: '#800020'
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)))

/**
 * Parse a colour: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space
 * syntax, % allowed) or a CSS name. Returns { r, g, b, a } (0-255, a 0-1) or
 * null for anything else (empty, 'transparent', var(), gradients...).
 */
export function parseColour(input) {
  if (input == null) return null
  if (typeof input === 'object' && 'r' in input) return { r: clamp255(input.r), g: clamp255(input.g), b: clamp255(input.b), a: input.a ?? 1 }
  const s = String(input).trim().toLowerCase()
  if (!s) return null
  if (NAMED[s]) return parseColour(NAMED[s])
  let m = s.match(/^#?([0-9a-f]{3,8})$/)
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    let h = m[1]
    if (h.length <= 4) h = [...h].map(c => c + c).join('')
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = s.match(/^rgba?\(\s*([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const ch = (p) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p))
    const [r, g, b] = parts.slice(0, 3).map(ch)
    if ([r, g, b].some(Number.isNaN)) return null
    const a = parts[3] == null ? 1 : (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: Number.isNaN(a) ? 1 : Math.max(0, Math.min(1, a)) }
  }
  return null
}

/** Opaque colour: a translucent one is laid over `under` (the sand by default). */
function solid(input, under = SAND_SURFACE) {
  const c = parseColour(input)
  if (!c) return null
  if (c.a >= 1) return c
  const u = solid(under, '#ffffff')
  return { r: clamp255(c.r * c.a + u.r * (1 - c.a)), g: clamp255(c.g * c.a + u.g * (1 - c.a)), b: clamp255(c.b * c.a + u.b * (1 - c.a)), a: 1 }
}

/** '#rrggbb' (lower case) or null */
export function normaliseColour(input) {
  const c = solid(input)
  return c ? '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('') : null
}

const toLinear = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white); null if unparseable */
export function relativeLuminance(input) {
  const c = solid(input)
  if (!c) return null
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b)
}

/** WCAG contrast ratio, 1 to 21; null if either colour is unparseable */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la == null || lb == null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Pure black: the dark ink on the few mid tones (grey #808080, purple
// #a855f7...) where neither near-black nor white reaches 4.5:1
export const TEXT_BLACK = '#000000'

/**
 * The text colour on a team colour `bg` (shirt numbers, A/B chips, team
 * bands, score boxes): near-black or white, whichever has the higher WCAG
 * contrast ratio. Most of the text written on a team colour is small (9-11px
 * chips), so the ratio decides, with no lean towards white: grey, light
 * blue, purple and pink take dark text (white on grey is ~3.9:1, dark ~4.4).
 * Between L ≈ 0.18 and 0.22 neither reaches 4.5:1 (near-black stops at ~4.2),
 * so there the dark ink deepens to pure black, which reaches 4.6:1 or more:
 * every colour gets at least 4.5:1.
 */
export function readableTextOn(bg) {
  const dark = contrastRatio(bg, TEXT_DARK)
  const light = contrastRatio(bg, TEXT_LIGHT)
  if (dark == null) return TEXT_DARK
  if (Math.max(dark, light) < MIN_TEXT_CONTRAST && contrastRatio(bg, TEXT_BLACK) > Math.max(dark, light)) return TEXT_BLACK
  return dark >= light ? TEXT_DARK : TEXT_LIGHT
}

/**
 * Text colour for `bg` (readableTextOn) plus, when it stays under 4.5:1
 * (mid-tone fills), a 1px outline in the other one.
 * @returns {{ color: string, textShadow?: string, contrast: number }}
 */
export function readableText(bg) {
  const color = readableTextOn(bg)
  const contrast = contrastRatio(bg, color) ?? 21
  if (contrast >= MIN_TEXT_CONTRAST) return { color, contrast }
  const o = color === TEXT_LIGHT ? 'rgba(28, 25, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)'
  return { color, contrast, textShadow: `-1px 0 ${o}, 1px 0 ${o}, 0 -1px ${o}, 0 1px ${o}` }
}

function mix(a, b, t) {
  const x = solid(a), y = solid(b)
  return normaliseColour({ r: clamp255(x.r + (y.r - x.r) * t), g: clamp255(x.g + (y.g - x.g) * t), b: clamp255(x.b + (y.b - x.b) * t), a: 1 })
}

/**
 * The disc's edge: null when the fill already stands out from the court
 * (≥ 3:1), otherwise a ring of the same colour, darkened on a light court
 * (lightened on a dark one) just enough to reach 3:1. On the sand that is
 * most shirts but navy, black, dark green or bordeaux: a white shirt gets a
 * grey ring, a yellow one an ochre ring, a red one a dark red ring.
 */
export function discRing(fill, surface = SAND_SURFACE) {
  const f = normaliseColour(fill)
  if (!f) return null
  if ((contrastRatio(f, surface) ?? 21) >= MIN_EDGE_CONTRAST) return null
  const towards = (relativeLuminance(surface) ?? 1) > 0.18 ? TEXT_DARK : TEXT_LIGHT
  for (let i = 2; i <= 20; i++) {
    const ring = mix(f, towards, i / 20)
    if (contrastRatio(ring, surface) >= MIN_EDGE_CONTRAST) return ring
  }
  return towards
}

/**
 * Everything a disc needs for one fill.
 * @returns {{ background: string, color: string, textShadow?: string, ring: string|null } | null} null for a colour that can't be read (callers keep their default look)
 */
export function discPaint(fill, surface = SAND_SURFACE) {
  const background = normaliseColour(fill)
  if (!background) return null
  const { color, textShadow } = readableText(background)
  return { background, color, textShadow, ring: discRing(background, surface) }
}

/**
 * Whether dark text has the higher contrast on `bg` (readableTextOn), for any
 * colour: the team bands, A/B chips and score boxes that paint a team colour
 * and write '#000' or '#fff' on it ('#000' reads at least as well as the
 * near-black ink). false for a missing or unreadable colour (those keep
 * white text, as before).
 */
export function isLightColour(bg) {
  return normaliseColour(bg) != null && readableTextOn(bg) !== TEXT_LIGHT
}

// The white cards and dialogs the team bands sit on
export const HEADER_SURFACE = '#ffffff'

/**
 * Inline style for a band, box or button filled with a team colour that
 * shows a team name or label (setup card, coin toss): the fill, the readable
 * text colour (readableTextOn) and, when the fill would melt into the white
 * card (white, cream, light yellow...: under 3:1 against it, the shirt
 * outline's rule), an inset ring of the same colour darkened to 3:1
 * (discRing). An inset box-shadow, so the band keeps its size. Port of
 * OpenVolley's teamBoxStyle.
 * @param {string|null} colour the team colour
 * @param {object} [opts]
 * @param {string} [opts.fallback] colour used when `colour` is missing or unusable
 * @param {string} [opts.surface] what the band sits on
 * @param {number} [opts.ringWidth] px
 * @returns {{ background?: string, color?: string, boxShadow?: string }} (an unreadable colour such as a CSS variable is passed through with white text)
 */
export function teamBoxStyle(colour, { fallback = null, surface = HEADER_SURFACE, ringWidth = 2 } = {}) {
  const background = normaliseColour(colour) ?? normaliseColour(fallback)
  if (!background) {
    const raw = typeof colour === 'string' && colour.trim() ? colour : (typeof fallback === 'string' && fallback.trim() ? fallback : null)
    return raw ? { background: raw, color: TEXT_LIGHT } : {}
  }
  const ring = discRing(background, surface)
  return ring
    ? { background, color: readableTextOn(background), boxShadow: `inset 0 0 0 ${ringWidth}px ${ring}` }
    : { background, color: readableTextOn(background) }
}

/** OKLab { L, a, b } (Björn Ottosson) */
export function toOklab(input) {
  const c = solid(input)
  if (!c) return null
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  }
}

/**
 * Perceptual distance (OKLab ΔE × 100): 0 identical, ~2 just noticeable,
 * 100 black vs white. null if either colour is unparseable.
 */
export function colourDistance(a, b) {
  const x = toOklab(a)
  const y = toOklab(b)
  if (!x || !y) return null
  return 100 * Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
}

// The team colour picker's twelve shirts (MatchSetup), grouped by colour
// family. Any other '#rrggbb' is a custom colour.
export const TEAM_COLOUR_PRESETS = [
  '#FFFFFF', // White
  '#000000', // Black
  '#808080', // Gray
  '#dc2626', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Light Green
  '#065f46', // Dark Green
  '#3b82f6', // Light Blue
  '#1e3a8a', // Dark Blue
  '#a855f7', // Purple
  '#ec4899' // Pink
]

// A new match's team colours, both presets so the picker opens on a shirt
// tile, not on Custom: team 1 the red shirt, team 2 the light blue one
export const DEFAULT_TEAM1_COLOUR = '#dc2626'
export const DEFAULT_TEAM2_COLOUR = '#3b82f6'
// The team 1 default before it was a preset: matches set up then still carry it
const LEGACY_DEFAULT_TEAM1_COLOUR = '#ef4444'

/**
 * Whether `colour` is still the side's untouched default (today's, or the
 * old team 1 red of a match set up before), so a saved team's colour may
 * replace it.
 * @param {'team1'|'team2'} side
 * @param {string|null} colour
 */
export function isDefaultTeamColour(side, colour) {
  const c = normaliseColour(colour)
  if (!c) return false
  return side === 'team1' ? c === DEFAULT_TEAM1_COLOUR || c === LEGACY_DEFAULT_TEAM1_COLOUR : c === DEFAULT_TEAM2_COLOUR
}

/**
 * The colour a team wears on the scorer's screen, and so on the referee and
 * livescore screens it feeds: the team's own colour (Manual Adjustments
 * edits only the team), else the match's copy, else the scoreboard's team 1
 * red / team 2 blue.
 * @param {'team1'|'team2'} teamKey
 * @param {object|null} team the team record
 * @param {object|null} match the match record (team1Color / team2Color)
 * @returns {string}
 */
export function effectiveTeamColour(teamKey, team, match) {
  return team?.color || match?.[teamKey === 'team1' ? 'team1Color' : 'team2Color'] || (teamKey === 'team1' ? '#ef4444' : '#3b82f6')
}

/** The preset the colour is (case and #rgb shorthand ignored), or null */
export function presetColour(colour) {
  const c = normaliseColour(colour)
  if (!c) return null
  return TEAM_COLOUR_PRESETS.find(p => normaliseColour(p) === c) ?? null
}

/** A readable colour that is none of the twelve presets */
export function isCustomColour(colour) {
  return normaliseColour(colour) != null && presetColour(colour) == null
}

/**
 * A hex code typed by hand: '#rrggbb', 'rrggbb', '#rgb' or 'rgb' (any case,
 * spaces around it ignored) as '#rrggbb' in lower case; null otherwise.
 */
export function parseHexColour(input) {
  if (typeof input !== 'string') return null
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return `#${h.toLowerCase()}`
}

// Two team colours closer than this (OKLab ΔE × 100) are hard to tell apart
// on the court: red #dc2626 next to #ef4444 is 6, navy next to the dark blue
// preset 6, two greens #22c55e / #16a34a 9.8. Red #ef4444 next to the orange
// preset (10.4) or the pink one (11.4) still reads as two shirts, and the
// closest two presets (red / pink, orange / yellow) are 14.5.
export const CLOSE_COLOUR_DISTANCE = 10

/**
 * Whether two team colours look alike (colourDistance under
 * CLOSE_COLOUR_DISTANCE); false when either is missing or unreadable.
 */
export function coloursTooClose(a, b) {
  const d = colourDistance(a, b)
  return d != null && d < CLOSE_COLOUR_DISTANCE
}
