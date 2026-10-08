/**
 * Approval with an account: the personal approval PIN and the approvals of a
 * match. Ported from OpenVolley src/lib/accountApi.js (625a2ba8, 0fc2661a;
 * OpenVolley docs/account-approval-spec.md section 3). The backend is shared:
 * it checks the role of the match's sport (beach:referee, beach:scorer on a
 * beach match, e544b33c). Every call resolves to { data, error, status } and
 * never throws.
 *
 * The PIN and the password only ever travel in these request bodies: never
 * log them, never store them.
 */
import { DB_REQUEST_TIMEOUT_MS, OV_PROTO, normalizeError } from './apiClient_beach'
import { authorizationHeader } from './authHeader_beach'
import { getCloudApiUrl } from '../utils_beach/backendConfig_beach'

const enc = encodeURIComponent

function timeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  } catch { /* fall through */ }
  return undefined
}

/**
 * One cloud API call with the account's session.
 * @returns {Promise<{ data: any, error: object|null, status: number }>}
 */
export async function approvalRequest(method, path, body, { fetchImpl = typeof fetch === 'function' ? fetch : null, timeoutMs = DB_REQUEST_TIMEOUT_MS } = {}) {
  const url = getCloudApiUrl(path)
  if (!url || !fetchImpl) return { data: null, error: { message: 'Backend not available', status: 0, network: true }, status: 0 }
  let res
  try {
    res = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-OV-Proto': OV_PROTO, ...authorizationHeader() },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: timeoutSignal(timeoutMs)
    })
  } catch (err) {
    return { data: null, error: { message: err?.message || 'Network unavailable', status: 0, network: true }, status: 0 }
  }
  let json = null
  try { json = await res.json() } catch { /* no JSON body */ }
  if (!res.ok || json?.error) {
    return { data: null, error: { ...normalizeError(json?.error, res.status, 'Request failed'), status: res.status }, status: res.status }
  }
  return { data: json?.data ?? null, error: null, status: res.status }
}

export const approvalPinApi = {
  /** GET → { available, eligible, set, set_at, locked_until, disabled } */
  status: (opts) => approvalRequest('GET', '/api/account/approval-pin', undefined, opts),
  /** Set or change the personal approval PIN; the password confirms it. */
  set: ({ password, pin }, opts) => approvalRequest('POST', '/api/account/approval-pin', { password, pin }, opts),
  remove: ({ password }, opts) => approvalRequest('POST', '/api/account/approval-pin/remove', { password }, opts)
}

export const approvalsApi = {
  /** POST → { approval, already } */
  approve({ external_id, slot, email, pin, result, device_id, lang }, opts) {
    const body = { external_id, slot, email, pin, result }
    if (device_id) body.device_id = device_id
    if (typeof lang === 'string' && lang) body.lang = lang
    return approvalRequest('POST', '/api/approvals', body, opts)
  },
  /** GET → { approvals: [record + requested_by_name + match] }: the signed-in official's own */
  mine: ({ limit } = {}, opts) => approvalRequest('GET', `/api/account/approvals${limit ? `?limit=${enc(String(limit))}` : ''}`, undefined, opts),
  /** GET → { match: { status, closed_at, result_key }, approvals: [record] } */
  list: (externalId, opts) => approvalRequest('GET', `/api/approvals?external_id=${enc(externalId)}`, undefined, opts),
  /** DELETE (undo) → { approval, already } */
  undo: (id, opts) => approvalRequest('DELETE', `/api/approvals/${enc(id)}`, undefined, opts)
}

// Approval error codes -> approval.errors.<key>
const APPROVAL_ERROR_KEYS = {
  OV_APPROVAL_PIN_INVALID: 'pinInvalid',
  OV_APPROVAL_PIN_FORMAT: 'pinFormat',
  OV_APPROVAL_PIN_WEAK: 'pinWeak',
  OV_PASSWORD_INVALID: 'passwordInvalid',
  OV_APPROVAL_ROLE_REQUIRED: 'roleRequired',
  OV_APPROVAL_NOT_MATCH_SCORER: 'notMatchScorer',
  OV_APPROVAL_SCORER_NOT_REFEREE: 'scorerNotReferee',
  OV_APPROVAL_CALLER_ROLE: 'callerRole',
  OV_APPROVAL_NAME_REQUIRED: 'nameRequired',
  OV_APPROVAL_ONE_SLOT: 'oneSlot',
  OV_APPROVAL_SLOT_TAKEN: 'slotTaken',
  OV_MATCH_CLOSED: 'matchClosed',
  OV_MATCH_NOT_ENDED: 'matchNotEnded',
  OV_RESULT_NOT_SYNCED: 'resultNotSynced',
  OV_APPROVAL_UNSUPPORTED: 'unsupported',
  OV_APPROVAL_UNAVAILABLE: 'unavailable'
}

/** The approval feature is switched off on this server (no OV_PIN_SECRET, or no database). */
export function isApprovalUnavailable(error) {
  return error?.code === 'OV_APPROVAL_UNAVAILABLE' || error?.code === 'OV_DB_NOT_CONFIGURED'
}

/** The server does not approve beach results (yet): 409 OV_APPROVAL_UNSUPPORTED. */
export function isApprovalUnsupported(error) {
  return error?.code === 'OV_APPROVAL_UNSUPPORTED'
}

/**
 * The i18n key for an error of these endpoints, by error.code. Server
 * messages stay English; the UI shows the mapped text. context 'approval'
 * reads OV_EMAIL_UNCONFIRMED as the official's address (approve dialog).
 */
export function approvalErrorKey(error, { context } = {}) {
  if (!error) return null
  if (error.network || error.status === 0) return 'approval.errors.offline'
  if (APPROVAL_ERROR_KEYS[error.code]) return `approval.errors.${APPROVAL_ERROR_KEYS[error.code]}`
  if (error.code === 'OV_EMAIL_UNCONFIRMED') return context === 'approval' ? 'approval.errors.emailUnconfirmed' : 'approval.pin.ineligible.email'
  if (error.code === 'OV_TOO_MANY_ATTEMPTS') return 'approval.errors.tooManyAttempts'
  if (error.status === 401 || error.status === 403) return 'approval.errors.forbidden'
  return 'approval.errors.generic'
}
