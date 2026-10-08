import { describe, it, expect } from 'vitest'
import {
  scoreFromPointEvents,
  planPointRemoval,
  scoreAfterRemoval,
  localIdOfExtId,
  syncJobsForEvents,
  eventDeleteJob,
  eventUpsertJob,
  syncJobsForSets,
  setReopenJob,
  planDecisionChangeReversal
} from '../../utils_beach/scorerCorrections_beach'

// Ported from OpenVolley src/domain/__tests__/corrections.test.js
// (planPointRemoval, syncJobsForEvents), with beach events: team1 / team2,
// no rotation line-ups; a BMP point is a sub-event of its request.

const point = (id, seq, team, setIndex = 1, extra = {}) =>
  ({ id, seq, setIndex, type: 'point', payload: { team, ...extra } })

describe('scoreFromPointEvents', () => {
  it('counts the points of one set', () => {
    const events = [point(1, 1, 'team1'), point(2, 2, 'team2'), point(3, 3, 'team1'), point(4, 4, 'team1', 2)]
    expect(scoreFromPointEvents(events, 1)).toEqual({ team1Points: 2, team2Points: 1 })
    expect(scoreFromPointEvents(events, 2)).toEqual({ team1Points: 1, team2Points: 0 })
  })

  it('a successful team BMP takes the disputed point back from the other team', () => {
    const events = [point(1, 1, 'team1'), point(2, 2, 'team2'), point(31, 3.2, 'team1', 1, { fromBMP: true, reversedTeam: 'team2' })]
    expect(scoreFromPointEvents(events, 1)).toEqual({ team1Points: 2, team2Points: 0 })
  })
})

describe('planPointRemoval (taking back a point recorded in error)', () => {
  // Set 1 at 3:3. Team 2 scores the 7th point (seq 12): a change of courts is
  // due. Before it, team 1 had a time-out (seq 9) and rally_starts.
  const events = [
    { id: 1, seq: 1, setIndex: 1, type: 'set_start', payload: {} },
    point(2, 2, 'team1'), point(3, 3, 'team2'), point(4, 4, 'team1'),
    point(5, 5, 'team2'), point(6, 6, 'team1'), point(7, 7, 'team2'),
    { id: 9, seq: 9, setIndex: 1, type: 'timeout', payload: { team: 'team1' } },
    { id: 11, seq: 11, setIndex: 1, type: 'rally_start', payload: {} },
    point(12, 12, 'team2')
  ]

  it('removes the point, and the score is the score without it', () => {
    const plan = planPointRemoval(events, events.find(e => e.id === 12))
    expect(plan.deleteEventIds).toEqual([12])
    expect(plan.setIndex).toBe(1)
    expect(plan.score).toEqual({ team1Points: 3, team2Points: 3 })
    expect(plan.delta).toEqual({ team1Points: 0, team2Points: 1 })
  })

  it('with includeRallyStart, also the rally_start that opened that rally (like Undo)', () => {
    const plan = planPointRemoval(events, null, { setIndex: 1, includeRallyStart: true })
    expect(plan.deleteEventIds.sort((a, b) => a - b)).toEqual([11, 12])
  })

  it('finds the newest point of the set when no point is given', () => {
    expect(planPointRemoval(events, null, { setIndex: 1 }).pointEventId).toBe(12)
    expect(planPointRemoval(events, null, { setIndex: 3 })).toBeNull()
    expect(planPointRemoval(events, { id: 9, type: 'timeout', seq: 9, setIndex: 1 })).toBeNull()
  })

  it('a point decided by a BMP goes with its request and outcome (the whole group, as Undo)', () => {
    const bmp = [
      ...events,
      { id: 13, seq: 13, setIndex: 1, type: 'challenge', payload: { team: 'team1' } },
      { id: 14, seq: 13.1, setIndex: 1, type: 'challenge_outcome', payload: { team: 'team1', result: 'successful' } },
      point(15, 13.2, 'team1', 1, { fromBMP: true, reversedTeam: 'team2' })
    ]
    const plan = planPointRemoval(bmp, bmp.find(e => e.id === 15))
    expect(plan.deleteEventIds.sort((a, b) => a - b)).toEqual([13, 14, 15])
    // the BMP had moved point 12 from team 2 to team 1: taking it back gives it to team 2 again
    expect(plan.score).toEqual({ team1Points: 3, team2Points: 4 })
    expect(plan.delta).toEqual({ team1Points: 1, team2Points: -1 })
  })
})

