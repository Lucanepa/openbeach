// The beach corrections planners (utils_beach/corrections_beach.js): where a
// new time-out or sanction goes, the beach rules they check (one time-out per
// team per set, the delay scale 16.2, misconduct 21.3, sets to 21 / 15) and
// what a removal takes with it. Ported in spirit from OpenVolley
// src/domain/__tests__/manualCorrections.test.js.
import { describe, it, expect } from 'vitest'
import {
  scoreTimeline, insertionAt, planAddTimeout, planRemoveTimeout, planAddSanction, planRemoveSanction,
  planEditEvent, planMoveEvent, planAdjustFinalScore, planSetTimes, planRemoveGroup, planRemark, planRemoveRemark,
  applyPlanToEvents, describeEvent, describeRemoval, isRemovableEntry, isValidFinalScore, setWinnerAt,
  expectedTeamSanction, errorText, formatScore
} from '../../utils_beach/corrections_beach'

const ctx = (extra = {}) => ({
  t: null,
  matchId: 1,
  match: { coinTossTeamA: 'team1' },
  team1Team: { name: 'Müller / Weber' },
  team2Team: { name: 'Rossi / Bianchi' },
  mode: 'live',
  liveSetIndex: 1,
  ...extra
})

// A set from a string of winners ('1122...'), each point after its rally
// start; court switches every 7 points (5 in set 3), a set end when `end`.
function buildSet(winners, { setIndex = 1, startSeq = 1, startId = 1, end = false } = {}) {
  const events = []
  let seq = startSeq
  let id = startId
  const score = { team1: 0, team2: 0 }
  const every = setIndex >= 3 ? 5 : 7
  events.push({ id: id++, matchId: 1, setIndex, type: 'set_start', seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload: {} })
  for (const w of winners) {
    const team = w === '1' ? 'team1' : 'team2'
    events.push({ id: id++, matchId: 1, setIndex, type: 'rally_start', seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload: {} })
    score[team]++
    events.push({ id: id++, matchId: 1, setIndex, type: 'point', seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload: { team, score: { ...score } } })
    if ((score.team1 + score.team2) % every === 0) {
      events.push({ id: id++, matchId: 1, setIndex, type: 'court_switch', seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload: {} })
    }
  }
  if (end) events.push({ id: id++, matchId: 1, setIndex, type: 'set_end', seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload: { ...score } })
  return { events, nextSeq: seq, nextId: id, score }
}

const idxOf = (events, setIndex, team1, team2) => scoreTimeline(events, setIndex).find(e => e.team1 === team1 && e.team2 === team2).index

describe('timeline and insertion', () => {
  it('lists the scores of the set in order and puts a new event right after its score, renumbering the rest', () => {
    const { events } = buildSet('121')
    const tl = scoreTimeline(events, 1)
    expect(tl.map(e => `${e.team1}:${e.team2}`)).toEqual(['0:0', '1:0', '1:1', '2:1'])
    const ins = insertionAt(events, 1, 1, tl)
    // after point 1 (seq 3), before the next rally start (seq 4)
    expect(ins.seq).toBe(4)
    expect(ins.renumber.map(r => r.seq)).toEqual([5, 6, 7, 8])
  })
})

