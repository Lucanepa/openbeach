import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, ScrollText, FileDown } from 'lucide-react'
import { db } from '../../db_beach/db_beach'
import { Button } from '../../ui/volleyui/Button.jsx'
import { toast } from '../../ui/volleyui/uiStore.js'
import { OptionRow, OptionSection } from './optionRows_beach'
import ActivityLogModal from '../ActivityLogModal_beach'
import { canOpenLogFolder, openLogFolder } from '../../utils_beach/activity/index_beach'
import { gameNumberOf } from '../../utils_beach/activity/activeMatch_beach'

/**
 * The "Logs" section of the options: the activity log (this match in the
 * scoreboard's options, every match in the home options), the diagnostic
 * log of this match (the local click and key log, .ndjson) and, in the
 * desktop app, the log folder. One element in each options modal.
 *
 * Ported from OpenVolley 8aa0fef7 (the Logs sections of
 * ScoreboardOptionsModal.jsx and HomeOptionsModal.jsx).
 *
 * @param {{ matchId?: number|null, scope?: 'match'|'all' }} props
 */
export default function ActivityLogSection({ matchId = null, scope = 'match' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [logFolder, setLogFolder] = useState(false)
  const forMatch = scope === 'match'

  useEffect(() => {
    let alive = true
    canOpenLogFolder().then((ok) => { if (alive) setLogFolder(!!ok) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const exportDiagnosticLog = async () => {
    try {
      const match = matchId != null ? await db.matches.get(matchId) : null
      const { downloadLogs } = await import('../../utils_beach/comprehensiveLogger_beach')
      await downloadLogs(gameNumberOf(match), 'ndjson')
    } catch (err) {
      console.error('[Options] diagnostic log export failed:', err)
      toast.error(t('options.diagnosticLogFailed'))
    }
  }

  const openLogs = async () => {
    if (!(await openLogFolder().catch(() => false))) toast.error(t('options.logFolderOpenFailed'))
  }

  return (
    <>
      <OptionSection title={t('options.logs')} testId="options-logs">
        <OptionRow
          stacked
          label={t('options.activityLog')}
          info={forMatch ? t('options.activityLogInfo') : t('options.activityLogAllInfo')}
          control={(
            <Button variant="secondary" size="lg" block icon={ScrollText} onClick={() => setOpen(true)} data-testid="options-activity-log">
              {t('options.openActivityLog')}
            </Button>
          )}
        />
        {forMatch && (
          <OptionRow
            stacked
            label={t('options.diagnosticLog')}
            info={t('options.diagnosticLogInfo')}
            control={(
              <>
                <Button variant="secondary" size="lg" block icon={FileDown} onClick={exportDiagnosticLog} data-testid="options-diagnostic-log">
                  {t('options.exportDiagnosticLog')}
                </Button>
                {logFolder && (
                  <Button variant="secondary" size="lg" block icon={FolderOpen} onClick={openLogs} data-testid="options-log-folder">
                    {t('options.openLogFolder')}
                  </Button>
                )}
              </>
            )}
          />
        )}
        {!forMatch && logFolder && (
          <OptionRow
            stacked
            label={t('options.logFolder')}
            control={(
              <Button variant="secondary" size="lg" block icon={FolderOpen} onClick={openLogs} data-testid="options-log-folder">
                {t('options.openLogFolder')}
              </Button>
            )}
          />
        )}
      </OptionSection>
      <ActivityLogModal open={open} onClose={() => setOpen(false)} matchId={forMatch ? matchId ?? null : null} />
    </>
  )
}
