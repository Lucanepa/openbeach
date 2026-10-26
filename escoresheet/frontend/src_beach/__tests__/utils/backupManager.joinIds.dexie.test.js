// A match continued on another device ("Take back scoring here", a restore
// by game PIN: importMatchFromSupabase), against the real app database
// (Dexie 4 on fake-indexeddb). Stress test 2026-10-25
// (ob-takeback-rekeys-sets-events): the imported sets and events got new
// local ids, and every later write of the device derives its external_id
// from the local id. After a take-back the set updates went to ':s:2' while
// the cloud's set 1 is ':s:1' (frozen at 2:2, never finished, the
// approval's result empty), and an undo of a point scored before the
// take-back voided ':e:17' instead of ':e:10'. Ported from OpenVolley
// 83d8b9af (backupManager.joinIds.dexie.test.js).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils_beach/matchHandover_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  queueScorerClaim: vi.fn(async () => null)
}))

import { db } from '../../db_beach/db_beach'
import { importMatchFromSupabase, fetchMatchByPin } from '../../utils_beach/backupManager_beach'
import { queueSetScoreSync, queueSetFinishedSync } from '../../utils_beach/eventSync_beach'
import { withActivityContext, eventHistorySettled } from '../../db_beach/eventHistory_beach'

const seed = 'match_1792931096817_22rkmmhm'
// Device A scored the match from the start: set 1 is ':s:1', events ':e:1'..':e:10'
function cloudMatch({ idFloor, setExt = 1, firstEvent = 1 } = {}) {
  return {
    match: {
      id: '11111111-1111-4111-8111-111111111111', external_id: seed, game_n: 61, status: 'live', test: false,
      sport_type: 'beach', team1_data: { name: 'Synth One' }, team2_data: { name: 'Synth Two' },
      coin_toss: { team_a: 'team1', team_b: 'team2', confirmed: true, first_serve: 'team1' }
    },
    sets: [{ id: 'cloud-set-1', external_id: `${seed}:s:${setExt}`, index: 1, team1_points: 2, team2_points: 2, finished: false, start_time: '2026-10-25T12:25:00Z' }],
    events: Array.from({ length: 10 }, (_, i) => ({
      id: `cloud-event-${i}`,
      external_id: `${seed}:e:${firstEvent + i}`, set_index: 1, seq: i + 1,
      type: ['coin_toss', 'set_start'][i] || 'point',
      payload: i < 2 ? {} : { team: i % 2 ? 'team1' : 'team2' }, ts: '2026-10-25T12:25:00Z'
    })),
    liveState: { id: 'live-1', match_id: '11111111-1111-4111-8111-111111111111', current_set: 1, points_a: 2, points_b: 2 },
    gamePin: '123456',
    ...(idFloor ? { idFloor } : {})
  }
}

const settle = async () => {
  await new Promise(r => setTimeout(r, 20))
  await eventHistorySettled()
}
const lastSetJob = async () => (await db.sync_queue.where('resource').equals('set').toArray()).pop()

