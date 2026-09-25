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

All release artifacts reside under a single, deterministic, sequence-first directory hierarchy rooted at `dist/`. The root `.gitignore` ignores `dist/`. No other `dist-*` directories exist or are permitted.

### Structure

```text
dist/
└── <sequence>/
    ├── opencode-openai-auth/
    │   └── <version>/
    │       ├── submission.json
    │       ├── pack-report.json
    │       ├── release.json
    │       ├── releases/
    │       │   ├── opencode-openai-auth-<version>-<sequence>.json
    │       │   └── opencode-openai-auth-<version>-<sequence>.index-policy.json
    │       ├── opencode-openai-auth-<version>-<target>.tar.gz
    │       ├── opencode-openai-auth-<version>-<target>-content.zip
    │       ├── opencode-openai-auth-<version>-<target>.pwr
    │       └── cortexkit-opencode-openai-auth-<version>.tgz
    └── pi-openai-auth/
        └── <version>/
            ├── submission.json
            ├── pack-report.json
            ├── release.json
            ├── releases/
            │   ├── pi-openai-auth-<version>-<sequence>.json
            │   └── pi-openai-auth-<version>-<sequence>.index-policy.json
            ├── pi-openai-auth-<version>-<target>.tar.gz
            ├── pi-openai-auth-<version>-<target>-content.zip
            └── pi-openai-auth-<version>-<target>.pwr
```

### Why Sequence-First Organization is Superior
1. **Sequence is the True Immutable Timeline**: Filesystem sorting by `<sequence>` directly reflects the release timeline and catalog promotion order, whereas sorting by SemVer breaks when components have different version cadences.
2. **Whole-Submission Atomic Staging**: A single folder (`dist/<sequence>/`) contains the complete immutable set of packages and descriptors that ship together in that suite release.
3. **Zero Ambiguity**: When Arcus intake tools ingest or audit submission bundles, there is zero confusion about which version belongs to which sequence.
4. **Self-Contained Submission Bundles**: Each component folder (`dist/<sequence>/<package>/<version>/`) carries its own `submission.json` and release envelope, making it directly consumable by `arcus publish submit` or intake automation.

### Target Coverage per Component

Both components are portable packages shipping byte-identical payloads across all five canonical Arcus targets:
1. `darwin-arm64`
2. `darwin-x64`
3. `linux-arm64`
4. `linux-x64`
5. `windows-x64`

Shipping fewer than all five targets is a defect, as a user on a missing platform would fail to resolve the package from the Arcus catalog.

---

## Suite Sequence Synchronization & Anti-Rollback

Arcus client anti-rollback rules are evaluated per-package:
$$\text{requested.sequence} > \text{installed.sequence}$$

Arcus requires strict monotonicity ($> \text{current}$); it does not require $+1$ increments, making sequence jumps valid.

For multi-component suites, all modules share a unified suite sequence calculated as:
$$\text{suite\_seq} = \max(\text{all suite package sequences}) + 1$$

### Benefits:
- **Compatibility Lock**: Immediate proof that `opencode-openai-auth` and `pi-openai-auth` originated from the exact same unified suite build.
- **Eliminates Sequence Drift**: Components do not develop skewed, mismatched sequence numbers.
- **Never Resets**: Sequence numbers strictly increment up over time and never reset to 1 across releases or upstream syncs.

---

## Pipeline Lifecycle & Commands

### 1. Master Packaging: `scripts/pack-all-arcus.sh`
Packages all components under the unified sequence-first hierarchy (`dist/<sequence>/<component>/<version>/`):
```bash
bun run pack:arcus
# Or with explicit flags:
bash scripts/pack-all-arcus.sh --version 0.9.0 --sequence 8
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
Publishes all components under `dist/<sequence>/`:
- Creates GitHub Release tag `v<version>` on `rustybret/openai-auth-experimental`.
- Uploads platform archives, content zips, and Wharf signatures.
- Stages signed envelopes to Arcus manifests in `/Volumes/Topper2TB/Git/arcus/manifests/v3/`.
- Signs the Arcus index with `arcus manifest sign-index`.

### 5. Arcus Gateway Commands (Arcus v3 CLI)
- **Submit Release Bundle**:
  ```bash
  arcus publish submit [bundle_dir] --gateway https://arcus-auth.rustybret.com [--wait]
  ```
  Submits an immutable release bundle to the gateway for automated testing and hydration.
- **Query Submission Status**:
  ```bash
  arcus publish status <submission_id> --gateway https://arcus-auth.rustybret.com
  ```
  Queries verification diagnostics and hydration outcome of a submission.

---

## How Release Versions Are Handled in Arcus

- **SemVer Parity**: Package versions must strictly match upstream semver (e.g. `0.9.0`). Dash-number suffixes (e.g. `-1`, `-2`) are reserved in SemVer 2.0.0 for prerelease/beta builds and MUST NOT be used for internal fork revisions or Arcus releases unless upstream itself publishes a prerelease.
- **Monotonic Sequence Increments**: All internal releases, fork updates, packaging fixes, and republished distributions are tracked via monotonic integer sequence numbers allocated by the Arcus gateway (`arcus manifest allocate-sequence`).
- **Distribution Layout**: All artifacts are strictly organized under sequence-first layout: `dist/<sequence>/<package>/<version>/` (e.g. `dist/8/opencode-openai-auth/0.9.0/` and `dist/8/pi-openai-auth/0.9.0/`).
- **Canonical Arcus CLI Commands**:
  * `arcus publish submit [bundle_dir] [--wait]` (submits an immutable release bundle over authenticated HTTPS)
  * `arcus publish status <submission_id>` (queries verification diagnostics and hydration status)
