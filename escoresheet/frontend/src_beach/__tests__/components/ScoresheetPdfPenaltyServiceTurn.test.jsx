// The PDF score sheet's service boxes (I to IV) when a penalty ends a
// service turn.
//
// A penalty (a player's misconduct penalty, a team's delay penalty) against
// the serving team gives the opponent the point AND the serve: the scorer's
// rotation counts the turn as lost. The sheet skipped every penalty point
// ("they happen between rallies, no service change"), so the penalised
// server's box got no score and its row's column did not move: the next
// rally_start moved the server on and the lost turn was never written. The
// rows slid, I II III IV read 1, 1, 4, 2 (stress test 2026-10-25, preview and
// approved PDF). It also took the serving team from the last rally_start,
// which right after a side-out is the other team's.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

let Sheet
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
})

function fill(matchData) {
  let fields = null
  render(<Sheet matchData={matchData} onDataReady={(f) => { fields = f }} />)
  cleanup()
  if (!fields) throw new Error('the sheet never reported its fields')
  return fields
}

// team1 is A and serves first: I = A #1, II = B #1, III = A #2, IV = B #2
const A = 'team1'
const B = 'team2'

// Set 1 played rally by rally: `steps` are 'A' / 'B' (the rally's winner),
// or a sanction on a team ({ team, type, playerNumber }); a penalty gives the
// opponent the point, and the serve when the sanctioned team served (the
// scorer's rotation)
function buildMatch(steps) {
  let seq = 0
  let clock = 0
  const events = []
  const ev = (type, payload) => {
    seq += 1
    clock += 15000
    events.push({ id: seq, seq, type, payload, setIndex: 1, ts: new Date(Date.UTC(2026, 9, 25, 9, 0, 0) + clock).toISOString() })
  }
  ev('coin_toss', { teamA: A, teamB: B, firstServe: A, coinTossWinner: A })
  ev('set_start', { setIndex: 1 })
  const score = { team1: 0, team2: 0 }
  let serving = A
  const turns = { [A]: 1, [B]: 0 }
  const server = (team) => (turns[team] % 2 === 1 ? 1 : 2)
  const point = (team, payload = {}) => {
    score[team] += 1
    ev('point', { team, score: { ...score }, ...payload })
    if (team !== serving) {
      serving = team
      turns[team] += 1
    }
  }
  for (const step of steps) {
    if (typeof step === 'object') {
      ev('sanction', step)
      if (step.type === 'penalty' || step.type === 'delay_penalty') point(step.team === A ? B : A, { fromPenalty: true })
      continue
    }
    ev('rally_start', { servingTeam: serving, servingPlayerNumber: server(serving) })
    point(step === 'A' ? A : B)
  }
  const match = {
    id: 7,
    scheduledAt: '2026-10-25T09:00:00.000Z',
    coinTossConfirmed: true,
    coinTossTeamA: A,
    coinTossTeamB: B,
    coinTossWinner: A,
    firstServe: A,
    coinTossData: { coinTossWinner: A, teamA: A, teamB: B }
  }
  return {
    match,
    team_1Team: { id: 1, name: 'Alpha / Beta' },
    team_2Team: { id: 2, name: 'Gamma / Delta' },
    team_1Players: [{ id: 1, teamId: 1, number: 1, lastName: 'Alpha' }, { id: 2, teamId: 1, number: 2, lastName: 'Beta' }],
    team_2Players: [{ id: 3, teamId: 2, number: 1, lastName: 'Gamma' }, { id: 4, teamId: 2, number: 2, lastName: 'Delta' }],
    sets: [{
      id: 1, matchId: 7, index: 1, team1Points: score.team1, team2Points: score.team2, finished: false,
      startTime: '2026-10-25T09:00:00.000Z',
      serviceOrder: { team1_player1: 1, team2_player1: 2, team1_player2: 3, team2_player2: 4 }
    }],
    events
  }
}

// The scores written in a row's service boxes, in order
const boxes = (f, row) => Array.from({ length: 21 }, (_, i) => f[`s1_${row}_pt_${i + 1}`]).filter(v => v !== undefined && v !== '')

describe('score sheet PDF: a penalty against the serving team ends its service turn', () => {
  it('right after a side-out (a player penalty) and mid-turn (a delay penalty)', () => {
    const f = fill(buildMatch([
      'A', // 1:0, I serving
      'B', // 1:1, I loses its serve at A 1
      'A', // 2:1, II loses its serve at B 1; III (A #2) serves next
      { team: A, type: 'penalty', playerNumber: 2, playerType: 'player' }, // 2:2, III's turn lost at A 2, no rally in it
      'A', // 3:2, IV loses its serve at B 2; I serves
      'A', 'A', // 5:2
      { team: A, type: 'delay_warning' },
      { team: A, type: 'delay_penalty' }, // 5:3, I's turn lost at A 5
      'B', // 5:4, II serving
      'A', // 6:4, II loses its serve at B 4
      'B', // 6:5, III loses its serve at A 6
      // a penalty against the receiving team: a point for the server, no change
      { team: A, type: 'delay_penalty' }, // 6:6, IV still serving
      'A' // 7:6, IV loses its serve at B 6
    ]))
    expect(boxes(f, 'r1')).toEqual(['1', '5'])
    expect(boxes(f, 'r2')).toEqual(['1', '4'])
    expect(boxes(f, 'r3')).toEqual(['2', '6'])
    expect(boxes(f, 'r4')).toEqual(['2', '6'])
  })
})
