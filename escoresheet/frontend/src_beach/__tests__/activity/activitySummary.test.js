// The beach activity catalog and sanitizer (utils_beach/activitySummary_beach),
// ported from OpenVolley src/domain/__tests__/activitySummary.test.js with
// the beach match fields; and the catalog the shared server keeps
// (OpenVolley escoresheet/backend/lib/activitySanitize.js): an entry kind or
// key the server does not know is dropped there.
import { describe, it, expect } from 'vitest'
import {
  sanitizeActivityData, matchUpdateEntries, setUpdateEntry, stackFrames, eventActivityData, historyKind,
  activityCategory, ACTIVITY_KINDS, ACTIVITY_KIND_RE, activityLine, redactFreeText, REDACTED, DENIED_KEY
} from '../../utils_beach/activitySummary_beach'

// The server's catalog (backend lib/activitySanitize.js on OpenVolley main,
// 97be90d3): kind -> keys. Beach sends nothing beyond it.
const SERVER_KINDS = {
  'event.add': ['type', 'seq', 'set', 'team', 'playerIn', 'playerOut', 'player', 'sanction', 'libero', 'scoreA', 'scoreB'],
  'event.bulk_add': ['count', 'types'],
  'event.undo': ['type', 'seq', 'set', 'reason', 'revUid', 'actionId'],
  'event.delete': ['type', 'seq', 'set', 'reason', 'revUid', 'actionId'],
  'event.edit': ['type', 'seq', 'set', 'reason', 'revUid', 'actionId', 'changed'],
  'event.restore': ['type', 'seq', 'set', 'reason', 'revUid', 'actionId'],
  'set.start': ['set', 'home', 'away'],
  'set.end': ['set', 'home', 'away'],
  'set.reopen': ['set', 'home', 'away'],
  'set.delete': ['set', 'home', 'away'],
  'match.create': ['status', 'test'],
  'match.status': ['from', 'to'],
  'match.close': ['from', 'to'],
  'match.coin_toss': ['keys', 'confirmed'],
  'match.manual_change': ['category', 'field', 'before', 'after'],
  'match.signature': ['role', 'signed'],
  'match.approval': ['role', 'method', 'approved'],
  'match.remarks': ['length'],
  'match.forfeit': ['team', 'forfeit', 'stopped'],
  'match.roster': ['team', 'number', 'fields', 'op'],
  'sync.error': ['resource', 'action', 'status', 'code', 'requestId', 'attempt'],
  'sync.dropped': ['resource', 'action', 'status', 'code', 'requestId', 'attempt'],
  'sync.state': ['from', 'to'],
  'sync.summary': ['sent', 'failed', 'pending'],
  'app.start': ['version', 'previous', 'platform', 'persisted'],
  'app.update': ['version', 'previous', 'platform', 'persisted'],
  'app.quit': [],
  'app.error': ['message', 'frames', 'source', 'repeats'],
  'backup.error': ['message'],
  'auth.sign_in': [],
  'auth.sign_out': [],
  'activity.overflow': ['dropped']
}

describe('the catalog', () => {
  it('is the server\'s, kind for kind and key for key', () => {
    expect(Object.fromEntries(Object.entries(ACTIVITY_KINDS).map(([k, v]) => [k, v.keys]))).toEqual(SERVER_KINDS)
    for (const k of Object.keys(ACTIVITY_KINDS)) expect(k).toMatch(ACTIVITY_KIND_RE)
  })
})

describe('sanitizeActivityData', () => {
  it('keeps the allowlisted keys of the kind only', () => {
    expect(sanitizeActivityData('event.add', { type: 'point', team: 'team1', scoreA: 3, scoreB: 2, stateSnapshot: { x: 1 }, extra: 1 }))
      .toEqual({ type: 'point', team: 'team1', scoreA: 3, scoreB: 2 })
    expect(sanitizeActivityData('nope.kind', { a: 1 })).toEqual({})
  })

  it('never keeps PINs, tokens, signatures, dates of birth or data URLs', () => {
    expect(sanitizeActivityData('match.manual_change', { category: 'roster', field: 'name', before: 'data:image/png;base64,AAAA' }))
      .toEqual({ category: 'roster', field: 'name' })
    expect(sanitizeActivityData('sync.error', { resource: 'match', code: { gamePin: '1234', ok: 1 } })).toEqual({ resource: 'match', code: { ok: 1 } })
    expect(sanitizeActivityData('match.manual_change', { category: 'player', field: 'dob', before: '01.02.2003', after: '02.02.2003' }))
      .toEqual({ category: 'player', field: 'dob', before: 'changed', after: 'changed' })
    for (const k of ['team1Pin', 'refereePin', 'password', 'access_token', 'scorerSignature', 'dob', 'email', 'phone', 'licenceNumber']) expect(k).toMatch(DENIED_KEY)
  })

  it('free text keeps no PIN and no long number', () => {
    expect(redactFreeText('pin 123456 failed')).toBe(`pin ${REDACTED} failed`)
    expect(redactFreeText('HTTP 404 in set 2 at 20:18')).toBe('HTTP 404 in set 2 at 20:18')
    expect(sanitizeActivityData('backup.error', { message: 'PIN 4711 rejected' })).toEqual({ message: `PIN ${REDACTED} rejected` })
  })
})

