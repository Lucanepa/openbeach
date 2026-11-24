// The PDF score sheet across the changes of courts: sets 1-2 through 21 (the
// TTO, whose change of courts is recorded on the technical_to event, not as a
// court_switch) and on to the changes at 28 and 35, sanctions after 21, and
// set 3 (changes every 5 points, no TTO). Every box of the sheet is placed by
// team (A/B, team1/team2, the first-serving team up), never by court side, so
// the TTO's change of courts must not move anything.
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

// team2 is A (coin toss), team1 is B: keys and letters differ on purpose
const A = 'team2'
const B = 'team1'

/**
 * One match. `tto`: how set n's TTO records its change of courts:
 * 'flag' (courtSwitched: true, the current scorer), 'old' (preSwitchOverrides
 * only, logged before the flag) or 'withSwitch' (an old one followed by a
 * court_switch at 21 as well). `log` has the score (A:B) of every change of
 * courts, TTO and sanction, as the scorer saw it.
 */
function buildMatch({ tto = { 1: 'flag', 2: 'old' } } = {}) {
  let seq = 0
  let clock = 0
  const events = []
  const log = []
  const ev = (type, payload, setIndex) => {
    seq += 1
    clock += 15000
    const e = { id: seq, seq, type, payload, setIndex, ts: new Date(Date.UTC(2026, 9, 8, 9, 0, 0) + clock).toISOString() }
    events.push(e)
    return e
  }
  ev('coin_toss', { teamA: A, teamB: B, firstServe: A, coinTossWinner: A }, 1)

  // winners: 'A' | 'B' per rally, until the set is won; extras[n]: events
  // logged once n rallies are played (before the next one)
  const playSet = (setIndex, firstServer, winners, extras = {}) => {
    const interval = setIndex === 3 ? 5 : 7
    const score = { team1: 0, team2: 0 }
    let serving = firstServer
    const server = { team1: 1, team2: 1 }
    let left = 'A'
    let over = false
    const at = (kind, extra = {}) => log.push({ set: setIndex, kind, a: score[A], b: score[B], total: score.team1 + score.team2, ...extra })
    ev('set_start', { setIndex }, setIndex)
    const point = (team, payload = {}) => {
      score[team] += 1
      ev('point', { team, ...payload }, setIndex)
      if (team !== serving) {
        server[team] = server[team] === 1 ? 2 : 1
        serving = team
      }
      const t = score.team1 + score.team2
      over = Math.max(score.team1, score.team2) >= (setIndex === 3 ? 15 : 21) && Math.abs(score.team1 - score.team2) >= 2
      if (over || t % interval !== 0) return
      const pre = { [setIndex]: left }
      left = left === 'A' ? 'B' : 'A'
      if (setIndex !== 3 && t === 21) {
        const kind = tto[setIndex]
        const payload = kind === 'flag' ? { preSwitchOverrides: pre, courtSwitched: true } : { preSwitchOverrides: pre }
        ev('technical_to', payload, setIndex)
        if (kind === 'withSwitch') ev('court_switch', { score: { ...score }, preSwitchOverrides: pre, afterTTO: true }, setIndex)
        at('tto')
      } else {
        ev('court_switch', { score: { ...score }, preSwitchOverrides: pre }, setIndex)
        at('switch')
      }
    }
    winners.split('').forEach((w, i) => {
      if (over) return
      for (const x of extras[i] || []) {
        ev('sanction', x, setIndex)
        at('sanction', { team: x.team, type: x.type })
        if (x.type === 'penalty' || x.type === 'delay_penalty') point(x.team === A ? B : A, { fromPenalty: true })
      }
      if (over) return
      ev('rally_start', { servingTeam: serving, servingPlayerNumber: server[serving] }, setIndex)
      point(w === 'A' ? A : B)
    })
    ev('set_end', { setIndex }, setIndex)
    return score
  }

  // set 1, A wins past 40 points (changes at 7, 14, TTO 21, 28, 35, 42).
  // After 21: A's delay warning, B #2's penalty, A's delay penalty, A #1's
  // formal warning.
  const s1 = playSet(1, A, 'AB'.repeat(21) + 'AAAA', {
    23: [{ team: A, type: 'delay_warning' }],
    29: [{ team: B, type: 'penalty', playerNumber: 2, playerType: 'player' }],
    35: [{ team: A, type: 'delay_penalty' }],
    38: [{ team: A, type: 'warning', playerNumber: 1, playerType: 'player' }]
  })
  // set 2, B wins (changes at 7, 14, TTO 21, 28, 35); B's delay warning after 21
  const s2 = playSet(2, B, 'BA'.repeat(15) + 'BBBBBB', {
    22: [{ team: B, type: 'delay_warning' }]
  })
  // set 3, A wins (changes every 5); B's delay warning, A #2's penalty
  const s3 = playSet(3, B, 'AB'.repeat(12) + 'AAAA', {
    11: [{ team: B, type: 'delay_warning' }],
    17: [{ team: A, type: 'penalty', playerNumber: 2, playerType: 'player' }]
  })

  const sets = [s1, s2, s3].map((s, i) => ({
    id: i + 1, matchId: 9, index: i + 1, team1Points: s.team1, team2Points: s.team2, finished: true,
    startTime: `2026-10-08T0${9 + i}:00:00.000Z`, endTime: `2026-10-08T0${9 + i}:30:00.000Z`
  }))
  const match = {
    id: 9,
    scheduledAt: '2026-10-08T09:00:00.000Z',
    coinTossConfirmed: true,
    coinTossTeamA: A,
    coinTossTeamB: B,
    coinTossWinner: A,
    firstServe: A,
    coinTossData: { coinTossWinner: A, teamA: A, teamB: B }
  }
  return {
    log,
    matchData: {
      match,
      team_1Team: { id: 1, name: 'Bravo / Beta' },
      team_2Team: { id: 2, name: 'Alpha / Alfa' },
      team_1Players: [{ id: 1, teamId: 1, number: 1, lastName: 'Bravo' }, { id: 2, teamId: 1, number: 2, lastName: 'Beta' }],
      team_2Players: [{ id: 3, teamId: 2, number: 1, lastName: 'Alpha' }, { id: 4, teamId: 2, number: 2, lastName: 'Alfa' }],
      sets,
      events
    }
  }
}

