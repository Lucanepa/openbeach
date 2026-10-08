// Event history hooks against the real app database (db_beach, Dexie 4 on
// fake-indexeddb). Ported from OpenVolley src/db/__tests__/eventHistory.dexie.test.js
// with beach events (team1 / team2, court switches, the beach local-only types).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db_beach/db_beach'
import {
  maxVoidedSeq as maxVoidedSeqOf, wipeMatchEvents as wipeMatchEventsOf,
  withActivityContext, eventHistorySettled, EVENT_HISTORY_SCOPE, onEventHistory, rememberSeedKey
} from '../../db_beach/eventHistory_beach'

const maxVoidedSeq = (matchId, opts) => maxVoidedSeqOf(db, matchId, opts)
const wipeMatchEvents = (matchId, opts) => wipeMatchEventsOf(db, matchId, opts)

const SEED = 'match_1759740000000_ab12cd'
const settle = async () => {
  await new Promise(r => setTimeout(r, 20))
  await eventHistorySettled()
}

const revisionJobs = async () => (await db.sync_queue.toArray()).filter(j => j.resource === 'event' && j.action !== 'insert')

describe('db_beach v20', () => {
  it('has the event history and activity log tables', () => {
    expect(db.verno).toBeGreaterThanOrEqual(20)
    expect(db.event_history.schema.idxByName['[matchId+seq]']).toBeTruthy()
    expect(db.activity_log.schema.primKey.name).toBe('lid')
    expect(db.interaction_logs.schema.idxByName.matchId).toBeTruthy()
  })
})

