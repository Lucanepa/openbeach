import { describe, it, expect } from 'vitest'
import {
  buildOfficialsArray, officialsWithEdits, findOfficial, officialEmailOf, cleanOfficialEmail
} from '../../utils_beach/officials_beach'
import { toWireMatch, publicWireMatch } from '../../utils_beach/relayPublisher_beach'
import { redactForLog } from '../../hooks_beach/useSyncQueue_beach'

// The match stores the appointed referees' account addresses
// (officials[].email, as OpenVolley does; OpenVolley audit round 3, PERM-08).
// They are kept clean, never relayed and never logged. Based on the audit's
// __audit__/beach_logic/officials.property.test.js.

const ref1 = { firstName: 'Rita', lastName: 'Ref', country: 'CHE', dob: '990001', email: '  Rita.Ref@Example.CH ' }
const ref2 = { firstName: 'Remo', lastName: 'Zwei', country: 'CHE', dob: '14.03.1980', email: 'remo@example.ch' }
const scorer = { firstName: 'Sam', lastName: 'Scorer', country: 'CHE', dob: '', email: 'sam@example.ch' }
const asst = { firstName: 'Ada', lastName: 'Assist', country: 'CHE', dob: '' }

describe('the appointed referees\' account addresses in the officials', () => {
  it('Match Setup\'s list keeps each referee\'s address, trimmed and lower-case', () => {
    const list = buildOfficialsArray(ref1, ref2, scorer, asst, { lj1: 'Lina Judge' })
    expect(findOfficial(list, '1st referee')).toEqual({ role: '1st referee', firstName: 'Rita', lastName: 'Ref', country: 'CHE', dob: '990001', email: 'rita.ref@example.ch' })
    expect(findOfficial(list, '2nd referee').email).toBe('remo@example.ch')
    // the scorers' slot is bound to the match's own accounts, not to an address
    expect(findOfficial(list, 'scorer')).not.toHaveProperty('email')
    expect(findOfficial(list, 'assistant scorer')).not.toHaveProperty('email')
    expect(findOfficial(list, 'line judge 1')).toEqual({ role: 'line judge 1', name: 'Lina Judge' })
  })

  it('the cloud copy (the backend reads officials[].email) has it too', () => {
    const cloud = buildOfficialsArray(ref1, ref2, scorer, asst, {}, true)
    expect(findOfficial(cloud, '1st referee')).toEqual({ role: '1st referee', first_name: 'Rita', last_name: 'Ref', country: 'CHE', dob: '990001', email: 'rita.ref@example.ch' })
    expect(findOfficial(cloud, '2nd referee')).toMatchObject({ dob: '1980-03-14', email: 'remo@example.ch' })
  })

  it('no address, or not an address: none stored (the backend\'s older rule then)', () => {
    const list = buildOfficialsArray({ ...ref1, email: '' }, { ...ref2, email: 'not an address' }, scorer, asst)
    expect(findOfficial(list, '1st referee')).not.toHaveProperty('email')
    expect(findOfficial(list, '2nd referee')).not.toHaveProperty('email')
    expect(cleanOfficialEmail(`${'a'.repeat(250)}@x.ch`)).toBeNull()
    expect(cleanOfficialEmail(null)).toBeNull()
  })

  it('officialEmailOf reads either stored shape', () => {
    const list = buildOfficialsArray(ref1, ref2, scorer, asst)
    expect(officialEmailOf(list, 'ref1')).toBe('rita.ref@example.ch')
    expect(officialEmailOf({ ref2: { firstName: 'R', lastName: 'Z', email: 'R@x.ch' } }, '2nd referee')).toBe('r@x.ch')
    expect(officialEmailOf(list, 'scorer')).toBe('')
    expect(officialEmailOf(null, 'ref1')).toBe('')
  })

  it('Manual adjustments keeps the addresses on the device and in the cloud job', () => {
    const stored = buildOfficialsArray(ref1, ref2, scorer, asst, { lj1: 'Lina Judge' })
    const local = officialsWithEdits(stored, { ref1: { firstName: 'Rita', lastName: 'Referee' } })
    expect(findOfficial(local, '1st referee')).toMatchObject({ lastName: 'Referee', email: 'rita.ref@example.ch' })
    const cloud = officialsWithEdits(stored, { ref1: { firstName: 'Rita', lastName: 'Referee' } }, { cloud: true })
    expect(findOfficial(cloud, '1st referee')).toMatchObject({ last_name: 'Referee', email: 'rita.ref@example.ch' })
    expect(findOfficial(cloud, '2nd referee').email).toBe('remo@example.ch')
    expect(findOfficial(cloud, 'line judge 1').name).toBe('Lina Judge')
  })
})

describe('the addresses stay with the match\'s scorers', () => {
  const match = {
    id: 1, seed_key: 'match_1', gamePin: '123456', refereePin: '234567',
    officials: buildOfficialsArray(ref1, ref2, scorer, asst)
  }

  it('never go on the relay wire (sync, public answers)', () => {
    for (const wire of [toWireMatch(match), publicWireMatch(match)]) {
      expect(JSON.stringify(wire)).not.toMatch(/@example\.ch/)
      expect(findOfficial(wire.officials, '1st referee')).toMatchObject({ firstName: 'Rita', lastName: 'Ref' })
    }
    // the older object form too
    const old = toWireMatch({ ...match, officials: { ref1: { firstName: 'R', email: 'r@example.ch' } } })
    expect(old.officials).toEqual({ ref1: { firstName: 'R' } })
    // the Dexie row is not changed
    expect(findOfficial(match.officials, '1st referee').email).toBe('rita.ref@example.ch')
  })

  it('never go into the sync queue\'s log lines', () => {
    const logged = redactForLog({ id: 'match_1', officials: match.officials, game_pin: '123456' })
    expect(JSON.stringify(logged)).not.toMatch(/@example\.ch|123456/)
    expect(findOfficial(logged.officials, '2nd referee')).toMatchObject({ firstName: 'Remo' })
  })
})
