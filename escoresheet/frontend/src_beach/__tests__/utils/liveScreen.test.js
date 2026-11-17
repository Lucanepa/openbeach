import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  LIVE_CODE_ALPHABET, LIVE_SCREEN_KEY, isLiveCode, normalizeLiveCode, newLiveCode, formatLiveCode,
  liveCodeUrl, localTvUrl, courtSecretOf, courtTokenFor, cachedCourtToken, getLiveCode, setLiveCode,
  liveCodeForMatch, liveScreenFields, resetCourtTokens
} from '../../utils_beach/liveScreen_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// The Live screen (port of OpenVolley utils/globalLive.js): the code, the
// TV page link and the court token, as the OpenVolley backend checks them.

let store
beforeEach(() => { store = useMemoryLocalStorage(); resetCourtTokens() })

const match = { id: 3, seed_key: 'match_1700000000000_abc123', team1Pin: '111111' }
const expectedToken = (secret) => createHash('sha256').update(`court\0${secret}`).digest('hex').slice(0, 32)

describe('live screen code', () => {
  it('8 characters without look-alikes', () => {
    expect(LIVE_CODE_ALPHABET).not.toMatch(/[01IO]/)
    for (let i = 0; i < 50; i++) expect(isLiveCode(newLiveCode())).toBe(true)
    const fixed = { getRandomValues: (a) => { a.set([0, 1, 2, 3, 31, 32, 33, 63]); return a } }
    expect(newLiveCode(fixed)).toBe('ABCD9AB9')
  })

  it('reads what a person types; formats it to read out', () => {
    expect(normalizeLiveCode(' abcd-2345 ')).toBe('ABCD2345')
    expect(normalizeLiveCode('ABCD 2345')).toBe('ABCD2345')
    expect(normalizeLiveCode('ABCD1234')).toBe(null) // 1 is not in the alphabet
    expect(normalizeLiveCode('ABC')).toBe(null)
    expect(normalizeLiveCode(null)).toBe(null)
    expect(formatLiveCode('ABCD2345')).toBe('ABCD 2345')
    expect(formatLiveCode('nope')).toBe('')
  })

  it('the TV page on openvolley.app, and on a venue relay', () => {
    expect(liveCodeUrl('ABCD2345')).toBe('https://openvolley.app/tv/ABCD2345')
    expect(liveCodeUrl('x')).toBe(null)
    expect(localTvUrl('http://192.168.1.20:5173/', 'ABCD2345')).toBe('http://192.168.1.20:5173/tv/ABCD2345')
    expect(localTvUrl('ftp://x', 'ABCD2345')).toBe(null)
  })

  it('stored per device under ov.liveScreen.code; off removes it', () => {
    expect(getLiveCode()).toBe(null)
    setLiveCode('ABCD2345')
    expect(store.get(LIVE_SCREEN_KEY)).toBe('ABCD2345')
    expect(LIVE_SCREEN_KEY).toBe('ov.liveScreen.code')
    expect(getLiveCode()).toBe('ABCD2345')
    setLiveCode('bad')
    expect(getLiveCode()).toBe('ABCD2345')
    setLiveCode(null)
    expect(getLiveCode()).toBe(null)
    store.set(LIVE_SCREEN_KEY, 'garbage')
    expect(getLiveCode()).toBe(null)
  })
})

describe('court token', () => {
  it('SHA-256 of court\\0 + the match seed key, 32 hex (the backend isCourtToken)', async () => {
    expect(courtSecretOf(match)).toBe('match_1700000000000_abc123')
    expect(courtSecretOf({ seedKey: 'test-seed' })).toBe('test-seed')
    expect(courtSecretOf({ id: 1 })).toBe(null)
    const token = await courtTokenFor(match)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(token).toBe(expectedToken('match_1700000000000_abc123'))
    expect(await courtTokenFor({ id: 1 })).toBe(null)
  })

  it('cached for the live push, which cannot wait', async () => {
    expect(cachedCourtToken(match)).toBe(null) // starts the work
    await new Promise((r) => setTimeout(r, 10))
    expect(cachedCourtToken(match)).toBe(expectedToken(match.seed_key))
  })
})

describe('the live push fields', () => {
  it('none until this device opts in; then the code and the court token, for every match type', async () => {
    expect(liveScreenFields(match)).toEqual({})
    setLiveCode('ABCD2345')
    expect(liveCodeForMatch({ id: 1, test: true })).toBe('ABCD2345')
    expect(liveCodeForMatch(null)).toBe(null)
    expect(liveScreenFields(match)).toEqual({ globalLive: 'ABCD2345' })
    await courtTokenFor(match)
    expect(liveScreenFields(match)).toEqual({ globalLive: 'ABCD2345', globalLiveCourt: expectedToken(match.seed_key) })
    setLiveCode(null)
    expect(liveScreenFields(match)).toEqual({})
  })
})