const pair = (f, key) => [f[`${key}_a`], f[`${key}_b`]]
const str = (...xs) => xs.map(String)
// the row of the change-of-courts table: sets 1-2 every 7 points with the
// TTO's row 2 at 21, set 3 every 5 points
const csRow = (set, total) => (set === 3 ? total / 5 : total / 7) - 1
// a sanction's score: the sanctioned team's first
const sanctionScore = (x) => (x.team === A ? str(x.a, x.b) : str(x.b, x.a))
const sanction = (log, set, team, type) => log.find(x => x.kind === 'sanction' && x.set === set && x.team === team && x.type === type)
// the player's row in set `set`: the first-serving team has rows I and III,
// the other II and IV, in their service order
const playerRow = (f, set, up, team, number) =>
  (team === up ? ['r1', 'r3'] : ['r2', 'r4']).find(r => f[`s${set}_${r}_player`] === String(number))

describe('score sheet PDF: the changes of courts and the TTO', () => {
  it('the fixture: sets 1-2 past 35 points with the TTO at 21, set 3 past 25, sanctions after 21', () => {
    const { log, matchData } = buildMatch()
    const totals = (set, kind) => log.filter(x => x.set === set && x.kind === kind).map(x => x.total)
    expect(totals(1, 'switch')).toEqual([7, 14, 28, 35, 42])
    expect(totals(1, 'tto')).toEqual([21])
    expect(totals(2, 'switch')).toEqual([7, 14, 28, 35])
    expect(totals(2, 'tto')).toEqual([21])
    expect(totals(3, 'switch')).toEqual([5, 10, 15, 20, 25])
    expect(totals(3, 'tto')).toEqual([])
    expect(log.filter(x => x.kind === 'sanction' && x.set < 3).every(x => x.total > 21)).toBe(true)
    const [s1, s2, s3] = matchData.sets
    expect(s1.team2Points).toBeGreaterThan(s1.team1Points)
    expect(s2.team1Points).toBeGreaterThan(s2.team2Points)
    expect(s3.team2Points).toBeGreaterThan(s3.team1Points)
  })

  for (const [name, tto] of [
    ['the TTO with its "change made" flag (set 1), one logged before it (set 2)', { 1: 'flag', 2: 'old' }],
    ['a TTO followed by a court_switch at 21 too (an old scorer)', { 1: 'withSwitch', 2: 'withSwitch' }]
  ]) {
    describe(name, () => {
      it('every change of courts and the TTO fill their own row once, A left, B right', () => {
        const { log, matchData } = buildMatch({ tto })
        const f = fill(matchData)
        for (const set of [1, 2, 3]) {
          const changes = log.filter(x => x.set === set && (x.kind === 'switch' || x.kind === 'tto'))
          for (const x of changes) expect([set, x.total, pair(f, `s${set}_cs_${csRow(set, x.total)}`)]).toEqual([set, x.total, str(x.a, x.b)])
          const rows = Array.from({ length: 12 }, (_, i) => f[`s${set}_cs_${i}_a`]).filter(v => v !== undefined)
          expect(rows).toHaveLength(changes.length)
        }
      })

      it('set 1: the sanctions after the TTO are the sanctioned team\'s, its score first', () => {
        const { log, matchData } = buildMatch({ tto })
        const f = fill(matchData)
        // delay boxes: t1 = team1 (B), t2 = team2 (A)
        expect(pair(f, 's1_t2_ds_w')).toEqual(sanctionScore(sanction(log, 1, A, 'delay_warning')))
        expect(f.s1_t1_ds_w_a).toBeUndefined()
        expect(pair(f, 's1_t2_ds_p1')).toEqual(sanctionScore(sanction(log, 1, A, 'delay_penalty')))
        expect(f.s1_t1_ds_p1_a).toBeUndefined()
        // A serves first in set 1
        expect(pair(f, `s1_${playerRow(f, 1, A, B, 2)}_s1`)).toEqual(sanctionScore(sanction(log, 1, B, 'penalty')))
        expect(pair(f, `s1_${playerRow(f, 1, A, A, 1)}_fw`)).toEqual(sanctionScore(sanction(log, 1, A, 'warning')))
      })

      it('set 2: B\'s delay warning after the TTO', () => {
        const { log, matchData } = buildMatch({ tto })
        const f = fill(matchData)
        expect(pair(f, 's2_t1_ds_w')).toEqual(sanctionScore(sanction(log, 2, B, 'delay_warning')))
        expect(f.s2_t2_ds_w_a).toBeUndefined()
      })

      it('set 3 (no TTO): its sanctions', () => {
        const { log, matchData } = buildMatch({ tto })
        const f = fill(matchData)
        expect(pair(f, 's3_t1_ds_w')).toEqual(sanctionScore(sanction(log, 3, B, 'delay_warning')))
        // B serves first in set 3
        expect(pair(f, `s3_${playerRow(f, 3, B, A, 2)}_s1`)).toEqual(sanctionScore(sanction(log, 3, A, 'penalty')))
      })
    })
  }
})
