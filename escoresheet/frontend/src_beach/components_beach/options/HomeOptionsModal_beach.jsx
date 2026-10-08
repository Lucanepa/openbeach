import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Download, FolderOpen, Keyboard, LifeBuoy, Trash2 } from 'lucide-react'
import { useAlert } from '../../contexts_beach/AlertContext_beach'
import SupportFeedbackModal from '../SupportFeedbackModal_beach'
import NativeServerSection from './NativeServerSection_beach'
import DesktopUpdateSection from './DesktopUpdateSection_beach'
import KeybindingsModal from './KeybindingsModal_beach'
import ActivityLogSection from './ActivityLogSection_beach'
import { OptionNumber, OptionRow, OptionSection, OptionSwitch } from './optionRows_beach'
import LegalLinks from '../LegalLinks_beach'
import { copyToClipboard } from '../../utils_beach/networkInfo_beach'
import { clearCachesAndReload } from '../../utils_beach/appReload_beach'
import { useDesktopUpdate } from '../../hooks_beach/useDesktopUpdate_beach'
import { Modal as KitModal } from '../../ui/volleyui/Modal.jsx'
import { Button } from '../../ui/volleyui/Button.jsx'
import { SegmentedControl } from '../../ui/volleyui/SegmentedControl.jsx'
import { NOTICE } from '../../ui/volleyui/tones.js'
import { confirmDialog } from '../../ui/volleyui/uiStore.js'
import { timeLabel } from '../../ui/volleyui/format.js'
import { cn } from '../../ui/volleyui/cn.js'
import DiagnosticsSection from '../../diagnostics_beach/DiagnosticsSection_beach'

const currentVersion = __APP_VERSION__

const clampSeconds = (raw) => Math.max(1, Math.min(10, parseInt(raw, 10) || 3))

/**
 * Home → Options (volleyui): the scoring checks, the Android server, the
 * screen, the dashboard server, backups, the app version (with the desktop
 * app's updates) and the cache. A light kit dialog with flat switch rows; the
 * "Support & feedback" and "Done" actions sit in its footer.
 */
