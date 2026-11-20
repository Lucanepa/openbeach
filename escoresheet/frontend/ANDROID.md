# OpenBeach Android app

The beach scorer app (plus the referee and livescore views) as an Android app
for the tablets, built with Capacitor from this frontend. It shares
OpenVolley's Android setup (same Capacitor shell, version rule, release
script and F-Droid pipeline) but is a separate app with its own id and its
own signing key.

- Package: `com.openvolley.beach`, name **OpenBeach**
- Version 2.0.1 = versionCode `20000010` (2.0.0 = `20000000`)
- The APK **bundles** the web app (`dist-capacitor/`): it works with no
  internet at all. Every web change that should reach the tablets needs a new
  release.
- No service worker in this build (`CAPACITOR=true`, see `vite.config.js`):
  the files are already local, and an old precache would otherwise keep
  serving the previous version after an update.
- No `.env` files in this build (`envDir: false`): only the variables given on
  the command line reach the bundle, so the owner's build and F-Droid's are
  the same byte for byte.
- A fixed stylesheet order (the `stable-css-order` plugin in `vite.config.js`,
  since 2.0.1): Vite injects the `<link rel="stylesheet">` tags of the CSS
  chunks several pages share (`tailwind_beach`, `flag-icons`) in an order that
  depends on timing, so 2.0.0's `admin_beach.html` / `index.html` differed
  between builds of the same commit. The plugin sorts them by file name.

Planned channels, as for OpenVolley: the public F-Droid repo
`https://get.openvolley.app/fdroid/repo`, the owner's private F-Droid repo
(`https://fdroid.lucanepa.com/repo`) and the GitHub release
`android-v<version>` of `Lucanepa/openbeach`.

## Release

```bash
cd escoresheet/frontend
scripts/release-android.sh               # build, sign, publish to the private F-Droid repo
scripts/release-android.sh --no-publish  # build only (unsigned release APK)
scripts/release-android.sh --debug       # debug APK, for the emulator
```

The script runs `vite build` with `CAPACITOR=true` and
`VITE_BACKEND_URL=https://backend.openvolley.app` into `dist-capacitor/`, then
`npx cap sync android` and `./gradlew assembleRelease`, then
`/srv/fdroid/desktop-calendar/add-apk.sh` with the OpenBeach signing config.
That zipaligns the APK, signs it, copies it to
`repo/com.openvolley.beach_<versionCode>.apk` and runs `publish.sh`. It then
checks that the signature copies onto the unsigned build (F-Droid's
reproducible-build check) and prints the `gh release create android-v<version>`
command for the GitHub release.

The F-Droid metadata for the repos (`com.openvolley.beach.yml` and
`com.openvolley.beach/en-US/icon.png`) goes into
`/srv/fdroid/desktop-calendar/metadata/` and
`~/.config/openvolley-pkgs/fdroid/metadata/`; the store texts and the icon are
in `fastlane/metadata/android/en-US/` at the repo root. A reference copy of
the f-droid.org recipe is `android/fdroid/com.openvolley.beach.yml`: its
signing certificate is filled in (OpenBeach's own key); set `commit` to the
full hash of the tag `android-v<version>` before submitting it or copying it into
the metadata folders.

Needs JDK 21 and the Android SDK in `~/Android/Sdk` (the script sets
`ANDROID_HOME`).

### Gradle and AGP stay on 8.x

The build uses Gradle 8.14.x (`gradle-wrapper.properties`, with its
`distributionSha256Sum`) and the Android Gradle Plugin 8.13.x
(`android/build.gradle`), until the app moves to Capacitor 9:

- Capacitor 8 is built for AGP 8.13 and Gradle 8.14: its app template and
  every plugin's `build.gradle` (`@capacitor/android`, `filesystem`,
  `screen-orientation`) declare AGP 8.13.0. The root `build.gradle` sets the
  version that is used, the last patch of that line (8.13.2 since 20.11.2026).
