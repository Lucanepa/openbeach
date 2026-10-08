import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  MEDICAL_RECOVERY_SEC,
  medicalFromAction,
  medicalRemaining,
  activeMedicalFromEvents,
  reconcileMedical,
  medicalEventLabel,
  medicalTypeLabel
} from '../../utils_beach/refereeMedical_beach'
import { refereeEventLabel, courtScore, REFEREE_DISPLAYABLE_EVENTS } from '../../utils_beach/refereeEventLabel_beach'

const readSource = (rel) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const T0 = Date.parse('2026-10-08T11:42:00Z')

describe('referee medical state (rule 17.1.2: 5 minutes recovery)', () => {
  it('the scorer\'s medical action starts a 5:00 countdown with team, player and type', () => {
    const m = medicalFromAction({ kind: 'rit', ritType: 'toilet', team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: new Date(T0).toISOString(), durationSec: 300 }, T0)
    expect(m).toMatchObject({ kind: 'rit', ritType: 'toilet', team: 'team2', playerNumber: 2, playerName: 'Weber', startTimestamp: T0, initialCountdown: 300 })
    expect(MEDICAL_RECOVERY_SEC).toBe(300)
    expect(medicalRemaining(m, T0 + 61_000)).toBe(239)
    expect(medicalRemaining(m, T0 + 400_000)).toBe(0)
  })

  it('an MTO never carries a RIT type', () => {
    expect(medicalFromAction({ kind: 'mto', ritType: 'toilet', team: 'team1', playerNumber: 1 }, T0).ritType).toBeNull()
  })

  it('is rebuilt from the events on reconnect: a start with no end is running', () => {
    const events = [
      { seq: 10, type: 'point', payload: { team: 'team1' } },
      { seq: 11, type: 'mto', payload: { team: 'team2', playerNumber: 2, playerName: 'Weber', startTime: new Date(T0).toISOString() } }
    ]
    expect(activeMedicalFromEvents(events, T0 + 30_000)).toMatchObject({ kind: 'mto', team: 'team2', playerNumber: 2, startSeq: 11 })
  })

  it('a medical_end (startSeq) closes it', () => {
    const events = [
      { seq: 11, type: 'mto', payload: { team: 'team2', playerNumber: 2, startTime: new Date(T0).toISOString() } },
      { seq: 12, type: 'medical_end', payload: { kind: 'mto', startSeq: 11, team: 'team2', playerNumber: 2, outcome: 'recovered', duration: 192 } }
    ]
    expect(activeMedicalFromEvents(events, T0 + 200_000)).toBeNull()
  })

  it('the old in-place format (endTime on the start event) counts as ended', () => {
    const events = [{ seq: 11, type: 'rit', payload: { team: 'team1', playerNumber: 1, ritType: 'no_blood', startTime: new Date(T0).toISOString(), endTime: new Date(T0 + 60_000).toISOString(), outcome: 'recovered' } }]
    expect(activeMedicalFromEvents(events, T0 + 70_000)).toBeNull()
  })

  it('a long-forgotten start is not shown again', () => {
    const events = [{ seq: 1, type: 'mto', payload: { team: 'team1', playerNumber: 1, startTime: new Date(T0).toISOString() } }]
    expect(activeMedicalFromEvents(events, T0 + 60 * 60_000)).toBeNull()
  })

  it('reconcile: an action-started recovery stays until its end is in the events', () => {
    const current = medicalFromAction({ kind: 'mto', team: 'team2', playerNumber: 2, startTime: new Date(T0).toISOString() }, T0)
    // its start has not synced yet
    expect(reconcileMedical(current, [], T0 + 5_000)).toBe(current)
    const ended = [
      { seq: 11, type: 'mto', payload: { team: 'team2', playerNumber: 2, startTime: new Date(T0).toISOString() } },
      { seq: 12, type: 'medical_end', payload: { kind: 'mto', startSeq: 11, team: 'team2', playerNumber: 2, startTime: new Date(T0).toISOString(), outcome: 'recovered' } }
    ]
    expect(reconcileMedical(current, ended, T0 + 100_000)).toBeNull()
  })

  it('reconcile: an undone start (events only) clears it', () => {
    const fromEvents = activeMedicalFromEvents([{ seq: 11, type: 'mto', payload: { team: 'team2', playerNumber: 2, startTime: new Date(T0).toISOString() } }], T0 + 1000)
    expect(reconcileMedical(fromEvents, [], T0 + 2000)).toBeNull()
  })
})

