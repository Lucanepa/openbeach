import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ScaleProvider, useScale } from '../../contexts_beach/ScaleContext_beach'

describe('ScaleContext_beach', () => {
  beforeEach(() => {
    window.localStorage.getItem.mockReturnValue(null)
    window.localStorage.setItem.mockImplementation(() => {})
    window.localStorage.removeItem.mockImplementation(() => {})
  })

  const wrapper = ({ children }) => <ScaleProvider>{children}</ScaleProvider>

  describe('useScale outside provider', () => {
    it('should throw an error when used outside ScaleProvider', () => {
      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useScale())).toThrow('useScale must be used within a ScaleProvider')
      consoleSpy.mockRestore()
    })
  })

  describe('ScaleProvider', () => {
    it('should provide scale context to children', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current).toBeDefined()
      expect(typeof result.current.scaleFactor).toBe('number')
      expect(typeof result.current.vmin).toBe('function')
      expect(typeof result.current.setUserScaleOverride).toBe('function')
      expect(typeof result.current.resetToAuto).toBe('function')
    })

    it('should have default scale factor of 1.0', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current.scaleFactor).toBe(1.0)
    })

    it('should have null userScaleOverride by default', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current.userScaleOverride).toBe(null)
    })
  })

  describe('vmin function', () => {
    it('should convert vmin values to pixels', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      // vmin(value) = (viewportVmin * value/100) * scaleFactor
      // With default scale 1.0, vmin(10) should be viewportVmin * 0.1
      const val = result.current.vmin(10)
      const expected = result.current.viewportVmin * 0.1 * result.current.scaleFactor
      expect(val).toBeCloseTo(expected, 2)
    })

    it('should return 0 for vmin(0)', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current.vmin(0)).toBe(0)
    })

    it('should scale proportionally', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      const v5 = result.current.vmin(5)
      const v10 = result.current.vmin(10)
      expect(v10).toBeCloseTo(v5 * 2, 2)
    })
  })

  describe('setUserScaleOverride', () => {
    it('should update scale factor', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(1.2)
      })
      expect(result.current.scaleFactor).toBe(1.2)
      expect(result.current.userScaleOverride).toBe(1.2)
    })

    it('should persist to localStorage', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(0.8)
      })
      expect(window.localStorage.setItem).toHaveBeenCalledWith('userScaleOverride', '0.8')
    })

    it('should remove from localStorage when set to null', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(null)
      })
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('userScaleOverride')
    })
  })

  describe('resetToAuto', () => {
    it('should reset scale to default', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(1.3)
      })
      expect(result.current.scaleFactor).toBe(1.3)

      act(() => {
        result.current.resetToAuto()
      })
      expect(result.current.scaleFactor).toBe(1.0)
      expect(result.current.userScaleOverride).toBe(null)
    })

    it('should remove localStorage entry', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.resetToAuto()
      })
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('userScaleOverride')
    })
  })

  describe('scale clamping', () => {
    it('should clamp scale factor to minimum 0.5', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(0.1)
      })
      expect(result.current.scaleFactor).toBe(0.5)
    })

    it('should clamp scale factor to maximum 1.5', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(2.0)
      })
      expect(result.current.scaleFactor).toBe(1.5)
    })

    it('should allow scale factor at boundaries', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      act(() => {
        result.current.setUserScaleOverride(0.5)
      })
      expect(result.current.scaleFactor).toBe(0.5)

      act(() => {
        result.current.setUserScaleOverride(1.5)
      })
      expect(result.current.scaleFactor).toBe(1.5)
    })
  })

  describe('saved override', () => {
    it('should read saved override from localStorage on mount', () => {
      window.localStorage.getItem.mockReturnValue('1.3')
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current.scaleFactor).toBe(1.3)
      expect(result.current.userScaleOverride).toBe(1.3)
    })
  })

  describe('viewport', () => {
    it('should expose viewport dimensions', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      expect(result.current.viewport).toBeDefined()
      expect(typeof result.current.viewport.width).toBe('number')
      expect(typeof result.current.viewport.height).toBe('number')
    })

    it('should expose viewportVmin as the smaller dimension', () => {
      const { result } = renderHook(() => useScale(), { wrapper })
      const { width, height } = result.current.viewport
      expect(result.current.viewportVmin).toBe(Math.min(width, height))
    })
  })
})
