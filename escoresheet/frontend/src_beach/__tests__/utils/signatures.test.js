import { describe, it, expect, vi } from 'vitest'
import {
  saveMatchSignature, signatureFieldOfRole, signaturesPayload, signaturesSyncJob,
  signatureEditLocked, clearedPostMatchSignatures
} from '../../utils_beach/signatures_beach'

function fakeDb(row) {
  const rows = { 1: { ...row } }
  const queue = []
  return {
    rows, queue,
    matches: {
      update: vi.fn(async (id, patch) => { rows[id] = { ...rows[id], ...patch } }),
      get: vi.fn(async (id) => rows[id])
    },
    sync_queue: { add: vi.fn(async (job) => { queue.push(job) }) }
  }
}

describe('saveMatchSignature (OpenVolley 703cfa9c: saved as soon as the pad is confirmed)', () => {
  it('writes the field and queues the full signatures object', async () => {
    const db = fakeDb({ seed_key: 'k1', team1CoachSignature: 'data:coach', scorerSignature: 'data:scorer' })
    expect(await saveMatchSignature(db, 1, 'team1CaptainSignature', 'data:capt')).toBe(true)
    expect(db.rows[1].team1CaptainSignature).toBe('data:capt')
    expect(db.queue).toHaveLength(1)
    expect(db.queue[0]).toMatchObject({ resource: 'match', action: 'update', status: 'queued' })
    expect(db.queue[0].payload).toEqual({
      id: 'k1',
      signatures: {
        team1_captain: 'data:capt', team2_captain: '', team1_coach: 'data:coach', team2_coach: '',
        team1_captain_post_game: null, team2_captain_post_game: null,
        asst_scorer: null, scorer: 'data:scorer', ref2: null, ref1: null
      }
    })
  })

  it('null clears the field, and the cleared signature is sent as cleared', async () => {
    const db = fakeDb({ seed_key: 'k1', ref1Signature: 'data:r1' })
    await saveMatchSignature(db, 1, 'ref1Signature', null)
    expect(db.rows[1].ref1Signature).toBeNull()
    expect(db.queue[0].payload.signatures.ref1).toBeNull()
  })

  it('a test match or a match without a seed key is saved, not synced', async () => {
    const db = fakeDb({ seed_key: 'k1', test: true })
    await saveMatchSignature(db, 1, 'team2CoachSignature', 'data:x')
    expect(db.rows[1].team2CoachSignature).toBe('data:x')
    expect(db.queue).toHaveLength(0)
    const local = fakeDb({})
    await saveMatchSignature(local, 1, 'team2CoachSignature', 'data:x')
    expect(local.queue).toHaveLength(0)
  })

  it('writes extra fields in the same update', async () => {
    const db = fakeDb({ seed_key: 'k1' })
    await saveMatchSignature(db, 1, 'team1CoachSignature', 'data:p', { 'signatureSources.team1CoachSignature': { via: 'phone' } })
    expect(db.matches.update).toHaveBeenCalledTimes(1)
    expect(db.matches.update).toHaveBeenCalledWith(1, { 'signatureSources.team1CoachSignature': { via: 'phone' }, team1CoachSignature: 'data:p' })
  })

  it('does nothing without a match or a field', async () => {
    const db = fakeDb({})
    expect(await saveMatchSignature(db, null, 'team1CaptainSignature', 'x')).toBe(false)
    expect(await saveMatchSignature(db, 1, signatureFieldOfRole('nope'), 'x')).toBe(false)
    expect(db.matches.update).not.toHaveBeenCalled()
  })

  it('a failed write is reported, not thrown', async () => {
    const db = fakeDb({})
    db.matches.update.mockRejectedValueOnce(new Error('quota'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveMatchSignature(db, 1, 'scorerSignature', 'x')).toBe(false)
    err.mockRestore()
  })
})

describe('signature fields and edits', () => {
  it('maps the coin toss pads to the match fields', () => {
    expect(signatureFieldOfRole('team1-captain')).toBe('team1CaptainSignature')
    expect(signatureFieldOfRole('team2-captain')).toBe('team2CaptainSignature')
    expect(signatureFieldOfRole('team1-coach')).toBe('team1CoachSignature')
    expect(signatureFieldOfRole('team2-coach')).toBe('team2CoachSignature')
    expect(signatureFieldOfRole(null)).toBeNull()
  })

  it('the payload has every key, pre-match empty as "", post-match as null', () => {
    expect(signaturesPayload(null)).toEqual({
      team1_captain: '', team2_captain: '', team1_coach: '', team2_coach: '',
      team1_captain_post_game: null, team2_captain_post_game: null,
      asst_scorer: null, scorer: null, ref2: null, ref1: null
    })
    expect(signaturesSyncJob({ seed_key: 'k' }, new Date('2026-10-08T10:00:00Z')).ts).toBe('2026-10-08T10:00:00.000Z')
  })

  it('Re-sign and Clear lock once the match is approved or closed', () => {
    expect(signatureEditLocked({ status: 'ended' })).toBe(false)
    expect(signatureEditLocked({ status: 'ended' }, { isApproved: true })).toBe(true)
    expect(signatureEditLocked({ approved: true })).toBe(true)
    expect(signatureEditLocked({ status: 'final' })).toBe(true)
    expect(signatureEditLocked({ closed_at: '2026-10-08' })).toBe(true)
    expect(signatureEditLocked(null)).toBe(false)
  })

  it('reopening clears every post-match signature field (the fields the match end writes)', () => {
    expect(clearedPostMatchSignatures()).toEqual({
      team1PostGameCaptainSignature: null, team2PostGameCaptainSignature: null,
      asstScorerSignature: null, scorerSignature: null, ref2Signature: null, ref1Signature: null
    })
  })
})
