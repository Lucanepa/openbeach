import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The file of an approved or final match (the match-end ZIP's MatchData, a
// backup written after the approval) queued a restore job: the server
// refuses every write of a closed match (db/007, 409 OV_MATCH_CLOSED), so the
// job was refused on every retry. Until the restore asks the server whether
// the match is closed, such a file is restored on the device only.
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
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

const SEED = 'match_1792932000000_appr1'

async function seedMatch(fields = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, seed_key: SEED, gamePin: '900007', ...fields })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 17, finished: true },
    { matchId, index: 2, team1Points: 21, team2Points: 19, finished: true }
  ])
  await db.events.add({ matchId, setIndex: 2, type: 'point', seq: 1, payload: { team: 'team1' } })
  return matchId
}

const fileOf = async (matchId) => JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
const restoreJobs = async () => (await db.sync_queue.toArray()).filter(j => j.action === 'restore')

describe('the file of an approved or final match', () => {
  it.each([
    ['approved here (status ended, approved)', { status: 'ended', approved: true }],
    ['final', { status: 'final' }],
    ['approved on the server', { status: 'approved' }]
  ])('%s: restored on the device, no restore job', async (_label, fields) => {
    const file = await fileOf(await seedMatch(fields))

    const restored = await bm.restoreMatchFromJson(file)

    expect(await db.matches.get(restored)).toMatchObject({ seed_key: SEED, ...fields })
    expect(await db.sets.where('matchId').equals(restored).count()).toBe(2)
    expect(await db.events.where('matchId').equals(restored).count()).toBe(1)
    expect(await restoreJobs()).toEqual([])
  })

  it('restoreMatchInPlace too', async () => {
    const open = await seedMatch()
    const file = await fileOf(await seedMatch({ status: 'ended', approved: true }))

    await bm.restoreMatchInPlace(open, file)

    expect(await db.matches.get(open)).toMatchObject({ approved: true })
    expect(await restoreJobs()).toEqual([])
  })

  it('a live or ended match still queues its restore', async () => {
    await bm.restoreMatchFromJson(await fileOf(await seedMatch({ status: 'ended' })))
    expect(await restoreJobs()).toHaveLength(1)
  })
})
