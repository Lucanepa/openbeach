// MatchEnd_beach: every signed box has Re-sign (opens the pad, Cancel keeps
// the old one) and Clear (empties the slot at once, then opens the pad),
// closed once the match is approved. Each change is saved to the match row
// and queued for the cloud at once, and "Reopen last set" clears every
// post-match signature, there too (OpenVolley b1b15d8f).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
// The pad: "Draw" stands for a drawn signature, "Cancel pad" closes it unchanged
vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title }) => (open ? (
    <div role="dialog" aria-label={`pad ${title}`}>
      <button type="button" onClick={() => { onSave('data:image/png;base64,NEW'); onClose?.() }}>Draw</button>
      <button type="button" onClick={() => onClose?.()}>Cancel pad</button>
    </div>
  ) : null)
}))

let MatchEnd
let UiHost
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  ;({ UiHost } = await import('../../ui/volleyui/UiHost.jsx'))
  MatchEnd = (await import('../../components_beach/MatchEnd_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
async function seed(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
    { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
    { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
  ])
  matchId = await db.matches.add({
    team1Id, team2Id, status: 'ended', seed_key: 'seed-1', coinTossTeamA: 'team1',
    team1CaptainSignature: 'data:pre-capt-1',
    team1PostGameCaptainSignature: 'data:post-capt-1',
    team2PostGameCaptainSignature: 'data:post-capt-2',
    scorerSignature: 'data:scorer',
    ref1Signature: 'data:ref1',
    ...extra
  })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
  ])
}

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

function renderMatchEnd() {
  render(
    <>
      <MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />
      <div className="ov-kit"><UiHost /></div>
    </>
  )
}

const clickEl = (el) => act(async () => { fireEvent.click(el) })
const signatureJobs = async () => (await db.sync_queue.toArray()).filter(j => j.payload?.signatures)

describe('MatchEnd_beach: Re-sign and Clear', () => {
  it('a signed captain box offers Re-sign and Clear', async () => {
    await seed()
    renderMatchEnd()
    expect(await screen.findByTestId('signature-resign-captain-a')).toBeEnabled()
    expect(screen.getByTestId('signature-clear-captain-a')).toBeEnabled()
    expect(screen.getByTestId('signature-resign-ref1')).toBeEnabled()
  })

  it('Clear empties the slot at once (saved and queued), then opens the pad', async () => {
    await seed()
    renderMatchEnd()
    await clickEl(await screen.findByTestId('signature-clear-captain-a'))
    await waitFor(async () => expect((await db.matches.get(matchId)).team1PostGameCaptainSignature).toBeNull())
    const jobs = await signatureJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].payload.id).toBe('seed-1')
    // the whole object travels: the other signatures are never wiped
    expect(jobs[0].payload.signatures).toMatchObject({
      team1_captain_post_game: null, team2_captain_post_game: 'data:post-capt-2',
      team1_captain: 'data:pre-capt-1', scorer: 'data:scorer', ref1: 'data:ref1'
    })
    expect(await screen.findByRole('dialog', { name: /^pad Captain A/ })).toBeInTheDocument()
  })

  it('Re-sign opens the pad; Cancel keeps the old signature, a new one is saved and queued', async () => {
    await seed()
    renderMatchEnd()
    await clickEl(await screen.findByTestId('signature-resign-ref1'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel pad' })) })
    expect((await db.matches.get(matchId)).ref1Signature).toBe('data:ref1')
    expect(await signatureJobs()).toHaveLength(0)

    await act(async () => { fireEvent.click(screen.getByTestId('signature-resign-ref1')) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).ref1Signature).toBe('data:image/png;base64,NEW'))
    expect((await signatureJobs())[0].payload.signatures.ref1).toBe('data:image/png;base64,NEW')
  })

  it('a first signature is queued for the cloud at once too', async () => {
    await seed({ ref1Signature: null })
    renderMatchEnd()
    await clickEl(await screen.findByRole('button', { name: /1st referee · Tap to sign/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).ref1Signature).toBe('data:image/png;base64,NEW'))
    expect(await signatureJobs()).toHaveLength(1)
  })

  it('an approved match: Re-sign and Clear are closed', async () => {
    await seed({ approved: true })
    renderMatchEnd()
    expect(await screen.findByTestId('signature-resign-captain-a')).toBeDisabled()
    expect(screen.getByTestId('signature-clear-captain-a')).toBeDisabled()
    expect(screen.getByTestId('signature-clear-captain-a')).toHaveAttribute('title', 'Match approved or closed: signatures can no longer change')
  })

  it('a test match: saved, never queued', async () => {
    await seed({ test: true })
    renderMatchEnd()
    await clickEl(await screen.findByTestId('signature-clear-scorer'))
    await waitFor(async () => expect((await db.matches.get(matchId)).scorerSignature).toBeNull())
    expect(await signatureJobs()).toHaveLength(0)
  })
})

describe('MatchEnd_beach: Reopen last set', () => {
  it('clears every post-match signature, the officials too, locally and in the cloud', async () => {
    await seed({ asstScorerSignature: 'data:asst', ref2Signature: 'data:ref2' })
    renderMatchEnd()
    await clickEl(await screen.findByRole('button', { name: 'Reopen last set' }))
    await clickEl(await screen.findByTestId('confirm-accept'))

    await waitFor(async () => expect((await db.matches.get(matchId)).status).toBe('live'))
    const row = await db.matches.get(matchId)
    for (const field of ['team1PostGameCaptainSignature', 'team2PostGameCaptainSignature', 'asstScorerSignature', 'scorerSignature', 'ref2Signature', 'ref1Signature']) {
      expect(row[field], field).toBeNull()
    }
    // the pre-match signatures stay
    expect(row.team1CaptainSignature).toBe('data:pre-capt-1')
    const live = (await db.sync_queue.toArray()).find(j => j.resource === 'match' && j.payload?.status === 'live')
    expect(live.payload.signatures).toMatchObject({
      team1_captain: 'data:pre-capt-1',
      team1_captain_post_game: null, team2_captain_post_game: null,
      asst_scorer: null, scorer: null, ref2: null, ref1: null
    })
  })
})
