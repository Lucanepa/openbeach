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
