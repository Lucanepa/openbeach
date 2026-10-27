import { expect, afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { resetGhostClickGuard } from '../hooks_beach/useConfirmAction_beach'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// waitFor / findBy end on what the screen or the database shows, never on a
// timer, so a longer limit costs a passing test nothing. The default 1 s was
// too short with the machine loaded: one write of a scoring screen took up to
// 1 s, an action of several writes (a BMP outcome, the end of a TTO) longer,
// and different tests failed in turn in full-suite runs (2026-10-08). 10 s,
// under the 30 s per test (vitest.config.js), so a real failure still reports
// its assertion rather than a test timeout.
configure({ asyncUtilTimeout: 10000 })

// Cleanup after each test. A confirm's ghost-click guard (useConfirmAction:
// every click of the next 450 ms is swallowed) never outlives its test: the
// next test's first tap, a few ms later, was swallowed and it failed
afterEach(() => {
  cleanup()
  resetGhostClickGuard()
})

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver and IntersectionObserver: classes, so `new` works
// (a vi.fn with an arrow implementation is not a constructor in Vitest 4+)
class ObserverMock {
  constructor() {
    this.observe = vi.fn()
    this.unobserve = vi.fn()
    this.disconnect = vi.fn()
  }
}
global.ResizeObserver = class ResizeObserver extends ObserverMock {}
global.IntersectionObserver = class IntersectionObserver extends ObserverMock {}

// Mock scrollTo
window.scrollTo = vi.fn()

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock indexedDB for Dexie tests
const indexedDBMock = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
}
Object.defineProperty(window, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
})
