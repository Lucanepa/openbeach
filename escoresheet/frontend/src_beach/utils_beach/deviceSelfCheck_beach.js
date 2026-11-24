/**
 * The device's self-check, and how the app opens and resumes (App_beach).
 * Ported from OpenVolley's utils/deviceSelfCheck.js (3.0.6, PR #42), with
 * team1 / team2.
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
 * 4. The server check (below) runs on open, on Continue and on the return
 *    from the background, never in the way: offline or signed out, nothing
 *    waits for it. Home shows the state of the match it continues
 *    (copyState).
 * 5. Nothing is removed by a check. Copies of one match are flagged
 *    (findDuplicateCopies); Home's Clean up removes, after one question, the
 *    ones that hold nothing of their own (cleanUpDuplicateCopies).
 *
 * A device only hears that the server closed a match when a write of its
 * copy is refused (OV_MATCH_CLOSED), and that another device scores it
 * through checkScorerMoved or a refused write: a copy that writes nothing
 * looks live for days (OpenVolley 2026-10-27, match 406970: the owner's PC
 * opened it live a week after a phone had continued and closed it).
 *
 * The check, local part (always, offline too): two or more copies of one
 * official match (the same seed_key; older versions and restores could leave
 * several). The copy furthest on is the kept one (most events, then the
 * latest activity). Another copy holds nothing of its own when it has no
 * unsent write of the match (the jobs carry the match key, not the copy), no
 * event, set score, signature, approval, remarks, roster, officials or event
 * history beyond the kept copy's, and it is not the match on the screen.
 * The server part (online and signed in only):
 * - Every open official copy is looked up in ONE read of `matches`. A copy
 *   the server has closed is marked as the sync queue marks a write refused
 *   as closed (useSyncQueue_beach noteMatchClosedOnServer): it opens
 *   read-only (ClosedOnServerModal_beach) from then on.
 * - A copy the server has open is asked about its scoring device
 *   (useSyncQueue_beach askScoringDevice): one another device scores now is
 *   marked (ScorerMovedModal_beach); one this device scores is "Scoring
 *   here". A match the server does not have is scored nowhere else.
 * Test matches are never asked about on the server. Beach has no clubs, and
 * a device scores few matches (a tournament court: one at a time, about ten
 * courts at once on the server): one read covers them all.
 */
import { jobMatchKey } from './syncIds_beach'
import { isKnownClosedOnServer, isScorerMoved, SCORER_MOVED_BY, SERVER_CLOSED_BY } from './matchHandover_beach'
import { isStaleClosedCopy, serverRowClosed } from './matchReopen_beach'
import { wipeMatchEvents } from '../db_beach/eventHistory_beach'
import { apiFrom } from '../lib_beach/apiClient_beach'

// The longest Continue waits for the server's answer before it opens a match
export const SERVER_CHECK_TIMEOUT_MS = 3000
// Hidden this long: back on Home (rule 3)
export const BACKGROUND_HOME_MS = 15 * 60 * 1000
// The match screen on show, for a reload (rule 2): { id, view }
export const OPEN_MATCH_KEY = 'ob.openMatch'
// Since when the page is hidden (ms), for a page reloaded or discarded meanwhile
export const HIDDEN_AT_KEY = 'ob.hiddenAt'
// The screens a reload goes back to
const VIEWS = ['scoreboard', 'matchSetup', 'coinToss', 'matchEnd']
// The copies whose scoring device one check asks about, at most
const MAX_SCORER_CHECKS = 8
// Jobs not sent yet (or in flight): a copy is never removed while one exists
const UNSENT = ['queued', 'sending', 'error', 'failed']
// Writes set aside because the server closed the match or another device
// scores it: never sent unless the match is reopened, lost with the copy
const SET_ASIDE_BY = [SERVER_CLOSED_BY, SCORER_MOVED_BY]
// How far a copy got; a copy that got further holds something
const STATUS_RANK = { live: 1, ended: 2, approved: 3, final: 4 }

/** The match key of a local row (seed_key; older rows used seedKey / externalId). */
export const localMatchKey = (m) => m?.seed_key || m?.seedKey || m?.externalId || m?.external_id || null

/** The game number of a local row, for the notices. */
export const matchGameNumber = (m) => m?.gameN ?? m?.game_n ?? m?.gameNumber ?? null

