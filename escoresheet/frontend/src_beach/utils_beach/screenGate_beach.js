/**
 * Whether the small-screen gate covers the app. Below 800×600 (a phone) it
 * does, unless the scorer chose fullscreen, which lets the setup, coin toss
 * and match end screens through, never the scoring screen.
 * @param {{ width: number, height: number }} size  the viewport
 * @param {{ isFullscreen?: boolean, scoring?: boolean }} state
 */
export function smallScreenGate({ width, height }, { isFullscreen = false, scoring = false } = {}) {
  const tooSmall = (width < 800 && height < 800) || width < 600 || height < 600
  return tooSmall && (!isFullscreen || scoring)
}
