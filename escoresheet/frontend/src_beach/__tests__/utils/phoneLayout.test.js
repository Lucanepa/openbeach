import { describe, it, expect } from 'vitest'
import { detectDisplayMode, isPhoneScreen, normaliseDisplayMode, phoneHeldSideways, phoneLayoutActive, phoneLayoutKept, recentActions, tintOf } from '../../components_beach/scoreboard/phoneLayout_beach'

describe('detectDisplayMode (the automatic display mode)', () => {
  it.each([[390, 844], [360, 740], [412, 915], [599, 1000]])('a %ix%i portrait phone gets the phone layout', (w, h) => {
    expect(detectDisplayMode({ width: w, height: h })).toBe('phone')
  })

  it('a phone turned to landscape is no phone layout', () => {
    expect(detectDisplayMode({ width: 844, height: 390 })).toBe('tablet')
  })

  it.each([[768, 1024], [600, 960], [1024, 768]])('a %ix%i tablet is no phone', (w, h) => {
    expect(detectDisplayMode({ width: w, height: h })).toBe('tablet')
  })

  it.each([[1280, 800], [1920, 1080]])('a %ix%i screen is desktop', (w, h) => {
    expect(detectDisplayMode({ width: w, height: h })).toBe('desktop')
  })
})

describe('normaliseDisplayMode', () => {
  it('keeps the known modes, the old "smartphone" is the Phone mode, anything else is auto', () => {
    expect(normaliseDisplayMode('desktop')).toBe('desktop')
    expect(normaliseDisplayMode('tablet')).toBe('tablet')
    expect(normaliseDisplayMode('phone')).toBe('phone')
    expect(normaliseDisplayMode('smartphone')).toBe('phone')
    expect(normaliseDisplayMode(null)).toBe('auto')
    expect(normaliseDisplayMode('weird')).toBe('auto')
  })
})

describe('phoneLayoutActive', () => {
  it('automatic: only a portrait phone', () => {
    expect(phoneLayoutActive('auto', { width: 390, height: 844 })).toBe(true)
    expect(phoneLayoutActive(null, { width: 390, height: 844 })).toBe(true)
    expect(phoneLayoutActive('auto', { width: 844, height: 390 })).toBe(false)
    expect(phoneLayoutActive('auto', { width: 1280, height: 800 })).toBe(false)
  })

  it('a forced mode wins', () => {
    expect(phoneLayoutActive('phone', { width: 1280, height: 800 })).toBe(true)
    expect(phoneLayoutActive('smartphone', { width: 1280, height: 800 })).toBe(true)
    expect(phoneLayoutActive('desktop', { width: 390, height: 844 })).toBe(false)
    expect(phoneLayoutActive('tablet', { width: 390, height: 844 })).toBe(false)
  })
})

describe('isPhoneScreen / phoneLayoutKept / phoneHeldSideways', () => {
  const phone = { width: 390, height: 844 }
  const laptop = { width: 1920, height: 1080 }
  const tablet = { width: 800, height: 1280 }

  it('by the short side of the screen, either way up', () => {
    expect(isPhoneScreen(phone)).toBe(true)
    expect(isPhoneScreen({ width: 844, height: 390 })).toBe(true)
    expect(isPhoneScreen(tablet)).toBe(false)
    expect(isPhoneScreen(null)).toBe(false)
  })

  it('a phone in the automatic mode keeps the phone layout either way up', () => {
    expect(phoneLayoutKept('auto', { width: 844, height: 390 }, phone)).toBe(true)
    expect(phoneHeldSideways('auto', { width: 390, height: 844 }, phone)).toBe(false)
    expect(phoneHeldSideways('auto', { width: 844, height: 390 }, phone)).toBe(true)
  })

  it('tablets and computers are untouched, and so are forced modes', () => {
    expect(phoneLayoutKept('auto', { width: 1280, height: 800 }, tablet)).toBe(false)
    expect(phoneHeldSideways('auto', { width: 1366, height: 768 }, laptop)).toBe(false)
    expect(phoneLayoutKept('desktop', { width: 844, height: 390 }, phone)).toBe(false)
    expect(phoneLayoutKept('phone', { width: 844, height: 390 }, phone)).toBe(true)
    expect(phoneHeldSideways('phone', { width: 844, height: 390 }, phone)).toBe(false)
  })
})

describe('recentActions', () => {
  const describeEvent = (e) => (e.type === 'unknown' ? 'Unknown action' : `${e.type} ${e.seq}`)
  it('the newest three of the set, main events only, without rally starts or replays', () => {
    const events = [
      { id: 1, setIndex: 1, seq: 1, type: 'coin_toss' },
      { id: 2, setIndex: 1, seq: 2, type: 'rally_start' },
      { id: 3, setIndex: 1, seq: 3, type: 'point' },
      { id: 4, setIndex: 1, seq: 3.1, type: 'technical_to' },
      { id: 5, setIndex: 1, seq: 4, type: 'timeout' },
      { id: 6, setIndex: 1, seq: 5, type: 'replay' },
      { id: 7, setIndex: 1, seq: 6, type: 'unknown' },
      { id: 8, setIndex: 2, seq: 7, type: 'point' }
    ]
    expect(recentActions(events, 1, describeEvent).map(r => r.text)).toEqual(['timeout 4', 'point 3', 'coin_toss 1'])
    expect(recentActions(events, 2, describeEvent).map(r => r.text)).toEqual(['point 7'])
    expect(recentActions(null, 1, describeEvent)).toEqual([])
  })
})

describe('tintOf', () => {
  it('mixes a colour into white', () => {
    expect(tintOf('#000000', 0.1)).toBe('#e6e6e6')
    expect(tintOf('#ffffff', 0.5)).toBe('#ffffff')
    expect(tintOf('red')).toBeNull()
  })
})
