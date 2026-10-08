import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isLateLiveState,
  newerLiveState,
  isLiveStateNewerThanBundle,
  applyNewerLiveState,
  createLiveStateTracker,
  LIVE_STATE_REORDER_WINDOW_MS,
  LIVE_STATE_MAX_FUTURE_SKEW_MS,
  LIVE_STATE_HOLD_MS
} from '../../utils_beach/liveStateTracker_beach'

// Ported from OpenVolley serverDataSync.relay.test.js (23054276, 570198f3)
// and livescoreFrames.test.js (a351046a), in openbeach's team1 / team2 shape.

const NOW = Date.parse('2026-10-08T12:00:00.000Z')
const at = (ms) => new Date(NOW + ms).toISOString()
const live = (ms, points_a, points_b, extra = {}) => ({ updated_at: at(ms), current_set: 1, points_a, points_b, ...extra })

const bundle = (team1Points, team2Points, extra = {}) => ({
  success: true,
  match: { id: 'match_1', coinTossTeamA: 'team1' },
  sets: [{ index: 1, team1Points, team2Points, finished: false }],
  events: [],
  ...extra
})

describe('isLateLiveState / newerLiveState', () => {
  it('a state a few seconds older is a late copy and is dropped', () => {
    const shown = live(0, 10, 8)
    const late = live(-2000, 9, 8)
    expect(isLateLiveState(shown, late, NOW)).toBe(true)
    expect(newerLiveState(shown, late, NOW)).toBe(shown)
  })

  it('a newer or equally stamped state wins', () => {
    const shown = live(0, 10, 8)
    expect(newerLiveState(shown, live(1000, 11, 8), NOW).points_a).toBe(11)
    const same = live(0, 10, 9)
    expect(newerLiveState(shown, same, NOW)).toBe(same)
  })

  it('a state far behind is a scorer clock that stepped back: taken', () => {
    const shown = live(0, 10, 8)
    const stepped = live(-LIVE_STATE_REORDER_WINDOW_MS - 1000, 11, 8)
    expect(isLateLiveState(shown, stepped, NOW)).toBe(false)
    expect(newerLiveState(shown, stepped, NOW)).toBe(stepped)
  })

  it('a shown state stamped far in the future never blocks later states', () => {
    const shown = live(LIVE_STATE_MAX_FUTURE_SKEW_MS + 30000, 10, 8)
    const next = live(0, 11, 8)
    expect(isLateLiveState(shown, next, NOW)).toBe(false)
  })

  it('one scorer session compares by sequence number, not by the clock', () => {
    const shown = live(0, 10, 8, { _seq: 5, _session: 's1' })
    // The scorer's clock stepped back 10 s, but this is its next state
    const next = live(-10000, 11, 8, { _seq: 6, _session: 's1' })
    expect(newerLiveState(shown, next, NOW)).toBe(next)
    const older = live(5000, 9, 8, { _seq: 4, _session: 's1' })
    expect(newerLiveState(shown, older, NOW)).toBe(shown)
  })

  it('missing states and stamps', () => {
    const s = live(0, 1, 0)
    expect(newerLiveState(null, s)).toBe(s)
    expect(newerLiveState(s, null)).toBe(s)
    expect(newerLiveState(null, null)).toBeNull()
    expect(isLateLiveState({ points_a: 1 }, { points_a: 0 }, NOW)).toBe(false)
  })
})

describe('isLiveStateNewerThanBundle', () => {
  it('match._syncedSeq within the session', () => {
    const b = bundle(10, 8, { match: { _syncedSeq: 5, _syncSession: 's1' } })
    expect(isLiveStateNewerThanBundle(live(0, 11, 8, { _seq: 6, _session: 's1' }), b)).toBe(true)
    expect(isLiveStateNewerThanBundle(live(0, 10, 8, { _seq: 5, _session: 's1' }), b)).toBe(false)
  })

  it('match._syncedAt on the scorer clock', () => {
    const b = bundle(10, 8, { match: { _syncedAt: NOW } })
    expect(isLiveStateNewerThanBundle(live(500, 11, 8), b)).toBe(true)
    expect(isLiveStateNewerThanBundle(live(-500, 10, 8), b)).toBe(false)
  })

  it('without stamps, the live state the bundle carries is its marker', () => {
    const b = bundle(10, 8, { liveState: live(0, 10, 8) })
    expect(isLiveStateNewerThanBundle(live(1000, 11, 8), b)).toBe(true)
    expect(isLiveStateNewerThanBundle(live(-1000, 9, 8), b)).toBe(false)
    expect(isLiveStateNewerThanBundle(b.liveState, b)).toBe(false)
  })

  it('a bundle that says nothing is never older', () => {
    expect(isLiveStateNewerThanBundle(live(1000, 11, 8), bundle(10, 8))).toBe(false)
  })
})

describe('applyNewerLiveState', () => {
  it('puts the newer score on the set it names, team A = team1', () => {
    const b = bundle(10, 8, { liveState: live(0, 10, 8) })
    const out = applyNewerLiveState(b, live(1000, 11, 8))
    expect(out.sets[0]).toMatchObject({ team1Points: 11, team2Points: 8 })
    expect(out.liveState.points_a).toBe(11)
    expect(b.sets[0].team1Points).toBe(10) // not mutated
  })

  it('maps team A to team2 when team2 won the coin toss', () => {
    const b = bundle(8, 10, { match: { coinTossTeamA: 'team2' }, liveState: live(0, 10, 8) })
    const out = applyNewerLiveState(b, live(1000, 11, 8))
    expect(out.sets[0]).toMatchObject({ team1Points: 8, team2Points: 11 })
  })

  it('leaves finished sets and other sets alone, and older states out', () => {
    const b = { ...bundle(21, 15), sets: [{ index: 1, team1Points: 21, team2Points: 15, finished: true }, { index: 2, team1Points: 3, team2Points: 2, finished: false }], liveState: live(0, 3, 2, { current_set: 2 }) }
    expect(applyNewerLiveState(b, live(1000, 4, 2, { current_set: 2 })).sets).toEqual([
      { index: 1, team1Points: 21, team2Points: 15, finished: true },
      { index: 2, team1Points: 4, team2Points: 2, finished: false }
    ])
    expect(applyNewerLiveState(b, live(-1000, 2, 2, { current_set: 2 }))).toBe(b)
  })
})

