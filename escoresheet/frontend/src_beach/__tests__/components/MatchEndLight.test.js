import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// The end of every match was the legacy dark UI: a navy 'Match Complete' page
// with emoji, a green 2:0, dark cards, white 'Tap to sign' boxes, a dark
// reopen confirm with the green Yes on the left, and a dark full-screen
// manual adjustments editor with blue tabs. App_beach even switched the light
// page off for both. Checked in the browser (1280×800, en/de): light cards,
// kit buttons, the kit confirm; the official result / sanction boxes keep
// their scoresheet look.

const read = (f) => readFileSync(resolve(__dirname, '../..', f), 'utf8')
const matchEnd = read('components_beach/MatchEnd_beach.jsx')
const manual = read('components_beach/ManualAdjustments_beach.jsx')
const app = read('App_beach.jsx')

describe('match end and manual adjustments are light', () => {
  it('App_beach keeps the stone page on every screen', () => {
    expect(app).toContain("className={cn('app-root', 'bg-gradient-to-b from-stone-50 to-stone-100')}")
    expect(app).not.toMatch(/\(showManualAdjustments \|\| showMatchEnd\)\) && 'bg-gradient/)
  })

  it('MatchEnd: translated, kit buttons, the kit confirm, no dark legacy', () => {
    for (const s of ['Match Complete', 'Tap to sign', "'Waiting...'", 'Yes, Reopen Set', 'Edit Remarks', 'Confirm and Approve', 'Reopen Last Set', 'Manual Adjustments', '#111827', 'linear-gradient', '#ea0808ff', '#007bff', 'rgba(0, 0, 0, 0.8)']) {
      expect(matchEnd, s).not.toContain(s)
    }
    expect(matchEnd).toMatch(/confirmDialog\(\{\s*title: t\('matchEnd\.reopenSetConfirmTitle'\)/)
    expect(matchEnd).toContain('tone="light"')
    expect(matchEnd).toMatch(/<Button variant="primary" size="xl"[^>]*onClick=\{handleApprove\}/)
  })

  it('ManualAdjustments: stone page, segmented sections, no navy or gradients', () => {
    for (const s of ['#1a1a2e', 'linear-gradient', 'rgba(255,255,255', "color: '#fff'"]) {
      expect(manual, s).not.toContain(s)
    }
    expect(manual).toContain('<SegmentedControl')
    expect(manual).toContain('<Button variant="positive" size="xl" onClick={handleSave}')
  })
})
