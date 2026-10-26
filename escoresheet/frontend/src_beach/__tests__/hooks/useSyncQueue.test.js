import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// In-memory stand-ins for the Dexie tables and the /api/db client
// ---------------------------------------------------------------------------

function fakeTable(rows = []) {
  const map = new Map(rows.map(r => [r.id, { ...r }]))
  const collection = (pred) => ({
    toArray: async () => [...map.values()].filter(pred).sort((a, b) => a.id - b.id),
    first: async () => [...map.values()].filter(pred)[0],
    count: async () => [...map.values()].filter(pred).length,
    and: (fn) => collection(r => pred(r) && fn(r))
  })
  return {
    map,
    reset(newRows) {
      map.clear()
      for (const r of newRows) map.set(r.id, { ...r })
    },
    get: async (id) => map.get(id),
    add: async (row) => {
      const id = Math.max(0, ...map.keys()) + 1
      map.set(id, { ...row, id })
      return id
    },
    update: async (id, changes) => {
      const row = map.get(id)
      if (!row) return 0
      map.set(id, { ...row, ...changes })
      return 1
    },
    where: (field) => ({
      equals: (value) => collection(r => r[field] === value),
      anyOf: (...values) => collection(r => values.flat().includes(r[field]))
    }),
    filter: (fn) => collection(fn),
    bulkDelete: async (ids) => { for (const id of ids) map.delete(id) },
    hook: () => {}
  }
}

// Module load installs a Dexie 'creating' hook on sync_queue
const fakeDb = vi.hoisted(() => ({ sync_queue: { hook: () => {} } }))
vi.mock('../../db_beach/db_beach', () => ({ db: fakeDb }))

