import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ServerConnectionScreen from '../ServerConnectionScreen_beach'
import { getBackendOverride, isNativeApp } from '../../utils_beach/backendConfig_beach'

const buttonStyle = {
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer'
}

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
 * Styled like the rest of the (dark) options modal until the Phase 5 restyle.
 *
 * @param {{ Section: Function, Row: Function }} props the options modal's own layout pieces
 */
export default function NativeServerSection({ Section, Row }) {
  const { t } = useTranslation()
  const [choosing, setChoosing] = useState(false)
  if (!isNativeApp()) return null

  const override = getBackendOverride()
  let current = t('options.nativeServerCloud', 'Cloud (backend.openvolley.app)')
  if (override) {
    try { current = new URL(override).host } catch { current = override }
  }

  // A history entry: Android's Back returns to the scorer (MainActivity)
  const openView = (path) => { window.location.assign(path) }

  return (
    <Section title={t('options.nativeServerTitle', 'Server')}>
      <Row style={{ marginBottom: '12px', gap: '16px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>
            {override ? t('options.nativeServerLocal', 'Local server') : t('options.nativeServerOnline', 'Online')}
          </div>
          <div
            data-testid="native-server-current"
            style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {current}
          </div>
        </div>
        <button type="button" style={buttonStyle} onClick={() => setChoosing(true)}>
          {t('options.nativeServerChange', 'Change server')}
        </button>
      </Row>
      <Row style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px' }}>
          {t('options.nativeOpenView', 'Use this tablet as')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button type="button" style={buttonStyle} onClick={() => openView('/referee_beach.html')}>
            {t('options.nativeReferee', 'Referee')}
          </button>
          <button type="button" style={buttonStyle} onClick={() => openView('/livescore_beach.html')}>
            {t('options.nativeLivescore', 'Livescore')}
          </button>
        </div>
      </Row>

      {/* Portal + stopped propagation: the options modal's backdrop swallows
          touchstart (preventDefault) for everything rendered inside it, which
          would keep the address field from ever getting focus. */}
      {choosing && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 2000, overflowY: 'auto', background: '#0a0a0a' }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-modal-close
            aria-label={t('options.close', 'Close')}
            title={t('options.close', 'Close')}
            onClick={() => setChoosing(false)}
            style={{
              position: 'absolute', top: 16, right: 16, zIndex: 1, width: 44, height: 44, borderRadius: 8,
              border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 22, cursor: 'pointer'
            }}
          >
            ×
          </button>
          <ServerConnectionScreen
            skipIfAutoConnect={false}
            onConnected={() => window.location.reload()}
          />
        </div>,
        document.body
      )}
    </Section>
  )
}
