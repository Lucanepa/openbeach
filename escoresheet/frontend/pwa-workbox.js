// The service worker's offline rules, one list for the main build
// (vite.config.js) and the per-subdomain builds (scripts/build-subdomains.js),
// as OpenVolley's pwa-workbox.js.

// Every query parameter but one is ignored when a request is looked up in
// the precache. Workbox's default ignores only utm_* and fbclid, so the URLs
// the app opens itself with a query (Open scoreboard's
// /scoreboard_beach.html?mode=local, the scoresheet's ?action=print and
// ?action=getBlob&pdfReq=.. of the approval PDF, the error screen's Reload
// /?cache_bust=..) missed the precached page and went to the network: at a
// beach with no internet each of them failed with ERR_FAILED while the
// plain pages opened (stress test 2026-10-25).
//
// The one kept: ob_probe, the query of Options > Clear cache's server check
// (src_beach/utils_beach/appReload_beach.js canReachAppServer). The precache
// runs this lookup on every request the worker controls, fetch() too, so
// with it ignored as well the probe got the precached page offline, and
// Clear cache, which refuses offline, wiped the caches and the worker and
// reloaded into a browser error page. Kept, it matches no precached URL and
// reaches the network (the runtime caches look it up with its unique value).
export const IGNORE_URL_PARAMETERS = [/^(?!ob_probe$)/]

/**
 * The backend's API (/api/ on any origin) goes to the network only and is
 * never kept by the service worker (OpenVolley's API_NETWORK_ONLY_ROUTE).
 * Its answers belong to the account signed in, and a cache keyed by URL (the
 * token is no part of the key) handed one account's /api/me and saved teams
 * to the next account on a shared tablet, or to a signed-out page,
 * whenever the network failed or was slow, as a normal 200, and a relay bundle
 * fetched with a match token answered a later request without one (audit
 * SEC-20). The app keeps its own offline copies (Dexie, localStorage) and
 * handles a failed request itself.
 * The FIRST runtime route of both builds (vite.config.js and
 * scripts/build-subdomains.js): the first matching route wins, so no asset
 * rule after it (an /api/storage/download/x.png) can keep an /api/ answer.
 * A RegExp matching from the start of the URL, so Workbox applies it to the
 * cloud backend's own origin as well.
 */
export const API_NETWORK_ONLY_ROUTE = {
  urlPattern: /^https?:\/\/.*\/api\/.*/i,
  handler: 'NetworkOnly'
}

/**
 * The runtime routes of the main build (vite.config.js: the desktop app's
 * pages, dev): the API first, from the network only, then images and fonts
 * cache-first. No catch-all
 * NetworkFirst route any more: it kept every https answer by URL for a day
 * ('network-cache', 3 s), the backend's API included. The pages and their
 * code are in the precache.
 */
export const MAIN_RUNTIME_CACHING = [
  API_NETWORK_ONLY_ROUTE,
  {
    urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'static-assets',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
      }
    }
  }
]

/**
 * The runtime routes of the Cloudflare Pages builds (scripts/build-subdomains.js:
 * beach., referee-beach., livescore-beach., scoresheet-beach.openvolley.app):
 * the API first, from the network only (it was NetworkFirst into 'api-cache',
 * 10 s, 24 h), then the build's files and its pages.
 */
export const SUBDOMAIN_RUNTIME_CACHING = [
  API_NETWORK_ONLY_ROUTE,
  {
    urlPattern: /\.(?:js|css|png|jpg|jpeg|svg|gif|woff|woff2)$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'static-assets',
      expiration: { maxEntries: 100, maxAgeSeconds: 2592000 }
    }
  },
  {
    urlPattern: /\.html$/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'html-cache',
      expiration: { maxEntries: 10, maxAgeSeconds: 86400 }
    }
  }
]

/**
 * The runtime caches the service workers of earlier versions filled with API
 * answers: 'api-cache' (the subdomain builds) and 'network-cache' (the main
 * build's catch-all NetworkFirst route). Nothing writes them any more; the
 * app deletes them at start and when a session ends (apiClient_beach
 * dropOldApiCaches).
 */
export const OLD_API_CACHES = Object.freeze(['api-cache', 'network-cache'])
