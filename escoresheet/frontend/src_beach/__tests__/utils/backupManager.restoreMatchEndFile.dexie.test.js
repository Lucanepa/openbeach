import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The ZIP that Approve downloads is the one file a scorer keeps of an
// approved match (Close match removes it from the device). Its
// MatchData_*.json had no `version` and the teams inside the match, and
// Restore match refused it as "Invalid backup file format". Ported from
// OpenVolley aed8e978 (backupManager.restore tests) with team1 / team2.
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

const SEED = 'match_1792932000000_end1'

// The match row, its teams and players, sets and events as Match End reads them
const ended = () => ({
  match: { id: 9, seed_key: SEED, status: 'ended', approved: true, gameN: 7, team1Id: 3, team2Id: 4, refereePin: '111111', scorerSignature: 'data:s' },
  team1: { id: 3, name: 'Müller / Weber', color: '#c00' },
  team2: { id: 4, name: 'Rossi / Bianchi', color: '#00c' },
  team1Players: [{ id: 1, teamId: 3, number: 1, lastName: 'Müller' }],
  team2Players: [{ id: 2, teamId: 4, number: 2, lastName: 'Bianchi' }],
  sets: [{ id: 2, matchId: 9, index: 1, team1Points: 21, team2Points: 7, finished: true }, { id: 3, matchId: 9, index: 2, team1Points: 21, team2Points: 19, finished: true }],
  events: [{ id: 2, matchId: 9, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } }, { id: 3, matchId: 9, setIndex: 2, type: 'point', seq: 2, payload: { team: 'team1' } }]
})
// As MatchEnd_beach wrote it before this fix
const olderFile = () => {
  const { match, team1, team2, ...rest } = ended()
  return JSON.parse(JSON.stringify({ match: { ...match, team1, team2 }, ...rest, exportedAt: '2026-10-28T20:15:00.000Z' }))
}

async function restoredRows(id) {
  const match = await db.matches.get(id)
  return {
    match,
    teams: (await db.teams.bulkGet([match.team1Id, match.team2Id])).map(t => t?.name),
    players: (await db.players.toArray()).map(p => [p.lastName, p.teamId]),
    sets: (await db.sets.where('matchId').equals(id).sortBy('index')).map(x => `${x.index}:${x.team1Points}-${x.team2Points}`),
    events: (await db.events.where('matchId').equals(id).sortBy('seq')).map(e => e.seq)
  }
}

