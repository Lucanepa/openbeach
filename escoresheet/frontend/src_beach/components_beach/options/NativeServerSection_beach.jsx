import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import ServerConnectionScreen from '../ServerConnectionScreen_beach'
import { getBackendOverride, isNativeApp } from '../../utils_beach/backendConfig_beach'
import { OptionRow, OptionSection } from './optionRows_beach'
import { Button } from '../../ui/volleyui/Button.jsx'
import { IconButton } from '../../ui/volleyui/IconButton.jsx'
import { reloadWithReason } from '../../diagnostics_beach/reload_beach'

/**
 * Android app only (Capacitor), after OpenVolley's NativeServerSection: the
 * bundled app has no server of its own and opens on the cloud backend. At a
 * venue without internet the scorer points it at the local relay by typing
 * its LAN address: e.g. 192.168.1.20 for the OpenBeach desktop app (port 5174
 * is added, its WebSocket on 8081 is found by itself), 192.168.1.20:5173 for
 * OpenVolley's, or the venue server's address with its port. The same app also
 * opens the referee and livescore views.
 *
 * The choice is the shared backend override (backendConfig_beach), so the
 * referee and livescore pages of the app use the same server. The page
 * reloads after a change so every connection (relay socket, sync, status
 * checks) starts over against the new server.
 *
 * Rows of the volleyui Options dialog (optionRows_beach).
 */
export default function NativeServerSection() {
  const { t } = useTranslation()
  const [choosing, setChoosing] = useState(false)
  if (!isNativeApp()) return null

  const override = getBackendOverride()
  let current = t('options.nativeServerCloud', 'Cloud (backend.openvolley.app)')
  if (override) {
    try { current = new URL(override).host } catch { current = override }
  }

  // A history entry: Android's Back returns to the scorer (MainActivity)
  const openView = (path) => { reloadWithReason('open-view', { how: 'assign', url: path }) }

  return (
    <OptionSection title={t('options.nativeServerTitle', 'Server')}>
      <OptionRow
        label={override ? t('options.nativeServerLocal', 'Local server') : t('options.nativeServerOnline', 'Online')}
        hint={<span data-testid="native-server-current" className="block truncate font-mono">{current}</span>}
        control={(
          <Button variant="secondary" size="xl" onClick={() => setChoosing(true)}>
            {t('options.nativeServerChange', 'Change server')}
          </Button>
        )}
      />
      <OptionRow
        label={t('options.nativeOpenView', 'Use this tablet as')}
        control={(
          <>
            <Button variant="secondary" size="xl" onClick={() => openView('/referee_beach.html')}>
              {t('options.nativeReferee', 'Referee')}
            </Button>
            <Button variant="secondary" size="xl" onClick={() => openView('/livescore_beach.html')}>
              {t('options.nativeLivescore', 'Livescore')}
            </Button>
          </>
        )}
      />

      {/* Portal + stopped propagation: a touch on it must not reach the
          options dialog behind (its backdrop would take it). */}
      {choosing && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('connection.connectToServer', 'Connect to Server')}
          className="ov-kit fixed inset-0 overflow-y-auto"
          style={{ zIndex: 2000 }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="absolute right-3 top-3 z-10">
            <IconButton variant="close" icon={X} label={t('options.close', 'Close')} onClick={() => setChoosing(false)} data-modal-close="" />
          </div>
          <ServerConnectionScreen
            skipIfAutoConnect={false}
            onConnected={() => reloadWithReason('server-connected')}
          />
        </div>,
        document.body
      )}
    </OptionSection>
  )
}
