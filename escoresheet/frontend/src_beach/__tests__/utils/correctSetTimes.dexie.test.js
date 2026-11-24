// The scoring screen's older "Manual changes" panel (Advanced > Set times)
// wrote the set row's start straight to Dexie: set 1's "Actual start time:
// HH:MM" remark (owner, 2026-10-08) did not follow, unlike the corrections
// panel's set times form. Both now go through planSetTimes and
// applyCorrectionPlan (correctSetTimes), against the real app database
// (db_beach on fake-indexeddb).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../../db_beach/db_beach'
import { eventHistorySettled } from '../../db_beach/eventHistory_beach'
import { correctSetTimes } from '../../utils_beach/applyCorrectionPlan_beach'

const local = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi)
const iso = (...a) => local(...a).toISOString()
const settle = async () => {
  await new Promise(r => setTimeout(r, 20))
  await eventHistorySettled()
}

async function seed({ test = false, remarks = 'Ball changed\nActual start time: 12:47' } = {}) {
  const matchId = await db.matches.add({
    status: 'live', seed_key: 'match_1759740000000_sst01', test, coinTossTeamA: 'team1',
    scheduledAt: iso(2026, 10, 8, 12, 30), sanctions: {}, manualChanges: [], remarks
  })
  await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: iso(2026, 10, 8, 12, 47), endTime: iso(2026, 10, 8, 13, 5) })
  await db.sets.add({ matchId, index: 2, team1Points: 3, team2Points: 2, finished: false, startTime: iso(2026, 10, 8, 13, 8) })
  await db.events.add({ matchId, setIndex: 1, type: 'set_start', seq: 1, ts: iso(2026, 10, 8, 12, 47), payload: { setIndex: 1, startTime: iso(2026, 10, 8, 12, 47) } })
  await db.events.add({ matchId, setIndex: 1, type: 'set_end', seq: 2, ts: iso(2026, 10, 8, 13, 5), payload: { setIndex: 1, team1Points: 21, team2Points: 15 } })
  return matchId
}
const set = async (matchId, index) => (await db.sets.where('matchId').equals(matchId).toArray()).find(s => s.index === index)

describe('correctSetTimes: the manual panel\'s set times through the corrections path', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('a new set 1 start replaces the "Actual start time" line; the scheduled time removes it', async () => {
    const matchId = await seed()
    const res = await correctSetTimes({ db, matchId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 52) })
    await settle()
    expect(res.error).toBeUndefined()
    expect((await set(matchId, 1)).startTime).toBe(iso(2026, 10, 8, 12, 52))
    let match = await db.matches.get(matchId)
    expect(match.remarks).toBe('Ball changed\nActual start time: 12:52')
    expect(match.manualChanges.at(-1)).toMatchObject({ category: 'correction', action: 'setTimes', setIndex: 1 })
    // the cloud set row follows (it was never queued from this panel)
    const jobs = await db.sync_queue.toArray()
    expect(jobs.some(j => j.resource === 'set' && j.payload.start_time === iso(2026, 10, 8, 12, 52))).toBe(true)

    await correctSetTimes({ db, matchId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 30) })
    await settle()
    match = await db.matches.get(matchId)
    expect(match.remarks).toBe('Ball changed')
  })

  it('a set 1 start on another time than scheduled with no line yet adds one', async () => {
    const matchId = await seed({ remarks: '' })
    await correctSetTimes({ db, matchId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 41) })
    await settle()
    expect((await db.matches.get(matchId)).remarks).toBe('Actual start time: 12:41')
  })

  it('later sets, end times and test matches leave the remarks alone', async () => {
    const matchId = await seed()
    await correctSetTimes({ db, matchId, setIndex: 2, startTime: iso(2026, 10, 8, 13, 10) })
    await correctSetTimes({ db, matchId, setIndex: 1, endTime: iso(2026, 10, 8, 13, 6) })
    await settle()
    expect((await set(matchId, 2)).startTime).toBe(iso(2026, 10, 8, 13, 10))
    expect((await set(matchId, 1)).endTime).toBe(iso(2026, 10, 8, 13, 6))
    expect((await db.matches.get(matchId)).remarks).toBe('Ball changed\nActual start time: 12:47')

    await Promise.all(db.tables.map(t => t.clear()))
    const testId = await seed({ test: true, remarks: '' })
    await correctSetTimes({ db, matchId: testId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 52) })
    await settle()
    expect((await db.matches.get(testId)).remarks).toBe('')
  })

  it('the same time again writes nothing (a blur without a change); an end before the start is refused', async () => {
    const matchId = await seed()
    const same = await correctSetTimes({ db, matchId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 47) })
    expect(same.unchanged).toBe(true)
    expect((await db.matches.get(matchId)).manualChanges).toEqual([])

    // a stored time with seconds (a set row restored from the cloud, test
    // mode) shown in the minute field and blurred: still no change
    const s1 = await set(matchId, 1)
    await db.sets.update(s1.id, { startTime: new Date(local(2026, 10, 8, 12, 47).getTime() + 31500).toISOString() })
    const blurred = await correctSetTimes({ db, matchId, setIndex: 1, startTime: iso(2026, 10, 8, 12, 47) })
    expect(blurred.unchanged).toBe(true)
    expect((await db.matches.get(matchId)).manualChanges).toEqual([])
    expect((await db.sync_queue.toArray()).filter(j => j.resource === 'set')).toEqual([])

    const bad = await correctSetTimes({ db, matchId, setIndex: 1, endTime: iso(2026, 10, 8, 12, 40) })
    expect(bad.error).toBe('corrections.error.endBeforeStart')
    expect((await set(matchId, 1)).endTime).toBe(iso(2026, 10, 8, 13, 5))
  })
})

describe('the scoring screen\'s manual panel uses it', () => {
  it('the set times fields write through correctSetTimes, never straight to the set row', () => {
    const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
    const start = sb.indexOf("{t('scoreboard.manual.setTimes')}")
    const block = sb.slice(start, sb.indexOf('{/* Add New Event */}', start))
    expect(block).toContain("saveManualSetTime(set, 'startTime'")
    expect(block).toContain("saveManualSetTime(set, 'endTime'")
    expect(block).not.toMatch(/db\.sets\.update\(set\.id/)
    const helper = sb.slice(sb.indexOf('const saveManualSetTime = useCallback('))
    expect(helper.slice(0, 1500)).toContain('correctSetTimes(')
  })
})
