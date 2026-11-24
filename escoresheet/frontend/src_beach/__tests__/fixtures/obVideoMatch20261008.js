// The match of the OpenBeach screencast of 2026-10-08, as the match end page
// hands it to the scoresheet window (sessionStorage 'scoresheetData').
//
// team1 Müller / Weber (B), team2 Schmidt / Fischer (A, coin toss winner),
// both CHE, both pairs numbered 1 and 2. Sets A:B 16:21, 21:19, 15:12.
// Set 2: A delay warning, B #1 formal warning. Set 3: team1 (B) serves
// first; B's time-out at B 3 : A 7; B #2's penalty at B 5 : A 7 (the point
// goes to A); B #2 Weber's MTO at B 6 : A 9 (3:12, recovered).
// Set 1 starts at the scheduled date (2025), as the old default stored it.

const TEAM1 = 'team1' // Müller / Weber, B
const TEAM2 = 'team2' // Schmidt / Fischer, A

let seq = 0
let clock = 0
function makeEvent(type, payload, setIndex) {
  seq += 1
  clock += 20000
  return { id: seq, seq, type, payload, setIndex, ts: new Date(Date.UTC(2026, 9, 8, 9, 0, 0) + clock).toISOString() }
}

// Plays one set: `script` is a list of rally winners ('A' | 'B') and extra
// events ({ before: rallyNumber, ... }) logged before that rally.
function playSet(events, setIndex, firstServer, winners, extras = []) {
  const keyOf = (l) => (l === 'A' ? TEAM2 : TEAM1)
  const nextServer = { [TEAM1]: 1, [TEAM2]: 1 }
  let serving = firstServer
  let lastServer = { [TEAM1]: null, [TEAM2]: null }
  const score = { [TEAM1]: 0, [TEAM2]: 0 }
  events.push(makeEvent('set_start', { setIndex }, setIndex))
  winners.forEach((w, i) => {
    for (const x of extras.filter(e => e.before === i)) {
      const payload = typeof x.payload === 'function' ? x.payload(score) : x.payload
      events.push(makeEvent(x.type, payload, setIndex))
      if (x.pointTo) {
        score[keyOf(x.pointTo)] += 1
        events.push(makeEvent('point', { team: keyOf(x.pointTo), fromPenalty: true }, setIndex))
        serving = keyOf(x.pointTo)
      }
    }
    // the serving team's server: the same player until the team loses the serve
    if (lastServer[serving] == null) lastServer[serving] = nextServer[serving]
    events.push(makeEvent('rally_start', { servingTeam: serving, servingPlayerNumber: lastServer[serving] }, setIndex))
    const winner = keyOf(w)
    score[winner] += 1
    events.push(makeEvent('point', { team: winner }, setIndex))
    if (winner !== serving) {
      // side out: the winner serves with its other player next time
      const prev = lastServer[winner]
      lastServer[winner] = prev == null ? nextServer[winner] : (prev === 1 ? 2 : 1)
      serving = winner
    }
  })
  events.push(makeEvent('set_end', { setIndex }, setIndex))
  return score
}

const seqOf = (s) => s.split('').filter(c => c === 'A' || c === 'B')

