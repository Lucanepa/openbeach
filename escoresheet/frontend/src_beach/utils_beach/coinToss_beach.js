/**
 * Team designation (A/B) helpers: no React, no Dexie.
 *
 * The coin toss labels team1/team2 as A and B (coinTossTeamA / coinTossTeamB)
 * and records the team that serves first twice: as a team (`firstServe`,
 * 'team1' / 'team2', what the scoreboard plays from) and as an A/B flag
 * (`coinTossServeA`, what the coin toss screen reopens with). The set 3 toss
 * stores its first server as a label too (`set3FirstServe`, 'A' / 'B').
 *
 * "Swap team A ↔ B" re-labels the teams only. The first server is a team, so
 * it must stay the same team: the A/B fields that name it follow the swap,
 * and the cloud coin toss is built from the same fields, or a restore (and
 * the referee / livescore / PDF reading the cloud) would bring back the other
 * team as the first server.
 *
 * Ported from OpenVolley escoresheet/frontend/src/domain/coinToss.js
 * (swapTeamDesignation). The court sides (setLeftTeamOverrides /
 * set3LeftTeam) are left as they are, as "Swap team A ↔ B" always did here.
 */

const otherTeam = (key) => (key === 'team1' ? 'team2' : 'team1')
const flipLabel = (label) => (label === 'A' ? 'B' : label === 'B' ? 'A' : label)

/**
 * The match fields to write when swapping which team is A and which is B.
 * @param {object} match
 * @returns {object} a patch for db.matches.update
 */
export function swapTeamDesignation(match = {}) {
  const currentA = match.coinTossTeamA || 'team1'
  const newTeamA = otherTeam(currentA)
  const newTeamB = currentA

  // The team serving first: firstServe when known, otherwise the one the old
  // A/B flag named (A serving when there is no flag either)
  const firstServe = match.firstServe ||
    ((match.coinTossServeA ?? true) ? currentA : otherTeam(currentA))

  const patch = {
    coinTossTeamA: newTeamA,
    coinTossTeamB: newTeamB,
    firstServe,
    coinTossServeA: firstServe === newTeamA
  }
  if (match.set3FirstServe === 'A' || match.set3FirstServe === 'B') {
    patch.set3FirstServe = flipLabel(match.set3FirstServe)
  }
  return patch
}

/**
 * The cloud `coin_toss` fields for the match's designation and first server
 * (a JSONB merge: the winner and the first server players are kept).
 * @param {object} match  the match with the patch applied
 */
export function coinTossCloud(match = {}) {
  const teamA = match.coinTossTeamA || 'team1'
  const teamB = match.coinTossTeamB || otherTeam(teamA)
  const firstServe = match.firstServe ||
    ((match.coinTossServeA ?? true) ? teamA : teamB)
  return {
    team_a: teamA,
    team_b: teamB,
    serve_a: firstServe === teamA,
    confirmed: true,
    first_serve: firstServe
  }
}
