import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// Stress test 2026-10-25 (ob-log-upload-whole-file-per-rally,
// ob-cloud-log-upload-quadratic): after every action the scorer downloaded
// logs/game_<n>/logs.txt and uploaded it again with the whole 1000-line
// buffer appended. One match made the file 5 MiB (each line stored about 25
// times), then every rally moved ~14 MB and got 413, and the next match with
// the same number started at the cap. Ported from OpenVolley
// src/utils/__tests__/logger.test.js (d2cc2851, 9616bd4f).
const storage = vi.hoisted(() => ({ uploads: [], downloads: 0, lists: 0, listCalls: [], folders: {}, result: null, session: true }))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  AUTH_TOKEN_STORAGE_KEY: 'api_auth_token',
  canUseStorage: () => storage.session,
  apiStorage: {
    from: (bucket) => ({
      upload: async (path, body, options) => {
        storage.uploads.push({ bucket, path, body, options })
        return storage.result || { data: { path }, error: null }
      },
      download: async () => {
        storage.downloads++
        return { data: null, error: { code: 'OV_STORAGE_NOT_FOUND' } }
      },
      // The backend's list (lib/storage.js): search is a name prefix, sorted
      // by name or a time column, then cut at the limit (default 100)
      list: async (folder, options = {}) => {
        storage.lists++
        storage.listCalls.push({ folder, options })
        let files = (storage.folders[folder] || []).filter(f => !options.search || f.name.toLowerCase().startsWith(options.search.toLowerCase()))
        const col = options.sortBy?.column || 'name'
        const desc = options.sortBy?.order === 'desc'
        files = [...files].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (desc ? -1 : 1))
        return { data: files.slice(0, options.limit || 100), error: null }
      }
    })
  }
}))
vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => true }))

import {
  initLogger,
  getUnsentLogs,
  uploadLogsToCloud,
  triggerContinuousBackup,
  persistPendingLogs,
  restorePendingLogs,
  discardUnsentLogs,
  resetLoggerForTests,
  LOG_UPLOAD_MIN_INTERVAL_MS,
  uploadBackupToCloud,
  listMatchBackups,
  backupFileName,
  backupPinTag
} from '../../utils_beach/logger_beach'

const signIn = (userId = 'u1') => localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 't', user: { id: userId } }))
const lines = (body) => body.split('\n').filter(Boolean)
const logLines = (...texts) => { for (const t of texts) console.warn(t) }
const logUploads = () => storage.uploads.filter(u => u.path.startsWith('logs/'))

let realWarn
beforeAll(() => {
  realWarn = console.warn
  initLogger()
})

beforeEach(() => {
  useMemoryLocalStorage()
  resetLoggerForTests()
  signIn()
  storage.uploads = []
  storage.downloads = 0
  storage.lists = 0
  storage.listCalls = []
  storage.folders = {}
  storage.result = null
  storage.session = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  void realWarn
})

describe('log upload', () => {
  it('sends only the lines since the last upload, as a new chunk file, never downloading the old one', async () => {
    logLines('[A] one', '[A] two')
    const first = await uploadLogsToCloud(1, 61)
    expect(first).toMatch(/^logs\/game_61\/logs_\d{8}_\d{6}_[0-9a-z]+\.txt$/)
    expect(lines(logUploads()[0].body).map(l => l.replace(/^\[[^\]]+\] /, ''))).toEqual(['[WARN] [A] one', '[WARN] [A] two'])

    logLines('[A] three')
    const second = await uploadLogsToCloud(1, 61)
    expect(second).not.toBe(first)
    expect(lines(logUploads()[1].body).filter(l => l.includes('[A]')).map(l => l.replace(/^\[[^\]]+\] /, ''))).toEqual(['[WARN] [A] three'])
    expect(storage.downloads).toBe(0)
    expect(storage.lists).toBe(0)
    // nothing new: nothing sent
    expect(await uploadLogsToCloud(1, 61)).toBeNull()
    expect(logUploads()).toHaveLength(2)
  })

  it('a chunk refused for good (413 over the storage cap) is skipped, never sent again', async () => {
    logLines('[B] big')
    storage.result = { data: null, error: { status: 413, code: 'OV_STORAGE_TOO_LARGE' } }
    expect(await uploadLogsToCloud(1, 61)).toBeNull()
    storage.result = null
    logLines('[B] after')
    await uploadLogsToCloud(1, 61)
    const body = logUploads()[1].body
    expect(body).toContain('[B] after')
    expect(body).not.toContain('[B] big')
  })

  it('a failure that can pass (offline, 5xx) keeps the lines for the next upload', async () => {
    logLines('[C] kept')
    storage.result = { data: null, error: { status: 0, network: true } }
    await uploadLogsToCloud(1, 61)
    storage.result = null
    await uploadLogsToCloud(1, 61)
    expect(logUploads()[1].body).toContain('[C] kept')
  })

  it('signed out (or a refused session): nothing is sent', async () => {
    storage.session = false
    logLines('[D] line')
    expect(await uploadLogsToCloud(1, 61)).toBeNull()
    expect(storage.uploads).toHaveLength(0)
  })

  it('the every-action backup sends logs at most once a minute (and the backup itself each time)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const backup = async () => ({ match: { gameN: 61 }, sets: [{ index: 1, team1Points: 3, team2Points: 2 }] })
    logLines('[E] 1')
    await triggerContinuousBackup(1, backup, 61)
    vi.setSystemTime(Date.now() + 3000)
    logLines('[E] 2')
    await triggerContinuousBackup(1, backup, 61)
    expect(logUploads()).toHaveLength(1)
    expect(storage.uploads.filter(u => u.path.startsWith('backups/'))).toHaveLength(2)
    vi.setSystemTime(Date.now() + LOG_UPLOAD_MIN_INTERVAL_MS)
    await triggerContinuousBackup(1, backup, 61)
    expect(logUploads()).toHaveLength(2)
    expect(logUploads()[1].body).toContain('[E] 2')
    expect(logUploads()[1].body).not.toContain('[E] 1')
  })
})

