import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The test-mode "Side" button (referee in test mode) wrote match.leftTeam,
// a field no screen reads: the court never moved. It writes the change of
// courts the scorer's rule reads (courtSides_beach switchSidesUpdate).

const store = vi.hoisted(() => ({ match: null, sets: [], updates: [] }))
vi.mock('../../db_beach/db_beach', () => {
  const sorted = (rows) => ({ sortBy: async () => rows })
  return {
    db: {
      matches: {
        get: vi.fn(async () => store.match),
        update: vi.fn(async (_id, patch) => { store.updates.push(patch); store.match = { ...store.match, ...patch }; return 1 })
      },
      sets: { where: () => ({ equals: () => sorted(store.sets) }) },
      events: { where: () => ({ equals: () => sorted([]) }) }
    }
  }
})

const { default: TestModeControls } = await import('../../components_beach/TestModeControls_beach')
const { leftTeamInSet } = await import('../../utils_beach/courtSides_beach')

describe('test mode "Side": a change of courts the court reads', () => {
  beforeEach(() => { store.updates.length = 0 })

  it('set 1 with A on the left: B goes to the left, and back', async () => {
    store.match = { id: 1, coinTossTeamA: 'team1', coinTossTeamB: 'team2' }
    store.sets = [{ id: 1, index: 1, finished: false }]
    render(<TestModeControls matchId={1} onRefresh={() => {}} />)
    fireEvent.click(screen.getByText('TEST MODE'))
    fireEvent.click(screen.getByText('Side'))
    await waitFor(() => expect(store.updates.length).toBe(1))
    expect(leftTeamInSet(1, store.match)).toBe('B')
    fireEvent.click(screen.getByText('Side'))
    await waitFor(() => expect(store.updates.length).toBe(2))
    expect(leftTeamInSet(1, store.match)).toBe('A')
  })
})
