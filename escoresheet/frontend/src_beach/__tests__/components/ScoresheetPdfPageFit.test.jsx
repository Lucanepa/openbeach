// The PDF score sheet's pages fit their print area (2026-11-20). A page is a
// fixed 277 x 190 mm box with overflow hidden and the PDF captures exactly
// that box: page 2 was 19 px taller than the page for every match, and the
// PDF cut off the bottom of the APPROVAL box (the captains' post-match
// signatures) and the "Winner of Coin Toss" row. Page 2's layout now fits a
// match without coaches at full size; taller content (a match with coaches:
// page 1 34 px over, page 2 93 px) is scaled down from the top left until it
// fits (scoresheet_pdf_beach/components_beach/pageFit_beach.ts).
// jsdom has no layout: the wrapper's sizes are faked here; the real heights
// are checked in Chromium (ScoresheetPdfPageFitBrowser.test.js).
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

let Sheet, pageFitScale, fitPageContent, PAGE_FIT_TOLERANCE_PX, app
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
  ;({ pageFitScale, fitPageContent, PAGE_FIT_TOLERANCE_PX } = await import('../../../scoresheet_pdf_beach/components_beach/pageFit_beach.ts'))
  await import('../../i18n')
  app = await import('../../../scoresheet_pdf_beach/App.tsx')
})

// A page's content wrapper as the browser lays it out: `box` px high as the
// page's flex-1 child, its content `natural` px high once sized to it.
function fakeWrapper({ box, natural, width = 1039 }) {
  const el = document.createElement('div')
  const sizedToContent = () => el.style.height === 'auto'
  const laidOutAt = () => (el.style.height && !sizedToContent() ? parseFloat(el.style.height) : box)
  Object.defineProperty(el, 'clientWidth', { get: () => (el.style.width ? parseFloat(el.style.width) : width) })
  Object.defineProperty(el, 'clientHeight', { get: () => (sizedToContent() ? natural.value : laidOutAt()) })
  Object.defineProperty(el, 'offsetHeight', { get: () => (sizedToContent() ? natural.value : laidOutAt()) })
  Object.defineProperty(el, 'scrollHeight', { get: () => (sizedToContent() ? natural.value : Math.max(laidOutAt(), natural.value)) })
  return el
}

describe('pageFitScale', () => {
  it('content that fits stays at full size, within the tolerance too', () => {
    expect(pageFitScale(700, 703)).toBe(1)
    expect(pageFitScale(703, 703)).toBe(1)
    expect(pageFitScale(703 + PAGE_FIT_TOLERANCE_PX, 703)).toBe(1)
  })
  it('taller content is scaled to the box exactly', () => {
    const s = pageFitScale(722, 703)
    expect(s).toBeCloseTo(703 / 722, 6)
    expect(722 * s).toBeLessThanOrEqual(703)
  })
  it('no layout (jsdom, a hidden window): nothing to fit', () => {
    expect(pageFitScale(0, 0)).toBe(1)
    expect(pageFitScale(800, 0)).toBe(1)
    expect(pageFitScale(NaN, 703)).toBe(1)
  })
})

describe('fitPageContent', () => {
  it('scales content taller than the page from its top left and lays it out at box / scale', () => {
    const natural = { value: 795 }
    const el = fakeWrapper({ box: 703, natural })
    const s = fitPageContent(el)
    expect(s).toBeCloseTo(703 / 795, 6)
    expect(el.style.transform).toBe(`scale(${s})`)
    expect(el.style.transformOrigin).toMatch(/^0(px)? 0(px)?$/)
    expect(el.style.flex).toMatch(/^(none|0 0 auto)$/)
    // laid out as tall as its content, it covers the page's box once scaled
    expect(parseFloat(el.style.height)).toBeCloseTo(795, 6)
    expect(parseFloat(el.style.height) * s).toBeCloseTo(703, 6)
    expect(parseFloat(el.style.width) * s).toBeCloseTo(1039, 6)
    expect(el.dataset.fitScale).toBe((703 / 795).toFixed(3))
  })

  it('measures again from scratch: content that shrank back is full size, its inline styles gone', () => {
    const natural = { value: 795 }
    const el = fakeWrapper({ box: 703, natural })
    fitPageContent(el)
    natural.value = 700
    expect(fitPageContent(el)).toBe(1)
    for (const p of ['transform', 'transform-origin', 'width', 'height', 'flex']) expect(el.style.getPropertyValue(p)).toBe('')
    expect(el.dataset.fitScale).toBeUndefined()
  })

  it('a re-fit of scaled content keeps the same scale (no shrinking on every render)', () => {
    const natural = { value: 760 }
    const el = fakeWrapper({ box: 703, natural })
    const first = fitPageContent(el)
    expect(fitPageContent(el)).toBe(first)
    expect(fitPageContent(el)).toBe(first)
  })
})

