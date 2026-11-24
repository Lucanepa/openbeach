// ManualAdjustments_beach: a team colour that is none of the dropdown's own
// colours keeps its own option. A custom colour from the picker reads
// "Custom colour #…"; one of Match setup's twelve shirts the list lacks
// (white #FFFFFF, red #dc2626...) is no custom colour and shows its code.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))

let ManualAdjustments
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  ManualAdjustments = (await import('../../components_beach/ManualAdjustments_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

async function openTeams(team1Color, team2Color) {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  const team1Id = await db.teams.add({ name: 'Müller / Weber', color: team1Color })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi', color: team2Color })
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', team1Color, team2Color })
  render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
  const tab = await screen.findByRole('radio', { name: 'Teams & players' }).catch(() => screen.findByRole('button', { name: 'Teams & players' }))
  await act(async () => { fireEvent.click(tab) })
}

const colourSelects = async () => {
  await screen.findAllByText('Color')
  return [...document.querySelectorAll('select')].filter(s => [...s.options].some(o => o.value === '#3b82f6'))
}

describe('ManualAdjustments_beach team colour', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('a custom colour is its own option, "Custom colour #…", and stays selected', async () => {
    await openTeams('#7b1e2b', '#3b82f6')
    const [s1, s2] = await colourSelects()
    expect(s1.value).toBe('#7b1e2b')
    expect(s1.options[s1.selectedIndex].text).toBe('Custom colour #7b1e2b ■')
    // a colour of the list has no extra option
    expect(s2.value).toBe('#3b82f6')
    expect([...s2.options].some(o => /Custom colour/.test(o.text))).toBe(false)
  })

  it("one of Match setup's shirts the list lacks shows its code, not \"Custom colour\"", async () => {
    await openTeams('#FFFFFF', '#dc2626')
    const [s1, s2] = await colourSelects()
    expect(s1.value).toBe('#FFFFFF')
    expect(s1.options[s1.selectedIndex].text).toBe('#FFFFFF ■')
    expect(s2.value).toBe('#dc2626')
    expect(s2.options[s2.selectedIndex].text).toBe('#dc2626 ■')
  })
})
