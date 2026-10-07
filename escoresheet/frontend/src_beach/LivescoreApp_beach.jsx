import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './lib_beach/supabaseClient_beach'
import { apiFrom } from './lib_beach/apiClient_beach'
import { isBackendAvailable, getApiUrl } from './utils_beach/backendConfig_beach'
import { createRelayLivescoreFeed, fetchRelayLivescoreList, relayLivescoreNow, relayLivescoreWsUrl } from './utils_beach/relayLivescore_beach'
import UpdateBanner from './components_beach/UpdateBanner_beach'
import DashboardHeader from './components_beach/DashboardHeader_beach'
import { Radio, RefreshCw } from 'lucide-react'
import { Button } from './ui/volleyui/Button.jsx'
import { Card } from './ui/volleyui/Card.jsx'
import { FormError } from './ui/volleyui/Field.jsx'
import { EmptyState } from './ui/volleyui/EmptyState.jsx'
import { Row, RowList, DateRail } from './ui/volleyui/Row.jsx'
import { Chip } from './ui/volleyui/Chip.jsx'
import { StatusPill } from './ui/volleyui/StatusPill.jsx'
import { SkeletonRows } from './ui/volleyui/Skeleton.jsx'
import { NarrowScreenOverlay } from './components_beach/dashboards/EntryKit_beach.jsx'

const ballImage = '/beachball.png'

