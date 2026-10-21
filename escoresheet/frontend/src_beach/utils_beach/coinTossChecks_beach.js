/**
 * What the coin toss confirm refuses (a test match skips it): pure, no React.
 * Each issue is an i18n key of the `validation` namespace with its params;
 * `team` is 'team1' or 'team2', and CoinToss_beach puts the team's name in
 * for it. Half of the checks pushed an English literal ("Team 1 has
 * duplicate jersey numbers: ...") in every language (OpenVolley 80166421).
 */

const hasNumber = (p) => p.number != null && p.number !== ''

/**
 * @param {{ match?: object, team1Name?: string, team2Name?: string, team1Roster?: object[],
 *   team2Roster?: object[], manageDob?: boolean }} input
 * @returns {{ key: string, params?: object }[]}
 */
export function coinTossConfirmIssues({ match = {}, team1Name = '', team2Name = '', team1Roster = [], team2Roster = [], manageDob = false } = {}) {
  const issues = []
  const add = (key, params) => issues.push(params ? { key, params } : { key })
  const teams = [['team1', team1Roster], ['team2', team2Roster]]

  // 1. Team names (not the default "Team 1" / "Team 2", not empty)
  if (!team1Name || team1Name === 'Team 1' || team1Name.trim() === '') add('validation.team1NotSet')
  if (!team2Name || team2Name === 'Team 2' || team2Name.trim() === '') add('validation.team2NotSet')

  // 2. The 1st referee and the scorer, with names
  const ref1 = match?.officials?.find(o => o.role === '1st referee')
  const scorer = match?.officials?.find(o => o.role === 'scorer')
  if (!ref1?.lastName || !ref1?.firstName) add('validation.refereeNotSet')
  if (!scorer?.lastName || !scorer?.firstName) add('validation.scorerNotSet')

  // 3. Match info (hall, city, league, date)
  if (!match?.hall || match.hall.trim() === '') add('validation.hallNotSet')
  if (!match?.city || match.city.trim() === '') add('validation.cityNotSet')
  if (!match?.league || match.league.trim() === '') add('validation.leagueNotSet')
  if (!match?.scheduledAt) add('validation.dateNotSet')

  // 4. Exactly 2 players with numbers a team (beach volleyball)
  for (const [team, roster] of teams) {
    const numbered = roster.filter(hasNumber)
    if (numbered.length !== 2) add('validation.needMorePlayers', { team, count: numbered.length })
  }
  // 5. A captain
  for (const [team, roster] of teams) {
    if (!roster.find(p => p.isCaptain)) add('validation.captainNotSet', { team })
  }
  // 6. Duplicate shirt numbers
  for (const [team, roster] of teams) {
    const numbers = roster.filter(hasNumber).map(p => p.number)
    const dup = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))]
    if (dup.length > 0) add('validation.duplicateNumbers', { team, numbers: dup.join(', ') })
  }
  // 7. Duplicate players (same last and first name)
  for (const [team, roster] of teams) {
    const names = roster.map(p => `${(p.lastName || '').toLowerCase()} ${(p.firstName || '').toLowerCase()}`.trim())
    const dup = [...new Set(names.filter((n, i) => n && names.indexOf(n) !== i))]
    if (dup.length > 0) add('validation.duplicatePlayers', { team, names: dup.join(', ') })
  }
  // 8. No date of birth 01.01.1900 (a placeholder / import error), when dates of birth are kept
  if (manageDob && [...team1Roster, ...team2Roster].some(p => p.dob === '01.01.1900' || p.dob === '01/01/1900')) {
    add('validation.invalidBirthdate')
  }
  // 9. Shirt numbers 1-99 (a blank one is "without a number", not invalid)
  for (const [team, roster] of teams) {
    const invalid = roster.filter(p => hasNumber(p) && (p.number < 1 || p.number > 99))
    if (invalid.length > 0) add('validation.invalidJerseyNumbers', { team, numbers: invalid.map(p => p.number).join(', ') })
  }
  // 10. Players without numbers
  for (const [team, roster] of teams) {
    const none = roster.filter(p => !hasNumber(p))
    if (none.length > 0) add('validation.playersWithoutNumbers', { team, count: none.length })
  }
  return issues
}
