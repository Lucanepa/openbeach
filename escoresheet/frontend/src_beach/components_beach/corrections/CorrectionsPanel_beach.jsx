// Beach corrections: one panel for the match (mode 'live', in the
// scoreboard's "Manual changes") and the match end (mode 'review', in Edit
// match). It speaks the scoresheet, never the event log: cards in scoresheet
// order, each with an obvious "+ Add …", every row a sentence, every change
// planned (utils_beach/corrections_beach), previewed, confirmed and written
// in one transaction (utils_beach/applyCorrectionPlan_beach).
//
// Ported from OpenVolley src/components/corrections/CorrectionsPanel.jsx
// (cb3f2029) for beach: no line-up, substitution or libero cards; the
// sanctions of the beach scale; sets to 21 / 15. The live score buttons
// (missed point, wrong team, sides, first serve) stay on the scoreboard.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Pencil } from 'lucide-react'
import { db as appDb } from '../../db_beach/db_beach'
import { cn } from '../../ui/volleyui/cn.js'
import { Button } from '../../ui/volleyui/Button.jsx'
import { Banner } from '../../ui/volleyui/Banner.jsx'
import { Chip } from '../../ui/volleyui/Chip.jsx'
import { Switch } from '../../ui/volleyui/Switch.jsx'
import { SegmentedControl } from '../../ui/volleyui/SegmentedControl.jsx'
import { confirmDialog, toast } from '../../ui/volleyui/uiStore.js'
import {
  describeEvent, compareBySeq, tr, formatScore, setLabel, tsMs, scoreBeforeEvent,
  planRemoveTimeout, planRemoveSanction, planRemoveGroup, planRemoveRemark, errorText, describeRemoval,
  isRemovableEntry, awardsPoint, playedSets
} from '../../utils_beach/corrections_beach'
import { scoreFromPointEvents } from '../../utils_beach/scorerCorrections_beach'
import { applyCorrectionPlan } from '../../utils_beach/applyCorrectionPlan_beach'
import { useConfirmAction } from '../../hooks_beach/useConfirmAction_beach'
import { SectionCard, EmptyLine, TeamDot, HIT } from './shared_beach.jsx'
import { TimeoutForm, SanctionForm, RemarkForm, SetTimesForm, FinalScoreForm } from './forms_beach.jsx'

function AddButton({ children, onClick }) {
  return (
    <Button variant="dark" size="md" icon={Plus} className={HIT} onClick={onClick}>
      {children}
    </Button>
  )
}

/** One row: the sentence, its paper code, Edit and Remove. */
function EventRow({ d, onEdit, onRemove, readOnly, t }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <TeamDot color={d.team?.color} size={12} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-stone-900">{d.title}</span>
          {d.team && <span className="text-sm text-stone-600">· {d.team.name} ({d.team.letter})</span>}
          {d.code && <code className="rounded border border-stone-300 bg-stone-50 px-1.5 py-px font-mono text-[11px] text-stone-700" title={tr(t, 'corrections.chip.paperCode', 'As written on the scoresheet')}>{d.code}</code>}
        </div>
        {d.meta && <div className="mt-0.5 text-xs text-stone-500 tabular-nums">{d.meta}</div>}
      </div>
      {!readOnly && onEdit && (
        <Button variant="secondary" size="md" icon={Pencil} className={HIT} onClick={onEdit} aria-label={tr(t, 'corrections.action.editWhat', 'Edit {{what}}', { what: d.title })}>
          <span className="hidden sm:inline">{tr(t, 'corrections.action.edit', 'Edit')}</span>
        </Button>
      )}
      {!readOnly && onRemove && (
        <Button variant="danger-soft" size="md" icon={X} className={cn(HIT, 'w-9 px-0')} onClick={onRemove} aria-label={tr(t, 'corrections.action.removeEntry', 'Remove {{what}}', { what: d.title })} />
      )}
    </li>
  )
}

