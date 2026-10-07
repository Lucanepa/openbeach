/**
 * Backend Configuration
 * Detects if backend server is available and provides URLs.
 * Supports a runtime override (localStorage) for a venue LAN relay.
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/backendConfig.js, with
 * OpenBeach's own defaults: its desktop relay serves the pages on 5174 and
 * takes the WebSocket on 8081 (OpenVolley's: 5173 / 8080), so both apps run on
 * one laptop.
 */

// Cloud relay URL for tablets/mobile (non-Electron/non-desktop)
const CLOUD_RELAY_URL = 'https://backend.openvolley.app'

// localStorage key for the runtime backend URL override
const BACKEND_OVERRIDE_KEY = 'openbeach_backend_override'

/**
 * SECURITY: the backend override decides where the app sends requests carrying
 * the user's auth token. It can be set from a link (?server=) or typed on the
 * connection screen, so it must be restricted to trusted targets (LAN /
 * localhost or an openvolley.app host): a crafted link must not send the
 * session token to any origin.
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedBackendUrl(url) {
  if (!url || typeof url !== 'string') return false
  let u
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true
  if (host.endsWith('.openvolley.app') || host === 'openvolley.app') return true
  if (host.endsWith('.local')) return true // mDNS LAN hostnames
  // Private (RFC1918) LAN ranges
  if (/^10\.(\d{1,3}\.){2}\d{1,3}$/.test(host)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

/**
 * The current backend URL override, if set (and still trusted).
 * @returns {string|null}
 */
export function getBackendOverride() {
  try {
    const v = localStorage.getItem(BACKEND_OVERRIDE_KEY) || null
    if (v && !isAllowedBackendUrl(v)) {
      localStorage.removeItem(BACKEND_OVERRIDE_KEY)
      return null
    }
    return v
  } catch { return null }
}

/**
 * Set a runtime backend URL override (a venue relay at a custom IP:port).
 * An untrusted URL is refused (see isAllowedBackendUrl). Null clears it.
 * @param {string|null} url
 */
export function setBackendOverride(url) {
  try {
    if (url) {
      if (!isAllowedBackendUrl(url)) {
        console.warn('[backendConfig] Rejected untrusted backend override:', url)
        return
      }
      localStorage.setItem(BACKEND_OVERRIDE_KEY, url)
    } else {
      localStorage.removeItem(BACKEND_OVERRIDE_KEY)
    }
  } catch { /* localStorage unavailable */ }
}

export function clearBackendOverride() {
  try { localStorage.removeItem(BACKEND_OVERRIDE_KEY) } catch { /* ignore */ }
}

/**
 * Detect if running on a desktop platform (Mac/PC/Linux) vs tablet/mobile
 * Returns true if running in Electron or on a desktop browser
 */
export function isDesktopPlatform() {
  // Check if running in Electron
  if (typeof window !== 'undefined' && window.electronAPI) {
    return true
  }

  // Check user agent for desktop OS (without mobile indicators)
  const ua = navigator.userAgent.toLowerCase()
  const isDesktopOS = /windows|macintosh|mac os x|linux/i.test(ua) &&
                      !/android|iphone|ipad|ipod|mobile|tablet/i.test(ua)

  return isDesktopOS
}

/**
 * Detect if running on tablet/mobile
 */
export function isTabletOrMobile() {
  return !isDesktopPlatform()
}

/**
 * A host that serves the apps as static files, with no backend behind it:
 * *.openvolley.app, the Cloudflare Pages previews (*.pages.dev) and GitHub
 * Pages. Its /api/* paths answer with the SPA's index.html.
 * @param {string} hostname
 */
export function isStaticHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'openvolley.app' || host.endsWith('.openvolley.app') ||
    host.endsWith('.pages.dev') || host.endsWith('.github.io')
}

/**
 * Running inside the native Android/iOS app (Capacitor). Its WebView serves the
 * bundled web app from https://localhost: a host without a backend behind it,
 * exactly like a static deployment (the cloud, unless the user points the app
 * at a venue LAN relay with the override). Never a local server.
 */
