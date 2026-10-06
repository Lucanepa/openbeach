import { describe, it, expect, vi } from 'vitest'

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `http://backend.test${p}`,
  isBackendAvailable: () => true
}))
const uploads = vi.hoisted(() => [])
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiStorage: {
    from: (bucket) => ({
      upload: async (path) => { uploads.push({ bucket, path }); return { data: { path }, error: null } }
    })
  }
}))

import { scoresheetStoragePath, uploadScoresheet, uploadScoresheetPdf, parseFinalScoresheetName, BEACH_SCORESHEET_PREFIX } from '../../utils_beach/scoresheetUploader_beach'

describe('beach scoresheet storage paths', () => {
  const match = { scheduledAt: '2026-07-04T09:30:00.000Z', gameNumber: 12 }

  const seeded = { ...match, seed_key: 'match_1783000000000_ab12cd' }

  it('live under beach/{date}/ so they never overwrite an indoor game n of the same date', () => {
    expect(BEACH_SCORESHEET_PREFIX).toBe('beach')
    expect(scoresheetStoragePath(match)).toBe('beach/2026-07-04/game12.json')
    expect(scoresheetStoragePath(match, { final: true })).toBe('beach/2026-07-04/game12_final.json')
    expect(scoresheetStoragePath(match, { ext: 'pdf' })).toBe('beach/2026-07-04/game12.pdf')
  })

  it('carry the seed_key, so two game 12s of the same date never share a key', () => {
    expect(scoresheetStoragePath(seeded)).toBe('beach/2026-07-04/game12_match_1783000000000_ab12cd.json')
    expect(scoresheetStoragePath(seeded, { final: true })).toBe('beach/2026-07-04/game12_match_1783000000000_ab12cd_final.json')
    expect(scoresheetStoragePath(seeded, { ext: 'pdf' })).toBe('beach/2026-07-04/game12_match_1783000000000_ab12cd.pdf')
    expect(scoresheetStoragePath({ ...match, seed_key: 'a/../b c' })).toBe('beach/2026-07-04/game12_a----b-c.json')
  })

  it('the archive finds the final JSON and its PDF, old and new names', () => {
    expect(parseFinalScoresheetName('game12_match_1783000000000_ab12cd_final.json'))
      .toEqual({ game: '12', pdfName: 'game12_match_1783000000000_ab12cd.pdf' })
    expect(parseFinalScoresheetName('game12_final.json')).toEqual({ game: '12', pdfName: 'game12.pdf' })
    expect(parseFinalScoresheetName('game12_match_1.json')).toBeNull()
    expect(parseFinalScoresheetName('game12.pdf')).toBeNull()
  })

  it('uploadScoresheet writes the JSON under beach/', async () => {
    const r = await uploadScoresheet({ match: seeded, team1: {}, team2: {}, team1Players: [], team2Players: [], sets: [], events: [], final: true })
    expect(r).toEqual({ success: true, path: 'beach/2026-07-04/game12_match_1783000000000_ab12cd_final.json' })
    expect(uploads).toEqual([{ bucket: 'scoresheets', path: 'beach/2026-07-04/game12_match_1783000000000_ab12cd_final.json' }])
  })

  it('uploadScoresheetPdf writes the PDF next to it', async () => {
    uploads.length = 0
    const r = await uploadScoresheetPdf(seeded, new Blob(['%PDF'], { type: 'application/pdf' }))
    expect(r).toEqual({ success: true, path: 'beach/2026-07-04/game12_match_1783000000000_ab12cd.pdf' })
    expect(await uploadScoresheetPdf(seeded, null)).toEqual({ success: false, error: 'No PDF' })
    expect(await uploadScoresheetPdf({ ...seeded, test: true }, new Blob(['x']))).toEqual({ success: false, error: 'Test match' })
  })
})
