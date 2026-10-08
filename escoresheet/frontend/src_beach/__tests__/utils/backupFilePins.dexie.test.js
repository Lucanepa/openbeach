import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// Browser backup files (folder backup, periodic / manual download) are the
// full exportMatchData with the match row's PINs, as in OpenVolley: they move
// a match to another device, where a restore keeps exactly those PINs. Only
// the app's per-event backup files (nativeBackup, secretsRemoved) carry no
// PINs; restoring one keeps the PINs of the local copy it replaces, or makes
// new ones. Ported from OpenVolley 8e472769 (backupManager.restore tests)
// with openbeach's PIN names.

// The setup file replaces window.indexedDB with a stub; the real db_beach
// instance captures Dexie.dependencies when it is constructed, so they are
// swapped for fake-indexeddb before the module is imported.
let savedDeps
let db
let bm
let serializeBackup
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  ;({ serializeBackup } = await import('../../utils_beach/nativeBackup/engine_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const SEED = 'match_1759740000000_ab12cd'
const PINS = {
  gamePin: '900001', refereePin: '900002', team1Pin: '900003', team2Pin: '900004',
  team1UploadPin: '900005', team2UploadPin: '900006', matchPin: '900007'
}
const ALL_PINS = Object.values(PINS)

async function seedMatch(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const matchId = await db.matches.add({
    team1Id, team2Id, status: 'live', gameN: 12, seed_key: SEED, sessionId: 'sess-1',
    connection_pins: { referee: '900002' }, ...PINS, ...extra
  })
  await db.players.bulkAdd([{ teamId: team1Id, number: 1, lastName: 'Müller' }, { teamId: team2Id, number: 2, lastName: 'Rossi' }])
  await db.sets.add({ matchId, index: 1, team1Points: 14, team2Points: 12 })
  await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
  return matchId
}

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

describe('browser backup files', () => {
  it('a folder backup file is the full match row, PINs included', async () => {
    const matchId = await seedMatch()
    let written = ''
    const dir = {
      getFileHandle: async () => ({
        createWritable: async () => ({ write: async (t) => { written += t }, close: async () => {} })
      })
    }
    const res = await bm.writeMatchBackup(matchId, dir)
    expect(res.success).toBe(true)
    const data = JSON.parse(written)
    expect(data.secretsRemoved).toBeUndefined()
    expect(data.match).toMatchObject({ gameN: 12, seed_key: SEED, status: 'live', ...PINS })
    expect(data.match.connection_pins).toEqual({ referee: '900002' })
    expect(data.sets[0].team1Points).toBe(14)
    expect(data.events).toHaveLength(1)
    expect(data.team1Players).toHaveLength(1)
    const { lastUpdated: _a, ...exported } = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    const { lastUpdated: _b, ...inFile } = data
    expect(inFile).toEqual(exported)
  })

  it('a downloaded backup file has the PINs too', async () => {
    const matchId = await seedMatch()
    let blob = null
    const create = URL.createObjectURL
    const revoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:x' })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      const name = await bm.downloadMatchBackup(matchId)
      expect(name).toMatch(/^backup_g12_set1_scoreleft14_scoreright12_/)
      const data = JSON.parse(await blob.text())
      expect(data.secretsRemoved).toBeUndefined()
      expect(data.match).toMatchObject(PINS)
    } finally {
      click.mockRestore()
      URL.createObjectURL = create
      URL.revokeObjectURL = revoke
    }
  })

  it('restored on another device, it keeps exactly its PINs and sends its game PIN', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await Promise.all(db.tables.map(t => t.clear()))
    const newId = await bm.restoreMatchFromJson(file)
    expect(await db.matches.get(newId)).toMatchObject(PINS)
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match.game_pin).toBe('900001')
  })

  it('restored over a local copy with other PINs, the file\'s PINs win', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await db.matches.update(matchId, { gamePin: '111111', refereePin: '222222', team1Pin: '333333' })
    const newId = await bm.restoreMatchFromJson(file)
    expect(await db.matches.get(newId)).toMatchObject(PINS)
  })
})

