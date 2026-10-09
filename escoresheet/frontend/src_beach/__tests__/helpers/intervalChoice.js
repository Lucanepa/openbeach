// The interval's choice (components_beach/scoreboard/IntervalChoice_beach):
// a test switches the sides or the serve as the scorer does, by recording
// what the team that chooses took (when nothing is recorded yet: "Side"),
// then tapping the option that is not the current one in that row.
import { fireEvent, waitFor } from '@testing-library/react'

const q = (id, root = document) => root.querySelector(`[data-testid="${id}"]`)

/** The interval's choice is shown (the setup of set 2, or set 3 after its toss). */
export const intervalChoiceShown = (root = document) => !!q('interval-choice', root)

/** Switch the sides (`kind` 'side') or the serve (`kind` 'serve') in the interval. */
export async function tapInterval(kind, root = document) {
  if (!q(`interval-${kind}-row`, root)) {
    const choose = q('interval-choice-side', root)
    if (!choose) {
      // no toss recorded (an older match): the plain switches
      const label = kind === 'side' ? 'Switch sides' : 'Switch serve'
      const plain = [...(q('interval-choice', root)?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === label)
      if (!plain) throw new Error('no interval choice on screen')
      fireEvent.click(plain)
      return
    }
    fireEvent.click(choose)
    await waitFor(() => { if (!q(`interval-${kind}-row`, root)) throw new Error(`no ${kind} row`) })
  }
  const other = [...q(`interval-${kind}-row`, root).querySelectorAll('button')]
    .find(b => b.getAttribute('aria-pressed') === 'false')
  fireEvent.click(other)
}

/** The "Change" button of a team's serve order (its box names the team). */
export function serveOrderChange(teamName, root = document) {
  return [...root.querySelectorAll('[data-testid="serve-order-change"]')]
    .find(b => (b.getAttribute('aria-label') || '').includes(teamName))
}
