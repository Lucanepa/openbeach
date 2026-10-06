/**
 * Saved beach teams against a REAL OpenVolley backend (server.js + Postgres
 * with db/009), opt-in:
 *
 *   OB_BACKEND_URL=http://127.0.0.1:<port> OB_SCORER_EMAIL=… OB_SCORER_PASSWORD=… \
 *     npx vitest run src_beach/__tests__/integration/savedTeams.integration.test.js
 *
 * LOCAL throwaway backend only. It needs an approved scorer (roles are granted
 * by SQL or an admin, never by sign-up) and, in the database, a beach
 * competition 'Coop Beachtour' with the pair 'Müller / Weber' (2 players,
 * country CHE, coach) plus at least one indoor competition with a team.
 * Skipped without OB_BACKEND_URL and OB_SCORER_EMAIL.
 *
 * Covers: GET /api/saved-teams?sport=beach with the real apiClient_beach,
 * the real cache (Dexie on fake-indexeddb), beach-only rows, 401 signed out
 * and 403 for a pending account (cache cleared).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

const BASE = process.env.OB_BACKEND_URL || ''
const EMAIL = process.env.OB_SCORER_EMAIL || ''
const PASSWORD = process.env.OB_SCORER_PASSWORD || ''

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `${process.env.OB_BACKEND_URL}${p.startsWith('/') ? p : `/${p}`}`,
  isBackendAvailable: () => true,
  getWebSocketUrl: () => null,
  getBackendUrl: () => process.env.OB_BACKEND_URL
}))

describe.skipIf(!BASE || !EMAIL)('saved beach teams on a local OpenVolley backend', () => {
  let db, api, cache, access, savedDeps, userId
  const store = new Map()

  beforeAll(async () => {
    const ls = window.localStorage
    ls.getItem.mockImplementation((k) => (store.has(k) ? store.get(k) : null))
    ls.setItem.mockImplementation((k, v) => { store.set(k, String(v)) })
    ls.removeItem.mockImplementation((k) => { store.delete(k) })
    savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    ;({ db } = await import('../../db_beach/db_beach'))
    api = await import('../../lib_beach/apiClient_beach')
    cache = await import('../../db_beach/savedTeams_beach')
    access = await import('../../lib_beach/access_beach')
  })
  afterAll(() => {
    db?.close()
    if (savedDeps) Object.assign(Dexie.dependencies, savedDeps)
  })

  it('signed out: 401, nothing personal', async () => {
    const r = await api.savedTeamsApi.fetchBundle()
    expect(r.status).toBe(401)
    expect(r.data).toBeNull()
  })

  it('an approved scorer gets the beach bundle only', async () => {
    const inn = await api.apiAuth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    expect(inn.error, JSON.stringify(inn.error)).toBeNull()
    userId = inn.data.user.id
    const r = await api.savedTeamsApi.fetchBundle()
    expect(r.error, JSON.stringify(r.error)).toBeNull()
    expect(r.data.sport).toBe('beach')
    expect(r.data.competitions.length).toBeGreaterThan(0)
    for (const c of r.data.competitions) expect(c.sport).toBe('beach')
    for (const t of r.data.teams) expect(t.sport).toBe('beach')
    const mw = r.data.teams.find(t => t.name === 'Müller / Weber')
    expect(mw.players.map(p => [p.number, p.last_name, p.country, p.is_libero, p.is_captain, p.active]))
      .toEqual([[1, 'Müller', 'CHE', false, false, true], [2, 'Weber', 'CHE', false, false, true]])
    expect(mw.staff.map(s => s.role)).toEqual(['Coach'])
  })

  it('the cache stores the pair with its keys, and the roster helper fills MatchSetup', async () => {
    const res = await cache.refreshSavedTeams({ access: access.accessFromRoles(['scorer']), userId, online: true, force: true })
    expect(res.status).toBe('refreshed')
    const rows = await cache.getSavedTeams({ userId })
    const mw = rows.find(r => r.name === 'Müller / Weber')
    expect(mw).toMatchObject({ nameKey: 'müller/weber', pairKey: 'müller/weber', competition: { name: 'Coop Beachtour', season: '2026', sport: 'beach' } })
    const { savedTeamToBeachRoster, findBeachTeamSuggestions } = await import('../../utils_beach/savedTeams_beach')
    const r = savedTeamToBeachRoster(mw)
    expect(r.roster.map(p => [p.number, p.lastName, p.dob])).toEqual([[1, 'Müller', '05/01/1998'], [2, 'Weber', '12/03/1997']])
    expect(r.country).toBe('CHE')
    expect(findBeachTeamSuggestions(rows, { team1Name: 'Weber / Müller (CHE)' }).team1.id).toBe(mw.id)
  })

  it('a pending account gets 403 and its cache is cleared', async () => {
    const email = `pending-${Date.now().toString(36)}@example.ch`
    const password = `pw-${Math.random().toString(36).slice(2)}-${Date.now()}` // throwaway account on a local backend
    expect((await api.apiAuth.signUp({ email, password })).error).toBeNull()
    const inn = await api.apiAuth.signInWithPassword({ email, password })
    expect(inn.error, JSON.stringify(inn.error)).toBeNull()
    expect((await api.savedTeamsApi.fetchBundle()).status).toBe(403)
    // a cache whose roles were just removed: the refresh clears it
    const res = await cache.refreshSavedTeams({ access: access.accessFromRoles(['scorer']), userId, online: true, force: true })
    expect(res.status).toBe('forbidden')
    expect(await db.saved_teams.count()).toBe(0)
  })
})
