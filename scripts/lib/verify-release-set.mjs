#!/usr/bin/env node
// =============================================================================
// verify-release-set.mjs — fail-closed audit of dist/<version>/<sequence>/
//
// Verifies release set completeness across:
//   - opencode-openai-auth (OpenCode plugin)
//   - pi-openai-auth       (Pi extension)
//
// Usage:
//   node scripts/lib/verify-release-set.mjs --root dist/<version>/<sequence> \
//     [--only <component>]
// =============================================================================

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PORTABLE_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'windows-x64',
]

const COMPONENTS = {
  'opencode-openai-auth': { kind: 'portable' },
  'pi-openai-auth': { kind: 'portable' },
}

const FORBIDDEN_ENTRIES = ['payload', 'node_modules']
const SWEEPABLE_ENTRIES = ['.DS_Store', 'Thumbs.db']

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      console.error(`error: unexpected positional argument: ${arg}`)
      process.exit(2)
    }
    const key = arg.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      console.error(`error: missing value for --${key}`)
      process.exit(2)
    }
    out[key] = value
    i += 1
  }
  return out
}

function countFiles(dir) {
  let count = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFiles(join(dir, entry.name))
      } else {
        count += 1
      }
    }
  } catch {
    // Ignore read errors in counts
  }
  return count
}

const args = parseArgs(process.argv.slice(2))
if (!args.root) {
  console.error('error: --root <dist/<version>/<sequence>> is required')
  process.exit(2)
}

const root = args.root
const only = args.only ?? null

if (only && !(only in COMPONENTS)) {
  console.error(`error: --only ${only} is not a known component`)
  process.exit(2)
}

if (!existsSync(root)) {
  console.error(`error: release root does not exist: ${root}`)
  process.exit(1)
}

const failures = []
const checked = []
const swept = []

for (const [component, policy] of Object.entries(COMPONENTS)) {
  if (only && only !== component) continue

  const dir = join(root, component)
  if (!existsSync(dir)) {
    failures.push(`${component}: component directory missing`)
    continue
  }

  checked.push(component)
  const entries = readdirSync(dir)

  // --- envelope -----------------------------------------------------------
  const releasesDir = join(dir, 'releases')
  const envelopes = existsSync(releasesDir)
    ? readdirSync(releasesDir).filter(
        (f) => f.endsWith('.json') && !f.includes('index-policy'),
      )
    : []
  if (envelopes.length === 0) {
    failures.push(`${component}: no release envelope under releases/`)
  }

  // --- pack report --------------------------------------------------------
  if (!entries.includes('pack-report.json')) {
    failures.push(`${component}: pack-report.json missing`)
  }

  // --- target coverage ----------------------------------------------------
  const archives = entries.filter(
    (f) => f.endsWith('.tar.gz') || f.endsWith('.tar.zst'),
  )
  const targets = new Set()
  for (const archive of archives) {
    const match = archive.match(
      /-((?:darwin|linux|windows)-[a-z0-9]+)\.(?:tar\.gz|tar\.zst)$/,
    )
    if (match) targets.add(match[1])
  }

  if (archives.length === 0) {
    failures.push(`${component}: no payload archives`)
  } else if (policy.kind === 'portable') {
    const missing = PORTABLE_TARGETS.filter((t) => !targets.has(t))
    if (missing.length > 0) {
      failures.push(
        `${component}: portable component missing target(s): ${missing.join(', ')}`,
      )
    }
  }

  // --- per-archive companion artifacts ------------------------------------
  for (const archive of archives) {
    const stem = archive.replace(/\.(?:tar\.gz|tar\.zst)$/, '')
    for (const [suffix, label] of [
      [`${stem}-content.zip`, 'content zip'],
      [`${stem}.pwr`, 'tree signature'],
    ]) {
      if (!entries.includes(suffix)) {
        failures.push(`${component}: ${label} missing for ${archive}`)
      }
    }
  }

  // --- staging litter (hard failure) --------------------------------------
  for (const forbidden of FORBIDDEN_ENTRIES) {
    if (entries.includes(forbidden)) {
      const path = join(dir, forbidden)
      const detail = statSync(path).isDirectory()
        ? `${countFiles(path)} file(s)`
        : 'file'
      failures.push(
        `${component}: forbidden entry '${forbidden}' in release dir (${detail})`,
      )
    }
  }

  // --- OS litter (swept, reported) ----------------------------------------
  for (const sweepable of SWEEPABLE_ENTRIES) {
    if (entries.includes(sweepable)) {
      rmSync(join(dir, sweepable), { force: true, recursive: true })
      swept.push(`${component}/${sweepable}`)
    }
  }
}

if (swept.length > 0) {
  console.log(`verify-release-set: swept OS litter: ${swept.join(', ')}`)
}

if (failures.length > 0) {
  console.error(
    `verify-release-set: FAILED (${failures.length} issue(s) in ${checked.join(', ')}):`,
  )
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log(
  `verify-release-set: PASS (verified components: ${checked.join(', ')})`,
)
