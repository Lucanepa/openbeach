/**
 * Account access, derived from profiles.roles. A verbatim port of OpenVolley
 * escoresheet/frontend/src/lib/access.js (2.1.0), which uses the same
 * definitions as the backend's lib/access.js: the server enforces every rule,
 * the UI only uses these to hide what the account cannot do.
 */

export const ADMIN_ROLES = ['admin', 'super_admin']
export const KNOWN_ROLES = ['scorer', 'referee', 'competition_manager', 'admin', 'super_admin']
// Roles an admin can grant or remove through the API (super_admin is SQL-only).
export const API_GRANTABLE_ROLES = ['scorer', 'referee', 'competition_manager', 'admin']

/**
 * Normalise a roles value as the backend does: an array, a Postgres array
 * literal ('{scorer,admin}') or a comma-separated string. Values are trimmed
 * and lower-cased; unknown values are kept but grant nothing.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeRoles(raw) {
  let list = []
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string') list = raw.replace(/^\{|\}$/g, '').split(',')
  const out = []
  for (const r of list) {
    if (r === null || r === undefined) continue
    const v = String(r).trim().replace(/^"|"$/g, '').toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * @param {unknown} rawRoles
 * @returns {{roles: string[], isAdmin: boolean, isSuperAdmin: boolean, canScore: boolean,
 *   canManageTeams: boolean, canReadTeams: boolean, isPending: boolean}}
 */
export function accessFromRoles(rawRoles) {
  const roles = normalizeRoles(rawRoles)
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r))
  const isSuperAdmin = roles.includes('super_admin')
  // OpenBeach's own roles (beach:scorer...) count like the plain ones, which
  // accounts made before the per-app roles still hold
  const canScore = isAdmin || roles.includes('scorer') || roles.includes('beach:scorer')
  const canManageTeams = isAdmin || roles.includes('competition_manager') || roles.includes('beach:competition_manager')
  const canReadTeams = canScore || canManageTeams
  const isPending = !roles.some(r => KNOWN_ROLES.includes(r) || BEACH_ROLES.includes(r))
  return { roles, isAdmin, isSuperAdmin, canScore, canManageTeams, canReadTeams, isPending }
}

/**
 * OpenBeach's per-app roles (the separation of the OpenVolley and OpenBeach
 * accounts: one login, a membership and roles per app). The backend checks
 * them against the sport of the row; global admin counts for both apps.
 */
export const BEACH_ROLES = ['beach:scorer', 'beach:referee', 'beach:competition_manager']

const FLAG_KEYS = ['canScore', 'canManageTeams', 'canReadTeams', 'isPending', 'isAdmin']

/**
 * The beach access /api/me reports (apps.beach: { canScore, canManageTeams,
 * canReadTeams, isPending, member, ... }) over the one derived from the
 * roles. Null when the answer has no apps.beach (a backend before the
 * per-app roles): the caller then keeps accessFromRoles.
 * @param {unknown} me  the /api/me body
 * @param {unknown} [rawRoles]  the profile's roles (for `roles` and the flags /api/me leaves out)
 */
export function accessFromMe(me, rawRoles = []) {
  const beach = me && typeof me === 'object' ? me.apps?.beach : null
  if (!beach || typeof beach !== 'object') return null
  const base = accessFromRoles(me.roles ?? rawRoles)
  const out = { ...base }
  for (const k of FLAG_KEYS) if (typeof beach[k] === 'boolean') out[k] = beach[k]
  if (typeof beach.canReadTeams !== 'boolean') out.canReadTeams = out.canScore || out.canManageTeams
  if (typeof beach.isPending !== 'boolean') out.isPending = !(out.canScore || out.canManageTeams || out.isAdmin || beach.member === true)
  out.member = beach.member === true || !out.isPending
  // The account's roles in OpenBeach (an indoor 'scorer' is not one here)
  if (Array.isArray(beach.roles)) out.appRoles = normalizeRoles(beach.roles)
  // An account of the shared login that is not in OpenBeach yet (an
  // OpenVolley account): it joins first (POST /api/account/join), then waits
  // for an invite code or an admin like any new account
  out.needsJoin = beach.member === false && out.isPending && !out.isAdmin
  return out
}

/**
 * The roles to show in OpenBeach: the ones /api/me reports for the app (plus
 * the global admin roles), else every role of the profile (an older backend).
 * @param {{ roles?: string[], appRoles?: string[] }|null|undefined} access
 */
export function displayedRoles(access) {
  const all = access?.roles || []
  if (!Array.isArray(access?.appRoles)) return all
  return [...access.appRoles, ...all.filter(r => ADMIN_ROLES.includes(r) && !access.appRoles.includes(r))]
}

/** A typed invite code for display: uppercase, groups of four (as OpenVolley). */
export function formatInviteCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

/** Access of a signed-out device: nothing, and not "pending" either. */
export const NO_ACCESS = Object.freeze({
  roles: [],
  isAdmin: false,
  isSuperAdmin: false,
  canScore: false,
  canManageTeams: false,
  canReadTeams: false,
  isPending: false,
  needsJoin: false,
  known: false
})

/** Did anything that changes what the account may do change? */
export function accessChanged(a, b) {
  if (!a || !b) return a !== b
  return a.isAdmin !== b.isAdmin || a.canScore !== b.canScore || a.canManageTeams !== b.canManageTeams ||
    a.canReadTeams !== b.canReadTeams || a.isPending !== b.isPending || !!a.needsJoin !== !!b.needsJoin
}

export const ACCESS_CHANGED_EVENT = 'ob-access-changed'