describe('time-outs (one per team per set)', () => {
  it('adds a time-out at 1:0 with an integer seq and shifts what follows', () => {
    const { events } = buildSet('121')
    const plan = planAddTimeout(events, { setIndex: 1, team: 'team2', at: 1 }, ctx())
    expect(plan.error).toBeUndefined()
    expect(plan.add).toHaveLength(1)
    expect(plan.add[0]).toMatchObject({ type: 'timeout', setIndex: 1, seq: 4, payload: { team: 'team2' } })
    const after = applyPlanToEvents(events, plan)
    expect(after.map(e => e.seq)).toEqual([...after.map(e => e.seq)].sort((a, b) => a - b))
    expect(new Set(after.map(e => e.seq)).size).toBe(after.length)
    expect(plan.log.text).toBe('Added: Time-out · Rossi / Bianchi (B) · Set 1 · B 0:1 A')
  })

  it('refuses a second time-out of the same team in the set', () => {
    const { events } = buildSet('121')
    const first = applyPlanToEvents(events, planAddTimeout(events, { setIndex: 1, team: 'team1', at: 1 }, ctx()))
    const second = planAddTimeout(first, { setIndex: 1, team: 'team1', at: 2 }, ctx())
    expect(second.error).toBe('corrections.error.timeoutLimit')
    expect(errorText(second, null)).toMatch(/one per team per set/)
    // the other team still has its own
    expect(planAddTimeout(first, { setIndex: 1, team: 'team2', at: 2 }, ctx()).error).toBeUndefined()
  })

  it('removes and moves a time-out', () => {
    const { events } = buildSet('121')
    const withTo = applyPlanToEvents(events, planAddTimeout(events, { setIndex: 1, team: 'team1', at: 1 }, ctx())).map((e, i) => ({ ...e, id: e.id ?? i + 100 }))
    const to = withTo.find(e => e.type === 'timeout')
    expect(planRemoveTimeout(withTo, to.id, ctx()).remove).toEqual([to.id])
    const moved = planMoveEvent(withTo, to.id, { setIndex: 1, at: 3 }, ctx())
    expect(moved.error).toBeUndefined()
    const after = applyPlanToEvents(withTo, moved)
    const row = after.find(e => e.id === to.id)
    expect(row.type).toBe('timeout')
    expect(describeEvent(row, after, ctx()).meta).toBe('Set 1 · A 2:1 B')
  })
})

describe('team sanctions: the delay scale (16.2) and improper requests (16.1)', () => {
  it('the first delay is a delay warning, every further one a delay penalty', () => {
    expect(expectedTeamSanction('delay_penalty', [], 'team1')).toBe('delay_warning')
    const dw = [{ type: 'sanction', payload: { team: 'team1', type: 'delay_warning' } }]
    expect(expectedTeamSanction('delay_warning', dw, 'team1')).toBe('delay_penalty')
    expect(expectedTeamSanction('delay_penalty', [...dw, { type: 'sanction', payload: { team: 'team1', type: 'delay_penalty' } }], 'team1')).toBe('delay_penalty')
    // the other team's delays do not count
    expect(expectedTeamSanction('delay_warning', dw, 'team2')).toBe('delay_warning')
    // a repeated improper request is a delay
    const ir = [{ type: 'sanction', payload: { team: 'team2', type: 'improper_request' } }]
    expect(expectedTeamSanction('improper_request', ir, 'team2')).toBe('delay_warning')
  })

  it('live: a delay penalty without the warning first is refused; at the match end it is a note', () => {
    const { events } = buildSet('1212')
    const live = planAddSanction(events, { setIndex: 1, team: 'team1', type: 'delay_penalty', at: 1 }, ctx())
    expect(live.error).toBe('corrections.error.ladder')
    const review = planAddSanction(events, { setIndex: 1, team: 'team1', type: 'delay_penalty', at: 1 }, ctx({ mode: 'review' }))
    expect(review.error).toBeUndefined()
    expect(review.notes.map(n => n.key)).toContain('corrections.note.ladder')
  })

  it('a delay penalty makes the opponent\'s next point the circled penalty point', () => {
    // 1:0, then team2 scores (1:1)
    const { events } = buildSet('1212')
    const withDw = applyPlanToEvents(events, planAddSanction(events, { setIndex: 1, team: 'team1', type: 'delay_warning', at: 0 }, ctx()))
      .map((e, i) => ({ ...e, id: e.id ?? 500 + i }))
    const plan = planAddSanction(withDw, { setIndex: 1, team: 'team1', type: 'delay_penalty', at: idxOf(withDw, 1, 1, 0) }, ctx())
    expect(plan.error).toBeUndefined()
    const point = withDw.find(e => e.type === 'point' && e.payload.score.team1 === 1 && e.payload.score.team2 === 1)
    expect(plan.update.find(u => u.id === point.id).changes.payload).toMatchObject({ team: 'team2', fromPenalty: true })
    expect(plan.notes[0].text).toBe('Rossi / Bianchi\'s point at B 1:1 A becomes the circled penalty point.')
  })

  it('a penalty with no later opponent point in the set is refused', () => {
    const { events } = buildSet('11')
    const plan = planAddSanction(events, { setIndex: 1, team: 'team1', type: 'delay_warning', at: 2 }, ctx())
    expect(plan.error).toBeUndefined()
    const withDw = applyPlanToEvents(events, plan).map((e, i) => ({ ...e, id: e.id ?? 600 + i }))
    expect(planAddSanction(withDw, { setIndex: 1, team: 'team1', type: 'delay_penalty', at: 2 }, ctx()).error).toBe('corrections.error.noLaterOpponentPoint')
  })
})

