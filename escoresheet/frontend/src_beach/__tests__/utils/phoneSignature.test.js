/**
 * Sign on phone, the pure app side (utils_beach/phoneSignature_beach.js,
 * ported from OpenVolley d451686d): the relays' stroke rules (their shared
 * vectors), fitting and drawing like SignaturePad, the PNG, the context of
 * each slot with OpenBeach's team1 / team2, and the "signed on phone" records.
 */
import { describe, it, expect } from 'vitest'
import vectors from '../fixtures/signStrokeVectors.json'
import {
  validateStrokes, fitTransform, drawStrokes, phoneSignatureDataUrl, phoneSignContext, signatureSourceUpdate,
  signatureSource, signedOnPhone, approvalSignatureSources, SLOT_OF_ROLE, displayWhen
} from '../../utils_beach/phoneSignature_beach'
import { signatureFieldOfRole } from '../../utils_beach/signatures_beach'

/** A 2D context that records what is done to it. */
function recordingContext() {
  const calls = []
  const props = {}
  const ctx = new Proxy({}, {
    get: (_, k) => (k in props ? props[k] : (...args) => { calls.push([k, ...args]) }),
    set: (_, k, v) => { props[k] = v; calls.push(['set', k, v]); return true }
  })
  return { ctx, calls, props }
}

describe('validateStrokes', () => {
  it('agrees with every shared stroke vector of the relays', () => {
    expect(vectors.strokes.length).toBeGreaterThan(10)
    for (const v of vectors.strokes) {
      const r = validateStrokes(v.pad, v.strokes)
      expect(r.ok, v.name).toBe(!!v.ok)
      if (v.error) expect(r.code, v.name).toBe(v.error)
    }
  })
})

describe('fitTransform', () => {
  const pad = { w: 4000, h: 2000 }
  it('contains and centres with a 4 % margin, keeping the aspect', () => {
    const wide = fitTransform(pad, [[0, 1000, 3840, 1000]])
    expect(wide.scale).toBeCloseTo(600 / (3840 + 320))
    expect(0 * wide.scale + wide.dx).toBeCloseTo(160 * wide.scale)
    expect(1000 * wide.scale + wide.dy).toBeCloseTo(100)
    const tall = fitTransform(pad, [[2000, 0, 2000, 1680]])
    expect(tall.scale).toBeCloseTo(200 / (1680 + 320))
    expect(2000 * tall.scale + tall.dx).toBeCloseTo(300)
  })
})

describe('drawStrokes and the PNG', () => {
  it('draws like SignaturePad: black 4 px round pen, moveTo / lineTo, then stroke; a tap is a dot', () => {
    const { ctx, calls, props } = recordingContext()
    drawStrokes(ctx, { w: 4000, h: 2000 }, [[0, 1000, 300, 1000, 600, 1100], [50, 50]])
    expect(props).toMatchObject({ strokeStyle: '#000000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' })
    const ops = calls.filter((c) => c[0] !== 'set').map((c) => c[0])
    expect(ops).toEqual(['beginPath', 'moveTo', 'lineTo', 'lineTo', 'stroke', 'beginPath', 'arc', 'fill'])
  })

  it('is a 1200 x 400 transparent PNG data URL drawn at scale 2', () => {
    const { ctx, calls } = recordingContext()
    const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: (type) => `data:${type};base64,AAAA` }
    const url = phoneSignatureDataUrl({ w: 4000, h: 2000 }, [[0, 1000, 300, 1000]], { createCanvas: () => canvas })
    expect(url).toBe('data:image/png;base64,AAAA')
    expect([canvas.width, canvas.height]).toEqual([1200, 400])
    expect(calls.find((c) => c[0] === 'scale')).toEqual(['scale', 2, 2])
  })
})

