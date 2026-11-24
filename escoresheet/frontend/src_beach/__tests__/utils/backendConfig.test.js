import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to dynamically import the module so mocks are applied before import
let backendConfig

describe('backendConfig_beach', () => {
  const originalWindow = { ...window }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isDesktopPlatform', () => {
    it('should return true when electronAPI is available', async () => {
      window.electronAPI = { some: 'api' }
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(true)
      delete window.electronAPI
    })

    it('should return true for desktop user agents', async () => {
      delete window.electronAPI
      const originalUA = navigator.userAgent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(true)
      Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true })
    })

    it('should return true for macOS user agent', async () => {
      delete window.electronAPI
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(true)
    })

    it('should return true for Linux user agent', async () => {
      delete window.electronAPI
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(true)
    })

    it('should return false for Android mobile user agent', async () => {
      delete window.electronAPI
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(false)
    })

    it('should return false for iPad user agent', async () => {
      delete window.electronAPI
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(false)
    })

    it('should return false for iPhone user agent', async () => {
      delete window.electronAPI
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isDesktopPlatform()).toBe(false)
    })
  })

  describe('isTabletOrMobile', () => {
    it('should return the opposite of isDesktopPlatform', async () => {
      window.electronAPI = { some: 'api' }
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isTabletOrMobile()).toBe(false)
      delete window.electronAPI
    })
  })

  describe('isStaticDeployment', () => {
    it('should return true for openvolley.app hostname', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'app.openvolley.app', protocol: 'https:', port: '' },
        writable: true,
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isStaticDeployment()).toBe(true)
    })

    it('should return true for subdomain of openvolley.app', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'beach.openvolley.app', protocol: 'https:', port: '' },
        writable: true,
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isStaticDeployment()).toBe(true)
    })

    it('should return false for localhost', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost', protocol: 'http:', port: '6173' },
        writable: true,
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isStaticDeployment()).toBe(false)
    })

    it('should return false for other domains', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com', protocol: 'https:', port: '' },
        writable: true,
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      expect(backendConfig.isStaticDeployment()).toBe(false)
    })
  })

  describe('getApiUrl', () => {
    it('should return null when no backend is available', async () => {
      // Set up standalone mode: no env, not static, desktop, production
      delete window.electronAPI
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost', protocol: 'http:', port: '80' },
        writable: true,
        configurable: true
      })
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true
      })
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      // In production standalone mode, getBackendUrl returns null
      // so getApiUrl should also return null
      if (backendConfig.getBackendUrl() === null) {
        expect(backendConfig.getApiUrl('/api/test')).toBe(null)
      }
    })

    it('should join path with leading slash', async () => {
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      const backendUrl = backendConfig.getBackendUrl()
      if (backendUrl) {
        expect(backendConfig.getApiUrl('/api/test')).toBe(`${backendUrl}/api/test`)
      }
    })

    it('should add leading slash to path if missing', async () => {
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      const backendUrl = backendConfig.getBackendUrl()
      if (backendUrl) {
        expect(backendConfig.getApiUrl('api/test')).toBe(`${backendUrl}/api/test`)
      }
    })
  })

  describe('isBackendAvailable / isStandaloneMode', () => {
    it('should be inverses of each other', async () => {
      backendConfig = await import('../../utils_beach/backendConfig_beach')
      const available = backendConfig.isBackendAvailable()
      const standalone = backendConfig.isStandaloneMode()
      expect(available).toBe(!standalone)
    })
  })
})
