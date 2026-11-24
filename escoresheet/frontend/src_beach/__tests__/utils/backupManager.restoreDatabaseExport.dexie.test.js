import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The set-end download (Options > "Auto-download data at set end", a
// browser's only automatic backup offline) and the scoring screen's other
// exports write every table of the device as { exportDate, matchId,
// matches, teams, players, sets, events, ... }. Restore match refused it
// ("Invalid backup file format"): it read only exportMatchData's
// { version, match, ... }. The match of the export's matchId is restored now,
// with its teams, players, sets and events (OpenVolley fef164ab).
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

const SEED = 'match_1792932000000_dump1'
const OTHER = 'match_1792931000000_dump0'

// As the scoreboard writes it at the end of set 1 of match 9
const dump = () => ({
  exportDate: '2026-10-25T18:40:00.000Z',
  exportReason: 'set_1_end',
  matchId: 9,
  matches: [
    { id: 4, seed_key: OTHER, status: 'ended', team1Id: 1, team2Id: 2 },
    { id: 9, seed_key: SEED, status: 'live', gameN: 7, team1Id: 3, team2Id: 4, gamePin: '900007' }
  ],
  teams: [{ id: 1, name: 'Old 1' }, { id: 2, name: 'Old 2' }, { id: 3, name: 'Müller / Weber' }, { id: 4, name: 'Rossi / Bianchi' }],
  players: [
    { id: 1, teamId: 1, number: 1, lastName: 'Old' },
    { id: 2, teamId: 3, number: 1, lastName: 'Müller' },
    { id: 3, teamId: 3, number: 2, lastName: 'Weber' },
    { id: 4, teamId: 4, number: 1, lastName: 'Rossi' }
  ],
  sets: [
    { id: 1, matchId: 4, index: 1, team1Points: 21, team2Points: 3, finished: true },
    { id: 2, matchId: 9, index: 1, team1Points: 21, team2Points: 17, finished: true },
    { id: 3, matchId: 9, index: 2, team1Points: 0, team2Points: 0, finished: false }
  ],
  events: [
    { id: 1, matchId: 4, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } },
    { id: 2, matchId: 9, setIndex: 1, type: 'coin_toss', seq: 1, payload: {} },
    { id: 3, matchId: 9, setIndex: 1, type: 'point', seq: 2, payload: { team: 'team1' } }
  ],
  referees: [],
  scorers: []
})

describe('a whole-database export (the set-end download)', () => {
  it('holds the match it was written for, in the backup file shape', () => {
    const b = bm.matchBackupFromDatabaseExport(dump())
    expect(b).toMatchObject({ version: 1, lastUpdated: '2026-10-25T18:40:00.000Z', match: { id: 9, seed_key: SEED }, team1: { name: 'Müller / Weber' }, team2: { name: 'Rossi / Bianchi' } })
    expect(b.team1Players.map(p => p.lastName)).toEqual(['Müller', 'Weber'])
    expect(b.team2Players.map(p => p.lastName)).toEqual(['Rossi'])
    expect(b.sets.map(x => x.id)).toEqual([2, 3])
    expect(b.events.map(x => x.id)).toEqual([2, 3])
    // a backup file, or an export without its match, is not one
    expect(bm.matchBackupFromDatabaseExport({ version: 1, match: { id: 9 } })).toBeNull()
    expect(bm.matchBackupFromDatabaseExport({ ...dump(), matchId: 99 })).toBeNull()
    expect(bm.matchBackupFromDatabaseExport(null)).toBeNull()
  })

  // App's Restore match > Select backup file previews the converted file
  it('the restore preview shows that match: its teams and its sets', async () => {
    const { restorePreviewSummary } = await import('../../components_beach/RestorePreviewModal_beach')
    const s = restorePreviewSummary(bm.matchBackupFromDatabaseExport(dump()))
    expect(s).toMatchObject({ team1Name: 'Müller / Weber', team2Name: 'Rossi / Bianchi', currentSetIndex: 2 })
    expect(s.sets.map(x => `${x.index}:${x.team1}-${x.team2}`)).toEqual(['1:21-17', '2:0-0'])
  })

  it('is restored: that match only, with its teams, players, sets and events', async () => {
    const id = await bm.restoreMatchFromJson(JSON.parse(JSON.stringify(dump())))
    const match = await db.matches.get(id)
    expect(match).toMatchObject({ seed_key: SEED, status: 'live', gameN: 7 })
    expect((await db.sets.where('matchId').equals(id).sortBy('index')).map(x => `${x.index}:${x.team1Points}-${x.team2Points}`)).toEqual(['1:21-17', '2:0-0'])
    expect(await db.events.where('matchId').equals(id).count()).toBe(2)
    expect((await db.teams.get(match.team1Id)).name).toBe('Müller / Weber')
    expect((await db.players.where('teamId').equals(match.team1Id).toArray()).map(p => p.lastName)).toEqual(['Müller', 'Weber'])
    // the export's other match is not restored onto this device
    expect(await db.matches.count()).toBe(1)
    expect(await db.matches.filter(m => m.seed_key === OTHER).count()).toBe(0)
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match).toMatchObject({ external_id: SEED, team1_data: { name: 'Müller / Weber' } })
  })

  it('restoreMatchInPlace reads it too', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, seed_key: SEED })
    await db.sets.add({ matchId, index: 1, team1Points: 2, team2Points: 1 })
    await bm.restoreMatchInPlace(matchId, JSON.parse(JSON.stringify(dump())))
    expect((await db.sets.where('matchId').equals(matchId).sortBy('index')).map(x => `${x.index}:${x.team1Points}-${x.team2Points}`)).toEqual(['1:21-17', '2:0-0'])
  })

  it('a file that is not a backup is still refused', async () => {
    await expect(bm.restoreMatchFromJson({ hello: 'world' })).rejects.toThrow('Invalid backup file format')
    await expect(bm.restoreMatchFromJson({ ...dump(), matchId: 99 })).rejects.toThrow('Invalid backup file format')
  })
})
