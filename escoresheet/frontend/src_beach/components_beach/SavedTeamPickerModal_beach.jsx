import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Modal as KitModal } from '../ui/volleyui/Modal.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import { Select } from '../ui/volleyui/Select.jsx'
import { NOTICE } from '../ui/volleyui/tones.js'
import { FOCUS_RING_INSET } from '../ui/volleyui/Button.jsx'
import { cn } from '../ui/volleyui/cn.js'
import { useSavedTeams } from '../hooks_beach/useSavedTeams_beach'
import { normalizeName } from '../utils_beach/savedTeams_beach'

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** 'DD.MM.YYYY HH:mm' in local time, or '' for a bad date. */
export function formatFetchedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * "Load saved team": pick a saved beach team from the offline cache. The
 * cache is refreshed when the picker opens (online); offline it shows the
 * cached teams with their date. The caller asks before replacing players.
 */
export default function SavedTeamPickerModal({ open, onClose, onPick, userId, access, defaultCompetitionId = '', side }) {
  if (!open) return null
  return <PickerBody {...{ onClose, onPick, userId, access, defaultCompetitionId, side }} />
}

function PickerBody({ onClose, onPick, userId, access, defaultCompetitionId, side }) {
  const { t } = useTranslation()
  const { teams, competitions, meta, loading } = useSavedTeams({ userId, access, refreshOnMount: true })
  const [competitionId, setCompetitionId] = useState(defaultCompetitionId || '')
  const [q, setQ] = useState('')

  const visibleCompetitions = useMemo(
    () => competitions
      .filter(c => !c.archived)
      .sort((a, b) => (b.season || '').localeCompare(a.season || '') || (a.name || '').localeCompare(b.name || '')),
    [competitions]
  )
  const list = useMemo(() => {
    const needle = normalizeName(q)
    return teams
      .filter(team => !team.competition?.archived)
      .filter(team => !competitionId || team.competitionId === competitionId)
      .filter(team => {
        if (!needle) return true
        const lastNames = (team.players || []).map(p => p.last_name || '').join(' ')
        return normalizeName(`${team.name} ${team.club} ${lastNames}`).includes(needle)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [teams, competitionId, q])

  // volleyui: a bottom sheet on a phone, a centred dialog from sm (above the
  // legacy header, like the legacy modal it replaces); the competition
  // filter and the search as kit fields, the teams as flat rows on hairlines
  // with the player count as a state pill. Same filters, same pick.
  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1000 }}>
      <KitModal
        open
        sheet
        size="lg"
        dismissible={false}
        title={t('savedTeams.pickerTitle')}
        onClose={onClose}
        closeLabel={t('common.close')}
      >
        <div data-side={side || undefined} className="flex flex-col gap-3">
          {isOffline() && meta?.fetchedAt && (
            <div data-testid="saved-teams-offline" role="status" className={NOTICE.info}>
              {t('savedTeams.pickerOffline', { date: formatFetchedAt(meta.fetchedAt) })}
            </div>
          )}
          <Select
            size="lg"
            block
            aria-label={t('savedTeams.pickerCompetition')}
            value={competitionId}
            onChange={e => setCompetitionId(e.target.value)}
          >
            <option value="">{t('savedTeams.pickerAll')}</option>
            {visibleCompetitions.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.season ? ` · ${c.season}` : ''}</option>
            ))}
          </Select>
          <Input
            size="lg"
            type="search"
            icon={Search}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('savedTeams.pickerSearch')}
            aria-label={t('savedTeams.pickerSearch')}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {loading && !teams.length ? (
            <div aria-busy="true" aria-label={t('common.loading')} className="divide-y divide-stone-100 rounded-xl border border-stone-200/70 bg-white">
              {[0, 1, 2].map(i => (
                <div key={i} data-testid="saved-team-skeleton" className="flex min-h-14 flex-col justify-center gap-2 px-3 py-2.5">
                  <div className="h-3.5 w-2/5 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-stone-200" />
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">{t('savedTeams.pickerEmpty')}</p>
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200/70 bg-white">
              {list.map(team => {
                const players = team.players || []
                const coach = (team.staff || []).find(s => s.role === 'Coach')
                const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ') : ''
                const metaLine = [
                  players.map(p => p.last_name).filter(Boolean).join(' / '),
                  team.club,
                  team.competition?.name
                ].filter(Boolean).join(' · ')
                const complete = players.length >= 2
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      data-testid="saved-team-row"
                      onClick={() => onPick(team)}
                      className={cn('flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-stone-50', FOCUS_RING_INSET)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-stone-900 [overflow-wrap:anywhere]">{team.name}</span>
                        {metaLine && <span className="text-xs text-stone-500 [overflow-wrap:anywhere]">{metaLine}</span>}
                        {coachName && <span className="text-xs text-stone-500">{t('savedTeams.coach', { name: coachName })}</span>}
                      </span>
                      <span className={cn(
                        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                        complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      )}>
                        {t('savedTeams.pickerPlayers', { count: players.length })}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </KitModal>
    </div>
  )
}
