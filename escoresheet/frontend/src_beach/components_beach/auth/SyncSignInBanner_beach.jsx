import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import LoginModal from './LoginModal_beach'
import SignUpModal from './SignUpModal_beach'

const DISMISS_KEY = 'ob_sync_signin_banner_dismissed'

function readDismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/**
 * Should the "sign in to sync" banner show? Only when the cloud backend asked
 * for a session (sync status 'auth_required' comes from a 401 on a write, or
 * from waiting jobs with no session on this device), so a LAN/venue server or
 * an offline device never shows it. Also with a user in the app: the stored
 * session was then revoked or expired on the server, and the scorer must sign
 * in again.
 */
export function shouldShowSyncSignIn({ syncStatus, loading, dismissed }) {
  return syncStatus === 'auth_required' && !loading && !dismissed
}

/**
 * Non-blocking notice for a scorer who is not signed in: scoring keeps working
 * and everything is saved on this device, but the cloud copy (referee,
 * livescore, backup) needs an account. After a sign-in the waiting changes are
 * sent at once (useSyncQueue_beach resumes on the session change).
 *
 * Ported from OpenVolley src/components/auth/SyncSignInBanner.jsx.
 */
export default function SyncSignInBanner({ syncStatus, compact = false }) {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [showLogin, setShowLogin] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  const visible = shouldShowSyncSignIn({ syncStatus, loading, dismissed })
  // Signed in as far as the app knows, but the backend refused the session
  const sessionExpired = !!user
  const title = sessionExpired
    ? t('syncBanner.expiredTitle', 'Session expired: changes are saved on this device only')
    : t('syncBanner.title', 'Not signed in: this match is saved on this device only')

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  return (
    <>
      {visible && !showLogin && !showSignUp && (
        <div
          role="status"
          aria-live="polite"
          className={`sync-signin-banner${compact ? ' sync-signin-banner--compact' : ''}`}
        >
          <div className="sync-signin-banner-text">
            <div className="sync-signin-banner-title">{title}</div>
            {!compact && (
              <div className="sync-signin-banner-body">
                {sessionExpired
                  ? t('syncBanner.expiredBody', 'Scoring keeps working. Sign in again to save it to the cloud; waiting changes are sent right after.')
                  : t('syncBanner.body', 'Scoring keeps working. Sign in to save it to the cloud (referee, livescore, backup); waiting changes are sent right after.')}
              </div>
            )}
          </div>
          <div className="sync-signin-banner-actions">
            <button type="button" onClick={dismiss} className="sync-signin-banner-later">
              {t('syncBanner.later', 'Later')}
            </button>
            <button type="button" onClick={() => setShowLogin(true)} className="sync-signin-banner-signin">
              {sessionExpired ? t('syncBanner.signInAgain', 'Sign in again') : t('syncBanner.signIn', 'Sign in')}
            </button>
          </div>
        </div>
      )}

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignUp={() => {
          setShowLogin(false)
          setShowSignUp(true)
        }}
      />

      <SignUpModal
        open={showSignUp}
        onClose={() => setShowSignUp(false)}
        onSwitchToLogin={() => {
          setShowSignUp(false)
          setShowLogin(true)
        }}
      />
    </>
  )
}
