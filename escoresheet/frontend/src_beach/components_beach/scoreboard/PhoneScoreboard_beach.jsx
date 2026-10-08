import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Undo2, Menu, ArrowLeftRight } from 'lucide-react'
import { ActionSheet } from '../../ui/volleyui/Modal.jsx'
import { SAND_SURFACE, discPaint, discRing, normaliseColour, readableText } from '../../utils_beach/teamColours_beach'
import { tintOf } from './phoneLayout_beach'

/**
 * The beach scoring screen on a phone held upright (owner-approved mockup
 * Beach.dc.html, 390x844). A VIEW only: Scoreboard_beach feeds it the match
 * state it already computes and its own handlers, so every button opens the
 * same dialog / runs the same action as the desktop layout (point, start
 * rally, undo, time-out, BMP, referee BMP, sanctions, MTO / RIT, replay,
 * decision change, rosters, scoresheet, remarks, the match menu). No scoring
 * rule is decided here: the BMP's availability, the court rhythm and the
 * start button's label come computed.
 *
 * Top to bottom: header (set, teams, undo, menu), the two score cards, the
 * next change of courts and TTO, a stylised 2:1 sand court with the two
 * players of each team and the ball next to the server (between sets: the
 * set 3 coin toss or the service order, as the desktop shows them in place of
 * the court), the last three actions, the team actions (time-out and BMP,
 * each above its team's point button), the two square point buttons (or
 * Start rally / the time-out countdown / the interval, as the desktop centre
 * column shows them), and a grid of the other actions.
 *
 * Teams come as `left` / `right`: their court sides, so the cards, the court,
 * the team actions and the point buttons all line up with the court.
 *
 * @param {object} props
 * @param {number} props.setNumber
 * @param {number} props.pointsToWin 21, or 15 in set 3
 * @param {{ left: object, right: object }} props.teams see TeamVM below
 * @param {'left'|'right'|null} props.serving
 * @param {{ switchIn: number, ttoIn: number|null, ttoTotal: number, setIndex: number }} props.rhythm
 * @param {{ status: 'idle'|'in_play', startLabel: string, startTitle?: string, startDisabled: boolean,
 *   canReplayRally: boolean, isRallyReplayed: boolean }} props.rally
 * @param {null|{ kind: 'timeout', teamName: string, countdown: number, countdownText: string, total: number }} props.centre
 * @param {null|{ kind: 'toss'|'setup', chooses?: string|null, countdown?: number, countdownText?: string, total?: number }} props.between
 *   the interval before a set, while its setup is open (the desktop replaces the court with it)
 * @param {Array<{ id: any, text: string }>} props.recent newest first
 * @param {boolean} props.canUndo
 * @param {string} [props.scoreFont] CSS font family of scores and countdowns
 * @param {object} props.actions the Scoreboard's handlers (see Scoreboard_beach.jsx)
 *
 * TeamVM: { side, teamKey, label ('A'|'B'), name, color, setsWon, points,
 *   timeouts, bmp: { remaining, available, title }, players: [{ number,
 *   position, serves }], firstServer, secondServer, improperRequestDone,
 *   delayWarned, hasCoach }
 */
// Three 15px lines, two 3px gaps, 6px padding top and bottom: the last
// actions keep one height whether they show none or three
const RECENT_HEIGHT_PX = 63
// Everything but the court and the point buttons, top to bottom: header 52,
// score cards 89, rhythm row 28, court padding 12, last actions 63 + 12,
// team actions at their smallest 56 + 8, point-button padding 8, action
// grid 108
const SQUARE_RESERVE_PX = 52 + 89 + 28 + 12 + RECENT_HEIGHT_PX + 12 + 64 + 8 + 108
// Below this height the point buttons stop shrinking and the view scrolls
const SQUARE_MIN_PX = 56
const BALL = { flex: 'none', width: 14, height: 14, borderRadius: '50%', background: '#facc15', border: '2px solid #1c1917' }

