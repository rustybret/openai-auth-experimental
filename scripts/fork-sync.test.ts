import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')
const scriptPath = resolve(repoRoot, 'scripts/fork-sync.sh')
const manifestPath = resolve(repoRoot, 'scripts/fork-sync-exclusions')
const script = readFileSync(scriptPath, 'utf-8')
const manifest = readFileSync(manifestPath, 'utf-8')

/** Script text with comment-only lines removed, for assertions about behavior
 *  rather than documentation. The comments deliberately quote the wrong bun
 *  flag spelling to explain why it is wrong. */
const scriptCode = script
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

describe('fork-sync exclusion manifest', () => {
  it('parses to the three supported action verbs only', () => {
    const verbs = manifest
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(':')[0])

    expect(verbs.length).toBeGreaterThan(0)
    for (const verb of verbs) {
      expect(['keep-deleted', 'take-theirs', 'regenerate']).toContain(verb)
    }
  })

  it('documents the verb generically so the spec text matches other forks', () => {
    // The three-verb spec text is single-source across polyglot forks, so the
    // header must describe ecosystem rebuild + basename dispatch rather than
    // hardcoding this repo's `bun install`.
    // Leading comment block only - stop at the first actual rule line.
    const lines = manifest.split('\n')
    const firstRule = lines.findIndex(
      (line) => line.trim().length > 0 && !line.trimStart().startsWith('#'),
    )
    const header = lines
      .slice(0, firstRule === -1 ? lines.length : firstRule)
      .join('\n')
    expect(header).toMatch(/basename/i)
    expect(header).toMatch(/ecosystem/i)
    expect(header).not.toMatch(/bun install/i)
  })

  it('routes bun.lock through regenerate, never take-theirs', () => {
    const rules = manifest
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter((line) => line.length > 0)

    expect(rules).toContain('regenerate: bun.lock')
    // Adopting upstream's lockfile verbatim drops this fork's devDependency
    // deltas, so bun.lock must never be classified as a plain take-theirs.
    expect(rules.some((r) => /^take-theirs:\s*bun\.lock$/.test(r))).toBe(false)
  })
})

describe('fork-sync.sh', () => {
  it('is syntactically valid bash', () => {
    const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf-8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('handles every verb the manifest is allowed to use', () => {
    for (const verb of ['keep-deleted', 'take-theirs', 'regenerate']) {
      expect(script).toContain(`${verb}:*)`)
    }
  })

  it('normalizes manifest values before using them as git pathspecs', () => {
    // Regression guard: `${line#regenerate:}` leaves a leading space, which
    // turns the pathspec into " bun.lock" — a path that matches nothing, so
    // the regenerated lockfile silently never gets staged.
    for (const verb of ['keep-deleted', 'take-theirs', 'regenerate']) {
      const pattern = new RegExp(
        `${verb}:\\*\\)\\s*\\w+\\+=\\("\\$\\(trim "\\$\\{line#${verb}:\\}"\\)"\\)`,
      )
      expect(script).toMatch(pattern)
    }
  })

  it('regenerates the lockfile with a bun flag spelling that actually parses', () => {
    // `bun install --frozen-lockfile=false` exits 1 ("the argument does not
    // take a value") and leaves the lockfile unregenerated, so the cross-fork
    // spec's literal command must never be copied in verbatim.
    expect(scriptCode).toContain('bun install --no-frozen-lockfile')
    expect(scriptCode).not.toContain('--frozen-lockfile=false')
  })

  it('dispatches regeneration on basename, per the cross-fork standard', () => {
    expect(scriptCode).toContain('ecosystem_for')
    expect(scriptCode).toMatch(/bun\.lock \| bun\.lockb\)/)
    expect(scriptCode).toMatch(/Cargo\.lock\)/)
    expect(scriptCode).toContain('basename')
  })

  it('hard-errors on an unknown regenerate target instead of guessing', () => {
    expect(scriptCode).toMatch(/no rebuild command is known for regenerate/)
    // The guess-refusal must abort, not warn and continue.
    const ecoBlock = scriptCode.slice(
      scriptCode.indexOf('regenerate_targets()'),
      scriptCode.indexOf('# --- 1. fetch'),
    )
    expect(ecoBlock).toContain('exit 1')
  })

  it('stays merge-only: never rebases or force-pushes', () => {
    expect(scriptCode).not.toMatch(/git\s+(-C\s+"\$ROOT"\s+)?rebase\b/)
    expect(scriptCode).not.toMatch(/push\s+.*(--force|-f)\b/)
  })

  it('fast-forwards to origin when origin is ahead before merging upstream', () => {
    expect(scriptCode).toContain('merge --ff-only "origin/$LOCAL_BRANCH"')
    expect(scriptCode).toContain(
      'merge-base --is-ancestor HEAD "origin/$LOCAL_BRANCH"',
    )

    const fetchIdx = script.indexOf('# --- 1. fetch')
    const ffIdx = script.indexOf('# --- 1b. fast-forward to origin if ahead')
    const mergeIdx = script.indexOf('# --- 2. merge')

    expect(fetchIdx).toBeGreaterThan(-1)
    expect(ffIdx).toBeGreaterThan(fetchIdx)
    expect(mergeIdx).toBeGreaterThan(ffIdx)
  })
})
