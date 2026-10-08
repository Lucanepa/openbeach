/**
 * OB-11b end to end, opt-in like venueRelay.integration.test.js (OpenVolley's
 * Node relay in --local mode, which checks the referee PIN itself):
 *
 *   OB_RELAY_BACKEND_DIR=<openvolley>/escoresheet/backend \
 *     npx vitest run src_beach/__tests__/integration/testMatchReferee.integration.test.jsx
 *
 * or OB_RELAY_URL=http://127.0.0.1:<port> for a relay already running.
 *
 * The whole app starts a test match ("New match > Test match"), the scorer's
 * real relay code publishes it, and a referee joins with its PIN through
 * serverDataSync_beach, as the referee app does, without the scorer touching
 * Connect tablets. Then Connect tablets' own switch (setRoleEnabled) turns
 * the referee off, and the same PIN is refused. An official match made the
 * way Match Setup makes it still keeps its referee out until it is turned on.
 */
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { waitFor as rtlWaitFor, fireEvent } from '@testing-library/react'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep } from '../helpers/appMount'

const RELAY_DIR = process.env.OB_RELAY_BACKEND_DIR || ''
const RELAY_URL_ENV = process.env.OB_RELAY_URL || ''
const relay = { base: RELAY_URL_ENV, child: null }

vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()), // the whole app imports more of it
  isBackendAvailable: () => false,
  getApiUrl: (p) => `${relay.base}${p.startsWith('/') ? p : `/${p}`}`,
  getCloudApiUrl: () => null,
  getBackendUrl: () => relay.base,
  getRelayWebSocketUrl: () => relay.base.replace(/^http/, 'ws'),
  getWebSocketUrl: () => relay.base.replace(/^http/, 'ws'),
  getCloudWebSocketUrl: () => null,
  isCloudOffline: () => false,
  isRelayOriginPage: () => false
}))

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer()
  srv.on('error', reject)
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address()
    srv.close(() => resolve(port))
  })
})
async function until(fn, what, timeoutMs = 5000) {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

describe.skipIf(!RELAY_DIR && !RELAY_URL_ENV)('a test match: the referee joins at once (OB-11b, real relay)', () => {
  let NodeWebSocket, pub, sync, connect, tablets
  const detachers = []

  beforeAll(async () => {
    if (!relay.base) {
      const port = await freePort()
      const env = { ...process.env, PORT: String(port), OV_PIN_SECRET: randomBytes(36).toString('base64url') }
      for (const k of ['DATABASE_URL', 'IS_CLOUD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'POCKETBASE_URL']) delete env[k]
      relay.child = spawn(process.execPath, ['server.js', '--local'], { cwd: RELAY_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
      relay.base = `http://127.0.0.1:${port}`
      await until(async () => {
        try { return (await fetch(`${relay.base}/api/server/status`)).ok } catch { return false }
      }, 'the relay', 15000)
    }
    ;({ WebSocket: NodeWebSocket } = await import('ws'))
    pub = await import('../../utils_beach/relayPublisher_beach')
    sync = await import('../../utils_beach/serverDataSync_beach')
    connect = await import('../../components_beach/connect/ConnectTabletsModal_beach')
    tablets = await import('../../components_beach/connect/tabletLinks_beach')
  }, 30000)

  afterAll(async () => {
    for (const d of detachers) d()
    await sleep(50)
    if (relay.child) {
      relay.child.kill('SIGTERM')
      await new Promise((r) => { relay.child.once('exit', r); setTimeout(r, 3000) })
    }
  })

  // The scorer's own relay code on its own socket (the app's is offline here)
  async function scorerOn() {
    const conn = pub.createScorerRelay({ createSocket: (url) => new NodeWebSocket(url), events: null, doc: null })
    const publisher = pub.createRelayMatchPublisher({ relay: conn })
    const errors = []
    let opens = 0
    detachers.push(conn.attach(relay.base.replace(/^http/, 'ws'), {
      onOpen: () => { opens++ },
      onMessage: (m) => { if (m.type === 'error') errors.push(m) }
    }))
    await until(() => conn.isOpen() && opens > 0, 'scorer connected')
    return { conn, publisher, errors, sync: (matchId) => connect.syncMatchToRelay(matchId, { relay: conn, publisher }) }
  }

  const referee = (pin) => sync.validatePin(pin, 'referee').catch((e) => ({ success: false, error: e.message }))

  it('New match > Test match: the referee PIN opens it on the relay; Connect tablets turns it off', async () => {
    // The scorer starts a test match in the app (no network for the app)
    offline()
    let row
    try {
      mountApp()
      await rtlWaitFor(() => expect(button('New match')).toBeTruthy(), { timeout: 8000 })
      fireEvent.click(button('New match'))
      const menuTestMatch = () => [...document.querySelectorAll('button:not([data-match-info-menu])')]
        .find(b => b.textContent.trim() === 'Test match' && !b.disabled)
      await rtlWaitFor(() => expect(menuTestMatch()).toBeTruthy())
      fireEvent.click(menuTestMatch())
      await rtlWaitFor(() => expect(/Match setup/i.test(document.body.textContent) && !button('Restore match')).toBe(true), { timeout: 8000 })
      await sleep(500) // Match Setup's own start-up writes
      row = (await db.matches.toArray()).find(m => m.test === true)
    } finally {
      online()
    }
    expect(row.refereePin).toMatch(/^\d{6}$/)

    // Its relay room: the test match's own seed key
    const scorer = await scorerOn()
    expect(await scorer.sync(row.id)).not.toBe(false)
    const key = pub.relayMatchKey(await db.matches.get(row.id))
    expect(key).toBeTruthy()
    await until(async () => ((await (await fetch(`${relay.base}/api/match/list`)).json()).matches || []).some(m => m.id === key), 'the test match listed')

    // A referee joins with the PIN, nobody touched Connect tablets
    const ok = await referee(row.refereePin)
    expect(ok.success, ok.error).toBe(true)
    expect(String(ok.match.id)).toBe(key)

    // Connect tablets: referee off; the relay hears at once, the PIN is refused
    const access = tablets.roleAccess(await db.matches.get(row.id), 'referee')
    expect(access.enabled).toBe(true)
    await connect.setRoleEnabled(row.id, access, false, { syncRelay: scorer.sync })
    expect((await db.matches.get(row.id)).refereeConnectionEnabled).toBe(false)
    await until(async () => (await referee(row.refereePin)).success === false, 'the referee locked out')

    // ... and on again lets it back in
    await connect.setRoleEnabled(row.id, access, true, { syncRelay: scorer.sync })
    await until(async () => (await referee(row.refereePin)).success === true, 'the referee back in')
    expect(scorer.errors).toEqual([])
    scorer.publisher.remove(key)
  }, 60000)

  it('an official match as Match Setup makes it: the referee PIN stays refused until turned on', async () => {
    const pin = String(100000 + Math.floor(Math.random() * 800000))
    const seed = `match_${Date.now()}_official${Math.random().toString(36).slice(2, 6)}`
    const team1Id = await db.teams.add({ name: 'Muster / Beispiel' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    const id = await db.matches.add({
      seed_key: seed, status: 'live', team1Id, team2Id, test: false,
      team1Name: 'Muster / Beispiel', team2Name: 'Rossi / Bianchi',
      refereePin: pin, team1Pin: '111111', team2Pin: '222222', matchPin: 'local-1',
      refereeConnectionEnabled: false, team1TeamConnectionEnabled: false, team2TeamConnectionEnabled: false
    })
    await db.sets.add({ matchId: id, index: 1, team1Points: 0, team2Points: 0, finished: false })
    const scorer = await scorerOn()
    await scorer.sync(id)
    await until(async () => ((await (await fetch(`${relay.base}/api/match/list`)).json()).matches || []).some(m => m.id === seed), 'the official match listed')
    expect((await referee(pin)).success).toBe(false)

    const access = tablets.roleAccess(await db.matches.get(id), 'referee')
    await connect.setRoleEnabled(id, access, true, { syncRelay: scorer.sync })
    await until(async () => (await referee(pin)).success === true, 'the referee let in')
    scorer.publisher.remove(seed)
  }, 30000)
})
