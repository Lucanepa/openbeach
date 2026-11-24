import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import TabletStatusIndicator from '../../components_beach/TabletStatusIndicator_beach'

// Switching the referee toggle on in Match Setup takes the indicator from no
// enabled role (renders nothing) to one. It returned before its hooks, so
// React threw "Rendered more hooks than during the previous render" and the
// whole app went blank.
describe('TabletStatusIndicator', () => {
  it('re-renders from no enabled role to one, and back, without a hook-order error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, rerender } = render(<TabletStatusIndicator match={{ id: 1 }} />)
    expect(container.firstChild).toBeNull()
    rerender(<TabletStatusIndicator match={{ id: 1, refereeConnectionEnabled: true }} />)
    expect(container.querySelector('button')).toBeInTheDocument()
    rerender(<TabletStatusIndicator match={{ id: 1, refereeConnectionEnabled: true, team1TeamConnectionEnabled: true }} />)
    rerender(<TabletStatusIndicator match={{ id: 1 }} />)
    expect(container.firstChild).toBeNull()
    expect(err.mock.calls.some((c) => /hooks/i.test(String(c[0])))).toBe(false)
    err.mockRestore()
  })
})