describe('beach match row entries', () => {
  it('status, close, signatures, remarks length, the beach forfeit', () => {
    const row = { status: 'live', remarks: 'a', team1PostGameCaptainSignature: null }
    expect(matchUpdateEntries({ status: 'ended', updatedAt: 2 }, row)).toEqual([{ kind: 'match.status', data: { from: 'live', to: 'ended' } }])
    expect(matchUpdateEntries({ approved: true }, { status: 'ended', approved: false })).toEqual([{ kind: 'match.close', data: { from: 'ended', to: 'approved' } }])
    expect(matchUpdateEntries({ team1PostGameCaptainSignature: 'data:image/png;base64,xx' }, row))
      .toEqual([{ kind: 'match.signature', data: { role: 'team1PostGameCaptain', signed: true } }])
    expect(matchUpdateEntries({ remarks: 'secret words here' }, row)).toEqual([{ kind: 'match.remarks', data: { length: 17 } }])
    // Scoreboard_beach handleForfait: forfait / forfaitTeam
    expect(matchUpdateEntries({ status: 'ended', forfait: true, forfaitTeam: 'team2' }, row))
      .toEqual([{ kind: 'match.status', data: { from: 'live', to: 'ended' } }, { kind: 'match.forfeit', data: { team: 'team2', forfeit: true, stopped: false } }])
  })

  it('one coin toss entry, the beach serve fields included', () => {
    expect(matchUpdateEntries({ coinTossTeamA: 'team1', team1FirstServe: 2, coinTossConfirmed: true }, {}))
      .toEqual([{ kind: 'match.coin_toss', data: { keys: ['coinTossTeamA', 'team1FirstServe', 'coinTossConfirmed'], confirmed: true } }])
  })

  it('set end and reopen with the beach set columns (team 1 / team 2 as home / away)', () => {
    expect(setUpdateEntry({ finished: true, team1Points: 21 }, { index: 2, finished: false, team1Points: 20, team2Points: 18 }))
      .toEqual({ kind: 'set.end', data: { set: 2, home: 21, away: 18 } })
    expect(setUpdateEntry({ finished: false }, { index: 3, finished: true }).kind).toBe('set.reopen')
    expect(setUpdateEntry({ team1Points: 3 }, { index: 1 })).toBeNull()
  })
})

describe('events and errors', () => {
  it('event data from the row and its snapshot', () => {
    expect(eventActivityData({ type: 'point', seq: 12, setIndex: 3, payload: { team: 'team2' }, stateSnapshot: { pointsA: 10, pointsB: 12 } }))
      .toEqual({ type: 'point', seq: 12, set: 3, team: 'team2', scoreA: 10, scoreB: 12 })
    expect(eventActivityData({ type: 'sanction', seq: 3, setIndex: 1, payload: { team: 'team1', type: 'delay_penalty' } }))
      .toMatchObject({ sanction: 'delay_penalty', team: 'team1' })
    expect(historyKind({ op: 'void', reason: 'undo' })).toBe('event.undo')
    expect(historyKind({ op: 'void', reason: 'correction' })).toBe('event.delete')
    expect(historyKind({ op: 'edit' })).toBe('event.edit')
  })

  it('stack frames are file:line only; categories and list lines', () => {
    expect(stackFrames('TypeError: x\n    at f (https://beach.openvolley.app/assets/Scoreboard_beach-abc.js?v=1:12:34)')).toEqual(['Scoreboard_beach-abc.js:12'])
    expect(activityCategory('event.undo')).toBe('correction')
    expect(activityCategory('sync.state', 'error')).toBe('error')
    expect(activityLine({ kind: 'event.add', data: { type: 'point', team: 'team1', scoreA: 3, scoreB: 1 } })).toBe('point team1 3:1')
  })
})
