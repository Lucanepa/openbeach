import { useTranslation } from 'react-i18next'
import { Modal as KitModal } from '../ui/volleyui/Modal.jsx'
import { Button } from '../ui/volleyui/Button.jsx'
import { Block } from '../ui/volleyui/Card.jsx'
import { NOTICE } from '../ui/volleyui/tones.js'
import { cn } from '../ui/volleyui/cn.js'

const points = (v) => (typeof v === 'number' ? v : Number(v) || 0)

/**
 * What a restore would bring back, from a backup in any of its shapes (the
 * database bundle with liveState, or a local / cloud JSON backup).
 * @param {object} d  restorePreviewData.data
 */
export function restorePreviewSummary(d = {}) {
  const isDbFormat = !!(d.match?.team1_data || d.match?.team1_team || d.liveState)
  const team1Name = isDbFormat
    ? (d.match?.team1_data?.name || d.match?.team1_team?.name || d.match?.team1Name || null)
    : (d.team1?.name || d.match?.team1Name || null)
  const team2Name = isDbFormat
    ? (d.match?.team2_data?.name || d.match?.team2_team?.name || d.match?.team2Name || null)
    : (d.team2?.name || d.match?.team2Name || null)

  const events = Array.isArray(d.events) ? d.events : []
  const sets = [...(Array.isArray(d.sets) ? d.sets : [])].sort((a, b) => (a.index || 0) - (b.index || 0))
  const latestSet = sets[sets.length - 1]
  const currentSetIndex = latestSet?.index || d.liveState?.current_set || 1

  const lineupEvents = events.filter(e => e.type === 'lineup')
  const lineupOf = (team, live) =>
    lineupEvents.find(e => e.payload?.team === team)?.payload?.lineup || (isDbFormat ? live : null) || null

  const timeoutEvents = events.filter(e => e.type === 'timeout' && e.setIndex === currentSetIndex)
  const lastPoint = events.filter(e => e.type === 'point').sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]

  return {
    team1Name,
    team2Name,
    currentSetIndex,
    team1Points: points(latestSet?.team1Points ?? latestSet?.team1_points ?? d.liveState?.points_a),
    team2Points: points(latestSet?.team2Points ?? latestSet?.team2_points ?? d.liveState?.points_b),
    team1Lineup: lineupOf('team1', d.liveState?.lineup_a),
    team2Lineup: lineupOf('team2', d.liveState?.lineup_b),
    team1Timeouts: timeoutEvents.filter(e => e.payload?.team === 'team1').length,
    team2Timeouts: timeoutEvents.filter(e => e.payload?.team === 'team2').length,
    sanctions: events.filter(e => e.type === 'sanction'),
    sets: sets.map(s => ({
      index: s.index,
      finished: !!s.finished,
      team1: points(s.team1Points ?? s.team1_points),
      team2: points(s.team2Points ?? s.team2_points)
    })),
    servingTeam: lastPoint?.payload?.scoringTeam || d.liveState?.serving_team || 'team1'
  }
}

// Official card colours (volleyui §7: sanction marks keep their meaning).
const SANCTION_TONE = {
  yellow: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  red: 'border-red-300 bg-red-50 text-red-800'
}

