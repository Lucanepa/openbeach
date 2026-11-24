/**
 * Every SignaturePad in the app is rendered with `open` (it IS the modal;
 * without `open` it renders nothing: OpenVolley's B1 / B2, the scoreboard's
 * and the coin-toss roster's pads opened empty), and offers Sign on phone in
 * MatchEnd and CoinToss (OpenVolley d451686d).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('every SignaturePad is rendered with `open`', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '__tests__' || name === 'node_modules') continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.jsx$/.test(name)) files.push(p)
    }
  }
  walk(SRC)

  it('finds the pads of MatchEnd and CoinToss (both)', () => {
    const count = (f) => (readFileSync(join(SRC, 'components_beach', f), 'utf8').match(/<SignaturePad\b/g) || []).length
    expect(count('MatchEnd_beach.jsx')).toBe(1)
    expect(count('CoinToss_beach.jsx')).toBe(2)
  })

  it('each <SignaturePad ...> has an open prop, and a phone prop in MatchEnd and CoinToss', () => {
    const missing = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/<SignaturePad\b([\s\S]*?)\/>/g)) {
        const attrs = m[1]
        const where = `${f.slice(SRC.length + 1)}:${text.slice(0, m.index).split('\n').length}`
        if (!/\bopen[={\s]/.test(attrs)) missing.push(`${where} without open`)
        if (/components_beach\/(MatchEnd|CoinToss)_beach\.jsx$/.test(f) && !/\bphone=/.test(attrs)) missing.push(`${where} without phone`)
      }
    }
    expect(missing).toEqual([])
  })
})
