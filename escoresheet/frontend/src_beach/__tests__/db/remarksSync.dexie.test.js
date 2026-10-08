// The match remarks go to the server (OpenVolley backend db/017): every
// committed change of match.remarks queues one match update { remarks }
// (db_beach/remarksSync_beach.js), against the real app database (db_beach,
// Dexie 4 on fake-indexeddb). Ported from OpenVolley
// src/db/__tests__/remarksSync.dexie.test.js, plus the beach forfeit.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db_beach/db_beach'
import { REMARKS_MAX, remarksForServer, remarksSyncJob, remarksSnapshotJob } from '../../db_beach/remarksSync_beach'
import { VALID_MATCH_COLUMNS, filterMatchPayload } from '../../hooks_beach/useSyncQueue_beach'
import { appendRemark, removeRemarkLine } from '../../utils_beach/corrections_beach'

const SEED = 'match_1759740000000_ob01rm'
const settle = () => new Promise(r => setTimeout(r, 20))
const remarkJobs = async () => (await db.sync_queue.toArray()).filter(j => j.resource === 'match' && j.action === 'update' && 'remarks' in (j.payload || {}))

describe('remarks sync hook (OpenBeach)', () => {
  let matchId
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
    matchId = await db.matches.add({ status: 'live', seed_key: SEED, test: false, sport_type: 'beach' })
  })

  it('a remarks edit (match end box) queues the whole text, nothing else', async () => {
    await db.matches.update(matchId, { remarks: 'Sand raked at 1:1' })
    await settle()
    const jobs = await remarkJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ resource: 'match', action: 'update', status: 'queued', payload: { id: SEED, remarks: 'Sand raked at 1:1' } })
    expect(Object.keys(jobs[0].payload).sort()).toEqual(['id', 'remarks'])
  })

  it('the forfeit at the coin toss: the remarks job is written in the same transaction, before the status job', async () => {
    const text = 'Team Rossi / Bianchi forfeits the match due to no show'
    await db.transaction('rw', db.matches, db.sync_queue, async () => {
      await db.matches.update(matchId, { status: 'ended', forfait: true, remarks: text })
      await db.sync_queue.add({ resource: 'match', action: 'update', payload: { id: SEED, status: 'ended' }, ts: 't', status: 'queued' })
    })
    const all = await db.sync_queue.toArray()
    expect(all.map(j => j.payload)).toEqual([{ id: SEED, remarks: text }, { id: SEED, status: 'ended' }])
  })

  it('an added and an undone "Actual start time" line: one job per change, in order', async () => {
    const line = 'Actual start time: 10:05'
    await db.matches.update(matchId, { remarks: appendRemark('Wind', line) })
    await db.matches.update(matchId, { remarks: removeRemarkLine(`Wind\n${line}`, line) })
    await settle()
    expect((await remarkJobs()).map(j => j.payload.remarks)).toEqual([`Wind\n${line}`, 'Wind'])
  })

  it('unchanged text, other fields, test or local-only matches, a rollback: no job', async () => {
    await db.matches.update(matchId, { remarks: 'same' })
    await settle()
    await db.matches.update(matchId, { remarks: 'same', status: 'ended' })
    const testId = await db.matches.add({ status: 'live', seed_key: 'match_test_ob', test: true })
    await db.matches.update(testId, { remarks: 'test' })
    const localId = await db.matches.add({ status: 'live' })
    await db.matches.update(localId, { remarks: 'local' })
    await expect(db.transaction('rw', db.matches, async () => {
      await db.matches.update(matchId, { remarks: 'Rolled back' })
      throw new Error('abort')
    })).rejects.toThrow('abort')
    await db.matches.add({ status: 'live', seed_key: 'match_restored_ob', remarks: 'From a backup' })
    await settle()
    expect((await remarkJobs()).map(j => j.payload.remarks)).toEqual(['same'])
  })

  it('the local text is never shortened; the server copy is clipped', async () => {
    const long = 'b'.repeat(REMARKS_MAX + 10)
    await db.matches.update(matchId, { remarks: long })
    await settle()
    expect((await db.matches.get(matchId)).remarks).toBe(long)
    expect((await remarkJobs())[0].payload.remarks).toHaveLength(REMARKS_MAX)
  })
})

describe('remarks: columns, limit, jobs', () => {
  it('remarks is a match column the sync keeps', () => {
    expect(VALID_MATCH_COLUMNS).toContain('remarks')
    expect(filterMatchPayload({ external_id: 'x', remarks: 'r', forfait: true })).toEqual({ external_id: 'x', remarks: 'r' })
  })

  it('remarksForServer and the jobs', () => {
    expect(remarksForServer(undefined)).toBe('')
    expect(Array.from(remarksForServer('🏐'.repeat(REMARKS_MAX + 1)))).toHaveLength(REMARKS_MAX)
    expect(remarksSyncJob({ remarks: undefined }, { seed_key: SEED, remarks: '' })).toBeNull()
    expect(remarksSyncJob({ remarks: 'a' }, { seed_key: SEED, remarks: null })?.payload).toEqual({ id: SEED, remarks: '' })
    expect(remarksSnapshotJob({ seed_key: SEED, remarks: 'At approval' })?.payload).toEqual({ id: SEED, remarks: 'At approval' })
    expect(remarksSnapshotJob({ seed_key: SEED, test: true })).toBeNull()
    expect(remarksSnapshotJob({})).toBeNull()
  })
})
