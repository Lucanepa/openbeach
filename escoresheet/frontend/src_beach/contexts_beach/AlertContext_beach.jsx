import { createContext, useContext, useState, useCallback, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '../ui/volleyui/cn.js'
import { modalPrimaryClass } from '../ui/volleyui/Modal.jsx'
import { useDialogFocus } from '../components_beach/Modal_beach'

const AlertContext = createContext(null)

// The app's alert dialog on the volleyui decision recipe: stone-900/60 scrim
// with blur, a white rounded-2xl panel, a text-lg title and one dark "Close".
// The hue of the icon names the kind (red error, amber warning, emerald done,
// sky info) and the title says it in words too. It sits above every legacy
// layer of the scoring screen (their modals use z-indices up to 10000).
const KINDS = {
  error: { icon: CircleAlert, tint: 'bg-red-50 text-red-700', titleKey: 'alert.error', fallback: 'Error' },
  success: { icon: CircleCheck, tint: 'bg-emerald-50 text-emerald-700', titleKey: 'alert.success', fallback: 'Success' },
  warning: { icon: TriangleAlert, tint: 'bg-amber-50 text-amber-700', titleKey: 'alert.warning', fallback: 'Warning' },
  info: { icon: Info, tint: 'bg-sky-50 text-sky-700', titleKey: 'alert.info', fallback: 'Info' }
}

function AlertModal({ alert, onClose }) {
  const { t } = useTranslation()
  const panelRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()
  useDialogFocus(!!alert, panelRef)

  if (!alert) return null

  const kind = KINDS[alert.type] || KINDS.info
  const Icon = kind.icon

  return (
    <div
      className="ov-kit no-print fixed inset-0 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      style={{ zIndex: 100000 }}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-sm max-h-[85vh] overflow-auto rounded-2xl bg-white p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', kind.tint)}>
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-stone-900">
              {t(kind.titleKey, kind.fallback)}
            </h2>
            <div id={bodyId} className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-stone-600">
              {alert.message}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" data-modal-close data-autofocus onClick={onClose} className={cn(modalPrimaryClass, 'min-h-11 min-w-28')}>
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([])

  const showAlert = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    setAlerts(prev => [...prev, { id, message, type }])
  }, [])

  const closeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  // Show only the first alert (queue behavior)
  const currentAlert = alerts[0] || null

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertModal
        alert={currentAlert}
        onClose={() => currentAlert && closeAlert(currentAlert.id)}
      />
    </AlertContext.Provider>
  )
}

export function useAlert() {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider')
  }
  return context
}