describe('importMatchFromSupabase: the device continues the cloud rows', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('"Take back scoring here": the device writes the set and event rows the cloud has', async () => {
    // The device's own copy before the take-back: set 1 and events 1..10 (the
    // ids the cloud rows carry), plus a later match's rows that moved the
    // Dexie counters on
    const own = await db.matches.add({ seed_key: seed, status: 'live', gamePin: '123456', gameN: 61 })
    await db.sets.add({ id: 1, matchId: own, index: 1, team1Points: 2, team2Points: 1, finished: false })
    for (let i = 1; i <= 10; i++) await db.events.add({ id: i, matchId: own, setIndex: 1, type: 'point', seq: i, payload: {} })

    const localMatchId = await importMatchFromSupabase(cloudMatch())
    const sets = await db.sets.where('matchId').equals(localMatchId).toArray()
    const events = await db.events.where('matchId').equals(localMatchId).sortBy('seq')
    expect(sets.map(s => s.id)).toEqual([1])
    expect(events.map(e => e.id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1))

    // the running score and the end of set 1 update the cloud's set 1
    await queueSetScoreSync(db, { matchId: localMatchId, setIndex: 1 })
    expect((await lastSetJob()).payload.external_id).toBe(`${seed}:s:1`)
    await queueSetFinishedSync(db, { matchId: localMatchId, setId: sets[0].id })
    expect((await lastSetJob()).payload.external_id).toBe(`${seed}:s:1`)

    // the undo of the last point scored before the take-back voids that point
    await withActivityContext({ reason: 'undo' }, () => db.events.delete(10))
    await settle()
    const rev = (await db.sync_queue.where('resource').equals('event').toArray()).find(j => j.action === 'void')
    expect(rev.payload.external_id).toBe(`${seed}:e:10`)
    // nothing is re-keyed on the server
    expect((await db.sync_queue.toArray()).some(j => j.action === 'restore')).toBe(false)
  })

  it('new rows stay above the ids the match used on the server (voided events, revisions)', async () => {
    const localMatchId = await importMatchFromSupabase(cloudMatch({ idFloor: { set: 2, event: 40 } }))
    const eventId = await db.events.add({ matchId: localMatchId, setIndex: 1, type: 'point', seq: 11, payload: { team: 'team1' } })
    expect(eventId).toBe(41)
    const setId = await db.sets.add({ matchId: localMatchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    expect(setId).toBe(3)
    // the generator was moved without leaving a row (or a history entry) behind
    expect(await db.events.get(40)).toBeUndefined()
    expect(await db.event_history.count()).toBe(0)
  })

  it('ids held by another local match: new ids, and the cloud rows are re-keyed to them', async () => {
    const other = await db.matches.add({ seed_key: 'match_1_other', status: 'live' })
    await db.sets.add({ id: 6, matchId: other, index: 1, team1Points: 3, team2Points: 1, finished: false })
    await db.events.add({ id: 125, matchId: other, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })

    const localMatchId = await importMatchFromSupabase(cloudMatch({ setExt: 6, firstEvent: 121, idFloor: { set: 6, event: 155 } }))
    // the other match's rows are untouched
    expect((await db.sets.get(6)).matchId).toBe(other)
    expect((await db.events.get(125)).matchId).toBe(other)

    const sets = await db.sets.where('matchId').equals(localMatchId).toArray()
    const events = await db.events.where('matchId').equals(localMatchId).sortBy('seq')
    expect(sets[0].id).toBeGreaterThan(6)
    expect(events[0].id).toBeGreaterThan(155)

    const restore = (await db.sync_queue.toArray()).find(j => j.action === 'restore')
    expect(restore).toMatchObject({ resource: 'match', status: 'queued' })
    expect(restore.payload.match).toEqual({ external_id: seed, status: 'live' })
    expect(restore.payload.sets.map(s => s.external_id)).toEqual(sets.map(s => `${seed}:s:${s.id}`))
    expect(restore.payload.events.map(e => e.external_id)).toEqual(events.map(e => `${seed}:e:${e.id}`))
    expect(restore.payload.sets[0]).toMatchObject({ index: 1, team1_points: 2, team2_points: 2, finished: false })
    expect(restore.payload.sets[0].id).toBeUndefined()
    expect(restore.payload.liveState).toEqual({ current_set: 1, points_a: 2, points_b: 2 })

    // later writes use the same ids as the re-keyed rows
    await queueSetScoreSync(db, { matchId: localMatchId, setIndex: 1 })
    expect((await lastSetJob()).payload.external_id).toBe(`${seed}:s:${sets[0].id}`)
  })

  it('fetchMatchByPin passes the server\'s idFloor on', async () => {
    const restoreByPin = vi.fn(async () => ({
      data: { ...cloudMatch(), idFloor: { set: 3, event: 160 } },
      error: null,
      status: 200
    }))
    const out = await fetchMatchByPin('123456', '61', { restoreByPin })
    expect(out.idFloor).toEqual({ set: 3, event: 160 })
  })
})

// Stress test 2026-10-25 (ob-restore-at-match-end-drops-signatures-approval):
// the import stored the server's closing signatures as
// team1CaptainPostGameSignature / refereeSignature, which nothing reads, and
// dropped ref1 / ref2 / asst_scorer: Match end asked everyone to sign again
describe('importMatchFromSupabase: the closing signatures', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('come back in the fields Match end and the sheet read', async () => {
    const cloud = cloudMatch()
    cloud.match.signatures = {
      team1_captain: 'data:pre1', team2_captain: 'data:pre2',
      team1_captain_post_game: 'data:c1', team2_captain_post_game: 'data:c2',
      scorer: 'data:s', asst_scorer: null, ref1: 'data:r1', ref2: 'data:r2'
    }
    const localMatchId = await importMatchFromSupabase(cloud)
    const m = await db.matches.get(localMatchId)
    expect(m).toMatchObject({
      team1PostGameCaptainSignature: 'data:c1',
      team2PostGameCaptainSignature: 'data:c2',
      scorerSignature: 'data:s',
      asstScorerSignature: null,
      ref1Signature: 'data:r1',
      ref2Signature: 'data:r2'
    })
    // the next signature on this device sends them all back (signaturesPayload)
    const { signaturesPayload } = await import('../../utils_beach/signatures_beach')
    expect(signaturesPayload(m)).toMatchObject({ team1_captain_post_game: 'data:c1', ref1: 'data:r1', ref2: 'data:r2', scorer: 'data:s' })
  })
})

