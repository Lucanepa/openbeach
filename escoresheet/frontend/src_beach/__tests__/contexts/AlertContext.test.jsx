import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { AlertProvider, useAlert } from '../../contexts_beach/AlertContext_beach'

describe('AlertContext_beach', () => {
  const wrapper = ({ children }) => <AlertProvider>{children}</AlertProvider>

  describe('useAlert outside provider', () => {
    it('should throw an error when used outside AlertProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useAlert())).toThrow('useAlert must be used within an AlertProvider')
      consoleSpy.mockRestore()
    })
  })

  describe('AlertProvider', () => {
    it('should render children', () => {
      render(
        <AlertProvider>
          <div>Test Content</div>
        </AlertProvider>
      )
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('should provide showAlert function', () => {
      const { result } = renderHook(() => useAlert(), { wrapper })
      expect(typeof result.current.showAlert).toBe('function')
    })
  })

  describe('showAlert', () => {
    it('should display alert modal with message', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Test message')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Test message')).toBeInTheDocument()
    })

    it('should display a Close button (a verb, not OK)', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Test message')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('should close alert when Close is clicked', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Test message')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Test message')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByText('Test message')).not.toBeInTheDocument()
    })
  })

  describe('alert types', () => {
    it('should show Error label for error type', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Error msg', 'error')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should show Success label for success type', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Success msg', 'success')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Success')).toBeInTheDocument()
    })

    it('should show Warning label for warning type', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Warning msg', 'warning')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Warning')).toBeInTheDocument()
    })

    it('should default to Info type', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Info msg')}>Show</button>
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show'))
      expect(screen.getByText('Info')).toBeInTheDocument()
    })
  })

  describe('alert queue', () => {
    it('should show only the first alert when multiple are queued', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return (
          <button onClick={() => {
            showAlert('First alert')
            showAlert('Second alert')
          }}>Show Both</button>
        )
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show Both'))
      expect(screen.getByText('First alert')).toBeInTheDocument()
      expect(screen.queryByText('Second alert')).not.toBeInTheDocument()
    })

    it('should show second alert after first is dismissed', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return (
          <button onClick={() => {
            showAlert('First alert')
            showAlert('Second alert')
          }}>Show Both</button>
        )
      }

      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )

      fireEvent.click(screen.getByText('Show Both'))
      expect(screen.getByText('First alert')).toBeInTheDocument()

      // Dismiss first alert
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.getByText('Second alert')).toBeInTheDocument()
    })
  })

  describe('the volleyui dialog', () => {
    it('is a named light alertdialog above the scoring screen, with no legacy dark styling', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Saved locally', 'warning')}>Show</button>
      }
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )
      fireEvent.click(screen.getByText('Show'))
      const dialog = screen.getByRole('alertdialog', { name: 'Warning' })
      expect(dialog).toHaveAccessibleDescription('Saved locally')
      expect(dialog.className).toContain('bg-white')
      expect(dialog.getAttribute('style') || '').not.toContain('#111827')
      expect(screen.queryByText('OK')).toBeNull()
    })

    it('closes on Escape', () => {
      function TestComponent() {
        const { showAlert } = useAlert()
        return <button onClick={() => showAlert('Esc me')}>Show</button>
      }
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      )
      fireEvent.click(screen.getByText('Show'))
      fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
      expect(screen.queryByText('Esc me')).toBeNull()
    })
  })
})
