/**
 * A score as the scorer sees the court: the left team first, each side with
 * its letter ("A 20 : 16 B"). It was printed as team1:team2 (or a fixed
 * "B x:y A"), so after a court switch the numbers no longer matched the
 * sides, and the BMP dialog's "Current 16:20 / New 15:21" had no letters.
 */
export function courtScoreParts(score, { leftisTeam1, teamAKey = 'team1' }) {
  const t1 = Number(score?.team1 ?? score?.team1Points ?? 0) || 0
  const t2 = Number(score?.team2 ?? score?.team2Points ?? 0) || 0
  const letter = (key) => (key === teamAKey ? 'A' : 'B')
  const leftKey = leftisTeam1 ? 'team1' : 'team2'
  const rightKey = leftisTeam1 ? 'team2' : 'team1'
  return {
    leftLetter: letter(leftKey),
    leftPoints: leftisTeam1 ? t1 : t2,
    rightPoints: leftisTeam1 ? t2 : t1,
    rightLetter: letter(rightKey)
  }
}

export function formatCourtScore(score, sides) {
  const p = courtScoreParts(score, sides)
  return `${p.leftLetter} ${p.leftPoints} : ${p.rightPoints} ${p.rightLetter}`
}
