import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { FOCUS_RING, MENU_TITLE, POPOVER_PANEL, STATUS_PILL, STATUS_TONES } from './chromeClasses_beach'

/**
 * The header badge in venue mode (backendConfig_beach isVenueMode: a page a
 * relay serves, or a LAN relay chosen) while the cloud is not connected:
 * the relay carries the match, so that is the normal state. A calm 'Venue
 * mode' instead of 'Error' (no viable path without the cloud) or a
 * 'Syncing…' that never ends (jobs wait for a cloud that is not there).
 * Null when the usual badge applies (no venue, or the cloud is connected).
 * Only a relay that does not answer is still an error.
 * @param {{ connectionStatuses?: object, venueMode?: boolean }} p
 * @returns {null|{ key: 'venue'|'venue_no_relay' }}
 */
export function venueBadge({ connectionStatuses = {}, venueMode = false } = {}) {
  if (!venueMode) return null
  const cloud = connectionStatuses.supabase
  if (cloud === 'connected' || cloud === 'synced' || cloud === 'syncing') return null
  if (connectionStatuses.server === 'disconnected' || connectionStatuses.server === 'error') return { key: 'venue_no_relay' }
  return { key: 'venue' }
}

export default function ConnectionStatus({
  venueMode = false,
  connectionStatuses = {},
  connectionDebugInfo = {},
  onCheckStatus,
  onRetryErrors,
  queueStats = { pending: 0, error: 0 },
  position = 'right', // 'left' | 'right' | 'center'
  size = 'normal' // 'normal' | 'small' | 'large'
}) {
  const { t } = useTranslation()

  const [showConnectionMenu, setShowConnectionMenu] = useState(false)
  const [showDebugMenu, setShowDebugMenu] = useState(null) // Which connection type to show debug for
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  // Calculate menu position based on button position
  const calculateMenuPosition = useCallback(() => {
    if (!buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuMaxWidth = 300
    const menuPadding = 12
    const gap = 8 // Gap between button and menu

    // Calculate horizontal position
    let left = buttonRect.left

    // Ensure menu doesn't go off the right edge
    if (left + menuMaxWidth > viewportWidth - menuPadding) {
      left = viewportWidth - menuMaxWidth - menuPadding
    }

    // Ensure menu doesn't go off the left edge
    if (left < menuPadding) {
      left = menuPadding
    }

    // Calculate vertical position and max height
    const spaceBelow = viewportHeight - buttonRect.bottom - gap - menuPadding
    const spaceAbove = buttonRect.top - gap - menuPadding
    let top
    let maxHeight

    // Prefer positioning below, but if not enough space, position above
    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      // Position below the button
      top = buttonRect.bottom + gap
      maxHeight = Math.max(200, Math.min(spaceBelow, viewportHeight - top - menuPadding))
    } else {
      // Position above the button
      const estimatedHeight = Math.min(400, spaceAbove)
      top = buttonRect.top - estimatedHeight - gap
      maxHeight = Math.max(200, Math.min(estimatedHeight, spaceAbove))
    }

    setMenuPosition({ top, left, maxHeight })
  }, [])

  // Recalculate menu position when menu is shown or window is resized
  useEffect(() => {
    if (showConnectionMenu) {
      calculateMenuPosition()
      const handleResize = () => calculateMenuPosition()
      window.addEventListener('resize', handleResize)
      window.addEventListener('scroll', handleResize, true)
      return () => {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('scroll', handleResize, true)
      }
    }
  }, [showConnectionMenu, calculateMenuPosition])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showConnectionMenu && !e.target.closest('[data-connection-menu]')) {
        setShowConnectionMenu(false)
      }
      if (showDebugMenu && !e.target.closest('[data-debug-menu]')) {
        setShowDebugMenu(null)
      }
    }

    if (showConnectionMenu || showDebugMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showConnectionMenu, showDebugMenu])

  // Each state -> a kit tone (STATUS_TONES) and its word. Colour never carries
  // the meaning alone: the word is always shown next to the dot.
  const getStatusColor = (status, key) => {
    if (status === 'connected' || status === 'live' || status === 'scheduled' || status === 'synced' || status === 'syncing') {
      return { tone: 'ok', text: status === 'syncing' ? 'Syncing' : 'Connected' }
    } else if (status === 'awaiting_match') {
      return { tone: 'ok', text: 'Connected' }
    } else if (status === 'attention') {
      return { tone: 'error', text: 'Error' }
    } else if (status === 'no_match') {
      // For websocket, "no_match" means waiting for a match to be selected - show as grey/ready
      const text = key === 'websocket' ? 'No match' : 'Ready'
      return { tone: 'neutral', text }
    } else if (status === 'disconnected' || status === 'error' || status === 'offline') {
      return { tone: 'error', text: status === 'error' ? 'Error' : status === 'offline' ? 'Offline' : 'Disconnected' }
    } else if (status === 'not_configured' || status === 'not_applicable') {
      return { tone: 'warn', text: 'Not configured' }
    } else if (status === 'not_available') {
      return { tone: 'neutral', text: 'N/A (static)' }
    } else if (status === 'connecting') {
      return { tone: 'warn', text: 'Connecting' }
    } else if (status === 'test_mode') {
      return { tone: 'violet', text: 'Test mode' }
    } else {
      return { tone: 'neutral', text: 'Unknown' }
    }
  }

  const labelMap = {
    api: 'API',
    server: 'Server',
    websocket: 'WebSocket',
    scoreboard: 'Scoreboard',
    match: 'Match',
    db: 'Database',
    supabase: 'Cloud'
  }

  const getOverallStatus = () => {
    // Helper to check if a status is considered "OK"
    const isStatusOk = (status) => {
      return status === 'connected' ||
        status === 'live' ||
        status === 'scheduled' ||
        status === 'synced' ||
        status === 'syncing' ||
        status === 'test_mode' ||
        status === 'not_applicable' ||
        status === 'not_available' ||
        status === 'no_match' // No match is OK - just waiting for match selection
    }

    const serverStatus = connectionStatuses.server
    const websocketStatus = connectionStatuses.websocket
    const supabaseStatus = connectionStatuses.supabase
    const matchStatus = connectionStatuses.match

    // Check if Server+WebSocket path is viable
    const serverPathOk = serverStatus === 'connected'
    const websocketPathOk = websocketStatus === 'connected' || websocketStatus === 'no_match'
    const serverWebsocketViable = serverPathOk && websocketPathOk

    // Check if Supabase path is viable
    const supabaseViable = supabaseStatus === 'connected'

    // At least one connection path must be working
    const hasViableConnection = serverWebsocketViable || supabaseViable

    if (!hasViableConnection) {
      return 'attention' // No viable connection path
    }

    // Check if we're waiting for match selection
    const waitingForMatch =
      websocketStatus === 'no_match' ||
      matchStatus === 'no_match' ||
      matchStatus === 'disconnected' ||
      matchStatus === 'unknown'

    if (waitingForMatch) {
      return 'awaiting_match'
    }

    return 'connected'
  }

  const venue = queueStats.error > 0 ? null : venueBadge({ connectionStatuses, venueMode })
  const overallStatus = queueStats.error > 0 ? 'attention' : getOverallStatus()
  const statusInfo = venue
    ? (venue.key === 'venue'
        ? { tone: 'ok', text: t('connectionStatus.venueMode', 'Venue mode') }
        : { tone: 'error', text: t('connectionStatus.venueNoRelay', 'No relay') })
    : getStatusColor(overallStatus)

  // Trigger sizes: the header uses 'normal' (h-8, the bar's button height).
  const sizeClasses = {
    normal: { trigger: 'h-8 text-xs', dot: 'h-2 w-2' },
    small: { trigger: 'h-7 px-2 text-[10px]', dot: 'h-1.5 w-1.5' },
    large: { trigger: 'h-9 px-3 text-sm', dot: 'h-2.5 w-2.5' }
  }

  const currentSize = sizeClasses[size] || sizeClasses.normal
  const overallTone = STATUS_TONES[statusInfo.tone]

  return (
    <div className="ov-kit relative" data-connection-menu>
      <button
        type="button"
        ref={buttonRef}
        aria-expanded={showConnectionMenu}
        onClick={(e) => {
          e.stopPropagation()
          if (!showConnectionMenu) {
            calculateMenuPosition()
          }
          setShowConnectionMenu(!showConnectionMenu)
        }}
        className={cn(STATUS_PILL, FOCUS_RING, overallTone.pill, currentSize.trigger)}
      >
        <span className={cn('inline-block shrink-0 rounded-full', currentSize.dot, overallTone.dot)}></span>
        <span className="inline-flex items-center">
          {venue ? statusInfo.text :
            overallStatus === 'connected' ? (queueStats.pending > 0 ? 'Syncing...' : 'Connected') :
              overallStatus === 'awaiting_match' ? 'Ready' :
                'Error'}
          {queueStats.error > 0 && (
            <span className="ml-1 inline-flex min-w-[1.125rem] h-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white">
              {queueStats.error}
            </span>
          )}
        </span>
        <ChevronDown size={12} aria-hidden="true" className={cn('opacity-70 transition-transform', showConnectionMenu && 'rotate-180')} />
      </button>

      {/* Connection Status Menu */}
      {showConnectionMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className={cn('fixed w-max min-w-[220px] max-w-[300px] overflow-y-auto overflow-x-hidden', POPOVER_PANEL)}
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
            zIndex: 1000
          }}
        >
          <div className={cn('mb-2 border-b border-stone-100 pb-1.5', MENU_TITLE)}>
            Connection status
          </div>
          <div className="space-y-1">
          {Object.entries(connectionStatuses).map(([key, status]) => {
            const calmCloud = venue && key === 'supabase'
            const itemStatusInfo = calmCloud
              ? { tone: 'neutral', text: status === 'offline' ? 'Offline' : t('connectionStatus.notUsedHere', 'Not used here') }
              : getStatusColor(status, key)
            const itemTone = STATUS_TONES[itemStatusInfo.tone]

            let displayText = itemStatusInfo.text
            if (key === 'match' && status !== 'no_match' && status !== 'unknown') {
              displayText = status.charAt(0).toUpperCase() + status.slice(1)
            }

            const isConnected = status === 'connected' || status === 'live' || status === 'scheduled' || status === 'synced' || status === 'syncing'
            const isReady = key === 'match' && status === 'no_match'
            const debugInfo = connectionDebugInfo[key]
            const expandable = !isConnected && !isReady

            return (
              <div key={key} className="relative" data-debug-menu>
                <div
                  role={expandable ? 'button' : undefined}
                  tabIndex={expandable ? 0 : undefined}
                  aria-expanded={expandable ? showDebugMenu === key : undefined}
                  onClick={(e) => {
                    if (expandable) {
                      e.stopPropagation()
                      setShowDebugMenu(showDebugMenu === key ? null : key)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (expandable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowDebugMenu(showDebugMenu === key ? null : key)
                    }
                  }}
                  className={cn(
                    'flex min-h-9 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs',
                    expandable ? cn('cursor-pointer hover:bg-stone-100 transition-colors', FOCUS_RING) : 'cursor-default'
                  )}
                >
                  <span className="font-semibold text-stone-700">{labelMap[key] || key}:</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', itemTone.dot)}></span>
                    <span className={cn('font-medium', itemTone.text)}>{displayText}</span>
                    {expandable && (
                      <ChevronDown size={12} aria-hidden="true" className={cn('text-stone-400 transition-transform', showDebugMenu === key && 'rotate-180')} />
                    )}
                  </div>
                </div>

                {/* Queue Stats for the cloud */}
                {key === 'supabase' && (queueStats.pending > 0 || queueStats.error > 0) && (
                  <div className="mx-2 mb-2 mt-1 flex flex-col gap-1 rounded-lg bg-stone-50 p-2 text-[11px]">
                    {queueStats.pending > 0 && (
                      <div className="flex justify-between text-sky-800">
                        <span>{venue ? t('connectionStatus.keptOnDevice', 'Kept on this device:') : 'Pending background sync:'}</span>
                        <span className="font-bold tabular-nums">{queueStats.pending}</span>
                      </div>
                    )}
                    {queueStats.error > 0 && (
                      <div className="flex items-center justify-between text-red-700">
                        <span>Synchronization errors:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold tabular-nums">{queueStats.error}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRetryErrors?.()
                            }}
                            className={cn('inline-flex h-7 items-center rounded-lg bg-red-600 px-2.5 text-[11px] font-medium text-white hover:bg-red-700 transition-colors', FOCUS_RING)}
                          >
                            Retry all
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Debug Menu - inline instead of absolute to avoid overflow */}
                {expandable && showDebugMenu === key && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={cn('mx-1 mb-2 mt-1 break-words rounded-lg border p-2.5 text-[11px] leading-relaxed text-stone-700', calmCloud ? 'border-stone-200 bg-stone-50' : 'border-red-100 bg-red-50')}
                  >
                    <div className={cn('mb-1.5 text-xs font-semibold', calmCloud ? 'text-stone-700' : 'text-red-700')}>
                      Status information
                    </div>
                    <div className="mb-1">
                      <strong className="font-semibold text-stone-900">Status:</strong> {(() => {
                        const statusText = (debugInfo?.status || status || '').toString()
                        const words = statusText.replace(/_/g, ' ').toLowerCase()
                        return words.charAt(0).toUpperCase() + words.slice(1)
                      })()}
                    </div>
                    <div>
                      <strong className="font-semibold text-stone-900">Message:</strong> {debugInfo?.message || 'Connection issue detected'}
                    </div>
                    {debugInfo?.details && (
                      <div className="mt-2 border-t border-red-100 pt-2 text-[10px] text-stone-600">
                        {debugInfo.details}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
