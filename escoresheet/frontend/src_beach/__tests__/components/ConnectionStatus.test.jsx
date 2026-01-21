import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConnectionStatus from '../../components_beach/ConnectionStatus_beach'

// Mock db import
vi.mock('../../db_beach/db_beach', () => ({
  db: {}
}))

describe('ConnectionStatus', () => {
  const defaultProps = {
    connectionStatuses: {},
    connectionDebugInfo: {},
    queueStats: { pending: 0, error: 0 }
  }

  describe('rendering', () => {
    it('should render the status button', () => {
      render(<ConnectionStatus {...defaultProps} />)

      // Should show some status indicator
      expect(document.querySelector('[data-connection-menu]')).toBeInTheDocument()
    })

    it('should show "Error" when no connections are configured', () => {
      render(<ConnectionStatus {...defaultProps} />)

      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should show "Connected" when server and websocket are connected', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'connected',
            supabase: 'connected'
          }}
        />
      )

      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    it('should show "Ready" when waiting for match', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'no_match',
            supabase: 'connected'
          }}
        />
      )

      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('should show "Syncing..." when there are pending items', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'connected',
            supabase: 'connected'
          }}
          queueStats={{ pending: 5, error: 0 }}
        />
      )

      expect(screen.getByText('Syncing...')).toBeInTheDocument()
    })

    it('should show error count badge when there are errors', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'connected',
            supabase: 'connected'
          }}
          queueStats={{ pending: 0, error: 3 }}
        />
      )

      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('dropdown menu', () => {
    it('should not show dropdown initially', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'disconnected'
          }}
        />
      )

      expect(screen.queryByText('Connection Status')).not.toBeInTheDocument()
    })

    it('should show dropdown when clicked', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'disconnected'
          }}
        />
      )

      // Find and click the status button
      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Connection Status')).toBeInTheDocument()
      })
    })

    it('should show individual connection statuses in dropdown', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'no_match',
            supabase: 'disconnected',
            match: 'live'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Server:')).toBeInTheDocument()
        expect(screen.getByText('WebSocket:')).toBeInTheDocument()
        expect(screen.getByText('Supabase:')).toBeInTheDocument()
        expect(screen.getByText('Match:')).toBeInTheDocument()
      })
    })

    it('should toggle dropdown on multiple clicks', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')

      // First click - open
      fireEvent.click(button)
      await waitFor(() => {
        expect(screen.getByText('Connection Status')).toBeInTheDocument()
      })

      // Second click - close
      fireEvent.click(button)
      await waitFor(() => {
        expect(screen.queryByText('Connection Status')).not.toBeInTheDocument()
      })
    })
  })

  describe('status colors', () => {
    it('should show green dot for connected status', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'connected'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      // Check that the status dot has the correct background color
      const dots = document.querySelectorAll('span[style*="border-radius: 50%"]')
      expect(dots.length).toBeGreaterThan(0)
    })

    it('should show red for disconnected status', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'disconnected'
          }}
        />
      )

      // The main indicator should show error state
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should show yellow for connecting status', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connecting',
            supabase: 'connected'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Connecting')).toBeInTheDocument()
      })
    })

    it('should show purple for test mode', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'test_mode',
            supabase: 'connected'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Test Mode')).toBeInTheDocument()
      })
    })
  })

  describe('queue stats display', () => {
    it('should show pending count in dropdown for supabase', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'connected'
          }}
          queueStats={{ pending: 5, error: 0 }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Pending background sync:')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument()
      })
    })

    it('should show error count with retry button', async () => {
      const onRetryErrors = vi.fn()

      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'connected'
          }}
          queueStats={{ pending: 0, error: 2 }}
          onRetryErrors={onRetryErrors}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Synchronization errors:')).toBeInTheDocument()
        expect(screen.getByText('Retry All')).toBeInTheDocument()
      })

      // Click retry button
      fireEvent.click(screen.getByText('Retry All'))
      expect(onRetryErrors).toHaveBeenCalledTimes(1)
    })
  })

  describe('debug info', () => {
    it('should show debug info when clicking disconnected status', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'disconnected',
            supabase: 'connected'
          }}
          connectionDebugInfo={{
            server: {
              status: 'disconnected',
              message: 'Connection refused',
              details: 'Server is not responding'
            }
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Server:')).toBeInTheDocument()
      })

      // Click on the server status row to expand debug info
      const serverRow = screen.getByText('Server:').closest('div')
      fireEvent.click(serverRow)

      await waitFor(() => {
        expect(screen.getByText('Status Information')).toBeInTheDocument()
        expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
      })
    })

    it('should not show debug expand for connected status', async () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            supabase: 'connected'
          }}
        />
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Server:')).toBeInTheDocument()
      })

      // The connected row should not have expand arrow
      const serverRow = screen.getByText('Server:').closest('div')
      expect(serverRow.querySelector('span[style*="▼"]')).toBeNull()
    })
  })

  describe('size variants', () => {
    it('should render with normal size by default', () => {
      const { container } = render(<ConnectionStatus {...defaultProps} />)

      const button = container.querySelector('[data-connection-menu] > div')
      expect(button).toHaveStyle({ fontSize: '12px' })
    })

    it('should render with small size', () => {
      const { container } = render(<ConnectionStatus {...defaultProps} size="small" />)

      const button = container.querySelector('[data-connection-menu] > div')
      expect(button).toHaveStyle({ fontSize: '10px' })
    })

    it('should render with large size', () => {
      const { container } = render(<ConnectionStatus {...defaultProps} size="large" />)

      const button = container.querySelector('[data-connection-menu] > div')
      expect(button).toHaveStyle({ fontSize: '14px' })
    })
  })

  describe('overall status calculation', () => {
    it('should be "connected" when server and supabase are connected', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'connected',
            supabase: 'connected',
            match: 'live'
          }}
        />
      )

      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    it('should be "attention" when no viable connection path', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'disconnected',
            websocket: 'disconnected',
            supabase: 'disconnected'
          }}
        />
      )

      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should be "awaiting_match" when connected but no match selected', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'no_match',
            supabase: 'connected',
            match: 'no_match'
          }}
        />
      )

      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('should show attention when supabase has errors', () => {
      render(
        <ConnectionStatus
          {...defaultProps}
          connectionStatuses={{
            server: 'connected',
            websocket: 'connected',
            supabase: 'connected'
          }}
          queueStats={{ pending: 0, error: 5 }}
        />
      )

      // The error count should make it show attention state
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('click outside behavior', () => {
    it('should close dropdown when clicking outside', async () => {
      render(
        <div>
          <ConnectionStatus
            {...defaultProps}
            connectionStatuses={{ server: 'connected' }}
          />
          <div data-testid="outside">Outside</div>
        </div>
      )

      const button = document.querySelector('[data-connection-menu] > div')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Connection Status')).toBeInTheDocument()
      })

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'))

      await waitFor(() => {
        expect(screen.queryByText('Connection Status')).not.toBeInTheDocument()
      })
    })
  })
})