describe('event history hooks (beach)', () => {
  let matchId
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
    matchId = await db.matches.add({ status: 'live', seed_key: SEED, test: false })
  })

  it('an undone point leaves a void history row and a void sync job', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 3, payload: { team: 'team1' }, stateSnapshot: { pointsA: 1, pointsB: 0 } })
    await db.events.delete(id)
    await settle()

    const hist = await db.event_history.toArray()
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ matchId, eventId: id, op: 'void', reason: 'delete', seq: 3, type: 'point', eventExt: `${SEED}:e:${id}` })
    expect(hist[0].before).toMatchObject({ type: 'point', payload: { team: 'team1' } })
    expect(hist[0].before.stateSnapshot).toBeUndefined()
    expect(hist[0].revUid).toMatch(/^[0-9a-f-]{36}$/)
    // the event row is gone locally, its history stays
    expect(await db.events.count()).toBe(0)

    const jobs = await revisionJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ resource: 'event', action: 'void', status: 'queued' })
    expect(jobs[0].payload).toMatchObject({ external_id: `${SEED}:e:${id}`, match_id: SEED, rev_uid: hist[0].revUid, reason: 'delete', seq: 3, type: 'point', op: 'void' })
  })

  it('takes the reason and action id of the surrounding context (an undone court switch)', async () => {
    const a = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 7, payload: { team: 'team2' } })
    const b = await db.events.add({ matchId, setIndex: 1, type: 'court_switch', seq: 7.1, payload: {} })
    await withActivityContext({ reason: 'undo', actionId: 'act-1' }, () => db.events.bulkDelete([a, b]))
    await settle()
    const hist = await db.event_history.toArray()
    expect(hist.map(h => h.reason)).toEqual(['undo', 'undo'])
    expect(hist.map(h => h.actionId)).toEqual(['act-1', 'act-1'])
    expect(hist.map(h => h.type).sort()).toEqual(['court_switch', 'point'])
    expect((await revisionJobs()).map(j => j.payload.reason)).toEqual(['undo', 'undo'])
  })

  it('ignores the snapshot fill of a new event, records a payload edit', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'timeout', seq: 5, payload: { team: 'team1' } })
    await db.events.update(id, { stateSnapshot: { pointsA: 3, pointsB: 2 } })
    await db.events.update(id, { _synced: true })
    await settle()
    expect(await db.event_history.count()).toBe(0)

    await withActivityContext({ reason: 'manual_adjustment' }, () =>
      db.events.update(id, { stateSnapshot: { pointsA: 4, pointsB: 2 }, payload: { team: 'team2' } }))
    await settle()
    const hist = await db.event_history.toArray()
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ op: 'edit', reason: 'manual_adjustment', before: { payload: { team: 'team1' } }, after: { payload: { team: 'team2' } } })
    const [job] = await revisionJobs()
    expect(job.action).toBe('edit')
    expect(job.payload.after).toEqual({ type: 'timeout', set_index: 1, seq: 5, payload: { team: 'team2' }, score_a: 4, score_b: 2 })
  })

  it('a whole-match wipe writes no history; dropHistory removes the old rows', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: {} })
    await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 2, payload: {} })
    await db.events.delete(id)
    await settle()
    expect(await db.event_history.count()).toBe(1)
    await wipeMatchEvents(matchId)
    await settle()
    expect(await db.event_history.count()).toBe(1)
    expect(await db.events.count()).toBe(0)
    expect(await revisionJobs()).toHaveLength(1)
    await wipeMatchEvents(matchId, { dropHistory: true })
    expect(await db.event_history.count()).toBe(0)
  })

  it('Table.clear() (clear all data, backup restore) writes no history', async () => {
    await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: {} })
    await db.events.clear()
    await settle()
    expect(await db.event_history.count()).toBe(0)
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 2, payload: {} })
    await db.events.delete(id)
    await settle()
    expect(await db.event_history.count()).toBe(1)
  })

  it('keeps the history local for test matches and the events beach never sends', async () => {
    const testMatch = await db.matches.add({ status: 'live', seed_key: 'match_1759740000001_zz', test: true })
    const e1 = await db.events.add({ matchId: testMatch, setIndex: 1, type: 'point', seq: 1, payload: {} })
    const e2 = await db.events.add({ matchId, setIndex: 1, type: 'set_start', seq: 2, payload: {} })
    const e3 = await db.events.add({ matchId, setIndex: 1, type: 'technical_to', seq: 3, payload: {} })
    await db.events.bulkDelete([e1, e2, e3])
    await settle()
    expect(await db.event_history.count()).toBe(3)
    expect(await revisionJobs()).toHaveLength(0)
  })

  it('maxVoidedSeq is the high-water seq of undone events (also within one base seq)', async () => {
    expect(await maxVoidedSeq(matchId)).toBe(0)
    const a = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 7, payload: {} })
    const b = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 8, payload: {} })
    const c = await db.events.add({ matchId, setIndex: 1, type: 'court_switch', seq: 8.1, payload: {} })
    await db.events.bulkDelete([a, b, c])
    await settle()
    expect(await maxVoidedSeq(matchId)).toBe(8.1)
    expect(await maxVoidedSeq(matchId, { from: 7, to: 7.99 })).toBe(7)
  })

  it('writes inside an action transaction that includes the history scope', async () => {
    rememberSeedKey(matchId, SEED, false)
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 3, payload: {} })
    let seenInside = -1
    await db.transaction('rw', ['events', ...EVENT_HISTORY_SCOPE], async (tx) => {
      await db.events.delete(id)
      seenInside = await tx.table('event_history').count()
    })
    expect(seenInside).toBe(1)
    expect(await revisionJobs()).toHaveLength(1)
  })

  it('an aborted transaction leaves no history', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 3, payload: {} })
    await expect(db.transaction('rw', db.events, async () => {
      await db.events.delete(id)
      throw new Error('abort')
    })).rejects.toThrow('abort')
    await settle()
    expect(await db.event_history.count()).toBe(0)
    expect(await db.events.count()).toBe(1)
  })

  it('an event put back under its old id after a void is a restore', async () => {
    const id = await db.events.add({ matchId, setIndex: 1, type: 'sanction', seq: 3, payload: { team: 'team1', type: 'delay_warning' } })
    const row = await db.events.get(id)
    await db.events.delete(id)
    await settle()
    await withActivityContext({ reason: 'correction' }, () => db.events.bulkPut([row]))
    // an explicit-id add of an event with no history is nothing
    await db.events.put({ id: 999, matchId, setIndex: 1, type: 'point', seq: 4, payload: {} })
    await settle()
    const hist = await db.event_history.orderBy('id').toArray()
    expect(hist.map(h => h.op)).toEqual(['void', 'restore'])
    expect(hist[1].reason).toBe('correction')
    const jobs = await revisionJobs()
    expect(jobs.map(j => j.action)).toEqual(['void', 'restore'])
    expect(jobs[1].payload.after).toMatchObject({ type: 'sanction', payload: { team: 'team1' } })
  })

  it('a beach decision change: one edit of the point with the corrected score', async () => {
    // team1 is Team A; the point made it 14:12 and is given to team2
    const pointId = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 40, payload: { team: 'team1' }, stateSnapshot: { teamAKey: 'team1', pointsA: 14, pointsB: 12 } })
    await withActivityContext({ reason: 'decision_change', actionId: 'dc-1' }, async () => {
      await db.events.update(pointId, { payload: { team: 'team2', swappedFrom: 'team1' } })
      await db.events.add({ matchId, setIndex: 1, type: 'decision_change', seq: 41, payload: { reason: 'point_swap', pointEventId: pointId, fromTeam: 'team1', toTeam: 'team2' } })
    })
    await settle()
    const hist = await db.event_history.toArray()
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ op: 'edit', eventId: pointId, reason: 'decision_change' })
    expect(hist[0].changed.sort()).toEqual(['payload.swappedFrom', 'payload.team'])
    expect(hist[0].serverAfter).toMatchObject({ score_a: 13, score_b: 13, payload: { team: 'team2' } })
  })

  it('tells listeners about stored rows', async () => {
    const seen = []
    const off = onEventHistory(r => seen.push(r.op))
    const id = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 3, payload: {} })
    await db.events.delete(id)
    await settle()
    off()
    expect(seen).toEqual(['void'])
  })
})
