#!/usr/bin/env bash
# Regression test for the match-data rules in .gitignore (audit SEC-27, after
# OpenVolley's): the files OpenBeach writes (backups, logs, diagnostics,
# activity and match exports, roster lists, scoresheet PDFs) must be ignored
# wherever they land in the checkout, while test fixtures and the code stay
# trackable. Lives next to test-gitleaks-config.sh: .gitignore keeps these
# files out of `git add`, the gitleaks rules catch what is added anyway.
#
# Usage: .githooks/test-gitignore.sh   (exit 0 = all cases pass)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fails=0

# expect <ignored|kept> <path>   (the path need not exist)
expect() {
  local want="$1" path="$2" got=kept
  if git check-ignore --no-index -q -- "$path"; then got=ignored; fi
  if [[ "$got" == "$want" ]]; then
    echo "ok   $want $path"
  else
    echo "FAIL want $want, got $got: $path"; fails=$((fails + 1))
  fi
}

# The names the app gives its files (Scoreboard_beach.jsx downloads,
# debugLogger_beach.js, diagnostics_beach/index_beach.js, logger_beach.js,
# backupManager_beach.js, MatchEnd_beach.jsx, ActivityLogModal_beach.jsx,
# comprehensiveLogger_beach.js; the audit's PoC list first), in any folder.
expect ignored backup_set1_match-12_2026-11-23T10-00-00-000Z.json
expect ignored match-data-12.json
expect ignored match_stopped_12_2026-11-23.json
expect ignored database_export_12_2026-11-23.json
expect ignored debug_logs_2026-11-23T10-00-00-000Z.json
expect ignored openbeach-diagnostics-2026-11-23T10-00-00-000Z.jsonl
expect ignored escoresheet/frontend/backup_g35_set2_scoreleft15_scoreright12_20261123_100000_123.json
expect ignored exports/backup_g35_p1a2b3c4d_20261123_100000_123_set1_scoreleft21_scoreright19.json
expect ignored backups/backup_g35/backup_g35_set1_scoreleft0_scoreright0_20261123_100000_000.json
expect ignored logs/game35/logs_20261123T100000Z_1a.txt
expect ignored comprehensive_logs_g35_2026-11-23T10-00-00-000Z.json
expect ignored comprehensive_logs_2026-11-23T10-00-00-000Z.ndjson
expect ignored openbeach-activity-all-2026-11-23T10-00-00-000Z.json
expect ignored openbeach-activity-match12-2026-11-23T10-00-00-000Z.ndjson
expect ignored openbeach-activity-match12-2026-11-23T10-00-00-000Z.csv
expect ignored MatchData_Gialli-Verdi_vs_Alba-Coral_2026-11-23.json
expect ignored Match_Gialli-Verdi_vs_Alba-Coral_2026-11-23.zip
expect ignored interaction_logs_2026-11-23.ndjson
# Native auto-backups (one folder per match) and the Android log files, as
# copied off a tablet (Documents/OpenBeach/export-<time>)
expect ignored OpenBeach/backups/game35-match_1763890000000_ab12cd/20261123T100000.000Z-00042.json
expect ignored OpenBeach/backups/game35-match_1763890000000_ab12cd/latest.json
expect ignored some/dir/game35-local5/latest.json
expect ignored test-game1-s/latest.json
expect ignored match-xyz/latest.json
expect ignored OpenBeach/logs/activity-2026-11-23.jsonl
expect ignored downloads/beach.openvolley.app.har
# Roster lists and scoresheets
expect ignored escoresheet/frontend/participants.xlsx
expect ignored competition_matches_template.csv
expect ignored downloads/scoresheet_game35.pdf
# A folder merely named like "fixtures" is no test tree.
expect ignored league-fixtures/2026/match-data-3.json

# Fixtures and code stay trackable.
expect kept escoresheet/frontend/src_beach/__tests__/fixtures/signStrokeVectors.json
expect kept escoresheet/frontend/src_beach/__tests__/fixtures/game35.json
expect kept escoresheet/frontend/src_beach/__tests__/fixtures/backup_g1_set1_scoreleft0_scoreright0_20261123_100000_000.json
expect kept escoresheet/frontend/src_beach/utils_beach/backupManager_beach.js
expect kept escoresheet/frontend/src_beach/i18n_beach/locales/en.json
expect kept escoresheet/frontend/android/gradle/verification-metadata.xml
expect kept escoresheet/frontend/package-lock.json
expect kept .claude/settings.json

# No tracked file may be ignored: a rule that swallows one would hide the next
# fixture or doc of its kind from `git add`.
tracked_ignored="$(git ls-files -i -c --exclude-standard)"
if [[ -n "$tracked_ignored" ]]; then
  echo "FAIL tracked files that .gitignore ignores:"; sed 's/^/       /' <<<"$tracked_ignored"
  fails=$((fails + 1))
else
  echo "ok   no tracked file is ignored"
fi

if (( fails > 0 )); then
  echo "$fails case(s) failed"; exit 1
fi
echo "all cases passed"
