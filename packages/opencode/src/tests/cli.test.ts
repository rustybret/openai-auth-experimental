import { describe, expect, mock, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

describe('CLI browser opener', () => {
  test('uses cmd /c start on Windows because start is a cmd.exe builtin', async () => {
    const execFileSync = mock(() => {})
    const { openBrowserForLogin } = await import('../cli')

    openBrowserForLogin('https://example.test/auth', 'win32', execFileSync)

    expect(execFileSync).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', '', 'https://example.test/auth'],
      { stdio: 'ignore', timeout: 3000 },
    )
  })

  test('uses open on macOS and xdg-open elsewhere', async () => {
    const execFileSync = mock(() => {})
    const { openBrowserForLogin } = await import('../cli')

    openBrowserForLogin('https://example.test/mac', 'darwin', execFileSync)
    openBrowserForLogin('https://example.test/linux', 'linux', execFileSync)

    expect(execFileSync).toHaveBeenCalledWith(
      'open',
      ['https://example.test/mac'],
      { stdio: 'ignore', timeout: 3000 },
    )
    expect(execFileSync).toHaveBeenCalledWith(
      'xdg-open',
      ['https://example.test/linux'],
      { stdio: 'ignore', timeout: 3000 },
    )
  })
})

describe('CLI login guardrails', () => {
  test('rejects the reserved main label before starting OAuth', () => {
    const result = spawnSync(
      process.execPath,
      ['src/cli.ts', 'login', '--label', 'MaIn'],
      {
        cwd: packageRoot,
        encoding: 'utf8',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '"main" is a reserved account id; choose a different label.',
    )
  })
})
