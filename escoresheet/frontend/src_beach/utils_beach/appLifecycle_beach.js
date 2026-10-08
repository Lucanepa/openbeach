/**
 * Closing and quitting OpenBeach, the right way for where it runs (after
 * OpenVolley's src/utils/appLifecycle.js).
 *
 * Desktop app (Tauri, OpenVolley's shell built as the beach flavour): the
 * window's close button hides the app to the tray, so it keeps serving the
 * tablets (src-tauri/src/lifecycle.rs). The app sends `ov-app-lifecycle`
 * events: `close-requested` (the first close of a run: say "OpenBeach keeps
 * running in the tray", then hide) and `quit-requested` (the tray's
 * "Quit OpenBeach…": take it with `app_quit_ack`, ask, then quit). The page
 * reports its handler, the tray texts, the texts of the app's own native quit
 * question and whether a match is live (`app_page_state`), and says when its
 * handler is gone (`app_page_gone`, e.g. it crashed into its error screen),
 * so the app then asks natively instead of waiting for a page that no longer
 * answers. The updater (updater.rs) starts only once the page has reported:
 * without app_page_state an installed OpenBeach never updates itself.
 * Quitting closes every app window (the scoresheet windows too): the one
 * question says so ("Also closes: Scoresheet (2 windows)", `app_windows`),
 * and that a scoresheet window is still saving a PDF when it is. A quit
 * request hides the scoresheet windows (only the scoretable shows); Keep
 * running brings them back (`app_quit_cancel`).
 *
 * Android app (Capacitor): MainActivity goes back in the WebView's history
 * first (from the referee or livescore view to the scorer). On the app's
 * first page it calls window.__obAndroidBack:
 * - an open dialog is closed first, like Back does anywhere on Android: a
 *   modal's close button (data-modal-close) is clicked, otherwise the modal
 *   gets an Escape key press. A decision modal with neither stays open.
 * - with no dialog open the page asks "Exit OpenBeach?" (AndroidExitPrompt);
 *   only its Exit closes the app, through the app's own plugin
 *   "OpenBeachApp" (android/.../AppExitPlugin.java).
 * When the page has no handler (still loading), MainActivity sends the app to
 * the background instead, so a stray Back press mid-match never closes the
 * scorer.
 *
 * Every question goes through the in-app dialog (volleyui confirmDialog),
 * never window.confirm.
 */

import i18n from 'i18next'
import { confirmDialog, hasConfirmHost } from '../ui/volleyui/uiStore.js'
import { pdfBusyInAppWindows } from './openAppWindow_beach.js'
import { emitActivity, flushActivityNow } from './activity/bus_beach'

export const LIFECYCLE_EVENT = 'ov-app-lifecycle'

