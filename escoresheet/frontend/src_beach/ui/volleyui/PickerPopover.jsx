// The popover under a DateField / TimeField: a small panel pinned to the
// field, over a transparent layer that catches a tap outside it.
//
// How it closes, and only these ways: Escape, a tap or click outside the panel
// (press AND release both on the layer, outsideTap below, so a text selection
// dragged out of the panel does not count), the panel's own buttons (a picked
// day, Done, Clear). Focus goes back to what opened it (DateField.jsx usePopover).
//
// Rendered in place, not in a portal: the panel lives inside whatever dialog
// holds the field, so it stacks above that dialog without z-index games, and
// that dialog's own Escape / backdrop / focus trap see it as theirs. Keys are
// handled here and stopped, so Escape closes only the popover (the kit Modal
// and the scoring screens listen on document / window, above the React root),
// and arrow keys never reach the scoreboard's keyboard shortcuts. Clicks are
// stopped at the layer so a row or card around the field does not react.
//
// Position: `fixed`, measured from the field. The layer's own box tells where
// the containing block is (an ancestor with a transform or a backdrop filter
// moves it), so the panel lands under the field either way. It flips above the
// field when there is no room below, stays inside the viewport with an 8px
// margin, and follows the field while anything scrolls.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from './cn.js';

const MARGIN = 8;
const GAP = 4;

// Press state of the layer, per element (OpenVolley's ui/backdropDismiss.js,
// which this kit does not have; Modal.jsx keeps its own guard).
const presses = new WeakMap();

/** A non-empty text selection anchored inside `el` (a selection dragged out of the panel). */
function hasSelectionWithin(el) {
  try {
    const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || String(sel).length === 0) return false;
    return !!sel.anchorNode && el.contains(sel.anchorNode);
  } catch {
    return false;
  }
}

/**
 * Props for the layer: `onDismiss` runs only when the press AND the release
 * both landed on the layer itself, never for a drag that started in the panel.
 * Presses are recorded in the capture phase, so a child that stops
 * propagation cannot leave an old press behind. Every click on the layer is
 * stopped, so a clickable row around the field does not react.
 */
function outsideTap(onDismiss) {
  const onLayer = (e) => e.target === e.currentTarget;
  const press = (e) => { presses.set(e.currentTarget, { down: onLayer(e), up: false }); };
  const release = (e) => {
    const p = presses.get(e.currentTarget);
    if (p) p.up = onLayer(e);
  };
  return {
    onPointerDownCapture: press,
    onMouseDownCapture: press,
    onPointerUpCapture: release,
    onMouseUpCapture: release,
    onPointerCancelCapture: (e) => { presses.delete(e.currentTarget); },
    onClick: (e) => {
      e.stopPropagation();
      const el = e.currentTarget;
      const p = presses.get(el);
      presses.delete(el);
      if (!onLayer(e) || !p || !p.down || !p.up) return;
      if (hasSelectionWithin(el)) return;
      onDismiss(e);
    },
  };
}

const FOCUSABLE = 'button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(reason: 'escape'|'outside') => void} props.onClose
 * @param {{ current: HTMLElement|null }} props.anchorRef  the field the panel hangs from
 * @param {string} props.label  the dialog's accessible name
 * @param {string} [props.id]
 * @param {string} [props.className]  on the panel
 * @param {any} props.children
 */
export function PickerPopover({ open, onClose, anchorRef, label, id, className, children }) {
  const layerRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    const layer = layerRef.current;
    if (!anchor || !panel || !layer) return;
    const a = anchor.getBoundingClientRect();
    const box = layer.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let top = a.bottom + GAP;
    if (top + h > vh - MARGIN) {
      const above = a.top - GAP - h;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - MARGIN - h);
    }
    let left = a.left;
    if (left + w > vw - MARGIN) left = vw - MARGIN - w;
    left = Math.max(MARGIN, left);
    // Fixed boxes are placed in the containing block; the layer (inset 0) is that block.
    const next = { top: Math.round(top - box.top), left: Math.round(left - box.left) };
    setPos((cur) => (cur && cur.top === next.top && cur.left === next.left ? cur : next));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  // The panel's size changes with its content (a six-row month): place again.
  useLayoutEffect(() => {
    if (open) place();
  });

  if (!open) return null;

  const onKeyDown = (e) => {
    // Nothing typed in the popover reaches the screen behind it.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCloseRef.current?.('escape');
      return;
    }
    if (e.key === 'Tab' && panelRef.current) {
      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey ? active === first : active === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    }
  };

  return (
    <div
      ref={layerRef}
      // ov-kit: the kit's scoped preflight (tailwind_beach.css), so the legacy
      // element rules (`button { background: var(--accent) }`) stay out of the
      // panel on the screens that are not converted yet (manual adjustments).
      className="ov-kit no-print fixed inset-0 z-50"
      onKeyDown={onKeyDown}
      // A field wrapped in a <label>: a click in the popover must
      // not be forwarded to the field by the label, taking the focus away.
      onClickCapture={(e) => { if (!e.target.closest?.('select,option,input,textarea,a')) e.preventDefault(); }}
      {...outsideTap(() => onCloseRef.current?.('outside'))}
    >
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // A press on the panel's padding keeps the focus where it is.
        onMouseDown={(e) => { if (!e.target.closest?.('button,select,input,a,[tabindex]')) e.preventDefault(); }}
        // Transparent (not hidden) until placed: a hidden panel cannot take the focus.
        style={{ position: 'fixed', top: pos ? pos.top : 0, left: pos ? pos.left : 0, opacity: pos ? 1 : 0 }}
        className={cn(
          'max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-auto rounded-xl border border-stone-200/70 bg-white p-3 text-stone-800 shadow-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default PickerPopover;
