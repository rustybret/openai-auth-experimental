import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drainNotifications } from '../rpc/notifications'
import { createRpcClient, DEFAULT_RPC_TIMEOUT_MS } from '../rpc/rpc-client'
import { type RpcServerHandle, startRpcServer } from '../rpc/rpc-server'

let dir: string | undefined
let server: RpcServerHandle | undefined
let stop: (() => Promise<void>) | null = null

afterEach(async () => {
  if (server) {
    await server.stop()
    server = undefined
  }
  if (stop) {
    await stop()
    stop = null
  }
  if (dir) {
    await rm(dir, { recursive: true, force: true })
    dir = undefined
  }
})

test('RPC client preserves sessionId through the server apply callback', async () => {
  dir = await mkdtemp(join(tmpdir(), 'oa-rpcclient-'))
  const received: Array<{ sessionId?: string }> = []
  server = await startRpcServer({
    dir,
    drain: drainNotifications,
    apply: async (request) => {
      received.push(request)
      return { text: 'ok', knobs: {} }
    },
  })

  const client = createRpcClient(dir, process.pid)
  await Promise.all([
    client.apply({
      command: 'openai-routing',
      arguments: 'reset',
      sessionId: 'session-a',
    }),
    client.apply({
      command: 'openai-routing',
      arguments: 'reset',
      sessionId: 'session-b',
    }),
  ])

  expect(received.map((request) => request.sessionId).sort()).toEqual([
    'session-a',
    'session-b',
  ])
})

describe('rpc-client', () => {
  test('keeps the default call timeout at two seconds', () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(2_000)
  })

  test('apply honors a per-call timeout override', async () => {
    dir = await mkdtemp(join(tmpdir(), 'oa-rpcclient-'))
    const localServer = await startRpcServer({
      dir,
      timeoutMs: 2_000,
      drain: () => [],
      apply: async () => {
        await Bun.sleep(300)
        return { text: 'completed', knobs: { stage: 'result' } }
      },
    })
    stop = localServer.stop
    const client = createRpcClient(dir, process.pid)
    const request = {
      command: 'openai-reset',
      arguments: 'confirm account id',
    } as const

    expect(await client.apply(request, 100)).toEqual({
      text: 'apply failed',
      knobs: {},
    })
    expect(await client.apply(request, 1_000)).toEqual({
      text: 'completed',
      knobs: { stage: 'result' },
    })
  })
})