describe('the sheet: pages 1 and 2 carry their fit wrapper', () => {
  it('inside the page box the PDF captures, around all of the page\'s content', () => {
    const { container } = render(<Sheet matchData={buildVideoMatch()} />)
    const fit1 = container.querySelector('#page-1 > [data-page-fit="1"]')
    const fit2 = container.querySelector('#page-2 > [data-page-fit="2"]')
    expect(fit1).not.toBeNull()
    expect(fit2).not.toBeNull()
    expect(fit1.textContent).toMatch(/Name of Competition/)
    expect(fit1.textContent).toMatch(/1st SET/)
    expect(fit1.textContent).toMatch(/2nd SET/)
    // page 2: set 3, TEAMS, RESULTS, APPROVAL (captains' post-match signatures), the coin toss row
    expect(fit2.textContent).toMatch(/3rd SET/)
    expect(fit2.textContent).toMatch(/APPROVAL/)
    expect(fit2.textContent).toMatch(/Captain's post-match signature/)
    expect(fit2.textContent).toMatch(/Winner of Coin Toss/)
    // jsdom has no layout: nothing is scaled
    expect(fit1.style.transform).toBe('')
    expect(fit2.style.transform).toBe('')
    cleanup()
  })
})

// The PDF (2026-11-21): each captured page was drawn over the whole A4 page
// (297 x 210 mm), stretched x 1.072 across and x 1.105 down, with ~2 mm left
// for the printer's edge. It is now placed at its true size, centred, as
// OpenVolley places its sheet on A3; the browser test reads the real PDF.
describe('the PDF: each page of the sheet at its true size on A4', () => {
  const MM_PER_CSS_PX = 25.4 / 96

  it('277 x 190 mm, 10 mm from every edge of the A4 landscape page', () => {
    const calls = []
    const pdf = { addImage: (...args) => calls.push(args) }
    app.addSheetPageImage(pdf, 'data:image/jpeg;base64,AAAA')
    expect(calls).toHaveLength(1)
    const [img, format, x, y, w, h] = calls[0]
    expect(img).toBe('data:image/jpeg;base64,AAAA')
    expect(format).toBe('JPEG')
    expect([x, y, w, h]).toEqual([10, 10, 277, 190])
    expect(app.PDF_PAGE_MM).toEqual({ width: 297, height: 210 })
    // centred: the same margin on both sides
    expect(app.PDF_PAGE_MM.width - x - w).toBe(x)
    expect(app.PDF_PAGE_MM.height - y - h).toBe(y)
  })

  it('in the proportions of the page it captures (no stretch)', () => {
    const { container } = render(<Sheet matchData={buildVideoMatch()} />)
    const pages = [...container.querySelectorAll('[id^="page-"]')]
    expect(pages.length).toBeGreaterThanOrEqual(2)
    for (const page of pages) {
      // the page box the PDF captures is the size it is placed at
      expect(page.style.width).toBe(`${app.SHEET_PAGE_MM.width}mm`)
      expect(page.style.height).toBe(`${app.SHEET_PAGE_MM.height}mm`)
    }
    // the capture: the page's box in whole CSS px (offsetWidth x offsetHeight), twice over
    const pxW = Math.round(app.SHEET_PAGE_MM.width / MM_PER_CSS_PX) * 2
    const pxH = Math.round(app.SHEET_PAGE_MM.height / MM_PER_CSS_PX) * 2
    const placed = app.SHEET_PAGE_MM.width / app.SHEET_PAGE_MM.height
    expect(Math.abs((pxW / pxH) / placed - 1)).toBeLessThan(0.001)
    // the old placement distorted it by 3 %
    expect(Math.abs((pxW / pxH) / (297 / 210) - 1)).toBeGreaterThan(0.03)
    cleanup()
  })
})