describe('misconduct (21.3)', () => {
  const pen = (n, setIndex = 1) => ({ id: 900 + n * 10 + setIndex, matchId: 1, setIndex, type: 'sanction', seq: 0.5, payload: { team: 'team1', type: 'penalty', playerType: 'player', playerNumber: n } })

  it('a third penalty of a player in one set is an expulsion: refused live, a note at the match end', () => {
    const { events } = buildSet('1222')
    const prior = [pen(1), { ...pen(1), id: 999 }]
    const all = [...prior, ...events]
    const live = planAddSanction(all, { setIndex: 1, team: 'team1', type: 'penalty', target: { playerNumber: 1 }, at: 1 }, ctx())
    expect(live.error).toBe('corrections.error.thirdPenalty')
    const review = planAddSanction(all, { setIndex: 1, team: 'team1', type: 'penalty', target: { playerNumber: 1 }, at: 1 }, ctx({ mode: 'review' }))
    expect(review.error).toBeUndefined()
    expect(review.notes.map(n => n.key)).toContain('corrections.note.thirdPenalty')
    // the other player, or the same player in another set, is fine
    expect(planAddSanction(all, { setIndex: 1, team: 'team1', type: 'penalty', target: { playerNumber: 2 }, at: 1 }, ctx()).error).toBeUndefined()
  })

  it('one misconduct warning per team per match; never the same sanction twice for a player', () => {
    const { events } = buildSet('12')
    const warned = [{ id: 950, matchId: 1, setIndex: 1, type: 'sanction', seq: 0.5, payload: { team: 'team2', type: 'warning', playerType: 'player', playerNumber: 1 } }, ...events]
    expect(planAddSanction(warned, { setIndex: 1, team: 'team2', type: 'warning', target: { playerNumber: 2 }, at: 1 }, ctx()).error).toBe('corrections.error.teamAlreadyWarned')
    expect(planAddSanction(warned, { setIndex: 1, team: 'team2', type: 'warning', target: { playerNumber: 1 }, at: 1 }, ctx()).error).toBe('corrections.error.sameSanctionTwice')
    expect(planAddSanction(warned, { setIndex: 1, team: 'team1', type: 'warning', target: { playerNumber: 1 }, at: 1 }, ctx()).error).toBeUndefined()
  })

  it('an expulsion or a disqualification is given on the scoreboard (it forfeits)', () => {
    const { events } = buildSet('12')
    for (const type of ['expulsion', 'disqualification']) {
      expect(planAddSanction(events, { setIndex: 1, team: 'team1', type, target: { playerNumber: 1 }, at: 1 }, ctx({ mode: 'review' })).error).toBe('corrections.error.forfeitOnScoreboard')
    }
  })

  it('a misconduct sanction needs a player (or the coach)', () => {
    const { events } = buildSet('12')
    expect(planAddSanction(events, { setIndex: 1, team: 'team1', type: 'warning', at: 1 }, ctx()).error).toBe('corrections.error.choosePlayer')
    expect(planAddSanction(events, { setIndex: 1, team: 'team1', type: 'warning', target: { role: 'coach' }, at: 1 }, ctx()).add[0].payload).toMatchObject({ role: 'coach', playerType: 'official' })
  })
})

