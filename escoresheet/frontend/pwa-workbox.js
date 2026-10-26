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
