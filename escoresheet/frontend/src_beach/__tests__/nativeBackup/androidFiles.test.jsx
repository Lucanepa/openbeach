// Audit SEC-22: OpenBeach's Android app wrote its match backups (rosters,
// officials, signatures) and its activity logs to the public
// Documents/OpenBeach folder: readable over USB, by a file manager, by other
// apps on Android 10 and older, and left behind after an uninstall. Now they
// live in the app's own folder; the files older versions left in Documents are
// moved in (and removed there) once per install; a copy out happens only when
// the user asks for it (Options, Export to Documents). After OpenVolley's
// androidFiles.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { exportToDocuments, moveLegacyFiles, MOVED_MARKER, EXPORT_PARENT } from '../../utils_beach/nativeBackup/androidFiles_beach'
import { BACKUP_SUBDIR } from '../../utils_beach/nativeBackup/platform_beach'
import { LOG_SUBDIR } from '../../utils_beach/activity/fileSink_beach'
import { startNativeFileHousekeeping, resetNativeFileHousekeepingForTests, exportNativeFilesToDocuments } from '../../utils_beach/nativeBackup/index_beach'
import ExportToDocumentsRow from '../../components_beach/options/ExportToDocumentsRow_beach'
import '../../i18n_beach'

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)
const Directory = { Documents: 'DOCUMENTS', External: 'EXTERNAL', Data: 'DATA' }

// @capacitor/filesystem over a map: `${directory}:${path}` -> { data, mtime }
function fakeFs({ files = {}, permission = 'granted', unmovable = [] } = {}) {
  const store = new Map(Object.entries(files).map(([k, v]) => [k, { data: v, mtime: NOW }]))
  const dirs = new Set()
  const key = (directory, path) => `${directory}:${path}`
  const childrenOf = (directory, path) => {
    const prefix = `${key(directory, path)}/`
    const out = new Map()
    for (const k of [...store.keys(), ...dirs]) {
      if (!k.startsWith(prefix)) continue
      const [head, ...tail] = k.slice(prefix.length).split('/')
      if (!head) continue
      const isDir = tail.length > 0 || dirs.has(k)
      if (!out.has(head) || isDir) out.set(head, isDir ? 'directory' : 'file')
    }
    return out
  }
  const Filesystem = {
    checkPermissions: vi.fn(async () => ({ publicStorage: permission })),
    mkdir: vi.fn(async ({ path, directory }) => {
      const parts = path.split('/')
      for (let i = 1; i <= parts.length; i++) dirs.add(key(directory, parts.slice(0, i).join('/')))
    }),
    stat: vi.fn(async ({ path, directory }) => {
      if (store.has(key(directory, path))) return { type: 'file' }
      if (dirs.has(key(directory, path))) return { type: 'directory' }
      throw new Error('File does not exist')
    }),
    readdir: vi.fn(async ({ path, directory }) => {
      const children = childrenOf(directory, path)
      if (!children.size && !dirs.has(key(directory, path))) throw new Error('Folder does not exist')
      return { files: [...children].map(([name, type]) => ({ name, type })) }
    }),
    copy: vi.fn(async ({ from, to, directory, toDirectory }) => {
      if (unmovable.includes(key(directory, from))) throw new Error('EACCES')
      const file = store.get(key(directory, from))
      if (!file) throw new Error('missing')
      store.set(key(toDirectory, to), { ...file })
    }),
    getUri: vi.fn(async ({ path, directory }) => ({ uri: `file:///${directory}/${path}` })),
    writeFile: vi.fn(async ({ path, directory, data }) => { store.set(key(directory, path), { data, mtime: NOW }) }),
    readFile: vi.fn(async ({ path, directory }) => {
      if (!store.has(key(directory, path))) throw new Error('File does not exist')
      return { data: store.get(key(directory, path)).data }
    }),
    appendFile: vi.fn(async ({ path, directory, data }) => {
      const file = store.get(key(directory, path))
      store.set(key(directory, path), { data: (file?.data || '') + data, mtime: NOW })
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      if (!store.delete(key(directory, path))) throw new Error('missing')
    }),
    rmdir: vi.fn(async ({ path, directory }) => {
      if (childrenOf(directory, path).size) throw new Error('Folder is not empty')
      dirs.delete(key(directory, path))
    })
  }
  return { fs: { Filesystem, Directory, Encoding: { UTF8: 'utf8' } }, store }
}

