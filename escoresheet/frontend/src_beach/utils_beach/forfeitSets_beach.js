/**
 * The sets a forfeit of the match still has to award (FIVB Beach rule 6.4:
 * the team declared in default or incomplete loses the match; the opponent is
 * given the points and the sets needed to win it, the defaulting team keeps
 * its points and sets).
 *
 * Scoreboard_beach handleForfait awards the current set first; these are the
 * sets after it, read again once it is finished:
 * - every set row the match has that is not finished (one opened at 0:0
 *   while the forfeit ran: a forfeit in set 2 left set 3 at 0:0 and the match
 *   at 1:1), with its `id`: the opponent wins it 21 (15 in the deciding set),
 *   or by two over the defaulting team's points, which stay;
 * - then the sets the match has not reached (no row: a forfeit in set 1 left
 *   1:0 and finishSet opened set 2 at 0:0), each won 21:0 (15:0), until the
 *   opponent has the two sets of the match.
 *
 * @param {Array<{id?: number, index: number, finished?: boolean, team1Points?: number, team2Points?: number}>} sets the match's sets after the award of the current set
 * @param {'team1'|'team2'} opponentKey the team the match goes to
 * @returns {Array<{id?: number, index: number, team1Points: number, team2Points: number}>} in set order; `id` when the row exists
 */
export function missingForfeitSets(sets, opponentKey) {
  const pts = (s, key) => Number(s?.[key === 'team1' ? 'team1Points' : 'team2Points']) || 0
  const teamKey = opponentKey === 'team1' ? 'team2' : 'team1'
  const list = (Array.isArray(sets) ? sets : []).filter(s => s && Number(s.index) >= 1)
  const toWinOf = (index) => index === 3 ? 15 : 21
  const score = (index, teamPoints) => {
    const toWin = toWinOf(index)
    const opponentPoints = teamPoints >= toWin - 1 ? teamPoints + 2 : toWin
    return opponentKey === 'team1'
      ? { team1Points: opponentPoints, team2Points: teamPoints }
      : { team1Points: teamPoints, team2Points: opponentPoints }
  }
  let won = list.filter(s => s.finished && pts(s, opponentKey) > pts(s, teamKey)).length
  const out = list.filter(s => !s.finished)
    .sort((a, b) => a.index - b.index)
    .map(s => ({ id: s.id, index: Number(s.index), ...score(Number(s.index), pts(s, teamKey)) }))
  won += out.length
  const taken = new Set(list.map(s => Number(s.index)))
  for (let index = 1; won < 2 && index <= 3; index++) {
    if (taken.has(index)) continue
    out.push({ index, ...score(index, 0) })
    won++
  }
  return out.sort((a, b) => a.index - b.index)
}
