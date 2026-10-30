/**
 * How the app opens and resumes (App_beach). Ported from OpenVolley's
 * utils/deviceSelfCheck.js (3.0.6, PR #42), with team1 / team2.
 *
 * 2026-10-29: OpenVolley's desktop app froze on its owner's PC. At start it
 * had reopened a stale copy of an official match on its scoring screen by
 * itself, and the start-up update then reloaded on that screen. OpenBeach
 * did the same: at start it resumed the first 'live' match on the device
 * (the lowest id, closed on the server or not), an ended match not approved
 * on Match End, and a match with a roster waiting on Match Setup.
 *
 * The owner's start and resume rules (2026-10-27, after the established
 * e-scoresheets: DataProject / FIVB / CEV, SAMS, Nevobo DWF, FFvolley FDME,
 * VolleySpike, nuScore open on their home or match list and resume with one
 * tap; none reopens a match by itself, and none deletes a copy without the
 * user):
 * 1. Opening the app always lands on Home: the desktop or Android app
 *    started, a new browser tab, the reopen after a crash or a kill. Home's
 *    Continue card resumes the match in one tap.
 * 2. A reload goes back into the match. The match screen on show is noted in
 *    sessionStorage (OPEN_MATCH_KEY, noteOpenMatch): a reload keeps it, an
 *    app kill or a new tab does not. matchToReopen reads it at start-up;
 *    document.wasDiscarded (a tab the browser unloaded to save memory) counts
 *    as a reload too. So the update's reload, Clear cache and the error
 *    screen's reload land on the screen they left. Where it runs:
 *    - a browser tab: sessionStorage is the tab's; a reload, a discarded tab
 *      brought back and a closed tab reopened keep it, a new tab and a new
 *      window start without it.
 *    - the desktop app (the OpenVolley repo's Tauri beach flavour): the
 *      window is a new WebView with its own empty session storage at each
 *      start; its close button only hides it, so the same page comes back,
 *      and a reload of the window keeps the marker.
 *    - the Android app (Capacitor): the WebView's session storage lives in
 *      the app's process. Android killing the app in the background, a swipe
 *      from the recent apps, a crash all start a new process without it.
 * 3. 15 minutes or more in the background (BACKGROUND_HOME_MS) goes to Home,
 *    and only changes the screen. Only the time the page was hidden counts
 *    (trackBackground: visibilitychange, pagehide / pageshow, the Capacitor
 *    App plugin's appStateChange and the document's pause / resume where the
 *    app has them): a screen left on through a long set break or a medical
 *    time-out is never acted on. The hidden-since time is kept in
 *    sessionStorage too, so a page the browser discarded while hidden for 15
 *    minutes comes back on Home.
 */
import { isStaleClosedCopy } from './matchReopen_beach'
import { isScorerMoved } from './matchHandover_beach'

// Hidden this long: back on Home (rule 3)
export const BACKGROUND_HOME_MS = 15 * 60 * 1000
// The match screen on show, for a reload (rule 2): { id, view }
export const OPEN_MATCH_KEY = 'ob.openMatch'
// Since when the page is hidden (ms), for a page reloaded or discarded meanwhile
export const HIDDEN_AT_KEY = 'ob.hiddenAt'
// The screens a reload goes back to
const VIEWS = ['scoreboard', 'matchSetup', 'coinToss', 'matchEnd']

const timeOf = (v) => {
  const t = typeof v === 'number' ? v : (typeof v === 'string' ? Date.parse(v) : NaN)
  return Number.isFinite(t) ? t : null
}

/**
 * When the match was last worked on (ms): its newest event, else its update
 * or creation time. null when nothing says.
 */
export function lastActivityAt(match, newestEvent) {
  return timeOf(newestEvent?.ts) ?? timeOf(match?.updatedAt) ?? timeOf(match?.createdAt) ?? null
}

/**
 * Where a match stands, from its sets (local rows or the server's): the
 * latest set's index and points, and the sets each team has won. set is null
 * when the match has no set yet. (OpenVolley deviceMatches setScore.)
 * @returns {{ set: number|null, team1: number, team2: number, setsTeam1: number, setsTeam2: number }}
 */
export function setScore(sets) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const rows = (sets || [])
    .map(s => ({ index: Number(s?.index ?? s?.set_index), team1: num(s?.team1Points ?? s?.team1_points), team2: num(s?.team2Points ?? s?.team2_points), finished: !!s?.finished }))
    .filter(r => Number.isFinite(r.index))
    .sort((a, b) => a.index - b.index)
  const latest = rows.at(-1) || null
  return {
    set: latest ? latest.index : null,
    team1: latest ? latest.team1 : 0,
    team2: latest ? latest.team2 : 0,
    setsTeam1: rows.filter(r => r.finished && r.team1 > r.team2).length,
    setsTeam2: rows.filter(r => r.finished && r.team2 > r.team1).length
  }
}

// The last event added to a match (the highest id), one row read
export const newestEventOf = (database, matchId) => database.events.where('matchId').equals(matchId).last()

/** The live match last scored on this device, never a copy closed on the server or scored on another device. */
export async function lastScoredLiveMatch(database) {
  const live = (await database.matches.where('status').equals('live').toArray()).filter(m => !isStaleClosedCopy(m) && !isScorerMoved(m))
  let best = null
  for (const m of live) {
    const at = lastActivityAt(m, await newestEventOf(database, m.id))
    if (!best || (at ?? -Infinity) > (best.at ?? -Infinity) || ((at ?? -Infinity) === (best.at ?? -Infinity) && m.id > best.match.id)) best = { match: m, at }
  }
  return best?.match ?? null
}

