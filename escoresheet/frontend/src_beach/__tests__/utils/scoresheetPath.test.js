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

import { scoresheetStoragePath, uploadScoresheet, BEACH_SCORESHEET_PREFIX } from '../../utils_beach/scoresheetUploader_beach'

describe('beach scoresheet storage paths', () => {
  const match = { scheduledAt: '2026-07-04T09:30:00.000Z', gameNumber: 12 }

  it('live under beach/{date}/ so they never overwrite an indoor game n of the same date', () => {
    expect(BEACH_SCORESHEET_PREFIX).toBe('beach')
    expect(scoresheetStoragePath(match)).toBe('beach/2026-07-04/game12.json')
    expect(scoresheetStoragePath(match, { final: true })).toBe('beach/2026-07-04/game12_final.json')
    expect(scoresheetStoragePath(match, { ext: 'pdf' })).toBe('beach/2026-07-04/game12.pdf')
  })

  it('uploadScoresheet writes the JSON under beach/', async () => {
    const r = await uploadScoresheet({ match, team1: {}, team2: {}, team1Players: [], team2Players: [], sets: [], events: [], final: true })
    expect(r).toEqual({ success: true, path: 'beach/2026-07-04/game12_final.json' })
    expect(uploads).toEqual([{ bucket: 'scoresheets', path: 'beach/2026-07-04/game12_final.json' }])
  })
})
