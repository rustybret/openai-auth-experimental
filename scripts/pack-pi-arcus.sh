#!/bin/sh
# =============================================================================
# pack-pi-arcus.sh — Package Pi OpenAI Auth Extension
# Output: dist/<version>/<sequence>/pi-openai-auth/
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
  VERSION=$(node -e 'console.log(require("./packages/pi/package.json").version)')
fi

if [ -z "$SEQUENCE" ]; then
  SEQUENCE=$(arcus manifest allocate-sequence --gateway https://arcus-auth.rustybret.com --package-id pi-openai-auth --json 2>/dev/null | jq -r '.sequence' 2>/dev/null || echo "1")
fi

OUTPUT_DIR="${REPO_ROOT}/dist/${VERSION}/${SEQUENCE}/pi-openai-auth"

if [ "$NO_CLEAN" -eq 0 ] && [ -d "$OUTPUT_DIR" ]; then
  rm -rf "$OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_DIR"

if [ "$SKIP_BUILD" -eq 0 ]; then
  printf "pack-pi-arcus: purging stale build output...\n"
  rm -rf "${REPO_ROOT}/packages/pi/dist"
  printf "pack-pi-arcus: building pi extension dists...\n"
  bun run --cwd "${REPO_ROOT}/packages/pi" build
fi

printf "pack-pi-arcus: staging clean payload...\n"
TMP_STAGING=$(mktemp -d "${TMPDIR:-/tmp}/pi-pack.XXXXXX")
trap 'rm -rf "$TMP_STAGING"' EXIT INT TERM

cp "${REPO_ROOT}/packages/pi/package.json" "$TMP_STAGING/"
cp "${REPO_ROOT}/packages/pi/README.md" "$TMP_STAGING/"
if [ -f "${REPO_ROOT}/packages/pi/LICENSE" ]; then
  cp "${REPO_ROOT}/packages/pi/LICENSE" "$TMP_STAGING/"
elif [ -f "${REPO_ROOT}/LICENSE" ]; then
  cp "${REPO_ROOT}/LICENSE" "$TMP_STAGING/"
fi
cp -R "${REPO_ROOT}/packages/pi/dist" "$TMP_STAGING/"

printf "pack-pi-arcus: packing pi-openai-auth %s (seq: %s) -> %s\n" "$VERSION" "$SEQUENCE" "$OUTPUT_DIR"

set -- \
  --config "${REPO_ROOT}/packages/arcus/pi-openai-auth.json" \
  --version "$VERSION" \
  --release-id "pi-openai-auth-${VERSION}-${SEQUENCE}" \
  --sequence "$SEQUENCE" \
  --output "$OUTPUT_DIR" \
  --offline

for target in darwin-arm64 darwin-x64 linux-arm64 linux-x64 windows-x64; do
  set -- "$@" --target-input "${target}=${TMP_STAGING}"
done

sh "${REPO_ROOT}/packages/arcus/toolchain/scripts/pack-arcus.sh" "$@"

if [ -d "${OUTPUT_DIR}/payload" ]; then
  rm -rf "${OUTPUT_DIR}/payload"
fi

find "$OUTPUT_DIR" -name '.DS_Store' -type f -delete 2>/dev/null || true
