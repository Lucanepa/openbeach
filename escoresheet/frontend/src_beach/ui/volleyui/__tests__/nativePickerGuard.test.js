// Guard: no new native date / time pickers. The WebKitGTK date popup in the
// Linux desktop app could not be closed ("i can't get out of the date
// picker", OpenVolley b20cc6ef), and WebKit shows today's date in an EMPTY
// native date field. Use the kit's DateField / TimeField / DateTimeField
// (ui/volleyui/DateField.jsx): typed DD.MM.YYYY / HH:MM with the kit's own
// popovers, ISO values in and out.
//
// PENDING lists the screens not converted yet, with how many native fields
// each still has: the count may only go down. Remove a line once its screen
// uses the kit fields.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..'); // escoresheet/frontend
const DIRS = ['src_beach', 'scoresheet_pdf_beach'];

const PENDING = {
  'src_beach/components_beach/MatchSetup_beach.jsx': 3, // dates of birth (not batch C)
  'src_beach/components_beach/Scoreboard_beach.jsx': 2, // set start / end times (batch B owns the file)
  'src_beach/components_beach/admin/CompMatchEditor_beach.jsx': 2, // competition admin date + time
};

// <input type="date">, type='time', type={'datetime-local'}, type={x ? 'date' : 'text'}
const JSX_TYPE = /\btype=\{?\s*(?:[^}>]*\?\s*)?['"`](date|time|datetime-local|month|week)['"`]/;
// el.type = 'date', setAttribute('type', 'date'), createElement('input', { type: 'date' })
const IMPERATIVE = /\.type\s*=\s*['"`](?:date|time|datetime-local|month|week)['"`]|setAttribute\(\s*['"]type['"]\s*,\s*['"](?:date|time|datetime-local|month|week)['"]|\btype\s*:\s*['"](?:date|time|datetime-local|month|week)['"]/;

/** Native date/time inputs in one source text: [{ line, text }]. Comments are ignored. */
export function findNativePickers(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const hits = [];
  code.split('\n').forEach((line, i) => {
    if (JSX_TYPE.test(line) || IMPERATIVE.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 100) });
  });
  return hits;
}

function sourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('native date/time picker guard', () => {
  it('the scanner finds every form (and ignores comments and the kit fields)', () => {
    const bad = `
      const A = () => <input type="date" value={v} />
      const B = () => <Input type='time' />
      const C = () => <input type={'datetime-local'} />
      const D = () => <input type={wide ? 'date' : 'text'} />
      el.type = 'date'
      const spec = { type: 'time', name: 'x' }
    `;
    expect(findNativePickers(bad).map((h) => h.line)).toEqual([2, 3, 4, 5, 6, 7]);
    const good = `
      // Not <input type="date">: WebKit pre-fills it
      /* <input type="time"> */
      const A = () => <DateField value={v} onChange={setV} />
      const B = () => <input type="text" inputMode="numeric" />
      const C = () => <TimeField step={5} />
      const k = { type: 'text' }
    `;
    expect(findNativePickers(good)).toEqual([]);
  });

  it('no new native type=date/time/datetime-local/month/week input in src_beach/ or scoresheet_pdf_beach/', () => {
    const hits = {};
    for (const dir of DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        const found = findNativePickers(fs.readFileSync(file, 'utf8'));
        if (found.length) hits[rel] = found.map((h) => `${h.line} ${h.text}`);
      }
    }
    const over = Object.entries(hits)
      .filter(([rel, list]) => list.length > (PENDING[rel] ?? 0))
      .map(([rel, list]) => `${rel}: ${list.join(' | ')}`);
    expect(over).toEqual([]);
  }, 60_000);

  it('the converted screens use the kit fields', () => {
    for (const rel of ['src_beach/components_beach/CoinToss_beach.jsx', 'src_beach/components_beach/ManualAdjustments_beach.jsx']) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(findNativePickers(src), rel).toEqual([]);
      expect(src, rel).toMatch(/<DateField\b/);
    }
  });
});
