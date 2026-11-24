// Every cloud job the scoring screen queues carries a status: the sync queue
// sends only the jobs it finds by status ('queued'). The court switches (at
// 7 / 5 points, after the TTO, back), Manual changes' "Switch sides", "Swap
// team A ↔ B" and the server order buttons added { createdAt } jobs with no
// status: none of them ever reached the cloud (found 2026-10-09, next to
// "Switch serve"). Read from the source, as coinTossSwap.test does.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')

// The object literal of each `sync_queue.add({ ... })`
function jobLiterals(text) {
  const out = []
  const re = /sync_queue\.add\(\{/g
  let m
  while ((m = re.exec(text))) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) break
    }
    out.push({ line: text.slice(0, m.index).split('\n').length, body: text.slice(m.index, i + 1) })
  }
  return out
}

describe('Scoreboard_beach: queued cloud jobs', () => {
  it('every literal job has status \'queued\' and a ts', () => {
    const jobs = jobLiterals(source)
    expect(jobs.length).toBeGreaterThan(10)
    const withoutStatus = jobs.filter(j => !/status:\s*'queued'/.test(j.body) || !/\bts:/.test(j.body)).map(j => j.line)
    expect(withoutStatus).toEqual([])
  })
})
