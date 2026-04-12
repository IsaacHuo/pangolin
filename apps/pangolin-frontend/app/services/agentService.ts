import type { AgentChatRequest, AgentChatResponse } from '~/types/agent'
import { detectProviderClient, getKey } from '~/composables/useApiKeys'

const baseURL = import.meta.env.NUXT_PUBLIC_AGENT_API_BASE ?? 'http://localhost:9090'
const MCP_TOOL_CACHE_TTL_MS = 30_000

interface ExternalGatewayTool {
  name: string
  description: string
}

interface MCPToolsResponse {
  gateway_tools?: ExternalGatewayTool[]
}

let cachedExternalTools: ExternalGatewayTool[] = []
let cachedExternalToolsAt = 0

interface StreamAnalysis {
  verdict?: string
  l2_confidence?: number
  l2_reasoning?: string
  blocked_reason?: string
  l1_patterns?: string[]
}

interface ParsedStream {
  text: string
  tools: AgentChatResponse['tools_called']
  analysis: StreamAnalysis | null
  streamError: string | null
}

function normalizeDecision(raw: string | undefined): AgentChatResponse['firewall_decision']['decision'] {
  const upper = (raw ?? 'UNKNOWN').toUpperCase()
  if (upper === 'ALLOW' || upper === 'MODIFY' || upper === 'BLOCK') {
    return upper
  }
  if (upper === 'ESCALATE') {
    return 'MODIFY'
  }
  return 'UNKNOWN'
}

async function parseNdjsonStream(response: Response): Promise<ParsedStream> {
  const tools: AgentChatResponse['tools_called'] = []
  let text = ''
  let analysis: StreamAnalysis | null = null
  let streamError: string | null = null

  const reader = response.body?.getReader()
  if (!reader) {
    return { text, tools, analysis, streamError: 'Empty response stream' }
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {break}

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {continue}

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>
        const type = String(event.type ?? '')

        if (type === 'analysis' && event.analysis && typeof event.analysis === 'object') {
          analysis = event.analysis as StreamAnalysis
        } else if (type === 'content' && typeof event.content === 'string') {
          text += event.content
        } else if (type === 'tool_call' && event.tool_call && typeof event.tool_call === 'object') {
          const toolCall = event.tool_call as Record<string, unknown>
          tools.push({
            tool: String(toolCall.tool ?? 'unknown'),
            args: (toolCall.args as Record<string, unknown>) ?? {},
            result_preview: String(toolCall.result_preview ?? ''),
            allowed: Boolean(toolCall.allowed ?? true),
            blocked_reason: toolCall.blocked_reason ? String(toolCall.blocked_reason) : null,
          })
        } else if (type === 'error') {
          streamError = typeof event.error === 'string' ? event.error : 'Agent stream failed'
        }
      } catch {
        // Ignore malformed chunk and continue reading stream.
      }
    }
  }

  return { text, tools, analysis, streamError }
}

async function resolveExternalTools(): Promise<ExternalGatewayTool[]> {
  const now = Date.now()
  if (now - cachedExternalToolsAt < MCP_TOOL_CACHE_TTL_MS) {
    return cachedExternalTools
  }

  try {
    const resp = await fetch(`${baseURL}/api/mcp/tools`)
    if (!resp.ok) {
      cachedExternalTools = []
      cachedExternalToolsAt = now
      return cachedExternalTools
    }
    const payload = await resp.json() as MCPToolsResponse
    const externalTools = Array.isArray(payload.gateway_tools) ? payload.gateway_tools : []
    cachedExternalTools = externalTools
    cachedExternalToolsAt = now
    return externalTools
  }
  catch {
    cachedExternalTools = []
    cachedExternalToolsAt = now
    return cachedExternalTools
  }
}

export const agentService = {
  async chat(request: AgentChatRequest): Promise<AgentChatResponse> {
    const startedAt = Date.now()
    const headers: Record<string, string> = {}

    // Inject API key for external providers
    if (request.model) {
      const provider = detectProviderClient(request.model)
      if (provider !== 'mock') {
        const apiKey = getKey(provider)
        if (apiKey) {
          headers['x-api-key'] = apiKey
        }
      }
    }

    headers['x-correlation-id'] = crypto.randomUUID()
    headers['Content-Type'] = 'application/json'

    const externalTools = await resolveExternalTools()

    const response = await fetch(`${baseURL}/api/chat/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [{ role: 'user', content: request.message }],
        model: request.model || 'openrouter/auto',
        enable_tools: true,
        external_tools: externalTools,
      }),
    })

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      throw new Error(err || `Agent API failed (${response.status})`)
    }

    const parsed = await parseNdjsonStream(response)
    if (parsed.streamError && !parsed.text) {
      throw new Error(parsed.streamError)
    }

    const decision = normalizeDecision(parsed.analysis?.verdict)
    let rawConfidence = Number(parsed.analysis?.l2_confidence ?? 0)
    const riskScore = decision === 'ALLOW' ? Math.max(0, 1.0 - rawConfidence) : rawConfidence
    const blockedReason = parsed.analysis?.blocked_reason ?? null
    const intent = parsed.analysis?.l2_reasoning || 'unknown'

    return {
      response: parsed.text || (parsed.streamError ? `⚠️ ${parsed.streamError}` : '(no response)'),
      session_id: request.session_id,
      tools_called: parsed.tools,
      agent_trace: {
        intent,
        user_role: request.user_role,
        allowed_tools: parsed.tools.filter((tool) => tool.allowed).map((tool) => tool.tool),
        iterations: Math.max(1, parsed.tools.length + 1),
        latency_ms: Date.now() - startedAt,
      },
      firewall_decision: {
        decision,
        risk_score: riskScore,
        intent,
        risk_flags: {
          l1_patterns: parsed.analysis?.l1_patterns ?? [],
        },
        blocked_reason: blockedReason,
      },
    }
  },
}
