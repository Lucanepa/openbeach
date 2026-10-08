import { describe, it, expect } from 'vitest'
import { medicalStartPayload, medicalEndPayload, findOpenMedical, formatMedicalDuration, medicalSecondsLeft } from '../../utils_beach/medicalEvents_beach'

describe('MTO / RIT event contract', () => {
  it('the start carries the player, the score and the server; RIT its type', () => {
    expect(medicalStartPayload({ kind: 'mto', team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: 'T', team1Points: 5, team2Points: 7, servingTeam: 'team1' }))
      .toEqual({ team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: 'T', team1Points: 5, team2Points: 7, servingTeam: 'team1' })
    expect(medicalStartPayload({ kind: 'rit', ritType: 'toilet', team: 'team1', playerNumber: 1 }).ritType).toBe('toilet')
    expect(medicalStartPayload({ kind: 'mto', team: 'team1', playerNumber: 1 })).not.toHaveProperty('ritType')
    expect(medicalStartPayload({ kind: 'mto', team: 'team1', playerNumber: '2' }).playerNumber).toBe(2)
  })

  it('the end refers to its start and has the duration in seconds', () => {
    const start = { type: 'rit', seq: 41, payload: { team: 'team2', playerNumber: 2, playerName: 'Weber', ritType: 'weather', startTime: '2026-10-08T10:00:00.000Z' } }
    expect(medicalEndPayload(start, { endTime: '2026-10-08T10:03:12.000Z', outcome: 'recovered' })).toEqual({
      kind: 'rit', startSeq: 41, team: 'team2', playerNumber: 2, playerName: 'Weber', ritType: 'weather',
      startTime: '2026-10-08T10:00:00.000Z', endTime: '2026-10-08T10:03:12.000Z', duration: 192, outcome: 'recovered'
    })
  })

  it('the open MTO / RIT is the start without an end; an undone end reopens it', () => {
    const start = { type: 'mto', seq: 10, payload: { startTime: 'T' } }
    const end = { type: 'medical_end', seq: 11, payload: { startSeq: 10 } }
    expect(findOpenMedical([start])).toBe(start)
    expect(findOpenMedical([start, end])).toBeNull()
    expect(findOpenMedical([{ type: 'point', seq: 1 }])).toBeNull()
    // the old format (outcome written into the start) counts as ended
    expect(findOpenMedical([{ type: 'mto', seq: 3, payload: { outcome: 'recovered' } }])).toBeNull()
  })

  it('durations and the countdown', () => {
    expect(formatMedicalDuration(192)).toBe('3:12')
    expect(formatMedicalDuration(5)).toBe('0:05')
    const t0 = Date.parse('2026-10-08T10:00:00Z')
    expect(medicalSecondsLeft('2026-10-08T10:00:00Z', t0 + 61_000)).toBe(239)
    expect(medicalSecondsLeft('2026-10-08T10:00:00Z', t0 + 400_000)).toBe(0)
  })
})
