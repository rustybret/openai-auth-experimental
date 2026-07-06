---
slug: merge-prs-7-6-2
status: approved → plan-generated
intent: clear
pending-action: write .omo/plans/merge-prs-7-6-2.md (DONE)
approach: Merge PR#7 (priority) then #6 then #2 onto a local-only branch `local/fork` off main, validating build+typecheck+test after each; drop #2 (ai v6) if it breaks non-trivially. Build local dist, repoint opencode.json plugin entry to the local file:// path with backup + injected load-proof, clear cache, prove load headlessly. Push local/fork to origin (rustybret) only.
---

# Draft: merge-prs-7-6-2

## Components (topology ledger)

- C1 | local/fork branch created off main + true baseline captured | active | .omo/evidence/task-1
- C2 | PR#7 merged + validated (PRIORITY, must-pass) | active | .omo/evidence/task-3
- C3 | PR#6 (@opencode-ai/plugin bump) merged + validated (optional) | active | .omo/evidence/task-4
- C4 | PR#2 (ai v6 major) merged + validated OR dropped (optional, gated) | active | .omo/evidence/task-5
- C5 | local plugin built + wired into opencode.json + load proven | active | .omo/evidence/task-7
- C6 | local/fork pushed to origin rustybret | active | .omo/evidence/task-8

## Decisions (with rationale)

1. Branch `local/fork` off main. Local build source. Pushable to origin=rustybret. (user §29§)
2. Order #7 → #6 → #2. #7 priority/must-pass; #6/#2 optional housekeeping, droppable. #2 (ai v6) gated: drop if non-trivial breakage. (user §29§)
3. Local-only wiring: repoint opencode.json plugin to file://.../packages/opencode/dist/index.js. No upstream/cortexkit push/PR. Push local/fork to rustybret allowed. (user §29§)

## Metis findings folded in (§34§)

- Merge a fork PR via local ref fetch + git merge, NOT gh pr merge (no push access to cortexkit). Use `gh pr checkout`.
- PR#7 CI is UNSTABLE → capture TRUE baseline on main BEFORE merging so we can attribute any failure.
- Lockfile: resolve conflict by keeping HEAD lock, edit package.json, regenerate via `bun install`. (Repo uses text bun.lock.)
- Backup opencode.json before editing (restore path if OpenCode crashes on bad config).
- Operational proof: inject a unique load-marker side-effect into src before build; grep for it in a headless run. User demands real proof, not code-review claims.
- Drop PR#2 immediately if typecheck fails after the bump and the fix touches PR#7's new code.

## Scope IN

Merge #7/#6/#2 to local/fork; build+typecheck+test gates; local opencode.json wiring with backup + proof; push local/fork to origin.

## Scope OUT (Must NOT have)

No upstream/cortexkit push or PR. No npm publish/release. No merge to main. No open-ended ai-v6 migration (drop #2 instead). No edits to plugin product behavior beyond a removable load-marker.

## Approval gate

status: approved (user §29§). Plan generated.
