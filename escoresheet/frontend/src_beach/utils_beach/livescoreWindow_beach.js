/**
 * Which live states the beach livescore and the scoreboard's Remote picker
 * list, as OpenVolley's (utils/livescoreModel: LIVE_FETCH_WINDOW_MS,
 * countLiveGames).
 *
 * Both read every beach row of match_live_state, and a match's row stays
 * after it ends (db/007 keeps the closed match's frozen state on purpose):
 * later in the season the header said "156 games live" for 6 matches of the
 * day, every load carried all of them (160 KB, up to the backend's 1000
 * rows), and the picker listed 150 old matches next to today's (stress test
 * 2026-10-25).
 */

/** The lists ask for rows updated within this window only. */
export const LIVE_FETCH_WINDOW_MS = 24 * 60 * 60 * 1000

/** The oldest updated_at the lists ask for (ISO). */
export function liveWindowStart(now = Date.now()) {
  return new Date(now - LIVE_FETCH_WINDOW_MS).toISOString()
}

/** A finished match's live-state status (FINAL on the livescore). */
export function isEndedStatus(status) {
  return status === 'ended' || status === 'final'
}

/** Number of listed games still being played (FINAL ones are not live). */
export function countLiveGames(games) {
  return (games || []).filter((g) => g && !isEndedStatus(g.match_status)).length
}
