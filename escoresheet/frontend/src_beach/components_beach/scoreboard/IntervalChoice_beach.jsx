import { useTranslation } from 'react-i18next'
import { ArrowLeftRight } from 'lucide-react'
import { deciders, serviceOrderOf } from '../../utils_beach/intervalChoice_beach'

/**
 * The choice of the interval before set 2 and before set 3 (rules in
 * utils_beach/intervalChoice_beach): who chooses and why, what they chose
 * (Side, or Serve or receive), then each team's pick with its own buttons.
 * The teams stay where they finished until a pick moves them. Shared by the
 * desktop panel and the phone layout (`compact`). A VIEW: the Scoreboard's
 * own handlers switch the sides and the serve.
 *
 * @param {object} props
 * @param {{ teamKey: 'team1'|'team2', reason: 'lostToss'|'wonSet3Toss' }|null} props.chooser
 * @param {'side'|'serve'|null} props.choice what the chooser took
 * @param {(choice: 'side'|'serve') => void} props.onChoose
 * @param {{ team1: string, team2: string }} props.names "A · Alpha / Beta"
 * @param {'team1'|'team2'} props.leftTeamKey the team on the left now
 * @param {'team1'|'team2'|null} props.servingTeamKey the team serving first now
 * @param {() => void} props.onSwitchSides without a known chooser: toggle the sides
 * @param {() => void} props.onSwitchServe without a known chooser: toggle the serve
 * @param {(teamKey: string, side: 'left'|'right') => void} props.onPickSide put the team on that side
 * @param {(teamKey: string, serves: boolean) => void} props.onPickServe the team serves (true) or receives
 * @param {boolean} [props.compact]
 */
