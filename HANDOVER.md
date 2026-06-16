# openai-auth — Developer Handover

**Package:** `@cortexkit/opencode-openai-auth` (v0.1.0) · `packages/opencode/`
**Repo:** `~/Work/Projects/CortexKit/openai-auth`
**Status at handover:** core complete + verified, **unpublished**. Do not publish without the owner's explicit go-ahead.

---

## 1. What this plugin is

An OpenCode server plugin that supersedes OpenCode's built-in `openai` provider to add **ChatGPT Plus/Pro OAuth** support. It rewrites OpenCode's outbound requests to the Codex backend (`https://chatgpt.com/backend-api/codex/responses`), filters the model list to OAuth-eligible models, zeroes provider costs for OAuth models, and provides an optional Responses **WebSocket** transport.

It registers the built-in `openai` provider id on purpose: OpenCode loads external server plugins after internal ones, so this package overrides the internal OpenAI auth hook without the user changing model config.

---

## 2. The headline finding (READ THIS FIRST — it's the reason most of the code exists)

The Codex/OAuth backend has a **prompt-cache defect**: on tool-continuation requests whose `tools` array contains **only custom `function`-type tools** (no OpenAI-native tool type), `cached_tokens` intermittently drops to 0 mid-turn ("cliffs"), re-billing the full prefix as uncached. Measured rate on the clean build, **all three transports cliff 8–20% without the fix**.

**Fix:** append a native `web_search` tool to the wire `tools` array. This flips every tool-bearing request onto the backend's stable cache path. It is **web_search-specific** (image_generation / tool_search / extra dummy function tools do NOT fix it) and **transport-independent**.

**Clean-build matrix (ground truth = OpenCode per-step `tokens.cache`):**

| transport | no web_search | + web_search |
|---|---:|---:|
| genuine HTTP | 8.2% | **0%** |
| native Bun WS | 8.5–17.4% | **0%** |
| hand-rolled raw-ws | 20% | **0%** |

Key facts:
- The model **never invokes** `web_search` on coding tasks (0 calls across many runs), so it's a safe, invisible cache anchor. It *is* server-executed, so a hypothetical invocation would run a real OpenAI web search — acceptable given it never fires.
- The fix also **~doubles the steady cached prefix** (~3–5.6k → ~8–10k tokens): a net cost win, not just cliff removal.
- The **paid platform API** (`api.openai.com`, real key, `store:true`) caches the *same* custom-only tools near-clean (~1.9%). So the degradation is **consumer-OAuth-backend-specific**. (Treat "OpenAI deliberately hinders competitors" as *unproven* — the discriminator is request shape, not client identity; every identity test was negative. State it as a backend behavior, not intent.)
- Everything else was **exonerated** via size-controlled standalone mimic + real-plugin A/Bs: transport/Bun-WS, TLS, header order/casing, cadence/response-gap (gaps were *harmful*), account + plan tier (pro vs prolite), thread-init ping + Cloudflare cookies, prefix size, tool-array size, descriptions, names, params, `anyOf`, `min`/`max`/`format`, UUID key format (v4 vs v7).

Full background lives in Alfonso project-memory **ID 6304** (ARCHITECTURE).

---

## 3. Current config contract (`src/config.ts`)

Resolution order per setting: **env var (highest) → config file → default.**

Config file: `~/.config/opencode/openai-auth.json` (dir follows `OPENCODE_CONFIG_DIR` / `XDG_CONFIG_HOME`; full path override `OPENCODE_OPENAI_AUTH_FILE`).

| setting | config field | env var | default | effect |
|---|---|---|---|---|
| Cache fix | `webSearch` | `CORTEXKIT_OPENAI_AUTH_NO_WEB_SEARCH` (set = disable) | **true** | inject native `web_search` |
| WS transport | `webSockets` | `CORTEXKIT_OPENAI_AUTH_WEBSOCKETS` | **false** (HTTP) | use Responses WebSocket |
| Hand-rolled WS | `rawWebSocket` | `CORTEXKIT_OPENAI_AUTH_RAW_WS` | **false** | `Bun.connect` client (incremental streaming) |
| Image gen | `imageGeneration` | `CORTEXKIT_OPENAI_AUTH_IMAGE_GENERATION` | **false** | declare native `image_generation` |

Booleans accept `1/true/yes/on` and `0/false/no/off/empty`. `getSettings()` is memoized per process; `resetSettingsForTest()` clears it.

**Behavior note:** WebSockets are now **opt-in** (HTTP is the default transport). This was a deliberate flip from the old hardcoded always-on WS. `webSearch` default-on is the keeper fix; verified clean on the default HTTP path (0/47).

---

## 4. File map (`packages/opencode/src/`)

