# merge-prs-7-6-2 - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A private branch on your machine that combines the big parity feature plus (where they don't break anything) two routine dependency updates, with the real build and test suite run after each step. Your OpenCode will then run this local build instead of the published version — and you'll get actual proof it's the local one running, not just an assurance. The branch gets pushed to your own fork only.

**Why this approach:** The parity feature is the prize, so it goes in first and must pass on its own; the two dependency bumps are nice-to-haves that get dropped the moment they cause trouble (especially the major AI-library jump, which is the one most likely to break things). Everything lands on a separate local branch so it's auditable and easy to throw away if needed.

**What it will NOT do:** It will not touch the upstream CortexKit repository (no push, no pull request there). It will not publish anything. It will not force the risky AI-library upgrade through if it breaks the build.

**Effort:** Medium
**Risk:** Medium - the major `ai` v5→v6 jump can break the plugin's request rewriting; mitigated by making that step droppable.
**Decisions to sanity-check:** branch name `local/fork`; merge order #7→#6→#2 with #2 droppable; local-only wiring with a config backup and a load-proof marker; push to your fork (rustybret) only.

Your next move: approve to start work, or ask for a high-accuracy review of this plan first. Full execution detail follows below.

---

> TL;DR (machine): Medium effort / Medium risk. Branch local/fork off main; merge PR#7 (must-pass) then #6 then #2 (droppable), validating bun typecheck+test+build after each; build local opencode dist, back up + repoint opencode.json plugin to local file://, prove load via injected marker, revert marker, clean rebuild, push local/fork to origin only.

