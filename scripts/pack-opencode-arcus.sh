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

OUTPUT_DIR="${REPO_ROOT}/dist/${VERSION}/${SEQUENCE}/opencode-openai-auth"

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

printf "pack-opencode-arcus: packing opencode-openai-auth %s (seq: %s) -> %s\n" "$VERSION" "$SEQUENCE" "$OUTPUT_DIR"

sh "${REPO_ROOT}/packages/arcus/toolchain/scripts/pack-arcus.sh" \
  --config "${REPO_ROOT}/packages/arcus/opencode-openai-auth.json" \
  --version "$VERSION" \
  --release-id "opencode-openai-auth-${VERSION}-${SEQUENCE}" \
  --sequence "$SEQUENCE" \
  --output "$OUTPUT_DIR" \
  --offline

if [ -d "${OUTPUT_DIR}/payload" ]; then
  rm -rf "${OUTPUT_DIR}/payload"
fi

find "$OUTPUT_DIR" -name '.DS_Store' -type f -delete 2>/dev/null || true
