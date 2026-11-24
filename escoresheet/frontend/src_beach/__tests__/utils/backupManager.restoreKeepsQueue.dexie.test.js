import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// Stress test 2026-10-25 (ob-delete-match-wipes-other-matches-queue): a
// match closed offline has nothing left on the device but its queued jobs
// (Close match deletes its local copy). A backup restore (from a file or a
// cloud backup) cleared the whole sync queue with the match tables: the
// closed match's end never reached the cloud. Only the restored match's
// jobs go now.
let savedDeps
let db
let bm
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const CLOSED = 'match_1792931000000_closed1'
const RESTORED = 'match_1792932000000_rest2'

describe('restoreMatchFromJson keeps the other matches\' unsent jobs', () => {
  it('drops the restored match\'s old jobs, keeps the closed match\'s end', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 12, seed_key: RESTORED, gamePin: '900001' })
    await db.sets.add({ matchId, index: 1, team1Points: 3, team2Points: 5 })
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))

    const ts = new Date().toISOString()
    const closedEnd = [
      { resource: 'set', action: 'update', payload: { external_id: `${CLOSED}:s:2`, finished: true }, ts, status: 'queued' },
      { resource: 'match', action: 'update', payload: { id: CLOSED, status: 'final' }, ts, status: 'queued' }
    ]
    await db.sync_queue.bulkAdd(closedEnd)
    await db.sync_queue.add({ resource: 'set', action: 'update', payload: { external_id: `${RESTORED}:s:1`, team1_points: 2 }, ts, status: 'queued' })

    await bm.restoreMatchFromJson(file)

    const jobs = await db.sync_queue.toArray()
    expect(jobs.filter(j => j.action !== 'restore').map(j => j.payload)).toEqual(closedEnd.map(j => j.payload))
    expect(jobs.filter(j => j.action === 'restore').map(j => j.payload.match.external_id)).toEqual([RESTORED])
  })
})
