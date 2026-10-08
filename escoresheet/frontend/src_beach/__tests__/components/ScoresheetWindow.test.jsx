// The scoresheet window (scoresheet_pdf_beach/App.tsx). OpenBeach video
// 2026-10-08 08:13 / 08:36: the approval's window first showed the
// interactive preview (Download PDF, zoom) for 2 s, then "Generating…", and
// nothing said that closing it cancels the approval; the preview jumped from
// 100 % to 125 %.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

let App
beforeAll(async () => {
  await import('../../i18n')
  App = (await import('../../../scoresheet_pdf_beach/App.tsx')).default
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

describe('the scoresheet window', () => {
  it('approval (action=getBlob): "Generating…" and "closing cancels" from the first paint, no Download / zoom', () => {
    vi.useFakeTimers() // the capture starts after 1.5 s: not in this test
    window.history.replaceState(null, '', '/scoresheet_beach.html?action=getBlob')
    render(<App matchData={buildVideoMatch()} />)
    expect(screen.getByText('Generating PDF…')).toBeInTheDocument()
    expect(screen.getByText('Closing this window cancels the match approval.')).toBeInTheDocument()
    expect(screen.queryByText('Download PDF')).toBeNull()
    expect(screen.queryByTitle('Zoom in')).toBeNull()
  })

  it('preview: Download PDF and zoom, no overlay; the pages are shown only once fitted (no zoom jump)', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/scoresheet_beach.html')
    const { container } = render(<App matchData={buildVideoMatch()} />)
    expect(screen.getByText('Download PDF')).toBeInTheDocument()
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument()
    expect(screen.queryByText('Generating PDF…')).toBeNull()
    const content = container.querySelector('.scoresheet-content')
    // fitted in a layout effect, before the first paint
    expect(content.style.visibility).toBe('visible')
  })

  it('the sheet is filled before the first paint (no empty "Team / Team" template)', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/scoresheet_beach.html')
    render(<App matchData={buildVideoMatch()} />)
    expect(screen.getAllByDisplayValue('Schmidt / Fischer').length).toBeGreaterThan(0)
    // act() flushes both kinds of effect: the contract is that the sheet
    // fills itself in a layout effect, which runs before the browser paints
    const src = readFileSync(resolve(__dirname, '../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx'), 'utf8')
    const init = src.indexOf('// Initialize data from currentMatchData')
    expect(src.slice(init, init + 400)).toMatch(/useLayoutEffect\(\(\) => \{/)
  })
})
