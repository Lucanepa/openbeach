// Laptop run of 2026-10-08 (OV-5, same code here): a window resize painted
// the new window size with the old scaled sizes first: the viewport state
// rendered a task after the resize event, --vmin-base after a paint
// (useEffect). The resize event commits the new size, with the CSS
// variables, before the browser paints it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ScaleProvider, useScale } from '../../contexts_beach/ScaleContext_beach'

function Probe() {
  const { viewportVmin } = useScale()
  return <div data-testid="vmin">{viewportVmin}</div>
}

let previousAct
beforeEach(() => {
  previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1400 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 853 })
})
afterEach(() => {
  cleanup()
  globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct
})

describe('ScaleProvider_beach: a resize is one paint', () => {
  it('the resize shows the new size at once, CSS variables included', async () => {
    const { getByTestId } = render(<ScaleProvider><Probe /></ScaleProvider>)
    await new Promise(r => setTimeout(r, 0))
    expect(getByTestId('vmin').textContent).toBe('853')
    expect(document.documentElement.style.getPropertyValue('--vmin-base')).toBe('853px')

    window.innerWidth = 1694
    window.innerHeight = 1000
    window.dispatchEvent(new Event('resize'))
    // synchronously, before the browser paints the resized window
    expect(getByTestId('vmin').textContent).toBe('1000')
    expect(document.documentElement.style.getPropertyValue('--vmin-base')).toBe('1000px')
  })
})
