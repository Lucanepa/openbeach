/**
 * The Android app's own files: the match backups (platform_beach
 * createCapacitorStore) and the activity log's daily files
 * (activity/fileSink_beach), both in the app's own folder
 * (platform_beach.appFilesDirectories: internal storage). No other app, file
 * manager or USB cable reaches them, and they go with the app when it is
 * uninstalled. Audit SEC-22 (OpenVolley android-2, owner decision 2026-11):
 * the public Documents folder kept every roster, the officials and the
 * signatures open to whoever held the tablet, and after an uninstall.
 * Ported from OpenVolley src/utils/nativeBackup/androidFiles.js (OpenBeach
 * saves no scoresheet PDF on the tablet, so there are none to move).
 *
 * - moveLegacyFiles: at a start of this version, the files older versions
 *   wrote to Documents/OpenBeach/backups and logs (or to the app's external
 *   folder, their fallback) are moved in, so nothing stays behind in the
 *   public folder. Once per install (a marker file in the app folder, which
 *   "Clear all" does not touch); a file that cannot be moved (one an earlier
 *   install of the app left, on Android 11 and newer) stays where it is and
 *   is logged. The export folders below are never read.
 * - exportToDocuments: the explicit copy out (Options, Export to Documents):
 *   each match's newest backup and the activity log files into a new
 *   Documents/OpenBeach/export-<time> folder (for a USB cable or another
 *   app, as the public folder was). Those copies are the user's: the app
 *   never moves or deletes them.
 *
 * Every function takes the @capacitor/filesystem module ({ Filesystem,
 * Directory, Encoding }) and never throws for one file.
 */

import { appFilesDirectories, BACKUP_SUBDIR } from './platform_beach'
import { LATEST_FILE } from './rotation_beach'
import { LOG_SUBDIR } from '../activity/fileSink_beach'

export const EXPORT_PARENT = 'OpenBeach'
// In the app folder: "Clear all" (localStorage.clear) and a storage that
// refuses writes leave it, so the move never runs twice
export const MOVED_MARKER = 'OpenBeach/legacy-files-moved'

const message = (e) => e?.message || String(e)

async function list(Filesystem, path, directory) {
  try {
    const { files } = await Filesystem.readdir({ path, directory })
    return files || []
  } catch {
    return [] // no such folder
  }
}

async function mkdirs(Filesystem, path, directory) {
  try {
    await Filesystem.mkdir({ path, directory, recursive: true })
  } catch (e) {
    if (!/exist/i.test(message(e))) throw e
  }
}

async function exists(Filesystem, path, directory) {
  try {
    await Filesystem.stat({ path, directory })
    return true
  } catch {
    return false
  }
}

// `name`, else `name (1).ext`, `(2)` ...: a file already there is never overwritten
async function freeName(Filesystem, folder, directory, name) {
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 0; n < 1000; n++) {
    const candidate = n === 0 ? name : `${stem} (${n})${ext}`
    if (!(await exists(Filesystem, `${folder}/${candidate}`, directory))) return candidate
  }
  return `${stem} (${Date.now()})${ext}`
}

/** The app's own folder for these files (the first of platform_beach.appFilesDirectories that takes a folder). */
export async function appDirectory({ Filesystem, Directory }, subdir = BACKUP_SUBDIR) {
  for (const directory of appFilesDirectories(Directory)) {
    try {
      await mkdirs(Filesystem, subdir, directory)
      return directory
    } catch {
      // the next one
    }
  }
  throw new Error('No writable app folder on this device')
}

// Is `path` in directory a the same folder as in b? (iOS maps Documents,
// Data and External to one folder: moving would delete what it copies)
async function sameFolder(Filesystem, path, a, b) {
  if (a === b) return true
  if (typeof Filesystem.getUri !== 'function') return false
  try {
    const [x, y] = await Promise.all([Filesystem.getUri({ path, directory: a }), Filesystem.getUri({ path, directory: b })])
    return !!x?.uri && x.uri === y?.uri
  } catch {
    return false
  }
}

// May the app read the public folders without asking? (Android 10 and older:
// only with the storage permission, which a start must never ask for)
async function publicFoldersReadable(Filesystem) {
  try {
    if (typeof Filesystem.checkPermissions !== 'function') return true
    const { publicStorage } = await Filesystem.checkPermissions()
    return publicStorage === 'granted'
  } catch {
    return false
  }
}

/**
 * Moves the backups and activity logs an older version left in
 * Documents/OpenBeach (and the external folder) into the app's own folder,
 * deleting them there. Once per install (the MOVED_MARKER file in the app
 * folder); resolves to { moved, left }.
 */
