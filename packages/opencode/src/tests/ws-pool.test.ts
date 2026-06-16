import { describe, expect, test } from 'bun:test'
import { applyTurnId, createWebSocketFetch } from '../ws-pool'

function entry() {
  return {
    lastUsedAt: 0,
    busy: false,
    fallback: false,
    streamFailures: 0,
  } as Parameters<typeof applyTurnId>[0]
}

function body(input: unknown[]) {
  return {
    type: 'response.create',
    input,
    client_metadata: {
      'x-codex-turn-metadata': JSON.stringify({
        session_id: 'sid',
        thread_id: 'sid',
        thread_source: 'user',
        turn_id: 'PER_REQUEST_SHOULD_BE_OVERRIDDEN',
        sandbox: 'seccomp',
        turn_started_at_unix_ms: 1,
        request_kind: 'turn',
        window_id: 'sid:0',
      }),
    },
  }
}

function meta(result: Record<string, unknown>) {
  const cm = result.client_metadata as Record<string, string>
  return JSON.parse(cm['x-codex-turn-metadata']!) as Record<string, unknown>
}

function turnID(result: Record<string, unknown>) {
  return meta(result).turn_id as string
}

describe('applyTurnId', () => {
  test('keeps one turn_id across a tool-loop and ignores the per-request base id', () => {
    const e = entry()
    const userTurn = turnID(
      applyTurnId(e, body([{ type: 'message', role: 'user', content: [] }])),
    )
    const cont1 = turnID(
      applyTurnId(
        e,
        body([{ type: 'function_call_output', call_id: 'a', output: 'x' }]),
      ),
    )
    const cont2 = turnID(
      applyTurnId(
        e,
        body([{ type: 'function_call_output', call_id: 'b', output: 'y' }]),
      ),
    )

    expect(userTurn).not.toBe('PER_REQUEST_SHOULD_BE_OVERRIDDEN')
    expect(cont1).toBe(userTurn)
    expect(cont2).toBe(userTurn)
  })

  test('rotates turn_id when a new (non-output) message starts a turn', () => {
    const e = entry()
    const first = turnID(
      applyTurnId(e, body([{ type: 'message', role: 'user', content: [] }])),
    )
    turnID(
      applyTurnId(
        e,
        body([{ type: 'function_call_output', call_id: 'a', output: 'x' }]),
      ),
    )
    const second = turnID(
      applyTurnId(e, body([{ type: 'message', role: 'user', content: [] }])),
    )

    expect(second).not.toBe(first)
  })

  test('turn_started_at is stable across the tool-loop', () => {
    const e = entry()
    const startedAt = (result: Record<string, unknown>) =>
      meta(result).turn_started_at_unix_ms
    const t0 = startedAt(
      applyTurnId(e, body([{ type: 'message', role: 'user', content: [] }])),
    )
    const t1 = startedAt(
      applyTurnId(
        e,
        body([{ type: 'function_call_output', call_id: 'a', output: 'x' }]),
      ),
    )
    expect(t1).toBe(t0)
  })
})

