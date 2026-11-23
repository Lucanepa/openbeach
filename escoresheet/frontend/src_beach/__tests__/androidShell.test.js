// The OpenBeach Android app's shell, as OpenVolley hardened its own after
// audit round 1 (android-2, -3, -6, -7); the round-3 audit found OpenBeach
// without it (SEC-22, SEC-49, SEC-50). Static checks of the manifest and
// resources, and the backup store's folder (from the audit's PoC
// src_beach/__audit__/native_shells/ob-android-shell.test.js).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createCapacitorStore } from '../utils_beach/nativeBackup/platform_beach.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fe = path.resolve(here, '../..')
const res = (f) => readFileSync(path.join(fe, 'android/app/src/main', f), 'utf8')
const Directory = { Documents: 'DOCUMENTS', Data: 'DATA', Library: 'LIBRARY', Cache: 'CACHE', External: 'EXTERNAL', ExternalStorage: 'EXTERNAL_STORAGE' }

function fakeFs () {
  const calls = []
  const rec = (op) => async (opts) => { calls.push({ op, ...opts }); return op === 'getUri' ? { uri: `file:///data/user/0/com.openvolley.beach/files/${opts.path}` } : op === 'readdir' ? { files: [] } : {} }
  return { Filesystem: new Proxy({}, { get: (_, op) => rec(op) }), Directory, Encoding: { UTF8: 'utf8' }, calls }
}

describe('SEC-22: backups and logs stay in the app\'s own folder', () => {
  it('the backup store writes to internal app storage, never the public Documents folder', async () => {
    const fs = fakeFs()
    const store = createCapacitorStore(fs, { log: { warn () {}, info () {} } })
    const info = await store.info()
    await store.write('game35-abc', '20261123T100000.000Z-00001.json', '{}')
    const w = fs.calls.find(c => c.op === 'writeFile')
    expect(w.directory).toBe('DATA')
    expect(fs.calls.some(c => c.directory === 'DOCUMENTS' || c.directory === 'EXTERNAL_STORAGE')).toBe(false)
    expect(info.folder).not.toMatch(/Documents|emulated/)
  })

  it('no storage permission above Android 10 (none for the backups; Export to Documents and the move of old files only)', () => {
    const manifest = res('AndroidManifest.xml')
    const perms = [...manifest.matchAll(/<uses-permission\s+android:name="android\.permission\.([A-Z_]+)"([^>]*)\/>/g)].map(m => ({ name: m[1], rest: m[2] }))
    for (const p of perms.filter(x => /EXTERNAL_STORAGE|MEDIA_/.test(x.name))) {
      const max = /android:maxSdkVersion="(\d+)"/.exec(p.rest)
      expect(max, p.name).not.toBeNull()
      expect(Number(max[1]), p.name).toBeLessThanOrEqual(29)
    }
    expect(manifest).not.toMatch(/MANAGE_EXTERNAL_STORAGE/)
  })
})
