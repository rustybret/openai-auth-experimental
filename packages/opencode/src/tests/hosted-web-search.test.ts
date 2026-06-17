import { describe, expect, test } from 'bun:test'

import {
  injectRecordedHostedWebSearchCalls,
  recordHostedWebSearchEvent,
  rewriteHostedWebSearchReplay,
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

  test('rewrites hosted item_reference from recorded raw web_search_call event', () => {
    recordHostedWebSearchEvent(
      {
        type: 'response.output_item.done',
        item: {
          type: 'web_search_call',
          id: 'ws_recorded',
          status: 'completed',
          action: { type: 'open_page', url: 'https://example.com' },
        },
      },
      'session-a',
    )

    const body: Record<string, unknown> = {
      input: [
        { type: 'item_reference', id: 'ws_recorded' },
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

  test('injects recorded hosted web_search_call before latest assistant answer when OpenCode drops it', () => {
    recordHostedWebSearchEvent(
      {
        type: 'response.output_item.done',
        item: {
          type: 'web_search_call',
          id: 'ws_inject',
          status: 'completed',
          action: { type: 'search', query: 'OpenAI Responses' },
        },
      },
      'session-b',
    )

    const body: Record<string, unknown> = {
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'search' }] },
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'answer' }],
        },
        { role: 'user', content: [{ type: 'input_text', text: 'follow up' }] },
      ],
    }

    expect(injectRecordedHostedWebSearchCalls(body, 'session-b')).toBe(true)
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'search' }] },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: 'OpenAI Responses' },
      },
      { role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'follow up' }] },
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
})
