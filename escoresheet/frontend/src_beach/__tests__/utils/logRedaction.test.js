import { describe, it, expect } from 'vitest'
import { isSensitiveTarget, redactScreenText, installGlobalEventCapture, uninstallGlobalEventCapture } from '../../utils_beach/eventCapture_beach'
import { isSecretEntry, initComprehensiveLogger, getBufferedLogs } from '../../utils_beach/comprehensiveLogger_beach'

function field(attrs = {}) {
  const el = document.createElement('input')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe('isSensitiveTarget', () => {
  it('treats a nameless password field as secret (the sign-in field)', () => {
    expect(isSensitiveTarget(field({ type: 'password' }))).toBe(true)
  })

  it('treats a PIN field by its label, placeholder or autocomplete as secret', () => {
    expect(isSensitiveTarget(field({ 'aria-label': 'Approval PIN' }))).toBe(true)
    expect(isSensitiveTarget(field({ placeholder: 'PIN' }))).toBe(true)
    expect(isSensitiveTarget(field({ autocomplete: 'one-time-code' }))).toBe(true)
    expect(isSensitiveTarget(field({ autocomplete: 'current-password' }))).toBe(true)
  })

  it('treats any field inside [data-sensitive] as secret', () => {
    const box = document.createElement('div')
    box.setAttribute('data-sensitive', '')
    const el = field({ type: 'text' })
    box.appendChild(el)
    expect(isSensitiveTarget(el)).toBe(true)
  })

  it('leaves ordinary fields alone', () => {
    expect(isSensitiveTarget(field({ type: 'text', name: 'lastName' }))).toBe(false)
    expect(isSensitiveTarget(field({ type: 'email', autocomplete: 'email' }))).toBe(false)
    expect(isSensitiveTarget(null)).toBe(false)
  })
})

describe('isSecretEntry', () => {
  it('flags stored entries typed into a password or PIN field', () => {
    expect(isSecretEntry({ target: { type: 'password', name: null } })).toBe(true)
    expect(isSecretEntry({ target: { type: 'text', ariaLabel: 'Approval PIN' } })).toBe(true)
  })

  it('keeps other entries', () => {
    expect(isSecretEntry({ target: { type: 'text', name: 'teamName' } })).toBe(false)
    expect(isSecretEntry({ target: null })).toBe(false)
    expect(isSecretEntry({})).toBe(false)
  })
})

describe('typed secrets', () => {
  it('the value, length and keys typed into a nameless password field are not logged', () => {
    initComprehensiveLogger(null, null)
    installGlobalEventCapture()
    try {
      const pw = field({ type: 'password' })
      document.body.append(pw)
      pw.value = 'hunter2secret'
      pw.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }))
      pw.dispatchEvent(new Event('input', { bubbles: true }))
      pw.dispatchEvent(new Event('change', { bubbles: true }))
      const mine = getBufferedLogs().filter(e => e.target?.type === 'password')
      expect(mine.map(e => e.type)).toEqual(expect.arrayContaining(['keydown', 'input', 'change']))
      const text = JSON.stringify(mine)
      expect(text).not.toContain('hunter2secret')
      expect(text).not.toContain('KeyT')
      expect(mine.find(e => e.type === 'input').payload.valueLength).toBe(null)
      pw.remove()
    } finally {
      uninstallGlobalEventCapture()
    }
  })
})

describe('clicked text', () => {
  it('drops PIN-like digit runs (grouped or not), keeps scores and jersey numbers', () => {
    expect(redactScreenText('Game PIN 771234')).toBe('Game PIN [digits]')
    expect(redactScreenText('771 234')).toBe('[digits]')
    expect(redactScreenText('Referee 4 8 2 9 1 3')).toBe('Referee [digits]')
    expect(redactScreenText('21:19 · #2 · Set 3')).toBe('21:19 · #2 · Set 3')
    expect(redactScreenText(null)).toBe(null)
  })

  it('a click on a PIN on screen, or on a tablet link with ?pin=, logs neither', () => {
    initComprehensiveLogger(null, null)
    installGlobalEventCapture()
    try {
      const pin = document.createElement('div')
      pin.textContent = 'Game PIN: 771234'
      pin.setAttribute('aria-label', 'Copy 771234')
      const link = document.createElement('a')
      link.href = 'https://beach.openvolley.app/referee?match=x&pin=482913'
      link.textContent = 'Referee'
      document.body.append(pin, link)
      pin.click()
      link.addEventListener('click', (e) => e.preventDefault())
      link.click()
      const text = JSON.stringify(getBufferedLogs())
      expect(text).not.toContain('771234')
      expect(text).not.toContain('482913')
      expect(text).toContain('Game PIN: [digits]')
      pin.remove()
      link.remove()
    } finally {
      uninstallGlobalEventCapture()
    }
  })
})
