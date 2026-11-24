/**
 * Scoreboard small items (OpenVolley 1444afec, 8a7c3afa, 70ecddac, 190ae045,
 * a2d056c6). Scoreboard_beach.jsx is too large to mount, so the source is
 * checked for the wiring.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
const between = (from, to) => {
  const start = sb.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const end = sb.indexOf(to, start + from.length)
  expect(end, to).toBeGreaterThan(start)
  return sb.slice(start, end)
}

describe('last action', () => {
  it('never shows an internal event name: the fallback is humanized', () => {
    const b = between('const getActionDescription = useCallback(', '// Show undo confirmation')
    expect(b).not.toMatch(/eventDescription = event\.type\n/)
    expect(b).toContain(".replace(/_/g, ' ')")
    expect(b).toContain('readable.charAt(0).toUpperCase() + readable.slice(1)')
  })

  it('every line is one fixed line with an ellipsis, the team line always there', () => {
    const b = between('data-testid="last-action"', '</div>\n                  )')
    expect(b.match(/\.\.\.oneLineStyle/g)).toHaveLength(4)
    expect(sb).toContain("const oneLineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25 }")
    expect(b).toContain("{teamName || '\\u00a0'}")
    expect(b).not.toContain('wordBreak')
  })
})

describe('"Replay rally" during a rally asks first', () => {
  it('the in-play button opens the confirmation instead of logging the replay', () => {
    const handler = between('const handleReplay = useCallback', '// Confirmed "Replay rally"')
    const inPlay = handler.slice(handler.indexOf("if (rallyStatus === 'in_play')"), handler.indexOf("if (rallyStatus === 'idle'"))
    expect(inPlay).toContain('setReplayConfirm(true)')
    expect(inPlay).not.toContain("logEvent('replay')")
    expect(handler).toContain('setReplayRallyConfirm({')
  })

  it('only the confirmation logs the replay, once, and only while the rally is in play', () => {
    const confirm = between('const confirmReplay = useCallback', 'const cancelReplay')
    expect(confirm).toContain('runReplayConfirm(async () => {')
    expect(confirm).toContain("if (rallyStatus !== 'in_play') return")
    expect(confirm).toContain("await logEvent('replay')")
    expect(sb.match(/logEvent\('replay'\)/g)).toHaveLength(1)
  })

  it('the modal is a decision modal: Enter confirms it, the point keys wait', () => {
    const keys = between('const handleKeyDown = (e) =>', "window.addEventListener('keydown', handleKeyDown)")
    expect(keys).toMatch(/const hasDecisionModal = [^;]*replayConfirm \|\|/)
    expect(keys).toMatch(/if \(replayConfirm\) \{\s*e\.preventDefault\(\)\s*confirmReplay\(\)/)
  })

  it('the modal uses translated texts', () => {
    const modal = between('{replayConfirm && (', '</Modal>')
    expect(modal).toContain("t('scoreboard.modals.confirmReplay')")
    expect(modal).toContain("t('scoreboard.modals.confirmReplayBody')")
    expect(modal).toContain('onClick={confirmReplay}')
    expect(modal).toContain('onClick={cancelReplay}')
  })
})

describe('Sanctions and results with long team names', () => {
  it('the two halves may shrink and stack; the names wrap; the results tables keep their columns', () => {
    const b = between("title={t('scoreboard.modals.sanctionsAndResults')}", '        </Modal>')
    expect(b).toContain("gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))'")
    expect(b).not.toContain("overflowX: 'auto'")
    expect(b).not.toContain("wordBreak: 'break-word'")
    expect(b.match(/overflowWrap: 'anywhere', minWidth: 0/g).length).toBeGreaterThanOrEqual(4)
    expect(b.match(/tableLayout: 'fixed'/g).length).toBeGreaterThanOrEqual(2)
  })
})

describe('formal warning notice', () => {
  it('shows a real yellow card in amber, readable on the light screen', () => {
    expect(sb).not.toContain("color: '#fde047'\n                }}>\n                  {t('scoreboard.sanctions.sanctionedFormalWarning')}")
    expect(sb.match(/className="sanction-card yellow"/g).length).toBeGreaterThanOrEqual(2)
  })
})
