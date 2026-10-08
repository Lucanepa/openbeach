/**
 * Sign on phone, the pure part of the app side. Ported from OpenVolley
 * src/domain/phoneSignature.js (d451686d; OpenVolley docs/qr-signing-spec.md
 * 5.5, 5.6) with OpenBeach's fields: team1 / team2 instead of home / away,
 * the coin toss's team A as 'team1' | 'team2', and the coin-toss pads of the
 * captains (and coaches when the match has them).
 *
 * The strokes a phone sends are checked with the relays' rules (the same as
 * the shared relays' validateStrokes, tested against their vectors) and drawn
 * into the same kind of transparent PNG as the local SignaturePad (black,
 * 4 px, round caps and joins). The phone never sends an image: a signature
 * from a phone and one drawn here end up as the same kind of value in the
 * same field, so the PDF is unchanged.
 */

export const PAD_W = 4000
const PAD_H_MIN = 1000
const PAD_H_MAX = 4000
const MAX_STROKES = 300
const MAX_STROKE_LEN = 2000
const MAX_POINTS = 4000
const MIN_INK = 0.06 * PAD_W

// The rendered image: a logical 600 x 200 surface at scale 2 (the local pad's
// size at a typical device pixel ratio), the pen of the local pad.
export const RENDER_W = 600
export const RENDER_H = 200
export const RENDER_SCALE = 2
export const PEN = Object.freeze({ strokeStyle: '#000000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' })
const MARGIN = 0.04 * PAD_W

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isIntIn = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi

/**
 * The relays' stroke rules: { ok: true } or { ok: false, code: 'OV_SIGN_INK_INVALID' }.
 * @param {any} pad { w: 4000, h: 1000..4000 }
 * @param {any} strokes [[x0, y0, x1, y1, ...], ...]
 */
export function validateStrokes(pad, strokes) {
  const bad = { ok: false, code: 'OV_SIGN_INK_INVALID' }
  if (!isPlainObject(pad) || !isIntIn(pad.w, PAD_W, PAD_W) || !isIntIn(pad.h, PAD_H_MIN, PAD_H_MAX)) return bad
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > MAX_STROKES) return bad
  let points = 0
  let ink = 0
  for (const s of strokes) {
    if (!Array.isArray(s) || s.length < 2 || s.length > MAX_STROKE_LEN || s.length % 2 !== 0) return bad
    points += s.length / 2
    if (points > MAX_POINTS) return bad
    for (let i = 0; i < s.length; i += 2) {
      if (!isIntIn(s[i], 0, pad.w) || !isIntIn(s[i + 1], 0, pad.h)) return bad
      if (i >= 2) ink += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1])
    }
  }
  return ink >= MIN_INK ? { ok: true } : bad
}

/**
 * Where the strokes land on the width x height surface: the bounding box of
 * every point, a margin of 4 % of the pad width on each side, scaled uniformly
 * to fit (contain) and centred.
 * @returns {{ scale: number, dx: number, dy: number }}
 */
export function fitTransform(pad, strokes, { width = RENDER_W, height = RENDER_H } = {}) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes || []) {
    for (let i = 0; i + 1 < s.length; i += 2) {
      if (s[i] < minX) minX = s[i]
      if (s[i] > maxX) maxX = s[i]
      if (s[i + 1] < minY) minY = s[i + 1]
      if (s[i + 1] > maxY) maxY = s[i + 1]
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = pad?.w || PAD_W; maxY = pad?.h || PAD_H_MIN
  }
  const boxX = minX - MARGIN
  const boxY = minY - MARGIN
  const boxW = maxX - minX + 2 * MARGIN
  const boxH = maxY - minY + 2 * MARGIN
  const scale = Math.min(width / boxW, height / boxH)
  return {
    scale,
    dx: (width - boxW * scale) / 2 - boxX * scale,
    dy: (height - boxH * scale) / 2 - boxY * scale
  }
}

/**
 * Draw the strokes on a 2D context sized width x height (logical units), the
 * way SignaturePad draws: moveTo / lineTo per stroke, then stroke(). A
 * one-point stroke is a dot (a filled circle of the pen's radius).
 */