const quiet = { info: vi.fn(), warn: vi.fn() }
const keys = (store, prefix) => [...store.keys()].filter(k => k.startsWith(prefix)).sort()

describe('a start of this version: files older versions left in Documents move into the app', () => {
  it('moves every backup from Documents (and the old external fallback) and leaves Documents empty, once per install', async () => {
    const { fs, store } = fakeFs({
      files: {
        [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00003.json`]: 'e3',
        [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'l35',
        [`EXTERNAL:${BACKUP_SUBDIR}/game36-s2/latest.json`]: 'l36',
        // OpenVolley's own folder is never touched
        ['DOCUMENTS:OpenVolley/backups/game1-x/latest.json']: 'ov'
      }
    })
    expect(await moveLegacyFiles(fs, { log: quiet })).toEqual({ moved: 3, left: 0 })
    expect(keys(store, 'DOCUMENTS:')).toEqual(['DOCUMENTS:OpenVolley/backups/game1-x/latest.json'])
    expect(keys(store, 'EXTERNAL:')).toEqual([])
    expect(store.get(`DATA:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00003.json`).data).toBe('e3')
    expect(store.get(`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`).data).toBe('l35')
    expect(store.get(`DATA:${BACKUP_SUBDIR}/game36-s2/latest.json`).data).toBe('l36')
    // once per install: a marker file in the app folder
    expect(store.has(`DATA:${MOVED_MARKER}`)).toBe(true)
    store.set(`DOCUMENTS:${BACKUP_SUBDIR}/game37-s3/latest.json`, { data: 'l37', mtime: NOW })
    expect(await moveLegacyFiles(fs, { log: quiet })).toMatchObject({ skipped: true })
    expect(store.has(`DOCUMENTS:${BACKUP_SUBDIR}/game37-s3/latest.json`)).toBe(true)
  })

  it('moves the activity log files too; a day this version already writes to gets the older lines', async () => {
    const { fs, store } = fakeFs({
      files: {
        [`DOCUMENTS:${LOG_SUBDIR}/activity-2026-11-21.jsonl`]: '{"a":1}\n',
        [`DOCUMENTS:${LOG_SUBDIR}/activity-2026-11-23.jsonl`]: '{"old":1}\n',
        [`DATA:${LOG_SUBDIR}/activity-2026-11-23.jsonl`]: '{"new":1}\n'
      }
    })
    expect(await moveLegacyFiles(fs, { log: quiet })).toEqual({ moved: 2, left: 0 })
    expect(keys(store, 'DOCUMENTS:')).toEqual([])
    expect(store.get(`DATA:${LOG_SUBDIR}/activity-2026-11-21.jsonl`).data).toBe('{"a":1}\n')
    expect(store.get(`DATA:${LOG_SUBDIR}/activity-2026-11-23.jsonl`).data).toBe('{"new":1}\n{"old":1}\n')
  })

  it('the app\'s own newer latest.json wins; a file it cannot move stays and is counted', async () => {
    const { fs, store } = fakeFs({
      files: {
        [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'old',
        [`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'new',
        [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00001.json`]: 'e1'
      },
      unmovable: [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00001.json`]
    })
    expect(await moveLegacyFiles(fs, { log: quiet })).toEqual({ moved: 0, left: 1 })
    expect(store.get(`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`).data).toBe('new')
    expect(store.has(`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/latest.json`)).toBe(false)
    expect(store.has(`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00001.json`)).toBe(true)
  })

  it('without the storage permission (Android 10 and older) Documents is not read, and nothing asks for it', async () => {
    const { fs, store } = fakeFs({ files: { [`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'l' }, permission: 'prompt' })
    await moveLegacyFiles(fs, { log: quiet })
    expect(store.has(`DOCUMENTS:${BACKUP_SUBDIR}/game35-s1/latest.json`)).toBe(true)
    expect(fs.Filesystem.readdir.mock.calls.some(([o]) => o.directory === 'DOCUMENTS')).toBe(false)
    expect(fs.Filesystem.requestPermissions).toBeUndefined()
  })
})

describe('Export to Documents: a copy out, only when asked', () => {
  it('copies each match\'s newest backup and the logs into a new Documents/OpenBeach/export-<time> folder', async () => {
    const { fs, store } = fakeFs({
      files: {
        [`DATA:${BACKUP_SUBDIR}/game35-s1/20261101T100000.000Z-00003.json`]: 'e3',
        [`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'l35',
        [`DATA:${BACKUP_SUBDIR}/game36-s2/20261101T100000.000Z-00001.json`]: 'no latest',
        [`DATA:${LOG_SUBDIR}/activity-2026-11-23.jsonl`]: '{"a":1}\n'
      }
    })
    const r = await exportToDocuments(fs, { now: new Date(NOW), log: quiet })
    expect(r).toEqual({ folder: `Documents/${EXPORT_PARENT}/export-20261123-1200`, backups: 1, logs: 1, failed: 0 })
    expect(keys(store, 'DOCUMENTS:')).toEqual([
      `DOCUMENTS:${EXPORT_PARENT}/export-20261123-1200/backups/game35-s1.json`,
      `DOCUMENTS:${EXPORT_PARENT}/export-20261123-1200/logs/activity-2026-11-23.jsonl`
    ])
    // the app's own copies stay
    expect(store.has(`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`)).toBe(true)
    // a second export in the same minute never overwrites the first
    const again = await exportToDocuments(fs, { now: new Date(NOW), log: quiet })
    expect(again.folder).toBe(`Documents/${EXPORT_PARENT}/export-20261123-1200 (1)`)
    // and the export folders are never moved back in
    expect(await moveLegacyFiles(fs, { log: quiet })).toEqual({ moved: 0, left: 0 })
    expect(store.has(`DOCUMENTS:${EXPORT_PARENT}/export-20261123-1200/backups/game35-s1.json`)).toBe(true)
  })

  it('says so when nothing could be copied', async () => {
    const { fs } = fakeFs({ files: { [`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'l' }, unmovable: [`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`] })
    await expect(exportToDocuments(fs, { now: new Date(NOW), log: quiet })).rejects.toThrow(/no file could be copied/)
  })

  it('the Options row runs it and shows where the copies went', async () => {
    const exportFiles = vi.fn(async () => ({ folder: 'Documents/OpenBeach/export-20261123-1200', backups: 2, logs: 1, failed: 0 }))
    render(<ExportToDocumentsRow exportFiles={exportFiles} />)
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(await screen.findByTestId('export-to-documents-result')).toHaveTextContent('Documents/OpenBeach/export-20261123-1200')
    expect(exportFiles).toHaveBeenCalledTimes(1)
  })

  it('exportNativeFilesToDocuments hands the plugin to the export', async () => {
    const { fs } = fakeFs({ files: { [`DATA:${BACKUP_SUBDIR}/game35-s1/latest.json`]: 'l' } })
    const r = await exportNativeFilesToDocuments({ load: async () => [fs, { exportToDocuments: (f) => exportToDocuments(f, { now: new Date(NOW), log: quiet }) }] })
    expect(r.backups).toBe(1)
  })
})

describe('the move runs at a start of the Android app only', () => {
  afterEach(() => resetNativeFileHousekeepingForTests())

  it('Android: once per app session, a few seconds in', async () => {
    const moveLegacy = vi.fn(async () => ({ moved: 1, left: 0 }))
    const load = vi.fn(async () => [{}, { moveLegacyFiles: moveLegacy }])
    const win = { Capacitor: { getPlatform: () => 'android' } }
    const first = startNativeFileHousekeeping({ delayMs: 1, platform: 'capacitor', win, load })
    const second = startNativeFileHousekeeping({ delayMs: 1, platform: 'capacitor', win, load })
    expect(second).toBe(first)
    expect(await first).toEqual({ moved: 1, left: 0 })
    expect(moveLegacy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the desktop app', 'tauri', {}],
    ['a browser', 'web', {}],
    ['iOS (one folder for all)', 'capacitor', { Capacitor: { getPlatform: () => 'ios' } }]
  ])('not in %s', async (_name, platform, win) => {
    const load = vi.fn()
    expect(await startNativeFileHousekeeping({ delayMs: 1, platform, win, load })).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})
