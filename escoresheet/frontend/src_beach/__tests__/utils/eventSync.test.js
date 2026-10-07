import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  changesSetScore,
  isLiveSetInterval,
  isScoreOnlySetUpdate,
  openSetOf,
  queueSetScoreSync
} from '../../utils_beach/eventSync_beach'

// The cloud sets row used to stay 0:0 for the whole set while the live state
// carried the points; OpenVolley queues the running score after every point.

let savedDeps
beforeAll(() => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let db
let n = 0
beforeEach(async () => {
  db = new Dexie(`eventSync-${++n}`)
  db.version(1).stores({
    matches: '++id,test',
    sets: '++id,matchId,index',
    sync_queue: '++id,resource,action,ts,status'
  })
  await db.open()
})

describe('queueSetScoreSync', () => {
  it('queues the running score of the open set under its namespaced id', async () => {
    const matchId = await db.matches.add({ seed_key: 'seed-1', test: false })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 18, finished: true })
    const openId = await db.sets.add({ matchId, index: 2, team1Points: 7, team2Points: 5, finished: false })

    expect(await queueSetScoreSync(db, { matchId })).toBe(true)
    const jobs = await db.sync_queue.toArray()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      resource: 'set',
      action: 'update',
      status: 'queued',
      payload: { external_id: `seed-1:s:${openId}`, team1_points: 7, team2_points: 5 }
    })
  })

  it('keeps one queued score per set (an offline set sends one update, not one per rally)', async () => {
    const matchId = await db.matches.add({ seed_key: 'seed-1', test: false })
    const setId = await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false })
    await queueSetScoreSync(db, { matchId })
    await db.sets.update(setId, { team1Points: 2 })
    await queueSetScoreSync(db, { matchId })
    // A set update with more than the score (the set end) is never dropped
    await db.sync_queue.add({ resource: 'set', action: 'update', status: 'queued', payload: { external_id: `seed-1:s:${setId}`, finished: true } })
    await db.sets.update(setId, { team1Points: 3 })
    await queueSetScoreSync(db, { matchId })

    const jobs = await db.sync_queue.toArray()
    expect(jobs).toHaveLength(2)
    expect(jobs.find(j => j.payload.finished)).toBeTruthy()
    expect(jobs.find(j => !j.payload.finished).payload.team1_points).toBe(3)
  })

  it('queues nothing for a test match or a match without a seed key', async () => {
    const testId = await db.matches.add({ seed_key: 'test-match-default-abc', test: true })
    await db.sets.add({ matchId: testId, index: 1, team1Points: 3, team2Points: 1, finished: false })
    const unseeded = await db.matches.add({ test: false })
    await db.sets.add({ matchId: unseeded, index: 1, team1Points: 3, team2Points: 1, finished: false })
    expect(await queueSetScoreSync(db, { matchId: testId })).toBe(false)
    expect(await queueSetScoreSync(db, { matchId: unseeded })).toBe(false)
    expect(await queueSetScoreSync(db, { matchId: 999 })).toBe(false)
    expect(await db.sync_queue.count()).toBe(0)
  })

  it('never throws into the scoring flow', async () => {
    await expect(queueSetScoreSync({ matches: { get: () => { throw new Error('gone') } } }, { matchId: 1 })).resolves.toBe(false)
  })
})

describe('helpers', () => {
  it('score-changing event types; a set end is not one', () => {
    for (const type of ['point', 'undo', 'replay', 'decision_change', 'bmp_outcome', 'manual_score_update']) {
      expect(changesSetScore(type)).toBe(true)
    }
    for (const type of ['set_end', 'timeout', 'court_switch', null, undefined]) {
      expect(changesSetScore(type)).toBe(false)
    }
  })

  it('isScoreOnlySetUpdate only matches queued score-only updates of that set', () => {
    const job = { resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'k:s:1', team1_points: 1, team2_points: 0 } }
    expect(isScoreOnlySetUpdate(job, 'k:s:1')).toBe(true)
    expect(isScoreOnlySetUpdate(job, 'k:s:2')).toBe(false)
    expect(isScoreOnlySetUpdate({ ...job, status: 'sending' }, 'k:s:1')).toBe(false)
    expect(isScoreOnlySetUpdate({ ...job, payload: { ...job.payload, finished: true } }, 'k:s:1')).toBe(false)
  })

  it('openSetOf picks the highest unfinished set', () => {
    expect(openSetOf([{ index: 1, finished: true }, { index: 2, finished: false }]).index).toBe(2)
    expect(openSetOf([{ index: 1, finished: true }, { index: 2, finished: true }]).index).toBe(2)
    expect(openSetOf([])).toBe(null)
  })
})

// Scoreboard_beach.syncLiveStateToSupabase read an undefined isSetFinished
// whenever the match was in its interval (a ReferenceError on every sync).
describe('isLiveSetInterval', () => {
  it('the set end is the interval', () => {
    expect(isLiveSetInterval({ eventType: 'set_end' })).toBe(true)
  })

  it('a match in its interval, before the shown set is marked finished', () => {
    expect(isLiveSetInterval({ eventType: 'manual_score_update', matchStatus: 'interval', snapshotSetFinished: false })).toBe(true)
  })

  it('no second shift once the shown set is finished, and none during play', () => {
    expect(isLiveSetInterval({ eventType: 'point', matchStatus: 'interval', snapshotSetFinished: true })).toBe(false)
    expect(isLiveSetInterval({ eventType: 'point', matchStatus: 'live' })).toBe(false)
    expect(isLiveSetInterval()).toBe(false)
  })
})
