import { describe, expect, test } from 'bun:test'

import {
  HostedWebSearchTool,
  normalizeWebSearchAction,
  rewriteHostedWebSearchReplay,
  translateHostedWebSearchEvent,
  translateHostedWebSearchResponse,
} from '../hosted-web-search'

describe('hosted web search replay', () => {
  test('rewrites local web_search function replay to Codex web_search_call item', () => {
    const body: Record<string, unknown> = {
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'search' }] },
        {
          type: 'function_call',
          call_id: 'ws_123',
          name: 'web_search',
          arguments: '{}',
        },
        {
          type: 'function_call_output',
          call_id: 'ws_123',
          output:
            '{"action":{"type":"search","query":"OpenAI docs"},"results":[{"type":"text_result","title":"Docs"}]}',
        },
        { role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'search' }] },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: 'OpenAI docs' },
      },
      { role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
    ])
  })

  test('translates hosted web_search_call done event into a local function_call', () => {
    const translated = translateHostedWebSearchEvent({
      type: 'response.output_item.done',
      item: {
        type: 'web_search_call',
        id: 'ws_recorded',
        status: 'completed',
        action: { type: 'open_page', url: 'https://example.com' },
      },
    })

    expect(translated).toEqual({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        id: 'ws_recorded',
        call_id: 'ws_recorded',
        name: 'web_search',
        arguments: '{"type":"open_page","url":"https://example.com"}',
      },
    })
  })

  test('drops hosted web_search_call lifecycle events', () => {
    expect(
      translateHostedWebSearchEvent({
        type: 'response.output_item.added',
        item: { type: 'web_search_call', id: 'ws_lifecycle' },
      }),
    ).toBeUndefined()
    expect(
      translateHostedWebSearchEvent({
        type: 'response.web_search_call.searching',
        item_id: 'ws_lifecycle',
      }),
    ).toBeUndefined()
  })

  test('translates hosted web_search_call SSE responses on HTTP fallback', async () => {
    const response = translateHostedWebSearchResponse(
      new Response(
        [
          'data: {"type":"response.output_item.added","item":{"type":"web_search_call","id":"ws_http"}}\n\n',
          'data: {"type":"response.output_item.done","item":{"type":"web_search_call","id":"ws_http","status":"completed","action":{"type":"search","query":"OpenAI docs"}}}\n\n',
        ].join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )

    await expect(response.text()).resolves.toBe(
      'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"ws_http","call_id":"ws_http","name":"web_search","arguments":"{\\"type\\":\\"search\\",\\"query\\":\\"OpenAI docs\\"}"}}\n\n',
    )
  })

  test('rewrites hosted item_reference from translated raw web_search_call event', () => {
    translateHostedWebSearchEvent({
      type: 'response.output_item.done',
      item: {
        type: 'web_search_call',
        id: 'ws_recorded_ref',
        status: 'completed',
        action: { type: 'open_page', url: 'https://example.com' },
      },
    })

    const body: Record<string, unknown> = {
      input: [
        { type: 'item_reference', id: 'ws_recorded_ref' },
        { role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'open_page', url: 'https://example.com' },
      },
      { role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
    ])
  })

  test('does not rewrite regular function tool calls', () => {
    const body: Record<string, unknown> = {
      input: [
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'web_search',
          arguments: '{}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '{}',
        },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(false)
    expect((body.input as unknown[]).length).toBe(2)
  })

  test('reconstructs web_search_call from replayed function_call/output when in-memory map is empty (restart)', () => {
    const body: Record<string, unknown> = {
      input: [
        {
          type: 'function_call',
          call_id: 'ws_restart_123',
          name: 'web_search',
          arguments: '{"type":"search","query":"restart test"}',
        },
        {
          type: 'function_call_output',
          call_id: 'ws_restart_123',
          output:
            '{"action":{"type":"search","query":"restart test"},"results":[]}',
        },
        { type: 'item_reference', id: 'ws_restart_123' },
      ],
    }

    // Ensure the in-memory map does not contain the replay ID for this search call to simulate a restart
    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: 'restart test' },
      },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: 'restart test' },
      },
    ])
  })

  test('normalizes web_search_call action to include action.type when arguments omit it', () => {
    const body: Record<string, unknown> = {
      input: [
        {
          type: 'function_call',
          call_id: 'ws_astra_1',
          name: 'web_search',
          arguments: '{"queries":["OpenAI news","GPT-6 Astra"]}',
        },
        {
          type: 'function_call_output',
          call_id: 'ws_astra_1',
          output: '{"action":{"queries":["OpenAI news","GPT-6 Astra"]}}',
        },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      {
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          queries: ['OpenAI news', 'GPT-6 Astra'],
          query: 'OpenAI news',
        },
      },
    ])
  })

  test('normalizes web_search_call action when only query is provided without type', () => {
    const body: Record<string, unknown> = {
      input: [
        {
          type: 'function_call',
          call_id: 'ws_astra_2',
          name: 'web_search',
          arguments: '{"query":"GPT-6 release"}',
        },
        {
          type: 'function_call_output',
          call_id: 'ws_astra_2',
          output: '{"action":{"query":"GPT-6 release"}}',
        },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      {
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          query: 'GPT-6 release',
        },
      },
    ])
  })

  test('normalizes web_search_call action when arguments and output are empty', () => {
    const body: Record<string, unknown> = {
      input: [
        {
          type: 'function_call',
          call_id: 'ws_astra_3',
          name: 'web_search',
          arguments: '{}',
        },
        {
          type: 'function_call_output',
          call_id: 'ws_astra_3',
          output: '{}',
        },
      ],
    }

    expect(rewriteHostedWebSearchReplay(body)).toBe(true)
    expect(body.input).toEqual([
      {
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
        },
      },
    ])
  })

  test('normalizes url-only action to open_page type', () => {
    expect(
      normalizeWebSearchAction({ url: 'https://help.openai.com' }),
    ).toEqual({
      type: 'open_page',
      url: 'https://help.openai.com',
    })
  })

  test('HostedWebSearchTool.execute normalizes action with action.type', async () => {
    const execute = HostedWebSearchTool.execute as (
      args: Record<string, unknown>,
    ) => Promise<{
      output: string
      metadata: { action: Record<string, unknown> }
    }>

    const result = await execute({ queries: ['weather in SF'] })
    expect(result.metadata.action).toEqual({
      type: 'search',
      queries: ['weather in SF'],
      query: 'weather in SF',
    })
    expect(JSON.parse(result.output)).toEqual({
      action: {
        type: 'search',
        queries: ['weather in SF'],
        query: 'weather in SF',
      },
    })
  })
})
