// Laptop run of 2026-10-08 (OB-2): New match > Test match went through five
// frames in 232 ms: the home screen with 'Continue match / Delete match',
// Match Setup with 'Not set' (three frames), then the filled setup. The home
// screen stays now, without the new match's buttons, until Match Setup
// replaces it, filled.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { waitFor, fireEvent } from '@testing-library/react'
import { offline, online, mountApp, button, sleep, track } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)

describe('App: a new test match', () => {
  it('goes from the home screen to the filled Match Setup in one change', async () => {
    mountApp()
    await waitFor(() => expect(button('New match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('New match'))
    await waitFor(() => expect(button('Test match')).toBeTruthy())

    const { states, stop } = track(() => {
      const text = document.body.textContent
      return {
        home: !!button('Restore match'),
        match: !!button('Continue match') || !!button('Delete match'),
        setup: /Match setup/i.test(text) && !button('Restore match'),
        notSet: (text.match(/Not set/g) || []).length
      }
    })
    fireEvent.click(button('Test match'))
    await waitFor(() => expect(states.at(-1)).toMatchObject({ setup: true, notSet: 0 }), { timeout: 8000 })
    await sleep(500)
    stop()

    expect(states.at(-1)).toMatchObject({ home: false, setup: true, notSet: 0 })
    // the home screen as it was, then the filled setup: nothing between
    expect(states.filter(s => s.home && s.match)).toEqual([])
    expect(states.filter(s => !s.home && !(s.setup && s.notSet === 0))).toEqual([])
  }, 30000)
})
