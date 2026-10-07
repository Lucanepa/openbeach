import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './lib_beach/supabaseClient_beach'
import { apiFrom } from './lib_beach/apiClient_beach'
import { isBackendAvailable } from './utils_beach/backendConfig_beach'
import { ArrowLeft, ChevronRight, Globe, Monitor, Radio } from 'lucide-react'
import { cn } from './ui/volleyui/cn.js'
import { FOCUS_RING, Button } from './ui/volleyui/Button.jsx'
import { EmptyState } from './ui/volleyui/EmptyState.jsx'
import { Row, RowList, DateRail } from './ui/volleyui/Row.jsx'
import { SkeletonRows } from './ui/volleyui/Skeleton.jsx'
import { AppSpinner } from './ui/volleyui/AppSpinner.jsx'
import { EntryPage, EntryCard } from './components_beach/dashboards/EntryKit_beach.jsx'


/**
 * Normalize match_live_state data from A/B model to left/right based on side_a.
 * Works with both BroadcastChannel (local) and Supabase (remote) data.
 */
function normalizeState(raw) {
  if (!raw) return null
  const sideA = raw.side_a || 'left'
  const isALeft = sideA === 'left'
  const isMatchEnded = raw.match_status === 'ended' || raw.match_status === 'final'

  return {
    leftName: isALeft ? (raw.team_a_name || 'Team A') : (raw.team_b_name || 'Team B'),
    rightName: isALeft ? (raw.team_b_name || 'Team B') : (raw.team_a_name || 'Team A'),
    leftShort: isALeft ? (raw.team_a_short || '') : (raw.team_b_short || ''),
    rightShort: isALeft ? (raw.team_b_short || '') : (raw.team_a_short || ''),
    leftColor: isALeft ? (raw.team_a_color || '#ef4444') : (raw.team_b_color || '#3b82f6'),
    rightColor: isALeft ? (raw.team_b_color || '#3b82f6') : (raw.team_a_color || '#ef4444'),
    leftPoints: isALeft ? (raw.points_a || 0) : (raw.points_b || 0),
    rightPoints: isALeft ? (raw.points_b || 0) : (raw.points_a || 0),
    leftSets: isALeft ? (raw.sets_won_a || 0) : (raw.sets_won_b || 0),
    rightSets: isALeft ? (raw.sets_won_b || 0) : (raw.sets_won_a || 0),
    leftTimeouts: isALeft ? (raw.timeouts_a || 0) : (raw.timeouts_b || 0),
    rightTimeouts: isALeft ? (raw.timeouts_b || 0) : (raw.timeouts_a || 0),
    leftChallenges: isALeft ? (raw.challenges_used_a || 0) : (raw.challenges_used_b || 0),
    rightChallenges: isALeft ? (raw.challenges_used_b || 0) : (raw.challenges_used_a || 0),
    servingTeam: raw.serving_team, // already 'left' or 'right'
    serverNumber: raw.server_number || null,
    rallyInProgress: raw.rally_in_progress || false,
    currentSet: raw.current_set || 1,
    matchStatus: raw.match_status || 'live',
    isMatchEnded,
    timeoutActive: raw.timeout_active || false,
    setIntervalActive: raw.set_interval_active || false,
    gameN: raw.game_n || '',
    league: raw.league || '',
    gender: raw.gender || ''
  }
}

/**
 * Arena Scoreboard App for Beach Volleyball
 * - Local mode: receives data from scorer via BroadcastChannel (same device)
 * - Remote mode: subscribes to match_live_state via Supabase Realtime (different device)
 */
