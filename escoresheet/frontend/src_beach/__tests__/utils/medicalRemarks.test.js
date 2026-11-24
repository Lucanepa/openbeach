// MTO / RIT on the score sheet (FIVB beach 17.1.2, 26.2.2.7). OpenBeach video
// 2026-10-08 06:20-07:40: the scoreboard's mto / rit events never reached the
// sheet's Medical Assistance chart or its remarks ("No remarks").
import { describe, it, expect } from 'vitest'
import {
  collectMedicalCases, formatMedicalRemark, medicalRemarkLines, remarksWithMedical,
  medicalChartMarks, medicalChartType, durationText
} from '../../utils_beach/medicalRemarks_beach'

const at = (h, m, s = 0) => new Date(2026, 9, 8, h, m, s).toISOString()
let seq = 0
const ev = (type, payload, extra = {}) => ({ type, payload, setIndex: 3, seq: ++seq, ts: extra.ts || at(11, 40), ...extra })

function set3Events() {
  seq = 0
  // set 3: team2 (B) leads 7:5 when B #2 Weber takes an MTO
  const list = [ev('set_start', {})]
  const points = ['team1', 'team2', 'team2', 'team1', 'team2', 'team1', 'team2', 'team1', 'team2', 'team2', 'team2', 'team1']
  for (const team of points) {
    list.push(ev('rally_start', { servingTeam: 'team1' }))
    list.push(ev('point', { team }))
  }
  return list
}

const ctx = { teamAKey: 'team1', teamNames: { team1: 'Müller / Weber', team2: 'Schmidt / Fischer' } }

describe('collectMedicalCases', () => {
  it('pairs the contract start (mto) with its medical_end by startSeq', () => {
    const events = set3Events()
    const start = ev('mto', { team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: at(11, 42, 10), team1Points: 5, team2Points: 7, servingTeam: 'team2' })
    events.push(start)
    events.push(ev('medical_end', { kind: 'mto', startSeq: start.seq, team: 'team2', playerNumber: 2, startTime: at(11, 42, 10), endTime: at(11, 45, 22), duration: 192, outcome: 'recovered' }))
    const [c] = collectMedicalCases(events)
    expect(c).toMatchObject({ kind: 'mto', chartType: 'mto_blood', team: 'team2', playerNumber: 2, playerName: 'Weber', setIndex: 3, durationSec: 192, outcome: 'recovered', team1Points: 5, team2Points: 7, servingTeam: 'team2' })
    expect(c.endTime).toBe(at(11, 45, 22))
  })

  it('works out the score and the server from the set when the start has none', () => {
    const events = set3Events() // team1 5, team2 7, team1 won the last rally
    events.push(ev('rit', { team: 'team1', playerNumber: 1, ritType: 'toilet', startTime: at(11, 50) }))
    const [c] = collectMedicalCases(events)
    expect(c).toMatchObject({ chartType: 'rit_toilet', team1Points: 5, team2Points: 7, servingTeam: 'team1', endTime: null, durationSec: null })
  })

  it('reads the older shapes: an end written into the start, and mto_rit / mto_rit_recovery', () => {
    seq = 0
    const old = ev('mto', { team: 'team1', playerNumber: 1, startTime: at(10, 0), endTime: at(10, 4), duration: 240, outcome: 'forfeit' }, { setIndex: 1 })
    const legacy = ev('mto_rit', { team: 'team2', playerNumber: 1, type: 'rit_weather' }, { setIndex: 2, ts: at(10, 30) })
    const legacyEnd = ev('mto_rit_recovery', { team: 'team2', playerNumber: 1, type: 'rit_weather', duration: 61 }, { setIndex: 2, ts: at(10, 31, 1) })
    const cases = collectMedicalCases([old, legacy, legacyEnd])
    expect(cases).toHaveLength(2)
    expect(cases[0]).toMatchObject({ chartType: 'mto_blood', durationSec: 240, outcome: 'forfeit' })
    expect(cases[1]).toMatchObject({ chartType: 'rit_weather', durationSec: 61, endTime: at(10, 31, 1) })
  })

  it('ignores remarks and other events, and the same player in the other team', () => {
    seq = 0
    const a = ev('mto', { team: 'team1', playerNumber: 2, startTime: at(9, 0) })
    const b = ev('medical_end', { kind: 'mto', team: 'team2', playerNumber: 2, endTime: at(9, 3) })
    const cases = collectMedicalCases([a, b, ev('remark', { text: 'x' })])
    expect(cases).toHaveLength(1)
    expect(cases[0].endTime).toBeNull()
  })

  it('maps the RIT types to the chart columns', () => {
    expect(medicalChartType({ type: 'rit', payload: { ritType: 'no_blood' } })).toBe('rit_no_blood')
    expect(medicalChartType({ type: 'rit', payload: { ritType: 'weather' } })).toBe('rit_weather')
    expect(medicalChartType({ type: 'mto', payload: {} })).toBe('mto_blood')
    expect(medicalChartType({ type: 'remark', payload: {} })).toBeNull()
  })
})

describe('the remarks lines', () => {
  it('start, set, score (the player\'s team first), server, player and team, type, end, duration, outcome', () => {
    const events = set3Events()
    const start = ev('mto', { team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: at(11, 42, 10), team1Points: 5, team2Points: 7, servingTeam: 'team2' })
    events.push(start, ev('medical_end', { kind: 'mto', startSeq: start.seq, team: 'team2', playerNumber: 2, endTime: at(11, 45, 22), duration: 192, outcome: 'recovered' }))
    expect(medicalRemarkLines(events, ctx)).toEqual([
      '* Start Time: 11:42:10, 3rd Set, Score: 7:5, Team B Serving, Player: #2 Weber, Team B (Schmidt / Fischer), "Medical Time Out" (Blood), End Time: 11:45:22, Duration: 00:03:12, Recovered'
    ])
  })

  it('an open RIT has no end yet', () => {
    const events = set3Events()
    events.push(ev('rit', { team: 'team1', playerNumber: 1, ritType: 'weather', startTime: at(11, 50) }))
    const [line] = medicalRemarkLines(events, ctx)
    expect(line).toContain('"Recovery Interruption" (Severe weather)')
    expect(line).not.toContain('End Time')
  })

  it('the match end remarks: the scorer\'s text, then the medical lines, once', () => {
    seq = 0
    const s = ev('rit', { team: 'team1', playerNumber: 1, ritType: 'no_blood', startTime: at(9, 0) }, { setIndex: 1 })
    const line = formatMedicalRemark(collectMedicalCases([s])[0], ctx)
    expect(remarksWithMedical('Rain delay', [s], ctx)).toBe(`Rain delay\n\n${line}`)
    expect(remarksWithMedical(`Rain delay\n\n${line}`, [s], ctx)).toBe(`Rain delay\n\n${line}`)
    expect(remarksWithMedical('', [], ctx)).toBe('')
  })

  it('durations print as HH:MM:SS', () => {
    expect(durationText(192)).toBe('00:03:12')
    expect(durationText(null)).toBe('')
  })
})

describe('medicalChartMarks', () => {
  it('keys by team and number: B #2 is not A #2', () => {
    seq = 0
    const marks = medicalChartMarks([
      ev('mto', { team: 'team2', playerNumber: 2 }),
      ev('rit', { team: 'team2', playerNumber: 2, ritType: 'toilet' }),
      ev('rit', { team: 'team2', playerNumber: 2, ritType: 'weather' })
    ])
    expect(marks).toEqual({ 'team2:2': { mto: true, rit: 'rit_toilet' } })
  })
})
