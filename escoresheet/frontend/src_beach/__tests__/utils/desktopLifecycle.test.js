import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import i18n from 'i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import {
  LIFECYCLE_EVENT,
  closeNotice,
  getLiveMatch,
  installAppLifecycle,
  isDesktopScoretable,
  liveOf,
  quitQuestion,
  requestDesktopQuit,
  resetAppLifecycleForTests,
  resolveDesktopWindow,
  setLiveMatch,
  trayLabels,
  windowsLine
} from '../../utils_beach/appLifecycle_beach'
import { confirmDialog, getConfirmSnapshot, settleConfirm } from '../../ui/volleyui/uiStore'
import { openAppWindow, resetAppWindowsForTests } from '../../utils_beach/openAppWindow_beach'

// The OpenBeach desktop app (OpenVolley's Tauri shell, beach flavour) only
// starts its updater once the page has called app_page_state
// (updater.rs waits on lifecycle page_ready()). Without this module no
// installed OpenBeach ever updated itself, closing never went to the tray and
// the tray never showed tablets or a live match.

beforeAll(async () => {
  await i18n.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, de: { translation: de } } })
})

beforeEach(async () => {
  resetAppLifecycleForTests()
  resetAppWindowsForTests()
  await i18n.changeLanguage('en')
})

const flush = () => new Promise((r) => setTimeout(r, 0))

/** The desktop app's scoretable window: an EventTarget with Tauri's invoke. */
function desktopWin({ label = 'main', status = {} } = {}) {
  const win = new EventTarget()
  const invoke = vi.fn(async (cmd) => {
    if (cmd === 'app_page_state') return { tray: status.tray ?? true }
    if (cmd === 'hotspot_status') return status.wifi ?? { active: false }
    if (cmd === 'bluetooth_status') return status.bt ?? { active: false }
    if (cmd === 'app_windows') return typeof status.windows === 'function' ? status.windows() : (status.windows ?? [])
    return null
  })
  win.__TAURI_INTERNALS__ = { invoke, metadata: { currentWindow: { label } } }
  return { win, invoke }
}

const fire = (win, type) => win.dispatchEvent(new CustomEvent(LIFECYCLE_EVENT, { detail: { type } }))

describe('live match', () => {
  it('is official / test only while live', () => {
    expect(liveOf(null)).toBe('none')
    expect(liveOf({ status: 'scheduled' })).toBe('none')
    expect(liveOf({ status: 'final', test: true })).toBe('none')
    expect(liveOf({ status: 'live' })).toBe('official')
    expect(liveOf({ status: 'live', test: true })).toBe('test')
    setLiveMatch('bogus')
    expect(getLiveMatch()).toBe('none')
  })
})

