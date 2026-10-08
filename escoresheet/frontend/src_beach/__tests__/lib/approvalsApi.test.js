// lib_beach/approvalsApi_beach.js (OpenVolley 625a2ba8, 0fc2661a): the
// approval PIN and approvals endpoints on the shared backend, with the
// session, results instead of throws, and the error texts by code.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib_beach/authHeader_beach', () => ({ authorizationHeader: () => ({ Authorization: 'Bearer SESSION' }) }))
vi.mock('../../utils_beach/backendConfig_beach', () => ({ getCloudApiUrl: (p) => `https://api.test${p}` }))
import { approvalsApi, approvalPinApi, approvalErrorKey, isApprovalUnavailable, isApprovalUnsupported } from '../../lib_beach/approvalsApi_beach'

const answer = (status, body) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))

describe('approvalsApi_beach', () => {
  it('approve: POST /api/approvals with the session and the beach result; data unwrapped', async () => {
    const fetchImpl = answer(200, { data: { approval: { id: 'a1', slot: 'referee1' }, already: false }, error: null })
    const res = await approvalsApi.approve({
      external_id: 'seed-1', slot: 'referee1', email: 'ref@x.ch', pin: '482917', result: { sets: [[1, 21, 19], [2, 21, 17]] }, device_id: 'dev', lang: 'de-CH'
    }, { fetchImpl })
    expect(res).toEqual({ data: { approval: { id: 'a1', slot: 'referee1' }, already: false }, error: null, status: 200 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.test/api/approvals')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer SESSION', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ external_id: 'seed-1', slot: 'referee1', email: 'ref@x.ch', pin: '482917', result: { sets: [[1, 21, 19], [2, 21, 17]] }, device_id: 'dev', lang: 'de-CH' })
  })

  it('list, undo, mine and the PIN routes', async () => {
    const fetchImpl = answer(200, { data: {}, error: null })
    await approvalsApi.list('seed 1', { fetchImpl })
    await approvalsApi.undo('a/1', { fetchImpl })
    await approvalsApi.mine({ limit: 10 }, { fetchImpl })
    await approvalPinApi.status({ fetchImpl })
    await approvalPinApi.set({ password: 'pw', pin: '482917' }, { fetchImpl })
    await approvalPinApi.remove({ password: 'pw' }, { fetchImpl })
    expect(fetchImpl.mock.calls.map(([u, i]) => `${i.method} ${u.replace('https://api.test', '')}`)).toEqual([
      'GET /api/approvals?external_id=seed%201',
      'DELETE /api/approvals/a%2F1',
      'GET /api/account/approvals?limit=10',
      'GET /api/account/approval-pin',
      'POST /api/account/approval-pin',
      'POST /api/account/approval-pin/remove'
    ])
  })

  it('errors are results with their code and status; the network too', async () => {
    const res = await approvalsApi.approve({ external_id: 'x', slot: 'scorer', email: 'a@b.c', pin: '4829', result: { sets: [] } },
      { fetchImpl: answer(409, { data: null, error: { code: 'OV_APPROVAL_UNSUPPORTED', message: 'no beach' } }) })
    expect(res.error).toMatchObject({ code: 'OV_APPROVAL_UNSUPPORTED', status: 409 })
    expect(isApprovalUnsupported(res.error)).toBe(true)
    const down = await approvalsApi.list('x', { fetchImpl: vi.fn(async () => { throw new TypeError('Failed to fetch') }) })
    expect(down.error).toMatchObject({ network: true, status: 0 })
    expect(approvalErrorKey(down.error)).toBe('approval.errors.offline')
  })

  it('maps codes to texts', () => {
    expect(approvalErrorKey({ code: 'OV_APPROVAL_PIN_INVALID', status: 403 })).toBe('approval.errors.pinInvalid')
    expect(approvalErrorKey({ code: 'OV_APPROVAL_UNSUPPORTED', status: 409 })).toBe('approval.errors.unsupported')
    expect(approvalErrorKey({ code: 'OV_EMAIL_UNCONFIRMED', status: 409 }, { context: 'approval' })).toBe('approval.errors.emailUnconfirmed')
    expect(approvalErrorKey({ code: 'OV_TOO_MANY_ATTEMPTS', status: 429 })).toBe('approval.errors.tooManyAttempts')
    expect(approvalErrorKey({ code: 'X', status: 403 })).toBe('approval.errors.forbidden')
    expect(approvalErrorKey({ code: 'X', status: 500 })).toBe('approval.errors.generic')
    expect(isApprovalUnavailable({ code: 'OV_APPROVAL_UNAVAILABLE' })).toBe(true)
  })
})
