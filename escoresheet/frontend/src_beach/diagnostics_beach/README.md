# Diagnostics mode (OpenBeach)

The port of OpenVolley's diagnostics mode. The switch, the line format, the
redaction rules and the desktop commands are the same, so OpenVolley's runbook
covers both apps: `escoresheet/docs/diagnostics-mode.md` in the OpenVolley
repo has every line kind and the jq recipes.

## Switching it on

| How | Scope |
| --- | --- |
| `OPENVOLLEY_DIAGNOSTICS=1 openbeach-escoresheet` (desktop app) | this run, from the first script on |
| Options > Diagnostics > Diagnostics mode (home screen or scoreboard) | this device, until switched off (localStorage `ov.diagnostics`) |
| `?diag=1` in the URL (scorer or referee) | this tab, until `?diag=0` (`?diag=0` also overrides the other two) |

## Where the lines go

- **Desktop app:** `diagnostics-YYYY-MM-DD.jsonl` in the log folder, written
  by the OpenVolley repo's `src-tauri/src/diagnostics.rs`. Only the scoretable
  window writes there. The app's pop-up windows (the scoresheet, a referee view
  opened from the scoretable) send their lines to it over a BroadcastChannel
  (`ob-diagnostics`); it redacts them again and writes them into the same file
  tagged `"win":"popup-<n>"` and `"page":"scoresheet"` or `"referee"`. A pop-up
  keeps up to 2,000 lines while the scoretable is not recording
  (`popupForward_beach.js`). On Linux and Windows that folder is OpenVolley's
  (`~/.local/share/OpenVolley/logs`, `%APPDATA%\OpenVolley\logs`:
  `activity.rs` `log_root` does not depend on the app), so with both apps
  installed their lines share the same daily file. Tell them apart by
  `page.load` `d.product` (`openbeach`) and by `native.start` `d.app`
  (`OpenBeach`), then by `sid`. On macOS it is `~/Library/Logs/OpenBeach`.
- **Browser, Android, LAN tablets:** the IndexedDB ring `openbeach-diagnostics`
  (50,000 lines, 7 days). Export it from Options > Diagnostics, or on a referee
  tablet from the header menu ("Export diagnostics", shown only while it is on).

## What differs from OpenVolley

- `page.load` carries `product` (`openbeach`) and `app` (`scorer` or `referee`).
- Both the scorer page and the referee page are instrumented. The referee's
  sections are tagged `data-diag="referee"`, `referee-content`, `referee-sets`,
  `referee-score`, `referee-court`, `referee-counters` and `referee-footer`. The
  scorer's scoreboard uses the same class names as OpenVolley's.
- `action.start` has no `reason` (OpenBeach's scorer actions carry none).
- The redaction rules live in `redact_beach.js`: OpenBeach has no activity log.