function Lineup({ lineup, t }) {
  if (!lineup) return <p className="text-xs text-stone-500">{t('restorePreview.noLineup', 'No lineup')}</p>
  return (
    <div className="grid grid-cols-2 gap-2">
      {['I', 'II'].map(pos => {
        const posData = lineup[pos]
        const num = typeof posData === 'object' ? posData?.number : posData
        const isServing = typeof posData === 'object' && posData?.isServing
        return (
          <div key={pos} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{pos}</div>
            <div className="text-sm font-semibold tabular-nums text-stone-900">
              {num || '–'}
              {isServing && <span className="ml-1 text-xs font-medium text-emerald-700">· {t('restorePreview.serves', 'serves')}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * "Restore this match?": what the backup holds, then Restore / Choose another
 * / Cancel. Light volleyui dialog; the restore itself stays in App_beach.
 */
export default function RestorePreviewModal({ preview, loading = false, error = '', onConfirm, onSelectAnother, onCancel }) {
  const { t } = useTranslation()
  if (!preview) return null
  const s = restorePreviewSummary(preview.data)
  const team1 = s.team1Name || t('common.team1', 'Team 1')
  const team2 = s.team2Name || t('common.team2', 'Team 2')
  const source = preview.source === 'database'
    ? t('restorePreview.fromDatabase', 'From the database')
    : preview.source === 'cloud'
      ? t('restorePreview.fromCloud', 'From a cloud backup')
      : t('restorePreview.fromFile', 'From a local file')

  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
      <KitModal
        open
        decision
        dismissible={false}
        size="lg"
        layout="sections"
        onClose={onCancel}
        closeLabel={t('common.close')}
        title={t('restorePreview.title', 'Restore this match?')}
        description={preview.backupName ? `${source} · ${preview.backupName.replace('.json', '')}` : source}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={onCancel} disabled={loading}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="secondary" size="lg" onClick={onSelectAnother} disabled={loading}>
              {t('restorePreview.selectAnother', 'Choose another')}
            </Button>
            <Button variant="positive" size="lg" onClick={onConfirm} loading={loading} data-testid="restore-preview-confirm">
              {t('restorePreview.confirm', 'Restore match')}
            </Button>
          </>
        )}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/70 bg-stone-50/60 p-4">
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-base font-semibold text-stone-900">{team1}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{t('common.team1', 'Team 1')}</div>
          </div>
          <div className="shrink-0 text-center">
            <div className="text-2xl font-bold tabular-nums text-stone-900">{s.team1Points}:{s.team2Points}</div>
            <div className="text-xs tabular-nums text-stone-500">{t('restorePreview.set', { n: s.currentSetIndex, defaultValue: 'Set {{n}}' })}</div>
          </div>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-base font-semibold text-stone-900">{team2}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{t('common.team2', 'Team 2')}</div>
          </div>
        </div>

        <p className="text-sm text-stone-600">
          {t('restorePreview.serving', 'Serving')}: <strong className="font-semibold text-stone-900">{s.servingTeam === 'team2' ? team2 : team1}</strong>
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Block title={team1} aside={<span className="text-xs tabular-nums text-stone-500">{t('restorePreview.timeouts', { count: s.team1Timeouts, defaultValue: 'Timeouts {{count}}/1' })}</span>}>
            <Lineup lineup={s.team1Lineup} t={t} />
          </Block>
          <Block title={team2} aside={<span className="text-xs tabular-nums text-stone-500">{t('restorePreview.timeouts', { count: s.team2Timeouts, defaultValue: 'Timeouts {{count}}/1' })}</span>}>
            <Lineup lineup={s.team2Lineup} t={t} />
          </Block>
        </div>

        {s.sets.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-800">{t('restorePreview.sets', 'Sets')}</h4>
            <div className="flex flex-wrap gap-2">
              {s.sets.map(set => (
                <div key={set.index} className={cn('rounded-lg border px-3 py-1.5 text-center', set.finished ? 'border-stone-200 bg-white' : 'border-sky-200 bg-sky-50')}>
                  <div className="text-[11px] text-stone-500">{t('restorePreview.set', { n: set.index, defaultValue: 'Set {{n}}' })}</div>
                  <div className="text-sm font-semibold tabular-nums text-stone-900">{set.team1}:{set.team2}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {s.sanctions.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-800">
              {t('restorePreview.sanctions', 'Sanctions')} <span className="tabular-nums text-stone-500">{s.sanctions.length}</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {s.sanctions.map((ev, i) => (
                <span key={i} className={cn('rounded border px-2 py-0.5 text-xs', SANCTION_TONE[ev.payload?.type] || 'border-stone-200 bg-white text-stone-700')}>
                  {ev.payload?.team === 'team2' ? team2 : team1}{ev.payload?.playerNumber ? ` #${ev.payload.playerNumber}` : ''} · {ev.payload?.type || t('restorePreview.sanction', 'sanction')}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <div role="alert" className={NOTICE.error}>{error}</div>}
      </KitModal>
    </div>
  )
}
