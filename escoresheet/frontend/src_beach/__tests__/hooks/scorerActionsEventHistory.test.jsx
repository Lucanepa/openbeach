// A scorer action (useScorerActions_beach.runAction) and the event history
// (db_beach/eventHistory_beach) against the real app database (db_beach on
// fake-indexeddb, the db.events hooks installed): the void rows and void jobs
// of the events an action takes back are written INSIDE its transaction, so
// they commit with it or not at all, and carry the action's reason.
// Ported from OpenVolley src/hooks/__tests__/scorerActionsEventHistory.test.jsx
// with a beach rally: the point that reaches a change of courts (court_switch
// N.1), no rotation or libero.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { useRef } from 'react'
import { renderHook } from '@testing-library/react'
import Dexie from 'dexie'
import { db } from '../../db_beach/db_beach'
import {
  withActivityContext, currentActivityContext, eventHistorySettled, rememberSeedKey, maxVoidedSeq,
  EVENT_HISTORY_SCOPE
} from '../../db_beach/eventHistory_beach'
import { planPointRemoval, syncJobsForEvents, UNSENT_STATUSES } from '../../utils_beach/scorerCorrections_beach'
import { eventExtId } from '../../utils_beach/syncIds_beach'
import { useScorerActions } from '../../hooks_beach/useScorerActions_beach'

const SEED = 'match_1759740000000_tx01ab'

const settle = async () => {
  await new Promise(r => setTimeout(r, 20))
  await eventHistorySettled()
}

function useActions() {
  const mutexRef = useRef(false)
  const commits = useRef({ nextGen: () => 1, afterCommit: (_gen, fn) => fn() }).current
  return useScorerActions({ db, commits, mutexRef, captureFinalSnapshot: async () => null, onError: () => {} })
}

function mountActions() {
  const { result } = renderHook(() => useActions())
  return result.current
}

// Scoreboard_beach discardEvents: delete under the action's reason (else the
// given one), then drop the removed events' unsent INSERT jobs
async function discardEvents(rows, reason = 'delete') {
  await withActivityContext({ reason: currentActivityContext()?.reason || reason }, () => db.events.bulkDelete(rows.map(e => e.id)))
  const unsent = await db.sync_queue.where('status').anyOf(...UNSENT_STATUSES).toArray()
  const jobs = syncJobsForEvents(unsent, rows.map(e => e.id))
  if (jobs.length > 0) await db.sync_queue.bulkDelete(jobs.map(j => j.id))
}

// Set 1 at 6:0; team2's point 4 made it 6:1 = 7 points: the change of courts (4.1)
async function seedRally(matchId) {
  const ids = {}
  const add = async (key, row) => {
    ids[key] = await db.events.add({ matchId, setIndex: 1, payload: {}, ...row })
    // the scoreboard's raw first rally of a set has no insert job (logEvent's rallies do)
    if (row.type !== 'rally_start') {
      await db.sync_queue.add({ resource: 'event', action: 'insert', status: 'queued', ts: 1, payload: { external_id: eventExtId(SEED, ids[key]), match_id: SEED } })
    }
  }
  await add('p1', { type: 'point', seq: 1, payload: { team: 'team1' } })
  await add('p2', { type: 'point', seq: 2, payload: { team: 'team1' } })
  await add('rally', { type: 'rally_start', seq: 3 })
  await add('p4', { type: 'point', seq: 4, payload: { team: 'team2' } })
  await add('switch', { type: 'court_switch', seq: 4.1, payload: { set: 1 } })
  return ids
}

async function undoNewestPoint(matchId, { failAfterDelete = false } = {}) {
  const all = await db.events.where('matchId').equals(matchId).toArray()
  const plan = planPointRemoval(all, null, { setIndex: 1, includeRallyStart: true })
  const ids = new Set(plan.deleteEventIds)
  await discardEvents(all.filter(e => ids.has(e.id)))
  if (failAfterDelete) throw new Error('forced failure after the delete')
  return plan
}

const historyRows = () => db.event_history.orderBy('id').toArray()
const jobsOf = async (action) => (await db.sync_queue.toArray()).filter(j => j.resource === 'event' && j.action === action)

