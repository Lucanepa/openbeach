import { expect, afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

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

// Cleanup after each test
afterEach(() => {
  cleanup()
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

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