function clock(ts) {
  const ms = tsMs(ts)
  if (!ms) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The correction log (match.manualChanges), read-only and shown to the referee. */
export function CorrectionLog({ changes, ctx }) {
  const t = ctx.t
  const list = [...(changes || [])].reverse()
  const textOf = (c) => {
    if (c?.text) return String(c.text)
    const desc = typeof c?.description === 'string' ? c.description.trim() : ''
    if (desc && !/[{}[\]]/.test(desc)) return desc.replace(/_+/g, ' ')
    return [c?.category, c?.field].filter(Boolean).map(s => String(s).replace(/_+/g, ' ')).join(': ') || tr(t, 'corrections.log.unknown', 'Correction')
  }
  return (
    <SectionCard title={tr(t, 'corrections.section.log', 'Correction log (shown to the referee)')} count={list.length}>
      {list.length === 0 ? (
        <EmptyLine>{tr(t, 'corrections.empty.log', 'No corrections yet.')}</EmptyLine>
      ) : (
        <ol className="divide-y divide-stone-100">
          {list.map((c, i) => (
            <li key={`${c.ts}-${i}`} className="flex gap-3 py-2 text-sm">
              <time className="w-11 shrink-0 tabular-nums text-xs text-stone-500 pt-0.5" dateTime={c.ts}>{clock(c.ts)}</time>
              <span className="min-w-0 text-stone-800">{textOf(c)}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}

// Entries the scoreboard writes by itself; hidden unless asked for
const AUTOMATIC = ['rally_start', 'set_start', 'between_sets_setup_confirmed']

/** Advanced: the full event log, collapsed, in words; Remove takes the whole group. */
export function EventLogAdvanced({ events, filterSet, ctx, readOnly, onRemove }) {
  const t = ctx.t
  const [open, setOpen] = useState(false)
  const [showAuto, setShowAuto] = useState(false)
  const rows = useMemo(() => {
    if (!open) return []
    return [...(events || [])]
      .filter(e => filterSet === 'all' || (e.setIndex ?? 1) === Number(filterSet))
      .filter(e => showAuto || !AUTOMATIC.includes(e.type))
      .sort(compareBySeq)
      .map(e => ({ e, d: describeEvent(e, events, ctx) }))
  }, [open, events, filterSet, showAuto, ctx])
  return (
    <details className="ov-kit rounded-2xl border border-stone-200/70 bg-white shadow-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer select-none list-none px-4 py-3.5 text-sm font-semibold text-stone-700 flex items-center justify-between min-h-11">
        <span>{tr(t, 'corrections.section.advanced', 'Advanced: event log')}</span>
        <span aria-hidden="true" className="text-stone-400 text-xs">{open ? '▲' : '▼'}</span>
      </summary>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-stone-500 mb-3">
            {tr(t, 'corrections.hint.advanced', 'Every entry of the match log. Removing an entry removes everything that belongs to it. Use the cards above to add or change entries.')}
          </p>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span id="ob-corr-auto" className="text-sm text-stone-700">{tr(t, 'corrections.action.showAutomatic', 'Show automatic entries')}</span>
            <Switch checked={showAuto} onCheckedChange={setShowAuto} aria-labelledby="ob-corr-auto" />
          </div>
          <ol className="divide-y divide-stone-100">
            {rows.map(({ e, d }) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="w-12 shrink-0 font-mono text-[11px] text-stone-400 tabular-nums">{e.seq}</span>
                <span className="w-10 shrink-0 text-xs text-stone-500 tabular-nums">{clock(e.ts)}</span>
                <span className="min-w-0 flex-1 text-sm text-stone-800">
                  {d.title}
                  {d.team && <span className="text-stone-500"> · {d.team.name} ({d.team.letter})</span>}
                </span>
                <span className="shrink-0 text-xs text-stone-500 tabular-nums">{formatScore(scoreBeforeEvent(events, e), null, ctx)}</span>
                {!readOnly && isRemovableEntry(e) && (
                  <Button
                    variant="danger-soft"
                    size="sm"
                    icon={X}
                    className={`${HIT} w-8 px-0`}
                    onClick={() => onRemove(e)}
                    aria-label={tr(t, 'corrections.action.removeEntry', 'Remove {{what}}', { what: d.title })}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </details>
  )
}

/**
 * @param {object} props
 * @param {'live'|'review'} props.mode
 * @param {number} props.matchId
 * @param {Array} props.events  the match's events
 * @param {object} props.match
 * @param {Array} props.sets
 * @param {object} [props.team1Team] / team2Team  team rows (name, colour)
 * @param {Array} [props.team1Players] / team2Players
 * @param {number|null} [props.liveSetIndex]  the set being played (live)
 * @param {boolean} [props.readOnly]  an approved match
 * @param {object} [props.hooks]  notifyScoresheetUpdate / syncToReferee / syncLiveState / afterApply
 * @param {object} [props.db]  the database (tests)
 */
export default function CorrectionsPanel({
  mode = 'review',
  matchId,
  events,
  match,
  sets,
  team1Team = null,
  team2Team = null,
  team1Players = [],
  team2Players = [],
  liveSetIndex = null,
  readOnly = false,
  hooks = {},
  db = appDb
}) {
  const { t } = useTranslation()
  const live = mode === 'live'
  const hasCoach = useMemo(() => ({ team1: !!match?.team1Coach || !!team1Team?.coach, team2: !!match?.team2Coach || !!team2Team?.coach }), [match, team1Team, team2Team])
  const ctx = useMemo(() => ({ t, match, team1Team, team2Team, matchId, mode, liveSetIndex, hasCoach }), [t, match, team1Team, team2Team, matchId, mode, liveSetIndex, hasCoach])
  const sorted = useMemo(() => [...(events || [])].sort(compareBySeq), [events])
  const played = useMemo(() => playedSets(sets), [sets])
  const [filter, setFilter] = useState(live && liveSetIndex ? String(liveSetIndex) : 'all')
  const [form, setForm] = useState(null) // { kind, editEvent?, setRow?, line?, index? }
  const [busy, setBusy] = useState(false)
  const [signaturesCleared, setSignaturesCleared] = useState(false)
  const players = useMemo(() => ({ team1: team1Players || [], team2: team2Players || [] }), [team1Players, team2Players])

  const inFilter = (e) => filter === 'all' || (e.setIndex ?? 1) === Number(filter)
  const rowsOf = (pred) => sorted.filter(e => pred(e) && inFilter(e)).map(e => ({ e, d: describeEvent(e, sorted, ctx) }))
  const timeouts = rowsOf(e => e.type === 'timeout')
  const sanctions = rowsOf(e => e.type === 'sanction')
  const remarkLines = String(match?.remarks || '').split('\n').map((line, index) => ({ line, index })).filter(r => r.line.trim())
  const presetSet = filter === 'all' ? null : Number(filter)

  // Every write goes through useConfirmAction: one write at a time, so a
  // double tap on a Confirm writes once
  const runConfirm = useConfirmAction((err) => {
    console.error('[corrections] write failed', err)
    toast.error(tr(t, 'corrections.saveError', 'The correction could not be saved: {{message}}', { message: err?.message || '' }))
  })

  const apply = async (plan) => {
    if (!plan || plan.error) return false
    let saved = false
    await runConfirm(async () => {
      setBusy(true)
      try {
        const res = await applyCorrectionPlan(plan, { matchId, db, mode, hooks })
        if (res.signaturesCleared) setSignaturesCleared(true)
        await hooks.afterApply?.(res, plan)
        toast.success(plan.log?.text || tr(t, 'corrections.saved', 'Correction saved'))
        setForm(null)
        saved = true
      } finally {
        setBusy(false)
      }
    })
    return saved
  }

  const confirmAndApply = async (plan, { title, lines = [] }) => {
    if (plan.error) { toast.error(errorText(plan, t)); return }
    const ok = await confirmDialog({
      title,
      message: (
        <div className="space-y-1.5 text-sm">
          {lines.map((l, i) => <p key={i}>{l}</p>)}
          {(plan.notes || []).map((n, i) => <p key={`n${i}`} className="text-amber-800">{tr(t, n.key, n.text, n.params)}</p>)}
        </div>
      ),
      confirmLabel: tr(t, 'corrections.action.remove', 'Remove'),
      cancelLabel: tr(t, 'corrections.action.cancel', 'Cancel'),
      tone: 'danger'
    })
    if (ok) await apply(plan)
  }

  const removeEvent = async (ev) => {
    const d = describeEvent(ev, sorted, ctx)
    const title = tr(t, 'corrections.confirm.removeTitle', 'Remove this entry?')
    if (ev.type === 'timeout') {
      return confirmAndApply(planRemoveTimeout(sorted, ev.id, ctx), {
        title,
        lines: [d.text, tr(t, 'corrections.confirm.timeoutFree', '{{team}} can take its time-out of set {{set}} again.', { team: d.team?.name, set: ev.setIndex ?? 1 })]
      })
    }
    if (ev.type === 'sanction') {
      let plan = planRemoveSanction(sorted, ev.id, {}, ctx)
      if (awardsPoint(ev.payload?.type) && live) {
        const withPoint = planRemoveSanction(sorted, ev.id, { removePoint: true }, ctx)
        if (!withPoint.error) {
          const both = await confirmDialog({
            title: tr(t, 'corrections.confirm.removePointTitle', 'Remove the penalty point too?'),
            message: tr(t, 'corrections.confirm.removePoint', 'The point it gave is still the last point of this set. Remove it as well (as Undo would)?'),
            confirmLabel: tr(t, 'corrections.action.removeBoth', 'Remove the point too'),
            cancelLabel: tr(t, 'corrections.action.keepPoint', 'Keep the point')
          })
          if (both) plan = withPoint
        }
      }
      return confirmAndApply(plan, { title, lines: [d.text] })
    }
    const plan = planRemoveGroup(sorted, ev.id, ctx)
    if (plan.error) { toast.error(errorText(plan, t)); return }
    return confirmAndApply(plan, { title, lines: [tr(t, 'corrections.confirm.removes', 'Removes:'), ...describeRemoval(sorted, plan, ctx)] })
  }

  const removeRemark = async ({ line, index }) => {
    const plan = planRemoveRemark(match?.remarks, index, ctx)
    const ok = await confirmDialog({
      title: tr(t, 'corrections.confirm.removeRemarkTitle', 'Remove this remark?'),
      message: line,
      confirmLabel: tr(t, 'corrections.action.remove', 'Remove'),
      cancelLabel: tr(t, 'corrections.action.cancel', 'Cancel'),
      tone: 'danger'
    })
    if (ok) await apply(plan)
  }

  // ── the form view (inline: never a modal over the modal) ──
  if (form) {
    const common = { ctx, events: sorted, sets, players, mode, liveSetIndex, busy, onCancel: () => setForm(null), onConfirm: apply }
    if (form.kind === 'timeout') return <TimeoutForm {...common} preset={{ setIndex: presetSet }} editEvent={form.editEvent} />
    if (form.kind === 'sanction') return <SanctionForm {...common} preset={{ setIndex: presetSet }} editEvent={form.editEvent} />
    if (form.kind === 'remark') return <RemarkForm {...common} match={match} editLine={form.line ?? null} editIndex={form.index ?? null} />
    if (form.kind === 'setTimes') return <SetTimesForm {...common} match={match} setRow={form.setRow} />
    if (form.kind === 'finalScore') return <FinalScoreForm {...common} setRow={form.setRow} />
  }

  const filterOptions = [
    { value: 'all', label: tr(t, 'corrections.allSets', 'All sets') },
    ...played.map(s => ({ value: String(s.index), label: setLabel(s.index, t) }))
  ]
  const finishedRows = played.filter(s => s.finished || sorted.some(e => e.type === 'set_end' && (e.setIndex ?? 1) === s.index))
  const editable = !readOnly

  return (
    <div className="ov-kit space-y-4">
      <div className="space-y-2">
        <div className="overflow-x-auto -mx-1 px-1">
          <SegmentedControl ariaLabel={tr(t, 'corrections.setFilter', 'Show set')} options={filterOptions} value={filter} onChange={setFilter} className="min-w-max" />
        </div>
        <p className="text-xs text-stone-500">{tr(t, 'corrections.help', 'Each correction is saved when you confirm it and is listed in the correction log for the referee.')}</p>
        {!match?.coinTossTeamA && <Chip tone="amber">{tr(t, 'corrections.chip.teamsNotSetBeach', 'Team A/B not set yet: team 1 is shown as A')}</Chip>}
      </div>

      {readOnly && <Banner tone="info">{tr(t, 'corrections.banner.readOnly', 'The match is approved: corrections are read-only.')}</Banner>}
      {signaturesCleared && (
        <Banner tone="warning">{tr(t, 'corrections.banner.signaturesCleared', 'Signatures were cleared because the sheet changed. Collect them again at the match end.')}</Banner>
      )}

      {/* 1. Set results */}
      <SectionCard title={tr(t, 'corrections.section.sets', 'Set results')}>
        {finishedRows.length === 0 ? (
          <EmptyLine>{tr(t, 'corrections.empty.sets', 'No finished set yet.')}</EmptyLine>
        ) : (
          <ul className="divide-y divide-stone-100">
            {finishedRows.filter(s => filter === 'all' || s.index === Number(filter)).map(s => {
              const sc = scoreFromPointEvents(sorted, s.index)
              return (
                <li key={s.id ?? s.index} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto text-sm">
                    <span className="font-semibold text-stone-900">{setLabel(s.index, t)}</span>
                    <span className="text-stone-800 tabular-nums"> · {formatScore({ team1: sc.team1Points, team2: sc.team2Points }, null, ctx)}</span>
                    {(s.startTime || s.endTime) && <span className="text-stone-500 tabular-nums"> · {clock(s.startTime) || '–'}–{clock(s.endTime) || '–'}</span>}
                  </div>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="md" className={HIT} onClick={() => setForm({ kind: 'finalScore', setRow: s })}>{tr(t, 'corrections.action.correctFinalScore', 'Correct final score')}</Button>
                      <Button variant="secondary" size="md" className={HIT} onClick={() => setForm({ kind: 'setTimes', setRow: s })}>{tr(t, 'corrections.action.setTimes', 'Set times')}</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {/* 2. Time-outs */}
      <SectionCard title={tr(t, 'corrections.section.timeouts', 'Time-outs')} count={timeouts.length}
        hint={tr(t, 'corrections.hint.timeoutsBeach', 'One time-out per team per set. The technical time-out is not corrected here.')}
        action={editable && <AddButton onClick={() => setForm({ kind: 'timeout' })}>{tr(t, 'corrections.add.timeout', 'Add time-out')}</AddButton>}>
        {timeouts.length === 0 ? <EmptyLine>{tr(t, 'corrections.empty.timeouts', 'No time-outs recorded.')}</EmptyLine> : (
          <ul className="divide-y divide-stone-100">
            {timeouts.map(({ e, d }) => <EventRow key={e.id} d={d} t={t} readOnly={!editable} onEdit={() => setForm({ kind: 'timeout', editEvent: e })} onRemove={() => removeEvent(e)} />)}
          </ul>
        )}
      </SectionCard>

      {/* 3. Sanctions */}
      <SectionCard title={tr(t, 'corrections.section.sanctions', 'Sanctions')} count={sanctions.length}
        action={editable && <AddButton onClick={() => setForm({ kind: 'sanction' })}>{tr(t, 'corrections.add.sanction', 'Add sanction')}</AddButton>}>
        {sanctions.length === 0 ? <EmptyLine>{tr(t, 'corrections.empty.sanctions', 'No sanctions recorded.')}</EmptyLine> : (
          <ul className="divide-y divide-stone-100">
            {sanctions.map(({ e, d }) => {
              const forfeit = e.payload?.type === 'expulsion' || e.payload?.type === 'disqualification'
              return <EventRow key={e.id} d={d} t={t} readOnly={!editable} onEdit={forfeit ? undefined : () => setForm({ kind: 'sanction', editEvent: e })} onRemove={forfeit ? undefined : () => removeEvent(e)} />
            })}
          </ul>
        )}
      </SectionCard>

      {/* 4. Remarks */}
      <SectionCard title={tr(t, 'corrections.term.remarks', 'Remarks')} count={remarkLines.length}
        action={editable && <AddButton onClick={() => setForm({ kind: 'remark' })}>{tr(t, 'corrections.add.remark', 'Add remark')}</AddButton>}>
        {remarkLines.length === 0 ? <EmptyLine>{tr(t, 'corrections.empty.remarks', 'No remarks.')}</EmptyLine> : (
          <ul className="divide-y divide-stone-100">
            {remarkLines.map(r => (
              <li key={r.index} className="flex items-start gap-3 py-2.5">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-stone-800">{r.line}</p>
                {editable && (
                  <>
                    <Button variant="secondary" size="md" icon={Pencil} className={HIT} onClick={() => setForm({ kind: 'remark', line: r.line, index: r.index })} aria-label={tr(t, 'corrections.action.editRemark', 'Edit remark')}>
                      <span className="hidden sm:inline">{tr(t, 'corrections.action.edit', 'Edit')}</span>
                    </Button>
                    <Button variant="danger-soft" size="md" icon={X} className={cn(HIT, 'w-9 px-0')} onClick={() => removeRemark(r)} aria-label={tr(t, 'corrections.action.removeRemark', 'Remove remark')} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 5. Correction log */}
      <CorrectionLog changes={match?.manualChanges} ctx={ctx} />

      {/* 6. Advanced: event log */}
      <EventLogAdvanced events={sorted} filterSet={filter} ctx={ctx} readOnly={!editable} onRemove={removeEvent} />
    </div>
  )
}