export function buildVideoMatch() {
  seq = 0
  clock = 0
  const events = []
  events.push(makeEvent('coin_toss', { teamA: TEAM2, teamB: TEAM1, firstServe: TEAM2, coinTossWinner: TEAM2 }, 1))

  // set 1: A 16, B 21
  const s1 = playSet(events, 1, TEAM2, seqOf('AB'.repeat(16) + 'BBBBB'))
  // set 2: A 21, B 19; A delay warning at 2:3, B #1 formal warning at 10:10
  const s2 = playSet(events, 2, TEAM1, seqOf('BA'.repeat(19) + 'AA'), [
    { before: 5, type: 'sanction', payload: { team: TEAM2, type: 'delay_warning' } },
    { before: 20, type: 'sanction', payload: { team: TEAM1, type: 'warning', playerNumber: 1, playerType: 'player' } }
  ])
  // set 3: B serves first. A 7 : B 3 -> B time-out; B 5 : A 7 -> B #2 penalty
  // (point A); B 6 : A 9 -> MTO B #2 Weber
  let mtoSeq = null
  const s3Winners = seqOf('AABAAABAAB' + 'BB' + 'BA' + 'BABABABABAB' + 'A')
  const s3 = playSet(events, 3, TEAM1, s3Winners, [
    { before: 10, type: 'timeout', payload: { team: TEAM1 } },
    { before: 12, type: 'sanction', payload: { team: TEAM1, type: 'penalty', playerNumber: 2, playerType: 'player' }, pointTo: 'A' },
    { before: 14, type: 'mto', payload: (score) => ({ team: TEAM1, playerNumber: 2, playerName: 'Weber', startTime: '2026-10-08T09:42:10.000Z', team1Points: score[TEAM1], team2Points: score[TEAM2], servingTeam: TEAM2 }) }
  ])
  const mto = events.find(e => e.type === 'mto')
  mtoSeq = mto.seq
  // the end, right after its start
  const endEvent = { ...makeEvent('medical_end', { kind: 'mto', startSeq: mtoSeq, team: TEAM1, playerNumber: 2, playerName: 'Weber', startTime: '2026-10-08T09:42:10.000Z', endTime: '2026-10-08T09:45:22.000Z', duration: 192, outcome: 'recovered' }, 3), seq: mto.seq + 0.5, ts: mto.ts }
  events.splice(events.indexOf(mto) + 1, 0, endEvent)

  const sets = [
    { id: 1, matchId: 7, index: 1, team1Points: s1[TEAM1], team2Points: s1[TEAM2], finished: true, startTime: '2025-03-12T11:30:00.000Z', endTime: '2026-10-08T09:13:00.000Z' },
    { id: 2, matchId: 7, index: 2, team1Points: s2[TEAM1], team2Points: s2[TEAM2], finished: true, startTime: '2026-10-08T09:16:00.000Z', endTime: '2026-10-08T09:31:00.000Z' },
    { id: 3, matchId: 7, index: 3, team1Points: s3[TEAM1], team2Points: s3[TEAM2], finished: true, startTime: '2026-10-08T09:34:00.000Z', endTime: '2026-10-08T09:50:00.000Z' }
  ]

  const team1Players = [
    { id: 1, teamId: 1, number: 1, firstName: 'anna', lastName: 'müller', isCaptain: true },
    { id: 2, teamId: 1, number: 2, firstName: 'lea', lastName: 'Weber' }
  ]
  const team2Players = [
    { id: 3, teamId: 2, number: 1, firstName: 'Sara', lastName: 'Schmidt', isCaptain: true },
    { id: 4, teamId: 2, number: 2, firstName: 'Mia', lastName: 'Fischer' }
  ]
  const match = {
    id: 7,
    scheduledAt: '2025-03-12T11:30:00.000Z',
    eventName: 'Swiss Beach Tour',
    site: 'Zürich',
    coinTossConfirmed: true,
    coinTossTeamA: TEAM2,
    coinTossTeamB: TEAM1,
    coinTossWinner: TEAM2,
    firstServe: TEAM2,
    team1Country: 'CHE',
    team2Country: 'CHE',
    team1Color: '#111111',
    team2Color: '#facc15',
    team_1Country: 'CHE',
    team_2Country: 'CHE',
    coinTossData: { coinTossWinner: TEAM2, teamA: TEAM2, teamB: TEAM1 }
  }
  return {
    match,
    // the auto name with the country baked in, as the old roster setup made it
    team_1Team: { id: 1, name: 'Müller/Weber (CHE)', country: 'CHE' },
    team_2Team: { id: 2, name: 'Schmidt / Fischer', country: 'CHE' },
    team_1Players: team1Players,
    team_2Players: team2Players,
    sets,
    events
  }
}
