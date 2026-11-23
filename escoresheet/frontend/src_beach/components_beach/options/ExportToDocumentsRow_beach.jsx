import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderDown } from 'lucide-react'
import { OptionRow } from './optionRows_beach'
import { Button } from '../../ui/volleyui/Button.jsx'
import { NOTICE } from '../../ui/volleyui/tones.js'
import { cn } from '../../ui/volleyui/cn.js'
import { exportNativeFilesToDocuments } from '../../utils_beach/nativeBackup/index_beach'

/**
 * Android: the match backups and the activity logs stay in the app's own
 * folder (no other app, file manager or USB cable reaches them, audit
 * SEC-22). This copies each match's newest backup and the logs to a new
 * Documents/OpenBeach/export-<time> folder, a copy the user keeps (for a USB
 * cable or another app), only when asked. (OpenVolley HomeOptionsModal
 * ExportToDocuments)
 * @param {{ exportFiles?: () => Promise<{ folder: string, backups: number, logs: number, failed: number }> }} props
 */
export default function ExportToDocumentsRow({ exportFiles = exportNativeFilesToDocuments }) {
  const { t } = useTranslation()
  const [state, setState] = useState(null) // null | 'busy' | { done } | { error }
  const busy = state === 'busy'
  const run = async () => {
    setState('busy')
    try {
      setState({ done: await exportFiles() })
    } catch (e) {
      setState({ error: e?.message || String(e) })
    }
  }
  return (
    <OptionRow
      label={t('options.exportToDocuments', 'Export to Documents')}
      hint={t('options.exportToDocumentsHint', 'Backups and logs stay in the app. This copies them to the Documents folder, for a USB cable or another app.')}
      testId="export-to-documents"
      below={(
        <>
          {state?.done && (
            <div role="status" className={cn(NOTICE.success, 'mt-2')} data-testid="export-to-documents-result">
              {t('options.exportedToDocuments', { folder: state.done.folder, backups: state.done.backups, logs: state.done.logs, defaultValue: 'Copied {{backups}} match backups and {{logs}} log files to {{folder}}. These copies are yours: the app does not delete them.' })}
              {state.done.failed > 0 && ` ${t('options.exportToDocumentsSomeFailed', { count: state.done.failed, defaultValue: '{{count}} files could not be copied.' })}`}
            </div>
          )}
          {state?.error && (
            <div role="alert" className={cn(NOTICE.error, 'mt-2')}>
              {t('options.exportToDocumentsFailed', { error: state.error, defaultValue: 'Nothing could be copied to Documents: {{error}}' })}
            </div>
          )}
        </>
      )}
      control={(
        <Button variant="secondary" size="md" icon={FolderDown} loading={busy} disabled={busy} onClick={run}>
          {busy ? t('options.exportingToDocuments', 'Exporting…') : t('options.export', 'Export')}
        </Button>
      )}
    />
  )
}
