/**
 * The choice made in the interval before set 2 and before set 3 (FIVB beach
 * rules 2025-2028).
 *
 * - Nothing moves by itself between sets: the teams stay on the side they
 *   finished on (rule 18.1.1: "the change of courts (if requested)"; the
 *   start sides: courtSides_beach nextSetStartSides).
 * - Set 2: the team that LOST the first coin toss chooses (rule 7.1.2.3):
 *   either serve / receive or the side (7.1.2.1 / 7.1.2.2); the other team
 *   takes the remaining choice (7.1.2, Casebook 3.1.2).
 * - Set 3: a new coin toss (7.1.2.3, 18.1.1); its winner chooses, the loser
 *   takes the remaining choice.
 * - Each team gives its service order again in each interval (7.6.1,
 *   18.1.1): who serves first and who second.
 */

/**
 * The team that makes the choice before set `setIndex`, and why: set 2 the
 * loser of the first toss, set 3 the winner of the set 3 toss. null when it
 * is not known (no toss recorded) or for another set.
 * @returns {{ teamKey: 'team1'|'team2', reason: 'lostToss'|'wonSet3Toss' }|null}
 */
export function intervalChooser(setIndex, match) {
  const index = Number(setIndex)
  if (index === 2) {
    const winner = match?.coinTossWinner
    if (winner !== 'team1' && winner !== 'team2') return null
    return { teamKey: winner === 'team1' ? 'team2' : 'team1', reason: 'lostToss' }
  }
  if (index === 3) {
    const winner = match?.set3CoinTossWinner
    if (winner !== 'team1' && winner !== 'team2') return null
    return { teamKey: winner, reason: 'wonSet3Toss' }
  }
  return null
}

/** The choice the other team is left with: 'side' <-> 'serve'. */
export const remainingChoice = (choice) => (choice === 'side' ? 'serve' : choice === 'serve' ? 'side' : null)

/**
 * Which team decides what, once the chooser picked `choice` ('side' or
 * 'serve'): `{ side: teamKey, serve: teamKey }`; null before a pick.
 */
export function deciders(chooserKey, choice) {
  if (!chooserKey || (choice !== 'side' && choice !== 'serve')) return null
  const other = chooserKey === 'team1' ? 'team2' : 'team1'
  return choice === 'side' ? { side: chooserKey, serve: other } : { side: other, serve: chooserKey }
}

/**
 * A team's service order for the next set: its first and second server
 * (number and name). `firstServe`: the match's team1FirstServe /
 * team2FirstServe (a player number); without it the lower number first.
 */
export function serviceOrderOf(players, firstServe) {
  const list = [...(players || [])]
    .filter(p => p && p.number !== undefined && p.number !== null && p.number !== '')
    .sort((a, b) => Number(a.number) - Number(b.number))
  const first = list.find(p => firstServe != null && String(p.number) === String(firstServe)) || list[0] || null
  const second = list.find(p => p !== first) || null
  const person = (p) => (p ? { number: p.number, name: playerShortName(p) } : null)
  return { first: person(first), second: person(second) }
}

/** A player's short name for the service order: the last name, else the name. */
export function playerShortName(p) {
  if (!p) return ''
  if (p.lastName) return String(p.lastName)
  if (p.name) return String(p.name).trim().split(/\s+/).pop()
  if (p.firstName) return String(p.firstName)
  return ''
}
