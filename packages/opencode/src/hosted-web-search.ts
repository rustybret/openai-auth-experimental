import { type ToolDefinition, tool } from '@opencode-ai/plugin'

import { isRecord } from './util/record'

const HOSTED_WEB_SEARCH_ID_PREFIX = 'ws_'
const hostedWebSearchItems = new Map<string, Record<string, unknown>>()
const hostedWebSearchItemsBySession = new Map<
  string,
  Array<{ id: string; item: Record<string, unknown> }>
>()

export const HostedWebSearchTool: ToolDefinition = tool({
  description:
    'Provider-executed OpenAI web search. This tool is handled server-side by OpenAI; the local plugin only records the hosted item for replay.',
  args: {
    type: tool.schema.string().optional(),
    query: tool.schema.string().optional(),
    queries: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args) {
    return {
      title: 'OpenAI Web Search',
      output: JSON.stringify({ action: args }),
      metadata: {
        providerExecuted: true,
        action: args,
      },
    }
  },
})

export function rewriteHostedWebSearchReplay(body: Record<string, unknown>) {
  if (!Array.isArray(body.input)) return false
  let changed = false
  const hostedCalls = new Map<string, Record<string, unknown>>()
  const rewritten: unknown[] = []

  for (const item of body.input) {
    if (isHostedWebSearchFunctionCall(item)) {
      hostedCalls.set(item.call_id, item)
      changed = true
      continue
    }

    if (isHostedWebSearchFunctionOutput(item, hostedCalls)) {
      rewritten.push(
        toCodexWebSearchCall(
          item.call_id,
          item.output,
          hostedCalls.get(item.call_id),
        ),
      )
      changed = true
      continue
    }

    if (isHostedWebSearchItemReference(item)) {
      const hostedItem = hostedWebSearchItems.get(item.id)
      if (hostedItem) rewritten.push(toCodexWebSearchCall(item.id, hostedItem))
      else rewritten.push(item)
      changed = true
      continue
    }

    rewritten.push(item)
  }

  if (changed) body.input = rewritten
  return changed
}

export function recordHostedWebSearchEvent(
  event: unknown,
  sessionID: string | undefined,
) {
  if (!isRecord(event)) return
  if (event.type !== 'response.output_item.done') return
  if (!isRecord(event.item)) return
  if (event.item.type !== 'web_search_call') return
  if (typeof event.item.id !== 'string') return
  const item = event.item
  const id = event.item.id
  hostedWebSearchItems.set(id, item)
  if (!sessionID) return
  const items = hostedWebSearchItemsBySession.get(sessionID) ?? []
  if (!items.some((recorded) => recorded.id === id)) {
    items.push({ id, item })
    hostedWebSearchItemsBySession.set(sessionID, items)
  }
}

export function injectRecordedHostedWebSearchCalls(
  body: Record<string, unknown>,
  sessionID: string | undefined,
) {
  if (!sessionID) return false
  if (!Array.isArray(body.input)) return false
  const recorded = hostedWebSearchItemsBySession.get(sessionID)
  if (!recorded?.length) return false

  const existingActionKeys = new Set<string>()
  for (const item of body.input) {
    if (!isRecord(item) || item.type !== 'web_search_call') continue
    if (isRecord(item.action))
      existingActionKeys.add(stableActionKey(item.action))
  }

  const missing = recorded
    .map(({ item }) => toCodexWebSearchCall(String(item.id ?? ''), item))
    .filter((item) => {
      if (!isRecord(item.action)) return true
      return !existingActionKeys.has(stableActionKey(item.action))
    })
  if (!missing.length) return false

  const insertAt = insertionIndex(body.input)
  body.input = [
    ...body.input.slice(0, insertAt),
    ...missing,
    ...body.input.slice(insertAt),
  ]
  return true
}

function isHostedWebSearchFunctionCall(
  item: unknown,
): item is { type: 'function_call'; call_id: string; name: string } {
  return (
    isRecord(item) &&
    item.type === 'function_call' &&
    item.name === 'web_search' &&
    typeof item.call_id === 'string' &&
    item.call_id.startsWith(HOSTED_WEB_SEARCH_ID_PREFIX)
  )
}

function isHostedWebSearchFunctionOutput(
  item: unknown,
  hostedCalls: Map<string, Record<string, unknown>>,
): item is { type: 'function_call_output'; call_id: string; output: string } {
  return (
    isRecord(item) &&
    item.type === 'function_call_output' &&
    typeof item.call_id === 'string' &&
    typeof item.output === 'string' &&
    item.call_id.startsWith(HOSTED_WEB_SEARCH_ID_PREFIX) &&
    hostedCalls.has(item.call_id)
  )
}

function isHostedWebSearchItemReference(
  item: unknown,
): item is { type: 'item_reference'; id: string } {
  return (
    isRecord(item) &&
    item.type === 'item_reference' &&
    typeof item.id === 'string' &&
    item.id.startsWith(HOSTED_WEB_SEARCH_ID_PREFIX)
  )
}

function toCodexWebSearchCall(
  _id: string,
  output: unknown,
  call?: Record<string, unknown>,
) {
  const parsed = parseOutput(output)
  const action = isRecord(parsed?.action)
    ? parsed.action
    : isRecord(call?.arguments)
      ? call.arguments
      : undefined

  return {
    type: 'web_search_call',
    status: 'completed',
    ...(action ? { action } : {}),
  }
}

function parseOutput(output: unknown): Record<string, unknown> | undefined {
  if (isRecord(output)) return output
  if (typeof output !== 'string') return undefined
  try {
    const parsed = JSON.parse(output)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function insertionIndex(input: unknown[]) {
  let lastUserIndex = -1
  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index]
    if (isRecord(item) && item.role === 'user') {
      lastUserIndex = index
      break
    }
  }
  if (lastUserIndex === -1) return input.length
  for (let index = lastUserIndex - 1; index >= 0; index--) {
    const item = input[index]
    if (isRecord(item) && item.role === 'assistant') return index
  }
  return lastUserIndex
}

function stableActionKey(action: Record<string, unknown>) {
  return JSON.stringify(action, Object.keys(action).sort())
}