describe('questions, in OpenBeach\'s name', () => {
  it('quit: tablets disconnect; the laptop network only when it runs', () => {
    const q = quitQuestion()
    expect(q).toMatchObject({ title: 'Quit OpenBeach?', tone: 'danger', confirmLabel: 'Quit OpenBeach', cancelLabel: 'Keep running' })
    expect(q.message).toBe("Tablets on this computer's network will disconnect.")
    expect(quitQuestion({ wifi: true }).message).toContain("The laptop's Wi-Fi for tablets will stop.")
    expect(quitQuestion({ live: 'official' }).title).toBe('Quit OpenBeach during the match?')
    expect(quitQuestion({ live: 'test' }).message).toMatch(/^A test match is in progress/)
  })

  it('in the page language', async () => {
    await i18n.changeLanguage('de')
    expect(quitQuestion({ live: 'official' })).toMatchObject({ title: 'OpenBeach während des Spiels beenden?', confirmLabel: 'OpenBeach beenden' })
    expect(trayLabels()).toMatchObject({ show: 'OpenBeach anzeigen', quit: 'OpenBeach beenden…', tablets: '{{count}} Tablets verbunden' })
  })

  it('tray labels keep {{count}} / {{version}} for the app to fill in', () => {
    const labels = trayLabels()
    expect(labels).toMatchObject({
      tooltip: 'OpenBeach eScoresheet',
      show: 'Show OpenBeach',
      quit: 'Quit OpenBeach…',
      tablets: '{{count}} tablets connected',
      quitTitle: 'Quit OpenBeach?',
      updateReady: 'Restart to update to {{version}}',
      updateStatus: 'Update ready',
      // the other app windows the quit closes, in the native question
      alsoCloses: 'Also closes: {{windows}}',
      windowGroupOne: '{{name}} ({{count}} window)',
      windowGroupOther: '{{name}} ({{count}} windows)',
      windowScoresheet: 'Scoresheet'
    })
    for (const v of Object.values(labels)) expect(v).not.toMatch(/OpenVolley/)
  })

  // Quitting closes the scoresheet windows too (the app's lifecycle.rs): the
  // one question says so. (OpenVolley 64524438.)
  it('quit lists the other app windows it closes, grouped, in one line', () => {
    expect(windowsLine([])).toBe('')
    expect(windowsLine(['OpenBeach Scoresheet'])).toBe('Also closes: Scoresheet (1 window)')
    // a window before its page set a title has the app's title: a scoresheet too
    expect(windowsLine(['OpenBeach Scoresheet', 'OpenBeach eScoresheet', 'Scoreboard - OpenBeach', ''])).toBe(
      'Also closes: Scoresheet (3 windows), Scoreboard - OpenBeach (1 window)')
    const q = quitQuestion({ windows: ['OpenBeach Scoresheet', 'OpenBeach Scoresheet'] })
    expect(q.message).toBe("Tablets on this computer's network will disconnect.\n\nAlso closes: Scoresheet (2 windows)")
    expect(q.title).toBe('Quit OpenBeach?')
    // a window title is page text: no control characters, cut
    expect(windowsLine([`Report\u0007${'x'.repeat(200)}`])).toMatch(/^Also closes: Reportx{54} \(1 window\)$/)
  })

  it('says when a scoresheet window is still saving a PDF', () => {
    expect(quitQuestion({ windows: ['OpenBeach Scoresheet'], pdfBusy: true }).message).toMatch(
      /Also closes: Scoresheet \(1 window\)\n\nA PDF is still being saved in the scoresheet window\.$/)
    expect(quitQuestion({ windows: ['OpenBeach Scoresheet'] }).message).not.toContain('PDF')
  })

  it('the windows line in the page language, placeholders kept for the app', async () => {
    await i18n.changeLanguage('de')
    expect(windowsLine(['OpenBeach Scoresheet', 'OpenBeach Scoresheet'])).toBe('Schliesst auch: Matchblatt (2 Fenster)')
    expect(trayLabels()).toMatchObject({
      alsoCloses: 'Schliesst auch: {{windows}}',
      windowGroupOne: '{{name}} ({{count}} Fenster)',
      windowGroupOther: '{{name}} ({{count}} Fenster)',
      windowScoresheet: 'Matchblatt'
    })
  })

  it('close notice: tray or minimised', () => {
    expect(closeNotice({ tray: true })).toMatchObject({ title: 'OpenBeach keeps running in the tray', confirmLabel: 'Hide window' })
    expect(closeNotice({ tray: false })).toMatchObject({ title: 'OpenBeach keeps running', confirmLabel: 'Minimise window' })
  })
})