describe('scoreAfterRemoval', () => {
  it('subtracts what the removed points added, keeping a manual adjustment', () => {
    expect(scoreAfterRemoval({ team1Points: 5, team2Points: 4 }, { team1Points: 0, team2Points: 1 })).toEqual({ team1Points: 5, team2Points: 3 })
    expect(scoreAfterRemoval({ team1Points: 0, team2Points: 0 }, { team1Points: 1, team2Points: 0 })).toEqual({ team1Points: 0, team2Points: 0 })
  })
})

describe('sync jobs of removed events', () => {
  it('localIdOfExtId reads the namespaced and the bare form', () => {
    expect(localIdOfExtId('match_1_a:e:12', 'event')).toBe('12')
    expect(localIdOfExtId('match_1_a:s:12', 'event')).toBeNull()
    expect(localIdOfExtId('12', 'event')).toBe('12')
    expect(localIdOfExtId('coin_toss_x', 'event')).toBeNull()
  })

  it('syncJobsForEvents finds the unsent jobs of the removed events in either id form', () => {
    const jobs = [
      { id: 1, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'm:e:12' } },
      { id: 2, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: '11' } },
      { id: 3, resource: 'event', action: 'insert', status: 'sent', payload: { external_id: 'm:e:11' } },
      { id: 4, resource: 'event', action: 'insert', status: 'error', payload: { external_id: 'm:e:11' } },
      { id: 5, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'm:e:7' } },
      { id: 6, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'm:s:12' } },
      { id: 7, resource: 'event', action: 'delete', status: 'queued', payload: { external_id: 'm:e:12' } }
    ]
    expect(syncJobsForEvents(jobs, [11, 12]).map(j => j.id)).toEqual([1, 2, 4])
  })

  it('eventDeleteJob and eventUpsertJob are scoped to the match', () => {
    const now = new Date('2026-10-08T10:00:00Z')
    expect(eventDeleteJob('match_1_a', 12, now)).toEqual({
      resource: 'event', action: 'delete', payload: { external_id: 'match_1_a:e:12', match_id: 'match_1_a' }, ts: now.toISOString(), status: 'queued'
    })
    const job = eventUpsertJob('match_1_a', point(12, 12, 'team1', 1, { swappedFrom: 'team2' }), now)
    expect(job.action).toBe('insert')
    expect(job.payload).toMatchObject({ external_id: 'match_1_a:e:12', match_id: 'match_1_a', set_index: 1, type: 'point', seq: 12, payload: { team: 'team1', swappedFrom: 'team2' } })
  })
})

describe('undo of a set end', () => {
  it('syncJobsForSets finds the unsent jobs of the removed next set', () => {
    const jobs = [
      { id: 1, resource: 'set', action: 'insert', status: 'queued', payload: { external_id: 'm:s:3' } },
      { id: 2, resource: 'set', action: 'update', status: 'sent', payload: { external_id: 'm:s:3' } },
      { id: 3, resource: 'set', action: 'update', status: 'queued', payload: { external_id: 'm:s:2' } },
      { id: 4, resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'm:e:3' } }
    ]
    expect(syncJobsForSets(jobs, [3]).map(j => j.id)).toEqual([1])
  })

  it('setReopenJob opens the ended set again in the cloud', () => {
    const job = setReopenJob('match_1_a', { id: 2, team1Points: 20, team2Points: 21 })
    expect(job).toMatchObject({ resource: 'set', action: 'update', status: 'queued' })
    expect(job.payload).toEqual({ external_id: 'match_1_a:s:2', team1_points: 20, team2_points: 21, finished: false, end_time: null })
  })
})

describe('planDecisionChangeReversal (undo of a point swap)', () => {
  const swapped = point(12, 12, 'team1', 1, { swappedFrom: 'team2', score: { team1: 4, team2: 3 } })
  const decision = { id: 13, seq: 13, setIndex: 1, type: 'decision_change', payload: { reason: 'point_swap', pointEventId: 12, fromTeam: 'team2', toTeam: 'team1' } }

  it('gives the point back to the team it was first given to', () => {
    const plan = planDecisionChangeReversal(decision, [point(11, 11, 'team2'), swapped, decision])
    expect(plan).toEqual({ pointEventId: 12, pointPayload: { team: 'team2', score: { team1: 4, team2: 3 } } })
  })

  it('finds the swapped point of a decision change logged without pointEventId', () => {
    const legacy = { ...decision, payload: { reason: 'point_swap', fromTeam: 'team2', toTeam: 'team1' } }
    expect(planDecisionChangeReversal(legacy, [swapped, legacy]).pointEventId).toBe(12)
  })

  it('nothing to reverse for another event or a point never swapped', () => {
    expect(planDecisionChangeReversal(point(12, 12, 'team1'), [])).toBeNull()
    expect(planDecisionChangeReversal(decision, [point(12, 12, 'team1')])).toBeNull()
  })
})
