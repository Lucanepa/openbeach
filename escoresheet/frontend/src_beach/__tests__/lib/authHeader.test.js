/**
 * The session header of the calls outside apiClient_beach (Sign on phone, the
 * account approvals): the stored session, nothing when it is missing,
 * broken or expired.
 */
import { describe, it, expect } from 'vitest'
import { authorizationHeader } from '../../lib_beach/authHeader_beach'
import { AUTH_TOKEN_STORAGE_KEY } from '../../lib_beach/apiClient_beach'

const store = (value) => ({ getItem: (k) => (k === AUTH_TOKEN_STORAGE_KEY ? value : null) })

describe('authorizationHeader', () => {
  it('sends the stored session', () => {
    const session = JSON.stringify({ access_token: 'abc', expires_at: Date.now() / 1000 + 3600 })
    expect(authorizationHeader(store(session))).toEqual({ Authorization: 'Bearer abc' })
  })
  it('nothing without a session, with a broken one or an expired one', () => {
    expect(authorizationHeader(store(null))).toEqual({})
    expect(authorizationHeader(store('{oops'))).toEqual({})
    expect(authorizationHeader(store(JSON.stringify({ access_token: 'abc', expires_at: Date.now() / 1000 - 1 })))).toEqual({})
    expect(authorizationHeader({ getItem: () => { throw new Error('blocked') } })).toEqual({})
  })
})
