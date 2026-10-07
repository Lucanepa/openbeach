// Shared volleyui class strings for the app chrome: the header bar, header
// buttons, anchored dropdown menus and info popovers (MainHeader,
// ConnectionStatus, TabletStatusIndicator). The same strings as OpenVolley's
// src/components/chromeClasses.js, so both apps' bars have one face.
//
// The header sits next to legacy components, so each control is wrapped in
// KIT_SCOPE (`.ov-kit` with `display: contents`): the kit preflight then
// reaches it and the legacy element rules in styles_beach.css (`button {
// background: var(--accent) }` is the scoring green) no longer do. Utilities
// sit above the legacy layer, so these classes win; inline style still beats
// them, so converted elements carry no colour styles.
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'

export { FOCUS_RING }

/**
 * Wrapper for a single control outside `.ov-kit`: `display: contents` (no box,
 * the layout is unchanged) but the control is then inside the kit scope.
 */
export const KIT_SCOPE = 'ov-kit contents'

/** Top bar: white with a stone hairline (svrz console header). */
export const HEADER_BAR = 'bg-white border-b border-stone-200/70'

/** Title in a dashboard bar (referee, livescore). */
export const HEADER_TITLE = 'truncate text-sm font-semibold tracking-normal text-stone-900'

/** Quieter detail beside the title (subtitle, game count). */
export const HEADER_META = 'truncate text-[11px] font-medium tracking-normal text-stone-500'

/** Small header button (menu, match info). 32 px: the bar is 40 px. */
export const HEADER_BTN = `inline-flex shrink-0 items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium tracking-normal text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer ${FOCUS_RING}`

/** The same button while its panel is open / its mode is on (selection = slate-900). */
export const HEADER_BTN_ON = 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'

/** The Online / Offline switch in the bar: the header button face holding a word and a switch track. */
export const HEADER_SWITCH = `inline-flex shrink-0 items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-lg border border-stone-200 bg-white text-xs font-medium tracking-normal whitespace-nowrap text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer ${FOCUS_RING}`

/** Anchored dropdown panel (svrz anchored menu: rounded-xl, hairline, shadow-card-lg). */
export const MENU_PANEL = 'rounded-xl border border-stone-200 bg-white p-1.5 shadow-card-lg text-stone-700'

/** Info popover (connection status, tablets, dashboard info). */
export const POPOVER_PANEL = 'rounded-xl border border-stone-200 bg-white p-3 shadow-card-lg text-stone-800'

/** Eyebrow over a popover: stone-500 (it names the panel, so it carries information). */
export const MENU_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500'

/** Section label inside a dropdown (Connection, Status, Screen). */
export const MENU_SECTION = 'px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500'

/** Menu row: 48 px tall, full width, stone text, stone-100 hover (svrz menu row). */
export const MENU_ROW = `flex w-full min-h-12 items-center gap-3 px-3 py-2 rounded-lg border-0 bg-transparent text-left text-sm font-medium tracking-normal text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${FOCUS_RING}`

/** Compact row for nested choices (language, scale): still a full 44 px target. */
export const MENU_SUBROW = `flex w-full min-h-11 items-center gap-2.5 px-3 py-2 rounded-lg border-0 bg-transparent text-left text-sm font-medium tracking-normal text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer ${FOCUS_RING}`

/** The chosen row in a choice list (language, scale). */
export const MENU_ROW_ON = 'bg-slate-900 text-white hover:bg-slate-800'

/** A row with nothing to do (a status, the test-mode flag): static, full opacity. */
export const MENU_INFO_ROW = 'flex w-full min-h-11 items-center gap-3 px-3 py-2 rounded-lg text-left text-sm font-medium tracking-normal cursor-default select-none'

/** Destructive / leave row (Back, Exit). */
export const MENU_ROW_DANGER = 'text-red-600 hover:bg-red-50'

/** Nested choice list under a row. */
export const MENU_NEST = 'my-1 rounded-lg bg-stone-50 p-1'

/** Hairline between menu groups. */
export const MENU_SEP = 'my-1 h-px bg-stone-100'

/** Leading icon slot in a row. */
export const MENU_ICON = 'flex w-5 shrink-0 items-center justify-center text-stone-400'

/** Count / value pill at the end of a row (svrz count pill). */
export const MENU_COUNT = 'ml-auto inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums tracking-normal text-stone-600'

/**
 * Header status trigger (Connected / Ready / Error, the dashboards and tablets
 * counts). It opens a panel, so it is a control and wears the header button
 * face, never a tinted state pill (volleyui: a status is never a control). The
 * state is a coloured dot plus the word in its tone (`tone.pill`).
 */
export const STATUS_PILL = 'inline-flex shrink-0 items-center gap-1.5 h-8 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium tracking-normal whitespace-nowrap text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer'

/**
 * Each tone: `pill` the word colour on a STATUS_PILL trigger, `dot` its dot,
 * `text` a word on white, `tint` the kit StatusPill face for a state inside a
 * panel (`<StatusPill className={tone.tint}>`).
 */
export const STATUS_TONES = {
  ok: { pill: 'text-emerald-800', dot: 'bg-emerald-500', text: 'text-emerald-800', tint: 'bg-emerald-100 text-emerald-800' },
  warn: { pill: 'text-amber-800', dot: 'bg-amber-500', text: 'text-amber-800', tint: 'bg-amber-100 text-amber-800' },
  error: { pill: 'text-red-700', dot: 'bg-red-500', text: 'text-red-700', tint: 'bg-red-50 text-red-700' },
  info: { pill: 'text-sky-800', dot: 'bg-sky-500', text: 'text-sky-800', tint: 'bg-sky-100 text-sky-800' },
  neutral: { pill: 'text-stone-700', dot: 'bg-stone-400', text: 'text-stone-600', tint: 'bg-stone-100 text-stone-600' },
  violet: { pill: 'text-violet-800', dot: 'bg-violet-500', text: 'text-violet-800', tint: 'bg-violet-100 text-violet-800' },
}

/**
 * Legacy menu-item colours passed in by callers (Referee, the dashboards)
 * mapped to the kit's text tones. Unknown values fall back to the inline colour.
 */
const ITEM_TONES = {
  '#22c55e': 'text-emerald-700',
  '#10b981': 'text-emerald-700',
  '#3b82f6': 'text-sky-700',
  '#60a5fa': 'text-sky-700',
  '#fbbf24': 'text-amber-700',
  '#f59e0b': 'text-amber-700',
  '#eab308': 'text-amber-700',
  '#ef4444': 'text-red-600',
  '#dc2626': 'text-red-600',
}

/** The same legacy colours as a STATUS_TONES key, for informational rows. */
const ITEM_STATUS_TONES = {
  'text-emerald-700': 'ok',
  'text-sky-700': 'info',
  'text-amber-700': 'warn',
  'text-red-600': 'error',
}

/** STATUS_TONES key for a caller-supplied menu item colour (neutral when unknown). */
export function itemStatusTone(color) {
  const cls = color ? ITEM_TONES[String(color).toLowerCase()] : undefined
  return ITEM_STATUS_TONES[cls] || 'neutral'
}

/** { className, style } for a caller-supplied menu item colour. */
export function itemTone(color) {
  if (!color) return { className: '', style: undefined }
  const cls = ITEM_TONES[String(color).toLowerCase()]
  return cls ? { className: cls, style: undefined } : { className: '', style: { color } }
}
