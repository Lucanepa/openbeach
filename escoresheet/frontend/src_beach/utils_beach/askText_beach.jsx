// The one way the app asks for a line of text: window.prompt's replacement
// (OpenVolley c79b7b65, utils/askText.js).
//
// An in-app volleyui dialog with a text field, the same in the browser, the
// desktop app and Android, instead of the native prompt() a webview may
// replace or not show at all. OpenVolley adds a text field to the kit's
// confirmDialog; here the dialog is the kit Modal in a root of its own
// (`.ov-kit .ov-kit-host`, the stacking box <UiHost /> uses), so it needs no
// change to the kit and shows on top of the legacy overlays too.
//
// Never call it inside a Dexie transaction: awaiting the user there commits
// the transaction early. Ask first, then open the transaction.
import { useId, useState } from 'react'
import { createRoot } from 'react-dom/client'
// The app's i18next instance (i18n_beach/index_beach.js initialises it);
// imported directly so this module has no side effects of its own.
import i18n from 'i18next'
import { Modal, modalCancelClass, modalPrimaryClass } from '../ui/volleyui/Modal.jsx'
import { Input } from '../ui/volleyui/Input.jsx'
import { cn } from '../ui/volleyui/cn.js'

function TextDialog({ title, message, label, defaultValue, placeholder, type, inputMode, confirmLabel, cancelLabel, onDone }) {
  const [text, setText] = useState(defaultValue)
  const inputId = useId()
  const formId = useId()
  const hasMessage = message !== undefined && message !== null && message !== ''
  return (
    <Modal
      open
      decision
      size="sm"
      title={title}
      closeLabel={cancelLabel}
      onClose={() => onDone(null)}
      footer={(
        <>
          <button type="button" className={cn(modalCancelClass, 'min-h-11')} onClick={() => onDone(null)} data-testid="ask-text-cancel">
            {cancelLabel}
          </button>
          <button type="submit" form={formId} className={cn(modalPrimaryClass, 'min-h-11')} data-testid="ask-text-accept">
            {confirmLabel}
          </button>
        </>
      )}
    >
      {hasMessage && <p className="mb-3 whitespace-pre-line text-sm text-stone-600" data-testid="ask-text-message">{message}</p>}
      <form id={formId} onSubmit={(e) => { e.preventDefault(); onDone(text) }}>
        {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-stone-700">{label}</label>}
        <Input
          id={inputId}
          size="lg"
          data-autofocus
          data-testid="ask-text-input"
          type={type ?? 'text'}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={label ? undefined : title}
        />
      </form>
    </Modal>
  )
}

/**
 * Ask for a line of text. ALWAYS await it:
 *
 *   const pin = await askText({ title: t('...'), label: t('...') })
 *   if (pin === null) return // cancelled
 *
 * @param {object} opts
 * @param {string} opts.title          what is asked (sentence case)
 * @param {import('react').ReactNode} [opts.message]  more context; newlines are kept
 * @param {string} [opts.label]        the field's label
 * @param {string} [opts.defaultValue] pre-filled text
 * @param {string} [opts.placeholder]
 * @param {string} [opts.type]         input type, 'text' by default
 * @param {string} [opts.inputMode]    e.g. 'numeric'
 * @param {string} [opts.confirmLabel] a verb; defaults to common.ok
 * @param {string} [opts.cancelLabel]  defaults to common.cancel
 * @returns {Promise<string|null>} the typed text (possibly ''), or null on Cancel / Escape / the backdrop / ×
 */
export function askText({
  title, message, label, defaultValue = '', placeholder, type, inputMode, confirmLabel, cancelLabel
} = {}) {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.className = 'ov-kit ov-kit-host'
    document.body.appendChild(host)
    const root = createRoot(host)
    let settled = false
    const onDone = (value) => {
      if (settled) return
      settled = true
      resolve(value)
      // After this event: the Modal's cleanup gives the focus back to what had it
      setTimeout(() => { root.unmount(); host.remove() }, 0)
    }
    root.render(
      <TextDialog
        title={title}
        message={message}
        label={label}
        defaultValue={defaultValue}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        confirmLabel={confirmLabel ?? i18n.t('common.ok', 'OK')}
        cancelLabel={cancelLabel ?? i18n.t('common.cancel', 'Cancel')}
        onDone={onDone}
      />
    )
  })
}

export default askText
