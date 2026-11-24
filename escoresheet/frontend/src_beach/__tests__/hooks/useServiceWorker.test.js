import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useServiceWorker, applyServiceWorkerUpdate } from '../../hooks_beach/useServiceWorker_beach'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('useServiceWorker', () => {
  let originalNavigator
  let originalLocation
  let mockServiceWorker
  let mockRegistration
  // listeners the code under test added to navigator.serviceWorker / the registration
  let swListeners
  let regListeners

  const fire = (listeners, type) => (listeners[type] || []).slice().forEach((cb) => cb({ type }))

  beforeEach(() => {
    originalNavigator = global.navigator
    originalLocation = window.location
    swListeners = {}
    regListeners = {}

    mockRegistration = {
      waiting: null,
      installing: null,
      active: null,
      addEventListener: vi.fn((type, cb) => { (regListeners[type] ||= []).push(cb) }),
      removeEventListener: vi.fn((type, cb) => {
        regListeners[type] = (regListeners[type] || []).filter((x) => x !== cb)
      }),
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    }

    mockServiceWorker = {
      controller: null,
      getRegistration: vi.fn().mockResolvedValue(mockRegistration),
      getRegistrations: vi.fn().mockResolvedValue([mockRegistration]),
      addEventListener: vi.fn((type, cb, opts) => {
        const wrapped = opts?.once
          ? (e) => { swListeners[type] = swListeners[type].filter((x) => x !== wrapped); cb(e) }
          : cb
        ;(swListeners[type] ||= []).push(wrapped)
      }),
      removeEventListener: vi.fn((type, cb) => {
        swListeners[type] = (swListeners[type] || []).filter((x) => x !== cb)
      }),
    }

    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, serviceWorker: mockServiceWorker },
      writable: true,
      configurable: true,
    })

    global.caches = {
      keys: vi.fn().mockResolvedValue(['workbox-precache-v2', 'static-assets']),
      delete: vi.fn().mockResolvedValue(true),
    }

    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:5174/referee_beach.html?match=42', reload: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true })
    delete global.caches
    vi.clearAllMocks()
    vi.useRealTimers()
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
      Object.defineProperty(global, 'navigator', { value: {}, writable: true, configurable: true })

      const { result } = renderHook(() => useServiceWorker())

      expect(result.current.needRefresh).toBe(false)
      expect(result.current.offlineReady).toBe(false)
    })
  })

  // The app kept reloading itself: the hook reloaded the page on every
  // controllerchange, and with clients.claim() that is every time a worker
  // activates (first install, an update activating by itself, another window
  // tapping "Refresh to update" or clearing the cache).
  describe('never reloads the page by itself', () => {
    it('does not reload when a worker takes control of the page (first install, clients.claim())', async () => {
      renderHook(() => useServiceWorker())
      await waitFor(() => expect(mockRegistration.addEventListener).toHaveBeenCalled())

      act(() => {
        mockServiceWorker.controller = {}
        fire(swListeners, 'controllerchange')
      })

      expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('does not reload when an update activates (another window asked for it)', async () => {
      mockServiceWorker.controller = {}
      const { unmount } = renderHook(() => useServiceWorker())
      await waitFor(() => expect(mockRegistration.addEventListener).toHaveBeenCalled())

      act(() => { fire(swListeners, 'controllerchange') })
      unmount() // the home screen gave way to a match
      act(() => { fire(swListeners, 'controllerchange') })

      expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('leaves no listener behind after unmount', async () => {
      const { unmount } = renderHook(() => useServiceWorker())
      await waitFor(() => expect(mockRegistration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function)))

      unmount()

      expect(swListeners.controllerchange || []).toHaveLength(0)
      expect(regListeners.updatefound || []).toHaveLength(0)
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

    it('keeps listening for later updates when a worker is waiting at mount', async () => {
      mockRegistration.waiting = { postMessage: vi.fn() }

      renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(mockRegistration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function))
      })
    })

    it('should track installing worker state changes', async () => {
      const mockInstallingWorker = {
        state: 'installing',
        addEventListener: vi.fn(),
      }
      mockRegistration.installing = mockInstallingWorker
      mockServiceWorker.controller = {}

      renderHook(() => useServiceWorker())

      await waitFor(() => {
        expect(mockInstallingWorker.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
      })
    })

    it('an update that finishes installing shows the banner and waits (no reload)', async () => {
      mockServiceWorker.controller = {}
      const { result } = renderHook(() => useServiceWorker())
      await waitFor(() => expect(regListeners.updatefound).toHaveLength(1))

      let onState
      const worker = { state: 'installing', addEventListener: vi.fn((t, cb) => { onState = cb }) }
      mockRegistration.installing = worker
      act(() => { fire(regListeners, 'updatefound') })
      act(() => { worker.state = 'installed'; onState() })

      expect(result.current.needRefresh).toBe(true)
      expect(window.location.reload).not.toHaveBeenCalled()
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

  describe('updateServiceWorker ("Refresh to update")', () => {
    it('activates the waiting worker, then reloads this page only', async () => {
      const waiting = { postMessage: vi.fn(() => fire(swListeners, 'controllerchange')) }
      mockRegistration.waiting = waiting

      const { result } = renderHook(() => useServiceWorker())
      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('never wipes the caches or unregisters the workers (the next load would install a fresh worker that claims every open window)', async () => {
      mockRegistration.waiting = { postMessage: vi.fn(() => fire(swListeners, 'controllerchange')) }

      const { result } = renderHook(() => useServiceWorker())
      await act(async () => {
        await result.current.updateServiceWorker()
      })

      expect(global.caches.delete).not.toHaveBeenCalled()
      expect(mockServiceWorker.getRegistrations).not.toHaveBeenCalled()
      expect(mockRegistration.unregister).not.toHaveBeenCalled()
    })

    it('reloads after a timeout when controllerchange never comes', async () => {
      vi.useFakeTimers()
      mockRegistration.waiting = { postMessage: vi.fn() }

      const done = applyServiceWorkerUpdate({ timeoutMs: 4000 })
      await vi.advanceTimersByTimeAsync(4000)
      await done

      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('still reloads when no worker is waiting', async () => {
      mockServiceWorker.getRegistration.mockResolvedValue(undefined)

      await applyServiceWorkerUpdate()

      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('still reloads when the service worker API fails', async () => {
      mockServiceWorker.getRegistration.mockRejectedValue(new Error('boom'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await applyServiceWorkerUpdate()

      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })
  })
})

// The main build's worker (desktop app, vite preview / any https host of
// dist/): with registerType 'autoUpdate' workbox called skipWaiting(), so a new
// build's worker activated by itself and clients.claim() took over every open
// page; the hook's controllerchange listener then reloaded them all.
describe('vite.config.js service worker', () => {
  const config = readFileSync(resolve(frontendDir, 'vite.config.js'), 'utf8')

  it('waits for the scorer: prompt mode, no skipWaiting', () => {
    expect(config).toMatch(/registerType: 'prompt'/)
    expect(config).not.toMatch(/registerType: 'autoUpdate'/)
    expect(config).toMatch(/skipWaiting: false/)
  })
})
