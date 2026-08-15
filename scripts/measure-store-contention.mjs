#!/usr/bin/env bun
/**
 * Measure account-store lock contention.
 *
 * One OpenCode host process serves many worker sessions, all sharing one account
 * store and coordinating writes through one file lock. This measures what that
 * actually costs, so proposals to reduce it can be judged against numbers rather
 * than intuition.
 *
 * Reports, per concurrency level: acquire latency percentiles, the share of the
 * acquire window consumed, and how many writes fail outright.
 *
 *   bun scripts/measure-store-contention.mjs
 *   bun scripts/measure-store-contention.mjs --sessions 1,4,12,24 --turns 20
 *   bun scripts/measure-store-contention.mjs --path mutate
 *   bun scripts/measure-store-contention.mjs --sessions 12 --load 40
 *   bun scripts/measure-store-contention.mjs --path mutate --storm --sessions 12 --load 12
 *
 * --load runs N synchronous CPU hogs alongside the writes. The host process is
 * single-threaded, so sessions streaming and parsing responses compete with the
 * lock's own retry loop for the event loop. The acquire deadline is wall clock,
 * so under a saturated loop it can expire having made very few actual attempts —
 * a different failure from genuine lock contention, and one an in-process queue
 * would not fix. The attempts count in the timeout message distinguishes them.
 *
 * --storm models correlated arrival: every session writes at the same instant,
 * as token refreshes do (tokens issued in one window expire in one window).
 *
 * It is NOT the worst case, despite sounding like it. Each round waits for all
 * sessions before starting the next, so the queue fully drains between rounds.
 * Sustained independent traffic overlaps continuously and is measurably harsher
 * (12 sessions, load 12, mutate path: 6-9 failures under --storm versus 17-23
 * without it). Use --storm to compare PATHS under identical arrival, and the
 * default to price sustained pressure.
 *
 * Two write paths, because they cost very different amounts:
 *   state  - saveAccountState, the per-request bookkeeping stamp. State lock only.
 *   mutate - mutateAccounts, which holds the CONFIG lock for the whole time it
 *            waits for the STATE lock. Measures whether that nested hold is what
 *            turns ordinary pressure into a timeout.
 *
 * Writes nothing outside a temp directory and touches no real credentials.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function parseArgs(argv) {
  const args = {
    sessions: [1, 4, 12, 24],
    turns: 20,
    path: 'state',
    load: 0,
    storm: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storm') {
      args.storm = true
    } else if (argv[i] === '--load' && argv[i + 1]) {
      args.load = Number.parseInt(argv[++i], 10)
    } else if (argv[i] === '--path' && argv[i + 1]) {
      args.path = argv[++i]
    } else if (argv[i] === '--sessions' && argv[i + 1]) {
      args.sessions = argv[++i]
        .split(',')
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    } else if (argv[i] === '--turns' && argv[i + 1]) {
      args.turns = Number.parseInt(argv[++i], 10)
    }
  }
  return args
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  )
  return sorted[index]
}

function seedStore(dir, accountCount) {
  const cfgPath = join(dir, 'openai-auth.json')
  const statePath = join(dir, 'openai-auth-state.json')
  const accounts = []
  const state = {}
  for (let i = 0; i < accountCount; i++) {
    const id = `fb-${i}`
    accounts.push({ id, type: 'oauth', enabled: true })
    state[id] = {
      access: `access-${i}`,
      refresh: `refresh-${i}`,
      expires: Date.now() + 3_600_000,
      lastUsed: Date.now(),
    }
  }
  writeFileSync(cfgPath, JSON.stringify({ version: 1, accounts }))
  writeFileSync(statePath, JSON.stringify({ version: 1, accounts: state }))
  return { cfgPath, statePath }
}

/**
 * One turn's worth of store traffic for a single session: the `lastUsed` stamp
 * that every fallback-served request performs. Latency is measured around the
 * whole call, since an acquire that never returns a lock is exactly the cost
 * being measured.
 */