describe('phoneSignContext (beach)', () => {
  const match = {
    gameNumber: 31, scheduledAt: '2026-07-12T10:15:00.000Z', coinTossTeamA: 'team2',
    officials: [{ role: 'scorer', firstName: 'Sam', lastName: 'Scorer' }, { role: '1st referee', firstName: 'Anna', lastName: 'Muster' }]
  }
  const base = {
    match,
    team1: { name: 'Muster / Meier' },
    team2: 'Rossi / Bianchi',
    team1Captain: { number: 1, firstName: 'Lea', lastName: 'Muster' },
    team2Captain: { number: 2, firstName: 'Mia', lastName: 'Bianchi' },
    lang: 'de-CH'
  }

  it('the two teams as the relays\' home / away (team 1 is home)', () => {
    const ctx = phoneSignContext({ ...base, slot: 'scorer' })
    expect(ctx).toMatchObject({ home: 'Muster / Meier', away: 'Rossi / Bianchi', matchNo: '31', name: 'Sam Scorer', lang: 'de-CH' })
    expect(ctx.when).toBe(displayWhen(match.scheduledAt))
  })

  it('captains A / B follow the coin toss (team A = team 2 here)', () => {
    expect(phoneSignContext({ ...base, slot: 'captain-a' })).toMatchObject({ teamSide: 'away', teamLabel: 'A', name: '#2 Mia Bianchi' })
    expect(phoneSignContext({ ...base, slot: 'captain-b' })).toMatchObject({ teamSide: 'home', teamLabel: 'B', name: '#1 Lea Muster' })
  })

  it('the coin toss pads name their team; before the toss there is no letter', () => {
    const noToss = { ...base, match: { ...match, coinTossTeamA: null } }
    expect(phoneSignContext({ ...noToss, slot: SLOT_OF_ROLE['team1-captain'] })).toMatchObject({ teamSide: 'home', name: '#1 Lea Muster' })
    expect(phoneSignContext({ ...noToss, slot: SLOT_OF_ROLE['team2-captain'] }).teamLabel).toBeUndefined()
    expect(phoneSignContext({ ...base, slot: SLOT_OF_ROLE['team2-coach'], team2Coach: { firstName: 'Cora', lastName: 'Coach' } }))
      .toMatchObject({ teamSide: 'away', teamLabel: 'A', name: 'Cora Coach' })
  })

  it('falls back to the given team names and drops an unknown language', () => {
    expect(phoneSignContext({ match: {}, slot: 'ref1', lang: 'es', fallbackTeam1: 'Team 1', fallbackTeam2: 'Team 2' }))
      .toEqual({ home: 'Team 1', away: 'Team 2' })
  })

  it('every role maps to a slot the relays know, and every coin toss pad to its match field', () => {
    for (const slot of Object.values(SLOT_OF_ROLE)) {
      expect(['captain-a', 'captain-b', 'asst-scorer', 'scorer', 'ref2', 'ref1', 'coach-home', 'coach-away', 'captain-home', 'captain-away', 'captain-post-home', 'captain-post-away']).toContain(slot)
    }
    for (const role of ['team1-captain', 'team2-captain', 'team1-coach', 'team2-coach']) {
      expect(SLOT_OF_ROLE[role]).toBeTruthy()
      expect(signatureFieldOfRole(role)).toBeTruthy()
    }
  })
})

describe('"signed on phone" records', () => {
  const at = () => '2026-07-12T12:00:00.000Z'
  it('the source goes by key path beside the image; drawn or none says nothing', () => {
    expect(signatureSourceUpdate('ref1Signature', 'data:x', { source: 'phone', transport: 'lan' }, at)).toEqual({
      'signatureSources.ref1Signature': { via: 'phone', transport: 'lan', at: '2026-07-12T12:00:00.000Z' }
    })
    expect(signatureSourceUpdate('ref1Signature', 'data:x', { source: 'device' }, at)['signatureSources.ref1Signature']).toBeNull()
    expect(signatureSourceUpdate('ref1Signature', 'data:x', undefined, at)['signatureSources.ref1Signature']).toBeNull()
    expect(signatureSource(null, { source: 'phone' }, at)).toBeNull()
  })

  it('signedOnPhone and the approval summary (A / B by the coin toss)', () => {
    const match = {
      coinTossTeamA: 'team2',
      team1PostGameCaptainSignature: 'data:1', team2PostGameCaptainSignature: 'data:2', scorerSignature: 'data:s', ref1Signature: 'data:r1',
      signatureSources: { team2PostGameCaptainSignature: { via: 'phone', transport: 'cloud' }, scorerSignature: null }
    }
    expect(signedOnPhone(match, 'team2PostGameCaptainSignature')).toBe(true)
    expect(signedOnPhone(match, 'scorerSignature')).toBe(false)
    expect(approvalSignatureSources(match)).toEqual({ captainA: 'phone', captainB: 'device', scorer: 'device', asstScorer: null, ref1: 'device', ref2: null })
  })
})
