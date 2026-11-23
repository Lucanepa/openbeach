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

describe('SEC-49: no Auto Backup and no device transfer of the app data', () => {
  it('allowBackup and fullBackupContent are off, and the Android 12+ extraction rules exclude every domain', () => {
    const manifest = res('AndroidManifest.xml')
    expect(manifest).toMatch(/android:allowBackup="false"/)
    expect(manifest).toMatch(/android:fullBackupContent="false"/)
    expect(manifest).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/)
    const rules = res('res/xml/data_extraction_rules.xml')
    const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']
    for (const section of ['cloud-backup', 'device-transfer']) {
      const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules)?.[1]
      expect(body, section).toBeTruthy()
      for (const d of domains) expect(body, `${section} ${d}`).toContain(`<exclude domain="${d}" path="." />`)
      expect(body).not.toMatch(/<include/)
    }
  })
})

describe('SEC-50: the FileProvider, cleartext, dependency checks', () => {
  it('the FileProvider shares the camera-capture folder only, never all shared storage or the whole cache', () => {
    const paths = res('res/xml/file_paths.xml')
    const entries = [...paths.matchAll(/<([a-z-]+-path)\s+name="([^"]+)"\s+path="([^"]*)"\s*\/>/g)].map(m => ({ kind: m[1], name: m[2], path: m[3] }))
    expect(entries).toEqual([{ kind: 'external-files-path', name: 'captures', path: 'Pictures/' }])
    expect(paths).not.toMatch(/path="\."|<external-path|<cache-path|<root-path|<files-path/)
  })

  it('no cleartext to openvolley.app and its subdomains (venue relays on LAN addresses still over http)', () => {
    const nsc = res('res/xml/network_security_config.xml')
    expect(nsc).toMatch(/<base-config cleartextTrafficPermitted="true">/)
    expect(nsc).toMatch(/<domain-config cleartextTrafficPermitted="false">\s*<domain includeSubdomains="true">openvolley\.app<\/domain>\s*<\/domain-config>/)
  })

  it('Gradle verifies the checksums of every Maven artifact of the APK', () => {
    const meta = readFileSync(path.join(fe, 'android/gradle/verification-metadata.xml'), 'utf8')
    expect(meta).toMatch(/<verify-metadata>true<\/verify-metadata>/)
    // the plugins and libraries the app is built from are listed with their sha256
    for (const group of ['com.android.tools.build', 'androidx.appcompat', 'androidx.core']) {
      expect(meta, group).toMatch(new RegExp(`<component group="${group.replace(/\./g, '\\.')}"`))
    }
    expect(meta).toMatch(/<sha256 value="[0-9a-f]{64}"/)
  })

  it('CI audits the production dependencies; Dependabot also proposes the action pins', () => {
    const repo = path.resolve(fe, '../..')
    const audit = readFileSync(path.join(repo, '.github/workflows/dependency-audit.yml'), 'utf8')
    expect(audit).toMatch(/working-directory: escoresheet\/frontend\s+run: npm audit --omit=dev --audit-level=high/)
    expect(audit).toMatch(/permissions:\s+contents: read/)
    // actions pinned by commit
    for (const m of audit.matchAll(/uses: ([^\s]+)/g)) expect(m[1], m[1]).toMatch(/@[0-9a-f]{40}$/)
    const dependabot = readFileSync(path.join(repo, '.github/dependabot.yml'), 'utf8')
    expect(dependabot).toMatch(/package-ecosystem: github-actions/)
    expect(dependabot).toMatch(/package-ecosystem: npm\s+directory: \/escoresheet\/frontend/)
  })
})
