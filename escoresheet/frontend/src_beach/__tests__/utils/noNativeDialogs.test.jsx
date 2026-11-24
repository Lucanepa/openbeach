// window.confirm / window.alert must not be used on the scoring screen.
//
// In the desktop app tauri-plugin-dialog replaces both with IPC calls that no
// capability allows: alert() shows nothing, and confirm() returns a Promise,
// which is truthy, so `if (confirm('Delete?'))` deleted without asking. Every
// question goes through utils_beach/askConfirm_beach.js (the in-app dialog).
// Ported from OpenVolley src/utils/__tests__/noNativeDialogs.test.jsx; the
// scan covers the scoring screen and its helpers (the rest of the app is
// ported file by file: MatchSetup_beach's prompt() goes with its own batch).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { UiHost } from '../../ui/volleyui/UiHost.jsx'
import { askConfirm } from '../../utils_beach/askConfirm_beach.js'

const src = resolve(__dirname, '../..')
const FILES = [
  'components_beach/Scoreboard_beach.jsx',
  'hooks_beach/useConfirmAction_beach.js',
  'utils_beach/scorerCorrections_beach.js'
]

// Comments may talk about confirm (…) freely. Block comments keep their line
// breaks so offender line numbers stay right.
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

// A call of the global confirm/alert/prompt: bare `confirm(`, `window.prompt(`…
// but not `x.confirm(`, `onConfirm(`, `confirmDialog(`, `handleAlert(`.
const NATIVE_DIALOG = /(?:^|[^\w$.])(?:(?:window|globalThis|self)\s*\.\s*)?(?:confirm|alert|prompt)\s*\(/

describe('no native confirm()/alert()/prompt() on the scoring screen', () => {
  it('the pattern catches the forms that broke and spares the safe ones', () => {
    for (const bad of ['if (confirm(t("x"))) {', 'window.confirm("x")', 'alert("x")', 'const pin = prompt(t("x"))']) {
      expect(NATIVE_DIALOG.test(bad), bad).toBe(true)
    }
    for (const ok of ['await askConfirm({ title })', 'confirmDialog({ title })', 'onConfirm()', 'showAlert(x)', 'toast.error(x)']) {
      expect(NATIVE_DIALOG.test(ok), ok).toBe(false)
    }
  })

  it('the scoring screen and its helpers are free of them', () => {
    const offenders = []
    for (const rel of FILES) {
      withoutComments(readFileSync(resolve(src, rel), 'utf8')).split('\n').forEach((line, i) => {
        if (NATIVE_DIALOG.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, 'use `await askConfirm({...})` from utils_beach, or showAlert/toast').toEqual([])
  })

  // `if (askConfirm(...))` would be the same bug again: a Promise is truthy.
  it('every askConfirm() call is awaited', () => {
    const unawaited = []
    for (const rel of FILES) {
      withoutComments(readFileSync(resolve(src, rel), 'utf8')).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(\S*\s*)\baskConfirm\s*\(/g)) {
          if (!/(^|[^\w$])await\s*$/.test(m[1])) unawaited.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(unawaited).toEqual([])
  })
})

describe('askConfirm', () => {
  it('waits for the user and answers true only on the confirm button', async () => {
    render(<UiHost />)
    let answer = 'pending'
    await act(async () => {
      askConfirm({ title: 'Delete this point event?', confirmLabel: 'Delete', tone: 'danger' }).then((a) => { answer = a })
    })
    expect(answer).toBe('pending')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete this point event?')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByText('Delete')) })
    expect(answer).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('answers false on cancel, with translated default labels', async () => {
    render(<UiHost />)
    let answer = 'pending'
    await act(async () => {
      askConfirm({ title: 'Continue?' }).then((a) => { answer = a })
    })
    expect(screen.getByTestId('confirm-accept').textContent).not.toBe('')
    await act(async () => { fireEvent.click(screen.getByTestId('confirm-cancel')) })
    expect(answer).toBe(false)
  })
})
