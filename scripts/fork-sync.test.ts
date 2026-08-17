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
    // `bun install --frozen-lockfile=false` is rejected by bun ("does not take
    // a value"). `--no-frozen-lockfile` is the working spelling, and it must be
    // explicit because bun defaults to frozen whenever CI is set.
    expect(scriptCode).toContain('bun install --no-frozen-lockfile')
    expect(scriptCode).not.toContain('--frozen-lockfile=false')
  })

  it('stays merge-only: never rebases or force-pushes', () => {
    expect(scriptCode).not.toMatch(/git\s+(-C\s+"\$ROOT"\s+)?rebase\b/)
    expect(scriptCode).not.toMatch(/push\s+.*(--force|-f)\b/)
  })
})