describe('createLiveStateTracker', () => {
  const clock = () => NOW

  it('a bundle read back before the newest push does not roll the score back', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8, { liveState: live(0, 10, 8) }))
    // The scorer's push for 11:8 arrives
    expect(tracker.liveState(live(1000, 11, 8))).toBe(true)
    // ... then a copy read before it lands (a refetch, or the database read)
    const shown = tracker.bundle(bundle(10, 8, { liveState: live(0, 10, 8) }))
    expect(shown.sets[0]).toMatchObject({ team1Points: 11, team2Points: 8 })
    expect(shown.liveState.points_a).toBe(11)
  })

  it('a re-delivered last bundle shows a newer pushed score at once', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8, { liveState: live(0, 10, 8) }))
    tracker.liveState(live(1000, 10, 9))
    expect(tracker.bundle(tracker.lastBundle).sets[0]).toMatchObject({ team1Points: 10, team2Points: 9 })
  })

  it('a bundle read after the kept state supersedes it (an undo goes back)', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.liveState(live(1000, 11, 8))
    // The scorer undid the point: its next sync carries 10:8 and a newer live state
    const shown = tracker.bundle(bundle(10, 8, { liveState: live(2000, 10, 8) }))
    expect(shown.sets[0]).toMatchObject({ team1Points: 10, team2Points: 8 })
    expect(tracker.newest.points_a).toBe(10)
  })

  it('an older push is late and does not replace the newest', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.liveState(live(1000, 11, 8))
    const late = live(0, 10, 8)
    expect(tracker.isLate(late)).toBe(true)
    expect(tracker.liveState(late)).toBe(false)
    expect(tracker.newest.points_a).toBe(11)
  })

  it('a bundle without a live state keeps the newest one shown', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.liveState(live(1000, 11, 8))
    const shown = tracker.bundle(bundle(11, 8))
    expect(shown.liveState.points_a).toBe(11)
  })

  it('reset forgets the match', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8, { liveState: live(0, 10, 8) }))
    tracker.reset()
    expect(tracker.newest).toBeNull()
    expect(tracker.lastBundle).toBeNull()
  })

  it('failed results pass through', () => {
    const tracker = createLiveStateTracker({ now: clock })
    const failed = { success: false }
    expect(tracker.bundle(failed)).toBe(failed)
    expect(tracker.lastBundle).toBeNull()
  })
})

// Ported from OpenVolley (fix(referee): a point shows its score, server and
// rotation in one update): the score of a newer live state alone, then the
// bundle with the server and the court ~200 ms later, was two changes on the
// referee. tracker.hold waits for the bundle.
describe('tracker.hold: a newer live state waits for the bundle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const clock = () => NOW

  it('a bundle within the hold shows everything at once; the held score is dropped', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8))
    expect(tracker.liveState(live(1000, 11, 8))).toBe(true)
    const shown = vi.fn()
    tracker.hold(shown)
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS - 50)
    tracker.bundle(bundle(11, 8, { liveState: live(1000, 11, 8) }))
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS)
    expect(shown).not.toHaveBeenCalled()
  })

  it('no bundle: the score is shown once the hold is over', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8))
    tracker.liveState(live(1000, 11, 8))
    const shown = vi.fn()
    tracker.hold(shown)
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS - 1)
    expect(shown).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('a second push restarts the hold; reset drops it', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8))
    const first = vi.fn()
    const second = vi.fn()
    tracker.hold(first)
    vi.advanceTimersByTime(200)
    tracker.hold(second)
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    const third = vi.fn()
    tracker.hold(third)
    tracker.reset()
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS)
    expect(third).not.toHaveBeenCalled()
  })

  // The referee's footer (last action) is not in the bundle: dropped with the
  // held score, a database-row point never reached the footer
  it('a bundle that ends the hold runs onBundle once, not apply; the timer does not', () => {
    const tracker = createLiveStateTracker({ now: clock })
    tracker.bundle(bundle(10, 8))
    tracker.liveState(live(1000, 11, 8))
    const shown = vi.fn()
    const withBundle = vi.fn()
    tracker.hold(shown, { onBundle: withBundle })
    tracker.bundle(bundle(11, 8, { liveState: live(1000, 11, 8) }))
    expect(withBundle).toHaveBeenCalledTimes(1)
    tracker.bundle(bundle(11, 8, { liveState: live(1000, 11, 8) }))
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS)
    expect(withBundle).toHaveBeenCalledTimes(1)
    expect(shown).not.toHaveBeenCalled()

    const shownAlone = vi.fn()
    const notWithBundle = vi.fn()
    tracker.liveState(live(2000, 12, 8))
    tracker.hold(shownAlone, { onBundle: notWithBundle })
    vi.advanceTimersByTime(LIVE_STATE_HOLD_MS)
    tracker.bundle(bundle(12, 8, { liveState: live(2000, 12, 8) }))
    expect(shownAlone).toHaveBeenCalledTimes(1)
    expect(notWithBundle).not.toHaveBeenCalled()
  })
})
