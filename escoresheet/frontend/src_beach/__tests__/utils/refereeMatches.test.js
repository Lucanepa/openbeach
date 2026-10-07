import { describe, it, expect, vi } from 'vitest'
import { loadRefereeMatches } from '../../utils_beach/refereeMatches_beach'

// The referee page on a venue tablet (a page the relay serves) asked the
// cloud list first, which on that page is the relay's /api/db: a 404 on
// every load, and an empty relay list then read as "server not connected".

const ok = (matches) => async () => ({ success: true, matches })

describe('loadRefereeMatches', () => {
  it('a venue relay\'s page asks the relay only', async () => {
    const listCloud = vi.fn(ok([{ id: 'c' }]))
    const listRelay = vi.fn(ok([{ id: 'r' }]))
    const { result, source } = await loadRefereeMatches({ relayOrigin: true, listCloud, listRelay })
    expect(listCloud).not.toHaveBeenCalled()
    expect(result.matches).toEqual([{ id: 'r' }])
    expect(source).toBe('websocket')
  })

  it('an empty relay list on a venue page is an answer, not a failure', async () => {
    const { result } = await loadRefereeMatches({ relayOrigin: true, listCloud: vi.fn(), listRelay: ok([]) })
    expect(result).toEqual({ success: true, matches: [] })
  })

  it('elsewhere: the cloud first, the relay when the cloud has none', async () => {
    const listRelay = vi.fn(ok([{ id: 'r' }]))
    expect((await loadRefereeMatches({ relayOrigin: false, listCloud: ok([{ id: 'c' }]), listRelay })).result.matches).toEqual([{ id: 'c' }])
    expect(listRelay).not.toHaveBeenCalled()
    expect((await loadRefereeMatches({ relayOrigin: false, listCloud: ok([]), listRelay })).result.matches).toEqual([{ id: 'r' }])
    const failed = { success: false, matches: [], error: 'x' }
    expect((await loadRefereeMatches({ relayOrigin: false, listCloud: async () => failed, listRelay: ok([]) })).result).toBe(failed)
  })
})
