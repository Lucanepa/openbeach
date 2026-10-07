import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, LogIn } from 'lucide-react'
import { useAuth } from '../../contexts_beach/AuthContext_beach'
import { COMPETITIONS_ENABLED } from '../../utils_beach/features_beach'
import { SIGNUP_URL, RESET_PASSWORD_URL } from '../../lib_beach/accountLinks_beach'
import { Modal } from '../../ui/volleyui/Modal.jsx'
import { Field, FormError } from '../../ui/volleyui/Field.jsx'
import { Input } from '../../ui/volleyui/Input.jsx'
import { Button } from '../../ui/volleyui/Button.jsx'
import AuthLayer from './AuthLayer_beach'

const LINK = 'font-medium text-red-700 underline underline-offset-2 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 rounded-sm'

/**
 * Sign in to OpenBeach (volleyui decision dialog). Accounts are created and
 * passwords reset on the OpenBeach manager (lib_beach/accountLinks_beach):
 * "Create account" and "Forgot password?" open it in the browser.
 */
export default function LoginModal({ open, onClose }) {
  const { t } = useTranslation()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    setPassword('')
    setError('')
    onClose?.()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(t('account.errors.offline', 'No connection: this needs the internet.'))
      return
    }
    setError('')
    setLoading(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setLoading(false)
    if (signInError) {
      setError(signInError.message || t('account.errors.signInFailed', 'Sign-in failed.'))
      return
    }
    setPassword('')
    onClose?.()
  }

  if (!open) return null

  return (
    <AuthLayer>
      <Modal
        open={open}
        onClose={close}
        decision
        dismissible={false}
        size="sm"
        icon={LogIn}
        title={t('account.signInTitle', 'Sign in')}
        closeLabel={t('common.close', 'Close')}
      >
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <p className="text-sm text-stone-600">
            {t('account.signInLead', 'Sign in with your OpenBeach account to save matches to the cloud.')}
          </p>
          <Field label={t('account.email', 'Email')}>
            <Input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-autofocus
            />
          </Field>
          <Field label={t('account.password', 'Password')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" size="lg" block loading={loading} disabled={!email.trim() || !password}>
            {loading ? t('account.signingIn', 'Signing in…') : t('account.signIn', 'Sign in')}
          </Button>
          <div className="flex flex-col gap-2 pt-1 text-sm text-stone-600">
            <a href={RESET_PASSWORD_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              {t('account.forgotPassword', 'Forgot password?')}
            </a>
            <p>
              {t('account.noAccount', 'No account yet?')}{' '}
              <a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="create-account-link">
                {t('account.createAccount', 'Create account')}
                <ExternalLink size={12} aria-hidden="true" className="ml-1 inline align-[-1px]" />
              </a>
            </p>
            {COMPETITIONS_ENABLED && (
              <a href="/admin_beach.html" className={LINK}>{t('account.competitionsAdmin', 'Competitions admin')}</a>
            )}
          </div>
        </form>
      </Modal>
    </AuthLayer>
  )
}
