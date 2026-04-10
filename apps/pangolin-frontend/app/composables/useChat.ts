import { ref, reactive } from 'vue'
import {
  streamPlaygroundChat,
  extractBlockDecision,
} from '~/services/chatService'
import type {
  ChatMessage,
  PipelineDecision,
  ApiError,
  ChatAnalysis,
} from '~/types/api'

function normalizeDecision(verdict: string | undefined): PipelineDecision['decision'] {
  if (verdict === 'ALLOW') {
    return 'ALLOW'
  }
  if (verdict === 'MODIFY') {
    return 'MODIFY'
  }
  return 'BLOCK'
}

function analysisToDecision(analysis: ChatAnalysis): PipelineDecision {
  const riskFlags: Record<string, unknown> = {}
  for (const pattern of analysis.l1_patterns ?? []) {
    riskFlags[pattern] = 1
  }
  if (analysis.l2_is_injection) {
    riskFlags.l2_injection = analysis.l2_confidence
  }

  return {
    decision: normalizeDecision(analysis.verdict),
    intent: analysis.threat_level ?? 'unknown',
    riskScore: Math.max(0, Math.min(1, analysis.l2_confidence ?? 0)),
    riskFlags,
    blockedReason: analysis.blocked_reason || undefined,
  }
}

export const useChat = () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const lastDecision = ref<PipelineDecision | null>(null)
  const error = ref<string | null>(null)

  let abortController: AbortController | null = null

  const config = reactive({
    policy: 'balanced',
    model: '',          // auto-selected by playground once models load
    temperature: 0.7,
    maxTokens: null as number | null,
    systemPrompt: '',
  })

  async function send(text: string) {
    // Push user message
    messages.value.push({ role: 'user', content: text })

    isStreaming.value = true
    error.value = null
    lastDecision.value = null

    abortController = new AbortController()

    const apiMessages = messages.value
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({ role: msg.role, content: msg.content }))

    if (config.systemPrompt?.trim()) {
      apiMessages.unshift({ role: 'system', content: config.systemPrompt.trim() })
    }

    let assistantIdx: number | null = null
    const ensureAssistantMessage = (): ChatMessage => {
      const existingMessage = assistantIdx != null ? messages.value[assistantIdx] : undefined
      if (existingMessage) {
        return existingMessage
      }
      const msg: ChatMessage = { role: 'assistant', content: '' }
      messages.value.push(msg)
      assistantIdx = messages.value.length - 1
      return msg
    }

    try {
      await streamPlaygroundChat(
        {
          body: {
            model: config.model,
            messages: apiMessages,
            temperature: config.temperature,
            max_tokens: config.maxTokens ?? undefined,
            enable_tools: true,
          },
          headers: {
            'x-policy': config.policy,
          },
          signal: abortController.signal,
        },
        {
          onAnalysis: (analysis: ChatAnalysis, blocked: boolean) => {
            const decision = analysisToDecision(analysis)
            lastDecision.value = decision

            if (blocked) {
              const assistantMessage = ensureAssistantMessage()
              assistantMessage.content = `⛔ Blocked: ${analysis.blocked_reason || 'Security policy violation'}`
              assistantMessage.decision = decision
              assistantMessage.analysis = analysis
            }
          },
          onToolCall: (toolCall) => {
            messages.value.push({
              role: 'tool',
              content: '',
              tool_events: [toolCall],
            })
          },
          onContent: (content: string) => {
            const assistantMessage = ensureAssistantMessage()
            assistantMessage.content = content
            if (lastDecision.value) {
              assistantMessage.decision = lastDecision.value
            }
          },
          onDone: () => {
            isStreaming.value = false
          },
          onError: (err: Error) => {
            error.value = err.message
            const assistantMessage = ensureAssistantMessage()
            if (!assistantMessage.content) {
              assistantMessage.content = `⚠️ ${err.message}`
            }
          },
        },
      )

      if (assistantIdx != null) {
        const assistantMessage = messages.value[assistantIdx]
        if (assistantMessage) {
          if (lastDecision.value && !assistantMessage.decision) {
            assistantMessage.decision = lastDecision.value
          }
          if (!assistantMessage.content && !assistantMessage.analysis) {
            messages.value.splice(assistantIdx, 1)
          }
        }
      }
    } catch (err: unknown) {
      isStreaming.value = false

      // Handle abort
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      // Handle BLOCK response (403) — ApiError body
      const apiErr = err as ApiError
      if (apiErr?.error?.message) {
        lastDecision.value = extractBlockDecision(apiErr)
        messages.value.push({
          role: 'assistant',
          content: `⛔ Blocked: ${apiErr.error.message}`,
          decision: lastDecision.value ?? undefined,
        })
        error.value = apiErr.error.message
      } else {
        // Unknown error — show in message bubble instead of silently removing
        const errMsg = err instanceof Error ? err.message : String(err)
        messages.value.push({
          role: 'assistant',
          content: `⚠️ ${errMsg || 'An unexpected error occurred'}`,
        })
        error.value = errMsg || 'An unexpected error occurred'
      }
    } finally {
      abortController = null
      isStreaming.value = false
    }
  }

  function clear() {
    messages.value = []
    lastDecision.value = null
    error.value = null
  }

  function abort() {
    if (abortController) {
      abortController.abort()
      abortController = null
      isStreaming.value = false
    }
  }

  return {
    messages,
    isStreaming,
    lastDecision,
    error,
    config,
    send,
    clear,
    abort,
  }
}
