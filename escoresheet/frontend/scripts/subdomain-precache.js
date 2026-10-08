// The subdomain builds' precache (scripts/build-subdomains.js). Its own
// module, free of vite, so tests can import it.

/**
 * The page is built as _build_<app>.html and renamed to index.html after the
 * build, but Workbox lists it under the name it was built with. The service
 * worker's install then fetched _build_<app>.html, got a 404 and failed, so
 * the app never installed or worked offline (beach.openvolley.app among
 * them). This precaches it under its final name (after OpenVolley d7f00c0b).
 * @param {string} tempIndexName e.g. _build_beachapp.html
 */
export function precacheUnderFinalName(tempIndexName) {
  return async (entries) => ({
    manifest: entries.map((e) => (e.url === tempIndexName ? { ...e, url: 'index.html' } : e)),
    warnings: []
  })
}