export default function ScoreboardApp() {
  const { t } = useTranslation()
  const [connectionMode, setConnectionMode] = useState(null) // 'local' | 'remote'
  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const [gameState, setGameState] = useState(null) // raw match_live_state data
  const [connectionStatus, setConnectionStatus] = useState('disconnected') // 'connected' | 'disconnected' | 'waiting'
  const [availableGames, setAvailableGames] = useState([])
  const [loadingGames, setLoadingGames] = useState(false)
  const channelRef = useRef(null)

  // Check URL params for auto-connect (opened from scorer menu)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode')
    if (mode === 'local') {
      setConnectionMode('local')
    }
  }, [])

  // Local mode: listen on BroadcastChannel
  useEffect(() => {
    if (connectionMode !== 'local') return

    setConnectionStatus('waiting')

    const channel = new BroadcastChannel('openbeach-scoreboard')
    channel.onmessage = (event) => {
      if (event.data?.type === 'LIVE_STATE_UPDATE') {
        const d = event.data.data
        console.log('[ScoreboardApp] received LIVE_STATE_UPDATE:', {
          server_number: d.server_number,
          serving_team: d.serving_team,
          rally_in_progress: d.rally_in_progress,
          side_a: d.side_a,
          points_a: d.points_a,
          points_b: d.points_b
        })
        setGameState(d)
        setConnectionStatus('connected')
      }
    }

    // Request current state from scorer (in case match is already running)
    channel.postMessage({ type: 'REQUEST_STATE' })

    return () => channel.close()
  }, [connectionMode])

  // Remote mode: fetch available games
  const fetchGames = useCallback(async () => {
    if (!isBackendAvailable()) return
    setLoadingGames(true)
    try {
      // Beach rows only: the live-state table is shared with indoor
      const { data } = await apiFrom('match_live_state')
        .select('*, matches!match_live_state_match_id_fkey_cascade(set_results)')
        .eq('sport_type', 'beach')
        .order('updated_at', { ascending: false })
      const beachGames = (data || []).filter(g => g.sport_type === 'beach')
      setAvailableGames(beachGames)
    } catch (err) {
      console.error('[Scoreboard] Error fetching games:', err)
    } finally {
      setLoadingGames(false)
    }
  }, [])

  useEffect(() => {
    if (connectionMode === 'remote' && !selectedMatchId) {
      fetchGames()
    }
  }, [connectionMode, selectedMatchId, fetchGames])

  // Remote mode: subscribe to selected match
  useEffect(() => {
    if (connectionMode !== 'remote' || !selectedMatchId || !isBackendAvailable() || !supabase) return

    setConnectionStatus('waiting')

    // Initial fetch
    const fetchState = async () => {
      const { data } = await apiFrom('match_live_state')
        .select('*')
        .eq('match_id', selectedMatchId)
        .single()
      if (data) {
        setGameState(data)
        setConnectionStatus('connected')
      }
    }
    fetchState()

    // Subscribe to realtime
    const channel = supabase
      .channel(`scoreboard-${selectedMatchId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'match_live_state',
        filter: `match_id=eq.${selectedMatchId}`
      }, (payload) => {
        setGameState(payload.new)
        setConnectionStatus('connected')
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [connectionMode, selectedMatchId])

  const normalized = normalizeState(gameState)

  // Reset to setup
  const handleBack = () => {
    setGameState(null)
    setSelectedMatchId(null)
    setConnectionMode(null)
    setConnectionStatus('disconnected')
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }

  // The setup, game choice and waiting screens: the stone page with one gate
  // card. The arena display itself (below) stays the black LED board.
  const setupPage = (children) => (
    <div className="flex min-h-screen flex-col bg-stone-100 text-stone-800">
      <EntryPage>{children}</EntryPage>
    </div>
  )

  // ── Setup Screen ──
  if (!connectionMode) {
    const modeCard = (mode, Icon, name, desc) => (
      <button
        type="button"
        onClick={() => setConnectionMode(mode)}
        className={cn(
          'flex min-h-11 flex-1 flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-center transition-colors hover:border-stone-300 hover:bg-stone-50',
          FOCUS_RING
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-700">
          <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="text-base font-semibold text-stone-900">{name}</span>
        <span className="text-xs leading-relaxed text-stone-500">{desc}</span>
      </button>
    )
    return setupPage(
      <EntryCard width="md" title={t('scoreboard.title', 'Scoreboard')} subtitle={t('scoreboard.setup', 'Choose how to connect to the match')}>
        <div className="flex flex-col gap-3 sm:flex-row">
          {modeCard('local', Monitor, t('scoreboard.localMode', 'Local'), t('scoreboard.localModeDesc', 'Same device as the scorer. Connect instantly via browser.'))}
          {modeCard('remote', Globe, t('scoreboard.remoteMode', 'Remote'), t('scoreboard.remoteModeDesc', 'Different device. Connect via internet using Supabase.'))}
        </div>
      </EntryCard>
    )
  }

  // ── Remote: Game Selection ──
  if (connectionMode === 'remote' && !selectedMatchId) {
    return setupPage(
      <EntryCard width="md" title={t('scoreboard.selectGame', 'Select a game')} subtitle={t('scoreboard.selectGameDesc', 'Choose a live match to display')}>
        <div className="flex flex-col gap-4 text-left">
          {loadingGames ? (
            <div>
              <span className="sr-only">{t('common.loading', 'Loading...')}</span>
              <SkeletonRows rows={3} pill={false} />
            </div>
          ) : availableGames.length === 0 ? (
            <EmptyState icon={Radio} className="py-6">{t('livescore.noActiveGame', 'No live games')}</EmptyState>
          ) : (
            <RowList framed soft className="rounded-lg">
              {availableGames.map(game => {
                const nameA = game.team_a_name || 'Team A'
                const nameB = game.team_b_name || 'Team B'
                const gameN = game.game_n || ''
                const score = `${game.points_a || 0}–${game.points_b || 0}`
                const setLabel = `${t('livescore.set', 'Set')} ${game.current_set || 1}`
                return (
                  <Row
                    key={game.match_id}
                    tone="red"
                    onOpen={() => setSelectedMatchId(game.match_id)}
                    label={[`${nameA} – ${nameB}`, gameN ? t('livescore.game', { number: gameN }) : '', `${score} (${setLabel})`].filter(Boolean).join(', ')}
                    className="min-h-11"
                    leading={
                      <DateRail
                        tone="red"
                        weekday={gameN ? t('livescore.gameShort', 'Game') : undefined}
                        date={gameN || '–'}
                      />
                    }
                    title={
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold leading-snug break-words text-stone-900 sm:text-[15px]">{nameA}</p>
                        <p className="text-sm leading-snug break-words text-stone-600 sm:text-[15px]">{nameB}</p>
                      </div>
                    }
                    meta={<span className="tabular-nums">{score} · {setLabel}</span>}
                    status={<ChevronRight size={16} className="text-stone-400" aria-hidden />}
                  />
                )
              })}
            </RowList>
          )}

          <Button variant="secondary" size="xl" block icon={ArrowLeft} onClick={handleBack}>
            {t('common.back', 'Back')}
          </Button>
        </div>
      </EntryCard>
    )
  }

  // ── Waiting for data ──
  if (!normalized) {
    return setupPage(
      <EntryCard>
        <AppSpinner
          size={96}
          label={connectionMode === 'local'
            ? t('scoreboard.waiting', 'Waiting for scorer...')
            : t('scoreboard.connecting', 'Connecting...')}
        />
        {connectionMode === 'local' && (
          <p className="mx-auto mt-3 max-w-xs text-sm text-stone-600">
            {t('scoreboard.waitingHint', 'Start scoring a match in the scorer app on this device')}
          </p>
        )}
        <Button variant="secondary" size="xl" block icon={ArrowLeft} className="mt-6" onClick={handleBack}>
          {t('common.back', 'Back')}
        </Button>
      </EntryCard>
    )
  }

  // ── Scoreboard Display ──
  console.log('[ScoreboardApp] normalized state:', {
    servingTeam: normalized.servingTeam,
    serverNumber: normalized.serverNumber,
    rallyInProgress: normalized.rallyInProgress,
    isMatchEnded: normalized.isMatchEnded
  })

  const {
    leftName, rightName, leftColor, rightColor,
    leftPoints, rightPoints, leftSets, rightSets,
    leftTimeouts, rightTimeouts, leftChallenges, rightChallenges,
    servingTeam, serverNumber, rallyInProgress, currentSet, isMatchEnded,
    timeoutActive, setIntervalActive, gameN, league, gender
  } = normalized

  return (
    <div className="scoreboard-app">
      <div className="scoreboard-display">
        {/* Connection badge (absolute positioned, not a grid child) */}
        <div className={`scoreboard-connection-badge ${
          connectionStatus === 'connected' ? 'scoreboard-connection-connected'
          : connectionStatus === 'waiting' ? 'scoreboard-connection-waiting'
          : 'scoreboard-connection-disconnected'
        }`}>
          {connectionStatus === 'connected' ? (connectionMode === 'local' ? 'LOCAL' : 'LIVE')
          : connectionStatus === 'waiting' ? 'CONNECTING'
          : 'OFFLINE'}
        </div>

        {/* Back button (absolute positioned, not a grid child) */}
        <button className="scoreboard-back-btn" onClick={handleBack}>
          ← {t('common.back', 'Back')}
        </button>

        {/* Row 1: Team names + color bars (10vh) */}
        <div className="scoreboard-top-bar">
          <div className="scoreboard-top-team">
            <div className="scoreboard-team-color-bar" style={{ backgroundColor: leftColor }} />
            <div className="scoreboard-team-name-display">{leftName}</div>
          </div>
          <div className="scoreboard-top-team">
            <div className="scoreboard-team-color-bar" style={{ backgroundColor: rightColor }} />
            <div className="scoreboard-team-name-display">{rightName}</div>
          </div>
        </div>

        {/* Row 2: BMP LED lights (10vh) */}
        <div className="scoreboard-led-bar">
          <div className="scoreboard-led-row">
            <div className={`scoreboard-led scoreboard-led-bmp ${!isMatchEnded && leftChallenges >= 1 ? 'scoreboard-led-on' : ''}`} />
            <div className={`scoreboard-led scoreboard-led-bmp ${!isMatchEnded && leftChallenges >= 2 ? 'scoreboard-led-on' : ''}`} />
          </div>
          <div className="scoreboard-led-row">
            <div className={`scoreboard-led scoreboard-led-bmp ${!isMatchEnded && rightChallenges >= 1 ? 'scoreboard-led-on' : ''}`} />
            <div className={`scoreboard-led scoreboard-led-bmp ${!isMatchEnded && rightChallenges >= 2 ? 'scoreboard-led-on' : ''}`} />
          </div>
        </div>

        {/* Row 3: Score area (fills remaining ~65vh) */}
        <div className="scoreboard-main">
          <div className="scoreboard-score-grid">
            <div className="scoreboard-score-col">
              <div className="scoreboard-score-row">
                {!isMatchEnded && servingTeam === 'left' && serverNumber && (
                  <span className={`scoreboard-server-num ${!rallyInProgress ? 'scoreboard-server-flash' : ''}`}>
                    {serverNumber}
                  </span>
                )}
                <span className="scoreboard-points">
                  {isMatchEnded ? leftSets : leftPoints}
                </span>
              </div>
            </div>

            <div className="scoreboard-center-col">
              <div className="scoreboard-points-separator">:</div>
            </div>

            <div className="scoreboard-score-col">
              <div className="scoreboard-score-row">
                <span className="scoreboard-points">
                  {isMatchEnded ? rightSets : rightPoints}
                </span>
                {!isMatchEnded && servingTeam === 'right' && serverNumber && (
                  <span className={`scoreboard-server-num ${!rallyInProgress ? 'scoreboard-server-flash' : ''}`}>
                    {serverNumber}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: TO LED lights (10vh) */}
        <div className="scoreboard-led-bar">
          <div className="scoreboard-led-row">
            <div className={`scoreboard-led scoreboard-led-to ${!isMatchEnded && leftTimeouts >= 1 ? 'scoreboard-led-on' : ''}`} />
          </div>
          <div className="scoreboard-led-row">
            <div className={`scoreboard-led scoreboard-led-to ${!isMatchEnded && rightTimeouts >= 1 ? 'scoreboard-led-on' : ''}`} />
          </div>
        </div>

        {/* Row 5: Footer (5vh) */}
        <div className="scoreboard-footer">
          <div className="scoreboard-footer-center">
            {isMatchEnded
              ? t('scoreboard.displayFinal', 'FINAL')
              : <>Set {currentSet} {' \u2022 '} {leftSets} - {rightSets}</>
            }
          </div>
        </div>

        {/* Timeout overlay */}
        {timeoutActive && (
          <div className="scoreboard-timeout-overlay">
            <div className="scoreboard-timeout-text">
              {t('scoreboard.displayTimeout', 'TIMEOUT')}
            </div>
          </div>
        )}

        {/* Set interval overlay */}
        {setIntervalActive && !timeoutActive && (
          <div className="scoreboard-timeout-overlay">
            <div className="scoreboard-timeout-text">
              {t('scoreboard.setInterval', 'SET INTERVAL')}
            </div>
          </div>
        )}

        {/* Final overlay */}
        {isMatchEnded && (
          <div className="scoreboard-final-overlay">
            <div className="scoreboard-final-text">
              {t('scoreboard.displayFinal', 'FINAL')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
