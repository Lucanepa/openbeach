import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StartupConnectivityModal, { startupTitleKey } from '../../components_beach/StartupConnectivityModal_beach'

// (a) With the cloud still connecting (or down) the only way out was "Go
// offline", which also stored offline mode for good. "Continue" is always
// there now; "Go offline" is a separate, explained choice.

describe('StartupConnectivityModal', () => {
  it('offers Continue next to Go offline while the cloud is not connected', () => {
    const onDismiss = vi.fn()
    const onGoOffline = vi.fn()
    render(<StartupConnectivityModal open connectionStatuses={{ db: 'connected', supabase: 'connecting' }} onDismiss={onDismiss} onGoOffline={onGoOffline} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onGoOffline).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /go offline/i }))
    expect(onGoOffline).toHaveBeenCalledTimes(1)
  })

  it('shows a cloud still connecting as connecting, not as offline', () => {
    render(<StartupConnectivityModal open connectionStatuses={{ db: 'connected', supabase: 'connecting' }} />)
    expect(screen.queryByText(/^offline$/i)).toBeNull()
    expect(screen.queryByText(/^error$/i)).toBeNull()
    expect(screen.getAllByText(/connecting/i).length).toBeGreaterThan(0)
  })

  it('all fine: Dismiss with the countdown, no Go offline', () => {
    render(<StartupConnectivityModal open connectionStatuses={{ db: 'connected', supabase: 'connected' }} onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /go offline/i })).toBeNull()
  })

  it('a venue tablet (no cloud there) is fine too', () => {
    render(<StartupConnectivityModal open connectionStatuses={{ db: 'connected', supabase: 'not_configured' }} onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /go offline/i })).toBeNull()
  })

  it('the title follows the rows: no internet on the desktop window is not "Connecting…"', () => {
    render(<StartupConnectivityModal open connectionStatuses={{ db: 'connected', supabase: 'offline' }} />)
    const title = screen.getByRole('heading')
    expect(title).toHaveTextContent('No cloud connection')
    expect(title).not.toHaveTextContent(/connecting/i)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('title keys', () => {
    expect(startupTitleKey({ db: 'connected', supabase: 'connecting' })).toBe('connecting')
    expect(startupTitleKey({ db: 'connected', supabase: 'unknown' })).toBe('connecting')
    expect(startupTitleKey({ db: 'connected', supabase: 'offline' })).toBe('noCloud')
    expect(startupTitleKey({ db: 'connected', supabase: 'error' })).toBe('noCloud')
    expect(startupTitleKey({ db: 'connecting', supabase: 'error' })).toBe('noCloud')
    expect(startupTitleKey({ db: 'connected', supabase: 'connected' })).toBe('allConnected')
    // A venue tablet: Not configured is not "all services connected"
    expect(startupTitleKey({ db: 'connected', supabase: 'not_configured' })).toBe('readyLocal')
  })
})
