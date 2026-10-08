// Team colours on the player discs (scoring court, referee tablet): both
// players of a team wear its shirt colour, and the shirt number is near-black
// or white, whichever reads better on the fill; a fill that would melt into
// the sand gets a ring of its own colour.
//
// Port of the openvolley repo's src/utils/teamColours.js without the libero
// picks (beach has no libero) and with the sand court as the surface.
// Pure functions, no DOM: WCAG 2.x relative luminance + contrast ratio for
// readability (APCA breaks the tie on mid-tone fills).

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

// APCA screen luminance (0.0.98G-4g constants, with its soft clamp near black)
function apcaY(input) {
  const c = solid(input)
  if (!c) return null
  const y = 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.0721750 * (c.b / 255) ** 2.4
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
}

/**
 * APCA lightness contrast Lc of `text` on `bg` (APCA 0.0.98G-4g): about 0
 * to 106 for dark text on a light fill, 0 to -108 for light text on a dark
 * one. It tracks how people see mid-tone fills (red, blue, green) better than
 * the WCAG 2 ratio, which favours black text there. null if unparseable.
 */
export function apcaContrast(text, bg) {
  const yt = apcaY(text)
  const yb = apcaY(bg)
  if (yt == null || yb == null) return null
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14
    return s < 0.1 ? 0 : (s - 0.027) * 100
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14
  return s > -0.1 ? 0 : (s + 0.027) * 100
}

/**
 * Near-black or white for the number on `bg`. When both reach the WCAG
 * large-text 3:1 (mid-tone shirts: red, blue, green, grey), the one people
 * read better (higher APCA |Lc|) wins, so a red or blue shirt keeps white
 * numbers; otherwise the one with the higher WCAG ratio.
 */
export function readableTextOn(bg) {
  const dark = contrastRatio(bg, TEXT_DARK)
  const light = contrastRatio(bg, TEXT_LIGHT)
  if (dark == null) return TEXT_DARK
  if (dark >= MIN_LARGE_TEXT_CONTRAST && light >= MIN_LARGE_TEXT_CONTRAST) {
    return Math.abs(apcaContrast(TEXT_LIGHT, bg)) > Math.abs(apcaContrast(TEXT_DARK, bg)) ? TEXT_LIGHT : TEXT_DARK
  }
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
