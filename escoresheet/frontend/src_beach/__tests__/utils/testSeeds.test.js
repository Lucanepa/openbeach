import { describe, it, expect } from 'vitest'
import {
  TEST_MATCH_SEED_KEY,
  newTestMatchSeedKey,
  isTestMatchSeedKey,
  testMatchSeedKeyFor,
  refereeConnectionDefault
} from '../../constants_beach/testSeeds_beach'
import { relayMatchKey } from '../../utils_beach/relayPublisher_beach'

// Each device's test match has its own relay room: with the shared
// 'test-match-default' two courts rehearsing on one venue relay overwrote and
// deleted each other's test match (no game PIN guards a test room).

describe('test match seed keys', () => {
  it('a new key is per device: the legacy prefix plus 12 random hex digits', () => {
    const a = newTestMatchSeedKey()
    const b = newTestMatchSeedKey()
    expect(a).toMatch(/^test-match-default-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
    expect(a).not.toBe(TEST_MATCH_SEED_KEY)
  })

  it('recognises the legacy key and the per-device keys, nothing else', () => {
    expect(isTestMatchSeedKey(TEST_MATCH_SEED_KEY)).toBe(true)
    expect(isTestMatchSeedKey(newTestMatchSeedKey())).toBe(true)
    expect(isTestMatchSeedKey('match_1700000000000_abc123')).toBe(false)
    expect(isTestMatchSeedKey(undefined)).toBe(false)
  })

  it('keeps a device key across restarts and replaces the shared one', () => {
    const own = newTestMatchSeedKey()
    expect(testMatchSeedKeyFor(own)).toBe(own)
    const fromLegacy = testMatchSeedKeyFor(TEST_MATCH_SEED_KEY)
    expect(fromLegacy).not.toBe(TEST_MATCH_SEED_KEY)
    expect(isTestMatchSeedKey(fromLegacy)).toBe(true)
    expect(testMatchSeedKeyFor(null)).toMatch(/^test-match-default-/)
    expect(testMatchSeedKeyFor('match_1_x')).toMatch(/^test-match-default-/)
  })

  it('two devices publish their test matches to two relay rooms', () => {
    const court1 = { id: 1, test: true, seedKey: testMatchSeedKeyFor(TEST_MATCH_SEED_KEY) }
    const court2 = { id: 1, test: true, seedKey: testMatchSeedKeyFor(TEST_MATCH_SEED_KEY) }
    expect(relayMatchKey(court1)).not.toBe(relayMatchKey(court2))
  })
})

// OB-11b: the relay's validatePin lets a referee in only while it is on
describe('the referee connection a match starts with', () => {
  it('on for a test match (as OpenVolley), off for an official one', () => {
    expect(refereeConnectionDefault({ test: true })).toBe(true)
    expect(refereeConnectionDefault({ test: false })).toBe(false)
    expect(refereeConnectionDefault({})).toBe(false)
    expect(refereeConnectionDefault(null)).toBe(false)
  })
})