describe('desktop app', () => {
  let uninstall = () => {}
  afterEach(() => uninstall())

  it('only the scoretable window, not a scoresheet window or a browser', () => {
    expect(isDesktopScoretable(desktopWin().win)).toBe(true)
    expect(isDesktopScoretable(desktopWin({ label: 'popup-1' }).win)).toBe(false)
    expect(isDesktopScoretable({})).toBe(false)
    expect(installAppLifecycle({ win: new EventTarget() })).toBeTypeOf('function')
  })

  // A pop-up window in the real Linux app (WebKitGTK): its own metadata names
  // the opener, "main", while the app refuses it the scoretable's commands
  // as "popup-<n>" (measured 2026-10-08; diagnostics_beach/popupForward_beach.js)
  function linuxPopupWin({ opener = {} } = {}) {
    const win = new EventTarget()
    win.opener = opener
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'diagnostics_append') throw `diagnostics_append not allowed on window "popup-1", webview "popup-1", URL: http://localhost:5173/scoresheet/`
      return null
    })
    win.__TAURI_INTERNALS__ = { invoke, metadata: { currentWindow: { label: 'main' } } }
    return { win, invoke }
  }

  it('a Linux pop-up whose metadata says "main" is no scoretable: its opener says so at once', async () => {
    const { win, invoke } = linuxPopupWin()
    expect(isDesktopScoretable(win)).toBe(false)
    expect(await resolveDesktopWindow(win)).toBe(false)
    expect(isDesktopScoretable(win)).toBe(false)
    expect(invoke).toHaveBeenCalledWith('diagnostics_append', { lines: [] })
  })

  it('a pop-up opened without an opener is known once the app has said which window it is', async () => {
    const { win } = linuxPopupWin({ opener: null })
    expect(isDesktopScoretable(win)).toBe(true) // the metadata's guess until the app answers
    expect(await resolveDesktopWindow(win)).toBe(false)
    expect(isDesktopScoretable(win)).toBe(false)
  })

  it('the scoretable: the app takes its (empty) diagnostics line; asked once', async () => {
    const { win, invoke } = desktopWin()
    expect(isDesktopScoretable(win)).toBe(true)
    expect(await resolveDesktopWindow(win)).toBe(true)
    expect(await resolveDesktopWindow(win)).toBe(true)
    expect(isDesktopScoretable(win)).toBe(true)
    expect(invoke.mock.calls.filter(([cmd]) => cmd === 'diagnostics_append')).toHaveLength(1)
  })

  it('outside the desktop app nothing is asked', async () => {
    expect(await resolveDesktopWindow({})).toBe(false)
    expect(await resolveDesktopWindow(undefined)).toBe(false)
  })

  it('reports app_page_state at once (the updater waits for it), again on a live match or a language change', async () => {
    const { win, invoke } = desktopWin()
    uninstall = installAppLifecycle({ win, ask: vi.fn() })
    expect(invoke).toHaveBeenCalledWith('app_page_state', { handler: expect.any(String), labels: trayLabels(), live: 'none' })
    setLiveMatch('test')
    expect(invoke).toHaveBeenLastCalledWith('app_page_state', expect.objectContaining({ live: 'test' }))
    await i18n.changeLanguage('de')
    expect(invoke).toHaveBeenLastCalledWith('app_page_state', expect.objectContaining({ labels: expect.objectContaining({ show: 'OpenBeach anzeigen' }) }))
  })

  it('the first close shows the notice, then hides to the tray', async () => {
    const { win, invoke } = desktopWin()
    const ask = vi.fn().mockResolvedValue(true)
    uninstall = installAppLifecycle({ win, ask })
    await flush()
    fire(win, 'close-requested')
    await flush()
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'OpenBeach keeps running in the tray' }))
    expect(invoke).toHaveBeenCalledWith('app_hide')
  })

  it('quit from the tray is taken (app_quit_ack), asks; cancel keeps running, confirm quits', async () => {
    const { win, invoke } = desktopWin({ status: { wifi: { active: true, external: false } } })
    const ask = vi.fn().mockResolvedValue(false)
    uninstall = installAppLifecycle({ win, ask })
    setLiveMatch('official')
    fire(win, 'quit-requested')
    expect(invoke).toHaveBeenCalledWith('app_quit_ack')
    await flush(); await flush()
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Quit OpenBeach during the match?',
      message: expect.stringContaining("The laptop's Wi-Fi for tablets will stop.")
    }))
    expect(invoke).not.toHaveBeenCalledWith('app_quit')
    ask.mockResolvedValue(true)
    expect(await requestDesktopQuit(win, ask)).toBe(true)
    expect(invoke).toHaveBeenCalledWith('app_quit')
  })

  it('one question for every window: it lists the scoresheet windows the quit closes', async () => {
    const { win, invoke } = desktopWin({ status: { windows: ['OpenBeach Scoresheet', 'OpenBeach Scoresheet'] } })
    const ask = vi.fn().mockResolvedValue(true)
    expect(await requestDesktopQuit(win, ask)).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0][0].message).toContain('Also closes: Scoresheet (2 windows)')
    expect(invoke).toHaveBeenCalledWith('app_windows')
    expect(invoke).toHaveBeenCalledWith('app_quit')
    // quitting: the hidden scoresheet windows are not brought back
    expect(invoke).not.toHaveBeenCalledWith('app_quit_cancel')
  })

  it('Keep running brings back the scoresheet windows the quit request left hidden', async () => {
    const { win, invoke } = desktopWin({ status: { windows: ['OpenBeach Scoresheet'] } })
    const ask = vi.fn().mockResolvedValue(false)
    expect(await requestDesktopQuit(win, ask)).toBe(false)
    expect(invoke).not.toHaveBeenCalledWith('app_quit')
    expect(invoke).toHaveBeenCalledWith('app_quit_cancel')
  })

  it('an app that does not list its windows in time does not hold the question', async () => {
    vi.useFakeTimers()
    try {
      const { win } = desktopWin({ status: { windows: () => new Promise(() => {}) } })
      const ask = vi.fn().mockResolvedValue(false)
      const quitting = requestDesktopQuit(win, ask)
      await vi.advanceTimersByTimeAsync(1500)
      expect(await quitting).toBe(false)
      expect(ask).toHaveBeenCalledTimes(1)
      expect(ask.mock.calls[0][0].message).not.toContain('Also closes')
    } finally {
      vi.useRealTimers()
    }
  })

  it('says when a scoresheet window it opened is still saving a PDF', async () => {
    const { win } = desktopWin({ status: { windows: ['OpenBeach Scoresheet'] } })
    const scoresheet = { closed: false, __obPdfBusy: true }
    win.location = { href: 'http://localhost:5174/', origin: 'http://localhost:5174' }
    win.open = () => scoresheet
    openAppWindow('/scoresheet_beach.html?action=save', { win, platform: 'tauri' })
    const ask = vi.fn().mockResolvedValue(false)
    await requestDesktopQuit(win, ask)
    expect(ask.mock.calls[0][0].message).toContain('A PDF is still being saved in the scoresheet window.')
    scoresheet.__obPdfBusy = false
    await requestDesktopQuit(win, ask)
    expect(ask.mock.calls[1][0].message).not.toContain('PDF')
  })

  it('without a dialog host it does not take the request (the app asks natively)', async () => {
    const { win, invoke } = desktopWin()
    expect(await requestDesktopQuit(win, confirmDialog)).toBe(false)
    expect(invoke).not.toHaveBeenCalledWith('app_quit_ack')
    expect(getConfirmSnapshot()).toBeNull()
  })

  it('uninstalling (a crash into the error screen) tells the app its handler is gone', () => {
    const { win, invoke } = desktopWin()
    const stop = installAppLifecycle({ win, ask: vi.fn() })
    const { handler } = invoke.mock.calls.find(([cmd]) => cmd === 'app_page_state')[1]
    stop()
    expect(invoke).toHaveBeenLastCalledWith('app_page_gone', { handler })
  })

  it('with the real dialog: a tray quit takes the first-close notice away', async () => {
    const { win } = desktopWin()
    uninstall = installAppLifecycle({ win, ask: confirmDialog })
    fire(win, 'close-requested')
    await flush()
    expect(getConfirmSnapshot()).toMatchObject({ title: 'OpenBeach keeps running in the tray' })
    const quitting = requestDesktopQuit(win, confirmDialog, { canAsk: () => true })
    await flush(); await flush()
    expect(getConfirmSnapshot()).toMatchObject({ title: 'Quit OpenBeach?' })
    settleConfirm(getConfirmSnapshot().id, false)
    expect(await quitting).toBe(false)
    expect(getConfirmSnapshot()).toBeNull()
  })
})
