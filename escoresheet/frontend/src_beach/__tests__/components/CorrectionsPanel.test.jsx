// The beach corrections panel (components_beach/corrections): Add on every
// list (also empty), the guided sanction form with its preview and the beach
// scale, a time-out at its score, the final-score guard, and what reaches the
// write path. Ported from OpenVolley
// src/components/corrections/__tests__/CorrectionsPanel.test.jsx.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

const applied = vi.hoisted(() => ({ plans: [] }))
vi.mock('../../utils_beach/applyCorrectionPlan_beach', () => ({
  applyCorrectionPlan: async (plan) => { applied.plans.push(plan); return { addedIds: [], signaturesCleared: false } }
}))

import CorrectionsPanel from '../../components_beach/corrections/CorrectionsPanel_beach'
import { resetGhostClickGuard } from '../../hooks_beach/useConfirmAction_beach'

const MATCH = { id: 1, coinTossTeamA: 'team1', remarks: '', manualChanges: [] }
const TEAM1 = { id: 1, name: 'Müller / Weber', color: '#1d4ed8' }
const TEAM2 = { id: 2, name: 'Rossi / Bianchi', color: '#dc2626' }
const T1P = [{ id: 11, number: 1, firstName: 'Anna', lastName: 'Müller' }, { id: 12, number: 2, firstName: 'Lea', lastName: 'Weber' }]
const T2P = [{ id: 21, number: 1, firstName: 'Sara', lastName: 'Rossi' }, { id: 22, number: 2, firstName: 'Gia', lastName: 'Bianchi' }]

// Set 1 won 21:15 by team1 (finished), set 2 at 3:2
function buildEvents() {
  const events = []
  let id = 1
  let seq = 1
  const push = (setIndex, type, payload = {}) => events.push({ id: id++, matchId: 1, setIndex, type, seq: seq++, ts: new Date(1e12 + seq * 1000).toISOString(), payload })
  for (const [setIndex, a, b, end] of [[1, 21, 15, true], [2, 3, 2, false]]) {
    push(setIndex, 'set_start')
    const order = [...Array(b).fill('team2'), ...Array(a).fill('team1')]
    for (const team of order) {
      push(setIndex, 'rally_start')
      push(setIndex, 'point', { team })
    }
    if (end) push(setIndex, 'set_end', { team: 'team1', team1Points: a, team2Points: b })
  }
  return events
}

function setup({ mode = 'review', liveSetIndex = null, events = buildEvents(), match = MATCH } = {}) {
  const sets = [
    { id: 1, matchId: 1, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { id: 2, matchId: 1, index: 2, team1Points: 3, team2Points: 2, finished: false }
  ]
  return render(
    <CorrectionsPanel mode={mode} matchId={1} events={events} match={match} sets={sets}
      team1Team={TEAM1} team2Team={TEAM2} team1Players={T1P} team2Players={T2P} liveSetIndex={liveSetIndex} />
  )
}

const radio = (group, name) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name })

describe('CorrectionsPanel_beach', () => {
  beforeEach(() => { applied.plans = []; resetGhostClickGuard() })

  it('shows an Add button on every list, also when it is empty; no line-up, substitution or libero card', () => {
    setup()
    for (const label of ['Add time-out', 'Add sanction', 'Add remark']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'Add substitution' })).toBeNull()
    expect(screen.getByText('No time-outs recorded.')).toBeTruthy()
    expect(screen.getByText('No sanctions recorded.')).toBeTruthy()
    expect(screen.queryByText(/Libero/)).toBeNull()
  })

  it('a delay warning at the match end: chosen set, team and score, the paper preview, then the write path', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add sanction' }))
    expect(screen.getByText('Fill in the fields above.')).toBeTruthy()
    fireEvent.click(radio('Set', 'Set 2'))
    fireEvent.click(radio('Team', /Rossi \/ Bianchi/))
    fireEvent.click(radio('Sanction', /Delay warning/))
    expect(screen.getByText('Delay warning · Rossi / Bianchi (B) · Set 2 · B 0:0 A')).toBeTruthy()
    expect(screen.getByText('DW · Team B · Set 2 · B 0:0 A')).toBeTruthy()
    // no expulsion / disqualification here: they forfeit (scoreboard only)
    expect(within(screen.getByRole('radiogroup', { name: 'Sanction' })).queryByRole('radio', { name: /Expulsion/ })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })) })
    expect(applied.plans).toHaveLength(1)
    expect(applied.plans[0].add[0]).toMatchObject({ type: 'sanction', setIndex: 2, payload: { team: 'team2', type: 'delay_warning' } })
  })

  it('live: a delay penalty before the warning is refused in plain words and Confirm stays off', () => {
    setup({ mode: 'live', liveSetIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Add sanction' }))
    fireEvent.click(radio('Team', /Müller \/ Weber/))
    fireEvent.click(radio('Sanction', /Delay penalty/))
    expect(screen.getByText('By the rules this is a delay warning (the team\'s earlier sanctions).')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('a penalty needs a player of the team; the point is the opponent\'s next one', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add sanction' }))
    fireEvent.click(radio('Set', 'Set 2'))
    fireEvent.click(radio('Team', /Müller \/ Weber/))
    fireEvent.click(radio('Sanction', /^P\s*Penalty$/))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.click(radio('Player', /#2/))
    expect(screen.getByText(/Rossi \/ Bianchi's point at B 1:0 A becomes the circled penalty point\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })

  it('a time-out at a chosen score shows where the "T" goes', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add time-out' }))
    fireEvent.click(radio('Set', 'Set 1'))
    fireEvent.click(radio('Team', /Rossi \/ Bianchi/))
    fireEvent.change(screen.getByLabelText('At score'), { target: { value: '3' } })
    expect(screen.getByText('"T" at B 3:0 A in the time-out box of Rossi / Bianchi, set 1.')).toBeTruthy()
  })

  it('the final score keeps the winner and a beach final score (21, two ahead)', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Correct final score' }))
    fireEvent.click(screen.getByRole('radio', { name: 'One point more for Müller / Weber (A)' }))
    expect(screen.getByText('A 22:15 B is not a possible final score of set 1.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'One point more for Rossi / Bianchi (B)' }))
    expect(screen.getByText('Final score A 21:15 B becomes A 21:16 B.')).toBeTruthy()
  })

  it('an approved match is read-only', () => {
    render(
      <CorrectionsPanel mode="review" matchId={1} events={buildEvents()} match={MATCH} sets={[{ id: 1, index: 1, finished: true }]}
        team1Team={TEAM1} team2Team={TEAM2} readOnly />
    )
    expect(screen.getByText('The match is approved: corrections are read-only.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add sanction' })).toBeNull()
  })
})
