# Arcus Multi-Component Packaging Pipeline & Distribution Standard

## Goal and Spirit of Arcus Integration

The `openai-auth` repository delivers two coordinated components:
- `opencode-openai-auth`: OpenCode OAuth and request transformation plugin package (`packages/opencode`)
- `pi-openai-auth`: Pi coding agent Codex OAuth extension package (`packages/pi`)

Both components share the private core package (`@cortexkit/openai-auth-core`) and agree on wire shapes, account schemas, and distribution release sequences.

Historically, component scripts wrote to uncoordinated root directories (`dist-arcus/`, `dist/arcus/`). Per-component sequences could drift independently, and stale artifacts were prone to surviving across runs.

The unified Arcus packaging pipeline establishes a deterministic contract. Every packaging run executes strict pre-pack verification gates, cleans stale output targets, enforces identical release sequence IDs across all core components, and verifies release-set completeness before declaring success.

---

## The Directory Contract

All release artifacts reside under a single, deterministic directory hierarchy rooted at `dist/`. The root `.gitignore` ignores `dist/`. No other `dist-*` directories exist or are permitted.

### Structure

```text
dist/
└── <version>/
    └── <sequence>/
        ├── opencode-openai-auth/
        │   ├── releases/
        │   │   ├── opencode-openai-auth-<version>-<sequence>.json
        │   │   └── opencode-openai-auth-<version>-<sequence>.index-policy.json
        │   ├── opencode-openai-auth-<version>-<target>.tar.gz
        │   ├── opencode-openai-auth-<version>-<target>-content.zip
        │   ├── opencode-openai-auth-<version>-<target>.pwr
        │   ├── pack-report.json
        │   └── cortexkit-opencode-openai-auth-<version>.tgz
        └── pi-openai-auth/
            ├── releases/
            │   ├── pi-openai-auth-<version>-<sequence>.json
            │   └── pi-openai-auth-<version>-<sequence>.index-policy.json
            ├── pi-openai-auth-<version>-<target>.tar.gz
            ├── pi-openai-auth-<version>-<target>-content.zip
            ├── pi-openai-auth-<version>-<target>.pwr
            └── pack-report.json
```

### Target Coverage per Component

Both components are portable packages shipping byte-identical payloads across all five canonical Arcus targets:
1. `darwin-arm64`
2. `darwin-x64`
3. `linux-arm64`
4. `linux-x64`
5. `windows-x64`

Shipping fewer than all five targets is a defect, as a user on a missing platform would fail to resolve the package from the Arcus catalog.

---

## Pipeline Lifecycle & Commands

### 1. Master Packaging: `scripts/pack-all-arcus.sh`
Packages both components under a unified version and sequence directory:
```bash
bun run pack:arcus
# Or with explicit flags:
bash scripts/pack-all-arcus.sh --version 0.9.0-2 --sequence 7
```

### 2. Individual Component Packaging
```bash
bun run pack:opencode    # scripts/pack-opencode-arcus.sh
bun run pack:pi          # scripts/pack-pi-arcus.sh
```

### 3. Release Set Completeness Audit: `scripts/lib/verify-release-set.mjs`
Fails closed if:
- Any component directory is missing.
- Release envelopes are absent under `releases/`.
- `pack-report.json` is missing.
- Any of the 5 canonical targets is missing for portable packages.
- Content source zips (`-content.zip`) or tree signatures (`.pwr`) are missing.
- Staging litter (`payload/`, `node_modules/`) is present.

### 4. Unified Publication & Gateway Submission: `scripts/publish-all-arcus.sh`
```bash
bun run publish:arcus
```
Publishes all components under `dist/<version>/<sequence>/`:
- Creates GitHub Release tag `v<version>` on `rustybret/openai-auth-experimental`.
- Uploads platform archives, content zips, and Wharf signatures.
- Stages signed envelopes to Arcus manifests in `/Volumes/Topper2TB/Git/arcus/manifests/v3/`.
- Signs the Arcus index with `arcus manifest sign-index`.

### 5. Arcus Gateway Commands (Arcus v3 CLI)
- **Submit Release Bundle**:
  ```bash
  arcus publish submit [bundle_dir] --gateway https://arcus-auth.rustybret.com
  ```
  Submits an immutable release bundle to the gateway for automated testing and hydration.
- **Query Submission Status**:
  ```bash
  arcus publish status <submission_id> --gateway https://arcus-auth.rustybret.com
  ```
  Queries verification diagnostics and hydration outcome of a submission.
