// The centre of the phone layout (PhoneScoreboard_beach) between rallies:
// Start rally, a time-out's countdown, the set interval. It takes the place
// of the two point buttons, which get as low as 56px on a short screen
// (390x664, 360x640). It was laid over that row (absolutely positioned), so
// on such a screen the time-out's countdown and Stop button ran over the
// team actions and the action grid, and the interval was cut to a 56px strip
// with Start set in it. The centre now shares the row with the two square
// slots in the flow: the row is as high as the point buttons, or as its
// content when that is higher (the view scrolls instead of overlapping).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import PhoneScoreboard from '../../components_beach/scoreboard/PhoneScoreboard_beach.jsx'

afterEach(() => cleanup())

const team = (side, teamKey, label) => ({
  side, teamKey, label, name: `${label} team`, color: side === 'left' ? '#facc15' : '#1c1917',
  setsWon: 0, points: 0, timeouts: 0, bmp: { remaining: 2, available: false, title: '' },
  players: [{ number: 1, position: 1, serves: side === 'left' }, { number: 2, position: 2, serves: false }],
  firstServer: 1, secondServer: 2, improperRequestDone: false, delayWarned: false, hasCoach: false
})
const noop = () => {}
const props = (over = {}) => ({
  setNumber: 1, pointsToWin: 21,
  teams: { left: team('left', 'team1', 'A'), right: team('right', 'team2', 'B') },
  serving: 'left',
  rhythm: { switchIn: 7, ttoIn: 21, ttoTotal: 21, setIndex: 1 },
  rally: { status: 'idle', startLabel: 'Start rally', startDisabled: false, canReplayRally: false, isRallyReplayed: false },
  centre: null, between: null, recent: [], canUndo: false,
  actions: new Proxy({}, { get: () => noop }),
  ...over
})

const centreOf = () => screen.getByTestId('phone-centre')
const inRow = (el) => {
  expect(el.style.position).not.toBe('absolute')
  expect(el.style.gridRow).toBe('1')
  expect(el.style.gridColumn).toBe('1 / -1')
  // the two slots that give the row the point buttons' height share it
  const slots = [...el.parentElement.querySelectorAll(':scope > .phone-square')]
  expect(slots).toHaveLength(2)
  for (const s of slots) expect(s.style.gridRow).toBe('1')
}

describe('PhoneScoreboard_beach: the centre between rallies', () => {
  it('Start rally sits in the point buttons\' row, in the flow', () => {
    render(<PhoneScoreboard {...props()} />)
    inRow(centreOf())
    expect(centreOf().textContent).toBe('Start rally')
  })

  it('a time-out\'s countdown and Stop button sit in that row, never over the rest', () => {
    render(<PhoneScoreboard {...props({ centre: { kind: 'timeout', teamName: 'A team', countdown: 44, countdownText: '44', total: 45 } })} />)
    inRow(centreOf())
    expect(centreOf().textContent).toContain('44')
  })

  it('the set interval (countdown, sides, serve, Start set) sits in that row', () => {
    render(<PhoneScoreboard {...props({ rally: { status: 'idle', startLabel: 'Start set 2', startDisabled: false }, between: { kind: 'setup', countdown: 58, countdownText: '58', total: 60 } })} />)
    inRow(centreOf())
    expect(centreOf().textContent).toContain('Start set 2')
  })

  it('the set interval still running (setup closed): its countdown and End set interval sit in that row', () => {
    render(<PhoneScoreboard {...props({ rally: { status: 'idle', startLabel: 'Start set 3', startDisabled: false, intervalRunning: true }, centre: { kind: 'interval', countdown: 41, countdownText: '0:41', total: 60 } })} />)
    inRow(centreOf())
    expect(centreOf().textContent).toContain('0:41')
    expect(centreOf().textContent).toContain('End set interval')
    expect(centreOf().textContent).not.toContain('Start set')
  })

  it('the set interval running with its setup open: End set interval in place of Start set', () => {
    render(<PhoneScoreboard {...props({ rally: { status: 'idle', startLabel: 'Start set 2', startDisabled: false, intervalRunning: true }, between: { kind: 'setup', countdown: 58, countdownText: '58', total: 60 } })} />)
    expect(centreOf().textContent).toContain('End set interval')
    expect(centreOf().textContent).not.toContain('Start set')
  })

  it('a rally in play shows the two point buttons, no centre', () => {
    render(<PhoneScoreboard {...props({ rally: { status: 'in_play', startLabel: '', startDisabled: false } })} />)
    expect(screen.queryByTestId('phone-centre')).toBeNull()
    expect(screen.getByRole('button', { name: 'Point A' }).classList.contains('phone-square')).toBe(true)
  })
})
