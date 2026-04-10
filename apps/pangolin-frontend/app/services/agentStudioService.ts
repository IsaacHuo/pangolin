import {
  detectProviderClient,
  getKey,
} from '~/composables/useApiKeys'
import type {
  AgentStudioProfile,
  AgentStudioRunDetail,
  AgentStudioRunRequest,
  AgentStudioRunSummary,
  AgentStudioStreamEvent,
} from '~/types/agentStudio'

const baseURL = import.meta.env.NUXT_PUBLIC_AGENT_API_BASE ?? 'http://localhost:9090'

export interface AgentStudioStreamCallbacks {
  onEvent?: (event: AgentStudioStreamEvent) => void
  onError?: (error: Error) => void
  onDone?: (status: 'completed' | 'failed' | 'unknown') => void
}

export const agentStudioService = {
  baseURL,

  async listProfiles(): Promise<AgentStudioProfile[]> {
    const resp = await fetch(`${baseURL}/api/agent-studio/profiles`)
    if (!resp.ok) {
      throw new Error(`Failed to load profiles (${resp.status})`)
    }
    const payload = await resp.json() as { profiles?: AgentStudioProfile[] }
    return payload.profiles ?? []
  },

  async listRuns(limit = 20, offset = 0): Promise<{ items: AgentStudioRunSummary[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    const resp = await fetch(`${baseURL}/api/agent-studio/runs?${params.toString()}`)
    if (!resp.ok) {
      throw new Error(`Failed to load runs (${resp.status})`)
    }
    const payload = await resp.json() as { items?: AgentStudioRunSummary[]; total?: number }
    return {
      items: payload.items ?? [],
      total: payload.total ?? 0,
    }
  },

  async getRun(runId: string): Promise<AgentStudioRunDetail> {
    const resp = await fetch(`${baseURL}/api/agent-studio/runs/${encodeURIComponent(runId)}`)
    if (!resp.ok) {
      throw new Error(`Failed to load run ${runId} (${resp.status})`)
    }
    return await resp.json() as AgentStudioRunDetail
  },

  async streamRun(
    request: AgentStudioRunRequest,
    callbacks: AgentStudioStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const model = request.model ?? ''
    if (model) {
      const provider = detectProviderClient(model)
      if (provider !== 'mock') {
        const key = getKey(provider)
        if (key) {
          headers['x-api-key'] = key
        }
      }
    }

    const resp = await fetch(`${baseURL}/api/agent-studio/runs/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    })

    if (!resp.ok) {
      let message = `Failed to start run (${resp.status})`
      try {
        const body = await resp.json() as { detail?: string }
        if (typeof body.detail === 'string' && body.detail.trim()) {
          message = body.detail
        }
      } catch {
        // no-op
      }
      throw new Error(message)
    }

    const reader = resp.body?.getReader()
    if (!reader) {
      callbacks.onDone?.('unknown')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalStatus: 'completed' | 'failed' | 'unknown' = 'unknown'

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          continue
        }

        try {
          const event = JSON.parse(line) as AgentStudioStreamEvent
          callbacks.onEvent?.(event)
          if (event.type === 'done') {
            finalStatus = event.status
          }
          if (event.type === 'error') {
            callbacks.onError?.(new Error(event.error || 'Agent Studio stream error'))
          }
        } catch {
          // Skip malformed line and continue streaming.
        }
      }
    }

    callbacks.onDone?.(finalStatus)
  },
}