const t = (key, fallback, opts) => {
  try {
    const s = i18n.t(key, { defaultValue: fallback, ...opts })
    return typeof s === 'string' && s ? s : fallback
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// The match the app is scoring: 'none' | 'official' | 'test'

let live = 'none'
const liveListeners = new Set()

/** 'official' / 'test' for a live match, else 'none'. */
export function liveOf(match) {
  if (!match || match.status !== 'live') return 'none'
  return match.test ? 'test' : 'official'
}

/** The app's live match changed (App_beach.jsx). */
export function setLiveMatch(next) {
  const value = next === 'official' || next === 'test' ? next : 'none'
  if (value === live) return
  live = value
  liveListeners.forEach((l) => l(value))
}

export const getLiveMatch = () => live

/** Follow the live match (the update notice hides during a match).
 *  @returns {() => void} unsubscribe */
export function onLiveMatchChange(listener) {
  const l = (value) => listener(value)
  liveListeners.add(l)
  return () => liveListeners.delete(l)
}

// ---------------------------------------------------------------------------
// Questions (plain data, tested)

/** What a window is called in the quit question: a scoresheet window (its
 *  page title, or the app's title before the page set one) by its translated
 *  name, anything else by its title. */
function windowName(title) {
  const printable = [...String(title ?? '')].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('')
  const clean = printable.trim().slice(0, 60).trim()
  return !clean || /scoresheet/i.test(clean) ? t('appLifecycle.windowScoresheet', 'Scoresheet') : clean
}

/**
 * "Also closes: Scoresheet (2 windows)": the other app windows a quit closes,
 * grouped by name in the order they were opened; '' without any.
 * @param {string[]} titles their window titles (app_windows)
 */
export function windowsLine(titles = []) {
  const groups = new Map()
  for (const title of Array.isArray(titles) ? titles : []) {
    const name = windowName(title)
    groups.set(name, (groups.get(name) || 0) + 1)
  }
  if (groups.size === 0) return ''
  const list = [...groups].map(([name, count]) => t('appLifecycle.quitWindowGroup', count === 1 ? `${name} (1 window)` : `${name} (${count} windows)`, { name, count }))
  return t('appLifecycle.quitAlsoCloses', `Also closes: ${list.join(', ')}`, { windows: list.join(', ') })
}

/**
 * "Quit OpenBeach?" in the desktop app.
 * @param {{ live?: 'none'|'official'|'test', wifi?: boolean, bluetooth?: boolean, windows?: string[], pdfBusy?: boolean }} state
 *   wifi / bluetooth: the laptop's own network for the tablets is on (it stops with the app);
 *   windows: the titles of the other app windows the quit closes too (app_windows);
 *   pdfBusy: one of them is still making / saving a PDF
 */
export function quitQuestion({ live: liveNow = 'none', wifi = false, bluetooth = false, windows = [], pdfBusy = false } = {}) {
  const lines = []
  if (liveNow === 'official') {
    lines.push(t('appLifecycle.quitMatchLive', 'A match is in progress. It is saved on this computer: start OpenBeach again and continue it from the home screen.'))
  } else if (liveNow === 'test') {
    lines.push(t('appLifecycle.quitTestMatchLive', 'A test match is in progress. It is saved on this computer: start OpenBeach again and continue it from the home screen.'))
  }
  lines.push(t('appLifecycle.quitTablets', "Tablets on this computer's network will disconnect."))
  if (wifi && bluetooth) lines.push(t('appLifecycle.quitWifiBluetooth', "The laptop's Wi-Fi and Bluetooth network for tablets will stop."))
  else if (wifi) lines.push(t('appLifecycle.quitWifi', "The laptop's Wi-Fi for tablets will stop."))
  else if (bluetooth) lines.push(t('appLifecycle.quitBluetooth', "The laptop's Bluetooth network for tablets will stop."))
  const closes = windowsLine(windows)
  if (closes) lines.push(closes)
  if (pdfBusy) lines.push(t('appLifecycle.quitPdfBusy', 'A PDF is still being saved in the scoresheet window.'))
  const title = liveNow === 'official'
    ? t('appLifecycle.quitTitleMatch', 'Quit OpenBeach during the match?')
    : liveNow === 'test'
      ? t('appLifecycle.quitTitleTestMatch', 'Quit OpenBeach during the test match?')
      : t('appLifecycle.quitTitle', 'Quit OpenBeach?')
  return {
    title,
    message: lines.join('\n\n'),
    confirmLabel: t('appLifecycle.quitConfirm', 'Quit OpenBeach'),
    cancelLabel: t('appLifecycle.keepRunning', 'Keep running'),
    tone: 'danger'
  }
}

/** The first close of the desktop window: it keeps running (tray, or minimised). */
export function closeNotice({ tray = true } = {}) {
  return tray
    ? {
        title: t('appLifecycle.closeNoticeTitle', 'OpenBeach keeps running in the tray'),
        message: t('appLifecycle.closeNoticeBody', 'So tablets stay connected. Open it again from the OpenBeach icon in the tray. To quit, choose "Quit OpenBeach…" in its menu.'),
        confirmLabel: t('appLifecycle.closeNoticeHide', 'Hide window'),
        cancelLabel: t('appLifecycle.closeNoticeKeep', 'Keep open')
      }
    : {
        title: t('appLifecycle.closeNoticeTitleNoTray', 'OpenBeach keeps running'),
        message: t('appLifecycle.closeNoticeBodyNoTray', 'So tablets stay connected, the window is minimised. To quit, choose "Quit OpenBeach…" in the menu at the top right.'),
        confirmLabel: t('appLifecycle.closeNoticeMinimise', 'Minimise window'),
        cancelLabel: t('appLifecycle.closeNoticeKeep', 'Keep open')
      }
}

/** The tray's texts and the app's native quit question, in the page's
 *  language (Rust falls back to English). The native question is the app's
 *  own fallback when the page cannot ask (lifecycle.rs). */
export function trayLabels() {
  // {{count}} / {{version}} stay in the text: the app fills them in
  const tablets = t('appLifecycle.trayTablets', '{{count}} tablets connected', { count: '{{count}}' })
  const updateReady = t('update.trayReady', 'Restart to update to {{version}}', { version: '{{version}}' })
  return {
    tooltip: t('appLifecycle.trayTooltip', 'OpenBeach eScoresheet'),
    show: t('appLifecycle.trayShow', 'Show OpenBeach'),
    quit: t('appLifecycle.trayQuit', 'Quit OpenBeach…'),
    noTablets: t('appLifecycle.trayNoTablets', 'No tablets connected'),
    oneTablet: t('appLifecycle.trayOneTablet', '1 tablet connected'),
    tablets: tablets.includes('{{count}}') ? tablets : '{{count}} tablets connected',
    matchLive: t('appLifecycle.trayMatchLive', 'Match in progress'),
    testMatchLive: t('appLifecycle.trayTestMatchLive', 'Test match in progress'),
    quitTitle: t('appLifecycle.quitTitle', 'Quit OpenBeach?'),
    quitTitleMatch: t('appLifecycle.quitTitleMatch', 'Quit OpenBeach during the match?'),
    quitTitleTestMatch: t('appLifecycle.quitTitleTestMatch', 'Quit OpenBeach during the test match?'),
    quitBody: t('appLifecycle.quitTablets', "Tablets on this computer's network will disconnect."),
    quitMatchBody: t('appLifecycle.quitMatchLive', 'A match is in progress. It is saved on this computer: start OpenBeach again and continue it from the home screen.'),
    quitTestMatchBody: t('appLifecycle.quitTestMatchLive', 'A test match is in progress. It is saved on this computer: start OpenBeach again and continue it from the home screen.'),
    quitConfirm: t('appLifecycle.quitConfirm', 'Quit OpenBeach'),
    keepRunning: t('appLifecycle.keepRunning', 'Keep running'),
    updateReady: updateReady.includes('{{version}}') ? updateReady : 'Restart to update to {{version}}',
    updateStatus: t('update.trayStatus', 'Update ready'),
    // the other app windows the quit closes, in the native question;
    // {{windows}}, {{name}} and {{count}} stay for the app to fill in
    alsoCloses: keep(t('appLifecycle.quitAlsoCloses', 'Also closes: {{windows}}', { windows: '{{windows}}' }), ['{{windows}}'], 'Also closes: {{windows}}'),
    windowGroupOne: keep(t('appLifecycle.quitWindowGroup_one', '{{name}} ({{count}} window)', { name: '{{name}}', count: '{{count}}' }), ['{{name}}'], '{{name}} ({{count}} window)'),
    windowGroupOther: keep(t('appLifecycle.quitWindowGroup_other', '{{name}} ({{count}} windows)', { name: '{{name}}', count: '{{count}}' }), ['{{name}}', '{{count}}'], '{{name}} ({{count}} windows)'),
    windowScoresheet: t('appLifecycle.windowScoresheet', 'Scoresheet')
  }
}

/** `text` when it still has every placeholder the app fills in, else `fallback`. */
const keep = (text, placeholders, fallback) => (placeholders.every((p) => text.includes(p)) ? text : fallback)

// ---------------------------------------------------------------------------
// Desktop app (Tauri)

function tauriInvoke(win) {
  try {
    const internals = win?.__TAURI_INTERNALS__
    return typeof internals?.invoke === 'function' ? internals.invoke.bind(internals) : null
  } catch {
    return null
  }
}

/** The desktop app's scoretable window (not a scoresheet window, not a browser). */
export function isDesktopScoretable(win = typeof window !== 'undefined' ? window : undefined) {
  if (!tauriInvoke(win)) return false
  const label = win.__TAURI_INTERNALS__?.metadata?.currentWindow?.label
  return !label || label === 'main'
}

let desktopWin = null
let tray = true
// The quit question and the first-close notice are separate: a quit request
// while the notice is open replaces the notice (noticeAbort).
let quitAsking = false
let noticeAbort = null
let handlerSeq = 0

/** A promise that settles within `ms` (a stuck command must not hold the dialog). */
function within(promise, ms, fallback) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ])
}

