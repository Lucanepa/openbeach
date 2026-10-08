import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FolderOpen } from 'lucide-react'
import { Switch } from '../ui/volleyui/Switch.jsx'
import { Button } from '../ui/volleyui/Button.jsx'
import { OptionRow } from '../components_beach/options/optionRows_beach'
import { db } from '../db_beach/db_beach'
import { diagnosticsState, setDiagnosticsEnabled, exportDiagnostics } from './index_beach'

/**
 * Options > Diagnostics: the switch (this device) and the export (desktop:
 * the log folder with diagnostics-<date>.jsonl; elsewhere a .jsonl download
 * of the stored lines). The rows only: the caller puts them in its section
 * (HomeOptionsModal_beach, ScoreboardOptionsModal_beach).
 */
export default function DiagnosticsSection({ showAlert, testIdPrefix = 'options' }) {
  const { t } = useTranslation()
  const labelId = useId()
  const [state, setState] = useState(diagnosticsState)
  const [busy, setBusy] = useState(false)
  const forced = state.on && (state.source === 'url' || state.source === 'env')
  const fileSink = state.sink === 'file' || (!state.sink && typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__)

  const toggle = async (next) => {
    setBusy(true)
    try {
      setState(await setDiagnosticsEnabled(next, { db }))
    } finally {
      setBusy(false)
    }
  }

  const onExport = async () => {
    try {
      const result = await exportDiagnostics()
      if (result === 'empty') showAlert?.(t('options.diagnosticsEmpty'), 'info')
      else if (!result) showAlert?.(t('options.diagnosticsExportFailed'), 'error')
    } catch (err) {
      console.error('[Options] diagnostics export failed:', err)
      showAlert?.(t('options.diagnosticsExportFailed'), 'error')
    }
  }

  return (
    <div className="ov-kit divide-y divide-stone-100" data-testid={`${testIdPrefix}-diagnostics`}>
      <OptionRow
        label={t('options.diagnosticsMode')}
        labelId={labelId}
        info={t('options.diagnosticsModeInfo')}
        hint={forced ? (
          <span className="font-medium text-amber-700">
            {t(state.source === 'env' ? 'options.diagnosticsOnByEnv' : 'options.diagnosticsOnByLink')}
          </span>
        ) : null}
        control={(
          <Switch
            size="lg"
            checked={state.on}
            disabled={busy || forced}
            onCheckedChange={toggle}
            aria-labelledby={labelId}
            data-testid={`${testIdPrefix}-diagnostics-switch`}
          />
        )}
      />
      <div className="py-3">
        <Button
          variant="secondary"
          size="md"
          block
          icon={fileSink ? FolderOpen : Download}
          onClick={onExport}
          data-testid={`${testIdPrefix}-diagnostics-export`}
        >
          {fileSink ? t('options.openLogFolder') : t('options.exportDiagnostics')}
        </Button>
      </div>
    </div>
  )
}
