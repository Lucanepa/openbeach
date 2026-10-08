import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultSetStartTime } from '../../utils_beach/setStartTime_beach'

const at = (iso) => new Date(iso)

describe('defaultSetStartTime (as OpenVolley)', () => {
  it('set 1 starts when its first rally starts, not at the scheduled date and time', () => {
    expect(defaultSetStartTime({ setIndex: 1, sets: [{ index: 1 }], now: at('2026-10-08T09:40:40Z') }))
      .toBe('2026-10-08T09:40:00.000Z')
  })

  it('set 2 starts now, not "set 1 end + 1 minute"', () => {
    const sets = [{ index: 1, endTime: '2026-10-08T09:55:00Z' }, { index: 2 }]
    expect(defaultSetStartTime({ setIndex: 2, sets, now: at('2026-10-08T09:57:20Z') }))
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

describe('the scoring screen uses it', () => {
  const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
  it('no default from the scheduled time or the previous end + 1 minute', () => {
    const start = sb.indexOf('// If this is the first rally, show set start time confirmation')
    const block = sb.slice(start, sb.indexOf('setSetStartTimeModal({ setIndex: data?.set?.index, defaultTime })', start))
    expect(block).toContain('defaultSetStartTime({')
    expect(block).not.toContain('scheduledAt')
    expect(block).not.toContain('getMinutes() + 1')
  })
})
