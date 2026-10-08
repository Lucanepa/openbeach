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
    expect(teamBmpBlockReason({ events: [ev('point'), ev('challenge'), { type: 'challenge_outcome', setIndex: 1, seq: seq + 0.1 }], setIndex: 1 })).toBe('bmp_taken')
  })

  it('after a successful BMP (its point is a sub-event of the request): greyed', () => {
    const p = ev('point')
    const req = ev('challenge')
    const events = [p, req,
      { type: 'challenge_outcome', setIndex: 1, seq: req.seq + 0.1, payload: { result: 'successful' } },
      { type: 'point', setIndex: 1, seq: req.seq + 0.2, payload: { team: 'team2', fromBMP: true, reversedTeam: 'team1' } }]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('bmp_taken')
  })

  it('after a referee BMP that awarded the point: greyed', () => {
    const p = ev('point')
    const req = ev('referee_bmp_request')
    const events = [p, req,
      { type: 'referee_bmp_outcome', setIndex: 1, seq: req.seq + 0.1, payload: { result: 'in' } },
      { type: 'point', setIndex: 1, seq: req.seq + 0.2, payload: { team: 'team1', fromBMP: true } }]
    expect(teamBmpBlockReason({ events, setIndex: 1 })).toBe('bmp_taken')
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

// The owner, 2026-10-08: "there has to be a completed rally, otherwise no".
// One BMP per completed rally, whoever asked and whatever its outcome.
describe('BMP: once per completed rally', () => {
  // a rally and its point
  const rally = (team = 'team1', setIndex = 1) => [ev('rally_start', setIndex), { ...ev('point', setIndex), payload: { team } }]
  // a team BMP with its outcome (a sub-event of the request)
  const teamBmp = (team, result = 'unsuccessful', setIndex = 1) => {
    const req = { ...ev('challenge', setIndex), payload: { team } }
    const out = [{ type: 'challenge_outcome', setIndex, seq: req.seq + 0.1, payload: { team, result } }]
    if (result === 'successful') out.push({ type: 'point', setIndex, seq: req.seq + 0.2, payload: { team, fromBMP: true } })
    return [req, ...out]
  }
  // a referee BMP that decided the rally in play
  const refereeBmp = (pointTo = 'team1', setIndex = 1) => {
    const req = ev('referee_bmp_request', setIndex)
    return [ev('rally_start', setIndex), req,
      { type: 'referee_bmp_outcome', setIndex, seq: req.seq + 0.1, payload: { result: 'in', pointToTeam: pointTo } },
      { type: 'point', setIndex, seq: req.seq + 0.2, payload: { team: pointTo, fromBMP: true } }]
  }
  const reason = (events, extra = {}) => teamBmpBlockReason({ events, setIndex: 1, ...extra })

  it('after a completed rally: allowed', () => {
    expect(reason([ev('set_start'), ...rally()])).toBeNull()
  })

  it('set start, no rally completed in this set yet: not available', () => {
    expect(reason([ev('set_start')])).toBe('no_point')
    expect(reason([ev('set_start'), ev('rally_start')], { rallyStatus: 'in_play' })).toBe('rally')
  })

  it('a second BMP on the same rally is refused: the same team, the other team, any outcome', () => {
    for (const result of ['unsuccessful', 'successful', 'judgment_impossible']) {
      const events = [ev('set_start'), ...rally('team1'), ...teamBmp('team2', result)]
      expect(reason(events), result).toBe('bmp_taken')
    }
  })

  it('a team BMP after a referee BMP on that rally is refused', () => {
    expect(reason([ev('set_start'), ...rally(), ...refereeBmp('team2')])).toBe('bmp_taken')
  })

  it('allowed again once the next rally is completed (two BMPs one rally apart)', () => {
    const events = [ev('set_start'), ...rally('team1'), ...teamBmp('team2'), ...rally('team1')]
    expect(reason(events)).toBeNull()
    // and the referee BMP's rally is followed by one more completed rally
    expect(reason([ev('set_start'), ...rally(), ...refereeBmp('team2'), ...rally('team1')])).toBeNull()
  })

  it('still greyed during the next rally, after a replay and after a court switch', () => {
    const base = [ev('set_start'), ...rally('team1'), ...teamBmp('team2')]
    expect(reason([...base, ev('rally_start')], { rallyStatus: 'in_play' })).toBe('rally')
    // a replayed rally completes none: the BMP's rally is still the last one
    expect(reason([...base, ev('rally_start'), ev('replay')])).toBe('bmp_taken')
    expect(reason([ev('set_start'), ...rally(), ev('court_switch')])).toBe('moved_on')
  })

  it('an undone BMP gives it back; an undone or replayed point takes it away (read from the events)', () => {
    // built in seq order: the events sort by seq
    const head = [ev('set_start'), ...rally('team2')]
    const point = rally('team1')
    const bmp = teamBmp('team2')
    const events = [...head, ...point, ...bmp]
    expect(reason(events)).toBe('bmp_taken')
    // Undo of the BMP: its request and outcome are gone
    expect(reason(events.filter(e => !bmp.includes(e)))).toBeNull()
    // Undo of the point back to the rally in play
    const noPoint = [...head, point[0]]
    expect(reason(noPoint, { rallyStatus: 'in_play' })).toBe('rally')
    // Decision change "replay": the point goes, a replay is logged
    expect(reason([...noPoint, ev('replay')])).toBe('moved_on')
  })

  it('another set\'s BMP does not count, and the set\'s own first rally opens it', () => {
    const events = [...rally('team1', 1), ...teamBmp('team2', 'unsuccessful', 1), ev('set_end', 1), ev('set_start', 2), ...rally('team1', 2)]
    expect(teamBmpBlockReason({ events, setIndex: 2 })).toBeNull()
  })

  // The owner, 2026-10-08: after a decision change gives the rally's point to
  // the other team, a BMP may be asked on that rally ("yes") - still once per
  // rally. A decision change that replays the rally completes none: no BMP.
  describe('after a decision change', () => {
    let ids = 1000
    // a rally whose point has an id (the decision change names it)
    const rallyWithId = (team = 'team1') => {
      const [start, point] = rally(team)
      return [start, { ...point, id: ++ids }]
    }
    // (events sort by seq: each test logs them in order, set start first)
    // the decision change "Assign to other team": the point keeps its event,
    // its team swapped; the decision_change names it
    const swap = (rallyEvents) => {
      const point = rallyEvents[rallyEvents.length - 1]
      const from = point.payload.team
      const to = from === 'team1' ? 'team2' : 'team1'
      point.payload = { ...point.payload, team: to, swappedFrom: from }
      return { ...ev('decision_change'), payload: { reason: 'point_swap', pointEventId: point.id, fromTeam: from, toTeam: to } }
    }

    it('the point given to the other team: a BMP on that rally is allowed', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      expect(reason([s, ...r, swap(r)])).toBeNull()
    })

    it('a decision change logged without the point it swapped (older matches): allowed', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      const dc = swap(r)
      delete dc.payload.pointEventId
      expect(reason([s, ...r, dc])).toBeNull()
    })

    it('still once per rally: a BMP before the decision change, or after it, closes it', () => {
      const s1 = ev('set_start')
      const r1 = rallyWithId('team1')
      const before = teamBmp('team2')
      expect(reason([s1, ...r1, ...before, swap(r1)])).toBe('bmp_taken')
      const s2 = ev('set_start')
      const r2 = rallyWithId('team1')
      const dc = swap(r2)
      expect(reason([s2, ...r2, dc, ...teamBmp('team1')])).toBe('bmp_taken')
    })

    it('a decision change on a successful BMP\'s point: that rally already had its BMP', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      const bmp = teamBmp('team2', 'successful')
      const bmpPoint = { ...bmp[bmp.length - 1], id: ++ids }
      bmp[bmp.length - 1] = bmpPoint
      expect(reason([s, ...r, ...bmp, swap([bmpPoint])])).toBe('bmp_taken')
    })

    it('greyed again once the game moves on: the next rally, a time-out', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      const events = [s, ...r, swap(r)]
      expect(reason([...events, ev('rally_start')], { rallyStatus: 'in_play' })).toBe('rally')
      expect(reason([...events, ev('rally_start')])).toBe('moved_on')
      expect(reason([...events, ev('timeout')])).toBe('moved_on')
    })

    it('the decision change "replay the rally": the point is gone, no completed rally, no BMP', () => {
      const head = [ev('set_start'), ...rallyWithId('team2')]
      const [start] = rallyWithId('team1')
      // the replayed point is deleted, a replay is logged
      expect(reason([...head, start, ev('replay')])).toBe('moved_on')
      expect(reason([ev('set_start'), ev('rally_start'), ev('replay')])).toBe('no_point')
    })

    it('a decision change on a penalty point opens nothing (it ended no rally)', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      const penalty = { ...ev('point'), id: ++ids, payload: { team: 'team2', fromPenalty: true } }
      expect(reason([s, ...r, ev('sanction'), penalty, swap([penalty])])).toBe('moved_on')
    })

    it('from the TTO dialog of the point: offered after the decision change', () => {
      const s = ev('set_start')
      const r = rallyWithId('team1')
      expect(reason([s, ...r, ev('technical_to'), swap(r)], { dialog: true })).toBeNull()
    })
  })

  describe('from the court switch / TTO / set-end dialog of the point', () => {
    it('offered for the rally that just ended, past the TTO / court switch it logged', () => {
      expect(reason([ev('set_start'), ...rally()], { dialog: true })).toBeNull()
      expect(reason([ev('set_start'), ...rally(), ev('technical_to')], { dialog: true })).toBeNull()
      // the set-end dialog: the set may already read finished
      expect(reason([ev('set_start'), ...rally()], { dialog: true, setFinished: true })).toBeNull()
    })

    it('not offered again once a BMP was taken on that rally (the dialog reopens after it)', () => {
      expect(reason([ev('set_start'), ...rally(), ...teamBmp('team2')], { dialog: true })).toBe('bmp_taken')
      expect(reason([ev('set_start'), ...rally(), ev('technical_to'), ...teamBmp('team2')], { dialog: true })).toBe('bmp_taken')
      expect(reason([ev('set_start'), ...rally(), ...refereeBmp('team2')], { dialog: true })).toBe('bmp_taken')
    })

    it('the per-set limit still applies', () => {
      expect(reason([ev('set_start'), ...rally()], { dialog: true, remaining: 0 })).toBe('exhausted')
    })
  })
})
