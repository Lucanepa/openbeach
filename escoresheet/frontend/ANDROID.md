# OpenBeach Android app

The beach scorer app (plus the referee and livescore views) as an Android app
for the tablets, built with Capacitor from this frontend. It shares
OpenVolley's Android setup (same Capacitor shell, version rule, release
script and F-Droid pipeline) but is a separate app with its own id and its
own signing key.

- Package: `com.openvolley.beach`, name **OpenBeach**
- Version 2.0.0 = versionCode `20000000`
- The APK **bundles** the web app (`dist-capacitor/`): it works with no
  internet at all. Every web change that should reach the tablets needs a new
  release.
- No service worker in this build (`CAPACITOR=true`, see `vite.config.js`):
  the files are already local, and an old precache would otherwise keep
  serving the previous version after an update.
- No `.env` files in this build (`envDir: false`): only the variables given on
  the command line reach the bundle, so the owner's build and F-Droid's are
  the same byte for byte.

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
full hash of the tag `android-v2.0.0` before submitting it or copying it into
the metadata folders.

Needs JDK 21 and the Android SDK in `~/Android/Sdk` (the script sets
`ANDROID_HOME`).

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

- `versionName` = `version` in `package.json` (e.g. `2.0.0`).
- `versionCode` = `(MAJOR * 1000000 + MINOR * 1000 + PATCH) * 10 + androidBuild`,
  e.g. 2.0.0 → `20000000`, 2.0.1 → `20000010`. `androidBuild` in
  `android/app/build.gradle` stays **0**.
- **Every Android release bumps PATCH** in `package.json`, a native-only fix
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
  be stopped by any app: use Android's App pinning on scorer tablets.
- **Keyboard.** The WebView is never resized by the keyboard (the app's
  "use a larger screen" notice would replace the form); it slides up just
  enough to show the focused field (`MainActivity.java`).

## Known limits (2.0.0)

- The scoresheet and its PDF open in a new window (`window.open`), which the
  Android WebView does not have: it loads the scoresheet page in place of the
  scorer's (checked on the emulator). Back returns to the scorer, which
  reloads and offers the match under Continue Match; nothing is lost, but a
  flow that waits for the scoresheet window (the PDF for the match-end ZIP)
  does not get it. OpenVolley shows such pages in an in-app view
  (`openAppWindow.js`); OpenBeach does not have that yet.
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
