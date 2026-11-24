// Audit SEC-38: "Sign out" on a shared beach tablet while the network is down
// (or stalls) left the server session valid for up to 30 days (90 from the
// sign-in): apiAuth.signOut tried the revocation once and forgot it. Now the
// token waits in a queue (localStorage 'ob:pendingSignOuts') and is sent again
// at the next start, when the device is back online and when the backend
// answers again, until the server answered (OpenVolley's apiClient.js).
// Against the real lib_beach/apiClient_beach.js, a new page load being a
// fresh module with the same localStorage.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (path) => `http://relay.test${path}`,
  getCloudApiUrl: (path) => `http://backend.test${path}`
}))

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const session = { access_token: 'tok-A', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-A', email: 'a@example.test' } }

// A new page load: the module starts over, localStorage stays
async function pageLoad() {
  vi.resetModules()
  return import('../../lib_beach/apiClient_beach')
}

async function signIn(page) {
  globalThis.fetch = vi.fn(async () => jsonResponse({ data: { session, user: session.user }, error: null }))
  await page.apiAuth.signInWithPassword({ email: 'a@example.test', password: 'pw' })
  expect(JSON.parse(localStorage.getItem('api_auth_token')).access_token).toBe('tok-A')
}

// The venue network: the request leaves, no answer comes; only its abort
// signal (the time limit) ends it
const stalled = () => vi.fn((url, init) => new Promise((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' })))
}))
const offline = () => vi.fn(async () => { throw new TypeError('Failed to fetch') })
const signOutCalls = () => globalThis.fetch.mock.calls.filter(([url]) => url === 'http://backend.test/api/auth/sign-out')
const revoked = () => signOutCalls().map(([, init]) => JSON.parse(init.body).access_token)
// the answer handled (the waiting entry dropped or kept)
const settle = () => new Promise((r) => setTimeout(r, 30))
const pending = () => JSON.parse(localStorage.getItem('ob:pendingSignOuts') || '[]').map((e) => e.token)

// A page that follows the session (AuthProvider); unsubscribed after each test
let subscriptions = []
function follow(page) {
  const { data: { subscription } } = page.apiAuth.onAuthStateChange(() => {})
  subscriptions.push(subscription)
}

// The time limit of the sign-out request, under the test's control
let limits
beforeEach(() => {
  useMemoryLocalStorage()
  limits = []
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const ctrl = new AbortController()
    limits.push({ ms, ctrl })
    return ctrl.signal
  })
})
afterEach(() => {
  for (const s of subscriptions) s.unsubscribe()
  subscriptions = []
  vi.restoreAllMocks()
})

describe('sign-out on a network that does not answer', () => {
  it('signs the device out at once, and stops waiting for the server after a few seconds', async () => {
    const page = await pageLoad()
    await signIn(page)
    globalThis.fetch = stalled()

    let finished = false
    const done = page.apiAuth.signOut().then((r) => { finished = true; return r })
    // before any answer: no session on the device
    await vi.waitFor(() => expect(localStorage.getItem('api_auth_token')).toBeNull())

    // the revocation went out with a time limit of a few seconds, and survives a closed tab
    await vi.waitFor(() => expect(signOutCalls()).toHaveLength(1))
    const [, init] = signOutCalls()[0]
    expect(init.keepalive).toBe(true)
    expect(init.signal).toBeDefined()
    expect(limits[0].ms).toBeGreaterThan(0)
    expect(limits[0].ms).toBeLessThanOrEqual(10000)
    expect(finished).toBe(false)

    limits[0].ctrl.abort()
    expect(await done).toEqual({ error: null })
    // not answered: it waits
    expect(pending()).toEqual(['tok-A'])
  })

  it('the next start on that device tells the server, once', async () => {
    const page = await pageLoad()
    await signIn(page)
    globalThis.fetch = stalled()
    page.apiAuth.signOut() // tapped; the tab is closed before any answer
    await vi.waitFor(() => expect(signOutCalls()).toHaveLength(1))

    // A new page load; the network works again
    const next = await pageLoad()
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: null, error: null }))
    const { data } = await next.apiAuth.getSession()
    expect(data.session).toBeNull()

    // the page that follows the session sends the revocation that never got through
    follow(next)
    await vi.waitFor(() => expect(revoked()).toEqual(['tok-A']))
    await settle()
    expect(pending()).toEqual([])

    // ...once: the next start has nothing left to send
    const third = await pageLoad()
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: null, error: null }))
    follow(third)
    await settle()
    expect(signOutCalls()).toHaveLength(0)
  })
})

describe('sign-out while offline', () => {
  it('is sent again when the device is back online or the backend answers, until the server answered', async () => {
    const page = await pageLoad()
    await signIn(page)
    globalThis.fetch = offline()
    await page.apiAuth.signOut()
    expect(localStorage.getItem('api_auth_token')).toBeNull()
    // tried at once, as a keepalive request and once more as a plain one
    expect(signOutCalls().map(([, init]) => !!init.keepalive)).toEqual([true, false])
    expect(pending()).toEqual(['tok-A'])

    // AuthProvider subscribing (a start) tries again: still offline, kept
    follow(page)
    await vi.waitFor(() => expect(signOutCalls()).toHaveLength(3))
    await settle()
    expect(pending()).toEqual(['tok-A'])

    // a server error keeps it too
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'Service unavailable' }, 503))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(revoked()).toEqual(['tok-A']))
    await settle()
    expect(pending()).toEqual(['tok-A'])

    // the backend answers: revoked, and not sent again
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: null, error: null }))
    window.dispatchEvent(new Event(page.BACKEND_REACHED_EVENT))
    await vi.waitFor(() => expect(revoked()).toEqual(['tok-A']))
    await settle()
    expect(pending()).toEqual([])
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: null, error: null }))
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(signOutCalls()).toHaveLength(0)
  })

  it('a token the server refuses for good (401) is not sent again; the app never signs in with a waiting token', async () => {
    const page = await pageLoad()
    await signIn(page)
    globalThis.fetch = offline()
    await page.apiAuth.signOut()
    expect(pending()).toEqual(['tok-A'])
    expect((await page.apiAuth.getSession()).data.session).toBeNull()

    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'Invalid token', code: 'invalid_token' } }, 401))
    await page.sendPendingSignOuts()
    expect(revoked()).toEqual(['tok-A'])
    expect(pending()).toEqual([])
  })

  it('keeps at most 10 waiting tokens, and none older than the 90 days a session can live', async () => {
    const old = Date.now() - 91 * 24 * 3600 * 1000
    localStorage.setItem('ob:pendingSignOuts', JSON.stringify([{ token: 'tok-old', at: old }, ...Array.from({ length: 12 }, (_, i) => ({ token: `tok-${i}`, at: Date.now() }))]))
    const page = await pageLoad()
    await signIn(page)
    globalThis.fetch = offline()
    await page.apiAuth.signOut()
    const list = pending()
    expect(list).toHaveLength(10)
    expect(list).not.toContain('tok-old')
    expect(list[list.length - 1]).toBe('tok-A')
  })
})