export default function HomeOptionsModal({
  open,
  onClose,
  matchOptions,
  displayOptions,
  wakeLock,
  backup = null, // Optional backup props from useAutoBackup
  dashboardServer = null // Optional dashboard server props from useDashboardServer
}) {
  const { t } = useTranslation()
  const { showAlert } = useAlert()
  const desktopUpdate = useDesktopUpdate()
  const [copied, setCopied] = useState(null)
  const [supportFeedbackOpen, setSupportFeedbackOpen] = useState(false)
  const [keybindingsModalOpen, setKeybindingsModalOpen] = useState(false)

  const handleCopy = useCallback(async (text, label) => {
    const result = await copyToClipboard(text)
    if (result.success) {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    }
  }, [])

  const clearCache = async (includeLocalStorage) => {
    const ok = await confirmDialog({
      title: includeLocalStorage
        ? t('options.clearAllTitle', 'Clear the cache and all settings?')
        : t('options.clearCacheTitle', 'Clear the cache?'),
      message: includeLocalStorage
        ? `${t('options.clearAllWarning')}\n\n${t('options.resetPreferencesWarning')}`
        : t('options.clearCacheWarning'),
      confirmLabel: includeLocalStorage ? t('options.clearAll') : t('options.clearCache'),
      cancelLabel: t('common.cancel'),
      tone: 'danger'
    })
    if (!ok) return
    try {
      // Reloads with the URL kept (?match= stays). Refused while the server
      // is unreachable: with the precache and the service worker gone, the
      // reload could not load the app at all.
      if (!(await clearCachesAndReload({ includeLocalStorage }))) {
        showAlert(t('options.alerts.clearCacheNeedsServer', 'Cannot clear the cache while the server is unreachable: the app could not be reloaded afterwards.'), 'error')
      }
    } catch (error) {
      console.error('Error clearing cache:', error)
      showAlert(t('options.alerts.failedToClearCache', { error: error.message }), 'error')
    }
  }

  if (!open) return null

  const {
    checkAccidentalRallyStart,
    setCheckAccidentalRallyStart,
    accidentalRallyStartDuration,
    setAccidentalRallyStartDuration,
    checkAccidentalPointAward,
    setCheckAccidentalPointAward,
    accidentalPointAwardDuration,
    setAccidentalPointAwardDuration,
    keybindingsEnabled,
    setKeybindingsEnabled,
    manageDob,
    setManageDob
  } = matchOptions

  const { displayMode, setDisplayMode, detectedDisplayMode, enterDisplayMode, exitDisplayMode } = displayOptions
  const { wakeLockActive, toggleWakeLock } = wakeLock

  const persist = (key, setter) => (value) => {
    setter(value)
    localStorage.setItem(key, String(value))
  }

  const modeName = (mode) => t(`options.${mode}`, mode)
  const screenModes = [
    { value: 'auto', label: t('options.autoWithMode', { mode: modeName(detectedDisplayMode || 'desktop') }), title: t('options.screenModeInfo') },
    { value: 'desktop', label: modeName('desktop'), title: t('options.desktopDesc') },
    { value: 'tablet', label: modeName('tablet'), title: t('options.tabletDesc') },
    { value: 'smartphone', label: modeName('smartphone'), title: t('options.smartphoneDesc') }
  ]
  const chooseScreenMode = (mode) => {
    if (mode === 'tablet' || mode === 'smartphone') return enterDisplayMode(mode)
    if (mode === 'desktop') return exitDisplayMode()
    setDisplayMode(mode)
    localStorage.setItem('displayMode', mode)
  }

  const copyButton = (text, key) => (
    <Button variant="secondary" size="md" icon={copied === key ? Check : Copy} onClick={() => handleCopy(text, key)}>
      {copied === key ? t('options.copied') : t('options.copy')}
    </Button>
  )

  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
      <KitModal
        open
        size="lg"
        layout="sections"
        onClose={onClose}
        closeLabel={t('options.close')}
        title={t('options.title')}
        footer={(
          <>
            <Button variant="secondary" size="lg" icon={LifeBuoy} onClick={() => setSupportFeedbackOpen(true)} className="mr-auto">
              {t('supportFeedback.button')}
            </Button>
            <Button variant="dark" size="lg" onClick={onClose} data-modal-close="">
              {t('options.done', 'Done')}
            </Button>
          </>
        )}
      >
        <OptionSection title={t('options.scoring', 'Scoring')}>
          <OptionSwitch
            label={t('options.checkAccidentalRallyStart')}
            info={t('options.checkAccidentalRallyStartInfo', { duration: accidentalRallyStartDuration })}
            checked={checkAccidentalRallyStart}
            onChange={persist('checkAccidentalRallyStart', setCheckAccidentalRallyStart)}
            below={checkAccidentalRallyStart && (
              <OptionNumber
                label={t('options.duration')}
                suffix={t('options.seconds')}
                min="1"
                max="10"
                value={accidentalRallyStartDuration}
                onChange={(e) => persist('accidentalRallyStartDuration', setAccidentalRallyStartDuration)(clampSeconds(e.target.value))}
              />
            )}
          />
          <OptionSwitch
            label={t('options.checkAccidentalPointAward')}
            info={t('options.checkAccidentalPointAwardInfo', { duration: accidentalPointAwardDuration })}
            checked={checkAccidentalPointAward}
            onChange={persist('checkAccidentalPointAward', setCheckAccidentalPointAward)}
            below={checkAccidentalPointAward && (
              <OptionNumber
                label={t('options.duration')}
                suffix={t('options.seconds')}
                min="1"
                max="10"
                value={accidentalPointAwardDuration}
                onChange={(e) => persist('accidentalPointAwardDuration', setAccidentalPointAwardDuration)(clampSeconds(e.target.value))}
              />
            )}
          />
          <OptionSwitch
            label={t('options.keyboardShortcuts')}
            info={t('options.keyboardShortcutsInfo')}
            checked={keybindingsEnabled}
            onChange={persist('keybindingsEnabled', setKeybindingsEnabled)}
            extra={keybindingsEnabled && (
              <Button variant="secondary" size="md" icon={Keyboard} onClick={() => setKeybindingsModalOpen(true)}>
                {t('options.keybindings')}
              </Button>
            )}
          />
          <OptionSwitch
            label={t('options.manageDob')}
            info={t('options.manageDobInfo')}
            checked={manageDob}
            onChange={persist('manageDob', setManageDob)}
          />
        </OptionSection>

        {/* Android app only: which server (cloud or a venue relay), and the referee / livescore views */}
        <NativeServerSection />

        <OptionSection title={t('options.displayMode')}>
          <OptionRow
            stacked
            label={t('options.screenMode')}
            info={t('options.screenModeInfo')}
            below={(
              <>
                <SegmentedControl
                  className="mt-2 grid-cols-2 sm:grid-cols-4"
                  ariaLabel={t('options.screenMode')}
                  options={screenModes}
                  value={displayMode}
                  onChange={chooseScreenMode}
                />
                {displayMode !== 'desktop' && displayMode !== 'auto' && (
                  <Button variant="secondary" size="md" className="mt-2" onClick={exitDisplayMode}>
                    {t('options.exitMode', { mode: modeName(displayMode) })}
                  </Button>
                )}
              </>
            )}
          />
          <OptionSwitch
            label={t('options.screenAlwaysOn')}
            info={t('options.screenAlwaysOnInfo')}
            checked={wakeLockActive}
            onChange={() => toggleWakeLock()}
          />
        </OptionSection>

        {dashboardServer && (
          <OptionSection title={t('options.dashboardServer')}>
            <OptionSwitch
              label={t('options.enableDashboards')}
              info={t('options.enableDashboardsInfo')}
              checked={dashboardServer.enabled}
              onChange={() => dashboardServer.onToggle()}
            />
            {dashboardServer.enabled && (
              <div className="space-y-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-stone-600">{t('options.serverStatus')}</span>
                  <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', dashboardServer.serverRunning ? 'text-emerald-700' : 'text-red-700')}>
                    <span className={cn('h-2 w-2 rounded-full', dashboardServer.serverRunning ? 'bg-green-500' : 'bg-red-500')} aria-hidden="true" />
                    {dashboardServer.serverRunning ? t('options.running') : t('options.notRunning')}
                  </span>
                </div>

                {dashboardServer.serverRunning && dashboardServer.connectionUrl && (
                  <>
                    <div>
                      <div className="mb-1 text-xs text-stone-500">{t('options.connectDashboardsTo')}</div>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-800">
                          {dashboardServer.connectionUrl}
                        </code>
                        {copyButton(dashboardServer.connectionUrl, 'url')}
                      </div>
                    </div>
                    {dashboardServer.refereePin && (
                      <div>
                        <div className="mb-1 text-xs text-stone-500">{t('options.refereePin')}</div>
                        <div className="flex items-center gap-2">
                          <code className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-lg font-bold tracking-[0.3em] text-stone-900">
                            {dashboardServer.refereePin}
                          </code>
                          {copyButton(dashboardServer.refereePin, 'pin')}
                        </div>
                      </div>
                    )}
                    <figure className="flex flex-col items-center gap-1.5 pt-1">
                      <div className="rounded-lg border border-stone-200 bg-white p-2">
                        <QRCodeSVG value={`${dashboardServer.connectionUrl}/referee`} size={120} level="M" marginSize={1} title={t('options.scanToOpen')} />
                      </div>
                      <figcaption className="text-xs text-stone-500">{t('options.scanToOpen')}</figcaption>
                    </figure>
                  </>
                )}

                {!dashboardServer.serverRunning && (
                  <div className={NOTICE.error}>
                    <strong className="font-semibold">{t('options.serverNotDetected')}</strong>{' '}
                    {t('options.startBackendServer')} <code className="font-mono">npm run start:backend</code>
                  </div>
                )}

                <div className="flex items-center gap-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-3">
                  <span className={cn('text-3xl font-bold tabular-nums', dashboardServer.dashboardCount > 0 ? 'text-emerald-700' : 'text-stone-400')}>
                    {dashboardServer.dashboardCount || 0}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-stone-800">
                      {dashboardServer.dashboardCount === 1
                        ? t('options.dashboardConnected', { count: 1 })
                        : t('options.dashboardsConnected', { count: dashboardServer.dashboardCount || 0 })}
                    </div>
                    {dashboardServer.connectedDashboards?.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {dashboardServer.connectedDashboards.map((client, idx) => (
                          <li key={client.id || idx} className="flex items-center gap-2 text-xs text-stone-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
                            <span className="font-medium">{client.role}{client.team && ` (${client.team})`}</span>
                            <span className="font-mono text-stone-400">{client.ip}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </OptionSection>
        )}

        {backup && (
          <OptionSection title={t('options.backup')}>
            <OptionSwitch
              label={t('options.autoBackup')}
              info={backup.hasFileSystemAccess ? t('options.autoBackupFolderInfo') : t('options.autoBackupDownloadInfo')}
              checked={backup.autoBackupEnabled}
              onChange={(next) => {
                backup.toggleAutoBackup(next)
                if (next && backup.hasFileSystemAccess && !backup.backupDirName) backup.selectBackupDir()
              }}
            />
            {backup.hasFileSystemAccess ? (
              <OptionRow
                label={t('options.backupLocation')}
                hint={backup.backupDirName || t('common.notSet')}
                control={(
                  <>
                    <Button variant="secondary" size="md" icon={FolderOpen} onClick={backup.selectBackupDir}>
                      {backup.backupDirName ? t('options.changeFolder') : t('options.selectBackupFolder')}
                    </Button>
                    {backup.backupDirName && (
                      <Button variant="danger-outline" size="md" onClick={backup.clearBackupDir}>
                        {t('options.clear')}
                      </Button>
                    )}
                  </>
                )}
              />
            ) : (
              <div className="space-y-2 py-3">
                <div className={NOTICE.warning}>
                  <strong className="font-semibold">{t('options.limitedBrowserSupport')}</strong>{' '}
                  {t('options.limitedBrowserSupportDesc')}
                </div>
                <div className="text-xs text-stone-500">{t('options.eventBasedAutoDownload')}</div>
                <ul className="grid grid-cols-2 gap-1 text-xs text-stone-700">
                  {['setStart', 'setEnd', 'matchEnd', 'timeoutCalled'].map(k => (
                    <li key={k} className="flex items-center gap-1.5"><Check size={13} className="text-emerald-600" aria-hidden="true" />{t(`options.${k}`)}</li>
                  ))}
                </ul>
                <div className="text-[11px] text-stone-400">{t('options.eventBasedNote')}</div>
              </div>
            )}
            <OptionRow
              label={t('options.downloadBackupNow')}
              hint={backup.lastBackup ? `${t('options.lastBackup')}: ${timeLabel(backup.lastBackup)}` : null}
              below={backup.backupError && <div role="alert" className={cn(NOTICE.error, 'mt-2')}>{backup.backupError}</div>}
              control={(
                <Button variant="secondary" size="md" icon={Download} loading={backup.isBackingUp} onClick={() => backup.manualBackup()}>
                  {backup.isBackingUp ? t('options.backingUp') : t('options.backUp', 'Back up')}
                </Button>
              )}
            />
          </OptionSection>
        )}

        <ActivityLogSection scope="all" />

        <OptionSection title={t('options.appVersion')} testId="options-app-version">
          {desktopUpdate.active ? (
            <DesktopUpdateSection update={desktopUpdate} />
          ) : (
            <OptionRow
              label={t('options.currentVersion')}
              hint={<span className="tabular-nums">v{currentVersion}</span>}
            />
          )}
          <OptionRow
            label={t('options.iconCredits', 'Icons')}
            hint={t('options.iconCreditsText', 'Lucide (ISC) · Phosphor (MIT)')}
          />
          {/* Privacy policy, terms, legal notice and the full open-source
              notice on openvolley.app, in the app's language. */}
          <div className="py-3">
            <LegalLinks />
          </div>
        </OptionSection>

        <OptionSection title={t('options.diagnostics')}>
          <DiagnosticsSection showAlert={showAlert} testIdPrefix="home-options" />
        </OptionSection>

        <OptionSection title={t('options.cacheManagement')}>
          <OptionRow
            stacked
            label={t('options.clearApplicationCache')}
            info={t('options.clearApplicationCacheInfo')}
            control={(
              <>
                <Button variant="danger-outline" size="md" icon={Trash2} onClick={() => clearCache(false)}>
                  {t('options.clearCache')}
                </Button>
                <Button variant="danger-outline" size="md" onClick={() => clearCache(true)}>
                  {t('options.clearAll')}
                </Button>
              </>
            )}
          />
        </OptionSection>

        <p className="pt-2 text-center text-xs text-stone-500">
          {t('common.support', 'Support:')} luca.canepa@gmail.com
        </p>
      </KitModal>

      <SupportFeedbackModal
        open={supportFeedbackOpen}
        onClose={() => setSupportFeedbackOpen(false)}
        currentPage="options"
      />
      <KeybindingsModal open={keybindingsModalOpen} onClose={() => setKeybindingsModalOpen(false)} />
    </div>
  )
}
