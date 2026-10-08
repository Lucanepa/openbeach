/**
 * Team designation (A/B) helpers: no React, no Dexie.
 *
 * The coin toss labels team1/team2 as A and B (coinTossTeamA / coinTossTeamB)
 * and records the team that serves first twice: as a team (`firstServe`,
 * 'team1' / 'team2', what the scoreboard plays from) and as A/B flags
 * (`coinTossServeA` / `coinTossServeB`, what the coin toss screen reopens
 * with: the ball shown next to A or B). The set 3 toss
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
// The team the scoreboard (and the referee, the snapshots) play first:
// firstServe, team1 without one. Not the A/B flag: a match restored with the
// flag and no first server has been played with team1 serving first, and a
// swap must not change that mid-match.
const playedFirstServe = (match) => match.firstServe || 'team1'

/**
 * The match fields to write when swapping which team is A and which is B.
 * @param {object} match
 * @returns {object} a patch for db.matches.update
 */
export function swapTeamDesignation(match = {}) {
  const currentA = match.coinTossTeamA || 'team1'
  const newTeamA = otherTeam(currentA)
  const newTeamB = currentA

  // The team serving first as the scoreboard plays it (firstServe, team1
  // without one): written, and both A/B serve flags follow it
  const firstServe = playedFirstServe(match)

  const patch = {
    coinTossTeamA: newTeamA,
    coinTossTeamB: newTeamB,
    firstServe,
    coinTossServeA: firstServe === newTeamA,
    coinTossServeB: firstServe === newTeamB
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
  const firstServe = playedFirstServe(match)
  return {
    team_a: teamA,
    team_b: teamB,
    serve_a: firstServe === teamA,
    confirmed: true,
    first_serve: firstServe
  }
}

/**
 * The team serving first in set `setIndex` as the scoreboard plays it (the
 * snapshot's rule): set 1 firstServe; set 2 set2FirstServe, else the other
 * team; set 3 its toss (set3FirstServe, 'A' / 'B'), else the other team than
 * set 2's. Beach's deciding set is 3 (indoor's is 5).
 */
export function setFirstServer(match = {}, setIndex = 1) {
  const set1 = playedFirstServe(match)
  const set2 = match.set2FirstServe || otherTeam(set1)
  if (Number(setIndex) === 3) {
    const teamA = match.coinTossTeamA || 'team1'
    if (match.set3FirstServe === 'A') return teamA
    if (match.set3FirstServe === 'B') return otherTeam(teamA)
    return otherTeam(set2)
  }
  if (Number(setIndex) === 2) return set2
  return set1
}

/**
 * "Switch serve" of Manual changes > Current set: who serves first.
 * Set 3: its own toss (set3FirstServe flips, from the server it has now).
 * Sets 1 and 2: the match's first server (firstServe) with both A/B serve
 * flags, as OpenVolley's switchFirstServe; the cloud gets the coin toss.
 * @returns {{ update: object, cloud: object, before: string, after: string }}
 *   `update` for db.matches, `cloud` the match fields for the sync job
 */
export function switchFirstServeUpdate(match = {}, setIndex = 1) {
  if (Number(setIndex) === 3) {
    const teamA = match.coinTossTeamA || 'team1'
    const current = setFirstServer(match, 3) === teamA ? 'A' : 'B'
    const next = flipLabel(current)
    return { update: { set3FirstServe: next }, cloud: { set3FirstServe: next }, before: current, after: next }
  }
  const before = playedFirstServe(match)
  const firstServe = otherTeam(before)
  const teamA = match.coinTossTeamA || 'team1'
  const teamB = match.coinTossTeamB || otherTeam(teamA)
  const update = { firstServe, coinTossServeA: firstServe === teamA, coinTossServeB: firstServe === teamB }
  return { update, cloud: { coin_toss: coinTossCloud({ ...match, ...update }) }, before, after: firstServe }
}
