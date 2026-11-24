import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// The desktop app is the Tauri beach flavour of the OpenVolley desktop app
// (OpenVolley src-tauri/tauri.beach.conf.json). The Electron shell openbeach
// carried (electron/, electron-builder, app.openbeach.escoresheet) is gone.

const frontend = resolve(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(resolve(frontend, 'package.json'), 'utf8'))

describe('no Electron leftovers', () => {
  it('no electron/ folder', () => {
    expect(existsSync(resolve(frontend, 'electron'))).toBe(false)
  })

  it('no Electron dependencies, scripts or builder config', () => {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps).not.toHaveProperty('electron')
    expect(deps).not.toHaveProperty('electron-builder')
    expect(Object.keys(pkg.scripts).filter((k) => k.startsWith('electron'))).toEqual([])
    expect(pkg).not.toHaveProperty('main')
    expect(pkg).not.toHaveProperty('build')
    expect(JSON.stringify(pkg)).not.toContain('app.openbeach.escoresheet')
  })
})
