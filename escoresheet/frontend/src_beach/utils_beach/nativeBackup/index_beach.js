/**
 * Native auto-backup for the OpenBeach apps (desktop Tauri, Android Capacitor).
 * One engine per app session, shared by useAutoBackup (App_beach) and the
 * options modals.
 *
 * Ported from OpenVolley src/utils/nativeBackup/index.js.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { detectBackupPlatform, isNativeBackupPlatform, createPlatformStore } from './platform_beach'
import { createNativeBackupEngine } from './engine_beach'
import { isContinuedElsewhere } from '../matchReopen_beach'

export { detectBackupPlatform, isNativeBackupPlatform } from './platform_beach'
export { subscribeMatchWrites } from './matchWriteHook_beach'

let enginePromise = null
let engine = null
const EMPTY_STATUS = { folder: null, lastBackup: null, lastFile: null, error: null, count: 0 }

/** The app's backup engine, or null in a browser. */
export function getNativeBackupEngine() {
  if (!isNativeBackupPlatform(detectBackupPlatform())) return Promise.resolve(null)
  if (!enginePromise) {
    enginePromise = (async () => {
      const [store, { exportMatchData }] = await Promise.all([
        createPlatformStore(),
        import('../backupManager_beach')
      ])
      // No new file of a copy another device went on with: its state is older
      // than the match's (OpenVolley 2026-10-29, match 406970)
      engine = createNativeBackupEngine({ store, exportMatch: exportMatchData, skipMatch: isContinuedElsewhere })
      engine.subscribe(emit)
      emit()
      // The files older versions left in the public Documents folder move
      // into the app's own folder, a few seconds in (audit SEC-22)
      startNativeFileHousekeeping()
      return engine
    })().catch((e) => {
      console.error('[NativeBackup] cannot start:', e)
      enginePromise = null
      return null
    })
  }
  return enginePromise
}

// useSyncExternalStore plumbing (works before the engine has loaded)
const listeners = new Set()
function emit() {
  for (const l of listeners) l()
}
function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = () => (engine ? engine.getStatus() : EMPTY_STATUS)

/** Live backup status { folder, lastBackup, lastFile, error, count } for the UI. */
export function useNativeBackupStatus() {
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    getNativeBackupEngine().then(e => e?.loadFolder())
  }, [])
  return status
}

/** How long the app's quit waits at most for the last backup file. */
export const QUIT_BACKUP_WAIT_MS = 1500

/**
 * Before the app quits (appLifecycle_beach), and on Android when it goes to
 * the background: the backups queued now are written at once (the last
 * scoring write's file, still in its quiet window or being written);
 * resolves when they are, or after timeoutMs at the latest, so a quit never
 * waits longer, whatever the disk does. At once in a browser and when the
 * engine never started. Never throws. (OpenVolley flushNativeBackups.)
 */
export async function flushNativeBackups(timeoutMs = QUIT_BACKUP_WAIT_MS) {
  if (!enginePromise) return
  let timer
  try {
    await Promise.race([
      enginePromise.then(e => e?.flush({ writesOnly: true })),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs) })
    ])
  } catch (e) {
    console.warn('[NativeBackup] last backup before quitting:', e?.message || e)
  } finally {
    clearTimeout(timer)
  }
}

// After the start's own work (the database, the first screen)
export const HOUSEKEEPING_DELAY_MS = 5000

// The Capacitor app's OS: 'android', 'ios', or null when it cannot tell
function capacitorOs(win) {
  try {
    return win?.Capacitor?.getPlatform?.() || null
  } catch {
    return null
  }
}

let housekeeping = null
/**
 * Once per app session, a few seconds after the backup engine started: on
 * Android the backups and activity logs older versions left in the public
 * Documents folder are moved into the app's own folder (once per install,
 * androidFiles_beach.moveLegacyFiles, audit SEC-22). Nothing in a browser or
 * the desktop app. Never throws.
 * Android only, not every Capacitor app: on iOS the Documents, Data and
 * External folders are one folder, which a move would empty.
 */
export function startNativeFileHousekeeping({
  delayMs = HOUSEKEEPING_DELAY_MS,
  platform = detectBackupPlatform(),
  win = typeof window !== 'undefined' ? window : undefined,
  load = () => Promise.all([import('@capacitor/filesystem'), import('./androidFiles_beach')])
} = {}) {
  if (housekeeping) return housekeeping
  housekeeping = (async () => {
    if (platform !== 'capacitor' || capacitorOs(win) !== 'android') return null
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const [fs, { moveLegacyFiles }] = await load()
      return await moveLegacyFiles(fs)
    } catch (e) {
      console.warn('[AndroidFiles] moving the old files:', e?.message || e)
      return null
    }
  })()
  return housekeeping
}

/** Tests: the next start runs the housekeeping again. */
export function resetNativeFileHousekeepingForTests() {
  housekeeping = null
}

/**
 * Options, Export to Documents (Android): each match's newest backup and the
 * activity logs copied to a new Documents/OpenBeach/export-<time> folder,
 * the user's own copy (a USB cable, another app). Resolves to
 * androidFiles_beach.exportToDocuments's result (a file that could not be
 * copied is counted in `failed`); throws when Documents cannot be written.
 */
export async function exportNativeFilesToDocuments({ load = () => Promise.all([import('@capacitor/filesystem'), import('./androidFiles_beach')]) } = {}) {
  const [fs, { exportToDocuments }] = await load()
  return exportToDocuments(fs)
}

/** Opens the backup folder in the file manager (desktop). */
export async function openNativeBackupFolder() {
  const e = await getNativeBackupEngine()
  if (!e?.store?.canOpenFolder) return false
  return e.store.openFolder()
}

/**
 * Native file picker opened on the backup folder (desktop). Resolves to the
 * parsed backup, null when cancelled, or undefined when the platform has no
 * native picker (use the browser file input instead).
 */
export async function pickNativeBackupFile() {
  const e = await getNativeBackupEngine()
  if (!e?.store?.canPickFile) return undefined
  return e.store.pickFile()
}