// Dexie's live queries only observe real Dexie tables: run the query once per
// dependency change against the fakes instead
vi.mock('dexie-react-hooks', async () => {
  const { useState, useEffect } = await import('react')
  return {
    useLiveQuery: (query, deps = [], initial) => {
      const [value, setValue] = useState(initial)
      useEffect(() => {
        let alive = true
        Promise.resolve(query()).then(v => { if (alive) setValue(v) })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps)
      return value
    }
  }
})

// Every apiFrom call is recorded; `respond` decides the result.
// apiMatchRestore (POST /api/match/restore) is recorded as a call on table '__restore'.
const api = vi.hoisted(() => ({ calls: [], respond: null }))
vi.mock('../../lib_beach/apiClient_beach', () => {
  function builder(table) {
    const call = { table, action: null, data: null, filters: [], returning: null }
    const b = {
      select(cols) {
        if (call.action) call.returning = cols || '*'
        else { call.action = 'select'; call.columns = cols }
        return b
      },
      insert(d) { call.action = 'insert'; call.data = d; return b },
      upsert(d, o) { call.action = 'upsert'; call.data = d; call.onConflict = o?.onConflict; return b },
      update(d) { call.action = 'update'; call.data = d; return b },
      delete() { call.action = 'delete'; return b },
      eq(c, v) { call.filters.push(['eq', c, v]); return b },
      in(c, v) { call.filters.push(['in', c, v]); return b },
      limit() { return b },
      single() { return b },
      maybeSingle() { call.maybeSingle = true; return b },
      then(resolve, reject) {
        api.calls.push(call)
        return Promise.resolve()
          .then(() => api.respond(call))
          .then(resolve, reject)
      }
    }
    return b
  }
  return {
    AUTH_TOKEN_CHANGE_EVENT: 'api-auth-token-change',
    AUTH_TOKEN_STORAGE_KEY: 'api_auth_token',
    BACKEND_REACHED_EVENT: 'ob-backend-reached',
    apiFrom: (table) => builder(table),
    apiMatchRestore: async (payload) => {
      const call = { table: '__restore', action: 'restore', data: payload, filters: [] }
      api.calls.push(call)
      return api.respond(call)
    },
    apiMatchClaim: async (externalId, pin) => {
      const call = { table: '__claim', action: 'claim', data: { externalId, pin }, filters: [] }
      api.calls.push(call)
      return api.respond(call)
    },
    apiMatchScorer: async (externalId, opts) => {
      const call = { table: '__scorer', action: opts?.claim === false ? 'status' : 'claim', data: { externalId }, filters: [] }
      api.calls.push(call)
      return api.respond(call)
    },
    apiPostActivity: async (entries) => {
      const call = { table: '__activity', action: 'post', data: { entries }, filters: [] }
      api.calls.push(call)
      return api.respond(call)
    },
    apiPostEventRevisions: async (matchExternalId, revisions) => {
      const call = { table: '__revisions', action: 'post', data: { matchExternalId, revisions }, filters: [] }
      api.calls.push(call)
      return api.respond(call)
    },
    apiStorage: {
      from: (bucket) => ({
        upload: async (path, file, options) => {
          const call = { table: '__storage', action: 'upload', data: { bucket, path, file, options }, filters: [] }
          api.calls.push(call)
          return api.respond(call)
        }
      })
    }
  }
})

// The activity log (utils_beach/activity/bus_beach): what the queue reports
const activity = vi.hoisted(() => ({ entries: [], passes: [] }))
vi.mock('../../utils_beach/activity/bus_beach', () => ({
  emitActivity: (kind, data, opts) => activity.entries.push({ kind, data, opts }),
  noteSyncPass: (o) => activity.passes.push(o)
}))

const venue = vi.hoisted(() => ({ relayOrigin: false }))
vi.mock('../../utils_beach/backendConfig_beach', () => ({ getApiUrl: (p) => `http://backend.test${p}`, getCloudApiUrl: (p) => `http://backend.test${p}`, isCloudOffline: () => false, isRelayOriginPage: () => venue.relayOrigin }))

import {
  syncDbUrl,
  runQueuePass,
  retryErrorsInternal,
  payloadCovers,
  errorBackoffMs,
  isAuthError,
  isPermanentError,
  redactForLog,
  getSyncQueueStats,
  clearAuthBlock,
  resetQueueHousekeeping,
  pruneSyncQueue,
  hasApplicationErrorCode,
  useSyncQueue,
  storedSessionUserId,
  processJob,
  takeJobError,
  probeErrorStatus,
  STOP_PASS,
  checkScorerMoved,
  matchEndUpdateNeeded,
  SCORER_MOVED_EVENT,
  setPageLoadedAtForTests,
  withQueueLock,
  QUEUE_LOCK_NAME
} from '../../hooks_beach/useSyncQueue_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
import { holdLiveState, heldLiveState, resetLiveStateOutboxForTests } from '../../utils_beach/liveStateOutbox_beach'

// Ported from OpenVolley src/hooks/__tests__/useSyncQueue.test.js: the queue's
// session gate (401 pause, resume on sign-in), take-over by game PIN, the
// one-call restore, failure classes and log redaction, with openbeach's
// sport_type 'beach', team1/team2 PIN keys and no My Matches jobs.

const MATCH_UUID = '11111111-2222-4333-8444-555555555555'
const ok = (data = null) => ({ data, error: null })

// Default backend: the match exists, every write succeeds
function defaultRespond(call) {
  if (call.table === 'matches' && call.action === 'select') return ok({ id: MATCH_UUID })
  return ok()
}

beforeEach(() => {
  useMemoryLocalStorage()
  fakeDb.sync_queue = fakeTable()
  fakeDb.matches = fakeTable([{ id: 1, seed_key: 'match_100_aaa', refereePin: '111111', team1Pin: '222222', team2Pin: '333333', team1UploadPin: '444444' }])
  fakeDb.sets = fakeTable([{ id: 5, matchId: 1, index: 1 }])
  fakeDb.events = fakeTable([{ id: 9, matchId: 1, type: 'coin_toss' }])
  api.calls = []
  api.respond = defaultRespond
  clearAuthBlock()
  resetQueueHousekeeping()
})

describe('runQueuePass', () => {
  it('deleting a match that is closed on the server is done: the server keeps it, the job is not refused', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'delete', status: 'queued', retry_count: 0, payload: { id: 'match_100_aaa' } }
    ])
    const closed = { data: null, error: { message: 'Match is closed', code: 'OV_MATCH_CLOSED', status: 409 } }
    api.respond = (call) => (call.action === 'delete' ? closed : defaultRespond(call))
    const outcome = await runQueuePass()
    expect(api.calls.some(c => c.table === 'matches' && c.action === 'delete')).toBe(true)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(outcome.hasFailed).toBeFalsy()
    expect(fakeDb.matches.map.get(1).cloudBlock).toBeFalsy()
  })

  it('a write refused as OV_NOT_MATCH_OWNER takes the match over with the local game PIN, then is sent', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', gamePin: '864201' }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } }
    ])
    let claimed = false
    api.respond = (call) => {
      if (call.table === '__claim') {
        claimed = true
        return { data: { role: 'editor' }, error: null, status: 200 }
      }
      if (call.action === 'upsert' && !claimed) return { data: null, error: { message: 'Database operation failed', code: 'OV_NOT_MATCH_OWNER', status: 403 } }
      return defaultRespond(call)
    }
    const outcome = await runQueuePass()
    const claims = api.calls.filter(c => c.table === '__claim')
    expect(claims).toEqual([{ table: '__claim', action: 'claim', data: { externalId: 'match_100_aaa', pin: '864201' }, filters: [] }])
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
    expect(outcome.hasFailed).toBe(false)
  })

  it('without the game PIN, or when the take-over is refused, the job is parked as failed (one claim per pass)', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', gamePin: '864201' }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => {
      if (call.table === '__claim') return { data: null, error: { code: 'OV_NOT_FOUND', status: 404 }, status: 404 }
      if (call.action === 'upsert') return { data: null, error: { message: 'Database operation failed', code: 'OV_NOT_MATCH_OWNER', status: 403 } }
      return defaultRespond(call)
    }
    await runQueuePass()
    expect(api.calls.filter(c => c.table === '__claim')).toHaveLength(1)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')

    // No local game PIN: no claim at all
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa' }])
    fakeDb.sync_queue.reset([
      { id: 3, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:3', match_id: 'match_100_aaa' } }
    ])
    api.calls = []
    await runQueuePass()
    expect(api.calls.filter(c => c.table === '__claim')).toHaveLength(0)
    expect(fakeDb.sync_queue.map.get(3).status).toBe('failed')
  })

  it('processJob itself takes over (the direct set-end / match-end sync too) and requeues the match\'s parked jobs', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', gamePin: '864201' }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'failed', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'failed', payload: { external_id: 'match_other:e:1', match_id: 'match_other' } },
      { id: 3, resource: 'set', action: 'insert', status: 'sending', payload: { external_id: 'match_100_aaa:s:2', match_id: 'match_100_aaa', index: 2 } }
    ])
    let claimed = false
    api.respond = (call) => {
      if (call.table === '__claim') {
        claimed = true
        return { data: { role: 'editor' }, error: null, status: 200 }
      }
      if (call.action === 'upsert' && !claimed) return { data: null, error: { message: 'Database operation failed', code: 'OV_NOT_MATCH_OWNER', status: 403 } }
      return defaultRespond(call)
    }
    const job = fakeDb.sync_queue.map.get(3)
    expect(await processJob(job)).toBe(true)
    expect(takeJobError(3)).toBeNull()
    expect(api.calls.filter(c => c.table === '__claim')).toHaveLength(1)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('failed', 'another match stays parked')

    // A refused take-over is not repeated by every job within the minute
    claimed = false
    api.calls = []
    api.respond = (call) => {
      if (call.table === '__claim') return { data: null, error: { code: 'OV_NOT_FOUND', status: 404 }, status: 404 }
      if (call.action === 'upsert') return { data: null, error: { message: 'Database operation failed', code: 'OV_NOT_MATCH_OWNER', status: 403 } }
      return defaultRespond(call)
    }
    resetQueueHousekeeping()
    const other = { id: 9, resource: 'event', action: 'insert', status: 'sending', payload: { external_id: 'match_100_aaa:e:9', match_id: 'match_100_aaa' } }
    await processJob(other)
    await processJob({ ...other, id: 10 })
    expect(api.calls.filter(c => c.table === '__claim')).toHaveLength(1)
  })

  it('a 429 leaves the job queued untouched and stops the pass', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => {
      if (call.action === 'upsert') return { data: null, error: { message: 'Too many requests', status: 429 } }
      return defaultRespond(call)
    }

    const outcome = await runQueuePass()

    expect(outcome.stopped).toBe(true)
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued', retry_count: 0 })
    expect(fakeDb.sync_queue.map.get(2)).toMatchObject({ status: 'queued', retry_count: 0 })
    // the second event was never sent
    expect(api.calls.filter(c => c.action === 'upsert')).toHaveLength(1)
  })

  it('a network failure leaves the job queued and stops the pass', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } }
    ])
    api.respond = () => { throw new TypeError('Failed to fetch') }

    const outcome = await runQueuePass()
    expect(outcome.stopped).toBe(true)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
  })

  it('a 5xx is retried later, not marked as an error', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => (call.action === 'upsert' ? { data: null, error: { message: 'Database operation failed', status: 503 } } : defaultRespond(call))

    const outcome = await runQueuePass()
    expect(outcome.hasError).toBe(false)
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued', retry_count: 1 })
  })

  it('a refused set insert holds back the later update of the same set (per-entity FIFO)', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', match_id: 'match_100_aaa', index: 1 } },
      { id: 2, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', finished: true } }
    ])
    api.respond = (call) => (call.table === 'sets' && call.action === 'upsert'
      ? { data: null, error: { message: 'Database operation failed', code: 'OV_INVALID_DATA', status: 400 } }
      : defaultRespond(call))

    const outcome = await runQueuePass()
    expect(outcome.hasError).toBe(true)
    expect(outcome.hasFailed).toBe(true)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')
    expect(fakeDb.sync_queue.map.get(1).attempts).toBe(1)
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(api.calls.some(c => c.table === 'sets' && c.action === 'update')).toBe(false)
  })

  it('an errored set insert holds back newer jobs of that set in later passes (#58)', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'insert', status: 'error', attempts: 1, next_attempt_at: Date.now() + 30000, payload: { external_id: 'match_100_aaa:s:5', match_id: 'match_100_aaa', index: 1 } },
      { id: 2, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', team1_points: 25, finished: true } },
      // another set of the same match is not held back
      { id: 3, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:6', team1_points: 3 } }
    ])

    const outcome = await runQueuePass()
    expect(outcome.hasRetry).toBe(true)
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(fakeDb.sync_queue.map.get(3).status).toBe('sent')
    const updates = api.calls.filter(c => c.table === 'sets' && c.action === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].data).toEqual({ team1_points: 3, sport_type: 'beach' })
  })

  it('an errored match insert holds back every newer job of that match', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'error', payload: { external_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 3, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_200_bbb:e:1', match_id: 'match_200_bbb' } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(fakeDb.sync_queue.map.get(3).status).toBe('sent')
  })

  it('a job claimed as "sending" holds back newer jobs of the same set', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'sending', sending_since: Date.now(), payload: { external_id: 'match_100_aaa:s:5', finished: true } },
      { id: 2, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', team1_points: 1 } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(api.calls.some(c => c.table === 'sets' && c.action === 'update')).toBe(false)
  })

  it('an errored update does not stall newer updates of the same row', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'error', payload: { external_id: 'match_100_aaa:s:5', team1_points: 10 } },
      { id: 2, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', team1_points: 11 } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('a queued job older than the errored one is not held back', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', team1_points: 1 } },
      { id: 2, resource: 'set', action: 'insert', status: 'error', payload: { external_id: 'match_100_aaa:s:5', match_id: 'match_100_aaa', index: 1 } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  it('namespaces a bare set id and scopes the set update to its match', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'queued', payload: { external_id: '5', finished: true } }
    ])

    await runQueuePass()

    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(1).payload.external_id).toBe('match_100_aaa:s:5')
    const update = api.calls.find(c => c.table === 'sets' && c.action === 'update')
    expect(update.data).toEqual({ finished: true, sport_type: 'beach' })
    expect(update.filters).toEqual([
      ['eq', 'match_id', MATCH_UUID],
      ['in', 'external_id', ['match_100_aaa:s:5', '5']]
    ])
  })

  it('drops a set/event job that cannot be attributed to a match', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '41' } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('dropped')
    expect(api.calls.some(c => c.table === 'events')).toBe(false)
  })

  it('sends connection_pins whole from the local match, never a read-merge', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'update', status: 'queued', payload: { id: 'match_100_aaa', connection_pins: { referee: '111111' } } }
    ])

    await runQueuePass()

    expect(api.calls.some(c => c.table === 'matches' && c.action === 'select')).toBe(false)
    const update = api.calls.find(c => c.table === 'matches' && c.action === 'update')
    expect(update.data.connection_pins).toEqual({
      referee: '111111',
      bench_team1: '222222',
      bench_team2: '333333',
      upload_team1: '444444'
    })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  const restoreJob = () => ({
    id: 1,
    resource: 'match',
    action: 'restore',
    status: 'queued',
    payload: {
      match: { external_id: 'match_100_aaa', status: 'live', not_a_column: 1 },
      sets: [{ external_id: 'match_100_aaa:s:1', index: 1 }],
      events: [{ external_id: 'match_100_aaa:e:1', seq: 1 }],
      liveState: { match_status: 'live' }
    }
  })

  it('restore is ONE /api/match/restore call (no client-side delete/upsert steps)', async () => {
    fakeDb.sync_queue.reset([restoreJob()])
    api.respond = (call) => (call.table === '__restore'
      ? ok({ id: MATCH_UUID, counts: { sets: 1, events: 1, liveState: 1 } })
      : defaultRespond(call))

    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(api.calls.map(c => c.table)).toEqual(['__restore'])
    const sent = api.calls[0].data
    expect(sent.match.external_id).toBe('match_100_aaa')
    expect(sent.match.not_a_column).toBeUndefined()
    expect(sent.sets).toHaveLength(1)
    expect(sent.events).toHaveLength(1)
    // Every row of the restore is a beach row
    expect(sent.match.sport_type).toBe('beach')
    expect(sent.sets[0].sport_type).toBe('beach')
    expect(sent.events[0].sport_type).toBe('beach')
    expect(sent.liveState).toEqual({ match_status: 'live', sport_type: 'beach' })
  })

  it('restore sends the full beach connection_pins from the local match', async () => {
    const job = restoreJob()
    job.payload.match.connection_pins = { referee: '111111' }
    fakeDb.sync_queue.reset([job])
    api.respond = (call) => (call.table === '__restore' ? ok({ id: MATCH_UUID }) : defaultRespond(call))
    await runQueuePass()
    expect(api.calls[0].data.match.connection_pins).toEqual({
      referee: '111111', bench_team1: '222222', bench_team2: '333333', upload_team1: '444444'
    })
  })

  it('restore refused by the server (400, rolled back) is parked as failed', async () => {
    fakeDb.sync_queue.reset([restoreJob()])
    api.respond = (call) => (call.table === '__restore'
      ? { data: null, error: { message: 'Database operation failed', code: 'OV_UNSCOPED_EXTERNAL_ID', status: 400 } }
      : defaultRespond(call))

    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'failed', last_error: { status: 400, code: 'OV_UNSCOPED_EXTERNAL_ID' } })
  })

  it('restore that throws (no HTTP answer) is retried with backoff', async () => {
    fakeDb.sync_queue.reset([restoreJob()])
    api.respond = (call) => {
      if (call.table === '__restore') throw new Error('boom')
      return defaultRespond(call)
    }
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('error')
    expect(fakeDb.sync_queue.map.get(1).next_attempt_at).toBeGreaterThan(Date.now())
  })

  it('restore stays queued on 426 (old bundle) and 5xx', async () => {
    for (const status of [426, 503]) {
      fakeDb.sync_queue.reset([restoreJob()])
      api.respond = (call) => (call.table === '__restore'
        ? { data: null, error: { message: 'x', status } }
        : defaultRespond(call))
      await runQueuePass()
      const job = fakeDb.sync_queue.map.get(1)
      expect(job.status, String(status)).toBe('queued')
      expect(job.retry_count, String(status)).toBe(1)
    }
  })
})