// Stress test 2026-10-25 (ob-takeback-loses-tto-courtswitch-setstart): the
// scoring screen writes set_start, technical_to (with the TTO's change of
// courts) and the first rally_start of a set without a sync job. "Take back
// scoring here" replaced the device's copy with the cloud's, which has none
// of them: the TTO was asked again, the teams went back to the wrong sides,
// and set 1's confirmed start time became the row's creation time
describe('importMatchFromSupabase: what only this device knows', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  async function ownCopy() {
    const own = await db.matches.add({ seed_key: seed, status: 'live', gamePin: '123456', gameN: 61, setLeftTeamOverrides: { 1: 'team2' } })
    await db.sets.add({ id: 1, matchId: own, index: 1, team1Points: 2, team2Points: 2, finished: false, startTime: '2026-10-25T13:40:00.000Z' })
    // the cloud's ten events (ids 1..10, seq 1..10) and this device's own:
    // set_start (seq 2.5), first rally_start (2.6), a TTO after the 10th (10.5)
    for (let i = 1; i <= 10; i++) await db.events.add({ id: i, matchId: own, setIndex: 1, type: i === 1 ? 'coin_toss' : 'point', seq: i, payload: {} })
    await db.events.add({ id: 11, matchId: own, setIndex: 1, type: 'set_start', seq: 2.5, payload: { setIndex: 1, startTime: '2026-10-25T13:40:00.000Z' } })
    await db.events.add({ id: 12, matchId: own, setIndex: 1, type: 'rally_start', seq: 2.6, payload: {} })
    await db.events.add({ id: 13, matchId: own, setIndex: 1, type: 'technical_to', seq: 10.5, payload: { courtSwitched: true, teamA: 'team1' } })
    return own
  }

  it('keeps its set_start, technical_to and first rally_start, its sides and its confirmed set start', async () => {
    await ownCopy()
    const localMatchId = await importMatchFromSupabase(cloudMatch())
    const events = await db.events.where('matchId').equals(localMatchId).sortBy('seq')
    expect(events.filter(e => !Number.isInteger(e.seq)).map(e => [e.type, e.seq, e.payload])).toEqual([
      ['set_start', 2.5, { setIndex: 1, startTime: '2026-10-25T13:40:00.000Z' }],
      ['rally_start', 2.6, {}],
      ['technical_to', 10.5, { courtSwitched: true, teamA: 'team1' }]
    ])
    // the cloud rows keep their ids; the kept events get new ones, above them
    expect(events.filter(e => Number.isInteger(e.seq)).map(e => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(Math.min(...events.filter(e => !Number.isInteger(e.seq)).map(e => e.id))).toBeGreaterThan(10)
    const m = await db.matches.get(localMatchId)
    expect(m.setLeftTeamOverrides).toEqual({ 1: 'team2' })
    expect((await db.sets.where('matchId').equals(localMatchId).first()).startTime).toBe('2026-10-25T13:40:00.000Z')
    // nothing of them is sent (they never were)
    expect((await db.sync_queue.toArray()).filter(j => j.resource === 'event')).toEqual([])
  })

  it('not when the other device scored on: the cloud copy is newer', async () => {
    await ownCopy()
    const cloud = cloudMatch()
    cloud.events.push({ id: 'cloud-event-x', external_id: `${seed}:e:41`, set_index: 1, seq: 11, type: 'point', payload: { team: 'team2' }, ts: '2026-10-25T12:30:00Z' })
    const localMatchId = await importMatchFromSupabase(cloud)
    const events = await db.events.where('matchId').equals(localMatchId).toArray()
    expect(events.filter(e => !Number.isInteger(e.seq))).toEqual([])
    expect((await db.sets.where('matchId').equals(localMatchId).first()).startTime).toBe('2026-10-25T12:25:00Z')
  })
})