describe('createWebSocketFetch', () => {
  test('preserves reasoning summaries on websocket requests and forwards reasoning deltas', async () => {
    const sent: Array<Record<string, unknown>> = []
    await withFakeWebSocket(
      ({ message }) => ({
        send(data) {
          sent.push(JSON.parse(data) as Record<string, unknown>)
          message(
            JSON.stringify({
              type: 'response.reasoning_summary_text.delta',
              item_id: 'rs_1',
              delta: 'thinking',
            }),
          )
          message(
            JSON.stringify({
              type: 'response.completed',
              response: { id: 'resp_1' },
            }),
          )
        },
      }),
      async () => {
        const websocketFetch = createWebSocketFetch({
          url: 'https://example.test/backend-api/codex/responses',
        })

        const response = await websocketFetch(
          'https://example.test/backend-api/codex/responses',
          streamRequest({
            reasoning: { effort: 'medium', summary: 'auto' },
            input: [],
          }),
        )

        expect(sent[0]?.reasoning).toEqual({
          effort: 'medium',
          summary: 'auto',
        })
        expect(await response.text()).toContain(
          'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","delta":"thinking"}',
        )
        websocketFetch.close()
      },
    )
  })

  test('falls back to HTTP immediately when the websocket lane hits the connection limit', async () => {
    let httpRequests = 0
    let sockets = 0
    await withFakeWebSocket(
      ({ message }) => ({
        send() {
          sockets++
          message(
            JSON.stringify({
              type: 'error',
              status: 400,
              error: {
                type: 'invalid_request_error',
                code: 'websocket_connection_limit_reached',
                message: 'Responses websocket connection limit reached',
              },
            }),
          )
        },
      }),
      async () => {
        const httpFetch: typeof globalThis.fetch = Object.assign(
          async () => {
            httpRequests++
            return new Response('http')
          },
          { preconnect: () => {} },
        )
        const websocketFetch = createWebSocketFetch({
          url: 'https://example.test/backend-api/codex/responses',
          httpFetch,
        })

        const first = await websocketFetch(
          'https://example.test/backend-api/codex/responses',
          streamRequest({ input: [] }),
        )
        const second = await websocketFetch(
          'https://example.test/backend-api/codex/responses',
          streamRequest({ input: [] }),
        )

        expect(await first.text()).toBe('http')
        expect(await second.text()).toBe('http')
        expect(httpRequests).toBe(2)
        expect(sockets).toBe(1)
        websocketFetch.close()
      },
    )
  })

  test('keeps the full first request after prewarm so historical tool outputs keep their tool calls', async () => {
    const sent: Array<Record<string, unknown>> = []
    await withFakeWebSocket(
      ({ message }) => ({
        send(data) {
          const parsed = JSON.parse(data) as Record<string, unknown>
          sent.push(parsed)
          message(
            JSON.stringify({
              type: 'response.completed',
              response: {
                id: parsed.generate === false ? 'resp_prewarm' : 'resp_main',
              },
            }),
          )
        },
      }),
      async () => {
        const websocketFetch = createWebSocketFetch({
          url: 'https://example.test/backend-api/codex/responses',
        })

        await websocketFetch(
          'https://example.test/backend-api/codex/responses',
          streamRequest({
            input: [
              { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
              {
                type: 'function_call',
                call_id: 'call_1',
                name: 'read',
                arguments: '{"filePath":"README.md"}',
              },
              {
                type: 'function_call_output',
                call_id: 'call_1',
                output: 'contents',
              },
            ],
          }),
        )

        expect(sent).toHaveLength(2)
        expect(sent[0]).toMatchObject({
          generate: false,
          input: [],
        })
        expect(sent[1]).toMatchObject({
          previous_response_id: 'resp_prewarm',
          input: [
            { type: 'message', role: 'user' },
            { type: 'function_call', call_id: 'call_1' },
            { type: 'function_call_output', call_id: 'call_1' },
          ],
        })
        websocketFetch.close()
      },
    )
  })
})

function streamRequest(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'session-id': 'session-1' },
    body: JSON.stringify({ stream: true, ...body }),
  }
}

type FakeWebSocketContext = {
  message(data: string): void
  close(code?: number, reason?: string): void
}

type FakeWebSocketBehavior = {
  send?: (data: string) => void
  close?: () => void
}

async function withFakeWebSocket(
  behavior: (context: FakeWebSocketContext) => FakeWebSocketBehavior,
  run: () => Promise<void>,
) {
  const original = globalThis.WebSocket

  class FakeWebSocket {
    static OPEN = 1
    static CLOSED = 3

    url: string
    readyState = 0
    private readonly listeners = new Map<
      string,
      Set<{ fn: (event: unknown) => void; once: boolean }>
    >()
    private readonly behavior: FakeWebSocketBehavior

    constructor(url: string) {
      this.url = url
      this.behavior = behavior({
        message: (data) => this.emit('message', { data }),
        close: (code = 1000, reason = '') => {
          this.readyState = FakeWebSocket.CLOSED
          this.emit('close', { code, reason })
        },
      })
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
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add({ fn, once: options?.once === true })
      this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, fn: (event: unknown) => void) {
      const listeners = this.listeners.get(type)
      if (!listeners) return
      for (const listener of listeners) {
        if (listener.fn === fn) listeners.delete(listener)
      }
    }

    send(data: string) {
      this.behavior.send?.(data)
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED
      this.behavior.close?.()
    }

    private emit(type: string, event: unknown) {
      const listeners = this.listeners.get(type)
      if (!listeners) return
      for (const listener of [...listeners]) {
        listener.fn(event)
        if (listener.once) listeners.delete(listener)
      }
    }
  }

  ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    FakeWebSocket as unknown as typeof WebSocket
  try {
    await run()
  } finally {
    ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      original
  }
}
