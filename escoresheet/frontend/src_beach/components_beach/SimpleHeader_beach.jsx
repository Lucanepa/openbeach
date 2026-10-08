import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Maximize, Menu, X } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { SegmentedControl } from '../ui/volleyui/SegmentedControl.jsx'
import {
  HEADER_BAR, HEADER_BTN, HEADER_BTN_ON, HEADER_TITLE, MENU_PANEL, MENU_SECTION, MENU_ROW, MENU_SEP, MENU_ICON
} from './chromeClasses_beach'
import HeaderMenuItem from './HeaderMenuItem_beach'
import { BRAND } from '../brand_beach'

/**
 * SimpleHeader - 3-column header for all dashboard apps
 * Left: Title/version
 * Middle: Hamburger menu (collapsible)
 * Right: Fullscreen button
 *
 * volleyui chrome (as OpenVolley's SimpleHeader): white bar with a stone
 * hairline, kit header buttons, the menu as a white anchored dropdown with
 * 48 px rows, the optional toggle as a kit segmented pill (slate-900 when on).
 */
export default function SimpleHeader({
  title,
  version,
  menuItems = [], // Array of { icon, label, onClick, active, color, toggle, badge, disabled, divider }
  onFullscreen,
  isFullscreen = false,
  toggleOptions // Optional: segmented toggle [{ label: '1 REF', active: false, onClick }, { label: '2 REF', active: true, onClick }]
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [versionExpanded, setVersionExpanded] = useState(false)
  const currentVersion = version || __APP_VERSION__

  // Close menu on outside click and on Escape
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e) => {
      if (!e.target.closest('.simple-header-menu')) {
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

  const activeToggle = toggleOptions ? toggleOptions.findIndex(o => o.active) : -1

  return (
    <div
      data-diag="header"
      className={cn('ov-kit', HEADER_BAR, 'flex items-center justify-between')}
      style={{ height: '40px', minHeight: '40px', maxHeight: '40px', padding: '0 12px' }}
    >
      {/* LEFT: Title or Toggle */}
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
        {toggleOptions && toggleOptions.length > 0 ? (
          // The courtside referee's view switch: h-9 segments from the tablet
          // breakpoint up, no frame padding there so it fits the 40 px bar.
          <SegmentedControl
            variant="pill"
            ariaLabel={t('refereeDashboard.view', 'View')}
            options={toggleOptions.map((option, idx) => ({ value: String(idx), label: option.label }))}
            value={activeToggle >= 0 ? String(activeToggle) : ''}
            onChange={(v) => toggleOptions[Number(v)]?.onClick?.()}
            className="shrink-0 sm:p-0 sm:[&_button]:h-9 sm:[&_button]:px-3"
          />
        ) : title ? (
          <>
            {/* The OpenBeach mark; decorative, the page names itself in the title */}
            <img src={BRAND.mark} alt="" aria-hidden="true" draggable={false} className="h-6 w-6 shrink-0" />
            <span className={HEADER_TITLE}>
              {title}
            </span>
          </>
        ) : null}
      </div>

      {/* MIDDLE: Hamburger Menu */}
      <div className="simple-header-menu relative flex flex-none items-center justify-center">
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

      {/* RIGHT: Fullscreen Button */}
      <div className="flex flex-1 basis-0 items-center justify-end gap-2">
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
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
