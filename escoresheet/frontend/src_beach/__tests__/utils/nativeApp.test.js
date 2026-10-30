/**
 * The Android app (Capacitor): the Back button's exit question
 * (appLifecycle_beach) and the scoreboard's landscape lock
 * (nativeOrientation_beach).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ANDROID_BACK_HOOK,
  closeOpenDialog,
  exitAndroidApp,
  installAndroidBack,
  isCapacitorApp,
  resetAppLifecycleForTests
} from '../../utils_beach/appLifecycle_beach'
import { lockLandscape, unlockOrientation } from '../../utils_beach/nativeOrientation_beach'
import { flushNativeBackups } from '../../utils_beach/nativeBackup/index_beach'

// The match's last backup file before the app goes (no engine here: at once)
vi.mock('../../utils_beach/nativeBackup/index_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  flushNativeBackups: vi.fn(async () => {})
}))

const flush = () => new Promise((r) => setTimeout(r, 0))

function nativeApp() {
  const exitApp = vi.fn(() => Promise.resolve())
  const registerPlugin = vi.fn(() => ({ exitApp }))
  window.Capacitor = { isNativePlatform: () => true, registerPlugin }
  return { exitApp, registerPlugin }
}

afterEach(() => {
  delete window.Capacitor
  delete window[ANDROID_BACK_HOOK]
  document.body.innerHTML = ''
  resetAppLifecycleForTests()
})

describe('the Android Back button', () => {
  it('is not installed in a browser', () => {
    const uninstall = installAndroidBack({ ask: vi.fn() })
    expect(isCapacitorApp()).toBe(false)
    expect(window[ANDROID_BACK_HOOK]).toBeUndefined()
    uninstall()
  })

  it('asks before exiting, and exits only on Exit', async () => {
    const { exitApp, registerPlugin } = nativeApp()
    let answer
    const ask = vi.fn(() => new Promise((resolve) => { answer = resolve }))
    const uninstall = installAndroidBack({ ask })

    expect(window[ANDROID_BACK_HOOK]()).toBe(true)
    await flush()
    expect(ask).toHaveBeenCalledTimes(1)
    // a second Back while it asks: still one question
    expect(window[ANDROID_BACK_HOOK]()).toBe(true)
    await flush()
    expect(ask).toHaveBeenCalledTimes(1)

    answer(false)
    await flush()
    expect(exitApp).not.toHaveBeenCalled()

    window[ANDROID_BACK_HOOK]()
    await flush()
    answer(true)
    await flush()
    expect(registerPlugin).toHaveBeenCalledWith('OpenBeachApp')
    expect(exitApp).toHaveBeenCalledTimes(1)

    uninstall()
    expect(window[ANDROID_BACK_HOOK]).toBeUndefined()
  })

  // Exit finishes the activity at once: the last point's backup file first
  it('Exit writes the match\'s last backup file before the app closes', async () => {
    const { exitApp } = nativeApp()
    let written
    flushNativeBackups.mockClear()
    flushNativeBackups.mockImplementationOnce(() => new Promise((r) => { written = r }))
    const uninstall = installAndroidBack({ ask: vi.fn().mockResolvedValue(true) })
    window[ANDROID_BACK_HOOK]()
    await vi.waitFor(() => expect(flushNativeBackups).toHaveBeenCalledWith(1500))
    await flush()
    expect(exitApp).not.toHaveBeenCalled()
    written()
    await vi.waitFor(() => expect(exitApp).toHaveBeenCalled())
    uninstall()
  })

  // Android may end a backgrounded app without a word (a swipe from the
  // recent apps): the last backup file is written as it goes
  describe('going to the background writes the last backup file', () => {
    function setVisibility(state) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    }
    afterEach(() => {
      delete document.visibilityState
    })

    it('on Capacitor\'s pause (the activity\'s onPause), once while it writes', async () => {
      nativeApp()
      setVisibility('visible')
      let written
      flushNativeBackups.mockClear()
      flushNativeBackups.mockImplementationOnce(() => new Promise((r) => { written = r }))
      const ask = vi.fn()
      const uninstall = installAndroidBack({ ask })
      document.dispatchEvent(new Event('pause'))
      expect(flushNativeBackups).toHaveBeenCalledWith(1500)
      // the page goes hidden with it: the same write
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(flushNativeBackups).toHaveBeenCalledTimes(1)
      written()
      await flush()
      // back and away again: a new one
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(flushNativeBackups).toHaveBeenCalledTimes(1)
      document.dispatchEvent(new Event('pause'))
      expect(flushNativeBackups).toHaveBeenCalledTimes(2)
      expect(ask).not.toHaveBeenCalled()
      await flush()
      uninstall()
      document.dispatchEvent(new Event('pause'))
      expect(flushNativeBackups).toHaveBeenCalledTimes(2)
    })

    it('on the page going hidden', () => {
      nativeApp()
      flushNativeBackups.mockClear()
      const uninstall = installAndroidBack({ ask: vi.fn() })
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(flushNativeBackups).toHaveBeenCalledWith(1500)
      uninstall()
    })

    it('on the App plugin\'s appStateChange, where the app has it', async () => {
      nativeApp()
      let listener
      const remove = vi.fn()
      window.Capacitor.Plugins = { App: { addListener: vi.fn(async (name, fn) => { listener = fn; return { remove } }) } }
      flushNativeBackups.mockClear()
      const uninstall = installAndroidBack({ ask: vi.fn() })
      await flush()
      expect(window.Capacitor.Plugins.App.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function))
      listener({ isActive: true })
      expect(flushNativeBackups).not.toHaveBeenCalled()
      listener({ isActive: false })
      expect(flushNativeBackups).toHaveBeenCalledWith(1500)
      uninstall()
      expect(remove).toHaveBeenCalled()
    })

    it('a write that fails changes nothing for the app', async () => {
      nativeApp()
      flushNativeBackups.mockClear()
      flushNativeBackups.mockImplementationOnce(async () => { throw new Error('disk gone') })
      const uninstall = installAndroidBack({ ask: vi.fn() })
      document.dispatchEvent(new Event('pause'))
      await flush()
      document.dispatchEvent(new Event('pause'))
      expect(flushNativeBackups).toHaveBeenCalledTimes(2)
      uninstall()
    })

    it('not in a browser', () => {
      flushNativeBackups.mockClear()
      const uninstall = installAndroidBack({ ask: vi.fn() })
      document.dispatchEvent(new Event('pause'))
      expect(flushNativeBackups).not.toHaveBeenCalled()
      uninstall()
    })
  })

  it('closes an open dialog first, through its close button', async () => {
    nativeApp()
    const ask = vi.fn(() => Promise.resolve(false))
    installAndroidBack({ ask })
    const onClose = vi.fn()
    document.body.innerHTML = '<div role="dialog" aria-modal="true"><button data-modal-close>Close</button></div>'
    document.querySelector('[data-modal-close]').addEventListener('click', onClose)

    expect(window[ANDROID_BACK_HOOK]()).toBe(true)
    await flush()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(ask).not.toHaveBeenCalled()
  })

  it('sends Escape to a dialog without a close button, and never asks over it', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"><input id="f" /></div>'
    const keys = []
    document.querySelector('[aria-modal]').addEventListener('keydown', (e) => keys.push(e.key))
    expect(closeOpenDialog(window)).toBe(true)
    expect(keys).toEqual(['Escape'])
    document.body.innerHTML = ''
    expect(closeOpenDialog(window)).toBe(false)
  })

  it('has no exit outside the app', () => {
    expect(exitAndroidApp(window)).toBeUndefined()
  })
})

describe('the scoreboard landscape lock', () => {
  it('does nothing in a browser', async () => {
    await expect(lockLandscape()).resolves.toBeUndefined()
    await expect(unlockOrientation()).resolves.toBeUndefined()
  })
})
