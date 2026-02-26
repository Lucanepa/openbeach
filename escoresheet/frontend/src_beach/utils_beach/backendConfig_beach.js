/**
 * Backend Configuration
 * Detects if backend server is available and provides URLs
 */

// Cloud relay URL for tablets/mobile (non-Electron/non-desktop)
const CLOUD_RELAY_URL = 'https://backend.openvolley.app'

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
 * Detect if running on a static deployment (*.openvolley.app)
 * Static deployments have no backend server, so they need to use cloud relay
 */
export function isStaticDeployment() {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('.openvolley.app')
}

/**
 * Detect if being served from a standalone local server (not cloud, not dev)
 * Any non-cloud production host = standalone server (LAN IP, localhost, etc.)
 */
export function isServedFromLocalServer() {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  if (window.location.hostname.endsWith('.openvolley.app')) return false
  return true
}

// --- Backend Override (for ServerConnectionScreen manual server selection) ---
const BACKEND_OVERRIDE_KEY = 'openbeach_backend_override'

export function getBackendOverride() {
  try { return localStorage.getItem(BACKEND_OVERRIDE_KEY) } catch { return null }
}

export function setBackendOverride(url) {
  try { localStorage.setItem(BACKEND_OVERRIDE_KEY, url) } catch { /* ignore */ }
}

export function clearBackendOverride() {
  try { localStorage.removeItem(BACKEND_OVERRIDE_KEY) } catch { /* ignore */ }
}

// Get backend URL from environment or use current host
export function getBackendUrl() {
  // Check for manual override first (set by ServerConnectionScreen)
  const override = getBackendOverride()
  if (override) {
    return override
  }

  // If VITE_BACKEND_URL is set, use it (production with separate backend)
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL
  }

  // On static deployments (*.openvolley.app), always use cloud relay
  // These deployments have no backend server
  if (isStaticDeployment()) {
    return CLOUD_RELAY_URL
  }

  // If served from a local server (LAN IP), use same origin as backend
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

export function getWebSocketUrl() {
  const backendUrl = getBackendUrl()

  if (!backendUrl) {
    return null // No backend available
  }

  // If backend URL is set, use it for WebSocket
  if (import.meta.env.VITE_BACKEND_URL) {
    const url = new URL(import.meta.env.VITE_BACKEND_URL)
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${url.host}`
  }

  // On static deployments, use cloud relay WebSocket
  if (isStaticDeployment()) {
    const url = new URL(CLOUD_RELAY_URL)
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${url.host}`
  }

  // If served from local server, use same origin for WebSocket
  if (isServedFromLocalServer()) {
    const url = new URL(window.location.origin)
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${url.host}`
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

export function isBackendAvailable() {
  return getBackendUrl() !== null
}

export function isStandaloneMode() {
  return !isBackendAvailable()
}

// Build API URL
export function getApiUrl(path) {
  const backendUrl = getBackendUrl()

  if (!backendUrl) {
    return null // No backend, can't make API calls
  }

  return `${backendUrl}${path.startsWith('/') ? path : '/' + path}`
}