describe('retryErrorsInternal', () => {
  it('marks a stale errored match update as superseded by a newer sent one', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'update', status: 'error', payload: { id: 'match_100_aaa', status: 'live', match_info: { hall: 'A' } } },
      { id: 2, resource: 'match', action: 'update', status: 'sent', payload: { id: 'match_100_aaa', status: 'ended', match_info: { hall: 'B', city: 'Z' } } }
    ])

    await retryErrorsInternal({ force: true })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('superseded')
  })

  it('keeps only the fields no newer sent update wrote', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'update', status: 'error', payload: { id: 'match_100_aaa', status: 'live', winner: 'home', match_info: { hall: 'A', city: 'Y' } } },
      { id: 2, resource: 'match', action: 'update', status: 'sent', payload: { id: 'match_100_aaa', status: 'ended', match_info: { hall: 'B' } } }
    ])

    await retryErrorsInternal({ force: true })
    const job = fakeDb.sync_queue.map.get(1)
    expect(job.status).toBe('queued')
    // the stale 'live' must not be replayed over 'ended'
    expect(job.payload).toEqual({ id: 'match_100_aaa', winner: 'home', match_info: { city: 'Y' } })
  })

  it('ignores sent updates of other matches and older ones', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'update', status: 'sent', payload: { id: 'match_100_aaa', status: 'setup' } },
      { id: 2, resource: 'match', action: 'update', status: 'error', payload: { id: 'match_100_aaa', status: 'live' } },
      { id: 3, resource: 'match', action: 'update', status: 'sent', payload: { id: 'match_200_bbb', status: 'ended' } }
    ])

    await retryErrorsInternal({ force: true })
    expect(fakeDb.sync_queue.map.get(2)).toMatchObject({ status: 'queued', payload: { id: 'match_100_aaa', status: 'live' } })
  })

  it('trims a stale errored set update against a newer sent one', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'error', payload: { external_id: 'match_100_aaa:s:5', team1_points: 10, sport_type: 'beach' } },
      { id: 2, resource: 'set', action: 'update', status: 'sent', payload: { external_id: 'match_100_aaa:s:5', team1_points: 12, sport_type: 'beach' } },
      { id: 3, resource: 'set', action: 'update', status: 'error', payload: { external_id: 'match_100_aaa:s:5', team2_points: 4 } },
      { id: 4, resource: 'set', action: 'update', status: 'sent', payload: { external_id: 'match_100_aaa:s:5', team1_points: 13, finished: true } },
      { id: 5, resource: 'set', action: 'update', status: 'error', payload: { external_id: 'match_100_aaa:s:6', team1_points: 2, finished: false } },
      { id: 6, resource: 'set', action: 'update', status: 'sent', payload: { external_id: 'match_100_aaa:s:6', team1_points: 3 } }
    ])

    await retryErrorsInternal({ force: true })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('superseded')
    expect(fakeDb.sync_queue.map.get(3)).toMatchObject({ status: 'queued', payload: { external_id: 'match_100_aaa:s:5', team2_points: 4 } })
    expect(fakeDb.sync_queue.map.get(5)).toMatchObject({ status: 'queued', payload: { external_id: 'match_100_aaa:s:6', finished: false } })
    expect(fakeDb.sync_queue.map.get(5).payload.team1_points).toBeUndefined()
  })

  it('respects each job\'s backoff unless forced', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'error', next_attempt_at: Date.now() + 60000, payload: {} },
      { id: 2, resource: 'event', action: 'insert', status: 'error', next_attempt_at: Date.now() - 1, payload: {} }
    ])

    await retryErrorsInternal()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('error')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')

    await retryErrorsInternal({ force: true })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
  })

  it('hands back abandoned "sending" jobs', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'sending', sending_since: Date.now() - 10 * 60 * 1000, payload: {} },
      { id: 2, resource: 'set', action: 'update', status: 'sending', sending_since: Date.now(), payload: {} }
    ])
    await retryErrorsInternal()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sending')
  })

  // Stress test 2026-10-25 (ob-crash-during-set-end-sync-leaves-sending-job):
  // the browser died 1.5 s into a set end's sync; after the reopen the row
  // stayed 'sending' for 2 minutes, the cloud set unfinished meanwhile
  it('hands back at once a "sending" job claimed before this page was loaded (a crashed page)', async () => {
    const loadedAt = Date.now()
    setPageLoadedAtForTests(loadedAt)
    try {
      fakeDb.sync_queue.reset([
        { id: 1, resource: 'set', action: 'update', status: 'sending', sending_since: loadedAt - 1500, payload: {} },
        { id: 2, resource: 'set', action: 'update', status: 'sending', sending_since: loadedAt + 10, payload: {} }
      ])
      await retryErrorsInternal()
      expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
      expect(fakeDb.sync_queue.map.get(2).status).toBe('sending')
    } finally {
      setPageLoadedAtForTests(0)
    }
  })
})

describe('event delete jobs (Undo, Replay, decision change, event editor)', () => {
  it('removes the cloud row by its scoped external_id, after the event insert queued before it', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:12', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'delete', status: 'queued', payload: { external_id: 'match_100_aaa:e:12', match_id: 'match_100_aaa' } }
    ])
    await runQueuePass()
    const writes = api.calls.filter(c => c.table === 'events')
    expect(writes.map(c => c.action)).toEqual(['upsert', 'delete'])
    expect(writes[1].filters).toEqual([['eq', 'external_id', 'match_100_aaa:e:12']])
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('a refused delete is not reported as sent', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'delete', status: 'queued', payload: { external_id: 'match_100_aaa:e:12', match_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => call.action === 'delete'
      ? { data: null, error: { message: 'boom', status: 500 } }
      : defaultRespond(call)
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).not.toBe('sent')
  })
})

