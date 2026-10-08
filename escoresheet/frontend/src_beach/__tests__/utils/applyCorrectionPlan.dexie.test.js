// The one write path of the beach corrections against the real app database
// (db_beach on fake-indexeddb, the event history hooks installed): one
// transaction with the events, the set score re-derived from the points, the
// sanction flags, the correction log and the sync jobs; what it removes or
// edits is kept by the event history with the reason 'correction'.
// Ported from OpenVolley src/services/corrections/__tests__/applyCorrectionPlan.test.js.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db_beach/db_beach'
import { eventHistorySettled } from '../../db_beach/eventHistory_beach'
import { applyCorrectionPlan, planChangesSheet, remarksAfter } from '../../utils_beach/applyCorrectionPlan_beach'
import { planAddSanction, planRemoveGroup, planAdjustFinalScore, planRemark, scoreTimeline } from '../../utils_beach/corrections_beach'
import { eventExtId, setExtId } from '../../utils_beach/syncIds_beach'

const SEED = 'match_1759740000000_corr01'
const settle = async () => {
  await new Promise(r => setTimeout(r, 20))
  await eventHistorySettled()
}

async function seed({ signed = false, finished = false } = {}) {
  const matchId = await db.matches.add({
    status: finished ? 'ended' : 'live', seed_key: SEED, test: false, coinTossTeamA: 'team1',
    sanctions: {}, manualChanges: [], remarks: '',
    ...(signed ? { scorerSignature: 'data:image/png;base64,AAA', ref1Signature: 'data:image/png;base64,BBB' } : {})
  })
  const setId = await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished })
  // 1:0, 1:1, 2:1 (team1 serves first)
  let seq = 1
  const add = (row) => db.events.add({ matchId, setIndex: 1, ts: new Date(1e12 + seq * 1000).toISOString(), payload: {}, ...row, seq: seq++ })
  await add({ type: 'set_start' })
  for (const [team, s] of [['team1', { team1: 1, team2: 0 }], ['team2', { team1: 1, team2: 1 }], ['team1', { team1: 2, team2: 1 }]]) {
    await add({ type: 'rally_start' })
    await add({ type: 'point', payload: { team, score: s } })
  }
  await db.sets.update(setId, { team1Points: 2, team2Points: 1 })
  // an earlier delay warning of team1 (so a delay penalty is the next step)
  return { matchId, setId }
}

const ctx = (matchId, mode = 'live') => ({ t: null, matchId, match: { coinTossTeamA: 'team1' }, mode, liveSetIndex: 1 })

