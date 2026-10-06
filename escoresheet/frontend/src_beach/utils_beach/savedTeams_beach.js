/**
 * Saved beach teams: pure helpers (spec beach-saved-teams-spec.md §5.3).
 *
 * The OpenVolley admin console manages the competitions and teams; OpenBeach
 * only reads them (GET /api/saved-teams?sport=beach) into an offline cache
 * (db_beach/savedTeams_beach.js) and fills MatchSetup_beach from it.
 * A saved beach team is a pair: players numbered 1 and 2, an optional coach,
 * and per-player country codes. Nothing here touches the DOM or the database.
 */

/** Lower-case, NFC, collapsed whitespace: the key two spellings share. */
export function normalizeName(v) {
  return String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * A team name as a lookup key: 'Müller / Weber (CHE)' and 'müller/weber' both
 * give 'müller/weber' (a trailing "(…)", usually the country, is dropped and
 * the spaces around '/' are removed).
 */
export function beachNameKey(name) {
  return normalizeName(name)
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

/** 'Weber / Müller' → 'müller/weber' (order-independent); '' unless two parts. */
export function pairKeyFromName(name) {
  const parts = beachNameKey(name).split('/').map(p => p.trim()).filter(Boolean)
  if (parts.length !== 2) return ''
  return parts.sort().join('/')
}

/** The sorted last names of exactly two players, or ''. */
export function pairKeyFromPlayers(players) {
  if (!Array.isArray(players) || players.length !== 2) return ''
  const names = players.map(p => normalizeName(p?.last_name))
  if (names.some(n => !n)) return ''
  return names.sort().join('/')
}

/** The two lookup keys of an API team (the cache indexes both). */
export function teamKeys(team) {
  return {
    nameKey: beachNameKey(team?.name),
    pairKey: pairKeyFromPlayers(team?.players) || pairKeyFromName(team?.name)
  }
}

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY' (MatchSetup_beach's format); anything else → ''. */
export function isoToBeachDob(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** The country of the pair when the players share exactly one, else ''. */
export function teamCountry(players) {
  const set = new Set()
  for (const p of Array.isArray(players) ? players : []) {
    if (p?.country) set.add(String(p.country).trim().toUpperCase())
  }
  return set.size === 1 ? [...set][0] : ''
}

function emptySlot(number) {
  return { number, firstName: '', lastName: '', dob: '', isCaptain: false }
}

/**
 * A saved team (cache row or API team) → what MatchSetup_beach needs.
 * The roster always has slots 1 and 2; captains stay unset (the scorer
 * chooses one per match).
 * @returns {{roster: object[], country: string, meta: {name: string, shortName: string, color: string},
 *   coach: {firstName: string, lastName: string}|null, warnings: {key: string, params: object}[]}}
 */
export function savedTeamToBeachRoster(team) {
  const players = Array.isArray(team?.players) ? team.players : []
  const slots = [null, null]
  const rest = []
  for (const p of players) {
    const n = Number(p?.number)
    if ((n === 1 || n === 2) && !slots[n - 1]) slots[n - 1] = p
    else rest.push(p)
  }
  for (const p of rest) {
    const free = slots.indexOf(null)
    if (free === -1) break
    slots[free] = p
  }
  const roster = slots.map((p, i) => (p
    ? { number: i + 1, firstName: p.first_name || '', lastName: p.last_name || '', dob: isoToBeachDob(p.dob), isCaptain: false }
    : emptySlot(i + 1)))

  const name = team?.name || ''
  const shortName = team?.short_name ?? team?.shortName ?? ''
  const coachRow = (Array.isArray(team?.staff) ? team.staff : []).find(s => s?.role === 'Coach')
  const countries = new Set(players.map(p => p?.country).filter(Boolean).map(c => String(c).trim().toUpperCase()))

  const warnings = []
  if (players.length < 2) warnings.push({ key: 'savedTeams.incompleteTeam', params: { name } })
  if (countries.size > 1) warnings.push({ key: 'savedTeams.countryMismatch', params: { name } })

  return {
    roster,
    country: teamCountry(players),
    meta: { name, shortName: shortName || '', color: team?.color || '' },
    coach: coachRow ? { firstName: coachRow.first_name || '', lastName: coachRow.last_name || '' } : null,
    warnings
  }
}

/** Does the roster hold any name the scorer typed (or loaded)? */
export function rosterHasNames(roster) {
  return (Array.isArray(roster) ? roster : []).some(p =>
    String(p?.firstName ?? '').trim() !== '' || String(p?.lastName ?? '').trim() !== '')
}

/** Does a cache row match a team name typed in MatchSetup_beach? */
export function teamMatchesName(row, name) {
  const k = beachNameKey(name)
  if (!k) return false
  if (row?.nameKey === k) return true
  const pair = pairKeyFromName(name)
  return pair !== '' && pair === row?.pairKey
}

/** The calendar year in Switzerland (the beach season). */
export function zurichYear(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric' }).format(now)
  } catch {
    return String(now.getFullYear())
  }
}

/**
 * The season (year) of a match date: MatchSetup_beach keeps DD.MM.YYYY,
 * stored matches use ISO YYYY-MM-DD. Anything else (empty, half typed) is
 * this Zurich year.
 */
export function seasonOf(date) {
  const s = String(date ?? '').trim()
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(s)
  if (iso) return iso[1]
  const swiss = /^\d{1,2}\.\d{1,2}\.(\d{4})$/.exec(s)
  if (swiss) return swiss[1]
  return zurichYear()
}

function bestMatch(rows, name, { league, gender, season }) {
  const leagueKey = normalizeName(league)
  const score = row => [
    leagueKey !== '' && normalizeName(row.competition?.name) === leagueKey ? 1 : 0,
    gender && row.competition?.gender === gender ? 1 : 0,
    row.competition?.season === season ? 1 : 0,
    Date.parse(row.updatedAt) || 0
  ]
  // Lexicographic, descending: the first differing criterion decides
  const compare = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  let best = null
  let bestScore = null
  for (const row of rows) {
    if (!row || row.competition?.archived) continue
    if (!teamMatchesName(row, name)) continue
    const s = score(row)
    if (!bestScore || compare(s, bestScore) > 0) {
      best = row
      bestScore = s
    }
  }
  return best
}

/**
 * The saved team to offer for each side, from the names typed in MatchSetup.
 * Ranked by: same competition name as the league, same gender, same season
 * (the match year, else this year), then the most recently updated.
 * @returns {{team1: object|null, team2: object|null}}
 */
export function findBeachTeamSuggestions(rows, { team1Name, team2Name, league, gender, date } = {}) {
  const list = Array.isArray(rows) ? rows : []
  const ctx = { league, gender, season: seasonOf(date) }
  const team1 = bestMatch(list, team1Name, ctx)
  let team2 = bestMatch(list, team2Name, ctx)
  if (team1 && team2 && team1.id === team2.id) team2 = null
  return { team1, team2 }
}
