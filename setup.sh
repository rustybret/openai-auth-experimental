#!/usr/bin/env bash
# ==============================================================================
# Repository Setup & Toolchain Bootstrap (openai-auth)
# ==============================================================================
# Hydrates git submodules (sparse checkout for Arcus v2 lifecycle scripts),
# verifies toolchain dependencies, and ensures scripts symlinks are wired.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

echo "======================================================================"
echo " openai-auth Setup & Submodule Bootstrap"
echo "======================================================================"
echo ""

# ------------------------------------------------------------------------------
# 1. Initialize & Hydrate Submodules (Sparse Checkout)
# ------------------------------------------------------------------------------
echo "==> 1/3 Initializing Git submodules..."
if [ -f ".gitmodules" ]; then
  git submodule update --init --recursive submodules/arcus
  if [ -d "submodules/arcus" ]; then
    echo "  Configuring sparse-checkout for submodules/arcus (skills/scripts, skills/arcus-packaging)..."
    git -C submodules/arcus sparse-checkout set skills/scripts skills/arcus-packaging
  fi
  echo "✓ Git submodules initialized and hydrated."
else
  echo "• No .gitmodules found; skipping."
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
)

TARGET_DIR="../submodules/arcus/skills/scripts"
for script in "${ARCUS_SCRIPTS[@]}"; do
  link="scripts/${script}"
  target="${TARGET_DIR}/${script}"
  if [ ! -L "$link" ] || [ "$(readlink "$link")" != "$target" ]; then
    echo "  Wiring symlink: $link -> $target"
    ln -sf "$target" "$link"
  fi
  if [ ! -e "$link" ]; then
    echo "✗ Error: broken symlink: $link -> $target (submodule not hydrated?)"
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
