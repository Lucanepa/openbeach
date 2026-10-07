import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { MENU_PANEL, MENU_ROW, MENU_SEP, MENU_ICON, MENU_TITLE } from './chromeClasses_beach'
import { cn } from '../ui/volleyui/cn.js'

export default function MenuList({
  items = [],
  position = 'right', // 'left' | 'right' | 'center'
  vertical = 'bottom', // 'bottom' | 'top' - whether menu opens above or below the button
  buttonLabel = 'Menu',
  buttonTitle = '',
  menuTitle = '',
  buttonStyle = {},
  buttonClassName = '',
  showArrow = true,
  // 'light': the volleyui face (kit menu panel and rows, `buttonClassName`
  // carries the trigger's kit classes). The default keeps the legacy dark
  // look for the screens not restyled yet.
  tone = 'dark'
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(e.target) && 
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showMenu])

  // Position menu dynamically
  useEffect(() => {
    if (showMenu && buttonRef.current && menuRef.current) {
      const updatePosition = () => {
        const buttonRect = buttonRef.current.getBoundingClientRect()
        const menu = menuRef.current
        
        requestAnimationFrame(() => {
          // Horizontal positioning
          if (position === 'right') {
            menu.style.right = `${window.innerWidth - buttonRect.right}px`
            menu.style.left = 'auto'
          } else if (position === 'left') {
            menu.style.left = `${buttonRect.left}px`
            menu.style.right = 'auto'
          } else {
            // center
            menu.style.left = `${buttonRect.left + (buttonRect.width / 2)}px`
            menu.style.right = 'auto'
            menu.style.transform = 'translateX(-50%)'
          }

          // Vertical positioning
          if (vertical === 'top') {
            menu.style.bottom = `${window.innerHeight - buttonRect.top + 4}px`
            menu.style.top = 'auto'
          } else {
            menu.style.top = `${buttonRect.bottom + 4}px`
            menu.style.bottom = 'auto'
          }
        })
      }

      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)

      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [showMenu, position, vertical])

  const getPositionStyle = () => {
    // Will be set dynamically via useEffect
    return {}
  }

  if (tone === 'light') {
    return (
      <div className="ov-kit relative">
        <button
          type="button"
          ref={buttonRef}
          className={buttonClassName}
          title={buttonTitle || undefined}
          aria-label={typeof buttonLabel === 'string' ? undefined : (buttonTitle || undefined)}
          aria-haspopup="menu"
          aria-expanded={showMenu}
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          style={buttonStyle}
        >
          {buttonLabel}
          {showArrow && (
            <ChevronDown size={16} aria-hidden="true" className={cn('transition-transform', showMenu && 'rotate-180')} />
          )}
        </button>

        {showMenu && (
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className={cn(MENU_PANEL, 'fixed z-[1000] min-w-[200px]')}
          >
            {menuTitle && <div className={cn(MENU_TITLE, 'px-3 pb-2 pt-1')}>{menuTitle}</div>}
            {items.map((item, index) => {
              if (item.separator) return <div key={`separator-${index}`} className={MENU_SEP} />
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={item.key || index}
                  onClick={() => {
                    if (item.onClick) {
                      item.onClick()
                    }
                    setShowMenu(false)
                  }}
                  className={cn(MENU_ROW, item.className)}
                  style={item.style}
                >
                  {item.icon && <span className={MENU_ICON}>{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        className={buttonClassName}
        title={buttonTitle || undefined}
        onClick={(e) => {
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        style={{
          ...buttonStyle,
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          if (buttonStyle.background) {
            e.currentTarget.style.opacity = '0.9'
          }
        }}
        onMouseLeave={(e) => {
          if (buttonStyle.background) {
            e.currentTarget.style.opacity = '1'
          }
        }}
      >
        {buttonLabel}
        {showArrow && (
          <span style={{ marginLeft: '6px', fontSize: '10px' }}>
            {showMenu ? '▲' : '▼'}
          </span>
        )}
      </button>
      
      {/* Menu List */}
      {showMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            ...getPositionStyle(),
            background: 'rgb(0, 0, 0)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            padding: '8px',
            width: 'auto',
            minWidth: '200px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
        >
          {menuTitle && (
            <div style={{
              padding: '8px 12px 12px 12px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#fff',
              borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
              marginBottom: '8px'
            }}>
              {menuTitle}
            </div>
          )}
          {items.map((item, index) => {
            if (item.separator) {
              return (
                <div
                  key={`separator-${index}`}
                  style={{
                    height: '1px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    margin: '8px 0'
                  }}
                />
              )
            }

            return (
              <div
                key={item.key || index}
                onClick={() => {
                  if (item.onClick) {
                    item.onClick()
                  }
                  setShowMenu(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  marginBottom: index < items.length - 1 ? '4px' : '0',
                  fontSize: '13px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ...(item.style || {})
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
              >
                {item.icon && <span style={{ fontSize: '16px' }}>{item.icon}</span>}
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
