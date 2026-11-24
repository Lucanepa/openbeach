import { createPortal } from 'react-dom'

/**
 * Renders the account dialogs at the body, inside `.ov-kit`, above the
 * header (z 1000) and the legacy overlays of the scoring screen. The kit
 * Modal inside keeps its own scrim, focus trap and Escape.
 */
export default function AuthLayer({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="ov-kit" style={{ position: 'relative', zIndex: 3000 }}>{children}</div>,
    document.body
  )
}