describe('app backup files (native, per event)', () => {
  // The file the native engine writes for this match (nativeBackup/engine_beach)
  async function nativeFileOf(matchId) {
    const text = serializeBackup(await bm.exportMatchData(matchId)).build('2026-10-08T12:00:00.000Z')
    return { text, data: JSON.parse(text) }
  }

  it('have none of the PINs or session ids', async () => {
    const matchId = await seedMatch()
    const { text, data } = await nativeFileOf(matchId)
    expect(data.secretsRemoved).toBe(true)
    expect(data.match).toMatchObject({ gameN: 12, seed_key: SEED, status: 'live' })
    for (const pin of ALL_PINS) expect(text).not.toContain(pin)
    expect(text).not.toContain('sess-1')
    expect(data.match.connection_pins).toBeUndefined()
  })

  it('restored, keep the PINs of the local copy they replace, and send that game PIN', async () => {
    const matchId = await seedMatch()
    const { data: file } = await nativeFileOf(matchId)
    const newId = await bm.restoreMatchFromJson(file)
    const restored = await db.matches.get(newId)
    expect(restored).toMatchObject({
      gamePin: '900001', refereePin: '900002', team1Pin: '900003', team2Pin: '900004',
      team1UploadPin: '900005', team2UploadPin: '900006'
    })
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match.game_pin).toBe('900001')
  })

  it('restored for a match not on this device, get new, distinct PINs', async () => {
    const matchId = await seedMatch()
    const { data: file } = await nativeFileOf(matchId)
    await Promise.all(db.tables.map(t => t.clear()))
    const newId = await bm.restoreMatchFromJson(file)
    const restored = await db.matches.get(newId)
    const pins = ['gamePin', 'refereePin', 'team1Pin', 'team2Pin', 'team1UploadPin', 'team2UploadPin'].map(f => restored[f])
    for (const pin of pins) expect(pin).toMatch(/^\d{6}$/)
    expect(new Set(pins).size).toBe(pins.length)
  })

  it('a test match gets no game PIN', () => {
    const pins = bm.pinsForRestore({ secretsRemoved: true, match: { test: true } }, null)
    expect(pins.gamePin).toBeUndefined()
    expect(pins.refereePin).toMatch(/^\d{6}$/)
  })

  it('other backups (browser files, cloud, older files) are restored with exactly their own PINs', async () => {
    expect(bm.pinsForRestore({ match: { gameN: 1 } }, { gamePin: '123456' })).toEqual({})
  })

  it('in place: the current PINs stay and the game PIN is sent', async () => {
    const matchId = await seedMatch()
    const { data: file } = await nativeFileOf(matchId)
    await bm.restoreMatchInPlace(matchId, file)
    expect(await db.matches.get(matchId)).toMatchObject(PINS)
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match.game_pin).toBe('900001')
  })
})

// A restore replaces the match's events: nothing is undone, so the event
// history (db_beach/eventHistory_beach) records nothing and no void reaches
// the server (it would void the very events the restore sends).
describe('a restore and the event history', () => {
  const settle = async () => {
    await new Promise(r => setTimeout(r, 20))
    const { eventHistorySettled } = await import('../../db_beach/eventHistory_beach')
    await eventHistorySettled()
  }

  it('in place: no history row, no void job', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(serializeBackup(await bm.exportMatchData(matchId)).build('2026-10-08T12:00:00.000Z'))
    await bm.restoreMatchInPlace(matchId, file)
    await settle()
    expect(await db.event_history.count()).toBe(0)
    expect((await db.sync_queue.toArray()).filter(j => j.action === 'void')).toHaveLength(0)
    expect(await db.events.where('matchId').equals(matchId).count()).toBe(1)
  })

  it('from a file over the local copy: no history row, no void job', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await bm.restoreMatchFromJson(file)
    await settle()
    expect(await db.event_history.count()).toBe(0)
    expect((await db.sync_queue.toArray()).filter(j => j.action === 'void')).toHaveLength(0)
  })
})