## Scope
### Must have
- A local-only git branch `local/fork` cut from `main`, carrying the merges. (NOT main.)
- PR#7 (`feat/parity`) merged into `local/fork` and passing `bun install` + `bun run typecheck` + `bun run test` + `bun run build`. **This is the priority / must-pass deliverable.**
- PR#6 (`@opencode-ai/plugin` 1.17.1→1.17.7) merged and validated, OR explicitly dropped with a recorded reason. (Optional housekeeping.)
- PR#2 (`ai` 5→6 major) merged and validated, OR explicitly dropped with a recorded reason. (Optional housekeeping; gated — drop on non-trivial breakage.)
- A true pre-merge baseline (typecheck/test/build on `main`) captured so any failure is correctly attributed (PR#7's CI is currently UNSTABLE).
- The local `packages/opencode/dist` build wired into `~/.config/opencode/opencode.json`, replacing `@cortexkit/opencode-openai-auth@latest` with the local `file://` path, with a config backup taken first.
- Operational PROOF the local plugin actually loads (unique load-marker captured from a real OpenCode process), not a code-review claim.
- `local/fork` pushed to `origin` (rustybret/openai-auth).

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO push or PR to `upstream`/`cortexkit/openai-auth` (or any cortexkit remote) — not without separate explicit approval.
- NO merge to `main`; NO npm publish; NO release tag.
- NO open-ended `ai` v6 migration — if PR#2 breaks the build/types and the fix would touch PR#7's new code, DROP PR#2 and keep `ai` v5.
- NO permanent edits to plugin product behavior — the load-marker is a temporary, uncommitted working-tree edit reverted before the final clean build and before any push.
- NO unattended destructive ops on the user's config without a backup that restores via a one-line `cp`.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **tests-after** (no product code authored here; gate on the repo's existing suite). Framework: `bun test` (opencode pkg, ~330 tests per PR#7). Typecheck: `tsc` both pkgs. Build: `bun build` + `tsc --emitDeclarationOnly`.
- Each merge step is validated by the SAME quartet: `bun install` → `bun run typecheck` → `bun run test` → `bun run build`, captured to evidence.
- Load proof: inject a unique marker (e.g. `CORTEXKIT_LOCAL_FORK_LOADMARK_<rand>`) as an uncommitted edit in `packages/opencode/src/index.ts`, build, start OpenCode headlessly, and capture the marker from process output or the OpenCode log; then revert the marker and rebuild clean.
- Evidence: `.omo/evidence/task-<N>-merge-prs-7-6-2.<ext>`

## Execution strategy
### Parallel execution waves
> Sequencing here is mostly serial by necessity: each merge mutates the same tree and lockfile, and validation must attribute failures to one PR at a time.
- **Wave 1 (parallel-safe):** Todo 1 (baseline on main), Todo 2 (create branch) — Todo 2 depends only on a clean tree, Todo 1 is read-only measurement; run 1 then 2 (1 must measure `main` before the branch diverges).
- **Wave 2:** Todo 3 — merge PR#7 (priority gate).
- **Wave 3:** Todo 4 — merge PR#6; then Todo 5 — merge PR#2 (serial: shared lockfile).
- **Wave 4:** Todo 6 — build local dist with load-marker; Todo 7 — backup + wire opencode.json + prove load.
- **Wave 5:** Todo 8 — revert marker, clean rebuild, push `local/fork` to origin.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 baseline on main | clean tree | 2,3 | — (do before branching) |
| 2 create local/fork | 1 | 3 | — |
| 3 merge PR#7 (priority) | 2 | 4,6 | — |
| 4 merge PR#6 | 3 | 5 | — |
| 5 merge PR#2 (gated) | 4 | 6 | — |
| 6 build local dist + marker | 3 (5 if kept) | 7 | — |
| 7 wire opencode.json + prove load | 6 | 8 | — |
| 8 revert marker, clean rebuild, push | 7 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Capture true pre-merge baseline on `main`
  What to do: On `main` (clean tree, commit 4f7beb7), run `bun install` then `bun run typecheck`, `bun run test`, `bun run build`. Save full output to evidence. This is the attribution baseline — PR#7's CI is currently UNSTABLE, so we must know whether `main` itself is green before blaming a merge.
  Must NOT do: Do not modify any tracked file. Do not branch yet.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2,3
  References: repo root `package.json` scripts (build/test/typecheck §12§); cwd /Volumes/Topper2TB/Git/openai-auth; remotes origin=rustybret, upstream=cortexkit; `bun` toolchain (engines.bun 1.3.14).
  Acceptance criteria (agent-executable): commands exit 0 (or, if `main` is already red, the failures are recorded verbatim and labeled PRE-EXISTING). Evidence file contains the four command outputs with exit codes.
  QA scenarios: happy — `bun run typecheck && bun run test && bun run build` all exit 0; capture `echo "baseline exit: $?"`. failure — if any fail, record which command + first error block as PRE-EXISTING baseline state. Evidence .omo/evidence/task-1-merge-prs-7-6-2.txt
  Commit: N

- [x] 2. Create local-only branch `local/fork` off `main`
  What to do: `git fetch origin && git fetch upstream`, then `git switch -c local/fork main`. Confirm HEAD == main's 4f7beb7 and tree clean.
  Must NOT do: Do not branch off any PR ref. Do not touch `main` after this. Do not push yet.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3
  References: `git branch --show-current`; base commit 4f7beb7 "release: v0.1.2" (§6§).
  Acceptance criteria: `git branch --show-current` == `local/fork`; `git rev-parse local/fork` == `git rev-parse main`; `git status --porcelain` empty.
  QA scenarios: happy — branch exists at main's SHA, tree clean. failure — if a same-named branch exists, abort and report rather than force. Evidence .omo/evidence/task-2-merge-prs-7-6-2.txt
  Commit: N (branch creation only)

- [x] 3. Merge PR#7 `feat/parity` into `local/fork` (PRIORITY — must pass)
  What to do: Fetch the PR head as a local ref and merge into `local/fork` with a merge commit (preserves the upstream/own boundary the user wants auditable). Use `gh pr checkout 7 --branch pr-7-parity` (gh default repo = cortexkit, resolves the iceteaSA fork head), then `git switch local/fork && git merge --no-ff pr-7-parity -m "merge: PR#7 feat/parity (multi-account, quota, cachekeep, modals, CLI)"`. Resolve any conflicts (PR#7 touches NO manifests, so conflicts are unlikely on a fresh main). Then run the validation quartet: `bun install` → `bun run typecheck` → `bun run test` → `bun run build`.
  Must NOT do: Do not `gh pr merge` (no push access to cortexkit). Do not squash (lose boundary). Do not proceed to Todo 4 unless this passes — this is the must-have.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4,6
  References: PR#7 head iceteaSA/openai-auth:feat/parity, 62 files +21518/-673, MERGEABLE, CI UNSTABLE, no dep changes (§7§ §11§ §21§); validation scripts (§12§). Compare any post-merge failure against task-1 baseline.
  Acceptance criteria: merge commit present (`git log --merges -1`); `bun run typecheck` exit 0; `bun run test` exit 0 (PR#7 claims ~330 passing); `bun run build` exit 0 producing `packages/opencode/dist/index.js` and `packages/pi/dist`.
  QA scenarios: happy — quartet all exit 0; record test count. failure — if typecheck/test fails, diff against task-1 baseline to confirm PR#7-introduced; if it's a hard failure (not a known-flaky CI item), STOP and report (priority gate). Evidence .omo/evidence/task-3-merge-prs-7-6-2.txt
  Commit: Y | merge commit (--no-ff) as above

- [x] 4. Merge PR#6 (`@opencode-ai/plugin` 1.17.1→1.17.7) — optional
  What to do: `gh pr checkout 6 --branch pr-6-plugin`, `git switch local/fork && git merge --no-ff pr-6-plugin -m "merge: PR#6 bump @opencode-ai/plugin to 1.17.7"`. PR#6 edits `package.json` + `bun.lock`; on conflict keep our (post-#7) state then re-apply: set `@opencode-ai/plugin` to `1.17.7` in root `package.json`, `git checkout --ours bun.lock`, run `bun install` to regenerate the lockfile cleanly. Re-run the validation quartet.
  Must NOT do: Do not hand-merge binary/locked state by hand beyond the version bump. Do not block the deliverable on this — if it breaks non-trivially, drop it (`git merge --abort` / reset to post-#7) and record the reason.
  Parallelization: Wave 3 | Blocked by: 3 | Blocks: 5
  References: PR#6 diff bumps plugin 1.17.1→1.17.7 in package.json + bun.lock, CLEAN (§6 §20§); peerDependency `@opencode-ai/plugin: *` in opencode pkg (§12§) so a minor bump is low-risk.
  Acceptance criteria: root `package.json` shows `@opencode-ai/plugin` `1.17.7`; quartet exit 0; OR PR#6 dropped with reason recorded and tree reset to passing post-#7 state.
  QA scenarios: happy — quartet exit 0 after bump. failure — conflict or test break → abort merge, restore post-#7 HEAD, record "PR#6 dropped: <reason>". Evidence .omo/evidence/task-4-merge-prs-7-6-2.txt
  Commit: Y | merge commit, or N if dropped

- [x] 5. Merge PR#2 (`ai` 5.0.202→6.0.208, MAJOR) — optional, GATED
  What to do: `gh pr checkout 2 --branch pr-2-ai`, `git switch local/fork && git merge --no-ff pr-2-ai -m "merge: PR#2 bump ai to 6.0.208"`. Resolve manifest conflict: set `ai` to `^6.0.208` in `packages/opencode/package.json`, `git checkout --ours bun.lock`, `bun install`. Re-run the validation quartet.
  Must NOT do: Do NOT start an open-ended v6 migration. If `bun run typecheck` or `bun run test` fails because PR#7's new code (or existing code) depends on `ai` v5 API surface, IMMEDIATELY drop PR#2: `git merge --abort` (or reset to post-#6 HEAD), restore `ai` ^5, `bun install`, re-validate, and record "PR#2 dropped: ai v6 breaks <symbol/file>, keeping v5 per scope guardrail".
  Parallelization: Wave 3 | Blocked by: 4 | Blocks: 6
  References: PR#2 bumps ai ^5.0.88→^6.0.208 + @ai-sdk/* major transitive jumps (§20§); opencode pkg dependency `ai: ^5.0.88` (§12§); README notes plugin rewrites OpenAI→Codex request shape (relies on `ai` request/stream types — primary v6 break surface).
  Acceptance criteria: EITHER quartet exit 0 with `ai` `^6.x` in `packages/opencode/package.json`; OR PR#2 dropped, `ai` back to `^5.x`, quartet exit 0, drop reason recorded.
  QA scenarios: happy — quartet exit 0 on v6. failure — typecheck/test break attributable to v6 → drop, revert to v5, re-validate green. Evidence .omo/evidence/task-5-merge-prs-7-6-2.txt
  Commit: Y | merge commit, or N if dropped

- [x] 6. Build local dist with a temporary load-marker
  What to do: On `local/fork` (post-merges), add an uncommitted marker in `packages/opencode/src/index.ts`: at module top-level emit `console.error("CORTEXKIT_LOCAL_FORK_LOADMARK_<rand>")` (pick a fresh random token; `console.error` so it survives stdout suppression). Run `bun run build`. Confirm `packages/opencode/dist/index.js` exists and contains the marker token.
  Must NOT do: Do not commit the marker. Do not place it behind a conditional that won't run at import time.
  Parallelization: Wave 4 | Blocked by: 3 (and 5 if PR#2 kept) | Blocks: 7
  References: opencode build script `rm -rf dist && bun build src/index.ts --outdir dist ... --minify && tsc ...` (§12§); entry `src/index.ts`; dist main `./dist/index.js` (§12§).
  Acceptance criteria: `test -f packages/opencode/dist/index.js`; `grep -c CORTEXKIT_LOCAL_FORK_LOADMARK packages/opencode/dist/index.js` ≥ 1.
  QA scenarios: happy — marker present in built bundle. failure — minifier strips it → switch to a side-effecting form the minifier keeps (e.g. `globalThis.__CORTEXKIT_LOADMARK="<rand>"` plus a console.error) and rebuild. Evidence .omo/evidence/task-6-merge-prs-7-6-2.txt
  Commit: N (working-tree marker only)

- [x] 7. Backup + wire opencode.json to local dist, then PROVE load
  What to do: (a) `cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak-localfork-$(date +%s)`. (b) In `~/.config/opencode/opencode.json` `plugin` array, replace `"@cortexkit/opencode-openai-auth@latest"` with `"file:///Volumes/Topper2TB/Git/openai-auth/packages/opencode/dist/index.js"`. (c) `rm -rf ~/.cache/opencode`. (d) Prove load: start OpenCode headlessly (e.g. `opencode run --model <cfg> "say ok"` or `opencode --help`/version path that triggers plugin load), capturing stderr; OR after a short run, grep the OpenCode log dir. Confirm the marker token appears, proving the LOCAL dist executed.
  Must NOT do: Do not edit other config keys. Do not delete the backup. Do not claim success from code review — require the captured marker as proof (user demands real operational evidence).
  Parallelization: Wave 4 | Blocked by: 6 | Blocks: 8
  References: opencode.json plugin array currently lists `@cortexkit/opencode-openai-auth@latest` (§8§); README install + "clear ~/.cache/opencode" tip; OpenCode loads external plugins after internal so file:// entry supersedes published (README).
  Acceptance criteria: `test -f ~/.config/opencode/opencode.json.bak-localfork-*`; `grep -q 'packages/opencode/dist/index.js' ~/.config/opencode/opencode.json`; `! test -d ~/.cache/opencode` at proof time; captured output/log contains `CORTEXKIT_LOCAL_FORK_LOADMARK_<rand>`.
  QA scenarios: happy — marker captured from a real OpenCode process → local plugin proven loaded. failure — marker absent → diagnose (wrong path / cache / json syntax), fix, re-run; if OpenCode won't start, restore from `.bak` and report. Evidence .omo/evidence/task-7-merge-prs-7-6-2.txt (include the captured marker line)
  Commit: N (user config, not repo)

- [x] 8. Revert marker, clean rebuild, push `local/fork` to origin
  What to do: `git checkout -- packages/opencode/src/index.ts` (drop the marker), confirm `git status` clean, `bun run build` (clean dist without marker), re-run `bun run typecheck && bun run test` to confirm still green, then `git push -u origin local/fork`. Confirm the branch exists on rustybret/openai-auth.
  Must NOT do: Do NOT push to upstream/cortexkit. Do NOT open any PR. Do not leave the marker in the committed dist or src.
  Parallelization: Wave 5 | Blocked by: 7 | Blocks: —
  References: origin=rustybret/openai-auth (§6§); marker file packages/opencode/src/index.ts; guardrail: no cortexkit push/PR (§29§).
  Acceptance criteria: `grep -c CORTEXKIT_LOCAL_FORK_LOADMARK packages/opencode/src/index.ts` == 0; `git status --porcelain` empty; quartet still green; `git ls-remote --heads origin local/fork` returns the pushed SHA; no ref pushed to upstream.
  QA scenarios: happy — marker gone, clean build green, branch on origin. failure — push rejected → report auth/remote issue, do NOT retarget to upstream. Evidence .omo/evidence/task-8-merge-prs-7-6-2.txt
  Commit: Y | the merges are already committed; push only (no new commit unless re-wiring needs one)

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy
- One `--no-ff` merge commit per PR that lands (PR#7 always; #6/#2 only if kept), each message prefixed `merge: PR#<n> ...` — keeps an explicit, auditable upstream/own boundary in history.
- Lockfile regeneration (`bun install`) folds into the same merge commit as the PR that triggered it (resolve conflict → install → `git add` → conclude merge).
- Dropped PRs leave NO commit; the drop reason is recorded only in evidence + draft, not in repo history.
- The load-marker is never committed (working-tree only, reverted in Todo 8).
- Final action is `git push -u origin local/fork` — origin (rustybret) ONLY. No upstream push, no PR.

## Success criteria
- `local/fork` exists off `main`, contains a `--no-ff` merge of PR#7, and passes `bun run typecheck` + `bun run test` + `bun run build`. (Priority deliverable.)
- PR#6 and PR#2 are each either merged-and-green or explicitly dropped with a recorded reason; if PR#2's `ai` v6 broke the build non-trivially it is dropped and `ai` v5 retained.
- `~/.config/opencode/opencode.json` has a timestamped `.bak`, its `plugin` entry points at `file:///Volumes/Topper2TB/Git/openai-auth/packages/opencode/dist/index.js`, and a captured load-marker from a real OpenCode process proves the local build executes (not a code-review claim).
- Working tree clean (marker reverted), clean dist rebuilt, and `local/fork` pushed to `origin` (rustybret). No cortexkit/upstream push or PR exists.
- All evidence files present under `.omo/evidence/`.
