import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import LoginModal from './LoginModal_beach'
import ProfileModal from './ProfileModal_beach'
import { toast } from '../../ui/volleyui/uiStore.js'
import { cn } from '../../ui/volleyui/cn.js'
import { FOCUS_RING } from '../../ui/volleyui/Button.jsx'

const DISMISS_KEY = 'ob_sync_signin_banner_dismissed'
const JOIN_DISMISS_KEY = 'ob_sync_join_banner_dismissed'

function readDismissed(key = DISMISS_KEY) {
  try { return sessionStorage.getItem(key) === '1' } catch { return false }
}

// Sync states in which the cloud answers at all (not offline, not a venue
// relay's page, not a build without a backend)
const CLOUD_REACHED = new Set(['connecting', 'syncing', 'synced', 'error', 'auth_required'])

/**
 * Should the "join OpenBeach" banner show? A signed-in account of the shared
 * login that /api/me reports as not an OpenBeach member (an OpenVolley
 * account): the backend refuses its beach matches until it has joined and
 * been approved.
 */
export function shouldShowJoinBeach({ syncStatus, loading, dismissed, user, access }) {
  return !!user && !loading && !dismissed && !!access?.known && !!access.needsJoin && CLOUD_REACHED.has(syncStatus)
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
 * A signed-in OpenVolley account that is not in OpenBeach yet gets "Join
 * OpenBeach" instead; the account dialog then shows its pending state with
 * the invite code field.
 *
 * Ported from OpenVolley src/components/auth/SyncSignInBanner.jsx.
 */
export default function SyncSignInBanner({ syncStatus, compact = false }) {
  const { t } = useTranslation()
  const { user, loading, access, joinBeach } = useAuth()
  const [dismissed, setDismissed] = useState(() => readDismissed(DISMISS_KEY))
  const [joinDismissed, setJoinDismissed] = useState(() => readDismissed(JOIN_DISMISS_KEY))
  const [showLogin, setShowLogin] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  // A session the backend refused comes first: joining needs a valid one
  const signInVisible = shouldShowSyncSignIn({ syncStatus, loading, dismissed })
  const joinVisible = !signInVisible && shouldShowJoinBeach({ syncStatus, loading, dismissed: joinDismissed, user, access })
  const visible = signInVisible || joinVisible
  // Signed in as far as the app knows, but the backend refused the session
  const sessionExpired = !!user
  const title = joinVisible
    ? t('syncBanner.joinTitle', 'Not in OpenBeach yet: matches stay on this device')
    : sessionExpired
      ? t('syncBanner.expiredTitle', 'Session expired: changes are saved on this device only')
      : t('syncBanner.title', 'Not signed in: this match is saved on this device only')
  const body = joinVisible
    ? t('syncBanner.joinBody', 'This OpenVolley account can join OpenBeach with the same login. Once an invite code or an admin approves it, the waiting matches are sent.')
    : sessionExpired
      ? t('syncBanner.expiredBody', 'Scoring keeps working. Sign in again to save it to the cloud; waiting changes are sent right after.')
      : t('syncBanner.body', 'Scoring keeps working. Sign in to save it to the cloud (referee, livescore, backup); waiting changes are sent right after.')

  const dismiss = () => {
    const key = joinVisible ? JOIN_DISMISS_KEY : DISMISS_KEY
    if (joinVisible) setJoinDismissed(true)
    else setDismissed(true)
    try { sessionStorage.setItem(key, '1') } catch { /* private mode */ }
  }

  const join = async () => {
    if (joining) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setJoinError(t('account.errors.offline', 'No connection: this needs the internet.'))
      return
    }
    setJoining(true)
    setJoinError('')
    const { error } = await joinBeach()
    setJoining(false)
    if (error) {
      setJoinError(t('account.errors.joinFailed', 'Joining OpenBeach failed. Try again.'))
      return
    }
    toast.success(t('account.joined', 'You joined OpenBeach. It now waits for approval.'))
    // The pending state, with the invite code field
    setShowAccount(true)
  }

  return (
    <>
      {visible && !showLogin && !showAccount && (
        <div
          role="status"
          aria-live="polite"
          // Kit amber banner (decide / stale), floating, no-print, as in
          // OpenVolley. Shown on the scoring screen too, so the action is dark,
          // never a brand-red fill.
          className={cn(
            'ov-kit no-print fixed flex items-center rounded-xl border border-amber-200 bg-amber-50 shadow-lg',
            compact ? 'flex-nowrap gap-2 px-2.5 py-1.5' : 'flex-wrap gap-3 px-3.5 py-3'
          )}
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            // On the scoring screen: one short line at the top, clear of the
            // scoring controls along the bottom
            ...(compact
              ? { top: 'calc(env(safe-area-inset-top, 0px) + 6px)', width: 'min(460px, calc(100vw - 24px))' }
              : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', width: 'min(560px, calc(100vw - 32px))' }),
            zIndex: 1500
          }}
          data-testid={joinVisible ? 'sync-join-banner' : 'sync-signin-banner'}
        >
          <div className={cn('min-w-0', compact ? 'flex-auto' : 'flex-[1_1_260px]')}>
            <div className={cn('font-semibold text-amber-800', compact ? 'truncate text-xs' : 'mb-0.5 text-sm')} title={compact ? title : undefined}>
              {title}
            </div>
            {!compact && (
              <div className="text-xs leading-snug text-stone-600">{body}</div>
            )}
            {joinError && (
              <div role="alert" className={cn('font-medium text-red-700', compact ? 'truncate text-[11px]' : 'mt-1 text-xs')}>{joinError}</div>
            )}
          </div>
          <div className={cn('flex shrink-0', compact ? 'gap-1.5' : 'gap-2')}>
            <button
              type="button"
              onClick={dismiss}
              className={cn('inline-flex items-center rounded-lg border border-amber-200 bg-white font-medium text-amber-800 transition-colors hover:bg-amber-100', compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-xs', FOCUS_RING)}
            >
              {t('syncBanner.later', 'Later')}
            </button>
            {joinVisible ? (
              <button
                type="button"
                onClick={join}
                disabled={joining}
                aria-busy={joining || undefined}
                className={cn('inline-flex items-center gap-1.5 rounded-lg bg-slate-900 font-semibold text-white transition-colors hover:bg-slate-800 disabled:bg-stone-300', compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-xs', FOCUS_RING)}
                data-testid="banner-join-beach"
              >
                {joining && <Loader2 size={12} aria-hidden="true" className="animate-spin" />}
                {t('account.joinBeach', 'Join OpenBeach')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className={cn('inline-flex items-center rounded-lg bg-slate-900 font-semibold text-white transition-colors hover:bg-slate-800', compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-xs', FOCUS_RING)}
              >
                {sessionExpired ? t('syncBanner.signInAgain', 'Sign in again') : t('syncBanner.signIn', 'Sign in')}
              </button>
            )}
          </div>
        </div>
      )}

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
      <ProfileModal open={showAccount} onClose={() => setShowAccount(false)} />
    </>
  )
}
