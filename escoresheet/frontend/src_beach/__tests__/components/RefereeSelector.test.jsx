import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// Ported from OpenVolley src/components/__tests__/RefereeSelector.test.jsx
// (3203d04b): the referee directory is read past the backend's 1000-row cap.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en' } })
}))

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  isBackendAvailable: () => true
}))

// apiFrom('referee_database') resolves each page request when the test says so.
const api = vi.hoisted(() => ({ pending: [], queries: [], contains: [] }))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiFrom: () => {
    const call = { order: [], gt: null, limit: null }
    const q = {
      select: () => q,
      contains: (col, v) => { api.contains.push([col, v]); return q },
      order: (col, opts) => { call.order.push([col, opts?.ascending !== false]); return q },
      gt: (col, v) => { call.gt = [col, v]; return q },
      limit: (n) => { call.limit = n; return q },
      then: (resolve, reject) => {
        api.queries.push(call)
        return new Promise(res => api.pending.push(res)).then(resolve, reject)
      }
    }
    return q
  }
}))

import RefereeSelector from '../../components_beach/RefereeSelector_beach'

// The page request reaches the mock a microtask after the effect runs
async function resolvePage(n, result) {
  await act(async () => {
    await waitFor(() => expect(api.pending[n]).toBeTypeOf('function'))
    api.pending[n](result)
  })
}

const rows = [
  { id: 'a1', first_name: 'Anna', last_name: 'Müller', country: 'CHE', dob: '01.01.1990' },
  { id: 'c3', first_name: 'Luca', last_name: 'Keller', country: 'CHE', dob: '' }
]

describe('RefereeSelector_beach', () => {
  beforeEach(() => { api.pending = []; api.queries = []; api.contains = [] })

  it('lists the beach referees by last name', async () => {
    render(<RefereeSelector open onClose={() => {}} onSelect={() => {}} />)
    await resolvePage(0, { data: rows, error: null })
    const list = screen.getByRole('dialog')
    await waitFor(() => expect(list.textContent).toContain('Keller'))
    const names = [...list.querySelectorAll('button')].map(b => b.textContent)
    expect(names).toEqual(['Keller, Luca', 'Müller, Anna'])
    expect(api.contains[0]).toEqual(['sport_type', JSON.stringify(['beach'])])
  })

  it('reads the whole directory past the 1000-row cap and lists it by last name', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `id${String(i).padStart(4, '0')}`, first_name: `F${i}`, last_name: `Name${String(i).padStart(4, '0')}`, country: 'CHE', dob: ''
    }))
    // The 1001st row by id sorts first by last name
    const page2 = [{ id: 'id9999', first_name: 'Beat', last_name: 'Aebi', country: 'CHE', dob: '' }]
    render(<RefereeSelector open onClose={() => {}} onSelect={() => {}} />)
    await resolvePage(0, { data: page1, error: null })
    expect(api.queries[0]).toEqual({ order: [['id', true]], gt: null, limit: 1000 })
    await resolvePage(1, { data: page2, error: null })
    expect(api.queries[1].gt).toEqual(['id', 'id0999'])
    expect(api.pending).toHaveLength(2)

    // Plain DOM reads: role queries over 1001 rows are slow in jsdom
    const list = screen.getByRole('dialog')
    await waitFor(() => expect(list.textContent).toContain('Aebi'))
    const names = [...list.querySelectorAll('button')].map(b => b.textContent)
    expect(names).toHaveLength(1001)
    expect(names[0]).toMatch(/Aebi/)
    expect(names[1]).toMatch(/Name0000/)
  })

  it('a failed page shows no partial list', async () => {
    render(<RefereeSelector open onClose={() => {}} onSelect={() => {}} />)
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `id${String(i).padStart(4, '0')}`, first_name: 'F', last_name: `N${i}` }))
    await resolvePage(0, { data: page1, error: null })
    await resolvePage(1, { data: null, error: { message: 'offline', status: 0, network: true } })
    await waitFor(() => expect(screen.getByText('No referee history yet')).toBeInTheDocument())
    expect(screen.getByRole('dialog').querySelectorAll('button')).toHaveLength(0)
  })

  it('renders nothing while closed', () => {
    render(<RefereeSelector open={false} onClose={() => {}} onSelect={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
