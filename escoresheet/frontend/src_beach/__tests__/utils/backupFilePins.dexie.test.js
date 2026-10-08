import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// Backup files (folder backup, periodic / manual download) sit in a folder or
// the Downloads of the scorer's device: the match row's PINs stay out of them.
// A restore of such a file keeps the PINs of the local copy it replaces, or
// makes new ones. Ported from OpenVolley 8e472769 (backupManager.restore
// tests) with openbeach's PIN names.

// The setup file replaces window.indexedDB with a stub; the real db_beach
// instance captures Dexie.dependencies when it is constructed, so they are
// swapped for fake-indexeddb before the module is imported.
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

describe('backup files', () => {
  it('a folder backup file has the match but none of its PINs or session ids', async () => {
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
    expect(data.secretsRemoved).toBe(true)
    expect(data.match).toMatchObject({ gameN: 12, seed_key: SEED, status: 'live' })
    expect(data.sets[0].team1Points).toBe(14)
    expect(data.events).toHaveLength(1)
    expect(data.team1Players).toHaveLength(1)
    for (const pin of ALL_PINS) expect(written).not.toContain(pin)
    expect(written).not.toContain('sess-1')
    expect(data.match.connection_pins).toBeUndefined()
  })

  it('a downloaded backup file has none of the PINs either', async () => {
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
      const text = await blob.text()
      expect(JSON.parse(text).secretsRemoved).toBe(true)
      for (const pin of ALL_PINS) expect(text).not.toContain(pin)
    } finally {
      click.mockRestore()
      URL.createObjectURL = create
      URL.revokeObjectURL = revoke
    }
  })

  it('the cloud backup data (exportMatchData) is unchanged', async () => {
    const matchId = await seedMatch()
    const data = await bm.exportMatchData(matchId)
    expect(data.match).toMatchObject(PINS)
    expect(data.secretsRemoved).toBeUndefined()
  })
})

describe('restoring a backup file without PINs', () => {
  async function fileOf(matchId) {
    return JSON.parse(JSON.stringify(await bm.exportMatchBackupFile(matchId)))
  }

  it('keeps the PINs of the local copy it replaces, and sends that game PIN', async () => {
    const matchId = await seedMatch()
    const file = await fileOf(matchId)
    const newId = await bm.restoreMatchFromJson(file)
    const restored = await db.matches.get(newId)
    expect(restored).toMatchObject({
      gamePin: '900001', refereePin: '900002', team1Pin: '900003', team2Pin: '900004',
      team1UploadPin: '900005', team2UploadPin: '900006'
    })
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match.game_pin).toBe('900001')
  })

  it('gets new, distinct PINs for a match not on this device', async () => {
    const matchId = await seedMatch()
    const file = await fileOf(matchId)
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

  it('other backups (cloud, older files) are restored with exactly their own PINs', async () => {
    expect(bm.pinsForRestore({ match: { gameN: 1 } }, { gamePin: '123456' })).toEqual({})
  })

  it('in place: the current PINs stay and the game PIN is sent', async () => {
    const matchId = await seedMatch()
    const file = await fileOf(matchId)
    await bm.restoreMatchInPlace(matchId, file)
    expect(await db.matches.get(matchId)).toMatchObject(PINS)
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match.game_pin).toBe('900001')
  })
})