/**
 * An official copy the server may have closed: not a test, has its seed_key,
 * not final, not known closed, not approved here. A copy approved on this
 * device is closed on the server by its own approval (db/007 sets closed_at
 * at 'approved'), and only its Match End's Close match takes it further: it
 * queues 'final' and removes the copy. Marked closed by the check, it would
 * become final here and leave the home screen without Close match, and the
 * server's match would stay 'approved' for good (OpenVolley 81e746df).
 */
export const isOpenOfficialCopy = (m) => !!m && m.test !== true && !!m.seed_key && m.status !== 'final' && m.approved !== true && !isKnownClosedOnServer(m)

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

const reportItem = (m, extra = {}) => ({ id: m.id, key: localMatchKey(m), gameN: matchGameNumber(m), ...extra })

/**
 * The state Home shows for a local match (rule 4), from what this device
 * knows: 'closed' (the server has closed it), 'moved' (another device scores
 * it), 'here' (the last server check said this device scores it, or the
 * server does not have it) or 'unchecked' (not asked: offline, signed out,
 * no answer). null for a test match or a copy approved here: never asked
 * about.
 * @param {object} match the local row
 * @param {{ checkedHere?: boolean }} [options]
 * @returns {'closed'|'moved'|'here'|'unchecked'|null}
 */
export function copyState(match, { checkedHere = false } = {}) {
  if (!match || match.test === true) return null
  if (isKnownClosedOnServer(match) || isStaleClosedCopy(match)) return 'closed'
  if (isScorerMoved(match)) return 'moved'
  // approved here: never asked about (isOpenOfficialCopy), Close match ends it
  if (match.approved === true) return null
  return checkedHere ? 'here' : 'unchecked'
}

/**
 * What a copy of `seedKey` holds that the server does not have: its writes
 * not sent yet, and those set aside because the server closed the match or
 * another device scores it (sent never, unless the match is reopened).
 * Removing the copy loses them. events: the events among them.
 * @param {object[]} jobs all rows of sync_queue
 * @returns {{ changes: number, events: number }}
 */
export function unsentOfMatch(jobs, seedKey) {
  if (!seedKey) return { changes: 0, events: 0 }
  const lost = (jobs || []).filter(j => jobMatchKey(j) === seedKey &&
    (UNSENT.includes(j.status) || SET_ASIDE_BY.includes(j.superseded_by)))
  return { changes: lost.length, events: lost.filter(j => j.resource === 'event' && j.action !== 'delete').length }
}

/** Is there another local copy of this official match? (Delete then removes this copy alone.) */
export async function hasOtherLocalCopy(database, match) {
  const key = localMatchKey(match)
  if (!key || match?.test === true) return false
  return (await database.matches.filter(m => m.id !== match.id && m.test !== true && localMatchKey(m) === key).count()) > 0
}

// ---------------------------------------------------------------------------
// Copies of one official match
// ---------------------------------------------------------------------------

const hasValue = (v) => v != null && v !== '' && v !== false &&
  !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
// Signatures (captains, referees, scorer) and the approval, by their fields
const SIGNED = /signature|approv/i
// Lists entered in Match Setup that live on the match row
const LISTS = ['officials']

async function contentOf(database, m) {
  const events = await database.events.where('matchId').equals(m.id).toArray()
  const sets = await database.sets.where('matchId').equals(m.id).toArray()
  const history = database.event_history ? await database.event_history.where('matchId').equals(m.id).count() : 0
  const teamIds = [m.team1Id, m.team2Id].filter(id => id != null)
  const players = teamIds.length ? await database.players.where('teamId').anyOf(teamIds).count() : 0
  const newest = events.reduce((best, e) => (best == null || (timeOf(e.ts) ?? -Infinity) >= (timeOf(best.ts) ?? -Infinity) ? e : best), null)
  return { match: m, events, sets, history, players, activity: lastActivityAt(m, newest) }
}

// An event as two copies of one match both have it (a restore keeps seq and type)
const eventIdentity = (e) => (e.seq != null ? `${e.setIndex ?? ''}|${e.seq}|${e.type}` : `${e.setIndex ?? ''}|${e.ts}|${e.type}`)

