import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import RestorePreviewModal, { restorePreviewSummary } from '../../components_beach/RestorePreviewModal_beach'

// The App-level dialogs were dark legacy modals in hard-coded English with a
// green "Yes" on the left: now the kit confirmDialog / toasts, translated, and
// the restore preview a light dialog with Cancel left, the commit right.

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, de: { translation: de } } })
})

const backup = {
  match: { team1Name: 'Müller / Weber', team2Name: 'Schmidt / Fischer', status: 'live' },
  sets: [{ index: 2, team1Points: 7, team2Points: 5 }, { index: 1, team1Points: 21, team2Points: 18, finished: true }],
  events: [
    { type: 'lineup', payload: { team: 'team1', lineup: { I: { number: 1, isServing: true }, II: 2 } } },
    { type: 'timeout', setIndex: 2, payload: { team: 'team2' } },
    { type: 'point', seq: 9, payload: { scoringTeam: 'team2' } },
    { type: 'sanction', payload: { team: 'team1', type: 'yellow', playerNumber: 2 } }
  ]
}

describe('restore preview', () => {
  it('summarises a local backup', () => {
    const s = restorePreviewSummary(backup)
    expect(s).toMatchObject({
      team1Name: 'Müller / Weber', team2Name: 'Schmidt / Fischer', currentSetIndex: 2,
      team1Points: 7, team2Points: 5, team1Timeouts: 0, team2Timeouts: 1, servingTeam: 'team2'
    })
    expect(s.sets.map(x => x.index)).toEqual([1, 2])
    expect(s.team2Lineup).toBeNull()
  })

  it('summarises a database bundle (liveState)', () => {
    const s = restorePreviewSummary({ match: { team1_team: { name: 'A' } }, liveState: { current_set: 3, points_a: 4, points_b: 6, serving_team: 'team2', lineup_b: { I: 5 } } })
    expect(s).toMatchObject({ team1Name: 'A', currentSetIndex: 3, team1Points: 4, team2Points: 6, servingTeam: 'team2' })
    expect(s.team2Lineup).toEqual({ I: 5 })
  })

  it('a light, translated decision dialog: Cancel left, Restore right', async () => {
    await i18n.changeLanguage('de')
    const onConfirm = vi.fn()
    render(<RestorePreviewModal preview={{ source: 'file', data: backup }} onConfirm={onConfirm} onCancel={() => {}} onSelectAnother={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Dieses Spiel wiederherstellen?' })
    expect(dialog.className).toMatch(/bg-white/)
    const buttons = within(dialog).getAllByRole('button').map(b => b.textContent.trim()).filter(Boolean)
    expect(buttons.slice(-3)).toEqual(['Abbrechen', 'Andere wählen', 'Spiel wiederherstellen'])
    expect(dialog).toHaveTextContent('7:5')
    expect(dialog).toHaveTextContent('Satz 2')
    within(dialog).getByText('Spiel wiederherstellen').click()
    expect(onConfirm).toHaveBeenCalled()
    await i18n.changeLanguage('en')
  })
})

describe('App_beach', () => {
  const src = readFileSync(resolve(__dirname, '../../App_beach.jsx'), 'utf8')

  it('has no legacy Alert / Confirm / Create New Match dialogs any more', () => {
    for (const title of ['title="Alert"', 'title="Confirm"', 'title="Create New Match"', 'title="Restore Preview"']) {
      expect(src).not.toContain(title)
    }
    expect(src).not.toMatch(/setAlertModal|setConfirmModal|setNewMatchModal/)
  })

  it('asks through the kit confirm dialog, destructive and translated', () => {
    expect(src).toMatch(/confirmDialog\(\{\s*title: t\('app\.deleteTestMatchTitle'/)
    expect(src).toMatch(/confirmLabel: t\('app\.deleteTestMatchConfirm'[\s\S]{0,120}tone: 'danger'/)
  })
})
