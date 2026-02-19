import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateQRCodeUrl,
  generateQRCodeLocal,
  buildAppUrls,
  buildWebSocketUrl,
  buildCloudUrls,
  isSecureContext,
  getServerStatus,
  getConnectionCount,
  copyToClipboard
} from '../../utils_beach/networkInfo_beach'

describe('networkInfo_beach', () => {
  describe('generateQRCodeUrl', () => {
    it('should return a URL with the encoded text', () => {
      const url = generateQRCodeUrl('https://example.com')
      expect(url).toContain('https%3A%2F%2Fexample.com')
      expect(url).toContain('api.qrserver.com')
    })

    it('should use default size of 200', () => {
      const url = generateQRCodeUrl('test')
      expect(url).toContain('size=200x200')
    })

    it('should use custom size', () => {
      const url = generateQRCodeUrl('test', 400)
      expect(url).toContain('size=400x400')
    })

    it('should encode special characters', () => {
      const url = generateQRCodeUrl('hello world&foo=bar')
      expect(url).toContain('hello%20world%26foo%3Dbar')
    })
  })

  describe('generateQRCodeLocal', () => {
    it('should return the same URL as generateQRCodeUrl (fallback)', async () => {
      const result = await generateQRCodeLocal('test', 300)
      const expected = generateQRCodeUrl('test', 300)
      expect(result).toBe(expected)
    })
  })

  describe('buildAppUrls', () => {
    it('should build correct URLs for all apps', () => {
      const urls = buildAppUrls('192.168.1.100', 6173)
      expect(urls.main).toBe('http://192.168.1.100:6173')
      expect(urls.referee).toBe('http://192.168.1.100:6173/referee')
      expect(urls.livescore).toBe('http://192.168.1.100:6173/livescore')
    })

    it('should use custom protocol', () => {
      const urls = buildAppUrls('192.168.1.100', 443, 'https')
      expect(urls.main).toBe('https://192.168.1.100:443')
      expect(urls.referee).toBe('https://192.168.1.100:443/referee')
      expect(urls.livescore).toBe('https://192.168.1.100:443/livescore')
    })

    it('should default to http protocol', () => {
      const urls = buildAppUrls('10.0.0.1', 8080)
      expect(urls.main.startsWith('http://')).toBe(true)
    })
  })

  describe('buildWebSocketUrl', () => {
    it('should build ws URL by default', () => {
      const url = buildWebSocketUrl('192.168.1.100')
      expect(url).toBe('ws://192.168.1.100:8080')
    })

    it('should use custom port', () => {
      const url = buildWebSocketUrl('192.168.1.100', 9090)
      expect(url).toBe('ws://192.168.1.100:9090')
    })

    it('should use wss when secure is true', () => {
      const url = buildWebSocketUrl('192.168.1.100', 8080, true)
      expect(url).toBe('wss://192.168.1.100:8080')
    })

    it('should use ws when secure is false', () => {
      const url = buildWebSocketUrl('192.168.1.100', 8080, false)
      expect(url).toBe('ws://192.168.1.100:8080')
    })
  })

  describe('buildCloudUrls', () => {
    it('should build correct URLs from backend URL', () => {
      const urls = buildCloudUrls('https://api.example.com')
      expect(urls.main).toBe('https://api.example.com')
      expect(urls.referee).toBe('https://api.example.com/referee')
      expect(urls.livescore).toBe('https://api.example.com/livescore')
    })

    it('should remove trailing slash', () => {
      const urls = buildCloudUrls('https://api.example.com/')
      expect(urls.main).toBe('https://api.example.com')
      expect(urls.referee).toBe('https://api.example.com/referee')
    })

    it('should return null for null input', () => {
      expect(buildCloudUrls(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(buildCloudUrls(undefined)).toBe(null)
    })

    it('should return null for empty string', () => {
      expect(buildCloudUrls('')).toBe(null)
    })
  })

  describe('isSecureContext', () => {
    it('should return true for https protocol', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', hostname: 'example.com' },
        writable: true,
        configurable: true
      })
      expect(isSecureContext()).toBe(true)
    })

    it('should return true for localhost even on http', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: 'localhost' },
        writable: true,
        configurable: true
      })
      expect(isSecureContext()).toBe(true)
    })

    it('should return false for http on non-localhost', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: '192.168.1.100' },
        writable: true,
        configurable: true
      })
      expect(isSecureContext()).toBe(false)
    })
  })

  describe('getServerStatus', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: 'localhost', port: '6173' },
        writable: true,
        configurable: true
      })
    })

    it('should return running status on successful fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.0', uptime: 100 })
      })

      const result = await getServerStatus()
      expect(result.running).toBe(true)
      expect(result.version).toBe('1.0')
      expect(result.uptime).toBe(100)
    })

    it('should return not running on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      const result = await getServerStatus()
      expect(result.running).toBe(false)
      expect(result.error).toBe('Server not responding')
    })

    it('should return not running on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await getServerStatus()
      expect(result.running).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('getConnectionCount', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', hostname: 'localhost', port: '6173' },
        writable: true,
        configurable: true
      })
    })

    it('should return connection data on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalClients: 5, matchSubscriptions: { m1: 3 } })
      })

      const result = await getConnectionCount()
      expect(result.totalClients).toBe(5)
      expect(result.matchSubscriptions.m1).toBe(3)
    })

    it('should return defaults on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      const result = await getConnectionCount()
      expect(result.totalClients).toBe(0)
      expect(result.matchSubscriptions).toEqual({})
    })

    it('should return defaults on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await getConnectionCount()
      expect(result.totalClients).toBe(0)
      expect(result.matchSubscriptions).toEqual({})
    })
  })

  describe('copyToClipboard', () => {
    it('should use navigator.clipboard.writeText when available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true
      })

      const result = await copyToClipboard('hello')
      expect(writeText).toHaveBeenCalledWith('hello')
      expect(result.success).toBe(true)
    })

    it('should return error on clipboard failure', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
        writable: true,
        configurable: true
      })

      const result = await copyToClipboard('hello')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Permission denied')
    })
  })
})