export function isNativeApp() {
  if (typeof window === 'undefined') return false
  try {
    return !!window.Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

/**
 * A static deployment (see isStaticHost) or the native app. Neither has a
 * backend server of its own, so they use the cloud relay.
 */
export function isStaticDeployment() {
  if (typeof window === 'undefined') return false
  return isNativeApp() || isStaticHost(window.location.hostname)
}

/**
 * Served from a standalone local server (not cloud, not dev, not the native
 * app): the desktop app's relay, a venue server, a LAN IP.
 */
export function isServedFromLocalServer() {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  if (isNativeApp()) return false
  if (isStaticHost(window.location.hostname)) return false
  return true
}

/**
 * Where this page asks its own server for /api/server/status (relay WS port,
 * LAN address): the dev server or a local server (desktop app, venue server).
 * Null on a static deployment and in the native app (no such endpoint), and
 * for a page opened from disk.
 * @returns {string|null}
 */
export function getLocalServerStatusUrl() {
  if (typeof window === 'undefined' || !window.location) return null
  const { protocol, hostname, origin } = window.location
  if (protocol !== 'http:' && protocol !== 'https:') return null
  if (isNativeApp()) return null
  if (!import.meta.env.DEV && isStaticHost(hostname)) return null
  return `${origin}/api/server/status`
}

// Get backend URL from environment or use current host
export function getBackendUrl() {
  // A runtime override (connection screen, ?server=) wins
  const override = getBackendOverride()
  if (override) {
    return override
  }

  // If VITE_BACKEND_URL is set, use it (production with separate backend)
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }

  // Static deployments and the native app have no backend: the cloud
  if (isStaticDeployment()) {
    return CLOUD_RELAY_URL
  }

  // Served from a local server (LAN IP, desktop app): it is the backend
  if (isServedFromLocalServer()) {
    return window.location.origin
  }

  // On tablets/mobile in production, use cloud relay automatically
  if (!import.meta.env.DEV && isTabletOrMobile()) {
    return CLOUD_RELAY_URL
  }

  // In development, use local server
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
    const hostname = window.location.hostname
    const port = window.location.port || (protocol === 'https' ? '443' : '5173')
    return `${protocol}://${hostname}:${port}`
  }

  // In production without VITE_BACKEND_URL on desktop, assume standalone mode
  return null
}

/**
 * WebSocket base of the backend (getBackendUrl's host). The relay socket of
 * the match uses getRelayWebSocketUrl instead (a desktop relay takes the
 * WebSocket on a port of its own).
 */
export function getWebSocketUrl() {
  const backendUrl = getBackendUrl()

  if (!backendUrl) {
    return null // No backend available
  }

  // A runtime override wins, as in getBackendUrl
  const override = getBackendOverride()
  if (override) {
    try { return httpToWsUrl(override) } catch { return null }
  }

  if (import.meta.env.VITE_BACKEND_URL) {
    return httpToWsUrl(import.meta.env.VITE_BACKEND_URL)
  }

  if (isStaticDeployment()) {
    return httpToWsUrl(CLOUD_RELAY_URL)
  }

  if (isServedFromLocalServer()) {
    return httpToWsUrl(window.location.origin)
  }

  // In development, use separate WebSocket port
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const hostname = window.location.hostname
    const wsPort = import.meta.env.VITE_WS_PORT || 8080
    return `${protocol}://${hostname}:${wsPort}`
  }

  return null
}

// The desktop relays serve the pages and /api/* on one port and take the
// WebSocket on another: OpenBeach's on 5174 / 8081, OpenVolley's on 5173 / 8080
// (a beach tablet may use either at a venue). The venue server
// (OpenVolley backend/server.js --local, the Pi) and the cloud take both on
// one port.
export const BEACH_DESKTOP_HTTP_PORT = '5174'
export const BEACH_DESKTOP_WS_PORT = '8081'
const DESKTOP_RELAY_WS_PORTS = Object.freeze({
  [BEACH_DESKTOP_HTTP_PORT]: BEACH_DESKTOP_WS_PORT,
  5173: '8080'
})
// localStorage: { "<relay origin>": <its WS port> }, from its /api/server/status
const RELAY_WS_PORTS_KEY = 'openbeach_relay_ws_ports'
const MAX_REMEMBERED_RELAYS = 8

const originOf = (url) => {
  try { return new URL(url).origin } catch { return null }
}

const validPort = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 && n < 65536 ? String(n) : null
}

