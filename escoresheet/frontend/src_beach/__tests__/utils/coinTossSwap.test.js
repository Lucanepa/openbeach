/**
 * "Swap team A ↔ B" (Scoreboard manual changes) only re-labels the teams:
 * the team that serves first is the same team before and after, both on this
 * device and in the cloud coin toss a restore, the referee, the livescore and
 * the PDF read back.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { swapTeamDesignation, coinTossCloud } from '../../utils_beach/coinToss_beach'

// what a restore makes of the cloud coin toss (backupManager_beach importMatch)
const restored = (coinToss) => ({
  coinTossTeamA: coinToss.team_a,
  coinTossTeamB: coinToss.team_b,
  coinTossServeA: coinToss.serve_a,
  firstServe: coinToss.first_serve
})
// the team serving first as the coin toss screen reads it back
const serverOfFlag = (m) => (m.coinTossServeA ? m.coinTossTeamA : m.coinTossTeamB)

describe('swapTeamDesignation (beach)', () => {
  it('swaps A and B so they stay two different teams', () => {
    const patch = swapTeamDesignation({ coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team1', coinTossServeA: true })
    expect(patch.coinTossTeamA).toBe('team2')
    expect(patch.coinTossTeamB).toBe('team1')
  })

  for (const firstServe of ['team1', 'team2']) {
    for (const teamA of ['team1', 'team2']) {
      it(`keeps ${firstServe} serving first (A was ${teamA}), here and in the cloud`, () => {
        const match = {
          coinTossTeamA: teamA,
          coinTossTeamB: teamA === 'team1' ? 'team2' : 'team1',
          firstServe,
          coinTossServeA: firstServe === teamA
        }
        const patch = swapTeamDesignation(match)
        const local = { ...match, ...patch }
        expect(local.firstServe).toBe(firstServe)
        expect(serverOfFlag(local)).toBe(firstServe)

        const cloud = coinTossCloud(local)
        expect(cloud.first_serve).toBe(firstServe)
        expect(cloud.serve_a).toBe(local.coinTossServeA)
        expect(cloud.team_a).toBe(local.coinTossTeamA)
        expect(cloud.team_b).toBe(local.coinTossTeamB)
        // a restore from the cloud row comes back with the scorer's first server
        const back = restored(cloud)
        expect(back.firstServe).toBe(firstServe)
        expect(serverOfFlag(back)).toBe(firstServe)
      })
    }
  }

  it('the old A-serves flag no longer decides the first server after a swap', () => {
    // team1 is A and serves: after the swap team1 is B and still serves
    const patch = swapTeamDesignation({ coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team1', coinTossServeA: true })
    expect(patch.coinTossServeA).toBe(false)
    expect(coinTossCloud({ ...patch }).first_serve).toBe('team1')
  })

  it('the B serve flag follows too: A and B never both serve (or both receive)', () => {
    for (const firstServe of ['team1', 'team2']) {
      for (const teamA of ['team1', 'team2']) {
        const teamB = teamA === 'team1' ? 'team2' : 'team1'
        const match = { coinTossTeamA: teamA, coinTossTeamB: teamB, firstServe, coinTossServeA: firstServe === teamA, coinTossServeB: firstServe === teamB }
        const local = { ...match, ...swapTeamDesignation(match) }
        expect(local.coinTossServeB).toBe(!local.coinTossServeA)
        // the coin toss screen reopens with the B flag for team B
        expect(local.coinTossServeB ? local.coinTossTeamB : local.coinTossTeamA).toBe(firstServe)
      }
    }
  })

  it('without firstServe, keeps the team the scoreboard plays first (team1) and writes it', () => {
    // the serve flag says team2 (A) but the scoreboard, with no firstServe,
    // has been playing team1 first: the swap must not change that mid-match
    const patch = swapTeamDesignation({ coinTossTeamA: 'team2', coinTossTeamB: 'team1', coinTossServeA: true })
    expect(patch.coinTossTeamA).toBe('team1')
    expect(patch.firstServe).toBe('team1')
    expect(patch.coinTossServeA).toBe(true)
    expect(patch.coinTossServeB).toBe(false)
    expect(coinTossCloud({ coinTossTeamA: 'team2', coinTossServeA: true }).first_serve).toBe('team1')
  })

  it('without a coin toss: team1 = A serving (the scoreboard defaults), then swapped', () => {
    const patch = swapTeamDesignation({})
    expect(patch.coinTossTeamA).toBe('team2')
    expect(patch.firstServe).toBe('team1')
    expect(patch.coinTossServeA).toBe(false)
  })

  it('the set 3 toss result (an A/B label) keeps naming the same team', () => {
    expect(swapTeamDesignation({ coinTossTeamA: 'team1', firstServe: 'team1', set3FirstServe: 'A' }).set3FirstServe).toBe('B')
    expect(swapTeamDesignation({ coinTossTeamA: 'team1', firstServe: 'team1', set3FirstServe: 'B' }).set3FirstServe).toBe('A')
    expect(swapTeamDesignation({ coinTossTeamA: 'team1', firstServe: 'team1' })).not.toHaveProperty('set3FirstServe')
  })

  it('leaves the court sides alone (only the first server is pinned)', () => {
    const patch = swapTeamDesignation({ coinTossTeamA: 'team1', firstServe: 'team1', setLeftTeamOverrides: { 1: 'B' }, set3LeftTeam: 'A' })
    expect(patch).not.toHaveProperty('setLeftTeamOverrides')
    expect(patch).not.toHaveProperty('set3LeftTeam')
  })
})

describe('Scoreboard "Swap team A ↔ B" writes one patch to both places', () => {
  const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
  const start = sb.indexOf('// Swap Team A and Team B identity')
  const handler = sb.slice(start, sb.indexOf("t('scoreboard.manual.switchAB')", start))

  it('stores the swap patch (first server and serve flag included) locally', () => {
    expect(start).toBeGreaterThan(-1)
    expect(handler).toContain('swapTeamDesignation(data.match)')
    expect(handler).toMatch(/db\.matches\.update\(matchId, patch\)/)
  })

  it('sends the cloud coin toss built from that same patch', () => {
    expect(handler).toMatch(/coin_toss: coinTossCloud\(\{ \.\.\.data\.match, \.\.\.patch \}\)/)
    expect(handler).not.toContain('currentServeA ? newTeamA : newTeamB')
  })
})
