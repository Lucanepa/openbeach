// The guided beach correction forms: fields, then the live preview of what
// changes on the scoresheet, then Cancel / Confirm. Every form only PLANS
// (utils_beach/corrections_beach); the panel writes the confirmed plan.
// Ported from OpenVolley src/components/corrections/forms.jsx (cb3f2029)
// for beach: no substitution form, the sanctions of the beach scale, the
// players of a team of two.
import { useMemo, useState } from 'react'
import { Textarea } from '../../ui/volleyui/Textarea.jsx'
import { TimeField } from '../../ui/volleyui/DateField.jsx'
import {
  scoreTimeline, applyPlanToEvents, planAddTimeout, planAddSanction, planEditEvent, planSetTimes,
  planAdjustFinalScore, planRemark, scoreBeforeEvent, tr, formatScore, teamLabel, teamLetter,
  sanctionLabel, isTeamSanctionType, awardsPoint, otherTeam, playedSets, ADDABLE_SANCTIONS
} from '../../utils_beach/corrections_beach'
import { scoreFromPointEvents } from '../../utils_beach/scorerCorrections_beach'
import { CorrectionForm, SetPicker, TeamPicker, ScoreAtPicker, PlayerPicker, FieldGroup, ChoiceButton } from './shared_beach.jsx'

const setOf = (e) => e?.setIndex ?? 1

/** The timeline index holding an existing event (the score before it). */
function indexOfEvent(timeline, events, ev) {
  if (!ev) return null
  const s = scoreBeforeEvent(events, ev)
  const i = timeline.findIndex(x => x.team1 === s.team1 && x.team2 === s.team2)
  return i >= 0 ? i : null
}

/** Shared state of every "at a score" form: set, timeline, chosen score. */
function useScoreChoice({ events, mode, liveSetIndex, preset, editEvent }) {
  const initialSet = editEvent ? setOf(editEvent) : (preset?.setIndex ?? (mode === 'live' ? liveSetIndex : null))
  const [setIndex, setSetIndex] = useState(initialSet ?? null)
  const timeline = useMemo(() => (setIndex ? scoreTimeline(events, setIndex) : []), [events, setIndex])
  const defaultAt = (tl, idx) => {
    if (editEvent && idx === setOf(editEvent)) return indexOfEvent(tl, events, editEvent)
    if (!tl.length) return null
    return mode === 'live' && idx === liveSetIndex ? tl.length - 1 : 0
  }
  const [at, setAt] = useState(() => defaultAt(timeline, setIndex))
  const chooseSet = (idx) => {
    setSetIndex(idx)
    setAt(defaultAt(scoreTimeline(events, idx), idx))
  }
  const liveIdx = mode === 'live' && setIndex === liveSetIndex && timeline.length ? timeline.length - 1 : null
  return { setIndex, chooseSet, timeline, at, setAt, liveIdx }
}

// ─────────────────────────────── time-out ───────────────────────────────

export function TimeoutForm({ ctx, events, sets, mode, liveSetIndex, preset = {}, editEvent = null, busy, onCancel, onConfirm }) {
  const t = ctx.t
  const { setIndex, chooseSet, timeline, at, setAt, liveIdx } = useScoreChoice({ events, mode, liveSetIndex, preset, editEvent })
  const [team, setTeam] = useState(editEvent?.payload?.team ?? preset.team ?? null)
  const plan = useMemo(() => {
    if (!setIndex || !team || at == null) return null
    return editEvent
      ? planEditEvent(events, editEvent.id, { setIndex, team, at }, ctx)
      : planAddTimeout(events, { setIndex, team, at }, ctx)
  }, [events, setIndex, team, at, editEvent, ctx])
  const entry = timeline[at]
  return (
    <CorrectionForm
      title={editEvent ? tr(t, 'corrections.form.editTimeout', 'Edit time-out') : tr(t, 'corrections.form.addTimeout', 'Add time-out')}
      ctx={ctx}
      plan={plan}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      preview={plan && !plan.error && entry && (
        <p className="text-sm text-stone-700">
          {tr(t, 'corrections.preview.paperTimeout', '"T" at {{score}} in the time-out box of {{team}}, set {{set}}.', {
            score: formatScore(entry, team, ctx), team: teamLabel(team, ctx).name, set: setIndex
          })}
        </p>
      )}
    >
      <SetPicker sets={playedSets(sets)} value={setIndex} onChange={chooseSet} ctx={ctx} />
      <TeamPicker value={team} onChange={setTeam} ctx={ctx} />
      {setIndex && <ScoreAtPicker timeline={timeline} value={at} onChange={setAt} team={team} ctx={ctx} kind="timeout" liveIdx={liveIdx} />}
    </CorrectionForm>
  )
}

