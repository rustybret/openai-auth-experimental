#!/bin/sh
# =============================================================================
# pack-opencode-arcus.sh — Package OpenCode OpenAI Auth Plugin
# Output: dist/<version>/<sequence>/opencode-openai-auth/
# =============================================================================
set -eu

SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH="" cd -- "${SCRIPT_DIR}/.." && pwd)"

VERSION=""
SEQUENCE=""
SKIP_BUILD="${SKIP_BUILD:-0}"
NO_CLEAN="${NO_CLEAN:-0}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --sequence) SEQUENCE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --no-clean) NO_CLEAN=1; shift ;;
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

OUTPUT_DIR="${REPO_ROOT}/dist/${SEQUENCE}/opencode-openai-auth/${VERSION}"

if [ "$NO_CLEAN" -eq 0 ] && [ -d "$OUTPUT_DIR" ]; then
  rm -rf "$OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_DIR"

if [ "$SKIP_BUILD" -eq 0 ]; then
  printf "pack-opencode-arcus: purging stale build output...\n"
  rm -rf "${REPO_ROOT}/packages/opencode/dist"
  printf "pack-opencode-arcus: building opencode plugin dists...\n"
  bun run --cwd "${REPO_ROOT}/packages/opencode" build
fi

RELEASE_ID="opencode-openai-auth-${VERSION}-${SEQUENCE}"

printf "pack-opencode-arcus: packing opencode-openai-auth %s (seq: %s) -> %s\n" "$VERSION" "$SEQUENCE" "$OUTPUT_DIR"

sh "${REPO_ROOT}/packages/arcus/toolchain/scripts/pack-arcus.sh" \
  --config "${REPO_ROOT}/packages/arcus/opencode-openai-auth.json" \
  --version "$VERSION" \
  --release-id "$RELEASE_ID" \
  --sequence "$SEQUENCE" \
  --output "$OUTPUT_DIR" \
  --offline

if [ -d "${OUTPUT_DIR}/payload" ]; then
  rm -rf "${OUTPUT_DIR}/payload"
fi

# Ensure release.json symlink exists for direct bundle intake
if [ -f "${OUTPUT_DIR}/releases/${RELEASE_ID}.json" ] && [ ! -f "${OUTPUT_DIR}/release.json" ]; then
  ln -sf "releases/${RELEASE_ID}.json" "${OUTPUT_DIR}/release.json"
fi

# Generate submission.json for self-contained intake
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat <<EOF > "${OUTPUT_DIR}/submission.json"
{
  "schema_version": 1,
  "package_id": "opencode-openai-auth",
  "release_id": "${RELEASE_ID}",
  "version": "${VERSION}",
  "sequence": ${SEQUENCE},
  "sequence_source": "suite",
  "created_at": "${CREATED_AT}",
  "toolchain_version": "0.4.0",
  "publisher_key_id": "fc7b2603635dc23aa87223cc3cf9395cef2f9e630a951d7da22803649b1fdac8"
}
EOF

# Compatibility symlink for legacy dist/arcus intake paths
LEGACY_ARCUS_DIR="${REPO_ROOT}/dist/arcus/${RELEASE_ID}"
mkdir -p "${REPO_ROOT}/dist/arcus"
rm -rf "$LEGACY_ARCUS_DIR"
ln -sfn "$OUTPUT_DIR" "$LEGACY_ARCUS_DIR"

find "$OUTPUT_DIR" -name '.DS_Store' -type f -delete 2>/dev/null || true
