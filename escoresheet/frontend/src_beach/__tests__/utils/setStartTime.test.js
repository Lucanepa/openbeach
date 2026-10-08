import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  defaultSetStartTime, scheduledClock, withActualStartTimeRemark, localClock, scheduledStartOn, startScheduleOf, typedStartNear
} from '../../utils_beach/setStartTime_beach'
import { planSetTimes } from '../../utils_beach/corrections_beach'
import { remarksAfter } from '../../utils_beach/applyCorrectionPlan_beach'
import { plausibleMinutes } from '../../../scoresheet_pdf_beach/components_beach/sheetFormat_beach'

const at = (iso) => new Date(iso)
// Local wall-clock times: the dialog shows and takes local HH:MM
const local = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s)
const iso = (...a) => local(...a).toISOString()

// The video: scheduled 12.03.2025 12:30, scored on 08.10.2026
const SCHEDULED = iso(2025, 3, 12, 12, 30)
const TODAY = local(2026, 10, 8, 12, 41, 20)

describe('defaultSetStartTime: set 1 proposes the scheduled time', () => {
  it('the scheduled HH:MM on the day the set is played', () => {
    const start = defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: TODAY, scheduledAt: SCHEDULED })
    expect(start).toBe(iso(2026, 10, 8, 12, 30))
    expect(localClock(start)).toBe('12:30')
  })

  it('a scheduled date in the past does not leak into the start', () => {
    const start = defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: TODAY, scheduledAt: SCHEDULED })
    const d = new Date(start)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 8])
  })

  it('a late match confirmed after midnight keeps the evening before (as OpenVolley)', () => {
    expect(scheduledStartOn(iso(2026, 10, 1, 23, 30), local(2026, 10, 9, 0, 10))).toBe(iso(2026, 10, 8, 23, 30))
    // a match scheduled tomorrow and played today (an hour ahead): today
    expect(scheduledStartOn(iso(2026, 10, 9, 18, 0), local(2026, 10, 8, 17, 0))).toBe(iso(2026, 10, 8, 18, 0))
  })

  it('no scheduled time (none, a bare date, a date saved without a time): now', () => {
    for (const scheduledAt of [null, undefined, '', '2025-03-12', iso(2025, 3, 12, 0, 0), 'garbage']) {
      expect(defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: TODAY, scheduledAt }))
        .toBe(iso(2026, 10, 8, 12, 41))
    }
  })

  it('a test match (made-up 12:00 kickoff) has no schedule: set 1 now, no remark', () => {
    const testMatch = { test: true, scheduledAt: iso(2026, 10, 8, 12, 0) }
    expect(startScheduleOf(testMatch)).toBeNull()
    expect(defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: TODAY, scheduledAt: startScheduleOf(testMatch) }))
      .toBe(iso(2026, 10, 8, 12, 41))
    expect(withActualStartTimeRemark('', { setIndex: 1, startTime: iso(2026, 10, 8, 12, 41), scheduledAt: startScheduleOf(testMatch) })).toBe('')
    expect(startScheduleOf({ scheduledAt: SCHEDULED })).toBe(SCHEDULED)
    expect(startScheduleOf(null)).toBeNull()
  })

  it('set 1 starts when its first rally starts when there is no schedule', () => {
    expect(defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: at('2026-10-08T09:40:40Z') }))
      .toBe('2026-10-08T09:40:00.000Z')
  })
})

describe('defaultSetStartTime: later sets unchanged', () => {
  it('set 2 starts now, not "set 1 end + 1 minute" nor the scheduled time', () => {
    const sets = [{ index: 1, endTime: '2026-10-08T09:55:00Z' }, { index: 2 }]
    expect(defaultSetStartTime({ setIndex: 2, sets, now: at('2026-10-08T09:57:20Z'), scheduledAt: SCHEDULED }))
      .toBe('2026-10-08T09:57:00.000Z')
  })

  it('is never before the end of the last set played (device clock behind)', () => {
    const sets = [{ index: 1, endTime: '2026-10-08T10:20:00Z' }, { index: 2, endTime: '2026-10-08T10:45:30Z' }, { index: 3 }]
    expect(defaultSetStartTime({ setIndex: 3, sets, now: at('2026-10-08T10:44:00Z') }))
      .toBe('2026-10-08T10:45:00.000Z')
  })

  it('ignores later sets and unparseable end times', () => {
    const sets = [{ index: 1, endTime: 'garbage' }, { index: 3, endTime: '2026-10-08T23:00:00Z' }]
    expect(defaultSetStartTime({ setIndex: 2, sets, now: at('2026-10-08T18:30:00Z') }))
      .toBe('2026-10-08T18:30:00.000Z')
  })
})

