// Roster rows keep their place while a number is typed (OpenVolley 74511bd2,
// demo recording 2026-10-21: typing "1" then "5" in a row's number moved the
// row). The coin toss roster sorted on every digit; it draws the order taken
// when focus entered the list until focus leaves it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { byNumber, numberOrder, sortedByNumber, steadyOrder, focusLeaves } from '../../utils_beach/rosterOrder_beach'

const roster = [{ number: 8, lastName: 'C' }, { number: 2, lastName: 'A' }, { number: null, lastName: 'X' }, { number: 5, lastName: 'B' }]

describe('rosterOrder_beach', () => {
  it('orders by number, players without one first, ties in list order', () => {
    expect(numberOrder(roster)).toEqual([2, 1, 3, 0])
    expect(numberOrder([{ number: 3 }, { number: '3' }, { number: 1 }])).toEqual([2, 0, 1])
    expect(byNumber({ number: '10' }, { number: 9 })).toBeGreaterThan(0)
    expect(numberOrder(null)).toEqual([])
  })

  it('sortedByNumber returns the same array when it is already sorted', () => {
    const sorted = [{ number: 1 }, { number: 4 }]
    expect(sortedByNumber(sorted)).toBe(sorted)
    expect(sortedByNumber(roster).map(p => p.lastName)).toEqual(['X', 'A', 'B', 'C'])
  })

  it('steadyOrder keeps the frozen order while a number changes, by number without one', () => {
    // A beach team, #1 and #2: the scorer types 1 then 5 into #1's number,
    // and the rows stay where they were
    const pair = [{ number: 1, lastName: 'A' }, { number: 2, lastName: 'B' }]
    const frozen = steadyOrder(pair, null)
    expect(frozen).toEqual([0, 1])
    const typed1 = [{ ...pair[0], number: 1 }, pair[1]]
    const typed15 = [{ ...pair[0], number: 15 }, pair[1]]
    expect(steadyOrder(typed1, frozen)).toEqual([0, 1])
    expect(steadyOrder(typed15, frozen)).toEqual([0, 1])
    // focus left the list: sorted again
    expect(steadyOrder(typed15, null)).toEqual([1, 0])
  })

  it('steadyOrder drops a frozen order that no longer covers the roster', () => {
    expect(steadyOrder(roster.slice(0, 3), [2, 1, 3, 0])).toEqual([2, 1, 0])
    expect(steadyOrder(roster, [0, 0, 1, 2])).toEqual([2, 1, 3, 0])
    expect(steadyOrder(roster, [0, 1, 2, 7])).toEqual([2, 1, 3, 0])
  })

  it('focusLeaves: focus going outside the element, or nowhere', () => {
    const inside = {}
    const box = { contains: (n) => n === inside }
    expect(focusLeaves({ currentTarget: box, relatedTarget: inside })).toBe(false)
    expect(focusLeaves({ currentTarget: box, relatedTarget: {} })).toBe(true)
    expect(focusLeaves({ currentTarget: box, relatedTarget: null })).toBe(true)
  })

  it('the coin toss roster draws the steady order, not a sort per render', () => {
    const src = readFileSync(resolve(__dirname, '../../components_beach/CoinToss_beach.jsx'), 'utf8')
    expect(src).toMatch(/steadyOrder\(roster, rosterEditOrder\)/)
    expect(src).toMatch(/onFocus=\{\(\) => \{ if \(!rosterEditOrder\) setRosterEditOrder\(steadyOrder\(roster, null\)\) \}\}/)
    expect(src).toMatch(/onBlur=\{e => \{ if \(focusLeaves\(e\)\) setRosterEditOrder\(null\) \}\}/)
  })
})
