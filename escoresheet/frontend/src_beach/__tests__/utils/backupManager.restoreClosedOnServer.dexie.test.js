import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { isStaleClosedCopy } from '../../utils_beach/matchReopen_beach'

// Ported from OpenVolley 4032fc8b (2026-10-20, match 406970): a backup of a
// match the server had closed was restored as a live copy; its restore job
// was refused (409 OV_MATCH_CLOSED) on every retry and held back every newer
// write of the match. The restore asks the server first now and refuses such
// a match before it writes anything; offline, local evidence decides.
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

const SEED = 'match_1792518507614_u2sbmb'

// An app backup file of the match (exportMatchData's shape)
const backup = (match = {}) => ({
  version: 1,
  match: { seed_key: SEED, gameN: 7, gamePin: '583920', status: 'live', team1Id: 91, team2Id: 92, ...match },
  team1: { name: 'Müller / Weber' },
  team2: { name: 'Schmidt / Fischer' },
  team1Players: [{ number: 1, lastName: 'Müller' }],
  team2Players: [{ number: 1, lastName: 'Schmidt' }],
  sets: [{ index: 1, team1Points: 12, team2Points: 10, finished: false }],
  events: [{ setIndex: 1, type: 'coin_toss', seq: 1, payload: {} }]
})

async function snapshot() {
  const rows = {}
  for (const t of ['matches', 'teams', 'players', 'sets', 'events', 'sync_queue']) rows[t] = await db[t].toArray()
  return rows
}
const restoreJobs = async () => (await db.sync_queue.toArray()).filter(j => j.action === 'restore')

describe('restoring a match closed on the server', () => {
  it('the server says closed: refused before anything is replaced or queued', async () => {
    await db.matches.add({ seed_key: SEED, gameN: 7, status: 'live' })
    const before = await snapshot()
    const checkServer = vi.fn(async () => true)
    const err = await bm.restoreMatchFromJson(backup(), { checkServer }).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ code: 'OV_MATCH_CLOSED', externalId: SEED, gameN: 7 })
    expect(checkServer).toHaveBeenCalledWith(SEED)
    expect(await snapshot()).toEqual(before)
  })

  it('the server says open (an admin reopened it): a backup taken after the refusal comes back without its closed evidence', async () => {
    await db.matches.add({ seed_key: SEED, status: 'live', cloudBlock: { code: 'OV_MATCH_CLOSED', at: 1 } })
    const closedBackup = backup({ cloudBlock: { code: 'OV_MATCH_CLOSED', claim: null, at: 1 }, closed_at: '2026-10-20T21:09:00Z' })
    const newId = await bm.restoreMatchFromJson(closedBackup, { checkServer: async () => false })
    const restored = await db.matches.get(newId)
    expect(restored).toMatchObject({ seed_key: SEED, status: 'live', cloudBlock: null, closed_at: null })
    expect(isStaleClosedCopy(restored)).toBe(false)
    expect(await db.matches.count()).toBe(1)
    expect(await restoreJobs()).toHaveLength(1)
  })

  it('the server cannot be asked: local evidence decides', async () => {
    const offline = async () => null
    // the backup carries the block of a refused write
    await expect(bm.restoreMatchFromJson(backup({ cloudBlock: { code: 'OV_MATCH_CLOSED', at: 1 } }), { checkServer: offline }))
      .rejects.toMatchObject({ code: 'OV_MATCH_CLOSED' })
    // the local copy it would replace was refused as closed
    const id = await db.matches.add({ seed_key: SEED, status: 'live', cloudBlock: { code: 'OV_MATCH_CLOSED', at: 1 } })
    await expect(bm.restoreMatchFromJson(backup(), { checkServer: offline }))
      .rejects.toMatchObject({ code: 'OV_MATCH_CLOSED' })
    expect(await db.matches.get(id)).toMatchObject({ cloudBlock: { code: 'OV_MATCH_CLOSED' } })
    expect(await restoreJobs()).toEqual([])
    // nothing says closed: the restore goes ahead
    await db.matches.update(id, { cloudBlock: null })
    const newId = await bm.restoreMatchFromJson(backup(), { checkServer: offline })
    expect(await db.matches.get(newId)).toMatchObject({ seed_key: SEED, status: 'live' })
    expect(await restoreJobs()).toHaveLength(1)
  })

  // fix/backup-basics (42b51a2): the file of an approved or final match is
  // the closed match itself, restored on the device without a restore job
  it('the backup of an approved or final match never asks: restored on the device, no restore job', async () => {
    const checkServer = vi.fn(async () => true)
    const id = await bm.restoreMatchFromJson(backup({ status: 'final' }), { checkServer })
    expect(await db.matches.get(id)).toMatchObject({ seed_key: SEED, status: 'final' })
    expect(checkServer).not.toHaveBeenCalled()
    expect(await restoreJobs()).toEqual([])
  })

  it('a test backup never asks the server', async () => {
    const checkServer = vi.fn(async () => true)
    const id = await bm.restoreMatchFromJson(backup({ test: true, status: 'approved' }), { checkServer })
    await bm.restoreMatchInPlace(id, backup({ test: true }), { checkServer })
    expect(checkServer).not.toHaveBeenCalled()
  })

  it('restoreMatchInPlace: refused before the open match is overwritten', async () => {
    const id = await db.matches.add({ seed_key: SEED, status: 'live', gameN: 7 })
    const before = await snapshot()
    const checkServer = vi.fn(async () => true)
    await expect(bm.restoreMatchInPlace(id, backup({ status: 'ended' }), { checkServer }))
      .rejects.toMatchObject({ code: 'OV_MATCH_CLOSED', externalId: SEED, gameN: 7 })
    expect(checkServer).toHaveBeenCalledWith(SEED)
    expect(await snapshot()).toEqual(before)
  })

  it('restoreMatchInPlace: offline with the open copy known closed, refused; the server says open, the copy comes back open', async () => {
    const id = await db.matches.add({ seed_key: SEED, status: 'live', cloudBlock: { code: 'OV_MATCH_CLOSED', at: 1 } })
    await expect(bm.restoreMatchInPlace(id, backup(), { checkServer: async () => null }))
      .rejects.toMatchObject({ code: 'OV_MATCH_CLOSED' })
    await bm.restoreMatchInPlace(id, backup(), { checkServer: async () => false })
    expect(await restoreJobs()).toHaveLength(1)
    // the current row's block does not survive the merge
    expect(await db.matches.get(id)).toMatchObject({ status: 'live', cloudBlock: null })
    expect(isStaleClosedCopy(await db.matches.get(id))).toBe(false)
  })
})

