#!/bin/sh
# =============================================================================
# pack-all-arcus.sh — Master Arcus Packaging Catch-All for openai-auth Suite
#
# Packages suite components under one unified, single-sequence hierarchy:
#   dist/<version>/<sequence>/<component>/
#
# Release-set completeness invariant:
#   1. opencode-openai-auth (OpenCode plugin)
#   2. pi-openai-auth       (Pi extension)
# =============================================================================
set -eu

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH="" cd -- "${SCRIPT_DIR}/.." && pwd)"

VERSION="${VERSION:-}"
SEQUENCE="${SEQUENCE:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"
NO_CLEAN="${NO_CLEAN:-0}"
ONLY_COMPONENT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --sequence) SEQUENCE="$2"; shift 2 ;;
    --only) ONLY_COMPONENT="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --no-clean) NO_CLEAN=1; shift ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]
  --version X.Y.Z-R    Override suite version (default: packages/opencode/package.json)
  --sequence N         Shared release sequence for every component (default: auto-allocated)
  --only COMPONENT     Pack a single component (opencode-openai-auth or pi-openai-auth)
  --skip-build         Reuse existing build outputs instead of rebuilding
  --no-clean           Do not purge the target dist/<version>/<sequence>/ directory first
EOF
      exit 0
      ;;
    *)
      if [ -z "$VERSION" ] && [ "${1#-}" = "$1" ]; then
        VERSION="$1"; shift
        if [ "$#" -gt 0 ] && [ -z "$SEQUENCE" ] && [ "${1#-}" = "$1" ]; then
          SEQUENCE="$1"; shift
        fi
      else
        printf 'error: unknown option: %s\n' "$1" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  VERSION=$(node -e 'console.log(require("./packages/opencode/package.json").version)')
fi

if [ -z "$SEQUENCE" ]; then
  SEQUENCE=$(arcus manifest allocate-sequence --gateway https://arcus-auth.rustybret.com --package-id opencode-openai-auth --json 2>/dev/null | jq -r '.sequence' 2>/dev/null || echo "1")
fi

RELEASE_ROOT="${REPO_ROOT}/dist/${VERSION}/${SEQUENCE}"

printf "=====================================================================\n"
printf "pack-all-arcus: openai-auth Suite Arcus Packaging\n"
printf "  version:  %s\n" "$VERSION"
printf "  sequence: %s (shared)\n" "$SEQUENCE"
printf "  output:   dist/%s/%s/<component>/\n" "$VERSION" "$SEQUENCE"
printf "=====================================================================\n"

# --- 0. Clean the target release directory ---
if [ "$NO_CLEAN" -eq 0 ] && [ -z "$ONLY_COMPONENT" ] && [ -d "$RELEASE_ROOT" ]; then
  printf "\n[Step 0/3] Cleaning stale release directory: dist/%s/%s\n" "$VERSION" "$SEQUENCE"
  rm -rf "$RELEASE_ROOT"
fi

# --- 1. Pre-pack verification gates ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  printf "\n[Step 1/3] Running pre-pack verification gates...\n"
  bun scripts/check-installed-ranges.mjs
  printf "  -> Purging stale package build outputs...\n"
  rm -rf "${REPO_ROOT}/packages/core/dist" \
         "${REPO_ROOT}/packages/opencode/dist" \
         "${REPO_ROOT}/packages/pi/dist"
  printf "  -> Building workspace dists (core + opencode + pi)...\n"
  bun run build
fi

# --- 2. Pack components into unified dist/ hierarchy ---
printf "\n[Step 2/3] Packaging suite components into unified dist/ hierarchy...\n"

pack_component() {
  comp="$1"
  script="$2"
  if [ -n "$ONLY_COMPONENT" ] && [ "$ONLY_COMPONENT" != "$comp" ]; then
    return 0
  fi
  printf "\n>>> Packaging %s (seq: %s)...\n" "$comp" "$SEQUENCE"
  SKIP_BUILD=1 sh "$script" --version "$VERSION" --sequence "$SEQUENCE"
}

pack_component "opencode-openai-auth" "${REPO_ROOT}/scripts/pack-opencode-arcus.sh"
pack_component "pi-openai-auth" "${REPO_ROOT}/scripts/pack-pi-arcus.sh"

# --- 3. Release-set completeness gate ---
printf "\n[Step 3/3] Verifying release-set completeness...\n"

if [ -n "$ONLY_COMPONENT" ]; then
  node "${REPO_ROOT}/scripts/lib/verify-release-set.mjs" \
    --root "$RELEASE_ROOT" \
    --only "$ONLY_COMPONENT"
else
  node "${REPO_ROOT}/scripts/lib/verify-release-set.mjs" --root "$RELEASE_ROOT"
fi

printf "\n=====================================================================\n"
printf "pack-all-arcus: Packaging complete! Validated release envelopes:\n"
find "$RELEASE_ROOT" -name "*.json" 2>/dev/null | grep "/releases/" | grep -v "index-policy" | sort | while read -r env; do
  printf "  • %s\n" "${env#"${REPO_ROOT}/"}"
done
