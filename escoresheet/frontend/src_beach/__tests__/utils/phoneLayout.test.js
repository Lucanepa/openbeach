import { describe, it, expect } from 'vitest'
import { PHONE_COURT_MIN_PX, PHONE_SQUARE_MIN_PX, PHONE_SQUARE_RESERVE_PX, detectDisplayMode, isPhoneScreen, normaliseDisplayMode, phoneHeldSideways, phoneLayoutActive, phoneLayoutKept, recentActions, tintOf } from '../../components_beach/scoreboard/phoneLayout_beach'

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

describe('phone action grid labels (a 4-column grid on a 360px phone)', () => {
  // A word longer than its button broke anywhere ("Osservazio|ni" in Italian
  // at 360-390px): every long word of the grid's labels carries a soft
  // hyphen where it may break (the grid breaks words only there)
  it('every word of 10+ letters among the grid labels has a soft hyphen, in every locale', async () => {
    const SHY = '­'
    for (const lang of ['en', 'de', 'de-CH', 'fr', 'it']) {
      const { default: locale } = await import(`../../i18n_beach/locales/${lang}.json`)
      const phone = locale.scoreboard.phone
      const labels = [locale.scoreboard.sanction, phone.medical, phone.replay, phone.decision, locale.scoreboard.rosters, phone.scoresheet, phone.remarks, phone.refBmp]
      for (const label of labels) {
        // a hyphen ("Schiri-BMP") is a break point of its own
        for (const word of label.split(/[\s-]+/)) {
          if (word.replaceAll(SHY, '').length >= 10) expect(word, `${lang}: ${label}`).toContain(SHY)
        }
      }
    }
  })
})

describe('phone layout on a short screen (styles_beach.css)', () => {
  // The heights a phone page really gets (browser bars, the Android app's
  // system bars), less the folded app header's 16px bar. At 390x664 (an
  // iPhone in Safari) and 360x640 the action grid ran 26px and 35px below the
  // screen: the beach layout has the change-of-courts row on top of what fits
  // OpenVolley's. The point buttons get lower down to their minimum, then the
  // court gets lower down to its minimum (two players still fit).
  it.each([[360, 640], [390, 664]])('everything fits a %ix%i page without scrolling', (width, height) => {
    expect(PHONE_COURT_MIN_PX).toBeGreaterThan(0)
    expect(PHONE_SQUARE_RESERVE_PX + PHONE_COURT_MIN_PX + PHONE_SQUARE_MIN_PX).toBeLessThanOrEqual(height - 16)
    // the court is never taller than half its width (the 2:1 court)
    expect(PHONE_COURT_MIN_PX).toBeLessThanOrEqual((width - 24) / 2)
  })

  it('the court gets lower before the point buttons scroll; square buttons and a 2:1 court otherwise', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../../styles_beach.css'), 'utf8')
    expect(css).toMatch(/\.phone-scoreboard \.phone-court \{[^}]*aspect-ratio: 2 \/ 1/)
    expect(css).toMatch(/\.phone-scoreboard \.phone-square \{[^}]*aspect-ratio: 1 \/ 1/)
    const supports = css.match(/@supports \(height: 1cqh\) \{([\s\S]*?)\n\}/)?.[1] || ''
    const court = '(100cqw - 24px) / 2, max(var(--phone-court-min), 100cqh - var(--phone-square-reserve) - var(--phone-square-min))'
    expect(supports).toContain(`height: min(${court});`)
    expect(supports).toContain(`height: min((100cqw - 34px) / 2, max(var(--phone-square-min), 100cqh - var(--phone-square-reserve) - min(${court})));`)
    // the players get smaller with the court (two of them, one above the other)
    expect(supports).toMatch(/\.phone-court-player \{[^}]*--phone-disc-size: min\(58px, 26cqw, 40cqh\)/)
  })
})

describe('phone change-of-courts row (two pills on a 360px phone)', () => {
  // "Switch at next point" is the warning that matters most in the row, and
  // it was cut in four languages at 360-390px ("Seitenwechsel beim nä…",
  // "Changement au prochain p…"). The pills take the width their text needs
  // (flex 1 1 auto), and the two texts that can stand side by side fit the
  // row's 326px at 12px semibold: about 46 characters together.
  it('the switch warning and the longest TTO text fit side by side, in every locale', async () => {
    for (const lang of ['en', 'de', 'de-CH', 'fr', 'it']) {
      const { default: locale } = await import(`../../i18n_beach/locales/${lang}.json`)
      const phone = locale.scoreboard.phone
      const tto = [phone.ttoIn.replace('{{total}}', '21').replace('{{count}}', '21'), phone.ttoDone, phone.noTto]
      const longest = Math.max(...tto.map(s => s.length))
      expect(phone.switchNext.length + longest, `${lang}: ${phone.switchNext} + ${tto.join(' / ')}`).toBeLessThanOrEqual(46)
    }
  })
})
