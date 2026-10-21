// REMARKS too long for their box (OpenVolley 4d4277be, field-spec 8: never
// truncate): the sheet's REMARKS were a 10 px text box whose text scrolled out
// of sight, and the PDF printed only what fitted, without a word. The text
// now shrinks to fit, down to 6 px; still too long, the box starts with
// "Remarks continue on page n.", the window warns above the sheet, and the
// PDF prints the whole text on a page of its own after the sheet.
// jsdom has no layout: the box is 100 px high and the text as high as its
// font size times its number of 60-character lines.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

const proto = HTMLTextAreaElement.prototype
const saved = {
  scrollHeight: Object.getOwnPropertyDescriptor(proto, 'scrollHeight') || Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(proto, 'clientHeight') || Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
}

let Sheet, App, addRemarksPages
beforeAll(async () => {
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return 100 } })
  Object.defineProperty(proto, 'scrollHeight', {
    configurable: true,
    get() { return Math.ceil(this.value.length / 60) * (parseFloat(this.style.fontSize) || 10) }
  })
  await import('../../i18n')
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
  const app = await import('../../../scoresheet_pdf_beach/App.tsx')
  App = app.default
  addRemarksPages = app.addRemarksPages
})
afterAll(() => {
  Object.defineProperty(proto, 'clientHeight', { configurable: true, ...saved.clientHeight })
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, ...saved.scrollHeight })
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

// The video match with its own remarks; its MTO line comes after them
const withRemarks = (remarks) => {
  const m = buildVideoMatch()
  m.match = { ...m.match, remarks }
  return m
}
const box = () => screen.getByTestId('remarks-text')

describe('score sheet REMARKS', () => {
  it('a text that fits at 10 px stays at 10 px, no notice', () => {
    const onClipped = vi.fn()
    render(<Sheet matchData={withRemarks('Rain delay')} onRemarksClipped={onClipped} />)
    expect(box().style.fontSize).toBe('10px')
    expect(screen.queryByTestId('remarks-continued')).toBeNull()
    expect(onClipped).not.toHaveBeenCalledWith(expect.objectContaining({ text: expect.any(String) }))
  })

  it('a longer text shrinks until all of it fits', () => {
    // these and the MTO line: 13 lines, 130 px at 10 px, 97.5 px at 7.5 px
    render(<Sheet matchData={withRemarks('x'.repeat(600))} />)
    const px = parseFloat(box().style.fontSize)
    expect(px).toBeLessThan(10)
    expect(px).toBeGreaterThanOrEqual(6)
    expect(box().scrollHeight).toBeLessThanOrEqual(100)
    expect(screen.queryByTestId('remarks-continued')).toBeNull()
  })

  it('a text too long at 6 px: "Remarks continue on page 3." and the whole text handed to the window', () => {
    const onClipped = vi.fn()
    const long = 'Long remark. '.repeat(100)
    render(<Sheet matchData={withRemarks(long)} onRemarksClipped={onClipped} />)
    expect(box().style.fontSize).toBe('6px')
    // the sheet's pages 1 and 2 (no BMP page): the remarks on page 3
    expect(screen.getByTestId('remarks-continued').textContent).toBe('Remarks continue on page 3.')
    const last = onClipped.mock.calls.at(-1)[0]
    expect(last.page).toBe(3)
    expect(last.text.startsWith(long.trim())).toBe(true)
    expect(last.text).toMatch(/Start Time: 11:42:10, 3rd Set/)
  })

  it('the window warns above the sheet (not on it)', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/scoresheet_beach.html')
    const { container } = render(<App matchData={withRemarks('Long remark. '.repeat(100))} />)
    const warning = screen.getByTestId('remarks-clipped-warning')
    expect(warning.textContent).toBe('REMARKS: the text does not fit the box; the PDF prints all of it on page 3.')
    expect(container.querySelector('#page-1').contains(warning)).toBe(false)
  })
})

describe('addRemarksPages: the whole REMARKS text after the sheet', () => {
  const fakePdf = () => {
    const calls = []
    return {
      calls,
      addPage: () => calls.push(['page']),
      setFontSize: () => {},
      // 60 characters a line
      splitTextToSize: (text) => text.match(/.{1,60}/g) || [],
      text: (t) => calls.push(['text', t])
    }
  }

  it('one page, its title and every line of the text', () => {
    const pdf = fakePdf()
    addRemarksPages(pdf, 'a'.repeat(130), 'game7_Tour_2026-10-08')
    expect(pdf.calls.filter(c => c[0] === 'page')).toHaveLength(1)
    expect(pdf.calls.map(c => c[1])).toEqual([undefined, 'REMARKS (continued from the scoresheet)', 'game7_Tour_2026-10-08', ['a'.repeat(60), 'a'.repeat(60), 'a'.repeat(10)]])
  })

  it('a text longer than a page goes on over the next pages, nothing left out', () => {
    const pdf = fakePdf()
    addRemarksPages(pdf, 'b'.repeat(60 * 80), 'title')
    const pages = pdf.calls.filter(c => c[0] === 'page').length
    expect(pages).toBeGreaterThan(1)
    const printed = pdf.calls.filter(c => Array.isArray(c[1])).flatMap(c => c[1])
    expect(printed).toHaveLength(80)
    expect(pdf.calls.map(c => c[1])).toContain('REMARKS (continued)')
  })
})
