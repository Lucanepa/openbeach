import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SyncProgressModal from '../../components_beach/SyncProgressModal_beach'

// The set end's sync dialog was the last legacy dark dialog on the scoring
// screen (inline styles, glyph icons, an amber "Proceed Anyway"). Now the
// volleyui decision dialog: a white panel, lucide icons with a word for each
// state, the offline note as an amber notice, a dark kit button.

const steps = [
  { id: 'point', label: 'Last point', status: 'done' },
  { id: 'set', label: 'Set result', status: 'in_progress' },
  { id: 'match', label: 'Match', status: 'pending' }
]

afterEach(() => vi.useRealTimers())

describe('SyncProgressModal', () => {
  it('a kit dialog with every step and its state', () => {
    render(<SyncProgressModal open steps={steps} />)
    const dialog = screen.getByRole('dialog', { name: 'Syncing…' })
    expect(dialog.closest('.ov-kit')).not.toBeNull()
    expect(dialog.className).toMatch(/rounded-2xl/)
    expect(dialog.className).toMatch(/bg-white/)
    expect(dialog.getAttribute('style') || '').not.toMatch(/background/)
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.dataset.status)).toEqual(['done', 'in_progress', 'pending'])
    expect(items[0]).toHaveTextContent('Last point')
  })

  it('offline: the amber note and an automatic close', () => {
    vi.useFakeTimers()
    const onProceed = vi.fn()
    render(<SyncProgressModal open isComplete hasWarning steps={[{ id: 'a', label: 'Set result', status: 'warning' }]} onProceed={onProceed} />)
    expect(screen.getByRole('dialog', { name: 'Saved on this device' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Offline. Data saved locally.')
    act(() => { vi.advanceTimersByTime(1600) })
    expect(onProceed).toHaveBeenCalledTimes(1)
  })

  it('an error waits for the scorer: Proceed anyway', () => {
    const onProceed = vi.fn()
    render(<SyncProgressModal open isComplete hasError errorMessage="Sync failed. Data saved locally." steps={[{ id: 'a', label: 'Set result', status: 'error' }]} onProceed={onProceed} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sync failed')
    const btn = screen.getByRole('button', { name: 'Proceed anyway' })
    expect(btn.className).toMatch(/bg-slate-900/)
    fireEvent.click(btn)
    expect(onProceed).toHaveBeenCalledTimes(1)
  })

  it('closed: nothing', () => {
    const { container } = render(<SyncProgressModal open={false} steps={steps} />)
    expect(container).toBeEmptyDOMElement()
  })
})
