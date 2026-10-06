import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal_beach'
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

const controlStyle = { width: '100%', minHeight: 40, boxSizing: 'border-box' }

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

  return (
    <Modal open title={t('savedTeams.pickerTitle')} onClose={onClose} width={560}>
      <div data-side={side || undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isOffline() && meta?.fetchedAt && (
          <div
            data-testid="saved-teams-offline"
            role="status"
            style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.4)', fontSize: 14 }}
          >
            {t('savedTeams.pickerOffline', { date: formatFetchedAt(meta.fetchedAt) })}
          </div>
        )}
        <select
          aria-label={t('savedTeams.pickerCompetition')}
          value={competitionId}
          onChange={e => setCompetitionId(e.target.value)}
          style={controlStyle}
        >
          <option value="">{t('savedTeams.pickerAll')}</option>
          {visibleCompetitions.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.season ? ` · ${c.season}` : ''}</option>
          ))}
        </select>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('savedTeams.pickerSearch')}
          aria-label={t('savedTeams.pickerSearch')}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={controlStyle}
        />
        {loading && !teams.length ? (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>…</div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <p style={{ margin: 0, padding: '16px 4px', color: 'var(--muted)', fontSize: 14 }}>{t('savedTeams.pickerEmpty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(team => {
              const players = team.players || []
              const coach = (team.staff || []).find(s => s.role === 'Coach')
              const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ') : ''
              const metaLine = [
                players.map(p => p.last_name).filter(Boolean).join(' / '),
                team.club,
                team.competition?.name
              ].filter(Boolean).join(' · ')
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    data-testid="saved-team-row"
                    onClick={() => onPick(team)}
                    style={{
                      width: '100%', minHeight: 44, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{team.name}</span>
                      {metaLine && <span style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{metaLine}</span>}
                      {coachName && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('savedTeams.coach', { name: coachName })}</span>}
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: players.length >= 2 ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)',
                      color: players.length >= 2 ? '#86efac' : '#fdba74'
                    }}>
                      {t('savedTeams.pickerPlayers', { count: players.length })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