function readRelayWsPorts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RELAY_WS_PORTS_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The WebSocket port a relay told us it uses (rememberRelayWsPort), or null.
 * @param {string} baseUrl  the relay's http(s) URL
 */
export function relayWsPortFor(baseUrl) {
  const origin = originOf(baseUrl)
  return origin ? validPort(readRelayWsPorts()[origin]) : null
}

/**
 * Remember the WebSocket port of the relay at `baseUrl` (its
 * /api/server/status `wsPort`). Null forgets it.
 * @param {string} baseUrl
 * @param {number|string|null} wsPort
 */
export function rememberRelayWsPort(baseUrl, wsPort) {
  const origin = originOf(baseUrl)
  if (!origin) return
  try {
    const ports = readRelayWsPorts()
    delete ports[origin]
    const port = validPort(wsPort)
    if (port) ports[origin] = Number(port)
    // Newest last; only a few relays are worth remembering
    const keys = Object.keys(ports)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED_RELAYS))) delete ports[k]
    localStorage.setItem(RELAY_WS_PORTS_KEY, JSON.stringify(ports))
  } catch { /* localStorage unavailable */ }
}

/**
 * Ask the relay at `baseUrl` (a venue relay on an explicit port) which port
 * its WebSocket is on, and remember it for getRelayWebSocketUrl. Every relay
 * answers /api/server/status with `wsPort`. Never throws; null when the relay
 * did not say.
 * @param {string} baseUrl
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<string|null>}
 */
