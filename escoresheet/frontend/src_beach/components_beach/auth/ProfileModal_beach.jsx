import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, LogOut, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import { Modal } from '../../ui/volleyui/Modal.jsx'
import { Field, FormError } from '../../ui/volleyui/Field.jsx'
import { Input } from '../../ui/volleyui/Input.jsx'
import { Button } from '../../ui/volleyui/Button.jsx'
import { Chip } from '../../ui/volleyui/Chip.jsx'
import { confirmDialog, toast } from '../../ui/volleyui/uiStore.js'
import AuthLayer from './AuthLayer_beach'
import InviteCodeForm from './InviteCodeForm_beach'

const ROLE_WORDS = {
  admin: ['account.roles.admin', 'Admin'],
  super_admin: ['account.roles.admin', 'Admin'],
  scorer: ['account.roles.scorer', 'Scorer'],
  'beach:scorer': ['account.roles.scorer', 'Scorer'],
  referee: ['account.roles.referee', 'Referee'],
  'beach:referee': ['account.roles.referee', 'Referee'],
  competition_manager: ['account.roles.competitionManager', 'Competition manager'],
  'beach:competition_manager': ['account.roles.competitionManager', 'Competition manager']
}

/** The account's roles as words, once each (beach:scorer and scorer are one). */
export function roleLabels(roles, t) {
  const out = []
  for (const r of roles || []) {
    const word = ROLE_WORDS[r]
    if (!word) continue
    const label = t(word[0], word[1])
    if (!out.includes(label)) out.push(label)
  }
  return out
}

/**
 * The account of this device: who is signed in, the approval state (with
 * the invite code for a pending account), the name, sign out (court tablets
 * are shared) and delete account.
 */
export default function ProfileModal({ open, onClose }) {
  const { t } = useTranslation()
  const { user, profile, access, updateProfile, signOut, deleteAccount } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState(null) // 'signout' | 'delete'
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!open) return
    setFirstName(profile?.first_name || '')
    setLastName(profile?.last_name || '')
    setSaveError('')
    setActionError('')
  }, [open, profile])

  if (!open || !user) return null

  const email = user.email || profile?.email || ''
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
  const changed = firstName.trim() !== (profile?.first_name || '') || lastName.trim() !== (profile?.last_name || '')
  const roles = roleLabels(access?.roles, t)

  const save = async (e) => {
    e.preventDefault()
    if (!changed || saving) return
    setSaving(true)
    setSaveError('')
    const { error } = await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() })
    setSaving(false)
    if (error) {
      setSaveError(error.message || t('account.errors.saveFailed', 'Your name was not saved.'))
      return
    }
    toast.success(t('account.saved', 'Saved.'))
  }

  const handleSignOut = async () => {
    setBusy('signout')
    setActionError('')
    const { error } = await signOut()
    setBusy(null)
    if (error) {
      setActionError(error.message || t('account.errors.signOutFailed', 'Sign-out failed.'))
      return
    }
    toast.info(t('account.signedOut', 'Signed out. Matches stay on this device.'))
    onClose?.()
  }

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: t('account.deleteConfirmTitle', 'Delete your account?'),
      message: t('account.deleteConfirmBody', { email, defaultValue: 'The account {{email}} and its profile are deleted for good. Matches on this device stay here.' }),
      confirmLabel: t('account.deleteConfirm', 'Delete account'),
      cancelLabel: t('common.cancel', 'Cancel'),
      tone: 'danger'
    })
    if (!ok) return
    setBusy('delete')
    setActionError('')
    const { error } = await deleteAccount()
    setBusy(null)
    if (error) {
      setActionError(error.message || t('account.errors.deleteFailed', 'The account was not deleted.'))
      return
    }
    toast.success(t('account.deleted', 'Account deleted.'))
    onClose?.()
  }

  return (
    <AuthLayer>
      <Modal
        open={open}
        onClose={onClose}
        layout="sections"
        size="md"
        icon={UserRound}
        title={t('account.title', 'Your account')}
        closeLabel={t('common.close', 'Close')}
      >
        <div className="space-y-4">
          {/* Who is signed in */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{t('account.signedInAs', 'Signed in as')}</div>
            {name && <div className="mt-0.5 text-sm font-semibold text-stone-900 break-words">{name}</div>}
            <div className="text-sm text-stone-600 break-all" data-testid="account-email">{email}</div>
            {roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles.map(r => <Chip key={r}>{r}</Chip>)}
              </div>
            )}
          </div>

          {/* Waiting for approval: the invite code */}
          {access?.known && access.isPending && (
            <section aria-labelledby="ob-pending-title" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900" data-testid="pending-approval">
              <div className="flex items-start gap-2">
                <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <h3 id="ob-pending-title" className="text-sm font-semibold">{t('account.pendingTitle', 'Waiting for approval')}</h3>
                  <p className="mt-0.5 text-xs text-amber-900/90">
                    {t('account.pendingBody', 'Your account can score on this device, but matches reach the cloud only once it is approved. Have an invite code? Enter it here.')}
                  </p>
                  <InviteCodeForm className="mt-3" />
                </div>
              </div>
            </section>
          )}

          {/* Name */}
          <form onSubmit={save} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('account.firstName', 'First name')}>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </Field>
              <Field label={t('account.lastName', 'Last name')}>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </Field>
            </div>
            {saveError && <FormError>{saveError}</FormError>}
            <Button type="submit" variant="positive" loading={saving} disabled={!changed}>
              {t('account.saveName', 'Save name')}
            </Button>
          </form>

          {/* Sign out / delete */}
          <div className="space-y-3 border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-500">
              {t('account.signOutHint', 'On a shared court tablet, sign out when you are done. Matches stay on this device.')}
            </p>
            {actionError && <FormError>{actionError}</FormError>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="dark" size="lg" icon={LogOut} loading={busy === 'signout'} disabled={!!busy} onClick={handleSignOut}>
                {t('account.signOut', 'Sign out')}
              </Button>
              <Button variant="danger-outline" size="lg" icon={Trash2} loading={busy === 'delete'} disabled={!!busy} onClick={handleDelete} className="ml-auto">
                {t('account.deleteAccount', 'Delete account')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AuthLayer>
  )
}
