#!/bin/sh
# =============================================================================
# publish-all-arcus.sh — Unified Arcus Publisher for openai-auth Suite
#
# Publishes all components built under dist/<sequence>/<component>/<version>/:
#   - Assembles canonical schema-2 submission bundles
#   - Uploads binary release assets to GitHub Releases (via gh)
#   - Submits bundles to the Arcus gateway via "arcus publish submit"
#   - Reports diagnostics and submission IDs for "arcus publish status"
#
# (Legacy local-git manifest commits and submodule hacks are deprecated).
# =============================================================================
set -eu

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH="" cd -- "${SCRIPT_DIR}/.." && pwd)"

VERSION=""
SEQUENCE=""
DRY_RUN=0
SUBMIT=0
WAIT=0
SKIP_UPLOAD=0
GATEWAY_URL="${ARCUS_GATEWAY_URL:-https://arcus-auth.rustybret.com}"
GITHUB_REPO="rustybret/openai-auth-experimental"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --submit) SUBMIT=1; shift ;;
    --wait) WAIT=1; shift ;;
    --skip-upload) SKIP_UPLOAD=1; shift ;;
    --gateway) GATEWAY_URL="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --sequence) SEQUENCE="$2"; shift 2 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]
  --dry-run          Preview publication steps without uploading or submitting
  --submit           Submit release bundles to the gateway via 'arcus publish submit'
  --wait             Wait for automated gate testing and hydration outcome (with --submit)
  --skip-upload      Skip uploading binary assets to GitHub Releases
  --gateway URL      Arcus gateway endpoint (default: https://arcus-auth.rustybret.com)
  --version X.Y.Z    Filter by explicit version string
  --sequence N       Filter by explicit sequence directory
EOF
      exit 0
      ;;
    *)
      if [ -z "$VERSION" ] && [ "${1#-}" = "$1" ]; then
        VERSION="$1"; shift
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

DIST_DIR="${REPO_ROOT}/dist"

if [ ! -d "$DIST_DIR" ]; then
  printf "error: no packaged components found under %s\n" "$DIST_DIR" >&2
  printf "hint: run \"bun run pack:arcus\" first.\n" >&2
  exit 1
fi

printf "=====================================================================\n"
printf "publish-all-arcus: Arcus Suite Publisher (%s)\n" "$VERSION"
printf "  Distribution Root: %s\n" "$DIST_DIR"
printf "  Gateway Endpoint:  %s\n" "$GATEWAY_URL"
printf "  GitHub Repository: %s\n" "$GITHUB_REPO"
printf "  Submit to Gateway: %s\n" "$([ "$SUBMIT" -eq 1 ] && echo "YES" || echo "NO (pass --submit to submit)")"
printf "=====================================================================\n"

# Locate release envelopes (supporting both direct release.json and releases/*.json)
ENVELOPES=$(find "$DIST_DIR" -name "release.json" -o -path "*/releases/*.json" 2>/dev/null | grep -v ".index-policy.json" | sort -u)
if [ -z "$ENVELOPES" ]; then
  printf "error: no release envelopes found under %s\n" "$DIST_DIR" >&2
  exit 1
fi

PUBLISHER_SCRIPT="${REPO_ROOT}/packages/arcus/toolchain/scripts/publish-arcus.sh"
if [ ! -f "$PUBLISHER_SCRIPT" ]; then
  printf "error: toolchain publish-arcus.sh not found at: %s\n" "$PUBLISHER_SCRIPT" >&2
  printf "hint: run \"sh packages/arcus/bootstrap.sh\" first.\n" >&2
  exit 1
fi

BUNDLES_SUBMITTED=0

for env_file in $ENVELOPES; do
  if [ "$(basename "$env_file")" = "release.json" ]; then
    comp_dir="$(dirname "$env_file")"
  else
    comp_dir="$(dirname "$(dirname "$env_file")")"
  fi
  comp_name="$(jq -r '(.signed.package_id // .package_id // empty)' "$env_file" 2>/dev/null || basename "$(dirname "$comp_dir")")"
  pkg_ver="$(jq -r '(.signed.version // .version // empty)' "$env_file" 2>/dev/null || echo "$VERSION")"
  pkg_seq="$(jq -r '(.signed.sequence // .sequence // empty)' "$env_file" 2>/dev/null || echo "1")"
  pkg_rel_id="$(jq -r '(.signed.release_id // .release_id // empty)' "$env_file" 2>/dev/null || echo "${comp_name}-${pkg_ver}-${pkg_seq}")"

  if [ -n "$SEQUENCE" ] && [ "$pkg_seq" != "$SEQUENCE" ]; then
    continue
  fi

  printf "\n>>> Publishing component: %s (version: %s, sequence: %s)...\n" "$comp_name" "$pkg_ver" "$pkg_seq"

  # Tier B Release Tag Standard: mandatory _seq<sequence> suffix
  TAG="v${pkg_ver}_seq${pkg_seq}"
  CONFIG_FILE="${REPO_ROOT}/packages/arcus/${comp_name}.json"
  if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_FILE="${REPO_ROOT}/packages/arcus/arcus.json"
  fi

  PUBLISH_CMD="sh \"$PUBLISHER_SCRIPT\" \
    --v3 \"$env_file\" \
    --package-id \"$comp_name\" \
    --version "$pkg_ver" \
    --release-id "$pkg_rel_id" \
    --output \"$comp_dir\" \
    --dist-dir \"$DIST_DIR\" \
    --bundle-dir \"$comp_dir\" \
    --github-repo \"$GITHUB_REPO\" \
    --tag \"$TAG\" \
    --config \"$CONFIG_FILE\" \
    --gateway \"$GATEWAY_URL\""

  if [ "$DRY_RUN" -eq 1 ]; then
    PUBLISH_CMD="$PUBLISH_CMD --dry-run"
  fi
  if [ "$SUBMIT" -eq 1 ]; then
    PUBLISH_CMD="$PUBLISH_CMD --submit"
    if [ "$WAIT" -eq 1 ]; then
      PUBLISH_CMD="$PUBLISH_CMD --wait"
    fi
  fi
  if [ "$SKIP_UPLOAD" -eq 1 ]; then
    PUBLISH_CMD="$PUBLISH_CMD --skip-upload"
  fi

  eval "$PUBLISH_CMD"
  BUNDLES_SUBMITTED=$((BUNDLES_SUBMITTED + 1))
done

printf "\n=====================================================================\n"
printf "publish-all-arcus: Processed %s component submission bundle(s).\n" "$BUNDLES_SUBMITTED"
if [ "$SUBMIT" -eq 1 ]; then
  printf "Status checking commands:\n"
  printf "  • arcus publish status <submission_id> --gateway %s\n" "$GATEWAY_URL"
else
  printf "Next step (submit bundles to Arcus gateway):\n"
  printf "  • Run: %s --submit [--wait]\n" "$0"
  printf "  • Or directly: arcus publish submit <bundle_dir> --gateway %s\n" "$GATEWAY_URL"
fi
printf "=====================================================================\n"
