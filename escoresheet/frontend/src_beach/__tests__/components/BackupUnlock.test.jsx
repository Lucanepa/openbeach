// Audit SEC-22: the app backup files are sealed with the match's game PIN and
// referee PIN. Restore match asks for one before the preview (the PIN dialog,
// useBackupUnlock_beach); a plain file picked on the device (a download, an
// older version's backup file, a planted or edited one) is marked in the
// preview as not verified. Ported in part from OpenVolley's
// BackupUnlockDialog tests.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import BackupUnlockDialog, { readableSummary } from '../../components_beach/BackupUnlockDialog_beach'
import RestorePreviewModal from '../../components_beach/RestorePreviewModal_beach'
import { useBackupUnlock } from '../../hooks_beach/useBackupUnlock_beach'
import { createBackupSealer } from '../../utils_beach/backupCrypto/sealer_beach'
import { backupFileTrust, isEncryptedBackup, openEnvelope } from '../../utils_beach/backupCrypto/envelope_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

const backup = () => ({
  version: 1,
  secretsRemoved: true,
  match: { id: 4, game_n: 35, seed_key: 's1', status: 'live', scheduledAt: '2026-11-21T09:30:00.000Z', gamePin: '135790', refereePin: '246802' },
  team1: { name: 'Minor / Junior' },
  team2: { name: 'Rossi / Bianchi' },
  team1Players: [{ number: 1, lastName: 'Minor' }],
  team2Players: [],
  sets: [{ index: 1, team1Points: 21, team2Points: 18, finished: true }, { index: 2, team1Points: 3, team2Points: 1 }],
  events: []
})

let envelope
beforeAll(async () => {
  const data = backup()
  const { match: { gamePin: _g, refereePin: _r, ...match }, ...rest } = data
  const { text } = await createBackupSealer({ recoveryKey: '' }).seal(4, data, JSON.stringify({ ...rest, match }), '2026-11-21T10:00:00.000Z')
  envelope = JSON.parse(text)
})

describe('the PIN dialog of an encrypted backup file', () => {
  it('shows only the readable header (game number, date, set scores), no names', () => {
    expect(isEncryptedBackup(envelope)).toBe(true)
    expect(readableSummary(envelope)).toMatchObject({ gameN: '35', sets: '21:18  3:1' })
    render(<BackupUnlockDialog envelope={envelope} onOpened={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Encrypted backup' })
    expect(dialog).toHaveTextContent('Match 35')
    expect(dialog).toHaveTextContent('21:18')
    expect(dialog.textContent).not.toMatch(/Minor|Rossi/)
    // the PIN field is a secret for the interaction log
    expect(screen.getByTestId('backup-unlock-dialog')).toHaveAttribute('data-sensitive')
  })

  it('a wrong PIN says so; the referee PIN opens it and hands over a backup the restore trusts', async () => {
    const onOpened = vi.fn()
    render(<BackupUnlockDialog envelope={envelope} onOpened={onOpened} onCancel={() => {}} />)
    const input = screen.getByLabelText('Game PIN or referee PIN')
    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByTestId('backup-unlock-open'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN')
    expect(onOpened).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '246802' } })
    fireEvent.click(screen.getByTestId('backup-unlock-open'))
    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1))
    const opened = onOpened.mock.calls[0][0]
    expect(opened).toMatchObject({ version: 1, team1: { name: 'Minor / Junior' }, unlockedWith: { pin: 'referee', field: 'refereePin', value: '246802' } })
    expect(backupFileTrust(opened)).toBe('sealed')
  }, 20000)

  it('Cancel goes back, also while a PIN is tried; the late result is ignored', async () => {
    let finish
    const open = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const onOpened = vi.fn()
    const onCancel = vi.fn()
    render(<BackupUnlockDialog envelope={envelope} onOpened={onOpened} onCancel={onCancel} open={open} />)
    fireEvent.change(screen.getByLabelText('Game PIN or referee PIN'), { target: { value: '246802' } })
    fireEvent.click(screen.getByTestId('backup-unlock-open'))
    await waitFor(() => expect(open).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ data: backup(), unlockedWith: { pin: 'referee', field: 'refereePin', value: '246802' } }) })
    expect(onOpened).not.toHaveBeenCalled()
  })

  it('useBackupUnlock: a plain file passes at once, an envelope waits for the dialog, Cancel gives null', async () => {
    const { result } = renderHook(() => useBackupUnlock())
    const plain = backup()
    await expect(result.current.unlock(plain)).resolves.toBe(plain)
    expect(result.current.dialog).toBeNull()
    let pending
    act(() => { pending = result.current.unlock(envelope) })
    expect(result.current.dialog).not.toBeNull()
    render(result.current.dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(pending).resolves.toBeNull()
  })
})

describe('the restore preview marks a plain file as not verified', () => {
  const notice = () => screen.queryByTestId('restore-preview-untrusted')
  const show = (preview) => render(<RestorePreviewModal preview={preview} onConfirm={() => {}} onCancel={() => {}} onSelectAnother={() => {}} />)

  it('a plain file from the device: the notice', () => {
    show({ source: 'local', data: backup() })
    expect(notice()).toHaveTextContent('This file is not encrypted')
  })

  it('also one that carries an unlockedWith of its own', () => {
    show({ source: 'local', data: { ...backup(), unlockedWith: { pin: 'game', field: 'gamePin', value: '135790' } } })
    expect(notice()).not.toBeNull()
  })

  it('a file a PIN opened: none', async () => {
    const { data, unlockedWith } = await openEnvelope(envelope, '135790')
    const { openedBackup } = await import('../../utils_beach/backupCrypto/envelope_beach')
    show({ source: 'local', data: openedBackup(data, unlockedWith) })
    expect(notice()).toBeNull()
  }, 20000)

  it('a cloud backup or the database: none (fetched from the server with the game PIN)', () => {
    const { unmount } = show({ source: 'cloud', data: backup() })
    expect(notice()).toBeNull()
    unmount()
    show({ source: 'database', data: backup() })
    expect(notice()).toBeNull()
  })
})

describe('App_beach', () => {
  const src = readFileSync(resolve(__dirname, '../../App_beach.jsx'), 'utf8')

  it('opens a picked file with the PIN dialog before the preview, and renders the dialog', () => {
    expect(src).toMatch(/const data = await unlockBackup\(matchBackupFromFile\(jsonData\)\)\s*\n\s*if \(!data\) return\s*\n\s*setRestorePreviewData\(\{ data, source: 'local' \}\)/)
    expect(src).toMatch(/\{backupUnlockDialog\}/)
  })
})
