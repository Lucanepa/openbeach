// The native <select>: one look on every engine (OpenVolley's
// src/ui/__tests__/selectStyles.test.jsx, ported to OpenBeach).
//
// The owner's report (OpenBeach match setup, desktop app): the Gender / Phase /
// Round / Coach selects were grey, square-cornered boxes inside the rounded
// fields, unlike the rounded white text inputs beside them. Causes, all guarded
// here:
//   1. appearance: auto, so WebKitGTK (Linux desktop) and Android WebView drew
//      their own grey, square, inset menulist inside the kit's rounded box.
//   2. The legacy element rule `select { padding; line-height: 1.3;
//      text-transform: capitalize; background: #0f172a }` (styles_beach.css,
//      legacy layer) reached the kit Select, whose classes set no vertical
//      padding or line height, and capitalised every option label.
// The kit Select now carries `ov-select` (tokens.css: appearance none, the
// chevron, no vertical padding) and a line height equal to its inner height;
// every select rule in styles_beach.css skips `.ov-select`, and the raw legacy
// selects get the same appearance none + chevron.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Select, SELECT_SIZES } from '../Select.jsx';
import { INPUT_SIZES } from '../Input.jsx';

const SRC = path.resolve(__dirname, '../../..'); // escoresheet/frontend/src_beach
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

function sourceFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!/__tests__|node_modules/.test(f)) out.push(...sourceFiles(p));
    } else if (/\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f)) {
      out.push(p);
    }
  }
  return out;
}

afterEach(cleanup);

describe('kit Select', () => {
  it('md: ov-select, the Input md height, centred text, room for the chevron', () => {
    const { getByRole } = render(
      <Select aria-label="Gender" value="men" onChange={() => {}}>
        <option value="men">Men</option>
      </Select>,
    );
    const cls = getByRole('combobox').className.split(/\s+/);
    for (const c of ['ov-select', 'h-9', 'py-0', 'leading-[34px]', 'pl-3', 'pr-8', 'text-sm', 'rounded-lg', 'bg-white']) {
      expect(cls).toContain(c);
    }
    expect(cls).not.toContain('capitalize');
  });

  it('lg: h-11 rounded-xl white with a 42 px line height, like Input lg', () => {
    const { getByRole } = render(<Select size="lg" aria-label="x" options={[{ value: 'a', label: 'A' }]} />);
    const cls = getByRole('combobox').className.split(/\s+/);
    for (const c of ['ov-select', 'h-11', 'py-0', 'leading-[42px]', 'rounded-xl', 'border-stone-200', 'bg-white']) {
      expect(cls).toContain(c);
    }
  });

  it('keeps ov-select when a caller passes its own classes, block and invalid', () => {
    const { getByRole } = render(
      <Select aria-label="x" block invalid className="w-16 text-xs" options={[{ value: 'a', label: 'A' }]} />,
    );
    const el = getByRole('combobox');
    const cls = el.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['ov-select', 'w-16', 'text-xs', 'border-red-400']));
    expect(cls).not.toContain('w-full'); // tailwind-merge: the caller's width wins
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  it('an unknown size falls back to md', () => {
    const { getByRole } = render(<Select size="xl" aria-label="x" options={[]} />);
    expect(getByRole('combobox').className).toContain('h-9');
  });

  it('each size has the height, radius, border and fill of the Input of the same name', () => {
    const px = { 'h-9': 36, 'h-11': 44 };
    for (const size of ['md', 'lg']) {
      const h = SELECT_SIZES[size].match(/\bh-(9|11)\b/)[0];
      expect(INPUT_SIZES[size]).toMatch(new RegExp(`\\b${h}\\b`));
      expect(SELECT_SIZES[size]).toContain(`leading-[${px[h] - 2}px]`);
      expect(SELECT_SIZES[size]).toMatch(/\bpy-0\b/);
      for (const token of ['rounded-lg', 'rounded-xl', 'border-stone-200', 'border-stone-300', 'bg-white']) {
        const inInput = new RegExp(`(^|\\s)${token}(\\s|$)`).test(INPUT_SIZES[size]);
        const inSelect = new RegExp(`(^|\\s)${token}(\\s|$)`).test(SELECT_SIZES[size]);
        expect(inSelect, `${size} ${token}`).toBe(inInput);
      }
    }
  });
});

