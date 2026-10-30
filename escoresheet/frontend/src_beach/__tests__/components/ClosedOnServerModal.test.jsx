// ClosedOnServerModal_beach (ported from OpenVolley's ClosedOnServerModal
// test): a copy the server has closed opens read-only; Load the official
// version, Remove from this device, the match number and PIN when the kept
// PIN does not load it, Close.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let ClosedOnServerModal
beforeAll(async () => {
  await import('../../i18n_beach')
  ClosedOnServerModal = (await import('../../components_beach/ClosedOnServerModal_beach')).default
})

const ui = (props = {}) => render(
  <ClosedOnServerModal onLoadOfficial={vi.fn()} onRemove={vi.fn()} onUsePin={vi.fn()} onClose={vi.fn()} {...props} />
)

describe('ClosedOnServerModal_beach', () => {
  it('says why, cannot be dismissed, and offers the official version, Remove and Close', () => {
    const onRemove = vi.fn()
    const onClose = vi.fn()
    ui({ onRemove, onClose })
    expect(screen.getByTestId('closed-copy-modal').textContent).toContain('This match is closed on the server')
    expect(screen.queryByRole('button', { name: 'Enter match number and PIN' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this device' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a kept PIN that does not load it: the match number and PIN; offline: it says so, no PIN offer', async () => {
    const onUsePin = vi.fn()
    const view = ui({ onLoadOfficial: vi.fn(async () => ({ error: 'notFound' })), onUsePin })
    fireEvent.click(screen.getByRole('button', { name: 'Load the official version' }))
    await waitFor(() => expect(screen.getByTestId('closed-copy-error').textContent).toContain('does not load the official version'))
    fireEvent.click(screen.getByRole('button', { name: 'Enter match number and PIN' }))
    expect(onUsePin).toHaveBeenCalled()
    view.unmount()

    ui({ onLoadOfficial: vi.fn(async () => ({ error: 'offline' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Load the official version' }))
    await waitFor(() => expect(screen.getByTestId('closed-copy-error').textContent).toContain('needs a connection'))
    expect(screen.queryByRole('button', { name: 'Enter match number and PIN' })).toBeNull()
  })
})
