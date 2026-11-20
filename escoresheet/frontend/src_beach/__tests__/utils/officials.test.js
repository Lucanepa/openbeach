// utils_beach/officials_beach (2026-11-20): a match's officials in one shape.
// Manual adjustments saved { ref1, ref2, scorer, asstScorer } over Match
// Setup's list: the line judges were deleted, the Scoreboard's
// officials.find(...) threw, and the cloud merged the object into its list.
import { describe, it, expect } from 'vitest'
import { findOfficial, officialFullName, officialRole, officialsList, officialsWithEdits } from '../../utils_beach/officials_beach'

const LIST = [
  { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
  { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '1990-03-14' },
  { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'ITA', dob: null },
  { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'CHE', dob: '0077' },
  { role: 'line judge 1', name: 'Lia Linie' },
  { role: 'line judge 2', name: 'Lina Linie' }
]

describe('officialRole', () => {
  it('names every stored spelling as the list does', () => {
    expect(officialRole('1st Referee')).toBe('1st referee')
    expect(officialRole('ref1')).toBe('1st referee')
    expect(officialRole('2nd_referee')).toBe('2nd referee')
    expect(officialRole('asstScorer')).toBe('assistant scorer')
    expect(officialRole('assistant_scorer')).toBe('assistant scorer')
    expect(officialRole('Line Judge 3')).toBe('line judge 3')
    expect(officialRole(undefined)).toBe('')
  })
})

describe('officialsList', () => {
  it('the list stays as it is, without holes', () => {
    expect(officialsList([LIST[0], null, 'x', LIST[4]])).toEqual([LIST[0], LIST[4]])
  })

  it('the object form gets the list\'s roles; its empty officials are left out', () => {
    expect(officialsList({
      ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
      ref2: { firstName: '', lastName: '', country: '', dob: '' },
      scorer: { firstName: 'Sina', lastName: 'Schreiber', dob: '' },
      asstScorer: { firstName: '', lastName: '', dob: '' }
    })).toEqual([
      { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
      { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', dob: '' }
    ])
  })

  it('the cloud\'s merge of both: the list\'s entries, the object\'s officials in place of the same roles', () => {
    const merged = {
      ...Object.fromEntries(LIST.map((o, i) => [String(i), o])),
      ref1: { firstName: 'Rita', lastName: 'Richter', country: 'CHE', dob: '204411' },
      ref2: { firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '14.03.1990' },
      scorer: { firstName: '', lastName: '', dob: '' },
      asstScorer: { firstName: 'Ada', lastName: 'Assist', dob: '0077' }
    }
    const list = officialsList(merged)
    expect(list.map(o => o.role)).toEqual(['1st referee', '2nd referee', 'assistant scorer', 'line judge 1', 'line judge 2'])
    expect(list[0].lastName).toBe('Richter')
    expect(list[1].dob).toBe('14.03.1990')
    expect(list[3]).toEqual({ role: 'line judge 1', name: 'Lia Linie' })
  })

  it('nothing stored: no officials', () => {
    for (const v of [undefined, null, '', 'x', 7, {}]) expect(officialsList(v)).toEqual([])
  })
})

describe('findOfficial / officialFullName', () => {
  it('finds a role in either shape, by any spelling', () => {
    expect(findOfficial(LIST, '2nd referee')).toBe(LIST[1])
    expect(findOfficial(LIST, 'line judge 2')).toBe(LIST[5])
    expect(findOfficial({ ref1: { firstName: 'Rita', lastName: 'Referee' } }, '1st Referee')).toEqual({ role: '1st referee', firstName: 'Rita', lastName: 'Referee' })
    expect(findOfficial(LIST, 'line judge 4')).toBeNull()
    expect(findOfficial(undefined, 'scorer')).toBeNull()
  })

  it('a name: First Last, the cloud spelling, or a line judge\'s one field', () => {
    expect(officialFullName(LIST[0])).toBe('Rita Referee')
    expect(officialFullName({ first_name: 'Rita', last_name: 'Referee' })).toBe('Rita Referee')
    expect(officialFullName(LIST[4])).toBe('Lia Linie')
    expect(officialFullName(null)).toBe('')
  })
})

describe('officialsWithEdits (what Manual adjustments saves)', () => {
  const edited = {
    ref1: { firstName: 'Rita', lastName: 'Richter', country: 'CHE', dob: '204411' },
    ref2: { firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '14.03.1990' },
    scorer: { firstName: 'Sina', lastName: 'Schreiber', dob: '' },
    asstScorer: { firstName: 'Ada', lastName: 'Assist', dob: '0077' }
  }

  it('Match Setup\'s list: the edits, the line judges kept, the scorer\'s country kept', () => {
    const saved = officialsWithEdits(LIST, edited)
    expect(Array.isArray(saved)).toBe(true)
    expect(saved).toEqual([
      { role: '1st referee', firstName: 'Rita', lastName: 'Richter', country: 'CHE', dob: '204411' },
      { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '14.03.1990' },
      { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'ITA', dob: null },
      { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'CHE', dob: '0077' },
      { role: 'line judge 1', name: 'Lia Linie' },
      { role: 'line judge 2', name: 'Lina Linie' }
    ])
  })

  it('an official whose name is cleared is left out, as Match Setup does; fields the screen does not know stay', () => {
    const stored = [{ ...LIST[0], email: 'rita@example.org' }, ...LIST.slice(1)]
    const saved = officialsWithEdits(stored, { ...edited, ref1: { ...edited.ref1, lastName: 'Referee' }, asstScorer: { firstName: '', lastName: '', dob: '' } })
    expect(saved.map(o => o.role)).toEqual(['1st referee', '2nd referee', 'scorer', 'line judge 1', 'line judge 2'])
    expect(saved[0].email).toBe('rita@example.org')
  })

  it('the cloud copy: Match Setup\'s spelling (first_name / last_name, a date as YYYY-MM-DD), the line judges too', () => {
    expect(officialsWithEdits(LIST, edited, { cloud: true })).toEqual([
      { role: '1st referee', first_name: 'Rita', last_name: 'Richter', country: 'CHE', dob: '204411' },
      { role: '2nd referee', first_name: 'Remo', last_name: 'Zweiter', country: 'CHE', dob: '1990-03-14' },
      { role: 'scorer', first_name: 'Sina', last_name: 'Schreiber', country: 'ITA', dob: null },
      { role: 'assistant scorer', first_name: 'Ada', last_name: 'Assist', country: 'CHE', dob: '0077' },
      { role: 'line judge 1', name: 'Lia Linie' },
      { role: 'line judge 2', name: 'Lina Linie' }
    ])
  })

  it('a match saved as the object form becomes the list', () => {
    const stored = { ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '' }, ref2: { firstName: '', lastName: '', country: '', dob: '' } }
    expect(officialsWithEdits(stored, { ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '' } })).toEqual([
      { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: null }
    ])
  })
})
