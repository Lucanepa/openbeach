// A set's printed start is the time of its FIRST RALLY, as in OpenVolley
// (owner 2026-10-08: "both print time of first rally"). The confirmed set
// start (the dialog value) is only the fallback for a set without a rally.
import { describe, it, expect } from 'vitest'
import { matchTimes, setDurationMinutes, setEndMs, setStartMs } from '../../../scoresheet_pdf_beach/components_beach/matchTimes_beach'

const iso = (h, m, s = 0) => new Date(Date.UTC(2026, 9, 8, h, m, s)).toISOString()
const min = (h, m) => Date.UTC(2026, 9, 8, h, m)

// Scheduled 14:30 and kept in the dialog; the first rally was at 16:05
const set1 = { index: 1, startTime: iso(14, 30), endTime: iso(16, 24), finished: true }
const set2 = { index: 2, startTime: iso(16, 27), endTime: iso(16, 45), finished: true }
const events = [
  { type: 'set_start', setIndex: 1, seq: 1, ts: iso(14, 30), payload: { setIndex: 1, startTime: iso(14, 30) } },
  { type: 'rally_start', setIndex: 1, seq: 2, ts: iso(16, 5, 41) },
  { type: 'point', setIndex: 1, seq: 3, ts: iso(16, 6, 10) },
  { type: 'rally_start', setIndex: 1, seq: 4, ts: iso(16, 6, 30) },
  { type: 'set_start', setIndex: 2, seq: 9, ts: iso(16, 27), payload: { setIndex: 2, startTime: iso(16, 27) } },
  { type: 'rally_start', setIndex: 2, seq: 10, ts: iso(16, 28, 2) },
  { type: 'point', setIndex: 2, seq: 11, ts: iso(16, 28, 40) }
]

describe('beach set and match times: the first rally', () => {
  it('a set starts at its first rally, not at the confirmed (scheduled) time', () => {
    expect(setStartMs(set1, events)).toBe(min(16, 5))
    expect(setStartMs(set2, events)).toBe(min(16, 28))
    expect(setDurationMinutes(set1, events)).toBe(19)
    expect(setDurationMinutes(set2, events)).toBe(17)
  })

  it('a start corrected after the dialog (edit / corrections) wins over the first rally', () => {
    const edited = { ...set1, startTime: iso(16, 3) }
    expect(setStartMs(edited, events)).toBe(min(16, 3))
    expect(setDurationMinutes(edited, events)).toBe(21)
  })

  it('without the first rally_start (a cloud copy), the first point bounds the start', () => {
    // beach adds the first rally of a set without a sync job: a match read
    // back from the server lacks it, its second rally is not the start
    const cloud = events.filter(e => !(e.type === 'set_start' || (e.type === 'rally_start' && e.seq === 2)))
    expect(setStartMs(set1, cloud)).toBe(min(16, 6))
  })

  it('falls back to the confirmed start, then to the first point', () => {
    expect(setStartMs(set1, [])).toBe(min(14, 30))
    expect(setStartMs({ index: 3 }, [{ type: 'point', setIndex: 3, ts: iso(17, 1, 59) }])).toBe(min(17, 1))
    expect(setStartMs({ index: 3 }, [])).toBeNull()
  })

  it('a set ends at its recorded end, else its last point; unfinished sets have no duration', () => {
    expect(setEndMs(set1, events)).toBe(min(16, 24))
    expect(setEndMs({ index: 3, finished: true }, [{ type: 'point', setIndex: 3, ts: iso(17, 20, 30) }])).toBe(min(17, 20))
    expect(setDurationMinutes({ index: 3, startTime: iso(17, 0) }, [])).toBeNull()
  })

  it('match start = set 1 first rally, end = last set end, duration = end - start', () => {
    expect(matchTimes([set1, set2], events)).toEqual({ startMs: min(16, 5), endMs: min(16, 45), durationMinutes: 40 })
    expect(matchTimes([{ index: 1 }], [])).toEqual({ startMs: null, endMs: null, durationMinutes: null })
  })
})
