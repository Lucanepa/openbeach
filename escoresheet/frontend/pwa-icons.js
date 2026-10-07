// The OpenBeach logo files for the PWA (rendered from brand/ by
// scripts/make-brand-assets.py), one list for the main build (vite.config.js)
// and the per-subdomain builds (scripts/build-subdomains.js).

// Files the pages' heads link to, the serve ball and the fonts.
export const PWA_INCLUDE_ASSETS = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'beachball.png', 'fonts/*.woff2']

// Manifest icons: the dune tile ('any'), and a full-bleed dune square with the
// ball inside the safe zone for launchers that mask ('maskable').
export const PWA_ICONS = [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

// Browser and installed-app bar colour (volleyui: the brand red), every build.
export const THEME_COLOR = '#e2001a'
