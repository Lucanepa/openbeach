# OpenBeach logo (B2 "sun")

OpenVolley's ball (concept A: Swiss Volley red `#e2001a` panel group, stone-900
`#1c1917` panels) on a dune-coloured sun disc or tile. **Dune `#efd8ae` is the
OpenBeach brand colour**; in the UI the action colour stays volleyui red.

Every raster the app ships is rendered from these SVGs:

    cd escoresheet/frontend && python3 scripts/make-brand-assets.py

(resvg through the Tauri CLI: `$TAURI_CLI`, `node_modules/.bin/tauri` or
`npx --yes @tauri-apps/cli@2`; Pillow.) The output is deterministic: commit the
SVG change and the renders together. `src_beach/__tests__/offline/brandAssets.test.js`
checks the files and every link to them.

| File | What | Used for |
|---|---|---|
| `mark.svg` | The ball on its dune disc (r 248 of 256) | In-app logo (`src_beach/brand_beach.js`: home, headers, sign-in, server and scoreboard gates, archive, referee idle screen, competitions admin), the serve indicator `public_beach/beachball.png`, the legacy round launcher icon. Reads on white and on dark, so there is no separate dark cut |
| `mark-mono.svg` | One colour: ring + panels | Single-colour print, embossing |
| `favicon.svg` | Small-size cut: a fuller dune tile, the ball near its edge | Browser tab (`public_beach/favicon.svg`, every size of `favicon.ico`) |
| `icon-tile.svg` | Dune rounded tile, the ball (r 150 of 512) inside the adaptive-icon safe zone | PWA `any` icons, apple-touch and maskable icons (full-bleed on dune), legacy square launcher icon, store icon (fastlane, F-Droid), the desktop app (OpenVolley `src-tauri/icons/beach`) |
| `adaptive-foreground.svg` | Android adaptive foreground: the ball scaled 0.8 (r 120 of 512, about 70 % of the 72 dp launcher circle, like OpenVolley's) on the dune `ic_launcher_background` | `mipmap-*/ic_launcher_foreground.png`, the Android 12+ splash (on a dune icon disc) |
| `adaptive-monochrome.svg` | Ring + panels in black, scaled 0.72 like the system's themed glyphs | `mipmap-*/ic_launcher_monochrome.png`, the Android 13+ themed icon |
| `lockup.svg` | Ball + "OpenBeach" in one line, ink | Pre-Android-12 splash; headers that want the name next to the ball |
| `lockup-dark.svg` | The same, word in stone-50, for dark backgrounds | The same on dark |

The two adaptive layers differ from the delivered B2 files only by the scale
group (`<g transform=…>`), added after the OpenVolley emulator check showed a
radius-150 ball filling 88 % of the launcher circle.

Clear space: a quarter of the ball's diameter on every side. Minimum size:
16 px (`favicon.svg` cut). Don't recolour the panels, drop the dune disc on a
coloured background, or put the ball on red.