- AGP 8.x does not run on Gradle 9.6 or later: Gradle removed an internal API
  that AGP 8 uses ("Plugins relying on removed Problems API internals",
  docs.gradle.org/current/userguide/upgrading_version_9.html#agp_8x_incompatible;
  Gradle 9.9.1 with AGP 8.13 fails with exactly that error). Gradle 9.0 to
  9.5 would still run it but get no more fixes, while 8.14.x still gets
  security releases (8.14.7 and 8.14.8 in November 2026).
- AGP 9 needs Capacitor and its plugins updated for it (built-in Kotlin, the
  new DSL; the app's `proguard-android.txt` is gone too): that is Capacitor 9,
  which moves to AGP 9.4 and Gradle 9.8 together.

Dependabot therefore skips major updates of `gradle-wrapper` and
`com.android.tools.build:gradle` (`.github/dependabot.yml`); drop that ignore
with the Capacitor 9 move. Any Gradle or AGP change alters the APK bytes
(the AGP version is written into the APK, D8 into `classes.dex`). F-Droid
builds the tag with the Gradle and AGP versions the tag declares, so a version
change alone does not break the reproducible build; the rest still has to
match as before (same sources, same build commands and environment, e.g. no
`VITE_BASE_PATH`). Before merging one, compare the unsigned release APK with
the previous build: `aapt2 dump badging` (package, versions, SDKs,
permissions) and the list of changed ZIP entries (the web assets must not
change), and check that an empty-cache build gives the same bytes.

## Icons and splash

The launcher icons (adaptive: the B2 ball on a dune `#efd8ae` background, plus
a monochrome layer for Android 13+ themed icons), the legacy square and round
icons, the pre-Android-12 splash and the store icon are rendered from
`brand/` by `npm run brand` (`scripts/make-brand-assets.py`, see
`brand/README.md`). Android 12+ draws the adaptive foreground on a dune icon
disc on white (`styles.xml`).

## Signing key

`~/.config/openbeach-android/release.p12` + `signing.properties`, backed up in
Vaultwarden as "OpenBeach Android signing key". **Never** OpenVolley's key.
Every update must be signed with the same key forever: a lost key means every
tablet has to uninstall (and lose its matches) to get updates again.

## Version rule

The same as OpenVolley's app:

- `versionName` = `version` in `package.json`. Since 20.11.2026 that is a
  **calendar version** `YY.M.N`: year, month (no leading zero), the month's
  release from 0 (`26.11.0` = November 2026's first release, `26.11.1` its
  second, `26.12.0` December's first). `node scripts/bump-version.js` sets it
  and the other version files for a release; earlier releases were 2.x to 3.1.1.
- `versionCode` = `(YY * 1000000 + M * 1000 + N) * 10 + androidBuild`,
  e.g. 3.1.1 → `30010010`, 26.11.0 → `260110000`. `androidBuild` in
  `android/app/build.gradle` stays **0**.
- **Every Android release gets a new version** in `package.json`, a native-only fix
  (Gradle, manifest, `MainActivity.java`) included, and is tagged
  `android-v<versionName>`. A tag F-Droid has built must never move.
- Both values are **literals** in `defaultConfig` of `android/app/build.gradle`
  (F-Droid's update checker reads them with a regex). The build fails when they
  no longer match `package.json`, so update them together (and the root
  `version` in `package-lock.json`).

## In the app

- **Server.** The app opens on the cloud backend. At a venue without
  internet: Options → Server → Change server, then the relay's address. For
  the OpenBeach desktop app the IP address is enough (`192.168.1.20` becomes
  `http://192.168.1.20:5174`; its WebSocket on 8081 is found through
  `/api/server/status`). Other relays with their port, e.g.
  `192.168.1.20:5173` for the OpenVolley desktop app or the venue server's
  port. Plain HTTP is allowed for this (`network_security_config.xml`); which
  hosts are allowed at all is checked in `backendConfig_beach.js`
  (`isAllowedBackendUrl`: localhost, private ranges, `*.local`,
  `*.openvolley.app`).
- **Use this tablet as** (same section): the referee or livescore view; Back
  returns to the scorer.
- **Orientation.** The app rotates freely; the scoreboard locks the screen to
  landscape while it is open (`nativeOrientation_beach.js`,
  `@capacitor/screen-orientation`).
- **Back button.** Back closes an open dialog first; on the home or scoring
  screen it asks "Exit OpenBeach?" and only Exit closes the app
  (`appLifecycle_beach.js`, `AndroidExitPrompt_beach.jsx`, `AppExitPlugin.java`).
  Matches stay on the tablet. Swiping the app away in the recent apps cannot
  be stopped by any app: use Android's App pinning on scorer tablets. Exit
  and going to the background write the match's last backup file at once
  (Capacitor's `pause`, or the page going hidden), so it is on disk before a
  swipe can end the app.
- **Keyboard.** The WebView is never resized by the keyboard (the app's
  "use a larger screen" notice would replace the form); it slides up just
  enough to show the focused field (`MainActivity.java`).
- **No bars while scoring on a tablet.** The scoring screen hides the status
  and navigation bars on a tablet (not on a phone; plugin `OpenBeachBars`,
  `ScoringBarsPlugin.java`, `nativeSystemBars_beach.js`). An 8" tablet held
  sideways (1280×800 at 213 dpi: Lenovo Tab M8, Galaxy Tab A9) leaves the page
  962×539 between them, under the scoring screen's 600 px minimum height;
  without them it is 962×601. A swipe from the screen's edge shows the bars
  over the page for a few seconds; the page keeps its size. Leaving the
  scoring screen shows them again.
- **The scoresheet in an in-app view.** The WebView has no second window, so
  the scoresheet (and its PDF modes) opens in a full-screen in-app view over
  the untouched scorer screen: an iframe of the app page with a Back bar
  (`openAppWindow_beach.js`; the page answers through
  `appWindowGuest_beach.js`). Android Back closes it.
- **The approval PDF (`action=getBlob`) on a slow tablet.** The view's
  iframe and the scorer app under it share ONE main thread (same origin,
  same renderer). The sheet's capture (rasterizeHTML, the JPEG encode of
  each page) holds that thread in one piece: no heartbeat leaves the page
  and no timer of the approval runs meanwhile. In OpenVolley (league match
  2026-11-17, Galaxy Tab A7 Lite; OpenVolley #243) that block outlasted the
  approval's stall limit; when the thread was free, the expired stall timer
  ran before the page's next heartbeat, closed the view and threw the PDF
  away ("The scoresheet window stopped answering", then "Approve without
  PDF"). OpenBeach's stall limit is shorter (10 s), so the same holds here.
  Now the approval's watchdog (`scoresheetPdfRequest_beach.js`) counts only
  the time its thread was free: a tick that comes more than 2 s late counts
  as one tick, for the stall and the 90 s limit alike. Popups and desktop
  app windows run on their own thread: their ticks come on time, timed as
  before. Not yet checked on a slow device or a slowed emulator for
  OpenBeach (unit tests only).

## Known limits (2.0.0)

- The scoresheet pages (`scoresheet_beach.html`,
  `scoresheet_archive_beach.html`) load Tailwind from a CDN, so they are
  unstyled offline.
- No update check in the app (OpenVolley's `UpdateSource` plugin and update
  notice are not ported): updates come from the F-Droid client.

## Testing on the emulator

```bash
scripts/release-android.sh --debug
E=~/.claude/skills/android-emulator/emu.sh
$E start && $E install android/app/build/outputs/apk/debug/app-debug.apk && $E launch com.openvolley.beach
```

The debug build allows WebView remote debugging (`adb forward tcp:9333
localabstract:webview_devtools_remote_<pid>`, then Chrome DevTools or
Playwright `connectOverCDP`). A relay on the host is `10.0.2.2` from the emulator, e.g. OpenVolley's backend
in venue mode: `PORT=5174 OV_PIN_SECRET=<40+ chars> node server.js --local` in
`openvolley/escoresheet/backend`, then Options → Server → `10.0.2.2` in the app.
