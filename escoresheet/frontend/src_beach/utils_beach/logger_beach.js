/**
 * Logger - Captures console logs and backs them up to the cloud storage.
 *
 * Log upload (ported from OpenVolley src/utils/logger.js, d2cc2851 and
 * 9616bd4f): every buffer entry carries a sequence number that keeps growing
 * across reloads (taken from the clock). uploadLogsToCloud sends only the
 * entries after the last successful upload (cursor in localStorage), as a new
 * chunk file logs/<game folder>/logs_<utc>_<seq>.txt: nothing already up there
 * is downloaded or sent again, and no file grows towards the storage cap. It
 * downloaded logs.txt and uploaded it again with the whole 1000-line buffer
 * appended, after every action: about 14 MB per rally once the file neared
 * the 5 MiB cap, every upload refused with 413 from then on, and every later
 * match with the same game number started at the cap (stress test
 * 2026-10-25). The every-action backup sends logs at most once a minute (and
 * at once when EARLY_UPLOAD_UNSENT lines wait); set end, match end, coin toss
 * and match creation send at once. A chunk the server refuses for good (413,
 * a bad path) is skipped, never sent again. Entries not uploaded yet are kept
 * in localStorage when the page is hidden or closed and come back at the next
 * start, for the same account only (sign-out and account deletion drop them).
 * Nothing is sent without a session the server has not refused.
 */

import { apiStorage, canUseStorage, AUTH_TOKEN_STORAGE_KEY } from '../lib_beach/apiClient_beach'
import { isBackendAvailable } from '../utils_beach/backendConfig_beach'

// In-memory log buffer
let logBuffer = []
const MAX_BUFFER_SIZE = 1000

// Last backup tracking to avoid duplicate uploads
let lastBackupTime = 0
let isBackupInProgress = false
// The newest action's backup skipped by the window or a running upload, and
// the timer that takes it (triggerContinuousBackup)
let skippedBackup = null
let skippedBackupTimer = null

// Grows across reloads: microseconds of the clock, or one more than the last
let lastSeq = 0
function nextSeq(now = Date.now()) {
  // First entry of this page load: never at or below what was uploaded before
  if (lastSeq === 0) lastSeq = readCursor()
  lastSeq = Math.max(lastSeq + 1, now * 1000)
  return lastSeq
}

// Original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
}

/**
 * Format a log entry
 */
function formatLogEntry(level, args) {
  const now = Date.now()
  const timestamp = new Date(now).toISOString()
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    }
    return String(arg)
  }).join(' ')

  return { seq: nextSeq(now), timestamp, level, message }
}

/**
 * Add entry to buffer
 */
function addToBuffer(entry) {
  logBuffer.push(entry)
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    const evicted = logBuffer.length - MAX_BUFFER_SIZE
    const cursor = readCursor()
    for (let i = 0; i < evicted; i++) if (logBuffer[i].seq > cursor) droppedUnsent++
    logBuffer = logBuffer.slice(-MAX_BUFFER_SIZE)
  }
}

let pageListenersInstalled = false

/**
 * Intercept console methods
 */
export function initLogger() {
  restorePendingLogs()

  if (typeof window !== 'undefined' && !pageListenersInstalled) {
    pageListenersInstalled = true
    // Lines not uploaded yet survive a reload or a closed tab
    window.addEventListener('pagehide', persistPendingLogs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistPendingLogs()
    })
  }

  console.log = (...args) => {
    addToBuffer(formatLogEntry('log', args))
    originalConsole.log(...args)
  }

  console.warn = (...args) => {
    addToBuffer(formatLogEntry('warn', args))
    originalConsole.warn(...args)
  }

  console.error = (...args) => {
    addToBuffer(formatLogEntry('error', args))
    originalConsole.error(...args)
  }

  console.info = (...args) => {
    addToBuffer(formatLogEntry('info', args))
    originalConsole.info(...args)
  }

  console.debug = (...args) => {
    addToBuffer(formatLogEntry('debug', args))
    originalConsole.debug(...args)
  }

}

/**
 * Get all captured logs
 */
export function getLogs() {
  return [...logBuffer]
}

/**
 * Clear log buffer
 */
export function clearLogs() {
  logBuffer = []
}

/**
 * Export logs as string
 */
