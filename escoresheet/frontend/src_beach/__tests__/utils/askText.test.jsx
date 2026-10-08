// askText: the app's own dialog for a line of text, never window.prompt()
// (OpenVolley c79b7b65). prompt() is left to whatever the webview does with
// it (the desktop app's dialog plugin, Android's WebView) and blocks the page
// where it works. The match PIN in MatchSetup was the last one.
import { describe, it, expect, afterEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import { askText } from '../../utils_beach/askText_beach'

const frontend = resolve(__dirname, '../../..')
const ROOTS = ['src_beach', 'scoresheet_pdf_beach']

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(jsx?|tsx?|mjs)$/.test(name) && !/\.test\.(jsx?|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

// Comments may talk about prompt() freely; block comments keep their line breaks.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

// `prompt(`, `window.prompt(`, `globalThis.prompt (`, but not `x.prompt(` or `rePrompt(`
const NATIVE_PROMPT = /(?:^|[^\w$.])(?:(?:window|globalThis|self)\s*\.\s*)?prompt\s*\(/

describe('no native prompt() in the app', () => {
  it('the pattern catches the forms and spares the safe ones', () => {
    for (const bad of ["const matchPin = prompt('Enter a PIN')", 'window.prompt("x")', ' globalThis.prompt ("x")']) {
      expect(NATIVE_PROMPT.test(bad), bad).toBe(true)
    }
    for (const ok of ['await askText({ title })', 'rePrompt(x)', 'this.prompt(x)', 'enterPinPrompt']) {
      expect(NATIVE_PROMPT.test(ok), ok).toBe(false)
    }
  })

  it('every source file is free of it, and every askText() is awaited', () => {
    const offenders = []
    const unawaited = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(resolve(frontend, root))) {
        const rel = relative(frontend, file)
        withoutComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
          if (NATIVE_PROMPT.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
          for (const m of line.matchAll(/(\S*\s*)\baskText\s*\(/g)) {
            if (rel.endsWith('askText_beach.jsx')) continue
            if (!/(^|[^\w$])await\s*$/.test(m[1])) unawaited.push(`${rel}:${i + 1}: ${line.trim()}`)
          }
        })
      }
    }
    expect(offenders, 'use `await askText({...})` from utils_beach/askText_beach').toEqual([])
    expect(unawaited).toEqual([])
  })

  it('MatchSetup asks for the match PIN before the transaction (a cancel creates no teams)', () => {
    const src = readFileSync(resolve(frontend, 'src_beach/components_beach/MatchSetup_beach.jsx'), 'utf8')
    const create = src.slice(src.indexOf('async function createMatch()'))
    const ask = create.indexOf('await askText(')
    const tx = create.indexOf('await db.transaction(')
    expect(ask).toBeGreaterThan(-1)
    expect(ask).toBeLessThan(tx)
    expect(create.slice(ask, tx)).toMatch(/if \(matchPin === null\) return/)
  })
})

describe('askText', () => {
  afterEach(async () => {
    // let a settled dialog unmount its root
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
  })

  function ask(opts) {
    let answer = 'pending'
    const p = askText(opts).then((a) => { answer = a })
    return { p, get: () => answer }
  }

  it('shows the title, the message, a labelled field with the focus; Enter answers the typed text', async () => {
    const a = ask({ title: 'Match PIN code', message: 'Enter a PIN code to protect this match (required):', label: 'PIN code', confirmLabel: 'Create match' })
    const input = await screen.findByLabelText('PIN code')
    expect(screen.getByRole('dialog', { name: 'Match PIN code' })).toBeInTheDocument()
    expect(screen.getByTestId('ask-text-message').textContent).toBe('Enter a PIN code to protect this match (required):')
    await waitFor(() => expect(input).toHaveFocus())
    expect(a.get()).toBe('pending')
    fireEvent.change(input, { target: { value: '4711' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    await a.p
    expect(a.get()).toBe('4711')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the confirm button answers the text, possibly empty', async () => {
    const a = ask({ title: 'Match PIN code', confirmLabel: 'Create match' })
    const accept = await screen.findByRole('button', { name: 'Create match' })
    await act(async () => { fireEvent.click(accept) })
    await a.p
    expect(a.get()).toBe('')
  })

  it('Cancel answers null', async () => {
    const a = ask({ title: 'Match PIN code', cancelLabel: 'Cancel' })
    fireEvent.change(await screen.findByTestId('ask-text-input'), { target: { value: '12' } })
    await act(async () => { fireEvent.click(screen.getByTestId('ask-text-cancel')) })
    await a.p
    expect(a.get()).toBeNull()
  })

  it('Escape answers null', async () => {
    const a = ask({ title: 'Match PIN code' })
    const input = await screen.findByTestId('ask-text-input')
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }) })
    await a.p
    expect(a.get()).toBeNull()
  })
})