describe('applyCorrectionPlan (beach)', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('a delay warning added at 1:0: the event, its flag, the log entry and the sync jobs in one write', async () => {
    const { matchId } = await seed()
    const events = await db.events.where('matchId').equals(matchId).toArray()
    const at = scoreTimeline(events, 1).findIndex(e => e.team1 === 1 && e.team2 === 0)
    const plan = planAddSanction(events, { setIndex: 1, team: 'team2', type: 'delay_warning', at }, ctx(matchId))
    expect(plan.error).toBeUndefined()
    const res = await applyCorrectionPlan(plan, { matchId, db, mode: 'live' })
    await settle()

    expect(res.addedIds).toHaveLength(1)
    const added = await db.events.get(res.addedIds[0])
    expect(added).toMatchObject({ type: 'sanction', setIndex: 1, payload: { team: 'team2', type: 'delay_warning' } })
    const match = await db.matches.get(matchId)
    expect(match.sanctions).toMatchObject({ delayWarningteam2: true })
    expect(match.manualChanges.at(-1)).toMatchObject({ category: 'correction', action: 'addSanction', by: 'scorer' })
    expect(match.manualChanges.at(-1).text).toMatch(/^Added: Delay warning · Team 2 \(B\) · Set 1 · B 0:1 A$/)

    const jobs = await db.sync_queue.toArray()
    // the new row and every renumbered row are upserted
    expect(jobs.some(j => j.action === 'insert' && j.payload.external_id === eventExtId(SEED, added.id))).toBe(true)
    expect(jobs.find(j => j.resource === 'match').payload).toMatchObject({ id: SEED, sanctions: { delayWarningteam2: true } })
    // the renumbering is an edit of the server rows, labelled 'correction'
    const edits = jobs.filter(j => j.action === 'edit')
    expect(edits.length).toBeGreaterThan(0)
    expect(edits.every(j => j.payload.reason === 'correction')).toBe(true)
    // all of one correction share one action id
    const hist = await db.event_history.toArray()
    expect(new Set(hist.map(h => h.actionId)).size).toBe(1)
  })

  it('removing a point: the set score is counted from the points, the point is voided (not deleted) on the server', async () => {
    const { matchId, setId } = await seed()
    const events = await db.events.where('matchId').equals(matchId).toArray()
    const point = events.find(e => e.type === 'point' && e.payload.team === 'team2')
    // its insert never reached the server
    await db.sync_queue.add({ resource: 'event', action: 'insert', status: 'queued', ts: 1, payload: { external_id: eventExtId(SEED, point.id), match_id: SEED } })
    const plan = planRemoveGroup(events, point.id, ctx(matchId))
    await applyCorrectionPlan(plan, { matchId, db, mode: 'live' })
    await settle()

    expect(await db.sets.get(setId)).toMatchObject({ team1Points: 2, team2Points: 0 })
    expect(await db.events.get(point.id)).toBeUndefined()
    const jobs = await db.sync_queue.toArray()
    expect(jobs.filter(j => j.action === 'insert' && j.payload.external_id === eventExtId(SEED, point.id))).toHaveLength(0)
    const voids = jobs.filter(j => j.action === 'void')
    expect(voids.map(j => j.payload.external_id)).toContain(eventExtId(SEED, point.id))
    expect(voids.every(j => j.payload.reason === 'correction')).toBe(true)
    expect(jobs.some(j => j.action === 'delete')).toBe(false)
    expect(jobs.find(j => j.resource === 'set').payload).toEqual({ external_id: setExtId(SEED, setId), team1_points: 2, team2_points: 0 })
    const hist = await db.event_history.where('eventId').equals(point.id).toArray()
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ op: 'void', reason: 'correction' })
  })

  it('at the match end a change of the sheet clears the post-match signatures; a remark changes the remarks', async () => {
    const { matchId } = await seed({ signed: true })
    const match = await db.matches.get(matchId)
    const plan = planRemark(match.remarks, { text: 'Ball changed at 1:1' }, ctx(matchId, 'review'))
    expect(planChangesSheet(plan)).toBe(true)
    const res = await applyCorrectionPlan(plan, { matchId, db, mode: 'review' })
    expect(res.signaturesCleared).toBe(true)
    const after = await db.matches.get(matchId)
    expect(after.remarks).toBe('Ball changed at 1:1')
    expect(after.scorerSignature).toBeNull()
    expect(after.ref1Signature).toBeNull()
    const matchJobs = (await db.sync_queue.toArray()).filter(j => j.resource === 'match')
    const matchJob = matchJobs.find(j => 'signatures' in j.payload)
    expect(matchJob.payload.signatures).toMatchObject({ scorer: null, ref1: null })
    // the new remarks go to the server too (backend db/017), in their own job
    expect(matchJobs.find(j => 'remarks' in j.payload).payload.remarks).toBe('Ball changed at 1:1')
  })

  it('the final score of a finished set: a missed point added, the set row and the set end follow', async () => {
    const { matchId, setId } = await seed({ finished: true })
    // 2:1, then 21:17 for team1 with a set end
    let seq = 100
    for (let i = 0; i < 16; i++) await db.events.add({ matchId, setIndex: 1, type: 'point', seq: seq++, payload: { team: 'team2' } })
    for (let i = 0; i < 19; i++) await db.events.add({ matchId, setIndex: 1, type: 'point', seq: seq++, payload: { team: 'team1' } })
    const endId = await db.events.add({ matchId, setIndex: 1, type: 'set_end', seq: seq++, payload: { team: 'team1', team1Points: 21, team2Points: 17 } })
    await db.sets.update(setId, { team1Points: 21, team2Points: 17 })
    const events = await db.events.where('matchId').equals(matchId).toArray()
    const sets = await db.sets.where('matchId').equals(matchId).toArray()
    // 22:17 is not a final score; team2 did not win the last point
    expect(planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team1', delta: 1 }, ctx(matchId, 'review')).error).toBe('corrections.error.invalidFinalScore')
    expect(planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team2', delta: -1 }, ctx(matchId, 'review')).error).toBe('corrections.error.notLastPoint')
    // 21:18: team2's missed point goes in before the winning point
    const plus = planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team2', delta: 1 }, ctx(matchId, 'review'))
    expect(plus.error).toBeUndefined()
    await applyCorrectionPlan(plus, { matchId, db, mode: 'review' })
    expect(await db.sets.get(setId)).toMatchObject({ team1Points: 21, team2Points: 18 })
    expect((await db.events.get(endId)).payload).toMatchObject({ team1Points: 21, team2Points: 18 })
    const points = (await db.events.where('matchId').equals(matchId).toArray()).filter(e => e.type === 'point').sort((a, b) => a.seq - b.seq)
    expect(points.at(-1).payload.team).toBe('team1')
    expect(points.at(-2).payload.team).toBe('team2')
  })

  it('remarksAfter applies removals, additions and a whole new text', () => {
    expect(remarksAfter('a\nb', { remarkRemove: ['a'], remarkAdd: ['c'] })).toBe('b\nc')
    expect(remarksAfter('a', { remarksSet: 'x' })).toBe('x')
  })

  it('a plan with an error writes nothing', async () => {
    const { matchId } = await seed()
    const before = await db.events.count()
    await expect(applyCorrectionPlan({ error: 'corrections.error.notFound' }, { matchId, db })).rejects.toThrow()
    expect(await db.events.count()).toBe(before)
  })
})
