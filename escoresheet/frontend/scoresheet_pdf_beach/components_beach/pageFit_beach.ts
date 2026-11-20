// A page of the PDF score sheet is a fixed print area (277 x 190 mm, overflow
// hidden) and the PDF captures exactly that box: content taller than the page
// was cut off at its bottom without a word. Page 2 was 19 px too tall for
// every match (the captains' post-match signatures and "Winner of Coin Toss"
// cut, 2026-11-20), and a match with coaches lost 34 px of page 1 and 93 px
// of page 2. The page's layout fits a match without coaches; this is the
// safety net for the rest (coaches, another engine's font metrics): the
// page's content is scaled down from its top left until all of it fits.

/** Overflow a page absorbs at full size: it ends in the page's 2 mm padding, still on the sheet. */
export const PAGE_FIT_TOLERANCE_PX = 2;

/**
 * The scale that fits content `natural` px tall into a box `box` px tall: 1
 * when it fits (within the tolerance), else box / natural. Unknown sizes
 * (0, no layout) fit.
 */
export function pageFitScale(natural: number, box: number, tolerance = PAGE_FIT_TOLERANCE_PX): number {
  if (!(natural > 0) || !(box > 0)) return 1;
  if (natural <= box + tolerance) return 1;
  return box / natural;
}

const FIT_PROPS = ['flex', 'width', 'height', 'transform', 'transform-origin'];

/**
 * Fits a page's content wrapper (a flex-1 column inside the page) into the
 * page. Its natural height is measured with the wrapper sized to its content;
 * taller than the page's box, it is laid out at box / scale and scaled by
 * `scale` from its top left, so it covers the box exactly and its flex-1 parts
 * still fill it. Returns the scale (1: untouched) and writes it to
 * data-fit-scale. Inline styles only: the PDF copies the page's outerHTML.
 */
export function fitPageContent(el: HTMLElement): number {
  const s = el.style;
  for (const p of FIT_PROPS) s.removeProperty(p);
  const boxW = el.clientWidth;
  const boxH = el.clientHeight;
  s.flex = 'none';
  s.height = 'auto';
  const natural = Math.max(el.offsetHeight, el.scrollHeight);
  const scale = pageFitScale(natural, boxH);
  if (scale === 1) {
    for (const p of FIT_PROPS) s.removeProperty(p);
    delete el.dataset.fitScale;
    return 1;
  }
  s.width = `${boxW / scale}px`;
  s.height = `${boxH / scale}px`;
  s.transform = `scale(${scale})`;
  s.transformOrigin = '0 0';
  el.dataset.fitScale = scale.toFixed(3);
  return scale;
}