describe('removing a sanction', () => {
  function withPenalty() {
    const { events } = buildSet('12')
    const sanction = { id: 700, matchId: 1, setIndex: 1, type: 'sanction', seq: 4, payload: { team: 'team1', type: 'penalty', playerType: 'player', playerNumber: 1 } }
    // the opponent's point after it is the penalty point
    const all = events.map(e => (e.seq >= 4 ? { ...e, seq: e.seq + 1 } : e))
    const point = all.find(e => e.type === 'point' && e.payload.team === 'team2')
    point.payload = { ...point.payload, fromPenalty: true }
    return { all: [...all, sanction].sort((a, b) => a.seq - b.seq), sanction, point }
  }

  it('the point stays, no longer circled', () => {
    const { all, sanction, point } = withPenalty()
    const plan = planRemoveSanction(all, sanction.id, {}, ctx())
    expect(plan.remove).toEqual([sanction.id])
    expect(plan.update).toEqual([{ id: point.id, changes: { payload: { team: 'team2', score: point.payload.score } } }])
    expect(plan.notes.map(n => n.key)).toContain('corrections.note.pointStays')
  })

  it('live, while it is the last point of the set being played, the point can go too (as Undo)', () => {
    const { all, sanction, point } = withPenalty()
    const plan = planRemoveSanction(all, sanction.id, { removePoint: true }, ctx())
    expect(plan.remove).toEqual(expect.arrayContaining([sanction.id, point.id]))
    expect(plan.affectedSets).toEqual([1])
    expect(planRemoveSanction(all, sanction.id, { removePoint: true }, ctx({ mode: 'review' })).error).toBe('corrections.error.removePointNotLast')
  })

  it('an expulsion is not removed here', () => {
    const ev = { id: 1, matchId: 1, setIndex: 1, type: 'sanction', seq: 1, payload: { team: 'team1', type: 'expulsion', playerNumber: 1 } }
    expect(planRemoveSanction([ev], 1, {}, ctx()).error).toBe('corrections.error.useUndo')
    expect(isRemovableEntry(ev)).toBe(false)
  })
})

