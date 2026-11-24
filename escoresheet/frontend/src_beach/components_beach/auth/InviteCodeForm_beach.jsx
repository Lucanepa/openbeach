import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import { formatInviteCode } from '../../lib_beach/access_beach'
import { Button } from '../../ui/volleyui/Button.jsx'
import { Input } from '../../ui/volleyui/Input.jsx'
import { toast } from '../../ui/volleyui/uiStore.js'

/**
 * OpenBeach invite code: the field and "Redeem code" (one height). Uppercase,
 * monospace, grouped as it is typed (as OpenVolley's InviteCodeForm). The
 * error shows inline; a toast once the server granted the role.
 */
export default function InviteCodeForm({ onRedeemed, className = '' }) {
  const { t } = useTranslation()
  const { redeemInvite } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const clean = code.replace(/[^0-9A-Z]/g, '')
  const submit = async (e) => {
    e.preventDefault()
    if (busy || clean.length < 12) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(t('account.errors.offline', 'No connection: this needs the internet.'))
      return
    }
    setBusy(true)
    setError('')
    const { data, error: err, status } = await redeemInvite(code)
    setBusy(false)
    if (err) {
      setError(status === 404 || status === 400 || status === 410
        ? t('account.errors.inviteRejected', 'This code is not valid (wrong, used up or expired).')
        : status === 429
          ? t('account.errors.tooManyTries', 'Too many tries. Wait a few minutes and try again.')
          : (err.message || t('account.errors.inviteRejected', 'This code is not valid (wrong, used up or expired).')))
      return
    }
    setCode('')
    toast.success(t('account.redeemed', 'Code accepted. Your account is approved.'))
    onRedeemed?.(data)
  }

  return (
    <form onSubmit={submit} className={className} noValidate>
      <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="ob-invite-code">
        {t('account.inviteCodeLabel', 'Invite code')}
      </label>
      <div className="flex flex-col gap-2 min-[420px]:flex-row">
        <Input
          id="ob-invite-code"
          size="md"
          value={code}
          onChange={(e) => { setCode(formatInviteCode(e.target.value)); setError('') }}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          invalid={!!error}
          aria-describedby={error ? 'ob-invite-code-error' : undefined}
          className="font-mono uppercase tracking-[0.2em] min-[420px]:w-56"
        />
        <Button type="submit" size="md" loading={busy} disabled={busy || clean.length < 12}>
          {t('account.redeem', 'Redeem code')}
        </Button>
      </div>
      {error && <p id="ob-invite-code-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </form>
  )
}
