import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Where the account store lives.
 *
 * This is the ONLY definition. It used to be duplicated verbatim in both
 * `accounts.ts` and `refresh-file-lock.ts`, because `accounts.ts` imports the
 * lock and the reverse import would have been a cycle. Two copies of a path
 * resolver is a bad trade for that: the lock and the write must agree on the
 * exact file, and if the copies ever drifted, a writer would take a lock on one
 * path while writing another — mutual exclusion silently lost on a file holding
 * credentials. Nothing would fail a test, since each copy works on its own.
 *
 * This module imports nothing from either side, so both can depend on it.
 */

export const ACCOUNT_FILE_NAME = 'openai-auth.json'
export const ACCOUNT_STATE_FILE_NAME = 'openai-auth-state.json'

function getConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR?.trim()) {
    return process.env.OPENCODE_CONFIG_DIR.trim()
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'opencode',
  )
}

export function getAccountStoragePath() {
  return (
    process.env.OPENCODE_OPENAI_AUTH_FILE?.trim() ||
    join(getConfigDir(), ACCOUNT_FILE_NAME)
  )
}

/** Derive the state-file path from the config path without reading env vars. */
export function deriveStatePath(configPath: string): string {
  return configPath.endsWith(ACCOUNT_FILE_NAME)
    ? join(dirname(configPath), ACCOUNT_STATE_FILE_NAME)
    : `${configPath}.state.json`
}

export function getAccountStatePath(configPath = getAccountStoragePath()) {
  const explicit = process.env.OPENCODE_OPENAI_AUTH_STATE_FILE?.trim()
  if (explicit) return explicit
  return deriveStatePath(configPath)
}