// The approval closes the match on the server, which from then on refuses its
// sets, events and remarks (OV_MATCH_CLOSED), so the approval must not overtake
// them. backend db/017: the approval queues the remarks as approved just before
// itself. 2026-10-13: a match scored signed out went up in one pass, the
// approval first (match jobs go first), and the server kept none of its sets
// and events.
describe('closing order (the approval waits for the older sets, events and remarks of its match)', () => {
  const close = (id, status = 'approved') => ({ id, resource: 'match', action: 'update', status: 'queued', retry_count: 0, payload: { id: 'match_100_aaa', status } })
  const remarksJob = (id, status = 'queued') => ({ id, resource: 'match', action: 'update', status, retry_count: 0, payload: { id: 'match_100_aaa', remarks: 'Team 1 forfeits the match due to no show' } })

  it('holds the approval while an older remarks job is waiting out a backoff', async () => {
    fakeDb.sync_queue.reset([remarksJob(1), close(2)])
    let remarksCalls = 0
    api.respond = (call) => {
      if (call.table === 'matches' && call.action === 'update' && 'remarks' in (call.data || {})) {
        remarksCalls++
        // a proxy page (4xx without a backend code): the job backs off as 'error'
        if (remarksCalls === 1) return { data: null, error: { message: 'Bad gateway page', status: 403 } }
      }
      return defaultRespond(call)
    }
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('error')
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')

    fakeDb.sync_queue.update(1, { status: 'queued', next_attempt_at: 0 })
    await runQueuePass()
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
    const updates = api.calls.filter(c => c.table === 'matches' && c.action === 'update')
    expect(updates.at(-1).data.status).toBe('approved')
  })

  it('a refused (failed) remarks job, e.g. a server without db/017, does not hold the approval', async () => {
    fakeDb.sync_queue.reset([remarksJob(1, 'failed'), close(2)])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('a newer remarks job does not hold it', async () => {
    fakeDb.sync_queue.reset([close(1), remarksJob(2)])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  const child = (id, resource, n) => ({ id, resource, action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: `match_100_aaa:${resource === 'set' ? 's' : 'e'}:${n}`, match_id: 'match_100_aaa' } })

  it('a match sent in one go (scored signed out): its sets and events go up before the approval closes it', async () => {
    fakeDb.sync_queue.reset([child(1, 'set', 1), child(2, 'event', 1), child(3, 'event', 2), close(4, 'final')])
    let closed = false
    const refused = []
    api.respond = (call) => {
      if (call.table === 'matches' && call.action === 'update' && call.data?.status === 'final') closed = true
      else if (closed && (call.table === 'sets' || call.table === 'events') && call.action !== 'select') {
        refused.push(call.table)
        return { data: null, error: { message: 'closed', status: 409, code: 'OV_MATCH_CLOSED' }, status: 409 }
      }
      return defaultRespond(call)
    }
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(4).status).toBe('queued') // waited for its sets and events
    await runQueuePass()
    expect([1, 2, 3, 4].map(id => fakeDb.sync_queue.map.get(id).status)).toEqual(['sent', 'sent', 'sent', 'sent'])
    expect(refused).toEqual([])
  })

  it('a newer event (after the approval) does not hold it', async () => {
    fakeDb.sync_queue.reset([close(1), child(2, 'event', 9)])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  // Stress test 2026-10-25 (ob-livestate-never-repushed): the match ended
  // while the cloud was unreachable; the queue sent the match end, but the
  // live state the scoring screen could not write was dropped, and once the
  // match was approved the server refused every change of it (OV_MATCH_CLOSED)
  it('the live state the scoring screen could not write goes up before the approval closes the match', async () => {
    resetLiveStateOutboxForTests()
    holdLiveState('match_100_aaa', { match_id: null, current_set: 2, points_a: 21, points_b: 0, sets_won_a: 2, sets_won_b: 0, match_status: 'ended', updated_at: new Date().toISOString() })
    fakeDb.sync_queue.reset([close(1)])
    const order = []
    api.respond = (call) => {
      if (call.table === 'match_live_state') order.push(`live:${call.data.match_status}:${call.data.match_id}`)
      if (call.table === 'matches' && call.action === 'update') order.push(`match:${call.data.status}`)
      return defaultRespond(call)
    }
    await runQueuePass()
    expect(order).toEqual([`live:ended:${MATCH_UUID}`, 'match:approved'])
    expect(heldLiveState('match_100_aaa')).toBeNull()
  })

  it('while the held live state cannot be sent the approval waits; a refusal of it does not hold it', async () => {
    resetLiveStateOutboxForTests()
    holdLiveState('match_100_aaa', { current_set: 2, points_a: 21, points_b: 0, match_status: 'ended', updated_at: new Date().toISOString() })
    fakeDb.sync_queue.reset([close(1)])
    let liveAnswer = { data: null, error: { message: 'Database unavailable', status: 503, code: 'OV_DB_UNAVAILABLE' } }
    api.respond = (call) => (call.table === 'match_live_state' ? liveAnswer : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
    expect(heldLiveState('match_100_aaa')).toMatchObject({ match_status: 'ended' })

    liveAnswer = { data: null, error: { message: 'closed', status: 409, code: 'OV_MATCH_CLOSED' } }
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(heldLiveState('match_100_aaa')).toBeNull()
  })
})

describe('scoresheet upload job', () => {
  // Stress test 2026-10-25 (ob-scoresheet-upload-fire-once): approved while the
  // cloud was unreachable, the PDF and the final JSON never reached it;
  // nothing retried them. As OpenVolley ba894c6d.
  it('stores the file it carries; while the cloud is unreachable it waits and goes with a later pass', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'scoresheet', action: 'upload', status: 'queued', payload: { path: 'beach/2026-10-25/game702_k1_final.json', file: new Blob(['{}']), contentType: 'application/json', match_external_id: 'match_100_aaa' } },
      { id: 2, resource: 'scoresheet', action: 'upload', status: 'queued', payload: { path: 'beach/2026-10-25/game702_k1.pdf', file: pdf, contentType: 'application/pdf', match_external_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => call.table === '__storage'
      ? { data: null, error: { message: 'Failed to fetch', status: 0, network: true } }
      : ok()
    const offline = await runQueuePass()
    expect(offline.stopped).toBe(true)
    expect([...fakeDb.sync_queue.map.values()].map(j => j.status)).toEqual(['queued', 'queued'])

    api.calls = []
    api.respond = defaultRespond
    const outcome = await runQueuePass()
    expect(outcome.sent).toBe(2)
    const stored = api.calls.filter(c => c.table === '__storage')
    expect(stored.map(c => c.data.path)).toEqual(['beach/2026-10-25/game702_k1_final.json', 'beach/2026-10-25/game702_k1.pdf'])
    expect(stored[1].data).toMatchObject({ bucket: 'scoresheets', file: pdf, options: { contentType: 'application/pdf', upsert: true } })
    expect([...fakeDb.sync_queue.map.values()].map(j => j.status)).toEqual(['sent', 'sent'])
    // a sent job keeps no copy of the file
    expect([...fakeDb.sync_queue.map.values()].map(j => j.payload.file)).toEqual([null, null])
  })

  it('goes after the match\'s own writes (the approval first)', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'scoresheet', action: 'upload', status: 'queued', payload: { path: 'beach/d/game1_k.pdf', file: new Blob(['x']), contentType: 'application/pdf', match_external_id: 'match_100_aaa' } },
      { id: 2, resource: 'match', action: 'update', status: 'queued', retry_count: 0, payload: { id: 'match_100_aaa', status: 'approved' } }
    ])
    await runQueuePass()
    const order = api.calls.filter(c => c.table === '__storage' || (c.table === 'matches' && c.action === 'update')).map(c => c.table)
    expect(order).toEqual(['matches', '__storage'])
  })
})

// The activity upload job (utils_beach/activity/upload_beach), against the fakes
const upload = vi.hoisted(() => ({ result: { sent: 0, more: false } }))
vi.mock('../../utils_beach/activity/upload_beach', () => ({
  uploadActivityBatch: async () => upload.result,
  activityFlushJob: () => ({ resource: 'activity', action: 'flush', payload: {}, ts: Date.now(), status: 'queued' })
}))

describe('the activity upload job', () => {
  it('runs after the match, set and event jobs; another flush when more rows wait', async () => {
    upload.result = { sent: 500, accepted: 500, more: true }
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'activity', action: 'flush', status: 'queued', payload: {} },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } }
    ])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
    expect([...fakeDb.sync_queue.map.values()].filter(j => j.resource === 'activity' && j.status === 'queued')).toHaveLength(1)
  })

  it('a server without /api/activity (404) parks it as failed; a 503 is retried', async () => {
    upload.result = { sent: 3, error: { status: 404, message: 'Not found' }, status: 404 }
    fakeDb.sync_queue.reset([{ id: 1, resource: 'activity', action: 'flush', status: 'queued', payload: {} }])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'failed', last_error: expect.objectContaining({ code: 'OV_ROUTE_MISSING' }) })
    upload.result = { sent: 3, error: { status: 503, message: 'busy' }, status: 503 }
    fakeDb.sync_queue.reset([{ id: 1, resource: 'activity', action: 'flush', status: 'queued', payload: {} }])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).not.toBe('sent')
    upload.result = { sent: 0, more: false }
  })

  it('sent upload jobs are pruned after an hour, other sent jobs after a week', async () => {
    const now = Date.now()
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'activity', action: 'flush', status: 'sent', ts: now - 2 * 3600 * 1000 },
      { id: 2, resource: 'event', action: 'insert', status: 'sent', ts: now - 2 * 3600 * 1000 }
    ])
    expect(await pruneSyncQueue({ now })).toBe(1)
    expect([...fakeDb.sync_queue.map.keys()]).toEqual([2])
  })
})

describe('the activity log of the queue', () => {
  beforeEach(() => { activity.entries = [] })

  it('a refused job is a sync.error with its status, code and request id, never its payload', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa', game_pin: '123456' } }
    ])
    api.respond = (call) => (call.action === 'upsert'
      ? { data: null, error: { message: 'closed', status: 409, code: 'OV_MATCH_CLOSED', requestId: 'req-1' } }
      : defaultRespond(call))
    await runQueuePass()
    expect(activity.entries).toEqual([{
      kind: 'sync.error',
      data: { resource: 'event', action: 'insert', status: 409, code: 'OV_MATCH_CLOSED', requestId: 'req-1', attempt: 1 },
      opts: { level: 'warn', matchExt: 'match_100_aaa' }
    }])
  })

  it('a dropped job is a sync.dropped; a sent one is nothing', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '99' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } }
    ])
    await runQueuePass()
    expect(activity.entries.map(e => e.kind)).toEqual(['sync.dropped'])
  })
})

// Ported from OpenVolley dcc407f7 (useSyncQueue.test.js), beach ids
describe('event history jobs (void / edit / restore)', () => {
  const voidJob = (id, extra = {}) => ({
    id, resource: 'event', action: 'void', status: 'queued',
    payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa', rev_uid: `rev-${id}`, op: 'void', reason: 'undo', seq: 3, set_index: 1, type: 'point', client_ts: '2026-10-07T10:00:00.000Z', ...extra }
  })

  it('posts the revision to /api/match/event-revisions, after the event insert of the same event', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      voidJob(2)
    ])
    const outcome = await runQueuePass()
    expect(outcome.sent).toBe(2)
    expect(api.calls.map(c => c.table)).toEqual(['matches', 'events', '__revisions'])
    const rev = api.calls[2].data
    expect(rev.matchExternalId).toBe('match_100_aaa')
    expect(rev.revisions).toEqual([expect.objectContaining({ rev_uid: 'rev-2', op: 'void', event_external_id: 'match_100_aaa:e:1', reason: 'undo' })])
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('an edit carries the columns after it', async () => {
    fakeDb.sync_queue.reset([voidJob(1, { op: 'edit', reason: 'decision_change', after: { type: 'point', payload: { team: 'team2' }, score_a: 13, score_b: 13 } })])
    fakeDb.sync_queue.map.get(1).action = 'edit'
    await runQueuePass()
    expect(api.calls.find(c => c.table === '__revisions').data.revisions[0]).toMatchObject({ op: 'edit', reason: 'decision_change', after: { payload: { team: 'team2' }, score_a: 13 } })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  it('waits behind its errored insert (per-entity order)', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'error', next_attempt_at: Date.now() + 60000, payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      voidJob(2)
    ])
    await runQueuePass()
    expect(api.calls.filter(c => c.table === '__revisions')).toHaveLength(0)
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
  })

  it('a server without the route (404) parks the job as failed; a match not on the server yet is retried', async () => {
    fakeDb.sync_queue.reset([voidJob(1)])
    api.respond = (call) => (call.table === '__revisions' ? { data: null, error: { message: 'Not found', status: 404 }, status: 404 } : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'failed', last_error: expect.objectContaining({ code: 'OV_ROUTE_MISSING' }) })

    fakeDb.sync_queue.reset([voidJob(1)])
    api.respond = (call) => (call.table === '__revisions' ? { data: null, error: { message: 'No match', status: 404, code: 'OV_MATCH_NOT_FOUND' }, status: 404 } : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued', retry_count: 1 })
  })

  it('a closed match (409) is a refusal like any event write', async () => {
    fakeDb.sync_queue.reset([voidJob(1)])
    api.respond = (call) => (call.table === '__revisions' ? { data: null, error: { message: 'closed', status: 409, code: 'OV_MATCH_CLOSED' }, status: 409 } : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')
  })

  it('a revision without a rev_uid is dropped, never sent', async () => {
    fakeDb.sync_queue.reset([voidJob(1, { rev_uid: null })])
    await runQueuePass()
    expect(api.calls.filter(c => c.table === '__revisions')).toHaveLength(0)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('dropped')
  })
})

