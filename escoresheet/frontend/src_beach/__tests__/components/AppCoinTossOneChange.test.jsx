// Laptop run of 2026-10-08 (OB-3): confirming the coin toss swapped the
// button to 'Return to match' (the layout moved), showed 'Loading...' for
// ~290 ms, then the scoreboard. The coin toss stays now until the scoreboard
// replaces it, filled.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { waitFor, fireEvent } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep, track } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)

describe('App: confirming the coin toss', () => {
  it('goes from the coin toss to the filled scoreboard in one change', async () => {
    const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
    const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
    await db.players.bulkAdd([1, 2].flatMap(n => [
      { teamId: team1, number: n, firstName: 'A', lastName: `One${n}`, isCaptain: n === 1, dob: '01.02.1990' },
      { teamId: team2, number: n, firstName: 'B', lastName: `Two${n}`, isCaptain: n === 1, dob: '01.02.1990' }
    ]))
    const now = new Date().toISOString()
    await db.matches.add({
      team1Id: team1, team2Id: team2, status: 'scheduled', test: true, createdAt: now, matchInfoConfirmedAt: now,
      hall: 'Beach', city: 'City', league: 'League', scheduledAt: now, coinTossConfirmed: false,
      team1CaptainSignature: 'xxxxx', team2CaptainSignature: 'xxxxx'
    })

    mountApp()
    await waitFor(() => expect(button('Continue match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(button('Confirm the coin toss')).toBeTruthy(), { timeout: 8000 })

    const { states, stop } = track(() => {
      const text = document.body.textContent
      return {
        confirm: !!button('Confirm the coin toss', { enabled: false }),
        returnToMatch: !!button('Return to match', { enabled: false }),
        loading: /Loading(\.\.\.|…)/.test(text),
        scoreboard: /Last action/.test(text) && !!button('Start set', { enabled: false })
      }
    })
    fireEvent.click(button('Confirm the coin toss'))
    await waitFor(() => expect(states.at(-1)?.scoreboard).toBe(true), { timeout: 15000 })
    await sleep(500)
    stop()

    expect(states.at(-1)).toMatchObject({ scoreboard: true, loading: false })
    // the coin toss keeps its button; then the scoreboard, never 'Loading...' between
    expect(states.filter(s => s.returnToMatch)).toEqual([])
    expect(states.filter(s => s.loading)).toEqual([])
    expect(states.filter(s => !s.confirm && !s.scoreboard)).toEqual([])
  }, 30000)
})
