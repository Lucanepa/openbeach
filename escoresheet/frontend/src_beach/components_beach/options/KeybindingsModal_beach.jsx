import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal as KitModal } from '../../ui/volleyui/Modal.jsx'
import { Button } from '../../ui/volleyui/Button.jsx'
import { cn } from '../../ui/volleyui/cn.js'

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  pointLeft: 'a',
  pointRight: 'l',
  timeoutLeft: 'q',
  timeoutRight: 'p',
  undo: 'z',
  confirm: 'Enter',
  cancel: 'Escape',
  startRally: 'Enter'
})

const KEY_BINDING_KEYS = Object.keys(DEFAULT_KEY_BINDINGS)

const KEY_NAMES = { ' ': 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }

/** A key as the scorer reads it on its button. */
export function keyName(key) {
  if (!key) return '–'
  return KEY_NAMES[key] || (key.length === 1 ? key.toUpperCase() : key)
}

function loadBindings() {
  try {
    const saved = localStorage.getItem('keyBindings')
    return saved ? { ...DEFAULT_KEY_BINDINGS, ...JSON.parse(saved) } : { ...DEFAULT_KEY_BINDINGS }
  } catch {
    return { ...DEFAULT_KEY_BINDINGS }
  }
}

/**
 * Home → Options → Keyboard shortcuts: press a row's key button, then the new
 * key (Escape keeps the old one). Saved in localStorage 'keyBindings'.
 */
export default function KeybindingsModal({ open, onClose }) {
  const { t } = useTranslation()
  const [bindings, setBindings] = useState(loadBindings)
  const [editingKey, setEditingKey] = useState(null)

  // Capture the next key press for the row being edited.
  useEffect(() => {
    if (!editingKey) return undefined
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key !== 'Escape') {
        setBindings(prev => {
          const next = { ...prev, [editingKey]: e.key }
          localStorage.setItem('keyBindings', JSON.stringify(next))
          return next
        })
      }
      setEditingKey(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editingKey])

  if (!open) return null
  const close = () => { setEditingKey(null); onClose() }

  return (
    <div className="ov-kit" style={{ position: 'relative', zIndex: 1100 }}>
      <KitModal
        open
        size="md"
        layout="sections"
        onClose={close}
        closeLabel={t('common.close')}
        title={t('options.keybindings')}
        footer={(
          <>
            <Button
              variant="secondary"
              size="lg"
              className="mr-auto"
              onClick={() => {
                setBindings({ ...DEFAULT_KEY_BINDINGS })
                localStorage.setItem('keyBindings', JSON.stringify(DEFAULT_KEY_BINDINGS))
              }}
            >
              {t('options.resetDefaults')}
            </Button>
            <Button variant="dark" size="lg" onClick={close}>{t('options.done', 'Done')}</Button>
          </>
        )}
      >
        <div className="divide-y divide-stone-100">
          {KEY_BINDING_KEYS.map(key => (
            <div key={key} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="text-sm text-stone-800">{t(`options.keybindingLabels.${key}`)}</span>
              <button
                type="button"
                aria-pressed={editingKey === key}
                onClick={() => setEditingKey(editingKey === key ? null : key)}
                className={cn(
                  'h-9 min-w-20 rounded-lg border px-3 font-mono text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1',
                  editingKey === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
                )}
              >
                {editingKey === key ? t('options.pressKey') : keyName(bindings[key])}
              </button>
            </div>
          ))}
        </div>
      </KitModal>
    </div>
  )
}
