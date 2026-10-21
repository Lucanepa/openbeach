/**
 * The sets a forfeit of the match still has to award (FIVB Beach rule 6.4:
 * the team declared in default or incomplete loses the match; the opponent is
 * given the points and the sets needed to win it, the defaulting team keeps
 * its points and sets).
 *
 * Scoreboard_beach handleForfait awards the current set and the remaining
 * sets the match already has; a set the match has not reached has no row, so
 * a forfeit in set 1 left 1:0 and finishSet opened set 2 at 0:0. These are
 * the sets to add after that, each won 21:0 (15:0 in the deciding set) by the
 * opponent, until it has the two sets of the match.
 *
 * @param {Array<{index: number, finished?: boolean, team1Points?: number, team2Points?: number}>} sets the match's sets after the award
 * @param {'team1'|'team2'} opponentKey the team the match goes to
 * @returns {Array<{index: number, team1Points: number, team2Points: number}>}
 */
export function missingForfeitSets(sets, opponentKey) {
  const pts = (s, key) => Number(s?.[key === 'team1' ? 'team1Points' : 'team2Points']) || 0
  const teamKey = opponentKey === 'team1' ? 'team2' : 'team1'
  const list = Array.isArray(sets) ? sets : []
  let won = list.filter(s => s?.finished && pts(s, opponentKey) > pts(s, teamKey)).length
  let index = list.reduce((max, s) => Math.max(max, Number(s?.index) || 0), 0) + 1
  const out = []
  while (won < 2 && index <= 3) {
    const toWin = index === 3 ? 15 : 21
    out.push({ index, team1Points: opponentKey === 'team1' ? toWin : 0, team2Points: opponentKey === 'team2' ? toWin : 0 })
    won++
    index++
  }
  return out
}
