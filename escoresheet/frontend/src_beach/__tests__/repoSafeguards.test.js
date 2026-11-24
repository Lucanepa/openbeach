// Audit SEC-27: the public OpenBeach repo had none of OpenVolley's B6
// safeguards: the files the app writes (backups, match and database exports,
// debug logs, diagnostics) were committable, .gitleaks.toml had credential
// rules only, there was no CI leak scan, and the pre-commit hook passed
// silently without gitleaks. The audit's PoC (poc/supply-ci-deploy/
// ob-gitignore-check.sh) as a repo check; .githooks/test-gitignore.sh,
// test-gitleaks-config.sh and test-ci-leak-scan.sh hold the full cases
// (run by .github/workflows/leak-scan.yml).
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repo = resolve(__dirname, '../../../..')
const inGit = spawnSync('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout.trim() === 'true'
const ignored = (p) => spawnSync('git', ['-C', repo, 'check-ignore', '--no-index', '-q', '--', p]).status === 0
const read = (p) => readFileSync(resolve(repo, p), 'utf8')

describe.skipIf(!inGit)('the files the app writes are never committable', () => {
  it.each([
    'backup_set1_match-12_2026-11-23T10-00-00-000Z.json',
    'match-data-12.json',
    'match_stopped_12_2026-11-23.json',
    'database_export_12_2026-11-23.json',
    'debug_logs_2026-11-23T10-00-00-000Z.json',
    'openbeach-diagnostics-2026-11-23T10-00-00-000Z.jsonl',
    'escoresheet/frontend/backup_g35_p1a2b3c4d_20261123_100000_123_set1_scoreleft21_scoreright19.json',
    'OpenBeach/backups/game35-match_1763890000000_ab12cd/latest.json',
    'MatchData_Gialli-Verdi_vs_Alba-Coral_2026-11-23.json'
  ])('%s is ignored', (name) => {
    expect(ignored(name)).toBe(true)
  })

  it('test fixtures and the code stay trackable; no tracked file is ignored', () => {
    expect(ignored('escoresheet/frontend/src_beach/__tests__/fixtures/game35.json')).toBe(false)
    expect(ignored('escoresheet/frontend/src_beach/utils_beach/backupManager_beach.js')).toBe(false)
    const tracked = spawnSync('git', ['-C', repo, 'ls-files', '-i', '-c', '--exclude-standard'], { encoding: 'utf8' }).stdout.trim()
    expect(tracked).toBe('')
  })

  it('the sample match is a test fixture, and the local Claude settings are not tracked', () => {
    const files = spawnSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8' }).stdout.split('\n')
    expect(files).not.toContain('escoresheet/frontend/game35.json')
    expect(files).toContain('escoresheet/frontend/src_beach/__tests__/fixtures/game35.json')
    expect(files).not.toContain('.claude/settings.local.json')
  })
})

describe('personal-data scan rules, CI scan and a hook that fails closed', () => {
  it('.gitleaks.toml has the match-data rules, with OpenBeach\'s file names', () => {
    const cfg = read('.gitleaks.toml')
    for (const id of ['match-data-birth-date', 'match-data-signature', 'match-data-contact', 'match-data-email', 'match-data-file']) {
      expect(cfg, id).toContain(`id = "${id}"`)
    }
    expect(cfg).toMatch(/openbeach-diagnostics/)
    expect(cfg).toMatch(/debug_logs_\[\^\/\]\*\\\.json\$/)
  })

  it('the pre-commit hook blocks when gitleaks is missing (SKIP_GITLEAKS=1 for one commit only)', () => {
    const hook = read('.githooks/pre-commit')
    const missing = hook.slice(hook.indexOf('if ! command -v gitleaks'), hook.indexOf('\nfi\n', hook.indexOf('if ! command -v gitleaks')))
    expect(missing).toMatch(/SKIP_GITLEAKS/)
    expect(missing).toMatch(/BLOCKED/)
    expect(missing.trim().split('\n').slice(-1)[0].trim()).toBe('exit 1')
  })

  it('CI scans every push and pull request, and runs the rule tests', () => {
    expect(existsSync(resolve(repo, '.githooks/ci-leak-scan.sh'))).toBe(true)
    const wf = read('.github/workflows/leak-scan.yml')
    expect(wf).toMatch(/push:\s+branches: \['\*\*'\]/)
    expect(wf).toMatch(/pull_request:/)
    expect(wf).toMatch(/\.githooks\/test-gitleaks-config\.sh/)
    expect(wf).toMatch(/\.githooks\/test-gitignore\.sh/)
    expect(wf).toMatch(/\.githooks\/ci-leak-scan\.sh "\$BASE" "\$HEAD_SHA"/)
    for (const m of wf.matchAll(/uses: ([^\s]+)/g)) expect(m[1], m[1]).toMatch(/@[0-9a-f]{40}$/)
  })
})