describe('medical last-action labels', () => {
  it('MTO start and end', () => {
    expect(medicalEventLabel('mto', { team: 'team2', playerNumber: 2, playerName: 'Weber' }, { teamLetter: 'B' })).toBe('MTO – B #2 Weber')
    expect(medicalEventLabel('medical_end', { kind: 'mto', playerNumber: 2, playerName: 'Weber', duration: 192, outcome: 'recovered' }, { teamLetter: 'B' }))
      .toBe('MTO end – B #2 Weber (3:12, recovered)')
  })

  it('RIT types', () => {
    expect(medicalTypeLabel('rit', 'no_blood')).toBe('RIT (no blood)')
    expect(medicalTypeLabel('rit', 'weather')).toBe('RIT (weather)')
    expect(medicalEventLabel('rit', { ritType: 'toilet', playerNumber: 1 }, { teamLetter: 'A' })).toBe('RIT (toilet) – A #1')
  })
})

describe('referee last action', () => {
  const ctx = { team1Label: 'B', team2Label: 'A', team1Short: 'Schmidt / Fischer', team2Short: 'Müller / Weber', leftLabel: 'A', rightLabel: 'B', leftPoints: 20, rightPoints: 16 }

  it('prints the score left team first, with letters', () => {
    expect(courtScore(ctx)).toBe('A 20 : 16 B')
    expect(refereeEventLabel({ type: 'point', team: 'team2' }, ctx)).toBe('Point A Müller / Weber (A 20 : 16 B)')
  })

  it('names the referee BMP and its outcome with the score', () => {
    expect(refereeEventLabel({ type: 'referee_bmp_request' }, ctx)).toBe('Referee BMP (A 20 : 16 B)')
    expect(refereeEventLabel({ type: 'referee_bmp_outcome', data: { result: 'in', pointAwarded: true, pointToTeam: 'team1' } }, ctx))
      .toBe('Referee BMP: IN → B (A 20 : 16 B)')
  })

  it('shows MTO, RIT and their end', () => {
    for (const type of ['mto', 'rit', 'medical_end']) expect(REFEREE_DISPLAYABLE_EVENTS).toContain(type)
    expect(refereeEventLabel({ type: 'mto', team: 'team1', data: { playerNumber: 2, playerName: 'Fischer' } }, ctx)).toBe('MTO – B #2 Fischer')
    expect(refereeEventLabel({ type: 'medical_end', team: 'team1', data: { kind: 'mto', playerNumber: 2, outcome: 'forfeit', duration: 300 } }, ctx))
      .toBe('MTO end – B #2 (5:00, forfeit)')
  })
})

describe('referee screen contract', () => {
  it('handles the medical relay actions, shows the recovery countdown and the BMP left like the scorer', async () => {
    const src = readSource('components_beach/Referee_beach.jsx')
    expect(src).toMatch(/action === 'medical'/)
    expect(src).toMatch(/action === 'end_medical'/)
    expect(src).toMatch(/reconcileMedical\(prev, data\.events\)/)
    expect(src).toMatch(/REFEREE_DISPLAYABLE_EVENTS\.includes/)
    // the BMP counter shows what is left (scorer: 2 - unsuccessful used), not what was used
    expect(src).not.toMatch(/\{(left|right)Stats\.challengesUsed\}/)
    expect(src).toMatch(/\{bmpLeft\(leftStats\)\}/)
  })
})