async function turn(accounts, storage, cfgPath, accountId, path) {
  const started = performance.now()
  try {
    if (path === 'mutate') {
      await accounts.mutateAccounts((current) => current, cfgPath)
    } else {
      await accounts.saveAccountState(storage, cfgPath, {
        accounts: [accountId],
      })
    }
    return { ms: performance.now() - started, ok: true }
  } catch (error) {
    return { ms: performance.now() - started, ok: false, error }
  }
}

async function measure(accounts, cfgPath, sessions, turns, path, storm) {
  const storage = await accounts.loadAccounts(cfgPath)
  if (!storage) throw new Error('seeded store failed to load')

  const samples = []
  let failures = 0

  const record = (result) => {
    samples.push(result.ms)
    if (!result.ok) failures++
  }

  // All sessions start together. A simultaneous burst is the shape that causes
  // acquire timeouts; a steady trickle of the same total volume does not, since
  // each writer finds the lock free.
  if (storm) {
    // Every session issues its writes at the same instant, repeated per round.
    // This is the refresh-storm shape: not more total writes, but all of them
    // contending for the same window.
    for (let round = 0; round < turns; round++) {
      await Promise.all(
        Array.from({ length: sessions }, async (_unused, session) => {
          const accountId = `fb-${session % storage.accounts.length}`
          record(await turn(accounts, storage, cfgPath, accountId, path))
        }),
      )
    }
  } else {
    await Promise.all(
      Array.from({ length: sessions }, async (_unused, session) => {
        const accountId = `fb-${session % storage.accounts.length}`
        for (let i = 0; i < turns; i++) {
          record(await turn(accounts, storage, cfgPath, accountId, path))
        }
      }),
    )
  }

  samples.sort((a, b) => a - b)
  return {
    sessions,
    writes: samples.length,
    failures,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples[samples.length - 1] ?? 0,
  }
}

/**
 * Occupy the event loop the way a busy host process does: short synchronous
 * bursts scheduled back to back, so the loop is never idle for long but is not
 * permanently blocked either.
 */
function startLoad(workers) {
  let running = true
  const spin = () => {
    if (!running) return
    const until = performance.now() + 12
    // Synchronous burst: this is the part a queued lock waiter cannot preempt.
    while (performance.now() < until) {}
    setTimeout(spin, 0)
  }
  for (let i = 0; i < workers; i++) spin()
  return () => {
    running = false
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = mkdtempSync(join(tmpdir(), 'oai-contention-'))
  const { cfgPath, statePath } = seedStore(dir, 4)
  process.env.OPENCODE_OPENAI_AUTH_FILE = cfgPath
  process.env.OPENCODE_OPENAI_AUTH_STATE_FILE = statePath

  const accounts = await import(
    new URL('../packages/opencode/src/core/accounts.ts', import.meta.url).href
  )

  console.log(
    `write path: ${args.path}   turns per session: ${args.turns}   ` +
      `event-loop load: ${args.load}   ` +
      `arrival: ${args.storm ? 'correlated (storm)' : 'independent'}`,
  )
  console.log('')
  console.log('sessions | writes | failed |    p50 |    p95 |    p99 |    max')
  console.log('---------+--------+--------+--------+--------+--------+--------')

  const stopLoad = args.load > 0 ? startLoad(args.load) : undefined
  try {
    for (const sessions of args.sessions) {
      const row = await measure(
        accounts,
        cfgPath,
        sessions,
        args.turns,
        args.path,
        args.storm,
      )
      const fmt = (value) => `${value.toFixed(1)}ms`.padStart(7)
      console.log(
        `${String(row.sessions).padStart(8)} |` +
          `${String(row.writes).padStart(7)} |` +
          `${String(row.failures).padStart(7)} |` +
          `${fmt(row.p50)} |${fmt(row.p95)} |${fmt(row.p99)} |${fmt(row.max)}`,
      )
    }
  } finally {
    stopLoad?.()
    rmSync(dir, { recursive: true, force: true })
  }
}

await main()
