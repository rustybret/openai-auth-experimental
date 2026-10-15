# ⚡ openai-auth

Downstream private fork of [`cortexkit/openai-auth`](https://github.com/cortexkit/openai-auth), distributed via [Arcus](https://arcus-auth.rustybret.com) and published to [`rustybret/openai-auth-experimental`](https://github.com/rustybret/openai-auth-experimental).

---

## 📖 Upstream Parity & Canonical Documentation

This repository tracks upstream [`cortexkit/openai-auth`](https://github.com/cortexkit/openai-auth) for core ChatGPT Plus/Pro OAuth authentication, Codex request wire shaping, account pooling, reactive fallback, sticky routing, prompt-cache stabilization, and OpenTUI sidebar status contracts.

For baseline architecture, OAuth exchange mechanisms, raw transport behavior, and generic troubleshooting, consult the canonical upstream documentation:
- **Upstream Repository**: [github.com/cortexkit/openai-auth](https://github.com/cortexkit/openai-auth)
- **Architecture**: [`ARCHITECTURE.md`](ARCHITECTURE.md) (system-of-record contract mapping)
- **Codebase Structure**: [`STRUCTURE.md`](STRUCTURE.md)

---

## 🚀 Fork Differentiators & Enhancements

This fork maintains three major operational extensions over upstream:

### 1. Arcus v3 Packaging & Distribution
The entire suite is packaged, signed, and published as canonical Arcus v3 packages:
- `opencode-openai-auth`: OpenCode 1.x plugin with Codex request rewriting and OpenTUI sidebar
- `pi-openai-auth`: Pi coding agent extension with custom `openai-codex` provider registration

All release artifacts are organized under the sequence-first hierarchy (`dist/<sequence>/<package_id>/<version>/`) and submitted directly to the Arcus gateway over authenticated HTTPS.

### 2. Multi-Harness Host Integration
Direct integration across developer toolchains without relying on npm registries:
- Zero-external-dependency local builds via Bun workspaces
- Formatted OpenTUI sidebar components precompiled to `src/tui-compiled/`
- Compatibility with both OpenCode and Pi agent execution environments

### 3. Automated Upstream Sync & Protection
- Automated tracking of upstream `main` via `scripts/fork-sync.sh`
- Conflict isolation through declarative `scripts/fork-sync-exclusions`
- Lockfile regeneration and range enforcement gates on every upstream sync

---

## 📦 Installation & Setup

### Option A: Install via Arcus (Recommended)

```bash
arcus install opencode-openai-auth --channel stable
arcus install pi-openai-auth --channel stable
```

### Option B: Local Source Build

```bash
git clone https://github.com/rustybret/openai-auth-experimental.git
cd openai-auth-experimental
git checkout local/fork
bun install
bun run build
```

Point OpenCode at the local build (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": [
    "file:///path/to/openai-auth/packages/opencode/dist/index.js"
  ]
}
```

---

## 🛠️ Slash Commands & Management

In OpenCode sessions, manage accounts, quotas, and routing via slash commands:

```text
/openai-account    # Inspect active primary and fallback ChatGPT accounts
/openai-quota      # Display real-time quota windows, reset clocks, and credit budgets
/openai-routing    # Configure sticky-balanced, priority, or fallback routing modes
/openai-killswitch # Configure usage limits and safety shutoff thresholds
/openai-cachekeep  # Toggle prompt-cache keep-warm and sustain policies
```

---

## 🤝 Fork Maintenance & Sync

This repository follows UC Studio fleet fork discipline:
- `version` strictly mirrors upstream plain SemVer (no fork-local increments or `-1` suffixes).
- Downstream release builds on a shared version increment the monotonic Arcus `sequence`.
- Upstream merges are executed via `bun run fork-sync` with exclusions maintained in `scripts/fork-sync-exclusions`.
- Root `README.md` is governed by `take-ours` to preserve this differential specification across upstream merges.

---

## ⚠️ Migration & Downgrade Notice

Downgrading after the account-pool migration is unsupported. The migration replaces OpenCode's login with an OAuth placeholder whose access token is empty; a pre-1.0 build that does not understand the placeholder would send an empty bearer instead of reading the account pool. Keep the pool-aware build, or sign in afresh in a separate store before using an older build.