/** Does `kept` hold everything `other` holds? */
function covers(kept, other) {
  if (other.history > 0) return false
  const keptEvents = new Set(kept.events.map(eventIdentity))
  if (!other.events.every(e => keptEvents.has(eventIdentity(e)))) return false
  for (const s of other.sets) {
    if (!(s.team1Points > 0 || s.team2Points > 0 || s.finished || s.startTime)) continue
    const k = kept.sets.find(ks => ks.index === s.index)
    if (!k || (k.team1Points ?? 0) < (s.team1Points ?? 0) || (k.team2Points ?? 0) < (s.team2Points ?? 0) || (s.finished && !k.finished)) return false
  }
  const a = other.match
  const b = kept.match
  for (const [field, value] of Object.entries(a)) {
    if (SIGNED.test(field) && hasValue(value) && !hasValue(b[field])) return false
  }
  if (LISTS.some(field => hasValue(a[field]) && !hasValue(b[field]))) return false
  if (hasValue(a.remarks) && a.remarks !== b.remarks) return false
  if ((STATUS_RANK[a.status] ?? 0) > (STATUS_RANK[b.status] ?? 0)) return false
  return other.players <= kept.players
}

// The copy furthest on first: most events, then the latest activity
const furthestFirst = (x, y) =>
  (y.events.length - x.events.length) || ((y.activity ?? -Infinity) - (x.activity ?? -Infinity)) || (y.match.id - x.match.id)

// The copy's rows: its sets and events (with their history), the match, and
// its own team and player rows. A team row another local match still uses
// stays. Its sync jobs are left: they carry the match key, which the kept
// copy shares. Local only: no server delete, no relay delete-match (the
// match is the kept copy's there).
async function removeCopy(database, m) {
  const tables = [database.matches, database.sets, database.events, database.event_history, database.players, database.teams].filter(Boolean)
  await database.transaction('rw', tables, async () => {
    await wipeMatchEvents(database, m.id, { dropHistory: true })
    await database.sets.where('matchId').equals(m.id).delete()
    await database.matches.delete(m.id)
    for (const teamId of new Set([m.team1Id, m.team2Id])) {
      if (teamId == null) continue
      if (await database.matches.filter(o => o.team1Id === teamId || o.team2Id === teamId).count()) continue
      await database.players.where('teamId').equals(teamId).delete()
      await database.teams.delete(teamId)
    }
  })
}

/**
 * The copies of each official match on this device, one kept and the others
 * flagged; nothing is removed here (rule 5). Test matches and final copies
 * are left alone.
 * @param {object} database the app's Dexie database
 * @param {{ openMatchId?: number|null, keys?: string[]|null }} [options]
 *   openMatchId: the match on the screen (never removable); keys: these
 *   matches only
 * @returns {Promise<{ flagged: object[] }>} { id, key, gameN, keptId,
 *   removable } each; removable: it holds nothing of its own
 */
export async function findDuplicateCopies(database, { openMatchId = null, keys = null } = {}) {
  const flagged = []
  const groups = new Map()
  for (const m of await database.matches.toArray()) {
    const key = localMatchKey(m)
    if (!key || m.test === true || m.status === 'final' || (keys && !keys.includes(key))) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(m)
  }
  for (const [key, copies] of groups) {
    if (copies.length < 2) continue
    const contents = []
    for (const m of copies) contents.push(await contentOf(database, m))
    contents.sort(furthestFirst)
    const [kept, ...others] = contents
    const unsent = (await database.sync_queue.where('status').anyOf(UNSENT).toArray()).some(j => jobMatchKey(j) === key)
    for (const other of others) {
      const removable = !unsent && other.match.id !== openMatchId && covers(kept, other)
      flagged.push(reportItem(other.match, { keptId: kept.match.id, removable }))
      console.info(`[SelfCheck] Two copies of match ${key} (game ${matchGameNumber(other.match) ?? '?'}): local ${other.match.id} next to ${kept.match.id}, ${removable ? 'holds nothing of its own' : `holds something of its own${unsent ? ' or the match has unsent writes' : ''}`}`)
    }
  }
  return { flagged }
}

/**
 * Home's Clean up, after its question: the copies that hold nothing of their
 * own, decided again now (anything may have changed since the check), are
 * removed, this device only. The others stay.
 * @param {{ openMatchId?: number|null, keys?: string[]|null }} [options]
 * @returns {Promise<{ removed: object[] }>}
 */
export async function cleanUpDuplicateCopies(database, { openMatchId = null, keys = null } = {}) {
  const removed = []
  const { flagged } = await findDuplicateCopies(database, { openMatchId, keys })
  for (const item of flagged) {
    if (!item.removable) continue
    const m = await database.matches.get(item.id)
    if (!m) continue
    await removeCopy(database, m)
    removed.push(item)
    console.info(`[SelfCheck] Removed a copy of match ${item.key} (game ${item.gameN ?? '?'}, local ${item.id}): local ${item.keptId} holds everything it had`)
  }
  return { removed }
}

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
// The server
// ---------------------------------------------------------------------------