describe('select CSS', () => {
  // Split a selector list at its top-level commas (not inside :is()/:where()).
  function splitSelectors(list) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function selectorsOf(css) {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [];
    for (const m of noComments.matchAll(/([^{}]+)\{/g)) {
      const prelude = m[1].trim();
      if (!prelude || prelude.startsWith('@')) continue;
      const line = noComments.slice(0, m.index).split('\n').length;
      for (const s of splitSelectors(prelude)) sels.push({ s, line });
    }
    return sels;
  }
  // Reaches a <select>, or (inside :is()) a list that contains one.
  const TARGETS_SELECT = /(^|[\s>+~(,])select(?![\w-])/;
  const unscoped = ({ s }) => {
    if (!TARGETS_SELECT.test(s)) return false;
    // every `select` in the selector must be followed by the .ov-select opt-out
    return [...s.matchAll(/(^|[\s>+~(,])select(?![\w-])/g)].some((m) => {
      const after = s.slice(m.index + m[0].length);
      return !/^(?::where|:not)\(:?(?:not\()?\.ov-select\)/.test(after);
    });
  };

  it('the scanner sees an unscoped select and accepts the scoped forms', () => {
    const css = [
      'select { a: b }',
      '.x select, .y input { a: b }',
      'select:where(:not(.ov-select)) { a: b }',
      '.r select:where(:not(.ov-select)) { }',
      '.m :is(input, select:where(:not(.ov-select)), textarea):focus { }',
      '.m :is(input, select, textarea) { }',
      '.coin-toss-select { }',
    ].join('\n');
    expect(selectorsOf(css).filter(unscoped).map(({ s }) => s)).toEqual([
      'select',
      '.x select',
      '.m :is(input, select, textarea)',
    ]);
  });

  it('every select rule in the legacy styles_beach.css skips the kit Select (.ov-select)', () => {
    const bad = selectorsOf(read('styles_beach.css'))
      .filter(unscoped)
      .map(({ s, line }) => `styles_beach.css:${line} ${s}`);
    expect(bad).toEqual([]);
  });

  it('no stylesheet capitalises select text or brings back the native menulist', () => {
    for (const rel of ['styles_beach.css', 'tailwind_beach.css', 'ui/volleyui/tokens.css']) {
      const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!TARGETS_SELECT.test(m[1]) && !m[1].includes('.ov-select')) continue;
        expect(m[2], `${rel}: ${m[1].trim()}`).not.toMatch(/text-transform:\s*capitalize/);
        expect(m[2], `${rel}: ${m[1].trim()}`).not.toMatch(/appearance:\s*(auto|menulist)/);
      }
    }
  });

  it('tokens.css gives .ov-select appearance none, the chevron and no vertical padding', () => {
    const css = read('ui/volleyui/tokens.css');
    const rule = css.match(/\.ov-select\s*\{([^}]*)\}/)[1];
    expect(rule).toMatch(/(^|\s)appearance:\s*none/);
    expect(rule).toMatch(/-webkit-appearance:\s*none/);
    expect(rule).toMatch(/background-image:\s*url\("data:image\/svg\+xml/);
    expect(rule).toMatch(/padding-block:\s*0/);
    expect(rule).toMatch(/text-transform:\s*none/);
    expect(rule).toMatch(/font-family:\s*inherit/);
  });

  it('.ov-select sits in the components layer (above legacy, below utilities)', () => {
    const order = read('tailwind_beach.css').match(/@layer\s+([\w\s,]+);/)[1].split(/\s*,\s*/);
    expect(order.indexOf('legacy')).toBeLessThan(order.indexOf('components'));
    expect(order.indexOf('components')).toBeLessThan(order.indexOf('utilities'));
    const css = read('ui/volleyui/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const layer = css.indexOf('@layer components');
    expect(layer).toBeGreaterThan(-1);
    expect(css.indexOf('.ov-select', layer)).toBeGreaterThan(layer);
  });

  it('the legacy select draws the same chevron with appearance none, over inline backgrounds', () => {
    const css = read('styles_beach.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = css.match(/(?:^|\})\s*select:where\(:not\(\.ov-select\)\)\s*\{([^}]*)\}/)[1];
    expect(body).toMatch(/-webkit-appearance:\s*none/);
    expect(body).toMatch(/(^|[\s;])appearance:\s*none/);
    expect(body).toMatch(/background-image:\s*url\("data:image\/svg\+xml[^;]*!important/);
    expect(body).toMatch(/padding-right:[^;]*!important/);
    // the `background:` shorthand would reset the chevron; only the colour is set
    expect(body).not.toMatch(/(^|[\s;])background:/);
  });
});

describe('select call sites', () => {
  const files = sourceFiles(SRC).filter((f) => !f.includes(`${path.sep}ui${path.sep}volleyui${path.sep}`));
  const rel = (f) => path.relative(SRC, f);

  // The raw <select>s still in the legacy screens. Each sets its own border,
  // radius and fill inline, the same as the text inputs beside it, and the
  // legacy rule above gives it appearance none + the chevron. Everything else
  // uses the kit <Select>. This list may only shrink: a new raw <select> (or
  // one more in these files) fails here; use <Select> from ui/volleyui.
  const RAW_SELECTS_ALLOWED = {
    'components_beach/Scoreboard_beach.jsx': 12, // manual-edit panel, small inline fields
    'components_beach/ManualAdjustments_beach.jsx': 4, // inputStyle, as its inputs
    'components_beach/admin/CompMatchEditor_beach.jsx': 1, // dark admin console field
  };

  it('no new raw <select>: every other select is the kit <Select>', () => {
    const found = {};
    for (const file of files) {
      const n = (fs.readFileSync(file, 'utf8').match(/<select\b/g) || []).length;
      if (n) found[rel(file).split(path.sep).join('/')] = n;
    }
    expect(found).toEqual(RAW_SELECTS_ALLOWED);
  });

  it('every remaining raw <select> styles itself (inline style), never the bare UA box', () => {
    const bad = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<select\b/g)) {
        // the opening tag's props: up to its first option (an onChange arrow has a `>`)
        const rest = src.slice(m.index);
        const end = rest.search(/<option\b|<\/select>|\.map\(/);
        if (!/\bstyle=\{/.test(rest.slice(0, end))) bad.push(`${rel(file)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no raw <select> dressed as a kit control (h-9 / h-11 / rounded-lg / rounded-xl): use <Select>', () => {
    const bad = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<select\b[^>]*?className=\{?["'`]?([^"'`}]*)/g)) {
        if (/\b(h-9|h-11|rounded-lg|rounded-xl)\b/.test(m[1])) bad.push(`${rel(file)}: ${m[1].slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no kit Select capitalizes its labels', () => {
    const bad = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<Select\b[^>]*>/g)) if (/\bcapitalize\b/.test(m[0])) bad.push(rel(file));
    }
    expect(bad).toEqual([]);
  });

  // The OpenBeach screencast of 2026-10-08: the closed selects looked right,
  // but their native popup still opened as a dark GTK list in the Linux app.
  // Two to five choices are now kit choice controls, no native select at all.
  it('match setup Gender / Phase / Round / Coach are kit choices, not native selects', () => {
    const src = read('components_beach/MatchSetup_beach.jsx');
    for (const v of ['type2', 'phase', "hasCoach ? 'yes' : 'no'"]) {
      expect(src).toContain(`value={${v}}`);
    }
    expect(src).toMatch(/<FilterPill key=\{value\} active=\{round === value\}/);
    expect(src).not.toMatch(/<Select size="lg" block value=\{(type2|phase|round)\}/);
  });
});

describe('option labels', () => {
  // Every i18n key rendered as an <option> starts with a capital letter in
  // every locale: sentence case, now that no stylesheet capitalises select text.
  const LOCALES = ['en', 'de', 'de-CH', 'fr', 'it'].map((l) => [l, JSON.parse(read(`i18n_beach/locales/${l}.json`))]);
  const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);

  function optionKeys() {
    const keys = new Set();
    for (const file of sourceFiles(SRC)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<option[^>]*>\s*\{\s*t\(\s*['"`]([\w.]+)['"`]/g)) keys.add(m[1]);
    }
    return keys;
  }

  it('finds the option labels', () => {
    const keys = optionKeys();
    expect(keys).toContain('savedTeams.pickerAll');
  });

  it('start with a capital letter in all five locales', () => {
    const bad = [];
    for (const k of optionKeys()) {
      for (const [l, dict] of LOCALES) {
        const v = get(dict, k);
        if (typeof v === 'string' && /^\p{Ll}/u.test(v)) bad.push(`${l} ${k} = ${JSON.stringify(v)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
