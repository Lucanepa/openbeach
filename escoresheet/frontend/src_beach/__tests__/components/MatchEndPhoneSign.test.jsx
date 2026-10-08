// MatchEnd_beach and Sign on phone (OpenVolley d451686d, 84a06005): a phone
// signature lands in the right field of every slot (A / B by the coin toss)
// with its "signed on phone" record in the same update, saved and queued for
// the cloud like a drawing; a later drawing or a Clear resets the record; the
// box shows where it was signed; the pad gets the slot, the match key, the
// game PIN and the beach context; a lock closes the phone too; "Reopen last
// set" forgets the records. SignaturePad is mocked: its phone / draw buttons
// call onSave as it does.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
const pad = vi.hoisted(() => ({ phone: null }))
vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title, phone }) => {
    if (!open) return null
    pad.phone = phone
    return (
      <div role="dialog" aria-label={`pad ${title}`}>
        <button
          type="button"
          onClick={() => {
            // a result that arrives anyway (the screen must refuse it once locked)
            onSave('data:image/png;base64,PHONE', { source: 'phone', transport: 'cloud' })
            onClose?.()
          }}
        >phone</button>
        <button type="button" onClick={() => { onSave('data:image/png;base64,SIG', { source: 'device' }); onClose?.() }}>draw</button>
      </div>
    )
  }
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
}, 30000) // the first import of the screen is slow on a loaded machine
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

// Just the 1st referee and the scorer: their boxes open without the others
const TWO_OFFICIALS = [
  { role: '1st referee', firstName: 'Anna', lastName: 'Ref' },
  { role: 'scorer', firstName: 'Sam', lastName: 'Scorer' }
]
const OFFICIALS = [
  { role: '1st referee', firstName: 'Anna', lastName: 'Ref' },
  { role: '2nd referee', firstName: 'Bea', lastName: 'Second' },
  { role: 'scorer', firstName: 'Sam', lastName: 'Scorer' },
  { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist' }
]

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
    team1Id, team2Id, status: 'ended', seed_key: 'seed-1', gamePin: '482913', gameNumber: 31,
    coinTossTeamA: 'team1', officials: OFFICIALS, ...extra
  })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
  ])
}

