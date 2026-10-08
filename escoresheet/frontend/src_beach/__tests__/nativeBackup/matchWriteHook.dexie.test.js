// The write hook against the real app database (Dexie 4 on fake-indexeddb):
// real hook signatures, real implicit and explicit transactions, and the
// backup engine reading the committed state through exportMatchData.
// Ported from OpenVolley src/utils/nativeBackup/__tests__/matchWriteHook.dexie.test.js.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { subscribeMatchWrites } from '../../utils_beach/nativeBackup/matchWriteHook_beach'
import { createNativeBackupEngine } from '../../utils_beach/nativeBackup/engine_beach'
import { LATEST_FILE } from '../../utils_beach/nativeBackup/rotation_beach'

// The setup file replaces window.indexedDB with a stub; the real db_beach
// instance captures Dexie.dependencies when it is constructed, so they are
// swapped for fake-indexeddb before the module is imported.
let savedDeps
let db
let exportMatchData
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  ;({ exportMatchData } = await import('../../utils_beach/backupManager_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const settle = () => new Promise(r => setTimeout(r, 20))

async function seedMatch() {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const otherTeamId = await db.teams.add({ name: 'Other' })
  const matchId = await db.matches.add({
    team1Id, team2Id, status: 'live', gameN: 3, seed_key: 'match_1759740000000_ab12cd',
    gamePin: '123456', refereePin: '654321', team1Pin: '111222'
  })
  await db.players.add({ teamId: team1Id, number: 1, lastName: 'Müller' })
  const setId = await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0 })
  return { matchId, team1Id, team2Id, otherTeamId, setId }
}

describe('subscribeMatchWrites on the real Dexie database', () => {
  let ids
  let off = () => {}

  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
    ids = await seedMatch()
  })
  afterEach(() => off())

  it('fires after commit for events, snapshots, sets, the match row and its players only', async () => {
    const onWrite = vi.fn()
    off = subscribeMatchWrites(db, ids.matchId, onWrite)
    await settle() // team ids are read from the match row

    const eventId = await db.events.add({ matchId: ids.matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
    await settle()
    expect(onWrite).toHaveBeenCalledTimes(1)

    await db.events.update(eventId, { stateSnapshot: { team1Points: 1 } })
    await db.sets.update(ids.setId, { team1Points: 1 })
    await db.matches.update(ids.matchId, { status: 'ended' })
    await settle()
    expect(onWrite).toHaveBeenCalledTimes(4)

    // roster change during the match (players of the match's teams)
    await db.players.where('teamId').equals(ids.team1Id).modify({ isCaptain: true })
    await db.players.add({ teamId: ids.team2Id, number: 2, lastName: 'Rossi' })
    await settle()
    expect(onWrite).toHaveBeenCalledTimes(6)

    // bookkeeping, rally starts, other matches and other teams: nothing
    await db.matches.update(ids.matchId, { updatedAt: new Date().toISOString(), refereeHeartbeat: Date.now() })
    await db.events.add({ matchId: ids.matchId, type: 'rally_start', seq: 2 })
    await db.events.add({ matchId: ids.matchId + 1, type: 'point', seq: 1 })
    await db.players.add({ teamId: ids.otherTeamId, number: 9, lastName: 'C' })
    await settle()
    expect(onWrite).toHaveBeenCalledTimes(6)

    // undo
    await db.events.delete(eventId)
    await settle()
    expect(onWrite).toHaveBeenCalledTimes(7)
  })

  it('never fires for a transaction that is rolled back', async () => {
    const onWrite = vi.fn()
    off = subscribeMatchWrites(db, ids.matchId, onWrite)
    await expect(db.transaction('rw', db.events, db.sets, async () => {
      await db.events.add({ matchId: ids.matchId, type: 'point', seq: 1 })
      await db.sets.update(ids.setId, { team1Points: 1 })
      throw new Error('abort')
    })).rejects.toThrow('abort')
    await settle()
    expect(onWrite).not.toHaveBeenCalled()
    expect(await db.events.count()).toBe(0)
  })

  it('fires once the explicit transaction commits, not inside it', async () => {
    const onWrite = vi.fn()
    off = subscribeMatchWrites(db, ids.matchId, onWrite)
    let calledInside = null
    await db.transaction('rw', db.events, db.sets, async () => {
      await db.events.add({ matchId: ids.matchId, type: 'point', seq: 1 })
      await db.sets.update(ids.setId, { team1Points: 1 })
      calledInside = onWrite.mock.calls.length
    })
    await settle()
    expect(calledInside).toBe(0)
    expect(onWrite).toHaveBeenCalledTimes(2)
  })

  it('with the engine: the scoreboard write sequence of a point gives one complete file without PINs', async () => {
    const files = new Map()
    const store = {
      info: async () => ({ folder: '/b' }),
      write: vi.fn(async (dir, name, text) => { files.set(`${dir}/${name}`, text); files.set(`${dir}/${LATEST_FILE}`, text) }),
      list: async () => [],
      remove: async () => {}
    }
    const engine = createNativeBackupEngine({ store, exportMatch: exportMatchData, quietMs: 150, log: { info() {}, warn() {}, error() {} } })
    off = subscribeMatchWrites(db, ids.matchId, () => engine.notify(ids.matchId))

    // Scoreboard: event, then (slowly) its snapshot, then the set score
    const eventId = await db.events.add({ matchId: ids.matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
    await new Promise(r => setTimeout(r, 120))
    await db.events.update(eventId, { stateSnapshot: { team1Points: 1 } })
    await new Promise(r => setTimeout(r, 40))
    await db.sets.update(ids.setId, { team1Points: 1 })
    await new Promise(r => setTimeout(r, 400))
    await engine.flush()

    expect(store.write).toHaveBeenCalledTimes(1)
    const [, text] = [...files].find(([k]) => !k.endsWith(LATEST_FILE))
    const data = JSON.parse(text)
    expect(data.events).toHaveLength(1)
    expect(data.events[0].stateSnapshot).toEqual({ team1Points: 1 })
    expect(data.sets[0].team1Points).toBe(1)
    expect(data.team1Players).toHaveLength(1)
    expect(data.team1.name).toBe('Müller / Weber')
    expect(data.match.gamePin).toBeUndefined()
    expect(data.match.refereePin).toBeUndefined()
    expect(data.match.team1Pin).toBeUndefined()
    expect(store.write.mock.calls[0][0]).toBe('game3-match_1759740000000_ab12cd')
  })
})
