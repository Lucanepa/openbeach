// Laptop run of 2026-10-08 (OpenVolley OV-14, checked here in OpenBeach):
// confirming the match end showed the scoreboard's 'Loading...' and then an
// empty page before Match End: the scoreboard cleared its set-end progress
// screen before App had switched, and Match End rendered nothing until it
// had read the match. The progress screen stays now until Match End
// replaces it, filled.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { waitFor, fireEvent } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, sleep, track } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)

describe('App: the match end', () => {
  it('goes from the set-end progress screen to the filled Match End in one change', async () => {
    const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
    const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
    await db.players.bulkAdd([1, 2].flatMap(n => [
      { teamId: team1, number: n, firstName: 'A', lastName: `One${n}`, isCaptain: n === 1 },
      { teamId: team2, number: n, firstName: 'B', lastName: `Two${n}`, isCaptain: n === 1 }
    ]))
    const start = new Date(Date.now() - 3600000).toISOString()
    const matchId = await db.matches.add({
      team1Id: team1, team2Id: team2, status: 'live', test: true, createdAt: start,
      coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
      firstServe: 'team1', team1CaptainSignature: 'x', team2CaptainSignature: 'x'
    })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start },
      // the match point is on the score: the scoreboard asks for the match end
      { matchId, index: 2, team1Points: 21, team2Points: 15, finished: false, startTime: start }
    ])
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })

    mountApp() // opens the live match (App restores it)
    const dialog = () => [...document.querySelectorAll('[role=dialog]')].find(d => /won the Match/.test(d.textContent))
    await waitFor(() => expect(dialog()).toBeTruthy(), { timeout: 8000 })

    const { states, stop } = track(() => {
      const text = document.body.textContent
      return {
        dialog: !!dialog(),
        progress: (text.match(/(Finishing|Saving|Syncing|Uploading|Downloading|Loading)[^.…]{0,30}(\.\.\.|…)/) || [])[0] || null,
        matchEnd: /Match complete/.test(text) && /Results/.test(text)
      }
    })
    fireEvent.click([...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirm'))
    await waitFor(() => expect(states.at(-1)?.matchEnd).toBe(true), { timeout: 8000 })
    await sleep(500)
    stop()

    expect(states.at(-1)).toEqual({ dialog: false, progress: null, matchEnd: true })
    // the dialog, the set-end progress, Match End: never the generic
    // 'Loading...', never a page with none of them
    expect(states.filter(s => /^Loading/.test(s.progress || ''))).toEqual([])
    expect(states.filter(s => !s.dialog && !s.progress && !s.matchEnd)).toEqual([])
  }, 30000)
})
