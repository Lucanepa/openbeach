import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Modal from '../../components_beach/Modal_beach'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const translations = { 'common.close': 'Close' }
      return translations[key] || key
    },
    i18n: { language: 'en' }
  })
}))

describe('Modal', () => {
  describe('rendering', () => {
    it('should not render when open is false', () => {
      const { container } = render(
        <Modal open={false} onClose={() => {}}>
          <div>Modal content</div>
        </Modal>
      )

      expect(container.firstChild).toBeNull()
    })

    it('should render when open is true', () => {
      render(
        <Modal open={true} onClose={() => {}}>
          <div>Modal content</div>
        </Modal>
      )

      expect(screen.getByText('Modal content')).toBeInTheDocument()
    })

    it('should render title when provided', () => {
      render(
        <Modal open={true} onClose={() => {}} title="Test Title">
          <div>Content</div>
        </Modal>
      )

      expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('should render children correctly', () => {
      render(
        <Modal open={true} onClose={() => {}}>
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </Modal>
      )

      expect(screen.getByText('First paragraph')).toBeInTheDocument()
      expect(screen.getByText('Second paragraph')).toBeInTheDocument()
    })
  })

  describe('close button', () => {
    it('should render close button by default', () => {
      render(
        <Modal open={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    it('should hide close button when hideCloseButton is true', () => {
      render(
        <Modal open={true} onClose={() => {}} hideCloseButton={true}>
          <div>Content</div>
        </Modal>
      )

      expect(screen.queryByText('Close')).not.toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn()

      render(
        <Modal open={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      )

      fireEvent.click(screen.getByText('Close'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('backdrop behavior', () => {
    it('should stop click propagation on backdrop', () => {
      const onClose = vi.fn()

      const { container } = render(
        <Modal open={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      )

      // Click on the backdrop (first child is the overlay)
      const backdrop = container.firstChild
      fireEvent.click(backdrop)

      // onClose should NOT be called for backdrop clicks
      // (the modal stops propagation but doesn't close on backdrop click)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should stop click propagation on modal content', () => {
      const onClose = vi.fn()

      render(
        <Modal open={true} onClose={onClose}>
          <button>Inner button</button>
        </Modal>
      )

      // Click on the inner button
      fireEvent.click(screen.getByText('Inner button'))

      // onClose should NOT be called
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('positioning', () => {
    it('should use center position by default', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      const overlay = container.firstChild
      expect(overlay).toHaveStyle({ justifyContent: 'center' })
    })

    it('should position left when position="left"', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} position="left">
          <div>Content</div>
        </Modal>
      )

      const overlay = container.firstChild
      expect(overlay).toHaveStyle({ justifyContent: 'flex-start' })
    })

    it('should position right when position="right"', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} position="right">
          <div>Content</div>
        </Modal>
      )

      const overlay = container.firstChild
      expect(overlay).toHaveStyle({ justifyContent: 'flex-end' })
    })

    it('should handle custom position', () => {
      const customStyle = { top: '100px', left: '50px' }

      const { container } = render(
        <Modal open={true} onClose={() => {}} position="custom" customStyle={customStyle}>
          <div>Content</div>
        </Modal>
      )

      // Should render in custom mode
      expect(container.firstChild).toBeInTheDocument()
    })
  })

  describe('dimensions', () => {
    it('should use default width of 800px', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      const modalBox = container.firstChild.firstChild
      expect(modalBox).toHaveStyle({ width: 'min(95vw,800px)' })
    })

    it('should respect custom width', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} width={500}>
          <div>Content</div>
        </Modal>
      )

      const modalBox = container.firstChild.firstChild
      expect(modalBox).toHaveStyle({ width: 'min(95vw,500px)' })
    })

    it('should handle width="auto"', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} width="auto">
          <div>Content</div>
        </Modal>
      )

      const modalBox = container.firstChild.firstChild
      expect(modalBox).toHaveStyle({ width: 'auto' })
    })

    it('should handle full viewport width', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} width="100vw">
          <div>Content</div>
        </Modal>
      )

      const modalBox = container.firstChild.firstChild
      expect(modalBox).toHaveStyle({ width: '100vw' })
    })
  })

  describe('z-index', () => {
    it('should use default z-index of 1000', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      const overlay = container.firstChild
      expect(overlay).toHaveStyle({ zIndex: 1000 })
    })

    it('should respect custom z-index', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} zIndex={2000}>
          <div>Content</div>
        </Modal>
      )

      const overlay = container.firstChild
      expect(overlay).toHaveStyle({ zIndex: 2000 })
    })
  })

  describe('accessibility', () => {
    it('should render close button that is keyboard accessible', () => {
      const onClose = vi.fn()

      render(
        <Modal open={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      )

      const closeButton = screen.getByText('Close')
      expect(closeButton.tagName).toBe('BUTTON')
    })
  })

  describe('header visibility', () => {
    it('should show header with title', () => {
      render(
        <Modal open={true} onClose={() => {}} title="My Title">
          <div>Content</div>
        </Modal>
      )

      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('My Title')
    })

    it('should show header area when close button is visible even without title', () => {
      render(
        <Modal open={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      // Close button should be visible (header rendered)
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    it('should hide header when no title and hideCloseButton', () => {
      const { container } = render(
        <Modal open={true} onClose={() => {}} hideCloseButton={true}>
          <div data-testid="content">Content</div>
        </Modal>
      )

      // Should not have the header div (no h3 element)
      expect(container.querySelector('h3')).toBeNull()
    })
  })

  describe('tones', () => {
    it('pins the legacy dark palette on the default panel', () => {
      render(
        <Modal open={true} onClose={() => {}} title="Dark">
          <div>Content</div>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toHaveClass('legacy-dark')
    })

    it('draws the light (volleyui) panel with an icon close button', () => {
      const onClose = vi.fn()
      render(
        <Modal open={true} onClose={onClose} title="Light" tone="light">
          <div>Content</div>
        </Modal>
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveClass('bg-white')
      expect(dialog).not.toHaveClass('legacy-dark')
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Light')
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('keeps the light backdrop from closing the modal', () => {
      const onClose = vi.fn()
      const { container } = render(
        <Modal open={true} onClose={onClose} tone="light">
          <div>Content</div>
        </Modal>
      )

      fireEvent.click(container.firstChild)
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('a real dialog (keyboard on the desktop app)', () => {
    const Scoring = ({ open, tone }) => (
      <>
        <button type="button">Point A</button>
        <Modal open={open} onClose={() => {}} title="Confirm point" tone={tone}>
          <button type="button">Cancel</button>
          <button type="button">Give point</button>
        </Modal>
      </>
    )

    for (const tone of ['light', 'dark']) {
      it(`${tone}: named by its title, focus moves in, Tab stays inside, focus and scroll come back`, () => {
        const behind = document.createElement('button')
        document.body.appendChild(behind)
        behind.focus()
        const { rerender } = render(<Scoring open tone={tone} />)
        const dialog = screen.getByRole('dialog', { name: 'Confirm point' })
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog.contains(document.activeElement)).toBe(true)
        expect(document.body.style.overflow).toBe('hidden')

        const buttons = Array.from(dialog.querySelectorAll('button'))
        const last = buttons[buttons.length - 1]
        last.focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        expect(document.activeElement).toBe(buttons[0])
        buttons[0].focus()
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
        expect(document.activeElement).toBe(last)
        // focus that escaped behind the scrim is pulled back in
        screen.getByText('Point A').focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        expect(dialog.contains(document.activeElement)).toBe(true)

        rerender(<Scoring open={false} tone={tone} />)
        expect(document.activeElement).toBe(behind)
        expect(document.body.style.overflow).toBe('')
        behind.remove()
      })
    }

    it('Escape still does nothing (scoring depends on it)', () => {
      const onClose = vi.fn()
      render(<Modal open onClose={onClose} title="T" tone="light"><button type="button">x</button></Modal>)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
