// The scorer's Menu is grouped, the destructive "Stop the match" alone at the
// end. Ported from OpenVolley src/components/__tests__/matchMenu.test.jsx,
// with the beach rows.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MenuList from '../../components_beach/MenuList_beach'
import { matchMenuSections, toMenuListItems } from '../../components_beach/matchMenu_beach'

const t = (key, fallback) => fallback || key
const allActions = () => ({
  showRosters: vi.fn(), showSanctions: vi.fn(), showActionLog: vi.fn(), openRemarks: vi.fn(),
  openMatchSetup: vi.fn(), manualChanges: vi.fn(), openScoreboard: vi.fn(), showPins: vi.fn(),
  downloadGameData: vi.fn(), options: vi.fn(), stopMatch: vi.fn()
})

describe('matchMenuSections', () => {
  it('groups the rows, most used first, "Stop the match" alone at the end', () => {
    const sections = matchMenuSections(t, allActions())
    expect(sections.map(s => s.key)).toEqual(['info', 'corrections', 'devices', 'settings', 'end'])
    expect(sections[0].items.map(i => i.key)).toEqual(['rosters', 'sanctions', 'action-log', 'remarks', 'match-setup'])
    expect(sections.at(-1)).toMatchObject({ danger: true, items: [{ key: 'stop-match', danger: true }] })
    // every row of the old flat menu is still there, once
    const keys = sections.flatMap(s => s.items.map(i => i.key))
    expect(keys.sort()).toEqual(['action-log', 'export', 'manual', 'match-setup', 'open-scoreboard', 'options', 'pins', 'remarks', 'rosters', 'sanctions', 'stop-match'])
  })

  it('a missing handler drops its row, an empty group drops its header', () => {
    const actions = allActions()
    delete actions.openMatchSetup
    delete actions.options
    const sections = matchMenuSections(t, actions)
    expect(sections.flatMap(s => s.items.map(i => i.key))).not.toContain('match-setup')
    expect(sections.map(s => s.key)).not.toContain('settings')
  })
})

describe('the grouped menu in MenuList_beach', () => {
  it('shows a header per group, not as a row, and a row runs its handler', () => {
    const actions = allActions()
    render(<MenuList tone="light" buttonLabel="Menu" items={toMenuListItems(matchMenuSections(t, actions))} />)
    fireEvent.click(screen.getByText('Menu'))
    for (const header of ['Match info', 'Corrections', 'Devices and data', 'Settings', 'End of match']) {
      expect(screen.getByText(header).getAttribute('role')).toBe('presentation')
    }
    expect(screen.getAllByRole('menuitem')).toHaveLength(11)
    const rows = screen.getAllByRole('menuitem').map(r => r.textContent)
    expect(rows.at(-1)).toBe('Stop the match')
    fireEvent.click(screen.getByText('Show PINs'))
    expect(actions.showPins).toHaveBeenCalledTimes(1)
  })

  it('the Scoreboard builds its Menu from the groups', () => {
    const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
    // one grouped menu for the toolbar's Menu and the phone layout's sheet
    expect(sb).toContain('const matchMenu = matchMenuSections(t, {')
    expect(sb).toContain('items={toMenuListItems(matchMenu)}')
    expect(sb).toMatch(/\{matchMenu\.map\(section =>/)
  })
})
