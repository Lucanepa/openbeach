// The service worker's offline rules, one list for the main build
// (vite.config.js) and the per-subdomain builds (scripts/build-subdomains.js),
// as OpenVolley's pwa-workbox.js.

// Every query parameter is ignored when a request is looked up in the
// precache. Workbox's default ignores only utm_* and fbclid, so the URLs the
// app opens itself with a query (Open scoreboard's
// /scoreboard_beach.html?mode=local, the scoresheet's ?action=print and
// ?action=getBlob&pdfReq=.. of the approval PDF, the error screen's Reload
// /?cache_bust=..) missed the precached page and went to the network: at a
// beach with no internet each of them failed with ERR_FAILED while the
// plain pages opened (stress test 2026-10-25).
export const IGNORE_URL_PARAMETERS = [/.*/]
