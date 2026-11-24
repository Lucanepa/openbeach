// The licence field beside a name (owner 19.11.2026): a text field with a
// full keyboard (inputMode "text": an iPad's numeric keypad has no "."),
// digits and . / - only while typing, cleaned once when it loses the focus.
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import IdValueInput from '../../components_beach/IdValueInput_beach'

function Harness({ initial = '', onValue = () => {} }) {
  const [v, setV] = useState(initial)
  return <IdValueInput aria-label="Licence" value={v} onChange={(x) => { setV(x); onValue(x) }} />
}

const type = async (el, value) => {
  fireEvent.focus(el)
  await act(async () => { fireEvent.change(el, { target: { value } }) })
}

describe('IdValueInput_beach', () => {
  it('a text field with the full keyboard, never a date picker', () => {
    render(<Harness />)
    const el = screen.getByLabelText('Licence')
    expect(el).toHaveAttribute('type', 'text')
    expect(el).toHaveAttribute('inputmode', 'text')
    expect(el).toHaveAttribute('maxlength', '10')
  })

  it('a licence stays its digits', async () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const el = screen.getByLabelText('Licence')
    await type(el, '12a34 56')
    expect(el).toHaveValue('123456')
    await act(async () => { fireEvent.blur(el) })
    expect(el).toHaveValue('123456')
    expect(onValue).toHaveBeenLastCalledWith('123456')
  })

  it('a date typed with dots is kept while typing and as dd.mm.yyyy after', async () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const el = screen.getByLabelText('Licence')
    // half typed: never turned into a licence or a full year on the way
    await type(el, '14.03.20')
    expect(el).toHaveValue('14.03.20')
    await act(async () => { fireEvent.change(el, { target: { value: '14.03.2008' } }) })
    await act(async () => { fireEvent.blur(el) })
    expect(el).toHaveValue('14.03.2008')
    expect(onValue).toHaveBeenLastCalledWith('14.03.2008')
  })

  it('a date with slashes or one-digit parts becomes dd.mm.yyyy when the field is left', async () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const el = screen.getByLabelText('Licence')
    await type(el, '4/3/2008')
    await act(async () => { fireEvent.blur(el) })
    expect(el).toHaveValue('04.03.2008')
    expect(onValue).toHaveBeenLastCalledWith('04.03.2008')
  })

  it('shows a stored ISO date as dd.mm.yyyy and the 01.01.1900 placeholder as empty, without changing them', () => {
    const onValue = vi.fn()
    const { unmount } = render(<Harness initial="2008-03-14" onValue={onValue} />)
    expect(screen.getByLabelText('Licence')).toHaveValue('14.03.2008')
    unmount()
    render(<Harness initial="01.01.1900" onValue={onValue} />)
    const el = screen.getByLabelText('Licence')
    expect(el).toHaveValue('')
    // focus and leave without typing: no change reported
    fireEvent.focus(el)
    fireEvent.blur(el)
    expect(onValue).not.toHaveBeenCalled()
  })
})
