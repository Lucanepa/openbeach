import { useState, useEffect, useCallback } from 'react'
import { reloadWithReason } from '../diagnostics_beach/reload_beach'

async function deleteAllIndexedDB() {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return
  const databases = await indexedDB.databases()
  await Promise.all(
    databases.map((db) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(db.name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
        req.onblocked = () => {
          console.warn(`[SW] IndexedDB ${db.name} is blocked`)
          resolve()
        }
      })
    })
  )
}

/** Resolves with the worker once it is installed (waiting), or null on failure/timeout. */
function waitUntilInstalled(worker, timeoutMs) {
  if (worker.state === 'installed') return Promise.resolve(worker)
  return new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', onState)
      resolve(value)
    }
    const onState = () => {
      if (worker.state === 'installed') done(worker)
      else if (worker.state === 'redundant' || worker.state === 'activated') done(null)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    worker.addEventListener('statechange', onState)
  })
}

/**
 * "Refresh to update" (UpdateBanner): activate the waiting service worker and
 * reload this page with it (same URL, query and hash kept).
 *
 * Only this page reloads. Other pages of the app (the desktop app's scoreboard
 * and scoresheet windows, a livescore tab next to the scorer) keep running;
 * they get the new version the next time they load. Caches are not wiped and
 * no worker is unregistered: the waiting worker is already fully precached and
 * Workbox drops the outdated precache when it activates, so the app still
 * loads offline right after the update. (Unregistering every worker made the
 * next load install a fresh one, whose clients.claim() then took over every
 * open page of the app.)
 */
export async function applyServiceWorkerUpdate({ clearIndexedDB = false, timeoutMs = 4000 } = {}) {
  try {
    if (clearIndexedDB) await deleteAllIndexedDB()

    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
    const reg = sw ? await sw.getRegistration() : null
    const waiting = reg?.waiting || (reg?.installing ? await waitUntilInstalled(reg.installing, timeoutMs) : null)
    if (waiting) {
      // Reload once the new worker controls this page, so the reload is served
      // by it (with a timeout in case controllerchange never comes).
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, timeoutMs)
        sw.addEventListener('controllerchange', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
        waiting.postMessage({ type: 'SKIP_WAITING' })
      })
    }
  } catch (error) {
    console.error('[SW] Update error:', error)
  }
  reloadWithReason(clearIndexedDB ? 'sw-update-clear-db' : 'sw-update')
}

// When this tab last applied an update on its own (applyUpdateAtStart, the
// desktop UpdateBanner): sessionStorage, so it survives the reload it causes
export const AUTO_UPDATE_KEY = 'ov.autoUpdateAt'
export const AUTO_UPDATE_WINDOW_MS = 120000

function sessionStore() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/**
 * May this tab apply an update on its own now? Not within
 * AUTO_UPDATE_WINDOW_MS of its last try: applyServiceWorkerUpdate reloads
 * after its timeout even when the new worker never took control, and the
 * reloaded page, still on the old build with the new one waiting, would try
 * again every few seconds. A second try falls back to the "Update available"
 * banner. Without sessionStorage it never does it on its own.
 */
export function autoApplyAllowed({ storage = sessionStore(), now = Date.now() } = {}) {
  if (!storage) return false
  try {
    const last = Number(storage.getItem(AUTO_UPDATE_KEY))
    return !(last > 0 && now - last >= 0 && now - last < AUTO_UPDATE_WINDOW_MS)
  } catch {
    return false
  }
}

/** This tab applies an update on its own now (see autoApplyAllowed). */
export function noteAutoApply({ storage = sessionStore(), now = Date.now() } = {}) {
  try {
    storage?.setItem(AUTO_UPDATE_KEY, String(now))
  } catch {
    // never block the update on storage
  }
}

/**
 * The desktop app at start (main_beach.jsx calls this in its scoretable
 * window only). Its binary IS the update, but the page that just loaded is the
 * previous build, served by the service worker, with the new one installing
 * next to it (about a second). Until the scorer touches anything, the new
 * build is applied at once on whatever screen opened: a restored match reloads
 * into itself, where no update banner is ever shown. After a touch, or after
 * the grace time, the home screen's banner applies it instead.
 */
export function applyUpdateAtStart({
  win = window,
  sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null,
  apply = () => applyServiceWorkerUpdate(),
  graceMs = 20000,
  allowed = () => autoApplyAllowed(),
  note = () => noteAutoApply()
} = {}) {
  if (!sw) return
  let open = true
  const close = () => {
    open = false
    clearTimeout(timer)
    win.removeEventListener('pointerdown', close, true)
    win.removeEventListener('keydown', close, true)
  }
  const timer = setTimeout(close, graceMs)
  win.addEventListener('pointerdown', close, true)
  win.addEventListener('keydown', close, true)
  // a first install (no controller yet) is no update; a second try within
  // a short time is a reload loop (autoApplyAllowed): the banner then asks
  const go = () => {
    if (!open || !sw.controller || !allowed()) return
    close()
    note()
    // The page is about to reload: no tap may start anything on it now (a
    // point half written when the reload comes)
    try {
      if (win.document?.body) win.document.body.inert = true
    } catch {
      // never block the update
    }
    apply()
  }
  const watch = (worker) => worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed') go()
  })
  sw.getRegistration().then((reg) => {
    if (!reg || !open) return
    if (reg.waiting) return go()
    watch(reg.installing)
    reg.addEventListener('updatefound', () => watch(reg.installing))
  }).catch(() => {})
}

/**
 * Hook to detect service worker updates and provide update functionality.
 * Works with vite-plugin-pwa in 'prompt' mode (vite.config.js): a new worker
 * stays waiting until the scorer taps "Refresh to update", so an update never
 * activates, or reloads a page, on its own.
 *
 * It never reloads the page by itself. There used to be a global
 * controllerchange -> reload listener here; with clients.claim() it reloaded
 * every open page of the app whenever a worker activated: on the first
 * install (a moment after the app opened), after every desktop app update or
 * deploy (with skipWaiting the new worker activated on its own, possibly
 * minutes later and mid-match) and whenever another page asked for the update
 * or cleared the cache. The listener was also never removed, so it stayed
 * armed after the home screen (UpdateBanner) gave way to a match.
 */
export function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    let cancelled = false
    let registration = null

    function trackInstalling(worker) {
      worker.addEventListener('statechange', () => {
        if (cancelled) return
        if (worker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New update available
            setNeedRefresh(true)
          } else {
            // First install - app is ready for offline
            setOfflineReady(true)
          }
        }
      })
    }

    function onUpdateFound() {
      if (registration?.installing) {
        trackInstalling(registration.installing)
      }
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return
      registration = reg

      // Always listen: a worker installing or waiting at mount must not stop
      // later updates in this session from being noticed
      reg.addEventListener('updatefound', onUpdateFound)

      if (reg.waiting) {
        setNeedRefresh(true)
      } else if (reg.installing) {
        trackInstalling(reg.installing)
      }
    }).catch(() => {})

    // Check for updates periodically (every 5 minutes)
    const intervalId = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().catch(() => {}) // offline: nothing to do
        }
      }).catch(() => {})
    }, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      registration?.removeEventListener('updatefound', onUpdateFound)
    }
  }, [])

  /**
   * Activate the waiting worker and reload this page (URL kept)
   */
  const updateServiceWorker = useCallback((clearIndexedDB = false) => {
    return applyServiceWorkerUpdate({ clearIndexedDB })
  }, [])

  /**
   * Dismiss the update notification
   */
  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false)
  }, [])

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker,
    dismissUpdate
  }
}

export default useServiceWorker
