import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal as KitModal } from '../ui/volleyui/Modal.jsx'
import { Button } from '../ui/volleyui/Button.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import { FormError } from '../ui/volleyui/Field.jsx'
import { dayTimeLabel } from '../ui/volleyui/format.js'
import { BACKUP_DAMAGED, BACKUP_NEWER, BACKUP_NO_CRYPTO, BACKUP_WRONG_PIN, openEnvelope, openedBackup } from '../utils_beach/backupCrypto/envelope_beach'

// Asks for the PIN of an encrypted app backup file (utils_beach/backupCrypto,
// audit SEC-22) before the restore preview: the game PIN or the referee PIN,
// either opens it. A wrong PIN says so and the scorer tries again; Cancel
// goes back, also while a PIN is being tried (the attempt is abandoned, its
// late result ignored). Opened by hooks_beach/useBackupUnlock_beach, above
// the Restore match dialog. What the file shows in the clear (game number,
// date, set scores) tells the scorer which match it is.
//
// That header is not authenticated until the file opens: a damaged or crafted
// file can hold anything there. Only short text, numbers and scores are shown.
//
// The PIN is a secret for the interaction log (utils_beach/eventCapture_beach
// isSensitiveTarget: the field's name, and data-sensitive on the form).
//
// Ported from OpenVolley src/components/BackupUnlockDialog.jsx.
const MAX_TEXT = 80
const MAX_SETS = 5

function shownText(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : ''
}

// a time dayTimeLabel can read (a string or a number), else none
const shownTime = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '')

function shownScore(v) {
  const n = typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : v
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null
}

/** The readable header of an envelope, as the dialog shows it: strings only. */
export function readableSummary(envelope) {
  const raw = envelope?.readable
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const sets = (Array.isArray(r.sets) ? r.sets : [])
    .filter(s => s && typeof s === 'object' && shownScore(s.team1) != null && shownScore(s.team2) != null)
    .slice(0, MAX_SETS)
    .map(s => `${shownScore(s.team1)}:${shownScore(s.team2)}`)
    .join('  ')
  return {
    gameN: shownText(r.gameN),
    scheduledAt: shownTime(r.scheduledAt),
    sets,
    lastUpdated: shownTime(r.lastUpdated)
  }
}

function unlockErrorText(err, t) {
  switch (err?.code) {
    case BACKUP_WRONG_PIN: return t('backupUnlock.wrongPin')
    case BACKUP_DAMAGED: return t('backupUnlock.damaged')
    case BACKUP_NEWER: return t('backupUnlock.newer')
    case BACKUP_NO_CRYPTO: return t('backupUnlock.unsupported')
    default: return t('backupUnlock.failed', { error: err?.message || String(err ?? '') })
  }
}

export default function BackupUnlockDialog({ envelope, onOpened, onCancel, open = openEnvelope }) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const attempt = useRef(null) // the AbortController of the PIN being tried
  const inputId = useId()
  useEffect(() => { inputRef.current?.focus() }, [])
  // After a wrong PIN, the field is ready for the next try
  useEffect(() => { if (error) inputRef.current?.select?.() }, [error])
  // Closed while a PIN is tried: its result is ignored
  useEffect(() => () => attempt.current?.abort(), [])

  const r = readableSummary(envelope)
  const when = dayTimeLabel(r.scheduledAt)
  const gameLine = [r.gameN ? t('backupUnlock.game', { n: r.gameN }) : '', when].filter(Boolean).join(' · ')
  const { sets } = r
  const saved = dayTimeLabel(r.lastUpdated)

  const submit = async (e) => {
    e?.preventDefault()
    if (busy || !pin) return
    const tried = new AbortController()
    attempt.current = tried
    setBusy(true)
    setError('')
    try {
      // About half a second per PIN slot on a tablet (Argon2id, kdf_beach.js)
      const { data, unlockedWith } = await open(envelope, pin, { signal: tried.signal })
      if (tried.signal.aborted) return // cancelled meanwhile
      onOpened(openedBackup(data, unlockedWith))
    } catch (err) {
      if (tried.signal.aborted) return
      setError(unlockErrorText(err, t))
      setBusy(false)
    }
  }

  const cancel = () => {
    attempt.current?.abort()
    setBusy(false)
    onCancel()
  }

  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1001 }}>
      <KitModal
        open
        size="md"
        onClose={cancel}
        closeLabel={t('common.close')}
        title={t('backupUnlock.title')}
      >
        <form onSubmit={submit} data-testid="backup-unlock-dialog" data-sensitive="">
          <p className="m-0 text-sm text-stone-600">{t('backupUnlock.intro')}</p>
          {(gameLine || sets) && (
            <div className="mt-3 rounded-xl border border-stone-200/70 bg-stone-50/60 px-3 py-2.5 text-center">
              {gameLine && <div className="text-sm font-semibold tabular-nums text-stone-900">{gameLine}</div>}
              {sets && <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-stone-800">{sets}</div>}
              {saved && <div className="mt-1 text-[11px] tabular-nums text-stone-500">{t('backupUnlock.saved', { when: saved })}</div>}
            </div>
          )}
          <label htmlFor={inputId} className="mb-1.5 mt-4 block text-sm font-medium text-stone-700">
            {t('backupUnlock.pinLabel')}
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            name="backup-pin"
            size="lg"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={12}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\s/g, '')); setError('') }}
            placeholder="000000"
            invalid={!!error}
            disabled={busy}
            className="text-center font-mono text-lg font-semibold tracking-[0.3em]"
          />
          <FormError className="mt-3">{error}</FormError>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="positive" size="lg" loading={busy} disabled={!pin} data-testid="backup-unlock-open">
              {busy ? t('backupUnlock.opening') : t('backupUnlock.open')}
            </Button>
          </div>
        </form>
      </KitModal>
    </div>
  )
}
