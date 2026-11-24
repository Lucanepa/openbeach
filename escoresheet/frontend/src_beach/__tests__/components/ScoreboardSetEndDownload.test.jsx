// Options > "Auto-download data at set end": the scoreboard kept the switch
// in its own state, on at every mount, so switched off it was back on after
// a reload or at the next match. It is a backup setting now
// (backupManager_beach getBackupSettings / saveBackupSettings). On the real
// scoring screen over the app's Dexie database (fake IndexedDB), signed out:
// the set end does not reach the cloud, so the scoreboard downloads the
// device's data, a file Restore match takes back.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { restoreMatchFromJson } from '../../utils_beach/backupManager_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

// The files the page hands the browser to download: name and contents
const downloads = []
let saved
beforeAll(() => {
  saved = {
    WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL
  }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const blobs = new Map()
  URL.createObjectURL = (blob) => {
    const url = `blob:test/${blobs.size + 1}`
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = () => {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) })
  })
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  URL.createObjectURL = saved.createObjectURL
  URL.revokeObjectURL = saved.revokeObjectURL
  vi.restoreAllMocks()
})
beforeEach(async () => {
  cleanup()
  downloads.length = 0
  await Promise.all(db.tables.map(t => t.clear()))
})

// a tap on the rally buttons the moment they changed is the end of the tap
// that changed them (Scoreboard_beach rallyButtonsJustShown): wait as a scorer does
const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const readBlob = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})

// An official match one point before the end of set 1, with an older match
// of another pair still on the device
async function seedSetPoint(seedKey) {
  const old1 = await db.teams.add({ name: 'Old / One' })
  const old2 = await db.teams.add({ name: 'Old / Two' })
  const old = await db.matches.add({ team1Id: old1, team2Id: old2, status: 'ended', seed_key: 'match_old_one' })
  await db.sets.add({ matchId: old, index: 1, team1Points: 21, team2Points: 3, finished: true })
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: seedKey,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: 13, finished: false, startTime: new Date(Date.now() - 900000).toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

async function endSetOne(matchId) {
  render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
  await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
  await settle()
  fireEvent.click(button('Point A'))
  // the set end time
  await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('Confirm'))
  await waitFor(async () => {
    const sets = await db.sets.where('matchId').equals(matchId).toArray()
    expect(sets.find(s => s.index === 1)?.finished).toBe(true)
    expect(sets.some(s => s.index === 2)).toBe(true)
  }, { timeout: 8000 })
  await waitFor(() => expect(document.querySelector('[data-testid="set-transition-status"]')).toBeNull(), { timeout: 8000 })
}

describe('Scoreboard_beach: the set-end download', () => {
  it('on by default: the set end that did not reach the cloud downloads a file Restore match takes back', async () => {
    const matchId = await seedSetPoint('match_set_end_dl')
    await endSetOne(matchId)
    await waitFor(() => expect(downloads.some(d => d.name.startsWith('backup_set1_'))).toBe(true), { timeout: 5000 })
    const file = JSON.parse(await readBlob(downloads.find(d => d.name.startsWith('backup_set1_')).blob))
    expect(file.matchId).toBe(matchId)
    cleanup()

    // another device: only this file
    await Promise.all(db.tables.map(t => t.clear()))
    const restored = await restoreMatchFromJson(file)
    expect(await db.matches.get(restored)).toMatchObject({ seed_key: 'match_set_end_dl', status: 'live' })
    // written as set 1 ended, before set 2 is made
    expect((await db.sets.where('matchId').equals(restored).sortBy('index')).map(s => `${s.index}:${s.team1Points}-${s.team2Points}:${!!s.finished}`))
      .toEqual(['1:21-13:true'])
    expect(await db.matches.count()).toBe(1) // not the older match of the file
    expect(await db.players.count()).toBe(4)
  }, 40000)

  it('switched off, it stays off: the next scoreboard downloads nothing at the set end', async () => {
    const storage = useMemoryLocalStorage()
    storage.set('autoDownloadAtSetEnd', 'false') // switched off in the Options
    const matchId = await seedSetPoint('match_set_end_off')
    await endSetOne(matchId)
    await new Promise(r => setTimeout(r, 500))
    expect(downloads.filter(d => d.name.startsWith('backup_set'))).toEqual([])
  }, 40000)
})
