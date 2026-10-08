/**
 * Reloading the page on purpose (Options > Clear cache, the error screen's
 * Reload), after OpenVolley's hooks/useServiceWorker.js (644f8571, 8efbd12e).
 *
 * - The reload keeps the whole URL: ?match=&team=&server= keep a referee,
 *   livescore or scoreboard tablet attached to the live match, and a scorer
 *   on the match it had open. The old Clear cache went to
 *   `pathname + '?cache_bust='`, which dropped them.
 * - Clear cache wipes the service worker's caches and unregisters it. Done
 *   while the app's server cannot be reached (the scoreboard's options are
 *   open mid-match, at a hall with no internet), the reload then had nothing
 *   to load the app from and the device was stuck on a browser error page. It
 *   now refuses instead and touches nothing.
 *
 * The reload adds ?cache_bust= so no HTTP cache answers it; the *-main_beach
 * entries remove only that parameter again (stripCacheBustParam).
 *
 * Every reload goes through reloadWithReason (diagnostics_beach/reload_beach):
 * with diagnostics mode on, the next load's page.load line names the reason.
 */
import { reloadWithReason } from '../diagnostics_beach/reload_beach'

export const CACHE_BUST_PARAM = 'cache_bust'

/** This page's URL (query and hash kept) with a fresh cache_bust. */
export function buildReloadUrl(href = window.location.href, now = Date.now()) {
  const url = new URL(href)
  url.searchParams.set(CACHE_BUST_PARAM, String(now))
  return url.toString()
}

/**
 * Remove only the cache_bust parameter the reload added, keeping the rest of
 * the query. Called first thing by every *-main_beach.jsx entry.
 */
export function stripCacheBustParam(win = window) {
  try {
    const url = new URL(win.location.href)
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return
    url.searchParams.delete(CACHE_BUST_PARAM)
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash)
  } catch {
    // never block the app's start on URL cleanup
  }
}

/** Reload this page, URL kept (the error screen's Reload). */
export function reloadPage(win = window, reason = 'error-boundary') {
  reloadWithReason(reason, { how: 'replace', url: buildReloadUrl(win.location.href), win })
}

/**
 * True when the server this page came from answers. It asks for the page
 * itself (OpenBeach ships no version.json) with a query no cache holds, so
 * neither the service worker's precache nor its runtime cache can answer.
 */
export async function canReachAppServer(timeoutMs = 4000, win = window) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    const probe = new URL(win.location.pathname, win.location.href)
    probe.searchParams.set('ob_probe', String(Date.now()))
    const res = await fetch(probe.toString(), { cache: 'no-store', signal: controller?.signal })
    return !!res?.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Options > Clear cache: delete every Cache Storage entry, unregister the
 * service workers and reload this page with its query kept.
 *
 * Returns false WITHOUT touching anything when the app's server cannot be
 * reached: with the precache and the worker gone, the reload would have
 * nothing to load from.
 * @param {{ includeLocalStorage?: boolean }} [opts] also clear the settings
 * @returns {Promise<boolean>}
 */
export async function clearCachesAndReload({ includeLocalStorage = false } = {}) {
  if (!(await canReachAppServer())) return false
  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
  }
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((reg) => reg.unregister()))
  }
  if (includeLocalStorage) localStorage.clear()
  reloadWithReason(includeLocalStorage ? 'clear-cache-and-storage' : 'clear-cache', { how: 'replace', url: buildReloadUrl() })
  return true
}
