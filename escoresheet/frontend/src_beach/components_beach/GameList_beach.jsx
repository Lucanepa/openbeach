import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimeLocal } from '../utils_beach/timeUtils_beach'

function formatDateTime(iso, fallback) {
  if (!iso) return fallback
  try {
    const date = new Date(iso)
    // Format date in local timezone
    const datePart = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
    // Format time using utility for consistency
    const timePart = formatTimeLocal(iso)
    return `${datePart}, ${timePart}`
  } catch (error) {
    return iso
  }
}

export default function GameList({ matches, loading, onSelectMatch, onDeleteMatchData, onLoadTestData }) {
  const { t } = useTranslation()

  const grouped = useMemo(() => {
    if (!matches || !matches.length) return []
    return matches.reduce((acc, match) => {
      const key = match.league || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(match)
      return acc
    }, {})
  }, [matches])

  if (loading) {
    return (
      <div className="game-list">
        <p>{t('gameList.loadingGames')}</p>
      </div>
    )
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="game-list">
        <p>{t('gameList.noGamesAvailable')}</p>
      </div>
    )
  }

  return (
    <div className="game-list">
      <div className="game-list-header">
        <div>
          <h2>{t('gameList.upcomingMatches')}</h2>
          <p className="text-sm">{t('gameList.selectGameToStart')}</p>
        </div>
      </div>

      {Object.entries(grouped).map(([league, leagueMatches]) => (
        <section key={league} className="game-league">
          <header className="game-league-header">
            <h3>{league}</h3>
            <span>{leagueMatches.length} match{leagueMatches.length !== 1 ? 'es' : ''}</span>
          </header>
          <div className="game-grid">
            {leagueMatches.map(match => {
              const dateTime = formatDateTime(match.scheduledAt, t('gameList.dateTbc'))
              const [datePart, timePart] = dateTime.split(',')
              return (
                <div key={match.id} className="game-card">
                  <div className="game-card-content">
                    <div className="game-card-date">
                      <span className="game-card-day">{datePart?.trim()}</span>
                      <span className="game-card-time">{timePart?.trim()}</span>
                    </div>
                    <div className="game-card-teams">
                      <div className="game-card-team">{match.team1Name}</div>
                      <div className="game-card-vs">{t('common.vs')}</div>
                      <div className="game-card-team">{match.team2Name}</div>
                    </div>
                    {match.hall && (
                      <div className="game-card-location">
                        {match.hall} — {match.city || t('common.tbc')}
                      </div>
                    )}
                    <div className="game-card-status">
                      <span className="game-card-status-label">{t('gameList.status')}</span>
                      <span className="game-card-status-value">{match.status || t('common.noData')}</span>
                    </div>
                  </div>
                  <div className="game-card-actions">
                    <button onClick={() => onSelectMatch(match.id)}>
                      {t('gameList.openMatch')}
                    </button>
                    {onDeleteMatchData && (
                      <button className="secondary" onClick={() => onDeleteMatchData(match.id)}>
                        {t('gameList.deleteMatchData')}
                      </button>
                    )}
                    {onLoadTestData && (
                      <button className="secondary" onClick={() => onLoadTestData(match.id)}>
                        {t('gameList.loadTestData')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
