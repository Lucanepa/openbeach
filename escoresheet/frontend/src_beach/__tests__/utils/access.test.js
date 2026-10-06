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
