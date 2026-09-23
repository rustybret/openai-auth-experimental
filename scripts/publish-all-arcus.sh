#!/bin/sh
# =============================================================================
# publish-all-arcus.sh — Unified Arcus Publisher for openai-auth Suite
#
# Publishes all components built under dist/<version>/<sequence>/<component>/:
#   - Uploads release assets to GitHub Releases (via gh)
#   - Stages v3 envelopes to Arcus manifests
#   - Signs index via arcus manifest sign-index
#   - Provides arcus publish submit / arcus publish status entrypoints
# =============================================================================
set -eu

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH="" cd -- "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-}"
ARCUS_BIN="${ARCUS_BIN:-arcus}"
ARCUS_REPO="${ARCUS_REPO:-/Volumes/Topper2TB/Git/arcus}"
KEY_FILE="${KEY_FILE:-${HOME}/.config/arcus/signing.key}"
DRY_RUN="${DRY_RUN:-0}"

if [ -z "$VERSION" ]; then
  VERSION=$(node -e 'console.log(require("./packages/opencode/package.json").version)')
fi

DIST_VERSION_DIR="${REPO_ROOT}/dist/${VERSION}"

if [ ! -d "$DIST_VERSION_DIR" ]; then
  printf "error: no packaged components found under %s\n" "$DIST_VERSION_DIR" >&2
  printf "hint: run \"bun run pack:arcus\" first.\n" >&2
  exit 1
fi

printf "=====================================================================\n"
printf "publish-all-arcus: Publishing openai-auth Suite (%s)\n" "$VERSION"
printf "Reading packages from: %s\n" "$DIST_VERSION_DIR"
printf "=====================================================================\n"

# Locate all release envelopes
ENVELOPES=$(find "$DIST_VERSION_DIR" -name "*.json" | grep "/releases/" | grep -v ".index-policy.json" | sort)

if [ -z "$ENVELOPES" ]; then
  printf "error: no release envelopes found under %s\n" "$DIST_VERSION_DIR" >&2
  exit 1
fi

GITHUB_REPO="rustybret/openai-auth-experimental"

for env_file in $ENVELOPES; do
  comp_dir="$(dirname "$(dirname "$env_file")")"
  comp_name="$(basename "$comp_dir")"
  env_name="$(basename "$env_file")"
  release_id="${env_name%.json}"

  printf "\n>>> Processing component: %s (release: %s)...\n" "$comp_name" "$release_id"

  TAG="v${VERSION}"

  # 1. GitHub release asset upload
  if [ "$DRY_RUN" -eq 1 ]; then
    printf "  [dry-run] would upload %s assets to GitHub release %s\n" "$comp_name" "$TAG"
  else
    if ! gh release view "$TAG" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
      printf "  -> creating GitHub release %s on %s...\n" "$TAG" "$GITHUB_REPO"
      gh release create "$TAG" --repo "$GITHUB_REPO" \
        --title "openai-auth ${TAG}" \
        --notes "Arcus release for ${TAG}"
    fi

    printf "  -> uploading assets to GitHub release %s...\n" "$TAG"
    for asset in "${comp_dir}"/*; do
      [ -f "$asset" ] || continue
      case "$asset" in
        *.tar.gz|*.tar.zst|*.zip|*.pwr|*.json)
          gh release upload "$TAG" "$asset" --repo "$GITHUB_REPO" --clobber
          ;;
      esac
    done
  fi

  # 2. Stage into Arcus manifests repository
  if [ -d "$ARCUS_REPO" ]; then
    V3_DEST_DIR="${ARCUS_REPO}/manifests/v3/${comp_name}/releases"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf "  [dry-run] would stage %s to %s\n" "$env_name" "$V3_DEST_DIR"
    else
      printf "  -> staging envelope to %s...\n" "$V3_DEST_DIR"
      mkdir -p "$V3_DEST_DIR"
      cp "$env_file" "${V3_DEST_DIR}/"
      policy_file="${env_file%.json}.index-policy.json"
      if [ -f "$policy_file" ]; then
        cp "$policy_file" "${V3_DEST_DIR}/"
      fi
    fi
  fi
done

# 3. Synchronize and sign Arcus index
if [ -d "$ARCUS_REPO" ] && [ "$DRY_RUN" -eq 0 ]; then
  printf "\n[Signing] Synchronizing and signing Arcus v3 index...\n"
  (
    cd "$ARCUS_REPO"
    "$ARCUS_BIN" manifest sign-index --root manifests/v3 --key-file "$KEY_FILE"
    git add manifests/v3
    git commit -m "feat(manifests): publish openai-auth suite ${VERSION}" ||
      printf "notice: manifests already up to date\n"
    git push --no-verify origin main
  )
fi

printf "\n=====================================================================\n"
printf "publish-all-arcus: Suite publication complete!\n"
printf "Available gateway publishing commands:\n"
printf "  • arcus publish submit [bundle_dir] --gateway https://arcus-auth.rustybret.com\n"
printf "  • arcus publish status <submission_id> --gateway https://arcus-auth.rustybret.com\n"
printf "=====================================================================\n"