export default function IntervalChoice({ chooser, choice, onChoose, names, leftTeamKey, servingTeamKey, onSwitchSides, onSwitchServe, onPickSide, onPickServe, compact = false }) {
  const { t } = useTranslation()
  const h = 40
  const font = compact ? 13 : 15
  const segment = (on) => ({
    flex: 1, minWidth: 0, minHeight: h, padding: '0 10px', borderRadius: 10, fontSize: font, fontWeight: 700, cursor: 'pointer',
    background: on ? 'var(--ov-selected)' : 'var(--ov-card)',
    color: on ? 'var(--ov-on-dark)' : 'var(--ov-text)',
    border: on ? '1px solid var(--ov-selected)' : '1px solid var(--ov-hairline-strong)'
  })
  const rowLabel = { fontSize: compact ? 12 : 13, fontWeight: 700, color: 'var(--ov-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }

  // No toss recorded (an older match): the two switches, as before
  if (!chooser) {
    return (
      <div data-testid="interval-choice" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, width: '100%' }}>
        <button type="button" style={{ ...segment(true), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => onSwitchSides()}>
          <ArrowLeftRight size={16} aria-hidden="true" />{t('scoreboard.buttons.switchSides')}
        </button>
        <button type="button" style={segment(true)} onClick={() => onSwitchServe()}>{t('scoreboard.buttons.switchServe')}</button>
      </div>
    )
  }

  const chooserName = names[chooser.teamKey]
  const who = deciders(chooser.teamKey, choice)
  const reason = chooser.reason === 'wonSet3Toss'
    ? t('scoreboard.intervalChoice.reasonWonSet3Toss')
    : t('scoreboard.intervalChoice.reasonLostToss')

  // A row: the team that decides it, then its two options (pressed: as now)
  const row = (kind, teamKey) => {
    const name = names[teamKey]
    const options = kind === 'side'
      ? [
          { id: 'left', label: t('scoreboard.intervalChoice.left'), on: leftTeamKey === teamKey },
          { id: 'right', label: t('scoreboard.intervalChoice.right'), on: leftTeamKey !== teamKey }
        ]
      : [
          { id: 'serve', label: t('scoreboard.intervalChoice.serves'), on: servingTeamKey === teamKey },
          { id: 'receive', label: t('scoreboard.intervalChoice.receives'), on: servingTeamKey !== teamKey }
        ]
    const title = kind === 'side'
      ? t('scoreboard.intervalChoice.sideRow', { team: name })
      : t('scoreboard.intervalChoice.serveRow', { team: name })
    return (
      <div key={kind} role="group" aria-label={title} data-testid={`interval-${kind}-row`} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={rowLabel}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              aria-pressed={o.on}
              data-testid={`interval-${kind}-${o.id}`}
              onClick={() => (kind === 'side' ? onPickSide(teamKey, o.id) : onPickServe(teamKey, o.id === 'serve'))}
              style={segment(o.on)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="interval-choice" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8, width: '100%', minWidth: 0 }}>
      <div role="group" aria-label={t('scoreboard.intervalChoice.chooses', { team: chooserName })} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span data-testid="interval-chooser" style={{ fontSize: compact ? 13 : 16, fontWeight: 800, color: 'var(--ov-text)', textAlign: 'center', whiteSpace: compact ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('scoreboard.intervalChoice.chooses', { team: chooserName })}
          <span style={{ fontWeight: 600, color: 'var(--ov-text-muted)' }}> ({reason})</span>
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" aria-pressed={choice === 'side'} data-testid="interval-choice-side" onClick={() => onChoose('side')} style={segment(choice === 'side')}>
            {t('scoreboard.intervalChoice.side')}
          </button>
          <button type="button" aria-pressed={choice === 'serve'} data-testid="interval-choice-serve" onClick={() => onChoose('serve')} style={segment(choice === 'serve')}>
            {t('scoreboard.intervalChoice.serve')}
          </button>
        </div>
      </div>
      {who ? (
        <>
          {row(choice, chooser.teamKey)}
          {row(choice === 'side' ? 'serve' : 'side', choice === 'side' ? who.serve : who.side)}
        </>
      ) : (
        <span style={{ fontSize: compact ? 11 : 13, color: 'var(--ov-text-muted)', textAlign: 'center' }}>{t('scoreboard.intervalChoice.pickHint')}</span>
      )}
    </div>
  )
}

/**
 * A team's service order for the next set, with a labelled button to swap
 * it: "Serve order · 1 #4 Alpha · 2 #7 Beta · ⇄ Change" (rule 7.6.1: given
 * again in each interval).
 */
export function ServeOrder({ teamName, players, firstServe, onChange, compact = false, textColor = 'inherit' }) {
  const { t } = useTranslation()
  const { first, second } = serviceOrderOf(players, firstServe)
  const who = (p) => (p ? `#${p.number}${p.name ? ` ${p.name}` : ''}` : '?')
  const line = { maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: compact ? 12 : 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }
  const aria = first && second
    ? t('scoreboard.serveOrder.changeAria', { team: teamName, first: who(first), second: who(second) })
    : t('scoreboard.serveOrder.change')
  return (
    <div data-testid="serve-order" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 2 : 3, minWidth: 0, maxWidth: '100%', color: textColor }}>
      <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>{t('scoreboard.serveOrder.title')}</span>
      <span style={line}>1 · {who(first)}</span>
      <span style={line}>2 · {who(second)}</span>
      <button
        type="button"
        data-testid="serve-order-change"
        aria-label={aria}
        title={aria}
        disabled={!first || !second}
        onClick={(e) => { e.stopPropagation(); onChange() }}
        style={{ marginTop: compact ? 2 : 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: compact ? 32 : 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--ov-hairline-strong)', background: 'var(--ov-card)', color: 'var(--ov-text)', fontSize: compact ? 12 : 13, fontWeight: 700, cursor: 'pointer', maxWidth: '100%', whiteSpace: 'nowrap' }}
      >
        <ArrowLeftRight size={compact ? 14 : 16} aria-hidden="true" />
        {t('scoreboard.serveOrder.change')}
      </button>
    </div>
  )
}
