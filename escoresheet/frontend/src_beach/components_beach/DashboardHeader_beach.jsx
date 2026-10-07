import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { ChevronDown, ClipboardList, Database, Maximize, Menu, Monitor, Moon, RefreshCw, SatelliteDish, Sun, X } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import {
  HEADER_BAR, HEADER_BTN, HEADER_BTN_ON, HEADER_TITLE, HEADER_META, MENU_PANEL, MENU_SECTION, MENU_ROW,
  MENU_SUBROW, MENU_ROW_ON, MENU_NEST, MENU_SEP, MENU_ICON
} from './chromeClasses_beach'
import HeaderMenuItem from './HeaderMenuItem_beach'

// Flag SVG components for language selector
const FlagGB = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="60" height="42" fill="#012169" />
    <path d="M0,0 L60,42 M60,0 L0,42" stroke="#fff" strokeWidth="7" />
    <path d="M0,0 L60,42 M60,0 L0,42" stroke="#C8102E" strokeWidth="4" clipPath="url(#gbClip)" />
    <path d="M30,0 V42 M0,21 H60" stroke="#fff" strokeWidth="12" />
    <path d="M30,0 V42 M0,21 H60" stroke="#C8102E" strokeWidth="7" />
  </svg>
)

const FlagIT = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="20" height="42" fill="#009246" />
    <rect x="20" width="20" height="42" fill="#fff" />
    <rect x="40" width="20" height="42" fill="#CE2B37" />
  </svg>
)

const FlagDE = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="60" height="14" fill="#000" />
    <rect y="14" width="60" height="14" fill="#DD0000" />
    <rect y="28" width="60" height="14" fill="#FFCE00" />
  </svg>
)

const FlagFR = () => (
  <svg width="20" height="14" viewBox="0 0 60 42" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="20" height="42" fill="#002395" />
    <rect x="20" width="20" height="42" fill="#fff" />
    <rect x="40" width="20" height="42" fill="#ED2939" />
  </svg>
)

const FlagCH = () => (
  <svg width="14" height="14" viewBox="0 0 32 32" style={{ borderRadius: '2px', boxShadow: '0 0 1px rgba(0,0,0,0.3)' }}>
    <rect width="32" height="32" fill="#ff0000" />
    <rect x="14" y="6" width="4" height="20" fill="#fff" />
    <rect x="6" y="14" width="20" height="4" fill="#fff" />
  </svg>
)

const languages = [
  { code: 'en', Flag: FlagGB, label: 'EN' }
]

/**
 * DashboardHeader - 3-column header for dashboard views (referee, livescore)
 * Left: Title/version
 * Middle: Hamburger menu (collapsible)
 * Right: Fullscreen button
 *
 * volleyui chrome (as OpenVolley's DashboardHeader): white bar with a stone
 * hairline, kit header buttons and the menu as a white anchored dropdown with
 * 48 px rows.
 */
