import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './lib_beach/supabaseClient_beach'
import { apiFrom } from './lib_beach/apiClient_beach'
import { isBackendAvailable } from './utils_beach/backendConfig_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import DashboardHeader from './components_beach/DashboardHeader_beach'

const ballImage = '/beachball.png'

/**
 * Livescore App for Beach Volleyball
 * - Subscribes to match_live_state table via Supabase Realtime
 * - Shows all live games with scores, TOs, BMP, serving player
 * - Select a game to view fullscreen
 */
export default function LivescoreApp() {
  const { t } = useTranslation()
  const [liveGames, setLiveGames] = useState([])
  const [selectedGame, setSelectedGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 400)
  const [viewportHeight, setViewportHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 700)

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const fetchLiveGames = useCallback(async () => {
    if (!isBackendAvailable()) {
      setError(t('errors.supabaseNotConfigured'))
      setLoading(false)
      return
    }

    try {
      const { data, error: fetchError } = await apiFrom('match_live_state')
        .select('*, matches!match_live_state_match_id_fkey_cascade(set_results, sport_type)')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        console.error('[Livescore] Error fetching games:', fetchError)
        setError(fetchError.message)
      } else {
        const beachGames = (data || []).filter(g => g.matches?.sport_type === 'beach')
        setLiveGames(beachGames)
        setError(null)
      }
    } catch (err) {
      console.error('[Livescore] Exception:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveGames()

    if (!supabase) return

    const channel = supabase
      .channel('livescore-all-games')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_live_state'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            fetchLiveGames()
          } else if (payload.eventType === 'UPDATE') {
            setLiveGames(prev => prev.map(g =>
              g.match_id === payload.new.match_id ? { ...payload.new, matches: g.matches } : g
            ))
          } else if (payload.eventType === 'DELETE') {
            setLiveGames(prev => prev.filter(g => g.match_id !== payload.old.match_id))
            setSelectedGame(prev => prev === payload.old.match_id ? null : prev)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [fetchLiveGames])

  const selectedGameData = selectedGame
    ? liveGames.find(g => g.match_id === selectedGame)
    : null

  // Convert A/B model to left/right based on side_a
  const getLeftRight = (game) => {
    const sideA = game.side_a || 'left'
    const isALeft = sideA === 'left'
    const isMatchEnded = game.match_status === 'ended' || game.match_status === 'final'

    const leftSets = isALeft ? (game.sets_won_a || 0) : (game.sets_won_b || 0)
    const rightSets = isALeft ? (game.sets_won_b || 0) : (game.sets_won_a || 0)
    const leftPoints = isALeft ? (game.points_a || 0) : (game.points_b || 0)
    const rightPoints = isALeft ? (game.points_b || 0) : (game.points_a || 0)

    const rawSetResults = game.matches?.set_results || []
    const setResults = rawSetResults.map(s => ({
      set: s.set,
      left: isALeft ? s.team1 : s.team2,
      right: isALeft ? s.team2 : s.team1
    }))

    return {
      leftName: isALeft ? (game.team_a_name || 'Team A') : (game.team_b_name || 'Team B'),
      rightName: isALeft ? (game.team_b_name || 'Team B') : (game.team_a_name || 'Team A'),
      leftScore: isMatchEnded ? leftSets : leftPoints,
      rightScore: isMatchEnded ? rightSets : rightPoints,
      leftSets,
      rightSets,
      leftPoints,
      rightPoints,
      leftColor: isALeft ? (game.team_a_color || '#ef4444') : (game.team_b_color || '#3b82f6'),
      rightColor: isALeft ? (game.team_b_color || '#3b82f6') : (game.team_a_color || '#ef4444'),
      leftTimeouts: isALeft ? (game.timeouts_a || 0) : (game.timeouts_b || 0),
      rightTimeouts: isALeft ? (game.timeouts_b || 0) : (game.timeouts_a || 0),
      leftChallenges: isALeft ? (game.challenges_used_a || 0) : (game.challenges_used_b || 0),
      rightChallenges: isALeft ? (game.challenges_used_b || 0) : (game.challenges_used_a || 0),
      isMatchEnded,
      servingTeam: game.serving_team,
      serverNumber: game.server_number || null,
      setResults
    }
  }

  // Narrow screen overlay
  const narrowOverlay = (viewportWidth < 357 || viewportHeight < 650) && (
    <div className="livescore-narrow-overlay">
      <div className="livescore-narrow-icon">📱</div>
      <h2 className="livescore-narrow-title">
        {t('common.screenTooSmall', 'Screen too Small')}
      </h2>
      <p className="livescore-narrow-msg">
        {t('common.screenTooSmallMessage', 'This app requires a minimum screen width of 357px. Please use a device with a wider screen or rotate your device to landscape mode.')}
      </p>
      <button
        className="livescore-fullscreen-btn"
        onClick={() => {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {})
          }
        }}
      >
        <span>⛶</span>
        <span>{t('common.tryFullscreen', 'Try Fullscreen')}</span>
      </button>
      <p className="livescore-fullscreen-hint">
        {t('common.fullscreenHint', 'Fullscreen may provide more space by hiding browser UI.')}
      </p>
    </div>
  )

  // Fullscreen view for selected game
  if (selectedGameData) {
    const {
      leftName, rightName, leftScore, rightScore, leftSets, rightSets,
      leftColor, rightColor, leftTimeouts, rightTimeouts,
      leftChallenges, rightChallenges, isMatchEnded, servingTeam, serverNumber, setResults
    } = getLeftRight(selectedGameData)
    const currentSet = selectedGameData.current_set || 1
    const gameN = selectedGameData.game_n || ''
    const league = selectedGameData.league || ''
    const gender = selectedGameData.gender || ''

    return (
      <div className="livescore-fullscreen">
        {narrowOverlay}

        <DashboardHeader
          title={gameN ? `Game ${gameN}` : t('livescore.title', 'Live Score')}
          subtitle={[league, gender].filter(Boolean).join(' \u2022 ') || null}
          onBack={() => setSelectedGame(null)}
          backLabel={t('common.back', 'Back')}
          showOptionsMenu={false}
        />

        {/* Score Display */}
        <div className="livescore-score-area">
          <div className={`livescore-score-main ${isMatchEnded ? 'livescore-score-main-ended' : 'livescore-score-main-live'}`}>
            {/* Left Ball + Server Number */}
            {!isMatchEnded && (
              <div className="livescore-serve-col">
                {servingTeam === 'left' && (
                  <>
                    <img src={ballImage} alt="Serve" className="livescore-serve-img" />
                    {serverNumber && <span className="livescore-serve-number">#{serverNumber}</span>}
                  </>
                )}
              </div>
            )}

            {/* Left Score + Name */}
            <div className="livescore-team-col">
              <div className="livescore-team-color-bar" style={{ backgroundColor: leftColor }} />
              <div className="livescore-point-score">{leftScore}</div>
              <div className="livescore-team-name">{leftName}</div>
            </div>

            {/* Separator */}
            <div className="livescore-separator">:</div>

            {/* Right Score + Name */}
            <div className="livescore-team-col">
              <div className="livescore-team-color-bar" style={{ backgroundColor: rightColor }} />
              <div className="livescore-point-score">{rightScore}</div>
              <div className="livescore-team-name">{rightName}</div>
            </div>

            {/* Right Ball + Server Number */}
            {!isMatchEnded && (
              <div className="livescore-serve-col">
                {servingTeam === 'right' && (
                  <>
                    <img src={ballImage} alt="Serve" className="livescore-serve-img" />
                    {serverNumber && <span className="livescore-serve-number">#{serverNumber}</span>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Set Score or Final */}
          <div className="livescore-set-area">
            {isMatchEnded ? (
              <>
                <div className="livescore-final-badge">
                  {t('livescore.final', 'FINAL')}
                </div>
                {setResults.length > 0 && (
                  <div className="livescore-set-results">
                    {setResults.map((s) => (
                      <div key={s.set} className="livescore-set-result-chip">
                        {s.left}-{s.right}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="livescore-set-scores">
                <div className="livescore-set-score-num">{leftSets}</div>
                <div className="livescore-set-label">
                  <div>{t('livescore.set', 'SET')}</div>
                  <div>{currentSet}</div>
                </div>
                <div className="livescore-set-score-num">{rightSets}</div>
              </div>
            )}
          </div>

          {/* Beach volleyball info bar: TOs + BMPs */}
          {!isMatchEnded && (
            <div className="livescore-info-bar">
              <div className="livescore-info-item">
                <span className="livescore-info-label">{t('livescore.to', 'TO')}</span>
                <span className="livescore-info-value">{leftTimeouts}/1</span>
              </div>
              <div className="livescore-info-item">
                <span className="livescore-info-label">{t('livescore.bmp', 'BMP')}</span>
                <span className="livescore-info-value">{leftChallenges}/2</span>
              </div>
              <span className="livescore-info-label">|</span>
              <div className="livescore-info-item">
                <span className="livescore-info-label">{t('livescore.bmp', 'BMP')}</span>
                <span className="livescore-info-value">{rightChallenges}/2</span>
              </div>
              <div className="livescore-info-item">
                <span className="livescore-info-label">{t('livescore.to', 'TO')}</span>
                <span className="livescore-info-value">{rightTimeouts}/1</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view - show all games
  return (
    <div className="livescore-container">
      {narrowOverlay}

      <UpdateBanner />

      <DashboardHeader
        title={t('livescore.title', 'Live Scores')}
        subtitle={t('livescore.gamesLive', { count: liveGames.length })}
        onLoadGames={fetchLiveGames}
        loadingMatches={loading}
        matchCount={liveGames.length}
        showOptionsMenu={false}
      />

      <div className="livescore-content">
        {loading ? (
          <div className="livescore-loading">
            {t('common.loading', 'Loading...')}
          </div>
        ) : error ? (
          <div className="livescore-error">
            <div className="livescore-error-msg">{error}</div>
            <button className="livescore-retry-btn" onClick={fetchLiveGames}>
              {t('common.retry', 'Retry')}
            </button>
          </div>
        ) : liveGames.length === 0 ? (
          <div className="livescore-empty">
            <img src={ballImage} alt="" className="livescore-empty-img" />
            <div>{t('livescore.noActiveGame', 'No live games')}</div>
          </div>
        ) : (
          <div className="livescore-game-list">
            {liveGames.map((game) => {
              const {
                leftName, rightName, leftScore, rightScore, leftSets, rightSets,
                leftTimeouts, rightTimeouts, leftChallenges, rightChallenges,
                isMatchEnded, servingTeam
              } = getLeftRight(game)
              const gameN = game.game_n || ''
              const league = game.league || ''
              const rawGender = game.gender || ''
              const genderSymbol = rawGender.toLowerCase().startsWith('m') ? '\u2642'
                : rawGender.toLowerCase().startsWith('f') || rawGender.toLowerCase().startsWith('w') ? '\u2640'
                : rawGender

              return (
                <button
                  key={game.match_id}
                  className="livescore-game-card"
                  onClick={() => setSelectedGame(game.match_id)}
                >
                  {(gameN || league || genderSymbol) && (
                    <div className="livescore-game-meta">
                      {gameN && <span className="livescore-game-meta-accent">Game {gameN}</span>}
                      {gameN && (league || genderSymbol) && ' \u2022 '}
                      {[league, genderSymbol].filter(Boolean).join(' \u2022 ')}
                    </div>
                  )}

                  <div className="livescore-game-score-row">
                    <div className="livescore-game-team livescore-game-team-left">
                      {!isMatchEnded && servingTeam === 'left' && (
                        <img src={ballImage} alt="" className="livescore-serve-img-sm" />
                      )}
                      {leftName}
                    </div>
                    <span className="livescore-game-score-num livescore-game-score-left">{leftScore}</span>
                    <span className="livescore-game-score-sep">:</span>
                    <span className="livescore-game-score-num livescore-game-score-right">{rightScore}</span>
                    <div className="livescore-game-team livescore-game-team-right">
                      {rightName}
                      {!isMatchEnded && servingTeam === 'right' && (
                        <img src={ballImage} alt="" className="livescore-serve-img-sm" />
                      )}
                    </div>
                  </div>

                  <div className={`livescore-game-status ${isMatchEnded ? 'livescore-game-status-final' : ''}`}>
                    {isMatchEnded
                      ? t('livescore.final', 'FINAL')
                      : `Set ${game.current_set || 1} \u2022 Sets: ${leftSets} - ${rightSets}`
                    }
                  </div>

                  {!isMatchEnded && (
                    <div className="livescore-game-info-row">
                      <span>TO: {leftTimeouts}-{rightTimeouts}</span>
                      <span>BMP: {leftChallenges}-{rightChallenges}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
