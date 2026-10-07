import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { installAndroidBack, isCapacitorApp } from '../utils_beach/appLifecycle_beach'

// Volleyball style (volleyui ConfirmDialog), inline until the Phase 5 restyle
// brings Tailwind and the kit: stone neutrals, white panel, red action.
const S = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, background: 'rgba(28, 25, 23, 0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
  },
  panel: {
    width: 'min(100%, 420px)', background: '#ffffff', color: '#1c1917', borderRadius: 16, padding: 24,
    boxShadow: '0 20px 40px -12px rgba(28, 25, 23, 0.35)', fontFamily: 'inherit'
  },
  title: { margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 600, color: '#1c1917' },
  message: { margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#57534e' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, flexWrap: 'wrap' },
  button: {
    minHeight: 44, padding: '0 20px', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer'
  },
  secondary: { border: '1px solid #d6d3d1', background: '#ffffff', color: '#44403c' },
  primary: { border: '1px solid #dc2626', background: '#dc2626', color: '#ffffff' }
}

/**
 * "Exit OpenBeach?" on the Android Back button (utils_beach/appLifecycle_beach.js).
 * Mounted once next to the scorer app; renders nothing outside the Android app.
 */
export default function AndroidExitPrompt() {
  const { t } = useTranslation()
  const [pending, setPending] = useState(null) // { resolve } while asking
  const exitRef = useRef(null)
  const baseId = useId()

  useEffect(() => {
    if (!isCapacitorApp()) return undefined
    return installAndroidBack({
      ask: () => new Promise((resolve) => setPending({ resolve }))
    })
  }, [])

  useEffect(() => {
    if (!pending) return undefined
    exitRef.current?.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      answer(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending) return null

  function answer(ok) {
    pending.resolve(ok)
    setPending(null)
  }

  return (
    <div style={S.backdrop} data-testid="android-exit-prompt">
      <div
        style={S.panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-message`}
      >
        <h2 id={`${baseId}-title`} style={S.title}>
          {t('appLifecycle.exitTitle', 'Exit OpenBeach?')}
        </h2>
        <p id={`${baseId}-message`} style={S.message}>
          {t('appLifecycle.exitBody', 'Matches are saved on this device: open OpenBeach again to continue.')}
        </p>
        <div style={S.actions}>
          <button type="button" data-modal-close style={{ ...S.button, ...S.secondary }} onClick={() => answer(false)}>
            {t('appLifecycle.stay', 'Stay')}
          </button>
          <button type="button" ref={exitRef} style={{ ...S.button, ...S.primary }} onClick={() => answer(true)}>
            {t('appLifecycle.exitConfirm', 'Exit')}
          </button>
        </div>
      </div>
    </div>
  )
}
