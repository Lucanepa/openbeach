// A name in a fixed cell of the PDF score sheet (the officials and line
// judges in APPROVAL, the players and coaches in TEAMS; owner 21.11.2026):
// one line in the cell's own font was all it had, and a long name was cut off
// at the cell's edge, on screen and in the PDF (APPROVAL: from 31 characters
// beside the Licence column; TEAMS: from 26). It now fits the cell, the most
// legible way first:
//   1. one line at the cell's size (8 px; 9 in TEAMS), then smaller in 0.5 px steps;
//   2. two lines, from the size at which two lines fit the row's height;
//   3. not below 75 % of the cell's size (6 px of 8): what still does not fit
//      ends in "…" at the end of the second line.
// The font is never set below the cell's size: the text box is laid out
// larger and scaled down (a transform), as the page fit does. Android's
// WebView draws any font under 8 px at 8 px (its minimum font size), which
// would cut the name again there (OpenVolley's FitText, 2026-11-16).

/** The smallest scale of the cell's font: 6 px of 8 px. */
export const NAME_FIT_MIN_SCALE = 0.75;
/** The font size steps, in px of the font as drawn. */
export const NAME_FIT_STEP_PX = 0.5;
/** A wrapped line's height, times its font size: room for g, p, y (Android cut them at 1). */
export const NAME_LINE_FACTOR = 1.15;
export const NAME_ELLIPSIS = '…';

export type NameFitStep = { px: number; lines: 1 | 2 };
export type NameFit = { scale: number; lines: 1 | 2; clipped: string | null };

/**
 * The sizes tried for a cell `boxH` px high in a `fontPx` font, most legible
 * first: each size on one line, then on two lines once two fit the height.
 */
export function nameFitSteps(fontPx: number, boxH: number, minScale = NAME_FIT_MIN_SCALE): NameFitStep[] {
  const steps: NameFitStep[] = [];
  const minPx = fontPx * minScale;
  const sizes: number[] = [];
  for (let px = fontPx; px >= minPx - 1e-6; px = Math.round((px - NAME_FIT_STEP_PX) * 1000) / 1000) sizes.push(px);
  // the smallest size itself when the steps miss it (9 px: ... 7, 6.75)
  if (sizes[sizes.length - 1] > minPx + 1e-6) sizes.push(minPx);
  for (const px of sizes) {
    steps.push({ px, lines: 1 });
    if (2 * px * NAME_LINE_FACTOR <= boxH + 0.01) steps.push({ px, lines: 2 });
  }
  return steps;
}

/**
 * The longest start of `text` that fits with "…" after it (`fits` says
 * whether a candidate does), or "…" alone.
 */
export function clipWithEllipsis(text: string, fits: (candidate: string) => boolean): string {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(text.slice(0, mid).trimEnd() + NAME_ELLIPSIS)) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + NAME_ELLIPSIS;
}

/**
 * Fits `text` into the textarea `el`, absolutely positioned at the top left
 * of its cell (its containing block): at scale k the textarea is laid out
 * 1/k as large as the cell, in the cell's `fontPx` font, and scaled by k, so
 * it covers the cell exactly. Leaves `el` showing what it should show (the
 * text, or with `clip` its start and "…") and returns the fit. Inline styles
 * only: the PDF copies the page's outerHTML. jsdom (no layout) fits at once.
 */
export function fitNameBox(el: HTMLTextAreaElement, text: string, { fontPx = 8, minScale = NAME_FIT_MIN_SCALE, clip = true } = {}): NameFit {
  const s = el.style;
  s.removeProperty('transform');
  s.width = '100%';
  s.height = '100%';
  s.fontSize = `${fontPx}px`;
  s.transformOrigin = '0 0';
  // a word too long for a line overflows (and makes the text smaller), not cut in two
  s.overflowWrap = 'normal';
  s.wordBreak = 'normal';
  if (el.value !== text) el.value = text;
  // the cell's height (fractional; the textarea at 100 %, untransformed)
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  const csH = cs && cs.height.endsWith('px') ? parseFloat(cs.height) : 0;
  const h = csH > 0 ? csH : el.clientHeight;
  const done = (scale: number, lines: 1 | 2, clipped: string | null): NameFit => {
    el.dataset.nameFit = String(Math.round(scale * 1000) / 1000);
    el.dataset.nameLines = String(lines);
    if (clipped == null) delete el.dataset.nameClipped;
    else el.dataset.nameClipped = 'true';
    return { scale, lines, clipped };
  };
  if (!(h > 0)) {
    s.lineHeight = '';
    return done(1, 1, null);
  }
  const apply = ({ px, lines }: NameFitStep) => {
    const k = px / fontPx;
    s.width = `${100 / k}%`;
    s.height = `${100 / k}%`;
    s.lineHeight = `${(lines === 1 ? h : h / 2) / k}px`;
    if (k < 1) s.transform = `scale(${k})`;
    else s.removeProperty('transform');
  };
  // layout sizes ignore the transform; 1 px for rounding (a wrapped line adds a whole line)
  const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  const steps = nameFitSteps(fontPx, h, minScale);
  for (const step of steps) {
    apply(step);
    if (fits()) return done(step.px / fontPx, step.lines, null);
  }
  // the last resort: the smallest size, cut at the end of its last line with "…"
  const last = steps[steps.length - 1];
  apply(last);
  s.overflowWrap = 'anywhere';
  if (!clip || fits()) return done(last.px / fontPx, last.lines, null);
  const shown = clipWithEllipsis(text, (candidate) => {
    el.value = candidate;
    return fits();
  });
  el.value = shown;
  return done(last.px / fontPx, last.lines, shown);
}
