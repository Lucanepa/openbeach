import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'
import { Switch } from '../../ui/volleyui/Switch.jsx'
import { InfoHint } from '../../ui/volleyui/InfoHint.jsx'
import { IconButton } from '../../ui/volleyui/IconButton.jsx'
import { cn } from '../../ui/volleyui/cn.js'

// The settings rows of the Options dialogs (home and scoring screen), volleyui:
// flat rows on hairlines (min 48 px), a sentence-case title with its tap-to-open
// explanation, the kit Switch named by that title (role="switch",
// aria-checked, focus ring). Replaces the hand-made ToggleSwitch (no role, no
// state, no name) and the 16 px clickable InfoDot div.

/** A titled group of rows: a section head on the one heavy rule. */
export function OptionSection({ title, children, className, testId }) {
  return (
    <section className={cn('mb-5 last:mb-0', className)} data-testid={testId}>
      {title && (
        <h3 className="mb-1 border-b-[1.5px] border-stone-800 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-800">
          {title}
        </h3>
      )}
      <div className="divide-y divide-stone-100">{children}</div>
    </section>
  )
}

/** The (i) next to a row title: opens on tap, a real button. */
export function OptionInfo({ children }) {
  const { t } = useTranslation()
  return (
    <InfoHint
      eyebrow={t('options.infoEyebrow', 'About this')}
      label={t('options.showInfo', 'Show explanation')}
      closeLabel={t('common.close', 'Close')}
    >
      {children}
    </InfoHint>
  )
}

/**
 * One settings row: title (+ explanation, hint) on the left, its control on
 * the right; `below` goes under the title (a duration field, a status line).
 */
export function OptionRow({ label, labelId, hint, info, control, below, stacked = false, className, testId }) {
  return (
    <div className={cn('flex min-h-12 gap-3 py-3', stacked ? 'flex-col' : 'items-center justify-between', className)} data-testid={testId}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span id={labelId} className="text-sm font-semibold text-stone-900">{label}</span>
          {info && <OptionInfo>{info}</OptionInfo>}
        </div>
        {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
        {below}
      </div>
      {control && <div className={cn('flex shrink-0 flex-wrap items-center gap-2', stacked && 'w-full')}>{control}</div>}
    </div>
  )
}

/** A row whose control is an on/off switch that applies at once. */
export function OptionSwitch({ label, hint, info, checked, onChange, extra, below, disabled, testId }) {
  const labelId = useId()
  return (
    <OptionRow
      label={label}
      labelId={labelId}
      hint={hint}
      info={info}
      below={below}
      testId={testId}
      control={(
        <>
          {extra}
          <Switch size="lg" checked={!!checked} onCheckedChange={onChange} disabled={disabled} aria-labelledby={labelId} />
        </>
      )}
    />
  )
}

/** A number of seconds, stepped (min'ss''). */
export function OptionStepper({ value, onDecrement, onIncrement, label }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <IconButton variant="outline" icon={Minus} label={t('options.decrease', { label, defaultValue: 'Decrease {{label}}' })} onClick={onDecrement} />
      <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums text-stone-900">
        {Math.floor(value / 60)}&apos; {(value % 60).toString().padStart(2, '0')}&apos;&apos;
      </span>
      <IconButton variant="outline" icon={Plus} label={t('options.increase', { label, defaultValue: 'Increase {{label}}' })} onClick={onIncrement} />
    </div>
  )
}

/** A small number field (seconds), as the kit's compact input. */
export function OptionNumber({ value, onChange, min, max, label, suffix }) {
  return (
    <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        className="h-9 w-16 rounded-lg border border-stone-300 bg-white px-2 text-center text-sm tabular-nums text-stone-900 outline-none focus:ring-2 focus:ring-red-500"
      />
      {suffix && <span>{suffix}</span>}
    </label>
  )
}
