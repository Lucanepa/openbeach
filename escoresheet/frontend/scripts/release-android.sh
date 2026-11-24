#!/usr/bin/env bash
# Build the OpenBeach Android app (Capacitor) and publish it to the private
# F-Droid repo (https://fdroid.lucanepa.com/repo). See ANDROID.md.
# Adapted from OpenVolley's scripts/release-android.sh.
#
#   cd escoresheet/frontend && scripts/release-android.sh               # build + publish
#   cd escoresheet/frontend && scripts/release-android.sh --no-publish  # build only (unsigned)
#   cd escoresheet/frontend && scripts/release-android.sh --debug       # debug APK (emulator tests)
#
# The APK bundles the web app (no live site): every web change that should
# reach the tablets needs a version bump (package.json) and a new release.
# versionName = package.json version, versionCode = (MAJOR*1000000 + MINOR*1000
# + PATCH) * 10 (android/app/build.gradle, ANDROID.md "Version rule").
#
# Signing key: ~/.config/openbeach-android/ (release.p12 + signing.properties,
# backed up in Vaultwarden "OpenBeach Android signing key"). OpenBeach has its
# own key, never OpenVolley's; updates must be signed with the same key forever.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID=com.openvolley.beach
SIGNING=${SIGNING:-$HOME/.config/openbeach-android/signing.properties}
ADD_APK=/srv/fdroid/desktop-calendar/add-apk.sh
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
export ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$ANDROID_HOME}

mode=${1:-publish}
case "$mode" in
  publish|--no-publish|--debug) ;;
  *) echo "usage: $0 [--no-publish | --debug]" >&2; exit 2 ;;
esac

# F-Droid builds the same tag from source and checks it against this APK byte
# for byte (reproducible builds), so publish only from a clean tree. The web
# bundle ignores .env files in this build (envDir: false in vite.config.js).
if [ "$mode" = publish ]; then
  if [ ! -f "$SIGNING" ]; then
    echo "no signing config at $SIGNING (the OpenBeach key, ANDROID.md)" >&2
    exit 1
  fi
  if [ -n "$(git status --porcelain -- .)" ]; then
    echo "escoresheet/frontend has uncommitted or untracked files; commit them (and tag android-v<version>) first" >&2
    exit 1
  fi
  echo "building $(git describe --tags --always --dirty)"
  # F-Droid builds the tag android-v<versionName>; the signed APK is only
  # useful to it if it comes from that same commit (ANDROID.md, Version rule).
  want="android-v$(sed -nE 's/^ +versionName "(.*)"$/\1/p' android/app/build.gradle)"
  if ! git tag --points-at HEAD | grep -qx "$want"; then
    echo "WARNING: HEAD is not tagged $want; F-Droid will build that tag, not this commit" >&2
  fi
fi

# CAPACITOR=true: no service worker, output in dist-capacitor (vite.config.js).
# The WebView origin is https://localhost, so the cloud backend must be given
# explicitly; a venue relay is chosen in the app (Options, Server).
CAPACITOR=true VITE_BACKEND_URL=${VITE_BACKEND_URL:-https://backend.openvolley.app} \
  npx vite build --outDir dist-capacitor --emptyOutDir
npx cap sync android

if [ "$mode" = --debug ]; then
  (cd android && ./gradlew --no-daemon -q assembleDebug)
  echo "built android/app/build/outputs/apk/debug/app-debug.apk"
  exit 0
fi

(cd android && ./gradlew --no-daemon -q assembleRelease)
APK=android/app/build/outputs/apk/release/app-release-unsigned.apk
echo "built $APK"

if [ "$mode" = publish ]; then
  "$ADD_APK" "$APK" "$SIGNING"

  # The signed APK is what F-Droid compares its own build against (Binaries in
  # the fdroiddata recipe): it copies this APK's signature onto its unsigned
  # build and verifies it. Do the same here, so a signing step that rewrites
  # the ZIP (apksigner without --alignment-preserved true) is caught now and
  # not in F-Droid's pipeline.
  code=$(sed -nE 's/^ +versionCode ([0-9]+)$/\1/p' android/app/build.gradle)
  SIGNED=/srv/fdroid/desktop-calendar/repo/${APP_ID}_${code}.apk
  bt=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
  python3 - "$SIGNED" "$APK" "$bt/apksigner" <<'PY' || {
import os, subprocess, sys, tempfile
from fdroidserver import apksigcopier
signed, unsigned, apksigner = sys.argv[1:4]
with tempfile.TemporaryDirectory() as d:
    out = os.path.join(d, 'copied.apk')
    apksigcopier.do_copy(signed, unsigned, out)
    ok = subprocess.run([apksigner, 'verify', out], capture_output=True).returncode == 0
sys.exit(0 if ok else 1)
PY
    echo "WARNING: $SIGNED does not match the unsigned build once its signature is copied:" >&2
    echo "  F-Droid's reproducible-build check would fail. Sign with apksigner --alignment-preserved true." >&2
    exit 1
  }
  echo "reproducible: signature of $SIGNED copies onto the unsigned build"
  name=$(sed -nE 's/^ +versionName "(.*)"$/\1/p' android/app/build.gradle)
  # --latest=false: "Latest" is kept for the desktop releases (beach-desktop-v*),
  # as in OpenVolley, where the desktop updater reads releases/latest.
  echo "attach it to the GitHub release (F-Droid downloads it from there, Binaries in the recipe):"
  echo "  gh release create android-v$name $SIGNED --repo Lucanepa/openbeach --verify-tag --latest=false \\"
  echo "    --title \"OpenBeach Android $name\" --notes-file $(git rev-parse --show-toplevel)/fastlane/metadata/android/en-US/changelogs/$code.txt"
fi
