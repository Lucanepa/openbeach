import { describe, it, expect } from 'vitest'
import { courtChangeEvery, hasTechnicalTimeout, nextCourtEvents, TTO_TOTAL } from '../../utils_beach/courtRhythm_beach'

describe('courtRhythm_beach (the scoring screen and the phone line)', () => {
  it('changes of courts every 7 points in sets 1-2, every 5 in set 3; the TTO at 21 in sets 1-2 only', () => {
    expect(courtChangeEvery(1)).toBe(7)
    expect(courtChangeEvery(2)).toBe(7)
    expect(courtChangeEvery(3)).toBe(5)
    expect(hasTechnicalTimeout(1)).toBe(true)
    expect(hasTechnicalTimeout(3)).toBe(false)
    expect(TTO_TOTAL).toBe(21)
  })

  it('what comes next', () => {
    expect(nextCourtEvents(1, 0)).toEqual({ switchIn: 7, ttoIn: 21 })
    expect(nextCourtEvents(1, 6)).toEqual({ switchIn: 1, ttoIn: 15 })
    expect(nextCourtEvents(1, 7)).toEqual({ switchIn: 7, ttoIn: 14 })
    expect(nextCourtEvents(2, 21)).toEqual({ switchIn: 7, ttoIn: null })
    expect(nextCourtEvents(3, 4)).toEqual({ switchIn: 1, ttoIn: null })
    expect(nextCourtEvents(3, 5)).toEqual({ switchIn: 5, ttoIn: null })
  })
})