beforeEach(async () => {
  pad.phone = null
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

const click = (el) => act(async () => { fireEvent.click(el) })
const row = () => db.matches.get(matchId)
const signatureJobs = async () => (await db.sync_queue.toArray()).filter(j => j.payload?.signatures)

/** Open the empty box of `name` and sign it with the pad's `how` button. */
async function signBox(name, how = 'phone') {
  const name_ = new RegExp(`^${name}.* · Tap to sign`)
  // the box opens once the slot before it is signed (the screen re-reads the
  // match and draws the boxes anew: query it again, never keep the element)
  await waitFor(() => expect(screen.getByRole('button', { name: name_ })).toBeEnabled())
  await click(screen.getByRole('button', { name: name_ }))
  await waitFor(() => expect(screen.getByRole('button', { name: how })).toBeInTheDocument())
  await click(screen.getByRole('button', { name: how }))
}

describe('MatchEnd_beach: Sign on phone', () => {
  it('a phone signature lands in the field of each of the six slots, with its record', async () => {
    await seed()
    renderMatchEnd()
    const slots = [
      [/Captain A/, 'team1PostGameCaptainSignature'],
      [/Captain B/, 'team2PostGameCaptainSignature'],
      ['Assistant scorer', 'asstScorerSignature'],
      ['Scorer', 'scorerSignature'],
      ['2nd referee', 'ref2Signature'],
      ['1st referee', 'ref1Signature']
    ]
    for (const [name, field] of slots) {
      const label = typeof name === 'string' ? name : name.source
      await signBox(label)
      await waitFor(async () => expect((await row())[field], field).toBe('data:image/png;base64,PHONE'))
      const r = await row()
      expect(r.signatureSources[field]).toMatchObject({ via: 'phone', transport: 'cloud' })
      expect(typeof r.signatureSources[field].at).toBe('string')
    }
    // Every box shows it was signed on a phone
    for (const role of ['captain-a', 'captain-b', 'asst-scorer', 'scorer', 'ref2', 'ref1']) {
      expect(await screen.findByTestId(`signed-on-phone-${role}`)).toHaveAttribute('aria-label', 'Signed on phone')
    }
  }, 30000) // six boxes one after the other

  it('captain A / B follow the coin toss (team A = team 2)', async () => {
    await seed({ coinTossTeamA: 'team2' })
    renderMatchEnd()
    await signBox('Captain A')
    await waitFor(async () => expect((await row()).team2PostGameCaptainSignature).toBe('data:image/png;base64,PHONE'))
    expect((await row()).team1PostGameCaptainSignature).toBeFalsy()
    expect(pad.phone).toMatchObject({ slot: 'captain-a', context: { teamSide: 'away', teamLabel: 'A', name: '#1 Sara Rossi' } })
  })

  it('a phone result is saved at once and queued for the cloud, like a drawing', async () => {
    await seed({ officials: TWO_OFFICIALS, team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2' })
    renderMatchEnd()
    await signBox('Scorer')
    let jobs
    await waitFor(async () => { jobs = await signatureJobs(); expect(jobs).toHaveLength(1) })
    expect(jobs[0].payload).toMatchObject({ id: 'seed-1', signatures: { scorer: 'data:image/png;base64,PHONE', team1_captain_post_game: 'data:c1' } })
  })

  it('a drawn signature records no phone, and replaces a phone record', async () => {
    await seed({
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:old',
      signatureSources: { scorerSignature: { via: 'phone', transport: 'lan', at: '2026-07-12T10:00:00.000Z' } }
    })
    renderMatchEnd()
    expect(await screen.findByTestId('signed-on-phone-scorer')).toBeInTheDocument()
    await click(screen.getByTestId('signature-resign-scorer'))
    await click(screen.getByRole('button', { name: 'draw' }))
    await waitFor(async () => expect((await row()).scorerSignature).toBe('data:image/png;base64,SIG'))
    expect((await row()).signatureSources.scorerSignature).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('signed-on-phone-scorer')).toBeNull())
  })

  it('Clear empties the image AND its phone record, then the pad offers the phone again', async () => {
    await seed({
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', ref1Signature: 'data:r1',
      signatureSources: { ref1Signature: { via: 'phone', transport: 'cloud', at: '2026-07-12T10:00:00.000Z' } }
    })
    renderMatchEnd()
    await click(await screen.findByTestId('signature-clear-ref1'))
    await waitFor(async () => expect((await row()).ref1Signature).toBeNull())
    expect((await row()).signatureSources.ref1Signature).toBeNull()
    await waitFor(() => expect(pad.phone).toMatchObject({ slot: 'ref1', locked: false }))
  })

  it('the officials\' pads get their slot, the relay key, the game PIN and the beach context', async () => {
    await seed({ officials: TWO_OFFICIALS, team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s' })
    renderMatchEnd()
    await click(await screen.findByRole('button', { name: /^1st referee · Tap to sign/ }))
    expect(pad.phone).toMatchObject({
      slot: 'ref1',
      matchKey: 'seed-1',
      gamePin: '482913',
      locked: false,
      context: { home: 'Müller / Weber', away: 'Rossi / Bianchi', matchNo: '31', name: 'Anna Ref' }
    })
    expect(pad.phone.context.teamSide).toBeUndefined()
  })

  it('locked while the pad is open: the phone is locked and a late phone result is not written', async () => {
    await seed({ officials: TWO_OFFICIALS, team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s' })
    renderMatchEnd()
    await click(await screen.findByRole('button', { name: /^1st referee · Tap to sign/ }))
    expect(pad.phone.locked).toBe(false)
    await act(async () => { await db.matches.update(matchId, { approved: true }) })
    await waitFor(() => expect(pad.phone.locked).toBe(true))
    expect(pad.phone.lockedReason).toBe('Match approved or closed: signatures can no longer change')
    await click(screen.getByRole('button', { name: 'phone' }))
    expect((await row()).ref1Signature).toBeFalsy()
  })

  it('the next box tapped while the last signature is still being queued: its pad stays open', async () => {
    await seed()
    renderMatchEnd()
    // the signature is on the match row (the next box opens) but its sync job
    // is not queued yet: a slow tablet. The save then closed the pad that was
    // open by then, the next one (a full-suite run, 2026-10-08)
    let release
    const gate = new Promise(r => { release = r })
    const add = db.sync_queue.add.bind(db.sync_queue)
    const spy = vi.spyOn(db.sync_queue, 'add').mockImplementationOnce(async (job) => { await gate; return add(job) })
    await signBox(/Captain A/.source)
    await waitFor(async () => expect((await row()).team1PostGameCaptainSignature).toBe('data:image/png;base64,PHONE'))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Captain B.* · Tap to sign/ })).toBeEnabled())
    await click(screen.getByRole('button', { name: /^Captain B.* · Tap to sign/ }))
    expect(screen.getByRole('dialog', { name: /^pad Captain B/ })).toBeInTheDocument()
    await act(async () => { release() })
    await waitFor(async () => expect(await signatureJobs()).toHaveLength(1))
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(screen.getByRole('dialog', { name: /^pad Captain B/ })).toBeInTheDocument()
    spy.mockRestore()
  })

  it('"Reopen last set" forgets the phone records of the post-match signatures, not the pre-match ones', async () => {
    await seed({
      team1CaptainSignature: 'data:pre', scorerSignature: 'data:s', team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2',
      signatureSources: {
        scorerSignature: { via: 'phone', transport: 'cloud', at: 'x' },
        team1CaptainSignature: { via: 'phone', transport: 'lan', at: 'y' }
      }
    })
    renderMatchEnd()
    await click(await screen.findByRole('button', { name: 'Reopen last set' }))
    await click(await screen.findByTestId('confirm-accept'))
    await waitFor(async () => expect((await row()).status).toBe('live'))
    const r = await row()
    expect(r.signatureSources.scorerSignature).toBeNull()
    expect(r.signatureSources.team1CaptainSignature).toMatchObject({ via: 'phone' })
  })
})
