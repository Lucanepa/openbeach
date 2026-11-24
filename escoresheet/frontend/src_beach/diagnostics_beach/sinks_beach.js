/**
 * Where diagnostics lines go:
 *   desktop (Tauri):  <log dir>/diagnostics-YYYY-MM-DD.jsonl through the Rust
 *                     command diagnostics_append (the OpenVolley repo's
 *                     src-tauri/src/diagnostics.rs, which the OpenBeach desktop
 *                     app is built from: 20 MB a day, 7 days). Its log
 *                     folder on Linux and Windows is OpenVolley's
 *                     (<data dir>/OpenVolley/logs, activity.rs log_root),
 *                     so page.load says product 'openbeach'; the window's native
 *                     events are switched with diagnostics_native. Only the
 *                     scoretable window ("main") may call them
 *                     (capabilities/diagnostics.json): another app window
 *                     (a referee or scoresheet opened from the scoretable)
 *                     sends its lines to the scoretable, which writes them
 *                     (popupForward_beach.js; index_beach.js picks that sink).
 *   browser, Android: a ring buffer in its own IndexedDB database
 *                     (openbeach-diagnostics, at most RING_MAX_ROWS lines,
 *                     RING_MAX_AGE_MS), exported from Options as a .jsonl file.
 * A sink never throws into the app.
 */
import Dexie from 'dexie'

export const RING_DB_NAME = 'openbeach-diagnostics'
export const RING_MAX_ROWS = 50000
export const RING_MAX_AGE_MS = 7 * 24 * 3600 * 1000
// prune every this many writes (and at open)
const RING_PRUNE_EVERY = 20
const TAURI_CHUNK = 500
const MAIN_WINDOW = 'main'

export function tauriSink(invoke) {
  return {
    kind: 'file',
    async write(lines) {
      for (let i = 0; i < lines.length; i += TAURI_CHUNK) {
        await invoke('diagnostics_append', { lines: lines.slice(i, i + TAURI_CHUNK) })
      }
    },
    setNative: (on) => invoke('diagnostics_native', { on }).catch(() => false),
    openFolder: () => invoke('activity_open_dir').then(() => true, () => false),
    exportText: null,
    clear: null
  }
}

/**
 * The capped IndexedDB ring buffer.
 * @param {{ name?: string, maxRows?: number, maxAgeMs?: number, now?: () => number, indexedDB?: any, IDBKeyRange?: any }} [opts]
 */
export function ringSink({ name = RING_DB_NAME, maxRows = RING_MAX_ROWS, maxAgeMs = RING_MAX_AGE_MS, now = () => Date.now(), indexedDB, IDBKeyRange } = {}) {
  const db = new Dexie(name, indexedDB ? { indexedDB, IDBKeyRange } : undefined)
  db.version(1).stores({ lines: '++id, at' })
  let writes = 0

  async function prune() {
    const cutoff = now() - maxAgeMs
    await db.lines.where('at').below(cutoff).delete()
    const count = await db.lines.count()
    if (count > maxRows) {
      const ids = await db.lines.orderBy('id').limit(count - maxRows).primaryKeys()
      await db.lines.bulkDelete(ids)
    }
  }

  return {
    kind: 'ring',
    db,
    async write(lines) {
      const at = now()
      await db.lines.bulkAdd(lines.map(line => ({ at, line })))
      writes++
      if (writes === 1 || writes % RING_PRUNE_EVERY === 0) await prune()
    },
    prune,
    setNative: async () => false,
    openFolder: async () => false,
    /** Every stored line, oldest first, one per line. */
    async exportText() {
      const rows = await db.lines.orderBy('id').toArray()
      return rows.map(r => r.line).join('\n') + (rows.length ? '\n' : '')
    },
    clear: () => db.lines.clear(),
    count: () => db.lines.count()
  }
}

/** The desktop app's invoke when this page is its scoretable window, else null. */
export function scoretableInvoke(win = typeof window !== 'undefined' ? window : undefined) {
  const internals = win?.__TAURI_INTERNALS__
  if (typeof internals?.invoke !== 'function') return null
  const label = internals.metadata?.currentWindow?.label
  if (label && label !== MAIN_WINDOW) return null
  return (cmd, args) => internals.invoke(cmd, args)
}

/** The sink of this platform. */
export function createDiagnosticsSink(win = typeof window !== 'undefined' ? window : undefined) {
  const invoke = scoretableInvoke(win)
  if (invoke) return tauriSink(invoke)
  return ringSink()
}
