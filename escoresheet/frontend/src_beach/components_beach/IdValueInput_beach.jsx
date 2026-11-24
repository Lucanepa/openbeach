import { useRef, useState } from 'react'
import { Input } from '../ui/volleyui/Input.jsx'
import { cleanIdValue, displayIdValue, typedIdValue } from '../utils_beach/idValue_beach'

/**
 * The value beside a person's name: a licence number, or a date of birth
 * typed with dots (utils_beach/idValue_beach). A text field, inputMode
 * "text": an iPad's numeric keypad has no "." key. While it has the focus it
 * keeps what is typed (digits and . / - only); when it loses the focus the
 * value is cleaned once (a date as dd.mm.yyyy, a licence as its digits).
 * @param {{ value?: string|null, onChange: (v: string) => void, size?: string, className?: string }} props
 *   and any other Input prop (aria-label, placeholder, id, data-testid)
 */
export default function IdValueInput({ value, onChange, size = 'lg', className, onFocus, onBlur, ...rest }) {
  const [draft, setDraft] = useState(null)
  const edited = useRef(false)
  const shown = draft ?? displayIdValue(value)
  return (
    <Input
      {...rest}
      size={size}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={10}
      className={className}
      value={shown}
      onFocus={(e) => {
        edited.current = false
        setDraft(displayIdValue(value))
        onFocus?.(e)
      }}
      onChange={(e) => {
        const typed = typedIdValue(e.target.value)
        edited.current = true
        setDraft(typed)
        onChange(typed)
      }}
      onBlur={(e) => {
        const typed = draft
        setDraft(null)
        if (edited.current) {
          const clean = cleanIdValue(typed)
          if (clean !== typed) onChange(clean)
        }
        edited.current = false
        onBlur?.(e)
      }}
    />
  )
}