/**
 * Livescore App for Beach Volleyball
 * - Subscribes to match_live_state (cloud), or on a venue relay (desktop app,
 *   venue server, no internet) to the relay's public match summaries
 *   (utils_beach/relayLivescore_beach: no PIN, never more than the summary)
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
  // The venue relay feed (relay mode)
  const relayFeedRef = useRef(null)
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
    if (relayFeedRef.current) {
      await relayFeedRef.current.refresh()
      return
    }
    if (!isBackendAvailable()) {
      setError(t('errors.supabaseNotConfigured'))
      setLoading(false)
      return
    }

    try {
      // Beach rows only (the live-state table is shared with indoor). The
      // backend knows the embed with (set_results) only as one shape.
      const { data, error: fetchError } = await apiFrom('match_live_state')
        .select('*, matches!match_live_state_match_id_fkey_cascade(set_results)')
        .eq('sport_type', 'beach')
        .order('updated_at', { ascending: false })

      if (fetchError) {
        console.error('[Livescore] Error fetching games:', fetchError)
        setError(fetchError.message)
      } else {
        const beachGames = (data || []).filter(g => g.sport_type === 'beach')
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
    if (relayLivescoreNow()) {
      // The relay's list (every 10 s) and one socket for every match's
      // summary. Rehearsal (test) matches are not shown to spectators.
      let loaded = false
      const feed = createRelayLivescoreFeed({
        listMatches: () => fetchRelayLivescoreList(getApiUrl('/api/match/list?finished=1')),
        getWsUrl: () => relayLivescoreWsUrl(),
        onChange: (rows) => setLiveGames(rows.filter(r => !r.test)),
        onList: ({ ok, error: listError }) => {
          if (ok) {
            loaded = true
            setError(null)
          } else if (!loaded) {
            setError(listError || t('livescore.relayUnavailable', 'The venue server does not answer'))
          }
          setLoading(false)
        }
      })
      relayFeedRef.current = feed
      feed.start()
      return () => {
        feed.stop()
        if (relayFeedRef.current === feed) relayFeedRef.current = null
      }
    }

    fetchLiveGames()

    if (!supabase) return undefined
    const channel = supabase
      .channel('livescore-all-games')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_live_state',
          // Beach games only: indoor matches share the table
          filter: 'sport_type=eq.beach'
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
  const narrowOverlay = (viewportWidth < 357 || viewportHeight < 650) && <NarrowScreenOverlay t={t} />

  // A team colour on the light page: a hairline keeps white visible
  const colorBar = (color) => (
    <div
      aria-hidden="true"
      className="mx-auto mb-3 h-1.5 w-3/5 rounded-full"
      style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.12)' }}
    />
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

    const serveCol = (side) => (
      <div className="flex w-12 flex-col items-center justify-center gap-1 sm:w-16">
        {servingTeam === side && (
          <>
            <img src={ballImage} alt={t('livescore.servingTeam', 'Serving team')} className="h-10 w-10 sm:h-12 sm:w-12" />
            {serverNumber && <span className="text-base font-bold tabular-nums text-emerald-700">#{serverNumber}</span>}
          </>
        )}
      </div>
    )
    const teamCol = (color, score, name) => (
      <div className="min-w-0 text-center">
        {colorBar(color)}
        <div className="font-bold leading-none tabular-nums text-stone-900" style={{ fontSize: 'clamp(60px, 18vw, 150px)' }}>{score}</div>
        <div className="mt-2 break-words font-medium text-stone-600" style={{ fontSize: 'clamp(14px, 3vw, 24px)' }}>{name}</div>
      </div>
    )
    const setBox = (n) => (
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-2 font-bold leading-tight tabular-nums text-stone-900 shadow-card" style={{ fontSize: 'clamp(32px, 10vw, 80px)' }}>
        {n}
      </div>
    )
    const info = (label, value) => (
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-stone-500">{label}</span>
        <span className="font-bold tabular-nums text-stone-900">{value}</span>
      </div>
    )

    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-stone-50 to-stone-100 text-stone-800">
        {narrowOverlay}

        <DashboardHeader
          title={gameN ? t('livescore.game', { number: gameN }) : t('livescore.title', 'Live score')}
          subtitle={[league, gender].filter(Boolean).join(' · ') || null}
          onBack={() => setSelectedGame(null)}
          backLabel={t('common.back', 'Back')}
          showOptionsMenu={false}
        />

        {/* Score Display */}
        <div className="ov-kit flex flex-1 flex-col items-center justify-center p-5">
          <div
            className="grid w-full max-w-[800px] items-center gap-2.5"
            style={{ gridTemplateColumns: isMatchEnded ? 'minmax(0, 1fr) auto minmax(0, 1fr)' : 'auto minmax(0, 1fr) auto minmax(0, 1fr) auto' }}
          >
            {!isMatchEnded && serveCol('left')}
            {teamCol(leftColor, leftScore, leftName)}
            <div aria-hidden="true" className="leading-none text-stone-300" style={{ fontSize: 'clamp(40px, 12vw, 100px)' }}>:</div>
            {teamCol(rightColor, rightScore, rightName)}
            {!isMatchEnded && serveCol('right')}
          </div>

          {/* Set Score or Final */}
          <div className="mt-10 flex flex-col items-center gap-3">
            {isMatchEnded ? (
              <>
                <div className="font-bold text-emerald-700" style={{ fontSize: 'clamp(24px, 6vw, 48px)' }}>
                  {t('livescore.final', 'Final')}
                </div>
                {setResults.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {setResults.map((s) => (
                      <div key={s.set} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-lg font-semibold tabular-nums text-stone-700">
                        {s.left}–{s.right}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-5">
                {setBox(leftSets)}
                <div className="text-center font-bold leading-tight text-stone-900" style={{ fontSize: 'clamp(24px, 6vw, 48px)' }}>
                  <div>{t('livescore.set', 'Set')}</div>
                  <div className="tabular-nums">{currentSet}</div>
                </div>
                {setBox(rightSets)}
              </div>
            )}
          </div>

          {/* Beach volleyball info bar: TOs + BMPs */}
          {!isMatchEnded && (
            <div className="mt-8 flex items-center gap-4 rounded-xl border border-stone-200/70 bg-white px-5 py-2.5 text-lg shadow-card sm:gap-6 sm:text-xl">
              {info(t('livescore.to', 'TO'), `${leftTimeouts}/1`)}
              {info(t('livescore.bmp', 'BMP'), `${leftChallenges}/2`)}
              <span aria-hidden="true" className="h-6 w-px bg-stone-200" />
              {info(t('livescore.bmp', 'BMP'), `${rightChallenges}/2`)}
              {info(t('livescore.to', 'TO'), `${rightTimeouts}/1`)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view - show all games
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 text-stone-800">
      {narrowOverlay}

      <UpdateBanner />

      <DashboardHeader
        title={t('livescore.title', 'Live scores')}
        subtitle={t('livescore.gamesLive', { count: liveGames.length })}
        onLoadGames={fetchLiveGames}
        loadingMatches={loading}
        matchCount={liveGames.length}
        showOptionsMenu={false}
      />

      <div className="ov-kit px-4 py-6">
        {loading ? (
          <Card pad="list" className="mx-auto max-w-3xl">
            <span className="sr-only">{t('common.loading', 'Loading...')}</span>
            <SkeletonRows rows={3} />
          </Card>
        ) : error ? (
          <Card className="mx-auto max-w-md text-center">
            <FormError size="md">{error}</FormError>
            <Button variant="secondary" size="xl" icon={RefreshCw} className="mt-4" onClick={fetchLiveGames}>
              {t('common.retry', 'Retry')}
            </Button>
          </Card>
        ) : liveGames.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <EmptyState icon={Radio}>{t('livescore.noActiveGame', 'No live games')}</EmptyState>
          </Card>
        ) : (
          <Card pad="list" className="mx-auto max-w-3xl">
            <RowList soft>
              {liveGames.map((game) => {
                const {
                  leftName, rightName, leftScore, rightScore, leftSets, rightSets,
                  leftColor, rightColor, leftTimeouts, rightTimeouts, leftChallenges, rightChallenges,
                  isMatchEnded, servingTeam, setResults
                } = getLeftRight(game)
                const gameN = game.game_n || ''
                const league = game.league || ''
                const rawGender = game.gender || ''
                const genderSymbol = rawGender.toLowerCase().startsWith('m') ? '\u2642'
                  : rawGender.toLowerCase().startsWith('f') || rawGender.toLowerCase().startsWith('w') ? '\u2640'
                  : rawGender
                const tone = isMatchEnded ? 'emerald' : 'red'
                const currentSet = game.current_set || 1
                const serveBall = (
                  <img src={ballImage} alt={t('livescore.servingTeam', 'Serving team')} className="inline-block h-5 w-5 shrink-0" />
                )
                const swatch = (color) => (
                  <span aria-hidden="true" className="inline-block h-3 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.15)' }} />
                )

                return (
                  <Row
                    key={game.match_id}
                    tone={tone}
                    onOpen={() => setSelectedGame(game.match_id)}
                    label={[
                      `${leftName} ${leftScore} – ${rightScore} ${rightName}`,
                      isMatchEnded ? t('livescore.final', 'Final') : `${t('livescore.set', 'Set')} ${currentSet}`,
                      gameN ? t('livescore.game', { number: gameN }) : '',
                    ].filter(Boolean).join(', ')}
                    className="min-h-11"
                    leading={
                      <DateRail
                        tone={tone}
                        weekday={gameN ? t('livescore.gameShort', 'Game') : undefined}
                        date={gameN || '–'}
                        time={genderSymbol || undefined}
                        league={league || undefined}
                      />
                    }
                    title={
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-snug break-words text-stone-900 sm:text-[15px]">
                          {swatch(leftColor)}
                          <span className="min-w-0">{leftName}</span>
                          {!isMatchEnded && servingTeam === 'left' && serveBall}
                        </p>
                        <span className="text-right text-[28px] font-bold leading-tight tabular-nums text-stone-900 sm:text-3xl">{leftScore}</span>
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-snug break-words text-stone-900 sm:text-[15px]">
                          {swatch(rightColor)}
                          <span className="min-w-0">{rightName}</span>
                          {!isMatchEnded && servingTeam === 'right' && serveBall}
                        </p>
                        <span className="text-right text-[28px] font-bold leading-tight tabular-nums text-stone-900 sm:text-3xl">{rightScore}</span>
                      </div>
                    }
                    meta={!isMatchEnded
                      ? <span className="tabular-nums">{t('livescore.setsWon', { left: leftSets, right: rightSets })} · {t('livescore.to', 'TO')} {leftTimeouts}–{rightTimeouts} · {t('livescore.bmp', 'BMP')} {leftChallenges}–{rightChallenges}</span>
                      : undefined}
                    chips={isMatchEnded && setResults.length > 0
                      ? setResults.map((r) => <Chip key={r.set}><span className="tabular-nums">{r.left}–{r.right}</span></Chip>)
                      : undefined}
                    status={isMatchEnded
                      ? <StatusPill tone="done">{t('livescore.final', 'Final')}</StatusPill>
                      : <StatusPill tone="brand"><span className="tabular-nums">{`${t('livescore.set', 'Set')} ${currentSet}`}</span></StatusPill>}
                  />
                )
              })}
            </RowList>
          </Card>
        )}
      </div>
    </div>
  )
}
