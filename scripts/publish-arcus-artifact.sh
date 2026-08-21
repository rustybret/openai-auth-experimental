#!/usr/bin/env bash
# Arcus Release Publish Script for OpenAI Auth (@cortexkit/opencode-openai-auth)
#
# Uploads the compiled plugin archive to GitHub Releases on the fork repository
# (rustybret/openai-auth-experimental) and updates the Arcus manifest with the real URL and SHA256 hash.
# Run locally by operators or by BuildKit on altos-worker-01.
#
# Usage:
#   bash scripts/publish-arcus-artifact.sh
#   GH_TOKEN=<pat> bash scripts/publish-arcus-artifact.sh
#
# Environment:
#   VERSION:          Plugin version (default: read from packages/opencode/package.json)
#   REPO:             GitHub repository for release assets (default: rustybret/openai-auth-experimental)
#   GH_TOKEN:         GitHub PAT / App token with release upload permissions (optional if gh CLI is authenticated)
#   ARCUS_REPO_PATH:  Path to arcus repository (default: ../arcus or submodules/arcus if present)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
PLUGIN_DIR="$REPO_ROOT/packages/opencode"

VERSION="${VERSION:-$(node -e "console.log(require('$PLUGIN_DIR/package.json').version)")}"
REPO="${REPO:-rustybret/openai-auth-experimental}"
TAG="${TAG:-v${VERSION}}"
DIST_DIR="$REPO_ROOT/dist-arcus"
ARCHIVE_NAME="cortexkit-opencode-openai-auth-${VERSION}.tgz"
ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"
MANIFEST_FILE="$DIST_DIR/arcus-manifest.json"

# Step 1: Ensure archive and manifest exist
if [[ ! -f "$ARCHIVE_PATH" || ! -f "$MANIFEST_FILE" ]]; then
  echo "[publish] Archive or manifest not found. Building package first..."
  bash "$SCRIPT_DIR/pack-arcus.sh" "$DIST_DIR"
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "ERROR: Archive still not found: $ARCHIVE_PATH" >&2
  exit 1
fi

# Step 2: Compute SHA256 checksum
if command -v shasum >/dev/null 2>&1; then
  SHA256=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
else
  echo "ERROR: Neither shasum nor sha256sum found on PATH" >&2
  exit 1
fi

echo "[publish] Package: $ARCHIVE_NAME"
echo "[publish] SHA256:  $SHA256"

# Step 3: Upload to GitHub Release if gh is available
ASSET_URL="https://github.com/${REPO}/releases/download/${TAG}/${ARCHIVE_NAME}"

if command -v gh >/dev/null 2>&1; then
  echo "[publish] Uploading $ARCHIVE_NAME to $REPO release $TAG..."
  if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    gh release upload "$TAG" "$ARCHIVE_PATH" --clobber --repo "$REPO"
    echo "[publish] Uploaded to existing release $TAG."
  else
    echo "[publish] Creating release $TAG on $REPO..."
    gh release create "$TAG" "$ARCHIVE_PATH" --repo "$REPO" --title "v${VERSION}" --notes "Release v${VERSION} of @cortexkit/opencode-openai-auth"
    echo "[publish] Created release $TAG and uploaded asset."
  fi
else
  echo "[publish] Note: gh CLI not available; skipping GitHub Release upload."
  echo "[publish] Expected asset URL: $ASSET_URL"
fi

# Step 4: Update dist-arcus/arcus-manifest.json with real SHA256 and URL
echo "[publish] Updating manifest with real SHA256 and asset URL..."
if command -v bun >/dev/null 2>&1; then
  ARCUS_MANIFEST_FILE="$MANIFEST_FILE" ARCUS_SHA256="$SHA256" ARCUS_URL="$ASSET_URL" bun -e '
    import { readFileSync, writeFileSync } from "node:fs";
    const p = process.env.ARCUS_MANIFEST_FILE;
    const m = JSON.parse(readFileSync(p, "utf8"));
    if (m.plugin?.asset) {
      m.plugin.asset.sha256 = process.env.ARCUS_SHA256;
      m.plugin.asset.url = process.env.ARCUS_URL;
    }
    writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  '
else
  node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync('$MANIFEST_FILE', 'utf8'));
    if (m.plugin && m.plugin.asset) {
      m.plugin.asset.sha256 = '$SHA256';
      m.plugin.asset.url = '$ASSET_URL';
    }
    fs.writeFileSync('$MANIFEST_FILE', JSON.stringify(m, null, 2) + '\n');
  "
fi

# Step 5: If local arcus repo exists, update its manifest directly
ARCUS_DIR=""
if [[ -n "${ARCUS_REPO_PATH:-}" && -d "$ARCUS_REPO_PATH" ]]; then
  ARCUS_DIR="$ARCUS_REPO_PATH"
elif [[ -d "$REPO_ROOT/../arcus/manifests/openai-auth" ]]; then
  ARCUS_DIR="$REPO_ROOT/../arcus"
elif [[ -d "$REPO_ROOT/submodules/arcus/manifests/openai-auth" ]]; then
  ARCUS_DIR="$REPO_ROOT/submodules/arcus"
fi

if [[ -n "$ARCUS_DIR" && -d "$ARCUS_DIR/manifests/openai-auth" ]]; then
  TARGET_MANIFEST="$ARCUS_DIR/manifests/openai-auth/v${VERSION}.json"
  echo "[publish] Updating local Arcus repository manifest: $TARGET_MANIFEST"
  cp "$MANIFEST_FILE" "$TARGET_MANIFEST"
  echo "[publish] Synced manifest to $TARGET_MANIFEST."
fi

echo ""
echo "=== Arcus Publish Complete ==="
echo "  Archive:  $ARCHIVE_PATH"
echo "  Manifest: $MANIFEST_FILE"
echo "  SHA256:   $SHA256"
echo "  URL:      $ASSET_URL"
