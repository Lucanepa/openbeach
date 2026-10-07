/**
 * The Android app's Back button (Capacitor), after OpenVolley's
 * src/utils/appLifecycle.js (its Android part).
 *
 * MainActivity goes back in the WebView's history first (from the referee or
 * livescore view to the scorer). On the app's first page it calls
 * window.__obAndroidBack:
 * - an open dialog is closed first, like Back does anywhere on Android: a
 *   modal's close button (data-modal-close) is clicked, otherwise the modal
 *   gets an Escape key press. A decision modal with neither stays open.
 * - with no dialog open the page asks "Exit OpenBeach?" (AndroidExitPrompt);
 *   only its Exit closes the app, through the app's own plugin
 *   "OpenBeachApp" (android/.../AppExitPlugin.java).
 * When the page has no handler (still loading), MainActivity sends the app to
 * the background instead, so a stray Back press mid-match never closes the
 * scorer.
 */

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

/** Tests: forget the plugin handle. */
export function resetAppLifecycleForTests() {
  exitPlugin = null
}