- `index.ts` (854) — plugin entry. OAuth flow, `prepareCodexRequest` (headers + body rewrite, Codex identity parity), `maybeInjectCacheStabilizerTool` (web_search), `maybeInjectImageGenerationTool`, `normalizeCodexTool`, model filtering/cost-zeroing, default export `OpenAIAuthPlugin`.
- `config.ts` (112) — settings resolution (section 3). **All flag reads are centralized here** — don't scatter `process.env` reads back into other files.
- `ws-pool.ts` (563) — `createWebSocketFetch`: session-keyed WS pool, continuation/`previous_response_id` chaining, stable per-turn `turn_id` (`applyTurnId`), Codex body key-ordering (`orderCodexBody`). Has the only unit test (`ws-pool.test.ts`).
- `ws.ts` (439) — `connectResponsesWebSocket`: native Bun WS vs `rawWebSocket` selection, header ordering (`orderCodexWsHeaders`), permessage-deflate (always on), streaming event parse.
- `raw-ws.ts` (293) — hand-rolled WebSocket over `Bun.connect` (RFC 6455 framing by hand). Why it exists: Bun's native WS fixes upgrade-header order and suppresses incremental streaming; this surfaces Codex-style streaming (~5%→85%). **Not needed for the cache fix** — purely a streaming-UX option.
- `response-stream-error.ts`, `util/{error,proxy-env,record}.ts` — small helpers.
- `WEBSOCKET.md` — WS transport flow notes.

---

## 5. Git state

```
6271c40 Add openai-auth.json config file; env overrides config   <- HEAD
1571d9c Clean up WS-investigation knobs; keep web_search fix + 3 flags
73f28ea Add CORTEXKIT_OPENAI_AUTH_RETEST8_SHAPE mode + request self-log  (debug, superseded by cleanup)
24669ad Baseline: current openai-auth state
```
Tree clean. `73f28ea` added a debug mode that `1571d9c` already removed — no action needed, just don't be confused by it in history.

---

## 6. Open threads (your likely work)

1. **`image_generation` end-to-end round-trip — UNVERIFIED.** The tool is declared on the wire (gated off by default). When invoked, OpenAI returns `image_generation_call` items + `partial_image` events, which the plugin forwards verbatim to OpenCode's parser. **Whether OpenCode's UI actually renders/saves the resulting base64 PNG is not confirmed.** Verify the full round-trip before recommending users enable it. Start at the wire-forward in `ws.ts` (the SSE `data:` forwarding) and `maybeInjectImageGenerationTool` in `index.ts`.
2. **Genuine vs intermittent server behavior.** Cliff rates are stochastic (8–20%). If you re-measure and see different numbers, that's expected variance, not a regression — only treat a *with-web_search* run showing >0% as a real signal worth chasing.
3. **Publish pipeline.** v0.1.0 unpublished. Confirm npm name/scope, `prepublishOnly`, and get explicit owner approval before any publish.

---

## 7. How to verify (don't trust reports — re-measure)

- **Build/test:** `bun run typecheck && bun run build && bun test` (in `packages/opencode/`). 3 tests, all green at handover.
- **Cliff measurement = ground truth:** parse OpenCode's stdout JSONL per `step_finish` → `tokens.cache.read`. A "true interior cliff" = a step where the previous step had cache.read > 0 and this step dropped to 0. **Do NOT use MITM-reconstructed counts** — full-replay reconstruction introduces artifacts (this burned us; old MITM "HTTP=0" did not reproduce under genuine measurement).
- **Benchmark harness** (separate worktree, kept as investigation tooling): `~/Work/OSS/opencode-aft-benchmarks-modernize`, branch `bench/modernize`, `benchmarks/codegraph-vs-aft-agent/`. Reusable mimics: `scripts/codex_mimic.ts` (standalone Codex-mimicking Bun WS client — the one that isolated web_search via a 2×2 tool bisect), `api_mimic.ts`, `codex_http_mimic.ts`, mitmproxy addons. Run state under `results/analysis/run-state/`.
- **Runs must be Dockerized**, never on the host (collides with the user's live OpenCode SQLite/runtime). The genuine-transport runs mount the plugin's `dist/index.js` via `AGENT_EXTRA_PLUGINS` and OAuth `auth.json`; transport is decided by the `webSockets` flag default (off → genuine HTTP).

---

## 8. Gotchas / constraints

- **Codex identity parity is intentional and exonerated** — keep it (UA, `version` header, coherent session/thread/window ids, turn-metadata schema, `client_metadata`). It does NOT affect cliffs but is correct Codex parity. Don't "simplify" it back to SDK defaults expecting a cache change; that was tested (retest47) and made no difference.
- **Response-gap pacing is HARMFUL** — do not re-add any "wait N ms before continuation" floor. Removed deliberately.
- **`store:true` is rejected** by the GPT-5.5 OAuth path (400). The backend path is `store:false` with `previous_response_id` continuation chaining; `previous_response_id` only resolves on the connection that produced it, so a dropped/reconnected socket must discard continuation (see `invalidate` in `ws-pool.ts`).
- **Bun native WS ignores header insertion order** on the wire — only `raw-ws.ts` honors it. Don't expect header-ordering changes to take effect on the native path.
- Keep all flag reads in `config.ts`. The cleanup centralized them; scattering `process.env` back in is a regression.
