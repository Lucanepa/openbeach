// The whole scoretable app (App_beach.jsx, as main_beach.jsx mounts it) over
// the app's Dexie database (import '../helpers/fakeIndexedDb' first),
// offline: for the screen changes, which only App makes. `track` records
// each distinct state the page shows.
import { vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { AuthProvider } from '../../contexts_beach/AuthContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import App from '../../App_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
export function offline() {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  // jsdom has no canvas: a 2D context that draws nothing
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({})), set: (t, k, v) => { t[k] = v; return true } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,')
}

export function online() {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
}

export const mountApp = () => render(
  <ScaleProvider><AuthProvider><AlertProvider><LoggingProvider><App /></LoggingProvider></AlertProvider></AuthProvider></ScaleProvider>
)

export const button = (text, { enabled = true } = {}) => [...document.querySelectorAll('button')]
  .find(b => b.textContent.trim() === text && (!enabled || !b.disabled))
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Every committed change of what `see()` reads from the page, de-duplicated
export function track(see) {
  const states = []
  const note = () => {
    const s = see()
    if (JSON.stringify(states.at(-1)) !== JSON.stringify(s)) states.push(s)
  }
  note()
  const observer = new MutationObserver(note)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
  return { states, stop: () => observer.disconnect() }
}
