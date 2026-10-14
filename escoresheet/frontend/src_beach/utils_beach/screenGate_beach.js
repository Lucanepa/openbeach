/**
 * Whether the small-screen gate covers the app. Only the scoring screen needs
 * 800×600 (its phone layout is let through by the caller, App_beach). Home,
 * setup, coin toss, match end and the manual adjustments fit a phone
 * (Android emulator audit 2026-10-14): they used to be gated too unless the
 * scorer chose fullscreen, so a phone browser without fullscreen (Safari on
 * an iPhone) could not use the app at all.
 * @param {{ width: number, height: number }} size  the viewport
 * @param {{ scoring?: boolean }} state
 */
export function smallScreenGate({ width, height }, { scoring = false } = {}) {
  const tooSmall = (width < 800 && height < 800) || width < 600 || height < 600
  return tooSmall && scoring
}
