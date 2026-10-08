// Ported from OpenVolley src/domain/__tests__/eventRevisions.test.js, with the
// beach team keys (team1 / team2) and the beach local-only event types.
import { describe, it, expect } from 'vitest'
import {
  editOf, applyMods, withoutSnapshot, serverColumnsOfEdit, snapshotScore, revisionSyncJob, revisionOfJob,
  normalizeReason, runningScoreAfterEdit, REVISION_REASONS, LOCAL_ONLY_EVENT_TYPES
} from '../../utils_beach/eventRevisions_beach'
import { eventExtId } from '../../utils_beach/syncIds_beach'

describe('eventRevisions_beach', () => {
  it('editOf ignores bookkeeping, unchanged values and the first snapshot fill', () => {
    const stored = { id: 1, type: 'point', payload: { team: 'team1' }, stateSnapshot: null }
    expect(editOf({ stateSnapshot: { pointsA: 1 } }, stored)).toBeNull()
    expect(editOf({ _synced: true, synced: 1 }, stored)).toBeNull()
    expect(editOf({ payload: { team: 'team1' } }, stored)).toBeNull()
    expect(editOf({ 'payload.team': 'team2' }, stored)).toEqual(['payload.team'])
    expect(editOf({ stateSnapshot: { pointsA: 2 } }, { ...stored, stateSnapshot: { pointsA: 1 } })).toEqual(['stateSnapshot'])
    expect(editOf({ stateSnapshot: { pointsA: 1 }, setIndex: 2 }, { ...stored, setIndex: 1 })).toEqual(['setIndex'])
  })

  it('applyMods applies key paths without touching the stored row', () => {
    const stored = { payload: { team: 'team1', n: 1 } }
    const after = applyMods(stored, { 'payload.team': 'team2', setIndex: 3 })
    expect(after).toEqual({ payload: { team: 'team2', n: 1 }, setIndex: 3 })
    expect(stored.payload.team).toBe('team1')
  })

  it('withoutSnapshot drops the snapshot and bookkeeping keys', () => {
    expect(withoutSnapshot({ id: 1, stateSnapshot: { a: 1 }, _x: 1, synced: true, type: 't' })).toEqual({ id: 1, type: 't' })
  })

  it('serverColumnsOfEdit maps to server columns, scores from the snapshot, never a snapshot', () => {
    const before = { type: 'sanction', setIndex: 1, seq: 9, payload: { team: 'team1' }, stateSnapshot: { scoreA: 1, scoreB: 2 } }
    const after = { ...before, payload: { team: 'team2', nested: { stateSnapshot: { big: 1 }, k: 1 } }, stateSnapshot: { scoreA: 3, scoreB: 2 } }
    expect(serverColumnsOfEdit(before, after)).toEqual({ type: 'sanction', set_index: 1, seq: 9, payload: { team: 'team2', nested: { k: 1 } }, score_a: 3, score_b: 2 })
    expect(serverColumnsOfEdit(before, { ...after, stateSnapshot: null })).not.toHaveProperty('score_a')
    expect(snapshotScore({ pointsA: 4, pointsB: 5 })).toEqual({ a: 4, b: 5 })
  })

  it('revisionSyncJob: only cloud matches and the event types beach sends', () => {
    const row = { revUid: 'u', eventId: 7, op: 'void', reason: 'undo', seq: 3, setIndex: 1, type: 'point', ts: '2026-10-07T10:00:00.000Z', deviceId: 'd', appVersion: '2' }
    const job = revisionSyncJob(row, { seedKey: 'match_1_x', test: false }, eventExtId)
    expect(job).toMatchObject({ resource: 'event', action: 'void', status: 'queued' })
    expect(job.payload).toMatchObject({ external_id: 'match_1_x:e:7', match_id: 'match_1_x', rev_uid: 'u', op: 'void', reason: 'undo', client_ts: row.ts })
    expect(revisionSyncJob(row, { seedKey: 'match_1_x', test: true }, eventExtId)).toBeNull()
    expect(revisionSyncJob(row, { seedKey: null }, eventExtId)).toBeNull()
    // the beach scoreboard queues no insert for these: no void either
    for (const type of ['rally_start', 'set_start', 'technical_to', 'set3_coin_toss', 'set3_coin_toss_winner', 'between_sets_setup_confirmed']) {
      expect(LOCAL_ONLY_EVENT_TYPES).toContain(type)
      expect(revisionSyncJob({ ...row, type }, { seedKey: 'match_1_x' }, eventExtId)).toBeNull()
    }
    // a replay and a court switch are synced in beach: their history goes too
    expect(revisionSyncJob({ ...row, type: 'replay' }, { seedKey: 'match_1_x' }, eventExtId)).not.toBeNull()
    expect(revisionSyncJob({ ...row, type: 'court_switch' }, { seedKey: 'match_1_x' }, eventExtId)).not.toBeNull()
    const edit = revisionSyncJob({ ...row, op: 'edit', serverAfter: { type: 'point' } }, { seedKey: 'match_1_x' }, eventExtId)
    expect(edit.payload.after).toEqual({ type: 'point' })
  })

  it('revisionOfJob builds the route body and normalises the reason', () => {
    expect(revisionOfJob({ op: 'void', rev_uid: 'u', external_id: 'm:e:1', reason: 'nonsense', client_ts: 't' }))
      .toMatchObject({ rev_uid: 'u', op: 'void', event_external_id: 'm:e:1', reason: 'delete' })
    expect(revisionOfJob({ op: 'insert', rev_uid: 'u', external_id: 'x' })).toBeNull()
    expect(normalizeReason('undo')).toBe('undo')
    expect(normalizeReason('correction')).toBe('correction')
    expect(REVISION_REASONS).toContain('correction')
  })

  describe('decision change: the running score of the swapped point', () => {
    // 14:12 for team1 (Team A) after this point, logged for team1
    const snap = { teamAKey: 'team1', pointsA: 14, pointsB: 12 }
    const point = { id: 40, type: 'point', setIndex: 1, seq: 40, payload: { team: 'team1' }, stateSnapshot: snap }
    const swapped = { ...point, payload: { team: 'team2', swappedFrom: 'team1' } }

    it('the swap sends the score of the points after it, not the snapshot\'s', () => {
      expect(serverColumnsOfEdit(point, swapped)).toMatchObject({ score_a: 13, score_b: 13, payload: { team: 'team2' } })
      // Team A is team2: the same swap counts the other way round
      const team2A = { ...snap, teamAKey: 'team2', pointsA: 12, pointsB: 14 }
      expect(runningScoreAfterEdit({ ...point, stateSnapshot: team2A }, { ...swapped, stateSnapshot: team2A })).toEqual({ a: 13, b: 13 })
    })

    it('undoing the swap (the beach reversal drops swappedFrom) goes back to the snapshot score', () => {
      const reverted = { ...point, payload: { team: 'team1' } }
      expect(runningScoreAfterEdit(swapped, reverted)).toEqual({ a: 14, b: 12 })
    })

    it('no Team A in the snapshot: no score columns', () => {
      const noA = { ...snap, teamAKey: undefined }
      expect(runningScoreAfterEdit({ ...point, stateSnapshot: noA }, { ...swapped, stateSnapshot: noA })).toBeNull()
    })
  })
})