export function drawStrokes(ctx, pad, strokes, { width = RENDER_W, height = RENDER_H } = {}) {
  const { scale, dx, dy } = fitTransform(pad, strokes, { width, height })
  ctx.strokeStyle = PEN.strokeStyle
  ctx.fillStyle = PEN.strokeStyle
  ctx.lineWidth = PEN.lineWidth
  ctx.lineCap = PEN.lineCap
  ctx.lineJoin = PEN.lineJoin
  for (const s of strokes) {
    const x0 = s[0] * scale + dx
    const y0 = s[1] * scale + dy
    ctx.beginPath()
    if (s.length === 2) {
      ctx.arc(x0, y0, PEN.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.moveTo(x0, y0)
    for (let i = 2; i + 1 < s.length; i += 2) ctx.lineTo(s[i] * scale + dx, s[i + 1] * scale + dy)
    ctx.stroke()
  }
}

const defaultCreateCanvas = () => document.createElement('canvas')

/**
 * The phone's strokes as the PNG data URL a local signature is: transparent,
 * 1200 x 400 device pixels (600 x 200 at scale 2).
 * @param {{ createCanvas?: () => HTMLCanvasElement }} [opts]
 */
export function phoneSignatureDataUrl(pad, strokes, { createCanvas = defaultCreateCanvas } = {}) {
  const canvas = createCanvas()
  canvas.width = RENDER_W * RENDER_SCALE
  canvas.height = RENDER_H * RENDER_SCALE
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(RENDER_SCALE, RENDER_SCALE)
  drawStrokes(ctx, pad, strokes)
  return canvas.toDataURL('image/png')
}

// --- What the phone page shows ----------------------------------------------

/**
 * Signature slots the relays know, by the role names OpenBeach's screens use.
 * The relays and the phone page speak of "home" and "away": team 1 is home.
 */
export const SLOT_OF_ROLE = Object.freeze({
  // MatchEnd
  'captain-a': 'captain-a',
  'captain-b': 'captain-b',
  'asst-scorer': 'asst-scorer',
  scorer: 'scorer',
  ref2: 'ref2',
  ref1: 'ref1',
  // CoinToss
  'team1-captain': 'captain-home',
  'team2-captain': 'captain-away',
  'team1-coach': 'coach-home',
  'team2-coach': 'coach-away'
})

const OFFICIAL_ROLES = {
  scorer: ['scorer'],
  'asst-scorer': ['assistant scorer', 'assistant_scorer'],
  ref1: ['1st referee', '1st_referee', 'referee 1', 'ref1'],
  ref2: ['2nd referee', '2nd_referee', 'referee 2', 'ref2']
}

const teamName = (team, fallback) => {
  const n = typeof team === 'string' ? team : team?.name
  return typeof n === 'string' && n.trim() ? n.trim() : fallback
}

const personName = (p) => {
  if (!p) return ''
  return [p.firstName ?? p.first_name, p.lastName ?? p.last_name].filter(Boolean).join(' ').trim() ||
    (typeof p.name === 'string' ? p.name.trim() : '')
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** "12.10.2026 20:15" from an ISO time, in the device's time zone; '' when none. */
export function displayWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** The coin toss's team A as the relays' side ('home' = team 1), or null before the toss. */
function tossSideA(match) {
  const a = match?.coinTossTeamA
  if (a === 'team1' || a === 'team_1') return 'home'
  if (a === 'team2' || a === 'team_2') return 'away'
  return null
}

/**
 * The context of a slot: the two team names (team 1 as "home"), which team
 * the signer belongs to and its coin-toss letter, the signer's name when
 * known, the match number and time. The relays sanitise and cap it again.
 * @param {{
 *   match: object, slot: string, team1?: object|string, team2?: object|string,
 *   team1Captain?: object|null, team2Captain?: object|null, team1Coach?: object|null, team2Coach?: object|null,
 *   lang?: string, fallbackTeam1?: string, fallbackTeam2?: string,
 * }} input
 */
export function phoneSignContext({ match, slot, team1, team2, team1Captain = null, team2Captain = null, team1Coach = null, team2Coach = null, lang, fallbackTeam1 = 'Team 1', fallbackTeam2 = 'Team 2' }) {
  const m = match || {}
  const ctx = {
    home: teamName(team1, teamName(m.team1Name, fallbackTeam1)),
    away: teamName(team2, teamName(m.team2Name, fallbackTeam2))
  }
  const matchNo = m.gameNumber ?? m.gameN ?? m.game_n
  if (matchNo !== undefined && matchNo !== null && String(matchNo).trim()) ctx.matchNo = String(matchNo).trim()
  const when = displayWhen(m.scheduledAt || m.scheduled_at)
  if (when) ctx.when = when

  const tossA = tossSideA(m)
  const letterOf = (side) => (tossA ? (side === tossA ? 'A' : 'B') : null)
  let side = null
  if (slot === 'captain-a' || slot === 'captain-b') {
    const wantA = slot === 'captain-a'
    side = tossA ? (wantA ? tossA : (tossA === 'home' ? 'away' : 'home')) : (wantA ? 'home' : 'away')
  } else if (/-home$/.test(slot)) side = 'home'
  else if (/-away$/.test(slot)) side = 'away'
  if (side) {
    ctx.teamSide = side
    const letter = letterOf(side)
    if (letter) ctx.teamLabel = letter
  }

  let name = ''
  if (/^captain/.test(slot) && side) {
    const c = side === 'home' ? team1Captain : team2Captain
    if (c) name = [c.number != null && c.number !== '' ? `#${c.number}` : '', personName(c)].filter(Boolean).join(' ')
  } else if (/^coach/.test(slot) && side) {
    name = personName(side === 'home' ? team1Coach : team2Coach)
  } else if (OFFICIAL_ROLES[slot] && Array.isArray(m.officials)) {
    const o = m.officials.find((x) => OFFICIAL_ROLES[slot].includes(String(x?.role || '').toLowerCase()))
    name = personName(o)
  }
  if (name) ctx.name = name
  if (['en', 'de', 'de-CH', 'fr', 'it'].includes(lang)) ctx.lang = lang
  return ctx
}

// --- "Signed on phone" beside the image --------------------------------------

/** The source record of an image: { via:'phone', transport, at } or null. */
export function signatureSource(dataUrl, meta, nowIso = () => new Date().toISOString()) {
  return dataUrl && meta?.source === 'phone'
    ? { via: 'phone', transport: meta.transport === 'lan' ? 'lan' : 'cloud', at: nowIso() }
    : null
}

/**
 * The extra fields of the Dexie update that saves a signature
 * (saveMatchSignature's `extra`): its source, by key path, in the same
 * update. A drawn one (or none) sets the source to null, so the record always
 * describes the image that is there.
 * @param {string} field e.g. 'scorerSignature'
 */
export function signatureSourceUpdate(field, dataUrl, meta, nowIso) {
  return { [`signatureSources.${field}`]: signatureSource(dataUrl, meta, nowIso) }
}

/** Was the image in `field` signed on a phone? */
export function signedOnPhone(match, field) {
  return match?.signatureSources?.[field]?.via === 'phone'
}

/**
 * The approval JSON's record of where each post-match signature was made:
 * 'phone' | 'device', or null for a slot without an image (an account
 * approval, no assistant scorer). A / B follow the coin toss.
 */
export function approvalSignatureSources(match) {
  const aIsTeam1 = tossSideA(match) !== 'away'
  const src = (field) => (match?.[field] ? (signedOnPhone(match, field) ? 'phone' : 'device') : null)
  return {
    captainA: src(aIsTeam1 ? 'team1PostGameCaptainSignature' : 'team2PostGameCaptainSignature'),
    captainB: src(aIsTeam1 ? 'team2PostGameCaptainSignature' : 'team1PostGameCaptainSignature'),
    scorer: src('scorerSignature'),
    asstScorer: src('asstScorerSignature'),
    ref1: src('ref1Signature'),
    ref2: src('ref2Signature')
  }
}