describe('runAction and the event history (beach)', () => {
  let matchId
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
    matchId = await db.matches.add({ status: 'live', seed_key: SEED, test: false })
    rememberSeedKey(matchId, SEED, false)
  })

  it('the action transaction covers the event history tables (db.tables)', () => {
    const names = db.tables.map(t => t.name)
    for (const name of EVENT_HISTORY_SCOPE) expect(names).toContain(name)
  })

  it('an undo inside runAction: void rows and void jobs written in its transaction, with its reason', async () => {
    const ids = await seedRally(matchId)
    const { runAction } = mountActions()

    let insideHistory = -1
    await runAction('undo', async () => {
      await undoNewestPoint(matchId)
      insideHistory = await db.event_history.count()
    }, { reason: 'undo' })

    const removed = [ids.p4, ids.switch, ids.rally]
    expect(insideHistory).toBe(removed.length)
    const hist = await historyRows()
    expect(hist.map(h => h.eventId).sort((a, b) => a - b)).toEqual([...removed].sort((a, b) => a - b))
    expect(hist.every(h => h.op === 'void' && h.reason === 'undo')).toBe(true)
    expect(new Set(hist.map(h => h.actionId)).size).toBe(1)
    expect(hist[0].actionId).toBeTruthy()

    // void jobs for every removed event: the rally_start too (beach sends rally
    // starts; one that never reached the server is kept there as a revision)
    const voids = await jobsOf('void')
    expect(voids.map(j => j.payload.external_id).sort()).toEqual([ids.p4, ids.switch, ids.rally].map(id => eventExtId(SEED, id)).sort())
    expect(voids.every(j => j.payload.reason === 'undo')).toBe(true)
    // the removed events' unsent inserts are gone, the others stay; no delete job any more
    const inserts = await jobsOf('insert')
    expect(inserts.map(j => j.payload.external_id).sort()).toEqual([ids.p1, ids.p2].map(id => eventExtId(SEED, id)).sort())
    expect(await jobsOf('delete')).toHaveLength(0)

    await settle()
    expect(await db.event_history.count()).toBe(removed.length)
    // the undone seq is never given out again (getNextSeq high-water)
    expect(await maxVoidedSeq(db, matchId)).toBe(4.1)
  })

  it('a failed undo leaves the events, the queue and the history as they were', async () => {
    const ids = await seedRally(matchId)
    const eventsBefore = await db.events.orderBy('id').toArray()
    const queueBefore = await db.sync_queue.orderBy('id').toArray()
    const { runAction } = mountActions()

    await expect(runAction('undo', () => undoNewestPoint(matchId, { failAfterDelete: true }), { reason: 'undo' }))
      .rejects.toThrow('forced failure')
    await settle()

    expect(await db.events.orderBy('id').toArray()).toEqual(eventsBefore)
    expect(await db.sync_queue.orderBy('id').toArray()).toEqual(queueBefore)
    expect(await db.event_history.count()).toBe(0)
    expect(await db.events.get(ids.p4)).toBeTruthy()
    expect(currentActivityContext()).toBeNull()
  })

  it('a replay joined to a decision change keeps the decision change\'s reason and action id', async () => {
    const ids = await seedRally(matchId)
    const { runAction } = mountActions()

    await runAction('decision', async () => {
      await runAction('decision', async () => {
        const all = await db.events.where('matchId').equals(matchId).toArray()
        const plan = planPointRemoval(all, all.find(e => e.id === ids.p4))
        const del = new Set(plan.deleteEventIds)
        await discardEvents(all.filter(e => del.has(e.id)))
      }, { reason: 'decision_change' })
    }, { reason: 'decision_change' })

    const hist = await historyRows()
    expect(hist).toHaveLength(2)
    expect(hist.every(h => h.reason === 'decision_change')).toBe(true)
    expect(new Set(hist.map(h => h.actionId)).size).toBe(1)
    expect((await jobsOf('insert')).some(j => j.payload.external_id === eventExtId(SEED, ids.p4))).toBe(false)
    expect((await jobsOf('void')).some(j => j.payload.external_id === eventExtId(SEED, ids.p4))).toBe(true)
  })

  it('outside an action (cancelling a change of courts) the given reason is used', async () => {
    const ids = await seedRally(matchId)
    await discardEvents([{ id: ids.p4 }, { id: ids.switch }], 'undo')
    await settle()
    const hist = await historyRows()
    expect(hist.map(h => h.reason)).toEqual(['undo', 'undo'])
    expect(await jobsOf('void')).toHaveLength(2)
  })

  it('without a reason a delete in an action is a plain delete', async () => {
    const ids = await seedRally(matchId)
    const { runAction } = mountActions()
    await runAction('x', () => discardEvents([{ id: ids.p1 }]))
    const [row] = await historyRows()
    expect(row).toMatchObject({ eventId: ids.p1, op: 'void', reason: 'delete' })
    expect(Dexie.currentTransaction).toBeFalsy()
  })
})
