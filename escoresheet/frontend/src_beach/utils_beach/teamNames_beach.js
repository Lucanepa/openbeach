// A beach team's name: "Last / Last" (the two players by number), with
// spaces, and never the country (it is shown on its own: flag and code).
// The coin toss used to build "Müller / Weber (CHE)" and store it as the
// team name, so the setup cards, the coin toss and the scoresheet header
// showed the country twice; the test roster had "Müller/Weber (CHE)".

const toTitleCase = (str) => (str ? String(str).replace(/(^|[\s-])(\S)/g, (_m, pre, c) => pre + c.toUpperCase()) : '')

/** "Müller / Weber", or '' when no player has a last name. */
export function pairTeamName(players) {
  if (!Array.isArray(players) || players.length === 0) return ''
  return [...players]
    .sort((a, b) => (a?.number ?? 999) - (b?.number ?? 999))
    .map(p => toTitleCase((p?.lastName || p?.last_name || '').trim()))
    .filter(Boolean)
    .join(' / ')
}

const PLACEHOLDER = /^(team\s*[12]|team1|team2)$/i

/**
 * The name the coin toss shows: the team's stored name (what the scorer
 * typed or accepted in the match setup), else the players' names.
 */
export function teamNameForCoinToss(storedName, players, fallback) {
  const stored = (storedName || '').trim()
  if (stored && !PLACEHOLDER.test(stored)) return stored
  return pairTeamName(players) || fallback
}
