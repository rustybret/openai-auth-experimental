import { describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PluginInput } from '@opencode-ai/plugin'

import { resetSettingsForTest } from '../config'
import { resetDumpStateForTest } from '../dump'
import { CodexAuthPlugin } from '../index'

describe('request dumps', () => {
  test('dumps final HTTP body and redacted request metadata when enabled', async () => {
    await withDumpEnv(async (dumpDir) => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = Object.assign(
        async () => new Response('ok', { status: 200 }),
        { preconnect: () => {} },
      )
      try {
        const hooks = await CodexAuthPlugin(pluginInput(), {
          experimentalWebSockets: false,
        })
        const fetch = await pluginFetch(hooks)

        await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-session-affinity': 'ses_dump_http',
          },
          body: JSON.stringify(toolRequestBody()),
        })

        const files = await readdir(dumpDir)
        const bodyFile = requireFile(files, '.body.json')
        const metaFile = requireFile(files, '.meta.json')
        const requestFile = requireFile(files, '.request.json')
        const body = await readFile(join(dumpDir, bodyFile), 'utf8')
        const meta = JSON.parse(await readFile(join(dumpDir, metaFile), 'utf8'))
        const request = JSON.parse(
          await readFile(join(dumpDir, requestFile), 'utf8'),
        )

        expect(body).toContain('"type":"web_search"')
        expect(meta).toMatchObject({
          transport: 'http',
          phase: 'http',
          status: 200,
          body: {
            parseable: true,
            inputCount: 1,
            hasWebSearch: true,
          },
        })
        expect(request.headers.authorization).toBe('[redacted]')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  test('dumps final WebSocket prewarm and main bodies when enabled', async () => {
    await withDumpEnv(async (dumpDir) => {
      const originalFetch = globalThis.fetch
      const originalWebSocket = globalThis.WebSocket
      globalThis.fetch = Object.assign(
        async () => {
          throw new Error('unexpected HTTP fetch')
        },
        { preconnect: () => {} },
      )
      globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
      try {
        const hooks = await CodexAuthPlugin(pluginInput(), {
          experimentalWebSockets: true,
        })
        const fetch = await pluginFetch(hooks)
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-session-affinity': 'ses_dump_ws',
          },
          body: JSON.stringify(toolRequestBody()),
        })
        await response.text()

        const files = await readdir(dumpDir)
        const metas = await Promise.all(
          files
            .filter((file) => file.endsWith('.meta.json'))
            .map(async (file) =>
              JSON.parse(await readFile(join(dumpDir, file), 'utf8')),
            ),
        )
        const prewarm = metas.find((meta) => meta.phase === 'prewarm')
        const main = metas.find((meta) => meta.phase === 'main')

        expect(prewarm).toMatchObject({
          transport: 'websocket',
          body: { generate: false, inputCount: 0, hasWebSearch: true },
        })
        expect(main).toMatchObject({
          transport: 'websocket',
          body: {
            previousResponseID: 'resp_prewarm',
            inputCount: 1,
            hasWebSearch: true,
          },
        })
      } finally {
        globalThis.fetch = originalFetch
        globalThis.WebSocket = originalWebSocket
      }
    })
  })
})

function pluginInput() {
  return {
    client: {
      auth: {
        set: async () => {},
      },
    },
  } as unknown as PluginInput
}

async function pluginFetch(hooks: Awaited<ReturnType<typeof CodexAuthPlugin>>) {
  const auth = hooks.auth
  if (!auth?.loader) throw new Error('missing auth loader')
  const loaded = await auth.loader(
    async () => ({
      type: 'oauth',
      access: 'access-token',
      refresh: 'refresh-token',
      expires: Date.now() + 60_000,
    }),
    {} as Parameters<NonNullable<typeof auth.loader>>[1],
  )
  if (!loaded.fetch) throw new Error('missing fetch')
  return loaded.fetch
}

function toolRequestBody() {
  return {
    model: 'gpt-5.5-fast',
    stream: true,
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    tools: [
      {
        type: 'function',
        name: 'bash',
        description: 'run shell commands',
        parameters: { type: 'object', properties: {} },
      },
    ],
  }
}

async function withDumpEnv(run: (dumpDir: string) => Promise<void>) {
  const dumpDir = await mkdtemp(join(tmpdir(), 'openai-auth-dump-test-'))
  const originalDump = process.env.CORTEXKIT_OPENAI_AUTH_DUMP
  const originalDumpDir = process.env.OPENCODE_OPENAI_AUTH_DUMP_DIR
  const originalConfigFile = process.env.OPENCODE_OPENAI_AUTH_FILE
  process.env.CORTEXKIT_OPENAI_AUTH_DUMP = '1'
  process.env.OPENCODE_OPENAI_AUTH_DUMP_DIR = dumpDir
  process.env.OPENCODE_OPENAI_AUTH_FILE = join(dumpDir, 'missing.json')
  resetSettingsForTest()
  resetDumpStateForTest()
  try {
    await run(dumpDir)
  } finally {
    restoreEnv('CORTEXKIT_OPENAI_AUTH_DUMP', originalDump)
    restoreEnv('OPENCODE_OPENAI_AUTH_DUMP_DIR', originalDumpDir)
    restoreEnv('OPENCODE_OPENAI_AUTH_FILE', originalConfigFile)
    resetSettingsForTest()
    resetDumpStateForTest()
    await rm(dumpDir, { recursive: true, force: true })
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

function requireFile(files: string[], suffix: string) {
  const file = files.find((entry) => entry.endsWith(suffix))
  if (!file) throw new Error(`missing ${suffix}`)
  return file
}

class FakeWebSocket {
  static OPEN = 1
  static CLOSED = 3

  readyState = 0
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(readonly url: string) {
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit('open', {})
    })
  }

  addEventListener(
    type: string,
    fn: (event: unknown) => void,
    options?: { once?: boolean },
  ) {
    const listener = options?.once
      ? (event: unknown) => {
          this.removeEventListener(type, listener)
          fn(event)
        }
      : fn
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.get(type)?.delete(fn)
  }

  send(data: string) {
    const parsed = JSON.parse(data) as Record<string, unknown>
    this.emit('message', {
      data: JSON.stringify({
        type: 'response.completed',
        response: {
          id: parsed.generate === false ? 'resp_prewarm' : 'resp_main',
        },
      }),
    })
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', { code: 1000, reason: '' })
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}
