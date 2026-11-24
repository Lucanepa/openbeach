import { describe, it, expect, beforeEach } from 'vitest'
import { getBackupSettings, saveBackupSettings } from '../../utils_beach/backupManager_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// The scoreboard's "Auto-download data at set end" and its "Download even if
// sync succeeded" lived in its state only: every new scoreboard (a reload,
// the next match) put them back (OpenVolley 584dcce4)
let storage
beforeEach(() => {
  storage = useMemoryLocalStorage()
})

describe('backup settings', () => {
  it('defaults: the apps back up, browsers do not; the set-end download is on everywhere, its "even if synced" off', () => {
    expect(getBackupSettings()).toEqual({ autoBackupEnabled: false, backupFrequencyMinutes: 5, autoDownloadAtSetEnd: true, alwaysDownloadAtSetEnd: false })
    expect(getBackupSettings({ native: true })).toEqual({ autoBackupEnabled: true, backupFrequencyMinutes: 5, autoDownloadAtSetEnd: true, alwaysDownloadAtSetEnd: false })
  })

  it('the set-end download keeps its switches, under their own keys', () => {
    saveBackupSettings({ autoDownloadAtSetEnd: false })
    expect(storage.get('autoDownloadAtSetEnd')).toBe('false')
    expect(getBackupSettings().autoDownloadAtSetEnd).toBe(false)
    expect(getBackupSettings({ native: true }).autoDownloadAtSetEnd).toBe(false)
    saveBackupSettings({ alwaysDownloadAtSetEnd: true })
    expect(storage.get('alwaysDownloadAtSetEnd')).toBe('true')
    expect(getBackupSettings()).toMatchObject({ autoDownloadAtSetEnd: false, alwaysDownloadAtSetEnd: true })
    // the other settings are left alone
    expect(storage.has('autoBackupEnabled')).toBe(false)
    saveBackupSettings({ autoDownloadAtSetEnd: true })
    expect(getBackupSettings().autoDownloadAtSetEnd).toBe(true)
    saveBackupSettings({ autoBackupEnabled: true })
    expect(storage.get('autoDownloadAtSetEnd')).toBe('true')
    expect(storage.get('alwaysDownloadAtSetEnd')).toBe('true')
  })
})