export function exportLogsAsText() {
  return logBuffer.map(entry =>
    `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
  ).join('\n')
}

/**
 * Download logs as file
 */
export function downloadLogs(matchId = null) {
  const text = exportLogsAsText()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = matchId
    ? `logs_match_${matchId}_${timestamp}.txt`
    : `logs_${timestamp}.txt`

  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return filename
}

// ── Log upload ──────────────────────────────────────────────────────────────

/** localStorage: seq of the last entry uploaded (any game folder). */
export const LOG_CURSOR_KEY = 'ob_log_upload_cursor'
/** localStorage: entries not uploaded yet, saved when the page is hidden/closed. */
export const LOG_PENDING_KEY = 'ob_log_pending'
/** The every-action backup sends logs at most this often (set/match end send at once). */
export const LOG_UPLOAD_MIN_INTERVAL_MS = 60 * 1000
/** One chunk stays well under the 5 MiB storage cap; the oldest lines are cut first. */
export const MAX_LOG_CHUNK_BYTES = 1024 * 1024
/** The every-action backup uploads at once (no 60 s wait) when this many lines wait. */
export const EARLY_UPLOAD_UNSENT = 600
const MAX_PENDING_ENTRIES = 500
const MAX_PENDING_CHARS = 512 * 1024

let memoryCursor = 0
let cursorLoaded = false
let droppedUnsent = 0 // unsent lines evicted from the buffer since the last upload
let lastLogUploadAt = 0
let logUploadInFlight = false
let queuedLogUpload = null

/** The signed-in user's id from the stored session, or null. */
function storedSessionUserId() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) : null
    const session = raw ? JSON.parse(raw) : null
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

function readStoredCursor() {
  try {
    const stored = Number(localStorage.getItem(LOG_CURSOR_KEY))
    return Number.isFinite(stored) ? stored : 0
  } catch {
    return 0 // storage blocked: memory only
  }
}

// This tab's cursor: the stored one once at start, then only its own uploads
function readCursor() {
  if (!cursorLoaded) {
    cursorLoaded = true
    memoryCursor = Math.max(memoryCursor, readStoredCursor())
  }
  return memoryCursor
}

function writeCursor(seq) {
  readCursor()
  if (seq > memoryCursor) memoryCursor = seq
  // Never move the shared copy back (another tab may have uploaded later lines)
  const stored = Math.max(readStoredCursor(), memoryCursor)
  try { localStorage.setItem(LOG_CURSOR_KEY, String(stored)) } catch { /* memory only */ }
}

/** Entries the cloud does not have yet (after this tab's upload cursor). */
export function getUnsentLogs() {
  const cursor = readCursor()
  return logBuffer.filter(e => e.seq > cursor)
}

function readPending() {
  const raw = localStorage.getItem(LOG_PENDING_KEY)
  if (!raw) return null
  const saved = JSON.parse(raw)
  if (saved && Array.isArray(saved.entries)) return { uid: saved.uid ?? null, entries: saved.entries }
  return null
}

/**
 * Keep the entries not uploaded yet for the next start of the app (pagehide,
 * tab hidden), tagged with the signed-in account. Lines another scorer tab of
 * the same account saved are merged, not overwritten. Capped; the newest
 * entries win.
 */
export function persistPendingLogs() {
  try {
    const uid = storedSessionUserId()
    let previous = []
    try {
      const saved = readPending()
      if (saved && saved.uid === uid) previous = saved.entries
    } catch { /* unreadable: overwrite */ }
    const bySeq = new Map()
    for (const e of [...previous, ...getUnsentLogs()]) {
      if (e && Number.isFinite(e.seq) && typeof e.message === 'string') bySeq.set(e.seq, e)
    }
    const pending = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_PENDING_ENTRIES)
    let chars = 0
    let from = pending.length
    while (from > 0 && chars + pending[from - 1].message.length <= MAX_PENDING_CHARS) {
      from--
      chars += pending[from].message.length
    }
    const kept = pending.slice(from)
    if (kept.length === 0) localStorage.removeItem(LOG_PENDING_KEY)
    else localStorage.setItem(LOG_PENDING_KEY, JSON.stringify({ uid, entries: kept }))
  } catch { /* storage full or blocked */ }
}

/** Remove uploaded entries from the saved pending lines (this tab saved them earlier). */
function prunePending(uploaded) {
  try {
    const saved = readPending()
    if (!saved) return
    const seqs = new Set(uploaded.map(e => e.seq))
    const left = saved.entries.filter(e => !seqs.has(e?.seq))
    if (left.length === saved.entries.length) return
    if (left.length === 0) localStorage.removeItem(LOG_PENDING_KEY)
    else localStorage.setItem(LOG_PENDING_KEY, JSON.stringify({ uid: saved.uid, entries: left }))
  } catch { /* storage blocked */ }
}

/**
 * Forget every line not uploaded yet (saved and in memory): sign-out and
 * account deletion, so the next account on this device never uploads them.
 */
export function discardUnsentLogs() {
  try { localStorage.removeItem(LOG_PENDING_KEY) } catch { /* storage blocked */ }
  const last = Math.max(lastSeq, logBuffer.length > 0 ? logBuffer[logBuffer.length - 1].seq : 0)
  if (last > 0) writeCursor(last)
  droppedUnsent = 0
}

/**
 * Put the entries saved by persistPendingLogs back into the buffer, only when
 * the same account (or none) is signed in now. Not filtered by the shared
 * cursor: another scorer tab may have uploaded later lines; an upload removes
 * its lines from the saved copy instead (prunePending).
 * @returns {number} how many came back
 */
export function restorePendingLogs() {
  try {
    const saved = readPending()
    localStorage.removeItem(LOG_PENDING_KEY)
    if (!saved || saved.uid !== storedSessionUserId()) return 0
    const have = new Set(logBuffer.map(e => e.seq))
    const restored = saved.entries.filter(e =>
      e && Number.isFinite(e.seq) && !have.has(e.seq) && typeof e.message === 'string')
    if (restored.length === 0) return 0
    for (const e of restored) if (e.seq > lastSeq) lastSeq = e.seq
    // This tab sends them, even below the shared cursor (another tab's uploads)
    const firstRestored = Math.min(...restored.map(e => e.seq))
    if (readCursor() >= firstRestored) memoryCursor = firstRestored - 1
    logBuffer = [...restored, ...logBuffer].sort((a, b) => a.seq - b.seq).slice(-MAX_BUFFER_SIZE)
    return restored.length
  } catch {
    return 0
  }
}

function formatEntries(entries) {
  return entries.map(entry =>
    `[${entry.timestamp}] [${String(entry.level).toUpperCase()}] ${entry.message}`
  ).join('\n')
}

const utf8Length = (text) => new TextEncoder().encode(text).length

/** Text of one upload chunk, cut from the oldest lines down to maxBytes. */
export function buildLogChunk(entries, maxBytes = MAX_LOG_CHUNK_BYTES) {
  const text = formatEntries(entries)
  // A UTF-8 character is at most 4 bytes (3 per UTF-16 unit)
  if (text.length * 3 <= maxBytes || utf8Length(text) <= maxBytes) return text
  let kept = entries
  let body = text
  while (kept.length > 1 && utf8Length(body) > maxBytes - 128) {
    kept = kept.slice(Math.ceil(kept.length / 10))
    body = formatEntries(kept)
  }
  return `[logger] ${entries.length - kept.length} older lines left out (chunk size cap)\n${body}`
}

// 4xx other than 401 / 408 / 429: sending the same chunk again cannot succeed
function isPermanentUploadError(error) {
  const status = error?.status ?? 0
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429
}

// yyyymmdd_hhmmss (UTC)
const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)

/**
 * Upload the log lines added since the last successful upload, as a new
 * chunk file in the game's folder. Without a session, or with nothing new,
 * nothing is sent; the lines wait for the next upload.
 * @param {string|null} matchId - Match ID for organizing logs
 * @param {string|number|null} gameNumber - Game number for human-readable folder names
 * @param {{minIntervalMs?: number}} [options] - skip when the last upload is more recent
 * @returns {Promise<string|null>} the uploaded path, or null
 */
export async function uploadLogsToCloud(matchId = null, gameNumber = null, { minIntervalMs = 0 } = {}) {
  if (!isBackendAvailable()) return null
  // Storage needs a session: signed out, nothing is sent (no 401s)
  if (!canUseStorage()) return null
  if (logUploadInFlight) {
    // An immediate upload (set/match end) runs right after the one in flight
    if (!minIntervalMs) queuedLogUpload = { matchId, gameNumber }
    return null
  }
  const now = Date.now()
  if (minIntervalMs > 0 && now - lastLogUploadAt < minIntervalMs) return null

  const entries = getUnsentLogs()
  if (entries.length === 0) return null
  const lastEntrySeq = entries[entries.length - 1].seq
  const dropped = droppedUnsent
  const chunk = buildLogChunk(entries)
  const body = dropped > 0 ? `[logger] ${dropped} lines dropped (buffer full before upload)\n${chunk}` : chunk

  // Use gameNumber if available for human-readable paths, fall back to matchId
  const folderName = gameNumber ? `game_${gameNumber}` : (matchId ? `match_${matchId}` : 'general')
  const filename = `logs/${folderName}/logs_${utcStamp(now)}_${lastEntrySeq.toString(36)}.txt`

  logUploadInFlight = true
  lastLogUploadAt = now
  try {
    const { data, error } = await apiStorage
      .from('backup')
      .upload(filename, body, {
        contentType: 'text/plain',
        upsert: true // the same chunk sent again replaces itself
      })

    if (error) {
      if (isPermanentUploadError(error)) {
        // Refused for good (size, path): skip these lines rather than retry forever
        writeCursor(lastEntrySeq)
        prunePending(entries)
        droppedUnsent = Math.max(0, droppedUnsent - dropped)
        console.warn('[Logger] Log upload refused, these lines are skipped:', error)
      } else {
        console.warn('[Logger] Log upload failed, will retry:', error)
      }
      return null
    }

    writeCursor(lastEntrySeq)
    prunePending(entries)
    droppedUnsent = Math.max(0, droppedUnsent - dropped)
    return data?.path || filename
  } catch (err) {
    console.warn('[Logger] Error uploading logs:', err)
    return null
  } finally {
    logUploadInFlight = false
    const next = queuedLogUpload
    queuedLogUpload = null
    if (next) uploadLogsToCloud(next.matchId, next.gameNumber).catch(() => {})
  }
}

/** Test hook: forget the buffer, cursor and timers. */
export function resetLoggerForTests() {
  logBuffer = []
  lastSeq = 0
  memoryCursor = 0
  cursorLoaded = false
  droppedUnsent = 0
  lastLogUploadAt = 0
  logUploadInFlight = false
  queuedLogUpload = null
  lastBackupTime = 0
  isBackupInProgress = false
  skippedBackup = null
  if (skippedBackupTimer) clearTimeout(skippedBackupTimer)
  skippedBackupTimer = null
}

/**
 * Upload match backup JSON to Supabase storage (sequential, with state summary)
 * Uses game_pin for folder structure so backups can be found by PIN
 */
export async function uploadBackupToCloud(matchId, backupData) {
  if (!isBackendAvailable()) {
    console.warn('[Logger] Supabase not configured - cannot upload backup')
    return null
  }

  // Storage needs a session: signed out, nothing is sent (no 401s)
  if (!canUseStorage()) return null

  const gameN = backupData?.match?.gameN || backupData?.match?.game_n || 1

  // Get set and score info for filename
  let setIndex = 1
  let leftScore = 0
  let rightScore = 0
  if (backupData?.sets?.length > 0) {
    const latestSet = backupData.sets.sort((a, b) => (b.index || 0) - (a.index || 0))[0]
    if (latestSet) {
      setIndex = latestSet.index || 1
      leftScore = latestSet.team1Points || 0
      rightScore = latestSet.team2Points || 0
    }
  }

  // backups/backup_g{gameN}/backup_g{gameN}_p{PIN tag}_{utc}_set..., see backupFileName
  const filename = `${backupFolder(gameN)}/${backupFileName(gameN, backupData?.match?.gamePin ?? backupData?.match?.game_pin, { setIndex, leftScore, rightScore })}`

  try {
    const { data, error } = await apiStorage
      .from('backup')
      .upload(filename, JSON.stringify(backupData, null, 2), {
        contentType: 'application/json',
        upsert: false // Don't overwrite - create new file
      })

    if (error) {
      console.error('[Logger] Failed to upload backup:', error)
      return null
    }

    return data?.path || filename
  } catch (err) {
    console.error('[Logger] Error uploading backup:', err)
    return null
  }
}

// ── Cloud backups of a match ───────────────────────────────────────────────
//
// The folder is the account's backups of a game NUMBER, and beach game
// numbers start at 1 again at every tournament: last weekend's game 5 and
// today's share it. The listing was by name (backup_g{n}_set{s}_scoreleft..),
// which is not time order, capped at 100 by the server, and the game PIN was
// not used: a restore listed 97-99 rows of the older match, the newest
// backup of today's could be missing, and a wrong PIN gave the same list
// (stress test 2026-10-25). A backup name now carries a tag of the match's
// game PIN and then its UTC time, so the server lists the backups of the
// match the PIN names, newest first. Names of older app versions (no tag)
// are listed by their file time when the match has none of the new ones.

export const backupFolder = (gameN) => `backups/backup_g${gameN}`

/**
 * A short tag of a game PIN for backup names (FNV-1a, 8 hex digits), or null
 * without one. Not a secret: the files are only listed to their account.
 */
export function backupPinTag(gamePin) {
  const pin = String(gamePin ?? '').trim()
  if (!pin) return null
  let h = 0x811c9dc5
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * File name of a cloud backup:
 * backup_g{gameN}_p{PIN tag}_{yyyymmdd}_{hhmmss}_{ms}_set{s}_scoreleft{l}_scoreright{r}.json
 * (without a PIN: the older backup_g{gameN}_set{s}_..._{yyyymmdd}_{hhmmss}_{ms}.json)
 */
export function backupFileName(gameN, gamePin, { setIndex = 1, leftScore = 0, rightScore = 0, now = new Date() } = {}) {
  const iso = now.toISOString()
  const utcDate = iso.slice(0, 10).replace(/-/g, '') // yyyymmdd
  const utcTime = iso.slice(11, 19).replace(/:/g, '') // hhmmss
  const ms = String(now.getUTCMilliseconds()).padStart(3, '0')
  const tag = backupPinTag(gamePin)
  if (!tag) return `backup_g${gameN}_set${setIndex}_scoreleft${leftScore}_scoreright${rightScore}_${utcDate}_${utcTime}_${ms}.json`
  return `backup_g${gameN}_p${tag}_${utcDate}_${utcTime}_${ms}_set${setIndex}_scoreleft${leftScore}_scoreright${rightScore}.json`
}

/** The parts of a backup file name (either form), or null. */
export function parseBackupFileName(name) {
  let m = /^backup_g(\d+)_p([0-9a-f]{8})_(\d{8})_(\d{6})_(\d{3})_set(\d+)_scoreleft(\d+)_scoreright(\d+)\.json$/.exec(String(name || ''))
  if (m) return { gameN: parseInt(m[1]), pinTag: m[2], date: m[3], time: m[4], ms: m[5], setIndex: parseInt(m[6]), leftScore: parseInt(m[7]), rightScore: parseInt(m[8]) }
  m = /^backup_g(\d+)_set(\d+)_scoreleft(\d+)_scoreright(\d+)_(\d{8})_(\d{6})_(\d{3})\.json$/.exec(String(name || ''))
  if (m) return { gameN: parseInt(m[1]), pinTag: null, setIndex: parseInt(m[2]), leftScore: parseInt(m[3]), rightScore: parseInt(m[4]), date: m[5], time: m[6], ms: m[7] }
  return null
}

const BACKUP_LIST_LIMIT = 100

/**
 * The cloud backups of the match with game number `gameN` and game PIN
 * `gamePin`, newest first (at most 100): the ones named with its PIN tag,
 * else (backups of an app before the tag) the untagged ones by file time.
 * Throws the storage error.
 * @returns {Promise<Array<{ name, path, created_at, size, gameN?, setIndex?, leftScore?, rightScore?, date?, time?, ms? }>>}
 */
export async function listMatchBackups(gamePin, gameN = 1) {
  const folder = backupFolder(gameN)
  const tag = backupPinTag(gamePin)
  const entry = (f) => {
    const parts = parseBackupFileName(f.name)
    // eslint-disable-next-line no-unused-vars
    const { pinTag: _tag, ...info } = parts || {}
    return { name: f.name, path: `${folder}/${f.name}`, ...info, created_at: f.created_at, size: f.metadata?.size || 0 }
  }
  const listed = async (options) => {
    const { data, error } = await apiStorage.from('backup').list(folder, options)
    if (error) throw error
    return (data || []).filter(f => typeof f?.name === 'string' && f.name.endsWith('.json'))
  }
  if (tag) {
    const own = await listed({ search: `backup_g${gameN}_p${tag}_`, sortBy: { column: 'name', order: 'desc' }, limit: BACKUP_LIST_LIMIT })
    const mine = own.filter(f => parseBackupFileName(f.name)?.pinTag === tag)
    if (mine.length) return mine.map(entry)
  }
  const legacy = await listed({ search: `backup_g${gameN}_set`, sortBy: { column: 'created_at', order: 'desc' }, limit: BACKUP_LIST_LIMIT })
  return legacy.filter(f => parseBackupFileName(f.name)?.pinTag === null).map(entry)
}

/**
 * List the cloud backups of a match (see listMatchBackups)
 * @param {string} gamePin - Game PIN of the match
 * @param {number} gameN - Game number
 * @returns {Array} List of backup files with name and metadata
 */
export async function listCloudBackups(gamePin, gameN = 1) {
  if (!isBackendAvailable()) {
    console.warn('[Logger] Supabase not configured')
    return []
  }

  try {
    return await listMatchBackups(gamePin, gameN)
  } catch (err) {
    console.error('[Logger] Failed to list backups:', err)
    return []
  }
}

/**
 * Load a specific backup from cloud storage
 * @param {string} path - Full path to the backup file
 * @returns {Object} Parsed backup data
 */
export async function loadCloudBackup(path) {
  if (!isBackendAvailable()) {
    console.warn('[Logger] Supabase not configured')
    return null
  }

  try {
    const { data, error } = await apiStorage
      .from('backup')
      .download(path)

    if (error) {
      console.error('[Logger] Failed to download backup:', error)
      return null
    }

    const text = await data.text()
    return JSON.parse(text)
  } catch (err) {
    console.error('[Logger] Error loading backup:', err)
    return null
  }
}

/**
 * Format backup timestamp for display
 * @param {string} date - Date string in yyyymmdd format
 * @param {string} time - Time string in hhmmss format
 * @param {string} ms - Milliseconds string
 * @returns {string} Formatted datetime string
 */
export function formatBackupTimestamp(date, time, ms) {
  if (!date || !time) return 'Unknown'

  // Parse yyyymmdd
  const year = date.substring(0, 4)
  const month = date.substring(4, 6)
  const day = date.substring(6, 8)

  // Parse hhmmss
  const hours = time.substring(0, 2)
  const minutes = time.substring(2, 4)
  const seconds = time.substring(4, 6)

  // Create date object
  const dateObj = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`)

  // Format for display (local time)
  return dateObj.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const BACKUP_MIN_INTERVAL_MS = 2000

// One backup after the window and the running upload, for the newest action
// skipped meanwhile (its getBackupData reads the match then: the newest state)
function takeSkippedBackupLater() {
  if (skippedBackupTimer || isBackupInProgress || !skippedBackup) return
  const wait = Math.max(0, BACKUP_MIN_INTERVAL_MS - (Date.now() - lastBackupTime))
  skippedBackupTimer = setTimeout(() => {
    skippedBackupTimer = null
    const next = skippedBackup
    skippedBackup = null
    if (next) triggerContinuousBackup(next.matchId, next.getBackupData, next.gameNumber)
  }, wait)
}

/**
 * Trigger backup on every action (non-blocking, with minimal delay between uploads)
 * @param {number} matchId - Match ID
 * @param {function} getBackupData - Async function that returns backup data
 * @param {string|number|null} gameNumber - Game number for human-readable paths
 */
export async function triggerContinuousBackup(matchId, getBackupData, gameNumber = null) {
  // Signed out: nothing (the cloud would refuse it)
  if (!canUseStorage()) {
    return
  }

  // Skip while a backup is in progress (until its uploads are done: on a slow
  // link they piled up, one set per action), and within 2 seconds of the last
  // one (flooding). The newest action skipped gets one backup afterwards:
  // without it the newest cloud backup stayed an action behind when the
  // actions came quickly, and restoring it rolled the cloud back (a point
  // lost; integration smoke 2026-10-26)
  const now = Date.now()
  if (isBackupInProgress || now - lastBackupTime < BACKUP_MIN_INTERVAL_MS) {
    skippedBackup = { matchId, getBackupData, gameNumber }
    takeSkippedBackupLater()
    return
  }
  skippedBackup = null

  isBackupInProgress = true
  lastBackupTime = now

  try {
    const backupData = await getBackupData()
    if (backupData) {
      // Upload in parallel; the caller does not wait (runOrDefer), the next
      // action's backup does
      await Promise.all([
        uploadBackupToCloud(matchId, backupData),
        // Logs: only the new lines, at most once a minute (set/match end send
        // at once), or at once when the buffer is filling up
        uploadLogsToCloud(matchId, gameNumber, {
          minIntervalMs: getUnsentLogs().length >= EARLY_UPLOAD_UNSENT ? 0 : LOG_UPLOAD_MIN_INTERVAL_MS
        })
      ]).catch(() => {
        // Silent fail - don't block UI
      })
    }
  } catch (err) {
    // Silent fail
  } finally {
    isBackupInProgress = false
    takeSkippedBackupLater()
  }
}