export async function learnRelayWsPort(baseUrl, { fetchImpl = typeof fetch === 'function' ? fetch : null, timeoutMs = 4000 } = {}) {
  const origin = originOf(baseUrl)
  // Only a venue relay on an explicit port: the cloud (and a LAN relay behind
  // a proxy on the default port) reports its container's port, not the
  // public one, and takes the WebSocket on its own origin anyway.
  if (!origin || !fetchImpl || !isLanBackendUrl(origin) || !new URL(origin).port) return null
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetchImpl(`${origin}/api/server/status`, controller ? { signal: controller.signal } : undefined)
    if (!res?.ok) return null
    const body = await res.json()
    const port = validPort(body?.wsPort)
    if (port) rememberRelayWsPort(origin, port)
    return port
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * A role link's ?server= (referee, livescore): the backend override for this
 * and later visits (a bare host is https), and for a venue relay its
 * WebSocket port, learnt in the background.
 * @param {string|null} serverParam
 */
export function applyServerParam(serverParam) {
  if (!serverParam) return
  const url = serverParam.startsWith('http') ? serverParam : `https://${serverParam}`
  setBackendOverride(url)
  if (getBackendOverride() === url) void learnRelayWsPort(url)
}

/**
 * WebSocket URL of a LAN relay at `baseUrl` on an explicit port: the port it
 * named (learnRelayWsPort) wins; a desktop relay's HTTP port maps to its
 * WebSocket port (5174 -> 8081, 5173 -> 8080); any other relay takes the
 * WebSocket on its HTTP port.
 */
function lanRelayWebSocketUrl(baseUrl) {
  const url = new URL(baseUrl)
  const protocol = url.protocol === 'https:' ? 'wss' : 'ws'
  const learned = relayWsPortFor(baseUrl)
  if (learned) return `${protocol}://${url.hostname}:${learned}`
  const desktopWs = DESKTOP_RELAY_WS_PORTS[url.port]
  if (desktopWs) return `${protocol}://${url.hostname}:${desktopWs}`
  return httpToWsUrl(baseUrl)
}

/**
 * WebSocket URL of a relay chosen as the backend override.
 * @param {string} override
 */
function overrideWebSocketUrl(override) {
  const url = new URL(override)
  if (!url.port || !isLanBackendUrl(override)) return httpToWsUrl(override)
  return lanRelayWebSocketUrl(override)
}

/**
 * WebSocket URL of the match relay (sync-match-data / subscribe-match /
 * live-state-update). Every relay client (scorer, referee, livescore) resolves
 * it here, so the scorer publishes where its tablets listen.
 *
 * Same precedence as getBackendUrl: the override (on the port its relay
 * named, else 5174 -> 8081 / 5173 -> 8080 for a desktop relay),
 * VITE_BACKEND_URL, the cloud relay on a static deployment and in the native
 * app — those relays take the WebSocket on their HTTP port. A page served by
 * a local relay reaches it on `wsPort` when the caller knows it (the relay's
 * /api/server/status), else on the port the relay named before, else as
 * above (desktop relay ports, or the page's own port for a venue server) —
 * and behind a proxy on the default port on the page's own origin. The dev
 * server: VITE_WS_PORT or 8080 (the OpenVolley backend in --local mode).
 * Returns null when there is no relay to reach (a page opened from file://).
 * @param {{ wsPort?: number|string|null }} [options]
 * @returns {string|null}
 */
export function getRelayWebSocketUrl({ wsPort = null } = {}) {
  const override = getBackendOverride()
  if (override) {
    try { return overrideWebSocketUrl(override) } catch { return null }
  }
  if (import.meta.env.VITE_BACKEND_URL) return httpToWsUrl(import.meta.env.VITE_BACKEND_URL)
  if (typeof window === 'undefined' || !window.location) return null
  if (isStaticDeployment()) return httpToWsUrl(CLOUD_RELAY_URL)
  const { protocol: pageProtocol, hostname, port, origin } = window.location
  if (pageProtocol !== 'http:' && pageProtocol !== 'https:') return null
  const protocol = pageProtocol === 'https:' ? 'wss' : 'ws'
  const known = validPort(wsPort)
  if (known) return `${protocol}://${hostname}:${known}`
  if (import.meta.env.DEV) return `${protocol}://${hostname}:${import.meta.env.VITE_WS_PORT || 8080}`
  if (!port) return httpToWsUrl(origin)
  return lanRelayWebSocketUrl(origin)
}

/**
 * Convert an HTTP(S) URL to a WS(S) URL
 * @param {string} httpUrl
 * @returns {string}
 */
function httpToWsUrl(httpUrl) {
  const url = new URL(httpUrl)
  const protocol = url.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${url.host}`
}

export function isBackendAvailable() {
  return getBackendUrl() !== null
}

export function isStandaloneMode() {
  return !isBackendAvailable()
}

/**
 * Is this URL on this machine or the local network (localhost, *.local,
 * RFC1918)? Such a host is a venue relay (desktop app, Pi, standalone server),
 * never the cloud backend.
 * @param {string|null|undefined} url
 */
export function isLanBackendUrl(url) {
  if (!url) return false
  let host
  try { host = new URL(url).hostname } catch { return false }
  host = host.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true
  if (/^127\.(\d{1,3}\.){2}\d{1,3}$/.test(host)) return true
  if (/^10\.(\d{1,3}\.){2}\d{1,3}$/.test(host)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  return false
}

const isLoopbackHost = (hostname) => {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '::1' || /^127\.(\d{1,3}\.){2}\d{1,3}$/.test(host)
}

/**
 * Is this page served by a local / self-hosted server from an address other
 * than loopback (a venue tablet at http://192.168.1.20:5174/referee, a venue
 * server on its mDNS name)? The cloud backend's CORS never trusts such an
 * origin. The desktop window itself (http://localhost) is not one.
 */
export function isServedFromLanOrigin() {
  if (!isServedFromLocalServer()) return false
  const { protocol, hostname } = window.location || {}
  if (protocol !== 'http:' && protocol !== 'https:') return false
  return !isLoopbackHost(hostname)
}

/**
 * Loopback origins of the OpenBeach desktop window that the cloud backend's
 * CORS must trust (ALLOWED_ORIGINS in OpenVolley backend/lib/cors.js): the
 * desktop relay's default port 5174. Keep the two lists in step.
 */
const CLOUD_TRUSTED_LOOPBACK_ORIGINS = [
  `http://localhost:${BEACH_DESKTOP_HTTP_PORT}`,
  `http://127.0.0.1:${BEACH_DESKTOP_HTTP_PORT}`
]

/**
 * Is this the desktop window (a page a local relay serves on loopback) on a
 * port the cloud does not trust? An HTTP port moved off 5174 would make the
 * cloud's CORS reject every call: there is no cloud sync there then. A build
 * or runtime override naming another cloud is not judged.
 * @returns {boolean}
 */
export function isCloudBlockedOnThisPort() {
  if (!isServedFromLocalServer() || isServedFromLanOrigin()) return false
  if (import.meta.env.VITE_CLOUD_API_URL || import.meta.env.VITE_BACKEND_URL) return false
  const override = getBackendOverride()
  if (override && !isLanBackendUrl(override)) return false
  const { protocol, origin } = window.location || {}
  if (protocol !== 'http:' && protocol !== 'https:') return false
  return !CLOUD_TRUSTED_LOOPBACK_ORIGINS.includes(origin)
}

const stripTrailingSlash = (url) => String(url).replace(/\/+$/, '')

/**
 * Base URL of the CLOUD API: /api/db, /api/auth/*, /api/storage/*, the match
 * restore / claim / PIN endpoints, saved teams and the database realtime
 * socket. Kept apart from the relay (getBackendUrl / getRelayWebSocketUrl),
 * which carries the match to the venue tablets:
 *
 *   - A page served by a local relay from a LAN address (venue tablets at
 *     http://<laptop-IP>:5174/referee): the page's own server. The cloud only
 *     trusts its own origins and the loopback / native app origins.
 *   - VITE_CLOUD_API_URL, when the build sets one.
 *   - A runtime override that is a cloud host serves both. One on the LAN is
 *     a venue relay without a database: the cloud stays the cloud.
 *   - VITE_BACKEND_URL (web builds on *.openvolley.app: one backend for both).
 *   - Static deployments and the native app: backend.openvolley.app.
 *   - The desktop window on loopback (http://localhost:5174): the cloud,
 *     while the relay keeps the venue running offline; on another port none.
 *   - Dev server: same as getBackendUrl.
 * @returns {string|null}
 */
export function getCloudApiBaseUrl() {
  if (isServedFromLanOrigin()) {
    const base = getBackendUrl()
    return base ? stripTrailingSlash(base) : null
  }
  if (import.meta.env.VITE_CLOUD_API_URL) return stripTrailingSlash(import.meta.env.VITE_CLOUD_API_URL)
  const override = getBackendOverride()
  if (override && !isLanBackendUrl(override)) return stripTrailingSlash(override)
  if (import.meta.env.VITE_BACKEND_URL) return stripTrailingSlash(import.meta.env.VITE_BACKEND_URL)
  if (override) return CLOUD_RELAY_URL
  if (isStaticDeployment()) return CLOUD_RELAY_URL
  if (isServedFromLocalServer()) return isCloudBlockedOnThisPort() ? null : CLOUD_RELAY_URL
  const base = getBackendUrl()
  return base ? stripTrailingSlash(base) : null
}

/**
 * Do cloud calls go somewhere else than the relay (desktop app, venue LAN
 * relay)? Then a cloud failure says nothing about the venue, and vice versa.
 */
export function isCloudApiSplit() {
  const cloud = getCloudApiBaseUrl()
  const relay = getBackendUrl()
  if (!cloud || !relay) return false
  return stripTrailingSlash(cloud) !== stripTrailingSlash(relay)
}

/**
 * Full URL of a cloud API endpoint (see getCloudApiBaseUrl), or null.
 * @param {string} path
 */
export function getCloudApiUrl(path) {
  const base = getCloudApiBaseUrl()
  if (!base) return null
  return `${base}${path.startsWith('/') ? path : '/' + path}`
}

/**
 * WebSocket base of the cloud database realtime (relayRealtime, ?purpose=live).
 * Same backend as the cloud API when the two are split; otherwise
 * getWebSocketUrl. None for the desktop window off its port.
 */
export function getCloudWebSocketUrl() {
  if (isCloudBlockedOnThisPort()) return null
  if (isCloudApiSplit()) {
    try { return httpToWsUrl(getCloudApiBaseUrl()) } catch { return null }
  }
  return getWebSocketUrl()
}

/**
 * URL of a RELAY endpoint: the server that carries the match to the tablets
 * (/api/server/*, /api/match/list, /api/match/:id, validate-pin). On the
 * cloud web build this is the same backend as getCloudApiUrl.
 * @param {string} path
 */
export function getApiUrl(path) {
  const backendUrl = getBackendUrl()

  if (!backendUrl) {
    return null // No backend, can't make API calls
  }

  return `${backendUrl}${path.startsWith('/') ? path : '/' + path}`
}
