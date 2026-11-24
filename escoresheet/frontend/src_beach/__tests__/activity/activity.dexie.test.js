// The beach activity log on the real app database (db_beach on
// fake-indexeddb): entries from the database writes, the writer, retention.
// Ported from OpenVolley src/utils/activity/__tests__/activity.dexie.test.js.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { db } from '../../db_beach/db_beach'
import { withActivityContext, eventHistorySettled } from '../../db_beach/eventHistory_beach'
import { startActivityLog, listActivity, countNotUploaded, SYNC } from '../../utils_beach/activity/index_beach'
import { emitActivity, flushActivityNow } from '../../utils_beach/activity/bus_beach'
import { setActiveMatch } from '../../utils_beach/activity/activeMatch_beach'
import { createActivityWriter } from '../../utils_beach/activity/writer_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

const SEED = 'match_1759740000000_ab12cd'
const settle = async (ms = 30) => {
  await new Promise(r => setTimeout(r, ms))
  await eventHistorySettled()
  await flushActivityNow(500)
}
const kinds = async () => (await db.activity_log.orderBy('lid').toArray()).map(r => r.kind)

describe('beach activity log', () => {
  let log
  let matchId
  let team1Id
  beforeAll(async () => {
    useMemoryLocalStorage()
    await db.open()
    log = startActivityLog({ db })
  })
  afterAll(() => log.stop())
  beforeEach(async () => {
    await settle()
    await Promise.all(db.tables.map(t => t.clear()))
    team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    matchId = await db.matches.add({ status: 'live', seed_key: SEED, team1Id, team2Id, gameN: 7 })
    setActiveMatch(await db.matches.get(matchId))
    await settle()
    await db.activity_log.clear()
  })

  it('records an added point with the score of its snapshot, and its undo', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 3, payload: { team: 'team1' } })
    await db.events.update(id, { stateSnapshot: { pointsA: 1, pointsB: 0 } })
    await settle()
    let rows = await db.activity_log.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'event.add', matchId, matchExt: SEED, setIndex: 1, eventSeq: 3, synced: SYNC.PENDING, app: 'beach', level: 'info' })
    expect(rows[0].data).toEqual({ type: 'point', seq: 3, set: 1, team: 'team1', scoreA: 1, scoreB: 0 })
    expect(rows[0].deviceId).toMatch(/^[0-9a-f-]{36}$/)

    await withActivityContext({ reason: 'undo', actionId: 'a1' }, () => db.events.delete(id))
    await settle()
    rows = await db.activity_log.orderBy('lid').toArray()
    expect(rows.map(r => r.kind)).toEqual(['event.add', 'event.undo'])
    expect(rows[1].data).toMatchObject({ type: 'point', seq: 3, reason: 'undo', actionId: 'a1' })
    expect(rows[1].eventExt).toBe(`${SEED}:e:${id}`)
  })

  it('a scorer action (event + its snapshot in one transaction) is told at once; a rolled-back one never', async () => {
    await db.transaction('rw', db.tables, async () => {
      const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 5, payload: { team: 'team2' } })
      await db.events.add({ matchId, setIndex: 1, type: 'court_switch', seq: 6, payload: {} })
      await db.events.update(id, { stateSnapshot: { pointsA: 2, pointsB: 5 } })
    })
    await db.transaction('rw', db.tables, async () => {
      const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 7, payload: { team: 'team1' } })
      await db.events.update(id, { stateSnapshot: { pointsA: 9, pointsB: 9 } })
      throw new Error('forced')
    }).catch(() => {})
    await settle()
    const rows = await db.activity_log.orderBy('lid').toArray()
    expect(rows.find(r => r.eventSeq === 5)?.data).toEqual({ type: 'point', seq: 5, set: 1, team: 'team2', scoreA: 2, scoreB: 5 })
    expect(rows.some(r => r.eventSeq === 7)).toBe(false)
  })

  it('sets (team 1 / team 2 as home / away), the match row and the roster of the open match', async () => {
    const setId = await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false })
    await db.sets.update(setId, { team1Points: 21, team2Points: 17, finished: true })
    await db.matches.update(matchId, { status: 'ended', updatedAt: Date.now() })
    await db.matches.update(matchId, { scorerSignature: 'data:image/png;base64,AAAA' })
    await db.matches.update(matchId, { manualChanges: [{ category: 'player', field: 'dob', before: '1.1.2000', after: '2.1.2000' }] })
    await db.players.add({ teamId: team1Id, number: 1, firstName: 'Anna', dob: '01.01.2000' })
    await db.players.add({ teamId: 999, number: 2, firstName: 'Other team' })
    await settle()
    expect(await kinds()).toEqual(['set.start', 'set.end', 'match.status', 'match.signature', 'match.manual_change', 'match.roster'])
    const rows = await db.activity_log.orderBy('lid').toArray()
    expect(rows[1].data).toEqual({ set: 1, home: 21, away: 17 })
    expect(rows[3].data).toEqual({ role: 'scorer', signed: true })
    expect(rows[5].data).toEqual({ team: 'team1', number: 1, op: 'add' })
    expect(JSON.stringify(rows)).not.toMatch(/data:image|2000/)
  })

  it('a correction is logged as such (reason correction)', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'timeout', seq: 9, payload: { team: 'team1' } })
    await settle()
    await withActivityContext({ reason: 'correction', actionId: 'c1' }, () => db.events.delete(id))
    await settle()
    const row = (await db.activity_log.orderBy('lid').toArray()).at(-1)
    expect(row).toMatchObject({ kind: 'event.delete', data: { type: 'timeout', reason: 'correction', actionId: 'c1' } })
  })

  it('a test match stays local only; a big batch is one bulk entry', async () => {
    const testMatch = await db.matches.add({ status: 'live', seed_key: 'match_2_x', test: true })
    await db.transaction('rw', db.events, async () => {
      for (let i = 1; i <= 25; i++) await db.events.add({ matchId: testMatch, setIndex: 1, type: i % 2 ? 'point' : 'rally_start', seq: i, payload: {} })
    })
    await settle()
    const rows = (await db.activity_log.toArray()).filter(r => r.matchId === testMatch)
    expect(rows.map(r => r.kind)).toEqual(['match.create', 'event.bulk_add'])
    expect(rows.every(r => r.synced === SYNC.LOCAL)).toBe(true)
    expect(await countNotUploaded(db, { matchId: testMatch })).toBe(0)
  })

  it('code without the database reports through the bus; errors are rate limited', async () => {
    emitActivity('sync.error', { resource: 'event', action: 'void', status: 409, code: 'OV_MATCH_CLOSED', payload: { game_pin: '1' } }, { level: 'warn' })
    for (let i = 0; i < 8; i++) emitActivity('app.error', { message: 'boom', frames: ['a.js:1'] }, { level: 'error' })
    emitActivity('not.a_kind', {})
    await settle()
    const rows = await db.activity_log.orderBy('lid').toArray()
    expect(rows[0]).toMatchObject({ kind: 'sync.error', level: 'warn', data: { resource: 'event', action: 'void', status: 409, code: 'OV_MATCH_CLOSED' } })
    expect(rows.filter(r => r.kind === 'app.error')).toHaveLength(5)
    expect(rows.some(r => r.kind === 'not.a_kind')).toBe(false)
    expect((await listActivity(db, { matchId: null })).length).toBe(rows.length)
  })
})

describe('activity writer retention', () => {
  it('keeps unsent rows, removes old sent ones', async () => {
    await db.open()
    await db.activity_log.clear()
    const now = Date.parse('2027-06-01T00:00:00Z')
    const old = new Date(now - 200 * 24 * 3600_000).toISOString()
    const recent = new Date(now - 1000).toISOString()
    const row = (uid, ts, synced) => ({ uid, ts, kind: 'app.start', level: 'info', matchId: null, data: {}, synced })
    await db.activity_log.bulkAdd([row('o1', old, SYNC.UPLOADED), row('o2', old, SYNC.PENDING), row('o3', old, SYNC.LOCAL), row('r1', recent, SYNC.UPLOADED)])
    const writer = createActivityWriter({ db, now: () => now })
    expect(await writer.prune()).toBe(2)
    expect((await db.activity_log.toArray()).map(r => r.uid).sort()).toEqual(['o2', 'r1'])
  })
})