/** Whether the laptop's own Wi-Fi / Bluetooth for the tablets is on (stops with the app). */
async function laptopNetworks(invoke) {
  const [wifi, bt] = await Promise.all([
    within(invoke('hotspot_status'), 1500, null),
    within(invoke('bluetooth_status'), 1500, null)
  ])
  // a hotspot switched on outside the app (external) is not stopped by it
  return { wifi: !!(wifi?.active && !wifi?.external), bluetooth: !!(bt?.active && !bt?.external) }
}

/** The titles of the other app windows (the scoresheets, hidden ones too)
 *  the quit closes; [] when the app does not say in time. */
async function appWindows(invoke) {
  const titles = await within(invoke('app_windows'), 1500, [])
  return Array.isArray(titles) ? titles.filter((x) => typeof x === 'string') : []
}

/** Whether a scoresheet window this page opened is still making / saving a PDF. */
function pdfBusyNow() {
  try {
    return pdfBusyInAppWindows()
  } catch {
    return false
  }
}

/** Tell the app this page took its quit request (its question is on screen);
 *  without it the app asks natively after a few seconds (lifecycle.rs). */
function ackQuit(invoke) {
  Promise.resolve(invoke('app_quit_ack')).catch((e) => console.warn('[app] app_quit_ack failed', e))
}

