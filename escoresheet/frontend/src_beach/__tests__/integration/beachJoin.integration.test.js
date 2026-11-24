/**
 * "Join OpenBeach" against a REAL OpenVolley backend (server.js + Postgres,
 * db 012 app memberships), opt-in:
 *
 *   OB_BACKEND_URL=http://127.0.0.1:<port> \
 *   OB_ADMIN_EMAIL=… OB_ADMIN_PASSWORD=… OB_INDOOR_EMAIL=… OB_INDOOR_PASSWORD=… \
 *     npx vitest run src_beach/__tests__/integration/beachJoin.integration.test.js
 *
 * LOCAL throwaway backend only (it creates an invite code and writes a
 * match); never backend.openvolley.app. The admin is an account with the
 * 'admin' role; the indoor account an OpenVolley scorer (roles ['scorer'],
 * no OpenBeach membership), both granted by SQL (the openvolley repo's
 * escoresheet/backend tests/helpers: provisionDatabase, bootServer,
 * grantRoles). Use a fresh backend for each run (the join is one-way).
 *
 * The real client code: apiClient_beach (sign-in, /api/me, join, redeem),
 * access_beach (needsJoin, pending, canScore) and useSyncQueue_beach's queue
 * pass on Dexie (fake-indexeddb): an OpenVolley account signs in to
 * OpenBeach, is told to join, joins, waits for approval, redeems a beach
 * invite code an admin made, becomes beach:scorer and syncs a beach match
 * the backend refused before.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

const BASE = process.env.OB_BACKEND_URL || ''
const ADMIN = { email: process.env.OB_ADMIN_EMAIL || '', password: process.env.OB_ADMIN_PASSWORD || '' }
const INDOOR = { email: process.env.OB_INDOOR_EMAIL || '', password: process.env.OB_INDOOR_PASSWORD || '' }

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `${process.env.OB_BACKEND_URL}${p.startsWith('/') ? p : `/${p}`}`,
  getCloudApiUrl: (p) => `${process.env.OB_BACKEND_URL}${p.startsWith('/') ? p : `/${p}`}`,
  isBackendAvailable: () => true,
  isCloudOffline: () => false,
  isRelayOriginPage: () => false,
  getWebSocketUrl: () => null,
  getCloudWebSocketUrl: () => null,
  getRelayWebSocketUrl: () => null,
  getBackendUrl: () => process.env.OB_BACKEND_URL
}))

const seed = `match_join_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const GAME_PIN = String(100000 + Math.floor(Math.random() * 800000))

describe.skipIf(!BASE || !ADMIN.email || !INDOOR.email)('Join OpenBeach on a local OpenVolley backend', () => {
  let db, api, queue, access
  const store = new Map()

  // The admin works next to the app (its own session, plain fetch)
  const adminCall = async (method, path, body) => {
    const inn = await fetch(`${BASE}/api/auth/sign-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) })
    const token = (await inn.json()).data.session.access_token
    const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, json: await res.json() }
  }
  const beachAccess = async () => {
    const { data, error } = await api.apiMe()
    expect(error).toBeNull()
    return access.accessFromMe(data, data.roles)
  }

  beforeAll(async () => {
    const ls = window.localStorage
    ls.getItem.mockImplementation((k) => (store.has(k) ? store.get(k) : null))
    ls.setItem.mockImplementation((k, v) => { store.set(k, String(v)) })
    ls.removeItem.mockImplementation((k) => { store.delete(k) })
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    ;({ db } = await import('../../db_beach/db_beach'))
    api = await import('../../lib_beach/apiClient_beach')
    queue = await import('../../hooks_beach/useSyncQueue_beach')
    access = await import('../../lib_beach/access_beach')
  })
  afterAll(() => { db?.close() })

  it('an OpenVolley account signs in to OpenBeach and is told to join', async () => {
    const inn = await api.apiAuth.signInWithPassword(INDOOR)
    expect(inn.error, JSON.stringify(inn.error)).toBeNull()
    const a = await beachAccess()
    expect(a).toMatchObject({ needsJoin: true, isPending: true, canScore: false, member: false })
  })

  it('before the join the backend refuses its beach match: the job is parked, not lost', async () => {
    await db.matches.add({ seed_key: seed, gamePin: GAME_PIN, status: 'live' })
    await db.sync_queue.add({
      resource: 'match', action: 'insert', status: 'queued', ts: new Date().toISOString(), payload: {
        external_id: seed, status: 'live', game_n: 4242, game_pin: GAME_PIN, test: false, scheduled_at: new Date().toISOString(),
        team1_data: { name: 'Muster / Beispiel' }, team2_data: { name: 'Rossi / Bianchi' }
      }
    })
    const outcome = await queue.runQueuePass()
    expect(outcome.authRequired).toBe(false)
    const [job] = await db.sync_queue.toArray()
    expect(['failed', 'error']).toContain(job.status)
  })

  it('Join OpenBeach: a member now, waiting for approval', async () => {
    const { data, error } = await api.apiJoinBeach()
    expect(error).toBeNull()
    expect(data).toMatchObject({ app: 'beach', member: true, already_member: false })
    const a = await beachAccess()
    expect(a).toMatchObject({ needsJoin: false, isPending: true, canScore: false, member: true })
  })

  it('redeems a beach invite code an admin made: beach:scorer, and the parked match is sent', async () => {
    const made = await adminCall('POST', '/api/admin/invites?app=beach', { label: 'Join e2e', role: 'scorer', sport: 'beach' })
    expect(made.status, JSON.stringify(made.json)).toBe(201)
    expect(made.json.data.invite.sport).toBe('beach')
    const { data, error } = await api.apiRedeemInvite(made.json.data.code)
    expect(error, JSON.stringify(error)).toBeNull()
    expect(data.roles).toContain('beach:scorer')
    const a = await beachAccess()
    expect(a).toMatchObject({ needsJoin: false, isPending: false, canScore: true })

    // What the access change does in the app (useSyncQueue_beach's listener)
    await queue.retryErrorsInternal({ force: true, includeFailed: true })
    const outcome = await queue.runQueuePass()
    expect(outcome.authRequired).toBe(false)
    const left = await db.sync_queue.where('status').noneOf(['sent']).toArray()
    expect(left.map(j => [j.resource, j.status, j.last_error])).toEqual([])
    const { data: m, error: readError } = await api.apiFrom('matches').select('id, sport_type, external_id').eq('external_id', seed).maybeSingle()
    expect(readError).toBeNull()
    expect(m).toMatchObject({ sport_type: 'beach', external_id: seed })
  })

  it('the indoor roles are untouched', async () => {
    const { data } = await api.apiMe()
    expect(data.apps.indoor).toMatchObject({ member: true, canScore: true })
    expect(data.roles).toEqual(expect.arrayContaining(['scorer', 'beach:scorer']))
  })
})
