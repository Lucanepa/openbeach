import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen } from '@testing-library/react'
import { dayLabel, dayTimeLabel, timeSecondsLabel } from '../../ui/volleyui/format.js'
import GameList from '../../components_beach/GameList_beach'

// Dates followed the browser locale: "07/10/2026, 11:53:00" under en-GB,
// "10/7/2026, 11:53:00 AM" under en-US. Day and month swapped between devices
// on the same court. Now the Zürich clock, day first, 24-hour, everywhere.

describe('Zürich clock', () => {
  it('seconds clock: 24-hour, Zürich time, whatever the device locale', () => {
    expect(timeSecondsLabel(new Date('2026-10-07T09:53:07Z'))).toBe('11:53:07')
    expect(timeSecondsLabel('2026-01-15T23:00:00Z')).toBe('00:00:00')
    expect(timeSecondsLabel('nonsense')).toBe('')
  })

  it('the scoring toolbar clock reads "07.10.2026 11:53:07"', () => {
    const d = new Date('2026-10-07T09:53:07Z')
    expect(`${dayLabel(d, { year: true })} ${timeSecondsLabel(d)}`).toBe('07.10.2026 11:53:07')
  })

  it('the livescore game list shows "15.06.2024 16:00"', () => {
    render(<GameList matches={[{ id: 1, team1Name: 'A', team2Name: 'B', scheduledAt: '2024-06-15T14:00:00Z', status: 'scheduled' }]} loading={false} onSelectMatch={() => {}} />)
    expect(screen.getByText(/15\.06\.2024 16:00/)).toBeInTheDocument()
    expect(dayTimeLabel('2024-06-15T14:00:00Z')).toBe('15.06.2024 16:00')
  })

  it('no toLocaleString / toLocaleTimeString left on these screens', () => {
    for (const f of ['Scoreboard_beach.jsx', 'GameList_beach.jsx', 'BackupTable_beach.jsx', 'Referee_beach.jsx']) {
      const src = readFileSync(resolve(__dirname, '../../components_beach', f), 'utf8')
      expect(src, f).not.toMatch(/\.toLocale(String|TimeString|DateString)\(/)
    }
  })
})
