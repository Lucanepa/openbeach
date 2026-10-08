// The PDF score sheet of the OpenBeach screencast match (2026-10-08, video
// 07:20-07:52). Each case is a field the sheet filled wrongly there.
import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { buildVideoMatch } from '../fixtures/obVideoMatch20261008'

let Sheet
beforeAll(async () => {
  Sheet = (await import('../../../scoresheet_pdf_beach/components_beach/eScoresheet_beach.tsx')).default
})

function fill(matchData = buildVideoMatch()) {
  let fields = null
  render(<Sheet matchData={matchData} onDataReady={(f) => { fields = f }} />)
  cleanup()
  if (!fields) throw new Error('the sheet never reported its fields')
  return fields
}

describe('score sheet PDF: the video match', () => {
  it('RESULTS: the set-3 time-out is team B\'s, and the totals add up', () => {
    const f = fill()
    expect(f.res_s3_to_b).toBe('1')
    expect(f.res_s3_to_a).toBe('0')
    expect(f.res_tot_to_b).toBe('1')
    expect(f.res_tot_to_a).toBe('0')
    // A left, B right: the points and wins match
    expect([f.res_s1_p_a, f.res_s1_p_b, f.res_s3_p_a, f.res_s3_p_b]).toEqual(['16', '21', '15', '12'])
  })

  it('RESULTS names its columns: A and B with the team names', () => {
    const f = fill()
    expect(f.res_label_a).toBe('A Schmidt / Fischer')
    expect(f.res_label_b).toBe('B Müller/Weber')
  })

  it('set 3: B #2\'s penalty (5:7) is in B\'s row, not in A #2\'s', () => {
    const f = fill()
    // set 3: B (team1) serves first, so B fills rows I and III; B #2 is row III
    expect(f.s3_r3_s1_a).toBe('5')
    expect(f.s3_r3_s1_b).toBe('7')
    expect(f.s3_r4_s1_a).toBeUndefined()
  })

  it('set 3 carry-over: A\'s delay warning and B\'s formal warning cross the right boxes', () => {
    const f = fill()
    // delay boxes: t1 = team1 (B), t2 = team2 (A)
    expect(f.s3_t2_ds_w_crossed).toBe('true')
    expect(f.s3_t1_ds_w_crossed).toBeUndefined()
    // formal warning: B is up in set 3 (rows I and III)
    expect(f.s3_r1_fw_crossed).toBe('true')
    expect(f.s3_r3_fw_crossed).toBe('true')
    expect(f.s3_r2_fw_crossed).toBeUndefined()
    expect(f.s3_r4_fw_crossed).toBeUndefined()
  })

  it('names keep their umlauts: "Müller", not "MüLler"', () => {
    const f = fill()
    expect(f.b_t1_p1_name).toBe('Müller Anna')
  })

  it('the team name without the country baked into it (the country is its own box)', () => {
    const f = fill()
    expect(f.t1_name).toBe('Müller/Weber')
    expect(f.t1_country).toBe('CHE')
    // both teams are Swiss: the sets name the teams, not "CHE"
    expect(f.s1_t1_team_label).toBe('Müller/Weber')
    expect(f.s1_t2_team_label).toBe('Schmidt / Fischer')
  })

  it('the team colours come from the match, and the label text stays readable (dark)', () => {
    const f = fill()
    expect(f.s1_t2_team_color).toBe('#facc15')
    expect(f.s1_t1_team_color).toBe('#111111')
  })

  it('Medical Assistance chart: B #2 MTO in team B\'s row, with the team name', () => {
    const f = fill()
    expect(f.ma_side_1).toBe('A')
    expect(f.ma_side_2).toBe('B')
    expect(f.ma_name_2).toBe('Müller/Weber')
    expect(f.ma_no_3).toBe('2')
    expect(f.ma_mto_b_3).toBe(true)
    expect(f.ma_mto_b_1).toBeUndefined()
  })

  it('remarks: the MTO line (rule 26.2.2.7)', () => {
    const f = fill()
    expect(f.remarks).toContain('3rd Set, Score: 6:9')
    expect(f.remarks).toContain('Player: #2 Weber, Team B (Müller/Weber)')
    expect(f.remarks).toContain('"Medical Time Out" (Blood), End Time:')
    expect(f.remarks).toContain('Duration: 00:03:12, Recovered')
  })

  it('a set start before its end by months (old default) leaves the durations blank', () => {
    const f = fill()
    expect(f.res_s1_dur ?? '').toBe('')
    expect(f.res_s2_dur).toBe('15')
    expect(f.res_tot_dur ?? '').toBe('')
    expect(f.match_dur_h ?? '').toBe('')
  })

  it('an end before the start is never a duration', () => {
    const data = buildVideoMatch()
    data.sets[1].endTime = '2026-10-08T09:10:00.000Z' // before its start 09:16
    const f = fill(data)
    expect(f.res_s2_dur ?? '').toBe('')
  })

  it('improper request: A and B printed, team A\'s crossed (as in the app)', () => {
    const data = buildVideoMatch()
    data.events.push({ id: 999, seq: 999, type: 'sanction', setIndex: 3, ts: data.events.at(-1).ts, payload: { team: 'team2', type: 'improper_request' } })
    const { container } = render(<Sheet matchData={data} />)
    const a = container.querySelector('[data-improper="a"]')
    const b = container.querySelector('[data-improper="b"]')
    expect(a).toHaveTextContent('A')
    expect(b).toHaveTextContent('B')
    expect(a.dataset.crossed).toBe('true')
    expect(b.dataset.crossed).toBe('false')
    cleanup()
  })

  it('BMP form: the referee BMP outcome is printed (MUNAV for judgment impossible), empty rows stay plain', () => {
    const data = buildVideoMatch()
    const ts = data.events.find(e => e.setIndex === 3 && e.type === 'point').ts
    data.events.push(
      { id: 900, seq: 900, type: 'referee_bmp_request', setIndex: 3, ts, payload: { score: { team1: 1, team2: 0 }, servingTeam: 'team1' } },
      { id: 901, seq: 900.1, type: 'referee_bmp_outcome', setIndex: 3, ts, payload: { result: 'judgment_impossible', pointAwarded: false, newScore: { team1: 1, team2: 0 } } }
    )
    let f = null
    const { container } = render(<Sheet matchData={data} onDataReady={(x) => { f = x }} />)
    expect(f.bmp_0_request).toBe('Ref')
    expect(f.bmp_0_outcome).toBe('MUNAV')
    const used = container.querySelector('[data-bmp-outcome="0"]')
    const empty = container.querySelector('[data-bmp-outcome="5"]')
    expect(used).toHaveTextContent('MUNAV')
    expect(empty.textContent).toBe('')
    expect(empty.className).not.toMatch(/border-black/)
    cleanup()
  })

  it('the TEAMS box names the teams next to their country', () => {
    const { container } = render(<Sheet matchData={buildVideoMatch()} />)
    expect(container.querySelector('[data-teams-name="t1"]')).toHaveTextContent('Müller/Weber')
    expect(container.querySelector('[data-teams-name="t2"]')).toHaveTextContent('Schmidt / Fischer')
    cleanup()
  })
})
