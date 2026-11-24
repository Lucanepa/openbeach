import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The v17 -> v18 upgrade of openbeach's real database (db_beach.js): a sync
// queue as a scorer device has it before the update (dual-target statuses,
// bare set/event ids, the 'coin_toss_<seed>' id) must come out with one
// status and match-scoped ids, or those jobs fail forever against the backend.

const V17_STORES = {
  teams: '++id,name,createdAt',
  players: '++id,teamId,number,name,role,createdAt',
  matches: '++id,team1Id,team2Id,scheduledAt,status,createdAt,externalId,test',
  sets: '++id,matchId,index,team1Points,team2Points,finished,startTime,endTime',
  events: '++id,matchId,setIndex,ts,type,payload,seq,stateSnapshot,[matchId+seq],[matchId+setIndex]',
  sync_queue: '++id,resource,action,payload,ts,status,supabase_status,synology_status',
  match_setup: '++id,updatedAt',
  referees: '++id,seedKey,lastName,createdAt',
  scorers: '++id,seedKey,lastName,createdAt',
  interaction_logs: 'id,ts,gameNumber,category,sessionId'
}

let savedDeps
beforeAll(() => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

describe('db_beach v18 upgrade', () => {
  it('collapses the per-target statuses and namespaces the waiting set/event ids', async () => {
    const old = new Dexie('escoresheet')
    old.version(17).stores(V17_STORES)
    await old.open()
    const seed = 'match_1700000000000_abc'
    await old.table('matches').add({ id: 1, seed_key: seed, status: 'live' })
    // matches whose jobs were queued with match_id = String(dexieMatchId)
    const seed3 = 'match_1700000000333_ccc'
    await old.table('matches').add({ id: 2, status: 'live' }) // still no seed_key
    await old.table('matches').add({ id: 3, seed_key: seed3, status: 'live' }) // got one since
    await old.table('sets').add({ id: 3, matchId: 1, index: 1 })
    await old.table('events').add({ id: 7, matchId: 1, type: 'coin_toss', seq: 1 })
    await old.table('events').add({ id: 8, matchId: 1, type: 'point', seq: 2 })
    const job = (o) => ({ ts: '2026-08-01T10:00:00.000Z', ...o })
    await old.table('sync_queue').bulkAdd([
      // 1 sent to the cloud, Synology still pending -> sent
      job({ id: 1, resource: 'match', action: 'insert', status: 'queued', supabase_status: 'sent', synology_status: 'queued', payload: { external_id: seed } }),
      // 2 coin toss with the legacy id, never sent -> queued, local event id
      job({ id: 2, resource: 'event', action: 'insert', status: 'queued', supabase_status: 'queued', synology_status: 'queued', payload: { external_id: `coin_toss_${seed}`, match_id: seed, type: 'coin_toss' } }),
      // 3 set insert with a bare id, cloud error -> back in the queue, namespaced
      job({ id: 3, resource: 'set', action: 'insert', status: 'queued', supabase_status: 'error', synology_status: 'sent', payload: { external_id: '3', match_id: seed, index: 1 } }),
      // 4 set update (no match_id) written by useSequentialSync: status only
      job({ id: 4, resource: 'set', action: 'update', status: 'error', payload: { external_id: '3', team1_points: 21, finished: true } }),
      // 5 point event sent by useSequentialSync
      job({ id: 5, resource: 'event', action: 'insert', status: 'sent', payload: { external_id: '8', match_id: seed, type: 'point' } }),
      // 6 orphan event (no match anywhere) -> dropped
      job({ id: 6, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '99' } }),
      // 7 numeric match_id, the local match has no seed_key -> dropped (not '2:e:12')
      job({ id: 7, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '12', match_id: '2', type: 'point' } }),
      // 8 numeric match_id, the local match has a seed_key now -> its seed
      job({ id: 8, resource: 'event', action: 'insert', status: 'error', payload: { external_id: '13', match_id: '3', type: 'point' } }),
      // 9 numeric match_id of a match that is gone -> dropped
      job({ id: 9, resource: 'set', action: 'insert', status: 'queued', payload: { external_id: '4', match_id: '99', index: 1 } })
    ])
    old.close()

    const { db } = await import('../../db_beach/db_beach')
    await db.open()
    expect(db.verno).toBe(20)
    const rows = Object.fromEntries((await db.sync_queue.toArray()).map(r => [r.id, r]))

    expect(rows[1].status).toBe('sent')
    expect(rows[2]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:e:7` } })
    expect(rows[3]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:s:3`, match_id: seed } })
    expect(rows[4]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:s:3`, team1_points: 21 } })
    expect(rows[5]).toMatchObject({ status: 'sent', payload: { external_id: '8' } })
    expect(rows[6].status).toBe('dropped')
    expect(rows[7].status).toBe('dropped')
    expect(rows[8]).toMatchObject({ status: 'queued', payload: { external_id: `${seed3}:e:13`, match_id: seed3 } })
    expect(rows[9].status).toBe('dropped')
    for (const r of Object.values(rows)) {
      expect(r).not.toHaveProperty('supabase_status')
      expect(r).not.toHaveProperty('synology_status')
    }
    // The queue reads one status index now
    expect(await db.sync_queue.where('status').equals('queued').count()).toBe(4)
    // v19 adds the saved teams cache, empty
    expect(await db.saved_teams.count()).toBe(0)
    expect(await db.saved_teams_meta.count()).toBe(0)
    db.close()
  })
})

// v18 -> v19 only adds the saved beach teams cache (two new tables, no upgrade
// function): a device's matches and waiting sync jobs must come through intact.
const V18_STORES = { ...V17_STORES, sync_queue: '++id,resource,action,payload,ts,status' }

describe('db_beach v19 (saved teams cache)', () => {
  it('opens a v18 database at the latest version with its rows intact and empty cache tables', async () => {
    const { db } = await import('../../db_beach/db_beach')
    await db.delete()
    const old = new Dexie('escoresheet')
    old.version(18).stores(V18_STORES)
    await old.open()
    await old.table('matches').add({ id: 1, seed_key: 'match_1', status: 'live', team1Name: 'A' })
    await old.table('sync_queue').bulkAdd([
      { id: 1, resource: 'match', action: 'insert', status: 'queued', ts: '2026-10-01T10:00:00.000Z', payload: { external_id: 'match_1' } },
      { id: 2, resource: 'event', action: 'insert', status: 'sent', ts: '2026-10-01T10:00:01.000Z', payload: { external_id: 'match_1:e:3', match_id: 'match_1' } }
    ])
    old.close()

    await db.open()
    expect(db.verno).toBe(20)
    expect(await db.matches.get(1)).toMatchObject({ seed_key: 'match_1', status: 'live', team1Name: 'A' })
    const jobs = await db.sync_queue.toArray()
    expect(jobs.map(j => [j.id, j.status, j.payload.external_id])).toEqual([[1, 'queued', 'match_1'], [2, 'sent', 'match_1:e:3']])
    expect(await db.saved_teams.count()).toBe(0)
    expect(await db.saved_teams_meta.count()).toBe(0)
    await db.saved_teams.put({ id: 't1', competitionId: 'c1', nameKey: 'a/b', pairKey: 'a/b' })
    expect(await db.saved_teams.where('nameKey').equals('a/b').count()).toBe(1)
    db.close()
  })

  it('a fresh database opens at 20', async () => {
    const { db } = await import('../../db_beach/db_beach')
    await db.delete()
    await db.open()
    expect(db.verno).toBe(20)
    expect(db.tables.map(t => t.name)).toEqual(expect.arrayContaining(['matches', 'sync_queue', 'saved_teams', 'saved_teams_meta', 'event_history', 'activity_log']))
    expect(await db.saved_teams.count()).toBe(0)
    db.close()
  })
})

// v19 -> v20 adds the event history and the activity log (new tables, a new
// matchId index on interaction_logs, no upgrade function): a device's events,
// saved teams and interaction log come through intact and the new tables work.
const V19_STORES = {
  ...V18_STORES,
  interaction_logs: 'id,ts,gameNumber,category,sessionId',
  saved_teams: 'id, competitionId, nameKey, pairKey',
  saved_teams_meta: 'key'
}

describe('db_beach v20 (event history, activity log)', () => {
  it('opens a v19 database at 20 with its rows intact and empty history tables', async () => {
    const { db } = await import('../../db_beach/db_beach')
    await db.delete()
    const old = new Dexie('escoresheet')
    old.version(19).stores(V19_STORES)
    await old.open()
    await old.table('matches').add({ id: 1, seed_key: 'match_1', status: 'live' })
    await old.table('events').add({ id: 5, matchId: 1, setIndex: 1, type: 'point', seq: 4, payload: { team: 'team1' } })
    await old.table('saved_teams').put({ id: 't1', competitionId: 'c1', nameKey: 'a/b', pairKey: 'a/b' })
    await old.table('interaction_logs').add({ id: 'l1', ts: 1, gameNumber: 3, category: 'click', matchId: 1 })
    old.close()

    await db.open()
    expect(db.verno).toBe(20)
    expect(await db.events.get(5)).toMatchObject({ type: 'point', seq: 4 })
    expect(await db.saved_teams.count()).toBe(1)
    expect(await db.interaction_logs.where('matchId').equals(1).count()).toBe(1)
    expect(await db.event_history.count()).toBe(0)
    expect(await db.activity_log.count()).toBe(0)
    // the seq high-water index of the event history
    await db.event_history.add({ revUid: '00000000-0000-4000-8000-000000000001', matchId: 1, eventId: 5, seq: 4, op: 'void', ts: 'x' })
    expect(await db.event_history.where('[matchId+seq]').between([1, 0], [1, 99]).count()).toBe(1)
    db.close()
  })
})
