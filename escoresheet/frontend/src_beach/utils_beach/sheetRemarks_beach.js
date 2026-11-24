/**
 * The REMARKS of the score sheet and of Match End (the same text on both):
 * the scorer's own, then the remarks the sheet writes itself, the MTO / RIT
 * lines (medicalRemarks_beach) and a set that went past the 44 boxes of the
 * running score (OpenVolley 75d59ec2: "Set n continued beyond 48" on the
 * indoor sheet). Points past box 44 are marked nowhere on the sheet: the
 * remark is their only record, with the final score, team A first.
 *
 * Pure: no React, no database.
 */
import { medicalRemarkLines } from './medicalRemarks_beach.js'

/** The running score's boxes a team, each set (1 to 44). */
export const RUNNING_SCORE_BOXES = 44

/** "Set n continued beyond 44, final a:b" for each finished set past the boxes. */
export function beyondRunningScoreRemarks(sets, teamAKey = 'team1') {
  const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
  const pts = (s, key) => Number(key === 'team1' ? s.team1Points : s.team2Points) || 0
  return (Array.isArray(sets) ? sets : [])
    .filter(s => s?.finished && Math.max(pts(s, 'team1'), pts(s, 'team2')) > RUNNING_SCORE_BOXES)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(s => `Set ${s.index} continued beyond ${RUNNING_SCORE_BOXES}, final ${pts(s, teamAKey)}:${pts(s, teamBKey)}`)
}

/**
 * The whole REMARKS text: the scorer's own, then (after a blank line) the
 * generated lines that are not in it already.
 * @param {string} remarks  match.remarks
 * @param {{ events?: any[], sets?: any[], teamAKey?: string, teamNames?: { team1: string, team2: string } }} ctx
 */
export function sheetRemarksText(remarks, { events = [], sets = [], teamAKey = 'team1', teamNames } = {}) {
  const own = String(remarks || '').trim()
  const generated = [
    ...medicalRemarkLines(events, { teamAKey, teamNames }),
    ...beyondRunningScoreRemarks(sets, teamAKey)
  ].filter(l => !own.includes(l))
  if (!generated.length) return own
  return own ? `${own}\n\n${generated.join('\n')}` : generated.join('\n')
}
