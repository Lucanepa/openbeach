/**
 * The global test setup replaces window.localStorage with bare vi.fn() stubs
 * (getItem returns undefined). Tests of code that really stores something (the
 * auth token, match access tokens) call this in beforeEach to back those stubs
 * with an in-memory map.
 */
export function useMemoryLocalStorage() {
  const store = new Map()
  const ls = window.localStorage
  ls.getItem.mockImplementation((k) => (store.has(String(k)) ? store.get(String(k)) : null))
  ls.setItem.mockImplementation((k, v) => { store.set(String(k), String(v)) })
  ls.removeItem.mockImplementation((k) => { store.delete(String(k)) })
  ls.clear.mockImplementation(() => { store.clear() })
  return store
}
