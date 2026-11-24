import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import TeamShirt from './TeamShirt_beach'
import { cn } from '../ui/volleyui/cn.js'
import { Button, FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import {
  TEAM_COLOUR_PRESETS,
  coloursTooClose,
  isCustomColour,
  normaliseColour,
  parseHexColour,
  presetColour
} from '../utils_beach/teamColours_beach'

// A custom colour to start from when the team has none and its shirt is unreadable
const START_COLOUR = '#e2001a'

// The picker's tiles as they were (kit dialog): white, the selected one ringed
const TILE = cn('relative flex min-h-16 min-w-[60px] items-center justify-center rounded-lg border px-2 py-3 transition-colors', FOCUS_RING)
const TILE_IDLE = 'border-stone-200 bg-white hover:bg-stone-50'
const TILE_SELECTED = 'border-slate-900 ring-2 ring-slate-900'

/**
 * Last custom colour per team, kept in this browser: the Custom tile shows it
 * after the team went back to a preset. Storage can be missing (private
 * window, blocked site data): then it is simply forgotten.
 */
const STORE_KEY = 'ob:lastCustomTeamColour'
export function recallCustomColour(teamKey) {
  if (!teamKey) return null
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return parseHexColour(all?.[teamKey] ?? '') ?? null
  } catch {
    return null
  }
}
export function rememberCustomColour(teamKey, hex) {
  const c = parseHexColour(hex ?? '')
  if (!teamKey || !c) return
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...(all && typeof all === 'object' ? all : {}), [teamKey]: c }))
  } catch { /* storage unavailable */ }
}

/** "Close to the other team's colour": a gentle note, never a block */
export function CloseColourNote({ className, id }) {
  const { t } = useTranslation()
  return (
    <p id={id} role="status" className={cn('m-0 flex items-center gap-1.5 text-xs font-medium text-amber-800', className)}>
      <AlertTriangle size={14} aria-hidden="true" className="shrink-0 text-amber-600" />
      {t('matchSetup.closeToOtherTeamColour')}
    </p>
  )
}

/**
 * The team colour picker's content: the twelve preset shirts and a 13th
 * "Custom" tile that opens the browser's colour input, a hex field (#rrggbb,
 * #rgb accepted) and a live preview shirt. A saved colour that is none of the
 * presets selects the Custom tile, which shows it. Colours close to the other
 * team's get a gentle note; nothing is refused.
 * @param {object} props
 * @param {string|null} props.value the team's colour
 * @param {string|null} [props.otherColour] the other team's colour
 * @param {string|null} [props.lastCustom] the team's last custom colour (shown on the Custom tile while the team wears a preset)
 * @param {(hex: string) => void} props.onPick a preset ('#FFFFFF'...) or a custom '#rrggbb'
 */
export default function TeamColourPicker({ value, otherColour = null, lastCustom = null, onPick }) {
  const { t } = useTranslation()
  const uid = useId()
  const current = presetColour(value) ? null : (isCustomColour(value) ? normaliseColour(value) : null)
  const tileCustom = current ?? parseHexColour(lastCustom ?? '') ?? null
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const draft = parseHexColour(text)
  // The last valid code typed: the preview and the colour input keep it
  // while the code is half typed ('#1a7f') or wrong, instead of jumping to red
  const [lastDraft, setLastDraft] = useState(null)
  const shown = draft ?? lastDraft ?? tileCustom ?? START_COLOUR
  const edit = (value) => {
    // spaces are never part of a code: a pasted ' #1a7f5a ' still reads
    const next = value.replace(/\s+/g, '')
    setText(next)
    const valid = parseHexColour(next)
    if (valid) setLastDraft(valid)
  }
  const valueClose = coloursTooClose(value, otherColour)
  const draftClose = draft != null && coloursTooClose(draft, otherColour)

  const openCustom = () => {
    const start = tileCustom ?? normaliseColour(value) ?? START_COLOUR
    setText(start)
    setLastDraft(parseHexColour(start))
    setOpen(true)
  }
  const apply = () => {
    if (draft) onPick(draft)
  }
  const customLabel = tileCustom
    ? `${t('matchSetup.customColour')} ${tileCustom}`
    : t('matchSetup.customColour')

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {TEAM_COLOUR_PRESETS.map((color) => {
          const isSelected = presetColour(value) === color
          const close = coloursTooClose(color, otherColour)
          return (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={isSelected}
              title={close ? `${color} · ${t('matchSetup.closeToOtherTeamColour')}` : color}
              onClick={() => onPick(color)}
              className={cn(TILE, isSelected ? TILE_SELECTED : TILE_IDLE)}
            >
              <TeamShirt color={color} style={{ transform: 'scale(0.8)' }} />
              {close && (
                <AlertTriangle size={12} aria-hidden="true" className="absolute right-1 top-1 text-amber-600" data-close-mark />
              )}
            </button>
          )
        })}
        <button
          type="button"
          aria-label={customLabel}
          aria-pressed={current != null}
          aria-expanded={open}
          aria-controls={`${uid}-custom`}
          data-custom-tile
          onClick={openCustom}
          className={cn(TILE, current != null ? TILE_SELECTED : TILE_IDLE)}
        >
          {tileCustom
            ? <TeamShirt color={tileCustom} style={{ transform: 'scale(0.8)' }} />
            : <TeamShirt rainbow style={{ transform: 'scale(0.8)' }} />}
        </button>
      </div>

      {valueClose && !open && <CloseColourNote />}

      {open && (
        <div id={`${uid}-custom`} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3" data-custom-section>
          <div className="text-xs font-semibold text-stone-700">{t('matchSetup.customColour')}</div>
          <div className="flex items-center gap-3">
            <TeamShirt color={shown} style={{ transform: 'scale(0.8)' }} data-preview />
            <input
              type="color"
              value={shown}
              onChange={(e) => edit(e.target.value.toLowerCase())}
              aria-label={t('matchSetup.customColour')}
              className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-stone-300 bg-white p-1"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`${uid}-hex`} className="text-xs text-stone-500">{t('matchSetup.customColourHex')}</label>
              <Input
                id={`${uid}-hex`}
                value={text}
                onChange={(e) => edit(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
                maxLength={9}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder="#rrggbb"
                invalid={!draft}
                aria-describedby={!draft ? `${uid}-hex-error` : undefined}
                className="font-mono"
              />
            </div>
          </div>
          {!draft && (
            <p id={`${uid}-hex-error`} className="m-0 text-xs text-red-700">{t('matchSetup.customColourInvalid')}</p>
          )}
          {draftClose && <CloseColourNote />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={apply} disabled={!draft}>{t('matchSetup.applyColour')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
