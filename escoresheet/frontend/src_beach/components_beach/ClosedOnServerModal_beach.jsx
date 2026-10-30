import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudOff } from 'lucide-react'
import Modal from './Modal_beach'
import { Button } from '../ui/volleyui/Button.jsx'
import { FormError } from '../ui/volleyui/Field.jsx'

/**
 * "Closed on the server": a copy this device was still scoring whose match
 * the server has closed (utils_beach/matchReopen_beach isStaleClosedCopy).
 * It can no longer be scored or synced, so it takes the place of the scoring
 * screen and cannot be dismissed (read-only, the owner 2026-10-27).
 * - Load the official version: the server's copy replaces this one (the
 *   take-back path of ScorerMovedModal_beach); needs a connection and the
 *   game PIN this device kept. When that PIN does not load it, the game
 *   number and game PIN can be entered instead.
 * - Remove from this device: the delete dialog (game PIN); the server keeps
 *   its record, and nothing is deleted there.
 * - Close: back to the home screen, the copy stays.
 *
 * Ported from OpenVolley escoresheet/frontend/src/components/ClosedOnServerModal.jsx
 * (4032fc8b, 2026-10-23: a phone reopened such a copy of match 406970 on its
 * scoring screen at every start and kept a sync error nothing could clear),
 * without its Scoresheet button: OpenBeach's scoresheet window is filled by
 * the screen that opens it, not from the match id.
 * @param {{ onLoadOfficial: () => Promise<{ok?: boolean, error?: string}|void>|void,
 *   onRemove: () => void, onUsePin: () => void, onClose: () => void }} props
 */
export default function ClosedOnServerModal({ onLoadOfficial, onRemove, onUsePin, onClose }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadOfficial = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await onLoadOfficial()
      if (r?.error) setError(LOAD_ERRORS[r.error] || 'failed')
    } catch {
      setError('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('cloudBlock.closedCopy.title')} open={true} hideCloseButton={true} width={460} zIndex={3000} tone="light">
      <div className="ov-kit" data-testid="closed-copy-modal">
        <div role="alert" className="flex items-start gap-3 text-sm text-stone-700">
          <CloudOff size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" />
          <p className="m-0">{t('cloudBlock.closedCopy.body')}</p>
        </div>
        {error && (
          <div className="mt-3" data-testid="closed-copy-error">
            <FormError size="md">{t(`cloudBlock.closedCopy.errors.${error}`)}</FormError>
          </div>
        )}
        {/* Wraps: on a phone the buttons go on two rows instead of out of the dialog */}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </Button>
          <Button variant="danger-soft" size="lg" onClick={onRemove} disabled={busy}>
            {t('cloudBlock.closedCopy.remove')}
          </Button>
          {/* the PIN this device kept did not load it: the restore dialog */}
          {error && error !== 'offline' && (
            <Button variant="secondary" size="lg" onClick={onUsePin} disabled={busy}>
              {t('cloudBlock.closedCopy.usePin')}
            </Button>
          )}
          <Button variant="dark" size="lg" onClick={loadOfficial} disabled={busy} aria-busy={busy || undefined}>
            {t('cloudBlock.closedCopy.loadOfficial')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// takeBackScoring's reasons (utils_beach/matchHandover_beach) -> the message shown
const LOAD_ERRORS = {
  offline: 'offline',
  noPin: 'needsPin',
  notFound: 'needsPin',
  otherMatch: 'needsPin',
  failed: 'failed'
}