describe('scheduledClock', () => {
  it('the local HH:MM of the schedule, null without a time', () => {
    expect(scheduledClock(SCHEDULED)).toBe('12:30')
    expect(scheduledClock(null)).toBeNull()
    expect(scheduledClock('2025-03-12')).toBeNull()
    expect(scheduledClock(iso(2025, 3, 12, 0, 0))).toBeNull()
  })
})

describe('withActualStartTimeRemark ("Actual start time: HH:MM")', () => {
  const set1 = (startTime, remarks = '') => withActualStartTimeRemark(remarks, { setIndex: 1, startTime, scheduledAt: SCHEDULED })

  it('the scheduled time confirmed: no remark', () => {
    expect(set1(iso(2026, 10, 8, 12, 30))).toBe('')
    expect(set1(iso(2026, 10, 8, 12, 30), 'Ball changed')).toBe('Ball changed')
  })

  it('a different time adds exactly one remark line', () => {
    expect(set1(iso(2026, 10, 8, 12, 47))).toBe('Actual start time: 12:47')
    expect(set1(iso(2026, 10, 8, 12, 47), 'Ball changed')).toBe('Ball changed\nActual start time: 12:47')
  })

  it('editing again replaces the line, other remarks stay', () => {
    const first = set1(iso(2026, 10, 8, 12, 47), 'Ball changed')
    const again = set1(iso(2026, 10, 8, 12, 52), `${first}\nWind`)
    expect(again).toBe('Ball changed\nWind\nActual start time: 12:52')
    expect(again.match(/Actual start time/g)).toHaveLength(1)
  })

  it('back to the scheduled time removes it', () => {
    const first = set1(iso(2026, 10, 8, 12, 47), 'Ball changed')
    expect(set1(iso(2026, 10, 8, 12, 30), first)).toBe('Ball changed')
    expect(set1(iso(2026, 10, 8, 12, 30), set1(iso(2026, 10, 8, 12, 47)))).toBe('')
  })

  it('later sets and matches without a schedule: no remark, remarks untouched', () => {
    expect(withActualStartTimeRemark('Ball changed', { setIndex: 2, startTime: iso(2026, 10, 8, 13, 5), scheduledAt: SCHEDULED })).toBe('Ball changed')
    expect(withActualStartTimeRemark('Actual start time: 12:47', { setIndex: 2, startTime: iso(2026, 10, 8, 13, 5), scheduledAt: SCHEDULED })).toBe('Actual start time: 12:47')
    expect(withActualStartTimeRemark('', { setIndex: 1, startTime: iso(2026, 10, 8, 12, 47), scheduledAt: null })).toBe('')
  })
})

describe('the set 1 start on the scoresheet', () => {
  it('a sane duration even with a schedule from another year', () => {
    const start = defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: TODAY, scheduledAt: SCHEDULED })
    const end = iso(2026, 10, 8, 12, 58)
    expect(plausibleMinutes(start, end)).toBe(28)
  })
})