export async function moveLegacyFiles(fs, { log = console } = {}) {
  const { Filesystem, Directory, Encoding } = fs
  for (const directory of appFilesDirectories(Directory)) {
    if (await exists(Filesystem, MOVED_MARKER, directory)) return { moved: 0, left: 0, skipped: true }
  }
  const backupDir = await appDirectory(fs, BACKUP_SUBDIR)
  const logDir = await appDirectory(fs, LOG_SUBDIR)
  const sources = []
  if (Directory.Documents && await publicFoldersReadable(Filesystem)) sources.push(Directory.Documents)
  if (Directory.External && Directory.External !== backupDir) sources.push(Directory.External)
  let moved = 0
  let left = 0
  const move = async (from, directory, to, toDirectory) => {
    try {
      await Filesystem.copy({ from, to, directory, toDirectory })
      await Filesystem.deleteFile({ path: from, directory })
      moved++
    } catch (e) {
      left++
      log.warn?.(`[AndroidFiles] cannot move ${from}:`, message(e))
    }
  }
  for (const source of sources) {
    const backupsHere = await sameFolder(Filesystem, BACKUP_SUBDIR, source, backupDir)
    for (const entry of backupsHere ? [] : await list(Filesystem, BACKUP_SUBDIR, source)) {
      if (entry.type !== 'directory') continue
      const from = `${BACKUP_SUBDIR}/${entry.name}`
      await mkdirs(Filesystem, from, backupDir).catch(() => {})
      for (const file of await list(Filesystem, from, source)) {
        if (file.type === 'directory') continue
        // the app's own latest.json (written since this start) is newer
        if (file.name === LATEST_FILE && await exists(Filesystem, `${from}/${LATEST_FILE}`, backupDir)) {
          try {
            await Filesystem.deleteFile({ path: `${from}/${file.name}`, directory: source })
          } catch { left++ }
          continue
        }
        await move(`${from}/${file.name}`, source, `${from}/${file.name}`, backupDir)
      }
      try { await Filesystem.rmdir({ path: from, directory: source }) } catch { /* not empty */ }
    }
    const logsHere = await sameFolder(Filesystem, LOG_SUBDIR, source, logDir)
    for (const file of logsHere ? [] : await list(Filesystem, LOG_SUBDIR, source)) {
      if (file.type === 'directory') continue
      const path = `${LOG_SUBDIR}/${file.name}`
      if (!(await exists(Filesystem, path, logDir))) {
        await move(path, source, path, logDir)
        continue
      }
      // the day this version already writes to: the older lines join it
      try {
        const encoding = Encoding?.UTF8 || 'utf8'
        const { data } = await Filesystem.readFile({ path, directory: source, encoding })
        await Filesystem.appendFile({ path, data, directory: logDir, encoding })
        await Filesystem.deleteFile({ path, directory: source })
        moved++
      } catch (e) {
        left++
        log.warn?.(`[AndroidFiles] cannot move ${path}:`, message(e))
      }
    }
    for (const path of [BACKUP_SUBDIR, LOG_SUBDIR, EXPORT_PARENT]) {
      try { await Filesystem.rmdir({ path, directory: source }) } catch { /* not empty, or not there */ }
    }
  }
  if (moved || left) log.info?.(`[AndroidFiles] moved ${moved} file(s) into the app folder${left ? `, ${left} could not be moved` : ''}`)
  try {
    await Filesystem.writeFile({ path: MOVED_MARKER, data: '1', directory: backupDir, encoding: Encoding?.UTF8 || 'utf8', recursive: true })
  } catch (e) {
    log.warn?.('[AndroidFiles] the move runs again next start:', message(e))
  }
  return { moved, left }
}

const stampOf = (date) => date.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')

/**
 * Copies each match's newest backup (latest.json, as <match folder>.json)
 * and the activity log files into a new
 * Documents/OpenBeach/export-<yyyymmdd-hhmm> folder.
 * @returns {Promise<{ folder: string, backups: number, logs: number, failed: number }>}
 */
export async function exportToDocuments(fs, { now = new Date(), log = console } = {}) {
  const { Filesystem, Directory } = fs
  if (!Directory.Documents) throw new Error('No Documents folder on this device')
  // a new folder each time: an earlier export is never overwritten
  const target = `${EXPORT_PARENT}/${await freeName(Filesystem, EXPORT_PARENT, Directory.Documents, `export-${stampOf(now)}`)}`
  let backups = 0
  let logs = 0
  let failed = 0
  const copy = async (from, directory, to) => {
    try {
      await Filesystem.copy({ from, to, directory, toDirectory: Directory.Documents })
      return true
    } catch (e) {
      failed++
      log.warn?.(`[AndroidFiles] cannot export ${from}:`, message(e))
      return false
    }
  }
  for (const directory of appFilesDirectories(Directory)) {
    const matches = (await list(Filesystem, BACKUP_SUBDIR, directory)).filter(e => e.type === 'directory')
    if (matches.length) await mkdirs(Filesystem, `${target}/backups`, Directory.Documents)
    for (const entry of matches) {
      const files = await list(Filesystem, `${BACKUP_SUBDIR}/${entry.name}`, directory)
      if (!files.some(f => f.name === LATEST_FILE)) continue
      if (await copy(`${BACKUP_SUBDIR}/${entry.name}/${LATEST_FILE}`, directory, `${target}/backups/${entry.name}.json`)) backups++
    }
    const logFiles = (await list(Filesystem, LOG_SUBDIR, directory)).filter(f => f.type !== 'directory')
    if (logFiles.length) await mkdirs(Filesystem, `${target}/logs`, Directory.Documents)
    for (const file of logFiles) {
      if (await copy(`${LOG_SUBDIR}/${file.name}`, directory, `${target}/logs/${file.name}`)) logs++
    }
  }
  if (!backups && !logs && failed) throw new Error(`no file could be copied (${failed})`)
  return { folder: `Documents/${target}`, backups, logs, failed }
}
