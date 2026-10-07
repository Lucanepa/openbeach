import { describe, it, expect } from 'vitest'
import { accessFromRoles, normalizeRoles, accessChanged, NO_ACCESS, ADMIN_ROLES, KNOWN_ROLES } from '../../lib_beach/access_beach'

// Parity with OpenVolley src/lib/__tests__/access.test.js: OpenBeach must hide
// exactly what the shared backend refuses.

describe('normalizeRoles', () => {
  it('accepts arrays, Postgres array literals and comma lists', () => {
    expect(normalizeRoles([' Scorer ', 'ADMIN'])).toEqual(['scorer', 'admin'])
    expect(normalizeRoles('{scorer,"admin"}')).toEqual(['scorer', 'admin'])
    expect(normalizeRoles('referee, scorer')).toEqual(['referee', 'scorer'])
  })
  it('drops empty and duplicate values and handles junk', () => {
    expect(normalizeRoles(['scorer', 'SCORER', '', null])).toEqual(['scorer'])
    expect(normalizeRoles(null)).toEqual([])
    expect(normalizeRoles(42)).toEqual([])
    expect(normalizeRoles('{}')).toEqual([])
  })
})

describe('accessFromRoles', () => {
  it('has the same role lists as OpenVolley', () => {
    expect(ADMIN_ROLES).toEqual(['admin', 'super_admin'])
    expect(KNOWN_ROLES).toEqual(['scorer', 'referee', 'competition_manager', 'admin', 'super_admin'])
  })
  it('an account without roles is pending and can do nothing', () => {
    expect(accessFromRoles([])).toMatchObject({ isPending: true, canScore: false, isAdmin: false, canManageTeams: false, canReadTeams: false })
  })
  it('unknown roles grant nothing and keep the account pending', () => {
    expect(accessFromRoles(['guest'])).toMatchObject({ isPending: true, canScore: false, canReadTeams: false, roles: ['guest'] })
  })
  it('a scorer scores and reads saved teams but does not manage them', () => {
    expect(accessFromRoles(['scorer'])).toMatchObject({ isPending: false, canScore: true, canReadTeams: true, canManageTeams: false, isAdmin: false })
  })
  it('a referee is not pending but cannot read saved teams', () => {
    expect(accessFromRoles(['referee'])).toMatchObject({ isPending: false, canScore: false, canReadTeams: false })
  })
  it('a competition manager reads teams but does not score', () => {
    expect(accessFromRoles(['competition_manager'])).toMatchObject({ canManageTeams: true, canReadTeams: true, canScore: false })
  })
  it('admins and super admins can do everything', () => {
    for (const role of ['admin', 'super_admin', ' Admin ']) {
      expect(accessFromRoles([role])).toMatchObject({ isAdmin: true, canScore: true, canManageTeams: true, canReadTeams: true, isPending: false })
    }
    expect(accessFromRoles(['super_admin']).isSuperAdmin).toBe(true)
    expect(accessFromRoles(['admin']).isSuperAdmin).toBe(false)
  })
})

describe('NO_ACCESS', () => {
  it('a signed-out device can do nothing and is not pending', () => {
    expect(NO_ACCESS).toMatchObject({ canScore: false, canReadTeams: false, canManageTeams: false, isAdmin: false, isPending: false })
    expect(Object.isFrozen(NO_ACCESS)).toBe(true)
  })
})

describe('accessChanged', () => {
  it('compares the capabilities, not the role order', () => {
    expect(accessChanged(accessFromRoles(['scorer', 'referee']), accessFromRoles(['referee', 'scorer']))).toBe(false)
    expect(accessChanged(accessFromRoles([]), accessFromRoles(['scorer']))).toBe(true)
    expect(accessChanged(NO_ACCESS, accessFromRoles([]))).toBe(true)
  })
})

// The OpenBeach / OpenVolley account separation: per-app roles (beach:*) and
// /api/me's apps.beach, which wins when the backend reports it.
import { accessFromMe, BEACH_ROLES, formatInviteCode, displayedRoles } from '../../lib_beach/access_beach'

describe('beach roles', () => {
  it('beach:scorer scores and reads teams; beach:competition_manager manages', () => {
    expect(BEACH_ROLES).toEqual(['beach:scorer', 'beach:referee', 'beach:competition_manager'])
    expect(accessFromRoles(['beach:scorer'])).toMatchObject({ canScore: true, canReadTeams: true, isPending: false, isAdmin: false })
    expect(accessFromRoles(['beach:competition_manager'])).toMatchObject({ canScore: false, canManageTeams: true, isPending: false })
    expect(accessFromRoles(['beach:referee'])).toMatchObject({ canScore: false, isPending: false })
  })
})

describe('accessFromMe', () => {
  it('null without apps.beach (a backend before the per-app roles)', () => {
    expect(accessFromMe(null)).toBeNull()
    expect(accessFromMe({ roles: ['scorer'] })).toBeNull()
    expect(accessFromMe({ apps: { indoor: { canScore: true } } })).toBeNull()
  })

  it('apps.beach wins over the roles', () => {
    // An indoor scorer who is not an OpenBeach member: pending here
    const a = accessFromMe({ apps: { beach: { canScore: false, canManageTeams: false, isPending: true, member: false } } }, ['scorer'])
    expect(a).toMatchObject({ canScore: false, canReadTeams: false, isPending: true, member: false, roles: ['scorer'] })
    const b = accessFromMe({ apps: { beach: { canScore: true, member: true } } }, [])
    expect(b).toMatchObject({ canScore: true, canReadTeams: true, isPending: false, member: true })
  })

  it('needsJoin: an account the backend reports as not an OpenBeach member', () => {
    expect(accessFromMe({ apps: { beach: { isPending: true, member: false } } }, ['scorer'])).toMatchObject({ needsJoin: true, isPending: true })
    // A member waiting for approval does not join again
    expect(accessFromMe({ apps: { beach: { isPending: true, member: true } } })).toMatchObject({ needsJoin: false, isPending: true })
    // Global admins are in every app
    expect(accessFromMe({ roles: ['admin'], apps: { beach: { member: false } } })).toMatchObject({ needsJoin: false })
    // A backend without `member` never asks for a join
    expect(accessFromMe({ apps: { beach: { isPending: true } } })).toMatchObject({ needsJoin: false })
    expect(NO_ACCESS.needsJoin).toBe(false)
  })

  it('shows the OpenBeach roles only (an indoor scorer is no scorer here)', () => {
    expect(displayedRoles(accessFromMe({ roles: ['scorer'], apps: { beach: { roles: [], member: false } } }))).toEqual([])
    expect(displayedRoles(accessFromMe({ roles: ['scorer', 'beach:scorer'], apps: { beach: { roles: ['beach:scorer'] } } }))).toEqual(['beach:scorer'])
    expect(displayedRoles(accessFromMe({ roles: ['admin'], apps: { beach: { roles: [] } } }))).toEqual(['admin'])
    // An older backend: the profile's roles
    expect(displayedRoles(accessFromRoles(['scorer']))).toEqual(['scorer'])
  })

  it('fills what apps.beach leaves out from the roles', () => {
    expect(accessFromMe({ roles: ['admin'], apps: { beach: {} } })).toMatchObject({ isAdmin: true, canScore: true, isPending: false })
  })
})

describe('formatInviteCode', () => {
  it('uppercase groups of four, twelve characters at most', () => {
    expect(formatInviteCode('abcd1234efgh9')).toBe('ABCD-1234-EFGH')
    expect(formatInviteCode(' ab-cd ')).toBe('ABCD')
  })
})
