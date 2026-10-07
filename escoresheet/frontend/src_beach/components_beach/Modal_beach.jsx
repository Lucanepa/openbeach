import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { IconButton } from '../ui/volleyui/IconButton.jsx'
import { cn } from '../ui/volleyui/cn.js'

// The app's legacy modal shell.
//
// tone="light" is the volleyui recipe (as OpenVolley's Modal.jsx): stone-900/50
// scrim with blur, white rounded-2xl panel with shadow-2xl, a text-lg title and
// the round × close button. The scoring screen (Scoreboard_beach) uses it.
//
// The default (tone="dark") keeps the legacy dark look for the screens not
// restyled yet. Its panel carries .legacy-dark, which pins the old palette
// (--text, --muted...) on itself, so it still reads right when it is rendered
// inside the light scoring screen.
//
// The API and behaviour are the same for both tones on purpose: the backdrop
// swallows taps and never closes the modal (scoring screens depend on that),
// there is no Escape handling, and `width`, `height`, `position`, `customStyle`
// and `zIndex` work as before.
//
// Light children are NOT wrapped in `.ov-kit`: they are legacy views that rely
// on the legacy element rules (scoped light in .match-record). Only the close
// button sits in its own `.ov-kit` box, so the legacy `button` rule cannot
// reach it.
const LIGHT_OVERLAY = 'no-print fixed inset-0 bg-stone-900/50 backdrop-blur-sm'
const LIGHT_PANEL = 'bg-white rounded-2xl shadow-2xl p-5 overflow-auto text-stone-800'

export default function Modal({ title, open, onClose, children, width = 800, height, hideCloseButton = false, position = 'center', customStyle = {}, zIndex = 1000, tone = 'dark' }) {
  const { t } = useTranslation()
  if (!open) return null
  const widthStyle = width === 'auto' ? 'auto' : (width === '100vw' ? '100vw' : `min(95vw,${width}px)`)
  const heightStyle = height ? height : '90vh'

  // Stop all clicks/touches on backdrop to prevent interaction with elements behind modal
  const handleBackdropClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  if (tone === 'light') {
    const closeLabel = t('common.close')
    const header = (title || !hideCloseButton) && (
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="m-0 min-w-0 pt-1.5 text-lg font-bold leading-snug tracking-normal text-stone-900">{title}</h3>
        {!hideCloseButton && (
          <span className="ov-kit -mr-2 -mt-1 shrink-0">
            {/* data-modal-close: Android's Back closes the modal with it */}
            <IconButton variant="close" label={closeLabel} icon={X} onClick={onClose} data-modal-close="" />
          </span>
        )}
      </div>
    )
    // 85vh unless the caller asked for a height (the rosters sheet).
    const maxHeight = height ? height : '85vh'

    if (position === 'custom') {
      return (
        <div
          className={LIGHT_OVERLAY}
          style={{ zIndex, pointerEvents: 'auto' }}
          onClick={handleBackdropClick}
          onTouchStart={handleBackdropClick}
        >
          <div
            role="dialog"
            aria-modal="true"
            className={LIGHT_PANEL}
            style={{ width: widthStyle, maxHeight, ...customStyle }}
            onClick={(e) => e.stopPropagation()}
          >
            {header}
            {children}
          </div>
        </div>
      )
    }

    const overlayClass = position === 'left' || position === 'right'
      ? cn(LIGHT_OVERLAY, 'flex items-center px-5', position === 'left' ? 'justify-start' : 'justify-end')
      : cn(LIGHT_OVERLAY, 'flex items-center justify-center')

    return (
      <div
        className={overlayClass}
        style={{ zIndex }}
        onClick={handleBackdropClick}
        onTouchStart={handleBackdropClick}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={LIGHT_PANEL}
          style={{ width: widthStyle, maxHeight }}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {children}
        </div>
      </div>
    )
  }

  // For custom positioning, the parent div will handle it
  if (position === 'custom') {
    return (
      <div
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex, pointerEvents:'auto' }}
        onClick={handleBackdropClick}
        onTouchStart={handleBackdropClick}
      >
        <div
          className="legacy-dark"
          style={{
            width: widthStyle,
            maxHeight: heightStyle,
            overflow:'auto',
            background:'#111827',
            border:'1px solid rgba(255,255,255,.08)',
            borderRadius:12,
            padding:16,
            ...customStyle
          }}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {(title || !hideCloseButton) && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <h3 style={{ margin:0 }}>{title}</h3>
              {!hideCloseButton && <button className="secondary" data-modal-close onClick={onClose}>{t('common.close')}</button>}
            </div>
          )}
          {children}
        </div>
      </div>
    )
  }

  // Regular positioning
  const overlayStyle = position === 'left' || position === 'right'
    ? { position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent: position === 'left' ? 'flex-start' : 'flex-end', zIndex, padding: '0 20px' }
    : { position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex }

  return (
    <div
      style={overlayStyle}
      onClick={handleBackdropClick}
      onTouchStart={handleBackdropClick}
    >
      <div
        className="legacy-dark"
        style={{ width: widthStyle, maxHeight: heightStyle, overflow:'auto', background:'#111827', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:16 }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideCloseButton) && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <h3 style={{ margin:0 }}>{title}</h3>
            {!hideCloseButton && <button className="secondary" data-modal-close onClick={onClose}>{t('common.close')}</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
