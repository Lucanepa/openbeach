// Laptop run of 2026-10-08 (OpenVolley OV-17, checked here in OpenBeach):
// closing a match (Match End > Close match) showed the home screen with the
// closed match's 'Continue match / Delete match' for one frame: App went
// home before its live queries had seen the delete. The home screen never
// shows the closed match now.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { waitFor, fireEvent } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep, track } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)

describe('App: closing a match', () => {
  it('goes from Match End to the home screen without the closed match, in one change', async () => {
    const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
    const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
    await db.players.bulkAdd([1, 2].flatMap(n => [
      { teamId: team1, number: n, firstName: 'A', lastName: `One${n}`, isCaptain: n === 1 },
      { teamId: team2, number: n, firstName: 'B', lastName: `Two${n}`, isCaptain: n === 1 }
    ]))
    const start = new Date(Date.now() - 3600000).toISOString()
    // an approved test match: Match End offers 'Close match'
    const matchId = await db.matches.add({
      team1Id: team1, team2Id: team2, status: 'ended', test: true, approved: true, approvedAt: start,
      createdAt: start, matchInfoConfirmedAt: start,
      coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
      firstServe: 'team1', team1CaptainSignature: 'x', team2CaptainSignature: 'x'
    })
    await db.sets.bulkAdd([1, 2].map(index => (
      { matchId, index, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start }
    )))
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })

    mountApp()
    await waitFor(() => expect(button('Continue match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(button('Close match')).toBeTruthy(), { timeout: 8000 })

    const { states, stop } = track(() => ({
      home: !!button('Restore match'),
      match: !!button('Continue match') || !!button('Delete match'),
      matchEnd: /Match complete/.test(document.body.textContent)
    }))
    fireEvent.click(button('Close match'))
    await waitFor(async () => expect(await db.matches.count()).toBe(0), { timeout: 8000 })
    await waitFor(() => expect(states.at(-1)?.home).toBe(true), { timeout: 8000 })
    await sleep(500)
    stop()

    expect(states.at(-1)).toEqual({ home: true, match: false, matchEnd: false })
    // never the home screen with the closed match on it, never an empty page
    expect(states.filter(s => s.home && s.match)).toEqual([])
    expect(states.filter(s => !s.home && !s.matchEnd)).toEqual([])
  }, 30000)
})
