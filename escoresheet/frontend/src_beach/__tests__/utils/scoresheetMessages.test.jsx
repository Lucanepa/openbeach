// Audit SEC-43: the PDF scoresheet window (scoresheet_beach.html) took
// REFRESH_SCORESHEET from any origin and any window, so a page that framed
// or opened it posted invented teams and scores into the official sheet; the
// scoretable answered any REQUEST_SCORESHEET_REFRESH by posting the whole
// match, PINs included, to '*', and showed SCORESHEET_ERROR text from any
// origin. Now (utils_beach/scoresheetMessages_beach.js, after OpenVolley's
// scoresheetErrorMessage.js) every message goes to the app's own origin
// only and is taken only from it and from the window it belongs to.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  postScoresheetRefresh,
  refreshDataFromEvent,
  isRefreshRequestFrom,
  requestScoresheetRefresh,
  postScoresheetError,
  scoresheetErrorFromEvent,
  scoresheetMatch,
  MAX_ERROR_TEXT
} from '../../utils_beach/scoresheetMessages_beach'

const frontendDir = resolve(__dirname, '../../..')
const ORIGIN = window.location.origin

const matchData = (name1, name2, game) => ({
  match: { id: 7, scheduledAt: '2026-10-25T09:00:00.000Z', coinTossTeamA: 'team1', coinTossTeamB: 'team2', game_n: game, gameNumber: String(game) },
  team_1Team: { id: 1, name: name1 }, team_2Team: { id: 2, name: name2 },
  team_1Players: [], team_2Players: [], sets: [], events: []
})

describe('the sheet window takes data only from the window that opened it', () => {
  let Sheet
  let opener
  beforeAll(async () => {
    Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
  })
  afterEach(() => {
    cleanup()
    opener?.remove()
    opener = null
    delete window.opener
  })

  // A same-origin window to stand for the scoretable that opened the sheet
  function openedBy() {
    opener = document.createElement('iframe')
    document.body.appendChild(opener)
    Object.defineProperty(window, 'opener', { value: opener.contentWindow, configurable: true, writable: true })
    return opener.contentWindow
  }
  const send = (init) => act(async () => { window.dispatchEvent(new MessageEvent('message', init)) })

  it('a message of another origin, or of another window, leaves the sheet as it is; the opener\'s is taken', async () => {
    const scoretable = openedBy()
    let fields = null
    render(<Sheet matchData={matchData('Alpha / Beta', 'Gamma / Delta', 715)} onDataReady={(f) => { fields = f }} />)
    expect(fields.match_no).toBe('715')

    // the audit's PoC: a foreign page posts a forged sheet
    await send({ origin: 'https://evil.example', source: null, data: { type: 'REFRESH_SCORESHEET', data: matchData('Forged / Team', 'Other / Team', 999) } })
    expect(fields.match_no).toBe('715')
    // the right origin, but not the window that opened the sheet
    await send({ origin: ORIGIN, source: window, data: { type: 'REFRESH_SCORESHEET', data: matchData('Forged / Team', 'Other / Team', 998) } })
    expect(fields.match_no).toBe('715')
    // the opener on another origin (navigated away)
    await send({ origin: 'https://evil.example', source: scoretable, data: { type: 'REFRESH_SCORESHEET', data: matchData('Forged / Team', 'Other / Team', 997) } })
    expect(fields.match_no).toBe('715')

    // the scoretable that opened it: taken
    await send({ origin: ORIGIN, source: scoretable, data: { type: 'REFRESH_SCORESHEET', data: matchData('Alpha / Beta', 'Gamma / Delta', 716) } })
    expect(fields.match_no).toBe('716')
  })

  it('a sheet nobody opened takes no data from messages at all', () => {
    const event = new MessageEvent('message', { origin: ORIGIN, source: window, data: { type: 'REFRESH_SCORESHEET', data: matchData('A', 'B', 1) } })
    expect(refreshDataFromEvent(event, { opener: null })).toBeNull()
  })
})