describe('helpers', () => {
  it('payloadCovers compares fields and JSON sub-keys', () => {
    expect(payloadCovers({ id: 'x', a: 1, j: { p: 1, q: 2 } }, { id: 'x', a: 0, j: { p: 0 } })).toBe(true)
    expect(payloadCovers({ id: 'x', a: 1 }, { id: 'x', a: 0, b: 1 })).toBe(false)
    expect(payloadCovers({ id: 'x', j: { p: 1 } }, { id: 'x', j: { q: 1 } })).toBe(false)
  })

  it('error backoff grows and is capped', () => {
    expect(errorBackoffMs(1)).toBe(30000)
    expect(errorBackoffMs(2)).toBe(60000)
    expect(errorBackoffMs(50)).toBe(10 * 60 * 1000)
  })

  it('exports the stop marker', () => {
    expect(STOP_PASS).toBe('stop')
  })

  it('a probe 404 (LAN relay without /api/db) is "no cloud backend", not an error', () => {
    expect(probeErrorStatus({ status: 404, message: 'Not found' })).toBe('online_no_supabase')
    expect(probeErrorStatus({ network: true, status: 0 })).toBe('offline')
    expect(probeErrorStatus({ code: '42P01', status: 400 })).toBe('online_no_supabase')
    expect(probeErrorStatus({ status: 500, message: 'boom' })).toBe('error')
    expect(probeErrorStatus({ status: 401, message: 'unauthorized' })).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// E2E findings: coin toss id, permanent 4xx, sign-in required, auto-retry
// ---------------------------------------------------------------------------

describe('legacy coin toss jobs', () => {
  it('a queued coin_toss_<seed> job is sent as <seed>:e:<local coin toss event id>', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'coin_toss_match_100_aaa', match_id: 'match_100_aaa', type: 'coin_toss', set_index: 1 } }
    ])
    await runQueuePass()
    const upsert = api.calls.find(c => c.table === 'events' && c.action === 'upsert')
    expect(upsert.data.external_id).toBe('match_100_aaa:e:9')
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'sent', payload: { external_id: 'match_100_aaa:e:9' } })
  })
})

describe('failure classes', () => {
  it('classifies 401 as sign-in required and 4xx with a backend error code as permanent', () => {
    expect(isAuthError({ status: 401, code: 'missing_token' })).toBe(true)
    expect(isAuthError({ status: 0, network: true })).toBe(false)
    expect(isPermanentError({ status: 400, code: 'OV_UNSCOPED_EXTERNAL_ID' })).toBe(true)
    expect(isPermanentError({ status: 406, code: 'PGRST116' })).toBe(true)
    expect(isPermanentError({ status: 400, code: '23505' })).toBe(true)
    // a proxy/WAF page or misrouted URL: no application code (non-JSON body)
    expect(isPermanentError({ status: 403 })).toBe(false)
    expect(isPermanentError({ status: 404, message: 'Request failed (404)' })).toBe(false)
    expect(isPermanentError({ status: 400, code: 'bad_request' })).toBe(false)
    for (const status of [401, 408, 426, 429, 500, 503, 0]) expect(isPermanentError({ status, code: 'OV_X' }), String(status)).toBe(false)
    expect(hasApplicationErrorCode({ code: 'OV_BODY_TOO_LARGE' })).toBe(true)
    expect(hasApplicationErrorCode({ code: 'Forbidden' })).toBe(false)
  })

  it('a 403 page without a backend error code backs off the job and stops the pass', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:2', match_id: 'match_100_aaa' } },
      { id: 3, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_200_bbb:e:3', match_id: 'match_200_bbb' } }
    ])
    // apiClient's result for a non-JSON (HTML) 403 body
    api.respond = (call) => (call.action === 'upsert'
      ? { data: null, error: { message: 'Database operation failed (403)', status: 403 } }
      : defaultRespond(call))

    const outcome = await runQueuePass()
    expect(outcome).toMatchObject({ stopped: true, hasError: true, hasFailed: false })
    const job = fakeDb.sync_queue.map.get(1)
    expect(job).toMatchObject({ status: 'error', attempts: 1, last_error: { status: 403, code: null } })
    expect(job.next_attempt_at).toBeGreaterThan(Date.now())
    // the rest of the queue was not burnt on the same page
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(fakeDb.sync_queue.map.get(3).status).toBe('queued')
    expect(api.calls.filter(c => c.action === 'upsert')).toHaveLength(1)
  })

  it('a refused job comes back once an hour on its own, at most 24 times', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'failed', failed_at: Date.now() - 10 * 60 * 1000, payload: { external_id: 'match_100_aaa:e:1' } },
      { id: 2, resource: 'event', action: 'insert', status: 'failed', failed_at: Date.now() - 61 * 60 * 1000, payload: { external_id: 'match_100_aaa:e:2' } },
      { id: 3, resource: 'event', action: 'insert', status: 'failed', failed_at: Date.now() - 61 * 60 * 1000, failed_auto_retries: 24, payload: { external_id: 'match_100_aaa:e:3' } }
    ])
    expect(await retryErrorsInternal()).toBe(true)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed') // refused 10 min ago
    expect(fakeDb.sync_queue.map.get(2)).toMatchObject({ status: 'queued', failed_auto_retries: 1 })
    expect(fakeDb.sync_queue.map.get(3).status).toBe('failed') // cap reached: manual retry only

    // a manual retry (or a sign-in, or the app start) takes them all and resets the cap
    await retryErrorsInternal({ force: true, includeFailed: true })
    expect(fakeDb.sync_queue.map.get(3)).toMatchObject({ status: 'queued', failed_auto_retries: 0 })
  })

  it('a 400 (OV_UNSCOPED_EXTERNAL_ID) is marked failed with its reason and not retried with the error backoff', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } }
    ])
    api.respond = (call) => (call.action === 'upsert'
      ? { data: null, error: { message: 'Database operation failed', code: 'OV_UNSCOPED_EXTERNAL_ID', status: 400 } }
      : defaultRespond(call))

    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'failed', attempts: 1, last_error: { status: 400, code: 'OV_UNSCOPED_EXTERNAL_ID' } })

    // the error backoff (30 s ...) and the back-online retry leave it alone
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 5 * 60 * 1000)
    try {
      expect(await retryErrorsInternal()).toBe(false)
      expect(await retryErrorsInternal({ force: true })).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')

    // a manual "Retry All" (or a sign-in) gives it another try
    expect(await retryErrorsInternal({ force: true, includeFailed: true })).toBe(true)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')
  })

  it('a 401 leaves every job queued without counting an attempt and stops the pass', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_200_bbb:e:1', match_id: 'match_200_bbb' } }
    ])
    api.respond = (call) => (call.action === 'upsert'
      ? { data: null, error: { message: 'Authentication required', code: 'missing_token', status: 401 } }
      : defaultRespond(call))

    const outcome = await runQueuePass()
    expect(outcome).toMatchObject({ authRequired: true, stopped: true, hasError: false })
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued' })
    expect(fakeDb.sync_queue.map.get(1).attempts).toBeUndefined()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')
    expect(api.calls.filter(c => c.action === 'upsert')).toHaveLength(1)
  })

  it('logs a 401 as a warning, other refusals as errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      fakeDb.sync_queue.reset([
        { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } }
      ])
      api.respond = (call) => (call.action === 'upsert'
        ? { data: null, error: { message: 'Authentication required', code: 'missing_token', status: 401 } }
        : defaultRespond(call))
      await runQueuePass()
      expect(warn.mock.calls.some(c => String(c[0]).includes('Match insert error'))).toBe(true)
      expect(error.mock.calls.some(c => String(c[0]).includes('Match insert error'))).toBe(false)

      api.respond = (call) => (call.action === 'upsert'
        ? { data: null, error: { message: 'bad', code: 'OV_INVALID_DATA', status: 400 } }
        : defaultRespond(call))
      await runQueuePass()
      expect(error.mock.calls.some(c => String(c[0]).includes('Match insert error'))).toBe(true)
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })

  it('logs match payloads without PINs', () => {
    expect(redactForLog({ external_id: 'm', game_pin: '123456', connection_pins: { referee: '1' }, home_team: { name: 'A' } }))
      .toEqual({ external_id: 'm', home_team: { name: 'A' } })
  })

  it('redactForLog drops PIN fields at any depth and in any spelling, keeps the rest', () => {
    const out = redactForLog({
      id: 'm',
      gamePin: '1',
      PIN: '2',
      homeTeamUploadPin: '3',
      connectionPins: { referee: '4' },
      match: { refereePin: '5', status: 'live', teams: [{ name: 'A', bench_home_pin: '6' }] },
      mapping: 'kept',
      pinned: true,
      when: 123456
    })
    expect(out).toEqual({ id: 'm', match: { status: 'live', teams: [{ name: 'A' }] }, mapping: 'kept', pinned: true, when: 123456 })
  })

  it('redactForLog prints the remarks as a length, never their text', () => {
    expect(redactForLog({ id: 'm', remarks: 'Player 2 Rossi injured' })).toEqual({ id: 'm', remarks: '[22 characters]' })
    expect(redactForLog({ remarks: null })).toEqual({ remarks: null })
  })

  it('redactForLog masks PIN values inside texts and error messages', () => {
    expect(redactForLog('Key (game_pin)=(123456) already exists.')).toBe('Key (game_pin)=([redacted]) already exists.')
    expect(redactForLog('{"refereePin":"654321","n":42}')).toBe('{"refereePin":"[redacted]","n":42}')
    expect(redactForLog('Processing 12345 queued items')).toBe('Processing 12345 queued items')
    const err = redactForLog(new Error('duplicate game_pin 123456'))
    expect(err.message).toBe('duplicate game_pin [redacted]')
    const plain = new Error('boom')
    expect(redactForLog(plain)).toBe(plain)
    expect(redactForLog({ code: 'X', details: 'Key (game_pin)=(123456)' })).toEqual({ code: 'X', details: 'Key (game_pin)=([redacted])' })
  })

  it('no console line of a queue pass carries a PIN (payloads, nested PINs, backend errors)', async () => {
    const lines = []
    const capture = (...args) => { lines.push(JSON.stringify(args.map(a => (a instanceof Error ? { message: a.message } : a)))) }
    const spies = ['log', 'warn', 'error'].map(m => vi.spyOn(console, m).mockImplementation(capture))
    try {
      fakeDb.sync_queue.reset([
        { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa', game_pin: '999999', connection_pins: { referee: '111111' } } },
        { id: 2, resource: 'match', action: 'update', status: 'queued', payload: { id: 'match_100_aaa', game_pin: '999999', connection_pins: { referee: '111111' } } },
        { id: 3, resource: 'set', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:s:5', match_id: 'match_100_aaa', debug: { gamePin: '999999' } } },
        { id: 4, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa:e:9', match_id: 'match_100_aaa', refereePin: '111111' } }
      ])
      api.respond = (call) => {
        if (call.table === 'matches' && call.action === 'select') return ok({ id: MATCH_UUID })
        if (call.action === 'upsert' && call.table === 'matches') return ok()
        return { data: null, error: { status: 400, message: 'Key (game_pin)=(999999) bad', details: { home_team_pin: '222222' } } }
      }
      await runQueuePass()
    } finally {
      spies.forEach(s => s.mockRestore())
    }
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some(l => l.includes('Match insert payload'))).toBe(true)
    for (const pin of ['999999', '111111', '222222', '333333', '444444']) {
      expect(lines.filter(l => l.includes(pin))).toEqual([])
    }
  })
})

