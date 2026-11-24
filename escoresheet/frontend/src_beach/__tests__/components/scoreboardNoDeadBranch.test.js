// The scoring screen has no branch behind a constant condition. OpenVolley's
// had a whole smartphone layout behind `{false ? (...) : (...)}` (removed
// 2026-10-09: never drawn, it still called the point, sanction and time-out
// paths with stale arguments). OpenBeach's screen has none; this keeps it so.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Lines with a conditional on a literal: `{false ? …`, `(true && …`,
// `= false ? …` (comments left out)
function constantBranches(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '')
  const found = []
  code.split('\n').forEach((line, i) => {
    // not a comparison (`=== true ||`)
    if (/(^|[{(:?,]|(?<![=!<>])=|\breturn)\s*(false|true)\s*(\?|&&|\|\|)/.test(line)) found.push(i + 1)
  })
  return found
}

describe('Scoreboard_beach: no dead branches', () => {
  it('no `false ? … : …` (or `true &&`) in the scoring screen', () => {
    const source = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
    expect(constantBranches(source)).toEqual([])
  })

  it('the check finds one, not a comparison', () => {
    expect(constantBranches('const a = <div>{false ? (<b />) : (<i />)}</div>\nconst b = x === true || y\nconst c = true && z')).toEqual([1, 3])
  })
})
