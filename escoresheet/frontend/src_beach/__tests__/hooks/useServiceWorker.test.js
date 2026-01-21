import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useServiceWorker } from '../../hooks_beach/useServiceWorker_beach'

describe('useServiceWorker', () => {
  let originalNavigator
  let mockServiceWorker
  let mockRegistration

  beforeEach(() => {
    // Save original navigator
    originalNavigator = global.navigator

    // Create mock registration
    mockRegistration = {
      waiting: null,
      installing: null,
      active: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    }

    // Create mock service worker API
    mockServiceWorker = {
      controller: null,
      getRegistration: vi.fn().mockResolvedValue(mockRegistration),
      getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    // Mock navigator.serviceWorker
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        serviceWorker: mockServiceWorker,
      },
      writable: true,
      configurable: true,
    })

    // Mock caches API
    global.caches = {
      keys: vi.fn().mockResolvedValue(['cache1', 'cache2']),
      delete: vi.fn().mockResolvedValue(true),
    }

    // Mock window.location.reload
    delete window.location
    window.location = { reload: vi.fn() }
  })

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })

    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('initialization', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() => useServiceWorker())

      expect(result.current.needRefresh).toBe(false)
      expect(result.current.offlineReady).toBe(false)
      expect(typeof result.current.updateServiceWorker).toBe('function')
      expect(typeof result.current.dismissUpdate).toBe('function')
    })

    it('should check for existing service worker registration', async () => {
      renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(mockServiceWorker.getRegistration).toHaveBeenCalled()
      })
    })

    it('should handle missing serviceWorker API gracefully', () => {
      // Remove serviceWorker from navigator
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      })

      const { result } = renderHook(() => useServiceWorker())

      // Should not throw and return default state
      expect(result.current.needRefresh).toBe(false)
      expect(result.current.offlineReady).toBe(false)
    })
  })

  describe('needRefresh detection', () => {
    it('should set needRefresh when waiting worker exists', async () => {
      mockRegistration.waiting = { postMessage: vi.fn() }

      const { result } = renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(result.current.needRefresh).toBe(true)
      })
    })

    it('should track installing worker state changes', async () => {
      const mockInstallingWorker = {
        state: 'installing',
        addEventListener: vi.fn(),
      }
      mockRegistration.installing = mockInstallingWorker
      mockServiceWorker.controller = {} // Simulate existing controller

      renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(mockInstallingWorker.addEventListener).toHaveBeenCalledWith(
          'statechange',
          expect.any(Function)
        )
      })
    })
  })

  describe('dismissUpdate', () => {
    it('should set needRefresh to false', async () => {
      mockRegistration.waiting = { postMessage: vi.fn() }

      const { result } = renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(result.current.needRefresh).toBe(true)
      })

      act(() => {
        result.current.dismissUpdate()
      })

      expect(result.current.needRefresh).toBe(false)
    })
  })

  describe('updateServiceWorker', () => {
    it('should clear all caches', async () => {
      const { result } = renderHook(() => useServiceWorker())

      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(global.caches.keys).toHaveBeenCalled()
      expect(global.caches.delete).toHaveBeenCalledWith('cache1')
      expect(global.caches.delete).toHaveBeenCalledWith('cache2')
    })

    it('should unregister all service workers', async () => {
      const mockUnregister = vi.fn().mockResolvedValue(true)
      mockServiceWorker.getRegistrations.mockResolvedValue([
        { unregister: mockUnregister },
        { unregister: mockUnregister },
      ])

      const { result } = renderHook(() => useServiceWorker())

      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(mockUnregister).toHaveBeenCalledTimes(2)
    })

    it('should reload the page', async () => {
      const { result } = renderHook(() => useServiceWorker())

      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(window.location.reload).toHaveBeenCalled()
    })

    it('should handle errors gracefully and still reload', async () => {
      global.caches.keys.mockRejectedValue(new Error('Cache error'))

      const { result } = renderHook(() => useServiceWorker())

      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(window.location.reload).toHaveBeenCalled()
    })
  })
})