describe('pruneSyncQueue', () => {
  it('removes old sent/superseded/dropped rows, but none newer than a pending job', async () => {
    const now = Date.now()
    const old = now - 8 * 24 * 3600 * 1000
    fakeDb.sync_queue.reset([
      { id: 1, status: 'sent', ts: old },
      { id: 2, status: 'superseded', ts: new Date(old).toISOString() },
      { id: 3, status: 'dropped', ts: old },
      { id: 4, status: 'sent', ts: now - 3600 * 1000 }, // recent
      { id: 5, status: 'error', ts: old }, // still pending: kept, and so is what follows
      { id: 6, status: 'sent', ts: old },
      { id: 7, status: 'failed', ts: old }
    ])
    expect(await pruneSyncQueue({ now })).toBe(3)
    expect([...fakeDb.sync_queue.map.keys()]).toEqual([4, 5, 6, 7])
  })
})

// Stress test 2026-10-25 (ob-two-tabs-double-flush): a second tab of the app
// ran its own queue pass over the same rows and sent 22 of 47 jobs twice
describe('withQueueLock (one queue pass per device, across tabs)', () => {
  // jsdom has no navigator.locks: defined per test
  const setLocks = (value) => Object.defineProperty(navigator, 'locks', { value, configurable: true })
  afterEach(() => {
    delete navigator.locks
  })
  function fakeLocks() {
    const held = new Set()
    return {
      held,
      request: vi.fn(async (name, opts, cb) => {
        if (held.has(name)) return opts?.ifAvailable ? cb(null) : undefined
        held.add(name)
        try { return await cb({ name }) } finally { held.delete(name) }
      })
    }
  }

  it('a tab that finds the pass running in another tab skips its own', async () => {
    const locks = fakeLocks()
    setLocks(locks)
    let release
    const otherTab = withQueueLock(() => new Promise(r => { release = r }))
    const pass = vi.fn(async () => ({ sent: 1 }))
    expect(await withQueueLock(pass)).toBeNull()
    expect(pass).not.toHaveBeenCalled()
    release({ sent: 3 })
    expect(await otherTab).toEqual({ sent: 3 })
    expect(await withQueueLock(pass)).toEqual({ sent: 1 })
    expect(locks.request.mock.calls[0][0]).toBe(QUEUE_LOCK_NAME)
  })

  it('without Web Locks the pass runs', async () => {
    setLocks(undefined)
    expect(await withQueueLock(async () => 'ran')).toBe('ran')
  })
})

describe('getSyncQueueStats', () => {
  it('counts pending, errored and failed jobs', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, status: 'queued' }, { id: 2, status: 'sending' }, { id: 3, status: 'error' },
      { id: 4, status: 'failed' }, { id: 5, status: 'sent' }, { id: 6, status: 'dropped' }
    ])
    expect(await getSyncQueueStats()).toEqual({ pending: 2, error: 1, failed: 1, held: 0 })
  })

  // Stress test 2026-10-25 (ob-failed-match-job-blocks-match-status-green):
  // a refused second match insert held back every later job of the match
  // (Postgres stayed at 1:1 while the device was at 5:5) and the pill said
  // Ready, its menu only "Pending background sync: 16"
  it('counts the refused jobs that hold later ones back', async () => {
    const seed = 'match_100_aaa'
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'sent', payload: { external_id: seed } },
      { id: 2, resource: 'match', action: 'insert', status: 'failed', payload: { external_id: seed, game_n: 'nope' } },
      { id: 3, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: `${seed}:e:9`, match_id: seed } },
      { id: 4, resource: 'set', action: 'update', status: 'queued', payload: { external_id: `${seed}:s:1`, team1_points: 5 } },
      // a refused update holds nothing back; nor a refused job of another match with nothing after it
      { id: 5, resource: 'match', action: 'update', status: 'failed', payload: { id: seed, status: { nested: true } } },
      { id: 6, resource: 'event', action: 'insert', status: 'failed', payload: { external_id: 'match_2_bbb:e:1', match_id: 'match_2_bbb' } }
    ])
    expect(await getSyncQueueStats()).toMatchObject({ pending: 2, failed: 3, held: 1 })
  })
})