// ---------------------------------------------------------------------------
// Open, reload, background (rules 1 to 3)
// ---------------------------------------------------------------------------

const sessionStore = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null // storage blocked: every start is an opening
  }
}
const read = (storage, key) => {
  try { return storage?.getItem(key) ?? null } catch { return null }
}
const write = (storage, key, value) => {
  try {
    if (value == null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch { /* storage full or blocked: a reload then opens Home */ }
}

/** A match screen is on show (App_beach, whenever it changes): a reload goes back to it. */
export function noteOpenMatch({ id, view = 'scoreboard' }, storage = sessionStore()) {
  if (id == null) return
  write(storage, OPEN_MATCH_KEY, JSON.stringify({ id, view: VIEWS.includes(view) ? view : 'scoreboard' }))
}

/** The user left the match screen (Home, close match): a reload stays on Home. */
export function clearOpenMatch(storage = sessionStore()) {
  write(storage, OPEN_MATCH_KEY, null)
}

/** @returns {{ id: number, view: string }|null} */
export function readOpenMatch(storage = sessionStore()) {
  try {
    const v = JSON.parse(read(storage, OPEN_MATCH_KEY) || 'null')
    return v && v.id != null ? { id: v.id, view: VIEWS.includes(v.view) ? v.view : 'scoreboard' } : null
  } catch {
    return null
  }
}

const readHiddenAt = (storage) => {
  const t = Number(read(storage, HIDDEN_AT_KEY))
  return Number.isFinite(t) && t > 0 ? t : null
}

/**
 * At start-up (once per page load): the match screen a reload, or a tab the
 * browser discarded, goes back to; null for an opening (Home, rule 1).
 * - The marker names a match still on the device: that match, on the screen
 *   it showed. Without a marker, a discarded tab goes back to the live match
 *   last scored here (never a closed or moved copy).
 * - Hidden 15 minutes or more before the page went away (a tab discarded in
 *   the background, a reload after a long time hidden): Home (rule 3).
 * The marker is left for App_beach to keep or clear; the hidden-since time
 * is consumed when the page is visible.
 * @returns {Promise<{ id: number, view: string }|null>}
 */
export async function matchToReopen(database, {
  storage = sessionStore(),
  doc = typeof document === 'undefined' ? null : document,
  now = Date.now(),
  minHiddenMs = BACKGROUND_HOME_MS
} = {}) {
  const marker = readOpenMatch(storage)
  const discarded = doc?.wasDiscarded === true
  const hiddenAt = readHiddenAt(storage)
  if (doc?.visibilityState !== 'hidden') write(storage, HIDDEN_AT_KEY, null)
  if (!marker && !discarded) return null
  if (hiddenAt != null && now - hiddenAt >= minHiddenMs) {
    console.info(`[Start] Hidden for ${Math.round((now - hiddenAt) / 60000)} min before this page loaded: the home screen`)
    return null
  }
  let match = marker ? await database.matches.get(marker.id).catch(() => null) : null
  if (!match && !marker && discarded) match = await lastScoredLiveMatch(database).catch(() => null)
  if (!match) return null
  return { id: match.id, view: marker?.view || 'scoreboard' }
}

/**
 * Calls `callback(ms)` when the page comes back after being hidden for at
 * least `minHiddenMs` (the app sent to the background, the desktop window
 * hidden to the tray or minimised, the device's screen off). Only hidden time
 * counts: a visible screen, however idle, is never acted on.
 * @returns {() => void} unsubscribe
 */
export function trackBackground(callback, {
  minHiddenMs = BACKGROUND_HOME_MS,
  doc = typeof document === 'undefined' ? null : document,
  win = typeof window === 'undefined' ? null : window,
  storage = sessionStore(),
  now = () => Date.now()
} = {}) {
  if (!doc?.addEventListener) return () => {}
  let hiddenAt = doc.visibilityState === 'hidden' ? (readHiddenAt(storage) ?? now()) : null
  const away = () => {
    if (hiddenAt != null) return
    hiddenAt = now()
    write(storage, HIDDEN_AT_KEY, String(hiddenAt))
  }
  const back = () => {
    // the Page Lifecycle's resume can come while the page is still hidden
    if (hiddenAt == null || doc.visibilityState === 'hidden') return
    const gone = now() - hiddenAt
    hiddenAt = null
    write(storage, HIDDEN_AT_KEY, null)
    if (gone >= minHiddenMs) callback(gone)
  }
  const onVisibility = () => (doc.visibilityState === 'hidden' ? away() : back())
  doc.addEventListener('visibilitychange', onVisibility)
  // Cordova / Capacitor's App plugin fire these on the document
  doc.addEventListener('pause', away)
  doc.addEventListener('resume', back)
  // a reload or a page kept in the back-forward cache
  win?.addEventListener?.('pagehide', away)
  win?.addEventListener?.('pageshow', back)
  // The Capacitor App plugin's state, where the app has it
  let appHandle = null
  let stopped = false
  const capApp = win?.Capacitor?.Plugins?.App
  if (typeof capApp?.addListener === 'function') {
    try {
      Promise.resolve(capApp.addListener('appStateChange', (s) => (s?.isActive ? back() : away())))
        .then((h) => { if (stopped) h?.remove?.(); else appHandle = h })
        .catch(() => {})
    } catch { /* no plugin after all */ }
  }
  return () => {
    stopped = true
    doc.removeEventListener('visibilitychange', onVisibility)
    doc.removeEventListener('pause', away)
    doc.removeEventListener('resume', back)
    win?.removeEventListener?.('pagehide', away)
    win?.removeEventListener?.('pageshow', back)
    try { appHandle?.remove?.() } catch { /* gone */ }
  }
}
