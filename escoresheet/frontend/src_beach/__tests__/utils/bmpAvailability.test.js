import { describe, it, expect } from 'vitest'
import { teamBmpBlockReason } from '../../utils_beach/bmpAvailability_beach'

let seq = 0
const ev = (type, setIndex = 1) => ({ type, setIndex, seq: ++seq })

describe('team BMP: only between the point and the next rally', () => {
  it('right after a point it is possible', () => {
    const events = [ev('set_start'), ev('rally_start'), ev('point')]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBeNull()
  })

  it('a sanction or a remark after the point does not close it', () => {
    const events = [ev('set_start'), ev('point'), ev('sanction'), ev('remark')]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBeNull()
  })

  it('after a court switch, before the next rally: greyed', () => {
    const events = [ev('set_start'), ev('point'), ev('court_switch')]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('moved_on')
  })

  it('after a technical time-out or a time-out: greyed', () => {
    expect(teamBmpBlockReason({ events: [ev('point'), ev('technical_to')], setIndex: 1 })).toBe('moved_on')
    expect(teamBmpBlockReason({ events: [ev('point'), ev('timeout')], setIndex: 1 })).toBe('moved_on')
  })

  it('after a BMP on the same point: greyed', () => {
    expect(teamBmpBlockReason({ events: [ev('point'), ev('challenge'), { type: 'challenge_outcome', setIndex: 1, seq: seq + 0.1 }], setIndex: 1 })).toBe('moved_on')
  })

  it('after a successful BMP (its point is a sub-event of the request): greyed', () => {
    const p = ev('point')
    const req = ev('challenge')
    const events = [p, req,
      { type: 'challenge_outcome', setIndex: 1, seq: req.seq + 0.1, payload: { result: 'successful' } },
      { type: 'point', setIndex: 1, seq: req.seq + 0.2, payload: { team: 'team2', fromBMP: true, reversedTeam: 'team1' } }]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('moved_on')
  })

  it('after a referee BMP that awarded the point: greyed', () => {
    const p = ev('point')
    const req = ev('referee_bmp_request')
    const events = [p, req,
      { type: 'referee_bmp_outcome', setIndex: 1, seq: req.seq + 0.1, payload: { result: 'in' } },
      { type: 'point', setIndex: 1, seq: req.seq + 0.2, payload: { team: 'team1', fromBMP: true } }]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('moved_on')
  })

  it('a penalty point ends no rally: no BMP on it', () => {
    const events = [ev('point'), ev('sanction'), { ...ev('point'), payload: { team: 'team2', fromPenalty: true } }]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('moved_on')
  })

  it('while the rally is in play, or once the next rally started: greyed', () => {
    expect(teamBmpBlockReason({ events: [ev('point')], setIndex: 1, rallyStatus: 'in_play' })).toBe('rally')
    expect(teamBmpBlockReason({ events: [ev('point'), ev('rally_start')], setIndex: 1 })).toBe('moved_on')
  })

  it('before the first point of the set: greyed (the last set\'s points do not count)', () => {
    const events = [ev('point', 1), ev('set_end', 1), ev('set_start', 2)]
    expect(teamBmpBlockReason({ events, setIndex: 2 })).toBe('no_point')
  })

  it('set over and exhausted', () => {
    expect(teamBmpBlockReason({ events: [ev('point')], setIndex: 1, setFinished: true })).toBe('set_over')
    expect(teamBmpBlockReason({ events: [ev('point')], setIndex: 1, remaining: 0 })).toBe('exhausted')
  })
})
