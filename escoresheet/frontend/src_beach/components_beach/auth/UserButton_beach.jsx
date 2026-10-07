import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogIn, UserRound } from 'lucide-react'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import { cn } from '../../ui/volleyui/cn.js'
import LoginModal from './LoginModal_beach'
import ProfileModal from './ProfileModal_beach'

/** Initials of the account for the header button ("AM"), or null. */
export function accountInitials(profile, email) {
  const first = String(profile?.first_name || '').trim()
  const last = String(profile?.last_name || '').trim()
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || null
  const mail = String(email || '').trim()
  return mail ? mail.charAt(0).toUpperCase() : null
}

/**
 * The account in the header: "Sign in" while signed out, the account's
 * initials (with an amber dot while it waits for approval) once signed in,
 * which opens the account dialog (sign out, invite code, delete). Rendered
 * only where the cloud is reachable at all (not in offline mode, not on a
 * venue relay's page): MainHeader_beach decides.
 * @param {{ buttonClass: string }} props  the header's button face
 */
export default function UserButton({ buttonClass }) {
  const { t } = useTranslation()
  // Outside an AuthProvider (isolated renders) there is no account: no button
  // (useAuth throws without a provider; it is still called on every render)
  let auth = null
  try { auth = useAuth() } catch { auth = null }
  const [showLogin, setShowLogin] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  if (!auth || auth.loading) return null
  const { user, profile, access } = auth

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowLogin(true) }}
          className={buttonClass}
          data-testid="header-sign-in"
        >
          <LogIn size={14} aria-hidden="true" />
          <span>{t('account.signIn', 'Sign in')}</span>
        </button>
        <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      </>
    )
  }

  const initials = accountInitials(profile, user.email)
  const pending = access?.known && access.isPending
  const label = pending
    ? t('account.buttonPending', { email: user.email || '', defaultValue: 'Account {{email}}: waiting for approval' })
    : t('account.button', { email: user.email || '', defaultValue: 'Account {{email}}' })

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShowProfile(true) }}
        aria-label={label}
        title={label}
        className={cn(buttonClass, 'relative')}
        data-testid="header-account"
      >
        {initials
          ? <span className="text-xs font-semibold tabular-nums">{initials}</span>
          : <UserRound size={14} aria-hidden="true" />}
        {pending && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" />}
      </button>
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </>
  )
}