describe('useSyncQueue flush loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    // A stored session: without one the queue sends nothing (see below)
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 't' }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.removeItem('api_auth_token')
  })

  // Stress test 2026-10-25 (ob-probe-backoff-slow-recovery): after an outage
  // with the Wi-Fi up the queue went idle only 35-41 s after the backend was
  // back (the probe backoff, reset only by an 'online' event)
  const outageQueue = () => [
    { id: 1, resource: 'set', action: 'update', status: 'queued', retry_count: 0, payload: { external_id: 'match_100_aaa:s:5', team1_points: 21, team2_points: 3, finished: true } },
    { id: 2, resource: 'match', action: 'update', status: 'queued', retry_count: 0, payload: { id: 'match_100_aaa', current_set: 2 } }
  ]
  const unreachable = { data: null, error: { message: 'Failed to fetch', status: 0, network: true } }

  it('the queue drains as soon as the backend answers another request, without an online event', async () => {
    fakeDb.sync_queue.reset(outageQueue())
    let cloudUp = false
    api.respond = (call) => (cloudUp ? defaultRespond(call) : unreachable)
    const { result, unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(80000) })
    expect([...fakeDb.sync_queue.map.values()].some(j => j.status === 'sent')).toBe(false)

    cloudUp = true
    await act(async () => {
      // (apiClient: a live-state write got through)
      window.dispatchEvent(new Event('ob-backend-reached'))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect([...fakeDb.sync_queue.map.values()].every(j => j.status === 'sent')).toBe(true)
    expect(result.current.syncStatus).toBe('synced')
    unmount()
  })

  it('a failed probe is retried at least every 15 s', async () => {
    fakeDb.sync_queue.reset(outageQueue())
    let cloudUp = false
    api.respond = (call) => (cloudUp ? defaultRespond(call) : unreachable)
    const { unmount } = renderHook(() => useSyncQueue())
    // (probes at 0, 5, 15, 30, 45 ... 255 s; with a 60 s cap the next one was at 315 s)
    await act(async () => { await vi.advanceTimersByTimeAsync(256000) })
    cloudUp = true
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect([...fakeDb.sync_queue.map.values()].every(j => j.status === 'sent')).toBe(true)
    unmount()
  })

  it('sends nothing without a stored session, then resumes on sign-in', async () => {
    localStorage.removeItem('api_auth_token')
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } }
    ])
    const { result, unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(result.current.syncStatus).toBe('auth_required')
    // No write was even tried: no 401 in the console or the backend log
    expect(api.calls.filter(c => c.action !== 'select')).toHaveLength(0)
    expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued' })

    await act(async () => {
      localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 't' }))
      window.dispatchEvent(new CustomEvent('api-auth-token-change', { detail: { access_token: 't' } }))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(result.current.syncStatus).toBe('synced')
    unmount()
  })

  it('a venue relay\'s page: no /api/db probe at all, a calm no-cloud status', async () => {
    venue.relayOrigin = true
    try {
      fakeDb.sync_queue.reset([
        { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } }
      ])
      api.calls.length = 0
      const { result, unmount } = renderHook(() => useSyncQueue())
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(api.calls).toHaveLength(0)
      expect(result.current.syncStatus).toBe('online_no_supabase')
      // Kept on the tablet
      expect(fakeDb.sync_queue.map.get(1)).toMatchObject({ status: 'queued' })
      unmount()
    } finally {
      venue.relayOrigin = false
    }
  })

  it('reports synced while signed out with nothing waiting', async () => {
    localStorage.removeItem('api_auth_token')
    fakeDb.sync_queue.reset([])
    const { result, unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(result.current.syncStatus).toBe('synced')
    unmount()
  })

  it('requeues an errored job once its backoff has passed, while the 5 s poll runs', async () => {
    const { unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    // Parked after the mount-time forced retry already ran (as in the e2e run)
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'event', action: 'insert', status: 'error', attempts: 1, next_attempt_at: Date.now() + 10000, payload: { external_id: 'match_100_aaa:e:1', match_id: 'match_100_aaa' } }
    ])
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('error') // backoff not over yet

    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    unmount()
  })

  it('waits for a sign-in after a 401 of a stored session (no request churn), then resumes at once', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } }
    ])
    let signedIn = false
    api.respond = (call) => (call.action === 'upsert' && !signedIn
      ? { data: null, error: { message: 'Authentication required', code: 'missing_token', status: 401 } }
      : defaultRespond(call))

    const { result, unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(result.current.syncStatus).toBe('auth_required')
    expect(api.calls.filter(c => c.action === 'upsert')).toHaveLength(1)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued')

    signedIn = true
    await act(async () => {
      window.dispatchEvent(new CustomEvent('api-auth-token-change', { detail: { access_token: 't' } }))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(result.current.syncStatus).toBe('synced')
    unmount()
  })

  // 2026-10-13: signed in, the banner still said "Session expired" for the
  // whole first pass (a minute of queued jobs): the status changed only at its end
  it('after the sign-in the status leaves auth_required as the pass starts, not when it ends', async () => {
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'insert', status: 'queued', payload: { external_id: 'match_100_aaa' } }
    ])
    let signedIn = false
    api.respond = (call) => {
      if (call.action !== 'upsert') return defaultRespond(call)
      if (!signedIn) return { data: null, error: { message: 'Authentication required', code: 'missing_token', status: 401 } }
      return new Promise(resolve => setTimeout(() => resolve(defaultRespond(call)), 5000)) // a slow write
    }
    const { result, unmount } = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(result.current.syncStatus).toBe('auth_required')

    signedIn = true
    await act(async () => {
      window.dispatchEvent(new CustomEvent('api-auth-token-change', { detail: { access_token: 't' } }))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('queued') // still on its way
    expect(result.current.syncStatus).toBe('syncing')
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(result.current.syncStatus).toBe('synced')
    unmount()
  })

  // Laptop run of 2026-10-08 (OB-3): the scoreboard mounts its own queue,
  // whose first probe published 'connecting' over the app's 'synced': the
  // header's chip showed 'Venue mode' for one frame, then 'Ready'
  it('a second instance never shows "connecting" over a cloud already known to work', async () => {
    fakeDb.sync_queue.reset([])
    const seen = []
    const app = renderHook(() => { const q = useSyncQueue(); seen.push(q.syncStatus); return q })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(app.result.current.syncStatus).toBe('synced')

    seen.length = 0
    const scoreboard = renderHook(() => useSyncQueue())
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(seen).not.toContain('connecting')
    expect(app.result.current.syncStatus).toBe('synced')
    scoreboard.unmount()
    app.unmount()
  })
})

describe('syncDbUrl: where the queue writes', () => {
  it('the cloud /api/db; none on a page a venue relay serves (no probe of the relay)', () => {
    expect(syncDbUrl()).toBe('http://backend.test/api/db')
    venue.relayOrigin = true
    try {
      expect(syncDbUrl()).toBeNull()
    } finally {
      venue.relayOrigin = false
    }
  })
})

