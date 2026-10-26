/**
 * A write refused because the device's storage is full: IndexedDB's
 * QuotaExceededError, as Dexie passes it on (Dexie.QuotaExceededError, or
 * the browser's DOMException wrapped in .inner by a transaction). The scorer
 * is told the cause instead of the general "not saved, try again" (stress
 * test 2026-10-25: 10/10 taps, and nothing said the storage was full).
 * @param {unknown} err
 */
export function isStorageFullError(err) {
  for (let e = err, depth = 0; e && depth < 4; e = e.inner || e.cause, depth++) {
    if (e.name === 'QuotaExceededError' || e.name === 'QuotaExceeded') return true
  }
  return false
}