describe('the scoretable side', () => {
  it('the refresh goes to the app\'s own origin only, without PINs or session ids', () => {
    const target = { postMessage: vi.fn() }
    const data = {
      ...matchData('A', 'B', 3),
      match: { id: 3, game_n: 3, gamePin: '123456', refereePin: '654321', team1Pin: '111111', team2Pin: '222222', team1UploadPin: '333333', team2UploadPin: '444444', sessionId: 's-1', connection_pins: { referee: '1' }, team1Country: 'SUI' }
    }
    postScoresheetRefresh(target, data)
    const [message, targetOrigin] = target.postMessage.mock.calls[0]
    expect(targetOrigin).toBe(ORIGIN)
    expect(targetOrigin).not.toBe('*')
    expect(message.type).toBe('REFRESH_SCORESHEET')
    expect(message.data.match).toEqual({ id: 3, game_n: 3, team1Country: 'SUI' })
    expect(JSON.stringify(message)).not.toMatch(/123456|654321|111111|222222|333333|444444|s-1/)
    // the scoretable's own copy keeps its PINs
    expect(data.match.gamePin).toBe('123456')
    expect(scoresheetMatch({ gamePin: '1', id: 2 })).toEqual({ id: 2 })
  })

  it('answers a refresh request only from the sheet window it opened, on its origin', () => {
    const sheet = {}
    const ask = (origin, source) => ({ origin, source, data: { type: 'REQUEST_SCORESHEET_REFRESH' } })
    expect(isRefreshRequestFrom(ask(ORIGIN, sheet), sheet)).toBe(true)
    expect(isRefreshRequestFrom(ask('https://evil.example', sheet), sheet)).toBe(false)
    expect(isRefreshRequestFrom(ask(ORIGIN, {}), sheet)).toBe(false)
    // no sheet window open: nothing is answered
    expect(isRefreshRequestFrom(ask(ORIGIN, sheet), null)).toBe(false)
    expect(isRefreshRequestFrom({ origin: ORIGIN, source: sheet, data: { type: 'OTHER' } }, sheet)).toBe(false)
  })

  it('shows a sheet error only from its own origin (and window), as clipped text', () => {
    const sheet = {}
    const err = (origin, source, extra = {}) => ({ origin, source, data: { type: 'SCORESHEET_ERROR', error: 'PDF failed', details: 'at x', ...extra } })
    expect(scoresheetErrorFromEvent(err(ORIGIN, sheet), { source: sheet })).toEqual({ error: 'PDF failed', details: 'at x' })
    expect(scoresheetErrorFromEvent(err('https://evil.example', sheet), { source: sheet })).toBeNull()
    expect(scoresheetErrorFromEvent(err(ORIGIN, {}), { source: sheet })).toBeNull()
    // the window is not known (the Android in-app view hands it over): the origin decides
    expect(scoresheetErrorFromEvent(err(ORIGIN, {}), { source: null })).toEqual({ error: 'PDF failed', details: 'at x' })
    const long = scoresheetErrorFromEvent(err(ORIGIN, sheet, { error: 'x'.repeat(5000), details: { toString: () => 'y'.repeat(9000) } }), { source: sheet })
    expect(long.error.length).toBe(MAX_ERROR_TEXT)
    expect(long.details.length).toBeLessThanOrEqual(4000)
  })

  it('the sheet posts its errors and requests to the app\'s own origin only', () => {
    const opener = { postMessage: vi.fn() }
    postScoresheetError(opener, new Error('boom'))
    requestScoresheetRefresh(opener)
    expect(opener.postMessage.mock.calls.map((c) => c[1])).toEqual([ORIGIN, ORIGIN])
    expect(opener.postMessage.mock.calls[0][0]).toMatchObject({ type: 'SCORESHEET_ERROR', error: 'boom' })
    expect(opener.postMessage.mock.calls[1][0]).toEqual({ type: 'REQUEST_SCORESHEET_REFRESH' })
  })
})

describe('no sheet message goes to every origin', () => {
  it.each([
    'scoresheet_pdf_beach/index.tsx',
    'scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx',
    'src_beach/components_beach/Scoreboard_beach.jsx'
  ])('%s posts nothing to \'*\'', (file) => {
    const src = readFileSync(resolve(frontendDir, file), 'utf8')
    expect(src).not.toMatch(/postMessage\([^;]*,\s*['"]\*['"]\s*\)/)
    expect(src).not.toMatch(/event\.data\??\.type === 'REFRESH_SCORESHEET'|event\.data\??\.type === 'REQUEST_SCORESHEET_REFRESH'|event\.data\.type === 'SCORESHEET_ERROR'/)
  })
})
