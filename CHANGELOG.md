# Changelog

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