describe('lines not uploaded yet', () => {
  it('come back after a reload for the same account, never for another one', () => {
    logLines('[F] unsent')
    persistPendingLogs()
    resetLoggerForTests()
    expect(restorePendingLogs()).toBeGreaterThan(0)
    expect(getUnsentLogs().some(e => e.message === '[F] unsent')).toBe(true)

    persistPendingLogs()
    resetLoggerForTests()
    signIn('u2')
    expect(restorePendingLogs()).toBe(0)
    expect(getUnsentLogs().some(e => e.message === '[F] unsent')).toBe(false)
  })

  it('sign-out discards them', async () => {
    logLines('[G] mine')
    discardUnsentLogs()
    signIn('u2')
    logLines('[G] theirs')
    await uploadLogsToCloud(1, 61)
    expect(logUploads()[0].body).not.toContain('[G] mine')
    expect(logUploads()[0].body).toContain('[G] theirs')
  })
})

// Stress test 2026-10-25 (ob-restore-backups-by-game-number-pin-ignored):
// Restore match listed backups/backup_g<n> by name (not time order), cut at
// 100 by the server, with the game PIN unused: last weekend's game with the
// same number filled the list, today's newest backup was missing, and a
// wrong PIN gave the same list
describe('cloud backups of one match', () => {
  const at = (d, h, m, s) => new Date(Date.UTC(2026, 9, d, h, m, s))
  const fileOf = (name, created) => ({ name, created_at: created.toISOString(), metadata: { size: 100 } })

  it('a backup is named with its game PIN\'s tag, then its time', async () => {
    const backup = { match: { gameN: 5, gamePin: '424242' }, sets: [{ index: 1, team1Points: 10, team2Points: 11 }] }
    await uploadBackupToCloud(1, backup)
    expect(storage.uploads[0].path).toMatch(new RegExp(`^backups/backup_g5/backup_g5_p${backupPinTag('424242')}_\\d{8}_\\d{6}_\\d{3}_set1_scoreleft10_scoreright11\\.json$`))
    expect(backupPinTag('424242')).not.toBe(backupPinTag('000000'))
  })

  it('lists only the backups of the match the PIN names, newest first, past 100 of another match', async () => {
    const files = []
    // last weekend's game 5 (other PIN): 120 backups, sets 1-3
    for (let i = 0; i < 120; i++) {
      const t = at(18, 10, 0, i)
      files.push(fileOf(backupFileName(5, '111111', { setIndex: 1 + (i % 3), leftScore: i % 22, rightScore: 3, now: t }), t))
    }
    // today's game 5: 10 backups, the newest at set 1 10:11
    for (let i = 0; i < 10; i++) {
      const t = at(25, 12, 0, i)
      files.push(fileOf(backupFileName(5, '424242', { setIndex: 1, leftScore: i + 1, rightScore: i + 2, now: t }), t))
    }
    storage.folders['backups/backup_g5'] = files
    const list = await listMatchBackups('424242', 5)
    expect(list).toHaveLength(10)
    expect(list[0]).toMatchObject({ setIndex: 1, leftScore: 10, rightScore: 11, path: expect.stringMatching(/^backups\/backup_g5\//) })
    expect(list.map(b => `${b.date}${b.time}${b.ms}`)).toEqual([...list.map(b => `${b.date}${b.time}${b.ms}`)].sort().reverse())
    // a wrong PIN lists none of them
    expect(await listMatchBackups('000000', 5)).toEqual([])
  })

  it('backups of an app before the tag (no PIN in the name) are listed by their file time', async () => {
    storage.folders['backups/backup_g7'] = [
      fileOf('backup_g7_set1_scoreleft9_scoreright3_20261025_120009_000.json', at(25, 12, 0, 9)),
      fileOf('backup_g7_set1_scoreleft10_scoreright3_20261025_120010_000.json', at(25, 12, 0, 10)),
      fileOf('backup_g7_set3_scoreleft14_scoreright3_20261018_100000_000.json', at(18, 10, 0, 0))
    ]
    const list = await listMatchBackups('424242', 7)
    expect(list.map(b => `${b.setIndex}:${b.leftScore}`)).toEqual(['1:10', '1:9', '3:14'])
    expect(storage.listCalls.at(-1).options).toMatchObject({ sortBy: { column: 'created_at', order: 'desc' }, limit: 100 })
  })
})
