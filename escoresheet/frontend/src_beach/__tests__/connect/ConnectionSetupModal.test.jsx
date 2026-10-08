import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'

// The header menu's "Connect tablets": App_beach passes only the match id, so
// the dialog reads the match (switch, referee PIN, seed key) from IndexedDB.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback, opts) => {
      let s = String(typeof fallback === 'string' ? fallback : key)
      for (const [k, v] of Object.entries(opts || {})) s = s.replaceAll(`{{${k}}}`, String(v))
      return s
    }
  })
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  getLocalServerStatusUrl: () => null,
  getApiUrl: () => null,
  isCloudBlockedOnThisPort: () => false
}))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ getSyncStatus: () => 'synced' }))
const dbMock = vi.hoisted(() => ({
  matches: {
    get: vi.fn(async (id) => (id === 3 ? { id: 3, seed_key: 'match_3_x', refereePin: '654949', refereeConnectionEnabled: true, gameNumber: 12 } : undefined))
  }
}))
vi.mock('../../db_beach/db_beach', () => ({ db: dbMock }))

import ConnectionSetupModal from '../../components_beach/options/ConnectionSetupModal_beach'

describe('ConnectionSetupModal_beach', () => {
  it('reads the match from IndexedDB when the view passes only its id', async () => {
    render(<ConnectionSetupModal open onClose={() => {}} matchId={3} />)
    const dialog = await screen.findByRole('dialog', { name: 'Connect tablets' })
    await waitFor(() => expect(within(dialog).getByRole('switch', { name: 'Let Referee in' })).toHaveAttribute('aria-checked', 'true'))
    expect(dbMock.matches.get).toHaveBeenCalledWith(3)
    // a web build opens on Internet: the beach referee site with the match
    await waitFor(() => expect(screen.getByTestId('pin-referee')).toHaveTextContent('654 949'))
    expect(screen.getByTestId('role-qr')).toHaveAttribute('data-url', 'https://beach-referee.openvolley.app/?match=match_3_x')
  })

  it('without a match: open a match first', async () => {
    render(<ConnectionSetupModal open onClose={() => {}} matchId={null} />)
    expect(await screen.findByTestId('no-match')).toHaveTextContent('Open a match first')
  })
})
