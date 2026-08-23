#!/usr/bin/env node
/**
 * Find tests that only pass when their siblings run first.
 *
 * A test that needs a sibling to seed its state cannot gate the behaviour it
 * names: it stays green while covering nothing, and it turns red for unrelated
 * reasons when someone iterates on it with `-t`. Both failures are silent from
 * the suite summary, which is why this has to be checked rather than noticed.
 *
 *   node scripts/find-order-dependent-tests.mjs packages/opencode/src/tests/integration.test.ts
 *
 * Runs each test alone and reports the ones that fail, having passed as part of
 * the whole file.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: find-order-dependent-tests.mjs <test-file>')
  process.exit(2)
}

// bun writes its run summary to stderr, so both streams have to be read; a
// stdout-only check reports every test as failing.
function run(args) {
  const result = spawnSync('bun', args, { encoding: 'utf8' })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

const whole = run(['test', file])
const wholeMatch = whole.match(/(\d+)\s+pass[\s\S]*?(\d+)\s+fail/)
if (wholeMatch?.[2] !== '0') {
  console.error('file does not pass as a whole; fix that before scanning')
  process.exit(1)
}
console.log(`whole file: ${wholeMatch[1]} pass, 0 fail`)

const src = readFileSync(file, 'utf8')
const names = [
  ...src.matchAll(/^\s*(?:it|test)\(\s*'((?:[^'\\]|\\.)*)'/gm),
].map((m) => m[1].replace(/\\'/g, "'"))

const failed = []
for (const name of names) {
  const out = run(['test', file, '-t', name])
  const m = out.match(/(\d+)\s+pass[\s\S]*?(\d+)\s+fail/)
  // No match means the filter selected nothing — a name this script could not
  // round-trip, not a failure. Report those separately rather than as defects.
  if (!m) {
    failed.push(`${name}  [not selected by -t]`)
    continue
  }
  if (m[2] !== '0') failed.push(name)
}

console.log(`scanned ${names.length} tests individually`)
if (failed.length === 0) {
  console.log('all pass in isolation')
} else {
  console.log(`ORDER-DEPENDENT (${failed.length}):`)
  for (const name of failed) console.log(`  ${name}`)
  process.exitCode = 1
}
