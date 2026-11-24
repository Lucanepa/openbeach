/**
 * The match open in the scorer app, as the activity log knows it: it follows
 * the writes (a write of another match moves it there). The roster entries
 * (match.roster) are those of its two teams.
 *
 * Ported from OpenVolley src/utils/activity/activeMatch.js (653b4f27), with
 * the beach team fields (team1Id / team2Id). The interaction log keeps its
 * own match context (contexts_beach/LoggingContext_beach), so this one does
 * not set it.
 */

let active = null
const listeners = new Set()

/** The game number of a local match row (whichever field the screen wrote). */
export const gameNumberOf = (m) => {
  const v = m?.gameNumber ?? m?.game_n ?? m?.gameN ?? null
  return v === '' ? null : v
}

/** @param {object|null} match local match row (or null: no match open) */
export function setActiveMatch(match) {
  const next = match && match.id != null
    ? {
        id: match.id,
        gameN: gameNumberOf(match),
        seedKey: match.seed_key || null,
        test: match.test === true,
        team1Id: match.team1Id ?? match.team1TeamId ?? null,
        team2Id: match.team2Id ?? match.team2TeamId ?? null
      }
    : null
  const same = next && active && ['id', 'gameN', 'seedKey', 'test', 'team1Id', 'team2Id'].every(k => next[k] === active[k])
  if (same || (!next && !active)) return
  active = next
  for (const fn of listeners) {
    try { fn(active) } catch { /* ignore */ }
  }
}

export const getActiveMatch = () => active

export function onActiveMatchChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
