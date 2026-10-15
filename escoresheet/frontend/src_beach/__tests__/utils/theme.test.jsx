import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen, act } from '@testing-library/react'
import { THEME_KEY, applyTheme, getTheme, initTheme, setTheme, useTheme } from '../../utils_beach/theme_beach'
import { TEAM_COLOUR_MARK, teamBoxStyle } from '../../utils_beach/teamColours_beach'

// Light / dark / e-ink: one value in localStorage, shown as <html data-theme>.
// The boot script in vite.config.js reads the same key before the first paint.

function Probe() {
  return <span data-testid="theme">{useTheme()}</span>
}

describe('colour theme', () => {
  beforeEach(() => {
    // setup.js stubs localStorage with empty mocks: back them with a store
    const store = new Map()
    localStorage.getItem.mockImplementation(k => (store.has(k) ? store.get(k) : null))
    localStorage.setItem.mockImplementation((k, v) => { store.set(k, String(v)) })
    document.documentElement.removeAttribute('data-theme')
  })

  it('is light by default and for an unknown value', () => {
    expect(getTheme()).toBe('light')
    localStorage.setItem(THEME_KEY, 'neon')
    expect(getTheme()).toBe('light')
  })

  it('stores the choice and sets data-theme (none for light)', () => {
    setTheme('eink')
    expect(localStorage.getItem(THEME_KEY)).toBe('eink')
    expect(document.documentElement.getAttribute('data-theme')).toBe('eink')
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    setTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('treats a bad value as light', () => {
    setTheme('neon')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    applyTheme('neon')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('re-renders on a change here and on one from another tab', () => {
    render(<Probe />)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    act(() => setTheme('dark'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    act(() => {
      localStorage.setItem(THEME_KEY, 'eink')
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    })
    expect(screen.getByTestId('theme').textContent).toBe('eink')
  })

  it('initTheme applies the stored theme without the boot script', () => {
    localStorage.setItem(THEME_KEY, 'eink')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('eink')
    localStorage.setItem(THEME_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('every page entry calls initTheme', () => {
    for (const entry of ['main', 'referee-main', 'livescore-main', 'scoreboard-main', 'scoresheet-main', 'admin-main']) {
      const src = readFileSync(resolve(__dirname, `../../${entry}_beach.jsx`), 'utf-8')
      expect(src, entry).toMatch(/^initTheme\(\)$/m)
    }
  })

  it('the boot script reads the same key and values', () => {
    const config = readFileSync(resolve(__dirname, '../../../vite.config.js'), 'utf-8')
    expect(config).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(config).toContain("t==='dark'||t==='eink'")
  })

  it('team colour boxes carry the mark the themes look for', () => {
    expect(teamBoxStyle('#3b82f6')).toMatchObject(TEAM_COLOUR_MARK)
    expect(teamBoxStyle('#ffffff')).toMatchObject(TEAM_COLOUR_MARK)
    expect(teamBoxStyle(null)).toEqual({})
    const css = readFileSync(resolve(__dirname, '../../tailwind_beach.css'), 'utf-8')
    expect(css).toContain(`[style*='${Object.keys(TEAM_COLOUR_MARK)[0]}']`)
  })
})
