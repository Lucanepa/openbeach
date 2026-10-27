// The PDF sheet's RESULTS box with long pair names ("Schneider-Ammann /
// Vonlanthen-Bürgisser"): the A / B name cells hold the name on one line, and
// a flex item is at least as wide as its content unless its min-width is 0.
// The column of the table grew wider than the box: the vertical RESULTS
// column shrank to nothing, B's time-outs, the ending time and the winner's
// "2:0" were cut off the official sheet (stress test 2026-10-25). The table
// column and the name cells may now shrink (min-w-0; the names end in "...").
// jsdom has no layout: the classes that allow it are what is checked here;
// the stress run checked the printed PDF.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

let Sheet
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
})

const LONG_A = 'Schneider-Ammann / Vonlanthen-Bürgisser'
const LONG_B = 'Hadjigeorgiou-Papadopoulos / De la Fuente'

describe('score sheet PDF: RESULTS with long pair names', () => {
  it('the table column and its name cells may shrink, the RESULTS column keeps its width', () => {
    render(<Sheet matchData={{
      match: { id: 7, scheduledAt: '2026-10-25T09:00:00.000Z', coinTossTeamA: 'team1', coinTossTeamB: 'team2', game_n: 3 },
      team_1Team: { id: 1, name: LONG_A },
      team_2Team: { id: 2, name: LONG_B },
      team_1Players: [], team_2Players: [], sets: [], events: []
    }} />)
    const results = [...document.querySelectorAll('span')].find(el => el.textContent === 'RESULTS')
    const column = results.parentElement
    const table = column.nextElementSibling
    expect(column.className).toMatch(/\bw-8\b/)
    expect(table.className.split(' ')).toContain('min-w-0')
    const labels = table.firstElementChild.children
    expect(labels[0].className.split(' ')).toContain('min-w-0')
    expect(labels[2].className.split(' ')).toContain('min-w-0')
    cleanup()
  })
})
