import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, MonitorPlay } from 'lucide-react'
import { Button } from '../../ui/volleyui/Button.jsx'
import { Input } from '../../ui/volleyui/Input.jsx'
import { OptionRow } from './optionRows_beach'
import { copyToClipboard } from '../../utils_beach/networkInfo_beach'
import { formatLiveCode, liveCodeUrl, localTvUrl, newLiveCode, normalizeLiveCode, setLiveCode, useLiveCode } from '../../utils_beach/liveScreen_beach'
import { getBackendOverride, isStaticDeployment } from '../../utils_beach/backendConfig_beach'
import { detectAppPlatform } from '../../utils_beach/openAppWindow_beach'

/**
 * Options › Live screen (every beach match type): every court of the event
 * on TVs or a beamer (utils_beach/liveScreen_beach.js). One scorer device
 * starts it and gets a live screen code; the other scorer devices of the
 * event enter the same code. The TVs open the link or scan the QR code. Only
 * the score goes online, never players. Kit markup: render it inside `.ov-kit`.
 */
export default function LiveScreenSection() {
  const { t } = useTranslation()
  const code = useLiveCode()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = liveCodeUrl(code)
  const venueUrl = code ? venueTvUrl(code) : null

  const join = () => {
    const c = normalizeLiveCode(typed)
    if (!c) { setError(true); return }
    setError(false)
    setTyped('')
    setLiveCode(c)
  }

  return (
    <OptionRow
      stacked
      testId="live-screen-panel"
      label={t('liveScreen.label')}
      info={t('liveScreen.intro')}
      hint={t('liveScreen.hint')}
      below={code ? (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="rounded-lg border border-stone-200 bg-white p-2">
            <QRCodeSVG value={url} size={112} level="M" marginSize={1} title={url} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500">{t('liveScreen.codeLabel')}</div>
            <div className="font-mono text-2xl font-semibold tracking-wider text-stone-900" data-testid="live-screen-code">{formatLiveCode(code)}</div>
            <div className="mt-1 break-all font-mono text-xs text-stone-600" data-testid="live-screen-url">{url}</div>
            <p className="mt-1 text-xs text-stone-500">{t('liveScreen.smartTv', { url: url.replace(/^https:\/\//, '') })}</p>
            {venueUrl && <p className="mt-1 break-all text-xs text-stone-500" data-testid="live-screen-venue-url">{t('liveScreen.venueUrl', { url: venueUrl })}</p>}
            <p className="mt-1 text-xs text-stone-500">{t('liveScreen.otherDevices')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                icon={copied ? Check : Copy}
                onClick={async () => { setCopied((await copyToClipboard(url))?.success === true) }}
              >
                {copied ? t('liveScreen.copied') : t('liveScreen.copyLink')}
              </Button>
              <Button variant="secondary" size="md" data-testid="live-screen-off" onClick={() => setLiveCode(null)}>
                {t('liveScreen.turnOff')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="secondary" size="md" icon={MonitorPlay} className="self-start" data-testid="live-screen-start" onClick={() => setLiveCode(newLiveCode())}>
            {t('liveScreen.start')}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Input
                size="md"
                value={typed}
                onChange={(e) => { setTyped(e.target.value); setError(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') join() }}
                placeholder="ABCD 2345"
                aria-label={t('liveScreen.enterCode')}
                invalid={error}
                data-testid="live-screen-input"
                className="font-mono uppercase tracking-wider"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button variant="secondary" size="md" data-testid="live-screen-join" onClick={join}>{t('liveScreen.join')}</Button>
          </div>
          {error && <p role="alert" className="text-xs text-red-700">{t('liveScreen.badCode')}</p>}
        </div>
      )}
    />
  )
}

/**
 * The TV page on the venue relay this device scores through, for TVs on the
 * venue's Wi-Fi when it has no internet: a server override (a venue relay)
 * or the relay that served this page. Not the desktop app: its relay
 * (src-tauri relay.rs) has no TV page.
 */
export function venueTvUrl(code) {
  if (detectAppPlatform() === 'tauri') return null
  let base = null
  try { base = getBackendOverride() } catch { base = null }
  if (!base && !isStaticDeployment() && typeof window !== 'undefined') base = window.location.origin
  if (!base || /(^|\.)openvolley\.app(:|\/|$)/.test(base.replace(/^https?:\/\//, ''))) return null
  return localTvUrl(base, code)
}
