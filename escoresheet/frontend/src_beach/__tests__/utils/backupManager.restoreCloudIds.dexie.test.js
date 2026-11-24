import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The restore job keyed the restored sets and events in the cloud by the
// backup's own ids (`<seed>_set_<index>`, `<seed>_event_<seq>`, or the old
// externalId of a match imported from the cloud), but every later write of
// this device names them by their new local id (setExtId / eventExtId: the
// set end, Manual changes, an undo's revision). Those writes matched no cloud
// row: after a restore from a file the cloud kept the restored score for
// good. The cloud ids follow the new local ids now (OpenVolley 2dbac56b).
let savedDeps
let db
let bm
let setExtId
let eventExtId
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  ;({ setExtId, eventExtId } = await import('../../utils_beach/syncIds_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

const SEED = 'match_1792932000000_ids1'

// A match imported from the cloud: its rows carry the cloud ids of the
// device that scored it before (another device's local ids)
async function seedImported() {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, seed_key: SEED, gamePin: '900007' })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 17, finished: true, externalId: `${SEED}:s:40` },
    { matchId, index: 2, team1Points: 3, team2Points: 5, finished: false, externalId: `${SEED}:s:41` }
  ])
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' }, externalId: `${SEED}:e:300` },
    { matchId, setIndex: 2, type: 'point', seq: 2, payload: { team: 'team2' } }
  ])
  return matchId
}

async function restoreJob() {
  const jobs = (await db.sync_queue.toArray()).filter(j => j.action === 'restore')
  expect(jobs).toHaveLength(1)
  return jobs[0].payload
}

async function cloudIdsOf(matchId) {
  const sets = (await db.sets.where('matchId').equals(matchId).sortBy('index')).map(s => setExtId(SEED, s.id))
  const events = (await db.events.where('matchId').equals(matchId).sortBy('seq')).map(e => eventExtId(SEED, e.id))
  return { sets, events }
}

describe('a restore keys the cloud rows by the restored rows\' local ids', () => {
  it('restoreMatchFromJson (Restore match from a file or a cloud backup)', async () => {
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(await seedImported())))
    const restored = await bm.restoreMatchFromJson(file)
    const job = await restoreJob()
    const ids = await cloudIdsOf(restored)
    // what the scoreboard sends for the set end and an undo's revision
    expect(job.sets.map(s => s.external_id)).toEqual(ids.sets)
    expect(job.events.map(e => e.external_id)).toEqual(ids.events)
    expect(job.sets.map(s => `${s.index}:${s.team1_points}-${s.team2_points}`)).toEqual(['1:21-17', '2:3-5'])
  })

  it('restoreMatchInPlace (a cloud backup restored on the scoring screen)', async () => {
    const matchId = await seedImported()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await bm.restoreMatchInPlace(matchId, file)
    const job = await restoreJob()
    const ids = await cloudIdsOf(matchId)
    expect(job.sets.map(s => s.external_id)).toEqual(ids.sets)
    expect(job.events.map(e => e.external_id)).toEqual(ids.events)
  })
})