/**
 * The server's rows of these matches, in one request: { data: rows, error }.
 * The columns Match End's reopen check reads, and the key to match them by.
 */
export function readServerMatchRows(keys) {
  return apiFrom('matches').select('id, external_id, status, closed_at').in('external_id', keys)
}

/**
 * Ask the server about the open official copies on this device.
 * @param {object} database
 * @param {{ readRows: (keys: string[]) => Promise<{data: object[]|null, error: object|null}>,
 *   noteClosed: (localId: number) => Promise<boolean>,
 *   scoringDevice: (seedKey: string) => Promise<'moved'|'here'|null> }} server
 * @param {{ onlyIds?: number[]|null }} [options] onlyIds: these copies only (Continue)
 * @returns {Promise<{ closed: object[], moved: object[], here: number[], asked: boolean, error: object|null }>}
 *   here: the copies this device scores; asked: the server answered
 */
export async function checkCopiesOnServer(database, server, { onlyIds = null } = {}) {
  const result = { closed: [], moved: [], here: [], asked: false, error: null }
  const copies = (await database.matches.toArray()).filter(m => isOpenOfficialCopy(m) && (!onlyIds || onlyIds.includes(m.id)))
  const keys = [...new Set(copies.map(m => m.seed_key))]
  if (!keys.length) {
    result.asked = true
    return result
  }
  let rows
  try {
    const { data, error } = await server.readRows(keys)
    if (error) {
      result.error = error
      console.info('[SelfCheck] The server could not be asked about the matches on this device:', error.message || error.status)
      return result
    }
    rows = Array.isArray(data) ? data : (data ? [data] : [])
  } catch (err) {
    result.error = err
    console.info('[SelfCheck] The server could not be asked about the matches on this device:', err?.message)
    return result
  }
  result.asked = true
  const byKey = new Map(rows.filter(r => r?.external_id).map(r => [r.external_id, r]))
  const scorer = new Map() // seed key -> the answer (copies of one match share it)
  for (const m of copies) {
    const row = byKey.get(m.seed_key)
    if (serverRowClosed(row)) {
      if (await server.noteClosed(m.id)) {
        result.closed.push(reportItem(m))
        console.info(`[SelfCheck] Match ${m.seed_key} (game ${matchGameNumber(m) ?? '?'}, local ${m.id}) is closed on the server: this copy is marked closed`)
      }
      continue
    }
    // already marked: Home says so from the copy itself
    if (isScorerMoved(m)) continue
    // a match the server does not have is scored nowhere else
    if (!row) {
      result.here.push(m.id)
      continue
    }
    if (!scorer.has(m.seed_key)) {
      if (scorer.size >= MAX_SCORER_CHECKS || typeof server.scoringDevice !== 'function') continue
      let who = null
      try { who = await server.scoringDevice(m.seed_key) } catch { who = null }
      scorer.set(m.seed_key, who)
    }
    const who = scorer.get(m.seed_key)
    if (who === 'moved') result.moved.push(reportItem(m))
    else if (who === 'here') result.here.push(m.id)
  }
  return result
}

/** Did `promise` settle within `ms`? { done, value | error }; it runs on either way. */
export function withinTimeout(promise, ms) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ done: false }), ms)
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve({ done: true, value }) },
      (error) => { clearTimeout(timer); resolve({ done: true, error }) }
    )
  })
}

/**
 * The self-check (see the top of this file): the copies of one match flagged,
 * and, with a server, every open official copy asked about. Never waited for
 * by the screen, and it removes nothing.
 * @param {object} args
 * @param {object} args.database the app's Dexie database
 * @param {object|null} [args.server] the server side (checkCopiesOnServer), only online and signed in
 * @param {number|null} [args.openMatchId] the match on the screen
 * @returns {Promise<{ flagged: object[], closed: object[], moved: object[], here: number[], asked: boolean }>}
 */
export async function runDeviceSelfCheck({ database, server = null, openMatchId = null }) {
  const report = { flagged: [], closed: [], moved: [], here: [], asked: false }
  try {
    report.flagged = (await findDuplicateCopies(database, { openMatchId })).flagged
  } catch (err) {
    console.warn('[SelfCheck] Could not check the copies on this device:', err?.message)
  }
  if (server) {
    try {
      const r = await checkCopiesOnServer(database, server)
      Object.assign(report, { closed: r.closed, moved: r.moved, here: r.here, asked: r.asked })
    } catch (err) {
      console.warn('[SelfCheck] The server check failed:', err?.message)
    }
  }
  return report
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
