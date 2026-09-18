#!/usr/bin/env bash
# ==============================================================================
# Repository Setup & Toolchain Bootstrap (openai-auth)
# ==============================================================================
# Bootstraps Arcus v3 publisher toolchain via packages/arcus,
# verifies toolchain dependencies, and ensures scripts symlinks are wired.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

echo "======================================================================"
echo " openai-auth Setup & Arcus Publisher Bootstrap"
echo "======================================================================"
echo ""

# ------------------------------------------------------------------------------
# 1. Bootstrap Arcus Publisher Toolchain
# ------------------------------------------------------------------------------
echo "==> 1/3 Bootstrapping Arcus publisher toolchain..."
if [ -f "packages/arcus/bootstrap.sh" ]; then
  sh packages/arcus/bootstrap.sh
  echo "✓ Arcus publisher toolchain bootstrapped."
else
  echo "• packages/arcus/bootstrap.sh not found; skipping."
fi
echo ""

# ------------------------------------------------------------------------------
# 2. Verify / Restore Arcus Scripts Symlinks
# ------------------------------------------------------------------------------
echo "==> 2/3 Verifying Arcus lifecycle scripts symlinks..."
mkdir -p scripts
ARCUS_SCRIPTS=(
  "pack-arcus.sh"
  "sign-arcus.sh"
  "validate-arcus.sh"
  "publish-arcus.sh"
  "migrate-arcus.sh"
  "arcus-pipeline.sh"
  "arcus-toolchain.json"
  "arcus.schema.json"
  "submission.schema.json"
)

TARGET_DIR="../packages/arcus/toolchain/scripts"
for script in "${ARCUS_SCRIPTS[@]}"; do
  link="scripts/${script}"
  target="${TARGET_DIR}/${script}"
  if [ ! -L "$link" ] || [ "$(readlink "$link")" != "$target" ]; then
    echo "  Wiring symlink: $link -> $target"
    ln -sf "$target" "$link"
  fi
  if [ ! -e "$link" ]; then
    echo "✗ Error: broken symlink: $link -> $target (toolchain not bootstrapped?)"
    exit 1
  fi
done
echo "✓ All Arcus lifecycle scripts symlinked and verified."
echo ""

# ------------------------------------------------------------------------------
# 3. Check Core Toolchain Dependencies
# ------------------------------------------------------------------------------
echo "==> 3/3 Checking Toolchain Dependencies..."

check_tool() {
  local tool="$1"
  local install_hint="$2"
  local required="${3:-optional}"

  if command -v "$tool" &>/dev/null; then
    local tool_path
    tool_path="$(command -v "$tool")"
    echo "  ✓ $tool found at $tool_path"
  else
    if [ "$required" = "required" ]; then
      echo "  ✗ Missing required tool: $tool"
      echo "    $install_hint"
      return 1
    else
      echo "  • Optional tool missing: $tool ($install_hint)"
    fi
  fi
}

ERRORS=0
check_tool "bun" "Install Bun runtime (https://bun.sh / brew install oven-sh/bun/bun)" "required" || ERRORS=$((ERRORS + 1))
check_tool "git" "Install Git (https://git-scm.com)" "required" || ERRORS=$((ERRORS + 1))
check_tool "arcus" "Install Arcus CLI (https://github.com/rustybret/arcus)" "optional" || true
check_tool "gh" "Install GitHub CLI (brew install gh / https://cli.github.com)" "optional" || true

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "✗ Setup incomplete: $ERRORS required tool(s) missing."
  exit 1
fi

echo ""
echo "======================================================================"
echo "✓ Setup complete! Project is ready."
echo "======================================================================"
