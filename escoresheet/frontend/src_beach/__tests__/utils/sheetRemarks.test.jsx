// A set past the running score's 44 boxes gets the remark "Set n continued
// beyond 44, final a:b" (team A first) on the sheet and on Match End: the
// points past box 44 are marked nowhere else (OpenVolley 75d59ec2: "continued
// beyond 48" on the indoor sheet; the beach sheet has 44 boxes a team).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { beyondRunningScoreRemarks, sheetRemarksText, RUNNING_SCORE_BOXES } from '../../utils_beach/sheetRemarks_beach'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

const set = (index, team1Points, team2Points, finished = true) => ({ index, team1Points, team2Points, finished })

describe('sheetRemarks_beach', () => {
  it('a finished set past 44 points, team A first; none at 44 or for an open set', () => {
    expect(RUNNING_SCORE_BOXES).toBe(44)
    const sets = [set(2, 44, 46), set(1, 21, 15), set(3, 44, 42), set(3, 50, 48, false)]
    expect(beyondRunningScoreRemarks(sets, 'team1')).toEqual(['Set 2 continued beyond 44, final 44:46'])
    expect(beyondRunningScoreRemarks(sets, 'team2')).toEqual(['Set 2 continued beyond 44, final 46:44'])
    expect(beyondRunningScoreRemarks([set(1, 45, 43), set(3, 16, 14)], 'team1')).toEqual(['Set 1 continued beyond 44, final 45:43'])
    expect(beyondRunningScoreRemarks(null)).toEqual([])
  })

  it('the REMARKS text: the scorer\'s own, a blank line, then the generated lines not in it yet', () => {
    const sets = [set(1, 46, 44)]
    const line = 'Set 1 continued beyond 44, final 46:44'
    expect(sheetRemarksText('Rain delay', { sets })).toBe(`Rain delay\n\n${line}`)
    expect(sheetRemarksText(`Rain delay\n\n${line}`, { sets })).toBe(`Rain delay\n\n${line}`)
    expect(sheetRemarksText('', { sets })).toBe(line)
    expect(sheetRemarksText(' Rain delay ', { sets: [set(1, 21, 19)] })).toBe('Rain delay')
  })
})

describe('the score sheet and Match End', () => {
  let Sheet
  beforeAll(async () => {
    Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
  })

  it('the sheet\'s REMARKS say set 1 went past 44 (after the MTO line)', () => {
    const matchData = buildVideoMatch()
    // team A is team 2 in the video match
    matchData.sets[0] = { ...matchData.sets[0], team1Points: 44, team2Points: 46 }
    let fields = null
    render(<Sheet matchData={matchData} onDataReady={(f) => { fields = f }} />)
    cleanup()
    expect(fields.remarks).toMatch(/Start Time: 11:42:10, 3rd Set/)
    expect(fields.remarks.split('\n')).toContain('Set 1 continued beyond 44, final 46:44')
  })

  it('Match End reads the same REMARKS text', () => {
    const src = readFileSync(resolve(__dirname, '../../components_beach/MatchEnd_beach.jsx'), 'utf8')
    expect(src).toMatch(/remarks=\{sheetRemarksText\(match\?\.remarks \|\| '', \{ events, sets,/)
  })
})
