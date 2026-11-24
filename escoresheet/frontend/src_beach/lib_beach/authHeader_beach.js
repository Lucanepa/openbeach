/**
 * The signed-in account's session as an Authorization header, read the way
 * apiClient_beach sends it (OpenVolley's apiClient authorizationHeader), for
 * the calls that do not go through apiClient_beach: Sign on phone and the
 * account approvals. An expired session sends nothing; apiClient_beach
 * drops it on its next call.
 */
import { AUTH_TOKEN_STORAGE_KEY } from './apiClient_beach'

export function authorizationHeader(storage = safeStorage()) {
  try {
    const session = JSON.parse(storage?.getItem(AUTH_TOKEN_STORAGE_KEY) || 'null')
    if (!session?.access_token) return {}
    if (session.expires_at && Date.now() / 1000 > session.expires_at) return {}
    return { Authorization: `Bearer ${session.access_token}` }
  } catch {
    return {}
  }
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}
