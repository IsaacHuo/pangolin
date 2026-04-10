#!/usr/bin/env bash
set -euo pipefail

command_name="${1:-unknown}"

case "$command_name" in
  android:*)
    surface="Android surface (apps/android)"
    ;;
  ios:*|format:swift|lint:swift)
    surface="iOS/macOS Swift surface (apps/ios, apps/macos)"
    ;;
  ui:*|test:ui)
    surface="UI workspace (ui/)"
    ;;
  test:docker:*)
    surface="Docker E2E surface (scripts/e2e and docker test scripts)"
    ;;
  *)
    surface="Legacy OpenClaw surface"
    ;;
esac

echo "[core-only] Command '$command_name' is disabled in Path A (Core-Only)."
echo "[core-only] Missing/removed surface: $surface"
echo "[core-only] To restore this command surface, follow Path B in docs/refactor/openclaw-retention-playbook.md."
exit 2