/** The in-app dialog can show: a <UiHost /> is mounted. An injected `ask`
 *  (tests) is taken as able to. */
const defaultCanAsk = (ask) => (ask === confirmDialog ? hasConfirmHost() : true)

/**
 * Ask "Quit OpenBeach?" and quit on confirm. The header menu's
 * "Quit OpenBeach…" and the tray's (through `quit-requested`) both end here.
 * @returns {Promise<boolean>} true when the app is quitting
 */
export async function requestDesktopQuit(win = desktopWin || window, ask = confirmDialog, { canAsk = defaultCanAsk } = {}) {
  const invoke = tauriInvoke(win)
  if (!invoke) return false
  // No dialog host (the page crashed into its error screen): do not take the
  // request; the app asks natively.
  if (!canAsk(ask)) return false
  // Taken: the question is (or already was) on screen.
  ackQuit(invoke)
  if (quitAsking) return false
  quitAsking = true
  // The first-close notice gives way to the quit question.
  noticeAbort?.abort()
  let quitting = false
  try {
    const [nets, windows] = await Promise.all([laptopNetworks(invoke), appWindows(invoke)])
    // ONE question for every app window: the quit closes the scoresheets too
    if (!(await ask(quitQuestion({ live, ...nets, windows, pdfBusy: pdfBusyNow() })))) return false
    quitting = true
    // The activity log's last line, written before the app goes
    emitActivity('app.quit', {})
    await flushActivityNow(800)
    await invoke('app_quit')
    return true
  } catch (e) {
    console.error('[app] quit failed', e)
    quitting = false
    return false
  } finally {
    quitAsking = false
    // Keep running: the scoresheet windows the quit request hid come back
    // with the scoretable (the request showed only the scoretable)
    if (!quitting) Promise.resolve(invoke('app_quit_cancel')).catch((e) => console.warn('[app] app_quit_cancel failed', e))
  }
}

async function showCloseNotice(win, ask) {
  const invoke = tauriInvoke(win)
  if (!invoke || quitAsking || noticeAbort) return
  const controller = new AbortController()
  noticeAbort = controller
  try {
    const hide = await ask({ ...closeNotice({ tray }), signal: controller.signal })
    if (hide && !controller.signal.aborted) await invoke('app_hide')
  } catch (e) {
    console.error('[app] hide failed', e)
  } finally {
    if (noticeAbort === controller) noticeAbort = null
  }
}