export default function DashboardHeader({
  title,
  subtitle,
  connectionStatuses = {},
  // Match loading
  onLoadGames,
  loadingMatches = false,
  matchCount = 0,
  // Optional features
  showFullscreen = false,
  isFullscreen = false,
  onToggleFullscreen,
  // Wake lock
  showWakeLock = false,
  wakeLockActive = false,
  onToggleWakeLock,
  // Back button
  onBack,
  backLabel,
  // Options menu
  showOptionsMenu = true,
  connectionMode,
  onConnectionModeChange,
  // Custom content
  rightContent
}) {
  const { t } = useTranslation()
  const currentVersion = __APP_VERSION__
  const [menuOpen, setMenuOpen] = useState(false)
  const [versionExpanded, setVersionExpanded] = useState(false)
  const [languageExpanded, setLanguageExpanded] = useState(false)

  // Close menu on outside click and on Escape
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e) => {
      if (!e.target.closest('.dashboard-header-menu')) {
        setMenuOpen(false)
      }
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  // Build menu items based on props
  const menuItems = []

  // Load games button
  if (onLoadGames) {
    menuItems.push({
      icon: <RefreshCw size={14} aria-hidden="true" />,
      label: loadingMatches ? t('common.loading', 'Loading...') : t('refereeDashboard.loadGames', 'Load games'),
      onClick: onLoadGames,
      disabled: loadingMatches,
      badge: matchCount > 0 ? `${matchCount}` : null
    })
  }

  // Wake lock toggle
  if (showWakeLock && onToggleWakeLock) {
    menuItems.push({
      icon: wakeLockActive ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />,
      label: t('refereeDashboard.keepScreenOn', 'Keep screen on'),
      onClick: onToggleWakeLock,
      toggle: wakeLockActive,
      keepOpen: true
    })
  }

  // Connection mode options
  if (showOptionsMenu && onConnectionModeChange) {
    if (menuItems.length > 0) menuItems.push({ divider: true })
    menuItems.push({ header: t('refereeDashboard.connection.title', 'Connection') })
    menuItems.push({
      icon: <RefreshCw size={14} aria-hidden="true" />,
      label: t('refereeDashboard.connection.auto', 'Auto'),
      onClick: () => onConnectionModeChange('auto'),
      active: connectionMode === 'auto'
    })
    menuItems.push({
      icon: <Database size={14} aria-hidden="true" />,
      label: t('refereeDashboard.connection.dbOnly', 'Database only'),
      onClick: () => onConnectionModeChange('supabase'),
      active: connectionMode === 'supabase'
    })
    menuItems.push({
      icon: <SatelliteDish size={14} aria-hidden="true" />,
      label: t('refereeDashboard.connection.directOnly', 'Direct only'),
      onClick: () => onConnectionModeChange('websocket'),
      active: connectionMode === 'websocket'
    })
  }

  // Connection status info (if available)
  if (connectionStatuses && Object.keys(connectionStatuses).length > 0) {
    if (menuItems.length > 0) menuItems.push({ divider: true })
    menuItems.push({ header: t('refereeDashboard.status', 'Status') })

    const statusLabels = {
      server: { icon: <Monitor size={14} aria-hidden="true" />, label: 'Server' },
      websocket: { icon: <SatelliteDish size={14} aria-hidden="true" />, label: 'WebSocket' },
      supabase: { icon: <Database size={14} aria-hidden="true" />, label: 'Database' }
    }
    // A status row: the service, then its state as a tinted word
    const statusInfo = (status) => {
      if (status === 'connected') return { tone: 'ok', word: t('connectionStatus.connected', 'Connected') }
      if (status === 'connecting') return { tone: 'warn', word: t('connectionStatus.connecting', 'Connecting') }
      if (status === 'unknown') return { tone: 'neutral', word: t('connectionStatus.unknown', 'Unknown') }
      if (status === 'error') return { tone: 'error', word: t('connectionStatus.error', 'Error') }
      return { tone: 'error', word: t('connectionStatus.disconnected', 'Disconnected') }
    }

    Object.entries(connectionStatuses).forEach(([key, status]) => {
      if (statusLabels[key]) {
        menuItems.push({
          icon: statusLabels[key].icon,
          label: statusLabels[key].label,
          info: true,
          status: statusInfo(status)
        })
      }
    })
  }

  // Back button
  if (onBack) {
    if (menuItems.length > 0) menuItems.push({ divider: true })
    menuItems.push({
      icon: <X size={14} aria-hidden="true" />,
      label: backLabel || t('common.back', 'Back'),
      onClick: onBack,
      color: '#ef4444'
    })
  }

  const currentLanguage = languages.find(l => l.code === i18n.language)
  const CurrentFlag = currentLanguage ? currentLanguage.Flag : FlagGB

  return (
    <div
      className={cn('ov-kit', HEADER_BAR, 'flex items-center justify-between')}
      style={{ height: '40px', minHeight: '40px', maxHeight: '40px', padding: '0 12px' }}
    >
      {/* LEFT: Title/Version */}
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
        <span className={cn(HEADER_TITLE, 'min-w-0')}>
          {title}
        </span>
        {/* Below sm the screen's name has the row: subtitle and version are detail */}
        {subtitle && (
          <span className={cn(HEADER_META, 'hidden min-w-0 sm:inline')}>
            {subtitle}
          </span>
        )}
        <span className="hidden shrink-0 text-[10px] tabular-nums tracking-normal text-stone-500 sm:inline">
          v{currentVersion}
        </span>
      </div>

      {/* MIDDLE: Hamburger Menu */}
      <div className="dashboard-header-menu relative flex flex-none items-center justify-center">
        {menuItems.length > 0 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(!menuOpen)
              }}
              aria-expanded={menuOpen}
              className={cn(HEADER_BTN, 'min-w-11 px-3', menuOpen && HEADER_BTN_ON)}
              aria-label={t('header.menu', 'Menu')}
              title={t('header.menu', 'Menu')}
            >
              {menuOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <>
                {/* Backdrop */}
                <div
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0"
                  style={{ zIndex: 998 }}
                />
                <div
                  className={cn('absolute left-1/2 top-full mt-1.5 flex w-max min-w-[220px] max-w-[280px] -translate-x-1/2 flex-col', MENU_PANEL)}
                  style={{ zIndex: 1000 }}
                >
                  {menuItems.map((item, index) => {
                    if (item.divider) {
                      return <div key={`divider-${index}`} className={MENU_SEP} />
                    }
                    if (item.header) {
                      return (
                        <div key={`header-${index}`} className={MENU_SECTION}>
                          {item.header}
                        </div>
                      )
                    }
                    return <HeaderMenuItem key={index} item={item} onClose={() => setMenuOpen(false)} />
                  })}

                  {/* Language selector */}
                  <div className={MENU_SEP} />
                  <button
                    type="button"
                    aria-expanded={languageExpanded}
                    onClick={(e) => {
                      e.stopPropagation()
                      setLanguageExpanded(!languageExpanded)
                    }}
                    className={cn(MENU_ROW, languageExpanded && 'bg-stone-100')}
                  >
                    <span className={MENU_ICON}><CurrentFlag /></span>
                    <span className="flex-1">{t('header.language', 'Language')}</span>
                    <ChevronDown size={14} aria-hidden="true" className={cn('text-stone-400 transition-transform', languageExpanded && 'rotate-180')} />
                  </button>

                  {/* Language options */}
                  {languageExpanded && (
                    <div className={MENU_NEST}>
                      {languages.map((lang) => (
                        <button
                          type="button"
                          key={lang.code}
                          aria-pressed={i18n.language === lang.code}
                          onClick={(e) => {
                            e.stopPropagation()
                            i18n.changeLanguage(lang.code)
                            setLanguageExpanded(false)
                          }}
                          className={cn(MENU_SUBROW, i18n.language === lang.code && MENU_ROW_ON)}
                        >
                          <span className="flex w-5 items-center justify-center"><lang.Flag /></span>
                          <span>{lang.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Version info at bottom */}
                  <div className={MENU_SEP} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setVersionExpanded(!versionExpanded)
                    }}
                    className={cn(MENU_ROW, 'text-stone-500')}
                  >
                    <span className={MENU_ICON}><ClipboardList size={14} aria-hidden="true" /></span>
                    <span className="flex-1 tabular-nums">Version {currentVersion}</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* RIGHT: Fullscreen Button + Custom content */}
      <div className="flex flex-1 basis-0 items-center justify-end gap-2">
        {rightContent}

        {showFullscreen && onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-pressed={isFullscreen}
            className={cn(HEADER_BTN, 'w-9 px-0', isFullscreen && HEADER_BTN_ON)}
            aria-label={isFullscreen ? t('header.exitFullscreen', 'Exit fullscreen') : t('header.fullscreen', 'Fullscreen')}
            title={isFullscreen ? t('header.exitFullscreen', 'Exit fullscreen') : t('header.fullscreen', 'Fullscreen')}
          >
            <Maximize size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
