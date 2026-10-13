// The file name of a saved beach scoresheet (owner, 2026-10-13, as OpenVolley's
// scoresheet_pdf/utils/sheetFormat.ts buildScoresheetFilename and the
// manager's download): game<n>_<league>_<YYYY-MM-DD>.pdf, e.g.
// game7_Coop-Beachtour_2026-10-11.pdf. It was
// <date>_<time>_<site>_Match<n>_<countries>.pdf.

const TRANSLITERATION = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' }

/** A part of a file name: ASCII letters, digits and `-` only, at most `max` long. */
export function filenamePart(value, max = 30) {
  const s = value === null || value === undefined ? '' : String(value)
  return s.replace(/[äöüÄÖÜß]/g, (c) => TRANSLITERATION[c]).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max).replace(/-$/, '')
}

const pad2 = (n) => String(n).padStart(2, '0')

/** The local calendar day of `value` as YYYY-MM-DD, or '' when it is no date. */
function localIsoDay(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * game<n>_<league>_<YYYY-MM-DD>.pdf: the league left out when there is none,
 * `<Team1>_vs_<Team2>` instead of game<n> without a game number; the LOCAL
 * day of the scheduled start, else `now`.
 * @param {object} matchData the scoresheet's data (match, team1Team / team2Team)
 */
export function beachScoresheetFilename(matchData, now = new Date()) {
  const match = matchData?.match || {}
  const team1 = matchData?.team1Team || matchData?.team_1Team || matchData?.team1
  const team2 = matchData?.team2Team || matchData?.team_2Team || matchData?.team2
  const game = filenamePart(match.game_n ?? match.gameNumber ?? match.matchNumber, 20)
  const who = game
    ? `game${game}`
    : `${filenamePart(team1?.name || match.team1Name) || 'Team1'}_vs_${filenamePart(team2?.name || match.team2Name) || 'Team2'}`
  const day = localIsoDay(match.scheduledAt) || localIsoDay(now)
  return `${[who, filenamePart(match.league), day].filter(Boolean).join('_').slice(0, 116)}.pdf`
}
