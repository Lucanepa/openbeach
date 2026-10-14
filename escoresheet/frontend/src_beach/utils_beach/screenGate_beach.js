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

/**
 * Whether the gate's "turn the device sideways" hint applies: the page is
 * upright on a touch device whose screen is at least 800×600 held sideways.
 * An open foldable upright (691×756) passes sideways (829×624); a tall
 * browser window on a computer, or a screen too small either way, gets the
 * plain hint instead.
 * @param {{ width: number, height: number }} size  the viewport
 * @param {{ width?: number, height?: number }} [screenSize]  window.screen
 * @param {number} [touchPoints]  navigator.maxTouchPoints
 */
export function turningSidewaysHelps(
  { width, height },
  screenSize = typeof window !== 'undefined' ? window.screen : null,
  touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0
) {
  const sw = Number(screenSize?.width) || 0
  const sh = Number(screenSize?.height) || 0
  return height > width && touchPoints > 0 && Math.max(sw, sh) >= 800 && Math.min(sw, sh) >= 600
}