// ─────────────────────────────── sanction ───────────────────────────────

// The beach scoresheet's sanction boxes
const PAPER_CODE = { improper_request: 'IR', delay_warning: 'DW', delay_penalty: 'DP', warning: 'W', penalty: 'P' }

export function SanctionForm({ ctx, events, sets, players, mode, liveSetIndex, preset = {}, editEvent = null, busy, onCancel, onConfirm }) {
  const t = ctx.t
  const { setIndex, chooseSet, timeline, at, setAt, liveIdx } = useScoreChoice({ events, mode, liveSetIndex, preset, editEvent })
  const p0 = editEvent?.payload || {}
  const [team, setTeam] = useState(p0.team ?? preset.team ?? null)
  const [type, setType] = useState(p0.type ?? null)
  const [who, setWho] = useState(p0.role === 'coach' ? 'coach' : 'player')
  const [number, setNumber] = useState(p0.playerNumber ?? null)
  const teamSanction = type && isTeamSanctionType(type)
  const roster = (team === 'team1' ? players?.team1 : team === 'team2' ? players?.team2 : null) || []
  const target = useMemo(() => (who === 'coach' ? { role: 'coach' } : { playerNumber: number }), [who, number])
  const plan = useMemo(() => {
    if (!setIndex || !team || !type || at == null) return null
    if (!teamSanction && who === 'player' && number == null) return null
    const values = { setIndex, team, type, target, at }
    return editEvent ? planEditEvent(events, editEvent.id, values, ctx) : planAddSanction(events, values, ctx)
  }, [events, setIndex, team, type, at, target, teamSanction, who, number, editEvent, ctx])
  const entry = timeline[at]
  const paper = !plan || plan.error || !entry ? null : tr(t, 'corrections.preview.paperSanctionBeach', '{{code}} · Team {{letter}} · Set {{set}} · {{score}}', {
    code: PAPER_CODE[type] || '?',
    letter: teamLetter(team, ctx.match),
    set: setIndex,
    score: formatScore(entry, team, ctx)
  })
  const hasCoach = !!ctx.hasCoach?.[team]
  return (
    <CorrectionForm
      title={editEvent ? tr(t, 'corrections.form.editSanction', 'Edit sanction') : tr(t, 'corrections.form.addSanction', 'Add sanction')}
      ctx={ctx}
      plan={plan}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      preview={paper && <p className="text-sm text-stone-700">{paper}</p>}
    >
      <SetPicker sets={playedSets(sets)} value={setIndex} onChange={chooseSet} ctx={ctx} />
      <TeamPicker value={team} onChange={(v) => { setTeam(v); setNumber(null) }} ctx={ctx} />
      <FieldGroup
        label={tr(t, 'corrections.field.sanction', 'Sanction')}
        hint={tr(t, 'corrections.hint.forfeitSanctions', 'An expulsion or a disqualification is given on the scoreboard: it forfeits the set or the match.')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={tr(t, 'corrections.field.sanction', 'Sanction')}>
          {ADDABLE_SANCTIONS.map(s => (
            <ChoiceButton key={s} on={type === s} onClick={() => setType(s)} className="py-2 text-left flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-xs font-semibold">{PAPER_CODE[s]}</span>
              <span className="min-w-0 leading-tight">{sanctionLabel(s, t)}</span>
            </ChoiceButton>
          ))}
        </div>
      </FieldGroup>
      {setIndex && <ScoreAtPicker timeline={timeline} value={at} onChange={setAt} team={team} ctx={ctx} kind="sanction" liveIdx={liveIdx} />}
      {type && !teamSanction && team && hasCoach && (
        <FieldGroup label={tr(t, 'corrections.field.who', 'Who')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr(t, 'corrections.field.who', 'Who')}>
            {['player', 'coach'].map(w => (
              <ChoiceButton key={w} on={who === w} onClick={() => { setWho(w); setNumber(null) }}>
                {w === 'player' ? tr(t, 'corrections.who.player', 'Player') : tr(t, 'corrections.who.coach', 'Coach')}
              </ChoiceButton>
            ))}
          </div>
        </FieldGroup>
      )}
      {type && !teamSanction && team && who === 'player' && (
        <PlayerPicker ctx={ctx} label={tr(t, 'corrections.field.player', 'Player')} players={roster} value={number} onChange={setNumber} />
      )}
      {type && awardsPoint(type) && team && (
        <p className="text-xs text-stone-500">
          {tr(t, 'corrections.hint.penaltyPoint', 'The penalty point is {{team}}\'s next point after this score; it must already be recorded.', { team: teamLabel(otherTeam(team), ctx).name })}
        </p>
      )}
    </CorrectionForm>
  )
}

// ──────────────────────────────── remark ────────────────────────────────

/** + Add remark and Edit of one remark line. */
export function RemarkForm({ ctx, match, editLine = null, editIndex = null, busy, onCancel, onConfirm }) {
  const t = ctx.t
  const [text, setText] = useState(editLine ?? '')
  const plan = useMemo(() => {
    if (!text.trim()) return null
    return planRemark(match?.remarks, { text, index: editLine != null ? editIndex : null }, ctx)
  }, [text, editLine, editIndex, match?.remarks, ctx])
  return (
    <CorrectionForm
      title={editLine != null ? tr(t, 'corrections.form.editRemark', 'Edit remark') : tr(t, 'corrections.form.addRemark', 'Add remark')}
      ctx={ctx}
      plan={plan}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      preview={plan && !plan.error && <p className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-stone-800 ring-1 ring-stone-200">{text.trim()}</p>}
    >
      <div>
        <label htmlFor="ob-corr-remark" className="block text-sm font-medium text-stone-700 mb-1.5">{tr(t, 'corrections.field.text', 'Text')}</label>
        <Textarea id="ob-corr-remark" rows={4} prose value={text} onChange={(e) => setText(e.target.value)} />
      </div>
    </CorrectionForm>
  )
}

// ─────────────────────────────── set times ───────────────────────────────

function toClock(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function withClock(iso, clock, fallbackIso) {
  if (!/^\d{1,2}:\d{2}$/.test(clock || '')) return undefined
  const baseMs = Date.parse(iso || fallbackIso || '')
  const d = Number.isFinite(baseMs) ? new Date(baseMs) : new Date()
  const [h, m] = clock.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function SetTimesForm({ ctx, events, sets, setRow, match, busy, onCancel, onConfirm }) {
  const t = ctx.t
  const [start, setStart] = useState(toClock(setRow?.startTime))
  const [end, setEnd] = useState(toClock(setRow?.endTime))
  const startIso = withClock(setRow?.startTime, start, setRow?.endTime || match?.scheduledAt)
  const endIso = withClock(setRow?.endTime, end, setRow?.startTime || match?.scheduledAt)
  const plan = useMemo(() => {
    const changes = {}
    // Compared as the clock shows them: an untouched field is not a change
    if (startIso && start !== toClock(setRow?.startTime)) changes.startTime = startIso
    if (endIso && end !== toClock(setRow?.endTime)) changes.endTime = endIso
    if (!Object.keys(changes).length) return null
    return planSetTimes(events, sets, { setIndex: setRow.index, ...changes }, ctx)
  }, [start, end, startIso, endIso, setRow, events, sets, ctx])
  return (
    <CorrectionForm
      title={tr(t, 'corrections.form.setTimes', 'Set {{set}}: start and end time', { set: setRow?.index })}
      ctx={ctx}
      plan={plan}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      preview={plan && !plan.error && <p className="text-sm text-stone-700 tabular-nums">{`${start || '–'} – ${end || '–'}`}</p>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ob-corr-start" className="block text-sm font-medium text-stone-700 mb-1.5">{tr(t, 'corrections.field.startTime', 'Start')}</label>
          <TimeField id="ob-corr-start" size="lg" value={start} onChange={setStart} />
        </div>
        <div>
          <label htmlFor="ob-corr-end" className="block text-sm font-medium text-stone-700 mb-1.5">{tr(t, 'corrections.field.endTime', 'End')}</label>
          <TimeField id="ob-corr-end" size="lg" value={end} onChange={setEnd} />
        </div>
      </div>
    </CorrectionForm>
  )
}

// ───────────────────────────── final score ─────────────────────────────

export function FinalScoreForm({ ctx, events, sets, setRow, busy, onCancel, onConfirm }) {
  const t = ctx.t
  const [choice, setChoice] = useState(null) // 'team1:1' ...
  const cur = scoreFromPointEvents(events, setRow.index)
  const current = { team1: cur.team1Points, team2: cur.team2Points }
  const plan = useMemo(() => {
    if (!choice) return null
    const [team, d] = choice.split(':')
    return planAdjustFinalScore(events, sets, { setIndex: setRow.index, team, delta: Number(d) }, ctx)
  }, [choice, events, sets, setRow.index, ctx])
  const next = plan && !plan.error ? scoreFromPointEvents(applyPlanToEvents(events, plan), setRow.index) : null
  const aKey = ctx.match?.coinTossTeamA === 'team2' ? 'team2' : 'team1'
  const order = [aKey, otherTeam(aKey)]
  const title = tr(t, 'corrections.form.finalScore', 'Set {{set}}: correct final score', { set: setRow.index })
  return (
    <CorrectionForm
      title={title}
      ctx={ctx}
      plan={plan}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      preview={next && (
        <p className="text-sm text-stone-700">
          {tr(t, 'corrections.preview.finalScore', 'Final score {{before}} becomes {{after}}.', {
            before: formatScore(current, null, ctx),
            after: formatScore({ team1: next.team1Points, team2: next.team2Points }, null, ctx)
          })}
        </p>
      )}
    >
      <p className="text-sm text-stone-600">
        {tr(t, 'corrections.hint.finalScoreBeach', 'Only the end of the set can be corrected: a point added at the end, or the last point removed. Sets are won at 21 (the third at 15) with two points ahead.')}
      </p>
      <p className="text-sm font-semibold text-stone-900 tabular-nums">{tr(t, 'corrections.field.currentFinal', 'Now')}: {formatScore(current, null, ctx)}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={title}>
        {order.flatMap(team => [1, -1].map(d => {
          const key = `${team}:${d}`
          const lbl = teamLabel(team, ctx)
          return (
            <ChoiceButton key={key} on={choice === key} onClick={() => setChoice(key)} className="py-2 text-left">
              {d > 0
                ? tr(t, 'corrections.action.addPointFor', 'One point more for {{team}}', { team: `${lbl.name} (${lbl.letter})` })
                : tr(t, 'corrections.action.removePointFor', 'One point less for {{team}}', { team: `${lbl.name} (${lbl.letter})` })}
            </ChoiceButton>
          )
        }))}
      </div>
    </CorrectionForm>
  )
}

