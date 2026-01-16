/**
 * Session Management for Beach Volleyball Scoresheet
 * 
 * Creates unique sessions per browser/device/IP to ensure data isolation.
 * Each user gets their own session ID that persists across page reloads.
 */

/**
 * Generate a unique session ID based on browser fingerprint
 * This combines multiple factors to create a unique identifier per browser/device
 */
function generateSessionId() {
  // Get browser/device characteristics
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const language = typeof navigator !== 'undefined' ? navigator.language : ''
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
  const screenWidth = typeof screen !== 'undefined' ? screen.width || 0 : 0
  const screenHeight = typeof screen !== 'undefined' ? screen.height || 0 : 0
  const colorDepth = typeof screen !== 'undefined' ? screen.colorDepth || 0 : 0
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
  
  // Create a fingerprint string
  const fingerprint = [
    userAgent,
    language,
    platform,
    hardwareConcurrency,
    maxTouchPoints,
    screenWidth,
    screenHeight,
    colorDepth,
    timezone,
    Date.now() // Add timestamp to ensure uniqueness
  ].join('|')
  
  // Generate a hash-like ID from the fingerprint
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  // Add random component for extra uniqueness
  const random = Math.random().toString(36).substring(2, 15)
  const timestamp = Date.now().toString(36)
  
  // Create a unique session ID
  const sessionId = `session_${Math.abs(hash).toString(36)}_${random}_${timestamp}`
  
  return sessionId
}

/**
 * Get or create a unique session ID for this browser/device
 * The session ID is stored in localStorage and persists across page reloads
 * but is unique per browser/device combination
 */
export function getSessionId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    // Server-side or no localStorage - return a temporary ID
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
  
  const STORAGE_KEY = 'escoresheet_beach_session_id'
  
  // Try to get existing session ID
  let sessionId = localStorage.getItem(STORAGE_KEY)
  
  if (!sessionId) {
    // Generate new session ID
    sessionId = generateSessionId()
    localStorage.setItem(STORAGE_KEY, sessionId)
    
    // Also store creation timestamp
    localStorage.setItem(`${STORAGE_KEY}_created`, Date.now().toString())
  }
  
  return sessionId
}

/**
 * Get session metadata (creation time, etc.)
 */
export function getSessionMetadata() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null
  }
  
  const STORAGE_KEY = 'escoresheet_beach_session_id'
  const sessionId = localStorage.getItem(STORAGE_KEY)
  const created = localStorage.getItem(`${STORAGE_KEY}_created`)
  
  if (!sessionId) {
    return null
  }
  
  return {
    sessionId,
    created: created ? new Date(parseInt(created)) : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: typeof navigator !== 'undefined' ? navigator.platform : '',
    language: typeof navigator !== 'undefined' ? navigator.language : ''
  }
}

/**
 * Clear session (useful for testing or reset)
 */
export function clearSession() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return
  }
  
  const STORAGE_KEY = 'escoresheet_beach_session_id'
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(`${STORAGE_KEY}_created`)
}

/**
 * Check if we're in the same session (useful for validation)
 */
export function isSameSession(sessionId) {
  const currentSessionId = getSessionId()
  return currentSessionId === sessionId
}