describe('a Match End file (the MatchData JSON of the approval ZIP)', () => {
  it('an older file is read in the backup file shape, the teams out of the match row', () => {
    const b = bm.matchBackupFromMatchEndExport(olderFile())
    expect(b).toMatchObject({ version: 1, lastUpdated: '2026-10-28T20:15:00.000Z', match: { id: 9, seed_key: SEED, status: 'ended' }, team1: { name: 'Müller / Weber' }, team2: { name: 'Rossi / Bianchi' } })
    expect('team1' in b.match || 'team2' in b.match).toBe(false)
    expect(b.team1Players.map(p => p.lastName)).toEqual(['Müller'])
    expect(b.sets).toHaveLength(2)
    expect(b.events).toHaveLength(2)
    // the scoresheet JSON the approval stores in the cloud: the teams beside the match
    const sheet = { ...ended(), team1Team: ended().team1, uploadedAt: '2026-10-28T20:16:00.000Z' }
    expect(bm.matchBackupFromMatchEndExport(sheet)).toMatchObject({ version: 1, lastUpdated: '2026-10-28T20:16:00.000Z', team1: { name: 'Müller / Weber' }, team2: { name: 'Rossi / Bianchi' } })
    // a backup file, a whole-database export or anything else is not one
    expect(bm.matchBackupFromMatchEndExport({ ...ended(), version: 1 })).toBeNull()
    expect(bm.matchBackupFromMatchEndExport({ matchId: 9, matches: [{ id: 9 }] })).toBeNull()
    expect(bm.matchBackupFromMatchEndExport({ match: { id: 1 } })).toBeNull()
    expect(bm.matchBackupFromMatchEndExport({ match: 'x', sets: [] })).toBeNull()
    expect(bm.matchBackupFromMatchEndExport(null)).toBeNull()
    // matchBackupFromFile: every picked file the restore takes, a backup as it is
    const file = { ...ended(), version: 1 }
    expect(bm.matchBackupFromFile(file)).toBe(file)
    expect(bm.matchBackupFromFile(olderFile())).toMatchObject({ version: 1, team1: { name: 'Müller / Weber' } })
    expect(bm.matchBackupFromFile({ exportDate: 'x', matchId: 9, matches: [ended().match], teams: [ended().team1] })).toMatchObject({ version: 1, team1: { name: 'Müller / Weber' } })
  })

  it('an older file restores: the match, its teams, players, sets and events', async () => {
    const id = await bm.restoreMatchFromJson(olderFile())
    const r = await restoredRows(id)
    expect(r.match).toMatchObject({ seed_key: SEED, status: 'ended', approved: true, gameN: 7, scorerSignature: 'data:s' })
    expect('team1' in r.match || 'team2' in r.match).toBe(false) // the team rows hold them
    expect(r.teams).toEqual(['Müller / Weber', 'Rossi / Bianchi'])
    expect(r.players).toEqual([['Müller', r.match.team1Id], ['Bianchi', r.match.team2Id]])
    expect(r.sets).toEqual(['1:21-7', '2:21-19'])
    expect(r.events).toEqual([1, 2])
    const job = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(job.payload.match).toMatchObject({ external_id: SEED, team1_data: { name: 'Müller / Weber' }, team2_data: { name: 'Rossi / Bianchi' } })
    expect(job.payload.sets).toHaveLength(2)
  })

  it('the file Match End writes now is a backup file: written, read back, it restores as it is', async () => {
    const data = bm.matchEndExportData(ended(), new Date('2026-10-30T19:00:00.000Z'))
    expect(data).toMatchObject({ version: 1, lastUpdated: '2026-10-30T19:00:00.000Z', exportedAt: '2026-10-30T19:00:00.000Z', team1: { name: 'Müller / Weber' } })
    const file = JSON.parse(JSON.stringify(data, null, 2)) // the ZIP's text
    expect(bm.matchBackupFromFile(file)).toBe(file) // nothing to convert
    const id = await bm.restoreMatchFromJson(file)
    const r = await restoredRows(id)
    expect(r.match).toMatchObject({ seed_key: SEED, status: 'ended', gameN: 7, scorerSignature: 'data:s' })
    expect(r.teams).toEqual(['Müller / Weber', 'Rossi / Bianchi'])
    expect(r.sets).toEqual(['1:21-7', '2:21-19'])
    expect(r.events).toEqual([1, 2])
  })

  it('the restore preview shows the older file\'s teams and sets', async () => {
    const { restorePreviewSummary } = await import('../../components_beach/RestorePreviewModal_beach')
    const s = restorePreviewSummary(bm.matchBackupFromFile(olderFile()))
    expect(s).toMatchObject({ team1Name: 'Müller / Weber', team2Name: 'Rossi / Bianchi' })
    expect(s.sets.map(x => `${x.index}:${x.team1}-${x.team2}`)).toEqual(['1:21-7', '2:21-19'])
  })

  it('restoreMatchInPlace reads an older file too', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, seed_key: SEED })
    await bm.restoreMatchInPlace(matchId, olderFile())
    const m = await db.matches.get(matchId)
    expect(m).toMatchObject({ seed_key: SEED, status: 'ended', gameN: 7 })
    expect('team1' in m || 'team2' in m).toBe(false)
    expect(await db.sets.where('matchId').equals(matchId).count()).toBe(2)
  })
})