function installDesktop(win, ask) {
  const invoke = tauriInvoke(win)
  desktopWin = win
  // This install's handler: the app forgets it on app_page_gone, and a late
  // report of an uninstalled one (StrictMode, remounts) cannot revive it.
  const handler = `${Date.now().toString(36)}-${++handlerSeq}`
  const report = () => {
    Promise.resolve(invoke('app_page_state', { handler, labels: trayLabels(), live }))
      .then((info) => { if (info && typeof info.tray === 'boolean') tray = info.tray })
      .catch((e) => console.warn('[app] app_page_state failed', e))
  }
  const onEvent = (event) => {
    const type = event?.detail?.type
    if (type === 'close-requested') showCloseNotice(win, ask)
    else if (type === 'quit-requested') requestDesktopQuit(win, ask)
  }
  win.addEventListener(LIFECYCLE_EVENT, onEvent)
  liveListeners.add(report)
  // the tray follows the page's language
  i18n.on?.('languageChanged', report)
  report()
  return () => {
    win.removeEventListener(LIFECYCLE_EVENT, onEvent)
    liveListeners.delete(report)
    i18n.off?.('languageChanged', report)
    if (desktopWin === win) desktopWin = null
    // e.g. the page crashed into its error screen: nothing here answers
    // "close" / "quit" any more, so the app must not wait for it
    Promise.resolve(invoke('app_page_gone', { handler })).catch((e) => console.warn('[app] app_page_gone failed', e))
  }
}

/**
 * Install the desktop app's close / quit handling for this window (App_beach,
 * once). Anywhere but the desktop app's scoretable window it does nothing
 * (Android: AndroidExitPrompt installs the Back handler).
 * @returns {() => void} uninstall
 */
export function installAppLifecycle({ win = typeof window !== 'undefined' ? window : undefined, ask = confirmDialog } = {}) {
  if (!win || !isDesktopScoretable(win)) return () => {}
  return installDesktop(win, ask)
}

// ---------------------------------------------------------------------------
// Android app (Capacitor)

export const ANDROID_BACK_HOOK = '__obAndroidBack'
export const EXIT_PLUGIN_NAME = 'OpenBeachApp'

/** True in the Android app (Capacitor's native bridge). */
export function isCapacitorApp(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    return !!win?.Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

/**
 * Close the topmost open dialog ([aria-modal="true"]).
 * @returns {boolean} true when there was one (Back then does nothing else)
 */
export function closeOpenDialog(win = window) {
  const doc = win.document
  const modals = doc?.querySelectorAll?.('[aria-modal="true"]')
  if (!modals || modals.length === 0) return false
  const modal = modals[modals.length - 1]
  const close = modal.querySelector?.('[data-modal-close]')
  if (close) {
    close.click()
    return true
  }
  const active = doc.activeElement
  const target = active && modal.contains?.(active) ? active : modal
  const KeyboardEventCtor = win.KeyboardEvent || globalThis.KeyboardEvent
  target.dispatchEvent(new KeyboardEventCtor('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  return true
}

let exitPlugin = null

/** Close the app (the activity finishes). */
export function exitAndroidApp(win = window) {
  const cap = win.Capacitor
  if (!exitPlugin && typeof cap?.registerPlugin === 'function') exitPlugin = cap.registerPlugin(EXIT_PLUGIN_NAME)
  return exitPlugin?.exitApp?.()
}

/**
 * Install the Back handler (once, on the scorer's page).
 * @param {{ win?: Window, ask: () => Promise<boolean>, exit?: (win: Window) => unknown }} options
 *   ask: show "Exit OpenBeach?", resolve true on Exit
 * @returns {() => void} uninstall
 */
export function installAndroidBack({ win = window, ask, exit = exitAndroidApp }) {
  if (!win || !isCapacitorApp(win)) return () => {}
  let asking = false
  const handler = () => {
    if (closeOpenDialog(win)) return true
    if (asking) return true // a second Back while it asks: keep asking
    asking = true
    Promise.resolve()
      .then(() => ask())
      .then((ok) => (ok ? exit(win) : undefined))
      .catch((e) => console.error('[app] exit failed', e))
      .finally(() => { asking = false })
    return true
  }
  win[ANDROID_BACK_HOOK] = handler
  return () => {
    if (win[ANDROID_BACK_HOOK] === handler) delete win[ANDROID_BACK_HOOK]
  }
}

/** Tests: back to the initial state. */
export function resetAppLifecycleForTests() {
  exitPlugin = null
  live = 'none'
  liveListeners.clear()
  desktopWin = null
  tray = true
  quitAsking = false
  noticeAbort = null
}
