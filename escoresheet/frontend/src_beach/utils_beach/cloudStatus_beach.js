/**
 * What the app says about the cloud (the startup check, the header's
 * connection list) and whether a screen may wait for a cloud sync.
 *
 * The startup check used to read the sync status once, at the first render,
 * before the sync queue's probe had answered: the queue starts out 'offline',
 * so a healthy cloud showed as "OpenVolley Cloud: Offline" (or "Error") for
 * ~30 s, until the next periodic check. The status is now derived from the
 * sync status every time it changes (cloudStatusFor), and the queue starts
 * out 'connecting' while the device is online (useSyncQueue_beach).
 */
import { getCloudApiUrl, isCloudOffline, isRelayOriginPage } from './backendConfig_beach'
import { getSyncStatus } from '../hooks_beach/useSyncQueue_beach'
import { isSignedInOnDevice } from './syncDisplay_beach'
import { accountMayWriteCloud } from '../lib_beach/access_beach'

/** Cloud statuses that count as fine for the startup check. */
const CLOUD_OK = new Set(['connected', 'not_configured', 'not_applicable', 'not_available'])

/**
 * The cloud row of the connection list, from the sync queue's status.
 * @param {{ canUseCloud?: boolean, syncStatus?: string|null, offlineMode?: boolean, relayOrigin?: boolean }} p
 *   canUseCloud: a backend is configured; offlineMode: the scorer switched the
 *   cloud off; relayOrigin: the page is served by a venue relay (no /api/db).
 * @returns {{ status: string, message: string, details?: string }}
 */
export function cloudStatusFor({ canUseCloud = true, syncStatus = null, offlineMode = false, relayOrigin = false } = {}) {
  if (offlineMode) {
    return { status: 'not_applicable', message: 'Offline mode: the cloud is switched off on this device' }
  }
  if (!canUseCloud) {
    return {
      status: 'not_configured',
      message: 'Cloud backend is not configured',
      details: 'No backend URL: set VITE_BACKEND_URL (e.g. https://backend.openvolley.app) or choose a server.'
    }
  }
  if (relayOrigin && syncStatus !== 'synced' && syncStatus !== 'syncing' && syncStatus !== 'auth_required') {
    // A tablet on the hall network: its server is the venue relay
    return {
      status: 'not_configured',
      message: 'Venue relay: no cloud here',
      details: 'This page is served by a venue relay. Matches are kept on this device and the relay carries them to the other tablets.'
    }
  }
  switch (syncStatus) {
    case 'auth_required':
      return { status: 'connected', message: 'Cloud backend is reachable. Sign in to sync this device\'s matches.' }
    case 'synced':
    case 'syncing':
      return { status: 'connected', message: 'Cloud backend connected and syncing' }
    case 'online_no_supabase':
      return {
        status: 'not_configured',
        message: 'Offline: no cloud backend here',
        details: 'This server is an offline LAN relay or the build has no backend URL. Matches are kept on this device.'
      }
    case 'error':
      return { status: 'error', message: 'Cloud backend error', details: 'The backend answered with an error. Sync retries in the background.' }
    case 'offline':
      return { status: 'offline', message: 'Device is offline or the cloud backend is unreachable' }
    case 'connecting':
    case null:
    case undefined:
      return { status: 'connecting', message: 'Connecting to the cloud backend...' }
    default:
      return { status: 'unknown', message: 'Cloud backend status unknown' }
  }
}

/** Is a cloud status fine for the startup check? */
export function isCloudStatusOk(status) {
  return CLOUD_OK.has(status)
}

/**
 * May a screen show "Syncing to database…" and wait (up to 10–15 s) for the
 * sync queue? Only when the sync can actually finish now: the cloud is on, it
 * is not a venue relay's page, the queue is connected and signed in, and the
 * account may write there (canWrite: not an OpenVolley account that has not
 * joined OpenBeach, not one waiting for approval; the backend refuses those
 * matches, and each setup step used to wait ~9 s for nothing).
 * Anywhere else the save is local and the sync runs in the background.
 * Signed out: never. The queue then sends nothing, and with nothing queued
 * its status is 'synced', so every save waited 10 s for nothing.
 * @param {{ syncStatus?: string|null, offlineMode?: boolean, relayOrigin?: boolean, hasCloud?: boolean, canWrite?: boolean, signedIn?: boolean }} p
 */
export function shouldWaitForCloudSync({ syncStatus = null, offlineMode = false, relayOrigin = false, hasCloud = true, canWrite = true, signedIn = true } = {}) {
  if (offlineMode || relayOrigin || !hasCloud || !canWrite || !signedIn) return false
  return syncStatus === 'synced' || syncStatus === 'syncing'
}

/**
 * shouldWaitForCloudSync for this page now: the sync queue's current status,
 * offline mode, a venue relay's page, a cloud URL at all, the account's access.
 */
export function cloudSyncWaitNow() {
  return shouldWaitForCloudSync({
    syncStatus: getSyncStatus(),
    offlineMode: isCloudOffline(),
    relayOrigin: isRelayOriginPage(),
    hasCloud: !!getCloudApiUrl('/api/db'),
    canWrite: accountMayWriteCloud(),
    signedIn: isSignedInOnDevice()
  })
}
