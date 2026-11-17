/**
 * The Live screen: every court of a beach event on TVs or a beamer.
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/globalLive.js; the
 * server side (the court store, the TV page) is OpenVolley's backend
 * (backend.openvolley.app, lib/globalLive.js), shared with indoor.
 *
 * An event opts in on its scorer devices with a shared live screen code: one
 * device starts it, the others type it in (Options › Live screen). While it
 * is set, every match's live-state-update to the relay carries it
 * (`globalLive`, plus the match's court token `globalLiveCourt`), and
 *
 *   https://openvolley.app/tv/<code>     (any screen, smart TVs included)
 *   http://<venue relay>/tv/<code>       (the same at a venue without internet)
 *
 * shows every court of that code. Only a score summary is kept on the server
 * (team names and colours, points, sets, who serves): never players, PINs or
 * line-ups. Beach team names are often the players' surnames, though: they
 * do appear on the public page once the scorer opts in.
 *
 * The wire field names stay `globalLive` / `globalLiveCourt`: the server
 * reads those.
 */
import { useSyncExternalStore } from 'react'

export const LIVE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/
export const LIVE_SCREEN_KEY = 'ov.liveScreen.code'
const EVENT = 'ov-live-screen'
// The TV page (backend lib/tvPage.js), short enough to type with a TV remote:
// openvolley.app/tv/<code> redirects to the backend, which serves it
export const TV_SITE = 'https://openvolley.app/tv/'

export const isLiveCode = (code) => typeof code === 'string' && CODE_RE.test(code)

/** What a person typed (spaces, dashes, lower case) as a code, or null. */
export function normalizeLiveCode(input) {
  if (typeof input !== 'string') return null
  const c = input.toUpperCase().replace(/[\s-]/g, '')
  return isLiveCode(c) ? c : null
}

/** A new code: 8 characters, about 40 random bits, no look-alikes (0/O, 1/I). */
export function newLiveCode(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(8)
  cryptoImpl.getRandomValues(bytes)
  return [...bytes].map((b) => LIVE_CODE_ALPHABET[b % LIVE_CODE_ALPHABET.length]).join('')
}

/** "ABCD 2345": easier to read out and type. */
export const formatLiveCode = (code) => (isLiveCode(code) ? `${code.slice(0, 4)} ${code.slice(4)}` : '')

/** The page for any screen, smart TVs included (plain HTML, old browsers fine). */
export const liveCodeUrl = (code) => (isLiveCode(code) ? `${TV_SITE}${code}` : null)

/** The same page on a venue relay (no internet needed): its HTTP base + /tv/<code>. */
export const localTvUrl = (base, code) => (isLiveCode(code) && typeof base === 'string' && /^https?:\/\//.test(base) ? `${base.replace(/\/+$/, '')}/tv/${code}` : null)

// A match's own key for its court token. openbeach has no separate random key
// per match: its seed key (match_<timestamp>_<random>, the relay room) is it,
// a test match's seedKey otherwise.
export function courtSecretOf(match) {
  for (const k of [match?.seed_key, match?.seedKey]) {
    if (typeof k === 'string' && k.trim()) return k.trim()
  }
  return null
}

// The court token (backend isCourtToken): the first 32 hex characters of
// SHA-256 of "court\0" + the match's own key, so one match is one court on
// the page whether it comes over the relay, a venue relay's forward or the
// desktop app's push.
const tokens = new Map()
export async function courtTokenFor(match, subtle = globalThis.crypto?.subtle) {
  const secret = courtSecretOf(match)
  if (!secret || !subtle) return null
  if (tokens.has(secret)) return tokens.get(secret)
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`court\0${secret}`))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  tokens.set(secret, hex)
  return hex
}

/** The token if already worked out (a live push cannot wait); starts the work otherwise. */
export function cachedCourtToken(match) {
  const secret = courtSecretOf(match)
  if (!secret) return null
  if (tokens.has(secret)) return tokens.get(secret)
  courtTokenFor(match).catch(() => null)
  return null
}

export function getLiveCode() {
  try {
    const v = localStorage.getItem(LIVE_SCREEN_KEY)
    return isLiveCode(v) ? v : null
  } catch { return null }
}

/** null switches the live screen off on this device. */
export function setLiveCode(code) {
  try {
    if (code == null) localStorage.removeItem(LIVE_SCREEN_KEY)
    else if (isLiveCode(code)) localStorage.setItem(LIVE_SCREEN_KEY, code)
    else return
  } catch { /* private window: lasts until reload */ }
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* no window */ }
}

const subscribe = (cb) => {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export function useLiveCode() {
  return useSyncExternalStore(subscribe, getLiveCode, () => null)
}

/** The code a match's live push carries: every beach match type, once this device opted in. */
export const liveCodeForMatch = (match) => (match ? getLiveCode() : null)

/**
 * The fields a live-state-update carries for the live screen: none without a
 * code; the court token once it is worked out (the server falls back to a
 * hash of the room until then).
 * @returns {{ globalLive?: string, globalLiveCourt?: string }}
 */
export function liveScreenFields(match) {
  const code = liveCodeForMatch(match)
  if (!code) return {}
  const court = cachedCourtToken(match)
  return court ? { globalLive: code, globalLiveCourt: court } : { globalLive: code }
}

/** Tests only. */
export function resetCourtTokens() {
  tokens.clear()
}
