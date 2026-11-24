// The match-end scoresheet PDF in the activity log (scoresheet.pdf), ported
// from OpenVolley src/utils/__tests__/scoresheetPdfLog.test.js (3f9e6ebb).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => [])
vi.mock('../../utils_beach/activity/bus_beach', () => ({ emitActivity: (kind, data, opts) => calls.push({ kind, data, opts }) }))

import { logScoresheetPdf, PDF_LOG_KIND, PDF_LOG_LEVEL } from '../../utils_beach/scoresheetPdfLog_beach'
import { ACTIVITY_KINDS, sanitizeActivityData, activityLine, activityCategory } from '../../utils_beach/activitySummary_beach'

beforeEach(() => { calls.length = 0 })

describe('logScoresheetPdf', () => {
  it('writes a scoresheet.pdf entry with the level of its step', () => {
    logScoresheetPdf('received', { purpose: 'approval', attempt: 1, bytes: 51234, ms: 4200 }, { matchId: 7 })
    logScoresheetPdf('failed', { purpose: 'approval', attempt: 2, reason: 'closed' }, { matchId: 7 })
    logScoresheetPdf('approved_without_pdf', { purpose: 'approval', reason: 'closed' }, { matchId: 7 })
    expect(calls).toEqual([
      { kind: 'scoresheet.pdf', data: { step: 'received', purpose: 'approval', attempt: 1, bytes: 51234, ms: 4200 }, opts: { level: 'info', matchId: 7 } },
      { kind: 'scoresheet.pdf', data: { step: 'failed', purpose: 'approval', attempt: 2, reason: 'closed' }, opts: { level: 'warn', matchId: 7 } },
      { kind: 'scoresheet.pdf', data: { step: 'approved_without_pdf', purpose: 'approval', reason: 'closed' }, opts: { level: 'error', matchId: 7 } }
    ])
  })

  it('leaves out empty values and keys it does not know', () => {
    logScoresheetPdf('requested', { purpose: 'approval', attempt: 1, reason: null, bytes: undefined, filename: 'Muller_vs_Schmidt.pdf' })
    expect(calls[0].data).toEqual({ step: 'requested', purpose: 'approval', attempt: 1 })
    expect(calls[0].opts).toEqual({ level: 'info' })
  })

  it('is a known activity kind whose data survives the sanitizer (no personal data)', () => {
    expect(ACTIVITY_KINDS[PDF_LOG_KIND]).toBeTruthy()
    const data = { step: 'failed', purpose: 'approval', attempt: 2, reason: 'stalled', ms: 20000, team: 'Müller / Weber', email: 'a@b.ch' }
    expect(sanitizeActivityData(PDF_LOG_KIND, data)).toEqual({ step: 'failed', purpose: 'approval', attempt: 2, reason: 'stalled', ms: 20000 })
    expect(activityCategory(PDF_LOG_KIND, 'info')).toBe('match')
    expect(activityCategory(PDF_LOG_KIND, PDF_LOG_LEVEL.approved_without_pdf)).toBe('error')
  })

  it('reads as one line in the activity list', () => {
    expect(activityLine({ kind: 'scoresheet.pdf', data: { step: 'failed', purpose: 'approval', attempt: 2, reason: 'closed', ms: 900 } }))
      .toBe('failed · approval · closed · attempt 2 · 900 ms')
    expect(activityLine({ kind: 'scoresheet.pdf', data: { step: 'received', purpose: 'approval', attempt: 1, bytes: 8 } }))
      .toBe('received · approval · 8 bytes')
  })
})
