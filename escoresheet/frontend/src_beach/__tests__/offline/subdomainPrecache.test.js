import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { precacheUnderFinalName } from '../../../scripts/subdomain-precache.js'

// beach.openvolley.app never installed its service worker: the subdomain page
// is built as _build_beachapp.html and renamed to index.html after the build,
// but the precache still listed _build_beachapp.html. The worker's install
// fetched it, got a 404 and failed, so the website never worked offline.
// (OpenVolley d7f00c0b, manifestTransforms.)

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('subdomain precache', () => {
  it('lists the built page under its final name, index.html', async () => {
    const transform = precacheUnderFinalName('_build_beachapp.html')
    const { manifest, warnings } = await transform([
      { url: '_build_beachapp.html', revision: 'abc', size: 1 },
      { url: 'assets/index-123.js', revision: null, size: 2 },
      { url: 'scoresheet_pdf_beach.html', revision: 'def', size: 3 }
    ])
    expect(manifest.map((e) => e.url)).toEqual(['index.html', 'assets/index-123.js', 'scoresheet_pdf_beach.html'])
    // the revision stays, so the worker still notices a changed page
    expect(manifest[0]).toMatchObject({ url: 'index.html', revision: 'abc' })
    expect(warnings).toEqual([])
  })

  it('every subdomain build uses it', () => {
    const script = readFileSync(resolve(frontendDir, 'scripts/build-subdomains.js'), 'utf8')
    expect(script).toMatch(/manifestTransforms: \[precacheUnderFinalName\(tempIndexName\)\]/)
  })
})