// Ported from OpenVolley (145efd98, 6dd1c1a8): the scoring-device handover
// (db/019) and the needless updates of a match closed here; beach has no
// OV_GAME_TAKEN copies to retire (db/013)
describe('a match continued on another device', () => {
  const update = (id, payload, status = 'queued') => ({ id, resource: 'match', action: 'update', status, retry_count: 0, payload: { id: 'match_100_aaa', ...payload } })
  const eventJob = (id, seed = 'match_100_aaa') => ({ id, resource: 'event', action: 'insert', status: 'queued', retry_count: 0, payload: { external_id: `${seed}:e:${id}`, match_id: seed } })
  const refuse = (code, extra = {}) => ({ data: null, error: { message: 'no', code, status: 409, ...extra } })

  it('a match update refused as closed for a match approved here is dropped, not a lasting error', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'ended', approved: true }])
    fakeDb.sync_queue.reset([update(1, { status: 'ended', set_results: [], final_score: '2-0' })])
    api.respond = (call) => (call.table === 'matches' && call.action === 'update' ? refuse('OV_MATCH_CLOSED') : defaultRespond(call))
    const outcome = await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('dropped')
    expect(outcome.hasFailed).toBeFalsy()
    expect(await getSyncQueueStats()).toEqual({ pending: 0, error: 0, failed: 0, held: 0 })
  })

  it('a set or event refused as closed stays visible (it carries the score), as does an update of a match still open here', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'final', approved: true }])
    fakeDb.sync_queue.reset([eventJob(1)])
    api.respond = (call) => (call.table === 'events' ? refuse('OV_MATCH_CLOSED') : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')

    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    fakeDb.sync_queue.reset([update(1, { status: 'live' })])
    api.respond = (call) => (call.table === 'matches' && call.action === 'update' ? refuse('OV_MATCH_CLOSED') : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('failed')
  })

  it('the match-end update is not queued for a match closed here, nor twice for the same result', () => {
    const payload = { id: 'match_100_aaa', status: 'ended', set_results: [{ set: 1, team1: 21, team2: 10 }], final_score: '2-0' }
    const open = { seed_key: 'match_100_aaa', status: 'ended' }
    expect(matchEndUpdateNeeded(open, [], payload)).toBe(true)
    expect(matchEndUpdateNeeded({ ...open, approved: true }, [], payload)).toBe(false)
    expect(matchEndUpdateNeeded({ ...open, status: 'final' }, [], payload)).toBe(false)
    expect(matchEndUpdateNeeded({ ...open, cloudBlock: { code: 'OV_SCORER_MOVED', closed: true } }, [], payload)).toBe(false)
    expect(matchEndUpdateNeeded({ ...open, test: true }, [], payload)).toBe(false)
    const pending = [{ id: 1, status: 'queued', resource: 'match', action: 'update', payload }]
    expect(matchEndUpdateNeeded(open, pending, payload)).toBe(false)
    expect(matchEndUpdateNeeded(open, [{ ...pending[0], status: 'sent' }], payload)).toBe(true)
    expect(matchEndUpdateNeeded(open, pending, { ...payload, final_score: '2-1' })).toBe(true)
  })

  it('OV_SCORER_MOVED marks the match with the new scorer (platform and time only) and sets its unsent writes aside', async () => {
    const seen = []
    const onBlock = (e) => seen.push(e.detail)
    window.addEventListener(SCORER_MOVED_EVENT, onBlock)
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    fakeDb.sync_queue.reset([
      eventJob(1),
      { id: 2, resource: 'set', action: 'update', status: 'error', retry_count: 0, payload: { external_id: 'match_100_aaa:s:5', team1_points: 11, team2_points: 8 } },
      eventJob(3, 'match_200_other')
    ])
    api.respond = (call) => (call.table === 'events' && call.data?.external_id?.startsWith('match_100_aaa')
      ? refuse('OV_SCORER_MOVED', { scorer: { platform: 'android', at: '2026-10-20T17:54:25Z', device_id: 'x' } })
      : defaultRespond(call))
    await runQueuePass()
    window.removeEventListener(SCORER_MOVED_EVENT, onBlock)
    // not a lasting "refused by the server": set aside, the other match goes on
    expect(fakeDb.sync_queue.map.get(1).status).toBe('dropped')
    expect(fakeDb.sync_queue.map.get(2)).toMatchObject({ status: 'superseded', superseded_by: 'scorer-moved' })
    expect(fakeDb.sync_queue.map.get(3).status).toBe('sent')
    expect(await getSyncQueueStats()).toEqual({ pending: 0, error: 0, failed: 0, held: 0 })
    expect(fakeDb.matches.map.get(1).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED', scorer: { platform: 'android', at: '2026-10-20T17:54:25Z' } })
    expect(fakeDb.matches.map.get(1).cloudBlock.scorer).toEqual({ platform: 'android', at: '2026-10-20T17:54:25Z' })
    expect(seen).toEqual([{ seedKey: 'match_100_aaa' }])
  })

  // review 2026-10-21 (reproduced): a 'failed' set update of the device that
  // lost the match went out over the other device's score after a take-back
  it('a take-back claim never sends this device\'s writes from before it (they were set aside)', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live', cloudBlock: { code: 'OV_SCORER_MOVED' } }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'set', action: 'update', status: 'superseded', superseded_by: 'scorer-moved', payload: { external_id: 'match_100_aaa:s:5', team1_points: 11, team2_points: 8, finished: false } },
      { id: 2, resource: 'match', action: 'scorer', status: 'queued', payload: { id: 'match_100_aaa' } }
    ])
    await runQueuePass()
    await retryErrorsInternal({ force: true, includeFailed: true })
    await runQueuePass()
    expect(api.calls.some(c => c.table === 'sets')).toBe(false)
    expect(fakeDb.sync_queue.map.get(1).status).toBe('superseded')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  // review 2026-10-21 (reproduced): after the other device closed the match,
  // the old device's retry got OV_MATCH_CLOSED, which replaced the notice and
  // left a live match with a 'failed' job
  it('a moved match refused as closed later: final here, the notice stays, nothing left failed', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live', cloudBlock: { code: 'OV_SCORER_MOVED', scorer: { platform: 'android', at: 'T' }, at: 3 } }])
    fakeDb.sync_queue.reset([eventJob(1), eventJob(2)])
    api.respond = (call) => (call.table === 'events' ? refuse('OV_MATCH_CLOSED') : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.matches.map.get(1)).toMatchObject({ status: 'final', cloudBlock: { code: 'OV_SCORER_MOVED', scorer: { platform: 'android', at: 'T' }, closed: true } })
    expect(fakeDb.sync_queue.map.get(1).status).toBe('dropped')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('superseded')
    expect(await getSyncQueueStats()).toEqual({ pending: 0, error: 0, failed: 0, held: 0 })
  })

  it('a claim goes first among the match jobs', async () => {
    fakeDb.sync_queue.reset([
      update(1, { status: 'live' }),
      { id: 3, resource: 'match', action: 'scorer', status: 'queued', payload: { id: 'match_100_aaa' } }
    ])
    await runQueuePass()
    const order = api.calls.filter(c => c.table === '__scorer' || (c.table === 'matches' && c.action === 'update')).map(c => c.table)
    expect(order[0]).toBe('__scorer')
    expect(fakeDb.sync_queue.map.get(3).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
  })

  // review 2026-10-21: a backup restored from a moved copy (or a block noted
  // while the claim was on its way) kept ScorerMovedModal over the match
  // after the server took this device's claim / restore
  it('an accepted claim or restore clears the moved block; a block of a match closed there stays', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live', cloudBlock: { code: 'OV_SCORER_MOVED', scorer: { platform: 'android' } } }])
    fakeDb.sync_queue.reset([{ id: 1, resource: 'match', action: 'scorer', status: 'queued', payload: { id: 'match_100_aaa' } }])
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.matches.map.get(1).cloudBlock).toBeNull()

    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'final', cloudBlock: { code: 'OV_SCORER_MOVED', closed: true } }])
    fakeDb.sync_queue.reset([{ id: 2, resource: 'match', action: 'scorer', status: 'queued', payload: { id: 'match_100_aaa' } }])
    await runQueuePass()
    expect(fakeDb.matches.map.get(1).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED', closed: true })
  })

  // port question 2026-10-21: the set-end sync said "Sync failed" behind
  // ScorerMovedModal for a write that was only set aside
  it('a set-end write set aside because another device scores the match is no sync error', async () => {
    const { sendJobNow } = await import('../../hooks_beach/useSequentialSync_beach')
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    fakeDb.sync_queue.reset([])
    api.respond = (call) => (call.table === 'sets' ? refuse('OV_SCORER_MOVED', { scorer: { platform: 'android' } }) : defaultRespond(call))
    const out = await sendJobNow({ resource: 'set', action: 'update', payload: { external_id: 'match_100_aaa:s:5', team1_points: 21, team2_points: 18, finished: true } }, 5000, { waitForCloud: () => true })
    expect(out).toMatchObject({ success: false, offline: true, setAside: true })
    expect(out.error).toBeUndefined()
    expect(fakeDb.matches.map.get(1).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED' })
  })

  // review 2026-10-21 (reproduced): a parked claim let the joined device's
  // events go first; refused as moved, they put ScorerMovedModal on the
  // device the scorer was using
  it('a claim not answered yet holds the match back across passes; its refusals as moved are retried, no notice', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'scorer', status: 'error', attempts: 1, next_attempt_at: Date.now() + 60_000, payload: { id: 'match_100_aaa' } },
      eventJob(2)
    ])
    api.respond = (call) => (call.table === 'events' ? refuse('OV_SCORER_MOVED', { scorer: { platform: 'tauri-windows' } }) : defaultRespond(call))
    await runQueuePass()
    expect(api.calls.some(c => c.table === 'events')).toBe(false)
    expect(fakeDb.sync_queue.map.get(2).status).toBe('queued')

    // The same write sent directly (sendJobNow) while the claim waits: retry later
    fakeDb.sync_queue.map.get(1).status = 'queued'
    api.respond = (call) => {
      if (call.table === '__scorer') return { data: null, error: { message: 'busy', code: 'OV_DB_UNAVAILABLE', status: 503 }, status: 503 }
      return call.table === 'events' ? refuse('OV_SCORER_MOVED', { scorer: { platform: 'tauri-windows' } }) : defaultRespond(call)
    }
    expect(await processJob({ ...eventJob(2) })).toBeNull()
    expect(fakeDb.matches.map.get(1).cloudBlock).toBeUndefined()

    // A claim that keeps failing (503) for many passes: the events still wait
    for (let i = 0; i < 12; i++) {
      await runQueuePass()
      const claim = fakeDb.sync_queue.map.get(1)
      if (claim.status === 'error') fakeDb.sync_queue.map.set(1, { ...claim, status: 'queued' })
    }
    expect(api.calls.filter(c => c.table === 'events').length).toBe(1)
    expect(fakeDb.matches.map.get(1).cloudBlock).toBeUndefined()

    // The claim goes through: the events follow
    api.respond = defaultRespond
    await runQueuePass()
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('a refused claim holds nothing back: then the refusal as moved is the notice', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    fakeDb.sync_queue.reset([
      { id: 1, resource: 'match', action: 'scorer', status: 'failed', payload: { id: 'match_100_aaa' } },
      eventJob(2)
    ])
    api.respond = (call) => (call.table === 'events' ? refuse('OV_SCORER_MOVED') : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(2).status).toBe('dropped')
    expect(fakeDb.matches.map.get(1).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED' })
  })

  it('a restore names when it was made (db/019: a later take-over elsewhere keeps the match)', async () => {
    const ts = new Date(Date.now() - 90_000).toISOString()
    fakeDb.sync_queue.reset([{ id: 1, resource: 'match', action: 'restore', status: 'queued', ts, payload: { match: { external_id: 'match_100_aaa' }, sets: [], events: [] } }])
    api.respond = (call) => (call.table === '__restore' ? ok({ id: MATCH_UUID, counts: {} }) : defaultRespond(call))
    await runQueuePass()
    const call = api.calls.find(c => c.table === '__restore')
    expect(call.data.queuedAt).toBe(ts)
  })

  it.each([
    ['not in the cloud yet', { data: null, error: { message: 'no', code: 'OV_MATCH_NOT_FOUND', status: 404 }, status: 404 }],
    ['an older backend without the route', { data: null, error: { message: 'Not found', status: 404 }, status: 404 }],
    ['closed', { data: null, error: { message: 'closed', code: 'OV_MATCH_CLOSED', status: 409 }, status: 409 }],
    ['no db/019', { data: null, error: { message: 'n/a', code: 'OV_SCORER_UNAVAILABLE', status: 503 }, status: 503 }],
    ['a server without a database', { data: null, error: { message: 'n/a', code: 'OV_DB_NOT_CONFIGURED', status: 503 }, status: 503 }]
  ])('a claim the server cannot record (%s) holds nothing back', async (_what, answer) => {
    fakeDb.sync_queue.reset([{ id: 1, resource: 'match', action: 'scorer', status: 'queued', payload: { id: 'match_100_aaa' } }, eventJob(2)])
    api.respond = (call) => (call.table === '__scorer' ? answer : defaultRespond(call))
    await runQueuePass()
    expect(fakeDb.sync_queue.map.get(1).status).toBe('sent')
    expect(fakeDb.sync_queue.map.get(2).status).toBe('sent')
  })

  it('the relay nudge marks the match only when the server says this device no longer scores it', async () => {
    fakeDb.matches.reset([{ id: 1, seed_key: 'match_100_aaa', status: 'live' }])
    api.respond = (call) => (call.table === '__scorer' ? ok({ mine: true, scorer: { platform: 'tauri-linux' } }) : defaultRespond(call))
    expect(await checkScorerMoved('match_100_aaa')).toBe(false)
    expect(fakeDb.matches.map.get(1).cloudBlock).toBeUndefined()
    api.respond = (call) => (call.table === '__scorer' ? ok({ mine: false, scorer: { platform: 'android', at: 'T' } }) : defaultRespond(call))
    expect(await checkScorerMoved('match_100_aaa')).toBe(true)
    expect(fakeDb.matches.map.get(1).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED', scorer: { platform: 'android', at: 'T' } })
    expect(api.calls.filter(c => c.table === '__scorer').every(c => c.action === 'status')).toBe(true)
  })
})
