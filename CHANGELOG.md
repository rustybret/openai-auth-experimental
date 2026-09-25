# Changelog

## v0.9.0 — 2026-09-22

### [Upstream Changes]
- Merged upstream `v0.9.0`:
  - Upstream release bump to 0.9.0.
  - Subc client and claustrum mode enhancements.

### [Arcus/Internal Modifications]
- Versioning policy alignment: strictly match upstream semver `0.9.0` (dash-number versions reserved for upstream prereleases); internal fork and Arcus releases track exclusively via monotonic sequence increments (Sequence 8).
- Canonical Arcus release layout: adopted sequence-first directory hierarchy `dist/<sequence>/<package>/<version>/` with suite sequence synchronized across all components (`suite_seq = max(all suite sequences) + 1`).
- Dependency alignment: updated `@cortexkit/subc-client` to `^0.13.1` across core and opencode packages to sync with subconscious subc crate and CortexKit shared transport protocols.
- Web search replay fix: guarantee `action.type` (`"search"`) in `web_search_call` replay to prevent OpenAI `AI_APICallError: Missing required parameter: 'input[...].action.type'` schema rejection.
- Arcus v3 publisher transition: adopted canonical `packages/arcus/` toolchain layout, gateway sequence auto-allocation, and removed git submodules.

## v0.8.0-1 — 2026-09-17

### [Upstream Changes]
- Merged upstream `v0.8.0` (including `0c90408` docs):
  - Retired `openai-auth` CLI binary in favor of integrated OpenCode and Pi auth management surfaces.
  - Added OpenCode auth management menu inside `opencode auth login` (add account, auth current, check quotas, auth doctor, apply repairs, delete all accounts).
  - Added Pi extension account commands (`openai-account`, `openai-quota`, `openai-routing`) backed by shared core.
  - Transport fix: do not treat transport envelope as shown output.
  - Self-contained private core packaging.
  - Documentation updates for auth menu and Pi command surface in `ARCHITECTURE.md` and `STRUCTURE.md`.

### [Arcus/Internal Modifications]
- Bumped package versions to `0.8.0-1` (`@cortexkit/opencode-openai-auth`, `@cortexkit/pi-openai-auth`).
- Reconciled Arcus fleet governance and fork-sync exclusions.
- Transitioned to Arcus v3 publisher process:
  - Decommissioned `submodules/arcus` and removed `.gitmodules`.
  - Adopted `packages/arcus/` consumer integration layout with `bootstrap.sh` toolchain hydration and `arcus.json` manifest.
  - Configured Authentik gateway sequence allocation (`https://arcus-auth.rustybret.com`) and immutable submission bundle publishing with zero direct git checkout operations.
  - Rewired `scripts/` lifecycle symlinks to `packages/arcus/toolchain/scripts/`.

## v0.7.2-1 — 2026-09-17

### [Upstream Changes]
- Merged upstream `v0.7.2`:
  - Extracted shared command implementations and types into `@cortexkit/openai-auth-core` (`packages/core`).
  - Transport stream resilience: record opening frame types on stream failure; prevent provider wording from reopening closed turns; keep oversized-frame refusals out of host retry matches.
  - Dependency toolchain updates: updated `@ai-sdk/openai`, OpenTUI, and Pi packages.
  - Rate limit credit reset tooling: updated `/openai-reset` command preconditions and wham credit counting.

### [Arcus/Internal Modifications]
- Declarative Arcus v2 manifest: added `arcus.json` specifying Archetype A (`opencode-openai-auth` / `opencode-plugin`).
- Versioning format: adopted `<upstream_semver>-<fork_revision>` standard (`0.7.2-1`).
- Slash command formatting: updated `/openai-account` status to distinguish connected primary OpenCode account from empty fallback roster, referencing `opencode providers login --provider openai`.
- Fork sync automation: maintained `scripts/fork-sync-exclusions` with `regenerate:` verb for `bun.lock` and `keep-deleted:` for upstream CI/release workflows.

## v0.2.0-experimental — 2026-06-20

This release integrates upstream v0.1.3 (CortexKit's official multi-account release) alongside two local fixes developed ahead of that release. The hostname guard closes a cross-provider auth-header corruption bug introduced by the OpenCode plugin system's global fetch hook — without it, requests to Google, Anthropic, and other provider proxies would have their API keys stripped and replaced with a Codex OAuth token. The upstream `rate_limits` crashfix resolves a wire-shape mismatch where `additional_rate_limits` arrives as an object keyed by model name rather than a flat array, which caused a `{} is not iterable` exception that tore down the WebSocket frame loop mid-session. Both fixes are tested; the suite grew by one regression case to 393 passing tests.

**Changes since v0.1.0-experimental:**
- Merged upstream v0.1.3: official multi-account parity release (`feat/parity` PR) — multi-account fallback, quota tracking, cache keep-warm, `/openai-account`, `/openai-quota`, `/openai-killswitch`, `/openai-cachekeep`, `/openai-routing` commands, and the `openai-auth` CLI
- Merged upstream `fix: stop crashing on real codex.rate_limits additional_rate_limits shape` — `normalizeWsFrame` / `normalizeWham` now ignore the object-keyed per-model windows instead of iterating them with `for..of`
- **Local fix:** hostname guard in `auth.fetch` — bails immediately for any request not destined for `api.openai.com`, `chatgpt.com`, or the configured Codex endpoint, preventing Codex token injection on Google/Anthropic/proxy requests
- `@opencode-ai/plugin` bumped to 1.17.7 (PR #6)
- `ai` package bumped to v6.0.208 / major version upgrade from v5 (PR #2)
- Fork documentation: repo renamed to `openai-auth-experimental`, fork notice and local-build install instructions added to README, quick-reference login table added to Authenticate section

## v0.1.0-experimental — 2026-06-19

Initial experimental fork of [cortexkit/openai-auth](https://github.com/cortexkit/openai-auth). Branched from upstream `main` at `4f7beb7` (v0.1.2).