describe('serverClosedState', () => {
  const answer = (result) => async () => result

  it('closed: a non-test match at approved / final; a match the server does not have is not', async () => {
    expect(await bm.serverClosedState(SEED, { read: answer({ data: { external_id: SEED, status: 'approved' }, error: null }) })).toBe(true)
    expect(await bm.serverClosedState(SEED, { read: answer({ data: { external_id: SEED, status: 'final', test: false }, error: null }) })).toBe(true)
    expect(await bm.serverClosedState(SEED, { read: answer({ data: { external_id: SEED, status: 'approved', test: true }, error: null }) })).toBe(false)
    // an admin reopen writes 'ended'
    expect(await bm.serverClosedState(SEED, { read: answer({ data: { external_id: SEED, status: 'ended' }, error: null }) })).toBe(false)
    expect(await bm.serverClosedState(SEED, { read: answer({ data: null, error: null }) })).toBe(false)
  })

  it('unknown (null): no key, offline, a read error, a failed request or no answer within the time', async () => {
    const read = vi.fn(answer({ data: { status: 'approved' }, error: null }))
    expect(await bm.serverClosedState(null, { read })).toBe(null)
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      expect(await bm.serverClosedState(SEED, { read })).toBe(null)
    } finally {
      onLine.mockRestore()
    }
    expect(read).not.toHaveBeenCalled()
    expect(await bm.serverClosedState(SEED, { read: answer({ data: null, error: { message: 'Backend not available' } }) })).toBe(null)
    expect(await bm.serverClosedState(SEED, { read: async () => { throw new Error('boom') } })).toBe(null)
    expect(await bm.serverClosedState(SEED, { read: () => new Promise(() => {}), timeoutMs: 20 })).toBe(null)
  })
})
