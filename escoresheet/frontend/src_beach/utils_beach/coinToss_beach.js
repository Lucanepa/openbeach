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
 * "Swap team A ↔ B" re-labels the teams only (owner's decision, 2026-10-09,
 * as OpenVolley): nothing moves. The first server is a team, so it stays the
 * same team: the A/B fields that name it follow the swap, and the cloud coin
 * toss is built from the same fields, or a restore (and the referee /
 * livescore / PDF reading the cloud) would bring back the other team as the
 * first server. The court sides are stored as A/B labels too
 * (setLeftTeamOverrides, set3LeftTeam: courtSides_beach), so they follow the
 * swap as well and each team stays on its side.
 *
 * Ported from OpenVolley escoresheet/frontend/src/domain/coinToss.js
 * (swapTeamDesignation). It kept the A/B sides here, so the teams changed
 * courts on the swap: "Swap team A ↔ B" looked like a change of courts.
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
  for (const field of SWAP_FLIPPED_LABELS) {
    if (match[field] === 'A' || match[field] === 'B') patch[field] = flipLabel(match[field])
  }
  // The sides of every set, set 1's written even without a change of courts
  // (A on the left by default: the team there stays, now named B)
  patch.setLeftTeamOverrides = flipSides(match.setLeftTeamOverrides)
  return patch
}

/**
 * The A/B labels that name a team and so move with "Swap team A ↔ B": the
 * set 3 toss's first server and start side. The sides of every set
 * (setLeftTeamOverrides, an object) move too: flipSides.
 */
export const SWAP_FLIPPED_LABELS = Object.freeze(['set3FirstServe', 'set3LeftTeam'])

/**
 * `setLeftTeamOverrides` ({ [set]: 'A' | 'B' }) after a swap of A and B: each
 * side flipped, so each team keeps its side. Set 1 without a side has A on
 * the left (courtSides_beach leftTeamInSet), so it is written as 'B': without
 * it the new A would be put on the left, i.e. the teams would change courts
 * (and every later set without its own side follows set 1).
 * @param {object|null|undefined} overrides
 * @returns {object}
 */
export function flipSides(overrides) {
  const out = {}
  if (overrides && typeof overrides === 'object') {
    for (const [set, side] of Object.entries(overrides)) out[set] = flipLabel(side)
  }
  if (out[1] !== 'A' && out[1] !== 'B') out[1] = 'B'
  return out
}

/**
 * `fields` (match fields, e.g. an undo's restore) whose A/B labels were
 * written when team A was `fromTeamA`, in the designation of now (`toTeamA`):
 * after a swap they are flipped as the swap flipped the match's. An undo of
 * an unrelated event restores labels from before the swap; written as they
 * were, they named the other team (set 3's first server changed, the teams
 * changed courts).
 * @param {object} fields
 * @param {'team1'|'team2'|null|undefined} fromTeamA
 * @param {'team1'|'team2'|null|undefined} toTeamA
 */
export function labelsInDesignation(fields, fromTeamA, toTeamA) {
  if (!fields || !fromTeamA || !toTeamA || fromTeamA === toTeamA) return fields
  const out = { ...fields }
  for (const field of SWAP_FLIPPED_LABELS) {
    if (out[field] === 'A' || out[field] === 'B') out[field] = flipLabel(out[field])
  }
  // The sides (null / {}: set 1 with A on the left, as the swap writes it)
  if ('setLeftTeamOverrides' in out) out.setLeftTeamOverrides = flipSides(out.setLeftTeamOverrides)
  return out
}

/**
 * The Team A an event was logged with (its A/B labels and snapshot are of
 * that designation): its payload's `teamA`, else its snapshot's `teamAKey`;
 * null when it says neither (taken as the match's of now).
 * @param {object} event  a local event (stateSnapshot) or a cloud row (state_snapshot)
 */
export function eventTeamA(event) {
  const isTeam = (v) => v === 'team1' || v === 'team2'
  const snap = event?.stateSnapshot ?? event?.state_snapshot
  if (isTeam(event?.payload?.teamA)) return event.payload.teamA
  if (isTeam(snap?.teamAKey)) return snap.teamAKey
  return null
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