describe('final score of a finished set (21 / 15, two points ahead)', () => {
  it('knows the beach final scores', () => {
    expect(isValidFinalScore(21, 19, 1)).toBe(true)
    expect(isValidFinalScore(21, 20, 1)).toBe(false)
    expect(isValidFinalScore(23, 21, 2)).toBe(true)
    expect(isValidFinalScore(24, 21, 2)).toBe(false)
    expect(isValidFinalScore(15, 13, 3)).toBe(true)
    expect(isValidFinalScore(21, 15, 3)).toBe(false)
    expect(setWinnerAt({ team1: 15, team2: 12 }, 3)).toBe('team1')
    expect(setWinnerAt({ team1: 15, team2: 12 }, 1)).toBeNull()
  })

  it('a missed point of the loser goes in just before the winning point', () => {
    // 21:17 for team1
    const { events } = buildSet('2222' + '1'.repeat(13) + '2'.repeat(13).slice(0, 13).replace(/2/g, '') + '1'.repeat(8), { end: true })
    const score = scoreTimeline(events, 1).at(-1)
    expect(score.team1).toBe(21)
    expect(score.team2).toBe(4)
    const sets = [{ index: 1, finished: true, team1Points: 21, team2Points: 4 }]
    const plan = planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team2', delta: 1 }, ctx({ mode: 'review' }))
    expect(plan.error).toBeUndefined()
    const after = applyPlanToEvents(events, plan)
    const points = after.filter(e => e.type === 'point')
    expect(points.at(-1).payload.team).toBe('team1')
    expect(points.at(-2)).toMatchObject({ payload: { team: 'team2', score: { team1: 20, team2: 5 } } })
    expect(plan.affectedSets).toEqual([1])
  })

  it('refuses a score that changes the winner or is not a final score', () => {
    const { events } = buildSet('2' + '1'.repeat(21), { end: true })
    const sets = [{ index: 1, finished: true }]
    // 22:1 is not a final score
    expect(planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team1', delta: 1 }, ctx()).error).toBe('corrections.error.invalidFinalScore')
    // 20:1: nobody won
    expect(planAdjustFinalScore(events, sets, { setIndex: 1, team: 'team1', delta: -1 }, ctx()).error).toBe('corrections.error.winnerWouldChange')
    // a set being played
    expect(planAdjustFinalScore(buildSet('12').events, [{ index: 1 }], { setIndex: 1, team: 'team1', delta: 1 }, ctx()).error).toBe('corrections.error.setNotFinished')
  })

  it('the third set is to 15', () => {
    const { events } = buildSet('2' + '1'.repeat(15), { setIndex: 3, end: true })
    const sets = [{ index: 3, finished: true }]
    const minus = planAdjustFinalScore(events, sets, { setIndex: 3, team: 'team2', delta: -1 }, ctx())
    expect(minus.error).toBe('corrections.error.notLastPoint')
    const plus = planAdjustFinalScore(events, sets, { setIndex: 3, team: 'team2', delta: 1 }, ctx())
    expect(plus.error).toBeUndefined()
  })
})

describe('advanced: one entry of the log', () => {
  it('a point mid-set takes its rally start; later changes of courts are not moved (a note)', () => {
    const { events } = buildSet('1212121')
    const point = events.find(e => e.type === 'point' && e.payload.score.team1 === 1 && e.payload.score.team2 === 0)
    const plan = planRemoveGroup(events, point.id, ctx())
    expect(plan.remove).toHaveLength(2)
    expect(plan.remove).toContain(point.id)
    expect(plan.notes.map(n => n.key)).toContain('corrections.note.courtSwitches')
    expect(describeRemoval(events, plan, ctx())).toEqual(['Rally start · Set 1 · A 0:0 B', 'Point · Müller / Weber (A) · Set 1 · A 1:0 B'])
  })

  it('a change of courts or a set end is corrected with Undo / Reopen set', () => {
    const { events } = buildSet('1212121', { end: true })
    for (const type of ['court_switch', 'set_end', 'set_start']) {
      const ev = events.find(e => e.type === type)
      expect(planRemoveGroup(events, ev.id, ctx()).error).toBe('corrections.error.useUndo')
      expect(isRemovableEntry(ev)).toBe(false)
    }
  })
})

describe('edit, set times, remarks', () => {
  it('editing a sanction keeps its row (an update), re-checked as a new entry', () => {
    const { events } = buildSet('1212')
    const added = applyPlanToEvents(events, planAddSanction(events, { setIndex: 1, team: 'team1', type: 'delay_warning', at: 1 }, ctx()))
      .map((e, i) => ({ ...e, id: e.id ?? 800 + i }))
    const dw = added.find(e => e.type === 'sanction')
    const plan = planEditEvent(added, dw.id, { team: 'team2' }, ctx())
    expect(plan.error).toBeUndefined()
    expect(plan.add).toHaveLength(0)
    expect(plan.remove).toHaveLength(0)
    expect(plan.update.find(u => u.id === dw.id).changes.payload).toEqual({ team: 'team2', type: 'delay_warning' })
    expect(plan.log.text).toMatch(/^Changed: Delay warning · Rossi \/ Bianchi \(B\)/)
  })

  it('set times: an end before the start is refused; the set_end follows', () => {
    const { events } = buildSet('11', { end: true })
    const sets = [{ index: 1, startTime: '2026-10-08T10:00:00.000Z', endTime: '2026-10-08T10:20:00.000Z' }]
    expect(planSetTimes(events, sets, { setIndex: 1, endTime: '2026-10-08T09:00:00.000Z' }, ctx()).error).toBe('corrections.error.endBeforeStart')
    const plan = planSetTimes(events, sets, { setIndex: 1, endTime: '2026-10-08T10:25:00.000Z' }, ctx({ mode: 'review' }))
    expect(plan.setUpdates).toEqual([{ setIndex: 1, changes: { endTime: '2026-10-08T10:25:00.000Z' } }])
    expect(plan.update[0].changes.payload.endTime).toBe('2026-10-08T10:25:00.000Z')
    expect(plan.log.text).toBe('Set 1 times corrected (entered after the match)')
  })

  it('remarks: add, edit one line, remove one line', () => {
    expect(planRemark('', { text: 'Ball changed' }, ctx()).remarkAdd).toEqual(['Ball changed'])
    expect(planRemark('a\nb', { text: 'c', index: 1 }, ctx()).remarksSet).toBe('a\nc')
    expect(planRemoveRemark('a\nb', 0, ctx()).remarksSet).toBe('b')
    expect(planRemark('a', { text: '  ' }, ctx()).error).toBe('corrections.error.noScoreChange')
  })

  it('scores are written with the letters, the chosen team first', () => {
    expect(formatScore({ team1: 10, team2: 12 }, 'team2', ctx())).toBe('B 12:10 A')
    expect(formatScore({ team1: 10, team2: 12 }, null, ctx({ match: { coinTossTeamA: 'team2' } }))).toBe('A 12:10 B')
  })
})
