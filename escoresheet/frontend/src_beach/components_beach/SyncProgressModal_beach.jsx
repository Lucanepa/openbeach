import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Circle, CloudOff, Loader2, X } from 'lucide-react'
import { Button } from '../ui/volleyui/Button.jsx'
import { cn } from '../ui/volleyui/cn.js'

// Each step state: its icon and the hue of its word (the word says it too)
const STEP = {
  pending: { Icon: Circle, icon: 'text-stone-300', text: 'text-stone-400' },
  in_progress: { Icon: Loader2, icon: 'animate-spin text-sky-600', text: 'text-stone-900' },
  done: { Icon: Check, icon: 'text-emerald-600', text: 'text-emerald-800' },
  warning: { Icon: AlertTriangle, icon: 'text-amber-600', text: 'text-amber-800' },
  error: { Icon: X, icon: 'text-red-600', text: 'text-red-700' }
}

/**
 * The set end's sync, step by step (volleyui decision dialog over the scoring
 * screen; it cannot be dismissed, it closes itself).
 *
 * Props:
 * - open: boolean - whether modal is visible
 * - steps: Array<{ id: string, label: string, status: 'pending'|'in_progress'|'done'|'error'|'warning' }>
 * - errorMessage: string | null - error message to display
 * - onProceed: () => void - callback when user clicks proceed/done
 * - isComplete: boolean - whether all steps are complete
 * - hasError: boolean - whether any step has an error
 * - hasWarning: boolean - whether any step has a warning (offline)
 */
export default function SyncProgressModal({
  open,
  steps = [],
  errorMessage = null,
  onProceed,
  isComplete = false,
  hasError = false,
  hasWarning = false
}) {
  const { t } = useTranslation()
  // Track if we've already triggered auto-proceed to avoid double-calls
  const hasAutoProceeded = useRef(false)
  const panelRef = useRef(null)

  // Reset tracking when modal opens fresh
  useEffect(() => {
    if (open) {
      hasAutoProceeded.current = false
      panelRef.current?.focus?.()
    }
  }, [open])

  // Auto-proceed after completion (1s for success, 1.5s for warning)
  useEffect(() => {
    if (!open || !isComplete || hasAutoProceeded.current) return

    // Don't auto-proceed on error - user must click button
    if (hasError) return

    const delay = hasWarning ? 1500 : 1000

    const timer = setTimeout(() => {
      if (!hasAutoProceeded.current) {
        hasAutoProceeded.current = true
        onProceed?.()
      }
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [open, isComplete, hasError, hasWarning, onProceed])

  if (!open) return null

  const title = !isComplete
    ? t('scoreboard.sync.titleSyncing', 'Syncing…')
    : hasError
      ? t('scoreboard.sync.titleError', 'Not synced')
      : hasWarning
        ? t('scoreboard.sync.titleOffline', 'Saved on this device')
        : t('scoreboard.sync.titleDone', 'Synced')

  return (
    <div
      className="ov-kit no-print fixed inset-0 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      // Above the scoring screen's legacy overlays, as the startup check
      style={{ zIndex: 2000, pointerEvents: 'auto' }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-sync-progress-title"
        aria-busy={!isComplete || undefined}
        tabIndex={-1}
        className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none"
        data-testid="sync-progress"
      >
        <h3 id="ob-sync-progress-title" className="mb-4 text-center text-lg font-bold text-stone-900">
          {title}
        </h3>

        <ol className="divide-y divide-stone-100 rounded-xl border border-stone-200/70">
          {steps.map((step, index) => {
            const look = STEP[step.status] || STEP.pending
            const { Icon } = look
            return (
              <li key={step.id || index} className="flex min-h-11 items-center gap-3 px-3 py-2" data-status={step.status}>
                <span className="flex w-5 shrink-0 justify-center">
                  <Icon size={18} aria-hidden="true" className={look.icon} />
                </span>
                <span className={cn('text-sm font-medium', look.text)}>{step.label}</span>
              </li>
            )
          })}
        </ol>

        {/* Offline: the data is safe on this device, the queue sends it later */}
        {hasWarning && !hasError && (
          <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            <CloudOff size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" />
            <span>{t('scoreboard.sync.offlineWarning', 'Offline. Data saved locally.')}</span>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-red-700">
            {errorMessage}
          </div>
        )}

        {/* An error waits for the scorer (nothing is lost: the queue retries) */}
        {isComplete && hasError && (
          <div className="mt-5 flex justify-center">
            <Button variant="dark" size="xl" onClick={onProceed} className="w-full sm:w-auto sm:min-w-[200px]">
              {t('scoreboard.sync.proceedAnyway', 'Proceed anyway')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
