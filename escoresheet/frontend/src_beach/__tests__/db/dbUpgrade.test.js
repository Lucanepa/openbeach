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
      job({ id: 6, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '99' } })
    ])
    old.close()

    const { db } = await import('../../db_beach/db_beach')
    await db.open()
    expect(db.verno).toBe(18)
    const rows = Object.fromEntries((await db.sync_queue.toArray()).map(r => [r.id, r]))

    expect(rows[1].status).toBe('sent')
    expect(rows[2]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:e:7` } })
    expect(rows[3]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:s:3`, match_id: seed } })
    expect(rows[4]).toMatchObject({ status: 'queued', payload: { external_id: `${seed}:s:3`, team1_points: 21 } })
    expect(rows[5]).toMatchObject({ status: 'sent', payload: { external_id: '8' } })
    expect(rows[6].status).toBe('dropped')
    for (const r of Object.values(rows)) {
      expect(r).not.toHaveProperty('supabase_status')
      expect(r).not.toHaveProperty('synology_status')
    }
    // The queue reads one status index now
    expect(await db.sync_queue.where('status').equals('queued').count()).toBe(3)
    db.close()
  })
})
