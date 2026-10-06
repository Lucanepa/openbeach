import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beachBundle, COOP_ID, OLD_TOUR_ID, MUELLER_WEBER_ID, ROSSI_ID } from '../fixtures/beachBundle'

vi.mock('../../lib_beach/apiClient_beach', () => ({
  savedTeamsApi: { fetchBundle: vi.fn() }
}))
const backend = vi.hoisted(() => ({ available: true }))
vi.mock('../../utils_beach/backendConfig_beach', () => ({
  isBackendAvailable: () => backend.available
}))

import { savedTeamsApi } from '../../lib_beach/apiClient_beach'
import { accessFromRoles } from '../../lib_beach/access_beach'

// The setup file replaces window.indexedDB with a stub; the real db_beach
// instance captures Dexie.dependencies when it is constructed, so they are
// swapped for fake-indexeddb before the module is imported.
let savedDeps
let db
let cache
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  cache = await import('../../db_beach/savedTeams_beach')
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const scorer = accessFromRoles(['scorer'])
const ok = (data = beachBundle()) => ({ data, error: null, status: 200 })

beforeEach(async () => {
  await db.saved_teams.clear()
  await db.saved_teams_meta.clear()
  savedTeamsApi.fetchBundle.mockReset()
  backend.available = true
})

describe('saved beach teams cache', () => {
  it('a refresh stores the fixture as rows with keys, the competition and the owner', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValue(ok())
    const res = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    expect(res.status).toBe('refreshed')
    const rows = await cache.getSavedTeams({ userId: 'u1' })
    expect(rows.map(r => r.id).sort()).toEqual([MUELLER_WEBER_ID, ROSSI_ID])
    const mw = rows.find(r => r.id === MUELLER_WEBER_ID)
    expect(mw).toMatchObject({
      competitionId: COOP_ID, name: 'Müller / Weber', shortName: 'MÜLLER/WEBER', club: 'BC Zürich', color: '#3b82f6',
      nameKey: 'müller/weber', pairKey: 'müller/weber', updatedAt: '2026-10-06T08:00:00.000Z',
      competition: { id: COOP_ID, name: 'Coop Beachtour', season: '2026', gender: 'women', archived: false, sport: 'beach' }
    })
    expect(mw.players[0]).toMatchObject({ number: 1, first_name: 'Anna', dob: '1998-01-05', country: 'CHE' })
    expect(mw.staff[0]).toMatchObject({ role: 'Coach', last_name: 'Kunz' })
    // indexed lookups
    expect((await db.saved_teams.where('pairKey').equals('müller/weber').toArray()).map(r => r.id)).toEqual([MUELLER_WEBER_ID])
    const meta = await cache.getSavedTeamsMeta()
    expect(meta).toMatchObject({ version: '2026-10-06T08:00:00.000Z', fetchedAt: '2026-10-06T08:00:05.000Z', userId: 'u1' })
    expect(cache.competitionsOf(rows, meta).map(c => c.id).sort()).toEqual([COOP_ID, OLD_TOUR_ID])
  })

  it('is fresh for 10 minutes; force or an older cache refetches', async () => {
    const b = beachBundle()
    b.fetched_at = new Date().toISOString()
    savedTeamsApi.fetchBundle.mockResolvedValue(ok(b))
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    const again = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    expect(again.status).toBe('fresh')
    expect(again.teams).toHaveLength(2)
    expect(savedTeamsApi.fetchBundle).toHaveBeenCalledTimes(1)
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })
    expect(savedTeamsApi.fetchBundle).toHaveBeenCalledTimes(2)
    await db.saved_teams_meta.update('bundle', { fetchedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() })
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    expect(savedTeamsApi.fetchBundle).toHaveBeenCalledTimes(3)
  })

  it('never shows another account\'s cache', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValue(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    expect(await cache.getSavedTeams({ userId: 'u2' })).toEqual([])
    expect(await cache.getSavedTeams({ userId: null })).toEqual([])
    const other = await cache.refreshSavedTeams({ access: scorer, userId: 'u2', online: true })
    expect(other.status).toBe('refreshed')
    expect(savedTeamsApi.fetchBundle).toHaveBeenCalledTimes(2)
  })

  it('a 403 (or 401) clears the cache', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValueOnce(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    savedTeamsApi.fetchBundle.mockResolvedValueOnce({ data: null, error: { code: 'OV_FORBIDDEN', status: 403 }, status: 403 })
    const res = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })
    expect(res).toEqual({ status: 'forbidden', teams: [] })
    expect(await db.saved_teams.count()).toBe(0)
    expect(await cache.getSavedTeamsMeta()).toBeNull()

    savedTeamsApi.fetchBundle.mockResolvedValueOnce(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })
    savedTeamsApi.fetchBundle.mockResolvedValueOnce({ data: null, error: { status: 401 }, status: 401 })
    expect((await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })).status).toBe('forbidden')
    expect(await db.saved_teams.count()).toBe(0)
  })

  it('offline or on a network error the cache is kept', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValueOnce(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    const off = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: false, force: true })
    expect(off.status).toBe('offline')
    expect(off.teams).toHaveLength(2)
    expect(savedTeamsApi.fetchBundle).toHaveBeenCalledTimes(1)
    savedTeamsApi.fetchBundle.mockResolvedValueOnce({ data: null, error: { network: true, status: 0 }, status: 0 })
    const net = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })
    expect(net.status).toBe('offline')
    expect(net.teams).toHaveLength(2)
  })

  it('a 404 (a LAN server without the route) or a 500 is an error and keeps the cache', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValueOnce(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    savedTeamsApi.fetchBundle.mockResolvedValueOnce({ data: null, error: { message: 'Not found', status: 404 }, status: 404 })
    const nf = await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })
    expect(nf.status).toBe('error')
    expect(nf.teams).toHaveLength(2)
    savedTeamsApi.fetchBundle.mockResolvedValueOnce({ data: null, error: { status: 503 }, status: 503 })
    expect((await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true, force: true })).status).toBe('error')
    expect(await db.saved_teams.count()).toBe(2)
  })

  it('drops a competition of another sport and its teams', async () => {
    const b = beachBundle()
    b.competitions.push({ id: 'indoor-c', name: '2. Liga', season: '2026/27', gender: 'women', archived: false, sport: 'indoor', vm_leagues: [] })
    b.competitions.push({ id: 'nosport-c', name: 'Old client', season: '2026/27', gender: 'men', archived: false })
    b.teams.push({ id: 'indoor-t', competition_id: 'indoor-c', name: 'VBC', players: [], staff: [] })
    b.teams.push({ id: 'nosport-t', competition_id: 'nosport-c', name: 'VBC 2', players: [], staff: [] })
    savedTeamsApi.fetchBundle.mockResolvedValue(ok(b))
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    expect((await db.saved_teams.toArray()).map(r => r.id).sort()).toEqual([MUELLER_WEBER_ID, ROSSI_ID])
    expect((await cache.getSavedTeamsMeta()).competitions.map(c => c.id).sort()).toEqual([COOP_ID, OLD_TOUR_ID])
  })

  it('does not ask the server without read access, a user or a backend', async () => {
    expect((await cache.refreshSavedTeams({ access: accessFromRoles([]), userId: 'u1', online: true })).status).toBe('skipped')
    expect((await cache.refreshSavedTeams({ access: accessFromRoles(['referee']), userId: 'u1', online: true })).status).toBe('skipped')
    expect((await cache.refreshSavedTeams({ access: scorer, userId: null, online: true })).status).toBe('skipped')
    backend.available = false
    expect((await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })).status).toBe('skipped')
    expect(savedTeamsApi.fetchBundle).not.toHaveBeenCalled()
  })

  it('clearSavedTeams empties both tables and announces it', async () => {
    savedTeamsApi.fetchBundle.mockResolvedValue(ok())
    await cache.refreshSavedTeams({ access: scorer, userId: 'u1', online: true })
    const seen = vi.fn()
    window.addEventListener(cache.SAVED_TEAMS_CHANGED_EVENT, seen)
    await cache.clearSavedTeams()
    window.removeEventListener(cache.SAVED_TEAMS_CHANGED_EVENT, seen)
    expect(await db.saved_teams.count()).toBe(0)
    expect(await db.saved_teams_meta.count()).toBe(0)
    expect(seen).toHaveBeenCalled()
  })
})
