// The scoresheet archive (scoresheet_archive_beach.html): its list of the
// account's approved matches and its View PDF.
//
// The list read one page of 50 files per date folder (and 50 matches in
// all): each match stores 3 files, so about 16 matches of a day were shown,
// cut by name (game1, game10..19, game2..), and the rest dropped without a
// word: 24 approved, '16 scoresheets', games 2-9 missing.
//
// View PDF opened beach/{date}/game{n}.pdf, but every match since the seed
// key stores game{n}_{seed}.pdf: "Scoresheet not found" for every official
// match (stress test 2026-10-25). The storage is the backend's, faked here
// with its paging (sorted by name, limit and offset).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'

const store = vi.hoisted(() => ({ files: new Map(), downloads: [], lists: [] }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true
}))
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const bucket = {
    async list(dir, options = {}) {
      store.lists.push({ dir, options })
      const prefix = `${dir}/`
      const names = new Set()
      for (const key of store.files.keys()) {
        if (!key.startsWith(prefix)) continue
        names.add(key.slice(prefix.length).split('/')[0])
      }
      let sorted = [...names].sort()
      if (options.sortBy?.order === 'desc') sorted = sorted.reverse()
      const limit = Math.min(options.limit ?? 100, 1000)
      const offset = options.offset ?? 0
      return { data: sorted.slice(offset, offset + limit).map(name => ({ name })), error: null }
    },
    async download(path) {
      store.downloads.push(path)
      if (!store.files.has(path)) return { data: null, error: { message: 'Object not found' } }
      return { data: new Blob([store.files.get(path)], { type: path.endsWith('.pdf') ? 'application/pdf' : 'application/json' }), error: null }
    }
  }
  return { ...actual, apiStorage: { from: () => bucket } }
})

import '../../i18n_beach'
import ScoresheetApp from '../../ScoresheetApp_beach'

// A match approved with 3.0.1: its interim JSON, its PDF and its final JSON
function storeMatch(date, game, seed, teams = ['Alpha / Beta', 'Gamma / Delta']) {
  const base = `beach/${date}/game${game}_${seed}`
  const json = JSON.stringify({ match: { sport_type: 'beach', game_n: game, final_score: '2-0', eventName: 'Swiss Beach Tour' }, team1Team: { name: teams[0] }, team2Team: { name: teams[1] } })
  store.files.set(`${base}.json`, json)
  store.files.set(`${base}.pdf`, '%PDF-1.4 fake')
  store.files.set(`${base}_final.json`, json)
}

// The list's View PDF links, its sections (collapsed at first) opened
async function viewPdfLinks(count) {
  return waitFor(() => {
    for (const b of document.querySelectorAll('button[aria-expanded="false"]')) fireEvent.click(b)
    const links = [...document.querySelectorAll('a')].filter(el => el.textContent.includes('View PDF'))
    expect(links.length).toBe(count)
    return links
  }, { timeout: 5000 })
}

const openAt = (search) => window.history.replaceState(null, '', `/scoresheet_archive_beach.html${search}`)

beforeEach(() => {
  cleanup()
  store.files.clear()
  store.downloads.length = 0
  store.lists.length = 0
  openAt('')
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-pdf')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('Scoresheet archive: View PDF', () => {
  it('opens the stored PDF of the match, game{n}_{seed}.pdf', async () => {
    storeMatch('2026-10-26', 715, 'match_1793011862441_u8r2zv')
    render(<ScoresheetApp />)
    const [link] = await viewPdfLinks(1)
    cleanup()

    openAt(new URL(link.href).search)
    render(<ScoresheetApp />)
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy(), { timeout: 5000 })
    expect(store.downloads.at(-1)).toBe('beach/2026-10-26/game715_match_1793011862441_u8r2zv.pdf')
    expect(screen.queryByText(/PDF not found/)).toBeNull()
  })

  it('two matches with the same game number on a date open their own PDFs', async () => {
    storeMatch('2026-10-26', 3, 'match_1_aaaaaa', ['Alpha / Beta', 'Gamma / Delta'])
    storeMatch('2026-10-26', 3, 'match_2_bbbbbb', ['Epsilon / Zeta', 'Eta / Theta'])
    render(<ScoresheetApp />)
    const files = (await viewPdfLinks(2)).map(a => new URL(a.href).searchParams.get('file')).sort()
    expect(files).toEqual(['game3_match_1_aaaaaa.pdf', 'game3_match_2_bbbbbb.pdf'])
  })

  it('an old link without the file opens game{n}.pdf, as before', async () => {
    store.files.set('beach/2026-06-01/game4.pdf', '%PDF-1.4 fake')
    openAt('?date=2026-06-01&game=4')
    render(<ScoresheetApp />)
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy(), { timeout: 5000 })
    expect(store.downloads.at(-1)).toBe('beach/2026-06-01/game4.pdf')
  })

  it('a file name that is not one of the date folder\'s is not opened', async () => {
    openAt('?date=2026-06-01&game=4&file=..%2F..%2Fother%2Fgame4.pdf')
    render(<ScoresheetApp />)
    await waitFor(() => expect(store.downloads.length).toBeGreaterThan(0), { timeout: 5000 })
    expect(store.downloads.at(-1)).toBe('beach/2026-06-01/game4.pdf')
  })
})

describe('Scoresheet archive: every approved match of a day', () => {
  it('24 matches on one date (72 files): all 24 are listed', async () => {
    for (let game = 1; game <= 24; game++) storeMatch('2026-10-24', game, `match_${game}_abcdef`)
    render(<ScoresheetApp />)
    const links = await viewPdfLinks(24)
    const games = links.map(a => Number(new URL(a.href).searchParams.get('game'))).sort((a, b) => a - b)
    expect(games).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(document.body.textContent).toContain('24 scoresheets')
  })

  it('more files than a page of the backend: the next page is read', async () => {
    // 340 matches, 1020 files, in one folder: the backend's page is 1000
    for (let game = 1; game <= 340; game++) storeMatch('2026-10-25', game, 'match_x')
    render(<ScoresheetApp />)
    await waitFor(() => expect(document.body.textContent).toContain('340 scoresheets'), { timeout: 15000 })
    const folderLists = store.lists.filter(l => l.dir === 'beach/2026-10-25')
    expect(folderLists.map(l => l.options.offset)).toEqual([0, 1000])
  }, 30000)
})
