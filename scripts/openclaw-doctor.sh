#!/usr/bin/env bash
set -u

strict=0
if [[ "${1:-}" == "--strict" ]]; then
  strict=1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || exit 2

pass_count=0
warn_count=0
fail_count=0

pass() {
  printf 'PASS %s\n' "$1"
  pass_count=$((pass_count + 1))
}

warn() {
  printf 'WARN %s\n' "$1"
  warn_count=$((warn_count + 1))
}

fail() {
  printf 'FAIL %s\n' "$1"
  fail_count=$((fail_count + 1))
}

script_value() {
  local script_name="$1"
  node - "$script_name" <<'NODE'
const scriptName = process.argv[2];
const pkg = require("./package.json");
const value = pkg && pkg.scripts ? pkg.scripts[scriptName] : undefined;
if (typeof value === "string") {
  process.stdout.write(value);
}
NODE
}

script_defined() {
  local value
  value="$(script_value "$1")"
  [[ -n "$value" ]]
}

script_is_core_only_disabled() {
  local value
  value="$(script_value "$1")"
  [[ "$value" == *"core-only-disabled.sh"* ]]
}

check_required() {
  local path="$1"
  local label="$2"
  if [[ -e "$path" ]]; then
    pass "$label: $path"
  else
    fail "$label missing: $path"
  fi
}

check_optional() {
  local path="$1"
  local label="$2"
  if [[ -e "$path" ]]; then
    pass "$label present: $path"
  else
    warn "$label missing: $path"
  fi
}

check_script_prereq() {
  local script_name="$1"
  local prereq_path="$2"
  local note="$3"

  if ! script_defined "$script_name"; then
    return 0
  fi

  if script_is_core_only_disabled "$script_name"; then
    pass "script $script_name is explicitly disabled in core-only mode"
    return 0
  fi

  if [[ -e "$prereq_path" ]]; then
    pass "script $script_name prereq ok: $prereq_path"
  else
    warn "script $script_name depends on missing path $prereq_path ($note)"
  fi
}

echo "== Pangolin Capability Doctor =="
echo "Repo: $repo_root"

echo
echo "[1/3] Core capabilities (must keep)"
check_required "scripts/run-node.mjs" "core launcher"
check_required "src/gateway" "gateway module"
check_required "src/agents" "agents module"
check_required "src/channels" "channels module"
check_required "apps/pangolin-frontend" "pangolin frontend"
check_required "apps/pangolin-frontend/app/pages/mcp-firewall.vue" "firewall ops page"
check_required "apps/pangolin-frontend/app/composables/useFirewallOpsConsole.ts" "firewall ops state"
check_required "skills" "skills catalog"

echo
echo "[2/3] Optional legacy surfaces"
check_optional "apps/android" "android surface"
check_optional "apps/ios" "ios surface"
check_optional "apps/macos" "macos app surface"
check_optional "ui" "ui workspace"
check_optional "scripts/e2e" "docker e2e scripts"
check_optional "scripts/test-live-models-docker.sh" "docker live-models script"
check_optional "scripts/test-live-gateway-models-docker.sh" "docker live-gateway script"
check_optional "scripts/test-cleanup-docker.sh" "docker cleanup script"

echo
echo "[3/3] Script prereq mapping"
check_script_prereq "android:assemble" "apps/android" "restore mobile app or avoid android scripts"
check_script_prereq "android:install" "apps/android" "restore mobile app or avoid android scripts"
check_script_prereq "android:run" "apps/android" "restore mobile app or avoid android scripts"
check_script_prereq "android:test" "apps/android" "restore mobile app or avoid android scripts"
check_script_prereq "ios:gen" "apps/ios" "restore ios app or avoid ios:gen"
check_script_prereq "pangolin:frontend:dev" "apps/pangolin-frontend" "restore frontend workspace or skip pangolin frontend dev"
check_script_prereq "pangolin:frontend:build" "apps/pangolin-frontend" "restore frontend workspace or skip pangolin frontend build"
check_script_prereq "pangolin:frontend:preview" "apps/pangolin-frontend" "restore frontend workspace or skip pangolin frontend preview"
check_script_prereq "format:swift" "apps/ios" "requires ios/macos swift sources"
check_script_prereq "lint:swift" "apps/ios" "requires ios/macos swift sources"
check_script_prereq "test:ui" "ui" "restore ui workspace or skip ui tests"
check_script_prereq "ui:build" "ui" "restore ui workspace or skip ui build"
check_script_prereq "ui:dev" "ui" "restore ui workspace or skip ui dev"
check_script_prereq "ui:install" "ui" "restore ui workspace or skip ui install"
check_script_prereq "test:docker:onboard" "scripts/e2e/onboard-docker.sh" "restore scripts/e2e set"
check_script_prereq "test:docker:plugins" "scripts/e2e/plugins-docker.sh" "restore scripts/e2e set"
check_script_prereq "test:docker:qr" "scripts/e2e/qr-import-docker.sh" "restore scripts/e2e set"
check_script_prereq "test:docker:doctor-switch" "scripts/e2e/doctor-install-switch-docker.sh" "restore scripts/e2e set"
check_script_prereq "test:docker:gateway-network" "scripts/e2e/gateway-network-docker.sh" "restore scripts/e2e set"
check_script_prereq "test:docker:live-models" "scripts/test-live-models-docker.sh" "restore docker helper scripts"
check_script_prereq "test:docker:live-gateway" "scripts/test-live-gateway-models-docker.sh" "restore docker helper scripts"
check_script_prereq "test:docker:cleanup" "scripts/test-cleanup-docker.sh" "restore docker helper scripts"

echo
echo "Summary: pass=$pass_count warn=$warn_count fail=$fail_count"

if [[ "$fail_count" -gt 0 ]]; then
  echo "Result: CORE BROKEN (required capabilities missing)"
  exit 2
fi

if [[ "$warn_count" -gt 0 ]]; then
  echo "Result: CORE-ONLY MODE is healthy; some optional legacy surfaces are missing"
  if [[ "$strict" -eq 1 ]]; then
    exit 3
  fi
  exit 0
fi

echo "Result: FULL MODE ready (core + legacy surfaces present)"
exit 0
