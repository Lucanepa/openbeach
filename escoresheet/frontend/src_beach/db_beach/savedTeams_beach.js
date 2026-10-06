/**
 * Offline cache of the saved beach teams (beach-saved-teams-spec.md §5.5),
 * ported from OpenVolley src/db/savedTeams.js. One online load of
 * GET /api/saved-teams?sport=beach fills two Dexie tables, so MatchSetup's
 * "Load saved team" and the name suggestions work without a connection
 * afterwards.
 *
 * The rows hold personal data (DOB, licence number, country): they are only
 * for the account that loaded them (meta.userId) and are cleared on sign-out,
 * account switch and account deletion (AuthContext_beach). Never log a row.
 */

import { db } from './db_beach'
import { savedTeamsApi } from '../lib_beach/apiClient_beach'
import { accessFromRoles } from '../lib_beach/access_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'
import { teamKeys } from '../utils_beach/savedTeams_beach'

export const SAVED_TEAMS_MAX_AGE_MS = 10 * 60 * 1000
export const SAVED_TEAMS_CHANGED_EVENT = 'ob-saved-teams-changed'
const META_KEY = 'bundle'

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** The signed-in account id on this device (from the stored session), or null. */
export function currentUserId() {
  return readJson('api_auth_token')?.user?.id ?? null
}

function currentAccess() {
  return accessFromRoles(readJson('cachedProfile')?.roles ?? [])
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function backendAvailable() {
  try {
    return isBackendAvailable()
  } catch {
    return false
  }
}

function notify() {
  try { window.dispatchEvent(new Event(SAVED_TEAMS_CHANGED_EVENT)) } catch { /* no window */ }
}

/** API bundle → the cache's competition objects (beach only; also those without teams). */
export function bundleCompetitions(bundle) {
  return (bundle?.competitions || []).filter(c => c && c.id && c.sport === 'beach').map(c => ({
    id: c.id,
    name: c.name || '',
    season: c.season || '',
    gender: c.gender ?? null,
    category: c.category ?? null,
    archived: !!c.archived,
    sport: 'beach'
  }))
}

/**
 * API bundle → cache rows: the teams of the beach competitions, with the
 * competition embedded and the two lookup keys. players / staff keep the
 * API's snake_case objects (country included).
 */
export function bundleToRows(bundle) {
  const competitions = new Map(bundleCompetitions(bundle).map(c => [c.id, c]))
  return (bundle?.teams || [])
    .filter(t => t && t.id && competitions.has(t.competition_id))
    .map(t => {
      const { nameKey, pairKey } = teamKeys(t)
      return {
        id: t.id,
        competitionId: t.competition_id,
        competition: competitions.get(t.competition_id),
        name: t.name || '',
        shortName: t.short_name || '',
        club: t.club || '',
        color: t.color || '',
        nameKey,
        pairKey,
        players: Array.isArray(t.players) ? t.players : [],
        staff: Array.isArray(t.staff) ? t.staff : [],
        updatedAt: t.updated_at || null
      }
    })
}

/**
 * The cached competitions (for the picker): the bundle's list kept in the
 * meta row, plus any competition embedded in a team row.
 */
export function competitionsOf(rows, meta = null) {
  const map = new Map()
  for (const c of Array.isArray(meta?.competitions) ? meta.competitions : []) if (c?.id && !map.has(c.id)) map.set(c.id, c)
  for (const row of rows || []) if (row.competition && !map.has(row.competition.id)) map.set(row.competition.id, row.competition)
  return [...map.values()]
}

export async function getSavedTeamsMeta() {
  try {
    return (await db.saved_teams_meta.get(META_KEY)) || null
  } catch {
    return null
  }
}

/**
 * Every cached saved team of the signed-in account; [] when the cache belongs
 * to another account (or there is none).
 */
export async function getSavedTeams({ userId = currentUserId() } = {}) {
  try {
    const meta = await db.saved_teams_meta.get(META_KEY)
    if (!meta || !userId || meta.userId !== userId) return []
    return await db.saved_teams.toArray()
  } catch {
    return []
  }
}

export async function clearSavedTeams() {
  try {
    await db.transaction('rw', db.saved_teams, db.saved_teams_meta, async () => {
      await db.saved_teams.clear()
      await db.saved_teams_meta.clear()
    })
    notify()
  } catch (e) {
    console.warn('[savedTeams] clear failed:', e?.message)
  }
}

/** Replace the cache with a bundle. */
export async function storeSavedTeamsBundle(bundle, userId) {
  const rows = bundleToRows(bundle)
  await db.transaction('rw', db.saved_teams, db.saved_teams_meta, async () => {
    await db.saved_teams.clear()
    if (rows.length) await db.saved_teams.bulkPut(rows)
    await db.saved_teams_meta.put({
      key: META_KEY,
      version: String(bundle?.version ?? '0'),
      fetchedAt: bundle?.fetched_at || new Date().toISOString(),
      userId,
      competitions: bundleCompetitions(bundle)
    })
  })
  notify()
  return rows
}

/**
 * Load the saved beach teams from the server into the cache.
 * - skipped: no account, no read access, or no backend (offline-only build)
 * - offline: no connection; the cache is kept
 * - fresh: the cache of this account is under 10 minutes old
 * - refreshed: the server answered and the cache was replaced
 * - forbidden: 401/403 (signed out, pending, roles removed); the cache is cleared
 * - error: anything else (5xx, a LAN server without the route: 404); the cache is kept
 * @param {{force?: boolean, access?: object, userId?: string|null, online?: boolean}} [opts]
 * @returns {Promise<{status: 'refreshed'|'fresh'|'skipped'|'offline'|'forbidden'|'error', teams: object[]}>}
 */
export async function refreshSavedTeams({ force = false, access, userId, online } = {}) {
  const uid = userId === undefined ? currentUserId() : userId
  const acc = access || currentAccess()
  if (!uid || !acc.canReadTeams || !backendAvailable()) {
    return { status: 'skipped', teams: await getSavedTeams({ userId: uid }) }
  }
  if (!(online ?? isOnline())) return { status: 'offline', teams: await getSavedTeams({ userId: uid }) }

  if (!force) {
    const meta = await getSavedTeamsMeta()
    const age = meta?.fetchedAt ? Date.now() - Date.parse(meta.fetchedAt) : Infinity
    if (meta && meta.userId === uid && age >= 0 && age < SAVED_TEAMS_MAX_AGE_MS) {
      return { status: 'fresh', teams: await getSavedTeams({ userId: uid }) }
    }
  }

  const { data, error, status } = await savedTeamsApi.fetchBundle()
  if (error || !data) {
    if (status === 403 || status === 401) {
      await clearSavedTeams()
      return { status: 'forbidden', teams: [] }
    }
    return { status: error?.network || status === 0 ? 'offline' : 'error', teams: await getSavedTeams({ userId: uid }) }
  }
  try {
    const teams = await storeSavedTeamsBundle(data, uid)
    return { status: 'refreshed', teams }
  } catch (e) {
    console.warn('[savedTeams] cache write failed:', e?.message)
    return { status: 'error', teams: await getSavedTeams({ userId: uid }) }
  }
}
