/**
 * Diagnostics mode (off by default): a compact JSON-lines account of page
 * loads and reloads, layout sizes and jumps, dialogs, user actions, scorer
 * actions and their database transactions, enough to explain from the log
 * alone why the scoreboard pulsed, a dialog flashed or the app reloaded.
 * The port of OpenVolley's src/diagnostics: the same switch, line format and
 * desktop commands, so one runbook (OpenVolley docs/diagnostics-mode.md)
 * covers both apps.
 *
 *   switch_beach.js    on / off (Options, ?diag=1, OPENVOLLEY_DIAGNOSTICS=1)
 *   recorder_beach.js  diag(kind, data): the line format, buffer, flush
 *   redact_beach.js    what a line may carry (no PIN, password, token, signature)
 *   sinks_beach.js     desktop: diagnostics-<date>.jsonl (Rust); else IndexedDB ring
 *   watchers_beach.js  page / geometry / dialog / click observers
 *   jumps_beach.js     size-comes-back detection
 *   reload_beach.js    reloadWithReason(): every app reload with its reason
 *   commits_beach.js   React commits per action (useDiagCommits)
 *   dexie_beach.js     Dexie transactions
 *
 * installDiagnostics() runs first in the scorer and referee entries. Off, it
 * only reads the switch: nothing is observed or stored.
 */
import { diagnosticsSwitch, diagnosticsOptionOn, setDiagnosticsOption } from './switch_beach'
import { startRecorder, stopRecorder, diag, diagActive, diagSink, flushDiagnostics } from './recorder_beach'
import { createDiagnosticsSink } from './sinks_beach'
import { installWatchers } from './watchers_beach'
import { setCommitProfiling, flushCommitCounts } from './commits_beach'
import { installDexieDiagnostics } from './dexie_beach'

export { diag, diagActive, noteAction } from './recorder_beach'
export { reloadWithReason } from './reload_beach'
export { useDiagCommits } from './commits_beach'

/** The running app version (vite define __APP_VERSION__). */
export function appVersion() {
  try {
    // eslint-disable-next-line no-undef
    return typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__).slice(0, 32) : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** 'web' | 'tauri-linux' | 'tauri-windows' | 'tauri-macos' | 'android' | 'ios' */
export function platformName(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return 'web'
  try {
    if (typeof win.__TAURI_INTERNALS__?.invoke === 'function') {
      const ua = String(win.navigator?.userAgent || '')
      if (/windows/i.test(ua)) return 'tauri-windows'
      if (/mac os/i.test(ua)) return 'tauri-macos'
      return 'tauri-linux'
    }
    if (win.Capacitor?.isNativePlatform?.()) {
      return win.Capacitor.getPlatform?.() === 'ios' ? 'ios' : 'android'
    }
  } catch {
    // a half-initialised bridge is treated as a browser
  }
  return 'web'
}

let state = { on: false, source: null }
let stopWatchers = null
let appName = null

function start({ db, win, source }) {
  if (diagActive()) return
  const sink = createDiagnosticsSink(win)
  startRecorder({ sink })
  Promise.resolve(sink.setNative?.(true)).catch(() => {})
  if (db) installDexieDiagnostics(db)
  stopWatchers = installWatchers({ win, appVersion: appVersion(), platform: platformName(win), source, app: appName })
  state = { on: true, source }
}

/**
 * Start diagnostics when the switch says so (once, before the first render).
 * @param {{ db?: import('dexie').Dexie, win?: Window, app?: string }} [opts]
 *   app: which page this is ('scorer', 'referee'), for the page.load line
 * @returns {{ on: boolean, source: string|null }}
 */
export function installDiagnostics({ db = null, win = typeof window !== 'undefined' ? window : undefined, app = null } = {}) {
  if (!win) return state
  appName = app
  const sw = diagnosticsSwitch({ win })
  if (!sw.on) {
    state = { on: false, source: sw.source }
    return state
  }
  // React commits are counted only when on from the start (commits_beach.js)
  setCommitProfiling(true)
  start({ db, win, source: sw.source })
  return state
}

/** { on, source, option, sink: 'file'|'ring'|null } for Options. */
export function diagnosticsState() {
  return { ...state, option: diagnosticsOptionOn(), sink: diagSink()?.kind || null }
}

/**
 * Options > Diagnostics mode. On: records from now on (and from the start of
 * the next load). Off: stops, unless the URL or the desktop's environment
 * switched it on for this run.
 */
export async function setDiagnosticsEnabled(on, { db = null, win = typeof window !== 'undefined' ? window : undefined } = {}) {
  setDiagnosticsOption(on)
  if (on && !state.on) start({ db, win, source: 'options' })
  else if (!on && state.on && state.source === 'options') {
    diag('diag.stop', { by: 'options' })
    flushCommitCounts()
    try { stopWatchers?.() } catch { /* ignore */ }
    stopWatchers = null
    await Promise.resolve(diagSink()?.setNative?.(false)).catch(() => {})
    await stopRecorder()
    state = { on: false, source: null }
  }
  return diagnosticsState()
}

/**
 * Options > Export diagnostics: the desktop app opens the log folder (the
 * files are there); elsewhere the stored lines download as a .jsonl file.
 * Returns 'folder' | 'file' | 'empty' | false.
 */
export async function exportDiagnostics({ win = typeof window !== 'undefined' ? window : undefined } = {}) {
  await flushDiagnostics()
  const sink = diagSink() || createDiagnosticsSink(win)
  if (sink.kind === 'file') return (await sink.openFolder()) ? 'folder' : false
  const text = await sink.exportText()
  if (!text) return 'empty'
  const blob = new Blob([text], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const link = win.document.createElement('a')
  link.href = url
  link.download = `openbeach-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  win.document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'file'
}
