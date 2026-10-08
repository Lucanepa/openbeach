// OpenVolley laptop run of 2026-10-08 (OV-16), same code here: Save on a
// signature pad closed the pad at once and the signature showed in its box a
// frame later (the box still empty with the pad gone). The pad now closes in
// the render that shows the saved signature.
// The real match-end screen and pad over the app's Dexie database (fake IndexedDB).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))

const SIG = 'data:image/png;base64,DRAWN'
let MatchEnd
let db
let saved
beforeAll(async () => {
  saved = {
    indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange,
    fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT
  }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  // jsdom has no 2D canvas
  const ctx = { scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {}, drawImage() {} }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SIG)
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  MatchEnd = (await import('../../components_beach/MatchEnd_beach')).default
})
afterAll(() => {
  cleanup()
  Dexie.dependencies.indexedDB = saved.indexedDB
  Dexie.dependencies.IDBKeyRange = saved.IDBKeyRange
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

describe('MatchEnd_beach: saving a signature drawn on the pad', () => {
  it('the pad closes in the change that shows the signature', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    await db.players.bulkAdd([
      { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
      { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
      { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
      { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
    ])
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: true, coinTossTeamA: 'team1' })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
      { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
    ])

    render(<MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />)
    const box = () => document.querySelector('[data-testid="signature-slot-captain-a"]')
    await waitFor(() => expect(box()?.querySelector('button')).toBeTruthy(), { timeout: 10000 })
    fireEvent.click(box().querySelector('button'))
    const pad = () => document.querySelector('canvas')
    await waitFor(() => expect(pad()).toBeTruthy())
    await sleep(150) // the pad sets its canvas up in a timer
    fireEvent.mouseDown(pad(), { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(pad(), { clientX: 40, clientY: 30 })
    fireEvent.mouseUp(pad(), { clientX: 40, clientY: 30 })
    const saveButton = () => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save' && !b.disabled)
    await waitFor(() => expect(saveButton()).toBeTruthy())

    // what each committed change shows: the pad, the signature in its box
    const states = []
    const observer = new MutationObserver(() => {
      states.push({ pad: !!pad(), signed: !!box()?.querySelector(`img[src="${SIG}"]`) })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    fireEvent.click(saveButton())
    await waitFor(async () => expect((await db.matches.get(matchId)).team1PostGameCaptainSignature).toBe(SIG))
    await sleep(400)
    observer.disconnect()

    expect(states.at(-1)).toEqual({ pad: false, signed: true })
    // never the pad gone with the box still empty
    expect(states.filter(st => !st.pad && !st.signed)).toEqual([])
    cleanup()
  }, 30000)

  it('an official match: one change, and a second tap on Save saves once', async () => {
    // an official match's save also queues the upload (a second write after
    // the signature is on screen); the pad stays open until the signature
    // shows, and a quick second tap on its Save saved it and queued it again
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
    await db.players.bulkAdd([
      { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
      { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
      { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
      { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
    ])
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: false, seed_key: 'sig-twice', coinTossTeamA: 'team1' })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
      { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
    ])

    render(<MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />)
    const box = () => document.querySelector('[data-testid="signature-slot-captain-a"]')
    await waitFor(() => expect(box()?.querySelector('button')).toBeTruthy(), { timeout: 10000 })
    fireEvent.click(box().querySelector('button'))
    const pad = () => document.querySelector('canvas')
    await waitFor(() => expect(pad()).toBeTruthy())
    await sleep(150)
    fireEvent.mouseDown(pad(), { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(pad(), { clientX: 40, clientY: 30 })
    fireEvent.mouseUp(pad(), { clientX: 40, clientY: 30 })
    const saveButton = () => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save' && !b.disabled)
    await waitFor(() => expect(saveButton()).toBeTruthy())

    const states = []
    const observer = new MutationObserver(() => {
      states.push({ pad: !!pad(), signed: !!box()?.querySelector(`img[src="${SIG}"]`) })
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    const save = saveButton()
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() => expect(pad()).toBeFalsy(), { timeout: 5000 })
    await sleep(300)
    observer.disconnect()

    // the pad closed in the change that showed the signature
    expect(states.filter(st => st.pad && st.signed)).toEqual([])
    expect(states.filter(st => !st.pad && !st.signed)).toEqual([])
    const jobs = (await db.sync_queue.toArray()).filter(j => j.payload?.id === 'sig-twice' && j.payload?.signatures)
    expect(jobs).toHaveLength(1)
    cleanup()
  }, 30000)
})
