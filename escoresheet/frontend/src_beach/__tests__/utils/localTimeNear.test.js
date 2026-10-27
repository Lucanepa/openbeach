import { describe, it, expect } from 'vitest'
import { localTimeNear, parseLocalDateTimeToISO } from '../../utils_beach/timeUtils_beach'

// The set end time in the hour the clocks go back (Europe/Zurich, 25.10.2026:
// 02:00-02:59 twice). The dialog proposes the time as local HH:MM and its
// Confirm turned it back into an instant with new Date('2026-10-25T02:05'),
// the first (summer time) 02:05: confirmed as proposed at 02:05 CET, the end
// was stored an hour early, before the set's start (stress test 2026-10-25,
// 2/2 runs). The reading nearest the proposed time is taken.
process.env.TZ = 'Europe/Zurich'

describe('localTimeNear: a local HH:MM, the instant nearest the proposed one', () => {
  it('02:05 proposed at 02:05 CET (01:05Z) is 01:05Z, not the 02:05 CEST an hour before', () => {
    expect(localTimeNear('2026-10-25T01:05:00.000Z', '02:05')).toBe('2026-10-25T01:05:00.000Z')
  })

  it('02:05 proposed in the first 02:00-02:59 (summer time) stays there', () => {
    expect(localTimeNear('2026-10-25T00:05:00.000Z', '02:05')).toBe('2026-10-25T00:05:00.000Z')
  })

  it('a typed time near the proposed one, in the repeated hour', () => {
    // proposed 02:10 CET (01:10Z), typed 02:08: two minutes earlier
    expect(localTimeNear('2026-10-25T01:10:00.000Z', '02:08')).toBe('2026-10-25T01:08:00.000Z')
  })

  it('a time the clocks skip (29.03.2026, 02:00-02:59 do not exist) is read as before, it does not throw', () => {
    // threw "Reduce of empty array with no initial value": the set end
    // dialog's Confirm stayed dead until the time was changed
    expect(localTimeNear('2026-03-29T00:40:00.000Z', '02:30')).toBe(parseLocalDateTimeToISO('2026-03-29', '02:30'))
    expect(localTimeNear('2027-03-28T01:10:00.000Z', '02:30')).toBe(parseLocalDateTimeToISO('2027-03-28', '02:30'))
  })

  it('any other day: the local time as before, to the minute', () => {
    expect(localTimeNear('2026-10-26T10:41:37.123Z', '11:41')).toBe('2026-10-26T10:41:00.000Z')
    expect(localTimeNear('2026-07-01T10:41:00.000Z', '12:45')).toBe('2026-07-01T10:45:00.000Z')
  })
})
