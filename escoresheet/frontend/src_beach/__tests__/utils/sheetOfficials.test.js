// officialsList (scoresheet_pdf_beach/components_beach/sheetFormat_beach):
// the PDF's APPROVAL box reads one list, whether the match keeps its
// officials as Match Setup's array or Manual adjustments' object.
import { describe, it, expect } from 'vitest'
import { officialsList } from '../../../scoresheet_pdf_beach/components_beach/sheetFormat_beach'

describe('officialsList', () => {
  it('an array stays as it is (without holes)', () => {
    const list = [{ role: '1st referee', lastName: 'Referee', dob: '204411' }, null, { role: 'line judge 1', name: 'Lia Linie' }]
    expect(officialsList(list)).toEqual([list[0], list[2]])
  })

  it('the object form gets the array form\'s roles', () => {
    expect(officialsList({
      ref1: { lastName: 'Referee', dob: '204411' },
      ref2: { lastName: 'Zweiter' },
      scorer: { lastName: 'Schreiber' },
      asstScorer: { lastName: 'Assist' },
      other: { lastName: 'Nobody' }
    })).toEqual([
      { lastName: 'Referee', dob: '204411', role: '1st referee' },
      { lastName: 'Zweiter', role: '2nd referee' },
      { lastName: 'Schreiber', role: 'scorer' },
      { lastName: 'Assist', role: 'assistant scorer' }
    ])
  })

  it('nothing stored: no officials', () => {
    expect(officialsList(undefined)).toEqual([])
    expect(officialsList(null)).toEqual([])
    expect(officialsList('x')).toEqual([])
  })
})