export default function PhoneScoreboard({ setNumber, pointsToWin, teams, serving, rhythm, rally, centre, between, recent, canUndo, scoreFont = 'inherit', actions }) {
  const { t } = useTranslation()
  // The phone's own pickers: { kind: 'sanction' } | { kind: 'medical' }
  const [sheet, setSheet] = useState(null)
  const { left, right } = teams
  const idle = rally.status === 'idle'
  const inPlay = rally.status === 'in_play'
  // Players can be tapped (sanction / medical) as on the desktop court
  const playersOpen = idle && !rally.isRallyReplayed

  const paintOf = (team) => {
    const colour = normaliseColour(team.color) || (team.side === 'left' ? '#ef4444' : '#3b82f6')
    const text = readableText(colour)
    return {
      colour,
      // the team colour as an edge on white: darkened until it shows (3:1)
      edge: discRing(colour, '#ffffff') || colour,
      tint: tintOf(colour, 0.14) || 'var(--ov-card)',
      soft: tintOf(colour, 0.1) || 'var(--ov-sunken)',
      fill: { background: colour, color: text.color, textShadow: text.textShadow },
      disc: discPaint(colour, SAND_SURFACE)
    }
  }
  const paint = { left: paintOf(left), right: paintOf(right) }
  const teamTitle = (team) => `${team.label} · ${team.name}`

  // ---- header -------------------------------------------------------------
  const header = (
    <header style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 14px', borderBottom: '1px solid var(--ov-hairline)', background: 'var(--ov-card)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ov-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('scoreboard.phone.setInfo', { set: setNumber, points: pointsToWin, left: left.setsWon, right: right.setsWon })}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {left.name} – {right.name}
        </span>
      </div>
      <IconSquare label={t('scoreboard.buttons.undo')} onClick={() => actions.undo()} disabled={!canUndo}>
        <Undo2 size={20} aria-hidden="true" />
      </IconSquare>
      <IconSquare label={t('scoreboard.menu.menu')} onClick={() => actions.menu()}>
        <Menu size={20} aria-hidden="true" />
      </IconSquare>
    </header>
  )

  // ---- score cards --------------------------------------------------------
  const scoreCard = (team) => {
    const isServing = serving === team.side
    const p = paint[team.side]
    const dot = <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: p.colour, border: `1px solid ${p.edge}` }} />
    const info = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, overflow: 'hidden', alignItems: team.side === 'left' ? 'flex-start' : 'flex-end' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, maxWidth: '100%', minWidth: 0, flexDirection: team.side === 'left' ? 'row' : 'row-reverse' }}>
          {dot}
          <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12, fontWeight: 700 }}>{teamTitle(team)}</span>
        </span>
        <span
          aria-hidden={!isServing}
          style={{ visibility: isServing ? 'visible' : 'hidden', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 6px', borderRadius: 999, background: 'var(--ov-text)', color: 'var(--ov-card)', fontSize: 10, fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1.3, whiteSpace: 'nowrap' }}
        >
          {t('scoreboard.labels.serveLabel')}
        </span>
        <span style={{ maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, fontWeight: 600, color: 'var(--ov-text-muted)' }}>
          {t('scoreboard.phone.setsWon', { count: team.setsWon })}
        </span>
      </div>
    )
    const score = (
      <span data-testid={`phone-score-${team.side}`} style={{ flex: 'none', fontSize: 'clamp(40px, 12cqw, 52px)', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: scoreFont }}>
        {team.points}
      </span>
    )
    return (
      <div key={team.side} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: '6px 10px', minWidth: 0, borderRadius: 14, background: isServing ? p.tint : 'var(--ov-card)', border: '1px solid var(--ov-hairline)' }}>
        {team.side === 'left' ? <>{info}{score}</> : <>{score}{info}</>}
      </div>
    )
  }

  // ---- the set's rhythm: next change of courts, TTO -----------------------
  const pill = { flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 9, fontSize: 12, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const switchSoon = rhythm.switchIn === 1
  const ttoText = rhythm.ttoIn !== null
    ? t('scoreboard.phone.ttoIn', { total: rhythm.ttoTotal, count: rhythm.ttoIn })
    : rhythm.setIndex === 3 ? t('scoreboard.phone.noTto') : t('scoreboard.phone.ttoDone')
  const rhythmRow = (
    <div data-testid="phone-rhythm" style={{ flex: 'none', display: 'flex', gap: 6, padding: '0 14px', height: 28, boxSizing: 'border-box' }}>
      <span style={{ ...pill, background: switchSoon ? 'var(--ov-warning-border)' : 'var(--ov-sunken-strong)', color: switchSoon ? 'var(--ov-warning-text)' : 'var(--ov-text)' }}>
        {switchSoon ? t('scoreboard.phone.switchNext') : t('scoreboard.phone.switchIn', { count: rhythm.switchIn })}
      </span>
      <span style={{ ...pill, background: rhythm.ttoIn === 1 ? 'var(--ov-warning-border)' : 'var(--ov-sunken-strong)', color: rhythm.ttoIn === 1 ? 'var(--ov-warning-text)' : 'var(--ov-text)' }}>
        {ttoText}
      </span>
    </div>
  )

  // ---- court --------------------------------------------------------------
  const courtHalf = (team) => {
    const p = paint[team.side]
    const isLeft = team.side === 'left'
    return (
      <div
        key={team.side}
        data-testid={`phone-court-${team.side}`}
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', alignItems: 'center', padding: 6, minHeight: 0, borderRight: isLeft ? '4px solid var(--ov-text)' : undefined }}
      >
        {(team.players || []).map(pl => (
          <button
            key={`${pl.position}-${pl.number}`}
            type="button"
            aria-label={t('scoreboard.phone.courtPlayer', { number: pl.number, team: team.label })}
            disabled={!playersOpen}
            onClick={(e) => actions.playerClick(team.teamKey, pl.position, pl.number, e)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'min(58px, 26cqw)', aspectRatio: '1 / 1', borderRadius: '50%', padding: 0, background: p.disc?.background ?? p.colour, color: p.disc?.color ?? '#ffffff', textShadow: p.disc?.textShadow, border: `2px solid ${p.disc?.ring ?? p.edge}`, fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: playersOpen ? 'pointer' : 'default', opacity: 1 }}
          >
            {pl.number}
            {pl.serves && (
              // The ball on the outer side of the half, next to the server
              <span data-testid="phone-serve-ball" aria-label={t('scoreboard.labels.serveLabel')} style={{ ...BALL, position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(isLeft ? { right: '100%', marginRight: 6 } : { left: '100%', marginLeft: 6 }) }} />
            )}
          </button>
        ))}
      </div>
    )
  }

  // Between sets, as the desktop shows it in place of the court: the set 3
  // coin toss (who won it), or the next set's service order (tap a team to
  // swap its first and second server; the ball on the team that serves)
  const betweenHalf = (team) => {
    const p = paint[team.side]
    const isLeft = team.side === 'left'
    const servesHere = serving === team.side
    if (between.kind === 'toss') {
      return (
        <div key={team.side} style={{ display: 'flex', alignItems: 'stretch', padding: 8, minHeight: 0, borderRight: isLeft ? '4px solid var(--ov-text)' : undefined }}>
          <button
            type="button"
            data-testid={`phone-toss-${team.label}`}
            onClick={() => actions.set3CoinToss(team.teamKey)}
            style={{ flex: 1, minWidth: 0, borderRadius: 12, border: `2px solid ${p.edge}`, ...p.fill, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, fontSize: 14, fontWeight: 800 }}
          >
            <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamTitle(team)}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t('scoreboard.wonToss')}</span>
          </button>
        </div>
      )
    }
    return (
      <div key={team.side} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', padding: isLeft ? '8px 10px 8px 26px' : '8px 26px 8px 10px', minHeight: 0, borderRight: isLeft ? '4px solid var(--ov-text)' : undefined }}>
        {servesHere && (
          <span data-testid="phone-serve-ball" aria-label={t('scoreboard.labels.serveLabel')} style={{ ...BALL, position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(isLeft ? { left: 6 } : { right: 6 }) }} />
        )}
        <button
          type="button"
          data-testid={`phone-service-order-${team.side}`}
          title={t('scoreboard.phone.serviceOrderHint')}
          onClick={() => actions.switchServiceOrder(team.teamKey)}
          style={{ flex: 1, minWidth: 0, borderRadius: 12, border: `2px solid ${servesHere ? 'var(--ov-success)' : p.edge}`, ...p.fill, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        >
          <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>{teamTitle(team)}</span>
          <span>I: {team.firstServer ?? '?'}</span>
          <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1 }}>⇅</span>
          <span>II: {team.secondServer ?? '?'}</span>
        </button>
      </div>
    )
  }

  // ---- team actions -------------------------------------------------------
  // As the desktop toolbox: the time-out between rallies (one per set), the
  // BMP when bmpAvailability_beach allows it; greyed when not
  const toDisabled = (team) => !idle || team.timeouts >= 1
  const counter = (team, { label, value, disabled, onClick, testId, title }) => {
    const p = paint[team.side]
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        disabled={disabled}
        title={title}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, minWidth: 0, padding: '0 4px',
          borderRadius: 14,
          border: `2px solid ${disabled ? 'var(--ov-hairline-strong)' : p.edge}`,
          background: disabled ? 'var(--ov-sunken-strong)' : p.soft,
          color: disabled ? 'var(--ov-text-faint)' : 'var(--ov-text)',
          cursor: disabled ? 'default' : 'pointer'
        }}
      >
        {/* One line as the mockup; a label longer than the button ("TEMPS
            MORT") goes on two lines rather than out of it */}
        <span style={{ maxWidth: '100%', fontSize: 'clamp(10px, 2.85vw, 11px)', lineHeight: 1.15, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', textWrap: 'balance', overflowWrap: 'anywhere' }}>{label}</span>
        <span style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
      </button>
    )
  }
  const teamActions = (team) => (
    <div key={team.side} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
      {counter(team, { label: t('scoreboard.phone.timeOut'), value: `${team.timeouts}/1`, disabled: toDisabled(team), onClick: () => actions.timeout(team.teamKey), testId: `phone-timeout-${team.side}` })}
      {counter(team, { label: t('scoreboard.phone.bmpLeft'), value: team.bmp.remaining, disabled: !team.bmp.available, onClick: () => actions.teamBmp(team.teamKey), testId: `phone-bmp-${team.side}`, title: team.bmp.title })}
    </div>
  )

  // ---- centre: point buttons, start rally, countdowns, interval ------------
  const bigButton = { width: '100%', minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
  const darkButton = { ...bigButton, background: 'var(--ov-selected)', color: 'var(--ov-on-dark)' }
  const outlineButton = { ...bigButton, background: 'var(--ov-card)', color: 'var(--ov-text)', border: '1px solid var(--ov-hairline-strong)' }
  const countdown = ({ countdown: value, countdownText, total }, warnAt, size = 48) => (
    <>
      <div data-testid="phone-countdown" style={{ flex: 'none', fontSize: size, lineHeight: 1, fontWeight: 800, fontFamily: scoreFont, fontVariantNumeric: 'tabular-nums', color: value <= warnAt ? 'var(--ov-danger-text)' : 'var(--ov-text)' }}>{countdownText ?? value}</div>
      <div style={{ flex: 'none', width: '70%', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--ov-hairline)' }}>
        <div style={{ width: `${total > 0 ? Math.max(0, Math.min(1, value / total)) * 100 : 0}%`, height: '100%', marginLeft: 'auto', borderRadius: 4, background: value <= warnAt ? '#dc2626' : 'var(--ov-success)', transition: 'width 1s linear' }} />
      </div>
    </>
  )
  const startButton = (style = {}) => (
    <button
      type="button"
      data-testid="phone-start"
      disabled={rally.startDisabled}
      title={rally.startTitle}
      // The desktop button hands its click event to handleStartRally too
      onClick={(e) => actions.startRally(e)}
      style={{ ...bigButton, fontSize: 24, fontWeight: 800, borderRadius: 16, background: rally.startDisabled ? 'var(--ov-sunken-strong)' : 'var(--ov-selected)', color: rally.startDisabled ? 'var(--ov-text-faint)' : 'var(--ov-on-dark)', ...style }}
    >
      {rally.startLabel}
    </button>
  )
  let overlay = null
  if (centre?.kind === 'timeout') {
    overlay = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: '100%', padding: 10, boxSizing: 'border-box', borderRadius: 16, background: 'var(--ov-card)', border: '1px solid var(--ov-hairline)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ov-text-secondary)', textAlign: 'center' }}>{t('scoreboard.timeoutFor', { team: centre.teamName })}</div>
        {countdown(centre, 10)}
        <button type="button" style={{ ...outlineButton, width: 'auto', padding: '0 24px' }} onClick={() => actions.stopTimeout()}>{t('scoreboard.buttons.stopTimeout')}</button>
      </div>
    )
  } else if (between) {
    // The interval: its countdown, the next set's sides and serve (not before
    // the set 3 toss), then Start set (greyed until the toss is recorded)
    overlay = (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, height: '100%', overflowY: 'auto' }}>
        {typeof between.countdown === 'number' && (
          // One line, as the desktop's "Set interval 0:59", and its bar
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ov-text-muted)' }}>{t('scoreboard.setInterval')}</span>
              <span data-testid="phone-countdown" style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, fontFamily: scoreFont, fontVariantNumeric: 'tabular-nums', color: between.countdown <= 30 ? 'var(--ov-danger-text)' : 'var(--ov-text)' }}>{between.countdownText ?? between.countdown}</span>
            </div>
            <div style={{ width: '70%', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--ov-hairline)' }}>
              <div style={{ width: `${between.total > 0 ? Math.max(0, Math.min(1, between.countdown / between.total)) * 100 : 0}%`, height: '100%', marginLeft: 'auto', borderRadius: 3, background: between.countdown <= 30 ? '#dc2626' : 'var(--ov-success)', transition: 'width 1s linear' }} />
            </div>
          </div>
        )}
        {between.kind === 'setup' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button type="button" style={{ ...darkButton, minHeight: 44, fontSize: 14 }} onClick={() => actions.switchSides()}><ArrowLeftRight size={16} aria-hidden="true" />{t('scoreboard.buttons.switchSides')}</button>
            <button type="button" style={{ ...darkButton, minHeight: 44, fontSize: 14 }} onClick={() => actions.switchServe()}>{t('scoreboard.buttons.switchServe')}</button>
          </div>
        )}
        {startButton({ fontSize: 20, minHeight: 52, flex: 'none' })}
      </div>
    )
  } else if (!inPlay) {
    overlay = startButton({ height: '100%' })
  }
  // The point buttons: squares as wide as their column (.phone-square in
  // styles_beach.css). On a screen too short for the whole layout (a
  // browser's bars, the Android app's system bars) they get lower, not
  // narrower; the root is the size container that measures what is left.
  const squareClass = 'phone-square'
  const pointButton = (team) => {
    const p = paint[team.side]
    return (
      <button
        key={team.side}
        type="button"
        aria-label={t('scoreboard.buttons.pointTeam', { team: team.label })}
        onClick={() => actions.point(team.side)}
        className={squareClass}
        style={{ minWidth: 0, borderRadius: 16, border: `2px solid ${p.edge}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, ...p.fill }}
      >
        <span aria-hidden="true" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>+1</span>
        <span aria-hidden="true" style={{ fontSize: 14, fontWeight: 700 }}>{t('scoreboard.buttons.pointTeam', { team: team.label })}</span>
      </button>
    )
  }

  // ---- the other actions --------------------------------------------------
  const gridButton = (key, label, onClick, { disabled = false, muted = false, title } = {}) => (
    <button
      key={key}
      type="button"
      data-testid={`phone-action-${key}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 44, minWidth: 0, padding: '0 4px',
        borderRadius: 12, border: '1px solid var(--ov-hairline-strong)',
        background: disabled ? 'var(--ov-sunken-strong)' : muted ? 'var(--ov-sunken)' : 'var(--ov-card)',
        color: disabled ? 'var(--ov-text-faint)' : 'var(--ov-text)',
        // Long words break only at their soft hyphens (Score-sheet), not
        // anywhere mid-word; overflowWrap is the last resort
        fontSize: 12, lineHeight: 1.15, fontWeight: 600, overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'manual'
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      className="ov-kit phone-scoreboard"
      data-testid="phone-scoreboard"
      style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, height: '100%', width: '100%', maxWidth: 600, margin: '0 auto', containerType: 'size', '--phone-square-reserve': `${SQUARE_RESERVE_PX}px`, '--phone-square-min': `${SQUARE_MIN_PX}px`, overflowY: 'auto', overflowX: 'hidden', background: 'var(--ov-page-top)', color: 'var(--ov-text)', fontFamily: 'var(--font-sans, inherit)' }}
    >
      {header}

      <section aria-label={t('scoreboard.phone.score')} style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: '10px 12px 6px' }}>
        {scoreCard(left)}
        {scoreCard(right)}
      </section>

      {rhythmRow}

      <section aria-label={t('scoreboard.phone.court')} style={{ flex: 'none', padding: '8px 12px 4px' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderRadius: 16, background: SAND_SURFACE, border: '2px solid #c9a46a', overflow: 'hidden', containerType: 'inline-size' }}>
          {between ? <>{betweenHalf(left)}{betweenHalf(right)}</> : <>{courtHalf(left)}{courtHalf(right)}</>}
          {between?.chooses && (
            <span style={{ position: 'absolute', left: 8, right: 8, bottom: 4, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
              {between.chooses}
            </span>
          )}
        </div>
      </section>

      <section aria-label={t('scoreboard.phone.recentActions')} data-testid="phone-recent" style={{ flex: 'none', margin: '4px 14px 8px', padding: '6px 10px', height: RECENT_HEIGHT_PX, boxSizing: 'border-box', overflow: 'hidden', borderRadius: 10, background: 'var(--ov-sunken-strong)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {recent.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--ov-text-muted)' }}>{t('scoreboard.phone.noActions')}</span>
        ) : recent.map((r, i) => (
          <span key={r.id} title={r.text} style={{ fontSize: 12, lineHeight: '15px', color: i === 0 ? 'var(--ov-text)' : 'var(--ov-text-muted)', fontWeight: i === 0 ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</span>
        ))}
      </section>

      {/* Grows into the height left over: the screen is filled, no gap */}
      <section aria-label={t('scoreboard.phone.teamActions')} style={{ flex: '1 0 auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '0 12px 8px' }}>
        {teamActions(left)}
        {teamActions(right)}
      </section>

      <section aria-label={t('scoreboard.phone.pointButtons')} style={{ flex: 'none', position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '0 12px 8px' }}>
        {inPlay && !centre ? (
          <>{pointButton(left)}{pointButton(right)}</>
        ) : (
          <>
            {/* Two square slots keep the height of the point buttons */}
            <div aria-hidden="true" className={squareClass} />
            <div aria-hidden="true" className={squareClass} />
            <div style={{ position: 'absolute', top: 0, left: 12, right: 12, bottom: 8 }}>{overlay}</div>
          </>
        )}
      </section>

      <section aria-label={t('scoreboard.phone.moreActions')} style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, padding: '0 12px 14px' }}>
        {gridButton('sanction', t('scoreboard.sanction'), () => setSheet({ kind: 'sanction' }), { disabled: !playersOpen })}
        {gridButton('medical', t('scoreboard.phone.medical'), () => setSheet({ kind: 'medical' }), { disabled: !playersOpen })}
        {gridButton('replay', t('scoreboard.phone.replay'), () => actions.replay(), { disabled: !inPlay })}
        {gridButton('decision', t('scoreboard.phone.decision'), () => actions.replay(), { disabled: !(idle && rally.canReplayRally) })}
        {gridButton('rosters', t('scoreboard.rosters'), () => actions.rosters(), { muted: true })}
        {gridButton('scoresheet', t('scoreboard.phone.scoresheet'), () => actions.scoresheet(), { muted: true })}
        {gridButton('remarks', t('scoreboard.phone.remarks'), () => actions.remarks(), { muted: true })}
        {/* The referee BMP decides the rally in play (as the desktop's in-rally button) */}
        {gridButton('refbmp', t('scoreboard.phone.refBmp'), () => actions.refereeBmp(), { disabled: !inPlay, title: t('scoreboard.buttons.refereeBmp') })}
      </section>

      {sheet?.kind === 'sanction' && (
        <ActionSheet open onClose={() => setSheet(null)} title={t('scoreboard.sanction')} closeLabel={t('common.close')} railOffset={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '4px 8px 8px' }}>
            {[left, right].map(team => (
              <SanctionColumn key={team.side} team={team} edge={paint[team.side].edge} title={teamTitle(team)} actions={actions} onDone={() => setSheet(null)} />
            ))}
          </div>
        </ActionSheet>
      )}
      {sheet?.kind === 'medical' && (
        <ActionSheet open onClose={() => setSheet(null)} title={t('scoreboard.phone.medicalTitle')} closeLabel={t('common.close')} railOffset={false}>
          <div data-testid="phone-medical-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 8px 8px' }}>
            <p style={sheetNote}>{t('scoreboard.phone.medicalHint')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {[left, right].flatMap(team => (team.players || []).map(pl => (
                <button
                  key={`${team.side}-${pl.number}`}
                  type="button"
                  data-testid={`phone-medical-${team.label}-${pl.number}`}
                  onClick={(e) => { setSheet(null); actions.medical(team.teamKey, pl.number, team.side, e) }}
                  style={{ minHeight: 48, minWidth: 0, borderRadius: 12, border: `2px solid ${paint[team.side].edge}`, ...paint[team.side].fill, fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                >
                  {team.label} {pl.number}
                </button>
              )))}
            </div>
          </div>
        </ActionSheet>
      )}
    </div>
  )
}

function IconSquare({ label, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ flex: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid var(--ov-hairline-strong)', background: 'var(--ov-card)', color: disabled ? 'var(--ov-text-faint)' : 'var(--ov-text)', cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </button>
  )
}

const sheetNote = { margin: 0, fontSize: 13, color: 'var(--ov-text-secondary)' }
const sheetHead = { margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ov-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const wideButton = { minHeight: 44, width: '100%', padding: '0 8px', borderRadius: 10, border: '1px solid var(--ov-hairline-strong)', background: 'var(--ov-card)', color: 'var(--ov-text)', fontSize: 13, fontWeight: 600, textAlign: 'center' }

/**
 * One team's sanctions: the team ones of the desktop toolbox (improper
 * request, delay warning, then delay penalty), each player, and the coach
 * when the match has one, each opening the Scoreboard's own sanction menu.
 */
function SanctionColumn({ team, edge, title, actions, onDone }) {
  const { t } = useTranslation()
  const person = (spec) => (e) => { onDone(); actions.sanctionPerson({ team: team.teamKey, side: team.side, ...spec }, e) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, paddingTop: 4, borderTop: `3px solid ${edge}` }}>
      <p style={sheetHead}>{title}</p>
      {!team.improperRequestDone && (
        <button type="button" style={wideButton} onClick={() => { onDone(); actions.teamSanction(team.teamKey, 'improper_request') }}>{t('scoreboard.sanctions.improperRequest')}</button>
      )}
      {!team.delayWarned ? (
        <button type="button" style={{ ...wideButton, background: 'var(--ov-warning-soft)', color: 'var(--ov-warning-text)' }} onClick={() => { onDone(); actions.teamSanction(team.teamKey, 'delay_warning') }}>{t('scoreboard.sanctions.delayWarning')}</button>
      ) : (
        <button type="button" style={{ ...wideButton, background: 'var(--ov-danger-soft)', color: 'var(--ov-danger-text)' }} onClick={() => { onDone(); actions.teamSanction(team.teamKey, 'delay_penalty') }}>{t('scoreboard.sanctions.delayPenalty')}</button>
      )}
      <p style={{ ...sheetNote, fontSize: 12, marginTop: 4 }}>{t('scoreboard.phone.sanctionPeople')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
        {(team.players || []).map(pl => (
          <button key={pl.number} type="button" data-testid={`phone-sanction-${team.label}-${pl.number}`} style={{ ...wideButton, fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} onClick={person({ type: 'player', playerNumber: pl.number, position: pl.position })}>{pl.number}</button>
        ))}
        {team.hasCoach && (
          <button type="button" style={{ ...wideButton, gridColumn: 'span 2' }} onClick={person({ type: 'coach', role: 'coach' })}>{t('scoreboard.coach')}</button>
        )}
      </div>
    </div>
  )
}