describe('correcting set 1 start time afterwards (corrections panel)', () => {
  const events = [{ id: 1, matchId: 1, setIndex: 1, type: 'set_start', seq: 1, ts: iso(2026, 10, 8, 12, 47), payload: {} }]
  const sets = [{ index: 1, startTime: iso(2026, 10, 8, 12, 47) }, { index: 2, startTime: iso(2026, 10, 8, 13, 10) }]
  const ctxWith = (remarks) => ({ t: null, matchId: 1, mode: 'live', match: { scheduledAt: SCHEDULED, remarks } })

  it('replaces the remark line, removes it at the scheduled time', () => {
    const remarks = 'Ball changed\nActual start time: 12:47'
    const plan = planSetTimes(events, sets, { setIndex: 1, startTime: iso(2026, 10, 8, 12, 45) }, ctxWith(remarks))
    expect(remarksAfter(remarks, plan)).toBe('Ball changed\nActual start time: 12:45')
    const back = planSetTimes(events, sets, { setIndex: 1, startTime: iso(2026, 10, 8, 12, 30) }, ctxWith(remarks))
    expect(remarksAfter(remarks, back)).toBe('Ball changed')
  })

  it('a test match: no remark from a set 1 correction', () => {
    const plan = planSetTimes(events, sets, { setIndex: 1, startTime: iso(2026, 10, 8, 12, 45) },
      { t: null, matchId: 1, mode: 'live', match: { test: true, scheduledAt: SCHEDULED, remarks: '' } })
    expect(plan.remarkAdd).toEqual([])
  })

  it('later sets and end-time-only corrections leave the remarks alone', () => {
    const remarks = 'Actual start time: 12:47'
    const p2 = planSetTimes(events, sets, { setIndex: 2, startTime: iso(2026, 10, 8, 13, 12) }, ctxWith(remarks))
    expect(p2.remarkAdd).toEqual([])
    expect(p2.remarkRemove).toEqual([])
    const pEnd = planSetTimes(events, sets, { setIndex: 1, endTime: iso(2026, 10, 8, 13, 0) }, ctxWith(remarks))
    expect(remarksAfter(remarks, pEnd)).toBe(remarks)
  })
})

describe('the scoring screen uses it', () => {
  const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
  it('the dialog default comes from defaultSetStartTime with the schedule, never "+ 1 minute"', () => {
    const start = sb.indexOf('// If this is the first rally, show set start time confirmation')
    const block = sb.slice(start, sb.indexOf('setSetStartTimeModal({', start))
    expect(block).toContain('defaultSetStartTime({')
    // a test match's made-up kickoff is no schedule (startScheduleOf)
    expect(block).toContain('const scheduledAt = startScheduleOf(data?.match)')
    expect(block).toContain('defaultSetStartTime({ setIndex, sets: allSets, scheduledAt })')
    expect(block).not.toContain('getMinutes() + 1')
  })

  it('the confirmed start writes the remark through withActualStartTimeRemark', () => {
    const start = sb.indexOf('const confirmSetStartTime = useCallback(')
    const block = sb.slice(start, sb.indexOf('const confirmSetEndTime = useCallback(', start))
    expect(block).toContain('withActualStartTimeRemark(')
    expect(block).toContain('const scheduledAt = startScheduleOf(matchNow)')
    expect(block).toMatch(/db\.matches\.update\(matchId, \{ remarks/)
  })
})

describe('the typed start time is on the day nearest to the proposal (typedStartNear)', () => {
  it('a 23:30 match confirmed at 00:10: kept 23:30 is the evening before, a typed 00:12 is today', () => {
    const proposed = defaultSetStartTime({ setIndex: 1, now: local(2026, 10, 9, 0, 10), scheduledAt: iso(2026, 10, 1, 23, 30) })
    expect(proposed).toBe(iso(2026, 10, 8, 23, 30))
    expect(typedStartNear(proposed, '23:30')).toBe(iso(2026, 10, 8, 23, 30))
    // the proposal's date would give 08.10 00:12, a set 1 of over 24 hours
    expect(typedStartNear(proposed, '00:12')).toBe(iso(2026, 10, 9, 0, 12))
  })

  it('a 20:00 match played the next morning: a typed 07:05 is the morning, not the day before', () => {
    const proposed = defaultSetStartTime({ setIndex: 1, now: local(2026, 10, 9, 7, 3), scheduledAt: iso(2026, 10, 8, 20, 0) })
    expect(typedStartNear(proposed, '07:05')).toBe(iso(2026, 10, 9, 7, 5))
  })

  it('the same day otherwise; invalid input is null', () => {
    const proposed = iso(2026, 10, 8, 12, 30)
    expect(typedStartNear(proposed, '12:45')).toBe(iso(2026, 10, 8, 12, 45))
    expect(typedStartNear(proposed, '')).toBeNull()
    expect(typedStartNear(proposed, '25:00')).toBeNull()
  })

  it('the dialog uses it', () => {
    const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
    const start = sb.indexOf('function SetStartTimeModal(')
    const modal = sb.slice(start, sb.indexOf('onConfirm(isoString)', start))
    expect(modal).toContain('typedStartNear(defaultTime, time)')
  })
})
