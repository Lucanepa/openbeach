// What the screens say about the cloud sync. Display only: the sync queue
// itself (useSyncQueue_beach) decides what is sent and when.
//
// Without a session on this device the queue sends nothing (every write
// would be refused) and keeps the jobs until a sign-in. The header pill
// said "Syncing..." and the match setup cards showed an orange pulsing
// "Syncing..." chip for the whole match, and every save waited 10 s on a
// "Syncing to database..." modal for a sync that could not happen.

import { AUTH_TOKEN_STORAGE_KEY } from '../lib_beach/apiClient_beach'

/**
 * Is an account signed in on this device (an unexpired stored session, the
 * one the queue's requests carry)? As useSyncQueue_beach hasStoredSessionToken,
 * without importing the queue (it installs database hooks on import).
 */
export function isSignedInOnDevice() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null
    const session = raw ? JSON.parse(raw) : null
    if (!session?.access_token) return false
    return !(session.expires_at && Date.now() / 1000 > session.expires_at)
  } catch {
    return false
  }
}

/**
 * A match setup card's sync chip.
 * @returns {'error'|'syncing'|'local'|'synced'|'idle'}
 *   local: saved on this device, waiting for a sign-in to sync
 */
export function cardSyncStatus({ hasError = false, hasQueued = false, signedIn = true, inCloud = false } = {}) {
  if (hasError) return 'error'
  if (hasQueued) return signedIn ? 'syncing' : 'local'
  return inCloud ? 'synced' : 'idle'
}

/**
 * The header pill's word while jobs wait in the queue and the connection
 * itself is fine.
 * @param {{ pending?: number, signedIn?: boolean, cloudStatus?: string|null }} p
 *   cloudStatus: the cloud row's status (cloudStatusFor)
 * @returns {'syncing'|'not_signed_in'|'local_only'|null} null: nothing waits
 */
export function pendingSyncLabel({ pending = 0, signedIn = true, cloudStatus = null } = {}) {
  if (!(pending > 0)) return null
  // No cloud here (a LAN relay, no backend, offline): the jobs stay on the device
  if (cloudStatus && cloudStatus !== 'connected') return 'local_only'
  if (!signedIn) return 'not_signed_in'
  return 'syncing'
}
