import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'

// The bench tablet (MatchEntry) draws its own team's half court with the net
// on the side facing the other team: the side the scorer's court has it on.
// It had its own rule by the set number (set 1 A left, set 2 A right, set 3
// its toss side flipped by set3CourtSwitched, which nothing writes any more),
// so after every change of courts (every 7 points, 5 in set 3, and the TTO's)
// the bench showed its court mirrored. It now follows the live state's side_a
// and, without it, the scorer's rule (courtSides_beach leftTeamInSet).

let bundle = null
vi.mock('../../utils_beach/serverDataSync_beach', () => ({ getMatchData: vi.fn(async () => bundle) }))
vi.mock('../../hooks_beach/useRealtimeConnection_beach', () => ({ useRealtimeConnection: () => ({}) }))
vi.mock('../../db_beach/db_beach', () => ({ db: { matches: { get: vi.fn(async () => null), update: vi.fn(async () => 0) } } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d, o) => (typeof d === 'string' ? d : (o?.defaultValue || k)), i18n: { language: 'en' } }) }))

const { default: MatchEntry } = await import('../../components_beach/MatchEntry_beach.jsx')

// Team A is team1; the current set `index` under way
function benchBundle(index, match = {}, liveState = null) {
  const sets = []
  // the finished sets won in turn (1:1 before set 3)
  for (let i = 1; i < index; i++) sets.push({ index: i, team1Points: i % 2 ? 21 : 15, team2Points: i % 2 ? 15 : 21, finished: true })
  sets.push({ index, team1Points: 8, team2Points: 6, finished: false })
  return {
    success: true,
    match: { id: 'm1', status: 'live', coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team1', ...match },
    team1: { name: 'Müller/Weber', color: '#e2001a' },
    team2: { name: 'Schmidt/Fischer', color: '#3b82f6' },
    team1Players: [{ number: 1 }, { number: 2 }],
    team2Players: [{ number: 1 }, { number: 2 }],
    sets,
    events: [
      { type: 'lineup', setIndex: index, ts: 1, payload: { team: 'team1', lineup: { I: 1, II: 2 } } },
      { type: 'lineup', setIndex: index, ts: 1, payload: { team: 'team2', lineup: { I: 2, II: 1 } } }
    ],
    ...(liveState ? { liveState } : {})
  }
}

async function benchSide(team) {
  const { container } = render(<MatchEntry matchId="m1" team={team} onBack={() => {}} embedded />)
  await waitFor(() => expect(container.querySelector('.court-side')).not.toBeNull())
  const half = container.querySelector('.court-side')
  return half.classList.contains('court-side-left') ? 'left' : 'right'
}

async function sides(index, match, liveState) {
  bundle = benchBundle(index, match, liveState)
  const team1 = await benchSide('team1')
  cleanup()
  const team2 = await benchSide('team2')
  cleanup()
  return { team1, team2 }
}

describe('bench tablet: its team\'s side of the court is the scorer\'s', () => {
  beforeEach(() => { cleanup(); bundle = null })

  it('set 1: A on the left, and on the right after a change of courts (override B)', async () => {
    expect(await sides(1, {})).toEqual({ team1: 'left', team2: 'right' })
    expect(await sides(1, { setLeftTeamOverrides: { 1: 'B' } })).toEqual({ team1: 'right', team2: 'left' })
  })

  it('set 2 starts where set 1 finished (no change of courts between sets unless asked)', async () => {
    expect(await sides(2, { setLeftTeamOverrides: { 1: 'A' } })).toEqual({ team1: 'left', team2: 'right' })
    expect(await sides(2, { setLeftTeamOverrides: { 1: 'A', 2: 'B' } })).toEqual({ team1: 'right', team2: 'left' })
  })

  it('set 3: its toss side, then the change of courts at 5 (override)', async () => {
    expect(await sides(3, { set3LeftTeam: 'B' })).toEqual({ team1: 'right', team2: 'left' })
    expect(await sides(3, { set3LeftTeam: 'A', setLeftTeamOverrides: { 3: 'B' } })).toEqual({ team1: 'right', team2: 'left' })
  })

  it('team A is team2: the sides follow the teams', async () => {
    expect(await sides(1, { coinTossTeamA: 'team2', coinTossTeamB: 'team1', setLeftTeamOverrides: { 1: 'B' } }))
      .toEqual({ team1: 'left', team2: 'right' })
  })

  it('the live state\'s side_a (the scorer\'s court as it pushed it) wins', async () => {
    expect(await sides(2, {}, { side_a: 'right', current_set: 2 })).toEqual({ team1: 'right', team2: 'left' })
  })
})
