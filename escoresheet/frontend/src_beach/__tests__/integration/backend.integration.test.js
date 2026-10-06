/**
 * openbeach against a REAL OpenVolley backend (server.js + Postgres), opt-in:
 *
 *   OB_BACKEND_URL=http://127.0.0.1:<port> npx vitest run src_beach/__tests__/integration
 *
 * Point it at a LOCAL throwaway backend only (it signs up accounts and writes
 * matches); never at backend.openvolley.app. Skipped without OB_BACKEND_URL.
 * A local backend: in the openvolley repo, escoresheet/backend's
 * tests/helpers/e2eServer.js (provisionDatabase with OV_E2E_DOCKER=1, then
 * bootServer with DATABASE_URL, STORAGE_ROOT, STATUS_DIR, OV_PIN_SECRET).
 * The backend limits sign-ups per IP: use a fresh backend for each run.
 *
 * Covers the Phase 1 contract end to end with the real client code
 * (apiClient_beach, useSyncQueue_beach's queue pass, Dexie on fake-indexeddb):
 * the session gate, match-scoped ids and sport_type 'beach', the take-over by
 * game PIN, the one-call restore, the server-side beach PIN check and the
 * match token, the livescore list, beach/ scoresheets and delete account.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

const BASE = process.env.OB_BACKEND_URL || ''

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `${process.env.OB_BACKEND_URL}${p.startsWith('/') ? p : `/${p}`}`,
  isBackendAvailable: () => true,
  getWebSocketUrl: () => null,
  getBackendUrl: () => process.env.OB_BACKEND_URL
}))

const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const seed = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const GAME_PIN = String(100000 + Math.floor(Math.random() * 800000))
const REF_PIN = String(100000 + Math.floor(Math.random() * 800000))
const T1_PIN = String(100000 + Math.floor(Math.random() * 800000))

describe.skipIf(!BASE)('openbeach on a local OpenVolley backend', () => {
  let db, api, queue, sync, ids, scoresheets, savedDeps
  const store = new Map()

  const signUpAndIn = async (name) => {
    const email = `${name}-${tag}@example.ch`
    const password = `t-${tag}-${Math.random().toString(36).slice(2)}` // throwaway account on a local backend
    const up = await api.apiAuth.signUp({ email, password, options: { data: { first_name: name } } })
    expect(up.error, JSON.stringify(up.error)).toBeNull()
    const inn = await api.apiAuth.signInWithPassword({ email, password })
    expect(inn.error, JSON.stringify(inn.error)).toBeNull()
    return inn.data.user
  }
  const signOutLocally = () => store.delete('api_auth_token')

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
    queue = await import('../../hooks_beach/useSyncQueue_beach')
    sync = await import('../../utils_beach/serverDataSync_beach')
    ids = await import('../../utils_beach/syncIds_beach')
    scoresheets = await import('../../utils_beach/scoresheetUploader_beach')
  })
  afterAll(() => {
    db?.close()
    if (savedDeps) Object.assign(Dexie.dependencies, savedDeps)
  })

  let matchUuid
  let localMatchId

  it('signed out: the queue sends nothing and waits for a sign-in', async () => {
    localMatchId = await db.matches.add({
      seed_key: seed, gamePin: GAME_PIN, refereePin: REF_PIN, team1Pin: T1_PIN, status: 'live',
      refereeConnectionEnabled: true, team1TeamConnectionEnabled: true
    })
    const setId = await db.sets.add({ matchId: localMatchId, index: 1, team1Points: 0, team2Points: 0, finished: false })
    const evId = await db.events.add({ matchId: localMatchId, setIndex: 1, type: 'point', seq: 2 })
    await db.sync_queue.bulkAdd([
      { resource: 'match', action: 'insert', status: 'queued', ts: new Date().toISOString(), payload: {
        external_id: seed, status: 'live', game_n: 7, game_pin: GAME_PIN, test: false, scheduled_at: new Date().toISOString(),
        team1_data: { name: 'Muster / Beispiel', color: '#ef4444' }, team2_data: { name: 'Rossi / Bianchi', color: '#3b82f6' },
        players_team1: [{ number: 1, first_name: 'Anna', last_name: 'Muster' }, { number: 2, first_name: 'Bea', last_name: 'Beispiel' }],
        players_team2: [{ number: 1, first_name: 'Lia', last_name: 'Rossi' }, { number: 2, first_name: 'Eva', last_name: 'Bianchi' }],
        connections: { referee_enabled: true, team1_bench_enabled: true },
        connection_pins: { referee: REF_PIN }
      } },
      { resource: 'set', action: 'insert', status: 'queued', ts: new Date().toISOString(), payload: { external_id: ids.setExtId(seed, setId), match_id: seed, index: 1, team1_points: 0, team2_points: 0, finished: false } },
      { resource: 'event', action: 'insert', status: 'queued', ts: new Date().toISOString(), payload: { external_id: ids.eventExtId(seed, evId), match_id: seed, set_index: 1, type: 'point', seq: 2, payload: { team: 'team1' } } },
      { resource: 'set', action: 'update', status: 'queued', ts: new Date().toISOString(), payload: { external_id: ids.setExtId(seed, setId), team1_points: 21, team2_points: 19, finished: true } }
    ])
    signOutLocally()
    expect(queue.hasStoredSessionToken()).toBe(false)
    // A pass that still tries (stale token elsewhere) gets 401 and stops
    const outcome = await queue.runQueuePass()
    expect(outcome.authRequired).toBe(true)
    expect(await db.sync_queue.where('status').equals('queued').count()).toBe(4)
  })

  it('signed in: the queue drains; rows are beach rows with match-scoped ids', async () => {
    await signUpAndIn('alice')
    const outcome = await queue.runQueuePass()
    expect(outcome.authRequired).toBe(false)
    const left = await db.sync_queue.where('status').noneOf(['sent']).toArray()
    expect(left.map(j => [j.resource, j.action, j.status, j.last_error])).toEqual([])

    const { data: m, error } = await api.apiFrom('matches').select('id, sport_type, external_id').eq('external_id', seed).maybeSingle()
    expect(error).toBeNull()
    expect(m.sport_type).toBe('beach')
    matchUuid = m.id
    const { data: sets } = await api.apiFrom('sets').select('external_id, sport_type, team1_points, finished').eq('match_id', matchUuid)
    expect(sets).toHaveLength(1)
    expect(sets[0].external_id.startsWith(`${seed}:s:`)).toBe(true)
    expect(sets[0]).toMatchObject({ sport_type: 'beach', team1_points: 21, finished: true })
    const { data: events } = await api.apiFrom('events').select('external_id, sport_type').eq('match_id', matchUuid)
    expect(events[0].external_id.startsWith(`${seed}:e:`)).toBe(true)
    expect(events[0].sport_type).toBe('beach')
  })

  it('the live state is a beach row the livescore list finds', async () => {
    const { error } = await api.apiFrom('match_live_state').upsert({ match_id: matchUuid, sport_type: 'beach', team_a_name: 'Muster / Beispiel', team_b_name: 'Rossi / Bianchi', points_a: 3, points_b: 2, server_number: 1, updated_at: new Date().toISOString() }, { onConflict: 'match_id' })
    expect(error).toBeNull()
    signOutLocally() // the livescore page is anonymous
    const { data, error: listError } = await api.apiFrom('match_live_state')
      .select('*, matches!match_live_state_match_id_fkey_cascade(set_results)')
      .eq('sport_type', 'beach')
      .order('updated_at', { ascending: false })
    expect(listError).toBeNull()
    expect(data.some(r => r.match_id === matchUuid)).toBe(true)
    expect(data.every(r => r.sport_type === 'beach')).toBe(true)
  })

  it('the referee PIN is checked on the server; its token unlocks the rosters', async () => {
    const wrong = await sync.validatePinSupabase('000001', 'referee')
    expect(wrong.success).toBe(false)
    const ok = await sync.validatePinSupabase(REF_PIN, 'referee')
    expect(ok.success, ok.error).toBe(true)
    expect(ok.match.id).toBe(seed)
    expect(ok.token).toBeTruthy()
    const team = await sync.validatePinSupabase(T1_PIN, 'bench_team1')
    expect(team.success, team.error).toBe(true)

    const anon = await api.apiFrom('matches').select('*').eq('external_id', seed).maybeSingle()
    expect(anon.data).toBeTruthy()
    expect(anon.data.players_team1).toBeUndefined()
    const withToken = await api.apiFrom('matches').headers(sync.matchAccessHeaders(seed)).select('*').eq('external_id', seed).maybeSingle()
    expect(withToken.data.players_team1).toHaveLength(2)
  })

  it('a second account is refused (403) until it proves the game PIN, then takes over', async () => {
    await signUpAndIn('bob')
    // Wrong game PIN on this device: the take-over is refused, the job parked
    await db.matches.update(localMatchId, { gamePin: '999999' })
    const jobId = await db.sync_queue.add({ resource: 'match', action: 'update', status: 'queued', ts: new Date().toISOString(), payload: { id: seed, status: 'ended' } })
    await queue.runQueuePass()
    expect((await db.sync_queue.get(jobId)).status).toBe('failed')
    expect((await db.sync_queue.get(jobId)).last_error.code).toBe('OV_NOT_MATCH_OWNER')

    // The right game PIN: processJob claims and writes
    await db.matches.update(localMatchId, { gamePin: GAME_PIN })
    queue.resetQueueHousekeeping() // the claim retry window
    await db.sync_queue.update(jobId, { status: 'queued' })
    await queue.runQueuePass()
    expect((await db.sync_queue.get(jobId)).status).toBe('sent')
    const { data } = await api.apiFrom('matches').select('status').eq('external_id', seed).maybeSingle()
    expect(data.status).toBe('ended')
  })

  it('a backup restore is one /api/match/restore with beach rows', async () => {
    const jobId = await db.sync_queue.add({ resource: 'match', action: 'restore', status: 'queued', ts: new Date().toISOString(), payload: {
      match: { external_id: seed, status: 'live', game_n: 7, team1_data: { name: 'Muster / Beispiel' }, team2_data: { name: 'Rossi / Bianchi' } },
      sets: [{ external_id: `${seed}_set_1`, index: 1, team1_points: 15, team2_points: 10, finished: false }],
      events: [{ external_id: `${seed}_event_1`, set_index: 1, type: 'point', seq: 1, payload: { team: 'team2' } }],
      liveState: { points_a: 15, points_b: 10 }
    } })
    await queue.runQueuePass()
    const job = await db.sync_queue.get(jobId)
    expect(job.status, JSON.stringify(job.last_error)).toBe('sent')
    const { data: sets } = await api.apiFrom('sets').select('external_id, sport_type').eq('match_id', matchUuid)
    expect(sets.map(s => s.external_id)).toEqual([`${seed}_set_1`])
    expect(sets[0].sport_type).toBe('beach')
  })

  it('scoresheets go under beach/', async () => {
    // A game number of its own: a scoresheet path belongs to its uploader
    const n = Date.now() % 1000000
    const r = await scoresheets.uploadScoresheet({ match: { scheduledAt: '2026-07-04T10:00:00Z', gameNumber: n }, team1: {}, team2: {}, team1Players: [], team2Players: [], sets: [], events: [] })
    expect(r).toEqual({ success: true, path: `beach/2026-07-04/game${n}.json` })
    const { data, error } = await api.apiStorage.from('scoresheets').list('beach/2026-07-04')
    expect(error).toBeNull()
    expect(data.map(f => f.name)).toContain(`game${n}.json`)
  })

  it('delete account works and signs out', async () => {
    const r = await api.apiAuth.deleteUser()
    expect(r.error, JSON.stringify(r.error)).toBeNull()
    expect(store.has('api_auth_token')).toBe(false)
  })
})
