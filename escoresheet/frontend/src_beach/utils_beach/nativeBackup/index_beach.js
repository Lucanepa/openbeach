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
 * Before the app quits (appLifecycle_beach): resolves once the backups queued
 * now are written (the last scoring write's file, still in its quiet window
 * or being written), or after timeoutMs at the latest, so a quit never waits
 * longer, whatever the disk does. At once in a browser and when the engine
 * never started. Never throws. (OpenVolley flushNativeBackups.)
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
