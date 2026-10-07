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
  setLiveMatch,
  trayLabels
} from '../../utils_beach/appLifecycle_beach'
import { confirmDialog, getConfirmSnapshot, settleConfirm } from '../../ui/volleyui/uiStore'

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
      updateStatus: 'Update ready'
    })
    for (const v of Object.values(labels)) expect(v).not.toMatch(/OpenVolley/)
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
